"""Shared calendars and Fællesskab (servers, channels, roles, messages, friends, snaps, stories, moderation, music).

All handlers follow api.py: (req, params) -> (status, payload[, headers]).
Live updates go through live.publish(); clients long-poll /api/live.
"""
import base64
import json
import re
import secrets
import threading
import time

from . import auth, db, live
from .api import ApiError, body_str, require_user

ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^\d{2}:\d{2}$")
DM_RE = re.compile(r"^dm-(\d+)-(\d+)$")
RANK = {"member": 1, "moderator": 2, "admin": 3, "owner": 4}
ROLE_DA = {"member": "medlem", "moderator": "moderator", "admin": "admin", "owner": "ejer"}
MIN_AGE = 13
MAX_MSG = 2000
MAX_IMAGE = 8 * 1024 * 1024
MAX_AUDIO = 25 * 1024 * 1024
EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🎉", "🔥", "👀", "✅", "🙏"]
DEFAULT_RULES = (
    "1. Vær venlig og respektfuld – ingen chikane, trusler eller hadefuld tale.\n"
    "2. Ingen spam, reklame eller svindel.\n"
    "3. Intet ulovligt, voldeligt eller seksuelt indhold.\n"
    "4. Del ikke andres personlige oplysninger.\n"
    "5. Følg moderatorernes anvisninger. Brud kan give tavshed, udsmidning eller udelukkelse.")


def _now_ms():
    return int(time.time() * 1000)


def _uid(prefix=""):
    return prefix + secrets.token_hex(8)


def _int(v, default=0, lo=None, hi=None):
    try:
        n = int(v)
    except (TypeError, ValueError):
        n = default
    if lo is not None:
        n = max(lo, n)
    if hi is not None:
        n = min(hi, n)
    return n


def _q(req, key, default=""):
    v = (getattr(req, "query", {}) or {}).get(key)
    return v[0] if v else default


_PRESENCE = {}          # uid -> 'online' | 'busy' | 'invisible' (cached; changed in cm_profile_update)


def presence_of(uid):
    if uid not in _PRESENCE:
        r = db.one("SELECT presence FROM cm_profiles WHERE user_id = ?", (uid,))
        _PRESENCE[uid] = (r["presence"] if r else None) or "online"
        if len(_PRESENCE) > 20000:
            _PRESENCE.clear()
    return _PRESENCE.get(uid, "online")


def _user_card(row):
    p = presence_of(row["id"])
    on = live.online(row["id"]) and p != "invisible"
    return {"id": row["id"], "username": row["username"], "name": row["display_name"], "avatar": row["avatar"],
            "online": on, "presence": ("busy" if p == "busy" else "online") if on else "offline"}


def _users(ids):
    ids = sorted({int(i) for i in ids if i})
    if not ids:
        return {}
    rows = db.all_rows(f"SELECT id, username, display_name, avatar FROM users WHERE id IN ({','.join('?' * len(ids))})", ids)
    return {r["id"]: _user_card(r) for r in rows}


def _user_by_name(name):
    name = (name or "").strip().lstrip("@")
    if not name:
        raise ApiError(400, "Skriv et brugernavn.", "missing", {"field": "username"})
    row = db.one("SELECT id, username, display_name, avatar FROM users WHERE username = ?", (name,))
    if not row:
        raise ApiError(404, f"Der findes ingen bruger med navnet '{name}'.", "no_user", {"field": "username"})
    return row


def _blocked_between(a, b):
    return bool(db.one("SELECT 1 FROM cm_blocks WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?)", (a, b, b, a)))


def _are_friends(a, b):
    return bool(db.one("SELECT 1 FROM cm_friends WHERE user_id = ? AND friend_id = ? AND status = 'accepted'", (min(a, b), max(a, b))))


# simple per-user flood protection for chat (in addition to the global write limit)
_flood = {}
_flood_lock = threading.Lock()


def _flood_check(uid, limit=8, window=10):
    t = time.time()
    with _flood_lock:
        hits = [x for x in _flood.get(uid, []) if t - x < window]
        if len(hits) >= limit:
            raise ApiError(429, "Du skriver for hurtigt. Vent et par sekunder.", "slow_down")
        hits.append(t)
        _flood[uid] = hits


# ══ Shared calendars ══════════════════════════════════════════════════════
def _cal_member(cal_id, uid, need=None):
    if not ID_RE.match(cal_id or ""):
        raise ApiError(404, "Kalenderen findes ikke.", "not_found")
    m = db.one("SELECT m.role, m.status, c.owner_id, c.name FROM cal_members m JOIN cal_shared c ON c.id = m.cal_id WHERE m.cal_id = ? AND m.user_id = ?", (cal_id, uid))
    if not m:
        raise ApiError(404, "Kalenderen findes ikke.", "not_found")
    if need and m["status"] != "accepted":
        raise ApiError(403, "Du skal acceptere invitationen først.", "pending")
    if need == "edit" and m["role"] not in ("owner", "editor"):
        raise ApiError(403, "Du kan kun se denne kalender – ejeren kan give dig lov til at redigere.", "forbidden")
    if need == "owner" and m["role"] != "owner":
        raise ApiError(403, "Kun kalenderens ejer kan gøre det.", "forbidden")
    return m


def _cal_members(cal_id, status=None):
    sql = "SELECT user_id FROM cal_members WHERE cal_id = ?" + (" AND status = ?" if status else "")
    return [r["user_id"] for r in db.all_rows(sql, (cal_id, status) if status else (cal_id,))]


def _cal_out(row, uid):
    mem = db.all_rows("SELECT user_id, role, status FROM cal_members WHERE cal_id = ? ORDER BY added_at", (row["id"],))
    users = _users([m["user_id"] for m in mem])
    me = next((m for m in mem if m["user_id"] == uid), None)
    return {"id": row["id"], "name": row["name"], "color": row["color"], "ownerId": row["owner_id"],
            "role": me["role"] if me else None, "status": me["status"] if me else None,
            "members": [{**users.get(m["user_id"], {"id": m["user_id"], "username": "?", "name": "?"}), "role": m["role"], "status": m["status"]} for m in mem]}


def _cal_notify(cal_id, payload, extra=()):
    live.publish(set(_cal_members(cal_id)) | set(extra), payload)


def cal_list(req, _):
    u = require_user(req)
    rows = db.all_rows("SELECT c.* FROM cal_shared c JOIN cal_members m ON m.cal_id = c.id WHERE m.user_id = ? ORDER BY c.created_at", (u["id"],))
    return 200, {"calendars": [_cal_out(r, u["id"]) for r in rows]}


def cal_create(req, _):
    u = require_user(req)
    b = req.json()
    name = body_str(b, "name", 60, required=True)
    color = body_str(b, "color", 7) or "#38bdf8"
    if not COLOR_RE.match(color):
        color = "#38bdf8"
    if db.one("SELECT COUNT(*) AS n FROM cal_shared WHERE owner_id = ?", (u["id"],))["n"] >= 30:
        raise ApiError(400, "Du kan højst eje 30 delte kalendere.", "limit")
    cid, t = _uid("k"), db.now()
    db.q("INSERT INTO cal_shared(id, owner_id, name, color, created_at) VALUES(?,?,?,?,?)", (cid, u["id"], name, color, t))
    db.q("INSERT INTO cal_members(cal_id, user_id, role, status, invited_by, added_at) VALUES(?,?,?,?,?,?)", (cid, u["id"], "owner", "accepted", u["id"], t))
    return 201, {"calendar": _cal_out(db.one("SELECT * FROM cal_shared WHERE id = ?", (cid,)), u["id"])}


def cal_update(req, params):
    u = require_user(req)
    _cal_member(params["id"], u["id"], "owner")
    b = req.json()
    name = body_str(b, "name", 60) or None
    color = body_str(b, "color", 7) or None
    if color and not COLOR_RE.match(color):
        raise ApiError(400, "Ugyldig farve.", "invalid")
    if name:
        db.q("UPDATE cal_shared SET name = ? WHERE id = ?", (name, params["id"]))
    if color:
        db.q("UPDATE cal_shared SET color = ? WHERE id = ?", (color, params["id"]))
    _cal_notify(params["id"], {"type": "cal", "cal": params["id"]})
    return 200, {"calendar": _cal_out(db.one("SELECT * FROM cal_shared WHERE id = ?", (params["id"],)), u["id"])}


def cal_delete(req, params):
    """The owner deletes the calendar for everyone; anyone else leaves it."""
    u = require_user(req)
    m = _cal_member(params["id"], u["id"])
    members = _cal_members(params["id"])
    if m["role"] == "owner":
        db.q("DELETE FROM cal_shared WHERE id = ?", (params["id"],))
    else:
        db.q("DELETE FROM cal_members WHERE cal_id = ? AND user_id = ?", (params["id"], u["id"]))
    live.publish(members, {"type": "cal", "cal": params["id"]})
    return 200, {"ok": True, "deleted": m["role"] == "owner"}


def cal_invite(req, params):
    u = require_user(req)
    _cal_member(params["id"], u["id"], "owner")
    b = req.json()
    who = _user_by_name(body_str(b, "username", 40, required=True))
    role = b.get("role") if b.get("role") in ("editor", "viewer") else "editor"
    if who["id"] == u["id"]:
        raise ApiError(400, "Du er allerede med i kalenderen.", "self")
    if _blocked_between(u["id"], who["id"]):
        raise ApiError(403, "Du kan ikke invitere denne bruger.", "blocked")
    if db.one("SELECT 1 FROM cal_members WHERE cal_id = ? AND user_id = ?", (params["id"], who["id"])):
        raise ApiError(409, f"{who['display_name']} er allerede inviteret.", "exists")
    if len(_cal_members(params["id"])) >= 50:
        raise ApiError(400, "En delt kalender kan højst have 50 deltagere.", "limit")
    db.q("INSERT INTO cal_members(cal_id, user_id, role, status, invited_by, added_at) VALUES(?,?,?,?,?,?)",
         (params["id"], who["id"], role, "pending", u["id"], db.now()))
    cal = db.one("SELECT name FROM cal_shared WHERE id = ?", (params["id"],))
    live.publish([who["id"]], {"type": "notify", "kind": "cal-invite", "title": "Ny kalenderinvitation",
                               "text": f"{u['display_name']} har inviteret dig til kalenderen \"{cal['name']}\".", "path": "/apps/calendar"})
    _cal_notify(params["id"], {"type": "cal", "cal": params["id"]})
    return 201, {"calendar": _cal_out(db.one("SELECT * FROM cal_shared WHERE id = ?", (params["id"],)), u["id"])}


def cal_member_update(req, params):
    u = require_user(req)
    _cal_member(params["id"], u["id"], "owner")
    role = req.json().get("role")
    if role not in ("editor", "viewer"):
        raise ApiError(400, "Rollen skal være 'editor' eller 'viewer'.", "invalid")
    target = _int(params["uid"])
    if target == u["id"]:
        raise ApiError(400, "Du er ejer af kalenderen.", "self")
    db.q("UPDATE cal_members SET role = ? WHERE cal_id = ? AND user_id = ?", (role, params["id"], target))
    _cal_notify(params["id"], {"type": "cal", "cal": params["id"]})
    return 200, {"calendar": _cal_out(db.one("SELECT * FROM cal_shared WHERE id = ?", (params["id"],)), u["id"])}


def cal_member_remove(req, params):
    u = require_user(req)
    target = _int(params["uid"])
    m = _cal_member(params["id"], u["id"])
    if target != u["id"] and m["role"] != "owner":
        raise ApiError(403, "Kun ejeren kan fjerne andre.", "forbidden")
    if target == m["owner_id"]:
        raise ApiError(400, "Ejeren kan ikke fjernes – slet kalenderen i stedet.", "owner")
    members = _cal_members(params["id"])
    db.q("DELETE FROM cal_members WHERE cal_id = ? AND user_id = ?", (params["id"], target))
    live.publish(members, {"type": "cal", "cal": params["id"]})
    return 200, {"ok": True}


def cal_accept(req, params):
    u = require_user(req)
    _cal_member(params["id"], u["id"])
    db.q("UPDATE cal_members SET status = 'accepted' WHERE cal_id = ? AND user_id = ?", (params["id"], u["id"]))
    _cal_notify(params["id"], {"type": "cal", "cal": params["id"]})
    return 200, {"calendar": _cal_out(db.one("SELECT * FROM cal_shared WHERE id = ?", (params["id"],)), u["id"])}


