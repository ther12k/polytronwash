#!/usr/bin/env bash
# Waits for the ESP32 to appear on the LAN (polytron-wash.local), then
# OTA-uploads the latest build. Safe to re-run.
set -u
cd "$(dirname "$0")"

HOST=polytron-wash.local
MAC=a4:cf:12:75:5e:e0
MAX_WAIT_MIN=90

echo "[net] waiting for $HOST to join the network (max ${MAX_WAIT_MIN}min)..."
echo "[net] (device must be given WiFi credentials once, via the"
echo "[net]  'Polytron Wash Setup' hotspot captive portal)"
deadline=$(( $(date +%s) + MAX_WAIT_MIN * 60 ))
ip=""

while [ "$(date +%s)" -lt "$deadline" ]; do
  ip=$(getent hosts "$HOST" 2>/dev/null | awk '{print $1; exit}')
  if [ -z "$ip" ]; then
    ip=$(ping -c1 -W2 "$HOST" 2>/dev/null | head -1 | grep -oE '\([0-9.]+\)' | tr -d '()')
  fi
  if [ -z "$ip" ]; then
    ip=$(ip neigh show | grep -i "$MAC" | awk '{print $1; exit}')
  fi
  [ -n "$ip" ] && break
  sleep 5
done

if [ -z "$ip" ]; then
  echo "[net] $HOST never appeared on the network. Not uploading."
  exit 1
fi

echo "[net] found $HOST at $ip — OTA uploading..."
attempt=0
until [ "$attempt" -ge 3 ]; do
  attempt=$((attempt + 1))
  echo "[net] upload attempt $attempt/3..."
  if .venv/bin/esphome upload polytron.yaml --device "$ip"; then
    echo "[net] OTA SUCCESS"
    echo "[net] waiting 40s for reboot, then checking web server..."
    sleep 40
    code=$(curl -s -m 8 -o /dev/null -w "%{http_code}" "http://$ip/" || echo "fail")
    echo "[net] web server check: HTTP $code"
    exit 0
  fi
  echo "[net] attempt $attempt failed, retrying in 10s..."
  sleep 10
done

echo "[net] OTA FAILED after 3 attempts"
exit 1
