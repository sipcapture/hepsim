import * as utils from './utils.js';
import hepModule from './hepModule.js';
import lakeInfluxModule from './lakeInfluxModule.js';
import lakeOtlpModule from './lakeOtlpModule.js';
import { collectMetricIps } from './lakeMetrics.js';

/**
 * @typedef {Object} DialogState
 * @property {string} fromTag
 * @property {string} toTag
 * @property {string} inviteBranch
 */

/**
 * @typedef {Object} SessionState
 * @property {string} scenario
 * @property {string} callid
 * @property {string} [callidB]
 * @property {boolean} dualLeg
 * @property {number[]} captureIds
 * @property {number} mediaDirections
 * @property {string[]} state
 * @property {number} seq
 * @property {string} from
 * @property {string} to
 * @property {number} targetDuration
 * @property {number} duration
 * @property {boolean} media
 * @property {boolean} [sbcTelemetry]
 * @property {boolean} [fails]
 * @property {string[]} [configIps]
 * @property {string[]} [mediaAlarms]
 * @property {boolean} [chosenCandidatesSent]
 * @property {boolean} [silenceAlarmSent]
 * @property {boolean} [shortCallAlarmSent]
 * @property {boolean} [oneWayAlarmSent]
 * @property {number[]} mos_range
 * @property {number[]} mos_good_range
 * @property {number[]} mos_dip_range
 * @property {number[]} jitter_range
 * @property {number[]} packetloss_range
 * @property {import('./hepModule.js').MEDIAINFO} mediaInfo
 * @property {import('./hepModule.js').MEDIAINFO} [mediaInfoB]
 * @property {import('./hepModule.js').RCINFO} rcinfo
 * @property {import('./hepModule.js').RCINFO} [rcinfoB]
 * @property {DialogState} dialog
 * @property {DialogState} [dialogB]
 * @property {number?} previous
 */

const mediaHep = process.env.MEDIA_HEP !== 'false'; // default on

const DUAL_LEG_STATE = [
    'INVITE', 'INVITE_B',
    '100Trying', '100Trying_B',
    '180Ringing', '180Ringing_B',
    '200OK', '200OK_B',
    '200OKACK', '200OKACK_B',
    'MEDIA',
    'BYE', 'BYE_B',
    '200BYE', '200BYE_B',
    'END',
];

const SINGLE_LEG_MEDIA_STATE = ['INVITE', '100Trying', '180Ringing', '200OK', '200OKACK', 'MEDIA', 'BYE', '200BYE', 'END'];

const DUAL_LEG_SCENARIOS = new Set([
    'normal', 'dual_capture', 'mos_dip', 'one_way',
    'media_alarm_silence', 'media_alarm_short_call',
]);

/**
 * @returns {DialogState}
 */
function createDialog() {
    return {
        fromTag: utils.generateRandomString(8),
        toTag: utils.generateRandomString(8),
        inviteBranch: utils.generateRandomBranch(),
    };
}

/**
 * @param {number} mos
 * @param {number} meanRfactor
 * @returns {import('./hepModule.js').MEDIAINFO}
 */
function createMediaInfo(mos, meanRfactor) {
    return {
        srcPort: utils.getRandomInteger(4000, 10000),
        dstPort: utils.getRandomInteger(4000, 10000),
        mos,
        mean_mos: mos,
        min_mos: mos,
        jitter: 1.0,
        mean_jitter: 1.0,
        max_jitter: 1.0,
        tl_bytes: 0,
        global_bytes: 0,
        total_packets: 0,
        global_packets: 0,
        packetloss: 0,
        global_packetloss: 0,
        mean_rfactor: meanRfactor,
        direction: 0,
        reportCount: 1,
        lastReport: 0,
        rtpstart: 0,
        rtpend: 0,
        one_way_rtp: 0,
    };
}

/**
 * Sync quality counters onto leg B media from shared session samples.
 * @param {import('./hepModule.js').MEDIAINFO} target
 * @param {import('./hepModule.js').MEDIAINFO} source
 */