def _clean_event(e):
    if not isinstance(e, dict):
        raise ApiError(400, "Aftalen har et ugyldigt format.", "invalid")
    title = str(e.get("title") or "").strip()[:160] or "Aftale"
    date = str(e.get("date") or "")
    if not DATE_RE.match(date):
        raise ApiError(400, "Aftalen mangler en gyldig dato.", "invalid", {"field": "date"})
    end = str(e.get("endDate") or "") or None
    if end and (not DATE_RE.match(end) or end < date):
        end = None
    all_day = bool(e.get("allDay"))
    start = str(e.get("start") or "") if not all_day else ""
    stop = str(e.get("end") or "") if not all_day else ""
    out = {"title": title, "date": date, "endDate": end, "allDay": all_day,
           "start": start if TIME_RE.match(start) else None, "end": stop if TIME_RE.match(stop) else None,
           "location": str(e.get("location") or "")[:200], "notes": str(e.get("notes") or "")[:4000]}
    if isinstance(e.get("color"), str) and COLOR_RE.match(e["color"]):
        out["color"] = e["color"]
    return out


def _event_out(r, users):
    d = json.loads(r["data"])
    d.update({"id": r["id"], "cal": r["cal_id"], "by": users.get(r["created_by"], {}).get("name"),
              "updatedBy": users.get(r["updated_by"], {}).get("name"), "updatedAt": r["updated_at"]})
    return d


def cal_events(req, _):
    u = require_user(req)
    frm = _q(req, "from") or "0000-01-01"
    to = _q(req, "to") or "9999-12-31"
    if not DATE_RE.match(frm) or not DATE_RE.match(to):
        raise ApiError(400, "Ugyldig periode.", "invalid")
    rows = db.all_rows("SELECT e.* FROM cal_events e JOIN cal_members m ON m.cal_id = e.cal_id AND m.user_id = ? AND m.status = 'accepted' "
                       "WHERE e.date <= ? AND e.end_date >= ? ORDER BY e.date LIMIT 5000", (u["id"], to, frm))
    users = _users([r["created_by"] for r in rows] + [r["updated_by"] for r in rows])
    return 200, {"events": [_event_out(r, users) for r in rows]}


def cal_event_create(req, params):
    u = require_user(req)
    _cal_member(params["id"], u["id"], "edit")
    ev = _clean_event(req.json().get("event"))
    if db.one("SELECT COUNT(*) AS n FROM cal_events WHERE cal_id = ?", (params["id"],))["n"] >= 5000:
        raise ApiError(400, "Kalenderen er fuld (5000 aftaler).", "limit")
    eid, t = _uid("e"), db.now()
    db.q("INSERT INTO cal_events(id, cal_id, data, date, end_date, created_by, updated_by, updated_at) VALUES(?,?,?,?,?,?,?,?)",
         (eid, params["id"], json.dumps(ev), ev["date"], ev["endDate"] or ev["date"], u["id"], u["id"], t))
    _cal_notify(params["id"], {"type": "cal-events", "cal": params["id"], "by": u["id"]})
    r = db.one("SELECT * FROM cal_events WHERE id = ?", (eid,))
    return 201, {"event": _event_out(r, _users([u["id"]]))}


def _cal_event_row(cal_id, eid):
    if not ID_RE.match(eid or ""):
        raise ApiError(404, "Aftalen findes ikke.", "not_found")
    r = db.one("SELECT * FROM cal_events WHERE id = ? AND cal_id = ?", (eid, cal_id))
    if not r:
        raise ApiError(404, "Aftalen findes ikke – måske er den slettet af en anden.", "not_found")
    return r


def cal_event_update(req, params):
    u = require_user(req)
    _cal_member(params["id"], u["id"], "edit")
    _cal_event_row(params["id"], params["eid"])
    ev = _clean_event(req.json().get("event"))
    db.q("UPDATE cal_events SET data = ?, date = ?, end_date = ?, updated_by = ?, updated_at = ? WHERE id = ?",
         (json.dumps(ev), ev["date"], ev["endDate"] or ev["date"], u["id"], db.now(), params["eid"]))
    _cal_notify(params["id"], {"type": "cal-events", "cal": params["id"], "by": u["id"]})
    r = db.one("SELECT * FROM cal_events WHERE id = ?", (params["eid"],))
    return 200, {"event": _event_out(r, _users([r["created_by"], u["id"]]))}


def cal_event_delete(req, params):
    u = require_user(req)
    _cal_member(params["id"], u["id"], "edit")
    _cal_event_row(params["id"], params["eid"])
    db.q("DELETE FROM cal_events WHERE id = ?", (params["eid"],))
    _cal_notify(params["id"], {"type": "cal-events", "cal": params["id"], "by": u["id"]})
    return 200, {"ok": True}


# ══ Live updates ══════════════════════════════════════════════════════════
def live_poll(req, _):
    u = require_user(req)
    since = _int(_q(req, "since"), 0, 0)
    if since == 0:
        return 200, {"seq": live.current(), "events": [], "reset": False, "now": _now_ms()}
    from . import calls
    calls.sweep()
    seq, events, reset = live.wait(u["id"], since, timeout=min(25.0, max(1.0, float(_int(_q(req, "wait"), 25, 1, 25)))))
    return 200, {"seq": seq, "events": events, "reset": reset, "now": _now_ms()}


# ══ Fællesskab: profile & age requirement ═════════════════════════════════
def _profile(uid):
    return db.one("SELECT * FROM cm_profiles WHERE user_id = ?", (uid,))


def require_cm(req):
    u = require_user(req)
    p = _profile(u["id"])
    if not p or not p["age_ok_at"]:
        raise ApiError(403, f"Bekræft, at du er mindst {MIN_AGE} år, før du bruger Fællesskab.", "age_required")
    return u


def cm_me(req, _):
    u = require_user(req)
    p = _profile(u["id"])
    ok = bool(p and p["age_ok_at"])
    out = {"ageOk": ok, "minAge": MIN_AGE, "user": _user_card(u), "bio": p["bio"] if p else "", "status": p["status"] if p else "",
           "presence": (p["presence"] if p else None) or "online", "contact": (p["contact"] if p else None) or "everyone",
           "isPlatformOwner": u["role"] == "owner", "emoji": EMOJI}
    if ok:
        out["counts"] = {
            "friendRequests": _pending_requests(u["id"]),
            "snaps": db.one("SELECT COUNT(*) AS n FROM cm_snaps WHERE to_id = ? AND opened_at IS NULL AND expires_at > ?", (u["id"], db.now()))["n"],
        }
    return 200, out


def cm_age(req, _):
    u = require_user(req)
    b = req.json()
    year = _int(b.get("birthYear"), 0)
    this_year = time.gmtime().tm_year
    if not b.get("acceptRules"):
        raise ApiError(400, "Du skal acceptere reglerne for Fællesskab.", "rules", {"field": "acceptRules"})
    if year < 1900 or year > this_year:
        raise ApiError(400, "Skriv dit fødselsår.", "invalid", {"field": "birthYear"})
    if this_year - year < MIN_AGE:
        raise ApiError(403, f"Fællesskab er kun for brugere på {MIN_AGE} år eller derover.", "too_young")
    db.q("INSERT INTO cm_profiles(user_id, age_ok_at) VALUES(?, ?) ON CONFLICT(user_id) DO UPDATE SET age_ok_at = excluded.age_ok_at", (u["id"], db.now()))
    return cm_me(req, None)


def cm_profile_update(req, _):
    u = require_cm(req)
    b = req.json()
    cur = db.one("SELECT * FROM cm_profiles WHERE user_id = ?", (u["id"],))
    pres = b.get("presence", cur["presence"] if cur else "online")
    contact = b.get("contact", cur["contact"] if cur else "everyone")
    if pres not in ("online", "busy", "invisible") or contact not in ("everyone", "fof", "nobody"):
        raise ApiError(400, "Ugyldigt valg.", "invalid")
    db.q("UPDATE cm_profiles SET bio = ?, status = ?, presence = ?, contact = ? WHERE user_id = ?",
         (body_str(b, "bio", 300, default=cur["bio"] if cur else ""), body_str(b, "status", 80, default=cur["status"] if cur else ""), pres, contact, u["id"]))
    _PRESENCE[u["id"]] = pres
    return cm_me(req, None)


# ══ Friends & blocks ══════════════════════════════════════════════════════
# cm_friends stores one row per pair with user_id < friend_id; requested_by says who asked.
def _requests_for(uid):
    return [r["requested_by"] for r in db.all_rows(
        "SELECT requested_by FROM cm_friends WHERE (user_id = ? OR friend_id = ?) AND status = 'pending' AND requested_by != ?", (uid, uid, uid))]


def _pending_requests(uid):
    return len(_requests_for(uid))


def cm_friends(req, _):
    u = require_cm(req)
    uid = u["id"]
    acc = db.all_rows("SELECT user_id, friend_id FROM cm_friends WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'", (uid, uid))
    friends = [r["friend_id"] if r["user_id"] == uid else r["user_id"] for r in acc]
    incoming = _requests_for(uid)
    outgoing = [r["friend_id"] if r["user_id"] == uid else r["user_id"] for r in
                db.all_rows("SELECT user_id, friend_id FROM cm_friends WHERE (user_id = ? OR friend_id = ?) AND status = 'pending' AND requested_by = ?", (uid, uid, uid))]
    blocked = [r["blocked_id"] for r in db.all_rows("SELECT blocked_id FROM cm_blocks WHERE user_id = ?", (uid,))]
    users = _users(friends + incoming + outgoing + blocked)
    pick = lambda ids: [users[i] for i in ids if i in users]
    fr = sorted(pick(friends), key=lambda x: (not x["online"], x["name"].lower()))
    return 200, {"friends": fr, "incoming": pick(incoming), "outgoing": pick(outgoing), "blocked": pick(blocked)}


def cm_friend_add(req, _):
    u = require_cm(req)
    who = _user_by_name(body_str(req.json(), "username", 40, required=True))
    a, b = u["id"], who["id"]
    if a == b:
        raise ApiError(400, "Du kan ikke tilføje dig selv.", "self")
    pref = db.one("SELECT contact FROM cm_profiles WHERE user_id = ?", (b,))
    contact = (pref["contact"] if pref else None) or "everyone"
    already = db.one("SELECT status FROM cm_friends WHERE user_id = ? AND friend_id = ?", (min(a, b), max(a, b)))
    if not already and contact == "nobody":
        raise ApiError(403, "Personen tager ikke imod venneanmodninger.", "no_requests")
    if not already and contact == "fof":
        mine = {r["x"] for r in db.all_rows("SELECT CASE WHEN user_id = ? THEN friend_id ELSE user_id END AS x FROM cm_friends WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'", (a, a, a))}
        theirs = {r["x"] for r in db.all_rows("SELECT CASE WHEN user_id = ? THEN friend_id ELSE user_id END AS x FROM cm_friends WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'", (b, b, b))}
        if not mine & theirs:
            raise ApiError(403, "Personen tager kun imod anmodninger fra venners venner.", "no_requests")
    if _blocked_between(a, b):
        raise ApiError(403, "Du kan ikke sende en venneanmodning til denne bruger.", "blocked")
    if not _profile(b) or not _profile(b)["age_ok_at"]:
        raise ApiError(404, f"{who['display_name']} bruger ikke Fællesskab endnu.", "not_cm")
    lo, hi = min(a, b), max(a, b)
    row = db.one("SELECT status FROM cm_friends WHERE user_id = ? AND friend_id = ?", (lo, hi))
    mine = _requests_for(a)
    if row and row["status"] == "accepted":
        return 200, {"ok": True, "status": "friends"}
    if row and b in mine:   # they already asked me -> accept
        return cm_friend_accept(req, {"uid": str(b)})
    if row:
        return 200, {"ok": True, "status": "pending"}
    if len(_requests_for(b)) >= 200:
        raise ApiError(429, "Brugeren har for mange ubesvarede anmodninger.", "limit")
    db.q("INSERT INTO cm_friends(user_id, friend_id, status, requested_by, created_at) VALUES(?,?,?,?,?)", (lo, hi, "pending", a, db.now()))
    live.publish([b], {"type": "notify", "kind": "friend", "title": "Ny venneanmodning", "text": f"{u['display_name']} vil gerne være venner.", "path": "/apps/community/friends"})
    live.publish([a, b], {"type": "friends"})
    return 201, {"ok": True, "status": "pending"}


