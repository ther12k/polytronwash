import serial, sys, time
s = serial.Serial('/dev/ttyUSB0', 115200, timeout=1)
s.dtr = False          # IO0 high  -> normal boot, not bootloader
s.rts = True           # EN low    -> hold reset
time.sleep(0.1)
s.rts = False          # EN high   -> release: fresh boot
end = time.time() + 8
while time.time() < end:
    data = s.read(4096)
    if data:
        sys.stdout.write(data.decode('utf-8', 'replace'))
        sys.stdout.flush()
