/*
* HEPsim (HEP simulator) is a simulator for calls to generate metrics and 
* Semi-realistic SIP flows for demonstration purposes
* AGPLv3, 2024 - Jachen Duschletta
*/
/*
* Imports
*/

import loadConfig from './src/configModule.js';
import * as utils from './src/utils.js';
import hepModule from './src/hepModule.js';
import senderModule from './src/connectionManager.js';
import infrastructureModule from './src/infrastructureModule.js';
import simulationModule from './src/simulationModule.js';


/*
* Globals
*/
const debug = process.env.DEBUG || false

process.on('SIGINT', function() {
    if (simulationModule.simulationStopped) {
        process.exit(0);
    }
    simulationModule.simulationStop();
})


/**
 * @typedef {{callState: string, location: number, callinfo: {callid: string, from: string , to: string}, mediaInfo: {mos: float, mean_mos: float, jitter: float, mean_jitter: float, packetloss: integer, mean_rfactor: float, direction: number}, locations: string[]}} SessionState
 */

/*
* Session Module
*/

const sessionModule = {}

/**
 * @type {SESSION[]}
 */
sessionModule.sessions = []
/**
 * @type {SCENARIO}
 */
sessionModule.scenarios = {}

sessionModule.callFlows = {
    'default': ['INVITE', '100Trying', '180Ringing', '200OK', '200OKACK', 'MEDIA', 'BYE', '200BYE', 'END'],
    'auth': ['INVITE', '407', 'ACK407', 'INVITEAUTH', '100Trying', '180Ringing', '200OK', '200OKACK', 'MEDIA', 'BYE', '200BYE', 'END'],
    'registration': ['REGISTER', '200OK', 'END'],
    'auth_register': ['REGISTER', '401', 'REGISTERAUTH', '200OK', 'END'],
    'dtmf': ['INVITE', '100Trying', '180Ringing', '200OK', 'DTMF', 'MEDIA', 'BYE', '200BYE', 'END'],
    'timeout408': ['INVITE', '100Trying', '180Ringing', '200OK', '200OKACK', 'BYE', '408', 'END'],
}

/**
 * Initialize all Sessions with a given configuration
 * @param {CONFIG} config 
 */
sessionModule.initializeSessions = function (config) {
    if (debug) console.log('Creating Sessions')
    /* Calculate full amount of requested Sessions */
    let fullAmount = 0
    for (let i = 0; i < config.scenarios.length; i++) {
        let scenario = config.scenarios[i]
        if (scenario.call?.via) {
            fullAmount += scenario.call.amount * 2
        } else {
            fullAmount += scenario.call.amount
        }
    }
    if (fullAmount > sessionModule.sessions.length) {
        for (let i = 0; i < config.scenarios.length; i++) {
            let scenario = config.scenarios[i]
            sessionModule.initializeScenario(scenario)
        }
    }
    if (debug) console.log(`Starting ${sessionModule.sessions.length} Sessions`)
}

/**
 * Initialize a Scenario sessions
 * @param {SCENARIO} scenario 
 */
sessionModule.initializeScenario = function (scenario) {
    if (debug) console.log('Initializing Scenario ', scenario)
    if (!Object.hasOwn(sessionModule.scenarios, scenario.name)) {
        sessionModule.scenarios[scenario.name] = 0
    }
    for (let i = 0; i < scenario.call.amount; i++) {
        if (scenario.call?.via) {
            if (scenario.call.amount * 2 > sessionModule.scenarios[scenario.name]) {
                /* Generate from and to user phone number */
                let fromNumber = utils.getRandomPhoneNumber()
                let toNumber = utils.getRandomPhoneNumber()
                let leg1Scenario = JSON.parse(JSON.stringify(scenario))
                leg1Scenario.call.to = scenario.call.via
                let leg2Scenario = JSON.parse(JSON.stringify(scenario))
                leg2Scenario.call.from = scenario.call.via
                let session1 = sessionModule.createSession(leg1Scenario, fromNumber, toNumber)
                let session2 = sessionModule.createSession(leg2Scenario, fromNumber, toNumber, session1.callid)
                sessionModule.sessions.push(session1)
                sessionModule.scenarios[scenario.name]++
                sessionModule.sessions.push(session2)
                sessionModule.scenarios[scenario.name]++
            } else { 
                break
            }
        } else {
            if (scenario.call.amount > sessionModule.scenarios[scenario.name]) {
                let session = sessionModule.createSession(scenario)
                sessionModule.sessions.push(session)
                sessionModule.scenarios[scenario.name]++
            } else { 
                break
            }
        }
    }
    return true
}

