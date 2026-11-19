# hepsim
Simulate varying phone calls by sending HEP for demos and statistics

### Objective

Simulate a variety of calls to demonstrate use cases and statistics.
It generates HEP and sends it based on defined callflows.
Optional lake telemetry mimics external Telegraf/Splunk-style senders over Influx LP and OTLP.

### Current Caveats
* Scenarios are defined in `config.json` (see `config.json.example`) and wired in `sessionModule` / `simulationModule`

### Usage

Copy `config.json.example` to `config.json` and modify as needed. If `config.json` is not found, the example configuration is used as a fallback.

Run with [Bun](https://bun.sh):

```sh
HEP_ADDRESS=127.0.0.1 HEP_PORT=9060 bun index.js
```

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HEP_ADDRESS` | `127.0.0.1` | HEP receiver address |
| `HEP_PORT` | `9060` | HEP receiver port |
| `HEP_TRANSPORT` | `udp` | Transport protocol (`udp` or `tcp`). Under backpressure, HEP packets are queued and session progress pauses until the socket drains. |
| `MEDIA_HEP` | `true` | When `false`, skip sending media RTP/RTCP HEP reports (calculation and media timeouts still run) |
| `LAKE_INFLUX_URL` | _(unset)_ | hepic-lake-ingest Influx write base (e.g. `http://127.0.0.1:8086`). Unset skips LP. |
| `LAKE_INFLUX_BUCKET` | `default` | Influx `bucket` / db query param |
| `LAKE_INFLUX_TOKEN` | _(unset)_ | Optional `Authorization: Token …` |
| `LAKE_OTLP_URL` | _(unset)_ | hepic-lake-ingest OTLP base (e.g. `http://127.0.0.1:4318`). Unset skips OTLP. |
| `LAKE_OTLP_TIMEOUT_MS` | `3000` | OTLP HTTP timeout |
| `LAKE_BATCH_SIZE` | `500` | Max items per lake HTTP POST (LP lines, OTLP log records, or OTLP metric data points); flush earlier on timer |
| `LAKE_BATCH_MS` | `1000` | Max wait (ms) before flushing a non-empty lake batch; whichever of size or time hits first |
| `DEBUG` | _(unset)_ | Enable debug session and logging |
| `CONFIG_PATH` | `./config.json` | Config file path |

Lake HTTP is emitted only when a scenario sets `"sbc_telemetry": true` **and** at least one of `LAKE_INFLUX_URL` / `LAKE_OTLP_URL` is set. Ingest needs `server.lineproto.enable` and/or OTLP enabled accordingly. Writes are batched (default 500 items or 1s, whichever first) into fewer POSTs; set `LAKE_BATCH_SIZE=1` to approximate per-event sends.

### Scenarios

Configured by `name` in `config.json`:

| Name | Schedule | Description |
|------|----------|-------------|
| `normal` | CPS (`cps_high`) | Dual-leg B2BUA-style call: leg A and leg B with distinct Call-IDs; leg B carries `X-CID` pointing at leg A. Stable From/To/Via tags for RFC 3261 dialog matching. Bidirectional media. |
| `bad` | interval + count | Single-leg call with poor MOS / high jitter and loss |
| `403` | interval + count | Auth challenge then 403 Forbidden (no media); lake lifecycle ends with `failure` |
| `dual_capture` | interval + count | Same as `normal`, but every SIP and media HEP is sent twice under two capture IDs (`capture_ids`, default `[14520, 14521]`) |
| `mos_dip` | interval + count | Dual-leg call; MOS ~4.2 until mid-call, drops to ~2.0 for one 30s report window, then recovers |
| `one_way` | interval + count | Dual-leg SIP; media only PARTY=0; HEP **102** `ONE_WAY`; RTP reports `ONE_WAY_RTP=1` |
| `media_alarm_silence` | interval + count | Dual-leg; HEP **102** `SILENCE` / `AUDIO_GAP` mid-call |
| `media_alarm_short_call` | interval + count | Short answered call; HEP **102** `SHORT_CALL` / `BYE` on hangup |

Optional scenario fields:

* `"sbc_telemetry": true` — enable lake logs/metrics for that scenario
* `"media_alarms": ["ONE_WAY","SILENCE","SHORT_CALL"]` — force extra HEP 102 HITs on a scenario

`normal` / `dual_capture` / `mos_dip` / `one_way` / `media_alarm_*` use interleaved SIP for both legs. Media reports on both legs use HEP/`CORRELATION_ID` of leg A and `RTP_SIP_CALL_ID` of the leg being reported.

#### HEP 100 / 102

* Every **answered** scenario emits HEP **100** after connect: `Chosen candidates offer=<ip>:<port> answer=<ip>:<port>` (INVITE + 200 OK SDP media endpoints), one log per Call-ID (both legs on dual-leg).
* HEP **102** media alarms match hepagent (`STYPE=UUPS-MEDIA`, `TYPE=HIT`) for `one_way`, `media_alarm_silence`, and `media_alarm_short_call`.

#### Lake telemetry (external sender simulation)

When enabled, the same call events fan out to:

| Sink | Endpoint | Tables / signals |
|------|----------|------------------|
| Influx LP | `POST /api/v2/write?bucket=…&precision=ns` | `sbc_logs`, `sbc_metrics` |
| OTLP/HTTP JSON | `POST /v1/logs`, `POST /v1/metrics` | `otel_logs`, `otel_metrics` |

**Logs** (callid in tags/attrs and message): `start` → `connected` → `finished`, or `failure` for `403`.

**Metrics** (predictable host gauges, tagged with scenario/media IPs): `cpu_pct` (0–100), `mem_gb` (1–16); mostly mid-range with occasional high/bad spikes.

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
      # - LAKE_INFLUX_URL=http://hepic-lake-ingest:8086
      # - LAKE_OTLP_URL=http://hepic-lake-ingest:4318
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
