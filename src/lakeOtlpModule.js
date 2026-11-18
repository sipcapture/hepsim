import { sampleHostMetrics } from './lakeMetrics.js';

const otlpUrl = process.env.LAKE_OTLP_URL || '';
const timeoutMs = parseInt(process.env.LAKE_OTLP_TIMEOUT_MS || '3000', 10) || 3000;
const debug = !!process.env.DEBUG;

/**
 * @param {string} path
 * @param {object} body
 */
async function postJson(path, body) {
    if (!otlpUrl) return;
    const base = otlpUrl.replace(/\/$/, '');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(`${base}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: ctrl.signal,
        });
        if (!res.ok && debug) {
            console.log('LAKE OTLP write failed', path, res.status, await res.text().catch(() => ''));
        }
    } catch (err) {
        if (debug) console.log('LAKE OTLP write error', path, err);
    } finally {
        clearTimeout(t);
    }
}

/**
 * @param {string} key
 * @param {string|number} value
 */
function attr(key, value) {
    if (typeof value === 'number') {
        return { key, value: { doubleValue: value } };
    }
    return { key, value: { stringValue: String(value) } };
}

const resourceAttrs = [
    attr('service.name', 'hepsim'),
    attr('sbc.name', 'hepsim-sbc'),
];

const lakeOtlpModule = {
    enabled: () => !!otlpUrl,

    /**
     * @param {{callid: string, scenario: string, event: string, message?: string, detector?: string}} ev
     */
    emitLog: (ev) => {
        if (!otlpUrl) return;
        const nowNs = `${Date.now()}000000`;
        const msg = ev.message
            || `SBC callid=${ev.callid} event=${ev.event} scenario=${ev.scenario}`
                + (ev.detector ? ` detector=${ev.detector}` : '');
        /** @type {object[]} */
        const attributes = [
            attr('callid', ev.callid),
            attr('scenario', ev.scenario),
            attr('event', ev.event),
        ];
        if (ev.detector) attributes.push(attr('detector', ev.detector));
        void postJson('/v1/logs', {
            resourceLogs: [{
                resource: { attributes: resourceAttrs },
                scopeLogs: [{
                    scope: { name: 'hepsim' },
                    logRecords: [{
                        timeUnixNano: nowNs,
                        severityText: 'INFO',
                        body: { stringValue: msg },
                        attributes,
                    }],
                }],
            }],
        });
    },

    /**
     * @param {{ips: string[], scenario: string, nowMs?: number}} ev
     */
    emitMetrics: (ev) => {
        if (!otlpUrl) return;
        const nowMs = ev.nowMs || Date.now();
        const nowNs = `${nowMs}000000`;
        /** @type {object[]} */
        const gaugePoints = [];
        for (const ip of ev.ips) {
            const m = sampleHostMetrics(ip, nowMs);
            const dims = [
                attr('ip', ip),
                attr('scenario', ev.scenario),
                attr('host', 'hepsim-sbc'),
            ];
            gaugePoints.push({
                name: 'cpu_pct',
                gauge: {
                    dataPoints: [{
                        asDouble: m.cpu_pct,
                        timeUnixNano: nowNs,
                        attributes: dims,
                    }],
                },
            });
            gaugePoints.push({
                name: 'mem_gb',
                gauge: {
                    dataPoints: [{
                        asDouble: m.mem_gb,
                        timeUnixNano: nowNs,
                        attributes: dims,
                    }],
                },
            });
        }
        void postJson('/v1/metrics', {
            resourceMetrics: [{
                resource: { attributes: resourceAttrs },
                scopeMetrics: [{
                    scope: { name: 'hepsim' },
                    metrics: gaugePoints,
                }],
            }],
        });
    },
};

export default lakeOtlpModule;