/**
 * Create individual sessions
 * @param {SCENARIO} scenario 
 * @returns {SESSION} Session Object
 */
sessionModule.createSession = function (scenario, fromNumber, toNumber, correlation_id) {
    let session = {
        callid: 'sim_' + utils.generateRandomString(8),
        seq: utils.getRandomInteger(1000, 9999),
        duration: 0,
        via: scenario.call.via || null,
        from_user: fromNumber || utils.getRandomPhoneNumber(),
        from_ip: simulationModuleOld.infrastructure[scenario.call.from].ip,
        to_user: toNumber || utils.getRandomPhoneNumber(),
        to_ip: simulationModuleOld.infrastructure[scenario.call.to].ip,
        target_duration: utils.getRandomInteger(scenario.call.duration[0], scenario.call.duration[1]) * 1000,
        mos_range: scenario.call.mos,
        jitter_range: scenario.call.jitter,
        packetloss_range: scenario.call.packetloss,
        name: scenario.name,
        state: '0',
        callflow: scenario.callflow,
        mediaInfo: {mos: parseFloat(0.0), mean_mos: parseFloat(4.000), jitter: parseFloat(0.0), mean_jitter: parseFloat(1.0), packetloss: parseInt(0), mean_rfactor: parseFloat(80.0)}
    }
    if (correlation_id) {
        session.correlation_id = correlation_id
    }
    /* TODO: Randomize Ports for Media */
    let captureId = simulationModuleOld.infrastructure[scenario.call.from].captureId || simulationModuleOld.infrastructure[scenario.call.to].captureId || 12345
    session.outDirection = hepModule.generateRCInfo(captureId, 'hep', 1, session?.correlation_id || session.callid, 1, session.from_ip, session.to_ip, 5060, 5060)
    session.outMedia = hepModule.generateRCInfo(captureId, 'hep', 1, session?.correlation_id || session.callid, 1, session.from_ip, session.to_ip, 26768, 51354)
    session.inDirection = hepModule.generateRCInfo(captureId, 'hep', 1, session?.correlation_id || session.callid, 1, session.to_ip, session.from_ip, 5060, 5060)
    session.inMedia = hepModule.generateRCInfo(captureId, 'hep', 1, session?.correlation_id || session.callid, 1, session.to_ip, session.from_ip, 51354, 26768)
    return session
}

/**
 * Update all sessions
 * Here we initiate sending HEP and track the state of the sessions
 */
