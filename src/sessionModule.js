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
        sessionModule.flowMap.set('ACK407', 'generateACK407');
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
                mediaInfo: {mos: 4.409, mean_mos: 4.409, jitter: 1.0, mean_jitter: 1.0, packetloss: 0, mean_rfactor: 90, direction: 0}
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
                mediaInfo: {mos: 3.332, mean_mos: 3.332, jitter: 1.0, mean_jitter: 1.0, packetloss: 0, mean_rfactor: 90, direction: 0}
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
            };
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
                    session.duration = session.duration + 200; // increment duration by 20 ms
                    /* Handle Media */
                    if (session.duration >= session.targetDuration) {
                        return;
                    } else {
                        session.state.unshift('MEDIA');
                        if (session.previous - Date.now() > 30000) { // every 30 seconds
                            /* do Media stuff */
                            let mediaMessage = hepModule.generatePeriodicReport(session.seq, session.from, session.to, session.callid, session.rcinfo, session.mediaInfo);
                            sessionModule.mediator.send({type: "sendData", data: mediaMessage});
                            if (sessionModule.debug) console.log("Generated media message for session", session.callid, ":\n", mediaMessage);
                            session.state.unshift('MEDIA');
                            if (sessionModule.debug) console.log("Current duration for session", session.callid, "is", session.duration, "of target", session.targetDuration);
                            session.previous = Date.now();
                        }
                    }
                } else if (currentState != 'END' && currentState != 'MEDIA') {
                    if (sessionModule.debug) console.log("Session", session.callid, "advancing to state:", currentState, sessionModule.flowMap.get(currentState), currentState != 'END');
                    // if (sessionModule.debug) console.log("Session details:", session);
                    let message = hepModule[sessionModule.flowMap.get(currentState)](session.seq, session.from, session.to, session.callid, session.rcinfo);
                    sessionModule.mediator.send({type: "sendData", data: message});
                    // if (sessionModule.debug) console.log("Generated message for state", currentState, ":\n", message);
                } else if (currentState === 'END') {
                    if (sessionModule.debug) console.log("Session complete:", session.callid);
                    sessionModule.sessions = sessionModule.sessions.filter(s => s.callid !== session.callid);
                }
            });
        }
    },
}

export default sessionModule;