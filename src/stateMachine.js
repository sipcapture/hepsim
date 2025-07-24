/**
 * Manage call flows over an infrastructure via state machine.
 */

/**
 * @typedef {{callState: string, location: number, callinfo: {callid: string, from: string , to: string}, mediaInfo: {mos: float, mean_mos: float, jitter: float, mean_jitter: float, packetloss: integer, mean_rfactor: float, direction: number}, locations: string[], infrastructure: object}} SessionState
 */


const stateMachine = {
    /**
     * Get an initial state of a call.
     * @returns {SessionState}
     */
    getInitialState: () => {
        return {
            callState: 'CALLING',
            location: 0,
            authenticated: false,
            callinfo:{
                callid: 'callid',
                from: 'caller',
                to: 'called',
            },
            mediaInfo: {
                mos: 4.0, 
                mean_mos: 4.0, 
                jitter: 0.0, 
                mean_jitter: 0.0, 
                packetloss: 0, 
                mean_rfactor: 97.5, 
                direction: 0,
            }
        }
    },
    getNextState: (state) => {
        console.log("🔀 Navigating call state from", state.session.callState);
        let newState = {...state};
        switch (state.session.callState) {
            /* INVITE + 100*/
            case 'CALLING':
                if (state.session.locations[state.session.location] != 'called') {
                    /* check if target is an auth proxy */
                    /* setup source and destination ips for hep */
                    /* send invite and 100 (in reverse direction) */
                    newState.session.location++;
                    return newState;

                } else if (state.session.locations[state.session.location] == 'called') {
                    /* Move to 180 */
                    newState.session.callState = 'RINGING';
                    return newState;
                }
            /* 407 */
            case 'CHALLENGED':
                if (state.session.locations[state.session.location] != 'caller') {
                    /* Flow back with 407s */
                    newState.session.location--;
                    return newState;
                } else if (state.session.locations[state.session.location] == 'caller') {
                    /* Move to INVITE AUTH */
                    newState.session.callState = 'AUTH';
                    return newState;
                }
            /* INVITE Auth */
            case 'AUTH':
                if (state.session.locations[state.session.location] != 'loadbalancer') {
                    /* Move auth info until proxy */
                    newState.session.location++;
                    /* At proxy location move back to 'Calling state */
                    newState.session.callState = 'CALLING';
                    return newState;
                } else if (state.session.locations[state.session.location] == 'loadbalancer') {
                    /* Move to 180 */
                    newState.session.callState = 'RINGING';
                    return newState;
                }
            /* 180 */
            case 'RINGING':
                if (state.session.locations[state.session.location] != 'caller') {
                    newState.session.location--;
                    return newState;
                } else if (state.session.locations[state.session.location] == 'caller') {
                    /* Move location to final destination 'called' */
                    /* Move to 200 OK */
                    newState.session.callState = 'ANSWERED';
                    return newState;
                }
            /* 200 OK */
            case 'ANSWERED':
                if (state.session.locations[state.session.location] != 'caller') {
                    newState.session.location--;
                    return newState;
                } else if (state.session.locations[state.session.location] == 'caller') {
                    /* Move to ACK */
                    newState.session.callState = 'CONNECTED';
                    return newState;
                }
            /* ACK */
            case 'CONNECTED':
                if (state.session.locations[state.session.location] != 'called') {
                    newState.session.location++;
                    return newState;
                } else if (state.session.locations[state.session.location] == 'called') {
                    return newState;
                }
            /* QOS */
            case 'MEDIA':
                return newState;
            
            /* BYE */
            case 'HANGUP':
                if (state.session.locations[state.session.location] != 'caller') {
                    newState.session.location--;
                    return newState;
                } else if (state.session.locations[state.session.location] == 'caller') {
                    newState.session.callState = 'FINISHED';
                    return newState;
                }
            /* 200 OK BYE / Hangup Media*/
            case 'FINISHED':
                if (state.session.locations[state.session.location] != 'called') {
                    newState.session.location++;
                    return newState;
                } else if (state.session.locations[state.session.location] == 'called') {
                    return newState;
                }
            case 'SLEEPING':
                if (state.session.locations[state.session.location] != 'caller') {
                    newState.session.location--;
                    return newState;
                } else if (state.session.locations[state.session.location] == 'caller') {
                    return newState;
                }
        }
    }
}

export default stateMachine;