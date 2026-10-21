"""Friends on other networks: HUBTECH sets up Tailscale Funnel by itself.

One button under Indstillinger → Om → Netværk walks through what is missing, one step at a time:
  1. Tailscale is not installed  → install it with winget (Windows asks for permission) – or a download link
  2. Tailscale is not running    → start the Tailscale app
  3. Not logged in               → `tailscale login`; the login page opens in the browser
  4. Logged in                   → `tailscale funnel --bg <port>`; the first time Tailscale asks you to allow
                                   Funnel on your tailnet – that page opens too
Then HUBTECH has a public https address (…ts.net) that works from every network, and it is set up again on the
next start (the port may change). Only fixed Tailscale commands are run – never anything from a request – and
only the owner, on the computer HUBTECH runs on, can use it.
"""
import json
import os
import re
import shutil
import subprocess
import threading
import time

from . import db

NO_WINDOW = 0x08000000 if os.name == "nt" else 0
URL_RE = re.compile(r"https://login\.tailscale\.com/\S+")
DOWNLOAD = "https://tailscale.com/download"
_lock = threading.Lock()
_job = {}        # the one running step: {"kind", "proc", "url", "lines", "started", "done", "ok", "error"}


def exe():
    over = os.environ.get("HUBTECH_TAILSCALE_EXE", "").strip()     # tests use a stand-in
    if over:
        return over if os.path.exists(over) else None
    found = shutil.which("tailscale")
    if found:
        return found
    for cand in (r"C:\Program Files\Tailscale\tailscale.exe", "/Applications/Tailscale.app/Contents/MacOS/Tailscale"):
        if os.path.exists(cand):
            return cand
    return None


def _run(args, timeout=8):
    x = exe()
    if not x:
        return None
    try:
        r = subprocess.run([x] + args, capture_output=True, text=True, timeout=timeout, creationflags=NO_WINDOW)
        return r
    except (OSError, subprocess.SubprocessError):
        return None


def state():
    x = exe()
    out = {"installed": bool(x), "running": False, "needsLogin": False, "daemon": False, "url": None, "funnel": False}
    if not x:
        return out
    r = _run(["status", "--json"])
    try:
        data = json.loads(r.stdout or "{}") if r else {}
    except ValueError:
        data = {}
    backend = data.get("BackendState")
    out["daemon"] = bool(backend)
    out["running"] = backend == "Running"
    out["needsLogin"] = backend in ("NeedsLogin", "NoState", "Stopped", "NeedsMachineAuth")
    dns = ((data.get("Self") or {}).get("DNSName") or "").rstrip(".")
    if dns:
        out["url"] = f"https://{dns}"
    if out["running"]:
        r2 = _run(["serve", "status", "--json"])
        try:
            sv = json.loads(r2.stdout or "{}") if r2 else {}
        except ValueError:
            sv = {}
        out["funnel"] = any(bool(v) for v in (sv.get("AllowFunnel") or {}).values())
    return out


def winget():
    if os.name != "nt" or os.environ.get("HUBTECH_TAILSCALE_EXE"):
        return None
    w = shutil.which("winget")
    if w:
        return w
    cand = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "WindowsApps", "winget.exe")
    return cand if os.path.exists(cand) else None


def job_info():
    with _lock:
        if not _job:
            return None
        return {"kind": _job["kind"], "url": _job.get("url"), "done": _job.get("done", False), "ok": _job.get("ok", False),
                "error": _job.get("error"), "seconds": int(time.time() - _job["started"])}


def _start(kind, cmd, max_seconds):
    """Run one step in the background; remember a login/approval link it prints."""
    with _lock:
        if _job and not _job.get("done"):
            if _job["kind"] == kind:
                return
            _stop_locked()
        try:
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                                    text=True, encoding="utf-8", errors="replace", creationflags=NO_WINDOW)
        except OSError as e:
            _job.clear()
            _job.update({"kind": kind, "started": time.time(), "done": True, "ok": False, "error": f"Kunne ikke starte: {e}"})
            return
        _job.clear()
        _job.update({"kind": kind, "proc": proc, "url": None, "lines": [], "started": time.time(), "done": False, "ok": False, "error": None})
        job = _job
    threading.Thread(target=_watch, args=(job, proc, max_seconds), daemon=True).start()


def _watch(job, proc, max_seconds):
    killer = threading.Timer(max_seconds, lambda: proc.poll() is None and proc.kill())
    killer.daemon = True
    killer.start()
    try:
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            with _lock:
                job["lines"] = (job["lines"] + [line])[-30:]
                m = URL_RE.search(line)
                if m and not job.get("url"):
                    job["url"] = m.group(0).rstrip(".,)")
        code = proc.wait()
    finally:
        killer.cancel()
    with _lock:
        job["done"] = True
        job["ok"] = code == 0
        if code != 0 and not job.get("error"):
            tail = " ".join(job["lines"][-3:])[:300]
            job["error"] = tail or f"Stoppede med kode {code}."
    if job["ok"] and job["kind"] == "funnel":
        db.set_server_setting("public_access", True)


def _stop_locked():
    p = _job.get("proc")
    if p and p.poll() is None:
        try:
            p.kill()
        except OSError:
            pass
    _job["done"] = True


def next_step(port):
    """Start whatever is missing next. Returns the step's name (or 'done' / 'manual')."""
    st = state()
    if st["running"] and st["funnel"]:
        db.set_server_setting("public_access", True)
        return "done"
    if not st["installed"]:
        w = winget()
        if not w:
            return "manual"
        _start("install", [w, "install", "--id", "Tailscale.Tailscale", "-e", "--silent",
                           "--accept-package-agreements", "--accept-source-agreements"], 900)
        return "install"
    if not st["daemon"]:
        app = r"C:\Program Files\Tailscale\tailscale-ipn.exe"
        if os.name == "nt" and os.path.exists(app):
            try:
                subprocess.Popen([app], creationflags=NO_WINDOW)
            except OSError:
                pass
        with _lock:
            _job.clear()
            _job.update({"kind": "start", "started": time.time(), "done": True, "ok": True, "error": None})
        return "start"
    if not st["running"]:
        _start("login", [exe(), "login"], 600)
        return "login"
    _start("funnel", [exe(), "funnel", "--bg", str(int(port))], 600)
    return "funnel"


def turn_off():
    with _lock:
        if _job:
            _stop_locked()
    r = _run(["funnel", "--https=443", "off"], timeout=15)
    if r is None or r.returncode != 0:
        _run(["funnel", "reset"], timeout=15)
    db.set_server_setting("public_access", False)


def resume(port):
    """At start-up: the port may have changed since last time – point the public address at this one again."""
    if not db.get_server_setting("public_access", False) or not exe():
        return

    def go():
        try:
            if state()["running"]:
                _start("funnel", [exe(), "funnel", "--bg", str(int(port))], 60)
        except Exception:
            pass
    threading.Thread(target=go, name="hubtech-public-access", daemon=True).start()
