import asyncio
from aioesphomeapi import APIClient

HOST = "polytron-wash2.local"
from common import KEY
ORDER = [("power", "POWER   -> should be IN1"),
         ("start___pause", "START   -> should be IN2"),
         ("program", "PROGRAM -> should be IN3"),
         ("water_level", "LEVEL   -> should be IN4")]

async def fire(cli, key):
    r = cli.button_command(key)
    if hasattr(r, "__await__"):
        await r

async def main():
    cli = APIClient(HOST, 6053, "", noise_psk=KEY)
    await cli.connect()
    entities, _ = await cli.list_entities_services()
    keys = {e.object_id: e.key for e in entities if type(e).__name__ == "ButtonInfo"}
    for rnd in range(2):
        print(f"=== ROUND {rnd+1} - watch the IN LEDs ===")
        for oid, label in ORDER:
            print(f"  firing: {label}")
            await fire(cli, keys[oid])
            await asyncio.sleep(5)
    print("DONE")

asyncio.run(main())
