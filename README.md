# Polytron Washing Machine — ESP32 + ESPHome

A top-load Polytron washer converted to **fully manual, software-defined
control**: an ESP32 drives relays wired straight to the motor, drain
solenoid and water inlet, so every part of the wash cycle — pulse timing,
spin speed control, drain, fill — becomes data you can change from Home
Assistant, the device's own web UI, voice, or an AI agent. The machine's
factory controller is simply unplugged.

```
Google Assistant ──> Home Assistant ──> ESPHome API ──> ESP32 ──> relays ──> motor / drain / inlet
Cursor / Claude  ──> ESPHome MCP  ──────────────┘            (native API, port 6053)
```

## The device's own web UI

The firmware embeds a **custom appliance UI** (`ui/www.js` — vanilla JS,
no framework, no build step, no CDN) served straight from flash via
`web_server.js_include`: ~8 KB gzipped vs ~140 KB for the stock ESPHome
frontend. It drives the device over the ESPHome REST API, with `/events`
SSE pushing state and logs live.

| Desktop (≥ 900 px) | Mobile |
|--------------------|--------|
| ![Desktop UI — cycle running, STOP bar pinned](docs/screenshots/ui-desktop-running.png) | ![Mobile UI](docs/screenshots/ui-mobile.png) |

![Manual relays and live debug log](docs/screenshots/ui-relays-log.png)

- **Cycle Status** — program + step chips, whole-program progress bar,
  elapsed/remaining, free heap.
- **Quick Actions** — start wash/spin/drain/fill or a saved program.
  Everything except **STOP ALL** locks while a cycle runs, and a sticky
  STOP bar follows you down the page.
- **Program Sequences** — the three persistent `NAME:seconds` slots with
  live validation and a computed total (SPIN steps include the 15 s
  coast).
- **Timing & Presets** — steppers and preset chips for every
  runtime-tunable number.
- **Manual Relays** (collapsed) — direct relay control for testing;
  firmware interlocks still apply.
- **OTA Update + Debug Log** (log collapsed) — flash a firmware `.bin`
  from the browser and watch the device log live.

Responsive: two-column grid on desktop, single column with a 2×2
quick-action grid on phones. No auth by default (trusted local WiFi); a
digest-auth block is commented in the yaml if you ever want it.
`ui/mock-server.py` fakes the device API so the UI can be exercised
offline.

> **Router down?** About a minute after losing the configured AP the
> ESP32 starts its own hotspot (**Polytron Wash Setup**) and serves the
> *same* full UI at `http://192.168.4.1` — control and OTA work with no
> LAN at all. It rejoins your WiFi automatically once the router is
> back.

## Hardware architecture (v3 — `polytron-v3.yaml`)

| Relay | GPIO | Drives | Notes |
|-------|------|--------|-------|
| Motor A | GPIO19 | motor winding / capacitor tap A | interlocked with Motor B |
| Motor B | GPIO21 | motor winding / capacitor tap B | interlocked with Motor A |
| Drain + clutch | GPIO22 | drain solenoid (engages gearbox clutch too) | interlocked with Inlet |
| Inlet valve | GPIO18 | water inlet solenoid | interlocked with Drain |

Relay modules are active-LOW (`relay_active_low: "true"` substitution) —
flip the substitution if yours are active-HIGH.

### How the cycles work

- **WASH** — the motor alternates A/B in pulses (`wash_on_ms` energized,
  `wash_dead_ms` dead time between directions, both runtime-tunable
  0.5–10 s / 0.5–5 s from HA or the web UI).
- **SPIN** — drain ON → clutch prep (`spin_prep_s`) → one direction
  continuously (A or B — selectable in config via the `spin_motor`
  select, no rewiring) → coast (`spin_coast_s`) → drain OFF.
- **DRAIN / FILL** — single solenoid for the configured duration.
- **STOP ALL** — motors + inlet cut instantly; if a spin was running the
  drum coasts `stop_coast_seconds` before the clutch brake engages.

### Safety interlocks (enforced in firmware, C++-level)

- Motor A and Motor B can **never** be ON together (hardware interlock +
  500 ms wait time — dead time between directions).
- Inlet and Drain can **never** be ON together.
- A cycle start is **refused** while another cycle runs — interrupting a
  spin or wash requires the explicit STOP ALL button (which does the
  controlled coast-then-brake sequence for a spinning drum).
- `on_client_disconnected` triggers STOP ALL: if the controller (HA)
  disappears mid-cycle, nothing keeps running. Remove that trigger only
  once the machine is supervised.

