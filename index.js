/*
* expsue HEP (I spit HEP) is a simulator for calls.
* AGPLv3, 2024 - Jachen Duschletta
*/
/*
* Imports
*/
import * as HEP from 'hep-js'
import * as fs from 'node:fs'

/*
* Globals
*/

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

/*
* HEP Functions
*/

const hepManager = {}

/**
 * @typedef RCINFO
 * @type {{type: string, version: number, payload_type: number, captureId: string, capturePass: string, ip_family: number, protocol: number, proto_type: number, correlation_id: string, srcIp: string, dstIp: string, srcPort: number, dstPort: number}}
 */

/**
 * Generate RCInfo Object for HEP
 * @param {string} captureId - Capture ID for 'Simulated Agent'
 * @param {string} capturePass - HEP Password for Capture Server
 * @param {number} payload_type - 1 SIP, 'JSON' for RTCP and RTP reports
 * @param {string} correlation_id - Call ID or 'first leg callid', 'callid' for Reports or Logs
 * @param {number} proto_type - 17 SIP, 34 Hangup, 36 Periodic/Short, 35 RTCP, 100 Log
 * @param {string} sourceIP 
 * @param {string} destinationIP 
 * @param {number} sourcePort 
 * @param {number} destinationPort 
 * @returns {RCINFO} RCInfo Object
 */
hepManager.generateRCInfo = function (captureId, capturePass, payload_type, correlation_id, proto_type, sourceIP, destinationIP, sourcePort, destinationPort) {
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
hepManager.generateInvite = function (seq, from, to, callid, rcinfo, viaInfoArray) {
    let inviteRaw = []
    inviteRaw.push('INVITE sip:' + to + '@' + rcinfo.dstIp + ':' + rcinfo.dstPort + ' SIP/2.0\r\n')
    inviteRaw.push('Via: SIP/2.0/UDP ' + rcinfo.srcIp + ':' + rcinfo.srcPort + ';branch=' + utils.generateRandomBranch() + '\r\n')
    inviteRaw.push('From: <sip:' + from + '@' + rcinfo.srcIp + ':' + rcinfo.srcPort + '>;tag=' + utils.generateRandomString(8) + '\r\n')
    inviteRaw.push('To: <sip:' + to + '@' + rcinfo.dstIp + ':' + rcinfo.dstPort + '>\r\n')
    inviteRaw.push('Call-ID: ' + callid + '\r\n')
    inviteRaw.push('CSeq: ' + seq + ' INVITE\r\n')
    inviteRaw.push('Max-Forwards: 70 \r\n')
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

    return inviteRaw.join('')
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
hepManager.generate200OKInvite = function (seq, from, to, callid, rcinfo) {
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

    return raw200OK.join('')
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
hepManager.generateShortReport = function (from, to, callid, rcinfo, mediaInfo) {

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
hepManager.generateHangupReport = function (from, to, callid, rcinfo, mediaInfo) {

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
hepManager.generateFinalReport = function (from, to, callid, rcinfo, mediaInfo) {

}

/**
 * Generate a BYE message
 * @param {string} from 
 * @param {string} to 
 * @param {string} callid 
 * @param {RCINFO} rcinfo
 * @returns {string} BYE payload
 */
hepManager.generateBye = function (from, to, callid, rcinfo) {
}

/**
 * Generate a 200 OK for a BYE message
 * @param {string} from 
 * @param {string} to 
 * @param {string} callid 
 * @param {RCINFO} rcinfo
 * @returns {string} 200 OK BYE payload
 */
hepManager.generate200OKBye = function (from, to, callid, rcinfo) {
}


/*
* Simulation
*/

const simulationManager = {
    start: Date.now(),
    diff: 0,
    previous: Date.now()
}

simulationManager.initializeSimulation = function (config) {
    console.log('Initializing Simulation')
    console.log(config.scenarios)
    console.log(config.virtualInfrastructure)

    /* Create rcInfo for both directions of virtualInfrastructure[0] linkedTo */
    /* Initiate Sessions counts per scenario in the sessionManager (Random Phone Numbers are the sessionManagers task)*/
    /* return true */
}

simulationManager.tick = function () {
    simulationManager.diff = Date.now() - simulationManager.previous
    if (simulationManager.diff > 1000) {
        console.log('One Second')
        simulationManager.previous = Date.now()
    }
    setTimeout(simulationManager.tick, 200)
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
    simulationManager.initializeSimulation(config)
    setTimeout(simulationManager.tick, 200)
}

main()