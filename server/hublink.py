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

Everyone connected, by itself (owner switch "Forbind automatisk", on by default):
  * Same wifi / same computer: every HUBTECH says hello on a UDP broadcast now and then. The one with the smaller id
    calls the other's /api/hublink/auto with a fresh secret. That is only accepted from a private address (wifi,
    Tailscale, this computer) – never from the internet – and only after calling back to check who is there.
  * Same Tailscale: the peers in "tailscale status" that share HUBTECH are tried the same way.
  * Friends of friends: every few minutes each HUBTECH asks the ones it knows (signed with their shared secret) whom
    they know. For a new one, it asks the friend in common to introduce it: the friend fetches a one-time code from the
    new one and passes it on, and the normal step 2 above follows. So one connection is enough to join everybody.
  The code is then only needed for the very first contact between two that share neither a network nor a friend.
  A connection an owner removes is never made again automatically.
"""
import base64
import hashlib
import hmac
import ipaddress
import json
import os
import re
import secrets
import socket
import threading
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
    fixed = _clean_url(os.environ.get("HUBTECH_HUB_URL"))
    if fixed:
        out.append({"url": fixed, "kind": "fixed", "label": "Den faste adresse"})
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
        for a in (_lan_addresses() if _host_open() else []):    # only when other devices can reach it at all
            u = f"http://{a}:{port}"
            if not any(o["url"] == u for o in out):
                out.append({"url": u, "kind": "lan", "label": "På samme netværk (wifi)"})
    except Exception:
        pass
    return out


def _link_out(r, full=False):
    o = {"id": r["id"], "name": r["name"], "url": r["url"], "allowLogin": bool(r["allow_login"]), "createdAt": r["created_at"], "lastUsed": r["last_used"],
         "via": r["via"] if "via" in r.keys() else None}
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
           "visitorFrom": {"name": mine["name"], "url": mine["url"]} if mine else None, "auto": auto_on()}
    if u["role"] == "owner":
        out["urls"] = my_urls(req)
        out["lastSync"] = _state.get("last")
        out["blocked"] = [{"id": b["remote_id"], "name": b["name"]} for b in db.all_rows("SELECT * FROM hub_blocked ORDER BY blocked_at DESC")]
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
    db.set_server_setting("hub_url", url)    # the address the owner chose – also the one handed on to friends of friends
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
    if _clean_url(b.get("url")):
        db.set_server_setting("hub_url", my_url)
    _connect(c["url"], c["id"], c["token"], my_url, "code", c["name"])
    threading.Thread(target=sync_once, daemon=True).start()    # the new friend's friends follow right away
    return 200, {"link": _link_out(db.one("SELECT * FROM hub_links WHERE remote_id = ?", (c["id"],)), True)}


def _connect(url, rid, token, my_url, via, fallback_name="HUBTECH", told_via=None):
    """Step 2 from this side: make the shared secret and hand it over with the one-time token."""
    secret = secrets.token_hex(32)
    body = {"token": token, "id": hub_id(), "name": hub_name(), "url": my_url, "secret": secret}
    if told_via:
        body["via"] = told_via
    r = _post(url, "/api/hublink/accept", body)
    if r.get("id") != rid:
        raise ApiError(502, "Den anden HUBTECH svarede ikke som forventet.", "remote_error")
    _store(rid, str(r.get("name") or fallback_name)[:40], url, secret, via)
    return r


def _store(rid, name, url, secret, via=None):
    t = db.now()
    db.q("DELETE FROM hub_blocked WHERE remote_id = ?", (rid,))
    if db.one("SELECT 1 FROM hub_links WHERE remote_id = ?", (rid,)):
        db.q("UPDATE hub_links SET name = ?, url = ?, secret = ? WHERE remote_id = ?", (name, url, secret, rid))
    else:
        db.q("INSERT INTO hub_links(remote_id, name, url, secret, created_at, via) VALUES(?,?,?,?,?,?)", (rid, name, url, secret, t, via))


def _notify_new(name, how):
    owners = [r["id"] for r in db.all_rows("SELECT id FROM users WHERE role = 'owner'")]
    live.publish(owners, {"type": "notify", "kind": "hublink", "title": f"{name} er nu forbundet med din HUBTECH", "text": how, "path": "/hubs"})


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
    told = str(b.get("via") or "")[:40]
    _store(rid, name, url, secret, ("ven:" + told) if told else "code")
    _notify_new(name, f"Forbundet gennem {told}." if told else "Folk kan nu besøge hinanden med deres egen konto.")
    if not told:
        threading.Thread(target=sync_once, daemon=True).start()
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
    _drop(r)
    # tell the other one, so it stops showing the connection too
    threading.Thread(target=_say_bye, args=(dict(r),), daemon=True).start()
    # never connected again by itself – only with a new code
    db.q("INSERT OR REPLACE INTO hub_blocked(remote_id, name, blocked_at) VALUES(?,?,?)", (r["remote_id"], r["name"], db.now()))
    return 200, {"ok": True}


def _drop(r):
    for row in db.all_rows("SELECT user_id FROM hub_users WHERE link_id = ?", (r["id"],)):
        auth.destroy_user_sessions(row["user_id"])
    db.q("DELETE FROM hub_links WHERE id = ?", (r["id"],))


def _say_bye(r):
    try:
        _peer_call(r, "/api/hublink/peer/bye", {}, timeout=5)
    except (urllib.error.URLError, OSError, ValueError):
        pass
    finally:
        db.close_thread_conn()


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
    nxt = str((req.json() or {}).get("next") or "")
    if nxt and not re.fullmatch(r"/(?!/)[A-Za-z0-9/_\-?=&%.]{0,300}", nxt):
        nxt = ""
    # someone who came from that HUBTECH goes home instead of getting a guest account of a guest account
    home = db.one("SELECT remote_user FROM hub_users WHERE user_id = ? AND link_id = ?", (u["id"], r["id"]))
    if home:
        return 200, {"url": r["url"] + "/#" + (nxt or "/"), "home": True}
    if db.one("SELECT 1 FROM hub_users WHERE user_id = ?", (u["id"],)):
        raise ApiError(403, "Du er gæst her – du kan kun besøge andre HUBTECH'er fra din egen.", "guest")
    av = u["avatar"] if isinstance(u["avatar"], str) and len(u["avatar"]) <= 8 and not u["avatar"].startswith("/") else "⚡"
    payload = {"h": hub_id(), "hn": hub_name(), "u": u["id"], "n": u["display_name"][:60], "a": av, "x": int(time.time()) + TICKET_SECONDS, "k": secrets.token_urlsafe(12), **({"p": nxt} if nxt else {})}
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
    nxt = p.get("p") if isinstance(p.get("p"), str) and re.fullmatch(r"/(?!/)[A-Za-z0-9/_\-?=&%.]{0,300}", p.get("p")) else None
    return 200, {"user": auth.public_user(row), "from": r["name"], "next": nxt}, {"Set-Cookie": auth.cookie_header(token, secure=is_https(req))}


def ping(req, params):
    """Is the other HUBTECH switched on and reachable from here?"""
    require_user(req)
    r = db.one("SELECT * FROM hub_links WHERE id = ?", (_int(params["lid"]),))
    if not r:
        raise ApiError(404, "Forbindelsen findes ikke.", "not_found")
    t0 = time.time()
    try:
        with urllib.request.urlopen(urllib.request.Request(r["url"] + "/api/health", headers={"Accept": "application/json"}), timeout=5) as resp:
            ok = resp.status == 200
    except (urllib.error.URLError, OSError, ValueError):
        ok = False
    return 200, {"online": ok, "ms": int((time.time() - t0) * 1000)}


def public_list(req, _):
    """For the login page: which HUBTECHs people may come from (names only)."""
    rows = db.all_rows("SELECT remote_id, name, url FROM hub_links WHERE allow_login = 1 ORDER BY name COLLATE NOCASE")
    return 200, {"id": hub_id(), "name": hub_name(), "links": [{"id": r["remote_id"], "name": r["name"], "url": r["url"]} for r in rows]}


# ── everyone connected, by itself ────────────────────────────────────────
DISCOVERY_PORT = int(os.environ.get("HUBTECH_DISCOVERY_PORT") or 47913)
SYNC_SECONDS = max(1.0, float(os.environ.get("HUBTECH_HUBSYNC_SECONDS") or 180))
PEER_SKEW = 300
_state = {"last": None, "seen": {}, "cool": {}, "ts_at": 0, "force": set()}
_sync_lock = threading.Lock()


def auto_on():
    return bool(db.get_server_setting("hub_auto", True))


def _discovery_on():
    return os.environ.get("HUBTECH_HUB_DISCOVERY", "1") != "0" and not os.environ.get("HUBTECH_ANDROID")


def _private(ip):
    try:
        a = ipaddress.ip_address(str(ip).split("%")[0])
    except ValueError:
        return False
    if getattr(a, "ipv4_mapped", None):
        a = a.ipv4_mapped
    return a.is_private or a.is_loopback or a in ipaddress.ip_network("100.64.0.0/10")


def _loopback(ip):
    try:
        return ipaddress.ip_address(str(ip)).is_loopback
    except ValueError:
        return False


def _host_open():
    return (SYSTEM.get("host") or "127.0.0.1") in ("0.0.0.0", "", "::")


def _ts_url():
    """This HUBTECH's address on Tailscale, when it is shared there."""
    from .api import _tailscale
    try:
        ts = _tailscale()
    except Exception:
        return None
    return ts["url"] if ts.get("url") and ts.get("running") and (ts.get("serving") or ts.get("funnel")) else None


