"""JSON API handlers. Each handler receives (req, params) and returns (status, payload[, headers])."""
import json
import os
import secrets
import time
import re
import urllib.error
import urllib.request
from urllib.parse import urlparse

from . import auth, autosync, backup, byteforge_runner, config, cursor_integration as cursor, db, updater

APP_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,40}$")
PID_RE = re.compile(r"^[0-9a-f]{16}$")
KNOWN_FAV_KINDS = {"app", "guide", "project", "course"}
AVATARS = set("⚡🦊🐺🦁🐯🐻🦅🐉🔧💡🛸🔬🎯🚀🏆🌊🤖🔌🧠🌲🏔️🍂❄️🌸☀️")


class ApiError(Exception):
    def __init__(self, status, message, code=None, extra=None):
        super().__init__(message)
        self.status, self.message, self.code, self.extra = status, message, code, extra or {}


def require_user(req):
    if not req.user:
        raise ApiError(401, "Du skal være logget ind.", "unauthenticated")
    return req.user


def is_https(req):
    """HTTPS directly, or via a proxy on this computer (e.g. "tailscale serve") that says so."""
    if getattr(req, "is_tls", False):
        return True
    return req.client_ip in ("127.0.0.1", "::1", "::ffff:127.0.0.1") and (req.headers.get("X-Forwarded-Proto") or "").lower() == "https"


def require_owner(req):
    u = require_user(req)
    if u["role"] != "owner":
        raise ApiError(403, "Kun platformens ejer har adgang til lokale projekter og integrationer.", "forbidden")
    return u


def body_str(body, key, max_len=200, required=False, default=""):
    v = body.get(key, default)
    if v is None:
        v = default
    if not isinstance(v, str):
        raise ApiError(400, f"Feltet '{key}' har et ugyldigt format.", "invalid")
    v = v.strip()
    if required and not v:
        raise ApiError(400, f"Feltet '{key}' mangler.", "missing", {"field": key})
    if len(v) > max_len:
        raise ApiError(400, f"Feltet '{key}' er for langt.", "too_long", {"field": key})
    return v


def log_activity(user_id, app_id, kind, title, detail=None, ref=None):
    db.q("INSERT INTO activity(user_id, app_id, kind, title, detail, ref, created_at) VALUES(?,?,?,?,?,?,?)",
         (user_id, app_id[:40], kind[:40], title[:160], (detail or "")[:300], (ref or "")[:120], db.now()))
    # keep the log bounded per user
    db.q("DELETE FROM activity WHERE user_id = ? AND id NOT IN "
         "(SELECT id FROM activity WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 500)",
         (user_id, user_id))


def signup_mode():
    """open = anyone can make an account on the login page (always as a member); first = only the owner makes
    accounts (Indstillinger → Brugere); closed = nobody. HUBTECH_SIGNUP in .env wins over the owner's choice."""
    if os.environ.get("HUBTECH_SIGNUP", "").strip():
        return config.SIGNUP_MODE
    v = db.get_server_setting("signup_mode", "first")
    return v if v in ("open", "first", "closed") else "first"


def signup_allowed():
    count = db.one("SELECT COUNT(*) AS n FROM users")["n"]
    if count == 0:
        return True  # the owner account can always be created on first run
    return signup_mode() == "open"


def set_signup(req, _):
    require_owner(req)
    if os.environ.get("HUBTECH_SIGNUP", "").strip():
        raise ApiError(409, "Styres af HUBTECH_SIGNUP i .env.", "from_env")
    mode = (req.json() or {}).get("mode")
    if mode not in ("open", "first"):
        raise ApiError(400, "Ukendt valg.", "invalid")
    db.set_server_setting("signup_mode", mode)
    return 200, {"signupMode": mode}


# ── Auth ──────────────────────────────────────────────────────────────────
def auth_status(req, _):
    count = db.one("SELECT COUNT(*) AS n FROM users")["n"]
    return 200, {
        "authenticated": bool(req.user),
        "user": auth.public_user(req.user) if req.user else None,
        "firstRun": count == 0,
        "signupAllowed": signup_allowed(),
        "signupMode": signup_mode(),
    }


def register(req, _):
    b = req.json()
    if not signup_allowed():
        raise ApiError(403, "Oprettelse af nye konti er slået fra. Bed platformens ejer om en invitation.",
                       "signup_closed")
    username = body_str(b, "username", 32, required=True)
    if not auth.USERNAME_RE.match(username):
        raise ApiError(400, "Brugernavnet skal være 3–32 tegn: bogstaver, tal, punktum, bindestreg eller _.",
                       "invalid_username", {"field": "username"})
    display = body_str(b, "displayName", 60) or username
    email = body_str(b, "email", 254)
    if email and not auth.EMAIL_RE.match(email):
        raise ApiError(400, "E-mailadressen ser ikke gyldig ud.", "invalid_email", {"field": "email"})
    password = b.get("password", "")
    err = auth.validate_password(password)
    if err:
        raise ApiError(400, err, "weak_password", {"field": "password"})
    key = "reg:" + getattr(req, "visitor_ip", req.client_ip)
    wait = auth.throttled(key)
    if wait:
        raise ApiError(429, f"For mange forsøg. Prøv igen om {wait} sekunder.", "throttled")
    if db.one("SELECT 1 FROM users WHERE username = ?", (username,)):
        auth.record_failure(key)
        raise ApiError(409, "Brugernavnet er allerede taget.", "username_taken", {"field": "username"})
    # only the very first account becomes the owner – decided in the same statement, so two people signing up
    # at the same moment can never both become owner; every later account is a member
    cur = db.q("INSERT INTO users(username, display_name, email, password_hash, role, created_at) "
               "SELECT ?,?,?,?, CASE WHEN EXISTS (SELECT 1 FROM users WHERE role = 'owner') THEN 'member' ELSE 'owner' END, ?",
               (username, display, email or None, auth.hash_password(password), db.now()))
    uid = cur.lastrowid
    db.q("INSERT INTO prefs(user_id, data, updated_at) VALUES(?, '{}', ?)", (uid, db.now()))
    log_activity(uid, "hubtech", "account", "Konto oprettet", "Velkommen til HUBTECH")
    token = auth.create_session(uid, req.headers.get("User-Agent", ""))
    user = db.one("SELECT * FROM users WHERE id = ?", (uid,))
    return 201, {"user": auth.public_user(user)}, {"Set-Cookie": auth.cookie_header(token, secure=is_https(req))}


def login(req, _):
    b = req.json()
    username = body_str(b, "username", 254, required=True)
    password = b.get("password", "")
    if not isinstance(password, str) or not password:
        raise ApiError(400, "Skriv din adgangskode.", "missing", {"field": "password"})
    key = f"login:{getattr(req, 'visitor_ip', req.client_ip)}:{username.lower()}"
    wait = auth.throttled(key)
    if wait:
        raise ApiError(429, f"For mange mislykkede forsøg. Prøv igen om {wait} sekunder.", "throttled",
                       {"retryAfter": wait})
    row = db.one("SELECT * FROM users WHERE username = ? OR (email IS NOT NULL AND email = ? COLLATE NOCASE)",
                 (username, username))
    ok = auth.verify_password(password, row["password_hash"] if row else auth._DUMMY_HASH)
    if not row or not ok:
        auth.record_failure(key)
        raise ApiError(401, "Forkert brugernavn eller adgangskode.", "bad_credentials")
    auth.clear_failures(key)
    token = auth.create_session(row["id"], req.headers.get("User-Agent", ""))
    recent = db.one("SELECT 1 FROM activity WHERE user_id = ? AND kind = 'login' AND created_at > ?",
                    (row["id"], db.now() - 3 * 3600))
    if not recent:
        log_activity(row["id"], "hubtech", "login", "Logget ind", None)
    row = db.one("SELECT * FROM users WHERE id = ?", (row["id"],))
    return 200, {"user": auth.public_user(row)}, {"Set-Cookie": auth.cookie_header(token, secure=is_https(req))}


def logout(req, _):
    auth.destroy_session(req.session_token)
    return 200, {"ok": True}, {"Set-Cookie": auth.clear_cookie_header(is_https(req))}


# ── Profile ───────────────────────────────────────────────────────────────
def me(req, _):
    return 200, {"user": auth.public_user(require_user(req))}


