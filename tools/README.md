# tools/ — scripts that run on YOUR COMPUTER, not on the ESP32

The washing machine runs only compiled C++ firmware (built from
`polytron-v3.yaml`). Everything in this folder is a **client** — it
connects to the machine over the network (or a USB cable) to inspect,
test or demo it, the same way Home Assistant or your phone's browser
does. Deleting this folder changes nothing on the device.

The network scripts use [aioesphomeapi](https://github.com/esphome/aioesphomeapi)
(the same native-API client library Home Assistant uses) and read the
API key from the git-ignored `../secrets.yaml` via `common.py`.
Point them at another device with `WASHER_HOST=x.x.x.x python tools/…`.

```bash
python3 tools/device_info.py        # anywhere; or use the repo .venv:
.venv/bin/python tools/device_info.py
```

## Read-only (safe)

| Script | What it does |
|--------|--------------|
| `device_info.py` | Name, MAC, ESPHome version — is the device alive? |
| `list_entities.py` | Every entity the device exposes, with types/ranges |
| `snapshot.py` | One-shot dump of all current states |
| `watch_live.py` | Prints cycle state + relay states every 4 s (live watcher) |

## ⚡ Energizes real hardware

| Script | What it does |
|--------|--------------|
| `demo_wash.py` | 2-min wash demo, auto STOP ALL after 15 s |
| `acceptance_test.py` | drain(3) / wash(8) / spin(6) acceptance run (~40 s) |
| `relay_matrix.py` | Cycles each of the 4 relays ON 2 s / OFF 2 s — wiring check |
| `press_button.py` | Press one button entity (edit the name in the script) |
| `verify_progress.py` | Starts a 60 s wash, asserts progress/elapsed/remaining tick |

Interlocks still apply — the firmware refuses anything unsafe.

## serial/ — USB rescue (no WiFi needed)

`boot_log.py` (resets the board via DTR/RTS and captures the boot log)
and `quick_log.py` (grabs 15 s of console output). Use these when the
device won't join WiFi and you need the boot log over the USB cable.
Day-to-day, prefer `esphome logs polytron-v3.yaml`.

## legacy/ — superseded, kept for reference

v2-era scripts (the old button-bridge firmware) and duplicates of the
tools above. They expect the old repo layout and entity names and
**won't run as-is** — they're an archive of how the device was brought
up, nothing more.
