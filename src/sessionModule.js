import * as utils from './utils.js';
import hepModule from './hepModule.js';


const sessionModule = {
    mediator: {},
    sessions: [],
    stopped: false,
    createSession: (config) => {
        console.log("Creating new session with config:", config);
    },
    initialize: (mediator, configuration) => {
        sessionModule.mediator = mediator;
        sessionModule.mediator.subscribe(sessionModule.receiveInput.bind(sessionModule));
        console.log("Session module initialized with configuration:", configuration, sessionModule.mediator);

    },
    receiveInput: (input) => {
        console.log("Session module received input:", input);
        if (input.type === "newSession") {
            if (!sessionModule.stopped) sessionModule.createSession(input.config);
        } else if (input.type === "stop") {
            sessionModule.stopped = true;
        } else if (input.type === "tick") {
            sessionModule.advanceSessions();
        }
    },
    advanceSessions: () => {
        console.log("Current Sessions in Progress:", sessionModule.sessions.length);
        sessionModule.mediator.send({type: "noSessions"});
    },
}

export default sessionModule;