"""Ejer – the owner's own app. Everything only the owner may do, in one place: an overview, people (new password
for someone who forgot it, hand over ownership), who may join, and the "Hent HUBTECH" page friends use to get
the app. Admins (Admin app) moderate; the owner decides.
"""
import os
import re

from . import auth, backup, config, db, live
from .adminapp import log
from .api import ApiError, require_user

STORE_RE = re.compile(r"^(https://apps\.microsoft\.com/\S{1,300}|https://www\.microsoft\.com/\S{1,300}|ms-windows-store://\S{1,200})$")
HTTPS_RE = re.compile(r"^https://[^\s<>\"']{4,400}$")


def require_owner(req):
    u = require_user(req)
    if u["role"] != "owner":
        raise ApiError(403, "Kun platformens ejer har adgang til Ejer-appen.", "forbidden")
    return u


def overview(req, _):
    require_owner(req)
    n = lambda sql, a=(): (db.one(sql, a) or [0])[0] or 0   # noqa: E731
    users = db.all_rows("SELECT id FROM users")
    online = sum(1 for r in users if live.online(r["id"], 60))
    from . import api
    try:
        backups = backup.list_backups()
        last_backup = backups[0]["createdAt"] if backups else None
    except Exception:
        last_backup = None
    try:
        size = os.path.getsize(config.DB_PATH)
    except OSError:
        size = 0
    d = download_settings()
    return 200, {
        "users": len(users), "online": online,
        "admins": n("SELECT COUNT(*) FROM admin_access"),
        "newWeek": n("SELECT COUNT(*) FROM users WHERE created_at > ?", (db.now() - 7 * 86400,)),
        "signupMode": api.signup_mode(), "publicAccess": bool(db.get_server_setting("public_access", False)),
        "lastBackup": last_backup, "dbBytes": size, "version": config.VERSION,
        "storeUrl": d["storeUrl"], "apkUrl": d["apkUrl"],
    }


def set_password(req, params):
    """Someone forgot their password: the owner gives them a new one (they are logged out everywhere)."""
    me = require_owner(req)
    uid = int(params["uid"])
    target = db.one("SELECT id, display_name FROM users WHERE id = ?", (uid,))
    if not target:
        raise ApiError(404, "Brugeren findes ikke.", "not_found")
    if uid == me["id"]:
        raise ApiError(400, "Din egen adgangskode ændrer du under Indstillinger → Sikkerhed.", "self")
    pw = (req.json() or {}).get("password") or ""
    err = auth.validate_password(pw)
    if err:
        raise ApiError(400, err, "weak_password", {"field": "password"})
    db.q("UPDATE users SET password_hash = ? WHERE id = ?", (auth.hash_password(pw), uid))
    auth.destroy_user_sessions(uid)
    log(me["id"], "password", target["display_name"])
    return 200, {"ok": True}


def transfer(req, params):
    """Hand HUBTECH over to someone else. You become an ordinary member with Admin access."""
    me = require_owner(req)
    uid = int(params["uid"])
    b = req.json() or {}
    if not auth.verify_password(b.get("password", "") or "", me["password_hash"]):
        raise ApiError(400, "Adgangskoden er forkert.", "bad_credentials", {"field": "password"})
    target = db.one("SELECT id, display_name, role FROM users WHERE id = ?", (uid,))
    if not target or uid == me["id"]:
        raise ApiError(404, "Brugeren findes ikke.", "not_found")
    c = db.conn()
    c.execute("BEGIN IMMEDIATE")          # all or nothing: there is always exactly one owner
    try:
        c.execute("UPDATE users SET role = 'member' WHERE id = ?", (me["id"],))
        c.execute("UPDATE users SET role = 'owner' WHERE id = ?", (uid,))
        c.execute("DELETE FROM admin_access WHERE user_id = ?", (uid,))
        c.execute("INSERT OR IGNORE INTO admin_access(user_id, granted_by, granted_at) VALUES(?,?,?)", (me["id"], uid, db.now()))
        c.execute("COMMIT")
    except Exception:
        c.execute("ROLLBACK")
        raise
    log(me["id"], "transfer", target["display_name"])
    live.publish([uid, me["id"]], {"type": "me-changed"})
    return 200, {"ok": True}


# ── "Hent HUBTECH": the page friends open to get the app ──
def download_settings():
    d = db.get_server_setting("download", None) or {}
    # without a link of its own, the Android button uses the newest build from GitHub (same app, with updates)
    return {"storeUrl": d.get("storeUrl", ""), "apkUrl": d.get("apkUrl", "") or config.ANDROID_LATEST_APK,
            "apkCustom": bool(d.get("apkUrl")), "latestApk": config.ANDROID_LATEST_APK}


def download_get(req, _):
    """Public (no login): what to show on #/hent."""
    d = download_settings()
    web = None
    if db.get_server_setting("public_access", False):
        try:
            from . import remote_access
            st = remote_access.state()
            web = st["url"] if st.get("funnel") else None
        except Exception:
            web = None
    from . import api
    return 200, {**d, "webUrl": web, "signupOpen": api.signup_allowed()}


def download_set(req, _):
    me = require_owner(req)
    b = req.json() or {}
    store = str(b.get("storeUrl") or "").strip()
    apk = str(b.get("apkUrl") or "").strip()
    if store and not STORE_RE.match(store):
        raise ApiError(400, "Indsæt linket fra Microsoft Store (det starter med https://apps.microsoft.com/).", "invalid", {"field": "storeUrl"})
    if apk and not HTTPS_RE.match(apk):
        raise ApiError(400, "Linket til Android-appen skal starte med https://.", "invalid", {"field": "apkUrl"})
    if apk == config.ANDROID_LATEST_APK:
        apk = ""
    db.set_server_setting("download", {"storeUrl": store, "apkUrl": apk})
    log(me["id"], "download", "Hent HUBTECH-siden er ændret")
    return 200, download_settings()


ROUTES = [
    ("GET", r"/api/owner/overview", overview),
    ("POST", r"/api/owner/users/(?P<uid>\d+)/password", set_password),
    ("POST", r"/api/owner/users/(?P<uid>\d+)/transfer", transfer),
    ("GET", r"/api/download", download_get),
    ("PUT", r"/api/download", download_set),
]


def install(api_module):
    if not getattr(api_module, "_owner_installed", False):
        api_module.COMPILED.extend((m, re.compile("^" + p + "$"), h) for m, p, h in ROUTES)
        api_module._owner_installed = True