def _advertise(kind, peer_ip=None):
    """The address another HUBTECH should use for this one, depending on how it found us."""
    env = _clean_url(os.environ.get("HUBTECH_HUB_URL"))
    if env:
        return env
    port = SYSTEM.get("port")
    if kind == "lan":
        if _loopback(peer_ip):
            return f"http://127.0.0.1:{port}"
        if not _host_open():
            return None
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect((peer_ip, 9))      # no packet is sent; the OS picks the interface that reaches the peer
            ip = s.getsockname()[0]
            s.close()
            return f"http://{ip}:{port}"
        except OSError:
            return None
    if kind == "tailscale":
        return _ts_url()
    saved = _clean_url(db.get_server_setting("hub_url", None))
    if saved:
        return saved
    ts = _ts_url()
    if ts:
        return ts
    if _host_open():
        from .api import _lan_addresses
        lan = _lan_addresses()
        if lan:
            return f"http://{lan[0]}:{port}"
    return f"http://127.0.0.1:{port}"


def _get_json(url, timeout=4):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"Accept": "application/json", "X-Requested-With": "hubtech"}), timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8") or "{}")


def _is_blocked(rid):
    return bool(db.one("SELECT 1 FROM hub_blocked WHERE remote_id = ?", (rid,)))


def _cooling(rid):
    return _state["cool"].get(rid, 0) > time.time()