function syncMediaQuality(target, source) {
    target.mos = source.mos;
    target.mean_mos = source.mean_mos;
    target.min_mos = source.min_mos;
    target.jitter = source.jitter;
    target.mean_jitter = source.mean_jitter;
    target.max_jitter = source.max_jitter;
    target.packetloss = source.packetloss;
    target.global_packetloss = source.global_packetloss;
    target.total_packets = source.total_packets;
    target.global_packets = source.global_packets;
    target.tl_bytes = source.tl_bytes;
    target.global_bytes = source.global_bytes;
    target.reportCount = source.reportCount;
    target.lastReport = source.lastReport;
    target.mean_rfactor = source.mean_rfactor;
    target.one_way_rtp = source.one_way_rtp;
    target.connect_ts_ms = source.connect_ts_ms;
}

/**
 * @param {SessionState} session
 * @returns {string[]}
 */
function sessionMediaIps(session) {
    /** @type {string[]} */
    const ips = [];
    const add = (ip) => { if (ip && !ips.includes(ip)) ips.push(ip); };
    add(session.rcinfo?.srcIp);
    add(session.rcinfo?.dstIp);
    add(session.rcinfoB?.srcIp);
    add(session.rcinfoB?.dstIp);
    return ips;
}

const sessionModule = {
    /**
     * @type {{send: function, subscribe: function}}
     */
    mediator: {send: () => {}, subscribe: () => {}},
    /**
     * @type {SessionState[]}
     */
    sessions: [],
    stopped: false,
    paused: false,
    debug: false,
    /**
     * @type {Map<string, string>}
     */
    flowMap: new Map(),
    /**
     * @param {{send: function, subscribe: function}} mediator
     * @param {object} configuration
     */
    initialize: (mediator, configuration) => {
        sessionModule.mediator = mediator;
        sessionModule.mediator.subscribe(sessionModule.receiveInput.bind(sessionModule));
        if (sessionModule.debug) console.log("Session module initialized with configuration:", configuration, sessionModule.mediator);
        sessionModule.flowMap.set('INVITE', 'generateInvite');
        sessionModule.flowMap.set('100Trying', 'generate100Trying');
        sessionModule.flowMap.set('180Ringing', 'generate180Ringing');
        sessionModule.flowMap.set('200OK', 'generate200OKInvite');
        sessionModule.flowMap.set('200OKACK', 'generate200OKAck');
        sessionModule.flowMap.set('MEDIA', 'generateMedia');
        sessionModule.flowMap.set('BYE', 'generateBye');
        sessionModule.flowMap.set('200BYE', 'generate200OKBye');
        sessionModule.flowMap.set('407', 'generate407');
        sessionModule.flowMap.set('ACK407', 'generateAck407');
        sessionModule.flowMap.set('INVITEAUTH', 'generateInviteAuth');
        sessionModule.flowMap.set('403', 'generate403');
    },
    /**
     * @param {{type: string, config?: object}} input
     */
    receiveInput: (input) => {
        if (input.type === "newSession") {
            if (!sessionModule.stopped && !sessionModule.paused) sessionModule.createSession(input.config);
        } else if (input.type === "stop") {
            sessionModule.stopped = true;
        } else if (input.type === "tick") {
            if (!sessionModule.paused) {
              sessionModule.advanceSessions();
            }
        } else if (input.type === "debugSession") {
            sessionModule.debug = true;
        } else if (input.type === 'pause') {
            sessionModule.paused = true;
            console.log('Paused Session Progress due to Backpressure.');
        } else if (input.type === 'unpause') {
            sessionModule.paused = false;
            console.log('Unpaused Session Progress to resume sending.');
        }
    },
    /**
     * @param {SessionState} session
     * @returns {boolean}
     */
    lakeEnabled: (session) => {
        return !!(session.sbcTelemetry && (lakeInfluxModule.enabled() || lakeOtlpModule.enabled()));
    },
    /**
     * Fan-out lifecycle / metric events to configured lake sinks.
     * @param {SessionState} session
     * @param {string} event
     * @param {{detector?: string, withMetrics?: boolean, withLog?: boolean}} [opts]
     */
    emitSbcTelemetry: (session, event, opts = {}) => {
        if (!sessionModule.lakeEnabled(session)) return;
        if (opts.withLog !== false) {
            const message = `SBC callid=${session.callid} event=${event} scenario=${session.scenario}`
                + (opts.detector ? ` detector=${opts.detector}` : '');
            const logEv = {
                callid: session.callid,
                scenario: session.scenario,
                event,
                message,
                detector: opts.detector,
            };
            lakeInfluxModule.emitLog(logEv);
            lakeOtlpModule.emitLog(logEv);
        }
        if (opts.withMetrics !== false) {
            const ips = collectMetricIps({
                rcinfo: session.rcinfo,
                rcinfoB: session.rcinfoB,
                mediaIps: sessionMediaIps(session),
                configIps: session.configIps,
            });
            const metricEv = { ips, scenario: session.scenario };
            lakeInfluxModule.emitMetrics(metricEv);
            lakeOtlpModule.emitMetrics(metricEv);
        }
    },
    /**
     * Emit HEP for one or more capture IDs. buildFn receives a cloned rcinfo with captureId set.
     * @param {SessionState} session
     * @param {import('./hepModule.js').RCINFO} baseRcinfo
     * @param {(rcinfo: import('./hepModule.js').RCINFO) => Buffer} buildFn
     */
    emitHep: (session, baseRcinfo, buildFn) => {
        const captureIds = session.captureIds?.length
            ? session.captureIds
            : [baseRcinfo.captureId];
        for (const captureId of captureIds) {
            const rcinfo = Object.assign({}, baseRcinfo, { captureId });
            const message = buildFn(rcinfo);
            sessionModule.mediator.send({ type: "sendData", data: message });
        }
    },
    /**
     * @param {SessionState} session
     * @param {string} callid
     * @param {import('./hepModule.js').RCINFO} rcinfo
     * @param {import('./hepModule.js').MEDIAINFO} mediaInfo
     */
    emitChosenCandidates: (session, callid, rcinfo, mediaInfo) => {
        sessionModule.emitHep(session, rcinfo, (rc) =>
            hepModule.generateLog100(callid, rc, mediaInfo));
    },
    /**
     * @param {SessionState} session
     * @param {string} callid
     * @param {import('./hepModule.js').RCINFO} rcinfo
     * @param {import('./hepModule.js').MEDIAINFO} mediaInfo
     * @param {{detector: string, reason: string, layer?: string, oneWayRtp?: number, cnOnly?: number}} alarm
     */
    emitMediaAlarm: (session, callid, rcinfo, mediaInfo, alarm) => {
        sessionModule.emitHep(session, rcinfo, (rc) =>
            hepModule.generateMediaAlarmHit(callid, rc, mediaInfo, alarm));
        sessionModule.emitSbcTelemetry(session, 'media_alarm', { detector: alarm.detector, withMetrics: false });
    },
    /**
     * @param {SessionState} session
     * @param {string} callid
     * @param {import('./hepModule.js').RCINFO} rcinfo
     * @param {import('./hepModule.js').MEDIAINFO} mediaInfo
     * @param {boolean} reverse
     */
    emitPeriodicReports: (session, callid, rcinfo, mediaInfo, reverse) => {
        sessionModule.emitHep(session, rcinfo, (rc) =>
            hepModule.generatePeriodicReport(session.seq, session.from, session.to, callid, rc, mediaInfo, reverse));
        sessionModule.emitHep(session, rcinfo, (rc) =>
            hepModule.generatePeriodicReportRTCP(session.seq, session.from, session.to, callid, rc, mediaInfo, reverse));
    },
    /**
     * @param {SessionState} session
     * @param {string} callid
     * @param {import('./hepModule.js').RCINFO} rcinfo
     * @param {import('./hepModule.js').MEDIAINFO} mediaInfo
     * @param {boolean} reverse
     */
    emitEndReports: (session, callid, rcinfo, mediaInfo, reverse) => {
        sessionModule.emitHep(session, rcinfo, (rc) =>
            hepModule.generateHangupReport(session.seq, session.from, session.to, callid, rc, mediaInfo, reverse));
        sessionModule.emitHep(session, rcinfo, (rc) =>
            hepModule.generateHangupReportRTCP(session.seq, session.from, session.to, callid, rc, mediaInfo, reverse));
        sessionModule.emitHep(session, rcinfo, (rc) =>
            hepModule.generateFinalReport(session.seq, session.from, session.to, callid, rc, mediaInfo, reverse));
        sessionModule.emitHep(session, rcinfo, (rc) =>
            hepModule.generateShortHangupReport(session.seq, session.from, session.to, callid, rc, mediaInfo, reverse));
    },
    /**
     * @param {object} config
     * @param {string} scenario
     * @returns {SessionState|null}
     */
    createDualLegSession: (config, scenario) => {
        const sourceIP = utils.pickRandomElement(config.ips);
        if (sourceIP === undefined) {
            console.log("No source IPs provided in config. Cannot generate session with RCInfo.");
            return null;
        }
        const callidA = utils.getRandomCallId();
        const callidB = utils.getRandomCallId();
        const mosRange = config.mos_range || [4.2, 4.4];
        const mosGood = config.mos_good || mosRange;
        const mosDip = config.mos_dip || [2.0, 2.0];
        const captureIds = config.capture_ids || [14520];
        const mediaDirections = (scenario === 'one_way' || scenario === 'media_alarm_silence') ? 1 : 2;
        const sbcIp = '172.26.25.32';
        const peerIp = '156.12.33.56';
        const mediaInfo = createMediaInfo(4.409, 90);
        if (scenario === 'one_way') mediaInfo.one_way_rtp = 1;

        /** @type {SessionState} */
        const session = {
            scenario,
            callid: callidA,
            callidB,
            dualLeg: true,
            captureIds,
            mediaDirections,
            state: [...DUAL_LEG_STATE],
            seq: utils.getRandomInteger(1000, 9999),
            from: utils.getRandomPhoneNumber(),
            to: utils.getRandomPhoneNumber(),
            targetDuration: Math.floor(Math.random() * (config.max_duration - config.min_duration + 1)) + config.min_duration,
            duration: 0,
            media: true,
            sbcTelemetry: !!config.sbc_telemetry,
            fails: false,
            configIps: [...(config.ips || [])],
            mediaAlarms: Array.isArray(config.media_alarms) ? config.media_alarms : [],
            chosenCandidatesSent: false,
            silenceAlarmSent: false,
            shortCallAlarmSent: false,
            oneWayAlarmSent: false,
            mos_range: mosRange,
            mos_good_range: mosGood,
            mos_dip_range: mosDip,
            jitter_range: config.jitter_range || [0.8, 1.2],
            packetloss_range: config.packetloss_range || [0, 1],
            mediaInfo,
            mediaInfoB: createMediaInfo(4.409, 90),
            dialog: createDialog(),
            dialogB: createDialog(),
            rcinfo: hepModule.generateRCInfo(captureIds[0], 'myhep', 1, callidA, 1, sourceIP, sbcIp, 5060, 5061),
            rcinfoB: hepModule.generateRCInfo(captureIds[0], 'myhep', 1, callidA, 1, sbcIp, peerIp, 5061, 5060),
            previous: null,
        };
        if (scenario === 'one_way') session.mediaInfoB.one_way_rtp = 1;
        return session;
    },
    /**
     * @param {{name:string, max_duration?:number, min_duration?:number, mos_range?:number[], jitter_range?:number[], packetloss_range?:number[], ips:string[], capture_ids?:number[], mos_good?:number[], mos_dip?:number[], sbc_telemetry?: boolean, media_alarms?: string[]}} config
     */
    createSession: (config) => {
        if (sessionModule.debug) console.log("Creating new session with config:", config);
        /** @type {SessionState|null} */
        let session = null;

        if (DUAL_LEG_SCENARIOS.has(config.name)) {
            session = sessionModule.createDualLegSession(config, config.name);
            if (!session) return;
            if (config.name === "dual_capture") {
                session.captureIds = config.capture_ids || [14520, 14521];
                session.rcinfo.captureId = session.captureIds[0];
                session.rcinfoB.captureId = session.captureIds[0];
            }
        } else if (config.name === "bad") {
            const sourceIP = utils.pickRandomElement(config.ips);
            if (sourceIP === undefined) {
                console.log("No source IPs provided in config. Cannot generate session with RCInfo.");
                return;
            }
            const callid = utils.getRandomCallId();
            session = {
                scenario: "bad",
                callid,
                dualLeg: false,
                captureIds: [14620],
                mediaDirections: 2,
                state: [...SINGLE_LEG_MEDIA_STATE],
                seq: utils.getRandomInteger(1000, 9999),
                from: utils.getRandomPhoneNumber(),
                to: utils.getRandomPhoneNumber(),
                targetDuration: Math.floor(Math.random() * (config.max_duration - config.min_duration + 1)) + config.min_duration,
                duration: 0,
                media: true,
                sbcTelemetry: !!config.sbc_telemetry,
                fails: false,
                configIps: [...(config.ips || [])],
                mediaAlarms: Array.isArray(config.media_alarms) ? config.media_alarms : [],
                chosenCandidatesSent: false,
                silenceAlarmSent: false,
                shortCallAlarmSent: false,
                oneWayAlarmSent: false,
                mos_range: config.mos_range || [2.8, 3.5],
                mos_good_range: config.mos_range || [2.8, 3.5],
                mos_dip_range: config.mos_range || [2.8, 3.5],
                jitter_range: config.jitter_range || [250, 450],
                packetloss_range: config.packetloss_range || [0, 1],
                mediaInfo: createMediaInfo(3.342, 70),
                dialog: createDialog(),
                rcinfo: hepModule.generateRCInfo(14620, 'myhep', 1, callid, 1, sourceIP, '156.12.33.56', 5060, 5060),
                previous: null,
            };
        } else if (config.name === "403") {
            const sourceIP = utils.pickRandomElement(config.ips);
            if (sourceIP === undefined) {
                console.log("No source IPs provided in config. Cannot generate session with RCInfo.");
                return;
            }
            const callid = utils.getRandomCallId();
            session = {
                scenario: "403",
                callid,
                dualLeg: false,
                captureIds: [14620],
                mediaDirections: 2,
                state: ['INVITE', '407', 'ACK407', 'INVITEAUTH', '403', 'END'],
                seq: utils.getRandomInteger(1000, 9999),
                from: utils.getRandomPhoneNumber(),
                to: utils.getRandomPhoneNumber(),
                media: false,
                sbcTelemetry: !!config.sbc_telemetry,
                fails: true,
                configIps: [...(config.ips || [])],
                mediaAlarms: Array.isArray(config.media_alarms) ? config.media_alarms : [],
                chosenCandidatesSent: false,
                silenceAlarmSent: false,
                shortCallAlarmSent: false,
                oneWayAlarmSent: false,
                targetDuration: Math.floor(Math.random() * ((config.max_duration || 1000) - (config.min_duration || 0) + 1)) + (config.min_duration || 0),
                duration: 0,
                mos_range: [4.2, 4.4],
                mos_good_range: [4.2, 4.4],
                mos_dip_range: [4.2, 4.4],
                jitter_range: [0.8, 1.2],
                packetloss_range: [0, 1],
                mediaInfo: createMediaInfo(4.409, 90),
                dialog: createDialog(),
                rcinfo: hepModule.generateRCInfo(14620, 'myhep', 1, callid, 1, sourceIP, '156.12.33.56', 5060, 5060),
                previous: null,
            };
        } else {
            if (sessionModule.debug) console.log("Unknown session type:", config.name);
            return;
        }

        sessionModule.sessions.push(session);
        sessionModule.emitSbcTelemetry(session, 'start');
    },
    /**
     * Pick MOS/jitter/loss ranges for this media report tick.
     * @param {SessionState} session
     * @returns {{mosRange: number[], jitterRange: number[], lossRange: number[]}}
     */
    resolveMediaRanges: (session) => {
        if (session.scenario === 'mos_dip') {
            const mid = session.targetDuration / 2;
            const inDip = session.duration >= mid && session.duration < mid + 30000;
            if (inDip) {
                return {
                    mosRange: session.mos_dip_range || [2.0, 2.0],
                    jitterRange: [50, 80],
                    lossRange: [20, 40],
                };
            }
            return {
                mosRange: session.mos_good_range || [4.2, 4.2],
                jitterRange: session.jitter_range,
                lossRange: session.packetloss_range,
            };
        }
        return {
            mosRange: session.mos_range,
            jitterRange: session.jitter_range,
            lossRange: session.packetloss_range,
        };
    },
    /**
     * @param {SessionState} session
     */
    updateMediaStats: (session) => {
        const ranges = sessionModule.resolveMediaRanges(session);
        const mos = utils.getRandomFloat(ranges.mosRange[0], ranges.mosRange[1]);
        const jitter = utils.getRandomFloat(ranges.jitterRange[0], ranges.jitterRange[1]);
        const packetloss = utils.getRandomInteger(ranges.lossRange[0], ranges.lossRange[1]);
        session.mediaInfo.mos = mos;
        session.mediaInfo.reportCount = (session.mediaInfo.reportCount || 1) + 1;
        session.mediaInfo.mean_mos = Math.round(((session.mediaInfo.mean_mos * (session.mediaInfo.reportCount - 1)) + mos) / session.mediaInfo.reportCount * 1000) / 1000;
        if (mos < session.mediaInfo.min_mos) session.mediaInfo.min_mos = mos;
        session.mediaInfo.jitter = jitter;
        session.mediaInfo.mean_jitter = Math.round(((session.mediaInfo.mean_jitter * (session.mediaInfo.reportCount - 1)) + jitter) / session.mediaInfo.reportCount * 1000) / 1000;
        if (jitter > session.mediaInfo.max_jitter) session.mediaInfo.max_jitter = jitter;
        session.mediaInfo.total_packets += utils.getRandomInteger(400, 550);
        session.mediaInfo.global_packets += session.mediaInfo.total_packets;
        session.mediaInfo.tl_bytes += utils.getRandomInteger(32000, 44000);
        session.mediaInfo.global_bytes += session.mediaInfo.tl_bytes;
        session.mediaInfo.packetloss += packetloss;
        session.mediaInfo.global_packetloss += packetloss;
        if (session.mediaInfoB) syncMediaQuality(session.mediaInfoB, session.mediaInfo);
    },
    /**
     * @param {SessionState} session
     * @param {string} detector
     */
    wantsAlarm: (session, detector) => {
        if ((session.mediaAlarms || []).includes(detector)) return true;
        if (detector === 'ONE_WAY' && session.scenario === 'one_way') return true;
        if (detector === 'SILENCE' && session.scenario === 'media_alarm_silence') return true;
        if (detector === 'SHORT_CALL' && session.scenario === 'media_alarm_short_call') return true;
        return false;
    },
    /**
     * @param {SessionState} session
     */
    maybeEmitScenarioAlarms: (session) => {
        if (sessionModule.wantsAlarm(session, 'ONE_WAY')
            && !session.oneWayAlarmSent && session.duration >= 4000) {
            session.oneWayAlarmSent = true;
            sessionModule.emitMediaAlarm(session, session.callid, session.rcinfo, session.mediaInfo, {
                detector: 'ONE_WAY',
                reason: 'ONE_WAY',
                layer: 'headers',
                oneWayRtp: 1,
            });
        }

        if (sessionModule.wantsAlarm(session, 'SILENCE')
            && !session.silenceAlarmSent && session.duration >= 5000) {
            session.silenceAlarmSent = true;
            sessionModule.emitMediaAlarm(session, session.callid, session.rcinfo, session.mediaInfo, {
                detector: 'SILENCE',
                reason: 'AUDIO_GAP',
                layer: 'headers',
            });
        }
    },
    advanceSessions: () => {
        let debug = sessionModule.debug;
        if (debug) console.log("Current Sessions in Progress:", sessionModule.sessions.length);
        if (sessionModule.sessions.length === 0) {
            sessionModule.mediator.send({type: "noSessions"});
        } else {
            for (let session of sessionModule.sessions) {
                let currentState = session.state.shift();
                if (currentState === 'MEDIA') {
                    if (!session.previous) {
                        session.previous = Date.now();
                        session.mediaInfo.rtpstart = Date.now();
                        session.mediaInfo.lastReport = Math.floor(Date.now() / 1000);
                        if (!session.mediaInfo.connect_ts_ms) {
                            session.mediaInfo.connect_ts_ms = Date.now();
                        }
                        if (session.mediaInfoB) {
                            session.mediaInfoB.rtpstart = session.mediaInfo.rtpstart;
                            session.mediaInfoB.lastReport = session.mediaInfo.lastReport;
                            session.mediaInfoB.connect_ts_ms = session.mediaInfo.connect_ts_ms;
                        }
                        if (!session.chosenCandidatesSent) {
                            session.chosenCandidatesSent = true;
                            sessionModule.emitChosenCandidates(session, session.callid, session.rcinfo, session.mediaInfo);
                            if (session.dualLeg && session.callidB && session.rcinfoB && session.mediaInfoB) {
                                sessionModule.emitChosenCandidates(session, session.callidB, session.rcinfoB, session.mediaInfoB);
                            }
                            sessionModule.emitSbcTelemetry(session, 'connected');
                        }
                    }
                    session.duration = session.duration + 200;
                    sessionModule.maybeEmitScenarioAlarms(session);
                    if (session.duration >= session.targetDuration) {
                        continue;
                    } else {
                        session.state.unshift('MEDIA');
                        if ((Date.now() - session.previous) > 30000) {
                            sessionModule.updateMediaStats(session);
                            if (mediaHep) {
                                const sendReverse = session.mediaDirections !== 1;
                                sessionModule.emitPeriodicReports(session, session.callid, session.rcinfo, session.mediaInfo, false);
                                if (sendReverse) {
                                    sessionModule.emitPeriodicReports(session, session.callid, session.rcinfo, session.mediaInfo, true);
                                }
                                if (session.dualLeg && session.callidB && session.rcinfoB && session.mediaInfoB) {
                                    sessionModule.emitPeriodicReports(session, session.callidB, session.rcinfoB, session.mediaInfoB, false);
                                    if (sendReverse) {
                                        sessionModule.emitPeriodicReports(session, session.callidB, session.rcinfoB, session.mediaInfoB, true);
                                    }
                                }
                                if (debug) console.log("Generated media reports for session", session.callid);
                            }
                            sessionModule.emitSbcTelemetry(session, 'metrics_tick', { withLog: false });
                            if (debug) console.log("Current duration for session", session.callid, "is", session.duration, "of target", session.targetDuration);
                            session.previous = Date.now();
                            session.mediaInfo.lastReport = Math.floor(Date.now() / 1000);
                            if (session.mediaInfoB) session.mediaInfoB.lastReport = session.mediaInfo.lastReport;
                        }
                    }
                } else if (currentState != 'END' && currentState != 'MEDIA') {
                    const isLegB = currentState.endsWith('_B');
                    const baseState = isLegB ? currentState.slice(0, -2) : currentState;
                    const genName = sessionModule.flowMap.get(baseState);
                    if (!genName || typeof hepModule[genName] !== 'function') {
                        if (debug) console.log("No generator for state", currentState);
                        continue;
                    }
                    const callid = isLegB ? session.callidB : session.callid;
                    const rcinfo = isLegB ? session.rcinfoB : session.rcinfo;
                    const mediaInfo = isLegB ? (session.mediaInfoB || session.mediaInfo) : session.mediaInfo;
                    const dialog = isLegB ? session.dialogB : session.dialog;
                    if (debug) console.log("Session", session.callid, "advancing to state:", currentState, genName);
                    sessionModule.emitHep(session, rcinfo, (rc) =>
                        hepModule[genName](session.seq, session.from, session.to, callid, rc, mediaInfo, dialog));
                    if (!isLegB && baseState === '200OK' && session.media) {
                        if (!session.mediaInfo.connect_ts_ms) {
                            session.mediaInfo.connect_ts_ms = Date.now();
                            if (session.mediaInfoB) session.mediaInfoB.connect_ts_ms = session.mediaInfo.connect_ts_ms;
                        }
                    }
                } else if (currentState === 'END') {
                    if (session.media && mediaHep) {
                        if (sessionModule.wantsAlarm(session, 'SHORT_CALL') && !session.shortCallAlarmSent) {
                            session.shortCallAlarmSent = true;
                            sessionModule.emitMediaAlarm(session, session.callid, session.rcinfo, session.mediaInfo, {
                                detector: 'SHORT_CALL',
                                reason: 'BYE',
                                layer: 'headers',
                            });
                        }
                        const sendReverse = session.mediaDirections !== 1;
                        sessionModule.emitEndReports(session, session.callid, session.rcinfo, session.mediaInfo, false);
                        if (sendReverse) {
                            sessionModule.emitEndReports(session, session.callid, session.rcinfo, session.mediaInfo, true);
                        }
                        if (session.dualLeg && session.callidB && session.rcinfoB && session.mediaInfoB) {
                            sessionModule.emitEndReports(session, session.callidB, session.rcinfoB, session.mediaInfoB, false);
                            if (sendReverse) {
                                sessionModule.emitEndReports(session, session.callidB, session.rcinfoB, session.mediaInfoB, true);
                            }
                        }
                    }
                    if (session.fails) {
                        sessionModule.emitSbcTelemetry(session, 'failure');
                    } else {
                        sessionModule.emitSbcTelemetry(session, 'finished');
                    }
                    if (debug) console.log("Session complete:", session.callid);
                    sessionModule.sessions = sessionModule.sessions.filter(s => s.callid !== session.callid);
                }
            };
        }
    },
}

export default sessionModule;
