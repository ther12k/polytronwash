#!/usr/bin/env bash
# Polls the laptop's WiFi for the ESP32 fallback hotspot "Polytron Wash Setup".
# Reports the moment the board manages to boot into AP mode (power fixed),
# and then watches until it disappears (user completed captive portal).
set -u
MAX_WAIT_MIN=60
deadline=$(( $(date +%s) + MAX_WAIT_MIN * 60 ))
seen_ap=0

echo "[air] watching for 'Polytron Wash Setup' hotspot (max ${MAX_WAIT_MIN}min)..."
while [ "$(date +%s)" -lt "$deadline" ]; do
  if nmcli -f SSID dev wifi list 2>/dev/null | grep -q "Polytron Wash Setup"; then
    if [ "$seen_ap" = 0 ]; then
      echo "[air] HOTSPOT IS UP! Board is alive and in AP mode."
      echo "[air] -> Join it on your phone (password: see secrets.yaml -> ap_password) and complete the captive portal."
      seen_ap=1
    fi
  elif [ "$seen_ap" = 1 ]; then
    echo "[air] Hotspot disappeared — captive portal likely completed, device joining WiFi."
    exit 0
  fi
  sleep 15
done
echo "[air] timeout: hotspot never appeared"
exit 1
