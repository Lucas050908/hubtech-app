"""Configuration loaded from environment variables and an optional .env file.

All settings have safe defaults so the platform runs with zero setup:
  python3 server/app.py
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = ROOT / "web"


def _load_dotenv(path: Path) -> None:
    """Minimal .env loader (KEY=VALUE lines, # comments). Existing env wins."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


_load_dotenv(ROOT / ".env")


def _bool(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    if v is None or v == "":
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


HOST = os.environ.get("HUBTECH_HOST", "127.0.0.1")
PORT = _int("HUBTECH_PORT", 8090)
DATA_DIR = Path(os.path.expanduser(os.environ.get("HUBTECH_DATA_DIR", "~/.hubtech"))).resolve()
DB_PATH = DATA_DIR / "hubtech.db"

# "open"   -> anyone who can reach the server can create an account
# "first"  -> only the very first account (the owner) can be created; later users are invited by the owner
# "closed" -> no sign-ups at all
SIGNUP_MODE = os.environ.get("HUBTECH_SIGNUP", "first").strip().lower()
if SIGNUP_MODE not in ("open", "first", "closed"):
    SIGNUP_MODE = "first"

SESSION_DAYS = _int("HUBTECH_SESSION_DAYS", 14)
SECURE_COOKIES = _bool("HUBTECH_SECURE_COOKIES", False)  # set true behind HTTPS

# Cursor integration
CURSOR_USER_DIR = os.environ.get("HUBTECH_CURSOR_USER_DIR", "").strip()  # override auto-detection
PROJECT_ROOTS = [p for p in os.environ.get("HUBTECH_PROJECT_ROOTS", "").split(os.pathsep) if p.strip()]
CURSOR_CLI = os.environ.get("HUBTECH_CURSOR_CLI", "").strip()  # override path to `cursor` binary

# ByteForge connector
BYTEFORGE_URL = os.environ.get("HUBTECH_BYTEFORGE_URL", "http://127.0.0.1:8080").strip()
# Start the bundled ByteForge server (integrations/byteforge) together with HUBTECH
BYTEFORGE_AUTOSTART = _bool("HUBTECH_BYTEFORGE_AUTOSTART", True)

# HUBTECH legacy site (Pingochat, GameHub, …). Empty = use the copy bundled in web/sites/hubtech.
HUBTECH_SITE_URL = os.environ.get("HUBTECH_SITE_URL", "").strip()

MAX_STATE_BYTES = 4 * 1024 * 1024   # photos in Servicehjælp reports are stored as data URLs
MAX_BODY_BYTES = 6 * 1024 * 1024
VERSION = "1.2.0"
# installed from Microsoft Store (windows/): the program folder is read-only and Store does the updates
STORE_APP = os.environ.get("HUBTECH_STORE_APP", "") == "1"
# Where the Android app looks for a newer APK (published by .github/workflows/android.yml on the "ci" branch).
ANDROID_UPDATE_URL = os.environ.get("HUBTECH_ANDROID_UPDATE_URL", "https://raw.githubusercontent.com/Lucas050908/hubtech-app/ci/version.json")
OFFICE_VERSION_SECONDS = _int("HUBTECH_OFFICE_VERSION_SECONDS", 600)
# write requests per minute (token bucket; half of it may come at once)
WRITE_RATE_USER = _int("HUBTECH_WRITE_RATE", 360)
WRITE_RATE_ANON = _int("HUBTECH_WRITE_RATE_ANON", 40)
# endpoints that legitimately receive large uploads (whole-database restore, personal data import)
BIG_BODY_PATHS = {"/api/me/avatar": 2 * 1024 * 1024 + 4096, "/api/system/restore": 1024 * 1024 * 1024, "/api/me/import": 256 * 1024 * 1024, "/api/sync/apply": 64 * 1024 * 1024, "/api/office/files": 16 * 1024 * 1024, "/api/cm/files": 26 * 1024 * 1024, "/api/system/update/check": 300 * 1024 * 1024}
