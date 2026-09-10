import asyncio, time
from aioesphomeapi import APIClient, UserService

HOST = "polytron-wash2.local"
from common import KEY

async def main():
    cli = APIClient(HOST, 6053, "", noise_psk=KEY)
    await cli.connect()
    entities, services = await cli.list_entities_services()
    svc = {s.name: s for s in services}
    print("actions available:", sorted(svc.keys()))

    def stamp(msg): print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

    stamp("TEST 1: drain(3) — IN1 should click ON and STAY on 3 s, then OFF")
    await cli.execute_service(svc["drain"], {"duration_s": 3})
    await asyncio.sleep(6)

    stamp("TEST 2: wash(8) — A/B alternating: A 1.5s, dead 0.75s, B 1.5s, dead 0.75s ...")
    await cli.execute_service(svc["wash"], {"duration_s": 8})
    await asyncio.sleep(11)

    stamp("TEST 3: spin(6) — IN1 drain ON 5 s prep, then Motor A holds 6 s, coast, IN1 OFF")
    await cli.execute_service(svc["spin"], {"duration_s": 6})
    await asyncio.sleep(24)

    stamp("DONE — everything should now be OFF (disconnect also triggers auto-stop)")
    await asyncio.sleep(2)

asyncio.run(main())
