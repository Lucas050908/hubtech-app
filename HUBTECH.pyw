"""HUBTECH – start the platform as a desktop program.

Double-click this file (or the HUBTECH shortcut that "Installer HUBTECH.pyw" makes).
It starts the HUBTECH server in the background (no console window), opens HUBTECH in its
own app window (Microsoft Edge or Google Chrome in app mode – no tabs, no address bar)
and stops the server again when the window is closed.

If HUBTECH is already running on this computer, the window simply opens against it.
Without Edge/Chrome, HUBTECH opens in the default browser and keeps running until you
choose Indstillinger → Om → "Luk HUBTECH".
"""
import json
import os
import secrets
import shutil
import subprocess
import sys
import threading
import time
import traceback
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from server import config  # noqa: E402  (reads .env: HUBTECH_PORT, HUBTECH_DATA_DIR …)

PORT = config.PORT
BASE = f"http://127.0.0.1:{PORT}"
APP_URL = f"{BASE}/?source=app"
DATA_DIR = config.DATA_DIR
PROFILE = DATA_DIR / "app-profile"
WINDOWS = os.name == "nt"
MAC = sys.platform == "darwin"
NO_WINDOW = 0x08000000 if WINDOWS else 0  # CREATE_NO_WINDOW


def log(msg):
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(DATA_DIR / "launcher.log", "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S  ") + msg + "\n")
    except OSError:
        pass


# ── server ───────────────────────────────────────────────────────────────
def health():
    """'hubtech' if our server answers, 'other' if something else owns the port, None if free."""
    try:
        with urllib.request.urlopen(BASE + "/api/health", timeout=1.5) as r:
            data = json.loads(r.read().decode("utf-8") or "{}")
        return "hubtech" if data.get("service") == "hubtech" else "other"
    except urllib.error.HTTPError:
        return "other"
    except Exception:
        return None


def python_for_server():
    """A console-less interpreter is fine because output goes to a log file; prefer python(w) next to us."""
    exe = Path(sys.executable)
    if WINDOWS and exe.name.lower() == "pythonw.exe" and (exe.parent / "python.exe").exists():
        return str(exe.parent / "python.exe")  # with CREATE_NO_WINDOW no console appears
    return str(exe)


def start_server():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    logf = open(DATA_DIR / "hubtech.log", "a", encoding="utf-8", buffering=1)
    logf.write(f"\n=== HUBTECH startet af programmet {time.strftime('%Y-%m-%d %H:%M:%S')} ===\n")
    env = dict(os.environ, HUBTECH_LAUNCHER="1", PYTHONUNBUFFERED="1", PYTHONIOENCODING="utf-8", HUBTECH_SHUTDOWN_TOKEN=SHUTDOWN_TOKEN)
    kw = {}
    if WINDOWS:
        kw["creationflags"] = NO_WINDOW | 0x00000200  # + CREATE_NEW_PROCESS_GROUP
    else:
        kw["start_new_session"] = True
    proc = subprocess.Popen([python_for_server(), str(ROOT / "server" / "app.py"), "--port", str(PORT)],
                            cwd=str(ROOT), env=env, stdin=subprocess.DEVNULL, stdout=logf, stderr=subprocess.STDOUT, **kw)
    deadline = time.time() + 40
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(f"Serveren stoppede med det samme (kode {proc.returncode}).\nSe loggen: {DATA_DIR / 'hubtech.log'}")
        if health() == "hubtech":
            return proc
        time.sleep(0.25)
    proc.kill()
    raise RuntimeError(f"Serveren svarede ikke inden for 40 sekunder.\nSe loggen: {DATA_DIR / 'hubtech.log'}")


SHUTDOWN_TOKEN = secrets.token_urlsafe(24)   # one-time key: only this launcher can stop the server it started


def ask_server_to_stop():
    try:
        r = urllib.request.Request(BASE + "/api/system/shutdown", data=b"{}", method="POST",
                                   headers={"X-Requested-With": "hubtech", "Content-Type": "application/json", "X-Hubtech-Shutdown": SHUTDOWN_TOKEN})
        with urllib.request.urlopen(r, timeout=4) as resp:
            return resp.status == 202
    except Exception:
        return False


