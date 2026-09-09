/**
 * Connection Manager Module: Handles the connection to the HEP receiver and manages sending data over UDP or TCP
 * @type {{receiver: string, port: number, transport: string, socket: Bun.Socket<undefined> | Bun.udp.ConnectedSocket<"buffer"> | WebSocket | null, debug: boolean, mediator: import('./simulationModule.js').MediatorInterface, queue: (Buffer|Uint8Array|string)[], paused: boolean, subscribed: boolean, connecting: boolean, sendData: function(Buffer|Uint8Array|string): void, errorHandler: function(Error): void, handleModuleMessage: function({type: string, data: any, config: {}}): void, establishConnection: function(import('./simulationModule.js').MediatorInterface): Promise<boolean>, send: function(Buffer|Uint8Array|string): Promise<void>, enqueue: function(Buffer|Uint8Array|string): void, pause: function(): void, unpause: function(): void, flushQueue: function(): void, trySend: function(Buffer|Uint8Array|string): boolean, reconnect: function(): void}}
 */
const connectionManager = {
    receiver: process.env.HEP_ADDRESS || '127.0.0.1',
    port: parseInt(process.env.HEP_PORT) || 9060,
    transport: process.env.HEP_TRANSPORT || 'udp',
    socket: null,
    debug: false,
    /** @type {(Buffer|Uint8Array|string)[]} */
    queue: [],
    paused: false,
    subscribed: false,
    connecting: false,
    /**
     * @type {import('./simulationModule.js').MediatorInterface}
     */
    mediator: {send: () => {}, subscribe: () => {}},
    /**
     * @param {Error} err
     */
    errorHandler: (err) => {
        if (connectionManager.debug) console.log('Error sending HEP Packet')
        if (connectionManager.debug) console.log(err)
    },
    /**
     * Publish pause to the mediator if not already paused.
     */
    pause: () => {
        if (connectionManager.paused) return;
        connectionManager.paused = true;
        console.log(`Socket backpressure, queue length ${connectionManager.queue.length}, pausing session progress`);
        connectionManager.mediator.send({type: 'pause'});
    },
    /**
     * Publish unpause to the mediator if currently paused and the queue is empty.
     */
    unpause: () => {
        if (!connectionManager.paused) return;
        if (connectionManager.queue.length > 0) return;
        connectionManager.paused = false;
        console.log('Socket drained, unpausing session progress');
        connectionManager.mediator.send({type: 'unpause'});
    },
    /**
     * Enqueue a HEP buffer and pause production.
     * @param {Buffer|Uint8Array|string} buf
     */
    enqueue: (buf) => {
        connectionManager.queue.push(buf);
        connectionManager.pause();
    },
    /**
     * Attempt to send one buffer on the current socket.
     * @param {Buffer|Uint8Array|string} data
     * @returns {boolean} true if fully sent, false if queued remainder / reconnect needed
     */
    trySend: (data) => {
        if (!connectionManager.socket) {
            connectionManager.enqueue(data);
            connectionManager.reconnect();
            return false;
        }
        if (connectionManager.transport === 'udp') {
            let sendSuccess = connectionManager.socket.send(data);
            if (!sendSuccess) {
                connectionManager.enqueue(data);
                return false;
            }
            return true;
        }
        // TCP
        let wrote = connectionManager.socket.write(data);
        if (wrote === -1) {
            // Socket closed: keep the full packet and reconnect
            connectionManager.enqueue(data);
            connectionManager.reconnect();
            return false;
        }
        let byteLength = typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength;
        if (wrote < byteLength) {
            let remainder = typeof data === 'string'
                ? Buffer.from(data).subarray(wrote)
                : data.subarray(wrote);
            connectionManager.enqueue(remainder);
            return false;
        }
        return true;
    },
    /**
     * Flush queued HEP buffers; unpause only when the queue is empty.
     */
    flushQueue: () => {
        if (connectionManager.debug) console.log('Flushing send queue, length', connectionManager.queue.length);
        while (connectionManager.queue.length > 0) {
            let next = connectionManager.queue[0];
            if (connectionManager.transport === 'udp') {
                if (!connectionManager.socket) break;
                let sendSuccess = connectionManager.socket.send(next);
                if (!sendSuccess) break;
                connectionManager.queue.shift();
            } else {
                // TCP
                if (!connectionManager.socket) break;
                let wrote = connectionManager.socket.write(next);
                if (wrote === -1) {
                    connectionManager.reconnect();
                    break;
                }
                let byteLength = typeof next === 'string' ? Buffer.byteLength(next) : next.byteLength;
                if (wrote === 0) {
                    break;
                }
                if (wrote < byteLength) {
                    connectionManager.queue[0] = typeof next === 'string'
                        ? Buffer.from(next).subarray(wrote)
                        : next.subarray(wrote);
                    break;
                }
                connectionManager.queue.shift();
            }
        }
        if (connectionManager.queue.length === 0) {
            connectionManager.unpause();
        }
    },
    /**
     * Send HEP data: preserve order via queue; enqueue on backpressure.
     * @param {Buffer|Uint8Array|string} data
     */
    sendData: (data) => {
        if (connectionManager.queue.length > 0) {
            connectionManager.enqueue(data);
            return;
        }
        connectionManager.trySend(data);
    },
    /**
     * Reconnect after close/error, guarded against stacked reconnects.
     */
    reconnect: () => {
        if (connectionManager.connecting) return;
        if (connectionManager.debug) console.log('Scheduling reconnect...');
        connectionManager.establishConnection(connectionManager.mediator);
    },
    /**
     * @param {{type: string, data: any, config: {}}} input
     */
    handleModuleMessage: (input) => {
        if (input.type === "sendData") {
            if (connectionManager.debug) console.log('Sending data through connection manager');
            connectionManager.send(input.data);
        } else if (input.type === "disconnect") {
            if (connectionManager.socket) {
                if (connectionManager.debug) console.log('Disconnecting socket');
                connectionManager.socket = null;
            }
        } else if (input.type === "debugConnection") {
            connectionManager.debug = true;
        }
    },
    /**
     * @param {import('./simulationModule.js').MediatorInterface} mediator
     * @returns {Promise<boolean>}
     */
    establishConnection: async (mediator) => {
        if (connectionManager.connecting) return false;
        connectionManager.connecting = true;
        connectionManager.mediator = mediator;
        if (!connectionManager.subscribed) {
            connectionManager.mediator.subscribe(connectionManager.handleModuleMessage);
            connectionManager.subscribed = true;
        }
        try {
            if (connectionManager.transport === 'udp') {
                connectionManager.socket = await Bun.udpSocket({
                    connect: {
                        port: connectionManager.port,
                        hostname: connectionManager.receiver,
                    },
                    socket: {
                        drain(socket) {
                            if (connectionManager.debug) console.log('!!! UDP socket buffer drained');
                            connectionManager.flushQueue();
                        },
                    },
                });
                if (connectionManager.debug) console.log(`UDP socket connected to ${connectionManager.receiver}:${connectionManager.port}`);
                connectionManager.connecting = false;
                connectionManager.flushQueue();
                return true;
            } else if (connectionManager.transport === 'tcp') {
                connectionManager.socket = await Bun.connect({
                    hostname: connectionManager.receiver,
                    port: connectionManager.port,
                    socket: {
                        data(socket, data) {
                            if (connectionManager.debug) console.log('Received data:', data);
                        },
                        open(socket) {
                            if (connectionManager.debug) console.log(`TCP socket connected to ${connectionManager.receiver}:${connectionManager.port}`);
                        },
                        close(socket, error) {
                            connectionManager.socket = null;
                            if (error) {
                                console.error('Connection closed with error:', error);
                            } else if (connectionManager.debug) {
                                console.log('Connection closed gracefully');
                            }
                            connectionManager.reconnect();
                        },
                        drain(socket) {
                            if (connectionManager.debug) console.log('!!! TCP socket buffer drained');
                            connectionManager.flushQueue();
                        },
                        error(socket, error) {
                            console.error('Socket error:', error);
                        },
                        connectError(socket, error) {
                            console.error('Connection error:', error);
                            connectionManager.connecting = false;
                            connectionManager.socket = null;
                        },
                        end(socket) {
                            if (connectionManager.debug) console.log('Connection ended by server');
                            connectionManager.socket = null;
                            connectionManager.reconnect();
                        },
                        timeout(socket) {
                            if (connectionManager.debug) console.log('Connection timed out');
                            connectionManager.socket = null;
                            connectionManager.reconnect();
                        },
                    },
                });
                if (connectionManager.debug) console.log(`Ready to send data over TCP.`);
                connectionManager.connecting = false;
                connectionManager.flushQueue();
                return true;
            } else {
                console.error('Unsupported transport protocol:', connectionManager.transport);
                connectionManager.connecting = false;
                return false;
            }
        } catch (error) {
            console.error('Failed to establish connection:', error);
            connectionManager.connecting = false;
            connectionManager.socket = null;
            return false;
        }
    },
    /**
     * @param {Buffer|Uint8Array|string} data
     */
    send: async (data) => {
        if (!connectionManager.socket && !connectionManager.connecting) {
            console.error('Socket is not initialized, establishing connection...');
            try {
                await connectionManager.establishConnection(connectionManager.mediator);
            } catch (error) {
                console.error('Failed to establish connection:', error);
                connectionManager.enqueue(data);
                return;
            }
        }
        return connectionManager.sendData(data);
    }
}

export default connectionManager
