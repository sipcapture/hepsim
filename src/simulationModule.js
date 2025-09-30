/*
    Take a set of sessions and call state machine updates over them to simulate call flows.
    */

import * as utils from './utils.js';
import sessionModule from './sessionModule.js';

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
    mediator: {},
    configuration: {},
    initialize: async (mediator, configuration) => {
        simulationModule.mediator = mediator;
        simulationModule.mediator.subscribe(simulationModule.receiveInput.bind(simulationModule));
        simulationModule.configuration = configuration;
        sessionModule.initialize(mediator, configuration);
        console.log("Simulation module initialized with configuration:", configuration, simulationModule.mediator);
    },
    receiveInput: (input) => {
        if (input.type === "stop") {
            simulationModule.simulationStop();
        } else if (input.type === "noSessions" && simulationModule.simulationStopped) {
            console.log("Simulation complete, all sessions finished.");
            simulationModule.mediator.send({type: "disconnect"});
            process.exit(0);
        }
    },
    getAdjustmentFactor: () => {
        // Adjust the CPS based on the time of day
        let now = new Date();
        let highPeakStart = new Date();
        highPeakStart = highPeakStart.setUTCHours(11, 0, 0, 0);
        let randomization = Math.random() * 2000; // add some randomness into the timing
        return Math.abs((now - highPeakStart) + randomization) / 1000 / 60 / 60 ;
    },
    getAdjustedDelay: (CPS) => {
        return (simulationModule.getAdjustmentFactor() * 1000) / CPS;
    },
    normalTick: async () => {
        let normalConfig = simulationModule.configuration.find((s => s.name === "normal"));
        console.log("🕒 Normal tick at", new Date().toISOString(), "with adjusted delay", simulationModule.getAdjustedDelay(normalConfig.cps_high).toFixed(2), "resulting in", (1000 / simulationModule.getAdjustedDelay(normalConfig.cps_high)).toFixed(2), "calls per second");
        simulationModule.mediator.send({type: "newSession", config: normalConfig});
        setTimeout(simulationModule.normalTick, simulationModule.getAdjustedDelay(normalConfig.cps_high));
    },
    /**
     * Run the simulation with the given sessions.
     * @param {SessionState[]} sessions - The sessions to run the simulation on.
     */
    runSimulation: async () => {
        /* Normal call flows */
        let normalConfig = simulationModule.configuration.find((s => s.name === "normal"));
        setTimeout(simulationModule.normalTick, simulationModule.getAdjustedDelay(normalConfig.cps_high));
        /* Bad MOS calls */
        let badConfig = simulationModule.configuration.find((s => s.name === "bad"));
        setInterval((badConfig) => {
            if (!simulationModule.simulationStopped) {
                console.log("🕒 Bad tick at", new Date().toISOString());
            }
        }, badConfig.interval * 1000);
        /* Unauthorized calls */
        let unAuthorizedConfig = simulationModule.configuration.find((s => s.name === "403"));
        setInterval((unAuthorizedConfig) => {
            if (!simulationModule.simulationStopped) {
                console.log("🕒 Unauthorized tick at", new Date().toISOString());
            }
        }, unAuthorizedConfig.interval * 1000);
        /* Simulation ticks to Session Module */
        setInterval(simulationModule.tick, 20); // 20 ms tick for simulation updates

        console.log("▶️  Starting simulation at", new Date().toISOString());
    },
    /**
     * Tick function to update the simulation state.
     *
     */
    tick: async () => {
        if (Date.now() - simulationModule.previous > 1000) { //20 ms per tick default; 1000 for debug
            console.log("🔄 Simulation tick at", new Date().toISOString());
            simulationModule.mediator.send({type: "tick"});
            simulationModule.previous = Date.now();
        } else {
            // If the tick is too fast, we just return
            return;
        }
    },
    simulationStop: async () => {
        console.log("🛑 Stopping simulation...");
        simulationModule.simulationStopped = true;
    }
};

export default simulationModule;
