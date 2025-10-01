import * as utils from './utils.js';
import * as hepJs from 'hep-js';

/** TYPE DEFINITIONS */

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
 * @type { {mos: float, mean_mos: float, jitter: float, mean_jitter: float, packetloss: integer, mean_rfactor: float, direction: number} }
 */


const hepModule = {
    /**
     * Generate RCInfo Object for HEP
     * @param {number} captureId - Capture ID for 'Simulated Agent'
     * @param {string} capturePass - HEP Password for Capture Server
     * @param {number} payload_type - 1 SIP, 'JSON' for RTCP and RTP reports
     * @param {string} correlation_id - Call ID or 'first leg callid', 'callid' for Reports or Logs
     * @param {number} proto_type - 1 SIP, 34 RTP Hangup, 35 RTP Periodic/Short, 36 RTCP Hangup, 37 RTCP short, 100 Log
     * @param {string} sourceIP 
     * @param {string} destinationIP 
     * @param {number} sourcePort 
     * @param {number} destinationPort 
     * @returns {RCINFO} RCInfo Object
     */
    generateRCInfo: function (captureId, capturePass, payload_type, correlation_id, proto_type, sourceIP, destinationIP, sourcePort, destinationPort) {
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
    },
    /**
     * Generate a generic SIP Invite
     * @param {string} seq 
     * @param {string} from 
     * @param {string} to 
     * @param {string} callid 
     * @param {RCINFO} rcinfo 
     * @param {MEDIAINFO} mediaInfo 
     * @returns {string} Invite payload
     */
    generateInvite: function (seq, from, to, callid, rcinfo, mediaInfo) {
        let datenow = new Date().getTime()
        rcinfo.time_sec = Math.floor(datenow / 1000)
        rcinfo.time_usec = (datenow - (rcinfo.time_sec*1000)) * 1000
        let inviteRaw = []
        inviteRaw.push('INVITE sip:' + to + '@' + rcinfo.dstIp + ':' + rcinfo.dstPort + ' SIP/2.0\r\n')
        /* TODO Only add via when it's necessary */
        inviteRaw.push('Via: SIP/2.0/UDP ' + rcinfo.srcIp + ':' + rcinfo.srcPort + ';branch=' + utils.generateRandomBranch() + '\r\n')
        inviteRaw.push('From: <sip:' + from + '@' + rcinfo.srcIp + ':' + rcinfo.srcPort + '>;tag=' + utils.generateRandomString(8) + '\r\n')
        inviteRaw.push('To: <sip:' + to + '@' + rcinfo.dstIp + ':' + rcinfo.dstPort + '>\r\n')
        inviteRaw.push('Call-ID: ' + callid + '\r\n')
        inviteRaw.push('CSeq: ' + seq + ' INVITE\r\n')
        inviteRaw.push('Max-Forwards: 70 \r\n')
        if (rcinfo?.correlation_id) inviteRaw.push('X-CID: ' + rcinfo.correlation_id + '\r\n')
        inviteRaw.push('Supported: replaces, path, timer, eventlist\r\n')
        inviteRaw.push('Allow: INVITE, ACK, OPTIONS, CANCEL, BYE, SUBSCRIBE, NOTIFY, INFO, REFER, UPDATE, MESSAGE\r\n')
        inviteRaw.push('Content-Type: application/sdp\r\n')
        inviteRaw.push('Accept: application/sdp, application/dtmf-relay\r\n')
        inviteRaw.push('User-Agent: Grandstream GXP2200 1.0.3.27\r\n')
        inviteRaw.push('Content-Length: 313\r\n')
        inviteRaw.push('\r\n')
        inviteRaw.push('v=0\r\n')
        inviteRaw.push('o=' + from + ' 8000 8000 IN IP4 ' + rcinfo.srcIp + '\r\n')
        inviteRaw.push('s=SIP Call\r\n')
        inviteRaw.push('c=IN IP4 ' + rcinfo.srcIp + '\r\n')
        inviteRaw.push('t=0 0\r\n')
        inviteRaw.push('m=audio ' + mediaInfo.srcPort + ' RTP/AVP 0 8 9 18 101\r\n')
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
    },
    /**
     * Generate a 407 Proxy Authentication Required
     * @param {string} seq
     * @param {string} from
     * @param {string} to
     * @param {string} callid
     * @param {RCINFO} rcinfo
     * @returns {string} 407 Proxy Authentication Required payload
     */
    generate407: function (seq, from, to, callid, rcinfo) {
        let datenow = new Date().getTime()
        /* Switch Direction */
        let src = rcinfo.srcIp
        let dst = rcinfo.dstIp
        let sport = rcinfo.srcPort
        let dport = rcinfo.dstPort
        rcinfo.dstIp = src
        rcinfo.srcIp = dst
        rcinfo.dstPort = sport
        rcinfo.srcPort = dport
        rcinfo.time_sec = Math.floor(datenow / 1000)
        rcinfo.time_usec = (datenow - (rcinfo.time_sec*1000))*1000
    
        let raw407 = []
    
        raw407.push('SIP/2.0 407 Proxy Authentication Required\r\n')
        raw407.push('Via: SIP/2.0/TCP ' + rcinfo.dstIp + ':' + rcinfo.dstPort + ';branch=' + utils.generateRandomBranch() + '\r\n')
        raw407.push('From: <sip:' + from + '@' + rcinfo.srcIp + ':' + rcinfo.srcPort + '>;tag=' + utils.generateRandomString(8) + '\r\n')
        raw407.push('To: <sip:' + to + '@' + rcinfo.dstIp + ':' + rcinfo.dstPort + '>;tag=' + utils.generateRandomString(8) + '\r\n')
        raw407.push('Call-ID: ' + callid + '\r\n')
        raw407.push('CSeq: ' + seq + ' INVITE\r\n')
        raw407.push('User-Agent: Grandstream GXP2200 1.0.3.27\r\n')
        raw407.push('Accept: application/sdp\r\n')
        raw407.push('Allow: INVITE, ACK, BYE, CANCEL, OPTIONS, MESSAGE, INFO, UPDATE, REGISTER, REFER, NOTIFY, PUBLISH, SUBSCRIBE\r\n')
        raw407.push('Supported: timer, path, replaces\r\n')
        raw407.push('Allow-Events: talk, hold, conference, presence, as-feature-event, dialog, line-seize, call-info, sla, include-session-description, presence.winfo, message-summary, refer\r\n')
        raw407.push('Proxy-Authenticate: Digest realm="hepsim", nonce="' + utils.generateRandomString(32) + '", algorithm=MD5, qop="auth"\r\n')
        raw407.push('Content-Length: 0\r\n')
        raw407.push('\r\n\r\n')
    
        return hepJs.encapsulate(raw407.join(''), rcinfo)
    },
    /**
     * Generate an Ack for a 407 Proxy Authentication Required
     * @param {string} seq 
     * @param {string} from 
     * @param {string} to 
     * @param {string} callid 
     * @param {RCINFO} rcinfo 
     * @returns 
     */
    generateAck407: function (seq, from, to, callid, rcinfo) {
        let datenow = new Date().getTime()
        rcinfo.time_sec = Math.floor(datenow / 1000)
        rcinfo.time_usec = (datenow - (rcinfo.time_sec*1000))*1000
    
        let rawAck407 = []
        rawAck407.push('ACK sip:' + to + '@' + rcinfo.dstIp + ';transport=TCP SIP/2.0')
        rawAck407.push('Via: SIP/2.0/TCP ' + rcinfo.srcIp + ':' + rcinfo.srcPort + ';branch=' + utils.generateRandomBranch() + ';rport')
        rawAck407.push('Max-Forwards: 70')
        rawAck407.push('To: <sip:' + to + '@' + rcinfo.dstIp + '>;tag=' + utils.generateRandomString(8))
        rawAck407.push('From: <sip:' + from + '@' + rcinfo.srcIp + ';transport=TCP>;tag=' + utils.generateRandomString(8))
        rawAck407.push('Call-ID: ' + callid)
        rawAck407.push('CSeq: ' + seq + ' ACK')
        rawAck407.push('Content-Length: 0')
        rawAck407.push('\r\n\r\n')
    
        return hepJs.encapsulate(rawAck407.join(''), rcinfo)
    },
    /**
     * Generate a generic SIP Invite with Auth
     * @param {string} seq 
     * @param {string} from 
     * @param {string} to 
     * @param {string} callid 
     * @param {RCINFO} rcinfo 
     * @param {MEDIAINFO} mediaInfo 
     * @returns {string} Invite payload
     */
    generateInviteAuth: function (seq, from, to, callid, rcinfo, mediaInfo) {
        let datenow = new Date().getTime()
        rcinfo.time_sec = Math.floor(datenow / 1000)
        rcinfo.time_usec = (datenow - (rcinfo.time_sec*1000)) * 1000
        let inviteRaw = []
        inviteRaw.push('INVITE sip:' + to + '@' + rcinfo.dstIp + ':' + rcinfo.dstPort + ' SIP/2.0\r\n')
        /* TODO Only add via when it's necessary */
        inviteRaw.push('Via: SIP/2.0/UDP ' + rcinfo.srcIp + ':' + rcinfo.srcPort + ';branch=' + utils.generateRandomBranch() + '\r\n')
        inviteRaw.push('From: <sip:' + from + '@' + rcinfo.srcIp + ':' + rcinfo.srcPort + '>;tag=' + utils.generateRandomString(8) + '\r\n')
        inviteRaw.push('To: <sip:' + to + '@' + rcinfo.dstIp + ':' + rcinfo.dstPort + '>\r\n')
        inviteRaw.push('Call-ID: ' + callid + '\r\n')
        inviteRaw.push('CSeq: ' + seq + ' INVITE\r\n')
        inviteRaw.push('Max-Forwards: 70 \r\n')
        if (rcinfo?.correlation_id) inviteRaw.push('X-CID: ' + rcinfo.correlation_id + '\r\n')
        inviteRaw.push('Supported: replaces, path, timer, eventlist\r\n')
        inviteRaw.push('Allow: INVITE, ACK, OPTIONS, CANCEL, BYE, SUBSCRIBE, NOTIFY, INFO, REFER, UPDATE, MESSAGE\r\n')
        inviteRaw.push('Content-Type: application/sdp\r\n')
        inviteRaw.push('Accept: application/sdp, application/dtmf-relay\r\n')
        inviteRaw.push('Proxy-Authorization: Digest username="' + from + '",realm="sip.botauro.com",nonce="' + utils.generateRandomString(32) + '",uri="sip:' + to + '@' + rcinfo.dstIp + ';transport=TCP",response="' + utils.generateRandomString(32) + '",cnonce="' + utils.generateRandomString(32) + '",nc=00000001,qop=auth,algorithm=MD5"\r\n')
        inviteRaw.push('User-Agent: Grandstream GXP2200 1.0.3.27\r\n')
        inviteRaw.push('Content-Length: 313\r\n')
        inviteRaw.push('\r\n')
        inviteRaw.push('v=0\r\n')
        inviteRaw.push('o=' + from + ' 8000 8000 IN IP4 ' + rcinfo.srcIp + '\r\n')
        inviteRaw.push('s=SIP Call\r\n')
        inviteRaw.push('c=IN IP4 ' + rcinfo.srcIp + '\r\n')
        inviteRaw.push('t=0 0\r\n')
        inviteRaw.push('m=audio ' + mediaInfo.srcPort + ' RTP/AVP 0 8 9 18 101\r\n')
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
    },
    /**
     * Generates a 100 Trying for a SIP Invite
     * @param {string} seq 
     * @param {string} from 
     * @param {string} to 
     * @param {string} callid 
     * @param {RCINFO} rcinfo 
     * @returns {string} 100 Trying payload
     */
    generate100Trying: function (seq, from, to, callid, rcinfo) {
        let datenow = new Date().getTime()
        rcinfo = Object.assign({}, rcinfo) // Create a shallow copy to avoid mutating the original
        /* Switch Direction */
        let src = rcinfo.srcIp
        let dst = rcinfo.dstIp
        let sport = rcinfo.srcPort
        let dport = rcinfo.dstPort
        rcinfo.dstIp = src
        rcinfo.srcIp = dst
        rcinfo.dstPort = sport
        rcinfo.srcPort = dport

        rcinfo.time_sec = Math.floor(datenow / 1000)
        rcinfo.time_usec = (datenow - (rcinfo.time_sec*1000))*1000
    
        let raw100Trying = []
        raw100Trying.push('SIP/2.0 100 Trying\r\n')
        raw100Trying.push('Via: SIP/2.0/TCP ' + rcinfo.dstIp + ':' + rcinfo.dstPort + ';branch=' + utils.generateRandomBranch() + '\r\n')
        raw100Trying.push('From: <sip' + from + '@' + rcinfo.srcIp + ':' + rcinfo.srcPort + '>;tag=' + utils.generateRandomString(8) + '\r\n')
        raw100Trying.push('To: <sip:' + to + '@' + rcinfo.dstIp + ':' + rcinfo.dstPort + '>\r\n')
        raw100Trying.push('Call-ID: ' + callid + '\r\n')
        raw100Trying.push('CSeq: ' + seq + ' INVITE\r\n')
        raw100Trying.push('User-Agent: Grandstream GXP2200 1.0.3.27\r\n')
        raw100Trying.push('Content-Length: 0\r\n')
        raw100Trying.push('\r\n\r\n')
    
        return hepJs.encapsulate(raw100Trying.join(''), rcinfo)
    },
    /**
     * Generate 180 Ringing for a SIP Invite
     * @param {string} seq
     * @param {string} from
     * @param {string} to
     * @param {string} callid
     * @param {RCINFO} rcinfo
     * @return {string} 180 Ringing payload
     */
    generate180Ringing: function (seq, from, to, callid, rcinfo) {
        let datenow = new Date().getTime()
        rcinfo = Object.assign({}, rcinfo) // Create a shallow copy to avoid mutating the original
        /* Switch Direction */
        let src = rcinfo.srcIp
        let dst = rcinfo.dstIp
        let sport = rcinfo.srcPort
        let dport = rcinfo.dstPort
        rcinfo.dstIp = src
        rcinfo.srcIp = dst
        rcinfo.dstPort = sport
        rcinfo.srcPort = dport

        rcinfo.time_sec = Math.floor(datenow / 1000)
        rcinfo.time_usec = (datenow - (rcinfo.time_sec*1000))*1000
    
        let raw180Ringing = []
        raw180Ringing.push('SIP/2.0 180 Ringing\r\n')
        raw180Ringing.push('Via: SIP/2.0/TCP ' + rcinfo.dstIp + ';branch=' + utils.generateRandomBranch() + '\r\n')
        raw180Ringing.push('From: <sip:' + from + '@' + rcinfo.srcIp + '>;tag=' + utils.generateRandomString(8) + '\r\n')
        raw180Ringing.push('To: <sip:' + to + '@' + rcinfo.dstIp + ':' + rcinfo.dstPort + ';transport=tcp;received=' + rcinfo.srcIp + ':' + rcinfo.srcPort + '>;tag=' + utils.generateRandomString(8) + '\r\n')
        raw180Ringing.push('Call-ID: ' + callid + '\r\n')
        raw180Ringing.push('CSeq: ' + seq + ' INVITE\r\n')
        raw180Ringing.push('Contact: <sip:250@192.168.188.26:49133;transport=tcp>\r\n')
        raw180Ringing.push('Supported: replaces, path, timer, eventlist\r\n')
        raw180Ringing.push('User-Agent: Grandstream GXP2200 1.0.3.27\r\n')
        raw180Ringing.push('Allow-Events: talk, hold\r\n')
        raw180Ringing.push('Allow: INVITE, ACK, OPTIONS, CANCEL, BYE, SUBSCRIBE, NOTIFY, INFO, REFER, UPDATE, MESSAGE\r\n')
        raw180Ringing.push('Content-Length: 0\r\n')
        raw180Ringing.push('\r\n\r\n')
    
        return hepJs.encapsulate(raw180Ringing.join(''), rcinfo)
    },
    /**
     * Generate a 200 OK for a SIP Invite
     * @param {string} seq 
     * @param {string} from 
     * @param {string} to 
     * @param {string} callid 
     * @param {RCINFO} rcinfo 
     * @param {MEDIAINFO} mediaInfo
     * @returns {string} 200 OK payload
     */
    generate200OKInvite: function (seq, from, to, callid, rcinfo, mediaInfo) {
        let datenow = new Date().getTime()
        rcinfo = Object.assign({}, rcinfo) // Create a shallow copy to avoid mutating the original
        /* Switch Direction */
        let src = rcinfo.srcIp
        let dst = rcinfo.dstIp
        let sport = rcinfo.srcPort
        let dport = rcinfo.dstPort
        rcinfo.dstIp = src
        rcinfo.srcIp = dst
        rcinfo.dstPort = sport
        rcinfo.srcPort = dport

        rcinfo.time_sec = Math.floor(datenow / 1000)
        rcinfo.time_usec = (datenow - (rcinfo.time_sec*1000))*1000
    
        let raw200OK = []
    
        raw200OK.push('SIP/2.0 200 OK\r\n')
        raw200OK.push('From: <sip:' + from + '@' + rcinfo.srcIp + '>;tag=06DE7CEB-56E458BB000864AD-B855F700\r\n')
        raw200OK.push('To: <sip:' + to + '@' + rcinfo.dstIp + '>;tag=as6db2fc4d\r\n')
        raw200OK.push('Call-ID: ' + callid + '\r\n')
        raw200OK.push('CSeq: ' + seq + ' INVITE\r\n')
        raw200OK.push('User-Agent: SBC\r\n')
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
        raw200OK.push('m=audio ' + mediaInfo.dstPort + ' RTP/AVP 8 0 18 101\r\n')
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
    },
    /**
     * Generate a 200 OK ACK for a SIP Invite
     * @param {string} seq
     * @param {string} from 
     * @param {string} to 
     * @param {string} callid 
     * @param {RCINFO} rcinfo 
     */
    generate200OKAck: function (seq, from, to, callid, rcinfo) {
        let datenow = new Date().getTime()
        rcinfo.time_sec = Math.floor(datenow / 1000)
        rcinfo.time_usec = (datenow - (rcinfo.time_sec*1000))*1000
    
        let raw200OKAck = []
    
        raw200OKAck.push('ACK sip:' + to + '@' + rcinfo.dstIp + ':' + rcinfo.dstPort + ' SIP/2.0\r\n')
        raw200OKAck.push('Via: SIP/2.0/UDP ' + rcinfo.srcIp + ':' + rcinfo.srcPort + ';branch=' + utils.generateRandomBranch() + '\r\n')
        raw200OKAck.push('From: <sip:' + from + '@' + rcinfo.srcIp + ':' + rcinfo.srcPort + '>;tag=06DE7CEB-56E458BB000864AD-B855F700\r\n')
        raw200OKAck.push('To: <sip:' + to + '@' + rcinfo.dstIp + ':' + rcinfo.dstPort + '>\r\n')
        raw200OKAck.push('Call-ID: ' + callid + '\r\n')
        raw200OKAck.push('CSeq: ' + seq + ' ACK\r\n')
        raw200OKAck.push('Max-Forwards: 70\r\n')
        raw200OKAck.push('Content-Length: 0\r\n')
        raw200OKAck.push('\r\n\r\n')
    
        return hepJs.encapsulate(raw200OKAck.join(''), rcinfo)
    },
    /**
     * Generate a Periodic RTP report
     * @param {string} seq
     * @param {string} from 
     * @param {string} to 
     * @param {string} callid 
     * @param {RCINFO} rcinfo 
     * @param {MEDIAINFO} mediaInfo 
     * @param {boolean} reverse
     * @returns {string} Short Report payload
     */
    generatePeriodicReport: function (seq, from, to, callid, rcinfo, mediaInfo, reverse) {
        let rcinfoRaw = JSON.parse(JSON.stringify(rcinfo))
        let src, dst, sport, dport, dir
        if (!reverse) {
            src = rcinfoRaw.srcIp
            dst = rcinfoRaw.dstIp
            sport = mediaInfo.srcPort
            dport = mediaInfo.dstPort
            dir = 0
        } else {
            dst = rcinfoRaw.srcIp
            src = rcinfoRaw.dstIp
            dport = mediaInfo.srcPort
            sport = mediaInfo.dstPort
            dir = 1
        }
        rcinfoRaw.direction = dir
        rcinfoRaw.srcPort = sport
        rcinfoRaw.dstPort = dport
        rcinfoRaw.srcIp = src
        rcinfoRaw.dstIp = dst
        rcinfoRaw.payload_type = 'JSON'
        rcinfoRaw.proto_type = 34
        rcinfoRaw.correlation_id = callid
        rcinfoRaw.mos = parseInt(mediaInfo.mean_mos * 100)
        let datenow = new Date().getTime()
        rcinfoRaw.time_sec = Math.floor(datenow / 1000)
        rcinfoRaw.time_usec = (datenow - (rcinfoRaw.time_sec*1000))*1000
        
        let rawShortReport = `{"CORRELATION_ID":"${callid}","RTP_SIP_CALL_ID":"${callid}","DELTA":19.983,"JITTER":${mediaInfo.jitter},"REPORT_TS":${new Date().getTime()/1000},"TL_BYTE":0,"SKEW":0.000,"TOTAL_PK":1512,"EXPECTED_PK":1512,"PACKET_LOSS":${mediaInfo.packetloss},"SEQ":0,"MAX_JITTER":0.010,"MAX_DELTA":20.024,"MAX_SKEW":0.172,"MEAN_JITTER":${mediaInfo.mean_jitter},"MIN_MOS":4.032, "MEAN_MOS":${mediaInfo.mean_mos}, "MOS":${mediaInfo.mos},"RFACTOR":80.200,"MIN_RFACTOR":80.200,"MEAN_RFACTOR":80.200,"SRC_IP":"${src}", "SRC_PORT":${sport}, "DST_IP":"${dst}","DST_PORT":${dport},"SRC_MAC":"00-30-48-7E-5D-C6","DST_MAC":"00-12-80-D7-38-5E","OUT_ORDER":0,"SSRC_CHG":0,"CODEC_PT":9, "CLOCK":8000,"CODEC_NAME":"G722", "DIR":0, "REPORT_NAME":"${src}:${sport}", "PARTY":${dir}, "TYPE":"PERIODIC"}`
    
        return hepJs.encapsulate(rawShortReport, rcinfoRaw)
    },
    /**
     * Generate Hangup RTP report
     * @param {string} seq
     * @param {string} from 
     * @param {string} to 
     * @param {string} callid 
     * @param {RCINFO} rcinfo 
     * @param {MEDIAINFO} mediaInfo 
     * @param {boolean} reverse
     * @returns {string} Hangup Report payload
     */
    generateHangupReport: function (seq, from, to, callid, rcinfo, mediaInfo, reverse) {
        let rcinfoRaw = JSON.parse(JSON.stringify(rcinfo))
        let src, dst, sport, dport, dir
        if (!reverse) {
            src = rcinfoRaw.srcIp
            dst = rcinfoRaw.dstIp
            sport = mediaInfo.srcPort
            dport = mediaInfo.dstPort
            dir = 0
        }
        else {
            dst = rcinfoRaw.srcIp
            src = rcinfoRaw.dstIp
            dport = mediaInfo.srcPort
            sport = mediaInfo.dstPort
            dir = 1
        }
        rcinfoRaw.direction = dir
        rcinfoRaw.srcPort = sport
        rcinfoRaw.dstPort = dport
        rcinfoRaw.srcIp = src
        rcinfoRaw.dstIp = dst
        rcinfoRaw.payload_type = 'JSON'
        rcinfoRaw.proto_type = 34
        rcinfoRaw.correlation_id = callid
        rcinfoRaw.mos = parseInt(mediaInfo.mean_mos * 100)
        let datenow = new Date().getTime()
        rcinfoRaw.time_sec = Math.floor(datenow / 1000)
        rcinfoRaw.time_usec = (datenow - (rcinfoRaw.time_sec*1000))*1000
        let rawHangupReport = `{"CORRELATION_ID":"${callid}","RTP_SIP_CALL_ID":"${callid}","DELTA":25.009,"JITTER":6.699,"REPORT_TS":${new Date().getTime() / 1000},"TL_BYTE":223320,"SKEW":5.941,"TOTAL_PK":997,"EXPECTED_PK":996,"PACKET_LOSS":${mediaInfo.packetloss},"SEQ":0,"MAX_JITTER":10.378,"MAX_DELTA":53.889,"MAX_SKEW":26.510,"MEAN_JITTER":${mediaInfo.mean_jitter},"MIN_MOS":4.030, "MEAN_MOS":${mediaInfo.mean_mos}, "MOS":${mediaInfo.mean_mos},"RFACTOR":${mediaInfo.mean_rfactor},"MIN_RFACTOR":93.200,"MEAN_RFACTOR":${mediaInfo.mean_rfactor},"SRC_IP":"${src}", "SRC_PORT":${sport}, "DST_IP":"${dst}","DST_PORT":${dport},"SRC_MAC":"08-00-27-57-CD-E8","DST_MAC":"08-00-27-57-CD-E9","OUT_ORDER":0,"SSRC_CHG":0,"CODEC_CH":0,"CODEC_PT":9, "CLOCK":8000,"CODEC_NAME":"G722","DIR":${mediaInfo.direction},"REPORT_NAME":"${src}:${sport}","PARTY":${dir},"IP_QOS":184,"INFO_VLAN":0,"VIDEO":0,"REPORT_START":${mediaInfo.lastReport},"REPORT_END":${new Date().getTime() / 1000},"SSRC":"0X6687F6CF","RTP_START":${mediaInfo.rtpstart},"RTP_STOP":${new Date().getTime()},"ONE_WAY_RTP":0,"EVENT":0,"STYPE":"SIP:REQ","TYPE":"HANGUP"}`
    
        return hepJs.encapsulate(rawHangupReport, rcinfoRaw)
    },
    /**
     * Generate Short Hangup RTP report
     * @param {string} seq
     * @param {string} from 
     * @param {string} to 
     * @param {string} callid 
     * @param {RCINFO} rcinfo 
     * @param {MEDIAINFO} mediaInfo 
     * @param {boolean} reverse
     * @returns {string} Hangup Report payload
     */
    generateShortHangupReport: function (seq, from, to, callid, rcinfo, mediaInfo, reverse) {
        let rcinfoRaw = JSON.parse(JSON.stringify(rcinfo))
        let src, dst, sport, dport, dir
        if (!reverse) {
            src = rcinfoRaw.srcIp
            dst = rcinfoRaw.dstIp
            sport = mediaInfo.srcPort
            dport = mediaInfo.dstPort
            dir = 0
        }
        else {
            dst = rcinfoRaw.srcIp
            src = rcinfoRaw.dstIp
            dport = mediaInfo.srcPort
            sport = mediaInfo.dstPort
            dir = 1
        }
        rcinfoRaw.direction = dir
        rcinfoRaw.srcPort = sport
        rcinfoRaw.dstPort = dport
        rcinfoRaw.srcIp = src
        rcinfoRaw.dstIp = dst
        rcinfoRaw.payload_type = 'JSON'
        rcinfoRaw.proto_type = 35
        rcinfoRaw.correlation_id = callid
        rcinfoRaw.mos = parseInt(mediaInfo.mean_mos * 100)
        let datenow = new Date().getTime()
        rcinfoRaw.time_sec = Math.floor(datenow / 1000)
        rcinfoRaw.time_usec = (datenow - (rcinfoRaw.time_sec*1000))*1000
        let rawHangupReport = `{"CORRELATION_ID":"${callid}","RTP_SIP_CALL_ID":"${callid}","PACKET_LOSS":${mediaInfo.packetloss},"EXPECTED_PK":996,"CODEC_PT":9,"CODEC_NAME":"G722","CODEC_RATE":8000,"MEAN_JITTER":${mediaInfo.mean_jitter},"MOS":${mediaInfo.mean_mos},"RFACTOR":${mediaInfo.mean_rfactor},"DIR":${dir},"ONE_WAY_RTP":0,"REPORT_NAME":"${src}:${sport}","PARTY":${dir},"TYPE":"HANGUP"}`
    
        return hepJs.encapsulate(rawHangupReport, rcinfoRaw)
    },
    /**
     * Generate Final RTP report
     * @param {string} seq
     * @param {string} from 
     * @param {string} to 
     * @param {string} callid 
     * @param {RCINFO} rcinfo 
     * @param {MEDIAINFO} mediaInfo 
     * @param {boolean} reverse
     * @returns {string} Final Report payload
     */
    generateFinalReport: function (seq, from, to, callid, rcinfo, mediaInfo, reverse) {
        let rcinfoRaw = JSON.parse(JSON.stringify(rcinfo))
        let src, dst, sport, dport, dir
        if (!reverse) {
            src = rcinfoRaw.srcIp
            dst = rcinfoRaw.dstIp
            sport = mediaInfo.srcPort
            dport = mediaInfo.dstPort
            dir = 0
        }
        else {
            dst = rcinfoRaw.srcIp
            src = rcinfoRaw.dstIp
            dport = mediaInfo.srcPort
            sport = mediaInfo.dstPort
            dir = 1
        }
        rcinfoRaw.direction = dir
        rcinfoRaw.srcPort = sport
        rcinfoRaw.dstPort = dport
        rcinfoRaw.srcIp = src
        rcinfoRaw.dstIp = dst
        rcinfoRaw.payload_type = 'JSON'
        rcinfoRaw.proto_type = 34
        rcinfoRaw.correlation_id = callid
        rcinfoRaw.mos = parseInt(mediaInfo.mean_mos * 100)
        let datenow = new Date().getTime()
        rcinfoRaw.time_sec = Math.floor(datenow / 1000)
        rcinfoRaw.time_usec = (datenow - (rcinfoRaw.time_sec*1000))*1000
        let rawFinalReport = `{"CORRELATION_ID":"${callid}", "RTP_SIP_CALL_ID":"${callid}","MIN_MOS":4.409, "MIN_RFACTOR":93.200, "MIN_SKEW": 0, "MIN_JITTER":0, "MAX_MOS": 4.409, "MAX_RFACTOR":93.200, "MAX_SKEW":0, "MAX_JITTER":4.409, "MEAN_MOS":${mediaInfo.mean_mos}, "MEAN_RFACTOR":${mediaInfo.mean_rfactor}, "MEAN_JITTER":${mediaInfo.mean_jitter}, "TOTAL_PACKET_LOSS":${mediaInfo.packetloss},"TOTAL_PACKETS":5000,"DIR":${dir},"REPORT_NAME":"${src}","PARTY":${dir}, "ONE_WAY_RTP": 0, "TYPE":"FINAL"}`
    
        return hepJs.encapsulate(rawFinalReport, rcinfoRaw)
    },
    /**
     * Generate a BYE message
     * @param {string} seq
     * @param {string} from 
     * @param {string} to 
     * @param {string} callid 
     * @param {RCINFO} rcinfo
     * @returns {string} BYE payload
     */
    generateBye: function (seq, from, to, callid, rcinfo) {
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
        rawBye.push('User-Agent: Grandstream GXP2200 1.0.3.27\r\n')
        rawBye.push('Allow: INVITE, ACK, OPTIONS, CANCEL, BYE, SUBSCRIBE, NOTIFY, INFO, REFER, UPDATE, MESSAGE\r\n')
        rawBye.push('Content-Length: 0\r\n')
        rawBye.push('\r\n\r\n')
    
        return hepJs.encapsulate(rawBye.join(''), rcinfo)
    },
    /**
     * Generate a 200 OK for a BYE message
     * @param {string} seq
     * @param {string} from 
     * @param {string} to 
     * @param {string} callid 
     * @param {RCINFO} rcinfo
     * @returns {string} 200 OK BYE payload
     */
    generate200OKBye: function (seq, from, to, callid, rcinfo) {
        let datenow = new Date().getTime()
        /* Switch Direction */
        let src = rcinfo.srcIp
        let dst = rcinfo.dstIp
        let sport = rcinfo.srcPort
        let dport = rcinfo.dstPort
        rcinfo.dstIp = src
        rcinfo.srcIp = dst
        rcinfo.dstPort = sport
        rcinfo.srcPort = dport
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
    },
}

export default hepModule;