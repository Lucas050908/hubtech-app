"""Shared documents – the common ground for the apps people use together.

A *doc* belongs to an app (poll, event, form, post, question, album, expense, wiki, challenge, booking, page, board,
tournament). It has an owner, a visibility and optionally a secret link (token):

  private  – only the owner and the people added as members
  friends  – also the owner's friends in Fællesskab
  all      – everyone with an account on this HUBTECH
  public   – (a flag, on top of the above) anyone with the link, also without an account – for forms, booking, pages …

Under a doc people add *entries* (votes, answers, comments, photos, check-ins, bookings, sticky notes …). What each app
allows is described in RULES below, so the server checks who may add what, how often, and who may see it.
Every change is pushed over the live bus to the people involved.

Handlers follow api.py: (req, params) -> (status, payload[, headers]).
"""
import json
import re
import secrets
import threading
import time

from . import db, live
from .api import ApiError, require_user

ID_RE = re.compile(r"^d[0-9a-f]{12}$")
TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{16,40}$")
VIS = ("private", "friends", "all")
MAX_DOC = 200_000
RANK = {"none": 0, "public": 1, "member": 2, "editor": 3, "owner": 4}


def _s(v, n=200):
    return str(v or "").strip()[:n]


def _int(v, d=0, lo=None, hi=None):
    try:
        x = int(v)
    except (TypeError, ValueError):
        return d
    if lo is not None:
        x = max(lo, x)
    if hi is not None:
        x = min(hi, x)
    return x


# ── per-app rules ────────────────────────────────────────────────────────
# kind: who may add (member/owner/public), unique (None, "user", or a function data -> key per user, or "slot" = one for
# everybody per key), private (others only see their own), anon (names hidden from others), edit (author/member)
def _key(field):
    return lambda d: str(d.get(field, ""))[:80]


RULES = {
    "poll": {"kinds": {"vote": {"who": "member", "unique": "user"}, "comment": {"who": "member"}}, "public_ok": True},
    "event": {"kinds": {"rsvp": {"who": "member", "unique": "user"}, "comment": {"who": "member"}}, "public_ok": True},
    "form": {"kinds": {"response": {"who": "public", "private": True}}, "public_ok": True},
    "post": {"kinds": {"like": {"who": "member", "unique": "user"}, "comment": {"who": "member"}}},
    "question": {"kinds": {"answer": {"who": "member"}, "vote": {"who": "member", "unique": _key("target")}}},
    "album": {"kinds": {"photo": {"who": "member"}, "comment": {"who": "member"}}, "public_ok": True},
    "expense": {"kinds": {"expense": {"who": "member", "edit": "member"}, "settle": {"who": "member"}}},
    "wiki": {"kinds": {"page": {"who": "member", "edit": "member", "unique": "slot", "slot": _key("slug")}}, "public_ok": True},
    "challenge": {"kinds": {"join": {"who": "member", "unique": "user"}, "checkin": {"who": "member", "unique": _key("date")}, "comment": {"who": "member"}}},
    "booking": {"kinds": {"booking": {"who": "public", "private": True, "unique": "slot", "slot": lambda d: f"{d.get('date')} {d.get('time')}"}}, "public_ok": True},
    "page": {"kinds": {"guestbook": {"who": "public"}}, "public_ok": True},
    "board": {"kinds": {"item": {"who": "member", "edit": "member"}}},
    "tournament": {"kinds": {"comment": {"who": "member"}}, "public_ok": True},
    "shoplist": {"kinds": {"item": {"who": "member", "edit": "member"}}},
    "wishlist": {"kinds": {"reserve": {"who": "member", "unique": "slot", "slot": _key("item"), "secret": True}, "comment": {"who": "member", "secret": True}}, "public_ok": True},
    "signup": {"kinds": {"claim": {"who": "public"}}, "public_ok": True},
    "datepoll": {"kinds": {"pick": {"who": "public", "unique": "user"}, "comment": {"who": "member"}}, "public_ok": True},
    "chores": {"kinds": {"done": {"who": "member"}}},
    "songs": {"kinds": {"song": {"who": "public"}, "vote": {"who": "member", "unique": _key("song")}}, "public_ok": True},
}
APP_LIMIT = {"post": 5000, "question": 2000}       # docs per user per app (default 300)


# ── access ───────────────────────────────────────────────────────────────
def _doc(did):
    d = db.one("SELECT * FROM sh_docs WHERE id = ?", (did,)) if ID_RE.match(did or "") else None
    if not d:
        raise ApiError(404, "Det findes ikke (længere).", "not_found")
    return d


def _friends(a, b):
    return bool(db.one("SELECT 1 FROM cm_friends WHERE user_id = ? AND friend_id = ? AND status = 'accepted'", (min(a, b), max(a, b))))


