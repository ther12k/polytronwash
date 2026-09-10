import asyncio
from aioesphomeapi import APIClient

from common import HOST, KEY

async def main():
    cli = APIClient(HOST, 6053, "", noise_psk=KEY)
    await cli.connect()
    entities, services = await cli.list_entities_services()
    key = next(e.key for e in entities if e.object_id == "power")
    print("Pressing POWER 10x every 3s — watch IN1 LED / listen for relay click:")
    for i in range(10):
        r = cli.button_command(key)
        if hasattr(r, "__await__"):
            await r
        print(f"  press {i+1}/10")
        await asyncio.sleep(3)
    print("DONE")

asyncio.run(main())