> ⚠️ **Mains safety**: the motor circuit carries AC mains. Use
> motor-rated relays or a contactor (16 A+) for the motor channels, put a
> fuse (e.g. 5 A) in series with the motor, wire the lid switch in series
> with the motor line so the motor physically cannot run with the lid
> open, and never work on the wiring with the machine plugged in.

## Agent / service API

High-level actions registered on the ESPHome API (usable from HA scripts,
automations, voice, or MCP agents):

```
wash(duration_s)   drain(duration_s)   spin(duration_s)   fill(duration_s)   stop_all()
```

Programs are **data on the device** — three persistent text slots edited
at runtime, comma-separated `NAME:seconds`:

```
WASH:600, DRAIN:30, SPIN:300      # Quick
WASH:480, DRAIN:60                # Normal
```

Preset selects (Wash 5/10/20/30 min, Spin 10/20/30 min) plus minute
number entities feed one-tap Start buttons, so common cycles are two
taps or one voice command.

## What Home Assistant sees

- `button.*` — Start Wash/Spin/Drain/Fill, Run Quick/Normal/Custom, STOP ALL
- `switch.*` — the four raw relays (manual/MCP control; interlocks still apply)
- `number.*` — wash/spin/drain/fill minutes, wash pulse + dead time, spin coast seconds
- `select.*` — wash preset, spin preset, spin direction (A/B)
- `text.*` — the three editable program slots
- `sensor.*` — cycle state, step + whole-program progress %, elapsed/remaining, free heap, WiFi signal (dBm)
- `binary_sensor.*` — cycle running

## Home Assistant setup (`ha/`)

- `ha/scripts.yaml` — voice presets (`Wash 20 Minutes`, `Spin 10 Minutes`,
  `Drain Now`, …). Merge into your HA `scripts.yaml`; expose to Google
  Assistant (Nabu Casa or manual linking) → *"Hey Google, activate Wash 20 Minutes"*.
- `ha/automations.yaml` — push/notification when a cycle finishes.
- `ha/polytron_dash.yaml` — YAML-mode dashboard: circular progress ring,
  mode-colored state (WASH blue / DRAIN teal / SPIN purple / FILL cyan),
  buttons locked while a cycle runs (except STOP ALL), program editor.
- `ha/www/polytron/polytron-washer-card.js` — the custom card above;
  serve from `/config/www/polytron/` and register in
  **Settings → Dashboards → Resources** as
  `/local/polytron/polytron-washer-card.js` (type: module).

## Getting started

```bash
cp secrets.yaml.example secrets.yaml   # then fill in WiFi + generate an API key
pip install esphome                    # or use the ESPHome docker image
esphome run polytron-v3.yaml           # first flash over USB, then OTA
esphome logs polytron-v3.yaml          # live logs over WiFi
```

Once flashed, the web UI is at `http://polytron-wash2.local/` (or the
device's IP — the same UI also appears on the fallback hotspot at
`192.168.4.1`).

The [aioesphomeapi](https://github.com/esphome/aioesphomeapi) test
scripts in **`tools/`** (device info, entity listing, live watcher,
relay matrix, acceptance run…) are optional PC-side clients — see
`tools/README.md`. They read the key from `secrets.yaml` via
`common.py`; set `WASHER_HOST` to override the device hostname.

## Repo layout

```
polytron-v3.yaml        current firmware — direct motor/drain/spin control
polytron.yaml           legacy v2 — relay "button bridge" across the panel buttons
ui/www.js               custom ESPHome web UI (embedded via js_include)
ui/mock-server.py       offline mock of the ESPHome REST/SSE API for UI tests
docs/screenshots/       web UI screenshots used by this README
secrets.yaml.example    template for the git-ignored credentials
tools/                  PC-side test/debug scripts (see tools/README.md) —
                        the ESP32 runs C++ only, never these
flash.sh, net-watch.sh, air-watch.sh, Dockerfile.flash   flashing helpers
ha/                     Home Assistant dashboard, custom card, voice scripts
```

## Notes

- Device hostnames: `polytron-wash.local` (v2) / `polytron-wash2.local` (v3).
- WiFi credentials persist in NVS across OTA and USB reflashes — you only
  enter them once (captive portal on first boot if the configured AP is
  unavailable).
- A stray active-HIGH relay module that clicks on at boot: set
  `relay_active_low: "false"` and re-flash.
