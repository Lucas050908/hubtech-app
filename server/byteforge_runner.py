"""Starts the bundled ByteForge server (integrations/byteforge) together with HUBTECH.

- Only when HUBTECH_BYTEFORGE_AUTOSTART is true (default) and nothing already listens on the port.
- ByteForge is bound to 127.0.0.1 so it is not exposed on the network (no Windows firewall prompt).
- It is restarted (max. 3 times) if it crashes and stopped when HUBTECH stops.
- Output goes to <data dir>/byteforge.log.
"""
import atexit
import os
import socket
import subprocess
import sys
import threading
import time
from urllib.parse import urlparse

from . import config, db

BF_DIR = config.ROOT / "integrations" / "byteforge"
_proc = None
_lock = threading.Lock()
_state = {"managed": False, "restarts": 0, "lastError": None, "startedAt": None}


def bundled() -> bool:
    return (BF_DIR / "byteforge-server.py").is_file()


def target():
    url = db.get_server_setting("byteforge.url", config.BYTEFORGE_URL) or config.BYTEFORGE_URL
    p = urlparse(url)
    return (p.hostname or "127.0.0.1"), (p.port or (443 if p.scheme == "https" else 80))


def port_open(host, port, timeout=0.4) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _spawn(port):
    global _proc
    env = dict(os.environ, BYTEFORGE_HOST="127.0.0.1", BYTEFORGE_PORT=str(port), PYTHONUNBUFFERED="1",
               HUBTECH_PARENT_PID=str(os.getpid()))   # ByteForge stops by itself if HUBTECH goes away
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    log = open(config.DATA_DIR / "byteforge.log", "ab")
    kwargs = {"cwd": str(BF_DIR), "env": env, "stdout": log, "stderr": subprocess.STDOUT, "stdin": subprocess.DEVNULL}
    if sys.platform == "win32":
        kwargs["creationflags"] = 0x08000000  # CREATE_NO_WINDOW
    _proc = subprocess.Popen([sys.executable, "byteforge-server.py"], **kwargs)
    _state.update(managed=True, startedAt=int(time.time()), lastError=None)


def _watch(port):
    while True:
        p = _proc
        if p is None:
            return
        code = p.wait()
        with _lock:
            if _proc is not p:  # stopped on purpose
                return
            if _state["restarts"] >= 3:
                _state.update(managed=False, lastError=f"ByteForge stoppede (kode {code}) og blev ikke genstartet.")
                return
            _state["restarts"] += 1
            _state["lastError"] = f"ByteForge stoppede (kode {code}) – genstarter."
        time.sleep(2 + 2 * _state["restarts"])
        with _lock:
            if _proc is p:
                _spawn(port)


def start(force=False):
    """Start ByteForge if bundled, wanted and not already running. Returns a status dict."""
    if not bundled():
        return status()
    if not (config.BYTEFORGE_AUTOSTART or force):
        return status()
    host, port = target()
    if host not in ("127.0.0.1", "localhost", "::1"):
        return status()  # pointing at another machine – nothing to start here
    with _lock:
        if _proc and _proc.poll() is None:
            return status()
        if port_open("127.0.0.1", port):
            return status()  # someone (e.g. the user's own start.bat) already runs it
        try:
            _state["restarts"] = 0
            _spawn(port)
        except OSError as e:
            _state["lastError"] = f"Kunne ikke starte ByteForge: {e}"
            return status()
    threading.Thread(target=_watch, args=(port,), daemon=True).start()
    return status()


def stop():
    global _proc
    with _lock:
        p, _proc = _proc, None
    if p and p.poll() is None:
        p.terminate()
        try:
            p.wait(5)
        except subprocess.TimeoutExpired:
            p.kill()
    _state["managed"] = False


atexit.register(stop)


def status():
    return {
        "bundled": bundled(),
        "autostart": config.BYTEFORGE_AUTOSTART,
        "managed": bool(_proc and _proc.poll() is None),
        "pid": _proc.pid if _proc and _proc.poll() is None else None,
        "lastError": _state["lastError"],
        "startedAt": _state["startedAt"],
    }
