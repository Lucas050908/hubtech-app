"""HUBTECH platform server — Python standard library only (3.8+).

    python3 server/app.py            # http://127.0.0.1:8090
    python3 -m server.app --port 9000

Serves the web app from ./web and the JSON API under /api.
"""
import argparse
import http.server
import json
import mimetypes
import os
import socketserver
import sys
import threading
import time
import traceback
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    __package__ = "server"

from server import api, auth, autosync, backup, adminapp, byteforge_runner, calls, config, db, minecraft, notify, social, studio  # noqa: E402

social.install(api)
studio.install(api)
calls.install(api)
notify.install(api)
adminapp.install(api)
minecraft.install(api)

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("font/woff2", ".woff2")

# Everything the platform itself uses (incl. fonts) is self-hosted, so its policy is strictly same-origin.
CSP_BASE = ("default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; "
            "img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self'; "
            "base-uri 'self'; form-action 'self'; object-src 'none'")
# CircuitPilot keeps its original inline event handlers, so its page is allowed inline script.
CSP_LEGACY_APP = CSP_BASE + "; frame-src 'self'; script-src 'self' 'unsafe-inline'"
# The original websites (web/sites/*) run unchanged: they use inline scripts, Google Fonts,
# the Google sign-in script and a weather widget. They are sandboxed to this looser policy.
# Original pages that get the HUBTECH look when embedded (see web/sites/_hubtech/).
THEMED_SITES = {f"sites/hubtech/{n}" for n in ("index.html", "gamehob.html", "chatbot.html", "m.html", "kalender.html", "d.html", "doc.html")} | {"sites/archive-01/index.html"}
THEME_INJECT = b'<link rel="stylesheet" href="/sites/_hubtech/sites-theme.css"><script src="/sites/_hubtech/sites-theme.js"></script>'
CSP_SITES = ("default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com https://cdn.jsdelivr.net; "
             "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; "
             "font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; "
             "connect-src 'self' https://accounts.google.com; frame-src 'self' https://embed.windy.com https://accounts.google.com; "
             "frame-ancestors 'self'; object-src 'none'")

# Explicit types: on Windows the registry can map .js to text/plain, which breaks ES modules.
CONTENT_TYPES = {
    ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
    ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon",
    ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain", ".md": "text/plain",
    ".pdf": "application/pdf", ".zip": "application/zip", ".webmanifest": "application/manifest+json",
    ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".wav": "audio/wav",
    ".wasm": "application/wasm",
}


AI_MODEL_HOSTS = "https://huggingface.co https://*.huggingface.co https://*.hf.co"


def shell_csp():
    """frame-src also allows the configured ByteForge origin so its panel can be embedded."""
    frames = ["'self'"]
    try:
        url = db.get_server_setting("byteforge.url", config.BYTEFORGE_URL) or ""
        p = urlparse(url)
        if p.scheme in ("http", "https") and p.netloc:
            frames.append(f"{p.scheme}://{p.netloc}")
    except Exception:
        pass
    # the local AI (web/vendor/wllama) compiles WebAssembly in a blob: worker and downloads its model from Hugging Face
    base = CSP_BASE.replace("connect-src 'self'", "connect-src 'self' " + AI_MODEL_HOSTS)
    return base + "; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; frame-src " + " ".join(frames)


MUTATING = {"POST", "PUT", "PATCH", "DELETE"}


class RateLimiter:
    """Token bucket per account (or per IP before login) for every write request.
    Generous enough for autosave in several open documents; stops scripts that hammer the API."""

    def __init__(self):
        self.lock = threading.Lock()
        self.buckets = {}

    def allow(self, key, per_minute, burst):
        now = time.monotonic()
        with self.lock:
            tokens, last = self.buckets.get(key, (burst, now))
            tokens = min(burst, tokens + (now - last) * per_minute / 60.0)
            if tokens < 1:
                self.buckets[key] = (tokens, now)
                return False, int((1 - tokens) * 60 / per_minute) + 1
            self.buckets[key] = (tokens - 1, now)
            if len(self.buckets) > 5000:  # forget idle clients
                cutoff = now - 600
                self.buckets = {k: v for k, v in self.buckets.items() if v[1] > cutoff}
            return True, 0


