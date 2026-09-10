import asyncio
from aioesphomeapi import APIClient
from common import HOST, KEY
async def main():
    cli = APIClient(HOST, 6053, "", noise_psk=KEY)
    await cli.connect()
    info = await cli.device_info()
    for a in ("name","friendly_name","mac_address","esphome_version","compilation_time","model"):
        print(f"{a:16s}: {getattr(info, a, '?')}")
asyncio.run(main())
