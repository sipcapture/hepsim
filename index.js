/*
* expsue HEP (I spit HEP) is a simulator for calls.
* AGPLv3, 2024 - Jachen Duschletta
*/
/*
* Imports
*/

import hepJs, * as HEP from 'hep-js'
import * as fs from 'node:fs'
import * as dgram from 'node:dgram'

/*
* Globals
*/
const debug = false

process.on('SIGINT', function() {
    console.log("Caught interrupt signal")
    simulationModule.killSimulation()
    process.exit()
})

/*
* Utils
*/

const utils = {}

utils.generateRandomString = function (length) {
    let result = ''
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let charactersLength = characters.length
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength))
    }
    return result
}

utils.generateRandomBranch = function () {
    return 'z9hG4bK' + utils.generateRandomString(6)
}

utils.getRandomInt = function (min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

utils.getRandomPhoneNumber = function () {
    return '+1' + utils.getRandomInt(1000000000, 9999999999)
}

/*
* Sender Module
*/

const senderModule = {}

senderModule.receiver = process.env.HEP_ADDRESS || '127.0.0.1'
senderModule.port = process.env.PORT || 9060
senderModule.socket = null

/* TODO: check if socket is open, otherwise buffer */
senderModule.send = function (hepPacket) {
    if (debug) console.log('Sending HEP Packet')
    if (debug) console.log(hepPacket)
    if (!senderModule.socket) {
        senderModule.socket = dgram.createSocket('udp4')
    }

    senderModule.socket.send(hepPacket, senderModule.port, senderModule.receiver, (err) => {
        if (err) {
            console.log('Error sending HEP Packet')
            console.log(err)
        }
    })
}

/*
* HEP Functions
*/

const hepModule = {}

/**
 * @typedef RCINFO
 * @type {{type: string, version: number, payload_type: number, captureId: string, capturePass: string, ip_family: number, protocol: number, proto_type: number, correlation_id: string, srcIp: string, dstIp: string, srcPort: number, dstPort: number}}
 */

/**
 * @typedef VIA
 * @type {{srcIp: string, dstIp: string, srcPort: number, dstPort: number}[]}
 */

/**
 * @typedef MEDIAINFO
 * @type {{mos: number, jitter: number, packetloss: number}}
 */

/**
 * Generate RCInfo Object for HEP
 * @param {number} captureId - Capture ID for 'Simulated Agent'
 * @param {string} capturePass - HEP Password for Capture Server
 * @param {number} payload_type - 1 SIP, 'JSON' for RTCP and RTP reports
 * @param {string} correlation_id - Call ID or 'first leg callid', 'callid' for Reports or Logs
 * @param {number} proto_type - 17 SIP, 34 RTP Hangup, 35 RTP Periodic/Short, 36 RTCP Hangup, 37 RTCP short, 100 Log
 * @param {string} sourceIP 
 * @param {string} destinationIP 
 * @param {number} sourcePort 
 * @param {number} destinationPort 
 * @returns {RCINFO} RCInfo Object
 */
hepModule.generateRCInfo = function (captureId, capturePass, payload_type, correlation_id, proto_type, sourceIP, destinationIP, sourcePort, destinationPort) {
    return {
        type: 'HEP',
        version: 3,
        payload_type: payload_type,
        captureId: captureId,
        capturePass: capturePass,
        ip_family: 2,
        protocol: 17,
        proto_type: proto_type,
        correlation_id: correlation_id,
        srcIp: sourceIP,
        dstIp: destinationIP,
        srcPort: sourcePort,
        dstPort: destinationPort
    }
}

/**
 * Generate a generic SIP Invite
 * @param {string} seq 
 * @param {string} from 
 * @param {string} to 
 * @param {string} callid 
 * @param {RCINFO} rcinfo 
 * @param {VIA} viaInfoArray 
 * @returns {string} Invite payload
 */
hepModule.generateInvite = function (seq, from, to, callid, rcinfo, viaInfoArray) {
    let datenow = new Date().getTime()
    rcinfo.time_sec = Math.floor(datenow / 1000)
    rcinfo.time_usec = (datenow - (rcinfo.time_sec*1000))*1000
    let inviteRaw = []
    inviteRaw.push('INVITE sip:' + to + '@' + rcinfo.dstIp + ':' + rcinfo.dstPort + ' SIP/2.0\r\n')
    /* TODO Only add via when it's necessary */
    inviteRaw.push('Via: SIP/2.0/UDP ' + rcinfo.srcIp + ':' + rcinfo.srcPort + ';branch=' + utils.generateRandomBranch() + '\r\n')
    inviteRaw.push('From: <sip:' + from + '@' + rcinfo.srcIp + ':' + rcinfo.srcPort + '>;tag=' + utils.generateRandomString(8) + '\r\n')
    inviteRaw.push('To: <sip:' + to + '@' + rcinfo.dstIp + ':' + rcinfo.dstPort + '>\r\n')
    inviteRaw.push('Call-ID: ' + callid + '\r\n')
    inviteRaw.push('CSeq: ' + seq + ' INVITE\r\n')
    inviteRaw.push('Max-Forwards: 70 \r\n')
    /* TODO: Add X-CID header */
    inviteRaw.push('Supported: replaces, path, timer, eventlist\r\n')
    inviteRaw.push('Allow: INVITE, ACK, OPTIONS, CANCEL, BYE, SUBSCRIBE, NOTIFY, INFO, REFER, UPDATE, MESSAGE\r\n')
    inviteRaw.push('Content-Type: application/sdp\r\n')
    inviteRaw.push('Accept: application/sdp, application/dtmf-relay\r\n')
    inviteRaw.push('Content-Length: 313\r\n')
    inviteRaw.push('\r\n')
    inviteRaw.push('v=0\r\n')
    inviteRaw.push('o=' + from + ' 8000 8000 IN IP4 ' + rcinfo.srcIp + '\r\n')
    inviteRaw.push('s=SIP Call\r\n')
    inviteRaw.push('c=IN IP4 ' + rcinfo.srcIp + '\r\n')
    inviteRaw.push('t=0 0\r\n')
    inviteRaw.push('m=audio 5004 RTP/AVP 0 8 9 18 101\r\n')
    inviteRaw.push('a=sendrecv\r\n')
    inviteRaw.push('a=rtpmap:0 PCMU/8000\r\n')
    inviteRaw.push('a=ptime:20\r\n')
    inviteRaw.push('a=rtpmap:8 PCMA/8000\r\n')
    inviteRaw.push('a=rtpmap:9 G722/8000\r\n')
    inviteRaw.push('a=rtpmap:18 G729/8000\r\n')
    inviteRaw.push('a=fmtp:18 annexb=no\r\n')
    inviteRaw.push('a=rtpmap:101 telephone-event/8000\r\n')
    inviteRaw.push('a=fmtp:101 0-15\r\n')
    inviteRaw.push('\r\n\r\n')

    return hepJs.encapsulate(inviteRaw.join(''), rcinfo)
}

/**
 * Generate a 200 OK for a SIP Invite
 * @param {string} seq 
 * @param {string} from 
 * @param {string} to 
 * @param {string} callid 
 * @param {RCINFO} rcinfo 
 * @returns 
 */
hepModule.generate200OKInvite = function (seq, from, to, callid, rcinfo) {
    let datenow = new Date().getTime()
    rcinfo.time_sec = Math.floor(datenow / 1000)
    rcinfo.time_usec = (datenow - (rcinfo.time_sec*1000))*1000

    let raw200OK = []

    raw200OK.push('SIP/2.0 200 OK\r\n')
    raw200OK.push('From: <sip:' + from + '@' + rcinfo.srcIp + '>;tag=06DE7CEB-56E458BB000864AD-B855F700\r\n')
    raw200OK.push('To: <sip:' + to + '@' + rcinfo.dstIp + '>;tag=as6db2fc4d\r\n')
    raw200OK.push('Call-ID: ' + callid + '\r\n')
    raw200OK.push('CSeq: ' + seq + ' INVITE\r\n')
    raw200OK.push('User-Agent: HEPServer\r\n')
    raw200OK.push('Allow: INVITE, ACK, CANCEL, OPTIONS, BYE, REFER, SUBSCRIBE, NOTIFY\r\n')
    raw200OK.push('Supported: replaces\r\n')
    raw200OK.push('Contact: <sip:' + to + '@' + rcinfo.dstIp + ':' + rcinfo.dstPort + '>\r\n')
    raw200OK.push('Content-Type: application/sdp\r\n')
    raw200OK.push('Content-Length: 311\r\n')
    raw200OK.push('\r\n')
    raw200OK.push('v=0\r\n')
    raw200OK.push('o=root 11882 11882 IN IP4 ' + rcinfo.dstIp + '\r\n')
    raw200OK.push('s=session\r\n')
    raw200OK.push('c=IN IP4 ' + rcinfo.dstIp + '\r\n')
    raw200OK.push('t=0 0\r\n')
    raw200OK.push('m=audio 12366 RTP/AVP 8 0 18 101\r\n')
    raw200OK.push('a=rtpmap:8 PCMA/8000\r\n')
    raw200OK.push('a=rtpmap:0 PCMU/8000\r\n')
    raw200OK.push('a=rtpmap:18 G729/8000\r\n')
    raw200OK.push('a=fmtp:18 annexb=no\r\n')
    raw200OK.push('a=rtpmap:101 telephone-event/8000\r\n')
    raw200OK.push('a=fmtp:101 0-16\r\n')
    raw200OK.push('a=silenceSupp:off - - - -\r\n')
    raw200OK.push('a=ptime:20\r\n')
    raw200OK.push('a=sendrecv\r\n')
    raw200OK.push('\r\n\r\n')

    return hepJs.encapsulate(raw200OK.join(''), rcinfo)
}

/**
 * Generate a Short RTP report
 * @param {string} from 
 * @param {string} to 
 * @param {string} callid 
 * @param {RCINFO} rcinfo 
 * @param {MEDIAINFO} mediaInfo 
 * @returns {string} Short Report payload
 */
hepModule.generatePeriodicReport = function (callid, rcinfo, mediaInfo) {
    let rcinfoRaw = JSON.parse(JSON.stringify(rcinfo))
    rcinfoRaw.payload_type = 'JSON'
    rcinfoRaw.proto_type = 34
    rcinfoRaw.correlation_id = callid
    rcinfoRaw.mos = parseInt(403)
    let datenow = new Date().getTime()
    rcinfoRaw.time_sec = Math.floor(datenow / 1000)
    rcinfoRaw.time_usec = (datenow - (rcinfoRaw.time_sec*1000))*1000
    
    let rawShortReport = '{"CORRELATION_ID":"' + callid + '","RTP_SIP_CALL_ID":"' + callid + '","DELTA":19.983,"JITTER":0.017,"REPORT_TS":' + new Date().getTime()/1000 + ',"TL_BYTE":0,"SKEW":0.000,"TOTAL_PK":1512,"EXPECTED_PK":1512,"PACKET_LOSS":0,"SEQ":0,"MAX_JITTER":0.010,"MAX_DELTA":20.024,"MAX_SKEW":0.172,"MEAN_JITTER":0.005,"MIN_MOS":4.032, "MEAN_MOS":4.032, "MOS":4.032,"RFACTOR":80.200,"MIN_RFACTOR":80.200,"MEAN_RFACTOR":80.200,"SRC_IP":"' + rcinfoRaw.srcIp + '", "SRC_PORT":26872, "DST_IP":"' +  rcinfoRaw.dstIp + '","DST_PORT":51354,"SRC_MAC":"00-30-48-7E-5D-C6","DST_MAC":"00-12-80-D7-38-5E","OUT_ORDER":0,"SSRC_CHG":0,"CODEC_PT":9, "CLOCK":8000,"CODEC_NAME":"g722","DIR":0,"REPORT_NAME":"' + rcinfoRaw.srcIp + ':26872","PARTY":0,"TYPE":"PERIODIC"}'

    return hepJs.encapsulate(rawShortReport, rcinfoRaw)
}

/**
 * Generate Hangup RTP report
 * @param {string} from 
 * @param {string} to 
 * @param {string} callid 
 * @param {RCINFO} rcinfo 
 * @param {MEDIAINFO} mediaInfo 
 * @returns {string} Hangup Report payload
 */
hepModule.generateHangupReport = function (callid, rcinfo, mediaInfo) {
    let rcinfoRaw = JSON.parse(JSON.stringify(rcinfo))
    rcinfoRaw.payload_type = 'JSON'
    rcinfoRaw.proto_type = 34
    rcinfoRaw.correlation_id = callid
    rcinfoRaw.mos = parseInt(403)
    rcinfoRaw.cval1 = parseInt(403)
    rcinfoRaw.cval2 = parseInt(802)
    let datenow = new Date().getTime()
    rcinfoRaw.time_sec = Math.floor(datenow / 1000)
    rcinfoRaw.time_usec = (datenow - (rcinfoRaw.time_sec*1000))*1000
    /* TODO: Add RTP Start and Stop to mediaInfo */
    /* TODO: Calculate MOS, RFACTOR, Jitter, Packetloss in mediaInfo */
    let rawHangupReport = '{"CORRELATION_ID":"' + callid + '","RTP_SIP_CALL_ID":"' + callid + '","DELTA":19.983,"JITTER":0.017,"REPORT_TS":' + new Date().getTime()/1000 + ',"TL_BYTE":0,"SKEW":0.000,"TOTAL_PK":1512,"EXPECTED_PK":1512,"PACKET_LOSS":0,"SEQ":0,"MAX_JITTER":0.010,"MAX_DELTA":20.024,"MAX_SKEW":0.172,"MEAN_JITTER":0.005,"MIN_MOS":4.032, "MEAN_MOS":4.032, "MOS":4.032,"RFACTOR":80.200,"MIN_RFACTOR":80.200,"MEAN_RFACTOR":80.200,"SRC_IP":"' + rcinfoRaw.srcIp + '", "SRC_PORT":26872, "DST_IP":"' +  rcinfoRaw.dstIp + '","DST_PORT":51354,"SRC_MAC":"00-30-48-7E-5D-C6","DST_MAC":"00-12-80-D7-38-5E","OUT_ORDER":0,"SSRC_CHG":0,"CODEC_CH":0, "CODEC_PT":9, "CLOCK":8000,"CODEC_NAME":"g722","DIR":0,"REPORT_NAME":"' + rcinfoRaw.srcIp + ':26872","PARTY":0,"IP_QOS":,"INFO_VLAN":0,"VIDEO":0,"REPORT_START":' + (new Date().getTime()/1000)-30 + ',"REPORT_END":' + new Date().getTime()/1000 + ',"SSRC":"%#08X","RTP_START":' + (new Date().getTime()/1000)-30 + ',"RTP_STOP":' + new Date().getTime()/1000 + ',"ONE_WAY_RTP":0,"EVENT":0,"STYPE":"RTP","TYPE":"HANGUP"}'

    return hepJs.encapsulate(rawHangupReport, rcinfoRaw)
}

/**
 * Generate Short Hangup RTP report
 * @param {string} from 
 * @param {string} to 
 * @param {string} callid 
 * @param {RCINFO} rcinfo 
 * @param {MEDIAINFO} mediaInfo 
 * @returns {string} Hangup Report payload
 */
hepModule.generateShortHangupReport = function (callid, rcinfo, mediaInfo) {
    let rcinfoRaw = JSON.parse(JSON.stringify(rcinfo))
    rcinfoRaw.payload_type = 'JSON'
    rcinfoRaw.proto_type = 35
    rcinfoRaw.correlation_id = callid
    rcinfoRaw.mos = parseInt(403)
    let datenow = new Date().getTime()
    rcinfoRaw.time_sec = Math.floor(datenow / 1000)
    rcinfoRaw.time_usec = (datenow - (rcinfoRaw.time_sec*1000))*1000
    /* TODO: Add RTP Start and Stop to mediaInfo */
    /* TODO: Calculate MOS, RFACTOR, Jitter, Packetloss in mediaInfo */
    let rawHangupReport = '{"CORRELATION_ID":"' + callid + '","RTP_SIP_CALL_ID":"' + callid + '","DELTA":19.983,"JITTER":0.017,"REPORT_TS":' + new Date().getTime()/1000 + ',"TL_BYTE":0,"SKEW":0.000,"TOTAL_PK":1512,"EXPECTED_PK":1512,"PACKET_LOSS":0,"SEQ":0,"MAX_JITTER":0.010,"MAX_DELTA":20.024,"MAX_SKEW":0.172,"MEAN_JITTER":0.005,"MIN_MOS":4.032, "MEAN_MOS":4.032, "MOS":4.032,"RFACTOR":80.200,"MIN_RFACTOR":80.200,"MEAN_RFACTOR":80.200,"SRC_IP":"' + rcinfoRaw.srcIp + '", "SRC_PORT":26872, "DST_IP":"' +  rcinfoRaw.dstIp + '","DST_PORT":51354,"SRC_MAC":"00-30-48-7E-5D-C6","DST_MAC":"00-12-80-D7-38-5E","OUT_ORDER":0,"SSRC_CHG":0,"CODEC_CH":0, "CODEC_PT":9, "CLOCK":8000,"CODEC_NAME":"g722","DIR":0,"REPORT_NAME":"' + rcinfoRaw.srcIp + ':26872","PARTY":0,"IP_QOS":,"INFO_VLAN":0,"VIDEO":0,"REPORT_START":' + (new Date().getTime()/1000)-30 + ',"REPORT_END":' + new Date().getTime()/1000 + ',"SSRC":"%#08X","RTP_START":' + (new Date().getTime()/1000)-30 + ',"RTP_STOP":' + new Date().getTime()/1000 + ',"ONE_WAY_RTP":0,"EVENT":0,"STYPE":"RTP","TYPE":"HANGUP"}'

    return hepJs.encapsulate(rawHangupReport, rcinfoRaw)
}

/**
 * 
 * @param {string} from 
 * @param {string} to 
 * @param {string} callid 
 * @param {RCINFO} rcinfo 
 * @param {MEDIAINFO} mediaInfo 
 * @returns {string} Final Report payload
 */
hepModule.generateFinalReport = function (callid, rcinfo, mediaInfo) {
    let rcinfoRaw = JSON.parse(JSON.stringify(rcinfo))
    rcinfoRaw.payload_type = 'JSON'
    rcinfoRaw.proto_type = 34
    rcinfoRaw.correlation_id = callid
    rcinfoRaw.mos = parseInt(440)
    rcinfoRaw.cval1 = parseInt(440)
    rcinfoRaw.cval2 = parseInt(802)
    let datenow = new Date().getTime()
    rcinfoRaw.time_sec = Math.floor(datenow / 1000)
    rcinfoRaw.time_usec = (datenow - (rcinfoRaw.time_sec*1000))*1000
    
    let rawFinalReport = '{"CORRELATION_ID":"' + callid + '", "RTP_SIP_CALL_ID":"' + callid + '","MIN_MOS":4.409, "MIN_RFACTOR":93.200, "MIN_SKEW": 0, "MIN_JITTER":0, "MAX_MOS": 4.409, "MAX_RFACTOR":93.200, "MAX_SKEW":0, "MAX_JITTER":4.409, "MEAN_MOS": 4.409, "MEAN_RFACTOR":93.200, "MEAN_JITTER":0, "TOTAL_PACKET_LOSS":0,"TOTAL_PACKETS":5000,"DIR": ' + mediaInfo.direction + ',"REPORT_NAME":"' + rcinfoRaw.srcIp + '","PARTY": ' + mediaInfo.direction + ', "ONE_WAY_RTP": 0, "TYPE":"FINAL"}'

    return hepJs.encapsulate(rawFinalReport, rcinfoRaw)
}

/**
 * Generate a BYE message
 * @param {string} from 
 * @param {string} to 
 * @param {string} callid 
 * @param {RCINFO} rcinfo
 * @returns {string} BYE payload
 */
hepModule.generateBye = function (from, to, callid, rcinfo) {
    let datenow = new Date().getTime()
    rcinfo.time_sec = Math.floor(datenow / 1000)
    rcinfo.time_usec = (datenow - (rcinfo.time_sec*1000))*1000

    let rawBye = []

    rawBye.push('BYE sip:' + to + '@' + rcinfo.dstIp + ':5060;ngcpct=c2lwOjEyNy4wLjAuMTo1MDgw SIP/2.0\r\n')
    rawBye.push('Via: SIP/2.0/UDP ' + rcinfo.srcIp + ':5064;branch=' + utils.generateRandomBranch() + ';rport\r\n')
    rawBye.push('From: <sip:' + from + '@' + rcinfo.srcIp + ';user=phone>;tag=415746302\r\n')
    rawBye.push('To: <sip:' + to + '@' + rcinfo.dstIp + ';user=phone>;tag=7DB80AAE-56E458BB0008256B-B7852700\r\n')
    rawBye.push('Call-ID: ' + callid + '\r\n')
    rawBye.push('CSeq: 442 BYE\r\n')
    rawBye.push('Contact: <sip:' + from + '@' + rcinfo.srcIp + ':' + rcinfo.srcPort + ';user=phone>\r\n')
    rawBye.push('Max-Forwards: 70\r\n')
    rawBye.push('Supported: replaces, path, timer, eventlist\r\n')
    rawBye.push('User-Agent: hepgenjs\r\n')
    rawBye.push('Allow: INVITE, ACK, OPTIONS, CANCEL, BYE, SUBSCRIBE, NOTIFY, INFO, REFER, UPDATE, MESSAGE\r\n')
    rawBye.push('Content-Length: 0\r\n')
    rawBye.push('\r\n\r\n')

    return hepJs.encapsulate(rawBye.join(''), rcinfo)
}

/**
 * Generate a 200 OK for a BYE message
 * @param {string} from 
 * @param {string} to 
 * @param {string} callid 
 * @param {RCINFO} rcinfo
 * @returns {string} 200 OK BYE payload
 */
hepModule.generate200OKBye = function (from, to, callid, rcinfo) {
    let datenow = new Date().getTime()
    rcinfo.time_sec = Math.floor(datenow / 1000)
    rcinfo.time_usec = (datenow - (rcinfo.time_sec*1000))*1000

    let raw200OKBye = []

    raw200OKBye.push('SIP/2.0 200 OK\r\n')
    raw200OKBye.push('Via: SIP/2.0/UDP ' + rcinfo.srcIp + ':' + rcinfo.srcPort + ';received=127.0.0.1;branch=z9hG4bK829262785;rport=5064\r\n')
    raw200OKBye.push('From: <sip:' + from + '@' + rcinfo.srcIp + ';user=phone>;tag=415746302\r\n')
    raw200OKBye.push('To: <sip:' + to + '@' + rcinfo.dstIp + ';user=phone>;tag=7DB80AAE-56E458BB0008256B-B7852700\r\n')
    raw200OKBye.push('Call-ID: ' + callid + '\r\n')
    raw200OKBye.push('CSeq: 442 BYE\r\n')
    raw200OKBye.push('Server: Application Server\r\n')
    raw200OKBye.push('Content-Length: 0\r\n')
    raw200OKBye.push('P-Out-Socket: udp:' + rcinfo.dstIp + ':' + rcinfo.dstPort + '\r\n')
    raw200OKBye.push('\r\n\r\n')

    return hepJs.encapsulate(raw200OKBye.join(''), rcinfo)
}

/**
 * @typedef SCENARIO
 * @type {{name: string, call: {from: string, via: string, to: string, duration: Number[], amount: number, mos: Number[], jitter: Number[], packetloss: Number[]}}}
 */

/*
* Session Module
*/

const sessionModule = {
    sessions: [],
}

sessionModule.callFlows = {
    'default': ['INVITE', '200OK', 'MEDIA', 'BYE', '200BYE', 'END'],
    'auth': ['INVITE', '401', 'INVITEAUTH', '200OK', 'MEDIA', 'BYE', '200BYE', 'END'],
    'registration': ['REGISTER', '200OK', 'END'],
    'auth_register': ['REGISTER', '401', 'REGISTERAUTH', '200OK', 'END'],
    'dtmf': ['INVITE', '200OK', 'DTMF', 'MEDIA', 'BYE', '200BYE', 'END'],
    'timeout408': ['INVITE', '100', '200OK', 'ACK', 'BYE', '408', 'END'],
}



/**
 * initialize all sessions for all scenarios
 * @param {CONFIG} config 
 */
sessionModule.initializeSessions = function (config) {
    console.log('Creating Sessions')
    for (let i = 0; i < config.scenarios.length; i++) {
        let scenario = config.scenarios[i]
        sessionModule.initializeScenario(scenario)
    }
    console.log(`Created ${sessionModule.sessions.length} Sessions`)
}

/**
 * Create individual sessions
 * @param {SCENARIO} scenario 
 * @returns 
 */
sessionModule.createSession = function (scenario, correlation_id) {
    /**
     * @type {{callid: string, seq: number, duration: number, via: string, from_user: string, from_ip: string, to_user: string, to_ip: string, target_duration: number, mos_range: number[], jitter_range: number[], packetloss_range: number[], state: string, callflow: string, mediaInfo: MEDIAINFO}}
     */
    let session = {
        callid: 'sim_' + utils.generateRandomString(8),
        seq: utils.getRandomInt(1000, 9999),
        duration: 0,
        via: scenario.call.via,
        from_user: utils.getRandomPhoneNumber(),
        from_ip: simulationModule.infrastructure[scenario.call.from].ip,
        to_user: utils.getRandomPhoneNumber(),
        to_ip: simulationModule.infrastructure[scenario.call.to].ip,
        target_duration: utils.getRandomInt(scenario.call.duration[0], scenario.call.duration[1]) * 1000,
        mos_range: scenario.call.mos,
        jitter_range: scenario.call.jitter,
        packetloss_range: scenario.call.packetloss,
        state: '0',
        callflow: scenario.callflow,
        mediaInfo: {}
    }
    /* TODO: Implement random MOS, Jitter and Packetloss */
    if (correlation_id) {
        session.correlation_id = correlation_id
    }
    let captureId = simulationModule.infrastructure[scenario.call.from].captureId || simulationModule.infrastructure[scenario.call.to].captureId || 12345
    session.outDirection = hepModule.generateRCInfo(captureId, 'hep', 1, session?.correlation_id || session.callid, 1, session.from_ip, session.to_ip, 5060, 5060)
    session.inDirection = hepModule.generateRCInfo(captureId, 'hep', 1, session?.correlation_id || session.callid, 1, session.to_ip, session.from_ip, 5060, 5060)
    return session
}

/**
 * Initialize a Scenario sessions
 * @param {SCENARIO} scenario 
 */
sessionModule.initializeScenario = function (scenario) {
    console.log('Initializing Scenario ', scenario)
    for (let i = 0; i < scenario.call.amount; i++) {
        if (scenario.call?.via) {
            let leg1Scenario = JSON.parse(JSON.stringify(scenario))
            leg1Scenario.call.to = scenario.call.via
            let leg2Scenario = JSON.parse(JSON.stringify(scenario))
            leg2Scenario.call.from = scenario.call.via
            let session1 = sessionModule.createSession(leg1Scenario)
            let session2 = sessionModule.createSession(leg2Scenario, session1.callid)
            sessionModule.sessions.push(session1)
            sessionModule.sessions.push(session2)
        } else {
            let session = sessionModule.createSession(scenario)
            sessionModule.sessions.push(session)
        }
    }
    return true
}

/**
 * Update all sessions
 * Here we initiate sending HEP and track the state of the sessions
 */
sessionModule.update = function (moment) {
    /* console.log('Updating Sessions') */
    for (let i = 0; i < sessionModule.sessions.length; i++) {
        let session = sessionModule.sessions[i]
        if (debug) console.log(sessionModule.callFlows[session.callflow][session.state])
        if (sessionModule.callFlows[session.callflow][session.state] == 'INVITE') {
            let via = []
            if (simulationModule.infrastructure[session.via].ip == session.from_ip) {
                via.push({ srcIp: session.from_ip, dstIp: session.to_ip, srcPort: 5060, dstPort: 5060 })
            }
            let invite = hepModule.generateInvite(session.seq, session.from_user, session.to_user, session.callid, session.outDirection, via)

            senderModule.send(invite)
            session.state++
            continue
        } else if (sessionModule.callFlows[session.callflow][session.state] == '200OK') {
            let ok200 = hepModule.generate200OKInvite(session.seq, session.from_user, session.to_user, session.callid, session.inDirection)
            senderModule.send(ok200)
            session.state++
            /* Starting the call duration */
            session.start = moment
            session.reportingStart = moment
            continue
        } else if (sessionModule.callFlows[session.callflow][session.state] == 'MEDIA') {
            let duration = moment - session.reportingStart
            session.duration = moment - session.start
            if (duration > 30000 && session.duration < session.target_duration) {
                let media = hepModule.generatePeriodicReport(session.callid, session.inDirection, { mos: 4.5, jitter: 0, packetloss: 0 })
                senderModule.send(media)
                let mediaBack = hepModule.generatePeriodicReport(session.callid, session.outDirection, { mos: 4.5, jitter: 0, packetloss: 0 })
                senderModule.send(mediaBack)
                session.reportingStart = moment
                continue
            } else if (session.duration > session.target_duration) {

                let final = hepModule.generateFinalReport(session.callid, session.inDirection, { mos: 4.5, jitter: 0, packetloss: 0, direction: 0 })
                senderModule.send(final)
                let hangup = hepModule.generateHangupReport(session.callid, session.inDirection, { mos: 4.5, jitter: 0, packetloss: 0 })
                senderModule.send(hangup)
                let shortHangup = hepModule.generateShortHangupReport(session.callid, session.inDirection, { mos: 4.5, jitter: 0, packetloss: 0 })
                senderModule.send(shortHangup)

                let finalBack = hepModule.generateFinalReport(session.callid, session.outDirection, { mos: 4.5, jitter: 0, packetloss: 0, direction: 1 })
                senderModule.send(finalBack)
                let hangupBack = hepModule.generateHangupReport(session.callid, session.outDirection, { mos: 4.5, jitter: 0, packetloss: 0 })
                senderModule.send(hangupBack)
                let shortHangupBack = hepModule.generateShortHangupReport(session.callid, session.outDirection, { mos: 4.5, jitter: 0, packetloss: 0 })
                senderModule.send(shortHangupBack)

                session.state++
                continue
            }
            continue
        } else if (sessionModule.callFlows[session.callflow][session.state] == 'BYE') {
            let bye = hepModule.generateBye(session.from_user, session.to_user, session.callid, session.outDirection)
            senderModule.send(bye)
            session.state++
            continue
        } else if (sessionModule.callFlows[session.callflow][session.state] == '200BYE') {
            let bye200 = hepModule.generate200OKBye(session.from_user, session.to_user, session.callid, session.inDirection)
            senderModule.send(bye200)
            session.state++
            continue
        } else if (sessionModule.callFlows[session.callflow][session.state] == 'END') {
            if (debug) console.log('Session Ended', session.callid)
            sessionModule.sessions.splice(i, 1)
            continue
        } else {
            console.log('Unknown State')
            throw('Unknown State')
        }
    }
}

/**
 * @typedef CONFIG
 * @type {{scenarios: SCENARIO[], virtualInfrastructure: {namedString: {type: string, ip: string}}}}
 */

/*
* Simulation
*/

const simulationModule = {
    start: Date.now(),
    diff: 0,
    previous: Date.now(),
    infrastructure: {},
}

/**
 * Initialize the Simulation with a config
 * @param {CONFIG} config 
 */
simulationModule.initializeSimulation = function (config) {
    console.log('Initializing Simulation')
    console.log('Setting up Infrastructure')
    simulationModule.infrastructure = config.virtualInfrastructure
    console.log(config.scenarios)
    console.log(simulationModule)
    sessionModule.initializeSessions(config)
    console.log('Simulation Initialized')
    return true
}

simulationModule.tick = function () {
    simulationModule.diff = Date.now() - simulationModule.previous
    if (simulationModule.diff > 1000) {
        sessionModule.update(Date.now())
        simulationModule.previous = Date.now()
    }

    if (simulationModule.killed) return
    setTimeout(simulationModule.tick, 200)
}

simulationModule.killSimulation = function () {
    simulationModule.killed = true
    /* TODO: Allow all calls to finish, but stop new ones */
}


/**
 * Main function
 */
function main() {
    console.log('******************|/')
    console.log(' EXSPUE HEP!---->-*-')
    console.log('******************|\\')
    console.log('\n\nStarting Simulation')
    let config = JSON.parse(fs.readFileSync('config.json'))
    simulationModule.initializeSimulation(config)
    setTimeout(simulationModule.tick, 200)
}

main()