WRITE_LIMIT = RateLimiter()


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "HUBTECH/1.0"
    sys_version = ""
    protocol_version = "HTTP/1.1"

    # ── helpers ──────────────────────────────────────────────────────────
    def log_message(self, fmt, *args):
        if os.environ.get("HUBTECH_QUIET"):
            return
        if getattr(self, "api_path", "") == "/api/health":
            return
        # started by the desktop program: keep the log file small – only problems are written
        if os.environ.get("HUBTECH_LAUNCHER") == "1" and len(args) > 1 and str(args[1])[:1] in ("1", "2", "3"):
            return
        sys.stderr.write("%s  %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    @property
    def client_ip(self):
        return self.client_address[0]

    def raw_body(self):
        if not hasattr(self, "_raw"):
            n = int(self.headers.get("Content-Length") or 0)
            if n > config.BIG_BODY_PATHS.get(getattr(self, "api_path", ""), config.MAX_BODY_BYTES):
                raise api.ApiError(413, "Forespørgslen er for stor.", "too_large")
            self._raw = self.rfile.read(n) if n else b""
        return self._raw

    def json(self):
        if not hasattr(self, "_json"):
            raw = self.raw_body()
            if not raw:
                self._json = {}
            else:
                try:
                    self._json = json.loads(raw.decode("utf-8"))
                except (ValueError, UnicodeDecodeError):
                    raise api.ApiError(400, "Ugyldig JSON.", "invalid_json")
                if not isinstance(self._json, dict):
                    raise api.ApiError(400, "Forventede et JSON-objekt.", "invalid_json")
        return self._json

    def _security_headers(self, csp=None):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(self), display-capture=(self)")
        if csp:
            self.send_header("Content-Security-Policy", csp)

    def send_json(self, status, payload, headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._security_headers()
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_bytes(self, status, body, headers=None):
        self.send_response(status)
        self.send_header("Content-Length", str(len(body)))
        if "Cache-Control" not in (headers or {}):
            self.send_header("Cache-Control", "no-store")
        self._security_headers()
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _load_session(self):
        self.session_token = None
        self.user = None
        raw = self.headers.get("Cookie")
        if raw:
            try:
                c = SimpleCookie(raw)
                if auth.COOKIE_NAME in c:
                    self.session_token = c[auth.COOKIE_NAME].value
            except Exception:  # malformed cookie header
                self.session_token = None
        if self.session_token:
            self.user = auth.session_user(self.session_token)

    def _same_origin_ok(self):
        """CSRF defence for cookie-authenticated mutations: require our custom header and, when the
        browser sends one, an Origin matching the Host."""
        if self.headers.get("X-Requested-With") != "hubtech":
            return False
        origin = self.headers.get("Origin")
        if origin:
            host = self.headers.get("Host", "")
            if urlparse(origin).netloc != host:
                return False
        return True

    # ── dispatch ─────────────────────────────────────────────────────────
    def _handle(self):
        # The handler instance is reused across keep-alive requests: reset per-request caches.
        for attr in ("_raw", "_json"):
            if hasattr(self, attr):
                delattr(self, attr)
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        self.query = parse_qs(parsed.query)
        self.api_path = path
        if path.startswith("/api/"):
            return self._api(path)
        if self.command not in ("GET", "HEAD"):
            return self.send_json(405, {"error": "Metoden er ikke tilladt."})
        return self._static(path)

    def _api(self, path):
        try:
            # Always consume the request body first so keep-alive connections stay in sync,
            # even when we reject the request early.
            try:
                self.raw_body()
            except api.ApiError:
                self.close_connection = True
                raise
            self._load_session()
            if self.command in MUTATING and not self._same_origin_ok():
                raise api.ApiError(403, "Forespørgslen blev afvist (CSRF-beskyttelse).", "csrf")
            if self.command in MUTATING:
                key, rate, burst = ((f"u{self.user['id']}", config.WRITE_RATE_USER, config.WRITE_RATE_USER // 2) if self.user
                                    else (f"ip{self.client_ip}", config.WRITE_RATE_ANON, config.WRITE_RATE_ANON // 2))
                ok, wait = WRITE_LIMIT.allow(key, rate, max(10, burst))
                if not ok:
                    return self.send_json(429, {"error": "For mange ændringer på kort tid. Vent et øjeblik, og prøv igen.", "code": "rate_limited"},
                                          {"Retry-After": str(wait)})
            allowed = []
            for method, rx, handler in api.COMPILED:
                m = rx.match(path)
                if not m:
                    continue
                if method != self.command and not (method == "GET" and self.command == "HEAD"):
                    allowed.append(method)
                    continue
                result = handler(self, m.groupdict())
                status, payload = result[0], result[1]
                headers = result[2] if len(result) > 2 else None
                if isinstance(payload, (bytes, bytearray)):
                    return self.send_bytes(status, payload, headers)
                return self.send_json(status, payload, headers)
            if allowed:
                return self.send_json(405, {"error": "Metoden er ikke tilladt.", "allow": allowed},
                                      {"Allow": ", ".join(allowed)})
            return self.send_json(404, {"error": "Endpoint findes ikke.", "code": "not_found"})
        except api.ApiError as e:
            headers = None
            if e.status == 401 and self.session_token:
                headers = {"Set-Cookie": auth.clear_cookie_header()}
            return self.send_json(e.status, {"error": e.message, "code": e.code, **e.extra}, headers)
        except Exception:
            traceback.print_exc()
            return self.send_json(500, {"error": "Der opstod en uventet fejl på serveren.", "code": "server_error"})

    def _static(self, path):
        web = config.WEB_DIR
        rel = path.lstrip("/")
        if rel == "" or rel.endswith("/"):
            rel += "index.html"
        target = (web / rel).resolve()
        try:
            target.relative_to(web)
        except ValueError:
            return self.send_json(404, {"error": "Ikke fundet."})
        if not target.is_file():
            # SPA fallback: unknown non-file routes return the shell (hash routing makes this rare)
            if "." not in Path(rel).name:
                target = web / "index.html"
            else:
                body = b"Not found"
                self.send_response(404)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self._security_headers()
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(body)
                return
        ctype = CONTENT_TYPES.get(target.suffix.lower()) or mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/json", "image/svg+xml",
                                                   "application/manifest+json"):
            ctype += "; charset=utf-8"
        stat = target.stat()
        etag = f'"{int(stat.st_mtime)}-{stat.st_size}"'
        if target.relative_to(web).as_posix() in THEMED_SITES:
            etag = etag[:-1] + '-t2"'
        if self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        data = target.read_bytes()
        rel = target.relative_to(web).as_posix()
        if rel in THEMED_SITES:
            # the original pages stay untouched on disk; when shown inside HUBTECH they get the platform look
            data = data.replace(b"</head>", THEME_INJECT + b"</head>", 1)
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("ETag", etag)
        self.send_header("Cache-Control", "no-cache")
        is_html = target.suffix.lower() == ".html"
        posix = target.relative_to(web).as_posix()
        if posix.startswith("sites/"):
            csp = CSP_SITES
        elif posix.startswith("apps/circuitpilot/") or posix.startswith("apps/servicehelp/"):
            csp = CSP_LEGACY_APP
        else:
            csp = shell_csp()
        self._security_headers(csp if is_html else None)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def do_GET(self):
        self._handle()

    def do_HEAD(self):
        self._handle()

    def do_POST(self):
        self._handle()

    def do_PUT(self):
        self._handle()

    def do_PATCH(self):
        self._handle()

    def do_DELETE(self):
        self._handle()


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, (BrokenPipeError, ConnectionResetError, ConnectionAbortedError)):
            return  # client went away – not an error worth logging
        super().handle_error(request, client_address)


def _housekeeping():
    backup.auto_backup_if_due()
    while True:
        time.sleep(3600)
        try:
            auth.purge_expired()
        except Exception:
            pass
        backup.auto_backup_if_due()
        try:
            api.cleanup_files()
        except Exception:
            pass
        try:
            social.cleanup()
            notify.cleanup()
        except Exception:
            traceback.print_exc()


def main(argv=None):
    ap = argparse.ArgumentParser(description="HUBTECH platform server")
    ap.add_argument("--host", default=None, help="standard: 127.0.0.1 – eller 0.0.0.0 når 'adgang fra andre enheder' er slået til")
    ap.add_argument("--port", type=int, default=config.PORT)
    args = ap.parse_args(argv)
    # one-time key from the desktop program (HUBTECH.pyw); removed from the environment so ByteForge never sees it
    api.SYSTEM["token"] = os.environ.pop("HUBTECH_SHUTDOWN_TOKEN", "")
    db.migrate()
    if args.host is None:
        # HUBTECH_HOST wins; otherwise the owner's choice under Indstillinger → Om → Netværk
        args.host = os.environ.get("HUBTECH_HOST") or ("0.0.0.0" if db.get_server_setting("lan_access", False) else "127.0.0.1")
    api.SYSTEM["host"], api.SYSTEM["port"] = args.host, args.port
    auth.purge_expired()
    threading.Thread(target=_housekeeping, daemon=True).start()
    threading.Thread(target=autosync.loop, name="hubtech-autosync", daemon=True).start()
    # make sure "finally" (which stops ByteForge) also runs when the process is terminated or the window is closed
    import signal

    def _graceful(*_):
        raise KeyboardInterrupt
    for _sig in ("SIGTERM", "SIGBREAK", "SIGHUP"):
        if hasattr(signal, _sig):
            try:
                signal.signal(getattr(signal, _sig), _graceful)
            except (ValueError, OSError):
                pass
    bf = byteforge_runner.start()
    if bf["managed"]:
        print(f"  ◆ ByteForge startet sammen med HUBTECH (PID {bf['pid']}) – log i {config.DATA_DIR / 'byteforge.log'}")
    httpd = Server((args.host, args.port), Handler)
    url = f"http://{'127.0.0.1' if args.host in ('0.0.0.0', '') else args.host}:{args.port}"
    print(f"\n  ◆ HUBTECH kører på {url}\n    Data: {config.DB_PATH}\n    Stop med Ctrl+C\n", flush=True)
    if args.host not in ("127.0.0.1", "localhost", "::1"):
        print("  ! Serveren kan nås fra andre enheder på netværket. Brug den kun på netværk, du stoler på – og HTTPS (fx tailscale serve) for at installere HUBTECH på telefonen.\n")
    restart_requested = []

    def _shutdown():
        # serve_forever() must be stopped from another thread; give the 202 response time to leave
        threading.Thread(target=lambda: (time.sleep(0.4), httpd.shutdown()), daemon=True).start()

    def _restart():   # after an update: stop, then start again with the new code
        restart_requested.append(True)
        _shutdown()
    api.SYSTEM["android"] = os.environ.get("HUBTECH_ANDROID") == "1"
    if not api.SYSTEM["android"]:   # inside the Android app the app itself owns the process
        api.SYSTEM["shutdown"] = _shutdown
        api.SYSTEM["restart"] = _restart
    api.SYSTEM["launcher"] = os.environ.get("HUBTECH_LAUNCHER") == "1"
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopper…")
    finally:
        byteforge_runner.stop()
        httpd.server_close()
    if restart_requested:
        print("  ◆ Genstarter HUBTECH med den nye version …", flush=True)
        if api.SYSTEM["launcher"]:
            sys.exit(75)            # HUBTECH.pyw starts the server again
        if os.name == "nt":
            import subprocess
            subprocess.Popen([sys.executable] + sys.argv)
            sys.exit(0)
        os.execv(sys.executable, [sys.executable] + sys.argv)


if __name__ == "__main__":
    main()