def level(d, uid, token=None):
    """How much this user may do with this doc: owner, editor, member, public (anonymous via the link) or none."""
    if uid and d["owner_id"] == uid:
        return "owner"
    if uid:
        m = db.one("SELECT role FROM sh_members WHERE doc_id = ? AND user_id = ?", (d["id"], uid))
        if m:
            return "editor" if m["role"] == "editor" else "member"
        if d["visibility"] == "all" or (d["visibility"] == "friends" and _friends(uid, d["owner_id"])):
            return "member"
    if token and d["token"] and secrets.compare_digest(str(token), d["token"]):
        return "member" if uid else ("public" if d["public"] else "none")
    return "none"


def _need(d, uid, want, token=None):
    lv = level(d, uid, token)
    if RANK[lv] < RANK[want]:
        if lv == "none":
            raise ApiError(404, "Det findes ikke (længere).", "not_found")
        raise ApiError(403, "Det har du ikke adgang til.", "forbidden")
    return lv


def _audience(d):
    """Who hears about changes: owner, members, and (for open docs) whoever looked at it lately."""
    ids = {d["owner_id"]} | {r["user_id"] for r in db.all_rows("SELECT user_id FROM sh_members WHERE doc_id = ?", (d["id"],))}
    now = time.time()
    with _vlock:
        v = _viewers.get(d["id"], {})
        ids |= {u for u, t in v.items() if now - t < 1800}
    return list(ids)


_viewers = {}
_vlock = threading.Lock()


def _seen(did, uid):
    if not uid:
        return
    with _vlock:
        v = _viewers.setdefault(did, {})
        v[uid] = time.time()
        if len(_viewers) > 5000:
            _viewers.clear()


def _push(d, what="doc", extra=None):
    live.publish(_audience(d), {"type": "shared", "app": d["app"], "id": d["id"], "what": what, **(extra or {})})


def _notify(uids, title, text, path):
    for u in set(uids):
        live.publish([u], {"type": "notify", "kind": "shared", "title": title, "text": text, "path": path})


# ── output ───────────────────────────────────────────────────────────────
def _cards(ids):
    from .social import _user_card
    ids = sorted({int(i) for i in ids if i})
    if not ids:
        return {}
    rows = db.all_rows(f"SELECT * FROM users WHERE id IN ({','.join('?' * len(ids))})", ids)
    return {r["id"]: _user_card(r) for r in rows}


def _doc_out(d, uid, lv, full=True):
    out = {"id": d["id"], "app": d["app"], "title": d["title"], "visibility": d["visibility"], "public": bool(d["public"]),
           "created": d["created_at"], "updated": d["updated_at"], "version": d["version"], "role": lv, "ownerId": d["owner_id"]}
    data = json.loads(d["data"] or "{}")
    if lv in ("owner", "editor"):
        out["token"] = d["token"]
    out["data"] = data
    if full and lv in ("owner", "editor", "member"):
        mem = db.all_rows("SELECT user_id, role FROM sh_members WHERE doc_id = ?", (d["id"],))
        cards = _cards([m["user_id"] for m in mem] + [d["owner_id"]])
        out["owner"] = cards.get(d["owner_id"])
        out["members"] = [{**cards[m["user_id"]], "role": m["role"]} for m in mem if m["user_id"] in cards]
    elif full:
        c = _cards([d["owner_id"]]).get(d["owner_id"])
        out["owner"] = {"name": c["name"], "avatar": c["avatar"]} if c else None
    return out


def _entries_out(d, uid, lv):
    rules = RULES.get(d["app"], {}).get("kinds", {})
    rows = db.all_rows("SELECT * FROM sh_entries WHERE doc_id = ? ORDER BY id", (d["id"],))
    owner = lv in ("owner", "editor")
    out, ids = [], set()
    for r in rows:
        rule = rules.get(r["kind"], {})
        mine = bool(uid) and r["user_id"] == uid
        if rule.get("secret") and lv == "owner":
            continue
        if rule.get("private") and not owner and not mine:
            if d["app"] == "booking":          # others only see that the time is taken
                data = json.loads(r["data"])
                out.append({"id": r["id"], "kind": r["kind"], "data": {"date": data.get("date"), "time": data.get("time")}, "taken": True})
            continue
        e = {"id": r["id"], "kind": r["kind"], "data": json.loads(r["data"]), "at": r["created_at"], "edited": r["updated_at"] if r["updated_at"] != r["created_at"] else None, "mine": mine}
        anon = d["app"] == "poll" and json.loads(d["data"] or "{}").get("anonymous")
        if r["user_id"] and not (anon and not owner and not mine):
            e["userId"] = r["user_id"]
            ids.add(r["user_id"])
        elif r["guest"]:
            e["guest"] = r["guest"]
        out.append(e)
    cards = _cards(ids) if lv != "public" else {}
    for e in out:
        if "userId" in e:
            c = cards.get(e["userId"])
            e["user"] = c if lv != "public" else None
            if lv == "public":
                e.pop("userId", None)
    return out


