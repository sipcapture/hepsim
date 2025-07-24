/* 
Manage infrastructure based on configuration.
- Create set of numbers and connections to simulate call flows.
- Generate media ports for calls.
- Return upon request a set of flows.
*/

import * as utils from './utils.js';
import stateMachine from './stateMachine.js';

/**
 * @typedef {{callState: string, location: number, callinfo: {callid: string, from: string , to: string}, mediaInfo: {mos: float, mean_mos: float, jitter: float, mean_jitter: float, packetloss: integer, mean_rfactor: float, direction: number}, locations: string[], infrastructure: object}} SessionState
 */

const infrastructureModule = {
    /**
     * Sessions created for the simulation.
     * @type {SessionState[]}
     */
    sessions: [],
    /**
     * Create Sessions based on the defined infrastructure in the configuration.
     * @param {object} config 
     * @returns {Promise<SessionState[]>} sessions
     */
    createInfrastructureSessions: async function (config) {
        console.log("🧭 Creating infrastructure sessions...", config.virtualInfrastructure);
        /* For each infrastructure generate the session Infrastructure */
        for (let infrastructure in config.virtualInfrastructure) {
            console.log(`🧭 Creating infrastructure session for ${infrastructure}`);
            let y = config.virtualInfrastructure[infrastructure].caller.amount;
            console.log(`🧭 Creating ${y} sessions for caller`, config.virtualInfrastructure[infrastructure].caller);
            for (let i = 1; i < y; i++) {
                let session = stateMachine.getInitialState();
                /* Setup number and Callid*/
                session = this.setupNumberAndCallid(session);
                session = this.setupLocation(session, config.virtualInfrastructure[infrastructure]);
                session.infrastructure = config.virtualInfrastructure[infrastructure];
                this.sessions.push({session})
            }
        }
        console.log(this.sessions.length, "sessions created for the simulation.");
        return this.sessions;
    },
    setupNumberAndCallid: function (state) {
        let newState = {...state};
        let number = utils.getRandomPhoneNumber();
        let callid = utils.getRandomCallId();
        newState.callinfo.from = number;
        newState.callinfo.callid = callid;
        return newState;
    },
    /**
     * Setup the location for the session.
     * @param {SessionState} state 
     * @param {Object} infrastructure 
     * @returns {SessionState} newState
     */
    setupLocation: function (state, infrastructure) {
        let newState = {...state};
        let locations = this.navigateLocations(infrastructure);
        newState.location = 0;
        newState.locations = locations; 

        return newState;
    },
    navigateLocations: function (infrastructure) {
        let unvisited = Object.keys(infrastructure);
        let locations = [];
        let currentLocation = unvisited.shift();
        while (currentLocation != 'called') {
            locations.push(currentLocation);
            if (infrastructure[currentLocation].NEXT.length > 0) {
                let pick = utils.pickRandomElement(infrastructure[currentLocation].NEXT);
                currentLocation = pick;
            } else {
                currentLocation = infrastructure[currentLocation].NEXT[0];
            }
        }
        locations.push('called');
        console.log("🧭 Navigated locations:", locations);
        return locations;
    },
}

export default infrastructureModule;