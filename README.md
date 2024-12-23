# hepsim
Simulate varying phone calls by sending HEP for demos and statistics

### Objective

Simulate a variety of calls to demonstrate use cases and statistics.
It generates HEP and sends it based on defined callflows.

### Current Caveats
* Only UDP
* Only simple Flow

### Usage

Simply run after modifying config.json file.    

```js
HEP_ADDRESS=127.0.0.1 PORT=9060 node index.js
```

Utilize the example configuration for a view on how to use it. 

The following callflows are available:
* default - Simple SIP call with media
* auth - Simple SIP call with auth challenge
* registration - Simple SIP registration
* auth_register - Simple SIP registration with auth challenge
* dtmf - Same as default but a DTMF signal (1) is sent before media flows
* timeout408 - A call based on default that receives a 408 as last response

Other scenarios can easily be added by modifying the sessionModule.callFlows object and adding respective functions in the simulationModule.update and hepModule functions.

