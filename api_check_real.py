import asyncio
from aioesphomeapi import APIClient

HOST = "polytron-wash2.local"
from common import KEY

async def main():
    cli = APIClient(HOST, 6053, "", noise_psk=KEY)
    await cli.connect()
    entities, services = await cli.list_entities_services()
    for e in entities:
        print(f"{type(e).__name__:18s} {e.object_id}")

asyncio.run(main())