sessionModule.update = async function (moment) {
    /* console.log('Updating Sessions') */
    for (let i = 0; i < sessionModule.sessions.length; i++) {
        let session = sessionModule.sessions[i]
        if (debug) console.log(sessionModule.callFlows[session.callflow][session.state])
        if (sessionModule.callFlows[session.callflow][session.state] == 'INVITE') {
            let via = []
            if (simulationModuleOld.infrastructure[session.via].ip == session.from_ip) {
                via.push({ srcIp: session.from_ip, dstIp: session.to_ip, srcPort: 5060, dstPort: 5060 })
            }
            let invite = hepModule.generateInvite(session.seq, session.from_user, session.to_user, session.callid, session.outDirection, via)

            await senderModule.send(invite)
            session.state++
            continue
        } else if (sessionModule.callFlows[session.callflow][session.state] == '100Trying') {
            let trying = hepModule.generate100Trying(session.seq, session.from_user, session.to_user, session.callid, session.inDirection)
            await senderModule.send(trying)
            session.state++
            continue
        } else if (sessionModule.callFlows[session.callflow][session.state] == '200OK') {
            let ok200 = hepModule.generate200OKInvite(session.seq, session.from_user, session.to_user, session.callid, session.inDirection)
            await senderModule.send(ok200)
            session.state++
            /* Starting the call duration */
            session.start = moment
            session.reportingStart = moment
            continue
        } else if (sessionModule.callFlows[session.callflow][session.state] == '200OKACK') {
            let ack200 = hepModule.generate200OKAck(session.seq, session.from_user, session.to_user, session.callid, session.outDirection)
            await senderModule.send(ack200)
            session.state++
            continue
        } else if (sessionModule.callFlows[session.callflow][session.state] == 'MEDIA') {
            let duration = moment - session.reportingStart
            session.duration = moment - session.start
            if (duration > 30000 && session.duration < session.target_duration && session.target_duration > 30000) {
                /* TODO: RFactor Calculation */
                let mos = utils.getRandomFloat(session.mos_range[0], session.mos_range[1])
                let jitter = utils.getRandomFloat(session.jitter_range[0], session.jitter_range[1])
                let packetloss = utils.getRandomInteger(session.packetloss_range[0], session.packetloss_range[1])
                session.mediaInfo.mos = mos
                session.mediaInfo.mean_mos = parseFloat(parseFloat((session.mediaInfo.mean_mos + mos) / 2).toFixed(3))
                session.mediaInfo.jitter = jitter
                session.mediaInfo.mean_jitter = parseFloat(parseFloat((session.mediaInfo.mean_jitter + jitter) / 2).toFixed(3)) 
                session.mediaInfo.packetloss += packetloss
                session.mediaInfo.direction = 0
                let media = hepModule.generatePeriodicReport(session.callid, session.inMedia, session.mediaInfo)
                await senderModule.send(media)
                session.mediaInfo.direction = 1
                let mediaBack = hepModule.generatePeriodicReport(session.callid, session.outMedia, session.mediaInfo)
                await senderModule.send(mediaBack)
                session.reportingStart = moment
                continue
            } else if (session.duration > session.target_duration) {
                if(session.target_duration < 30000) {
                    let mos = utils.getRandomFloat(session.mos_range[0], session.mos_range[1])
                    let jitter = utils.getRandomFloat(session.jitter_range[0], session.jitter_range[1])
                    let packetloss = utils.getRandomInteger(session.packetloss_range[0], session.packetloss_range[1])
                    session.mediaInfo.mos = mos
                    session.mediaInfo.mean_mos = parseFloat(parseFloat((session.mediaInfo.mean_mos + mos) / 2).toFixed(3))
                    session.mediaInfo.jitter = jitter
                    session.mediaInfo.mean_jitter = parseFloat(parseFloat((session.mediaInfo.mean_jitter + jitter) / 2).toFixed(3)) 
                    session.mediaInfo.packetloss += packetloss
                }
                session.lastReport = session.reportingStart / 1000 || Date.now() / 1000
                session.mediaInfo.lastReport = session.lastReport
                session.mediaInfo.rtpstart = session.start
                session.mediaInfo.direction = 0
                let final = hepModule.generateFinalReport(session.callid, session.inMedia, session.mediaInfo)
                await senderModule.send(final)
                let hangup = hepModule.generateHangupReport(session.callid, session.inMedia, session.mediaInfo)
                await senderModule.send(hangup)
                let shortHangup = hepModule.generateShortHangupReport(session.callid, session.inMedia, session.mediaInfo)
                await senderModule.send(shortHangup)
                session.mediaInfo.direction = 1
                let finalBack = hepModule.generateFinalReport(session.callid, session.outMedia, session.mediaInfo)
                await senderModule.send(finalBack)
                let hangupBack = hepModule.generateHangupReport(session.callid, session.outMedia, session.mediaInfo)
                await senderModule.send(hangupBack)
                let shortHangupBack = hepModule.generateShortHangupReport(session.callid, session.outMedia, session.mediaInfo)
                await senderModule.send(shortHangupBack)

                session.state++
                continue
            }
            continue
        } else if (sessionModule.callFlows[session.callflow][session.state] == 'BYE') {
            session.duration = moment - session.start
            if (session.duration < session.target_duration) {
                continue
            }
            let bye = hepModule.generateBye(session.from_user, session.to_user, session.callid, session.outDirection)
            await senderModule.send(bye)
            session.state++
            continue
        } else if (sessionModule.callFlows[session.callflow][session.state] == '200BYE') {
            let bye200 = hepModule.generate200OKBye(session.from_user, session.to_user, session.callid, session.inDirection)
            await senderModule.send(bye200)
            session.state++
            continue
        } else if (sessionModule.callFlows[session.callflow][session.state] == 'END') {
            if (debug) console.log('Session Ended', session.callid)
            sessionModule.scenarios[session.name]--
            sessionModule.sessions.splice(i, 1)
            if(simulationModuleOld.killed) {
                console.log('Sessions Remaining', sessionModule.sessions.length)
                console.log('Scenarios Remaining', sessionModule.scenarios)
            }
            continue
        } else {
            throw('Unknown State')
        }
    }
}

