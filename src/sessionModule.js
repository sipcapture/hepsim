import * as utils from './utils.js';
import hepModule from './hepModule.js';


const sessionModule = {
    mediator: {},
    sessions: [],
    stopped: false,
    debug: false,
    flowMap: new Map(),
    initialize: (mediator, configuration) => {
        sessionModule.mediator = mediator;
        sessionModule.mediator.subscribe(sessionModule.receiveInput.bind(sessionModule));
        if (sessionModule.debug) console.log("Session module initialized with configuration:", configuration, sessionModule.mediator);
        /* Initalize flow map */
        sessionModule.flowMap.set('INVITE', 'generateInvite');
        sessionModule.flowMap.set('100Trying', 'generate100Trying');
        sessionModule.flowMap.set('180Ringing', 'generate180Ringing');
        sessionModule.flowMap.set('200OK', 'generate200OKInvite');
        sessionModule.flowMap.set('200OKACK', 'generate200OKAck');
        sessionModule.flowMap.set('MEDIA', 'generateMedia');
        sessionModule.flowMap.set('BYE', 'generateBye');
        sessionModule.flowMap.set('200BYE', 'generate200OKBye');
        sessionModule.flowMap.set('407', 'generate407');
        sessionModule.flowMap.set('ACK407', 'generateAck407');
        sessionModule.flowMap.set('INVITEAUTH', 'generateInviteAuth');
        sessionModule.flowMap.set('403', 'generate403');
    },
    receiveInput: (input) => {
        if (input.type === "newSession") {
            if (!sessionModule.stopped) sessionModule.createSession(input.config);
        } else if (input.type === "stop") {
            sessionModule.stopped = true;
        } else if (input.type === "tick") {
            sessionModule.advanceSessions();
        } else if (input.type === "debugSession") {
            sessionModule.debug = true;
        }
    },
    createSession: (config) => {
        if (sessionModule.debug) console.log("Creating new session with config:", config);
        let session = {};
        if (config.name === "normal") {
            session = {
                callid: utils.getRandomCallId(),
                state: ['INVITE', '100Trying', '180Ringing', '200OK', '200OKACK', 'MEDIA', 'BYE', '200BYE', 'END'],
                seq: utils.getRandomInteger(1000, 9999),
                from: utils.getRandomPhoneNumber(),
                to: utils.getRandomPhoneNumber(),
                targetDuration: Math.floor(Math.random() * (config.max_duration - config.min_duration + 1)) + config.min_duration,
                duration: 0,
                mos_range: config.mos_range || [4.2, 4.4],
                jitter_range: config.jitter_range || [0.8, 1.2],
                packetloss_range: config.packetloss_range || [0, 1],
                mediaInfo: {
                    srcPort: utils.getRandomInteger(4000,10000), 
                    dstPort: utils.getRandomInteger(4000,10000), 
                    mos: 4.409, 
                    mean_mos: 4.409,
                    min_mos: 4.409, 
                    jitter: 1.0, 
                    mean_jitter: 1.0,
                    max_jitter: 1.0,
                    tl_bytes: 0,
                    global_bytes: 0,
                    total_packets: 0,
                    global_packets: 0,
                    packetloss: 0, 
                    global_packetloss: 0,
                    mean_rfactor: 90, 
                    direction: 0
                },
            };
            let sourceIP = utils.pickRandomElement(config.ips);
            if (!session.rcinfo) {
                session.rcinfo = hepModule.generateRCInfo(14520, 'myhep', 1, session.callid, 1, sourceIP, '172.26.25.32', 5060, 5061);
            }
        } else if (config.name === "bad") {
            session = {
                callid: utils.getRandomCallId(),
                state: ['INVITE', '100Trying', '180Ringing', '200OK', '200OKACK', 'MEDIA', 'BYE', '200BYE', 'END'],
                seq: utils.getRandomInteger(1000, 9999),
                from: utils.getRandomPhoneNumber(),
                to: utils.getRandomPhoneNumber(),
                targetDuration: Math.floor(Math.random() * (config.max_duration - config.min_duration + 1)) + config.min_duration,
                duration: 0,
                mos_range: config.mos_range || [2.8, 3.5],
                jitter_range: config.jitter_range || [250, 450],
                packetloss_range: config.packetloss_range || [0, 1],
                mediaInfo: {
                    srcPort: utils.getRandomInteger(4000,10000), 
                    dstPort: utils.getRandomInteger(4000,10000), 
                    mos: 3.342, 
                    mean_mos: 3.342,
                    min_mos: 3.342,
                    jitter: 1.0, 
                    mean_jitter: 1.0, 
                    max_jitter: 1.0,
                    tl_bytes: 0,
                    global_bytes: 0,
                    total_packets: 0,
                    global_packets: 0,
                    packetloss: 0, 
                    global_packetloss: 0,
                    mean_rfactor: 70, 
                    direction: 0
                },
            };
            let sourceIP = utils.pickRandomElement(config.ips);
            if (!session.rcinfo) {
                session.rcinfo = hepModule.generateRCInfo(14620, 'myhep', 1, session.callid, 1, sourceIP, '156.12.33.56', 5060, 5060);
            }
        } else if (config.name === "403") {
            session = {
                callid: utils.getRandomCallId(),
                state: ['INVITE', '407', 'ACK407', 'INVITEAUTH', '403', 'END'],
                seq: utils.getRandomInteger(1000, 9999),
                from: utils.getRandomPhoneNumber(),
                to: utils.getRandomPhoneNumber(),
                targetDuration: Math.floor(Math.random() * (config.max_duration - config.min_duration + 1)) + config.min_duration,
                duration: 0,
                mediaInfo: {
                    srcPort: utils.getRandomInteger(4000,10000), 
                    dstPort: utils.getRandomInteger(4000,10000), 
                },
            };
            let sourceIP = utils.pickRandomElement(config.ips);
            if (!session.rcinfo) {
                session.rcinfo = hepModule.generateRCInfo(14620, 'myhep', 1, session.callid, 1, sourceIP, '156.12.33.56', 5060, 5060);
            }
        } else {
            if (sessionModule.debug) console.log("Unknown session type:", config.name);
            return;
        }
        sessionModule.sessions.push(session);
    },
    advanceSessions: () => {
        console.log("Current Sessions in Progress:", sessionModule.sessions.length);
        if (sessionModule.sessions.length === 0) {
            sessionModule.mediator.send({type: "noSessions"});
        } else if (sessionModule.sessions.length > 0) {
            sessionModule.sessions.forEach((session) => {
                let currentState = session.state.shift();
                if (currentState === 'MEDIA') {
                    if (!session.previous) { 
                        session.previous = Date.now(); 
                        session.mediaInfo.rtpstart = Date.now();
                        session.mediaInfo.lastReport = Math.floor(Date.now() / 1000);
                    }
                    session.duration = session.duration + 200; // increment duration by 20 ms
                    // console.log("checking: ", session.previous, Date.now(), session.previous - Date.now(), session.duration, session.targetDuration);
                    /* Handle Media */
                    if (session.duration >= session.targetDuration) {
                        return;
                    } else {
                        session.state.unshift('MEDIA');
                        if ((Date.now() - session.previous) > 30000) { // every 30 seconds
                            /* Media Updates before Report */
                            let mos = utils.getRandomFloat(session.mos_range[0], session.mos_range[1])
                            let jitter = utils.getRandomFloat(session.jitter_range[0], session.jitter_range[1])
                            let packetloss = utils.getRandomInteger(session.packetloss_range[0], session.packetloss_range[1])
                            session.mediaInfo.mos = mos
                            session.mediaInfo.mean_mos = parseFloat(parseFloat((session.mediaInfo.mean_mos + mos) / 2).toFixed(3))
                            if (mos < session.mediaInfo.min_mos) session.mediaInfo.min_mos = mos
                            session.mediaInfo.jitter = jitter
                            session.mediaInfo.mean_jitter = parseFloat(parseFloat((session.mediaInfo.mean_jitter + jitter) / 2).toFixed(3)) 
                            if (jitter > session.mediaInfo.max_jitter) session.mediaInfo.max_jitter = jitter
                            session.mediaInfo.total_packets += utils.getRandomInteger(400, 550) // assume 1 packet per second
                            session.mediaInfo.global_packets += session.mediaInfo.total_packets
                            session.mediaInfo.tl_bytes += utils.getRandomInteger(32000, 44000) // assume 80 bytes per packet
                            session.mediaInfo.global_bytes += session.mediaInfo.tl_bytes
                            session.mediaInfo.packetloss += packetloss
                            session.mediaInfo.global_packetloss += packetloss
                            /* Produce and send Reports */
                            let mediaMessage = hepModule.generatePeriodicReport(session.seq, session.from, session.to, session.callid, session.rcinfo, session.mediaInfo, false);
                            sessionModule.mediator.send({type: "sendData", data: mediaMessage});
                            let mediaMessageReverse = hepModule.generatePeriodicReport(session.seq, session.from, session.to, session.callid, session.rcinfo, session.mediaInfo, true);
                            sessionModule.mediator.send({type: "sendData", data: mediaMessageReverse});
                            let mediaMessageRTCP = hepModule.generatePeriodicReportRTCP(session.seq, session.from, session.to, session.callid, session.rcinfo, session.mediaInfo, false);
                            sessionModule.mediator.send({type: "sendData", data: mediaMessageRTCP});
                            let mediaMessageRTCPReverse = hepModule.generatePeriodicReportRTCP(session.seq, session.from, session.to, session.callid, session.rcinfo, session.mediaInfo, true);
                            sessionModule.mediator.send({type: "sendData", data: mediaMessageRTCPReverse});
                            if (sessionModule.debug) console.log("Generated media message for session", session.callid, ":\n", mediaMessage);
                            if (sessionModule.debug) console.log("Current duration for session", session.callid, "is", session.duration, "of target", session.targetDuration);
                            /* Reset Timer */
                            session.previous = Date.now();
                            session.mediaInfo.lastReport = Math.floor(Date.now() / 1000);
                        }
                    }
                } else if (currentState != 'END' && currentState != 'MEDIA') {
                    if (sessionModule.debug) console.log("Session", session.callid, "advancing to state:", currentState, sessionModule.flowMap.get(currentState), currentState != 'END');
                    // if (sessionModule.debug) console.log("Session details:", session);
                    let message = hepModule[sessionModule.flowMap.get(currentState)](session.seq, session.from, session.to, session.callid, session.rcinfo, session.mediaInfo);
                    sessionModule.mediator.send({type: "sendData", data: message});
                    // if (sessionModule.debug) console.log("Generated message for state", currentState, ":\n", message);
                } else if (currentState === 'END') {
                    let hangupMessage = hepModule.generateHangupReport(session.seq, session.from, session.to, session.callid, session.rcinfo, session.mediaInfo, false);
                    sessionModule.mediator.send({type: "sendData", data: hangupMessage});
                    let hangupMessageReverse = hepModule.generateHangupReport(session.seq, session.from, session.to, session.callid, session.rcinfo, session.mediaInfo, true);
                    sessionModule.mediator.send({type: "sendData", data: hangupMessageReverse});
                    let hangupMessageRTCP = hepModule.generateHangupReportRTCP(session.seq, session.from, session.to, session.callid, session.rcinfo, session.mediaInfo, false);
                    sessionModule.mediator.send({type: "sendData", data: hangupMessageRTCP});
                    let hangupMessageRTCPReverse = hepModule.generateHangupReportRTCP(session.seq, session.from, session.to, session.callid, session.rcinfo, session.mediaInfo, true);
                    sessionModule.mediator.send({type: "sendData", data: hangupMessageRTCPReverse});
                    let finalMessage = hepModule.generateFinalReport(session.seq, session.from, session.to, session.callid, session.rcinfo, session.mediaInfo, false);
                    sessionModule.mediator.send({type: "sendData", data: finalMessage});
                    let finalMessageReverse = hepModule.generateFinalReport(session.seq, session.from, session.to, session.callid, session.rcinfo, session.mediaInfo, true);
                    sessionModule.mediator.send({type: "sendData", data: finalMessageReverse});
                    let shortMessage = hepModule.generateShortHangupReport(session.seq, session.from, session.to, session.callid, session.rcinfo, session.mediaInfo, false);
                    sessionModule.mediator.send({type: "sendData", data: shortMessage});
                    let shortMessageReverse = hepModule.generateShortHangupReport(session.seq, session.from, session.to, session.callid, session.rcinfo, session.mediaInfo, true);
                    sessionModule.mediator.send({type: "sendData", data: shortMessageReverse});
                    if (sessionModule.debug) console.log("Session complete:", session.callid);
                    sessionModule.sessions = sessionModule.sessions.filter(s => s.callid !== session.callid);
                }
            });
        }
    },
}

export default sessionModule;