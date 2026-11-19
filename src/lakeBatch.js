const debug = !!process.env.DEBUG;

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_BATCH_MS = 1000;

/**
 * @returns {{ maxSize: number, maxWaitMs: number }}
 */
export function lakeBatchDefaults() {
    const maxSize = parseInt(process.env.LAKE_BATCH_SIZE || String(DEFAULT_BATCH_SIZE), 10);
    const maxWaitMs = parseInt(process.env.LAKE_BATCH_MS || String(DEFAULT_BATCH_MS), 10);
    return {
        maxSize: Number.isFinite(maxSize) && maxSize > 0 ? maxSize : DEFAULT_BATCH_SIZE,
        maxWaitMs: Number.isFinite(maxWaitMs) && maxWaitMs > 0 ? maxWaitMs : DEFAULT_BATCH_MS,
    };
}

/** @type {Set<{ flush: () => Promise<void> }>} */
const registered = new Set();
let hooksInstalled = false;

function installExitHooks() {
    if (hooksInstalled) return;
    hooksInstalled = true;
    const drain = () => {
        for (const b of registered) {
            void b.flush();
        }
    };
    process.on('beforeExit', drain);
    process.on('SIGINT', () => {
        drain();
    });
    process.on('SIGTERM', () => {
        drain();
    });
}

/**
 * @template T
 * @param {{ maxSize?: number, maxWaitMs?: number, flush: (items: T[]) => void | Promise<void> }} opts
 */
export function createBatcher(opts) {
    const defaults = lakeBatchDefaults();
    const maxSize = opts.maxSize ?? defaults.maxSize;
    const maxWaitMs = opts.maxWaitMs ?? defaults.maxWaitMs;
    /** @type {T[]} */
    let items = [];
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timer = null;
    /** @type {Promise<void> | null} */
    let inflight = null;

    const clearTimer = () => {
        if (timer != null) {
            clearTimeout(timer);
            timer = null;
        }
    };

    const flush = async () => {
        clearTimer();
        if (items.length === 0) return;
        const batch = items;
        items = [];
        try {
            inflight = Promise.resolve(opts.flush(batch));
            await inflight;
        } catch (err) {
            if (debug) console.log('LAKE batch flush error', err);
        } finally {
            inflight = null;
        }
    };

    const armTimer = () => {
        if (timer != null) return;
        timer = setTimeout(() => {
            timer = null;
            void flush();
        }, maxWaitMs);
        if (typeof timer === 'object' && timer && 'unref' in timer) {
            timer.unref();
        }
    };

    const batcher = {
        /**
         * @param {T} item
         */
        push(item) {
            const wasEmpty = items.length === 0;
            items.push(item);
            if (items.length >= maxSize) {
                void flush();
                return;
            }
            if (wasEmpty) armTimer();
        },
        flush,
    };

    registered.add(batcher);
    installExitHooks();
    return batcher;
}
