import serial, sys, time
s = serial.Serial('/dev/ttyUSB0', 115200, timeout=0.5)
s.dtr = False; s.rts = True; time.sleep(0.05); s.rts = False
end = time.time() + 15
while time.time() < end:
    d = s.read(4096)
    if d:
        sys.stdout.buffer.write(d); sys.stdout.flush()