def cm_friend_accept(req, params):
    u = require_cm(req)
    a, b = u["id"], _int(params["uid"])
    if b not in _requests_for(a):
        raise ApiError(404, "Anmodningen findes ikke længere.", "not_found")
    db.q("UPDATE cm_friends SET status = 'accepted' WHERE user_id = ? AND friend_id = ?", (min(a, b), max(a, b)))
    live.publish([b], {"type": "notify", "kind": "friend", "title": "I er nu venner", "text": f"{u['display_name']} accepterede din anmodning.", "path": "/apps/community/friends"})
    live.publish([a, b], {"type": "friends"})
    return 200, {"ok": True, "status": "friends"}


def cm_friend_remove(req, params):
    """Remove a friend, decline a request or cancel one you sent."""
    u = require_cm(req)
    a, b = u["id"], _int(params["uid"])
    db.q("DELETE FROM cm_friends WHERE user_id = ? AND friend_id = ?", (min(a, b), max(a, b)))
    live.publish([a, b], {"type": "friends"})
    return 200, {"ok": True}


def cm_block(req, params):
    u = require_cm(req)
    a, b = u["id"], _int(params["uid"])
    if a == b or not db.one("SELECT 1 FROM users WHERE id = ?", (b,)):
        raise ApiError(400, "Ugyldig bruger.", "invalid")
    db.q("INSERT OR IGNORE INTO cm_blocks(user_id, blocked_id, at) VALUES(?,?,?)", (a, b, db.now()))
    db.q("DELETE FROM cm_friends WHERE user_id = ? AND friend_id = ?", (min(a, b), max(a, b)))
    db.q("DELETE FROM cm_snaps WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)", (a, b, b, a))
    live.publish([a, b], {"type": "friends"})
    return 200, {"ok": True}


def cm_unblock(req, params):
    u = require_cm(req)
    db.q("DELETE FROM cm_blocks WHERE user_id = ? AND blocked_id = ?", (u["id"], _int(params["uid"])))
    live.publish([u["id"]], {"type": "friends"})
    return 200, {"ok": True}


def cm_user_search(req, _):
    u = require_cm(req)
    q = _q(req, "q").strip().lstrip("@")[:40]
    if len(q) < 2:
        return 200, {"users": []}
    rows = db.all_rows("SELECT u.id, u.username, u.display_name, u.avatar FROM users u JOIN cm_profiles p ON p.user_id = u.id AND p.age_ok_at IS NOT NULL "
                       "WHERE (u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\') AND u.id != ? "
                       "AND u.id NOT IN (SELECT blocked_id FROM cm_blocks WHERE user_id = ?) AND u.id NOT IN (SELECT user_id FROM cm_blocks WHERE blocked_id = ?) "
                       "ORDER BY u.username LIMIT 10",
                       (q.replace("%", "\\%").replace("_", "\\_") + "%", "%" + q.replace("%", "\\%").replace("_", "\\_") + "%", u["id"], u["id"], u["id"]))
    return 200, {"users": [_user_card(r) for r in rows]}


# ══ Servers, channels, members ════════════════════════════════════════════
def _server(sid):
    if not ID_RE.match(sid or ""):
        raise ApiError(404, "Serveren findes ikke.", "not_found")
    s = db.one("SELECT * FROM cm_servers WHERE id = ?", (sid,))
    if not s:
        raise ApiError(404, "Serveren findes ikke.", "not_found")
    return s


def _member(sid, uid):
    return db.one("SELECT * FROM cm_members WHERE server_id = ? AND user_id = ?", (sid, uid))


def _need(sid, uid, role="member"):
    m = _member(sid, uid)
    if not m:
        raise ApiError(403, "Du er ikke medlem af serveren.", "not_member")
    if RANK.get(m["role"], 0) < RANK[role]:
        raise ApiError(403, f"Det kræver rollen {ROLE_DA[role]} eller højere.", "forbidden")
    return m


def _server_member_ids(sid):
    return [r["user_id"] for r in db.all_rows("SELECT user_id FROM cm_members WHERE server_id = ?", (sid,))]


def _server_card(s, uid=None):
    n = db.one("SELECT COUNT(*) AS n FROM cm_members WHERE server_id = ?", (s["id"],))["n"]
    out = {"id": s["id"], "name": s["name"], "icon": s["icon"], "color": s["color"], "description": s["description"],
           "discoverable": bool(s["discoverable"]), "members": n, "ownerId": s["owner_id"]}
    if uid:
        unread = db.one("SELECT COUNT(*) AS n FROM cm_messages msg JOIN cm_channels c ON c.id = msg.channel_id AND c.server_id = ? "
                        "LEFT JOIN cm_reads r ON r.channel_id = msg.channel_id AND r.user_id = ? "
                        "WHERE msg.id > COALESCE(r.last_id, 0) AND msg.deleted = 0 AND msg.user_id != ?", (s["id"], uid, uid))["n"]
        out["unread"] = unread
    return out


def _channel_card(c, uid=None):
    out = {"id": c["id"], "serverId": c["server_id"], "name": c["name"], "kind": c["kind"], "topic": c["topic"],
           "position": c["position"], "postRole": c["post_role"], "slow": c["slow_seconds"]}
    if uid:
        out["unread"] = db.one("SELECT COUNT(*) AS n FROM cm_messages WHERE channel_id = ? AND deleted = 0 AND user_id != ? AND id > COALESCE((SELECT last_id FROM cm_reads WHERE user_id = ? AND channel_id = ?), 0)",
                               (c["id"], uid, uid, c["id"]))["n"]
    return out


def _clean_channel_name(name):
    n = re.sub(r"[^a-z0-9æøå_-]+", "-", (name or "").strip().lower()).strip("-")[:40]
    if not n:
        raise ApiError(400, "Kanalen skal have et navn.", "missing", {"field": "name"})
    return n


def _add_channel(sid, name, kind="text", topic="", post_role="member", position=None):
    if position is None:
        position = (db.one("SELECT MAX(position) AS p FROM cm_channels WHERE server_id = ?", (sid,))["p"] or 0) + 1
    cid = _uid("c")
    db.q("INSERT INTO cm_channels(id, server_id, name, kind, topic, position, post_role, slow_seconds, created_at) VALUES(?,?,?,?,?,?,?,?,?)",
         (cid, sid, name, kind, topic, position, post_role, 0, db.now()))
    return cid


def cm_servers(req, _):
    u = require_cm(req)
    rows = db.all_rows("SELECT s.* FROM cm_servers s JOIN cm_members m ON m.server_id = s.id AND m.user_id = ? ORDER BY m.joined_at", (u["id"],))
    return 200, {"servers": [_server_card(r, u["id"]) for r in rows]}


def cm_server_create(req, _):
    u = require_cm(req)
    b = req.json()
    name = body_str(b, "name", 50, required=True)
    icon = body_str(b, "icon", 8)
    color = body_str(b, "color", 7) or "#5865f2"
    if not COLOR_RE.match(color):
        color = "#5865f2"
    if db.one("SELECT COUNT(*) AS n FROM cm_servers WHERE owner_id = ?", (u["id"],))["n"] >= 20:
        raise ApiError(400, "Du kan højst eje 20 servere.", "limit")
    sid, t = _uid("s"), db.now()
    db.q("INSERT INTO cm_servers(id, name, icon, color, description, rules, owner_id, discoverable, word_filter, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
         (sid, name, icon, color, body_str(b, "description", 300), DEFAULT_RULES, u["id"], 0, "", t))
    db.q("INSERT INTO cm_members(server_id, user_id, role, joined_at, rules_accepted_at) VALUES(?,?,?,?,?)", (sid, u["id"], "owner", t, t))
    _add_channel(sid, "velkommen", "text", "Nyheder og regler fra serverens ledere.", "admin", 0)
    _add_channel(sid, "generelt", "text", "Snak om alt muligt.", "member", 1)
    _add_channel(sid, "musik", "music", "Lyt til musik sammen.", "member", 2)
    _add_channel(sid, "snak", "voice", "Talekanal – tryk for at deltage.", "member", 3)
    return 201, {"server": _server_card(_server(sid), u["id"])}


def cm_server_get(req, params):
    u = require_cm(req)
    s = _server(params["sid"])
    m = _need(s["id"], u["id"])
    chans = db.all_rows("SELECT * FROM cm_channels WHERE server_id = ? ORDER BY position, created_at", (s["id"],))
    mem = db.all_rows("SELECT user_id, role, muted_until FROM cm_members WHERE server_id = ?", (s["id"],))
    users = _users([x["user_id"] for x in mem])
    members = [{**users[x["user_id"]], "role": x["role"], "muted": x["muted_until"] > db.now()} for x in mem if x["user_id"] in users]
    members.sort(key=lambda x: (-RANK.get(x["role"], 0), not x["online"], x["name"].lower()))
    from . import calls   # (calls imports this module)
    voice = calls.voice_state(s["id"])
    return 200, {"server": {**_server_card(s, u["id"]), "rules": s["rules"], "wordFilter": s["word_filter"] if RANK[m["role"]] >= 3 else None}, "voice": voice,
                 "channels": [_channel_card(c, u["id"]) for c in chans], "members": members,
                 "me": {"role": m["role"], "rulesAccepted": bool(m["rules_accepted_at"]), "mutedUntil": m["muted_until"]}}


def cm_server_update(req, params):
    u = require_cm(req)
    s = _server(params["sid"])
    _need(s["id"], u["id"], "admin")
    b = req.json()
    fields = {}
    if "name" in b:
        fields["name"] = body_str(b, "name", 50, required=True)
    if "icon" in b:
        fields["icon"] = body_str(b, "icon", 8)
    if "color" in b:
        c = body_str(b, "color", 7)
        if not COLOR_RE.match(c):
            raise ApiError(400, "Ugyldig farve.", "invalid")
        fields["color"] = c
    if "description" in b:
        fields["description"] = body_str(b, "description", 300)
    if "rules" in b:
        fields["rules"] = body_str(b, "rules", 4000, required=True)
    if "wordFilter" in b:
        words = [w.strip().lower() for w in body_str(b, "wordFilter", 2000).split(",") if w.strip()]
        fields["word_filter"] = ", ".join(dict.fromkeys(words))[:2000]
    if "discoverable" in b:
        fields["discoverable"] = 1 if b.get("discoverable") else 0
    for k, v in fields.items():
        db.q(f"UPDATE cm_servers SET {k} = ? WHERE id = ?", (v, s["id"]))
    if "rules" in fields and fields["rules"] != s["rules"]:   # new rules must be accepted again
        db.q("UPDATE cm_members SET rules_accepted_at = NULL WHERE server_id = ? AND role NOT IN ('owner')", (s["id"],))
    live.publish(_server_member_ids(s["id"]), {"type": "server", "server": s["id"]})
    return cm_server_get(req, params)


def cm_server_delete(req, params):
    u = require_cm(req)
    s = _server(params["sid"])
    _need(s["id"], u["id"], "owner")
    members = _server_member_ids(s["id"])
    chans = [r["id"] for r in db.all_rows("SELECT id FROM cm_channels WHERE server_id = ?", (s["id"],))]
    for c in chans:
        db.q("DELETE FROM cm_messages WHERE channel_id = ?", (c,))
        db.q("DELETE FROM cm_music WHERE channel_id = ?", (c,))
        db.q("DELETE FROM cm_reads WHERE channel_id = ?", (c,))
    db.q("DELETE FROM cm_servers WHERE id = ?", (s["id"],))
    live.publish(members, {"type": "server-gone", "server": s["id"]})
    return 200, {"ok": True}


def cm_server_leave(req, params):
    u = require_cm(req)
    s = _server(params["sid"])
    m = _need(s["id"], u["id"])
    if m["role"] == "owner":
        raise ApiError(400, "Ejeren kan ikke forlade serveren – slet den, eller giv ejerskabet videre først.", "owner")
    db.q("DELETE FROM cm_members WHERE server_id = ? AND user_id = ?", (s["id"], u["id"]))
    live.publish(_server_member_ids(s["id"]) + [u["id"]], {"type": "server", "server": s["id"]})
    return 200, {"ok": True}


