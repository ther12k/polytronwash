import asyncio, time
from aioesphomeapi import APIClient

HOST = "polytron-wash2.local"
from common import KEY

async def call(fn, *a, **kw):
    r = fn(*a, **kw)
    if hasattr(r, "__await__"):
        await r

async def main():
    cli = APIClient(HOST, 6053, "", noise_psk=KEY)
    await cli.connect()
    entities, services = await cli.list_entities_services()
    sw = {e.object_id: e.key for e in entities if type(e).__name__ == "SwitchInfo"}
    stamp = lambda m: print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)

    tests = [
        ("water_inlet", "IN1 — Water Inlet", 2),
        ("motor_a",     "IN2 — Motor A",     2),
        ("motor_b",     "IN3 — Motor B",     2),
        ("drain-clutch","IN4 — Drain-Clutch", 2),
    ]
    for oid, label, dur in tests:
        stamp(f"turn ON  {label} (watch it, 2 s)")
        await call(cli.switch_command, sw[oid], True)
        await asyncio.sleep(dur)
        await call(cli.switch_command, sw[oid], False)
        await asyncio.sleep(2)
    stamp("ALL CHANNELS TESTED — everything OFF")

asyncio.run(main())
