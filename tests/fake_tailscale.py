#!/usr/bin/env python3
"""Stand-in for the `tailscale` command in tests. State lives in FAKE_TS_STATE (a JSON file)."""
import json
import os
import sys
import time

P = os.environ["FAKE_TS_STATE"]


def load():
    try:
        return json.load(open(P))
    except (OSError, ValueError):
        return {}


def save(s):
    json.dump(s, open(P, "w"))


def wait_for(key, seconds=60):
    for _ in range(seconds * 10):
        if load().get(key):
            return True
        time.sleep(0.1)
    return False


a = sys.argv[1:]
s = load()
if a[:2] == ["status", "--json"]:
    if not s.get("daemon"):
        print("failed to connect to local tailscaled", file=sys.stderr)
        sys.exit(1)
    print(json.dumps({"BackendState": "Running" if s.get("loggedIn") else "NeedsLogin",
                      "Self": {"DNSName": "min-pc.tail1234.ts.net." if s.get("loggedIn") else ""}}))
elif a[:3] == ["serve", "status", "--json"]:
    print(json.dumps({"AllowFunnel": {"min-pc.tail1234.ts.net:443": True}} if s.get("funnel") else {}))
elif a[:1] == ["login"]:
    print("\nTo authenticate, visit:\n\n\thttps://login.tailscale.com/a/abc123\n", flush=True)
    sys.exit(0 if wait_for("loggedIn") else 1)
elif a[:2] == ["funnel", "--bg"]:
    if not s.get("funnelAllowed"):
        print("Funnel is not enabled on your tailnet.\nTo enable, visit:\n\n         https://login.tailscale.com/f/funnel?node=xyz\n", flush=True)
        if not wait_for("funnelAllowed"):
            sys.exit(1)
    s = load(); s["funnel"] = True; s["port"] = a[2]; save(s)
    print("Available on the internet:\n\nhttps://min-pc.tail1234.ts.net/\n|-- proxy http://127.0.0.1:%s\n" % a[2])
elif a[:1] == ["funnel"]:
    s["funnel"] = False; save(s)
else:
    sys.exit(2)