def cm_rules_accept(req, params):
    u = require_cm(req)
    s = _server(params["sid"])
    _need(s["id"], u["id"])
    db.q("UPDATE cm_members SET rules_accepted_at = ? WHERE server_id = ? AND user_id = ?", (db.now(), s["id"], u["id"]))
    return 200, {"ok": True}


def _join(s, uid):
    if db.one("SELECT 1 FROM cm_bans WHERE server_id = ? AND user_id = ?", (s["id"], uid)):
        raise ApiError(403, "Du er udelukket fra denne server.", "banned")
    if _member(s["id"], uid):
        return False
    if db.one("SELECT COUNT(*) AS n FROM cm_members WHERE user_id = ?", (uid,))["n"] >= 100:
        raise ApiError(400, "Du kan højst være med i 100 servere.", "limit")
    db.q("INSERT INTO cm_members(server_id, user_id, role, joined_at) VALUES(?,?,?,?)", (s["id"], uid, "member", db.now()))
    live.publish(_server_member_ids(s["id"]), {"type": "server", "server": s["id"]})
    return True


def cm_discover(req, _):
    u = require_cm(req)
    q = _q(req, "q").strip()[:40]
    rows = db.all_rows("SELECT * FROM cm_servers WHERE discoverable = 1 AND (? = '' OR name LIKE ?) ORDER BY created_at DESC LIMIT 50", (q, f"%{q}%"))
    mine = {r["server_id"] for r in db.all_rows("SELECT server_id FROM cm_members WHERE user_id = ?", (u["id"],))}
    return 200, {"servers": [{**_server_card(r), "joined": r["id"] in mine} for r in rows]}


def cm_server_join(req, params):
    u = require_cm(req)
    s = _server(params["sid"])
    if not s["discoverable"]:
        raise ApiError(403, "Serveren er privat – du skal have en invitation.", "private")
    _join(s, u["id"])
    return 200, {"server": _server_card(s, u["id"])}


def cm_invite_create(req, params):
    u = require_cm(req)
    s = _server(params["sid"])
    _need(s["id"], u["id"], "moderator")
    b = req.json()
    hours = _int(b.get("hours"), 168, 0, 24 * 90)
    max_uses = _int(b.get("maxUses"), 0, 0, 1000)
    code = secrets.token_urlsafe(6).replace("-", "x").replace("_", "y")
    db.q("INSERT INTO cm_invites(code, server_id, created_by, uses, max_uses, expires_at, created_at) VALUES(?,?,?,?,?,?,?)",
         (code, s["id"], u["id"], 0, max_uses, db.now() + hours * 3600 if hours else 0, db.now()))
    return 201, {"code": code, "expiresAt": db.now() + hours * 3600 if hours else 0, "maxUses": max_uses}


def _invite(code):
    if not ID_RE.match(code or ""):
        raise ApiError(404, "Invitationen findes ikke.", "not_found")
    inv = db.one("SELECT * FROM cm_invites WHERE code = ?", (code,))
    if not inv or (inv["expires_at"] and inv["expires_at"] < db.now()) or (inv["max_uses"] and inv["uses"] >= inv["max_uses"]):
        raise ApiError(404, "Invitationen er udløbet eller findes ikke.", "expired")
    return inv


def cm_invite_get(req, params):
    u = require_cm(req)
    inv = _invite(params["code"])
    s = _server(inv["server_id"])
    return 200, {"server": _server_card(s), "joined": bool(_member(s["id"], u["id"]))}


def cm_invite_join(req, params):
    u = require_cm(req)
    inv = _invite(params["code"])
    s = _server(inv["server_id"])
    if _join(s, u["id"]):
        db.q("UPDATE cm_invites SET uses = uses + 1 WHERE code = ?", (inv["code"],))
    return 200, {"server": _server_card(s, u["id"])}


def cm_channel_create(req, params):
    u = require_cm(req)
    s = _server(params["sid"])
    _need(s["id"], u["id"], "admin")
    b = req.json()
    if db.one("SELECT COUNT(*) AS n FROM cm_channels WHERE server_id = ?", (s["id"],))["n"] >= 50:
        raise ApiError(400, "En server kan højst have 50 kanaler.", "limit")
    kind = b.get("kind") if b.get("kind") in ("text", "music", "voice") else "text"
    cid = _add_channel(s["id"], _clean_channel_name(b.get("name")), kind, body_str(b, "topic", 200))
    live.publish(_server_member_ids(s["id"]), {"type": "server", "server": s["id"]})
    return 201, {"channel": _channel_card(db.one("SELECT * FROM cm_channels WHERE id = ?", (cid,)))}


def _channel(cid):
    if not ID_RE.match(cid or "") or cid.startswith("dm-"):
        raise ApiError(404, "Kanalen findes ikke.", "not_found")
    c = db.one("SELECT * FROM cm_channels WHERE id = ?", (cid,))
    if not c:
        raise ApiError(404, "Kanalen findes ikke.", "not_found")
    return c


def cm_channel_update(req, params):
    u = require_cm(req)
    c = _channel(params["cid"])
    _need(c["server_id"], u["id"], "admin")
    b = req.json()
    if "name" in b:
        db.q("UPDATE cm_channels SET name = ? WHERE id = ?", (_clean_channel_name(b.get("name")), c["id"]))
    if "topic" in b:
        db.q("UPDATE cm_channels SET topic = ? WHERE id = ?", (body_str(b, "topic", 200), c["id"]))
    if "slow" in b:
        db.q("UPDATE cm_channels SET slow_seconds = ? WHERE id = ?", (_int(b.get("slow"), 0, 0, 3600), c["id"]))
    if b.get("postRole") in RANK:
        db.q("UPDATE cm_channels SET post_role = ? WHERE id = ?", (b["postRole"], c["id"]))
    if "position" in b:
        db.q("UPDATE cm_channels SET position = ? WHERE id = ?", (_int(b.get("position"), 0, 0, 999), c["id"]))
    live.publish(_server_member_ids(c["server_id"]), {"type": "server", "server": c["server_id"]})
    return 200, {"channel": _channel_card(_channel(c["id"]))}


def cm_channel_delete(req, params):
    u = require_cm(req)
    c = _channel(params["cid"])
    _need(c["server_id"], u["id"], "admin")
    if db.one("SELECT COUNT(*) AS n FROM cm_channels WHERE server_id = ?", (c["server_id"],))["n"] <= 1:
        raise ApiError(400, "En server skal have mindst én kanal.", "last")
    db.q("DELETE FROM cm_messages WHERE channel_id = ?", (c["id"],))
    db.q("DELETE FROM cm_music WHERE channel_id = ?", (c["id"],))
    db.q("DELETE FROM cm_reads WHERE channel_id = ?", (c["id"],))
    db.q("DELETE FROM cm_channels WHERE id = ?", (c["id"],))
    live.publish(_server_member_ids(c["server_id"]), {"type": "server", "server": c["server_id"]})
    return 200, {"ok": True}


# ── moderation of members ────────────────────────────────────────────────
def _target(sid, actor, uid, need="moderator"):
    me = _need(sid, actor["id"], need)
    t = _member(sid, uid)
    if not t:
        raise ApiError(404, "Brugeren er ikke medlem.", "not_member")
    if uid == actor["id"] or RANK[t["role"]] >= RANK[me["role"]]:
        raise ApiError(403, "Du kan kun styre medlemmer med en lavere rolle end din egen.", "forbidden")
    return me, t


def cm_member_role(req, params):
    u = require_cm(req)
    s = _server(params["sid"])
    uid = _int(params["uid"])
    role = req.json().get("role")
    me = _need(s["id"], u["id"], "admin")
    if role == "owner":
        if me["role"] != "owner":
            raise ApiError(403, "Kun ejeren kan give ejerskabet videre.", "forbidden")
        if not _member(s["id"], uid):
            raise ApiError(404, "Brugeren er ikke medlem.", "not_member")
        db.q("UPDATE cm_members SET role = 'admin' WHERE server_id = ? AND user_id = ?", (s["id"], u["id"]))
        db.q("UPDATE cm_members SET role = 'owner' WHERE server_id = ? AND user_id = ?", (s["id"], uid))
        db.q("UPDATE cm_servers SET owner_id = ? WHERE id = ?", (uid, s["id"]))
    else:
        if role not in ("admin", "moderator", "member"):
            raise ApiError(400, "Ukendt rolle.", "invalid")
        _target(s["id"], u, uid, "admin")
        if RANK[role] >= RANK[me["role"]]:
            raise ApiError(403, "Du kan ikke give en rolle, der er lige så høj som din egen.", "forbidden")
        db.q("UPDATE cm_members SET role = ? WHERE server_id = ? AND user_id = ?", (role, s["id"], uid))
    live.publish(_server_member_ids(s["id"]), {"type": "server", "server": s["id"]})
    return 200, {"ok": True}


def cm_member_mute(req, params):
    u = require_cm(req)
    s = _server(params["sid"])
    uid = _int(params["uid"])
    _target(s["id"], u, uid)
    minutes = _int(req.json().get("minutes"), 10, 0, 60 * 24 * 28)
    until = db.now() + minutes * 60 if minutes else 0
    db.q("UPDATE cm_members SET muted_until = ? WHERE server_id = ? AND user_id = ?", (until, s["id"], uid))
    _modlog(s["id"], u, "mute" if minutes else "unmute", uid, f"{minutes} min" if minutes else "")
    live.publish(_server_member_ids(s["id"]), {"type": "server", "server": s["id"]})
    return 200, {"ok": True, "mutedUntil": until}


def cm_member_kick(req, params):
    u = require_cm(req)
    s = _server(params["sid"])
    uid = _int(params["uid"])
    _target(s["id"], u, uid)
    members = _server_member_ids(s["id"])
    db.q("DELETE FROM cm_members WHERE server_id = ? AND user_id = ?", (s["id"], uid))
    _modlog(s["id"], u, "kick", uid, "")
    live.publish(members, {"type": "server", "server": s["id"]})
    live.publish([uid], {"type": "server-gone", "server": s["id"], "reason": "kick"})
    return 200, {"ok": True}


def cm_member_ban(req, params):
    u = require_cm(req)
    s = _server(params["sid"])
    uid = _int(params["uid"])
    if _member(s["id"], uid):
        _target(s["id"], u, uid)
    else:
        _need(s["id"], u["id"], "moderator")
    reason = body_str(req.json(), "reason", 300)
    members = _server_member_ids(s["id"])
    db.q("DELETE FROM cm_members WHERE server_id = ? AND user_id = ?", (s["id"], uid))
    db.q("INSERT OR REPLACE INTO cm_bans(server_id, user_id, by_id, reason, at) VALUES(?,?,?,?,?)", (s["id"], uid, u["id"], reason, db.now()))
    if _int(req.json().get("deleteHours"), 0) > 0:   # also remove their recent messages
        since = db.now() - _int(req.json().get("deleteHours"), 0, 0, 168) * 3600
        db.q("UPDATE cm_messages SET deleted = 1 WHERE user_id = ? AND created_at >= ? AND channel_id IN (SELECT id FROM cm_channels WHERE server_id = ?)", (uid, since, s["id"]))
    _modlog(s["id"], u, "ban", uid, reason)
    live.publish(members, {"type": "server", "server": s["id"]})
    live.publish([uid], {"type": "server-gone", "server": s["id"], "reason": "ban"})
    return 200, {"ok": True}


def cm_bans(req, params):
    u = require_cm(req)
    s = _server(params["sid"])
    _need(s["id"], u["id"], "moderator")
    rows = db.all_rows("SELECT * FROM cm_bans WHERE server_id = ? ORDER BY at DESC", (s["id"],))
    users = _users([r["user_id"] for r in rows] + [r["by_id"] for r in rows])
    return 200, {"bans": [{"user": users.get(r["user_id"]), "by": users.get(r["by_id"], {}).get("name"), "reason": r["reason"], "at": r["at"]} for r in rows]}


