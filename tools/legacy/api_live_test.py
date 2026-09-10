import asyncio, time
from aioesphomeapi import APIClient

HOST = "polytron-wash2.local"
from common import KEY
states = {}

async def main():
    cli = APIClient(HOST, 6053, "", noise_psk=KEY)
    await cli.connect()
    entities, services = await cli.list_entities_services()
    svc = {s.name: s for s in services}

    def on_state(s):
        k = getattr(s, "key", None)
        if k is not None:
            states[k] = getattr(s, "state", None)
    r = cli.subscribe_states(on_state)
    if hasattr(r, "__await__"):
        await r

    await asyncio.sleep(3)
    stamp = lambda m: print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)
    stamp("start wash 60 s")
    r = cli.execute_service(svc["wash"], {"duration_s": 60})
    if hasattr(r, "__await__"):
        await r

    for i in range(4):
        await asyncio.sleep(8)
        prog = next((states[k] for k, e in [] ), None)
        print(f"  t+8x{i+1}s states_seen={len(states)}", flush=True)

    # find keys by object id via a second listing (keys are stable)
    entities2, _ = await cli.list_entities_services()
    keymap = {e.object_id: e.key for e in entities2}
    g = lambda oid: states.get(keymap.get(oid, -1), "?")
    stamp(f"progress={g('cycle_progress')}% elapsed={g('cycle_elapsed')}s remaining={g('cycle_remaining')}s program='{g('current_program')}' state='{g('cycle_state')}'")
    await asyncio.sleep(8)
    stamp(f"progress={g('cycle_progress')}% elapsed={g('cycle_elapsed')}s remaining={g('cycle_remaining')}s")
    sb = keymap.get("stop_all")
    r = cli.button_command(sb)
    if hasattr(r, "__await__"):
        await r
    await asyncio.sleep(3)
    stamp(f"after STOP: program='{g('current_program')}' state='{g('cycle_state')}' progress={g('cycle_progress')}%")

asyncio.run(main())
