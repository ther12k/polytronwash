import asyncio
from aioesphomeapi import APIClient

HOST = "polytron-wash2.local"
from common import KEY

async def main():
    cli = APIClient(HOST, 6053, "", noise_psk=KEY)
    await cli.connect()
    info = await cli.device_info()
    print("uptime_s:", getattr(info, "uptime", "?"), "| compilation:", getattr(info, "compilation_time", "?"))
    states = {}
    def on_state(s):
        states[s.key] = getattr(s, "state", None)
    r = cli.subscribe_states(on_state)
    if hasattr(r, "__await__"):
        await r
    await asyncio.sleep(5)
    entities, _ = await cli.list_entities_services()
    km = {e.key: e.object_id for e in entities}
    watch = ["cycle_state","current_program","cycle_progress","cycle_remaining",
             "drain-clutch","motor_a","motor_b","water_inlet"]
    for n in watch:
        k = next((key for key, oid in km.items() if oid == n), None)
        print(f"{n:16s} = {states.get(k, '?')}")

asyncio.run(main())