def cm_unban(req, params):
    u = require_cm(req)
    s = _server(params["sid"])
    _need(s["id"], u["id"], "moderator")
    db.q("DELETE FROM cm_bans WHERE server_id = ? AND user_id = ?", (s["id"], _int(params["uid"])))
    _modlog(s["id"], u, "unban", _int(params["uid"]), "")
    return 200, {"ok": True}


def _modlog(sid, actor, action, target, detail):
    log = db.get_server_setting(f"cmlog_{sid}", [])
    log.insert(0, {"at": db.now(), "by": actor["id"], "action": action, "target": target, "detail": detail[:200]})
    db.set_server_setting(f"cmlog_{sid}", log[:200])


def cm_modlog(req, params):
    u = require_cm(req)
    s = _server(params["sid"])
    _need(s["id"], u["id"], "moderator")
    log = db.get_server_setting(f"cmlog_{s['id']}", [])
    users = _users([x["by"] for x in log] + [x["target"] for x in log])
    return 200, {"log": [{**x, "by": users.get(x["by"], {}).get("name", "?"), "target": users.get(x["target"], {}).get("name", "?")} for x in log]}


# ══ Messages (server channels and DMs) ════════════════════════════════════
def _dm_id(a, b):
    return f"dm-{min(a, b)}-{max(a, b)}"


def _channel_access(cid, uid, write=False):
    """Returns (audience user ids, channel row or None, member row or None)."""
    m = DM_RE.match(cid or "")
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        if uid not in (a, b) or a >= b:
            raise ApiError(404, "Samtalen findes ikke.", "not_found")
        other = b if uid == a else a
        if write:
            if _blocked_between(a, b):
                raise ApiError(403, "Du kan ikke skrive til denne bruger.", "blocked")
            if not _are_friends(a, b):
                raise ApiError(403, "I skal være venner for at skrive privat.", "not_friends")
        return [a, b], None, None, other
    c = _channel(cid)
    mem = _need(c["server_id"], uid)
    if write:
        if not mem["rules_accepted_at"]:
            raise ApiError(403, "Accepter serverens regler, før du skriver.", "rules")
        if mem["muted_until"] > db.now():
            raise ApiError(403, "Du er gjort tavs indtil " + time.strftime("%H:%M", time.localtime(mem["muted_until"])) + ".", "muted", {"until": mem["muted_until"]})
        if RANK[mem["role"]] < RANK.get(c["post_role"], 1):
            raise ApiError(403, "Kun " + ROLE_DA[c["post_role"]] + "e og højere kan skrive her.", "read_only")
    return _server_member_ids(c["server_id"]), c, mem, None


def _mask(body, words):
    if not words:
        return body
    for w in [x.strip() for x in words.split(",") if x.strip()]:
        body = re.sub(r"(?i)(?<!\w)" + re.escape(w) + r"(?!\w)", lambda mm: "•" * len(mm.group(0)), body)
    return body


def _clean_attach(a):
    """A shared note, calendar event, task or code snippet from the user's own apps."""
    if not a:
        return None
    if not isinstance(a, dict) or a.get("kind") not in ("note", "event", "task", "snippet", "calendar"):
        raise ApiError(400, "Ugyldigt vedhæftet indhold.", "invalid")
    out = {"kind": a["kind"]}
    for k, n in (("title", 160), ("body", 3000), ("date", 10), ("endDate", 10), ("start", 5), ("end", 5), ("location", 200),
                 ("lang", 30), ("code", 6000), ("due", 10), ("calId", 40), ("calName", 60)):
        v = a.get(k)
        if isinstance(v, str) and v:
            out[k] = v[:n]
    if isinstance(a.get("allDay"), bool):
        out["allDay"] = a["allDay"]
    return out


def _messages_out(rows, uid):
    if not rows:
        return []
    ids = [r["id"] for r in rows]
    reply_ids = [r["reply_to"] for r in rows if r["reply_to"]]
    replies = {r["id"]: r for r in db.all_rows(f"SELECT id, user_id, body, deleted FROM cm_messages WHERE id IN ({','.join('?' * len(reply_ids))})", reply_ids)} if reply_ids else {}
    users = _users([r["user_id"] for r in rows] + [r["user_id"] for r in replies.values()])
    reacts = {}
    for x in db.all_rows(f"SELECT message_id, user_id, emoji FROM cm_reactions WHERE message_id IN ({','.join('?' * len(ids))})", ids):
        e = reacts.setdefault(x["message_id"], {}).setdefault(x["emoji"], {"emoji": x["emoji"], "count": 0, "me": False})
        e["count"] += 1
        e["me"] = e["me"] or x["user_id"] == uid
    files = {}
    fids = [r["file_id"] for r in rows if r["file_id"]]
    if fids:
        for f in db.all_rows(f"SELECT id, kind, mime, name, size FROM cm_files WHERE id IN ({','.join('?' * len(fids))})", fids):
            files[f["id"]] = {"id": f["id"], "kind": f["kind"], "mime": f["mime"], "name": f["name"], "size": f["size"], "url": f"/api/cm/files/{f['id']}"}
    out = []
    for r in rows:
        rep = replies.get(r["reply_to"])
        out.append({
            "id": r["id"], "channel": r["channel_id"], "user": users.get(r["user_id"], {"id": r["user_id"], "name": "Slettet bruger", "username": "", "avatar": "👤"}),
            "body": "" if r["deleted"] else r["body"], "deleted": bool(r["deleted"]),
            "file": None if r["deleted"] else files.get(r["file_id"]),
            "attach": None if r["deleted"] or not r["attach"] else json.loads(r["attach"]),
            "reply": {"id": rep["id"], "user": users.get(rep["user_id"], {}).get("name", "?"), "body": "Beskeden er slettet" if rep["deleted"] else rep["body"][:140]} if rep else None,
            "at": r["created_at"], "edited": r["edited_at"],
            "reactions": list(reacts.get(r["id"], {}).values()),
        })
    return out


def cm_messages(req, params):
    u = require_cm(req)
    cid = params["cid"]
    _channel_access(cid, u["id"])
    before = _int(_q(req, "before"), 0, 0)
    limit = _int(_q(req, "limit"), 50, 1, 100)
    blocked = [r["blocked_id"] for r in db.all_rows("SELECT blocked_id FROM cm_blocks WHERE user_id = ?", (u["id"],))]
    sql = "SELECT * FROM cm_messages WHERE channel_id = ?" + (" AND id < ?" if before else "")
    args = [cid] + ([before] if before else [])
    q = (_q(req, "q") or "").strip()[:80]
    if q:                                    # search in this conversation
        like = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        sql += " AND deleted = 0 AND body LIKE ? ESCAPE '\\'"
        args.append(like)
    if blocked:
        sql += f" AND user_id NOT IN ({','.join('?' * len(blocked))})"
        args += blocked
    rows = db.all_rows(sql + " ORDER BY id DESC LIMIT ?", args + [limit])
    rows = list(reversed(rows))
    return 200, {"messages": _messages_out(rows, u["id"]), "more": len(rows) == limit}


def cm_message_send(req, params):
    u = require_cm(req)
    cid = params["cid"]
    audience, c, mem, other = _channel_access(cid, u["id"], write=True)
    b = req.json()
    body = b.get("body") or ""
    if not isinstance(body, str):
        raise ApiError(400, "Ugyldig besked.", "invalid")
    body = body.strip()
    if len(body) > MAX_MSG:
        raise ApiError(400, f"Beskeden er for lang (højst {MAX_MSG} tegn).", "too_long")
    attach = _clean_attach(b.get("attach"))
    fid = b.get("fileId") or None
    if fid:
        f = db.one("SELECT id, kind FROM cm_files WHERE id = ? AND user_id = ?", (str(fid)[:40], u["id"]))
        if not f or f["kind"] not in ("image", "audio"):
            raise ApiError(400, "Filen findes ikke.", "invalid")
    if not body and not attach and not fid:
        raise ApiError(400, "Skriv en besked.", "empty")
    if c:
        if c["kind"] == "music" and fid:
            pass
        s = _server(c["server_id"])
        body = _mask(body, s["word_filter"])
        if c["slow_seconds"] and RANK[mem["role"]] < RANK["moderator"]:
            last = db.one("SELECT MAX(created_at) AS t FROM cm_messages WHERE channel_id = ? AND user_id = ?", (cid, u["id"]))["t"] or 0
            wait = last + c["slow_seconds"] - db.now()
            if wait > 0:
                raise ApiError(429, f"Langsom tilstand: vent {wait} sekunder.", "slowmode", {"wait": wait})
    _flood_check(u["id"])
    reply = _int(b.get("replyTo"), 0) or None
    if reply and not db.one("SELECT 1 FROM cm_messages WHERE id = ? AND channel_id = ?", (reply, cid)):
        reply = None
    cur = db.q("INSERT INTO cm_messages(channel_id, user_id, body, file_id, attach, reply_to, created_at) VALUES(?,?,?,?,?,?,?)",
               (cid, u["id"], body, fid, json.dumps(attach) if attach else None, reply, db.now()))
    db.q("INSERT INTO cm_reads(user_id, channel_id, last_id) VALUES(?,?,?) ON CONFLICT(user_id, channel_id) DO UPDATE SET last_id = excluded.last_id",
         (u["id"], cid, cur.lastrowid))
    msg = _messages_out([db.one("SELECT * FROM cm_messages WHERE id = ?", (cur.lastrowid,))], u["id"])[0]
    blockers = {r["user_id"] for r in db.all_rows("SELECT user_id FROM cm_blocks WHERE blocked_id = ?", (u["id"],))}
    live.publish([x for x in audience if x not in blockers], {"type": "msg", "channel": cid, "server": c["server_id"] if c else None, "message": msg,
                                                              "mentions": _mentions(body, audience)})
    return 201, {"message": msg}


def _mentions(body, audience):
    names = {n.lower() for n in re.findall(r"@([A-Za-z0-9._-]{3,32})", body or "")}
    if not names:
        return []
    ids = [i for i in audience]
    users = _users(ids)
    return [uid for uid, card in users.items() if card["username"].lower() in names]


def _msg_row(mid):
    r = db.one("SELECT * FROM cm_messages WHERE id = ?", (_int(mid),))
    if not r or r["deleted"]:
        raise ApiError(404, "Beskeden findes ikke.", "not_found")
    return r


def cm_message_edit(req, params):
    u = require_cm(req)
    r = _msg_row(params["mid"])
    if r["user_id"] != u["id"]:
        raise ApiError(403, "Du kan kun rette dine egne beskeder.", "forbidden")
    audience, c, _, _ = _channel_access(r["channel_id"], u["id"])
    body = body_str(req.json(), "body", MAX_MSG, required=not r["file_id"] and not r["attach"])
    if c:
        body = _mask(body, _server(c["server_id"])["word_filter"])
    db.q("UPDATE cm_messages SET body = ?, edited_at = ? WHERE id = ?", (body, db.now(), r["id"]))
    msg = _messages_out([db.one("SELECT * FROM cm_messages WHERE id = ?", (r["id"],))], u["id"])[0]
    live.publish(audience, {"type": "msg-edit", "channel": r["channel_id"], "message": msg})
    return 200, {"message": msg}


def cm_message_delete(req, params):
    u = require_cm(req)
    r = _msg_row(params["mid"])
    audience, c, mem, _ = _channel_access(r["channel_id"], u["id"])
    if r["user_id"] != u["id"]:
        if not c or RANK[mem["role"]] < RANK["moderator"]:
            raise ApiError(403, "Du kan kun slette dine egne beskeder.", "forbidden")
        _modlog(c["server_id"], u, "delete", r["user_id"], r["body"][:120])
    db.q("UPDATE cm_messages SET deleted = 1, body = '' WHERE id = ?", (r["id"],))
    db.q("DELETE FROM cm_reactions WHERE message_id = ?", (r["id"],))
    live.publish(audience, {"type": "msg-delete", "channel": r["channel_id"], "id": r["id"]})
    return 200, {"ok": True}


