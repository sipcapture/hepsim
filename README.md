# expsuehep
Simulate varying phone calls by sending HEP for demos and statistics

### Objective

Simulate a variety of calls to demonstrate use cases and statistics.
It generates HEP and sends it based on defined callflows.

### Current Caveats
* Only UDP
* Only simple Flow
* Not yet repeating
* No media reports yet

### Usage

Simply run after modifying config.json file.    

```js
HEP_ADDRESS=127.0.0.1 PORT=9060 node index.js
```

