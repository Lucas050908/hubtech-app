"""Spil sammen – play against the other people on this HUBTECH, plus leaderboards.

* Game rooms (in memory, best effort): Fire på stribe and a speed-typing race. Invites, moves and progress go out
  over the live bus, so the other player sees them at once. The server checks every move.
* Fart-tast: the typing time is measured by the server (start → finish) and the finished text must match,
  so the leaderboard can't be filled with made-up numbers.
* Leaderboards for the other games (Snake, 2048, Minestryger, Sudoku) keep each person's best result.
"""
import random
import re
import secrets
import threading
import time

from . import db, live
from .api import ApiError, require_user

# ── texts for Fart-tast (plain Danish, no rare symbols) ──
TEXTS = [
    "En printer, der står offline, er ofte bare tændt for sent. Genstart den, vent til den er klar, og prøv så igen.",
    "Husk at tage backup af dine billeder. En harddisk kan gå i stykker uden varsel, og så er minderne væk.",
    "Det hurtigste internet hjælper ikke, hvis routeren står inde i et skab bag tykke vægge og en masse ledninger.",
    "Når computeren er langsom, så åbn Jobliste og se, hvilket program der bruger mest processor og hukommelse.",
    "En god adgangskode er lang. Fem tilfældige ord er nemmere at huske og sværere at gætte end et kort ord med tal.",
    "Klik aldrig på et link i en mail, der siger, at din konto er spærret. Åbn i stedet appen eller hjemmesiden selv.",
    "Om vinteren er det mørkt, når man tager hjem fra skole, så husk lygter på cyklen og en refleks på jakken.",
    "Kaffe og computere er ikke gode venner. Hvis du spilder på tastaturet, så sluk med det samme og vend det om.",
    "Et netværkskabel er næsten altid hurtigere og mere stabilt end trådløst internet, især når mange er online.",
    "Opdateringer lukker sikkerhedshuller. Derfor er det en god idé at lade computeren opdatere, selv om det tager tid.",
    "Den bedste måde at lære at skrive hurtigt på er at øve lidt hver dag og kigge på skærmen i stedet for tasterne.",
    "Hunden løb over marken efter bolden, mens solen gik ned bag træerne, og alle børnene grinede højt.",
    "Hvis skærmen er sort, så tjek først, om kablet sidder fast i begge ender, og om skærmen er tændt.",
    "Et godt svar til en kunde er kort og venligt. Forklar hvad der var galt, hvad du gjorde, og hvad kunden skal gøre nu.",
    "Rens printhovedet, hvis der mangler striber i udskriften. Det bruger lidt blæk, men det løser ofte problemet.",
    "Mange tror, at mere RAM altid gør computeren hurtigere, men en ny SSD gør tit en større forskel på en gammel maskine.",
    "I weekenden bagte vi boller, gik en lang tur ved stranden og spillede brætspil, til det blev sent.",
    "Totrinsbekræftelse betyder, at en tyv ikke kan logge ind med din kode alene. Slå det til på din mail i dag.",
    "Hvis du glemmer at gemme dit dokument, så kig efter automatisk gendannelse, næste gang programmet åbner.",
    "Lyden kommer kun fra den ene side? Prøv et andet stik, et andet sæt hovedtelefoner, og tjek balancen i lydindstillingerne.",
]

_lock = threading.RLock()
_rooms = {}            # id -> room
_typing_runs = {}      # token -> {uid, text, start}
ROOM_TTL = 3600
GAMES = {"connect4": "Fire på stribe", "typing": "Fart-tast", "ttt": "Kryds og bolle"}
APP_OF = {"connect4": "connect4", "typing": "typerace", "ttt": "tictactoe"}
DUEL = {"connect4", "ttt"}          # two players, taking turns
# leaderboard games: id -> (label, higher is better, max sane value)
BOARDS = {
    "typing": ("Fart-tast", True, 250),
    "aim": ("Aim-træner", True, 2000),
    "flags": ("Gæt flaget", True, 300),
    "snake": ("Snake", True, 400),
    "game2048": ("2048", True, 1_000_000),
    "mines-easy": ("Minestryger · let", False, 99_999), "mines-medium": ("Minestryger · middel", False, 99_999), "mines-hard": ("Minestryger · svær", False, 99_999),
    "sudoku-easy": ("Sudoku · let", False, 99_999), "sudoku-medium": ("Sudoku · middel", False, 99_999), "sudoku-hard": ("Sudoku · svær", False, 99_999),
}
MIN_SECS = {"mines-easy": 1, "mines-medium": 5, "mines-hard": 15, "sudoku-easy": 30, "sudoku-medium": 45, "sudoku-hard": 60}


