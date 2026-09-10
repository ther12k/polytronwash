import asyncio
from aioesphomeapi import APIClient, TextInfo

HOST = "polytron-wash2.local"
from common import KEY

async def call(fn, *a, **kw):
    r = fn(*a, **kw)
    if hasattr(r, "__await__"):
        await r

async def main():
    cli = APIClient(HOST, 6053, "", noise_psk=KEY)
    await cli.connect()
    entities, _ = await cli.list_entities_services()
    keys = {e.object_id: e.key for e in entities if isinstance(e, TextInfo)}

    newvals = {
        "program_quick":   "POWER, WAIT:1000, PROGRAM, PROGRAM, START",
        "program_normal":  "POWER, WAIT:1000, START",
        "program_custom":  "POWER, WAIT:1000, PROGRAM, PROGRAM, PROGRAM, START",
    }
    for oid, val in newvals.items():
        await call(cli.text_command, keys[oid], val)
        print(f"set {oid} = {val}")
    await asyncio.sleep(2)

    states = []
    def on_state(s):
        if hasattr(s, "state") and not isinstance(s, bool):
            states.append(s)
    await call(cli.subscribe_states, on_state)
    await cli.entity_state_request() if hasattr(cli, "entity_state_request") else None
    await asyncio.sleep(2)
    print("done")

asyncio.run(main())