# ── handlers ─────────────────────────────────────────────────────────────
def _app(params):
    app = params["app"]
    if app not in RULES:
        raise ApiError(404, "Ukendt app.", "not_found")
    return app


def _clean_vis(v, default="private"):
    v = str(v or default)
    return v if v in VIS else default


def list_docs(req, params):
    """Docs in an app that I may see. ?mine=1 only my own."""
    u = require_user(req)
    app = _app(params)
    q = req.query.get("mine", ["0"])[0]
    friends = [r["fid"] for r in db.all_rows("SELECT CASE WHEN user_id = ? THEN friend_id ELSE user_id END AS fid FROM cm_friends WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'", (u["id"], u["id"], u["id"]))]
    if q == "1":
        rows = db.all_rows("SELECT * FROM sh_docs WHERE app = ? AND owner_id = ? ORDER BY updated_at DESC LIMIT 300", (app, u["id"]))
    else:
        fl = ",".join("?" * len(friends)) or "NULL"
        rows = db.all_rows(
            f"SELECT * FROM sh_docs WHERE app = ? AND (owner_id = ? OR visibility = 'all' OR id IN (SELECT doc_id FROM sh_members WHERE user_id = ?)"
            f" OR (visibility = 'friends' AND owner_id IN ({fl}))) ORDER BY updated_at DESC LIMIT 300",
            (app, u["id"], u["id"], *friends))
    out = []
    ids = [r["id"] for r in rows]
    counts, mine = {}, {}
    if ids:
        ph = ",".join("?" * len(ids))
        for c in db.all_rows(f"SELECT doc_id, kind, COUNT(*) AS n FROM sh_entries WHERE doc_id IN ({ph}) GROUP BY doc_id, kind", ids):
            counts.setdefault(c["doc_id"], {})[c["kind"]] = c["n"]
        for c in db.all_rows(f"SELECT doc_id, kind, data FROM sh_entries WHERE doc_id IN ({ph}) AND user_id = ?", (*ids, u["id"])):
            mine.setdefault(c["doc_id"], {}).setdefault(c["kind"], []).append(json.loads(c["data"]))
    cards = _cards([r["owner_id"] for r in rows])
    for r in rows:
        lv = level(r, u["id"])
        o = _doc_out(r, u["id"], lv, full=False)
        o["owner"] = cards.get(r["owner_id"])
        o["counts"] = counts.get(r["id"], {})
        if r["owner_id"] == u["id"]:      # a surprise stays a surprise
            o["counts"] = {k: v for k, v in o["counts"].items() if not RULES[r["app"]]["kinds"].get(k, {}).get("secret")}
        o["mine"] = mine.get(r["id"], {})
        out.append(o)
    return 200, {"docs": out}


def create_doc(req, params):
    u = require_user(req)
    app = _app(params)
    b = req.json()
    if db.one("SELECT COUNT(*) AS n FROM sh_docs WHERE app = ? AND owner_id = ?", (app, u["id"]))["n"] >= APP_LIMIT.get(app, 300):
        raise ApiError(429, "Du har lavet for mange. Slet nogle af de gamle først.", "too_many")
    data = b.get("data") if isinstance(b.get("data"), dict) else {}
    raw = json.dumps(data, ensure_ascii=False)
    if len(raw) > MAX_DOC:
        raise ApiError(413, "Det er for stort.", "too_large")
    title = _s(b.get("title"), 160)
    if not title and app not in ("post", "board"):
        raise ApiError(400, "Giv det en titel.", "missing", {"field": "title"})
    did = "d" + secrets.token_hex(6)
    now = db.now()
    public = 1 if b.get("public") and RULES[app].get("public_ok") else 0
    db.q("INSERT INTO sh_docs(id, app, owner_id, title, data, visibility, public, token, created_at, updated_at, version) VALUES(?,?,?,?,?,?,?,?,?,?,1)",
         (did, app, u["id"], title, raw, _clean_vis(b.get("visibility"), "all" if app in ("question",) else "private"), public, secrets.token_urlsafe(18), now, now))
    added = _set_members(did, u, b.get("members"), b.get("editors"))
    d = _doc(did)
    if added:
        _notify(added, f"{u['display_name']} har delt noget med dig", title or _APP_DA.get(app, "Nyt"), f"/apps/{_APP_PAGE.get(app, app)}/d/{did}")
    _push(d, "new")
    return 201, {"doc": _doc_out(d, u["id"], "owner")}


_APP_DA = {"poll": "En afstemning", "event": "Et arrangement", "form": "En formular", "post": "Et opslag", "question": "Et spørgsmål", "album": "Et album",
           "expense": "Fællesudgifter", "wiki": "En wiki", "challenge": "En udfordring", "booking": "En bookingside", "page": "En side", "board": "En tavle", "tournament": "En turnering", "shoplist": "En indkøbsliste", "wishlist": "En ønskeseddel", "signup": "En fordeling", "datepoll": "En datoafstemning", "chores": "Pligter", "songs": "Sangønsker"}