def _cards(ids):
    ids = sorted({int(i) for i in ids if i})
    if not ids:
        return {}
    rows = db.all_rows(f"SELECT id, username, display_name, avatar FROM users WHERE id IN ({','.join('?' * len(ids))})", ids)
    return {r["id"]: {"id": r["id"], "username": r["username"], "name": r["display_name"], "avatar": r["avatar"], "online": live.online(r["id"], 60)} for r in rows}


def _blocked(a, b):
    try:
        from .social import _blocked_between
        return _blocked_between(a, b)
    except Exception:
        return False


def players(req, _):
    """Everyone else on this HUBTECH you can invite."""
    u = require_user(req)
    rows = db.all_rows("SELECT id FROM users WHERE id != ? ORDER BY display_name COLLATE NOCASE", (u["id"],))
    cards = _cards([r["id"] for r in rows if not _blocked(u["id"], r["id"])])
    out = sorted(cards.values(), key=lambda c: (not c["online"], c["name"].lower()))
    return 200, {"players": out}


# ── rooms ──
def _sweep():
    t = time.time()
    for rid in [k for k, r in _rooms.items() if t - r["touched"] > ROOM_TTL or (r["status"] in ("invite", "done") and t - r["touched"] > 600)]:
        _rooms.pop(rid, None)


def _public(r):
    cards = _cards(set(r["players"]) | set(r["invited"]))
    pub = {k: r[k] for k in ("id", "game", "status", "host", "created", "version")}
    pub["players"] = [cards.get(p) for p in r["players"] if cards.get(p)]
    pub["invited"] = [cards.get(p) for p in r["invited"] if cards.get(p)]
    pub["state"] = r["state"]
    pub["watchers"] = len(r.get("watchers", ()))
    return pub


def _push(r):
    r["version"] += 1
    r["touched"] = time.time()
    live.publish(set(r["players"]) | set(r["invited"]) | set(r.get("watchers", ())), {"type": "game", "room": _public(r)})


def _get(rid, uid, member=True):
    r = _rooms.get(rid)
    if not r or (member and uid not in r["players"] and uid not in r["invited"] and uid not in r.get("watchers", ())):
        raise ApiError(404, "Spillet findes ikke længere.", "not_found")
    return r


def _c4_new():
    return {"board": [[0] * 7 for _ in range(6)], "turn": 0, "winner": None, "cells": [], "last": None, "score": [0, 0]}


def _c4_winner(b):
    for r in range(6):
        for c in range(7):
            p = b[r][c]
            if not p:
                continue
            for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):
                cells = [(r + dr * k, c + dc * k) for k in range(4)]
                if all(0 <= rr < 6 and 0 <= cc < 7 and b[rr][cc] == p for rr, cc in cells):
                    return p, cells
    return None, []


TTT_LINES = [(0, 1, 2), (3, 4, 5), (6, 7, 8), (0, 3, 6), (1, 4, 7), (2, 5, 8), (0, 4, 8), (2, 4, 6)]


def _ttt_winner(b):
    for a, c, d in TTT_LINES:
        if b[a] and b[a] == b[c] == b[d]:
            return b[a], [a, c, d]
    return None, []


def _new_state(game):
    if game == "connect4":
        return _c4_new()
    if game == "ttt":
        return {"board": [0] * 9, "turn": 0, "winner": None, "cells": [], "last": None, "score": [0, 0]}
    return _typing_new()


def _typing_new():
    return {"text": random.choice(TEXTS), "start": None, "progress": {}}


