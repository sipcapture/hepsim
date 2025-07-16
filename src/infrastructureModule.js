/* 
Manage infrastructure based on configuration.
- Create set of numbers and connections to simulate call flows.
- Generate media ports for calls.
- Return upon request a set of flows.
*/

import * as utils from './utils.js';
import stateMachine from './stateMachine.js';

const infrastructureModule = {
    sessions: [],
    createInfrastructureSessions: async function (config) {
        console.log("Creating infrastructure sessions...", config.virtualInfrastructure);
        /* For each infrastructure generate the session Infrastructure */
        for (let infrastructure in config.virtualInfrastructure) {
            console.log(`Creating infrastructure session for ${infrastructure}`);
            let y = config.virtualInfrastructure[infrastructure].caller.amount;
            console.log(`Creating ${y} sessions for caller`, config.virtualInfrastructure[infrastructure].caller);
            for (let i = 1; i < y; i++) {
                let session = stateMachine.getInitialState();
                /* Setup number and Callid*/
                session = this.setupNumberAndCallid(session);
                session = this.setupLocation(session, config.virtualInfrastructure[infrastructure]);
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
    setupLocation: function (state, infrastructure) {
        let newState = {...state};
        let locations = this.navigateLocations(infrastructure);
        newState.location = locations[0];
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

        return locations;
    },
}

export default infrastructureModule;