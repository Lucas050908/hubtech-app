"""Starts the HUBTECH server inside the Android app (called from MainActivity via Chaquopy)."""
import os
import socket
import sys
import threading
import time
import urllib.request

_started = {}


def _free_port(preferred=8090):
    for port in (preferred, 0):
        s = socket.socket()
        try:
            s.bind(("127.0.0.1", port))
            return s.getsockname()[1]
        except OSError:
            continue
        finally:
            s.close()
    return preferred


def start(data_dir):
    """Start the server once (idempotent) and return its port."""
    if "port" in _started:
        return _started["port"]
    import hubtech
    root = os.path.dirname(os.path.abspath(hubtech.__file__))
    if root not in sys.path:
        sys.path.insert(0, root)
    os.environ.setdefault("HUBTECH_DATA_DIR", str(data_dir))
    os.environ["HUBTECH_BYTEFORGE_AUTOSTART"] = "false"   # ByteForge is a separate desktop program
    os.environ["HUBTECH_QUIET"] = "1"
    os.environ["HUBTECH_ANDROID"] = "1"
    port = _free_port()
    from server import app  # noqa: E402  (needs sys.path above)

    def run():
        try:
            app.main(["--host", "127.0.0.1", "--port", str(port)])
        except SystemExit:
            pass
    threading.Thread(target=run, name="hubtech-server", daemon=True).start()
    for _ in range(200):           # wait until it answers (max ~20 s on a slow phone)
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1) as r:
                if r.status == 200:
                    break
        except Exception:
            time.sleep(0.1)
    _started["port"] = port
    return port
