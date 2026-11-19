import { sampleHostMetrics } from './lakeMetrics.js';
import { createBatcher } from './lakeBatch.js';

const influxUrl = process.env.LAKE_INFLUX_URL || '';
const influxBucket = process.env.LAKE_INFLUX_BUCKET || 'default';
const influxToken = process.env.LAKE_INFLUX_TOKEN || '';
const debug = !!process.env.DEBUG;

/**
 * Escape an Influx tag/field key or tag value.
 * @param {string} s
 */
function escapeTag(s) {
    return String(s).replace(/([,= ])/g, '\\$1');
}

/**
 * Escape an Influx string field value (quoted).
 * @param {string} s
 */
function escapeFieldString(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * @param {string} body
 */
async function postLp(body) {
    if (!influxUrl) return;
    const base = influxUrl.replace(/\/$/, '');
    const url = `${base}/api/v2/write?bucket=${encodeURIComponent(influxBucket)}&precision=ns`;
    /** @type {Record<string, string>} */
    const headers = { 'Content-Type': 'text/plain; charset=utf-8' };
    if (influxToken) headers.Authorization = `Token ${influxToken}`;
    try {
        const res = await fetch(url, { method: 'POST', headers, body });
        if (!res.ok && debug) {
            console.log('LAKE Influx write failed', res.status, await res.text().catch(() => ''));
        }
    } catch (err) {
        if (debug) console.log('LAKE Influx write error', err);
    }
}

/** @type {ReturnType<typeof createBatcher<string>> | null} */
let lineBatcher = null;

function getLineBatcher() {
    if (!lineBatcher) {
        lineBatcher = createBatcher({
            /**
             * @param {string[]} lines
             */
            flush: (lines) => postLp(lines.join('\n')),
        });
    }
    return lineBatcher;
}

const lakeInfluxModule = {
    enabled: () => !!influxUrl,

    /**
     * @param {{callid: string, scenario: string, event: string, message?: string, detector?: string}} ev
     */
    emitLog: (ev) => {
        if (!influxUrl) return;
        const msg = ev.message
            || `SBC callid=${ev.callid} event=${ev.event} scenario=${ev.scenario}`
                + (ev.detector ? ` detector=${ev.detector}` : '');
        const ns = `${Date.now()}000000`;
        const line = [
            'sbc_logs',
            `host=${escapeTag('hepsim-sbc')}`,
            `source=${escapeTag('telegraf')}`,
            `sourcetype=${escapeTag('sbc_syslog')}`,
            `callid=${escapeTag(ev.callid)}`,
            `scenario=${escapeTag(ev.scenario)}`,
            `event=${escapeTag(ev.event)}`,
        ].join(',') + ` message="${escapeFieldString(msg)}" ${ns}`;
        getLineBatcher().push(line);
    },

    /**
     * @param {{ips: string[], scenario: string, nowMs?: number}} ev
     */
    emitMetrics: (ev) => {
        if (!influxUrl) return;
        const nowMs = ev.nowMs || Date.now();
        const ns = `${nowMs}000000`;
        const batcher = getLineBatcher();
        for (const ip of ev.ips) {
            const m = sampleHostMetrics(ip, nowMs);
            batcher.push(
                [
                    'sbc_metrics',
                    `host=${escapeTag('hepsim-sbc')}`,
                    `agent=${escapeTag('telegraf')}`,
                    `ip=${escapeTag(ip)}`,
                    `scenario=${escapeTag(ev.scenario)}`,
                ].join(',') + ` cpu_pct=${m.cpu_pct},mem_gb=${m.mem_gb} ${ns}`
            );
        }
    },
};

export default lakeInfluxModule;
