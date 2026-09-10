import asyncio, time
from aioesphomeapi import APIClient, SensorInfo, TextInfo, ButtonInfo

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
    svc = {s.name: s for s in services}
    sens = {e.object_id: e.key for e in entities if isinstance(e, SensorInfo)}
    tsens = {e.object_id: e.key for e in entities if isinstance(e, TextInfo)}
    btns = {e.object_id: e.key for e in entities if isinstance(e, ButtonInfo)}
    print("sensors:", sorted(sens.keys()))
    print("text:   ", sorted(tsens.keys()))

    states = {}
    def on_state(s):
        if hasattr(s, "key"):
            states[s.key] = getattr(s, "state", None)
    await call(cli.subscribe_states, on_state)

    stamp = lambda m: print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)
    stamp("start wash 60 s (short demo)")
    await call(cli.execute_service, svc["wash"], {"duration_s": 60})
    await asyncio.sleep(12)

    def get(name):
        k = sens.get(name) or tsens.get(name)
        return states.get(k, "?") if k else "?"

    stamp(f"progress={get('cycle_progress')}%  elapsed={get('cycle_elapsed')}s  remaining={get('cycle_remaining')}s  program='{get('current_program')}'")
    await asyncio.sleep(5)
    stamp(f"progress={get('cycle_progress')}%  elapsed={get('cycle_elapsed')}s  remaining={get('cycle_remaining')}s")
    stamp("stop all")
    k = btns.get("stop_all")
    await call(cli.button_command, k)
    await asyncio.sleep(2)
    stamp(f"after stop: program='{get('current_program')}'  progress={get('cycle_progress')}%")

asyncio.run(main())