/**
 * @typedef CONFIG
 * @type {{scenarios: SCENARIO[], virtualInfrastructure: {namedString: {type: string, ip: string}}}}
 */

/*
* Simulation
*/

const simulationModuleOld = {}

simulationModuleOld.start = Date.now()
simulationModuleOld.diff = 0
simulationModuleOld.previous = Date.now()
simulationModuleOld.infrastructure = {}
simulationModuleOld.config = {}

/**
 * Initialize the Simulation with a config
 * @param {CONFIG} config 
 */
simulationModuleOld.initializeSimulation = function (config) {
    console.log('Initializing Simulation')
    simulationModuleOld.config = config
    console.log('Setting up Infrastructure')
    simulationModuleOld.infrastructure = config.virtualInfrastructure
    console.log(config.scenarios)
    sessionModule.initializeSessions(config)
    console.log('Simulation Initialized')
    return true
}

/**
 * Tick function for the simulation
 */
simulationModuleOld.tick = function () {
    simulationModuleOld.diff = Date.now() - simulationModuleOld.previous
    if (simulationModuleOld.diff > 200) {
        /* Update all sessions and send HEP accordingly */
        sessionModule.update(Date.now())

        /* Check if simulation is still active */
        if (!simulationModuleOld.killed) {
            sessionModule.initializeSessions(simulationModuleOld.config)
        } 
        /* Check if all sessions are finished */
        if (sessionModule.sessions.length == 0) {
            console.log('Simulation Finished')
            process.exit()
        }
        simulationModuleOld.previous = Date.now()
    }

    setTimeout(simulationModuleOld.tick, 100)
}

/**
 * Kill the Simulation - Sets switch to let simulation know to soft-close.
 */
simulationModuleOld.killSimulation = function () {
    simulationModuleOld.killed = true
    console.log('Finishing in Progress Calls, if you need to stop immediately, push CTRL-C again.')
    console.log('Sessions Remaining', sessionModule.sessions.length)
    console.log('Scenarios Remaining', sessionModule.scenarios)
}


/**
 * Main function
 */
async function main() {
    console.log('**************** \\|/')
    console.log(' EXSPUE HEP!---->-*-')
    console.log('**************** /|\\')
    console.log('\n\nStarting Call Simulator')
    let config = await loadConfig()
    /* Initialize infrastructureModule */
    let sessions = await infrastructureModule.createInfrastructureSessions(config)
    simulationModule.runSimulation(sessions)
}

/* Start the main function */
main()