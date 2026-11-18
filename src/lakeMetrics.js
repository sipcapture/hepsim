/**
 * Predictable SBC host gauges for lake telemetry (Influx + OTLP).
 * Seeded by IP + 30s time bucket so series are stable with occasional bad spikes.
 */

/**
 * @param {string} ip
 * @param {number} [nowMs]
 * @returns {number} 0..2^32-1 style hash
 */
function hashSeed(ip, nowMs = Date.now()) {
    const bucket = Math.floor(nowMs / 30000);
    const s = `${ip}|${bucket}`;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/**
 * Unit float in [0, 1) from seed.
 * @param {number} seed
 * @param {number} salt
 */
function unit(seed, salt) {
    const x = Math.imul(seed ^ (salt * 0x9e3779b9), 0x85ebca6b) >>> 0;
    return (x % 10000) / 10000;
}

/**
 * @param {string} ip
 * @param {number} [nowMs]
 * @returns {{cpu_pct: number, mem_gb: number}}
 */
export function sampleHostMetrics(ip, nowMs = Date.now()) {
    const seed = hashSeed(ip || '0.0.0.0', nowMs);
    const badCpu = unit(seed, 1) < 0.1;
    const badMem = unit(seed, 2) < 0.1;
    const cpu_pct = badCpu
        ? Math.round((85 + unit(seed, 3) * 15) * 10) / 10
        : Math.round((15 + unit(seed, 4) * 30) * 10) / 10;
    const mem_gb = badMem
        ? Math.round((14 + unit(seed, 5) * 2) * 10) / 10
        : Math.round((4 + unit(seed, 6) * 4) * 10) / 10;
    return {
        cpu_pct: Math.min(100, Math.max(0, cpu_pct)),
        mem_gb: Math.min(16, Math.max(1, mem_gb)),
    };
}

/**
 * Prefer media endpoint IP, then signaling src, then first config IP.
 * @param {{rcinfo?: {srcIp?: string, dstIp?: string}, mediaIps?: string[], configIps?: string[]}} sessionish
 * @returns {string}
 */
export function preferMetricIp(sessionish) {
    if (sessionish.mediaIps?.length) return sessionish.mediaIps[0];
    if (sessionish.rcinfo?.srcIp) return sessionish.rcinfo.srcIp;
    if (sessionish.rcinfo?.dstIp) return sessionish.rcinfo.dstIp;
    if (sessionish.configIps?.length) return sessionish.configIps[0];
    return '0.0.0.0';
}

/**
 * Collect distinct IPs to tag metrics with (media first, then scenario/signaling).
 * @param {{rcinfo?: {srcIp?: string, dstIp?: string}, rcinfoB?: {srcIp?: string, dstIp?: string}, mediaIps?: string[], configIps?: string[]}} sessionish
 * @returns {string[]}
 */
export function collectMetricIps(sessionish) {
    /** @type {string[]} */
    const out = [];
    const add = (ip) => {
        if (ip && !out.includes(ip)) out.push(ip);
    };
    for (const ip of sessionish.mediaIps || []) add(ip);
    add(sessionish.rcinfo?.srcIp);
    add(sessionish.rcinfo?.dstIp);
    add(sessionish.rcinfoB?.srcIp);
    add(sessionish.rcinfoB?.dstIp);
    for (const ip of sessionish.configIps || []) add(ip);
    if (out.length === 0) out.push('0.0.0.0');
    return out;
}
