# hepsim
Simulate varying phone calls by sending HEP for demos and statistics

### Objective

Simulate a variety of calls to demonstrate use cases and statistics.
It generates HEP and sends it based on defined callflows.

### Current Caveats
* Scenarios are defined in `config.json` (see `config.json.example`) and wired in `sessionModule` / `simulationModule`

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
| `HEP_TRANSPORT` | `udp`       | Transport protocol (`udp` or `tcp`). Under backpressure, HEP packets are queued and session progress pauses until the socket drains. |
| `MEDIA_HEP`     | `true`      | When `false`, skip sending media RTP/RTCP HEP reports (calculation and media timeouts still run) |
| `DEBUG`         | _(unset)_   | Enable debug session and logging   |

### Scenarios

Configured by `name` in `config.json`:

| Name | Schedule | Description |
|------|----------|-------------|
| `normal` | CPS (`cps_high`) | Dual-leg B2BUA-style call: leg A and leg B with distinct Call-IDs; leg B carries `X-CID` pointing at leg A. Stable From/To/Via tags for RFC 3261 dialog matching. Bidirectional media. |
| `bad` | interval + count | Single-leg call with poor MOS / high jitter and loss |
| `403` | interval + count | Auth challenge then 403 Forbidden (no media) |
| `dual_capture` | interval + count | Same as `normal`, but every SIP and media HEP is sent twice under two capture IDs (`capture_ids`, default `[14520, 14521]`) |
| `mos_dip` | interval + count | Dual-leg call; MOS ~4.2 until mid-call, drops to ~2.0 for one 30s report window, then recovers |
| `one_way` | interval + count | Dual-leg SIP; media periodic and hangup/final reports only for PARTY=0 (no reverse direction) |

`normal` / `dual_capture` / `mos_dip` / `one_way` use interleaved SIP for both legs (`INVITE` then `INVITE_B`, through BYE on both). Media reports on both legs use HEP/`CORRELATION_ID` of leg A and `RTP_SIP_CALL_ID` of the leg being reported.

Other scenarios can be added by extending `sessionModule.createSession` and optionally a scheduler in `simulationModule.runSimulation`.

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
      - MEDIA_HEP=true
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
