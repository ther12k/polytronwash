import asyncio
from aioesphomeapi import APIClient
HOST = "polytron-wash2.local"
from common import KEY
async def call(fn, *a):
    r = fn(*a)
    if hasattr(r, "__await__"):
        await r
async def main():
    cli = APIClient(HOST, 6053, "", noise_psk=KEY)
    await cli.connect()
    entities, services = await cli.list_entities_services()
    svc = {s.name: s for s in services}
    print("firing drain(3) — watch IN4", flush=True)
    await call(cli.execute_service, svc["drain"], {"duration_s": 3})
    await asyncio.sleep(6)
    print("done", flush=True)
asyncio.run(main())