def create(req, _):
    u = require_user(req)
    b = req.json()
    game = b.get("game")
    if game not in GAMES:
        raise ApiError(400, "Ukendt spil.", "invalid")
    invite = [int(x) for x in (b.get("invite") or []) if str(x).isdigit()][:7 if game == "typing" else 1]
    invite = [x for x in invite if x != u["id"] and db.one("SELECT 1 FROM users WHERE id = ?", (x,)) and not _blocked(u["id"], x)]
    if not invite:
        raise ApiError(400, "Vælg hvem du vil spille med.", "invalid")
    with _lock:
        _sweep()
        if sum(1 for r in _rooms.values() if r["host"] == u["id"] and r["status"] != "done") >= 10:
            raise ApiError(429, "Du har for mange åbne spil. Afslut nogle først.", "too_many")
        rid = "g" + secrets.token_hex(6)
        r = {"id": rid, "game": game, "host": u["id"], "players": [u["id"]], "invited": invite, "status": "invite", "created": int(time.time() * 1000),
             "touched": time.time(), "version": 0, "state": _new_state(game)}
        _rooms[rid] = r
        _push(r)
        pub = _public(r)
    for x in invite:   # a notification for people who aren't looking at HUBTECH right now
        live.publish([x], {"type": "notify", "kind": "game", "title": f"{u['display_name']} vil spille {GAMES[game]}", "text": "Tryk for at være med.", "path": f"/apps/{APP_OF[game]}/online/{rid}"})
    return 201, {"room": pub}


def mine(req, _):
    u = require_user(req)
    with _lock:
        _sweep()
        rooms = [_public(r) for r in _rooms.values() if u["id"] in r["players"] or u["id"] in r["invited"]]
    return 200, {"rooms": sorted(rooms, key=lambda r: -r["created"])}


def get_room(req, params):
    u = require_user(req)
    with _lock:
        return 200, {"room": _public(_get(params["id"], u["id"]))}


def join(req, params):
    u = require_user(req)
    with _lock:
        r = _get(params["id"], u["id"])
        if u["id"] in r["players"]:
            return 200, {"room": _public(r)}
        if r["status"] == "done" or (r["game"] in DUEL and len(r["players"]) >= 2) or (r["game"] == "typing" and r["state"]["start"]):
            raise ApiError(409, "Spillet er allerede i gang.", "started")
        r["invited"].remove(u["id"])
        r["players"].append(u["id"])
        if r["game"] in DUEL:
            r["status"] = "playing"
            random.shuffle(r["players"])     # who starts is random; players[0] is red and starts
        else:
            r["status"] = "lobby"
        _push(r)
        return 200, {"room": _public(r)}


def leave(req, params):
    u = require_user(req)
    with _lock:
        r = _get(params["id"], u["id"])
        if u["id"] in r["invited"]:
            r["invited"].remove(u["id"])
        if u["id"] in r["players"]:
            if r["game"] in DUEL and r["status"] == "playing" and len(r["players"]) == 2:
                # giving up: the other one wins; both stay in the room so the result can be seen
                st = r["state"]
                other = 1 - r["players"].index(u["id"])
                st["winner"], st["gaveUp"] = other + 1, u["id"]
                st["score"][other] += 1
                r["status"] = "done"
                _push(r)
                return 200, {"ok": True}
            r["players"].remove(u["id"])
        live.publish([u["id"]], {"type": "game", "room": {**_public(r), "left": True}})
        if not r["players"]:
            _rooms.pop(r["id"], None)
            live.publish(r["invited"], {"type": "game-gone", "id": r["id"]})
            return 200, {"ok": True}
        if r["host"] == u["id"]:
            r["host"] = r["players"][0]
        if r["game"] in DUEL and len(r["players"]) < 2 and not r["invited"] and r["status"] == "invite":
            r["status"] = "done"
        _push(r)
    return 200, {"ok": True}


