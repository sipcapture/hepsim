/*
    Take a set of sessions and call state machine updates over them to simulate call flows.
    */

import * as utils from './utils.js';
import sessionModule from './sessionModule.js';

/**
 * @typedef {{callState: string, location: number, callinfo: {callid: string, from: string, to: string}, mediaInfo: {mos: number, mean_mos: number, jitter: number, mean_jitter: number, packetloss: number, mean_rfactor: number, direction: number}, locations: string[], infrastructure: object}} SessionState
 */

/**
 * @typedef MediatorInterface
 * @type {{send: function, subscribe: function}}
 */

const simulationModule = {
    /**
     * Sessions created for the simulation.
     * @type {SessionState[]}
     */
    sessions: [],
    simulationStopped: false,
    previous: new Date().getTime(),
    debug: false,
    /**
     * @type {MediatorInterface}
     */
    mediator: {send: () => {}, subscribe: () => {}},
    /**
     * @type {{name: string}[]}
     * @property {function} find - Find a configuration by name
     */
    configuration: [],
    /**
     * @type {{cps_high: number, interval: number}}
     */
    normalConfig: {cps_high: 10, interval: 60},
    /**
     * @type {{count: number, interval: number}}
     */
    badConfig: {interval: 300, count: 5},
    /**
     * @type {{interval: number, count: number}}
     */
    unAuthorizedConfig: {interval: 300, count: 5},
    /**
     * 
     * @param {MediatorInterface} mediator 
     * @param {{name: string}[]} configuration 
     */
    initialize: async (mediator, configuration) => {
        simulationModule.mediator = mediator;
        simulationModule.mediator.subscribe(simulationModule.receiveInput);
        simulationModule.configuration = configuration;
        sessionModule.initialize(mediator, configuration);
        console.log("Simulation module initialized with configuration:", configuration, simulationModule.mediator);
    },
    /**
     * 
     * @param {{type: string, config: {name: string}}} input 
     */
    receiveInput: (input) => {
        if (input.type === "stop") {
            simulationModule.simulationStop();
        } else if (input.type === "noSessions" && simulationModule.simulationStopped) {
            if (simulationModule.debug) console.log("Simulation complete, all sessions finished.");
            simulationModule.mediator.send({type: "disconnect"});
            process.exit(0);
        } else if (input.type === "debugSimulation") {
            simulationModule.debug = true;
        }
    },
    getAdjustmentFactor: () => {
        // Adjust the CPS based on the time of day
        let now = new Date();
        let highPeakStart = new Date();
        highPeakStart.setUTCHours(11, 0, 0, 0);
        let randomization = Math.random() * 2000; // add some randomness into the timing
        return Math.abs((now.getTime() - highPeakStart.getTime()) + randomization) / 1000 / 60 / 60 ;
    },
    /**
     * 
     * @param {number} CPS 
     * @returns 
     */
    getAdjustedDelay: (CPS) => {
        return (simulationModule.getAdjustmentFactor() * 1000) / CPS;
    },
    normalTick: async () => {
        if (!simulationModule.simulationStopped) {
            if (simulationModule.debug) console.log("🕒 Normal tick at", new Date().toISOString(), "with adjusted delay", simulationModule.getAdjustedDelay(simulationModule.normalConfig.cps_high).toFixed(2), "resulting in", (1000 / simulationModule.getAdjustedDelay(simulationModule.normalConfig.cps_high)).toFixed(2), "calls per second");
            simulationModule.mediator.send({type: "newSession", config: simulationModule.normalConfig});
            setTimeout(simulationModule.normalTick, simulationModule.getAdjustedDelay(simulationModule.normalConfig.cps_high));
        }
    },
    badTick: async () => {
        if (!simulationModule.simulationStopped) {
            console.log("🕒 Bad tick at", new Date().toISOString());
            for (let i = 0; i < simulationModule.badConfig.count; i++) {
                simulationModule.mediator.send({type: "newSession", config: simulationModule.badConfig});
                await Bun.sleep(300); // slight delay between bad calls to avoid bursts
            }
            setTimeout(simulationModule.badTick, (simulationModule.badConfig.interval * 1000) + utils.getRandomInteger(0, 600000));
        }
    },
    unAuthorizedTick: async () => {
        if (!simulationModule.simulationStopped) {
            console.log("🕒 Unauthorized tick at", new Date().toISOString());
            for (let i = 0; i < simulationModule.unAuthorizedConfig.count; i++) {
                simulationModule.mediator.send({type: "newSession", config: simulationModule.unAuthorizedConfig});
                await Bun.sleep(300); // slight delay between bad calls to avoid bursts
            }
            setTimeout(simulationModule.unAuthorizedTick, (simulationModule.unAuthorizedConfig.interval * 1000) + utils.getRandomInteger(0, 120000));
        }
    },
    /**
     * Run the simulation with the given sessions.
     */
    runSimulation: async () => {
        /* Normal call flows */
        let normalConfig = simulationModule.configuration.find((s => s.name === "normal"));
        simulationModule.normalConfig = normalConfig;
        setTimeout(simulationModule.normalTick, simulationModule.getAdjustedDelay(simulationModule.normalConfig.cps_high));
        /* Bad MOS calls */
        let badConfig = simulationModule.configuration.find((s => s.name === "bad"));
        simulationModule.badConfig = badConfig;
        setTimeout(simulationModule.badTick, (simulationModule.badConfig.interval * 1000) + utils.getRandomInteger(0, 600000));
        /* Unauthorized calls */
        let unAuthorizedConfig = simulationModule.configuration.find((s => s.name === "403"));
        simulationModule.unAuthorizedConfig = unAuthorizedConfig;
        setTimeout(simulationModule.unAuthorizedTick, (simulationModule.unAuthorizedConfig.interval * 1000) + utils.getRandomInteger(0, 120000));
        /* Simulation ticks to Session Module */
        setInterval(simulationModule.tick, 200); // 200 ms tick for simulation updates

        console.log("▶️  Starting simulation at", new Date().toISOString());
    },
    /**
     * Tick function to update the simulation state.
     *
     */
    tick: async () => {
        if (Date.now() - simulationModule.previous > 20) { //20 ms per tick default; 1000 for debug
            if (simulationModule.debug) console.log("🔄 Simulation tick at", new Date().toISOString());
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