def stop_server(proc):
    if proc is None or proc.poll() is not None:
        return
    log("Stopper serveren")
    # polite first: the server stops ByteForge and closes the database itself
    if ask_server_to_stop():
        try:
            proc.wait(timeout=8)
            return
        except Exception:
            pass
    try:
        if WINDOWS:
            proc.terminate()  # ByteForge notices that HUBTECH is gone and exits by itself
        else:
            import signal
            proc.send_signal(signal.SIGTERM)  # app.py stops ByteForge in its "finally"
        proc.wait(timeout=8)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


# ── app window ───────────────────────────────────────────────────────────
def _windows_app_paths(exe):
    try:
        import winreg
        for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
            try:
                with winreg.OpenKey(hive, rf"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{exe}") as k:
                    v = winreg.QueryValue(k, None)
                    if v and Path(v.strip('"')).exists():
                        yield v.strip('"')
            except OSError:
                continue
    except ImportError:
        return


def find_browser():
    if WINDOWS:
        cands = []
        for exe, rel in (("msedge.exe", r"Microsoft\Edge\Application\msedge.exe"),
                         ("chrome.exe", r"Google\Chrome\Application\chrome.exe"),
                         ("brave.exe", r"BraveSoftware\Brave-Browser\Application\brave.exe")):
            cands += list(_windows_app_paths(exe))
            for base in (os.environ.get("PROGRAMFILES(X86)"), os.environ.get("PROGRAMFILES"), os.environ.get("LOCALAPPDATA")):
                if base:
                    cands.append(os.path.join(base, rel))
    elif MAC:
        cands = ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
                 "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                 "/Applications/Chromium.app/Contents/MacOS/Chromium",
                 "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"]
        cands += [os.path.expanduser("~" + c) for c in list(cands)]
    else:
        cands = [shutil.which(n) for n in ("microsoft-edge", "microsoft-edge-stable", "google-chrome", "google-chrome-stable",
                                           "chromium", "chromium-browser", "brave-browser")]
    for c in cands:
        if c and Path(c).exists():
            return c
    return None


def profile_in_use():
    """Chromium keeps a lock in the profile while any window of it is open."""
    if WINDOWS:
        lock = PROFILE / "lockfile"
        if not lock.exists():
            return False
        try:
            lock.unlink()  # only possible when no browser process holds it open
            return False
        except OSError:
            return True
    lock = PROFILE / "SingletonLock"  # symlink to "<host>-<pid>"; may be stale after a crash
    try:
        pid = int(os.readlink(lock).rsplit("-", 1)[-1])
    except (OSError, ValueError):
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def open_window(browser):
    PROFILE.mkdir(parents=True, exist_ok=True)
    args = [browser, f"--app={APP_URL}", f"--user-data-dir={PROFILE}", "--no-first-run", "--no-default-browser-check",
            "--disable-background-mode", "--window-size=1440,900", "--class=HUBTECH"]
    kw = {"creationflags": NO_WINDOW} if WINDOWS else {"start_new_session": True}
    return subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **kw)


def app_seen_ago():
    """Seconds since the HUBTECH window last said it was alive (None = it said goodbye / never pinged)."""
    try:
        with urllib.request.urlopen(BASE + "/api/health", timeout=2) as r:
            return json.loads(r.read().decode("utf-8") or "{}").get("appSeenAgo")
    except Exception:
        return None


def wait_for_window(proc, server_ref=None):
    # A second launch hands the window to the already running browser process and exits at once,
    # so we watch the profile lock as well as the process – and, as a safety net, the window's own
    # heartbeat (every 10 s): the server is never stopped while a HUBTECH window still pings.
    time.sleep(3)
    while True:
        srv = (server_ref or {}).get("p")
        if srv is not None and srv.poll() == 75:   # the server restarts itself after an update
            log("Serveren genstarter efter en opdatering")
            try:
                server_ref["p"] = start_server()
            except Exception as e:
                log(f"Genstart mislykkedes: {e}")
                server_ref["p"] = None
        if proc.poll() is None or profile_in_use():
            time.sleep(1)
            continue
        ago = app_seen_ago()
        if ago is not None and ago < 25:
            time.sleep(2)
            continue
        return