def cm_message_react(req, params):
    u = require_cm(req)
    r = _msg_row(params["mid"])
    audience, c, mem, _ = _channel_access(r["channel_id"], u["id"], write=False)
    if c and not mem["rules_accepted_at"]:
        raise ApiError(403, "Accepter serverens regler først.", "rules")
    emoji = req.json().get("emoji")
    if emoji not in EMOJI:
        raise ApiError(400, "Den reaktion findes ikke.", "invalid")
    if db.one("SELECT 1 FROM cm_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?", (r["id"], u["id"], emoji)):
        db.q("DELETE FROM cm_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?", (r["id"], u["id"], emoji))
    else:
        db.q("INSERT INTO cm_reactions(message_id, user_id, emoji) VALUES(?,?,?)", (r["id"], u["id"], emoji))
    msg = _messages_out([db.one("SELECT * FROM cm_messages WHERE id = ?", (r["id"],))], u["id"])[0]
    live.publish(audience, {"type": "msg-react", "channel": r["channel_id"], "id": r["id"], "reactions": msg["reactions"], "by": u["id"]})
    return 200, {"message": msg}


def cm_typing(req, params):
    u = require_cm(req)
    audience, _, _, _ = _channel_access(params["cid"], u["id"])
    live.publish([x for x in audience if x != u["id"]], {"type": "typing", "channel": params["cid"], "user": {"id": u["id"], "name": u["display_name"]}})
    return 200, {"ok": True}


def cm_read(req, params):
    u = require_cm(req)
    _channel_access(params["cid"], u["id"])
    last = _int(req.json().get("lastId"), 0, 0)
    db.q("INSERT INTO cm_reads(user_id, channel_id, last_id) VALUES(?,?,?) ON CONFLICT(user_id, channel_id) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)",
         (u["id"], params["cid"], last))
    return 200, {"ok": True}


def cm_dms(req, _):
    """Your private conversations: every friend, newest conversation first."""
    u = require_cm(req)
    uid = u["id"]
    friends = [r["friend_id"] if r["user_id"] == uid else r["user_id"] for r in
               db.all_rows("SELECT user_id, friend_id FROM cm_friends WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'", (uid, uid))]
    users = _users(friends)
    out = []
    for f in friends:
        cid = _dm_id(uid, f)
        last = db.one("SELECT * FROM cm_messages WHERE channel_id = ? AND deleted = 0 ORDER BY id DESC LIMIT 1", (cid,))
        unread = db.one("SELECT COUNT(*) AS n FROM cm_messages WHERE channel_id = ? AND deleted = 0 AND user_id != ? AND id > COALESCE((SELECT last_id FROM cm_reads WHERE user_id = ? AND channel_id = ?), 0)",
                        (cid, uid, uid, cid))["n"]
        snaps = db.one("SELECT COUNT(*) AS n FROM cm_snaps WHERE from_id = ? AND to_id = ? AND opened_at IS NULL AND expires_at > ?", (f, uid, db.now()))["n"]
        if f in users:
            out.append({"channel": cid, "user": users[f], "unread": unread, "snaps": snaps,
                        "last": {"body": (last["body"] or ("📎 Fil" if last["file_id"] else "📌 Delt indhold"))[:80], "at": last["created_at"], "mine": last["user_id"] == uid} if last else None})
    out.sort(key=lambda x: -(max(x["last"]["at"] if x["last"] else 0, 0)))
    return 200, {"dms": out}


# ══ Files (images for chat/snaps/stories, audio for music) ════════════════
def _sniff(raw):
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return "image", "image/png"
    if raw[:3] == b"\xff\xd8\xff":
        return "image", "image/jpeg"
    if raw[:6] in (b"GIF87a", b"GIF89a"):
        return "image", "image/gif"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "image", "image/webp"
    if raw[:3] == b"ID3" or (len(raw) > 1 and raw[0] == 0xFF and (raw[1] & 0xE0) == 0xE0):
        return "audio", "audio/mpeg"
    if raw[:4] == b"OggS":
        return "audio", "audio/ogg"
    if raw[:4] == b"fLaC":
        return "audio", "audio/flac"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WAVE":
        return "audio", "audio/wav"
    if raw[4:8] == b"ftyp" and raw[8:11] in (b"M4A", b"mp4", b"iso", b"M4B", b"das"):
        return "audio", "audio/mp4"
    if raw[:4] == b"\x1aE\xdf\xa3":
        return "audio", "audio/webm"
    return None, None


def cm_file_upload(req, _):
    u = require_cm(req)
    raw = req.raw_body()
    if not raw:
        raise ApiError(400, "Ingen fil modtaget.", "invalid")
    kind, mime = _sniff(raw)
    if not kind:
        raise ApiError(400, "Kun billeder (PNG, JPEG, GIF, WebP) og lydfiler (MP3, M4A, OGG, WAV, FLAC) kan uploades.", "invalid_type")
    if kind == "image" and len(raw) > MAX_IMAGE:
        raise ApiError(413, "Billedet er for stort (højst 8 MB).", "too_large")
    if kind == "audio" and len(raw) > MAX_AUDIO:
        raise ApiError(413, "Lydfilen er for stor (højst 25 MB).", "too_large")
    purpose = (req.headers.get("X-Purpose") or "").lower()
    if purpose == "snap":
        if kind != "image":
            raise ApiError(400, "En snap skal være et billede.", "invalid_type")
        kind = "snap"
    elif purpose == "story":
        if kind != "image":
            raise ApiError(400, "En story skal være et billede.", "invalid_type")
        kind = "story"
    used = db.one("SELECT COALESCE(SUM(size), 0) AS n FROM cm_files WHERE user_id = ?", (u["id"],))["n"]
    if used + len(raw) > 500 * 1024 * 1024:
        raise ApiError(413, "Du har brugt din plads til filer (500 MB). Slet gamle beskeder med filer først.", "quota")
    from urllib.parse import unquote
    name = unquote(req.headers.get("X-File-Name") or "")[:120]
    fid = secrets.token_urlsafe(18)
    db.q("INSERT INTO cm_files(id, user_id, kind, mime, name, size, data, created_at) VALUES(?,?,?,?,?,?,?,?)",
         (fid, u["id"], kind, mime, name, len(raw), raw, db.now()))
    return 201, {"file": {"id": fid, "kind": kind, "mime": mime, "name": name, "size": len(raw), "url": f"/api/cm/files/{fid}"}}


def cm_file_get(req, params):
    u = require_cm(req)
    fid = params["fid"]
    if not ID_RE.match(fid):
        raise ApiError(404, "Filen findes ikke.", "not_found")
    f = db.one("SELECT * FROM cm_files WHERE id = ?", (fid,))
    if not f or f["kind"] == "snap":   # snaps can only be opened once through /snaps/<id>/open
        raise ApiError(404, "Filen findes ikke.", "not_found")
    if f["kind"] == "story" and f["user_id"] != u["id"] and not _are_friends(u["id"], f["user_id"]):
        raise ApiError(404, "Filen findes ikke.", "not_found")
    data = bytes(f["data"])
    headers = {"Content-Type": f["mime"], "Cache-Control": "private, max-age=86400", "Content-Security-Policy": "default-src 'none'; sandbox"}
    rng = req.headers.get("Range") or ""
    m = re.match(r"bytes=(\d*)-(\d*)$", rng.strip())
    if m and f["kind"] == "audio" and (m.group(1) or m.group(2)):
        size = len(data)
        if m.group(1):
            start = int(m.group(1))
            end = int(m.group(2)) if m.group(2) else size - 1
        else:
            start, end = max(0, size - int(m.group(2))), size - 1
        end = min(end, size - 1)
        if start > end:
            return 416, b"", {"Content-Range": f"bytes */{size}"}
        headers.update({"Content-Range": f"bytes {start}-{end}/{size}", "Accept-Ranges": "bytes"})
        return 206, data[start:end + 1], headers
    headers["Accept-Ranges"] = "bytes"
    return 200, data, headers


# ══ Snaps (view once, friends only) and stories (24 h) ════════════════════
def cm_snap_send(req, _):
    u = require_cm(req)
    b = req.json()
    to = b.get("to") if isinstance(b.get("to"), list) else []
    to = sorted({_int(x) for x in to if _int(x)})[:30]
    if not to:
        raise ApiError(400, "Vælg mindst én ven.", "missing", {"field": "to"})
    f = db.one("SELECT id FROM cm_files WHERE id = ? AND user_id = ? AND kind = 'snap'", (str(b.get("fileId") or "")[:40], u["id"]))
    if not f:
        raise ApiError(400, "Tag et billede først.", "missing", {"field": "fileId"})
    seconds = _int(b.get("seconds"), 8, 1, 30)
    caption = body_str(b, "caption", 200)
    sent = []
    for t in to:
        if t == u["id"] or not _are_friends(u["id"], t) or _blocked_between(u["id"], t):
            continue
        sid = _uid("n")
        db.q("INSERT INTO cm_snaps(id, from_id, to_id, file_id, caption, seconds, created_at, expires_at) VALUES(?,?,?,?,?,?,?,?)",
             (sid, u["id"], t, f["id"], caption, seconds, db.now(), db.now() + 7 * 86400))
        sent.append(t)
        live.publish([t], {"type": "snap", "from": _user_card(u)})
        live.publish([t], {"type": "notify", "kind": "snap", "title": "Ny snap", "text": f"{u['display_name']} har sendt dig en snap.", "path": "/apps/community/snaps"})
    if not sent:
        raise ApiError(403, "Du kan kun sende snaps til venner.", "not_friends")
    return 201, {"ok": True, "sent": len(sent)}


def cm_snaps(req, _):
    u = require_cm(req)
    t = db.now()
    inbox = db.all_rows("SELECT * FROM cm_snaps WHERE to_id = ? AND expires_at > ? AND opened_at IS NULL ORDER BY created_at DESC LIMIT 100", (u["id"], t))
    sent = db.all_rows("SELECT * FROM cm_snaps WHERE from_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 50", (u["id"], t - 7 * 86400))
    users = _users([r["from_id"] for r in inbox] + [r["to_id"] for r in sent])
    return 200, {"inbox": [{"id": r["id"], "from": users.get(r["from_id"]), "at": r["created_at"], "seconds": r["seconds"]} for r in inbox if r["from_id"] in users],
                 "sent": [{"id": r["id"], "to": users.get(r["to_id"]), "at": r["created_at"], "opened": r["opened_at"]} for r in sent if r["to_id"] in users]}


def cm_snap_open(req, params):
    """Returns the picture once; afterwards it is gone for good."""
    u = require_cm(req)
    if not ID_RE.match(params["id"]):
        raise ApiError(404, "Snappen findes ikke.", "not_found")
    s = db.one("SELECT * FROM cm_snaps WHERE id = ? AND to_id = ?", (params["id"], u["id"]))
    if not s or s["opened_at"] or s["expires_at"] < db.now():
        raise ApiError(410, "Snappen er allerede åbnet eller udløbet.", "gone")
    f = db.one("SELECT mime, data FROM cm_files WHERE id = ?", (s["file_id"],))
    db.q("UPDATE cm_snaps SET opened_at = ? WHERE id = ?", (db.now(), s["id"]))
    _drop_snap_file(s["file_id"])
    live.publish([s["from_id"]], {"type": "snap-opened", "id": s["id"], "by": u["id"]})
    if not f:
        raise ApiError(410, "Snappen er udløbet.", "gone")
    sender = _users([s["from_id"]]).get(s["from_id"])
    return 200, {"image": f"data:{f['mime']};base64," + base64.b64encode(bytes(f["data"])).decode(), "caption": s["caption"],
                 "seconds": s["seconds"], "from": sender, "at": s["created_at"]}, {"Cache-Control": "no-store"}


def _drop_snap_file(fid):
    if fid and not db.one("SELECT 1 FROM cm_snaps WHERE file_id = ? AND opened_at IS NULL AND expires_at > ?", (fid, db.now())):
        db.q("DELETE FROM cm_files WHERE id = ? AND kind = 'snap'", (fid,))


