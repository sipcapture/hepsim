/*
* HEPsim (HEP simulator) is a simulator for calls to generate metrics and 
* Semi-realistic SIP flows for demonstration purposes
* AGPLv3, 2024 - Jachen Duschletta
*/

/*
* Imports
*/
import loadConfig from './src/configModule.js';
import simulationModule from './src/simulationModule.js';
import connectionManager from './src/connectionManager.js';


/*
* Globals
*/
const debug = process.env.DEBUG || false

process.on('SIGINT', function() {
    if (simulationModule.simulationStopped) {
        process.exit(0);
    }
    mediator.send({type: 'stop'});
    console.log('Gracefully shutting down from SIGINT (Ctrl-C)');
    console.log('Press Ctrl-C again to force quit.');
})


/**
 * @typedef {{callState: string, location: number, callinfo: {callid: string, from: string , to: string}, mediaInfo: {mos: float, mean_mos: float, jitter: float, mean_jitter: float, packetloss: integer, mean_rfactor: float, direction: number}, locations: string[]}} SessionState
 */


let oldSessionModule = {};
oldSessionModule.callFlows = {
    'default': ['INVITE', '100Trying', '180Ringing', '200OK', '200OKACK', 'MEDIA', 'BYE', '200BYE', 'END'],
    'auth': ['INVITE', '407', 'ACK407', 'INVITEAUTH', '100Trying', '180Ringing', '200OK', '200OKACK', 'MEDIA', 'BYE', '200BYE', 'END'],
    'registration': ['REGISTER', '200OK', 'END'],
    'auth_register': ['REGISTER', '401', 'REGISTERAUTH', '200OK', 'END'],
    'dtmf': ['INVITE', '100Trying', '180Ringing', '200OK', 'DTMF', 'MEDIA', 'BYE', '200BYE', 'END'],
    'timeout408': ['INVITE', '100Trying', '180Ringing', '200OK', '200OKACK', 'BYE', '408', 'END'],
}


/**
 * @typedef CONFIG
 * @type {{scenarios: SCENARIO[], virtualInfrastructure: {namedString: {type: string, ip: string}}}}
 */

let mediator = {
    receivers: [],
    getInterface: () => {
        return {
            send: mediator.send,
            subscribe: mediator.subscribe
        }
    },
    send: (message) => {
        for (let rec of mediator.receivers) {
            rec(message)
        }
    },
    subscribe: (callback) => {
        mediator.receivers.push(callback)
        return true
    }
}


/**
 * Main function
 */
async function main() {
    console.log('****************')
    console.log(' EXSPUE HEP!')
    console.log('****************')
    console.log('\nStarting Call Simulator')
    let config = await loadConfig()
    await simulationModule.initialize(mediator.getInterface(), config)
    await connectionManager.establishConnection(mediator.getInterface())
    if (process.env.DEBUG) {
        mediator.send({type: "debugSession"})
    }
    simulationModule.runSimulation()
}

/* Start the main function */
main()