_APP_PAGE = {"poll": "polls", "event": "events", "form": "forms", "post": "wall", "question": "qa", "album": "albums", "expense": "expenses",
             "wiki": "wiki", "challenge": "challenges", "booking": "booking", "page": "pages", "board": "board", "tournament": "tournaments", "shoplist": "shopping", "wishlist": "wishlist", "signup": "signup", "datepoll": "datepoll", "chores": "chores", "songs": "songs"}


def _set_members(did, u, members, editors=None):
    """Replace the member list (only friends or people on this HUBTECH can be added). Returns the new ones."""
    if members is None and editors is None:
        return []
    want = {}
    for x in (members or [])[:200]:
        if str(x).isdigit():
            want[int(x)] = "member"
    for x in (editors or [])[:50]:
        if str(x).isdigit():
            want[int(x)] = "editor"
    want.pop(u["id"], None)
    valid = {r["id"] for r in db.all_rows(f"SELECT id FROM users WHERE id IN ({','.join('?' * len(want)) or 'NULL'})", list(want))}
    old = {r["user_id"]: r["role"] for r in db.all_rows("SELECT user_id, role FROM sh_members WHERE doc_id = ?", (did,))}
    db.q("DELETE FROM sh_members WHERE doc_id = ?", (did,))
    for uid, role in want.items():
        if uid in valid:
            db.q("INSERT INTO sh_members(doc_id, user_id, role, added_at) VALUES(?,?,?,?)", (did, uid, role, db.now()))
    return [x for x in want if x in valid and x not in old]


def get_doc(req, params):
    u = require_user(req)
    d = _doc(params["id"])
    token = req.query.get("t", [None])[0]
    lv = _need(d, u["id"], "member", token)
    _seen(d["id"], u["id"])
    return 200, {"doc": _doc_out(d, u["id"], lv), "entries": _entries_out(d, u["id"], lv)}


def join_doc(req, params):
    """Opened with the secret link while logged in: become a member."""
    u = require_user(req)
    d = _doc(params["id"])
    t = str(req.json().get("token") or "")
    if level(d, u["id"]) != "none":
        return 200, {"ok": True}
    if not d["token"] or not TOKEN_RE.match(t) or not secrets.compare_digest(t, d["token"]):
        raise ApiError(403, "Linket er ikke gyldigt.", "forbidden")
    db.q("INSERT OR IGNORE INTO sh_members(doc_id, user_id, role, added_at) VALUES(?,?,?,?)", (d["id"], u["id"], "member", db.now()))
    _push(d, "members")
    return 200, {"ok": True}


def update_doc(req, params):
    u = require_user(req)
    d = _doc(params["id"])
    lv = _need(d, u["id"], "editor")
    b = req.json()
    sets, vals = [], []
    if "title" in b:
        sets.append("title = ?"); vals.append(_s(b["title"], 160))
    if isinstance(b.get("data"), dict):
        raw = json.dumps(b["data"], ensure_ascii=False)
        if len(raw) > MAX_DOC:
            raise ApiError(413, "Det er for stort.", "too_large")
        if isinstance(b.get("baseVersion"), int) and b["baseVersion"] != d["version"]:
            raise ApiError(409, "En anden har lige ændret det. Hent den nyeste udgave først.", "conflict")
        sets.append("data = ?"); vals.append(raw)
    if lv == "owner":
        if "visibility" in b:
            sets.append("visibility = ?"); vals.append(_clean_vis(b["visibility"], d["visibility"]))
        if "public" in b:
            sets.append("public = ?"); vals.append(1 if b["public"] and RULES[d["app"]].get("public_ok") else 0)
        if b.get("newToken"):
            sets.append("token = ?"); vals.append(secrets.token_urlsafe(18))
    if sets:
        sets.append("updated_at = ?"); vals.append(db.now())
        sets.append("version = version + 1")
        db.q(f"UPDATE sh_docs SET {', '.join(sets)} WHERE id = ?", (*vals, d["id"]))
    added = []
    if lv == "owner" and ("members" in b or "editors" in b):
        added = _set_members(d["id"], u, b.get("members"), b.get("editors"))
    d = _doc(d["id"])
    if added:
        _notify(added, f"{u['display_name']} har delt noget med dig", d["title"] or _APP_DA.get(d["app"], ""), f"/apps/{_APP_PAGE.get(d['app'], d['app'])}/d/{d['id']}")
    _push(d)
    return 200, {"doc": _doc_out(d, u["id"], lv)}


def delete_doc(req, params):
    u = require_user(req)
    d = _doc(params["id"])
    _need(d, u["id"], "owner")
    aud = _audience(d)
    db.q("DELETE FROM sh_entries WHERE doc_id = ?", (d["id"],))
    db.q("DELETE FROM sh_members WHERE doc_id = ?", (d["id"],))
    db.q("DELETE FROM sh_docs WHERE id = ?", (d["id"],))
    live.publish(aud, {"type": "shared", "app": d["app"], "id": d["id"], "what": "gone"})
    return 200, {"ok": True}


