"""Shared credentials for the api_*.py test scripts.

Loads the git-ignored secrets.yaml (same file the ESPHome YAMLs use) so no
key ever ends up in the repo. Override the device host with WASHER_HOST.
"""
import os


def load_secrets(path=None):
    if path is None:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, "secrets.yaml")
    out = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or ":" not in line:
                continue
            key, val = line.split(":", 1)
            out[key.strip()] = val.strip().strip("'\"")
    return out


SECRETS = load_secrets()
KEY = SECRETS["api_key"]
HOST = os.environ.get("WASHER_HOST", "polytron-wash2.local")
