#!/usr/bin/env python3
"""Mock ESPHome web server for testing ui/www.js before deployment.

Serves the same shell page ESPHome builds (/ with <esp-app> + /0.js),
streams /events SSE like the real device (initial state dump, then live
updates + logs), and logs every REST command it receives to
mock-calls.log so tests can assert exactly which commands fired.
"""
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse, parse_qs

ROOT = Path(__file__).parent
CALLS = ROOT / "mock-calls.log"

STATE = {
    "text_sensor/Cycle State": {"id": "text_sensor/Cycle State", "state": "SPIN", "value": "SPIN"},
    "text_sensor/Current Program": {"id": "text_sensor/Current Program", "state": "QUICK", "value": "QUICK"},
    "binary_sensor/Cycle Running": {"id": "binary_sensor/Cycle Running", "state": "ON", "value": True},
    "sensor/Cycle Progress": {"id": "sensor/Cycle Progress", "state": "42", "value": 42},
    "sensor/Program Progress": {"id": "sensor/Program Progress", "state": "71", "value": 71},
    "sensor/Program Elapsed": {"id": "sensor/Program Elapsed", "state": "424", "value": 424},
    "sensor/Program Remaining": {"id": "sensor/Program Remaining", "state": "176", "value": 176},
    "sensor/Free Heap": {"id": "sensor/Free Heap", "state": "132", "value": 132},
    "switch/Drain-Clutch": {"id": "switch/Drain-Clutch", "state": "ON", "value": True},
    "switch/Motor A": {"id": "switch/Motor A", "state": "OFF", "value": False},
    "switch/Motor B": {"id": "switch/Motor B", "state": "ON", "value": True},
    "switch/Water Inlet": {"id": "switch/Water Inlet", "state": "OFF", "value": False},
    "number/Wash Minutes": {"id": "number/Wash Minutes", "state": "20", "value": 20},
    "number/Spin Minutes": {"id": "number/Spin Minutes", "state": "10", "value": 10},
    "number/Drain Minutes": {"id": "number/Drain Minutes", "state": "2", "value": 2},
    "number/Fill Minutes": {"id": "number/Fill Minutes", "state": "5", "value": 5},
    "number/Wash Pulse Seconds": {"id": "number/Wash Pulse Seconds", "state": "5", "value": 5},
    "number/Wash Dead Time Seconds": {"id": "number/Wash Dead Time Seconds", "state": "2", "value": 2},
    "number/Stop Coast Seconds": {"id": "number/Stop Coast Seconds", "state": "30", "value": 30},
    "select/Wash Preset": {"id": "select/Wash Preset", "state": "20", "value": "20"},
    "select/Spin Preset": {"id": "select/Spin Preset", "state": "10", "value": "10"},
    "select/Spin Motor": {"id": "select/Spin Motor", "state": "B", "value": "B"},
    "text/Program Quick": {"id": "text/Program Quick", "state": "WASH:600, DRAIN:30, SPIN:300", "value": "WASH:600, DRAIN:30, SPIN:300"},
    "text/Program Normal": {"id": "text/Program Normal", "state": "WASH:480, DRAIN:60", "value": "WASH:480, DRAIN:60"},
    "text/Program Custom": {"id": "text/Program Custom", "state": "DRAIN:60", "value": "DRAIN:60"},
}

SHELL = ('<!DOCTYPE html><html><head><meta charset=UTF-8><meta name=viewport '
         'content="width=device-width,initial-scale=1"><link rel=icon href=data:></head>'
         '<body><esp-app></esp-app><script type=module src=/0.js></script></body></html>')


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):  # silence request noise
        pass

    def _log(self, kind, detail=""):
        with open(CALLS, "a") as f:
            f.write(f"{time.strftime('%H:%M:%S')} {kind} {detail}\n")

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/":
            body = SHELL.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif url.path == "/0.js":
            body = (ROOT / "www.js").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif url.path == "/events":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.send_events()
        elif url.path.count("/") >= 2:
            self._log("GET-STATE", url.path)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b"{}")
        else:
            self.send_response(404)
            self.end_headers()

    def send_events(self):
        i = 0
        try:
            for d in STATE.values():
                self._send_event("state", json.dumps(d))
            while True:
                time.sleep(1)
                i += 1
                # stream full state every tick — commands mutate STATE and the
                # browser sees the result within 1 s, like the real device
                for d in STATE.values():
                    ev = dict(d)
                    if d["id"] == "sensor/Program Progress":
                        v = min(100, 71 + i)
                        ev = {"id": d["id"], "state": str(v), "value": v}
                    self._send_event("state", json.dumps(ev))
                if i % 3 == 0:
                    self._send_event("log", f"22:31:{i:02d} [I] washer  mock log line {i}")
        except Exception as e:
            print(f"[sse] thread exit after {i}s: {type(e).__name__}: {e}", flush=True)
            raise

    def _send_event(self, name, data):
        self.wfile.write(f"event: {name}\ndata: {data}\n\n".encode())
        self.wfile.flush()

    def do_POST(self):
        url = urlparse(self.path)
        length = int(self.headers.get("Content-Length", 0) or 0)
        body = self.rfile.read(length).decode("utf-8", "replace") if length else ""
        qs = parse_qs(url.query)
        q = "&".join(f"{k}={v[0]}" for k, v in qs.items())
        detail = unquote(url.path) + (f" ?{q}" if q else "")
        self._log("POST", detail)
        # simulate switch flips so UI state moves after a toggle command
        if url.path.startswith("/switch/") and "/turn_" in url.path:
            sid = "switch/" + unquote(url.path.split("/")[2])
            on = url.path.endswith("turn_on")
            if sid in STATE:
                STATE[sid] = {"id": sid, "state": "ON" if on else "OFF", "value": on}
        # simulate button effects like the real firmware would
        if url.path.startswith("/button/") and url.path.endswith("/press"):
            btn = unquote(url.path.split("/")[2])
            def setst(sid, st, v):
                STATE[sid] = {"id": sid, "state": st, "value": v}
            if btn == "STOP ALL":
                setst("binary_sensor/Cycle Running", "OFF", False)
                setst("text_sensor/Cycle State", "IDLE", "IDLE")
                setst("text_sensor/Current Program", "STOPPED", "STOPPED")
                for sid in [s for s in STATE if s.startswith("switch/")]:
                    setst(sid, "OFF", False)
            elif btn.startswith(("Start", "Run")):
                setst("binary_sensor/Cycle Running", "ON", True)
                setst("text_sensor/Current Program", btn.upper(), btn.upper())
                mode = {"Start Wash": "WASH", "Start Spin": "SPIN", "Start Drain": "DRAIN",
                        "Start Fill": "FILL"}.get(btn, "WASH")
                setst("text_sensor/Cycle State", mode, mode)
        self.send_response(200)
        self.send_header("Content-Length", "0")
        self.end_headers()


if __name__ == "__main__":
    CALLS.unlink(missing_ok=True)
    threading.Thread(target=lambda: time.sleep(3600), daemon=True).start()
    ThreadingHTTPServer.request_queue_size = 64
    ThreadingHTTPServer.daemon_threads = True
    srv = ThreadingHTTPServer(("127.0.0.1", 8999), Handler)
    print("mock ESPHome on http://127.0.0.1:8999/")
    srv.serve_forever()
