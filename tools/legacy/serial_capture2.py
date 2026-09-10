import serial, sys, time
deadline = time.time() + 240
while time.time() < deadline:
    try:
        s = serial.Serial('/dev/ttyUSB0', 115200, timeout=0.5)
        s.dtr = False; s.rts = True; time.sleep(0.05); s.rts = False
        while time.time() < deadline:
            try:
                data = s.read(4096)
            except Exception as e:
                print(f"\n[port lost: {e}]", flush=True)
                break
            if data:
                sys.stdout.buffer.write(data)
                sys.stdout.flush()
        try: s.close()
        except Exception: pass
    except Exception:
        time.sleep(0.3)
print("[capture window over]", flush=True)