def update_me(req, _):
    u = require_user(req)
    b = req.json()
    fields, args = [], []
    if "displayName" in b:
        v = body_str(b, "displayName", 60, required=True)
        fields.append("display_name = ?"); args.append(v)
    if "email" in b:
        v = body_str(b, "email", 254)
        if v and not auth.EMAIL_RE.match(v):
            raise ApiError(400, "E-mailadressen ser ikke gyldig ud.", "invalid_email", {"field": "email"})
        fields.append("email = ?"); args.append(v or None)
    if "avatar" in b:
        v = body_str(b, "avatar", 80)
        if v == u["avatar"]:
            pass                                 # unchanged (e.g. an uploaded picture) – nothing to check
        elif v not in AVATARS:
            raise ApiError(400, "Ukendt avatar.", "invalid")
        fields.append("avatar = ?"); args.append(v)
    if fields:
        db.q(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", (*args, u["id"]))
    return 200, {"user": auth.public_user(db.one("SELECT * FROM users WHERE id = ?", (u["id"],)))}


def change_password(req, _):
    u = require_user(req)
    b = req.json()
    key = f"pw:{u['id']}"
    if auth.throttled(key):
        raise ApiError(429, "For mange forsøg. Vent et par minutter.", "throttled")
    if not auth.verify_password(b.get("current", "") or "", u["password_hash"]):
        auth.record_failure(key)
        raise ApiError(400, "Den nuværende adgangskode er forkert.", "bad_credentials", {"field": "current"})
    err = auth.validate_password(b.get("new", ""))
    if err:
        raise ApiError(400, err, "weak_password", {"field": "new"})
    db.q("UPDATE users SET password_hash = ? WHERE id = ?", (auth.hash_password(b["new"]), u["id"]))
    auth.destroy_user_sessions(u["id"], except_token=req.session_token)
    log_activity(u["id"], "settings", "security", "Adgangskode ændret")
    return 200, {"ok": True}


def sessions_info(req, _):
    u = require_user(req)
    rows = db.all_rows("SELECT created_at, last_seen, user_agent, token_hash FROM sessions WHERE user_id = ? "
                       "ORDER BY last_seen DESC", (u["id"],))
    cur = auth._token_hash(req.session_token) if req.session_token else None
    return 200, {"sessions": [{"createdAt": r["created_at"], "lastSeen": r["last_seen"],
                               "userAgent": (r["user_agent"] or "")[:120], "current": r["token_hash"] == cur}
                              for r in rows]}


def revoke_other_sessions(req, _):
    u = require_user(req)
    auth.destroy_user_sessions(u["id"], except_token=req.session_token)
    log_activity(u["id"], "settings", "security", "Logget ud på andre enheder")
    return 200, {"ok": True}


def delete_me(req, _):
    u = require_user(req)
    b = req.json()
    if not auth.verify_password(b.get("password", "") or "", u["password_hash"]):
        raise ApiError(400, "Adgangskoden er forkert.", "bad_credentials", {"field": "password"})
    if u["role"] == "owner" and db.one("SELECT COUNT(*) AS n FROM users")["n"] > 1:
        raise ApiError(400, "Ejeren kan ikke slette sin konto, mens der findes andre brugere.", "owner")
    from . import avatars
    avatars._remove_files(u["id"])
    db.q("DELETE FROM users WHERE id = ?", (u["id"],))
    return 200, {"ok": True}, {"Set-Cookie": auth.clear_cookie_header(is_https(req))}


def get_prefs(req, _):
    u = require_user(req)
    row = db.one("SELECT data FROM prefs WHERE user_id = ?", (u["id"],))
    return 200, {"prefs": json.loads(row["data"]) if row else {}}


def put_prefs(req, _):
    u = require_user(req)
    b = req.json()
    if not isinstance(b, dict):
        raise ApiError(400, "Ugyldige indstillinger.", "invalid")
    row = db.one("SELECT data FROM prefs WHERE user_id = ?", (u["id"],))
    cur = json.loads(row["data"]) if row else {}
    for k, v in b.items():
        if not isinstance(k, str) or len(k) > 60:
            continue
        if v is None:
            cur.pop(k, None)
        else:
            cur[k] = v
    data = json.dumps(cur)
    if len(data) > 32_000:
        raise ApiError(413, "Indstillingerne er for store.", "too_large")
    db.q("INSERT INTO prefs(user_id, data, updated_at) VALUES(?,?,?) "
         "ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
         (u["id"], data, db.now()))
    return 200, {"prefs": cur}


def onboarding(req, _):
    u = require_user(req)
    b = req.json()
    done = 1 if b.get("done") else 0
    step = b.get("step", 0)
    if not isinstance(step, int) or not 0 <= step <= 50:
        step = 0
    db.q("UPDATE users SET onboarding_done = ?, onboarding_step = ? WHERE id = ?", (done, step, u["id"]))
    if done and not u["onboarding_done"]:
        log_activity(u["id"], "hubtech", "onboarding", "Introduktion gennemført", "+50 XP")
    return 200, {"onboarding": {"done": bool(done), "step": step}}


# ── App state (per user, per app) ─────────────────────────────────────────
def get_state(req, params):
    u = require_user(req)
    app_id = params["app"]
    if not APP_ID_RE.match(app_id):
        raise ApiError(400, "Ugyldigt app-id.", "invalid")
    row = db.one("SELECT data, updated_at FROM app_state WHERE user_id = ? AND app_id = ?", (u["id"], app_id))
    return 200, {"state": json.loads(row["data"]) if row else None, "updatedAt": row["updated_at"] if row else None}


def put_state(req, params):
    u = require_user(req)
    app_id = params["app"]
    if not APP_ID_RE.match(app_id):
        raise ApiError(400, "Ugyldigt app-id.", "invalid")
    raw = req.raw_body()
    if len(raw) > config.MAX_STATE_BYTES:
        raise ApiError(413, "Data er for store.", "too_large")
    b = req.json()
    state = b.get("state")
    if not isinstance(state, (dict, list)):
        raise ApiError(400, "Feltet 'state' skal være et objekt.", "invalid")
    t = db.now()
    db.q("INSERT INTO app_state(user_id, app_id, data, updated_at) VALUES(?,?,?,?) "
         "ON CONFLICT(user_id, app_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
         (u["id"], app_id, json.dumps(state), t))
    return 200, {"ok": True, "updatedAt": t}


# ── Favorites & activity ─────────────────────────────────────────────────
def get_favorites(req, _):
    u = require_user(req)
    rows = db.all_rows("SELECT kind, ref, created_at FROM favorites WHERE user_id = ? ORDER BY created_at", (u["id"],))
    return 200, {"favorites": [{"kind": r["kind"], "ref": r["ref"], "createdAt": r["created_at"]} for r in rows]}


def toggle_favorite(req, _):
    u = require_user(req)
    b = req.json()
    kind = body_str(b, "kind", 20, required=True)
    ref = body_str(b, "ref", 120, required=True)
    if kind not in KNOWN_FAV_KINDS:
        raise ApiError(400, "Ukendt type.", "invalid")
    on = b.get("on")
    exists = db.one("SELECT 1 FROM favorites WHERE user_id = ? AND kind = ? AND ref = ?", (u["id"], kind, ref))
    if on is None:
        on = not exists
    if on and not exists:
        db.q("INSERT INTO favorites(user_id, kind, ref, created_at) VALUES(?,?,?,?)", (u["id"], kind, ref, db.now()))
    elif not on and exists:
        db.q("DELETE FROM favorites WHERE user_id = ? AND kind = ? AND ref = ?", (u["id"], kind, ref))
    return 200, {"kind": kind, "ref": ref, "on": bool(on)}


def get_activity(req, _):
    u = require_user(req)
    try:
        limit = max(1, min(100, int(req.query.get("limit", ["20"])[0])))
    except ValueError:
        limit = 20
    rows = db.all_rows("SELECT * FROM activity WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
                       (u["id"], limit))
    return 200, {"activity": [{"id": r["id"], "app": r["app_id"], "kind": r["kind"], "title": r["title"],
                               "detail": r["detail"], "ref": r["ref"], "at": r["created_at"]} for r in rows]}


def post_activity(req, _):
    u = require_user(req)
    b = req.json()
    app_id = body_str(b, "app", 40, required=True)
    if not APP_ID_RE.match(app_id):
        raise ApiError(400, "Ugyldigt app-id.", "invalid")
    kind = body_str(b, "kind", 40, required=True)
    title = body_str(b, "title", 160, required=True)
    detail = body_str(b, "detail", 300)
    ref = body_str(b, "ref", 120)
    # de-duplicate identical events within 10 minutes (e.g. reopening the same app)
    dup = db.one("SELECT id FROM activity WHERE user_id = ? AND app_id = ? AND kind = ? AND title = ? "
                 "AND created_at > ?", (u["id"], app_id, kind, title, db.now() - 600))
    if dup:
        db.q("UPDATE activity SET created_at = ?, detail = ? WHERE id = ?", (db.now(), detail, dup["id"]))
    else:
        log_activity(u["id"], app_id, kind, title, detail, ref)
    return 201, {"ok": True}


# ── Summary (dashboard) ──────────────────────────────────────────────────
LEVEL_XP = 1000


def _state(uid, app):
    row = db.one("SELECT data FROM app_state WHERE user_id = ? AND app_id = ?", (uid, app))
    try:
        return json.loads(row["data"]) if row else None
    except ValueError:
        return None


def summary(req, _):
    u = require_user(req)
    uid = u["id"]
    cp = _state(uid, "circuitpilot") or {}
    course = _state(uid, "course-servicetekniker") or {}
    cp_xp = int(cp.get("xp", 0) or 0) if isinstance(cp, dict) else 0
    tasks_done = 0
    days_done = 0
    for day in (course.get("days") or {}).values() if isinstance(course, dict) else []:
        t = [bool(x) for x in (day.get("tasks") or [])]
        tasks_done += sum(t)
        if day.get("complete"):
            days_done += 1
    course_xp = tasks_done * 15 + days_done * 50
    onboarding_xp = 50 if u["onboarding_done"] else 0
    cs = _state(uid, "codeschool") or {}
    code_xp = 0
    if isinstance(cs, dict):
        code_xp = len(cs.get("done") or {}) * 20
        for q in (cs.get("quiz") or {}).values():
            if isinstance(q, dict):
                code_xp += 5 * sum(1 for v in q.values() if v is True)
    fc = _state(uid, "flashcards") or {}
    fc_xp = 0
    if isinstance(fc, dict):
        try:
            fc_xp = max(0, int(fc.get("reviews") or 0)) * 2
        except (TypeError, ValueError):
            fc_xp = 0
    total = cp_xp + course_xp + onboarding_xp + code_xp + fc_xp
    level = total // LEVEL_XP + 1
    badges = len(cp.get("achievements", [])) if isinstance(cp, dict) else 0
    streak = 0
    if isinstance(cp, dict):
        streak = int((cp.get("stats") or {}).get("streakDays", 0) or 0)
    projects = db.one("SELECT COUNT(*) AS n FROM project_meta WHERE user_id = ?", (uid,))["n"]
    courses_active = (1 if (tasks_done or (isinstance(course, dict) and course.get("startedAt"))) else 0) + (1 if cp else 0) + (1 if isinstance(cs, dict) and cs.get("done") else 0)
    favs = db.one("SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?", (uid,))["n"]
    return 200, {
        "xp": total, "level": level, "levelXp": total % LEVEL_XP, "levelSize": LEVEL_XP,
        "breakdown": {"circuitpilot": cp_xp, "courses": course_xp, "onboarding": onboarding_xp, "codeschool": code_xp, "flashcards": fc_xp},
        "badges": badges, "streak": streak, "organizedProjects": projects, "favorites": favs, "coursesActive": courses_active,
        "courseTasksDone": tasks_done, "courseDaysDone": days_done,
    }


def leaderboard(req, _):
    require_user(req)
    rows = db.all_rows("SELECT u.id, u.display_name, u.avatar, s.data FROM users u "
                       "LEFT JOIN app_state s ON s.user_id = u.id AND s.app_id = 'circuitpilot'")
    out = []
    for r in rows:
        try:
            d = json.loads(r["data"]) if r["data"] else {}
        except ValueError:
            d = {}
        out.append({"u": r["display_name"], "av": r["avatar"], "xp": int(d.get("xp", 0) or 0),
                    "race": int(((d.get("stats") or {}).get("raceH", 0)) or 0), "me": r["id"] == req.user["id"]})
    return 200, {"entries": out}


# ── Projects (Cursor) ─────────────────────────────────────────────────────
def _meta_map(uid):
    rows = db.all_rows("SELECT project_id, data FROM project_meta WHERE user_id = ?", (uid,))
    out = {}
    for r in rows:
        try:
            out[r["project_id"]] = json.loads(r["data"])
        except ValueError:
            pass
    return out


def projects_list(req, _):
    u = require_owner(req)
    force = req.query.get("refresh", ["0"])[0] == "1"
    data = cursor.list_projects(force=force)
    meta = _meta_map(u["id"])
    projects = []
    for p in data["projects"]:
        m = meta.get(p["id"], {})
        projects.append({**p, "meta": m})
    return 200, {"projects": projects, "status": data["status"], "scannedAt": data["scannedAt"]}


def project_get(req, params):
    u = require_owner(req)
    pid = params["pid"]
    if not PID_RE.match(pid):
        raise ApiError(400, "Ugyldigt projekt-id.", "invalid")
    d = cursor.project_detail(pid)
    if not d:
        raise ApiError(404, "Projektet blev ikke fundet.", "not_found")
    return 200, {"project": {**d, "meta": _meta_map(u["id"]).get(pid, {})}}


def project_open(req, params):
    u = require_owner(req)
    pid = params["pid"]
    if not PID_RE.match(pid):
        raise ApiError(400, "Ugyldigt projekt-id.", "invalid")
    target = req.json().get("target", "cursor")
    p = cursor.get_project(pid)
    if not p:
        raise ApiError(404, "Projektet blev ikke fundet.", "not_found")
    if target == "folder":
        ok, msg = cursor.reveal_in_file_manager(pid)
        deeplink = None
    else:
        ok, msg, deeplink = cursor.open_in_cursor(pid)
    if ok:
        _touch_meta(u["id"], pid, {"lastOpenedHere": db.now()})
        log_activity(u["id"], "cursor", "project", p["name"], "Projekt åbnet" if target != "folder" else "Mappe åbnet",
                     pid)
    return 200, {"ok": ok, "message": msg, "deeplink": deeplink}


_META_LOCK = __import__("threading").Lock()


def _touch_meta(uid, pid, patch):
    with _META_LOCK:   # two quick changes (e.g. status, then a tag) must not overwrite each other
        return _touch_meta_locked(uid, pid, patch)


def _touch_meta_locked(uid, pid, patch):
    row = db.one("SELECT data FROM project_meta WHERE user_id = ? AND project_id = ?", (uid, pid))
    cur = json.loads(row["data"]) if row else {}
    for k, v in patch.items():
        if v is None:
            cur.pop(k, None)
        else:
            cur[k] = v
    db.q("INSERT INTO project_meta(user_id, project_id, data, updated_at) VALUES(?,?,?,?) "
         "ON CONFLICT(user_id, project_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
         (uid, pid, json.dumps(cur), db.now()))
    return cur


PROJECT_STATUSES = {"active", "paused", "done", "idea", "archived"}


def project_meta(req, params):
    u = require_owner(req)
    pid = params["pid"]
    if not PID_RE.match(pid):
        raise ApiError(400, "Ugyldigt projekt-id.", "invalid")
    b = req.json()
    patch = {}
    if "favorite" in b:
        patch["favorite"] = True if b["favorite"] else None
    if "status" in b:
        s = b["status"]
        if s is not None and s not in PROJECT_STATUSES:
            raise ApiError(400, "Ukendt status.", "invalid")
        patch["status"] = s
    if "collection" in b:
        c = b["collection"]
        if c is not None:
            c = body_str(b, "collection", 40) or None
        patch["collection"] = c
    if "note" in b:
        patch["note"] = body_str(b, "note", 2000) or None
    if "tags" in b:
        tags = b["tags"]
        if not isinstance(tags, list) or len(tags) > 12 or any(not isinstance(t, str) or len(t) > 24 for t in tags):
            raise ApiError(400, "Ugyldige tags.", "invalid")
        patch["tags"] = [t.strip() for t in tags if t.strip()] or None
    if "hidden" in b:
        patch["hidden"] = True if b["hidden"] else None
    return 200, {"meta": _touch_meta(u["id"], pid, patch)}


def integrations_status(req, _):
    u = require_user(req)
    out = {"byteforge": {"url": db.get_server_setting("byteforge.url", config.BYTEFORGE_URL)},
           "hubtechSite": {"url": db.get_server_setting("hubtech.site_url", config.HUBTECH_SITE_URL),
                           "bundled": (config.WEB_DIR / "sites" / "hubtech" / "index.html").is_file()}}
    if u["role"] == "owner":
        out["cursor"] = cursor.status()
    else:
        out["cursor"] = {"restricted": True}
    return 200, out


def cursor_config(req, _):
    require_owner(req)
    b = req.json()
    roots = b.get("roots")
    if not isinstance(roots, list) or len(roots) > 20 or any(not isinstance(r, str) or len(r) > 400 for r in roots):
        raise ApiError(400, "Ugyldig liste af mapper.", "invalid")
    clean = [r.strip() for r in roots if r.strip()]
    db.set_server_setting("cursor.project_roots", clean)
    cursor.invalidate()
    return 200, {"roots": clean, "status": cursor.status()}


def set_integration_url(req, params):
    require_owner(req)
    which = params["which"]
    key = {"byteforge": "byteforge.url", "hubtech-site": "hubtech.site_url"}.get(which)
    if not key:
        raise ApiError(404, "Ukendt integration.", "not_found")
    url = body_str(req.json(), "url", 300)
    if url:
        p = urlparse(url)
        if p.scheme not in ("http", "https") or not p.netloc:
            raise ApiError(400, "Adressen skal starte med http:// eller https://", "invalid", {"field": "url"})
        url = url.rstrip("/")
    db.set_server_setting(key, url)
    return 200, {"url": url}


def byteforge_check(req, _):
    require_user(req)
    url = db.get_server_setting("byteforge.url", config.BYTEFORGE_URL)
    runner = byteforge_runner.status()
    if not url:
        return 200, {"url": None, "reachable": False, "state": "not_configured", "runner": runner}
    # Only probe the configured URL (owner-controlled) – never arbitrary user input.
    try:
        r = urllib.request.Request(url + "/", method="GET", headers={"User-Agent": "HUBTECH-connector"})
        with urllib.request.urlopen(r, timeout=2.5) as resp:
            ok = 200 <= resp.status < 500
        return 200, {"url": url, "reachable": ok, "state": "online" if ok else "error", "runner": runner}
    except urllib.error.HTTPError as e:
        return 200, {"url": url, "reachable": True, "state": "online", "httpStatus": e.code, "runner": runner}
    except (urllib.error.URLError, OSError, ValueError) as e:
        reason = getattr(e, "reason", e)
        state = "starting" if runner["managed"] else "offline"
        return 200, {"url": url, "reachable": False, "state": state, "reason": str(reason)[:120], "runner": runner}


def byteforge_start(req, _):
    require_owner(req)
    st = byteforge_runner.start(force=True)
    return 200, {"runner": st}


# ── Owner: user management (invite-style) ─────────────────────────────────
def users_list(req, _):
    require_owner(req)
    rows = db.all_rows("SELECT * FROM users ORDER BY created_at")
    return 200, {"users": [auth.public_user(r) for r in rows], "signupMode": signup_mode(), "signupFromEnv": bool(os.environ.get("HUBTECH_SIGNUP", "").strip())}


def users_create(req, _):
    """The owner can create accounts for other people (works even when sign-up is closed)."""
    require_owner(req)
    b = req.json()
    username = body_str(b, "username", 32, required=True)
    if not auth.USERNAME_RE.match(username):
        raise ApiError(400, "Brugernavnet skal være 3–32 tegn: bogstaver, tal, punktum, bindestreg eller _.",
                       "invalid_username", {"field": "username"})
    if db.one("SELECT 1 FROM users WHERE username = ?", (username,)):
        raise ApiError(409, "Brugernavnet er allerede taget.", "username_taken", {"field": "username"})
    err = auth.validate_password(b.get("password", ""))
    if err:
        raise ApiError(400, err, "weak_password", {"field": "password"})
    display = body_str(b, "displayName", 60) or username
    cur = db.q("INSERT INTO users(username, display_name, password_hash, role, created_at) VALUES(?,?,?,?,?)",
               (username, display, auth.hash_password(b["password"]), "member", db.now()))
    db.q("INSERT INTO prefs(user_id, data, updated_at) VALUES(?, '{}', ?)", (cur.lastrowid, db.now()))
    return 201, {"user": auth.public_user(db.one("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)))}


# ── All states with a prefix (Servicehjælp keeps one state per data type) ─
def get_states_prefix(req, params):
    u = require_user(req)
    prefix = params["prefix"]
    rows = db.all_rows("SELECT app_id, data FROM app_state WHERE user_id = ? AND substr(app_id, 1, ?) = ?", (u["id"], len(prefix), prefix))
    return 200, {"states": {r["app_id"]: json.loads(r["data"]) for r in rows}}


# ── HUBTECH Office ───────────────────────────────────────────────────────
OFFICE_KINDS = ("doc", "sheet", "slides")
OFFICE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,40}$")
MAX_OFFICE_BYTES = 4 * 1024 * 1024


def _office_row(r, with_data=False):
    d = {"id": r["id"], "kind": r["kind"], "title": r["title"], "preview": r["preview"], "starred": bool(r["starred"]),
         "trashed": bool(r["trashed"]), "size": r["size"], "createdAt": r["created_at"], "updatedAt": r["updated_at"]}
    if with_data:
        d["data"] = json.loads(r["data"])
    return d


def _office_get(u, doc_id):
    if not OFFICE_ID_RE.match(doc_id):
        raise ApiError(400, "Ugyldigt dokument-id.", "invalid")
    r = db.one("SELECT * FROM office_docs WHERE id = ? AND user_id = ?", (doc_id, u["id"]))
    if not r:
        raise ApiError(404, "Dokumentet findes ikke.", "not_found")
    return r


def office_list(req, _):
    u = require_user(req)
    rows = db.all_rows("SELECT id, kind, title, preview, starred, trashed, size, created_at, updated_at FROM office_docs "
                       "WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1000", (u["id"],))
    return 200, {"docs": [_office_row(r) for r in rows]}


_TAG_RE = re.compile(r"<[^>]+>")


def _office_text(kind, data):
    """Plain text of a document's content (for search)."""
    import html as _html
    if kind == "doc":
        return _html.unescape(_TAG_RE.sub(" ", re.sub(r"</(p|h\d|li|div|tr|td|th)>|<br\s*/?>", "\n", str(data.get("html", ""))))) if isinstance(data, dict) else ""
    if kind == "sheet":
        out = []
        for sh in (data.get("sheets") or []) if isinstance(data, dict) else []:
            out.append(str(sh.get("name", "")))
            out += [str(c.get("v", "")) for c in (sh.get("cells") or {}).values() if isinstance(c, dict) and not str(c.get("v", "")).startswith("=")]
        return "\n".join(out)
    out = []
    for sl in (data.get("slides") or []) if isinstance(data, dict) else []:
        for k in ("title", "body", "body2", "notes"):
            out.append(_html.unescape(_TAG_RE.sub(" ", str(sl.get(k, "")))))
    return "\n".join(out)


def office_search(req, _):
    u = require_user(req)
    q = (req.query.get("q") or [""])[0].strip().lower()[:80]
    if len(q) < 2:
        return 200, {"results": []}
    words = q.split()
    results = []
    for r in db.all_rows("SELECT id, kind, title, data, updated_at FROM office_docs WHERE user_id = ? AND trashed = 0 ORDER BY updated_at DESC LIMIT 1000", (u["id"],)):
        try:
            text = _office_text(r["kind"], json.loads(r["data"]))
        except ValueError:
            continue
        flat = " ".join(text.split())
        hay = (r["title"] + " " + flat).lower()
        if not all(w in hay for w in words):
            continue
        low = flat.lower()
        i = low.find(words[0])
        snippet = ""
        if i >= 0:
            a = max(0, i - 50)
            snippet = ("…" if a else "") + flat[a:i + len(words[0]) + 70] + ("…" if i + 70 < len(flat) else "")
        results.append({"id": r["id"], "kind": r["kind"], "title": r["title"], "snippet": snippet, "updatedAt": r["updated_at"],
                        "inTitle": all(w in r["title"].lower() for w in words)})
        if len(results) >= 15:
            break
    results.sort(key=lambda x: (not x["inTitle"], -x["updatedAt"]))
    return 200, {"results": results}


def office_create(req, _):
    u = require_user(req)
    b = req.json()
    kind = body_str(b, "kind", 10, required=True)
    if kind not in OFFICE_KINDS:
        raise ApiError(400, "Ukendt dokumenttype.", "invalid")
    title = body_str(b, "title", 160) or {"doc": "Unavngivet dokument", "sheet": "Unavngivet regneark", "slides": "Unavngivet præsentation"}[kind]
    data = b.get("data") if isinstance(b.get("data"), (dict, list)) else {}
    raw = json.dumps(data)
    if len(raw) > MAX_OFFICE_BYTES:
        raise ApiError(413, "Dokumentet er for stort.", "too_large")
    doc_id = secrets.token_urlsafe(12)
    t = db.now()
    db.q("INSERT INTO office_docs(id, user_id, kind, title, preview, data, size, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
         (doc_id, u["id"], kind, title, body_str(b, "preview", 300), raw, len(raw), t, t))
    log_activity(u["id"], "hubtech", kind, title, {"doc": "Dokument oprettet", "sheet": "Regneark oprettet", "slides": "Præsentation oprettet"}[kind], doc_id)
    return 201, {"doc": _office_row(_office_get(u, doc_id), with_data=True)}


def office_get(req, params):
    u = require_user(req)
    return 200, {"doc": _office_row(_office_get(u, params["id"]), with_data=True)}


def office_update(req, params):
    u = require_user(req)
    r = _office_get(u, params["id"])
    if len(req.raw_body()) > MAX_OFFICE_BYTES + 4096:
        raise ApiError(413, "Dokumentet er for stort.", "too_large")
    b = req.json()
    sets, vals = [], []
    if "title" in b:
        sets.append("title = ?"); vals.append(body_str(b, "title", 160) or r["title"])
    if "preview" in b:
        sets.append("preview = ?"); vals.append(body_str(b, "preview", 300))
    if "data" in b:
        if not isinstance(b["data"], (dict, list)):
            raise ApiError(400, "Feltet 'data' skal være et objekt.", "invalid")
        raw = json.dumps(b["data"])
        # edited on another device since this one opened it? Don't overwrite silently (the client decides)
        base = b.get("base")
        if isinstance(base, int) and not b.get("force") and r["updated_at"] > base and raw != r["data"]:
            raise ApiError(409, "Dokumentet er blevet ændret et andet sted, siden du åbnede det.", "conflict", {"updatedAt": r["updated_at"]})
        sets += ["data = ?", "size = ?"]; vals += [raw, len(raw)]
        if raw != r["data"]:
            _maybe_snapshot(u, r)
    for flag in ("starred", "trashed"):
        if flag in b:
            sets.append(f"{flag} = ?"); vals.append(1 if b[flag] else 0)
    if not sets:
        return 200, {"doc": _office_row(r)}
    t = db.now()
    sets.append("updated_at = ?"); vals.append(t)
    db.q(f"UPDATE office_docs SET {', '.join(sets)} WHERE id = ? AND user_id = ?", (*vals, r["id"], u["id"]))
    return 200, {"doc": _office_row(_office_get(u, r["id"]))}


VERSION_EVERY = config.OFFICE_VERSION_SECONDS   # a new history entry at most every 10 minutes of editing
VERSION_KEEP = 40


def _snapshot(u, r, reason):
    db.q("INSERT INTO office_versions(doc_id, user_id, title, data, size, reason, created_at) VALUES(?,?,?,?,?,?,?)",
         (r["id"], u["id"], r["title"], r["data"], r["size"], reason, db.now()))
    db.q("DELETE FROM office_versions WHERE doc_id = ? AND id NOT IN (SELECT id FROM office_versions WHERE doc_id = ? ORDER BY created_at DESC, id DESC LIMIT ?)",
         (r["id"], r["id"], VERSION_KEEP))


def _maybe_snapshot(u, r):
    """Keep the state from before an editing session: snapshot the stored data when the last snapshot is old."""
    last = db.one("SELECT created_at FROM office_versions WHERE doc_id = ? ORDER BY created_at DESC LIMIT 1", (r["id"],))
    if r["data"] in ("{}", "") or (last and db.now() - last["created_at"] < VERSION_EVERY):
        return
    if last is None and VERSION_EVERY and db.now() - r["created_at"] < 60:
        return  # brand-new document: nothing worth keeping yet
    _snapshot(u, r, "auto")


def office_versions(req, params):
    u = require_user(req)
    r = _office_get(u, params["id"])
    rows = db.all_rows("SELECT id, title, size, reason, created_at FROM office_versions WHERE doc_id = ? AND user_id = ? ORDER BY created_at DESC, id DESC",
                       (r["id"], u["id"]))
    return 200, {"versions": [{"id": v["id"], "title": v["title"], "size": v["size"], "reason": v["reason"], "createdAt": v["created_at"]} for v in rows],
                 "current": {"title": r["title"], "updatedAt": r["updated_at"]}}


def _version_get(u, doc_id, vid):
    try:
        vid = int(vid)
    except ValueError:
        raise ApiError(404, "Versionen findes ikke.", "not_found")
    v = db.one("SELECT * FROM office_versions WHERE id = ? AND doc_id = ? AND user_id = ?", (vid, doc_id, u["id"]))
    if not v:
        raise ApiError(404, "Versionen findes ikke.", "not_found")
    return v


def office_version_get(req, params):
    u = require_user(req)
    r = _office_get(u, params["id"])
    v = _version_get(u, r["id"], params["vid"])
    return 200, {"version": {"id": v["id"], "title": v["title"], "createdAt": v["created_at"], "reason": v["reason"], "data": json.loads(v["data"])}}


def office_version_restore(req, params):
    u = require_user(req)
    r = _office_get(u, params["id"])
    v = _version_get(u, r["id"], params["vid"])
    _snapshot(u, r, "before-restore")
    db.q("UPDATE office_docs SET title = ?, data = ?, size = ?, updated_at = ? WHERE id = ? AND user_id = ?",
         (v["title"], v["data"], v["size"], db.now(), r["id"], u["id"]))
    return 200, {"doc": _office_row(_office_get(u, r["id"]), with_data=True)}


# ── uploaded images (documents, slides, Servicehjælp) ──────────────────
MAX_FILE_BYTES = 15 * 1024 * 1024
FILE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{16,40}$")
IMAGE_MAGIC = ((b"\x89PNG\r\n\x1a\n", "image/png"), (b"\xff\xd8\xff", "image/jpeg"), (b"GIF87a", "image/gif"), (b"GIF89a", "image/gif"))


def _sniff_image(raw):
    for magic, mime in IMAGE_MAGIC:
        if raw.startswith(magic):
            return mime
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "image/webp"
    return None


def file_upload(req, _):
    u = require_user(req)
    raw = req.raw_body()
    if not raw:
        raise ApiError(400, "Ingen fil modtaget.", "invalid")
    if len(raw) > MAX_FILE_BYTES:
        raise ApiError(413, "Billedet er for stort (højst 15 MB).", "too_large")
    mime = _sniff_image(raw)
    if not mime:
        raise ApiError(400, "Kun billeder (PNG, JPEG, GIF eller WebP) kan uploades.", "invalid_type")
    name = (req.headers.get("X-File-Name") or "")[:120]
    try:
        from urllib.parse import unquote as _uq
        name = _uq(name)[:120]
    except Exception:
        name = ""
    fid = secrets.token_urlsafe(16)
    db.q("INSERT INTO office_files(id, user_id, name, mime, size, data, created_at) VALUES(?,?,?,?,?,?,?)",
         (fid, u["id"], name, mime, len(raw), raw, db.now()))
    return 201, {"file": {"id": fid, "url": f"/api/office/files/{fid}", "size": len(raw), "mime": mime}}


def file_get(req, params):
    u = require_user(req)
    if not FILE_ID_RE.match(params["fid"]):
        raise ApiError(404, "Filen findes ikke.", "not_found")
    f = db.one("SELECT mime, data FROM office_files WHERE id = ? AND user_id = ?", (params["fid"], u["id"]))
    if not f:
        raise ApiError(404, "Filen findes ikke.", "not_found")
    return 200, bytes(f["data"]), {"Content-Type": f["mime"], "Cache-Control": "private, max-age=31536000, immutable",
                                   "Content-Security-Policy": "default-src 'none'; sandbox"}


def cleanup_files(min_age=24 * 3600):
    """Remove uploaded images that no document, version or app data refers to any more."""
    removed = 0
    for f in db.all_rows("SELECT id, user_id FROM office_files WHERE created_at < ?", (db.now() - min_age,)):
        like = f"%{f['id']}%"
        used = (db.one("SELECT 1 FROM office_docs WHERE user_id = ? AND data LIKE ? LIMIT 1", (f["user_id"], like))
                or db.one("SELECT 1 FROM office_versions WHERE user_id = ? AND data LIKE ? LIMIT 1", (f["user_id"], like))
                or db.one("SELECT 1 FROM app_state WHERE user_id = ? AND data LIKE ? LIMIT 1", (f["user_id"], like)))
        if not used:
            db.q("DELETE FROM office_files WHERE id = ?", (f["id"],))
            removed += 1
    return removed


def office_delete(req, params):
    u = require_user(req)
    r = _office_get(u, params["id"])
    db.q("DELETE FROM office_docs WHERE id = ? AND user_id = ?", (r["id"], u["id"]))
    return 200, {"ok": True}


def office_duplicate(req, params):
    u = require_user(req)
    r = _office_get(u, params["id"])
    doc_id = secrets.token_urlsafe(12)
    t = db.now()
    title = (r["title"] + " (kopi)")[:160]
    db.q("INSERT INTO office_docs(id, user_id, kind, title, preview, data, size, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
         (doc_id, u["id"], r["kind"], title, r["preview"], r["data"], r["size"], t, t))
    return 201, {"doc": _office_row(_office_get(u, doc_id))}


def health(req, _):
    # The program window pings ?app=1 every 10 s and ?app=0 when it is closed, so the desktop launcher
    # never stops the server under an open window.
    flag = (req.query.get("app") or [""])[0]
    if flag == "1":
        SYSTEM["app_seen"] = time.time()
    elif flag == "0":
        SYSTEM["app_seen"] = 0.0
    seen = SYSTEM["app_seen"]
    return 200, {"ok": True, "service": "hubtech", "version": config.VERSION, "app": SYSTEM["launcher"],
                 "appSeenAgo": round(time.time() - seen, 1) if seen else None}


_PRECACHE = None


def app_precache(req, _):
    """Files the service worker stores so HUBTECH opens without a connection to the server."""
    global _PRECACHE
    if _PRECACHE is None:
        web = config.WEB_DIR
        files = ["/", "/index.html", "/manifest.webmanifest"]
        for sub, exts in (("js", (".js",)), ("css", (".css",)), ("fonts", (".css", ".woff2")), ("assets", (".svg", ".png", ".ico"))):
            for p in sorted((web / sub).rglob("*")):
                if p.is_file() and p.suffix in exts:
                    files.append("/" + p.relative_to(web).as_posix())
        _PRECACHE = {"version": config.VERSION, "files": files}
    return 200, _PRECACHE


# Set by app.py: a callable that stops the server, and whether a desktop launcher started it.
SYSTEM = {"shutdown": None, "restart": None, "launcher": False, "app_seen": 0.0, "token": ""}


def _loopback(req):
    return req.client_ip in ("127.0.0.1", "::1", "::ffff:127.0.0.1")


def system_info(req, _):
    u = require_user(req)
    return 200, {"version": config.VERSION, "launcher": SYSTEM["launcher"], "android": bool(SYSTEM.get("android")),
                 "canShutdown": u["role"] == "owner" and _local_direct(req) and SYSTEM["shutdown"] is not None,
                 "dataDir": str(config.DATA_DIR) if u["role"] == "owner" else None}


# ── Backups (owner) and personal export/import (every user) ──────────────
def backups_list(req, _):
    require_owner(req)
    return 200, {"backups": backup.list_backups(), "folder": str(backup.folder()), "keepAuto": backup.KEEP_AUTO}


def backups_create(req, _):
    require_owner(req)
    return 201, {"backup": backup.make_backup("manual")}


def backups_download(req, params):
    require_owner(req)
    p = backup.path_of(params["name"])
    if not p:
        raise ApiError(404, "Sikkerhedskopien findes ikke.", "not_found")
    return 200, p.read_bytes(), {"Content-Type": "application/vnd.sqlite3",
                                 "Content-Disposition": f'attachment; filename="{p.name}"'}


def backups_restore(req, _):
    """Restore from a copy in the backups folder ({"name": …}) or from an uploaded .db file (raw body)."""
    require_owner(req)
    ctype = (req.headers.get("Content-Type") or "").split(";")[0].strip()
    tmp = None
    try:
        if ctype == "application/json":
            src = backup.path_of(body_str(req.json(), "name", 120, required=True))
            if not src:
                raise ApiError(404, "Sikkerhedskopien findes ikke.", "not_found")
        else:
            raw = req.raw_body()
            if not raw:
                raise ApiError(400, "Vælg en sikkerhedskopi (.db).", "invalid")
            tmp = backup.folder() / f"upload-{secrets.token_hex(6)}.db.part"
            tmp.write_bytes(raw)
            src = tmp
        try:
            safety = backup.restore_from(src)
        except backup.InvalidBackup as e:
            raise ApiError(400, str(e), "invalid_backup")
    finally:
        if tmp is not None:
            try:
                tmp.unlink()
            except OSError:
                pass
    still = auth.session_user(req.session_token) if req.session_token else None
    return 200, {"ok": True, "safetyCopy": safety, "loggedOut": still is None}


EXPORT_FORMAT = "hubtech-export"


def export_me(req, _):
    return 200, _export_data(require_user(req))


def _export_data(u):
    uid = u["id"]
    prefs = db.one("SELECT data FROM prefs WHERE user_id = ?", (uid,))
    states = {r["app_id"]: json.loads(r["data"]) for r in db.all_rows("SELECT app_id, data FROM app_state WHERE user_id = ?", (uid,))}
    office = [_office_row(r, with_data=True) for r in db.all_rows("SELECT * FROM office_docs WHERE user_id = ? ORDER BY created_at", (uid,))]
    favs = [{"kind": r["kind"], "ref": r["ref"], "createdAt": r["created_at"]} for r in db.all_rows("SELECT * FROM favorites WHERE user_id = ?", (uid,))]
    meta = {r["project_id"]: json.loads(r["data"]) for r in db.all_rows("SELECT project_id, data FROM project_meta WHERE user_id = ?", (uid,))}
    import base64 as _b64
    files = [{"id": f["id"], "name": f["name"], "mime": f["mime"], "data": _b64.b64encode(bytes(f["data"])).decode("ascii")}
             for f in db.all_rows("SELECT id, name, mime, data FROM office_files WHERE user_id = ?", (uid,))]
    act = [{"appId": r["app_id"], "kind": r["kind"], "title": r["title"], "detail": r["detail"], "ref": r["ref"], "createdAt": r["created_at"]}
           for r in db.all_rows("SELECT * FROM activity WHERE user_id = ? ORDER BY created_at DESC LIMIT 500", (uid,))]
    return {"format": EXPORT_FORMAT, "version": 1, "app": "HUBTECH", "appVersion": config.VERSION, "exportedAt": db.now(),
                 "user": {"username": u["username"], "displayName": u["display_name"], "email": u["email"], "avatar": u["avatar"]},
                 "prefs": json.loads(prefs["data"]) if prefs else {}, "states": states, "office": office,
                 "favorites": favs, "projectMeta": meta, "activity": act, "files": files}


def import_me(req, _):
    """Restore your own data from an export file. Existing data with the same keys is replaced; nothing else is deleted."""
    u = require_user(req)
    counts = _import_data(u["id"], req.json())
    return 200, {"ok": True, "imported": counts}


def _import_data(uid, b, keep_times=False, quiet=False):
    """keep_times: use the source's timestamps (sync) instead of now; quiet: no activity entry."""
    if not isinstance(b, dict) or b.get("format") != EXPORT_FORMAT or not isinstance(b.get("version"), int) or b["version"] > 1:
        raise ApiError(400, "Filen er ikke en HUBTECH-eksport.", "invalid_export")
    t = db.now()
    counts = {"states": 0, "office": 0, "favorites": 0, "projects": 0, "files": 0}
    # images: keep their ids unless another account already owns that id – then give them new ids
    import base64 as _b64
    remap = {}
    new_files = []
    for f in b.get("files") or []:
        try:
            fid = str(f["id"])
            raw = _b64.b64decode(f["data"], validate=True)
        except Exception:
            continue
        mime = _sniff_image(raw)
        if not mime or not FILE_ID_RE.match(fid) or len(raw) > MAX_FILE_BYTES:
            continue
        owner = db.one("SELECT user_id FROM office_files WHERE id = ?", (fid,))
        if owner and owner["user_id"] == uid:
            continue
        if owner:
            nid = secrets.token_urlsafe(16)
            remap[fid] = nid
            fid = nid
        new_files.append((fid, uid, str(f.get("name") or "")[:120], mime, len(raw), raw, t))

    def fix(obj):
        if not remap:
            return obj
        txt = json.dumps(obj)
        for a, z in remap.items():
            txt = txt.replace(a, z)
        return json.loads(txt)
    if remap:
        b["office"] = fix(b.get("office") or [])
        b["states"] = fix(b.get("states") or {})
    c = db.conn()
    c.execute("BEGIN")
    try:
        for row in new_files:
            c.execute("INSERT INTO office_files(id, user_id, name, mime, size, data, created_at) VALUES(?,?,?,?,?,?,?)", row)
            counts["files"] += 1
        if isinstance(b.get("prefs"), dict) and b["prefs"]:
            c.execute("INSERT INTO prefs(user_id, data, updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
                      (uid, json.dumps(b["prefs"]), t))
        for app_id, data in (b.get("states") or {}).items():
            if APP_ID_RE.match(str(app_id)) and isinstance(data, (dict, list)):
                raw = json.dumps(data)
                if len(raw) <= config.MAX_STATE_BYTES:
                    st = t
                    if keep_times:
                        try:
                            st = int((b.get("stateTimes") or {}).get(app_id) or t)
                        except (TypeError, ValueError):
                            st = t
                    c.execute("INSERT INTO app_state(user_id, app_id, data, updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id, app_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
                              (uid, app_id, raw, st))
                    counts["states"] += 1
        for d in b.get("office") or []:
            if not isinstance(d, dict) or d.get("kind") not in OFFICE_KINDS or not isinstance(d.get("data"), (dict, list)):
                continue
            raw = json.dumps(d["data"])
            if len(raw) > MAX_OFFICE_BYTES:
                continue
            doc_id = str(d.get("id") or "")
            owner = db.one("SELECT user_id FROM office_docs WHERE id = ?", (doc_id,)) if OFFICE_ID_RE.match(doc_id) else None
            if not OFFICE_ID_RE.match(doc_id) or (owner and owner["user_id"] != uid):
                doc_id = secrets.token_urlsafe(12)
            title = str(d.get("title") or "Importeret")[:160]
            preview = str(d.get("preview") or "")[:400]
            created = int(d.get("createdAt") or t)
            updated = int(d.get("updatedAt") or t)
            c.execute("INSERT INTO office_docs(id, user_id, kind, title, preview, data, starred, trashed, size, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) "
                      "ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, title = excluded.title, preview = excluded.preview, data = excluded.data, "
                      "starred = excluded.starred, trashed = excluded.trashed, size = excluded.size, updated_at = excluded.updated_at",
                      (doc_id, uid, d["kind"], title, preview, raw, int(bool(d.get("starred"))), int(bool(d.get("trashed"))), len(raw), created, updated))
            counts["office"] += 1
        for f in b.get("favorites") or []:
            if isinstance(f, dict) and f.get("kind") in KNOWN_FAV_KINDS and isinstance(f.get("ref"), str) and len(f["ref"]) <= 120:
                c.execute("INSERT OR IGNORE INTO favorites(user_id, kind, ref, created_at) VALUES(?,?,?,?)", (uid, f["kind"], f["ref"], int(f.get("createdAt") or t)))
                counts["favorites"] += 1
        for pid, data in (b.get("projectMeta") or {}).items():
            if isinstance(data, dict) and len(str(pid)) <= 200:
                c.execute("INSERT INTO project_meta(user_id, project_id, data, updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id, project_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
                          (uid, str(pid), json.dumps(data), t))
                counts["projects"] += 1
        c.execute("COMMIT")
    except Exception:
        c.execute("ROLLBACK")
        raise
    if not quiet:
        log_activity(uid, "hubtech", "import", "Data gendannet fra eksport", f"{counts['office']} dokumenter, {counts['states']} app-data")
    return counts


def _local_direct(req):
    """The request comes straight from this computer – not relayed by a reverse proxy on it."""
    if not _loopback(req):
        return False
    if any(req.headers.get(h) for h in ("X-Forwarded-For", "X-Real-IP", "Forwarded", "X-Forwarded-Host")):
        return False
    host = (req.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]").lower()
    return host in ("127.0.0.1", "localhost", "::1")


def _lan_addresses():
    import socket
    found = []
    try:
        s_ = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s_.connect(("192.0.2.1", 9))          # TEST-NET: no packet is sent, but the OS picks the LAN interface
        found.append(s_.getsockname()[0])
        s_.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            found.append(info[4][0])
    except OSError:
        pass
    out = []
    for ip in found:
        if ip.startswith("127.") or ip in out:
            continue
        if ip.startswith(("10.", "192.168.")) or re.match(r"^172\.(1[6-9]|2\d|3[01])\.", ip) or ip.startswith("100."):
            out.append(ip)
    if not out:  # unusual network – show what we have rather than nothing
        out = [ip for ip in dict.fromkeys(found) if not ip.startswith("127.")]
    return out


def _tailscale():
    import shutil
    import subprocess
    exe = shutil.which("tailscale")
    if not exe:
        for cand in (r"C:\Program Files\Tailscale\tailscale.exe", "/Applications/Tailscale.app/Contents/MacOS/Tailscale"):
            if os.path.exists(cand):
                exe = cand
                break
    if not exe:
        return {"installed": False}
    try:
        flags = 0x08000000 if os.name == "nt" else 0
        r = subprocess.run([exe, "status", "--json"], capture_output=True, text=True, timeout=4, creationflags=flags)
        data = json.loads(r.stdout or "{}")
        dns = ((data.get("Self") or {}).get("DNSName") or "").rstrip(".")
        serving = funnel = False
        try:   # is HUBTECH shared on the tailnet (serve) or on the whole internet (funnel)?
            r2 = subprocess.run([exe, "serve", "status", "--json"], capture_output=True, text=True, timeout=4, creationflags=flags)
            sv = json.loads(r2.stdout or "{}")
            serving = bool(sv.get("TCP") or sv.get("Web"))
            funnel = any(bool(v) for v in (sv.get("AllowFunnel") or {}).values())
        except Exception:
            pass
        return {"installed": True, "running": data.get("BackendState") == "Running", "dnsName": dns or None,
                "url": f"https://{dns}" if dns else None, "serving": serving, "funnel": funnel}
    except Exception:
        return {"installed": True, "running": False}


def network_info(req, _):
    _require_local_owner(req)
    if SYSTEM.get("android"):
        raise ApiError(404, "Ikke tilgængelig i Android-appen.", "not_found")
    port = SYSTEM.get("port") or config.PORT
    host = SYSTEM.get("host") or config.HOST
    lan = host in ("0.0.0.0", "", "::")
    addrs = _lan_addresses() if lan else []
    return 200, {"lanAccess": bool(db.get_server_setting("lan_access", False)), "listening": host, "open": lan, "port": port,
                 "urls": [f"http://{a}:{port}" for a in addrs], "hostFromEnv": bool(os.environ.get("HUBTECH_HOST")),
                 "tailscale": _tailscale(), "signup": signup_mode(), "restartable": SYSTEM.get("restart") is not None}


def network_set(req, _):
    _require_local_owner(req)
    if SYSTEM.get("android"):
        raise ApiError(404, "Ikke tilgængelig i Android-appen.", "not_found")
    b = req.json()
    on = bool(b.get("lanAccess"))
    db.set_server_setting("lan_access", on)
    restart = SYSTEM.get("restart")
    if b.get("restart", True) and restart:
        restart()
    return 200, {"lanAccess": on, "restarting": bool(restart and b.get("restart", True))}


def public_access_info(req, _):
    _require_local_owner(req)
    if SYSTEM.get("android"):
        raise ApiError(404, "Ikke tilgængelig i Android-appen.", "not_found")
    from . import remote_access
    st = remote_access.state()
    return 200, {"tailscale": st, "job": remote_access.job_info(), "enabled": bool(db.get_server_setting("public_access", False)),
                 "canInstall": bool(remote_access.winget()), "download": remote_access.DOWNLOAD, "port": SYSTEM.get("port") or config.PORT}


def public_access_set(req, _):
    _require_local_owner(req)
    if SYSTEM.get("android"):
        raise ApiError(404, "Ikke tilgængelig i Android-appen.", "not_found")
    from . import remote_access
    b = req.json()
    if b.get("on") is False:
        remote_access.turn_off()
        return 200, {"step": "off"}
    return 200, {"step": remote_access.next_step(SYSTEM.get("port") or config.PORT), "job": remote_access.job_info()}


def _require_local_owner(req):
    require_owner(req)
    if not _local_direct(req):
        raise ApiError(403, "Det kan kun gøres fra den computer, HUBTECH kører på.", "forbidden")


def update_check(req, _):
    _require_local_owner(req)
    if SYSTEM.get("android"):
        raise ApiError(404, "Android-appen opdateres med en ny APK.", "not_found")
    raw = req.raw_body()
    if not raw:
        raise ApiError(400, "Vælg en zip-fil med HUBTECH.", "invalid")
    try:
        return 200, {"update": updater.check(raw), "restartable": SYSTEM.get("restart") is not None}
    except updater.UpdateError as e:
        raise ApiError(400, str(e), "invalid_update")


def update_install(req, _):
    _require_local_owner(req)
    uid = body_str(req.json(), "id", 40, required=True)
    try:
        res = updater.install(uid)
    except updater.UpdateError as e:
        raise ApiError(400, str(e), "invalid_update")
    restart = SYSTEM.get("restart")
    if restart:
        restart()
    return 200, {**res, "restarting": bool(restart)}


# ── sync with another HUBTECH (phone ⇄ computer) ─────────────────────
def _remote_session(b):
    import http.cookiejar
    url = body_str(b, "url", 300, required=True).rstrip("/")
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise ApiError(400, "Skriv adressen på den anden HUBTECH, fx https://min-pc.tailnet.ts.net eller http://192.168.1.20:8090.", "invalid", {"field": "url"})
    if p.hostname in ("127.0.0.1", "localhost", "::1") and (p.port or 80) == SYSTEM.get("port"):
        raise ApiError(400, "Det er denne HUBTECH – skriv den anden enheds adresse.", "invalid", {"field": "url"})
    username = body_str(b, "username", 80, required=True)
    password = body_str(b, "password", 200, required=True)
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    hdr = {"X-Requested-With": "hubtech", "Content-Type": "application/json", "Accept": "application/json"}

    def call(method, path, body=None, timeout=30):
        data = json.dumps(body).encode("utf-8") if body is not None else None
        r = urllib.request.Request(url + path, data=data, method=method, headers=hdr)
        try:
            with opener.open(r, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as e:
            try:
                msg = json.loads(e.read().decode("utf-8")).get("error")
            except Exception:
                msg = None
            raise ApiError(502 if e.code >= 500 else 400, f"Den anden HUBTECH svarede: {msg or e.code}", "remote_error")
        except (urllib.error.URLError, OSError, ValueError) as e:
            raise ApiError(502, f"Kunne ikke nå {url} ({getattr(e, 'reason', e)}).", "remote_unreachable")
    health = call("GET", "/api/health", timeout=8)
    if health.get("service") != "hubtech":
        raise ApiError(400, "Adressen er ikke en HUBTECH-server.", "remote_error")
    call("POST", "/api/auth/login", {"username": username, "password": password})
    return url, call


def sync_pull(req, _):
    """Fetch my data from another HUBTECH (e.g. the computer) into this one."""
    u = require_user(req)
    url, call = _remote_session(req.json())
    data = call("GET", "/api/me/export", timeout=120)
    counts = _import_data(u["id"], data)
    db.set_server_setting(f"sync_url_{u['id']}", url)
    return 200, {"ok": True, "imported": counts, "url": url}


def sync_push(req, _):
    """Send my data from this HUBTECH to another one."""
    u = require_user(req)
    url, call = _remote_session(req.json())
    r = call("POST", "/api/me/import", _export_data(u), timeout=180)
    db.set_server_setting(f"sync_url_{u['id']}", url)
    return 200, {"ok": True, "imported": r.get("imported", {}), "url": url}


def sync_info(req, _):
    u = require_user(req)
    return 200, {"url": db.get_server_setting(f"sync_url_{u['id']}", "")}


# ── automatic two-way sync (see autosync.py) ──
def _sync_user(req):
    """The logged-in user, or the user a sync key belongs to (phone → computer)."""
    if req.user:
        return req.user
    u = autosync.user_for_token(req.headers.get("X-Hubtech-Sync") or "")
    if not u:
        raise ApiError(401, "Ugyldig synkroniseringsnøgle.", "unauthenticated")
    return u


def sync_token_create(req, _):
    u = require_user(req)
    label = body_str(req.json(), "label", 80) or "Enhed"
    return 200, {"token": autosync.create_token(u["id"], label)}


def sync_token_delete(req, _):
    tok = req.headers.get("X-Hubtech-Sync") or ""
    if not autosync.user_for_token(tok):
        raise ApiError(401, "Ugyldig synkroniseringsnøgle.", "unauthenticated")
    autosync.revoke_token(tok)
    return 200, {"ok": True}


def sync_manifest(req, _):
    return 200, autosync.manifest(_sync_user(req)["id"])


def sync_fetch(req, _):
    return 200, autosync.fetch(_sync_user(req)["id"], req.json())


def sync_apply(req, _):
    u = _sync_user(req)
    return 200, {"ok": True, "imported": autosync.apply(u["id"], req.json())}


def sync_auto_get(req, _):
    u = require_user(req)
    return 200, autosync.public_status(autosync.get_config(u["id"]))


def sync_auto_set(req, _):
    """Turn on automatic sync: log in to the other HUBTECH once, get a sync key, run the first sync."""
    u = require_user(req)
    b = req.json()
    url, call = _remote_session(b)
    try:
        interval = int(b.get("interval") or 15)
    except (TypeError, ValueError):
        interval = 15
    tok = call("POST", "/api/sync/token", {"label": "HUBTECH-app" if SYSTEM.get("android") else "HUBTECH"}).get("token")
    if not tok:
        raise ApiError(502, "Den anden HUBTECH er for gammel til automatisk synkronisering – opdatér den først.", "remote_error")
    autosync.save_config(u["id"], url, tok, interval)
    db.set_server_setting(f"sync_url_{u['id']}", url)
    res = autosync.run(u["id"])
    return 200, {**autosync.public_status(autosync.get_config(u["id"])), "first": res}


def sync_auto_interval(req, _):
    u = require_user(req)
    cfg = autosync.get_config(u["id"])
    if not cfg:
        raise ApiError(400, "Automatisk synkronisering er ikke slået til.", "invalid")
    try:
        iv = int(req.json().get("interval"))
    except (TypeError, ValueError):
        iv = 15
    cfg["interval"] = iv if iv in autosync.INTERVALS else 15
    db.set_server_setting(f"autosync_{u['id']}", cfg)
    return 200, autosync.public_status(cfg)


def sync_auto_off(req, _):
    u = require_user(req)
    autosync.disable(u["id"])
    return 200, {"enabled": False}


def sync_auto_run(req, _):
    u = require_user(req)
    if not autosync.get_config(u["id"]):
        raise ApiError(400, "Automatisk synkronisering er ikke slået til.", "invalid")
    if (req.json() or {}).get("wait"):
        return 200, autosync.run(u["id"])
    return 200, {"started": autosync.run_async(u["id"])}


def android_update(req, _):
    """Is there a newer Android APK? (asked by the app; the phone's own server fetches the small version file)."""
    require_user(req)
    url = config.ANDROID_UPDATE_URL
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "HUBTECH"}), timeout=10) as r:
            info = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        msg = "Opdateringerne kan ikke ses – GitHub-repoet er privat. Gør det offentligt, eller installér nye versioner selv." if e.code == 404 else f"GitHub svarede {e.code}."
        return 200, {"ok": False, "error": msg}
    except (urllib.error.URLError, OSError, ValueError) as e:
        return 200, {"ok": False, "error": f"Ingen forbindelse til GitHub ({getattr(e, 'reason', e)})."}
    if not isinstance(info, dict) or not info.get("apk"):
        return 200, {"ok": False, "error": "Versionsfilen er ugyldig."}
    apk = url.rsplit("/", 1)[0] + "/" + str(info["apk"])
    return 200, {"ok": True, "version": str(info.get("version", "")), "build": int(info.get("build") or 0),
                 "versionCode": int(info.get("versionCode") or 0), "apkUrl": apk, "date": info.get("date")}


def system_shutdown(req, _):
    # 1) the desktop program stops "its" server with the one-time key it handed over at start
    token, given = SYSTEM.get("token") or "", req.headers.get("X-Hubtech-Shutdown") or ""
    if token and given:
        if not secrets.compare_digest(token, given):
            raise ApiError(403, "Forkert nøgle.", "forbidden")
    else:
        # 2) the owner, from the computer the server runs on (never through a proxy)
        require_owner(req)
        if not _local_direct(req):
            raise ApiError(403, "HUBTECH kan kun lukkes fra den computer, den kører på.", "forbidden")
    if SYSTEM["shutdown"] is None:
        raise ApiError(409, "Serveren kan ikke lukkes herfra.", "unavailable")
    SYSTEM["shutdown"]()
    return 202, {"ok": True}


ROUTES = [
    ("GET", r"/api/health", health),
    ("GET", r"/api/app/precache", app_precache),
    ("GET", r"/api/system", system_info),
    ("POST", r"/api/system/shutdown", system_shutdown),
    ("GET", r"/api/system/network", network_info),
    ("PUT", r"/api/system/network", network_set),
    ("GET", r"/api/system/public-access", public_access_info),
    ("POST", r"/api/system/public-access", public_access_set),
    ("POST", r"/api/system/update/check", update_check),
    ("POST", r"/api/system/update/install", update_install),
    ("GET", r"/api/system/backups", backups_list),
    ("POST", r"/api/system/backups", backups_create),
    ("GET", r"/api/system/backups/(?P<name>[A-Za-z0-9_.-]+)", backups_download),
    ("POST", r"/api/system/restore", backups_restore),
    ("GET", r"/api/me/export", export_me),
    ("GET", r"/api/sync", sync_info),
    ("POST", r"/api/sync/pull", sync_pull),
    ("POST", r"/api/sync/push", sync_push),
    ("POST", r"/api/sync/token", sync_token_create),
    ("DELETE", r"/api/sync/token", sync_token_delete),
    ("GET", r"/api/sync/manifest", sync_manifest),
    ("POST", r"/api/sync/fetch", sync_fetch),
    ("POST", r"/api/sync/apply", sync_apply),
    ("GET", r"/api/sync/auto", sync_auto_get),
    ("POST", r"/api/sync/auto", sync_auto_set),
    ("PUT", r"/api/sync/auto", sync_auto_interval),
    ("DELETE", r"/api/sync/auto", sync_auto_off),
    ("POST", r"/api/sync/auto/run", sync_auto_run),
    ("GET", r"/api/system/android-update", android_update),
    ("POST", r"/api/me/import", import_me),
    ("GET", r"/api/auth/status", auth_status),
    ("POST", r"/api/auth/register", register),
    ("POST", r"/api/auth/login", login),
    ("POST", r"/api/auth/logout", logout),
    ("GET", r"/api/me", me),
    ("PATCH", r"/api/me", update_me),
    ("DELETE", r"/api/me", delete_me),
    ("POST", r"/api/me/password", change_password),
    ("GET", r"/api/me/sessions", sessions_info),
    ("POST", r"/api/me/sessions/revoke", revoke_other_sessions),
    ("GET", r"/api/me/prefs", get_prefs),
    ("PUT", r"/api/me/prefs", put_prefs),
    ("POST", r"/api/me/onboarding", onboarding),
    ("GET", r"/api/me/summary", summary),
    ("GET", r"/api/state/(?P<app>[^/]+)", get_state),
    ("PUT", r"/api/state/(?P<app>[^/]+)", put_state),
    ("GET", r"/api/states/(?P<prefix>[a-z0-9-]{2,20})", get_states_prefix),
    ("GET", r"/api/office/docs", office_list),
    ("GET", r"/api/office/search", office_search),
    ("POST", r"/api/office/docs", office_create),
    ("GET", r"/api/office/docs/(?P<id>[^/]+)", office_get),
    ("PUT", r"/api/office/docs/(?P<id>[^/]+)", office_update),
    ("DELETE", r"/api/office/docs/(?P<id>[^/]+)", office_delete),
    ("POST", r"/api/office/docs/(?P<id>[^/]+)/duplicate", office_duplicate),
    ("GET", r"/api/office/docs/(?P<id>[^/]+)/versions", office_versions),
    ("GET", r"/api/office/docs/(?P<id>[^/]+)/versions/(?P<vid>\d+)", office_version_get),
    ("POST", r"/api/office/docs/(?P<id>[^/]+)/versions/(?P<vid>\d+)/restore", office_version_restore),
    ("POST", r"/api/office/files", file_upload),
    ("GET", r"/api/office/files/(?P<fid>[A-Za-z0-9_-]+)", file_get),
    ("GET", r"/api/favorites", get_favorites),
    ("POST", r"/api/favorites", toggle_favorite),
    ("GET", r"/api/activity", get_activity),
    ("POST", r"/api/activity", post_activity),
    ("GET", r"/api/circuitpilot/leaderboard", leaderboard),
    ("GET", r"/api/projects", projects_list),
    ("GET", r"/api/projects/(?P<pid>[^/]+)", project_get),
    ("POST", r"/api/projects/(?P<pid>[^/]+)/open", project_open),
    ("PATCH", r"/api/projects/(?P<pid>[^/]+)/meta", project_meta),
    ("GET", r"/api/integrations", integrations_status),
    ("PUT", r"/api/integrations/cursor", cursor_config),
    ("PUT", r"/api/integrations/(?P<which>[a-z-]+)/url", set_integration_url),
    ("GET", r"/api/integrations/byteforge/check", byteforge_check),
    ("POST", r"/api/integrations/byteforge/start", byteforge_start),
    ("GET", r"/api/users", users_list),
    ("POST", r"/api/users", users_create),
    ("PUT", r"/api/users/signup", set_signup),
]
COMPILED = [(m, re.compile("^" + p + "$"), h) for m, p, h in ROUTES]