def move(req, params):
    """Fire på stribe: {col}. Kryds og bolle: {cell} 0–8."""
    u = require_user(req)
    b = req.json()
    with _lock:
        r = _get(params["id"], u["id"])
        st = r["state"]
        if r["game"] not in DUEL or r["status"] != "playing":
            raise ApiError(409, "Spillet er ikke i gang.", "not_playing")
        if r["players"][st["turn"]] != u["id"]:
            raise ApiError(409, "Det er ikke din tur.", "not_your_turn")
        piece = st["turn"] + 1
        if r["game"] == "connect4":
            col = b.get("col")
            if not isinstance(col, int) or not 0 <= col < 7 or st["board"][0][col]:
                raise ApiError(400, "Den kolonne er fuld.", "invalid")
            row = max(rr for rr in range(6) if not st["board"][rr][col])
            st["board"][row][col] = piece
            st["last"] = [row, col]
            w, cells = _c4_winner(st["board"])
            full = all(st["board"][0][c] for c in range(7))
        else:
            cell = b.get("cell")
            if not isinstance(cell, int) or not 0 <= cell < 9 or st["board"][cell]:
                raise ApiError(400, "Feltet er optaget.", "invalid")
            st["board"][cell] = piece
            st["last"] = cell
            w, cells = _ttt_winner(st["board"])
            full = all(st["board"])
        if w:
            st["winner"], st["cells"] = w, cells
            st["score"][w - 1] += 1
            r["status"] = "done"
        elif full:
            st["winner"] = 0
            r["status"] = "done"
        else:
            st["turn"] = 1 - st["turn"]
        _push(r)
        return 200, {"room": _public(r)}


def rematch(req, params):
    u = require_user(req)
    with _lock:
        r = _get(params["id"], u["id"])
        if u["id"] not in r["players"]:
            raise ApiError(403, "Du er ikke med i spillet.", "forbidden")
        if r["game"] in DUEL:
            if len(r["players"]) < 2:
                raise ApiError(409, "Din modstander har forladt spillet.", "alone")
            score = r["state"]["score"]
            r["players"].reverse()           # the other one starts this time
            r["state"] = {**_new_state(r["game"]), "score": score[::-1]}
            r["status"] = "playing"
        else:
            r["state"] = _typing_new()
            r["status"] = "lobby"
        _push(r)
        return 200, {"room": _public(r)}


def race_start(req, params):
    u = require_user(req)
    with _lock:
        r = _get(params["id"], u["id"])
        if r["game"] != "typing" or r["host"] != u["id"]:
            raise ApiError(403, "Kun den, der startede spillet, kan sætte løbet i gang.", "forbidden")
        if len(r["players"]) < 2:
            raise ApiError(409, "Vent på, at mindst én er med.", "alone")
        if r["state"]["start"]:
            return 200, {"room": _public(r)}
        r["state"]["start"] = int((time.time() + 4) * 1000)      # 3-2-1 countdown on every screen
        r["invited"] = []
        r["status"] = "playing"
        _push(r)
        return 200, {"room": _public(r)}


def race_progress(req, params):
    """Typing race: how far you are. The server measures the time and checks the finished text."""
    u = require_user(req)
    b = req.json()
    with _lock:
        r = _get(params["id"], u["id"])
        st = r["state"]
        if r["game"] != "typing" or not st["start"] or u["id"] not in r["players"]:
            raise ApiError(409, "Løbet er ikke i gang.", "not_playing")
        now = int(time.time() * 1000)
        if now < st["start"]:
            raise ApiError(409, "Vent på nedtællingen.", "early")
        me = st["progress"].setdefault(str(u["id"]), {"pos": 0, "done": None, "wpm": 0, "errors": 0})
        if me["done"]:
            return 200, {"ok": True}
        text = st["text"]
        typed = str(b.get("typed") or "")[:len(text) + 5]
        pos = 0
        while pos < min(len(typed), len(text)) and typed[pos] == text[pos]:
            pos += 1
        me["pos"] = max(me["pos"], pos)
        me["errors"] = max(0, min(int(b.get("errors") or 0), 999))
        secs = max(0.5, (now - st["start"]) / 1000)
        me["wpm"] = round(me["pos"] / 5 / (secs / 60))
        if typed == text:
            me["done"] = now - st["start"]
            me["wpm"] = round(len(text) / 5 / (secs / 60))
            me["place"] = 1 + sum(1 for k, p in st["progress"].items() if p.get("done") and k != str(u["id"]))
            _record(u["id"], "typing", me["wpm"])
        if all(st["progress"].get(str(p), {}).get("done") for p in r["players"]) or now - st["start"] > 180_000:
            r["status"] = "done"
        _push(r)
    return 200, {"ok": True}


