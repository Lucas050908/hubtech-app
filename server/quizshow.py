"""Quizshow: a live quiz on a big screen. The host shows the questions; everyone answers on their phone with a PIN.

Players don't need an account (a name is enough), so the whole class can join. Everyone polls
GET /api/qs/<pin> about once a second – that works without a live connection and for guests.
The server keeps the time: answers after the deadline don't count, and fast right answers give more points.
Rooms live in memory for at most three hours.
"""
import re
import secrets
import threading
import time

from .api import ApiError, require_user

MAX_PLAYERS = 200
MAX_Q = 60
ROOM_TTL = 3 * 3600
_rooms = {}
_lock = threading.Lock()
_join_hits = {}


def _s(v, n):
    return str(v or "").strip()[:n]


def _clean_quiz(q):
    if not isinstance(q, dict):
        raise ApiError(400, "Ugyldig quiz.", "invalid")
    qs = []
    for x in (q.get("questions") or [])[:MAX_Q]:
        opts = [_s(o, 80) for o in (x.get("options") or [])][:4]
        if not _s(x.get("q"), 200) or len([o for o in opts if o]) < 2:
            continue
        opts = [o for o in opts if o]
        c = x.get("correct")
        correct = sorted({int(i) for i in (c if isinstance(c, list) else [c]) if str(i).lstrip("-").isdigit() and 0 <= int(i) < len(opts)})
        if not correct:
            continue
        t = x.get("time")
        qs.append({"q": _s(x.get("q"), 200), "options": opts, "correct": correct, "time": t if t in (10, 20, 30, 60) else 20, "image": _s(x.get("image"), 300)})
    if not qs:
        raise ApiError(400, "Quizzen skal have mindst ét spørgsmål med svar.", "invalid")
    return {"title": _s(q.get("title"), 100) or "Quiz", "questions": qs}


def _sweep():
    now = time.time()
    for pin in [p for p, r in _rooms.items() if now - r["created"] > ROOM_TTL or now - r["touched"] > 1800]:
        _rooms.pop(pin, None)


def _room(pin):
    r = _rooms.get(str(pin))
    if not r:
        raise ApiError(404, "Der er ingen quiz med den PIN-kode.", "not_found")
    r["touched"] = time.time()
    _tick(r)
    return r


def _tick(r):
    """Move on by itself when the time is up or everyone has answered."""
    if r["phase"] == "question":
        q = r["quiz"]["questions"][r["qi"]]
        answered = sum(1 for p in r["players"].values() if r["qi"] in p["answers"])
        if time.time() >= r["deadline"] or (r["players"] and answered >= len(r["players"])):
            r["phase"] = "reveal"
            r["ver"] += 1
            for p in r["players"].values():    # streaks
                a = p["answers"].get(r["qi"])
                p["streak"] = p["streak"] + 1 if a and a["ok"] else 0
            r["_counts"] = [sum(1 for p in r["players"].values() if p["answers"].get(r["qi"], {}).get("choice") == i) for i in range(len(q["options"]))]


def _board(r, n=10):
    ps = sorted(r["players"].values(), key=lambda p: (-p["score"], p["joined"]))
    return [{"name": p["name"], "score": p["score"], "streak": p["streak"], "id": p["pid"]} for p in ps[:n]], ps


def _state(r, viewer=None, host=False):
    qn = len(r["quiz"]["questions"])
    out = {"pin": r["pin"], "title": r["quiz"]["title"], "phase": r["phase"], "qi": r["qi"], "qn": qn, "ver": r["ver"],
           "players": len(r["players"]), "now": time.time()}
    if r["phase"] in ("question", "reveal"):
        q = r["quiz"]["questions"][r["qi"]]
        out["question"] = {"q": q["q"], "options": q["options"], "time": q["time"], "image": q["image"], "multi": len(q["correct"]) > 1}
        out["deadline"] = r["deadline"]
        out["answered"] = sum(1 for p in r["players"].values() if r["qi"] in p["answers"])
        if r["phase"] == "reveal":
            out["correct"] = q["correct"]
            out["counts"] = r.get("_counts", [])
    top, ordered = _board(r)
    if r["phase"] in ("reveal", "board", "end") or host:
        out["board"] = top
    if host:
        out["names"] = [p["name"] for p in sorted(r["players"].values(), key=lambda p: p["joined"])][:MAX_PLAYERS]
    if viewer:
        p = r["players"].get(viewer)
        if p:
            a = p["answers"].get(r["qi"]) if r["phase"] in ("question", "reveal") else None
            out["me"] = {"name": p["name"], "score": p["score"], "streak": p["streak"], "rank": ordered.index(p) + 1,
                         "answered": a is not None, "choice": a["choice"] if a else None}
            if r["phase"] == "reveal" and a:
                out["me"]["ok"], out["me"]["got"] = a["ok"], a["points"]
    return out


def create(req, _):
    u = require_user(req)
    b = req.json()
    quiz = _clean_quiz(b.get("quiz"))
    with _lock:
        _sweep()
        if sum(1 for r in _rooms.values() if r["host"] == u["id"]) >= 3:
            for pin in [p for p, r in _rooms.items() if r["host"] == u["id"]][:1]:
                _rooms.pop(pin, None)
        pin = None
        for _ in range(50):
            p = f"{secrets.randbelow(900000) + 100000}"
            if p not in _rooms:
                pin = p
                break
        if not pin:
            raise ApiError(503, "Prøv igen om lidt.", "busy")
        r = {"pin": pin, "host": u["id"], "quiz": quiz, "phase": "lobby", "qi": -1, "deadline": 0, "players": {}, "ver": 0,
             "created": time.time(), "touched": time.time()}
        _rooms[pin] = r
        return 201, _state(r, host=True)