def _cool(rid, seconds=600):
    _state["cool"][rid] = time.time() + seconds


def hello(req, _):
    """Public: who is this? Used to check an address before connecting to it."""
    out = {"service": "hubtech-link", "id": hub_id(), "name": hub_name(), "auto": auto_on()}
    fixed = _clean_url(os.environ.get("HUBTECH_HUB_URL"))
    if fixed:
        out["url"] = fixed    # set by whoever runs it: use this address rather than the one we were found on
    return 200, out


def auto_accept(req, _):
    """Another HUBTECH on the same wifi, computer or Tailscale connects by itself – no code, but never from the internet."""
    key = "hublink:" + req.visitor_ip
    wait = auth.throttled(key)
    if wait:
        raise ApiError(429, f"For mange forsøg. Prøv igen om {wait} sekunder.", "throttled")
    if not auto_on():
        raise ApiError(403, "Ejeren har slået automatisk forbindelse fra.", "auto_off")
    if not _private(req.visitor_ip) or req.headers.get("Tailscale-Funnel-Request"):
        raise ApiError(403, "Automatisk forbindelse virker kun på samme netværk. Brug en kode.", "not_local")
    b = req.json()
    rid, url, secret = str(b.get("id") or ""), _clean_url(b.get("url")), str(b.get("secret") or "")
    name = (str(b.get("name") or "HUBTECH").strip() or "HUBTECH")[:40]
    if not re.fullmatch(r"[0-9a-f]{16}", rid) or not re.fullmatch(r"[0-9a-f]{64}", secret) or not url or rid == hub_id():
        auth.record_failure(key)
        raise ApiError(400, "Ugyldig forespørgsel.", "invalid")
    if _is_blocked(rid):
        raise ApiError(403, "Ejeren har fjernet forbindelsen. Den kan kun laves igen med en kode.", "blocked")
    if db.one("SELECT 1 FROM hub_links WHERE remote_id = ?", (rid,)):
        raise ApiError(409, "Allerede forbundet.", "known")
    try:   # is it really there, at the address it gave?
        h = _get_json(url + "/api/hublink/hello", timeout=5)
    except (urllib.error.URLError, OSError, ValueError):
        raise ApiError(502, "Kunne ikke nå den anden HUBTECH på den adresse, den gav.", "unreachable")
    if h.get("id") != rid:
        auth.record_failure(key)
        raise ApiError(400, "Adressen hører til en anden HUBTECH.", "invalid")
    kind = "tailscale" if req.visitor_ip.startswith("100.") or url.startswith("https://") else "lan"
    _store(rid, name, url, secret, kind)
    _notify_new(name, "Fundet automatisk på samme netværk." if kind == "lan" else "Fundet automatisk over Tailscale.")
    return 200, {"id": hub_id(), "name": hub_name()}


