import asyncio, time
from aioesphomeapi import APIClient, NumberInfo, ButtonInfo

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
    nums  = {e.object_id: e.key for e in entities if isinstance(e, NumberInfo)}
    btns  = {e.object_id: e.key for e in entities if isinstance(e, ButtonInfo)}
    stamp = lambda m: print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)

    stamp("set Wash Minutes = 2")
    await call(cli.number_command, nums["wash_minutes"], 2.0)
    await asyncio.sleep(1)
    stamp("press Start Wash -> should pulse A/B for 120 s")
    await call(cli.button_command, btns["start_wash"])
    await asyncio.sleep(15)
    stamp("press STOP ALL -> everything off")
    await call(cli.button_command, btns["stop_all"])
    stamp("demo done")

asyncio.run(main())
