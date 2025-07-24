/*
    Take a set of sessions and call state machine updates over them to simulate call flows.
    */

import * as utils from './utils.js';
import stateMachine from './stateMachine.js';

/**
 * @typedef {{callState: string, location: number, callinfo: {callid: string, from: string , to: string}, mediaInfo: {mos: float, mean_mos: float, jitter: float, mean_jitter: float, packetloss: integer, mean_rfactor: float, direction: number}, locations: string[], infrastructure: object}} SessionState
 */

const simulationModule = {
    /**
     * Sessions created for the simulation.
     * @type {SessionState[]}
     */
    sessions: [],
    simulationStopped: false,
    previous: new Date().getTime(),
    /**
     * Run the simulation with the given sessions.
     * @param {SessionState[]} sessions - The sessions to run the simulation on.
     */
    runSimulation: async function (sessions) {
        console.log("🔄 Starting simulation with", sessions.length, "sessions.");
        this.sessions = sessions;
        this.previous = Date.now();
        setInterval(this.tick.bind(this), 20);
    },
    /**
     * Tick function to update the simulation state.
     *
     */
    tick: async function () {
        if (Date.now() - this.previous > 1000) { //20 ms per tick default; 1000 for debug
            console.log("🔄 Simulation tick at", new Date().toISOString());
            for (var session of this.sessions) {
                /* handle update of sessions */
                console.log("🔄 Updating session:", session.session.callinfo.callid);
                console.log(session);
                session = stateMachine.getNextState(session);
                console.log(" after update:", session.session.callState, "at location", session.session.location);
            }
        
            if (this.simulationStopped) {
                clearInterval(this.tick);
                process.exit(0);
            }
            this.previous = Date.now();
        } else {
            // If the tick is too fast, we just return
            return;
        }
    },
    simulationStop: async function () {
        console.log("🛑 Stopping simulation...");
        this.simulationStopped = true;
    }
};

export default simulationModule;