# ── entries ──────────────────────────────────────────────────────────────
_anon_hits = {}
_anon_lock = threading.Lock()


def _anon_limit(ip):
    now = time.time()
    with _anon_lock:
        hits = [t for t in _anon_hits.get(ip, []) if now - t < 600]
        if len(hits) >= 30:
            raise ApiError(429, "For mange svar på kort tid. Prøv igen om lidt.", "rate_limited")
        hits.append(now)
        _anon_hits[ip] = hits
        if len(_anon_hits) > 10000:
            _anon_hits.clear()


def _add_entry(d, uid, lv, b, guest=None):
    kind = str(b.get("kind") or "")
    rule = RULES[d["app"]]["kinds"].get(kind)
    if not rule:
        raise ApiError(400, "Det kan man ikke her.", "invalid")
    need = {"public": "public", "member": "member", "owner": "editor"}[rule["who"]]
    if RANK[lv] < RANK[need]:
        raise ApiError(403, "Det har du ikke adgang til.", "forbidden")
    ddata = json.loads(d["data"] or "{}")
    if ddata.get("closed") and kind in ("vote", "response", "rsvp", "booking", "checkin", "join"):
        raise ApiError(409, "Der er lukket for svar.", "closed")
    data = b.get("data") if isinstance(b.get("data"), dict) else {}
    raw = json.dumps(data, ensure_ascii=False)
    if len(raw) > (60_000 if kind in ("page", "item", "photo") else 20_000):
        raise ApiError(413, "Det er for langt.", "too_large")
    _validate(d, kind, data, ddata)
    now = db.now()
    uniq = rule.get("unique")
    if uniq == "slot":
        key = rule["slot"](data)
        clash = [r for r in db.all_rows("SELECT id, data, user_id FROM sh_entries WHERE doc_id = ? AND kind = ?", (d["id"], kind)) if rule["slot"](json.loads(r["data"])) == key]
        if d["app"] == "wishlist":
            if lv == "owner":
                raise ApiError(403, "Du kan ikke selv reservere dine ønsker.", "forbidden")
            if clash and data.get("remove"):
                if clash[0]["user_id"] != uid:
                    raise ApiError(403, "Det er en anden, der har reserveret den.", "forbidden")
                db.q("DELETE FROM sh_entries WHERE id = ?", (clash[0]["id"],))
                _touch(d); _push(d, "entries")
                return {"removed": clash[0]["id"]}
            if clash:
                raise ApiError(409, "Den er allerede reserveret af en anden.", "taken")
            if data.get("remove"):
                return {"removed": None}
        if clash:
            if d["app"] == "wiki":         # a page with that name: edit it instead
                return _edit(d, clash[0]["id"], uid, lv, data)
            raise ApiError(409, "Den tid er desværre lige blevet taget. Vælg en anden.", "taken")
    elif uniq and uid:
        rows = db.all_rows("SELECT id, data FROM sh_entries WHERE doc_id = ? AND kind = ? AND user_id = ?", (d["id"], kind, uid))
        if uniq != "user":
            rows = [r for r in rows if uniq(json.loads(r["data"])) == uniq(data)]
        if rows:
            if data.get("remove"):
                db.q("DELETE FROM sh_entries WHERE id = ?", (rows[0]["id"],))
                _touch(d); _push(d, "entries")
                return {"removed": rows[0]["id"]}
            db.q("UPDATE sh_entries SET data = ?, updated_at = ? WHERE id = ?", (raw, now, rows[0]["id"]))
            _touch(d); _push(d, "entries")
            return {"id": rows[0]["id"], "updated": True}
    if data.get("remove"):
        return {"removed": None}
    if guest is None and not uid:
        guest = _s(data.get("name"), 60) or "Gæst"
    cur = db.q("INSERT INTO sh_entries(doc_id, user_id, guest, kind, data, created_at, updated_at) VALUES(?,?,?,?,?,?,?)",
               (d["id"], uid, guest if not uid else None, kind, raw, now, now))
    _touch(d)
    _push(d, "entries")
    if uid != d["owner_id"] and kind in ("response", "booking", "rsvp", "answer", "comment", "guestbook", "photo", "claim", "song", "pick") and not rule.get("secret"):
        row = db.one("SELECT display_name FROM users WHERE id = ?", (uid,)) if uid else None
        who = guest or (row["display_name"] if row else "Nogen")
        what = {"response": "har svaret på", "booking": "har booket en tid i", "rsvp": "har svaret på", "answer": "har svaret på", "comment": "har kommenteret",
                "guestbook": "har skrevet i gæstebogen på", "photo": "har lagt et billede i", "claim": "har skrevet sig på", "song": "har ønsket en sang i", "pick": "har svaret på"}[kind]
        _notify([d["owner_id"]], f"{who} {what} “{d['title'] or _APP_DA.get(d['app'], '')}”", "", f"/apps/{_APP_PAGE.get(d['app'], d['app'])}/d/{d['id']}")
    return {"id": cur.lastrowid}


