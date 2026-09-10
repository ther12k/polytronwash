import asyncio
from aioesphomeapi import APIClient, NumberInfo, SelectInfo, ButtonInfo, TextInfo

HOST = "polytron-wash2.local"
from common import KEY

async def main():
    cli = APIClient(HOST, 6053, "", noise_psk=KEY)
    await cli.connect()
    entities, services = await cli.list_entities_services()
    for e in entities:
        t = type(e).__name__
        if t in ("NumberInfo", "SelectInfo", "ButtonInfo", "SwitchInfo", "TextInfo"):
            extra = ""
            if isinstance(e, NumberInfo):
                extra = f" [{e.min_value}-{e.max_value}]"
            elif isinstance(e, SelectInfo):
                extra = f" {list(e.options)}"
            print(f"{t:11s} {e.object_id}{extra}")
    print("ACTIONS:", sorted(s.name for s in services))

asyncio.run(main())
