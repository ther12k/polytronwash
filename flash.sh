#!/usr/bin/env bash
# Waits for the ESP32 (CP210x) serial port to stay connected for 5 seconds,
# then flashes the already-built firmware.factory.bin. Best-effort log capture
# after flashing. Safe to re-run.
set -u
cd "$(dirname "$0")"

PORT=/dev/ttyUSB0
BIN=.esphome/build/polytron-wash/build/firmware.factory.bin
IMAGE=polytron-flash:latest
MAX_WAIT_MIN=30

echo "[watcher] waiting for $PORT to be present and stable for 5s (max ${MAX_WAIT_MIN}min)..."
deadline=$(( $(date +%s) + MAX_WAIT_MIN * 60 ))

while [ "$(date +%s)" -lt "$deadline" ]; do
  ok=0
  if [ -e "$PORT" ]; then
    ok=1
    for _ in $(seq 1 10); do
      [ -e "$PORT" ] || { ok=0; break; }
      sleep 0.5
    done
  fi
  [ "$ok" = 1 ] && break
  sleep 1
done

if [ "$ok" != 1 ]; then
  echo "[watcher] timed out: $PORT never stayed connected for 5s. Not flashing."
  exit 1
fi

flash() {
  if [ -r "$PORT" ] && [ -w "$PORT" ]; then
    echo "[watcher] direct port access OK — using local esptool"
    .venv/bin/esptool --chip esp32 --port "$PORT" --baud 460800 \
      --before default_reset --after hard_reset \
      write_flash -z 0x0 "$BIN"
  else
    echo "[watcher] no permission on $PORT — using docker ($IMAGE)"
    docker run --rm --device "$PORT" -v "$PWD:/src" \
      --entrypoint esptool "$IMAGE" \
      --chip esp32 --port "$PORT" --baud 460800 \
      --before default_reset --after hard_reset \
      write_flash -z 0x0 "/src/$BIN"
  fi
}

attempt=0
until [ "$attempt" -ge 3 ]; do
  attempt=$((attempt + 1))
  echo "[watcher] flash attempt $attempt/3..."
  if flash; then
    echo "[watcher] FLASH SUCCESS on attempt $attempt"
    # Best-effort: capture ~45s of boot logs (device re-enumerates after reset)
    sleep 3
    if [ -e "$PORT" ]; then
      echo "[watcher] capturing boot logs for 45s -> flash-logs.txt"
      if [ -r "$PORT" ] && [ -w "$PORT" ]; then
        timeout 45 .venv/bin/esptool monitor --port "$PORT" > flash-logs.txt 2>&1 || true
      else
        timeout 45 docker run --rm --device "$PORT" -v "$PWD:/src" \
          --entrypoint esptool "$IMAGE" monitor --port "$PORT" > flash-logs.txt 2>&1 || true
      fi
      echo "[watcher] log capture done"
    fi
    exit 0
  fi
  echo "[watcher] attempt $attempt failed, retrying in 5s..."
  sleep 5
done

echo "[watcher] FLASH FAILED after 3 attempts"
exit 1