# ── Fart-tast alone: server-timed run ──
def typing_start(req, _):
    u = require_user(req)
    tok = secrets.token_hex(8)
    text = random.choice(TEXTS)
    with _lock:
        for k in [k for k, v in _typing_runs.items() if time.time() - v["start"] > 900 or v["uid"] == u["id"]]:
            _typing_runs.pop(k, None)
        _typing_runs[tok] = {"uid": u["id"], "text": text, "start": None}
    return 200, {"token": tok, "text": text}


def typing_go(req, params):
    """The first key press – the clock starts here."""
    u = require_user(req)
    with _lock:
        run = _typing_runs.get(params["token"])
        if not run or run["uid"] != u["id"]:
            raise ApiError(404, "Prøv igen.", "not_found")
        run["start"] = run["start"] or time.time()
    return 200, {"ok": True}


def typing_finish(req, params):
    u = require_user(req)
    b = req.json()
    with _lock:
        run = _typing_runs.pop(params["token"], None)
    if not run or run["uid"] != u["id"] or not run["start"]:
        raise ApiError(404, "Prøv igen.", "not_found")
    if str(b.get("typed") or "") != run["text"]:
        raise ApiError(400, "Teksten passer ikke.", "mismatch")
    secs = max(1.0, time.time() - run["start"])
    wpm = round(len(run["text"]) / 5 / (secs / 60))
    errors = max(0, min(int(b.get("errors") or 0), 999))
    acc = round(100 * len(run["text"]) / (len(run["text"]) + errors))
    # mistakes cost: under 90 % accuracy doesn't count for the list
    counted = acc >= 90 and wpm <= BOARDS["typing"][2]
    rec = _record(u["id"], "typing", wpm) if counted else {"best": None, "record": False}
    why = None if counted else ("Under 90 % rigtige tæller ikke" if acc < 90 else "Urealistisk hurtigt – tæller ikke")
    return 200, {"wpm": wpm, "secs": round(secs, 1), "accuracy": acc, "counted": counted, "why": why, **rec, "board": _board("typing", u["id"])}


# ── leaderboards ──
def _record(uid, game, score):
    label, higher, cap = BOARDS[game]
    if score > cap:          # faster than any human: pasted or scripted – not on the list
        return {"best": None, "record": False}
    with _lock:
        all_ = db.get_server_setting("game_scores", {}) or {}
        g = all_.setdefault(game, {})
        old = g.get(str(uid))
        better = old is None or (score > old["score"] if higher else score < old["score"])
        if better:
            g[str(uid)] = {"score": score, "at": int(time.time() * 1000)}
            db.set_server_setting("game_scores", all_)
    return {"best": g[str(uid)]["score"], "record": better}


def _board(game, me):
    label, higher, _ = BOARDS[game]
    g = (db.get_server_setting("game_scores", {}) or {}).get(game, {})
    cards = _cards([int(k) for k in g])
    rows = sorted(((v["score"], v["at"], int(k)) for k, v in g.items() if int(k) in cards), key=lambda x: (-x[0] if higher else x[0], x[1]))
    out = []
    for i, (score, at, uid) in enumerate(rows):
        if i < 20 or uid == me:
            out.append({"place": i + 1, "score": score, "at": at, "user": cards[uid], "me": uid == me})
    return {"game": game, "label": label, "higher": higher, "rows": out, "players": len(rows)}


def board(req, params):
    u = require_user(req)
    if params["game"] not in BOARDS:
        raise ApiError(404, "Ukendt spil.", "not_found")
    return 200, _board(params["game"], u["id"])


def boards(req, _):
    u = require_user(req)
    return 200, {"boards": [_board(g, u["id"]) for g in BOARDS]}