def _validate(d, kind, data, ddata):
    app = d["app"]
    if app == "poll" and kind == "vote" and not data.get("remove"):
        ch = data.get("choices")
        n = len(ddata.get("options") or [])
        if not isinstance(ch, list) or not ch or any(not isinstance(c, int) or c < 0 or c >= n for c in ch) or (len(ch) > 1 and not ddata.get("multi")):
            raise ApiError(400, "Vælg en mulighed.", "invalid")
    if app == "event" and kind == "rsvp" and data.get("answer") not in ("yes", "maybe", "no"):
        raise ApiError(400, "Svar ja, måske eller nej.", "invalid")
    if app == "signup" and kind == "claim" and not data.get("remove"):
        slot = next((x for x in (ddata.get("slots") or []) if isinstance(x, dict) and x.get("id") == data.get("slot")), None)
        if not slot:
            raise ApiError(400, "Den findes ikke på listen.", "invalid")
        need = max(1, min(99, int(slot.get("need") or 1)))
        taken = sum(1 for r in db.all_rows("SELECT data FROM sh_entries WHERE doc_id = ? AND kind = 'claim'", (d["id"],)) if json.loads(r["data"]).get("slot") == slot["id"])
        if taken >= need:
            raise ApiError(409, "Der er allerede nok på den. Vælg en anden.", "taken")
    if app == "datepoll" and kind == "pick" and not data.get("remove"):
        n = len(ddata.get("options") or [])
        for k in ("yes", "maybe"):
            v = data.get(k, [])
            if not isinstance(v, list) or any(not isinstance(c, int) or c < 0 or c >= n for c in v):
                raise ApiError(400, "Ugyldigt svar.", "invalid")
    if app == "chores" and kind == "done":
        if not any(isinstance(x, dict) and x.get("id") == data.get("chore") for x in (ddata.get("chores") or [])):
            raise ApiError(400, "Den pligt findes ikke.", "invalid")
    if app == "songs" and kind == "song" and not str(data.get("title") or "").strip():
        raise ApiError(400, "Skriv hvilken sang.", "invalid")
    if app == "event" and kind == "rsvp" and data.get("answer") == "yes" and ddata.get("capacity"):
        yes = sum(1 for r in db.all_rows("SELECT data FROM sh_entries WHERE doc_id = ? AND kind = 'rsvp'", (d["id"],)) if json.loads(r["data"]).get("answer") == "yes")
        if yes >= int(ddata["capacity"]):
            raise ApiError(409, "Der er desværre ikke flere pladser.", "full")
    if app == "form" and kind == "response":
        ans = data.get("answers") if isinstance(data.get("answers"), dict) else None
        if ans is None:
            raise ApiError(400, "Ugyldigt svar.", "invalid")
        for f in ddata.get("fields") or []:
            if f.get("required") and f.get("type") != "info" and not str(ans.get(f.get("id"), "")).strip() and ans.get(f.get("id")) not in (0, False) and not (isinstance(ans.get(f.get("id")), list) and ans.get(f.get("id"))):
                raise ApiError(400, f"Udfyld “{f.get('label', '')}”.", "missing", {"field": f.get("id")})
    if app == "booking" and kind == "booking":
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", str(data.get("date"))) or not re.match(r"^\d{2}:\d{2}$", str(data.get("time"))):
            raise ApiError(400, "Vælg en tid.", "invalid")
        if not _s(data.get("name"), 60):
            raise ApiError(400, "Skriv dit navn.", "missing", {"field": "name"})
        import datetime
        if data["date"] < datetime.date.today().isoformat():
            raise ApiError(400, "Den dag er allerede gået.", "invalid")
        if data["time"] not in _booking_times(ddata, data["date"]):
            raise ApiError(400, "Den tid kan ikke bookes.", "invalid")
    if kind in ("comment", "answer", "guestbook") and not _s(data.get("text"), 4000):
        raise ApiError(400, "Skriv noget.", "missing", {"field": "text"})
    if app == "expense" and kind == "expense":
        try:
            amt = float(data.get("amount"))
        except (TypeError, ValueError):
            amt = 0
        if not (0 < amt < 10_000_000) or not data.get("paidBy") or not isinstance(data.get("split"), list) or not data["split"]:
            raise ApiError(400, "Skriv beløb, hvem der betalte, og hvem det deles mellem.", "invalid")
    if app == "challenge" and kind == "checkin" and not re.match(r"^\d{4}-\d{2}-\d{2}$", str(data.get("date"))):
        raise ApiError(400, "Ugyldig dato.", "invalid")
    if app == "challenge" and kind == "checkin" and not data.get("remove"):
        import datetime
        if data["date"] > (datetime.date.today() + datetime.timedelta(days=1)).isoformat():
            raise ApiError(400, "Du kan ikke tjekke ind på en dag, der ikke er kommet endnu.", "invalid")
    if app == "wiki" and kind == "page" and not re.match(r"^[a-z0-9æøå-]{1,60}$", str(data.get("slug"))):
        raise ApiError(400, "Siden skal have et navn.", "invalid")