def cm_story_post(req, _):
    u = require_cm(req)
    b = req.json()
    f = db.one("SELECT id FROM cm_files WHERE id = ? AND user_id = ? AND kind = 'story'", (str(b.get("fileId") or "")[:40], u["id"]))
    if not f:
        raise ApiError(400, "Vælg et billede først.", "missing")
    if db.one("SELECT COUNT(*) AS n FROM cm_stories WHERE user_id = ? AND expires_at > ?", (u["id"], db.now()))["n"] >= 30:
        raise ApiError(400, "Du kan højst have 30 stories ad gangen.", "limit")
    sid = _uid("t")
    db.q("INSERT INTO cm_stories(id, user_id, file_id, caption, created_at, expires_at) VALUES(?,?,?,?,?,?)",
         (sid, u["id"], f["id"], body_str(b, "caption", 200), db.now(), db.now() + 86400))
    friends = [r["friend_id"] if r["user_id"] == u["id"] else r["user_id"] for r in
               db.all_rows("SELECT user_id, friend_id FROM cm_friends WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'", (u["id"], u["id"]))]
    live.publish(friends + [u["id"]], {"type": "stories"})
    return 201, {"ok": True, "id": sid}


def cm_stories(req, _):
    u = require_cm(req)
    uid = u["id"]
    friends = [r["friend_id"] if r["user_id"] == uid else r["user_id"] for r in
               db.all_rows("SELECT user_id, friend_id FROM cm_friends WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'", (uid, uid))]
    ids = friends + [uid]
    rows = db.all_rows(f"SELECT * FROM cm_stories WHERE user_id IN ({','.join('?' * len(ids))}) AND expires_at > ? ORDER BY created_at", ids + [db.now()])
    seen = {r["story_id"] for r in db.all_rows("SELECT story_id FROM cm_story_views WHERE user_id = ?", (uid,))}
    users = _users(ids)
    groups = {}
    for r in rows:
        g = groups.setdefault(r["user_id"], {"user": users.get(r["user_id"]), "stories": [], "unseen": 0, "mine": r["user_id"] == uid})
        item = {"id": r["id"], "url": f"/api/cm/files/{r['file_id']}", "caption": r["caption"], "at": r["created_at"], "seen": r["id"] in seen or r["user_id"] == uid}
        if r["user_id"] == uid:
            item["views"] = db.one("SELECT COUNT(*) AS n FROM cm_story_views WHERE story_id = ?", (r["id"],))["n"]
        g["stories"].append(item)
        g["unseen"] += 0 if item["seen"] else 1
    out = sorted(groups.values(), key=lambda g: (not g["mine"], g["unseen"] == 0, -g["stories"][-1]["at"]))
    return 200, {"groups": [g for g in out if g["user"]]}


def cm_story_view(req, params):
    u = require_cm(req)
    s = db.one("SELECT * FROM cm_stories WHERE id = ? AND expires_at > ?", (params["id"], db.now()))
    if not s or (s["user_id"] != u["id"] and not _are_friends(u["id"], s["user_id"])):
        raise ApiError(404, "Storyen findes ikke.", "not_found")
    if s["user_id"] != u["id"]:
        db.q("INSERT OR IGNORE INTO cm_story_views(story_id, user_id, at) VALUES(?,?,?)", (s["id"], u["id"], db.now()))
    return 200, {"ok": True}


def cm_story_views(req, params):
    u = require_cm(req)
    s = db.one("SELECT * FROM cm_stories WHERE id = ? AND user_id = ?", (params["id"], u["id"]))
    if not s:
        raise ApiError(404, "Storyen findes ikke.", "not_found")
    rows = db.all_rows("SELECT user_id, at FROM cm_story_views WHERE story_id = ? ORDER BY at DESC", (s["id"],))
    users = _users([r["user_id"] for r in rows])
    return 200, {"views": [{"user": users.get(r["user_id"]), "at": r["at"]} for r in rows if r["user_id"] in users]}


def cm_story_delete(req, params):
    u = require_cm(req)
    s = db.one("SELECT * FROM cm_stories WHERE id = ? AND user_id = ?", (params["id"], u["id"]))
    if not s:
        raise ApiError(404, "Storyen findes ikke.", "not_found")
    db.q("DELETE FROM cm_stories WHERE id = ?", (s["id"],))
    db.q("DELETE FROM cm_files WHERE id = ? AND kind = 'story'", (s["file_id"],))
    return 200, {"ok": True}


# ══ Reports ═══════════════════════════════════════════════════════════════
def cm_report(req, _):
    u = require_cm(req)
    b = req.json()
    kind = b.get("kind")
    ref = str(b.get("ref") or "")[:60]
    reason = body_str(b, "reason", 500, required=True)
    server_id, target, snap = None, None, ""
    if kind == "message":
        r = _msg_row(ref)
        _channel_access(r["channel_id"], u["id"])
        c = None if r["channel_id"].startswith("dm-") else _channel(r["channel_id"])
        server_id, target, snap = (c["server_id"] if c else None), r["user_id"], r["body"][:1000]
    elif kind == "user":
        target = _int(ref)
        if not db.one("SELECT 1 FROM users WHERE id = ?", (target,)):
            raise ApiError(404, "Brugeren findes ikke.", "not_found")
    elif kind == "server":
        s = _server(ref)
        server_id, snap = None, f"{s['name']}: {s['description']}"[:1000]
        target = s["owner_id"]
    elif kind == "story":
        s = db.one("SELECT * FROM cm_stories WHERE id = ?", (ref,))
        if not s:
            raise ApiError(404, "Storyen findes ikke.", "not_found")
        target, snap = s["user_id"], s["caption"]
    elif kind == "snap":
        s = db.one("SELECT * FROM cm_snaps WHERE id = ? AND to_id = ?", (ref, u["id"]))
        if not s:
            raise ApiError(404, "Snappen findes ikke.", "not_found")
        target, snap = s["from_id"], s["caption"]
    else:
        raise ApiError(400, "Ukendt type.", "invalid")
    if db.one("SELECT COUNT(*) AS n FROM cm_reports WHERE reporter_id = ? AND created_at > ?", (u["id"], db.now() - 3600))["n"] >= 20:
        raise ApiError(429, "Du har sendt mange anmeldelser. Prøv igen senere.", "limit")
    db.q("INSERT INTO cm_reports(reporter_id, kind, ref, server_id, target_user, reason, snapshot, created_at) VALUES(?,?,?,?,?,?,?,?)",
         (u["id"], kind, ref, server_id, target, reason, snap, db.now()))
    notify = set()
    if server_id:
        notify |= {r["user_id"] for r in db.all_rows("SELECT user_id FROM cm_members WHERE server_id = ? AND role IN ('owner','admin','moderator')", (server_id,))}
    notify |= {r["id"] for r in db.all_rows("SELECT id FROM users WHERE role = 'owner'")}
    notify |= {r["user_id"] for r in db.all_rows("SELECT user_id FROM admin_access")}
    live.publish(notify - {u["id"]}, {"type": "notify", "kind": "report", "title": "Ny anmeldelse", "text": "Noget er blevet anmeldt i Fællesskab.", "path": "/apps/community/reports"})
    return 201, {"ok": True}


def cm_reports(req, _):
    """Moderators see reports from their servers; the platform owner sees everything."""
    u = _report_user(req)
    show = _q(req, "show") or "open"
    if u["role"] == "owner" or _platform_admin(u["id"]):
        sql, args = "SELECT * FROM cm_reports WHERE 1=1", []
    else:
        sids = [r["server_id"] for r in db.all_rows("SELECT server_id FROM cm_members WHERE user_id = ? AND role IN ('owner','admin','moderator')", (u["id"],))]
        if not sids:
            return 200, {"reports": [], "canModerate": False}
        sql, args = f"SELECT * FROM cm_reports WHERE server_id IN ({','.join('?' * len(sids))})", sids
    sql += " AND handled_at IS NULL" if show == "open" else ""
    rows = db.all_rows(sql + " ORDER BY created_at DESC LIMIT 200", args)
    users = _users([r["reporter_id"] for r in rows] + [r["target_user"] for r in rows] + [r["handled_by"] for r in rows])
    servers = {r["id"]: r["name"] for r in db.all_rows("SELECT id, name FROM cm_servers")} if rows else {}
    return 200, {"canModerate": True, "reports": [{
        "id": r["id"], "kind": r["kind"], "ref": r["ref"], "server": {"id": r["server_id"], "name": servers.get(r["server_id"], "")} if r["server_id"] else None,
        "reporter": users.get(r["reporter_id"]), "target": users.get(r["target_user"]), "reason": r["reason"], "snapshot": r["snapshot"],
        "at": r["created_at"], "handled": {"by": users.get(r["handled_by"], {}).get("name"), "at": r["handled_at"], "action": r["action"]} if r["handled_at"] else None,
    } for r in rows]}


def _platform_admin(uid):
    from .adminapp import is_admin
    return is_admin(uid)


def _report_user(req):
    """Platform admins (Admin app) handle reports without joining Fællesskab; others need a Fællesskab profile."""
    u = require_user(req)
    return u if _platform_admin(u["id"]) else require_cm(req)


def cm_report_handle(req, params):
    u = _report_user(req)
    r = db.one("SELECT * FROM cm_reports WHERE id = ?", (_int(params["id"]),))
    if not r:
        raise ApiError(404, "Anmeldelsen findes ikke.", "not_found")
    if u["role"] != "owner" and not _platform_admin(u["id"]):
        if not r["server_id"]:
            raise ApiError(403, "Kun platformens ejer kan behandle denne anmeldelse.", "forbidden")
        _need(r["server_id"], u["id"], "moderator")
    action = req.json().get("action")
    if action not in ("dismiss", "delete", "resolved"):
        raise ApiError(400, "Ukendt handling.", "invalid")
    if action == "delete" and r["kind"] == "message":
        m = db.one("SELECT * FROM cm_messages WHERE id = ?", (_int(r["ref"]),))
        if m and not m["deleted"]:
            db.q("UPDATE cm_messages SET deleted = 1, body = '' WHERE id = ?", (m["id"],))
            audience, _, _, _ = _channel_access_any(m["channel_id"])
            live.publish(audience, {"type": "msg-delete", "channel": m["channel_id"], "id": m["id"]})
    if action == "delete" and r["kind"] == "story":
        s = db.one("SELECT * FROM cm_stories WHERE id = ?", (r["ref"],))
        if s:
            db.q("DELETE FROM cm_stories WHERE id = ?", (s["id"],))
            db.q("DELETE FROM cm_files WHERE id = ?", (s["file_id"],))
    db.q("UPDATE cm_reports SET handled_by = ?, handled_at = ?, action = ? WHERE id = ?", (u["id"], db.now(), action, r["id"]))
    return 200, {"ok": True}


def _channel_access_any(cid):
    m = DM_RE.match(cid)
    if m:
        return [int(m.group(1)), int(m.group(2))], None, None, None
    c = db.one("SELECT * FROM cm_channels WHERE id = ?", (cid,))
    return (_server_member_ids(c["server_id"]) if c else []), c, None, None


# ══ Music rooms (own audio files, synced playback) ════════════════════════
def _music_state(cid):
    r = db.one("SELECT * FROM cm_music WHERE channel_id = ?", (cid,))
    if not r:
        return {"queue": [], "current": None}
    return {"queue": json.loads(r["queue"]), "current": json.loads(r["current"])}


def _music_save(cid, st):
    db.q("INSERT INTO cm_music(channel_id, queue, current, updated_at) VALUES(?,?,?,?) ON CONFLICT(channel_id) DO UPDATE SET queue = excluded.queue, current = excluded.current, updated_at = excluded.updated_at",
         (cid, json.dumps(st["queue"]), json.dumps(st["current"]), db.now()))


def _music_out(st):
    return {**st, "now": _now_ms()}


def _music_channel(cid, uid):
    c = _channel(cid)
    if c["kind"] != "music":
        raise ApiError(400, "Det er ikke en musikkanal.", "invalid")
    mem = _need(c["server_id"], uid)
    return c, mem


def cm_music_get(req, params):
    u = require_cm(req)
    _music_channel(params["cid"], u["id"])
    return 200, _music_out(_music_state(params["cid"]))


def _start(item, offset=0.0):
    return {"item": item, "startedAt": _now_ms() - int(offset * 1000), "paused": False, "pausedAt": 0.0}


