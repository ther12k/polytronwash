import serial, sys, time, os

def ensure_node():
    if not os.path.exists('/dev/ttyUSB0'):
        try:
            os.mknod('/dev/ttyUSB0', 0o660 | 0o020000, os.makedev(188, 0))
        except OSError:
            pass

deadline = time.time() + 300
ensure_node()
while time.time() < deadline:
    try:
        s = serial.Serial('/dev/ttyUSB0', 115200, timeout=0.5)
        s.dtr = False; s.rts = True; time.sleep(0.05); s.rts = False
        while time.time() < deadline:
            try:
                data = s.read(4096)
            except Exception as e:
                print(f"\n[port lost: {type(e).__name__}]", flush=True)
                break
            if data:
                sys.stdout.buffer.write(data)
                sys.stdout.flush()
        try: s.close()
        except Exception: pass
    except Exception:
        time.sleep(0.2)
print("[capture over]", flush=True)
