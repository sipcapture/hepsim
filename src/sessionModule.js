import * as utils from './utils.js';
import hepModule from './hepModule.js';


const sessionModule = {
    mediator: {},
    sessions: [],
    stopped: false,
    flowMap: new Map(),
    initialize: (mediator, configuration) => {
        sessionModule.mediator = mediator;
        sessionModule.mediator.subscribe(sessionModule.receiveInput.bind(sessionModule));
        console.log("Session module initialized with configuration:", configuration, sessionModule.mediator);
        /* Initalize flow map */
        sessionModule.flowMap.set('INVITE', 'generateInvite');
        sessionModule.flowMap.set('100Trying', 'generate100Trying');
        sessionModule.flowMap.set('180Ringing', 'generate180Ringing');
        sessionModule.flowMap.set('200OK', 'generate200OKInvite');
        sessionModule.flowMap.set('200OKACK', 'generate200OKACK');
        sessionModule.flowMap.set('MEDIA', 'generateMedia');
        sessionModule.flowMap.set('BYE', 'generateBYE');
        sessionModule.flowMap.set('200BYE', 'generate200OKBye');
    },
    receiveInput: (input) => {
        if (input.type === "newSession") {
            if (!sessionModule.stopped) sessionModule.createSession(input.config);
        } else if (input.type === "stop") {
            sessionModule.stopped = true;
        } else if (input.type === "tick") {
            sessionModule.advanceSessions();
        }
    },
    createSession: (config) => {
        console.log("Creating new session with config:", config);
        let session = {};
        if (config.name === "normal") {
            session = {
                callid: utils.getRandomCallId(),
                state: ['INVITE', '100Trying', '180Ringing', '200OK', '200OKACK', 'MEDIA', 'BYE', '200BYE', 'END'],
                targetDuration: Math.floor(Math.random() * (config.max_duration - config.min_duration + 1)) + config.min_duration,
                duration: 0,
            };
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
                    /* Handle Media */
                    if (session.duration >= session.targetDuration) {
                        return;
                    } else {
                        /* do Media stuff */
                        session.state.unshift('MEDIA');
                        session.duration = session.duration + 20;
                    }
                } else if (currentState != 'END' || currentState != 'MEDIA') {
                    console.log("Session", session.callid, "advancing to state:", currentState, sessionModule.flowMap.get(currentState));
                    let message = hepModule[sessionModule.flowMap.get(currentState)](session);
                    // sessionModule.mediator.send({type: "sendData", data: message});
                } else if (currentState === 'END') {
                    console.log("Session complete:", session.callid);
                    sessionModule.sessions = sessionModule.sessions.filter(s => s.callid !== session.callid);
                }
            });
        }
    },
}

export default sessionModule;