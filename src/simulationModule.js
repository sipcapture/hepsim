/*
    Take a set of sessions and call state machine updates over them to simulate call flows.
    */

import * as utils from './utils.js';
import sessionModule from './sessionModule.js';

/**
 * @typedef {{callState: string, location: number, callinfo: {callid: string, from: string, to: string}, mediaInfo: {mos: number, mean_mos: number, jitter: number, mean_jitter: number, packetloss: number, mean_rfactor: number, direction: number}, locations: string[], infrastructure: object}} SessionState
 */

/**
 * @typedef {{name: string, cps_high?: number, interval?: number, count?: number}} SimulationConfig
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
     * @type {SimulationConfig[]|undefined}
     */
    configuration: [{name: "normal", cps_high: 10, interval: 60}],
    /** @type {SimulationConfig} */
    normalConfig: {name: "normal", cps_high: 10, interval: 60},
    /** @type {SimulationConfig} */
    badConfig: {name: "bad", interval: 300, count: 5},
    /** @type {SimulationConfig} */
    unAuthorizedConfig: {name: "unauthorized", interval: 300, count: 5},
    /** @type {SimulationConfig|null} */
    dualCaptureConfig: null,
    /** @type {SimulationConfig|null} */
    mosDipConfig: null,
    /** @type {SimulationConfig|null} */
    oneWayConfig: null,
    /**
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
        let now = new Date();
        let highPeakStart = new Date();
        highPeakStart.setUTCHours(11, 0, 0, 0);
        let randomization = Math.random() * 2000;
        return Math.abs((now.getTime() - highPeakStart.getTime()) + randomization) / 1000 / 60 / 60 ;
    },
    /**
     * @param {number} CPS
     * @returns {number}
     */
    getAdjustedDelay: (CPS) => {
        return (simulationModule.getAdjustmentFactor() * 1000) / CPS;
    },
    /**
     * Interval+count burst tick used by 403-style scenarios.
     * @param {() => SimulationConfig|null|undefined} getConfig
     * @param {string} label
     * @param {number} extraJitterMs
     */
    makeIntervalTick: (getConfig, label, extraJitterMs) => {
        const tick = async () => {
            if (simulationModule.simulationStopped) return;
            const config = getConfig();
            if (!config || !config.interval || !config.count) return;
            console.log(`🕒 ${label} tick at`, new Date().toISOString());
            for (let i = 0; i < config.count; i++) {
                simulationModule.mediator.send({type: "newSession", config});
                await Bun.sleep(300);
            }
            setTimeout(tick, (config.interval * 1000) + utils.getRandomInteger(0, extraJitterMs));
        };
        return tick;
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
                await Bun.sleep(300);
            }
            setTimeout(simulationModule.badTick, (simulationModule.badConfig.interval * 1000) + utils.getRandomInteger(0, 600000));
        }
    },
    unAuthorizedTick: async () => {
        if (!simulationModule.simulationStopped) {
            console.log("🕒 Unauthorized tick at", new Date().toISOString());
            for (let i = 0; i < simulationModule.unAuthorizedConfig.count; i++) {
                simulationModule.mediator.send({type: "newSession", config: simulationModule.unAuthorizedConfig});
                await Bun.sleep(300);
            }
            setTimeout(simulationModule.unAuthorizedTick, (simulationModule.unAuthorizedConfig.interval * 1000) + utils.getRandomInteger(0, 120000));
        }
    },
    dualCaptureTick: null,
    mosDipTick: null,
    oneWayTick: null,
    /**
     * Run the simulation with the given sessions.
     */
    runSimulation: async () => {
        let normalConfig = simulationModule.configuration.find((s => s.name === "normal"));
        if (!normalConfig) {
            console.error("No 'normal' configuration found. Simulation cannot run.");
            return;
        }
        simulationModule.normalConfig = normalConfig;
        setTimeout(simulationModule.normalTick, simulationModule.getAdjustedDelay(simulationModule.normalConfig.cps_high));

        let badConfig = simulationModule.configuration.find((s => s.name === "bad"));
        if (!badConfig) {
            console.error("No 'bad' configuration found. Simulation cannot run.");
            return;
        }
        simulationModule.badConfig = badConfig;
        setTimeout(simulationModule.badTick, (simulationModule.badConfig.interval * 1000) + utils.getRandomInteger(0, 600000));

        let unAuthorizedConfig = simulationModule.configuration.find((s => s.name === "403"));
        if (!unAuthorizedConfig) {
            console.error("No '403' configuration found. Simulation cannot run.");
            return;
        }
        simulationModule.unAuthorizedConfig = unAuthorizedConfig;
        setTimeout(simulationModule.unAuthorizedTick, (simulationModule.unAuthorizedConfig.interval * 1000) + utils.getRandomInteger(0, 120000));

        simulationModule.dualCaptureConfig = simulationModule.configuration.find((s => s.name === "dual_capture")) || null;
        if (simulationModule.dualCaptureConfig) {
            simulationModule.dualCaptureTick = simulationModule.makeIntervalTick(
                () => simulationModule.dualCaptureConfig, "DualCapture", 120000);
            setTimeout(simulationModule.dualCaptureTick,
                (simulationModule.dualCaptureConfig.interval * 1000) + utils.getRandomInteger(0, 120000));
        }

        simulationModule.mosDipConfig = simulationModule.configuration.find((s => s.name === "mos_dip")) || null;
        if (simulationModule.mosDipConfig) {
            simulationModule.mosDipTick = simulationModule.makeIntervalTick(
                () => simulationModule.mosDipConfig, "MosDip", 120000);
            setTimeout(simulationModule.mosDipTick,
                (simulationModule.mosDipConfig.interval * 1000) + utils.getRandomInteger(0, 120000));
        }

        simulationModule.oneWayConfig = simulationModule.configuration.find((s => s.name === "one_way")) || null;
        if (simulationModule.oneWayConfig) {
            simulationModule.oneWayTick = simulationModule.makeIntervalTick(
                () => simulationModule.oneWayConfig, "OneWay", 120000);
            setTimeout(simulationModule.oneWayTick,
                (simulationModule.oneWayConfig.interval * 1000) + utils.getRandomInteger(0, 120000));
        }

        setInterval(simulationModule.tick, 200);

        console.log("▶️  Starting simulation at", new Date().toISOString());
    },
    tick: async () => {
        if (Date.now() - simulationModule.previous > 50) {
            if (simulationModule.debug) console.log("🔄 Simulation tick at", new Date().toISOString());
            simulationModule.mediator.send({type: "tick"});
            simulationModule.previous = Date.now();
        } else {
            return;
        }
    },
    simulationStop: async () => {
        console.log("🛑 Stopping simulation...");
        simulationModule.simulationStopped = true;
    }
};

export default simulationModule;
