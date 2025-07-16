const connectionManager = {
    receiver: process.env.HEP_ADDRESS || '127.0.0.1',
    port: parseInt(process.env.HEP_PORT) || 9060,
    transport: process.env.HEP_TRANSPORT || 'udp',
    socket: null,
    sendData: function (data) {
        console.log('No sender specified, cannot send data', data);
    },
    errorHandler: (err) => {
        console.log('Error sending HEP Packet')
        console.log(err)
    },
    establishConnection: async function () {
        if (this.transport === 'udp') {
            /* assigns a UDP socket to the connectionManager */
            this.socket = await Bun.udpSocket({
                connect: {
                    port: this.port,
                    hostname: this.receiver,
                },
            });
            this.sendData = (data) => {
                let sendSuccess = this.socket.send(data)
                if (!sendSuccess) {
                    /* TODO: make a buffer to store data to send when drain even is called */
                    setTimeout(() => {
                        this.socket.send(data)
                    }, 1000);
                }
            };
            console.log(`UDP socket connected to ${this.receiver}:${this.port}, ${this.socket}`);
        } else if (this.transport === 'tcp') {
            this.socket =  await Bun.connect({
                hostname: this.receiver,
                port: this.port,

                socket: {
                    data(socket, data) {
                        // Handle incoming data
                        console.log('Received data:', data);
                    },
                    open(socket) {
                        console.log(`TCP socket connected to ${this.receiver}:${this.port}`);
                        this.sendData = (data) => {
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
            this.sendData = (data) => {
                this.socket.write(data);
            };
            console.log(`Ready to send data over TCP.`);
        } else {
            console.error('Unsupported transport protocol:', this.transport);
        }
    },
    send: async function (data) {
        if (!this.socket) {
            console.error('Socket is not initialized, establishing connection...');
            try {
                await this.establishConnection();
            } catch (error) {
                console.error('Failed to establish connection:', error);
                return;
            }
            await Bun.sleep(100); // Wait for the connection to be established
        }
        return this.sendData(data);
    }
}






export default connectionManager