def _peer_sig(secret, t, path, raw):
    return _b64(hmac.new(secret.encode("ascii"), f"{t}.{path}.".encode("ascii") + raw, hashlib.sha256).digest())


def _peer_call(link, path, body, timeout=8):
    """A signed call to a connected HUBTECH (server to server)."""
    raw = json.dumps(body, separators=(",", ":")).encode("utf-8")
    t = str(int(time.time()))
    r = urllib.request.Request(link["url"] + path, data=raw, method="POST", headers={
        "Content-Type": "application/json", "X-Requested-With": "hubtech", "Accept": "application/json",
        "X-Hub-From": hub_id(), "X-Hub-Time": t, "X-Hub-Sig": _peer_sig(link["secret"], t, path, raw)})
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8") or "{}")


def _peer_auth(req, path):
    rid = str(req.headers.get("X-Hub-From") or "")
    r = db.one("SELECT * FROM hub_links WHERE remote_id = ?", (rid,)) if re.fullmatch(r"[0-9a-f]{16}", rid) else None
    t = str(req.headers.get("X-Hub-Time") or "")
    ok = r and t.isdigit() and abs(int(t) - time.time()) <= PEER_SKEW and \
        hmac.compare_digest(str(req.headers.get("X-Hub-Sig") or ""), _peer_sig(r["secret"], t, path, req.raw_body()))
    key = "hubpeer:" + req.visitor_ip
    if auth.throttled(key):
        raise ApiError(429, "For mange forsøg.", "throttled")
    if not ok:
        auth.record_failure(key)
        raise ApiError(403, "Ukendt HUBTECH.", "bad_peer")
    return r


