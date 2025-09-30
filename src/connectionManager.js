const connectionManager = {
    receiver: process.env.HEP_ADDRESS || '127.0.0.1',
    port: parseInt(process.env.HEP_PORT) || 9060,
    transport: process.env.HEP_TRANSPORT || 'udp',
    socket: null,
    mediator: {},
    sendData: function (data) {
        console.log('No sender specified, cannot send data', data);
    },
    errorHandler: (err) => {
        console.log('Error sending HEP Packet')
        console.log(err)
    },
    handleModuleMessage: (input) => {
        if (input.type === "sendData") {
            connectionManager.send(input.data);
        } else if (input.type === "disconnect") {
            if (connectionManager.socket) {
                console.log('Disconnecting socket');
                connectionManager.socket = null;
            }
        }
    },
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
            console.log(`UDP socket connected to ${connectionManager.receiver}:${connectionManager.port}, ${connectionManager.socket}`);
            return true;
        } else if (connectionManager.transport === 'tcp') {
            connectionManager.socket =  await Bun.connect({
                hostname: connectionManager.receiver,
                port: connectionManager.port,

                socket: {
                    data(socket, data) {
                        // Handle incoming data
                        console.log('Received data:', data);
                    },
                    open(socket) {
                        console.log(`TCP socket connected to ${connectionManager.receiver}:${connectionManager.port}`);
                        connectionManager.sendData = (data) => {
                            socket.write(data);
                        };
                    },
                    close(socket, error) {
                        if (error) {
                            console.error('Connection closed with error:', error);
                        } else {
                            console.log('Connection closed gracefully');
                        }
                    },
                    drain(socket) {
                        console.log('Socket buffer drained');
                    },
                    error(socket, error) {
                        console.error('Socket error:', error);
                    },
                    // client-specific handlers
                    connectError(socket, error) {
                        console.error('Connection error:', error);
                    }, // connection failed
                    end(socket) {
                        console.log('Connection ended by server');
                    }, // connection closed by server
                    timeout(socket) {
                        console.log('Connection timed out');
                    }, // connection timed out
                },
            });
            connectionManager.sendData = (data) => {
                connectionManager.socket.write(data);
            };
            console.log(`Ready to send data over TCP.`);
            return true;
        } else {
            console.error('Unsupported transport protocol:', connectionManager.transport);
            return false;
        }
    },
    send: async (data) => {
        if (!connectionManager.socket) {
            console.error('Socket is not initialized, establishing connection...');
            try {
                await connectionManager.establishConnection();
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