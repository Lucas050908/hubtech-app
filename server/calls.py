"""Voice and video calls (WebRTC). The server only introduces the participants and relays their connection
messages (SDP offers/answers and ICE candidates) through the live bus – sound and picture go directly between
the devices. Rooms live in memory: a private call between two friends, or a server's voice channel.
"""
import json
import os
import re
import secrets
import threading
import time

from . import db, live
from .api import ApiError, require_user
from .social import _are_friends, _blocked_between, _channel, _member, _server_member_ids, _user_card, presence_of, require_cm, RANK

MAX_ROOM = 8            # mesh: everyone connects to everyone, so keep rooms small
RING_SECONDS = 45
_lock = threading.RLock()
_rooms = {}             # rid -> {"kind", "members": {uid: joined_ts}, "invited": set, "video", "by", "created", "server"}
_last_sweep = [0.0]


DEFAULT_STUN = [{"urls": ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun.cloudflare.com:3478"]}]
ICE_URL_RE = re.compile(r"^(stun|stuns|turn|turns):[A-Za-z0-9.\-\[\]:]{3,200}(\?transport=(udp|tcp))?$")


def _relay_setting():
    v = db.get_server_setting("ice_relay", None)
    return v if isinstance(v, dict) else None


def ice_servers():
    """STUN/TURN servers for the browsers. HUBTECH_ICE_SERVERS may hold a JSON list (e.g. with your own TURN server);
    otherwise the TURN server the owner saved under Indstillinger → Apps og opkald is added to the public STUN servers.
    STUN finds a direct route between two networks; TURN relays the call when the networks block that (some mobile
    networks, company and school wifi)."""
    raw = os.environ.get("HUBTECH_ICE_SERVERS", "").strip()
    if raw:
        try:
            v = json.loads(raw)
            if isinstance(v, list):
                return v
        except ValueError:
            pass
    out = [dict(x) for x in DEFAULT_STUN]
    r = _relay_setting()
    if r and r.get("urls"):
        out.append({"urls": r["urls"], "username": r.get("username", ""), "credential": r.get("credential", "")})
    return out


def ice_config_get(req, _):
    u = require_user(req)
    if u["role"] != "owner":
        raise ApiError(403, "Kun ejeren kan ændre opkaldsindstillingerne.", "forbidden")
    r = _relay_setting() or {}
    return 200, {"fromEnv": bool(os.environ.get("HUBTECH_ICE_SERVERS", "").strip()), "urls": r.get("urls", []),
                 "username": r.get("username", ""), "hasCredential": bool(r.get("credential")), "stun": DEFAULT_STUN[0]["urls"]}


def ice_config_set(req, _):
    u = require_user(req)
    if u["role"] != "owner":
        raise ApiError(403, "Kun ejeren kan ændre opkaldsindstillingerne.", "forbidden")
    b = req.json()
    urls = b.get("urls") or []
    if isinstance(urls, str):
        urls = [x.strip() for x in re.split(r"[\s,]+", urls) if x.strip()]
    if not isinstance(urls, list) or len(urls) > 4:
        raise ApiError(400, "Skriv højst 4 adresser.", "invalid")
    for x in urls:
        if not isinstance(x, str) or not ICE_URL_RE.match(x):
            raise ApiError(400, f"“{str(x)[:60]}” er ikke en gyldig adresse. Den skal starte med turn:, turns: eller stun:.", "invalid", {"field": "urls"})
    if not urls:
        db.set_server_setting("ice_relay", None)
        return 200, {"urls": [], "username": "", "hasCredential": False}
    old = _relay_setting() or {}
    username = str(b.get("username") or "")[:200]
    cred = b.get("credential")
    cred = old.get("credential", "") if cred is None else str(cred)[:200]   # empty field = keep the saved password
    db.set_server_setting("ice_relay", {"urls": urls, "username": username, "credential": cred})
    return 200, {"urls": urls, "username": username, "hasCredential": bool(cred)}


def _cards(ids):
    if not ids:
        return []
    rows = db.all_rows(f"SELECT id, username, display_name, avatar FROM users WHERE id IN ({','.join('?' * len(ids))})", list(ids))
    return [_user_card(r) for r in rows]


def _publish_voice(room):
    if room["kind"] == "voice":
        live.publish(_server_member_ids(room["server"]), {"type": "voice", "channel": room["id"], "server": room["server"], "users": _cards(list(room["members"]))})


def _end(rid, reason="ended"):
    room = _rooms.pop(rid, None)
    if room and reason == "missed" and room["invited"]:
        _missed(room, room["invited"])
    if room:
        live.publish(set(room["members"]) | room["invited"], {"type": "call-end", "id": rid, "reason": reason})
        _publish_voice({**room, "members": {}})


def _leave(rid, uid, reason="left"):
    room = _rooms.get(rid)
    if not room:
        return
    was_member = uid in room["members"]
    room["members"].pop(uid, None)
    room["invited"].discard(uid)
    if room["kind"] == "dm":
        # a private call ends when either side hangs up (or the callee declines)
        _end(rid, "declined" if not was_member and reason == "left" else reason)
        return
    if room["kind"] == "group" and not was_member and reason == "left":
        live.publish(room["members"].keys(), {"type": "call-decline", "id": rid, "user": uid})
    live.publish(room["members"].keys(), {"type": "call-leave", "id": rid, "user": uid})
    if not room["members"]:
        if room["kind"] == "group" and room["invited"]:
            _end(rid, "ended")
        _rooms.pop(rid, None)
    _publish_voice(room)


def _missed(room, users):
    from . import notify
    by = db.one("SELECT display_name FROM users WHERE id = ?", (room["by"],))
    try:
        notify.missed_call(users, by["display_name"] if by else "Nogen")
    except Exception:
        pass


def sweep(force=False):
    """Drop people who stopped polling (closed the app) and calls that nobody answered."""
    t = time.time()
    if not force and t - _last_sweep[0] < 10:
        return
    _last_sweep[0] = t
    with _lock:
        for rid, room in list(_rooms.items()):
            for uid in list(room["members"]):
                if not live.online(uid, 60):
                    _leave(rid, uid, "offline")
            room = _rooms.get(rid)
            if room and room["kind"] == "dm" and len(room["members"]) < 2 and t - room["created"] > RING_SECONDS:
                _end(rid, "missed")
            elif room and room["kind"] == "group" and t - room["created"] > RING_SECONDS:
                if room["invited"]:
                    _missed(room, set(room["invited"]))
                for x in list(room["invited"]):   # stop ringing for those who didn't answer
                    room["invited"].discard(x)
                    live.publish([x], {"type": "call-end", "id": rid, "reason": "missed"})
                if len(room["members"]) <= 1 and not room.get("answered"):
                    _end(rid, "missed")


def _room(rid):
    room = _rooms.get(rid)
    if not room:
        raise ApiError(404, "Opkaldet findes ikke længere.", "gone")
    return room


def call_start(req, _):
    """Ring a friend."""
    u = require_cm(req)
    b = req.json()
    if isinstance(b.get("to"), list):
        return _group_start(u, b)
    to = int(b.get("to") or 0)
    if to == u["id"] or not db.one("SELECT 1 FROM users WHERE id = ?", (to,)):
        raise ApiError(400, "Ugyldig modtager.", "invalid")
    if _blocked_between(u["id"], to) or not _are_friends(u["id"], to):
        raise ApiError(403, "Du kan kun ringe til dine venner.", "not_friends")
    from .social import presence_of
    if presence_of(to) == "busy":
        raise ApiError(409, "Personen har sat sin status til “Optaget” og vil ikke forstyrres lige nu. Skriv en besked i stedet.", "dnd")
    sweep(True)
    with _lock:
        for rid, room in _rooms.items():
            if room["kind"] in ("dm", "group") and (to in room["members"] or to in room["invited"]) and u["id"] not in room["members"]:
                raise ApiError(409, "Personen er optaget i et andet opkald.", "busy")
        rid = "k" + secrets.token_hex(8)
        _rooms[rid] = {"id": rid, "kind": "dm", "members": {u["id"]: time.time()}, "invited": {to}, "video": bool(b.get("video")),
                       "by": u["id"], "created": time.time(), "server": None}
    live.publish([to], {"type": "call-ring", "id": rid, "from": _user_card(u), "video": bool(b.get("video"))})
    return 201, {"id": rid, "ice": ice_servers(), "members": [], "video": bool(b.get("video"))}


def _friends_only(u, ids):
    out = []
    for x in ids:
        x = int(x or 0)
        if x and x != u["id"] and x not in out:
            if _blocked_between(u["id"], x) or not _are_friends(u["id"], x):
                raise ApiError(403, "Du kan kun ringe til dine venner.", "not_friends")
            out.append(x)
    return out


def _ring(u, rid, ids, video, members):
    live.publish(ids, {"type": "call-ring", "id": rid, "from": _user_card(u), "video": video, "group": True,
                       "others": [c["name"] for c in _cards([m for m in members if m != u["id"]])][:5]})


def _group_start(u, b):
    """Ring several friends at once – everyone who answers joins the same call."""
    ids = _friends_only(u, b.get("to"))[:MAX_ROOM - 1]
    ids = [x for x in ids if presence_of(x) != "busy"]          # "Optaget" isn't rung
    if not ids:
        raise ApiError(409, "Dem, du ringer til, er optaget lige nu.", "dnd")
    if not ids:
        raise ApiError(400, "Vælg mindst én ven.", "missing")
    sweep(True)
    video = bool(b.get("video"))
    with _lock:
        rid = "k" + secrets.token_hex(8)
        _rooms[rid] = {"id": rid, "kind": "group", "members": {u["id"]: time.time()}, "invited": set(ids), "video": video,
                       "by": u["id"], "created": time.time(), "server": None}
    _ring(u, rid, ids, video, [u["id"]])
    return 201, {"id": rid, "ice": ice_servers(), "members": [], "video": video, "kind": "group"}


def call_invite(req, params):
    """Add more friends to a call that is already going (a private call becomes a group call)."""
    u = require_cm(req)
    ids = _friends_only(u, req.json().get("to") if isinstance(req.json().get("to"), list) else [])
    with _lock:
        room = _room(params["id"])
        if u["id"] not in room["members"] or room["kind"] == "voice":
            raise ApiError(403, "Du er ikke med i opkaldet.", "forbidden")
        ids = [x for x in ids if x not in room["members"]][:max(0, MAX_ROOM - len(room["members"]))]
        if not ids:
            raise ApiError(400, "Ingen at invitere (eller opkaldet er fuldt).", "missing")
        room["kind"] = "group"
        room["invited"] |= set(ids)
        room["created"] = time.time()   # ring the new people for a while
        members = list(room["members"])
    live.publish(members, {"type": "call-group", "id": params["id"]})
    _ring(u, params["id"], ids, room["video"], members)
    return 200, {"ok": True, "invited": len(ids)}


def call_info(req, params):
    """Share what is going on in the call (e.g. the music that is playing) with the others."""
    u = require_user(req)
    b = req.json()
    music = b.get("music")
    if music is not None and (not isinstance(music, str) or len(music) > 160):
        raise ApiError(400, "Ugyldig titel.", "invalid")
    with _lock:
        room = _room(params["id"])
        if u["id"] not in room["members"]:
            raise ApiError(403, "Du er ikke med i opkaldet.", "forbidden")
        room["music"] = {"title": music, "by": u["display_name"]} if music else None
        others = [x for x in room["members"] if x != u["id"]]
    live.publish(others, {"type": "call-info", "id": params["id"], "music": room["music"]})
    return 200, {"ok": True}


def _voice_room(cid, uid):
    c = _channel(cid)
    if c["kind"] != "voice":
        raise ApiError(400, "Det er ikke en talekanal.", "invalid")
    m = _member(c["server_id"], uid)
    if not m:
        raise ApiError(403, "Du er ikke medlem af serveren.", "not_member")
    if not m["rules_accepted_at"]:
        raise ApiError(403, "Accepter serverens regler først.", "rules")
    if m["muted_until"] > db.now():
        raise ApiError(403, "Du er gjort tavs og kan ikke deltage i talekanaler lige nu.", "muted")
    room = _rooms.get(cid)
    if not room:
        room = _rooms[cid] = {"id": cid, "kind": "voice", "members": {}, "invited": set(), "video": False, "by": uid, "created": time.time(), "server": c["server_id"]}
    return room


def call_join(req, params):
    u = require_cm(req)
    rid = params["id"]
    sweep()
    with _lock:
        if rid.startswith("c"):
            room = _voice_room(rid, u["id"])
        else:
            room = _room(rid)
            if u["id"] not in room["invited"] and u["id"] not in room["members"]:
                raise ApiError(404, "Opkaldet findes ikke længere.", "gone")
        if u["id"] not in room["members"] and len(room["members"]) >= MAX_ROOM:
            raise ApiError(409, f"Der er højst plads til {MAX_ROOM} i et opkald.", "full")
        others = [x for x in room["members"] if x != u["id"]]
        room["members"][u["id"]] = time.time()
        if u["id"] != room["by"]:
            room["answered"] = True
        room["invited"].discard(u["id"])
    live.publish(others, {"type": "call-join", "id": rid, "user": _user_card(u)})
    _publish_voice(room)
    return 200, {"id": rid, "kind": room["kind"], "video": room["video"], "ice": ice_servers(), "members": _cards(others), "music": room.get("music")}


def call_leave(req, params):
    u = require_user(req)
    with _lock:
        if params["id"] in _rooms:
            _leave(params["id"], u["id"])
    return 200, {"ok": True}


def call_signal(req, params):
    """Relay an SDP offer/answer or ICE candidate to one other participant."""
    u = require_user(req)
    b = req.json()
    to = int(b.get("to") or 0)
    data = b.get("data")
    if not isinstance(data, dict) or len(json.dumps(data)) > 64 * 1024:
        raise ApiError(400, "Ugyldigt signal.", "invalid")
    with _lock:
        room = _room(params["id"])
        if u["id"] not in room["members"] or to not in room["members"]:
            raise ApiError(403, "I er ikke begge med i opkaldet.", "forbidden")
    live.publish([to], {"type": "call-signal", "id": params["id"], "from": u["id"], "data": data})
    return 200, {"ok": True}


def voice_state(server_id):
    """Who is in each voice channel of a server (for the channel list)."""
    with _lock:
        return {rid: _cards(list(r["members"])) for rid, r in _rooms.items() if r["kind"] == "voice" and r["server"] == server_id}


def calls_active(req, _):
    """A ringing call for me (e.g. after reloading the page)."""
    u = require_user(req)
    sweep()
    with _lock:
        for rid, r in _rooms.items():
            if r["kind"] in ("dm", "group") and u["id"] in r["invited"]:
                by = db.one("SELECT id, username, display_name, avatar FROM users WHERE id = ?", (r["by"],))
                return 200, {"ringing": {"id": rid, "from": _user_card(by), "video": r["video"], "group": r["kind"] == "group"} if by else None}
    return 200, {"ringing": None}


ROUTES = [
    ("GET", r"/api/cm/calls", calls_active),
    ("POST", r"/api/cm/calls", call_start),
    ("POST", r"/api/cm/calls/(?P<id>[kc][0-9a-f]+)/join", call_join),
    ("POST", r"/api/cm/calls/(?P<id>[kc][0-9a-f]+)/leave", call_leave),
    ("POST", r"/api/cm/calls/(?P<id>[kc][0-9a-f]+)/signal", call_signal),
    ("POST", r"/api/cm/calls/(?P<id>[kc][0-9a-f]+)/invite", call_invite),
    ("POST", r"/api/cm/calls/(?P<id>[kc][0-9a-f]+)/info", call_info),
    ("GET", r"/api/cm/calls/ice-config", ice_config_get),
    ("PUT", r"/api/cm/calls/ice-config", ice_config_set),
]


def install(api_module):
    if not getattr(api_module, "_calls_installed", False):
        api_module.COMPILED.extend((m, re.compile("^" + p + "$"), h) for m, p, h in ROUTES)
        api_module._calls_installed = True