def peer_list(req, _):
    """A connected HUBTECH asks whom this one knows (so it can get introduced)."""
    me = _peer_auth(req, "/api/hublink/peer/list")
    b = req.json() or {}
    if isinstance(b.get("name"), str) and b["name"].strip() and b["name"][:40] != me["name"]:
        db.q("UPDATE hub_links SET name = ? WHERE id = ?", (b["name"].strip()[:40], me["id"]))
    rows = db.all_rows("SELECT remote_id, name, url FROM hub_links WHERE id != ?", (me["id"],)) if auto_on() else []
    return 200, {"id": hub_id(), "name": hub_name(), "links": [{"id": r["remote_id"], "name": r["name"], "url": r["url"]} for r in rows]}


def peer_bye(req, _):
    """The other HUBTECH's owner removed the connection: remove it here too (it may come back through a code)."""
    r = _peer_auth(req, "/api/hublink/peer/bye")
    _drop(r)
    _cool(r["remote_id"], 3600)
    return 200, {"ok": True}


def peer_invite(req, _):
    """A connected HUBTECH introduces a friend of its own: hand it a one-time code for that friend."""
    via = _peer_auth(req, "/api/hublink/peer/invite")
    f = (req.json() or {}).get("for") or {}
    fid = str(f.get("id") or "")
    if not auto_on():
        raise ApiError(403, "Ejeren har slået automatisk forbindelse fra.", "auto_off")
    if not re.fullmatch(r"[0-9a-f]{16}", fid) or fid == hub_id() or _is_blocked(fid):
        raise ApiError(403, "Ikke tilladt.", "blocked")
    if db.one("SELECT 1 FROM hub_links WHERE remote_id = ?", (fid,)):
        raise ApiError(409, "Allerede forbundet.", "known")
    token = secrets.token_urlsafe(18)
    t = db.now()
    db.q("INSERT INTO hub_invites(token_hash, created_at, expires_at) VALUES(?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), t, t + 300))
    return 200, {"token": token, "id": hub_id(), "name": hub_name(), "via": via["name"]}


def peer_introduce(req, _):
    """A connected HUBTECH wants to meet one of this one's connections: fetch a code from that one and pass it on."""
    asker = _peer_auth(req, "/api/hublink/peer/introduce")
    target = str((req.json() or {}).get("target") or "")
    tl = db.one("SELECT * FROM hub_links WHERE remote_id = ?", (target,))
    if not auto_on() or not tl or target == asker["remote_id"]:
        raise ApiError(404, "Kender ikke den HUBTECH.", "not_found")
    try:
        r = _peer_call(tl, "/api/hublink/peer/invite", {"for": {"id": asker["remote_id"], "name": asker["name"]}})
    except urllib.error.HTTPError as e:
        raise ApiError(409 if e.code == 409 else 403, "Den anden HUBTECH sagde nej.", "declined")
    except (urllib.error.URLError, OSError, ValueError):
        raise ApiError(502, "Kunne ikke nå den anden HUBTECH.", "unreachable")
    if r.get("id") != target or not r.get("token"):
        raise ApiError(502, "Den anden HUBTECH svarede ikke som forventet.", "remote_error")
    return 200, {"id": target, "name": str(r.get("name") or tl["name"])[:40], "url": tl["url"], "token": r["token"]}


def _meet(rid, url, kind, peer_ip=None):
    """Connect to a HUBTECH found on the network (we are the smaller id, so it is our turn)."""
    my = _advertise(kind, peer_ip)
    if not my:
        return False
    secret = secrets.token_hex(32)
    try:
        r = _post(url, "/api/hublink/auto", {"id": hub_id(), "name": hub_name(), "url": my, "secret": secret}, timeout=8)
    except ApiError:
        _cool(rid)
        return False
    if r.get("id") != rid:
        return False
    name = str(r.get("name") or "HUBTECH")[:40]
    _store(rid, name, url, secret, kind)
    _notify_new(name, "Fundet automatisk på samme netværk." if kind == "lan" else "Fundet automatisk over Tailscale.")
    return True


def _consider(rid, url, kind, peer_ip=None):
    me = hub_id()
    if not re.fullmatch(r"[0-9a-f]{16}", rid or "") or rid == me:
        return False
    if me > rid or _is_blocked(rid) or _cooling(rid) or db.one("SELECT 1 FROM hub_links WHERE remote_id = ?", (rid,)):
        return False     # the one with the smaller id makes the call, so the two never cross
    try:
        h = _get_json(url + "/api/hublink/hello", timeout=4)
    except (urllib.error.URLError, OSError, ValueError):
        _cool(rid, 120)
        return False
    if h.get("id") != rid or not h.get("auto"):
        _cool(rid)
        return False
    return _meet(rid, _clean_url(h.get("url")) or url, kind, peer_ip)


def sync_once():
    """One round: say hello on the network, try Tailscale peers, and get introduced to friends of friends."""
    if not auto_on() or not _sync_lock.acquire(blocking=False):
        return
    try:
        me = hub_id()
        if _discovery_on():
            _broadcast()
            for rid, (url, ip, at) in list(_state["seen"].items()):
                if time.time() - at < SYNC_SECONDS * 3:
                    _consider(rid, url, "lan", ip)
            if time.time() - _state["ts_at"] > max(600, SYNC_SECONDS * 3):
                _state["ts_at"] = time.time()
                _tailscale_peers()
        for link in db.all_rows("SELECT * FROM hub_links ORDER BY id"):
            try:
                r = _peer_call(link, "/api/hublink/peer/list", {"name": hub_name()})
            except (urllib.error.URLError, OSError, ValueError):
                continue
            if r.get("id") != link["remote_id"]:
                continue
            nm = str(r.get("name") or "").strip()[:40]
            if nm and nm != link["name"]:
                db.q("UPDATE hub_links SET name = ? WHERE id = ?", (nm, link["id"]))
            for c in r.get("links") or []:
                cid = str(c.get("id") or "")
                turn = me < cid or cid in _state["force"]
                if not re.fullmatch(r"[0-9a-f]{16}", cid) or cid == me or not turn or _is_blocked(cid) or _cooling(cid):
                    continue
                if db.one("SELECT 1 FROM hub_links WHERE remote_id = ?", (cid,)):
                    continue
                my = _advertise("friend")
                try:
                    intro = _peer_call(link, "/api/hublink/peer/introduce", {"target": cid})
                    url = _clean_url(intro.get("url"))
                    if intro.get("id") != cid or not url or not my:
                        raise ValueError
                    _connect(url, cid, str(intro.get("token") or ""), my, "ven:" + (nm or link["name"]), str(intro.get("name") or "HUBTECH"), told_via=nm or link["name"])
                    _notify_new(str(intro.get("name") or "HUBTECH")[:40], f"Forbundet gennem {nm or link['name']}.")
                    _state["force"].discard(cid)
                except (urllib.error.URLError, OSError, ValueError, ApiError):
                    _cool(cid)
        _state["last"] = db.now()
    finally:
        _sync_lock.release()


def _broadcast():
    msg = json.dumps({"hubtech": 1, "id": hub_id(), "port": SYSTEM.get("port")}).encode("utf-8")
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    except OSError:
        return
    targets = ["127.255.255.255"] + (["255.255.255.255"] if _host_open() else [])
    for t in targets:
        try:
            s.sendto(msg, (t, DISCOVERY_PORT))
        except OSError:
            pass
    s.close()


def _listen():
    """Hear the others' hellos (several HUBTECHs on one computer can all listen on the same port)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        if hasattr(socket, "SO_REUSEPORT"):
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
        s.bind(("", DISCOVERY_PORT))
    except OSError:
        return
    me = hub_id()
    while True:
        try:
            data, (ip, _p) = s.recvfrom(512)
            m = json.loads(data.decode("utf-8"))
            rid, port = str(m.get("id") or ""), int(m.get("port") or 0)
        except (OSError, ValueError, AttributeError, TypeError):
            continue
        if m.get("hubtech") != 1 or rid == me or not (0 < port < 65536) or not _private(ip):
            continue
        host = f"[{ip}]" if ":" in ip else ip
        fresh = rid not in _state["seen"]
        _state["seen"][rid] = (f"http://{host}:{port}", ip, time.time())
        if fresh and auto_on() and me < rid:
            threading.Thread(target=_consider, args=(rid, f"http://{host}:{port}", "lan", ip), daemon=True).start()


def _tailscale_peers():
    if not _ts_url():
        return
    import shutil
    import subprocess
    exe = shutil.which("tailscale") or next((c for c in (r"C:\Program Files\Tailscale\tailscale.exe", "/Applications/Tailscale.app/Contents/MacOS/Tailscale") if os.path.exists(c)), None)
    if not exe:
        return
    try:
        r = subprocess.run([exe, "status", "--json"], capture_output=True, text=True, timeout=5, creationflags=0x08000000 if os.name == "nt" else 0)
        peers = (json.loads(r.stdout or "{}").get("Peer") or {}).values()
    except Exception:
        return
    for p in peers:
        dns = str(p.get("DNSName") or "").rstrip(".")
        if not p.get("Online") or not dns or not re.fullmatch(r"[A-Za-z0-9.-]+", dns):
            continue
        try:
            h = _get_json(f"https://{dns}/api/hublink/hello", timeout=3)
        except (urllib.error.URLError, OSError, ValueError):
            continue
        if h.get("service") == "hubtech-link":
            _consider(str(h.get("id") or ""), f"https://{dns}", "tailscale")


def loop():
    """Background thread: listen for hellos and run a round now and then (quickly at first)."""
    if _discovery_on():
        threading.Thread(target=_listen, name="hubtech-hub-listen", daemon=True).start()
    time.sleep(min(3, SYNC_SECONDS))
    n = 0
    while True:
        try:
            sync_once()
        except Exception:
            pass
        finally:
            db.close_thread_conn()
        n += 1
        time.sleep(min(SYNC_SECONDS, 20) if n < 4 else SYNC_SECONDS)


def set_auto(req, _):
    require_owner(req)
    on = bool(req.json().get("on"))
    db.set_server_setting("hub_auto", on)
    if on:
        threading.Thread(target=sync_once, daemon=True).start()
    return 200, {"auto": on}


def sync_now(req, _):
    require_owner(req)
    threading.Thread(target=sync_once, daemon=True).start()
    return 202, {"ok": True}


def unblock(req, params):
    require_owner(req)
    db.q("DELETE FROM hub_blocked WHERE remote_id = ?", (params["rid"],))
    _state["cool"].pop(params["rid"], None)
    _state["force"].add(params["rid"])     # the owner asked for it: this side makes the call, whatever the order
    threading.Thread(target=sync_once, daemon=True).start()
    return 200, {"ok": True}


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
    ("GET", r"/api/hublink/links/(?P<lid>\d+)/ping", ping),
    ("POST", r"/api/hublink/to/(?P<rid>[0-9a-f]{16})/go", go),
    ("GET", r"/api/hublink/hello", hello),
    ("POST", r"/api/hublink/auto", auto_accept),
    ("PUT", r"/api/hublink/auto", set_auto),
    ("POST", r"/api/hublink/sync", sync_now),
    ("DELETE", r"/api/hublink/blocked/(?P<rid>[0-9a-f]{16})", unblock),
    ("POST", r"/api/hublink/peer/list", peer_list),
    ("POST", r"/api/hublink/peer/invite", peer_invite),
    ("POST", r"/api/hublink/peer/bye", peer_bye),
    ("POST", r"/api/hublink/peer/introduce", peer_introduce),
]


def install(api_module):
    api_module.COMPILED.extend((m, re.compile("^" + p + "$"), h) for m, p, h in ROUTES)


def start():
    threading.Thread(target=loop, name="hubtech-hublink", daemon=True).start()
