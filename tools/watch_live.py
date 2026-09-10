import asyncio, time
from aioesphomeapi import APIClient

from common import HOST, KEY
states = {}

async def main():
    cli = APIClient(HOST, 6053, "", noise_psk=KEY)
    await cli.connect()
    entities, services = await cli.list_entities_services()
    keymap = {e.object_id: e.key for e in entities}
    names = {e.key: e.object_id for e in entities}

    def on_state(s):
        k = getattr(s, "key", None)
        if k in names:
            states[names[k]] = getattr(s, "state", None)
    r = cli.subscribe_states(on_state)
    if hasattr(r, "__await__"):
        await r

    interesting = ["cycle_state", "current_program", "cycle_progress",
                   "cycle_remaining", "drain-clutch", "motor_a", "motor_b", "water_inlet"]
    stamp = lambda: time.strftime('%H:%M:%S')
    for i in range(8):
        line = " | ".join(f"{n}={states.get(keymap.get(n,-1),'?')}" for n in interesting)
        print(f"[{stamp()}] {line}", flush=True)
        await asyncio.sleep(4)

asyncio.run(main())
