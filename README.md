# hepsim
Simulate varying phone calls by sending HEP for demos and statistics

### Objective

Simulate a variety of calls to demonstrate use cases and statistics.
It generates HEP and sends it based on defined callflows.

### Current Caveats
* Only simple Flow

### Usage

Copy `config.json.example` to `config.json` and modify as needed. If `config.json` is not found, the example configuration is used as a fallback.

Run with [Bun](https://bun.sh):

```sh
HEP_ADDRESS=127.0.0.1 HEP_PORT=9060 bun index.js
```

#### Environment Variables

| Variable        | Default     | Description                        |
|-----------------|-------------|------------------------------------|
| `HEP_ADDRESS`   | `127.0.0.1` | HEP receiver address               |
| `HEP_PORT`      | `9060`      | HEP receiver port                  |
| `HEP_TRANSPORT` | `udp`       | Transport protocol (`udp`)         |
| `DEBUG`         | _(unset)_   | Enable debug session and logging   |

The following callflows are available:
* default - Simple SIP call with media
* auth - Simple SIP call with auth challenge
* registration - Simple SIP registration
* auth_register - Simple SIP registration with auth challenge
* dtmf - Same as default but a DTMF signal (1) is sent before media flows
* timeout408 - A call based on default that receives a 408 as last response

Other scenarios can easily be added by modifying the sessionModule.callFlows object and adding respective functions in the simulationModule.update and hepModule functions.

### Docker

A pre-built image is available on the GitHub Container Registry. Use the provided `docker-compose.yml` as a starting point:

```yaml
services:
  hepsim:
    image: ghcr.io/sipcapture/hepsim:0.7.2
    container_name: hepsim
    environment:
      - HEP_ADDRESS=127.0.0.1
      - HEP_PORT=9060
      - HEP_TRANSPORT=udp
    volumes:
      - ./config.json:/app/config.json
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "2"
```

To build the image locally from the `Dockerfile`:

```sh
docker build -t hepsim .
```

The `Dockerfile` uses `oven/bun` as base image and compiles the project into a self-contained binary via `bun build --compile`.