def _booking_times(cfg, date):
    """The times that can be booked on a day, from the owner's settings."""
    import datetime
    try:
        day = datetime.date.fromisoformat(date)
    except ValueError:
        return []
    if day.weekday() not in (cfg.get("weekdays") or [0, 1, 2, 3, 4]):
        return []
    ahead = _int(cfg.get("daysAhead"), 30, 1, 365)
    if (day - datetime.date.today()).days > ahead:
        return []
    if date in (cfg.get("closedDays") or []):
        return []
    length = _int(cfg.get("length"), 30, 5, 480)
    gap = _int(cfg.get("gap"), 0, 0, 120)

    def mins(t, d):
        try:
            h, m = str(t).split(":")
            return int(h) * 60 + int(m)
        except ValueError:
            return d
    out, t, end = [], mins(cfg.get("from"), 9 * 60), mins(cfg.get("to"), 16 * 60)
    now = datetime.datetime.now()
    soon = now.hour * 60 + now.minute + 30 if day == now.date() else -1     # today: not times that are (almost) gone
    while t + length <= end and len(out) < 200:
        if t > soon:
            out.append(f"{t // 60:02d}:{t % 60:02d}")
        t += length + gap
    return out


def _touch(d):
    db.q("UPDATE sh_docs SET updated_at = ? WHERE id = ?", (db.now(), d["id"]))


def _edit(d, eid, uid, lv, data):
    e = db.one("SELECT * FROM sh_entries WHERE id = ? AND doc_id = ?", (eid, d["id"]))
    if not e:
        raise ApiError(404, "Det findes ikke (længere).", "not_found")
    rule = RULES[d["app"]]["kinds"].get(e["kind"], {})
    can = (uid and e["user_id"] == uid) or RANK[lv] >= RANK["editor"] or (rule.get("edit") == "member" and RANK[lv] >= RANK["member"])
    if not can:
        raise ApiError(403, "Du kan kun rette dine egne.", "forbidden")
    old = json.loads(e["data"])
    if d["app"] == "wiki":           # keep the last ten versions of a page
        hist = (old.get("history") or [])[-9:] + [{"body": old.get("body", ""), "by": old.get("by"), "at": e["updated_at"]}]
        data = {**data, "history": hist, "by": uid}
    raw = json.dumps(data, ensure_ascii=False)
    db.q("UPDATE sh_entries SET data = ?, updated_at = ? WHERE id = ?", (raw, db.now(), eid))
    _touch(d)
    _push(d, "entries")
    return {"id": eid, "updated": True}


def add_entry(req, params):
    u = require_user(req)
    d = _doc(params["id"])
    lv = _need(d, u["id"], "member")
    _seen(d["id"], u["id"])
    b = req.json()
    if d["app"] == "wiki" and b.get("kind") == "page" and isinstance(b.get("data"), dict):
        b["data"]["by"] = u["id"]
    return 200, _add_entry(d, u["id"], lv, b)


def edit_entry(req, params):
    u = require_user(req)
    e = db.one("SELECT * FROM sh_entries WHERE id = ?", (_int(params["eid"]),))
    if not e:
        raise ApiError(404, "Det findes ikke.", "not_found")
    d = _doc(e["doc_id"])
    lv = _need(d, u["id"], "member")
    data = req.json().get("data")
    if not isinstance(data, dict) or len(json.dumps(data)) > 60_000:
        raise ApiError(400, "Ugyldige data.", "invalid")
    _validate(d, e["kind"], data, json.loads(d["data"] or "{}"))
    return 200, _edit(d, e["id"], u["id"], lv, data)


def delete_entry(req, params):
    u = require_user(req)
    e = db.one("SELECT * FROM sh_entries WHERE id = ?", (_int(params["eid"]),))
    if not e:
        raise ApiError(404, "Det findes ikke.", "not_found")
    d = _doc(e["doc_id"])
    lv = _need(d, u["id"], "member")
    rule = RULES[d["app"]]["kinds"].get(e["kind"], {})
    if not (e["user_id"] == u["id"] or RANK[lv] >= RANK["editor"] or (rule.get("edit") == "member" and d["app"] == "board")):
        raise ApiError(403, "Du kan kun slette dine egne.", "forbidden")
    db.q("DELETE FROM sh_entries WHERE id = ?", (e["id"],))
    _touch(d)
    _push(d, "entries")
    return 200, {"ok": True}


# ── the public link (no account needed) ──────────────────────────────────
def _by_token(token):
    d = db.one("SELECT * FROM sh_docs WHERE token = ?", (token,)) if TOKEN_RE.match(token or "") else None
    if not d:
        raise ApiError(404, "Linket virker ikke (længere).", "not_found")
    return d


