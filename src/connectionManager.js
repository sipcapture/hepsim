/**
 * Connection Manager Module: Handles the connection to the HEP receiver and manages sending data over UDP or TCP
 * @type {{receiver: string, port: number, transport: string, socket: Bun.Socket<undefined> | Bun.udp.ConnectedSocket<"buffer"> | WebSocket | null, debug: boolean, mediator: import('./simulationModule.js').MediatorInterface, sendData: function(string): void, errorHandler: function(Error): void, handleModuleMessage: function({type: string, data: string, config: {}}): void, establishConnection: function(import('./simulationModule.js').MediatorInterface): Promise<boolean>, send: function(string): Promise<void>}}
 */
const connectionManager = {
    receiver: process.env.HEP_ADDRESS || '127.0.0.1',
    port: parseInt(process.env.HEP_PORT) || 9060,
    transport: process.env.HEP_TRANSPORT || 'udp',
    socket: null,
    debug: false,
    /**
     * @type {import('./simulationModule.js').MediatorInterface}
     */
    mediator: {send: () => {}, subscribe: () => {}},
    /**
     * @param {string} data 
     */
    sendData: function (data) {
        if (connectionManager.debug) console.log('No sender specified, cannot send data', data);
    },
    /**
     * @param {Error} err 
     */
    errorHandler: (err) => {
        if (connectionManager.debug) console.log('Error sending HEP Packet')
        if (connectionManager.debug) console.log(err)
    },
    /**
     * 
     * @param {{type: string, data: string, config: {}}} input 
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
     * 
     * @param {import('./simulationModule.js').MediatorInterface} mediator 
     * @returns 
     */
    establishConnection: async (mediator) => {
        connectionManager.mediator = mediator;
        connectionManager.mediator.subscribe(connectionManager.handleModuleMessage.bind(this));
        if (connectionManager.transport === 'udp') {
            /* assigns a UDP socket to the connectionManager */
            connectionManager.socket = await Bun.udpSocket({
                connect: {
                    port: connectionManager.port,
                    hostname: connectionManager.receiver,
                },
            });
            connectionManager.sendData = (data) => {
                let sendSuccess = connectionManager.socket.send(data)
                if (!sendSuccess) {
                    /* TODO: make a buffer to store data to send when drain event is called */
                    setTimeout(() => {
                        connectionManager.socket.send(data)
                    }, 1000);
                }
            };
            if (connectionManager.debug) console.log(`UDP socket connected to ${connectionManager.receiver}:${connectionManager.port}, ${connectionManager.socket}`);
            return true;
        } else if (connectionManager.transport === 'tcp') {
            connectionManager.socket =  await Bun.connect({
                hostname: connectionManager.receiver,
                port: connectionManager.port,

                socket: {
                    data(socket, data) {
                        // Handle incoming data
                        if (connectionManager.debug) console.log('Received data:', data);
                    },
                    open(socket) {
                        if (connectionManager.debug) console.log(`TCP socket connected to ${connectionManager.receiver}:${connectionManager.port}`);
                        connectionManager.sendData = (data) => {
                            socket.write(data);
                        };
                    },
                    close(socket, error) {
                        if (error) {
                            console.error('Connection closed with error:', error);
                            connectionManager.establishConnection(connectionManager.mediator);
                        } else {
                            if (connectionManager.debug) console.log('Connection closed gracefully');
                            connectionManager.establishConnection(connectionManager.mediator);
                        }
                    },
                    drain(socket) {
                        if (connectionManager.debug) console.log('!!! Socket buffer drained');
                        connectionManager.mediator.send({type: 'unpause'});
                    },
                    error(socket, error) {
                        console.error('Socket error:', error);
                    },
                    connectError(socket, error) {
                        console.error('Connection error:', error);
                    },
                    end(socket) {
                        if (connectionManager.debug) console.log('Connection ended by server');
                        connectionManager.establishConnection(connectionManager.mediator);
                    },
                    timeout(socket) {
                        if (connectionManager.debug) console.log('Connection timed out');
                        connectionManager.establishConnection(connectionManager.mediator);
                    }, // connection timed out
                },
            });
            connectionManager.sendData = (data) => {
                let success = connectionManager.socket.write(data);
                if (success < 1) {
                    console.log('TCP socket buffer full, waiting for drain event');
                    connectionManager.mediator.send({type: 'pause'});
                }
            };
            if (connectionManager.debug) console.log(`Ready to send data over TCP.`);
            return true;
        } else {
            console.error('Unsupported transport protocol:', connectionManager.transport);
            return false;
        }
    },
    /**
     * 
     * @param {string} data 
     * @returns 
     */
    send: async (data) => {
        if (!connectionManager.socket) {
            console.error('Socket is not initialized, establishing connection...');
            try {
                await connectionManager.establishConnection(connectionManager.mediator);
            } catch (error) {
                console.error('Failed to establish connection:', error);
                return;
            }
            await Bun.sleep(100); // Wait for the connection to be established
        }
        return connectionManager.sendData(data);
    }
}






export default connectionManager
