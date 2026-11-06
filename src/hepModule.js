import * as utils from './utils.js';
// @ts-ignore
import * as hepJs from 'hep-js';

/** TYPE DEFINITIONS */

/**
 * Stamp HEP RCINFO timestamps with millisecond resolution plus random 1-999
 * sub-ms digits so same-tick packets do not share xxx000 microseconds.
 * @param {RCINFO} rcinfo
 * @returns {RCINFO}
 */
function stampRcinfoTime(rcinfo) {
    const ms = Date.now()
    rcinfo.timeSeconds = Math.floor(ms / 1000)
    rcinfo.timeUseconds = (ms % 1000) * 1000 + utils.getRandomInteger(1, 999)
    return rcinfo
}

/**
 * @typedef RCINFO
 * @type {{payloadType: number, captureId: number, capturePass: string, protocolFamily: number, protocol: number, proto_type: number, correlation_id: string, srcIp: string, dstIp: string, srcPort: number, dstPort: number, hepNodeName: string, timeSeconds: number, timeUseconds: number, direction?: number, mos?: number}}
 */

/**
 * Stable dialog identity for one SIP leg (RFC 3261 transaction/dialog matching).
 * @typedef DIALOG
 * @type {{fromTag: string, toTag: string, inviteBranch: string}}
 */

/**
 * @typedef MEDIAINFO
 * @type { {mos: number, mean_mos: number, jitter: number, mean_jitter: number, packetloss: number, mean_rfactor: number, direction: number, srcPort: number, dstPort: number, tl_bytes: number, total_packets: number, max_jitter: number, min_mos: number, lastReport: number, global_packets: number, global_packetloss: number, rtpstart: number, rtpend: number, global_bytes: number, reportCount: number} }
 */

/**
 * @param {DIALOG|undefined|null} dialog
 * @returns {DIALOG}
 */
function resolveDialog(dialog) {
    if (dialog?.fromTag && dialog?.toTag && dialog?.inviteBranch) return dialog;
    return {
        fromTag: utils.generateRandomString(8),
        toTag: utils.generateRandomString(8),
        inviteBranch: utils.generateRandomBranch(),
    };
}

/**
 * Prefer parent-leg correlation when set (leg B keeps leg A id).
 * @param {RCINFO} rcinfo
 * @param {string} callid
 * @returns {string}
 */
function mediaCorrelationId(rcinfo, callid) {
    return rcinfo?.correlation_id || callid;
}

/**
 * @param {string[]} bodyLines SDP lines without the final blank separator
 * @returns {string}
 */
function joinSipBody(bodyLines) {
    return bodyLines.join('') ;
}

/**
 * HepModule: Module for generating HEP payloads for SIP and RTP/RTCP reports
 */