def pub_get(req, params):
    d = _by_token(params["token"])
    uid = req.user["id"] if req.user else None
    lv = level(d, uid, params["token"])
    if lv == "none":
        raise ApiError(404, "Linket virker ikke (længere).", "not_found")
    if uid:
        _seen(d["id"], uid)
    doc = _doc_out(d, uid, lv)
    out = {"doc": doc, "entries": _entries_out(d, uid, lv), "signedIn": bool(uid)}
    if d["app"] == "booking":
        import datetime
        today = datetime.date.today()
        cfg = json.loads(d["data"] or "{}")
        days = []
        for k in range(_int(cfg.get("daysAhead"), 30, 1, 365) + 1):
            day = (today + datetime.timedelta(days=k)).isoformat()
            t = _booking_times(cfg, day)
            if t:
                days.append({"date": day, "times": t})
        out["days"] = days[:120]
    return 200, out


def pub_add(req, params):
    d = _by_token(params["token"])
    uid = req.user["id"] if req.user else None
    lv = level(d, uid, params["token"])
    if lv == "none":
        raise ApiError(404, "Linket virker ikke (længere).", "not_found")
    if not uid:
        _anon_limit(getattr(req, "visitor_ip", "?"))
    b = req.json()
    data = b.get("data") if isinstance(b.get("data"), dict) else {}
    guest = None if uid else (_s(data.get("name"), 60) or "Gæst")
    return 200, _add_entry(d, uid, lv, b, guest)


# ── files (pictures for posts, albums and pages) ─────────────────────────
MAX_FILE = 6 * 1024 * 1024


def upload(req, _):
    u = require_user(req)
    raw = req.raw_body()
    mime = ("image/png" if raw[:8] == b"\x89PNG\r\n\x1a\n" else "image/jpeg" if raw[:3] == b"\xff\xd8\xff" else
            "image/gif" if raw[:6] in (b"GIF87a", b"GIF89a") else "image/webp" if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP" else None)
    if not raw or not mime:
        raise ApiError(400, "Kun billeder (PNG, JPEG, GIF eller WebP).", "invalid_type")
    if len(raw) > MAX_FILE:
        raise ApiError(413, "Billedet er for stort (højst 6 MB).", "too_large")
    used = db.one("SELECT COALESCE(SUM(size), 0) AS n FROM sh_files WHERE user_id = ?", (u["id"],))["n"]
    if used + len(raw) > 400 * 1024 * 1024:
        raise ApiError(413, "Du har brugt din plads til billeder (400 MB).", "quota")
    fid = secrets.token_urlsafe(18)
    db.q("INSERT INTO sh_files(id, user_id, mime, size, data, created_at) VALUES(?,?,?,?,?,?)", (fid, u["id"], mime, len(raw), raw, db.now()))
    return 201, {"url": f"/api/sh/files/{fid}", "id": fid}


def get_file(req, params):
    f = db.one("SELECT mime, data FROM sh_files WHERE id = ?", (params["fid"],)) if TOKEN_RE.match(params["fid"] or "") else None
    if not f:
        raise ApiError(404, "Billedet findes ikke.", "not_found")
    return 200, bytes(f["data"]), {"Content-Type": f["mime"], "Cache-Control": "public, max-age=604800, immutable",
                                   "Content-Security-Policy": "default-src 'none'; sandbox", "X-Content-Type-Options": "nosniff"}


ROUTES = [
    ("POST", r"/api/sh/files", upload),
    ("GET", r"/api/sh/files/(?P<fid>[A-Za-z0-9_-]+)", get_file),
    ("GET", r"/api/sh/doc/(?P<id>d[0-9a-f]{12})", get_doc),
    ("PATCH", r"/api/sh/doc/(?P<id>d[0-9a-f]{12})", update_doc),
    ("DELETE", r"/api/sh/doc/(?P<id>d[0-9a-f]{12})", delete_doc),
    ("POST", r"/api/sh/doc/(?P<id>d[0-9a-f]{12})/join", join_doc),
    ("POST", r"/api/sh/doc/(?P<id>d[0-9a-f]{12})/entries", add_entry),
    ("PATCH", r"/api/sh/entry/(?P<eid>\d+)", edit_entry),
    ("DELETE", r"/api/sh/entry/(?P<eid>\d+)", delete_entry),
    ("GET", r"/api/pub/(?P<token>[A-Za-z0-9_-]+)", pub_get),
    ("POST", r"/api/pub/(?P<token>[A-Za-z0-9_-]+)/entries", pub_add),
    ("GET", r"/api/sh/(?P<app>[a-z]+)", list_docs),
    ("POST", r"/api/sh/(?P<app>[a-z]+)", create_doc),
]


def install(api_module):
    if not getattr(api_module, "_shared_installed", False):
        api_module.COMPILED.extend((m, re.compile("^" + p + "$"), h) for m, p, h in ROUTES)
        api_module._shared_installed = True
