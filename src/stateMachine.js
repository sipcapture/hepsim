/**
 * Manage call flows over an infrastructure via state machine.
 */


const stateMachine = {
    /**
     * Get an initial state of a call.
     * @returns {{callState: string, location: string, callinfo: {callid: string, from: string , to: string}, mediaInfo: {mos: float, mean_mos: float, jitter: float, mean_jitter: float, packetloss: integer, mean_rfactor: float, direction: number}}}
     */
    getInitialState: () => {
        return {
            callState: 'CALLING',
            location: 'caller',
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
    getNextState: (state, infrastructure) => {
        let newState = {...state};
        switch (state.callState) {
            /* INVITE + 100*/
            case 'CALLING':
                if (state.location != 'called') {
                    newState.location = infrastructure.next(state.location);
                } else if (state.location == 'called') {
                
                }
            case 'CHALLENGED':
                if (state.location != 'caller') {
                    newState.location = infrastructure.previous(state.location);
                } else if (state.location == 'caller') {
            
                }
            case 'AUTH':
                if (state.location != 'auth') {
                    newState.location = infrastructure.next(state.location);
                } else if (state.location == 'auth') {
            
                }
            /* 180 */
            case 'RINGING':
                if (state.location != 'caller') {
                    newState.location = infrastructure.previous(state.location);
                } else if (state.location == 'caller') {
                
                }
            /* 200 OK */
            case 'ANSWERED':
                if (state.location != 'caller') {
                    newState.location = infrastructure.previous(state.location);
                } else if (state.location == 'caller') {
                
                }
            /* ACK */
            case 'CONNECTED':
                if (state.location != 'called') {
                    newState.location = infrastructure.next(state.location);
                } else if (state.location == 'called') {
                
                }
            /* QOS */
            case 'MEDIA':
            
            /* BYE */
            case 'HANGUP':
                if (state.location != 'caller') {
                    newState.location = infrastructure.previous(state.location);
                } else if (state.location == 'caller') {
                
                }
            /* 200 OK BYE / Hangup Media*/
            case 'FINISHED':
                if (state.location != 'called') {
                    newState.location = infrastructure.next(state.location);
                } else if (state.location == 'called') {
                
                }
        }
    }
}

export default stateMachine;