const hepModule = {
    /**
     * Generate RCInfo Object for HEP
     * @param {number} captureId - Capture ID for 'Simulated Agent'
     * @param {string} capturePass - HEP Password for Capture Server
     * @param {number} payloadType - 1 SIP, 'JSON' for RTCP and RTP reports
     * @param {string} correlation_id - Call ID or first-leg callid for correlated legs
     * @param {number} proto_type - 1 SIP; 34 MOS_RTP_FULL_REPORT (periodic/hangup via JSON TYPE); 35 RTP short; 36 RTCP full hangup; 37 RTCP short; 100 Log
     * @param {string} sourceIP
     * @param {string} destinationIP
     * @param {number} sourcePort
     * @param {number} destinationPort
     * @returns {RCINFO} RCInfo Object
     */
    generateRCInfo: function (captureId, capturePass, payloadType, correlation_id, proto_type, sourceIP, destinationIP, sourcePort, destinationPort) {
        return {
            payloadType: payloadType,
            captureId: captureId,
            capturePass: capturePass,
            protocolFamily: 2,
            protocol: 17,
            proto_type: proto_type,
            correlation_id: correlation_id,
            srcIp: sourceIP,
            dstIp: destinationIP,
            srcPort: sourcePort,
            dstPort: destinationPort,
            hepNodeName: 'hepsim',
            timeSeconds: 0,
            timeUseconds: 0
        }
    },
    /**
     * @param {number} seq
     * @param {string} from
     * @param {string} to
     * @param {string} callid
     * @param {RCINFO} rcinfo
     * @param {MEDIAINFO} mediaInfo
     * @param {DIALOG} [dialog]
     * @returns {Buffer}
     */
    generateInvite: function (seq, from, to, callid, rcinfo, mediaInfo, dialog) {
        dialog = resolveDialog(dialog);
        rcinfo = Object.assign({}, rcinfo)
        rcinfo = stampRcinfoTime(rcinfo)
        let inviteRaw = []
        inviteRaw.push('INVITE sip:' + to + '@' + rcinfo.dstIp + ':' + rcinfo.dstPort + ' SIP/2.0\r\n')
        inviteRaw.push('Via: SIP/2.0/UDP ' + rcinfo.srcIp + ':' + rcinfo.srcPort + ';branch=' + dialog.inviteBranch + '\r\n')
        inviteRaw.push('From: ' + from + ' <sip:' + from + '@' + rcinfo.srcIp + ':' + rcinfo.srcPort + '>;tag=' + dialog.fromTag + '\r\n')
        inviteRaw.push('To: ' + to + ' <sip:' + to + '@' + rcinfo.dstIp + ':' + rcinfo.dstPort + '>\r\n')
        inviteRaw.push('Call-ID: ' + callid + '\r\n')
        inviteRaw.push('CSeq: ' + seq + ' INVITE\r\n')
        inviteRaw.push('Contact: <sip:' + from + '@' + rcinfo.srcIp + ':' + rcinfo.srcPort + '>\r\n')
        inviteRaw.push('Max-Forwards: 70\r\n')
        if (rcinfo?.correlation_id && rcinfo.correlation_id !== callid) {
            inviteRaw.push('X-CID: ' + rcinfo.correlation_id + '\r\n')
        }
        inviteRaw.push('Supported: replaces, path, timer, eventlist\r\n')
        inviteRaw.push('Allow: INVITE, ACK, OPTIONS, CANCEL, BYE, SUBSCRIBE, NOTIFY, INFO, REFER, UPDATE, MESSAGE\r\n')
        inviteRaw.push('Content-Type: application/sdp\r\n')
        inviteRaw.push('Accept: application/sdp, application/dtmf-relay\r\n')
        inviteRaw.push('User-Agent: Grandstream GXP2200 1.0.3.27\r\n')
        const inviteSdp = joinSipBody([
            'v=0\r\n',
            'o=' + from + ' 8000 8000 IN IP4 ' + rcinfo.srcIp + '\r\n',
            's=SIP Call\r\n',
            'c=IN IP4 ' + rcinfo.srcIp + '\r\n',
            't=0 0\r\n',
            'm=audio ' + mediaInfo.srcPort + ' RTP/AVP 0 8 9 18 101\r\n',
            'a=sendrecv\r\n',
            'a=rtpmap:0 PCMU/8000\r\n',
            'a=ptime:20\r\n',
            'a=rtpmap:8 PCMA/8000\r\n',
            'a=rtpmap:9 G722/8000\r\n',
            'a=rtpmap:18 G729/8000\r\n',
            'a=fmtp:18 annexb=no\r\n',
            'a=rtpmap:101 telephone-event/8000\r\n',
            'a=fmtp:101 0-15\r\n',
        ]);
        inviteRaw.push('Content-Length: ' + Buffer.byteLength(inviteSdp) + '\r\n')
        inviteRaw.push('\r\n')
        inviteRaw.push(inviteSdp)

        // @ts-ignore
        return hepJs.encapsulate(inviteRaw.join(''), rcinfo)
    },
    /**
     * @param {number} seq
     * @param {string} from
     * @param {string} to
     * @param {string} callid
     * @param {RCINFO} rcinfo
     * @param {MEDIAINFO} [mediaInfo]
     * @param {DIALOG} [dialog]
     * @returns {Buffer}
     */
    generate407: function (seq, from, to, callid, rcinfo, mediaInfo, dialog) {
        dialog = resolveDialog(dialog);
        rcinfo = Object.assign({}, rcinfo)
        let viaHost = rcinfo.srcIp
        let viaPort = rcinfo.srcPort
        let fromHost = rcinfo.srcIp
        let fromPort = rcinfo.srcPort
        let toHost = rcinfo.dstIp
        let toPort = rcinfo.dstPort
        let src = rcinfo.srcIp
        let dst = rcinfo.dstIp
        let sport = rcinfo.srcPort
        let dport = rcinfo.dstPort
        rcinfo.dstIp = src
        rcinfo.srcIp = dst
        rcinfo.dstPort = sport
        rcinfo.srcPort = dport
        rcinfo = stampRcinfoTime(rcinfo)

        let raw407 = []
        raw407.push('SIP/2.0 407 Proxy Authentication Required\r\n')
        raw407.push('Via: SIP/2.0/UDP ' + viaHost + ':' + viaPort + ';branch=' + dialog.inviteBranch + '\r\n')
        raw407.push('From: <sip:' + from + '@' + fromHost + ':' + fromPort + '>;tag=' + dialog.fromTag + '\r\n')
        raw407.push('To: <sip:' + to + '@' + toHost + ':' + toPort + '>;tag=' + dialog.toTag + '\r\n')
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

        // @ts-ignore
        return hepJs.encapsulate(raw407.join(''), rcinfo)
    },
    /**
     * @param {number} seq
     * @param {string} from
     * @param {string} to
     * @param {string} callid
     * @param {RCINFO} rcinfo
     * @param {MEDIAINFO} [mediaInfo]
     * @param {DIALOG} [dialog]
     * @returns {Buffer}
     */
    generateAck407: function (seq, from, to, callid, rcinfo, mediaInfo, dialog) {
        dialog = resolveDialog(dialog);
        rcinfo = Object.assign({}, rcinfo)
        rcinfo = stampRcinfoTime(rcinfo)

        let rawAck407 = []
        rawAck407.push('ACK sip:' + to + '@' + rcinfo.dstIp + ';transport=UDP SIP/2.0\r\n')
        rawAck407.push('Via: SIP/2.0/UDP ' + rcinfo.srcIp + ':' + rcinfo.srcPort + ';branch=' + dialog.inviteBranch + '\r\n')
        rawAck407.push('Max-Forwards: 70\r\n')
        rawAck407.push('From: <sip:' + from + '@' + rcinfo.srcIp + ':' + rcinfo.srcPort + '>;tag=' + dialog.fromTag + '\r\n')
        rawAck407.push('To: <sip:' + to + '@' + rcinfo.dstIp + ':' + rcinfo.dstPort + '>;tag=' + dialog.toTag + '\r\n')
        rawAck407.push('Call-ID: ' + callid + '\r\n')
        rawAck407.push('CSeq: ' + seq + ' ACK\r\n')
        rawAck407.push('Content-Length: 0\r\n')
        rawAck407.push('\r\n\r\n')

        // @ts-ignore
        return hepJs.encapsulate(rawAck407.join(''), rcinfo)
    },
    /**
     * @param {number} seq
     * @param {string} from
     * @param {string} to
     * @param {string} callid
     * @param {RCINFO} rcinfo
     * @param {MEDIAINFO} mediaInfo
     * @param {DIALOG} [dialog]
     * @returns {Buffer}
     */
    generateInviteAuth: function (seq, from, to, callid, rcinfo, mediaInfo, dialog) {
        dialog = resolveDialog(dialog);
        rcinfo = Object.assign({}, rcinfo)
        rcinfo = stampRcinfoTime(rcinfo)
        let inviteRaw = []
        inviteRaw.push('INVITE sip:' + to + '@' + rcinfo.dstIp + ':' + rcinfo.dstPort + ' SIP/2.0\r\n')
        inviteRaw.push('Via: SIP/2.0/UDP ' + rcinfo.srcIp + ':' + rcinfo.srcPort + ';branch=' + dialog.inviteBranch + '\r\n')
        inviteRaw.push('From: <sip:' + from + '@' + rcinfo.srcIp + ':' + rcinfo.srcPort + '>;tag=' + dialog.fromTag + '\r\n')
        inviteRaw.push('To: <sip:' + to + '@' + rcinfo.dstIp + ':' + rcinfo.dstPort + '>\r\n')
        inviteRaw.push('Call-ID: ' + callid + '\r\n')
        inviteRaw.push('CSeq: ' + seq + ' INVITE\r\n')
        inviteRaw.push('Contact: <sip:' + from + '@' + rcinfo.srcIp + ':' + rcinfo.srcPort + '>\r\n')
        inviteRaw.push('Max-Forwards: 70\r\n')
        if (rcinfo?.correlation_id && rcinfo.correlation_id !== callid) {
            inviteRaw.push('X-CID: ' + rcinfo.correlation_id + '\r\n')
        }
        inviteRaw.push('Supported: replaces, path, timer, eventlist\r\n')
        inviteRaw.push('Allow: INVITE, ACK, OPTIONS, CANCEL, BYE, SUBSCRIBE, NOTIFY, INFO, REFER, UPDATE, MESSAGE\r\n')
        inviteRaw.push('Content-Type: application/sdp\r\n')
        inviteRaw.push('Accept: application/sdp, application/dtmf-relay\r\n')
        inviteRaw.push('Proxy-Authorization: Digest username="' + from + '",realm="sip.botauro.com",nonce="' + utils.generateRandomString(32) + '",uri="sip:' + to + '@' + rcinfo.dstIp + ';transport=TCP",response="' + utils.generateRandomString(32) + '",cnonce="' + utils.generateRandomString(32) + '",nc=00000001,qop=auth,algorithm=MD5"\r\n')
        inviteRaw.push('User-Agent: Grandstream GXP2200 1.0.3.27\r\n')
        const inviteAuthSdp = joinSipBody([
            'v=0\r\n',
            'o=' + from + ' 8000 8000 IN IP4 ' + rcinfo.srcIp + '\r\n',
            's=SIP Call\r\n',
            'c=IN IP4 ' + rcinfo.srcIp + '\r\n',
            't=0 0\r\n',
            'm=audio ' + mediaInfo.srcPort + ' RTP/AVP 0 8 9 18 101\r\n',
            'a=sendrecv\r\n',
            'a=rtpmap:0 PCMU/8000\r\n',
            'a=ptime:20\r\n',
            'a=rtpmap:8 PCMA/8000\r\n',
            'a=rtpmap:9 G722/8000\r\n',
            'a=rtpmap:18 G729/8000\r\n',
            'a=fmtp:18 annexb=no\r\n',
            'a=rtpmap:101 telephone-event/8000\r\n',
            'a=fmtp:101 0-15\r\n',
        ]);
        inviteRaw.push('Content-Length: ' + Buffer.byteLength(inviteAuthSdp) + '\r\n')
        inviteRaw.push('\r\n')
        inviteRaw.push(inviteAuthSdp)

        // @ts-ignore
        return hepJs.encapsulate(inviteRaw.join(''), rcinfo)
    },
    /**
     * @param {number} seq
     * @param {string} from
     * @param {string} to
     * @param {string} callid
     * @param {RCINFO} rcinfo
     * @param {MEDIAINFO} [mediaInfo]
     * @param {DIALOG} [dialog]
     * @returns {Buffer}
     */
    generate100Trying: function (seq, from, to, callid, rcinfo, mediaInfo, dialog) {
        dialog = resolveDialog(dialog);
        rcinfo = Object.assign({}, rcinfo)
        let viaHost = rcinfo.srcIp
        let viaPort = rcinfo.srcPort
        let fromHost = rcinfo.srcIp
        let fromPort = rcinfo.srcPort
        let toHost = rcinfo.dstIp
        let toPort = rcinfo.dstPort
        let src = rcinfo.srcIp
        let dst = rcinfo.dstIp
        let sport = rcinfo.srcPort
        let dport = rcinfo.dstPort
        rcinfo.dstIp = src
        rcinfo.srcIp = dst
        rcinfo.dstPort = sport
        rcinfo.srcPort = dport
        rcinfo = stampRcinfoTime(rcinfo)

        let raw100Trying = []
        raw100Trying.push('SIP/2.0 100 Trying\r\n')
        raw100Trying.push('Via: SIP/2.0/UDP ' + viaHost + ':' + viaPort + ';branch=' + dialog.inviteBranch + '\r\n')
        raw100Trying.push('From: <sip:' + from + '@' + fromHost + ':' + fromPort + '>;tag=' + dialog.fromTag + '\r\n')
        raw100Trying.push('To: <sip:' + to + '@' + toHost + ':' + toPort + '>\r\n')
        raw100Trying.push('Call-ID: ' + callid + '\r\n')
        raw100Trying.push('CSeq: ' + seq + ' INVITE\r\n')
        raw100Trying.push('User-Agent: Grandstream GXP2200 1.0.3.27\r\n')
        raw100Trying.push('Content-Length: 0\r\n')
        raw100Trying.push('\r\n\r\n')

        // @ts-ignore
        return hepJs.encapsulate(raw100Trying.join(''), rcinfo)
    },
    /**
     * @param {number} seq
     * @param {string} from
     * @param {string} to
     * @param {string} callid
     * @param {RCINFO} rcinfo
     * @param {MEDIAINFO} [mediaInfo]
     * @param {DIALOG} [dialog]
     * @returns {Buffer}
     */
    generate180Ringing: function (seq, from, to, callid, rcinfo, mediaInfo, dialog) {
        dialog = resolveDialog(dialog);
        rcinfo = Object.assign({}, rcinfo)
        let viaHost = rcinfo.srcIp
        let viaPort = rcinfo.srcPort
        let fromHost = rcinfo.srcIp
        let fromPort = rcinfo.srcPort
        let toHost = rcinfo.dstIp
        let toPort = rcinfo.dstPort
        let src = rcinfo.srcIp
        let dst = rcinfo.dstIp
        let sport = rcinfo.srcPort
        let dport = rcinfo.dstPort
        rcinfo.dstIp = src
        rcinfo.srcIp = dst
        rcinfo.dstPort = sport
        rcinfo.srcPort = dport
        rcinfo = stampRcinfoTime(rcinfo)

        let raw180Ringing = []
        raw180Ringing.push('SIP/2.0 180 Ringing\r\n')
        raw180Ringing.push('Via: SIP/2.0/UDP ' + viaHost + ':' + viaPort + ';branch=' + dialog.inviteBranch + '\r\n')
        raw180Ringing.push('From: <sip:' + from + '@' + fromHost + ':' + fromPort + '>;tag=' + dialog.fromTag + '\r\n')
        raw180Ringing.push('To: <sip:' + to + '@' + toHost + ':' + toPort + '>;tag=' + dialog.toTag + '\r\n')
        raw180Ringing.push('Call-ID: ' + callid + '\r\n')
        raw180Ringing.push('CSeq: ' + seq + ' INVITE\r\n')
        raw180Ringing.push('Contact: <sip:' + to + '@' + toHost + ':' + toPort + '>\r\n')
        raw180Ringing.push('Supported: replaces, path, timer, eventlist\r\n')
        raw180Ringing.push('User-Agent: Grandstream GXP2200 1.0.3.27\r\n')
        raw180Ringing.push('Allow-Events: talk, hold\r\n')
        raw180Ringing.push('Allow: INVITE, ACK, OPTIONS, CANCEL, BYE, SUBSCRIBE, NOTIFY, INFO, REFER, UPDATE, MESSAGE\r\n')
        raw180Ringing.push('Content-Length: 0\r\n')
        raw180Ringing.push('\r\n\r\n')

        // @ts-ignore
        return hepJs.encapsulate(raw180Ringing.join(''), rcinfo)
    },
    /**
     * @param {number} seq
     * @param {string} from
     * @param {string} to
     * @param {string} callid
     * @param {RCINFO} rcinfo
     * @param {MEDIAINFO} mediaInfo
     * @param {DIALOG} [dialog]
     * @returns {Buffer}
     */
    generate200OKInvite: function (seq, from, to, callid, rcinfo, mediaInfo, dialog) {
        dialog = resolveDialog(dialog);
        rcinfo = Object.assign({}, rcinfo)
        let viaHost = rcinfo.srcIp
        let viaPort = rcinfo.srcPort
        let fromHost = rcinfo.srcIp
        let fromPort = rcinfo.srcPort
        let toHost = rcinfo.dstIp
        let toPort = rcinfo.dstPort
        let src = rcinfo.srcIp
        let dst = rcinfo.dstIp
        let sport = rcinfo.srcPort
        let dport = rcinfo.dstPort
        rcinfo.dstIp = src
        rcinfo.srcIp = dst
        rcinfo.dstPort = sport
        rcinfo.srcPort = dport
        rcinfo = stampRcinfoTime(rcinfo)

        let raw200OK = []
        raw200OK.push('SIP/2.0 200 OK\r\n')
        raw200OK.push('Via: SIP/2.0/UDP ' + viaHost + ':' + viaPort + ';branch=' + dialog.inviteBranch + '\r\n')
        raw200OK.push('From: <sip:' + from + '@' + fromHost + ':' + fromPort + '>;tag=' + dialog.fromTag + '\r\n')
        raw200OK.push('To: <sip:' + to + '@' + toHost + ':' + toPort + '>;tag=' + dialog.toTag + '\r\n')
        raw200OK.push('Call-ID: ' + callid + '\r\n')
        raw200OK.push('CSeq: ' + seq + ' INVITE\r\n')
        raw200OK.push('User-Agent: SBC\r\n')
        raw200OK.push('Allow: INVITE, ACK, CANCEL, OPTIONS, BYE, REFER, SUBSCRIBE, NOTIFY\r\n')
        raw200OK.push('Supported: replaces\r\n')
        raw200OK.push('Contact: <sip:' + to + '@' + toHost + ':' + toPort + '>\r\n')
        raw200OK.push('Content-Type: application/sdp\r\n')
        const okSdp = joinSipBody([
            'v=0\r\n',
            'o=root 11882 11882 IN IP4 ' + toHost + '\r\n',
            's=session\r\n',
            'c=IN IP4 ' + toHost + '\r\n',
            't=0 0\r\n',
            'm=audio ' + mediaInfo.dstPort + ' RTP/AVP 8 0 18 101\r\n',
            'a=rtpmap:8 PCMA/8000\r\n',
            'a=rtpmap:0 PCMU/8000\r\n',
            'a=rtpmap:18 G729/8000\r\n',
            'a=fmtp:18 annexb=no\r\n',
            'a=rtpmap:101 telephone-event/8000\r\n',
            'a=fmtp:101 0-16\r\n',
            'a=silenceSupp:off - - - -\r\n',
            'a=ptime:20\r\n',
            'a=sendrecv\r\n',
        ]);
        raw200OK.push('Content-Length: ' + Buffer.byteLength(okSdp) + '\r\n')
        raw200OK.push('\r\n')
        raw200OK.push(okSdp)

        // @ts-ignore
        return hepJs.encapsulate(raw200OK.join(''), rcinfo)
    },
    /**
     * @param {number} seq
     * @param {string} from
     * @param {string} to
     * @param {string} callid
     * @param {RCINFO} rcinfo
     * @param {MEDIAINFO} [mediaInfo]
     * @param {DIALOG} [dialog]
     * @returns {Buffer}
     */
    generate403: function (seq, from, to, callid, rcinfo, mediaInfo, dialog) {
        dialog = resolveDialog(dialog);
        rcinfo = Object.assign({}, rcinfo)
        let viaHost = rcinfo.srcIp
        let viaPort = rcinfo.srcPort
        let fromHost = rcinfo.srcIp
        let fromPort = rcinfo.srcPort
        let toHost = rcinfo.dstIp
        let toPort = rcinfo.dstPort
        let src = rcinfo.srcIp
        let dst = rcinfo.dstIp
        let sport = rcinfo.srcPort
        let dport = rcinfo.dstPort
        rcinfo.dstIp = src
        rcinfo.srcIp = dst
        rcinfo.dstPort = sport
        rcinfo.srcPort = dport
        rcinfo = stampRcinfoTime(rcinfo)

        let raw403 = []
        raw403.push('SIP/2.0 403 Forbidden\r\n')
        raw403.push('Via: SIP/2.0/UDP ' + viaHost + ':' + viaPort + ';branch=' + dialog.inviteBranch + '\r\n')
        raw403.push('From: <sip:' + from + '@' + fromHost + ':' + fromPort + '>;tag=' + dialog.fromTag + '\r\n')
        raw403.push('To: <sip:' + to + '@' + toHost + ':' + toPort + '>;tag=' + dialog.toTag + '\r\n')
        raw403.push('Call-ID: ' + callid + '\r\n')
        raw403.push('CSeq: ' + seq + ' INVITE\r\n')
        raw403.push('User-Agent: Grandstream GXP2200\r\n')
        raw403.push('Accept: application/sdp\r\n')
        raw403.push('Allow: INVITE, ACK, BYE, CANCEL, OPTIONS, MESSAGE, INFO, UPDATE, REGISTER, REFER, NOTIFY, PUBLISH, SUBSCRIBE\r\n')
        raw403.push('Supported: timer, path, replaces\r\n')
        raw403.push('Allow-Events: talk, hold, conference, presence, as-feature-event, dialog, line-seize, call-info, sla, include-session-description, presence.winfo, message-summary, refer\r\n')
        raw403.push('Content-Length: 0\r\n')
        raw403.push('\r\n\r\n')

        // @ts-ignore
        return hepJs.encapsulate(raw403.join(''), rcinfo)
    },
    /**
     * @param {number} seq
     * @param {string} from
     * @param {string} to
     * @param {string} callid
     * @param {RCINFO} rcinfo
     * @param {MEDIAINFO} [mediaInfo]
     * @param {DIALOG} [dialog]
     * @returns {Buffer}
     */
    generate200OKAck: function (seq, from, to, callid, rcinfo, mediaInfo, dialog) {
        dialog = resolveDialog(dialog);
        rcinfo = Object.assign({}, rcinfo)
        rcinfo = stampRcinfoTime(rcinfo)

        let raw200OKAck = []
        raw200OKAck.push('ACK sip:' + to + '@' + rcinfo.dstIp + ':' + rcinfo.dstPort + ' SIP/2.0\r\n')
        raw200OKAck.push('Via: SIP/2.0/UDP ' + rcinfo.srcIp + ':' + rcinfo.srcPort + ';branch=' + utils.generateRandomBranch() + '\r\n')
        raw200OKAck.push('From: <sip:' + from + '@' + rcinfo.srcIp + ':' + rcinfo.srcPort + '>;tag=' + dialog.fromTag + '\r\n')
        raw200OKAck.push('To: <sip:' + to + '@' + rcinfo.dstIp + ':' + rcinfo.dstPort + '>;tag=' + dialog.toTag + '\r\n')
        raw200OKAck.push('Call-ID: ' + callid + '\r\n')
        raw200OKAck.push('CSeq: ' + seq + ' ACK\r\n')
        raw200OKAck.push('Max-Forwards: 70\r\n')
        raw200OKAck.push('Content-Length: 0\r\n')
        raw200OKAck.push('\r\n\r\n')

        // @ts-ignore
        return hepJs.encapsulate(raw200OKAck.join(''), rcinfo)
    },
    /**
     * @param {number} seq
     * @param {string} from
     * @param {string} to
     * @param {string} callid
     * @param {RCINFO} rcinfo
     * @param {MEDIAINFO} mediaInfo
     * @param {boolean} reverse
     * @returns {Buffer}
     */
    // @ts-ignore
    generatePeriodicReport: function (seq, from, to, callid, rcinfo, mediaInfo, reverse) {
        let rcinfoRaw = Object.assign({}, rcinfo)
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
        const correlation = mediaCorrelationId(rcinfoRaw, callid)
        rcinfoRaw.direction = dir
        rcinfoRaw.srcPort = sport
        rcinfoRaw.dstPort = dport
        rcinfoRaw.srcIp = src
        rcinfoRaw.dstIp = dst
        rcinfoRaw.proto_type = 34
        rcinfoRaw.correlation_id = correlation
        rcinfoRaw.mos = mediaInfo.mean_mos * 100
        rcinfoRaw = stampRcinfoTime(rcinfoRaw)

        let rawShortReport = `{"CORRELATION_ID":"${correlation}","RTP_SIP_CALL_ID":"${callid}","DELTA":${utils.getRandomFloat(0.001, 0.098)},"JITTER":${mediaInfo.jitter},"REPORT_TS":${new Date().getTime()*1000},"TL_BYTE":${mediaInfo.tl_bytes},"TOTAL_PK":${mediaInfo.total_packets},"EXPECTED_PK":${mediaInfo.total_packets + mediaInfo.packetloss},"PACKET_LOSS":${mediaInfo.packetloss},"SEQ":0,"MAX_JITTER":${mediaInfo.max_jitter},"MAX_DELTA":${utils.getRandomInteger(200, 2100)},"MAX_SKEW":0.172,"MEAN_JITTER":${mediaInfo.mean_jitter},"MIN_MOS":${mediaInfo.min_mos},"MEAN_MOS":${mediaInfo.mean_mos},"MOS":${mediaInfo.mos},"RFACTOR":80.200,"MIN_RFACTOR":80.200,"MEAN_RFACTOR":80.200,"SRC_IP":"${src}","SRC_PORT":${sport},"DST_IP":"${dst}","DST_PORT":${dport},"SRC_MAC":"00-30-48-7E-5D-C6","DST_MAC":"00-12-80-D7-38-5E","OUT_ORDER":0,"SSRC":"0xf1c6261","SSRC_CHG":0,"CODEC_PT":9,"CLOCK":8000,"CODEC_NAME":"G722","CODEC_CHANNEL":1,"DIR":0,"ONE_WAY_RTP":0,"REPORT_NAME":"${src}-${sport}","PARTY":${dir},"STYPE":"hepagent-rtp-1.1.133","TYPE":"PERIODIC","REPORT_START":${mediaInfo.lastReport},"REPORT_END":${Math.floor(Date.now() / 1000)},"SOURCE":"RTP"}`

        // @ts-ignore
        return hepJs.encapsulate(rawShortReport, rcinfoRaw)
    },
    /**
     * @param {number} seq
     * @param {string} from
     * @param {string} to
     * @param {string} callid
     * @param {RCINFO} rcinfo
     * @param {MEDIAINFO} mediaInfo
     * @param {boolean} reverse
     * @returns {Buffer}
     */
    // @ts-ignore
    generatePeriodicReportRTCP: function (seq, from, to, callid, rcinfo, mediaInfo, reverse) {
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
        const correlation = mediaCorrelationId(rcinfoRaw, callid)
        rcinfoRaw.direction = dir
        rcinfoRaw.srcPort = sport
        rcinfoRaw.dstPort = dport
        rcinfoRaw.srcIp = src
        rcinfoRaw.dstIp = dst
        rcinfoRaw.proto_type = 36
        rcinfoRaw.correlation_id = correlation
        rcinfoRaw.mos = mediaInfo.mean_mos * 100
        rcinfoRaw = stampRcinfoTime(rcinfoRaw)

        let rawShortReport = `{"CORRELATION_ID":"${correlation}","RTP_SIP_CALL_ID":"${callid}","SR_DELAY":${utils.getRandomInteger(40000, 60000)},"INTERARRIVAL_JITTER":${mediaInfo.jitter},"REPORT_TS":${new Date().getTime()*1000},"PACKET_COUNT":${mediaInfo.total_packets},"TOTAL_RTCP_PK":${utils.getRandomInteger(8, 20)},"CUM_PACKET_LOSS":${mediaInfo.packetloss},"PERCENTAGE_LOSS":${utils.getRandomFloat(0.0,2.0)},"MAX_INTERARRIVAL_JITTER":${mediaInfo.max_jitter},"MAX_SR_DELAY":${utils.getRandomInteger(200, 2100)},"MAX_PERCENTAGE_LOSS":0.172,"MEAN_PERCENTAGE_LOSS":0.172,"MEAN_INTERARRIVAL_JITTER":${mediaInfo.mean_jitter},"MIN_MOS":${mediaInfo.min_mos},"MEAN_MOS":${mediaInfo.mean_mos},"MOS":${mediaInfo.mos},"RFACTOR":80.200,"MIN_RFACTOR":80.200,"MEAN_RFACTOR":80.200,"SRC_IP":"${src}","SRC_PORT":${sport},"DST_IP":"${dst}","DST_PORT":${dport},"OCTET_COUNT":0,"SSRC_CHG":0,"PKT_TYPE_REPORT":[0,201,0],"HIGH_EXT_SEQ":"23957","SSRC":"0xf1c6261","DIR":${dir},"REPORT_NAME":"${src}-${sport}","PARTY":${dir},"IP_QOS":0,"INFO_VLAN":0,"VIDEO":0,"REPORT_START":${mediaInfo.lastReport},"REPORT_END":${Math.floor(Date.now() / 1000)},"TYPE":"PERIODIC","STYPE":"hepagent-rtp-1.1.133","SOURCE":"RTCP"}`

        return hepJs.encapsulate(rawShortReport, rcinfoRaw)
    },
    /**
     * @param {number} seq
     * @param {string} from
     * @param {string} to
     * @param {string} callid
     * @param {RCINFO} rcinfo
     * @param {MEDIAINFO} mediaInfo
     * @param {boolean} reverse
     * @returns {Buffer}
     */
    // @ts-ignore
    generateHangupReport: function (seq, from, to, callid, rcinfo, mediaInfo, reverse) {
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
        const correlation = mediaCorrelationId(rcinfoRaw, callid)
        rcinfoRaw.direction = dir
        rcinfoRaw.srcPort = sport
        rcinfoRaw.dstPort = dport
        rcinfoRaw.srcIp = src
        rcinfoRaw.dstIp = dst
        rcinfoRaw.proto_type = 34
        rcinfoRaw.correlation_id = correlation
        rcinfoRaw.mos = mediaInfo.mean_mos * 100
        rcinfoRaw = stampRcinfoTime(rcinfoRaw)
        let rawHangupReport = `{"CORRELATION_ID":"${correlation}","RTP_SIP_CALL_ID":"${callid}","DELTA":${utils.getRandomFloat(10.0,36.0)},"REPORT_TS":${new Date().getTime() * 1000},"TL_BYTE":${mediaInfo.tl_bytes},"TOTAL_PK":${mediaInfo.total_packets},"EXPECTED_PK":${mediaInfo.total_packets + mediaInfo.packetloss},"PACKET_LOSS":${mediaInfo.packetloss},"SEQ":0,"MAX_JITTER":${mediaInfo.max_jitter},"MAX_DELTA":${utils.getRandomInteger(30000, 50000)},"MAX_SKEW":26.510,"MEAN_JITTER":${mediaInfo.mean_jitter},"MIN_MOS":${mediaInfo.min_mos},"MEAN_MOS":${mediaInfo.mean_mos},"MOS":${mediaInfo.mos},"RFACTOR":${mediaInfo.mean_rfactor},"MIN_RFACTOR":93.200,"MEAN_RFACTOR":${mediaInfo.mean_rfactor},"SRC_IP":"${src}","SRC_PORT":${sport}, "DST_IP":"${dst}","DST_PORT":${dport},"OUT_ORDER":0,"SSRC":"0x32fa14ff","SSRC_CHG":0,"CODEC_PT":9,"CLOCK":8000,"CODEC_NAME":"G722","CODEC_CHANNEL":1,"DIR":${dir},"ONE_WAY_RTP":0,"REPORT_NAME":"${src}-${sport}","PARTY":${dir},"STYPE":"HEPAGENT-RTP-1.1.133","TYPE":"HANGUP","REPORT_START":${mediaInfo.lastReport},"REPORT_END":${Math.floor( Date.now() / 1000)}}`

        return hepJs.encapsulate(rawHangupReport, rcinfoRaw)
    },
    /**
     * @param {number} seq
     * @param {string} from
     * @param {string} to
     * @param {string} callid
     * @param {RCINFO} rcinfo
     * @param {MEDIAINFO} mediaInfo
     * @param {boolean} reverse
     * @returns {Buffer}
     */
    // @ts-ignore
    generateHangupReportRTCP: function (seq, from, to, callid, rcinfo, mediaInfo, reverse) {
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
        const correlation = mediaCorrelationId(rcinfoRaw, callid)
        rcinfoRaw.direction = dir
        rcinfoRaw.srcPort = sport
        rcinfoRaw.dstPort = dport
        rcinfoRaw.srcIp = src
        rcinfoRaw.dstIp = dst
        rcinfoRaw.proto_type = 36
        rcinfoRaw.correlation_id = correlation
        rcinfoRaw.mos = mediaInfo.mean_mos * 100
        rcinfoRaw = stampRcinfoTime(rcinfoRaw)
        let rawHangupReport = `{"CORRELATION_ID":"${correlation}","RTP_SIP_CALL_ID":"${callid}","SR_DELAY":0,"INTERARRIVAL_JITTER":${mediaInfo.jitter},"REPORT_TS":${new Date().getTime() * 1000},"PACKET_COUNT":${mediaInfo.total_packets},"TOTAL_RTCP_PK":${utils.getRandomInteger(10, 60)},"CUM_PACKET_LOSS":${mediaInfo.packetloss},"PERCENTAGE_LOSS":0,"MAX_INTERARRIVAL_JITTER":${mediaInfo.max_jitter},"MAX_SR_DELAY":${utils.getRandomInteger(30000, 50000)},"MAX_PERCENTAGE_LOSS":0,"MEAN_PERCENTAGE_LOSS":0,"MEAN_INTERARRIVAL_JITTER":${mediaInfo.mean_jitter},"MIN_MOS":${mediaInfo.min_mos},"MEAN_MOS":${mediaInfo.mean_mos},"MOS":${mediaInfo.mos},"RFACTOR":${mediaInfo.mean_rfactor},"MIN_RFACTOR":93.200,"MEAN_RFACTOR":${mediaInfo.mean_rfactor},"SRC_IP":"${src}","SRC_PORT":${sport},"DST_IP":"${dst}","DST_PORT":${dport},"OCTET_COUNT":0,"SSRC_CHG":0,"PKT_TYPE_REPORT":[200,0,0],"HIGH_EXT_SEQ":32580,"SSRC":"0x32fa14ff","DIR":${dir},"REPORT_NAME":"${src}-${sport}","PARTY":${dir},"IP_QOS":0,"INFO_VLAN":0,"VIDEO":0,"REPORT_START":${mediaInfo.lastReport},"REPORT_END":${Math.floor( Date.now() / 1000)},"TYPE":"HANGUP","STYPE":"HEPAGENT-RTP-1.1.133","SOURCE":"RTCP"}`

        return hepJs.encapsulate(rawHangupReport, rcinfoRaw)
    },
    /**
     * @param {number} seq
     * @param {string} from
     * @param {string} to
     * @param {string} callid
     * @param {RCINFO} rcinfo
     * @param {MEDIAINFO} mediaInfo
     * @param {boolean} reverse
     * @returns {Buffer}
     */
    // @ts-ignore
    generateShortHangupReport: function (seq, from, to, callid, rcinfo, mediaInfo, reverse) {
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
        const correlation = mediaCorrelationId(rcinfoRaw, callid)
        rcinfoRaw.direction = dir
        rcinfoRaw.srcPort = sport
        rcinfoRaw.dstPort = dport
        rcinfoRaw.srcIp = src
        rcinfoRaw.dstIp = dst
        rcinfoRaw.proto_type = 35
        rcinfoRaw.correlation_id = correlation
        rcinfoRaw.mos = mediaInfo.mean_mos * 100
        rcinfoRaw = stampRcinfoTime(rcinfoRaw)
        let rawHangupReport = `{"CORRELATION_ID":"${correlation}","RTP_SIP_CALL_ID":"${callid}","PACKET_LOSS":${mediaInfo.global_packetloss},"EXPECTED_PK":${mediaInfo.global_packets + mediaInfo.packetloss},"CODEC_PT":9,"CODEC_NAME":"G722","CODEC_RATE":8000,"MEAN_JITTER":${mediaInfo.mean_jitter},"MOS":${mediaInfo.mean_mos},"RFACTOR":${mediaInfo.mean_rfactor},"DIR":${dir},"ONE_WAY_RTP":0,"REPORT_NAME":"${src}:${sport}","PARTY":${dir},"TYPE":"HANGUP"}`

        return hepJs.encapsulate(rawHangupReport, rcinfoRaw)
    },
    /**
     * @param {number} seq
     * @param {string} from
     * @param {string} to
     * @param {string} callid
     * @param {RCINFO} rcinfo
     * @param {MEDIAINFO} mediaInfo
     * @param {boolean} reverse
     * @returns {Buffer}
     */
    // @ts-ignore
    generateFinalReport: function (seq, from, to, callid, rcinfo, mediaInfo, reverse) {
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
        const correlation = mediaCorrelationId(rcinfoRaw, callid)
        rcinfoRaw.direction = dir
        rcinfoRaw.srcPort = sport
        rcinfoRaw.dstPort = dport
        rcinfoRaw.srcIp = src
        rcinfoRaw.dstIp = dst
        rcinfoRaw.proto_type = 34
        rcinfoRaw.correlation_id = correlation
        rcinfoRaw.mos = mediaInfo.mean_mos * 100
        rcinfoRaw = stampRcinfoTime(rcinfoRaw)
        let rawFinalReport = `{"CORRELATION_ID":"${correlation}", "RTP_SIP_CALL_ID":"${callid}","MIN_MOS":4.409, "MIN_RFACTOR":93.200, "MIN_SKEW": 0, "MIN_JITTER":0, "MAX_MOS": 4.409, "MAX_RFACTOR":93.200, "MAX_SKEW":0, "MAX_JITTER":4.409, "MEAN_MOS":${mediaInfo.mean_mos}, "MEAN_RFACTOR":${mediaInfo.mean_rfactor}, "MEAN_JITTER":${mediaInfo.mean_jitter}, "TOTAL_PACKET_LOSS":${mediaInfo.packetloss},"TOTAL_PACKETS":5000,"DIR":${dir},"REPORT_NAME":"${src}","PARTY":${dir}, "ONE_WAY_RTP": 0, "TYPE":"FINAL"}`

        return hepJs.encapsulate(rawFinalReport, rcinfoRaw)
    },
    /**
     * @param {number} seq
     * @param {string} from
     * @param {string} to
     * @param {string} callid
     * @param {RCINFO} rcinfo
     * @param {MEDIAINFO} [mediaInfo]
     * @param {DIALOG} [dialog]
     * @returns {Buffer}
     */
    // @ts-ignore
    generateBye: function (seq, from, to, callid, rcinfo, mediaInfo, dialog) {
        dialog = resolveDialog(dialog);
        rcinfo = Object.assign({}, rcinfo)
        rcinfo = stampRcinfoTime(rcinfo)

        let rawBye = []
        rawBye.push('BYE sip:' + to + '@' + rcinfo.dstIp + ':' + rcinfo.dstPort + ' SIP/2.0\r\n')
        rawBye.push('Via: SIP/2.0/UDP ' + rcinfo.srcIp + ':' + rcinfo.srcPort + ';branch=' + utils.generateRandomBranch() + ';rport\r\n')
        rawBye.push('From: <sip:' + from + '@' + rcinfo.srcIp + ':' + rcinfo.srcPort + '>;tag=' + dialog.fromTag + '\r\n')
        rawBye.push('To: <sip:' + to + '@' + rcinfo.dstIp + ':' + rcinfo.dstPort + '>;tag=' + dialog.toTag + '\r\n')
        rawBye.push('Call-ID: ' + callid + '\r\n')
        rawBye.push('CSeq: ' + (seq + 1) + ' BYE\r\n')
        rawBye.push('Contact: <sip:' + from + '@' + rcinfo.srcIp + ':' + rcinfo.srcPort + '>\r\n')
        rawBye.push('Max-Forwards: 70\r\n')
        rawBye.push('Supported: replaces, path, timer, eventlist\r\n')
        rawBye.push('User-Agent: Grandstream GXP2200 1.0.3.27\r\n')
        rawBye.push('Allow: INVITE, ACK, OPTIONS, CANCEL, BYE, SUBSCRIBE, NOTIFY, INFO, REFER, UPDATE, MESSAGE\r\n')
        rawBye.push('Content-Length: 0\r\n')
        rawBye.push('\r\n\r\n')

        // @ts-ignore
        return hepJs.encapsulate(rawBye.join(''), rcinfo)
    },
    /**
     * @param {number} seq
     * @param {string} from
     * @param {string} to
     * @param {string} callid
     * @param {RCINFO} rcinfo
     * @param {MEDIAINFO} [mediaInfo]
     * @param {DIALOG} [dialog]
     * @returns {Buffer}
     */
    // @ts-ignore
    generate200OKBye: function (seq, from, to, callid, rcinfo, mediaInfo, dialog) {
        dialog = resolveDialog(dialog);
        rcinfo = Object.assign({}, rcinfo)
        let viaHost = rcinfo.srcIp
        let viaPort = rcinfo.srcPort
        let fromHost = rcinfo.srcIp
        let fromPort = rcinfo.srcPort
        let toHost = rcinfo.dstIp
        let toPort = rcinfo.dstPort
        let src = rcinfo.srcIp
        let dst = rcinfo.dstIp
        let sport = rcinfo.srcPort
        let dport = rcinfo.dstPort
        rcinfo.dstIp = src
        rcinfo.srcIp = dst
        rcinfo.dstPort = sport
        rcinfo.srcPort = dport
        rcinfo = stampRcinfoTime(rcinfo)

        let raw200OKBye = []
        raw200OKBye.push('SIP/2.0 200 OK\r\n')
        raw200OKBye.push('Via: SIP/2.0/UDP ' + viaHost + ':' + viaPort + ';branch=' + utils.generateRandomBranch() + ';rport\r\n')
        raw200OKBye.push('From: <sip:' + from + '@' + fromHost + ':' + fromPort + '>;tag=' + dialog.fromTag + '\r\n')
        raw200OKBye.push('To: <sip:' + to + '@' + toHost + ':' + toPort + '>;tag=' + dialog.toTag + '\r\n')
        raw200OKBye.push('Call-ID: ' + callid + '\r\n')
        raw200OKBye.push('CSeq: ' + (seq + 1) + ' BYE\r\n')
        raw200OKBye.push('Server: Application Server\r\n')
        raw200OKBye.push('Content-Length: 0\r\n')
        raw200OKBye.push('\r\n\r\n')

        // @ts-ignore
        return hepJs.encapsulate(raw200OKBye.join(''), rcinfo)
    },
}

export default hepModule;