def cm_music_action(req, params):
    u = require_cm(req)
    c, mem = _music_channel(params["cid"], u["id"])
    if not mem["rules_accepted_at"]:
        raise ApiError(403, "Accepter serverens regler først.", "rules")
    if mem["muted_until"] > db.now():
        raise ApiError(403, "Du er gjort tavs og kan ikke styre musikken lige nu.", "muted")
    b = req.json()
    action = b.get("action")
    st = _music_state(c["id"])
    cur = st["current"]
    is_mod = RANK[mem["role"]] >= RANK["moderator"]
    if action == "add":
        f = db.one("SELECT id, name, kind, user_id FROM cm_files WHERE id = ? AND kind = 'audio'", (str(b.get("fileId") or "")[:40],))
        if not f or f["user_id"] != u["id"]:
            raise ApiError(400, "Upload en lydfil først.", "invalid")
        if len(st["queue"]) >= 100:
            raise ApiError(400, "Køen er fuld (100 numre).", "limit")
        item = {"id": _uid("q"), "fileId": f["id"], "url": f"/api/cm/files/{f['id']}", "title": body_str(b, "title", 120) or f["name"] or "Uden titel",
                "duration": max(0.0, min(float(b.get("duration") or 0), 4 * 3600)), "by": {"id": u["id"], "name": u["display_name"]}}
        if cur is None:
            st["current"] = _start(item)
        else:
            st["queue"].append(item)
        msg = f"lagde \"{item['title']}\" i køen"
    elif action in ("pause", "resume", "seek", "skip", "stop"):
        if not cur:
            raise ApiError(400, "Der spiller ikke noget.", "idle")
        pos = (cur["pausedAt"] if cur["paused"] else (_now_ms() - cur["startedAt"]) / 1000.0)
        if action == "pause" and not cur["paused"]:
            cur.update({"paused": True, "pausedAt": pos})
            msg = "satte musikken på pause"
        elif action == "resume" and cur["paused"]:
            cur.update({"paused": False, "startedAt": _now_ms() - int(cur["pausedAt"] * 1000)})
            msg = "startede musikken igen"
        elif action == "seek":
            to = max(0.0, float(b.get("position") or 0))
            if cur["paused"]:
                cur["pausedAt"] = to
            else:
                cur["startedAt"] = _now_ms() - int(to * 1000)
            msg = None
        elif action == "skip":
            st["current"] = _start(st["queue"].pop(0)) if st["queue"] else None
            msg = "sprang nummeret over"
        elif action == "stop":
            if not is_mod and cur["item"]["by"]["id"] != u["id"]:
                raise ApiError(403, "Kun moderatorer kan stoppe og tømme køen.", "forbidden")
            st = {"queue": [], "current": None}
            msg = "stoppede musikken og tømte køen"
        else:
            msg = None
    elif action == "ended":
        # sent by listeners when the track finishes; only advance once per track
        if cur and cur["item"]["id"] == b.get("itemId"):
            st["current"] = _start(st["queue"].pop(0)) if st["queue"] else None
        msg = None
    elif action == "remove":
        iid = b.get("itemId")
        item = next((x for x in st["queue"] if x["id"] == iid), None)
        if not item:
            raise ApiError(404, "Nummeret er ikke i køen.", "not_found")
        if item["by"]["id"] != u["id"] and not is_mod:
            raise ApiError(403, "Du kan kun fjerne dine egne numre.", "forbidden")
        st["queue"] = [x for x in st["queue"] if x["id"] != iid]
        msg = None
    elif action == "move":
        iid, to = b.get("itemId"), _int(b.get("to"), 0, 0)
        item = next((x for x in st["queue"] if x["id"] == iid), None)
        if not item:
            raise ApiError(404, "Nummeret er ikke i køen.", "not_found")
        st["queue"].remove(item)
        st["queue"].insert(min(to, len(st["queue"])), item)
        msg = None
    else:
        raise ApiError(400, "Ukendt handling.", "invalid")
    _music_save(c["id"], st)
    out = _music_out(st)
    live.publish(_server_member_ids(c["server_id"]), {"type": "music", "channel": c["id"], "state": out,
                                                      "event": {"user": u["display_name"], "text": msg} if msg else None})
    return 200, out


# ══ Housekeeping ══════════════════════════════════════════════════════════
def cleanup():
    t = db.now()
    for s in db.all_rows("SELECT id, file_id FROM cm_stories WHERE expires_at < ?", (t,)):
        db.q("DELETE FROM cm_stories WHERE id = ?", (s["id"],))
        db.q("DELETE FROM cm_files WHERE id = ? AND kind = 'story'", (s["file_id"],))
    for s in db.all_rows("SELECT DISTINCT file_id FROM cm_snaps WHERE expires_at < ? OR opened_at IS NOT NULL", (t,)):
        _drop_snap_file(s["file_id"])
    db.q("DELETE FROM cm_snaps WHERE expires_at < ? OR (opened_at IS NOT NULL AND opened_at < ?)", (t, t - 30 * 86400))
    # snap/story pictures uploaded but never sent
    db.q("DELETE FROM cm_files WHERE kind IN ('snap', 'story') AND created_at < ? AND id NOT IN (SELECT file_id FROM cm_snaps WHERE file_id IS NOT NULL) "
         "AND id NOT IN (SELECT file_id FROM cm_stories WHERE file_id IS NOT NULL)", (t - 86400,))
    db.q("DELETE FROM cm_invites WHERE expires_at > 0 AND expires_at < ?", (t - 86400,))


ROUTES = [
    ("GET", r"/api/live", live_poll),
    ("GET", r"/api/calendars", cal_list),
    ("POST", r"/api/calendars", cal_create),
    ("GET", r"/api/calendars/events", cal_events),
    ("PUT", r"/api/calendars/(?P<id>k[0-9a-f]+)", cal_update),
    ("DELETE", r"/api/calendars/(?P<id>k[0-9a-f]+)", cal_delete),
    ("POST", r"/api/calendars/(?P<id>k[0-9a-f]+)/members", cal_invite),
    ("PATCH", r"/api/calendars/(?P<id>k[0-9a-f]+)/members/(?P<uid>\d+)", cal_member_update),
    ("DELETE", r"/api/calendars/(?P<id>k[0-9a-f]+)/members/(?P<uid>\d+)", cal_member_remove),
    ("POST", r"/api/calendars/(?P<id>k[0-9a-f]+)/accept", cal_accept),
    ("POST", r"/api/calendars/(?P<id>k[0-9a-f]+)/events", cal_event_create),
    ("PUT", r"/api/calendars/(?P<id>k[0-9a-f]+)/events/(?P<eid>[A-Za-z0-9]+)", cal_event_update),
    ("DELETE", r"/api/calendars/(?P<id>k[0-9a-f]+)/events/(?P<eid>[A-Za-z0-9]+)", cal_event_delete),

    ("GET", r"/api/cm/me", cm_me),
    ("POST", r"/api/cm/me/age", cm_age),
    ("PATCH", r"/api/cm/me", cm_profile_update),
    ("GET", r"/api/cm/friends", cm_friends),
    ("POST", r"/api/cm/friends", cm_friend_add),
    ("POST", r"/api/cm/friends/(?P<uid>\d+)/accept", cm_friend_accept),
    ("DELETE", r"/api/cm/friends/(?P<uid>\d+)", cm_friend_remove),
    ("POST", r"/api/cm/blocks/(?P<uid>\d+)", cm_block),
    ("DELETE", r"/api/cm/blocks/(?P<uid>\d+)", cm_unblock),
    ("GET", r"/api/cm/users", cm_user_search),
    ("GET", r"/api/cm/dms", cm_dms),
    ("GET", r"/api/cm/servers", cm_servers),
    ("POST", r"/api/cm/servers", cm_server_create),
    ("GET", r"/api/cm/discover", cm_discover),
    ("GET", r"/api/cm/servers/(?P<sid>s[0-9a-f]+)", cm_server_get),
    ("PATCH", r"/api/cm/servers/(?P<sid>s[0-9a-f]+)", cm_server_update),
    ("DELETE", r"/api/cm/servers/(?P<sid>s[0-9a-f]+)", cm_server_delete),
    ("POST", r"/api/cm/servers/(?P<sid>s[0-9a-f]+)/leave", cm_server_leave),
    ("POST", r"/api/cm/servers/(?P<sid>s[0-9a-f]+)/join", cm_server_join),
    ("POST", r"/api/cm/servers/(?P<sid>s[0-9a-f]+)/rules", cm_rules_accept),
    ("POST", r"/api/cm/servers/(?P<sid>s[0-9a-f]+)/invites", cm_invite_create),
    ("POST", r"/api/cm/servers/(?P<sid>s[0-9a-f]+)/channels", cm_channel_create),
    ("POST", r"/api/cm/servers/(?P<sid>s[0-9a-f]+)/members/(?P<uid>\d+)/role", cm_member_role),
    ("POST", r"/api/cm/servers/(?P<sid>s[0-9a-f]+)/members/(?P<uid>\d+)/mute", cm_member_mute),
    ("POST", r"/api/cm/servers/(?P<sid>s[0-9a-f]+)/members/(?P<uid>\d+)/kick", cm_member_kick),
    ("POST", r"/api/cm/servers/(?P<sid>s[0-9a-f]+)/members/(?P<uid>\d+)/ban", cm_member_ban),
    ("GET", r"/api/cm/servers/(?P<sid>s[0-9a-f]+)/bans", cm_bans),
    ("DELETE", r"/api/cm/servers/(?P<sid>s[0-9a-f]+)/bans/(?P<uid>\d+)", cm_unban),
    ("GET", r"/api/cm/servers/(?P<sid>s[0-9a-f]+)/log", cm_modlog),
    ("GET", r"/api/cm/invites/(?P<code>[A-Za-z0-9_-]+)", cm_invite_get),
    ("POST", r"/api/cm/invites/(?P<code>[A-Za-z0-9_-]+)/join", cm_invite_join),
    ("PATCH", r"/api/cm/channels/(?P<cid>c[0-9a-f]+)", cm_channel_update),
    ("DELETE", r"/api/cm/channels/(?P<cid>c[0-9a-f]+)", cm_channel_delete),
    ("GET", r"/api/cm/channels/(?P<cid>c[0-9a-f]+)/music", cm_music_get),
    ("POST", r"/api/cm/channels/(?P<cid>c[0-9a-f]+)/music", cm_music_action),
    ("GET", r"/api/cm/channels/(?P<cid>c[0-9a-f]+|dm-\d+-\d+)/messages", cm_messages),
    ("POST", r"/api/cm/channels/(?P<cid>c[0-9a-f]+|dm-\d+-\d+)/messages", cm_message_send),
    ("POST", r"/api/cm/channels/(?P<cid>c[0-9a-f]+|dm-\d+-\d+)/typing", cm_typing),
    ("POST", r"/api/cm/channels/(?P<cid>c[0-9a-f]+|dm-\d+-\d+)/read", cm_read),
    ("PATCH", r"/api/cm/messages/(?P<mid>\d+)", cm_message_edit),
    ("DELETE", r"/api/cm/messages/(?P<mid>\d+)", cm_message_delete),
    ("POST", r"/api/cm/messages/(?P<mid>\d+)/react", cm_message_react),
    ("POST", r"/api/cm/files", cm_file_upload),
    ("GET", r"/api/cm/files/(?P<fid>[A-Za-z0-9_-]+)", cm_file_get),
    ("GET", r"/api/cm/snaps", cm_snaps),
    ("POST", r"/api/cm/snaps", cm_snap_send),
    ("POST", r"/api/cm/snaps/(?P<id>n[0-9a-f]+)/open", cm_snap_open),
    ("GET", r"/api/cm/stories", cm_stories),
    ("POST", r"/api/cm/stories", cm_story_post),
    ("POST", r"/api/cm/stories/(?P<id>t[0-9a-f]+)/view", cm_story_view),
    ("GET", r"/api/cm/stories/(?P<id>t[0-9a-f]+)/views", cm_story_views),
    ("DELETE", r"/api/cm/stories/(?P<id>t[0-9a-f]+)", cm_story_delete),
    ("GET", r"/api/cm/reports", cm_reports),
    ("POST", r"/api/cm/reports", cm_report),
    ("POST", r"/api/cm/reports/(?P<id>\d+)/handle", cm_report_handle),
]


def install(api_module):
    """Add these routes to api.COMPILED (done by app.py, after both modules are loaded)."""
    if not getattr(api_module, "_social_installed", False):
        api_module.COMPILED.extend((m, re.compile("^" + p + "$"), h) for m, p, h in ROUTES)
        api_module._social_installed = True
