"""Admin: a control room for the platform. Only the owner – and the people the owner gives access – can open it.

  * Overblik: users, who is online, activity today, database size, version
  * Brugere: everyone, last login, online now; log a user out everywhere
  * Anmeldelser: every report in Fællesskab (admins see all servers, like the owner)
  * Besked til alle: an announcement that reaches everyone – in the app, by push and (if they want) mail
  * Adgang: only the owner chooses who is admin
  * Log: what the admins have done
"""
import os
import platform
import re
import shutil
import sys
import time

from . import config, db, live
from .api import ApiError, body_str, require_user

STARTED = time.time()


def is_admin(uid):
    if not uid:
        return False
    r = db.one("SELECT role FROM users WHERE id = ?", (uid,))
    if not r:
        return False
    return r["role"] == "owner" or bool(db.one("SELECT 1 FROM admin_access WHERE user_id = ?", (uid,)))


def require_admin(req):
    u = require_user(req)
    if not is_admin(u["id"]):
        raise ApiError(403, "Du har ikke adgang til Admin. Spørg platformens ejer.", "forbidden")
    return u


def log(uid, action, detail=""):
    db.q("INSERT INTO admin_log(user_id, action, detail, created_at) VALUES(?,?,?,?)", (uid, action, str(detail)[:300], db.now()))


def _count(sql, args=()):
    try:
        return db.one(sql, args)[0] or 0
    except Exception:
        return 0


def overview(req, _):
    require_admin(req)
    day = db.now() - 86400
    online = [uid for uid in list(live._seen) if live.online(uid, 60)]
    try:
        dbsize = sum(os.path.getsize(p) for p in (config.DB_PATH, str(config.DB_PATH) + "-wal") if os.path.exists(p))
    except OSError:
        dbsize = 0
    try:
        free = shutil.disk_usage(config.DATA_DIR).free
    except OSError:
        free = None
    from . import notify
    return 200, {
        "users": _count("SELECT COUNT(*) FROM users"),
        "online": len(online),
        "newUsers7d": _count("SELECT COUNT(*) FROM users WHERE created_at > ?", (db.now() - 7 * 86400,)),
        "logins24h": _count("SELECT COUNT(*) FROM users WHERE last_login_at > ?", (day,)),
        "messages24h": _count("SELECT COUNT(*) FROM cm_messages WHERE created_at > ?", (day,)),
        "servers": _count("SELECT COUNT(*) FROM cm_servers"),
        "openReports": _count("SELECT COUNT(*) FROM cm_reports WHERE handled_at IS NULL"),
        "studioApps": _count("SELECT COUNT(*) FROM studio_apps"),
        "documents": _count("SELECT COUNT(*) FROM office_docs"),
        "pushDevices": _count("SELECT COUNT(*) FROM push_subs"),
        "admins": _count("SELECT COUNT(*) FROM admin_access") + _count("SELECT COUNT(*) FROM users WHERE role = 'owner'"),
        "mailReady": bool(notify.smtp_config()["host"]),
        "dbBytes": dbsize, "diskFree": free,
        "version": config.VERSION, "python": sys.version.split()[0], "os": f"{platform.system()} {platform.release()}",
        "uptime": int(time.time() - STARTED), "storeApp": config.STORE_APP,
    }


def users(req, _):
    me = require_admin(req)
    admins = {r["user_id"] for r in db.all_rows("SELECT user_id FROM admin_access")}
    sess = {r["user_id"]: r["n"] for r in db.all_rows("SELECT user_id, COUNT(*) AS n FROM sessions WHERE expires_at > ? GROUP BY user_id", (db.now(),))}
    rows = db.all_rows("SELECT id, username, display_name, email, role, avatar, created_at, last_login_at FROM users ORDER BY last_login_at IS NULL, last_login_at DESC, id")
    return 200, {"me": me["id"], "isOwner": me["role"] == "owner", "users": [{
        "id": r["id"], "username": r["username"], "name": r["display_name"], "avatar": r["avatar"], "role": r["role"],
        "email": r["email"] or "" if me["role"] == "owner" else "",
        "admin": r["role"] == "owner" or r["id"] in admins, "online": live.online(r["id"], 60),
        "sessions": sess.get(r["id"], 0), "createdAt": r["created_at"], "lastLoginAt": r["last_login_at"],
    } for r in rows]}


