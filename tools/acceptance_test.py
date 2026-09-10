import asyncio, time
from aioesphomeapi import APIClient, TextInfo

from common import HOST, KEY

async def call(fn, *a):
    r = fn(*a)
    if hasattr(r, "__await__"):
        await r

async def main():
    cli = APIClient(HOST, 6053, "", noise_psk=KEY)
    await cli.connect()
    entities, services = await cli.list_entities_services()
    svc = {s.name: s for s in services}
    texts = {e.object_id: e.key for e in entities if isinstance(e, TextInfo)}
    def stamp(m): print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)

    for oid, val in {"program_quick": "WASH:600, DRAIN:30, SPIN:300",
                     "program_normal": "WASH:480, DRAIN:60",
                     "program_custom": "DRAIN:60"}.items():
        await call(cli.text_command, texts[oid], val)
        stamp(f"set {oid} = {val}")
    await asyncio.sleep(2)

    stamp("TEST 1/3  drain(3):  IN1 ON and HOLDS 3 s -> OFF")
    await call(cli.execute_service, svc["drain"], {"duration_s": 3})
    await asyncio.sleep(7)
    stamp("TEST 2/3  wash(8):    A 1.5s / dead 0.75s / B 1.5s / dead 0.75s ...")
    await call(cli.execute_service, svc["wash"], {"duration_s": 8})
    await asyncio.sleep(11)
    stamp("TEST 3/3  spin(6):    IN1 prep 5s -> Motor A holds 6s -> coast 10s -> IN1 off")
    await call(cli.execute_service, svc["spin"], {"duration_s": 6})
    await asyncio.sleep(24)
    stamp("DONE - all loads off")

asyncio.run(main())