# ── small splash + error dialogs (tkinter is optional) ──────────────────
class Splash:
    def __init__(self):
        self.root = None
        try:
            import tkinter as tk
            r = tk.Tk()
            r.overrideredirect(True)
            r.configure(bg="#0a1422")
            w, h = 360, 150
            r.geometry(f"{w}x{h}+{(r.winfo_screenwidth() - w) // 2}+{(r.winfo_screenheight() - h) // 3}")
            try:
                r.attributes("-topmost", True)
            except Exception:
                pass
            ico = ROOT / "hubtech.ico"
            if WINDOWS and ico.exists():
                try:
                    r.iconbitmap(str(ico))
                except Exception:
                    pass
            png = ROOT / "web" / "assets" / "icons" / "app-32.png"
            row = tk.Frame(r, bg="#0a1422")
            row.pack(expand=True)
            if png.exists():
                try:
                    self._img = tk.PhotoImage(file=str(png))
                    tk.Label(row, image=self._img, bg="#0a1422").pack(side="left", padx=(0, 12))
                except Exception:
                    pass
            tk.Label(row, text="HUBTECH", fg="#f4f8fc", bg="#0a1422", font=("Segoe UI", 20, "bold")).pack(side="left")
            self.msg = tk.Label(r, text="Starter HUBTECH…", fg="#8fb3d9", bg="#0a1422", font=("Segoe UI", 10))
            self.msg.pack(pady=(0, 22))
            r.update()
            self.root = r
        except Exception:
            self.root = None

    def run_until(self, done_event):
        if not self.root:
            done_event.wait()
            return
        def poll():
            if done_event.is_set():
                self.close()
            else:
                self.root.after(100, poll)
        self.root.after(100, poll)
        self.root.mainloop()

    def close(self):
        if self.root:
            try:
                self.root.destroy()
            except Exception:
                pass
            self.root = None


def error_box(text):
    log("FEJL: " + text)
    try:
        import tkinter as tk
        from tkinter import messagebox
        r = tk.Tk()
        r.withdraw()
        messagebox.showerror("HUBTECH", text)
        r.destroy()
        return
    except Exception:
        pass
    if WINDOWS:
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(None, text, "HUBTECH", 0x10)
        except Exception:
            pass
    else:
        sys.stderr.write(text + "\n")


# ── main ─────────────────────────────────────────────────────────────────
def main():
    if sys.version_info < (3, 8):
        error_box("HUBTECH kræver Python 3.8 eller nyere.")
        return
    result = {}
    done = threading.Event()

    def work():
        try:
            state = health()
            if state == "other":
                raise RuntimeError(f"Port {PORT} bruges allerede af et andet program.\n"
                                   "Luk det program, eller vælg en anden port med HUBTECH_PORT i filen .env.")
            result["server"] = None if state == "hubtech" else start_server()
            log("Server klar" + (" (genbrugt)" if result["server"] is None else f" (PID {result['server'].pid})"))
            browser = find_browser()
            if browser:
                result["window"] = open_window(browser)
                log(f"App-vindue åbnet med {browser}")
            else:
                webbrowser.open(BASE + "/")
                log("Ingen Edge/Chrome fundet – åbnede standardbrowseren")
            time.sleep(1.2)  # let the window appear before the splash disappears
        except Exception as e:
            result["error"] = e
            log(traceback.format_exc())
        finally:
            done.set()

    splash = Splash()
    threading.Thread(target=work, daemon=True).start()
    splash.run_until(done)
    splash.close()

    if "error" in result:
        stop_server(result.get("server"))
        error_box(f"HUBTECH kunne ikke starte.\n\n{result['error']}")
        return
    server, window = result.get("server"), result.get("window")
    if window is None:
        # normal browser: keep our server alive until it is stopped from Indstillinger → Om
        while server is not None:
            code = server.wait()
            if code != 75:
                break
            log("Serveren genstarter efter en opdatering")
            server = start_server()
        return
    ref = {"p": server}
    try:
        wait_for_window(window, ref)
    finally:
        log("App-vinduet er lukket")
        stop_server(ref["p"])  # only if we started it


if __name__ == "__main__":
    main()