def set_access(req, params):
    me = require_user(req)
    if me["role"] != "owner":
        raise ApiError(403, "Kun platformens ejer kan give og fjerne adgang til Admin.", "forbidden")
    uid = int(params["uid"])
    target = db.one("SELECT id, display_name, role FROM users WHERE id = ?", (uid,))
    if not target:
        raise ApiError(404, "Brugeren findes ikke.", "not_found")
    if target["role"] == "owner":
        raise ApiError(400, "Ejeren har altid adgang.", "owner")
    on = bool((req.json() or {}).get("admin"))
    if on:
        db.q("INSERT OR IGNORE INTO admin_access(user_id, granted_by, granted_at) VALUES(?,?,?)", (uid, me["id"], db.now()))
        live.publish([uid], {"type": "notify", "kind": "admin", "title": "Du har fået adgang til Admin", "text": f"{me['display_name']} har givet dig adgang.", "path": "/apps/admin"})
    else:
        db.q("DELETE FROM admin_access WHERE user_id = ?", (uid,))
    live.publish([uid], {"type": "me-changed"})
    log(me["id"], "access-on" if on else "access-off", target["display_name"])
    return 200, {"ok": True, "admin": on}


def logout_user(req, params):
    me = require_admin(req)
    uid = int(params["uid"])
    target = db.one("SELECT id, display_name, role FROM users WHERE id = ?", (uid,))
    if not target:
        raise ApiError(404, "Brugeren findes ikke.", "not_found")
    if target["role"] == "owner" and me["role"] != "owner":
        raise ApiError(403, "Du kan ikke logge ejeren ud.", "forbidden")
    if uid == me["id"]:
        raise ApiError(400, "Brug “Log ud” for at logge dig selv ud.", "self")
    n = db.q("DELETE FROM sessions WHERE user_id = ?", (uid,)).rowcount
    log(me["id"], "logout", f"{target['display_name']} ({n} enheder)")
    return 200, {"ok": True, "sessions": n}


def delete_user(req, params):
    """Delete another person's account and everything it owns (messages, files, settings …). Cannot be undone.
    The owner can delete anyone but themselves; an admin can delete ordinary members (not the owner or other admins).
    The username must be typed to confirm, so a slip of the mouse never deletes anyone."""
    me = require_admin(req)
    uid = int(params["uid"])
    target = db.one("SELECT id, username, display_name, role FROM users WHERE id = ?", (uid,))
    if not target:
        raise ApiError(404, "Brugeren findes ikke.", "not_found")
    if uid == me["id"]:
        raise ApiError(400, "Din egen konto sletter du under Indstillinger → Sikkerhed.", "self")
    if target["role"] == "owner":
        raise ApiError(403, "Ejerens konto kan ikke slettes herfra.", "forbidden")
    if me["role"] != "owner" and is_admin(uid):
        raise ApiError(403, "Kun ejeren kan slette en anden admin.", "forbidden")
    confirm = str((req.json() or {}).get("confirm") or "").strip().lstrip("@").lower()
    if confirm != target["username"].lower():
        raise ApiError(400, f"Skriv brugernavnet ({target['username']}) for at bekræfte.", "confirm", {"field": "confirm"})
    from . import avatars
    avatars._remove_files(uid)
    db.q("DELETE FROM users WHERE id = ?", (uid,))          # sessions, messages, files, prefs … go with it (ON DELETE CASCADE)
    log(me["id"], "delete-user", f"{target['display_name']} (@{target['username']})")
    return 200, {"ok": True}


def announce(req, _):
    me = require_admin(req)
    b = req.json() or {}
    title = body_str(b, "title", 80, required=True)
    text = body_str(b, "text", 300)
    path = body_str(b, "path", 200) or "/"
    if not re.match(r"^/[\w/#?=&.-]*$", path):
        path = "/"
    ids = [r["id"] for r in db.all_rows("SELECT id FROM users")]
    live.publish(ids, {"type": "notify", "kind": "announce", "title": title, "text": text, "path": path})
    log(me["id"], "announce", title)
    return 200, {"ok": True, "sent": len(ids)}


def admin_log(req, _):
    require_admin(req)
    rows = db.all_rows("SELECT l.*, u.display_name AS name, u.avatar FROM admin_log l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.id DESC LIMIT 200")
    return 200, {"log": [{"id": r["id"], "user": r["name"] or "Slettet bruger", "avatar": r["avatar"] or "👤", "action": r["action"], "detail": r["detail"], "at": r["created_at"]} for r in rows]}


ROUTES = [
    ("GET", r"/api/admin/overview", overview),
    ("GET", r"/api/admin/users", users),
    ("PUT", r"/api/admin/access/(?P<uid>\d+)", set_access),
    ("POST", r"/api/admin/users/(?P<uid>\d+)/logout", logout_user),
    ("DELETE", r"/api/admin/users/(?P<uid>\d+)", delete_user),
    ("POST", r"/api/admin/announce", announce),
    ("GET", r"/api/admin/log", admin_log),
]


def install(api_module):
    if not getattr(api_module, "_admin_installed", False):
        api_module.COMPILED.extend((m, re.compile("^" + p + "$"), h) for m, p, h in ROUTES)
        api_module._admin_installed = True
