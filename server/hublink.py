"""Forbind HUBTECH'er: two HUBTECHs that trust each other, so people can visit the other one with their own account.

How it works:
  1. The owner of A makes an invitation code (valid 24 hours, works once). The code holds A's address, A's id and a
     random token – nothing secret about A itself.
  2. The owner of B pastes the code. B makes a fresh shared secret and sends it to A together with the token
     (POST A/api/hublink/accept). A checks the token and stores B; B stores A. From now on both know the secret.
  3. A person on A clicks "Besøg B": A signs a short ticket (who they are, valid two minutes, one use) with the shared
     secret and sends the browser to B (#/hub/<ticket>). B checks the signature and logs them in on a guest account of
     their own, made the first time and reused after that. Their name and avatar follow along.
Nothing else is shared between the two: data stays on each HUBTECH. Either owner can stop the connection at any time.
"""
import base64
import hashlib
import hmac
import json
import re
import secrets
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

from . import auth, db, live
from .api import ApiError, require_user, require_owner, body_str, is_https, log_activity, SYSTEM

PREFIX = "HUB1-"
TICKET_SECONDS = 120
INVITE_SECONDS = 24 * 3600


def _b64(b):
    return base64.urlsafe_b64encode(b).decode("ascii").rstrip("=")


def _unb64(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def hub_id():
    hid = db.get_server_setting("hub_id", None)
    if not hid:
        hid = secrets.token_hex(8)
        db.set_server_setting("hub_id", hid)
    return hid


def hub_name():
    name = db.get_server_setting("hub_name", None)
    if name:
        return name
    owner = db.one("SELECT display_name FROM users WHERE role = 'owner' ORDER BY id LIMIT 1")
    return f"{owner['display_name'].split(' ')[0]}s HUBTECH" if owner else "HUBTECH"


def _clean_url(u):
    u = str(u or "").strip().rstrip("/")
    p = urlparse(u)
    if p.scheme not in ("http", "https") or not p.hostname or p.username or p.password:
        return None
    return f"{p.scheme}://{p.netloc}"


def my_urls(req):
    """Where the other HUBTECH can reach this one – the public Tailscale address first, then the local network."""
    from .api import _tailscale, _lan_addresses
    out = []
    try:
        ts = _tailscale()
        if ts.get("url") and ts.get("funnel"):
            out.append({"url": ts["url"], "kind": "internet", "label": "Over internettet (Tailscale)"})
        elif ts.get("url") and ts.get("running"):
            out.append({"url": ts["url"], "kind": "tailnet", "label": "Over Tailscale"})
    except Exception:
        pass
    host = req.headers.get("Host") or ""
    origin = _clean_url(("https" if is_https(req) else "http") + "://" + host) if host else None
    port = SYSTEM.get("port")
    if origin and not re.search(r"//(127\.|localhost|\[::1\])", origin) and not any(o["url"] == origin for o in out):
        out.append({"url": origin, "kind": "this", "label": "Den adresse, du bruger nu"})
    try:
        for a in _lan_addresses():
            u = f"http://{a}:{port}"
            if not any(o["url"] == u for o in out):
                out.append({"url": u, "kind": "lan", "label": "På samme netværk (wifi)"})
    except Exception:
        pass
    return out


def _link_out(r, full=False):
    o = {"id": r["id"], "name": r["name"], "url": r["url"], "allowLogin": bool(r["allow_login"]), "createdAt": r["created_at"], "lastUsed": r["last_used"]}
    if full:
        o["visitors"] = db.one("SELECT COUNT(*) AS n FROM hub_users WHERE link_id = ?", (r["id"],))["n"]
    return o


def _sign(secret, payload):
    raw = _b64(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    sig = _b64(hmac.new(secret.encode("ascii"), raw.encode("ascii"), hashlib.sha256).digest())
    return f"{raw}.{sig}"


def _unsign(ticket):
    """Split a ticket and read its payload (not yet trusted)."""
    try:
        raw, sig = str(ticket).split(".", 1)
        return raw, sig, json.loads(_unb64(raw).decode("utf-8"))
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
        raise ApiError(400, "Linket er ugyldigt.", "invalid")


def _post(url, path, body, timeout=12):
    r = urllib.request.Request(url + path, data=json.dumps(body).encode("utf-8"), method="POST",
                               headers={"Content-Type": "application/json", "X-Requested-With": "hubtech", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read().decode("utf-8")).get("error")
        except Exception:
            msg = None
        raise ApiError(502, msg or f"Den anden HUBTECH svarede med en fejl ({e.code}).", "remote_error")
    except (urllib.error.URLError, OSError, ValueError):
        raise ApiError(502, "Kunne ikke nå den anden HUBTECH. Tjek at den er tændt, og at adressen i koden kan nås herfra (samme wifi eller Tailscale).", "unreachable")


# ── owner: invitations and the list of connections ───────────────────────
def info(req, _):
    u = require_user(req)
    rows = db.all_rows("SELECT * FROM hub_links ORDER BY name COLLATE NOCASE")
    mine = db.one("SELECT l.name, l.url FROM hub_users hu JOIN hub_links l ON l.id = hu.link_id WHERE hu.user_id = ?", (u["id"],))
    out = {"id": hub_id(), "name": hub_name(), "links": [_link_out(r, u["role"] == "owner") for r in rows], "owner": u["role"] == "owner",
           "visitorFrom": {"name": mine["name"], "url": mine["url"]} if mine else None}
    if u["role"] == "owner":
        out["urls"] = my_urls(req)
    return 200, out


def set_name(req, _):
    require_owner(req)
    name = body_str(req.json(), "name", 40, required=True)
    db.set_server_setting("hub_name", name)
    return 200, {"name": name}


def make_invite(req, _):
    require_owner(req)
    b = req.json()
    url = _clean_url(b.get("url"))
    if not url:
        raise ApiError(400, "Vælg den adresse, den anden HUBTECH skal bruge for at nå din.", "invalid", {"field": "url"})
    token = secrets.token_urlsafe(18)
    t = db.now()
    db.q("DELETE FROM hub_invites WHERE expires_at < ?", (t,))
    db.q("INSERT INTO hub_invites(token_hash, created_at, expires_at) VALUES(?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), t, t + INVITE_SECONDS))
    code = PREFIX + _b64(json.dumps({"u": url, "i": hub_id(), "n": hub_name(), "t": token}, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    return 200, {"code": code, "expiresAt": t + INVITE_SECONDS}


def read_code(code):
    code = re.sub(r"\s+", "", str(code or ""))
    m = re.search(r"HUB1-[A-Za-z0-9_-]+", code)
    if not m:
        raise ApiError(400, "Det ligner ikke en forbindelseskode. Den starter med HUB1-.", "invalid", {"field": "code"})
    try:
        d = json.loads(_unb64(m.group(0)[len(PREFIX):]).decode("utf-8"))
        url, rid, name, token = _clean_url(d.get("u")), str(d.get("i") or ""), str(d.get("n") or "HUBTECH")[:40], str(d.get("t") or "")
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError, AttributeError):
        raise ApiError(400, "Koden kunne ikke læses – kopiér den igen, helt.", "invalid", {"field": "code"})
    if not url or not re.fullmatch(r"[0-9a-f]{16}", rid) or not token:
        raise ApiError(400, "Koden kunne ikke læses – kopiér den igen, helt.", "invalid", {"field": "code"})
    return {"url": url, "id": rid, "name": name, "token": token}


def peek(req, _):
    """Show what a pasted code would connect to, before connecting."""
    require_owner(req)
    c = read_code(req.json().get("code"))
    if c["id"] == hub_id():
        raise ApiError(400, "Det er din egen kode – den skal bruges på den anden HUBTECH.", "own_code")
    known = db.one("SELECT 1 FROM hub_links WHERE remote_id = ?", (c["id"],))
    return 200, {"name": c["name"], "url": c["url"], "known": bool(known)}


def join(req, _):
    """Owner of this HUBTECH pastes the other's code: we make the secret and introduce ourselves."""
    require_owner(req)
    b = req.json()
    c = read_code(b.get("code"))
    if c["id"] == hub_id():
        raise ApiError(400, "Det er din egen kode – den skal bruges på den anden HUBTECH.", "own_code")
    my_url = _clean_url(b.get("url"))
    if not my_url:
        urls = my_urls(req)
        my_url = urls[0]["url"] if urls else None
    if not my_url:
        raise ApiError(400, "Vælg den adresse, den anden HUBTECH skal bruge for at nå din.", "invalid", {"field": "url"})
    secret = secrets.token_hex(32)
    r = _post(c["url"], "/api/hublink/accept", {"token": c["token"], "id": hub_id(), "name": hub_name(), "url": my_url, "secret": secret})
    if r.get("id") != c["id"]:
        raise ApiError(502, "Den anden HUBTECH svarede ikke som forventet.", "remote_error")
    name = str(r.get("name") or c["name"])[:40]
    _store(c["id"], name, c["url"], secret)
    return 200, {"link": _link_out(db.one("SELECT * FROM hub_links WHERE remote_id = ?", (c["id"],)), True)}


def _store(rid, name, url, secret):
    t = db.now()
    if db.one("SELECT 1 FROM hub_links WHERE remote_id = ?", (rid,)):
        db.q("UPDATE hub_links SET name = ?, url = ?, secret = ? WHERE remote_id = ?", (name, url, secret, rid))
    else:
        db.q("INSERT INTO hub_links(remote_id, name, url, secret, created_at) VALUES(?,?,?,?,?)", (rid, name, url, secret, t))


def accept(req, _):
    """Called by the other HUBTECH (no user): it shows our invitation token and hands over the shared secret."""
    key = "hublink:" + getattr(req, "visitor_ip", req.client_ip)
    wait = auth.throttled(key)
    if wait:
        raise ApiError(429, f"For mange forsøg. Prøv igen om {wait} sekunder.", "throttled")
    b = req.json()
    token, rid, url, secret = str(b.get("token") or ""), str(b.get("id") or ""), _clean_url(b.get("url")), str(b.get("secret") or "")
    name = (str(b.get("name") or "HUBTECH").strip() or "HUBTECH")[:40]
    if not re.fullmatch(r"[0-9a-f]{16}", rid) or not re.fullmatch(r"[0-9a-f]{64}", secret) or not url:
        auth.record_failure(key)
        raise ApiError(400, "Ugyldig forespørgsel.", "invalid")
    th = hashlib.sha256(token.encode()).hexdigest()
    inv = db.one("SELECT * FROM hub_invites WHERE token_hash = ?", (th,))
    if not inv or inv["used_at"] or inv["expires_at"] < db.now():
        auth.record_failure(key)
        raise ApiError(403, "Koden er brugt eller udløbet. Bed om en ny.", "bad_invite")
    if rid == hub_id():
        raise ApiError(400, "En HUBTECH kan ikke forbinde til sig selv.", "invalid")
    db.q("UPDATE hub_invites SET used_at = ? WHERE token_hash = ?", (db.now(), th))
    _store(rid, name, url, secret)
    owners = [r["id"] for r in db.all_rows("SELECT id FROM users WHERE role = 'owner'")]
    live.publish(owners, {"type": "notify", "kind": "hublink", "title": f"{name} er nu forbundet med din HUBTECH", "text": "Folk kan nu besøge hinanden med deres egen konto.", "path": "/settings?tab=hubs"})
    return 200, {"id": hub_id(), "name": hub_name()}


def update_link(req, params):
    require_owner(req)
    r = db.one("SELECT * FROM hub_links WHERE id = ?", (_int(params["lid"]),))
    if not r:
        raise ApiError(404, "Forbindelsen findes ikke.", "not_found")
    b = req.json()
    if "allowLogin" in b:
        db.q("UPDATE hub_links SET allow_login = ? WHERE id = ?", (1 if b.get("allowLogin") else 0, r["id"]))
    if b.get("name"):
        db.q("UPDATE hub_links SET name = ? WHERE id = ?", (body_str(b, "name", 40), r["id"]))
    return 200, {"link": _link_out(db.one("SELECT * FROM hub_links WHERE id = ?", (r["id"],)), True)}


def delete_link(req, params):
    require_owner(req)
    r = db.one("SELECT * FROM hub_links WHERE id = ?", (_int(params["lid"]),))
    if not r:
        raise ApiError(404, "Forbindelsen findes ikke.", "not_found")
    # guests from there can't log in any more; their accounts stay (with their things) until the owner removes them
    for row in db.all_rows("SELECT user_id FROM hub_users WHERE link_id = ?", (r["id"],)):
        auth.destroy_user_sessions(row["user_id"])
    db.q("DELETE FROM hub_links WHERE id = ?", (r["id"],))
    return 200, {"ok": True}


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return -1


# ── visiting: a signed ticket from here to there ─────────────────────────
def go(req, params):
    """A person here wants to visit the other HUBTECH: make a ticket and the address to send the browser to."""
    u = require_user(req)
    lid = params.get("lid")
    r = db.one("SELECT * FROM hub_links WHERE id = ?", (_int(lid),)) if lid else db.one("SELECT * FROM hub_links WHERE remote_id = ?", (params.get("rid"),))
    if not r:
        raise ApiError(404, "Den HUBTECH er ikke forbundet med denne.", "not_found")
    # someone who came from that HUBTECH goes home instead of getting a guest account of a guest account
    home = db.one("SELECT remote_user FROM hub_users WHERE user_id = ? AND link_id = ?", (u["id"], r["id"]))
    if home:
        return 200, {"url": r["url"] + "/#/", "home": True}
    if db.one("SELECT 1 FROM hub_users WHERE user_id = ?", (u["id"],)):
        raise ApiError(403, "Du er gæst her – du kan kun besøge andre HUBTECH'er fra din egen.", "guest")
    av = u["avatar"] if isinstance(u["avatar"], str) and len(u["avatar"]) <= 8 and not u["avatar"].startswith("/") else "⚡"
    payload = {"h": hub_id(), "hn": hub_name(), "u": u["id"], "n": u["display_name"][:60], "a": av, "x": int(time.time()) + TICKET_SECONDS, "k": secrets.token_urlsafe(12)}
    db.q("UPDATE hub_links SET last_used = ? WHERE id = ?", (db.now(), r["id"]))
    return 200, {"url": f"{r['url']}/#/hub/{_sign(r['secret'], payload)}", "name": r["name"]}


def sso(req, _):
    """The browser arrives with a ticket from a connected HUBTECH: check it and log the person in here."""
    key = "hubsso:" + getattr(req, "visitor_ip", req.client_ip)
    wait = auth.throttled(key)
    if wait:
        raise ApiError(429, f"For mange forsøg. Prøv igen om {wait} sekunder.", "throttled")
    raw, sig, p = _unsign(req.json().get("ticket"))
    r = db.one("SELECT * FROM hub_links WHERE remote_id = ?", (str(p.get("h") or ""),))
    good = r and hmac.compare_digest(sig, _b64(hmac.new(r["secret"].encode("ascii"), raw.encode("ascii"), hashlib.sha256).digest()))
    if not good:
        auth.record_failure(key)
        raise ApiError(403, "Linket er ikke gyldigt. Prøv igen fra din egen HUBTECH.", "bad_ticket")
    if not r["allow_login"]:
        raise ApiError(403, f"Ejeren af denne HUBTECH har slået besøg fra {r['name']} fra.", "not_allowed")
    now = int(time.time())
    if not isinstance(p.get("x"), int) or p["x"] < now or p["x"] > now + TICKET_SECONDS + 60:
        raise ApiError(403, "Linket er udløbet. Prøv igen fra din egen HUBTECH.", "expired")
    nonce = str(p.get("k") or "")
    db.q("DELETE FROM hub_nonces WHERE expires_at < ?", (now,))
    if not nonce or db.one("SELECT 1 FROM hub_nonces WHERE nonce = ?", (nonce,)):
        raise ApiError(403, "Linket er allerede brugt. Prøv igen fra din egen HUBTECH.", "used")
    db.q("INSERT INTO hub_nonces(nonce, expires_at) VALUES(?,?)", (nonce, now + TICKET_SECONDS * 2))
    ruid = p.get("u")
    if not isinstance(ruid, int):
        raise ApiError(400, "Linket er ugyldigt.", "invalid")
    name = (str(p.get("n") or "Gæst").strip() or "Gæst")[:60]
    av = str(p.get("a") or "⚡")[:8]
    m = db.one("SELECT user_id FROM hub_users WHERE link_id = ? AND remote_user = ?", (r["id"], ruid))
    if m:
        uid = m["user_id"]
        db.q("UPDATE users SET display_name = ?, avatar = ? WHERE id = ?", (name, av, uid))
    else:
        base = re.sub(r"[^a-z0-9]", "", name.lower().replace("æ", "ae").replace("ø", "oe").replace("å", "aa"))[:16] or "gaest"
        tag = re.sub(r"[^a-z0-9]", "", r["name"].lower())[:8] or "hub"
        uname, k = f"{base}.{tag}", 1
        while db.one("SELECT 1 FROM users WHERE username = ?", (uname,)):
            k += 1
            uname = f"{base}.{tag}{k}"
        cur = db.q("INSERT INTO users(username, display_name, password_hash, role, avatar, created_at, onboarding_done) VALUES(?,?,?,?,?,?,1)",
                   (uname, name, "hub$" + secrets.token_hex(16), "member", av, db.now()))
        uid = cur.lastrowid
        db.q("INSERT INTO prefs(user_id, data, updated_at) VALUES(?, '{}', ?)", (uid, db.now()))
        db.q("INSERT INTO hub_users(link_id, remote_user, user_id) VALUES(?,?,?)", (r["id"], ruid, uid))
        log_activity(uid, "hubtech", "account", f"Besøg fra {r['name']}", "Velkommen som gæst")
        owners = [o["id"] for o in db.all_rows("SELECT id FROM users WHERE role = 'owner'")]
        live.publish(owners, {"type": "notify", "kind": "hublink", "title": f"{name} fra {r['name']} er på besøg", "text": "", "path": "/"})
    auth.clear_failures(key)
    db.q("UPDATE users SET last_login_at = ? WHERE id = ?", (db.now(), uid))
    db.q("UPDATE hub_links SET last_used = ? WHERE id = ?", (db.now(), r["id"]))
    token = auth.create_session(uid, req.headers.get("User-Agent", ""))
    row = db.one("SELECT * FROM users WHERE id = ?", (uid,))
    return 200, {"user": auth.public_user(row), "from": r["name"]}, {"Set-Cookie": auth.cookie_header(token, secure=is_https(req))}


def public_list(req, _):
    """For the login page: which HUBTECHs people may come from (names only)."""
    rows = db.all_rows("SELECT remote_id, name, url FROM hub_links WHERE allow_login = 1 ORDER BY name COLLATE NOCASE")
    return 200, {"id": hub_id(), "name": hub_name(), "links": [{"id": r["remote_id"], "name": r["name"], "url": r["url"]} for r in rows]}


ROUTES = [
    ("GET", r"/api/hublink", info),
    ("PUT", r"/api/hublink/name", set_name),
    ("POST", r"/api/hublink/invite", make_invite),
    ("POST", r"/api/hublink/peek", peek),
    ("POST", r"/api/hublink/join", join),
    ("POST", r"/api/hublink/accept", accept),
    ("POST", r"/api/hublink/sso", sso),
    ("GET", r"/api/hublink/public", public_list),
    ("PATCH", r"/api/hublink/links/(?P<lid>\d+)", update_link),
    ("DELETE", r"/api/hublink/links/(?P<lid>\d+)", delete_link),
    ("POST", r"/api/hublink/links/(?P<lid>\d+)/go", go),
    ("POST", r"/api/hublink/to/(?P<rid>[0-9a-f]{16})/go", go),
]


def install(api_module):
    api_module.COMPILED.extend((m, re.compile("^" + p + "$"), h) for m, p, h in ROUTES)
