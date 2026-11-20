/**
 * Manual validation: TCP connect failure must retry with backoff and recover
 * when a listener appears — without process restart.
 *
 * Usage: bun scripts/validate-reconnect.js
 */
import { createServer } from 'node:net';

const PORT = 19062;
const HOST = '127.0.0.1';

process.env.HEP_ADDRESS = HOST;
process.env.HEP_PORT = String(PORT);
process.env.HEP_TRANSPORT = 'tcp';
process.env.HEP_RECONNECT_MS = '500';

const { default: connectionManager } = await import('../src/connectionManager.js');

const logs = [];
const origLog = console.log;
const origErr = console.error;
console.log = (...args) => {
    logs.push(args.join(' '));
    origLog(...args);
};
console.error = (...args) => {
    logs.push(args.join(' '));
    origErr(...args);
};

const mediator = {
    send: (msg) => {
        logs.push(`mediator:${msg.type}`);
        origLog('mediator', msg.type);
    },
    subscribe: () => {},
};

connectionManager.mediator = mediator;

origLog('--- phase 1: connect while nothing listens ---');
const ok1 = await connectionManager.establishConnection(mediator);
if (ok1) {
    console.error('FAIL: expected connect to fail with no listener');
    process.exit(1);
}
// Simulate queued HEP after a failed send path
connectionManager.enqueue(Buffer.from('hep-probe'));
connectionManager.scheduleReconnect('validate_seed');

await Bun.sleep(1200);

const retryLogs = logs.filter((l) => l.includes('HEP reconnect attempt'));
if (retryLogs.length < 1) {
    console.error('FAIL: expected HEP reconnect attempt logs, got:', logs);
    process.exit(1);
}
origLog(`ok: saw ${retryLogs.length} reconnect attempt log(s)`);

origLog('--- phase 2: start listener, wait for recover ---');
/** @type {import('node:net').Server} */
const server = createServer((socket) => {
    socket.on('data', () => {});
});
await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, resolve);
});

const deadline = Date.now() + 15000;
while (Date.now() < deadline) {
    if (connectionManager.socket && !connectionManager.paused && connectionManager.queue.length === 0) {
        break;
    }
    await Bun.sleep(200);
}

server.close();

const unpaused = logs.some((l) => l.includes('Socket drained, unpausing') || l === 'mediator:unpause');
const stillPaused = connectionManager.paused || connectionManager.queue.length > 0 || !connectionManager.socket;

if (stillPaused || !unpaused) {
    console.error('FAIL: did not recover', {
        paused: connectionManager.paused,
        queue: connectionManager.queue.length,
        hasSocket: !!connectionManager.socket,
        unpaused,
        logs,
    });
    process.exit(1);
}

origLog('PASS: reconnect-after-pause recovered without restart');
connectionManager.clearReconnectTimer();
if (connectionManager.socket) {
    try {
        connectionManager.socket.end?.();
    } catch {
        /* ignore */
    }
    connectionManager.socket = null;
}
process.exit(0);