def submit(req, params):
    """Snake, 2048, Minestryger and Sudoku report their own result (time in seconds or points)."""
    u = require_user(req)
    game = params["game"]
    if game not in BOARDS or game == "typing":
        raise ApiError(400, "Ukendt spil.", "invalid")
    try:
        score = int(req.json().get("score"))
    except (TypeError, ValueError):
        raise ApiError(400, "Ugyldigt resultat.", "invalid")
    _, _, cap = BOARDS[game]
    if score < MIN_SECS.get(game, 0) or score > cap:
        raise ApiError(400, "Ugyldigt resultat.", "invalid")
    rec = _record(u["id"], game, score)
    return 200, {**rec, "board": _board(game, u["id"])}


# ── watching other people's games ──
def live_rooms(req, _):
    """Games going on right now that you aren't in – you can watch them."""
    u = require_user(req)
    with _lock:
        _sweep()
        rooms = [r for r in _rooms.values() if r["status"] in ("playing", "lobby") and u["id"] not in r["players"]
                 and not any(_blocked(u["id"], p) for p in r["players"])]
        out = [_public(r) for r in sorted(rooms, key=lambda r: -r["touched"])[:20]]
    return 200, {"rooms": out}


def watch(req, params):
    u = require_user(req)
    with _lock:
        r = _get(params["id"], u["id"], member=False)
        if u["id"] in r["players"]:
            return 200, {"room": _public(r)}
        if any(_blocked(u["id"], p) for p in r["players"]):
            raise ApiError(404, "Spillet findes ikke længere.", "not_found")
        w = r.setdefault("watchers", [])
        if u["id"] not in w:
            if len(w) >= 30:
                raise ApiError(409, "Der er allerede mange, der ser med.", "full")
            w.append(u["id"])
            _push(r)
        return 200, {"room": _public(r)}


def unwatch(req, params):
    u = require_user(req)
    with _lock:
        r = _rooms.get(params["id"])
        if r and u["id"] in r.get("watchers", []):
            r["watchers"].remove(u["id"])
            _push(r)
    return 200, {"ok": True}


ROUTES = [
    ("GET", r"/api/games/players", players),
    ("GET", r"/api/games/rooms", mine),
    ("POST", r"/api/games/rooms", create),
    ("GET", r"/api/games/rooms/(?P<id>g[0-9a-f]{12})", get_room),
    ("GET", r"/api/games/live", live_rooms),
    ("POST", r"/api/games/rooms/(?P<id>g[0-9a-f]{12})/watch", watch),
    ("POST", r"/api/games/rooms/(?P<id>g[0-9a-f]{12})/unwatch", unwatch),
    ("POST", r"/api/games/rooms/(?P<id>g[0-9a-f]{12})/join", join),
    ("POST", r"/api/games/rooms/(?P<id>g[0-9a-f]{12})/leave", leave),
    ("POST", r"/api/games/rooms/(?P<id>g[0-9a-f]{12})/move", move),
    ("POST", r"/api/games/rooms/(?P<id>g[0-9a-f]{12})/rematch", rematch),
    ("POST", r"/api/games/rooms/(?P<id>g[0-9a-f]{12})/start", race_start),
    ("POST", r"/api/games/rooms/(?P<id>g[0-9a-f]{12})/progress", race_progress),
    ("POST", r"/api/games/typing", typing_start),
    ("POST", r"/api/games/typing/(?P<token>[0-9a-f]{16})/go", typing_go),
    ("POST", r"/api/games/typing/(?P<token>[0-9a-f]{16})/finish", typing_finish),
    ("GET", r"/api/games/boards", boards),
    ("GET", r"/api/games/boards/(?P<game>[a-z0-9-]{2,20})", board),
    ("POST", r"/api/games/boards/(?P<game>[a-z0-9-]{2,20})", submit),
]


def install(api_module):
    if not getattr(api_module, "_games_installed", False):
        api_module.COMPILED.extend((m, re.compile("^" + p + "$"), h) for m, p, h in ROUTES)
        api_module._games_installed = True