def get(req, params):
    with _lock:
        r = _room(params["pin"])
        host = bool(req.user) and req.user["id"] == r["host"]
        pid = (req.query.get("p") or [None])[0]
        return 200, _state(r, viewer=pid if pid in r["players"] else None, host=host)


def join(req, params):
    ip = getattr(req, "visitor_ip", "x")
    now = time.time()
    with _lock:
        hits = [t for t in _join_hits.get(ip, []) if now - t < 300]
        if len(hits) >= 40:
            raise ApiError(429, "For mange forsøg. Vent lidt.", "rate_limited")
        _join_hits[ip] = hits + [now]
        if len(_join_hits) > 20000:
            _join_hits.clear()
        r = _room(params["pin"])
        b = req.json()
        name = _s(b.get("name"), 24) or (req.user["display_name"][:24] if req.user else "")
        name = re.sub(r"\s+", " ", name)
        if not name:
            raise ApiError(400, "Skriv et navn.", "missing")
        old = b.get("p")
        if old in r["players"]:
            return 200, {"p": old, **_state(r, viewer=old)}
        if r["phase"] == "end":
            raise ApiError(409, "Quizzen er slut.", "ended")
        if len(r["players"]) >= MAX_PLAYERS:
            raise ApiError(409, "Der er ikke plads til flere.", "full")
        if any(p["name"].lower() == name.lower() for p in r["players"].values()):
            raise ApiError(409, "Det navn er taget – vælg et andet.", "taken")
        pid = secrets.token_urlsafe(12)
        r["players"][pid] = {"pid": pid, "name": name, "score": 0, "streak": 0, "answers": {}, "joined": now, "uid": req.user["id"] if req.user else None}
        r["ver"] += 1
        return 200, {"p": pid, **_state(r, viewer=pid)}


def answer(req, params):
    with _lock:
        r = _room(params["pin"])
        b = req.json()
        p = r["players"].get(b.get("p"))
        if not p:
            raise ApiError(403, "Du er ikke med i quizzen.", "forbidden")
        if r["phase"] != "question":
            raise ApiError(409, "Tiden er gået.", "late")
        if r["qi"] in p["answers"]:
            raise ApiError(409, "Du har allerede svaret.", "answered")
        q = r["quiz"]["questions"][r["qi"]]
        c = b.get("choice")
        if not isinstance(c, int) or not 0 <= c < len(q["options"]):
            raise ApiError(400, "Vælg et svar.", "invalid")
        left = max(0.0, r["deadline"] - time.time())
        ok = c in q["correct"]
        pts = int(round(500 + 500 * left / q["time"])) if ok else 0
        if ok and p["streak"] >= 2:
            pts += min(300, 100 * (p["streak"] - 1))       # a bonus for answering right several times in a row
        p["answers"][r["qi"]] = {"choice": c, "ok": ok, "points": pts}
        p["score"] += pts
        r["ver"] += 1
        _tick(r)
        return 200, _state(r, viewer=p["pid"])


def host(req, params):
    u = require_user(req)
    with _lock:
        r = _room(params["pin"])
        if r["host"] != u["id"]:
            raise ApiError(403, "Kun værten kan styre quizzen.", "forbidden")
        a = (req.json() or {}).get("action")
        qn = len(r["quiz"]["questions"])
        if a == "next":
            if r["phase"] in ("lobby", "board") or (r["phase"] == "reveal" and r["qi"] + 1 < qn and (req.json() or {}).get("skipBoard")):
                if r["qi"] + 1 >= qn:
                    r["phase"] = "end"
                else:
                    r["qi"] += 1
                    r["phase"] = "question"
                    r["deadline"] = time.time() + r["quiz"]["questions"][r["qi"]]["time"] + 0.5
            elif r["phase"] == "reveal":
                r["phase"] = "board" if r["qi"] + 1 < qn else "end"
            elif r["phase"] == "question":
                r["deadline"] = time.time()
                _tick(r)
        elif a == "end":
            r["phase"] = "end"
        elif a == "kick":
            name = _s((req.json() or {}).get("name"), 24)
            for pid, p in list(r["players"].items()):
                if p["name"] == name:
                    r["players"].pop(pid)
        elif a == "close":
            _rooms.pop(r["pin"], None)
            return 200, {"ok": True}
        else:
            raise ApiError(400, "Ukendt handling.", "invalid")
        r["ver"] += 1
        return 200, _state(r, host=True)


ROUTES = [
    ("POST", r"/api/qs", create),
    ("GET", r"/api/qs/(?P<pin>\d{6})", get),
    ("POST", r"/api/qs/(?P<pin>\d{6})/join", join),
    ("POST", r"/api/qs/(?P<pin>\d{6})/answer", answer),
    ("POST", r"/api/qs/(?P<pin>\d{6})/host", host),
]


def install(api_module):
    if not getattr(api_module, "_quizshow_installed", False):
        api_module.COMPILED.extend((m, re.compile("^" + p + "$"), h) for m, p, h in ROUTES)
        api_module._quizshow_installed = True
