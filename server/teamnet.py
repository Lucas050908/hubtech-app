"""Teamnet: HUBTECH on every PC works together – no server.

* Your account follows you. Log in on any connected HUBTECH (same wifi finds and connects by itself, see hublink)
  with the username and password from your own PC. This PC asks the connected ones; the one that knows you checks
  the password and hands over a sync key. Your account is made here, and from then on the two keep your data the
  same both ways by themselves (autosync, every few minutes).
* Nothing is lost when a PC is off. Every PC keeps a sealed copy of the others' data. It is locked with a key made
  from the owner's password, which is never stored – so nobody else can open it, not even the owner of that PC.
  Logging in on a new PC while your own is off: it finds the sealed copy, opens it with your password and you have
  your data.
* Standard library only: PBKDF2-SHA256 makes the key, HMAC-SHA256 in counter mode encrypts, and HMAC-SHA256 checks
  that nothing was changed (encrypt-then-MAC).
"""
import base64
import hashlib
import hmac
import json
import os
import threading
import time
import zlib

from . import auth, db

MAGIC = b"HV1"
VAULT_MAX = 40 * 1024 * 1024        # one person's sealed copy
_keys = {}                          # uid -> (vault key, username) while they are logged in somewhere on this PC
_lock = threading.Lock()


# ── sealing ──
def _ks(key, nonce, n):
    out = bytearray()
    c = 0
    while len(out) < n:
        out += hmac.new(key, nonce + c.to_bytes(8, "big"), hashlib.sha256).digest()
        c += 1
    return bytes(out[:n])


def _xor(a, b):
    return (int.from_bytes(a, "big") ^ int.from_bytes(b, "big")).to_bytes(len(a), "big") if a else b""


def seal(key, data):
    nonce = os.urandom(16)
    ek = hmac.new(key, b"enc", hashlib.sha256).digest()
    mk = hmac.new(key, b"mac", hashlib.sha256).digest()
    ct = _xor(data, _ks(ek, nonce, len(data)))
    return MAGIC + nonce + ct + hmac.new(mk, nonce + ct, hashlib.sha256).digest()


def unseal(key, blob):
    if not blob.startswith(MAGIC) or len(blob) < len(MAGIC) + 48:
        raise ValueError("not sealed")
    nonce, ct, tag = blob[3:19], blob[19:-32], blob[-32:]
    mk = hmac.new(key, b"mac", hashlib.sha256).digest()
    if not hmac.compare_digest(tag, hmac.new(mk, nonce + ct, hashlib.sha256).digest()):
        raise ValueError("wrong key or changed")
    ek = hmac.new(key, b"enc", hashlib.sha256).digest()
    return _xor(ct, _ks(ek, nonce, len(ct)))


def vault_key(username, password):
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), b"hubtech-vault:" + username.lower().encode("utf-8"), 200_000, 32)


def _link_key(link, what):
    return hashlib.sha256((link["secret"] + ":" + what).encode("utf-8")).digest()


# ── storage of the others' sealed copies ──
def install_db():
    db.q("CREATE TABLE IF NOT EXISTS team_vault(owner TEXT NOT NULL, home TEXT NOT NULL, blob BLOB NOT NULL, "
         "size INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(owner, home))")


def _links():
    try:
        return db.all_rows("SELECT * FROM hub_links ORDER BY id")
    except Exception:
        return []


# ── after a login: remember the key (in memory only) and spread the sealed copy ──
def remember(row, password):
    if not row or row["role"] == "guest":
        return
    with _lock:
        _keys[row["id"]] = (vault_key(row["username"], password), row["username"])
    threading.Thread(target=push_vault, args=(row["id"],), daemon=True).start()


def forget(uid):
    with _lock:
        _keys.pop(uid, None)


def _export(uid):
    from . import autosync
    m = autosync.manifest(uid)
    return autosync.fetch(uid, {"states": list(m["states"]), "office": list(m["office"]), "files": m["files"][:100]})


def push_vault(uid):
    """Seal this person's data and give a copy to every connected PC. Quiet when a PC can't be reached."""
    from . import hublink
    with _lock:
        k = _keys.get(uid)
    if not k:
        return 0
    key, username = k
    try:
        blob = seal(key, zlib.compress(json.dumps(_export(uid), separators=(",", ":")).encode("utf-8"), 6))
    except Exception:
        return 0
    if len(blob) > VAULT_MAX:
        return 0
    sent = 0
    body = {"owner": username.lower(), "home": hublink.hub_id(), "blob": base64.b64encode(blob).decode("ascii")}
    for link in _links():
        try:
            hublink._peer_call(link, "/api/hublink/peer/vault/put", body, timeout=60)
            sent += 1
        except Exception:
            pass
    db.set_server_setting(f"teamvault_sent_{uid}", {"at": db.now(), "pcs": sent, "bytes": len(blob)})
    return sent


# ── logging in on a PC where you have no account yet ──
def roam(username, password):
    """Ask the connected PCs who knows this person. Returns the new local user row, or None."""
    from . import autosync, hublink
    uname = username.strip()
    if not auth.USERNAME_RE.match(uname) or db.one("SELECT 1 FROM users WHERE username = ?", (uname,)):
        return None
    for link in _links():
        try:
            r = hublink._peer_call(link, "/api/hublink/peer/login", {
                "username": uname, "p": base64.b64encode(seal(_link_key(link, "login"), password.encode("utf-8"))).decode("ascii"),
                "label": hublink.hub_name()}, timeout=10)
        except Exception:
            continue
        if not r.get("ok"):
            continue
        u = r.get("user") or {}
        row = _make_user(uname, password, u)
        try:
            autosync.save_config(row["id"], link["url"], r["token"], 5)
            autosync.run_async(row["id"])
        except Exception:
            pass
        db.set_server_setting(f"teamhome_{row['id']}", {"hub": link["remote_id"], "name": link["name"], "url": link["url"], "since": db.now()})
        return row
    # nobody answered for this person: their own PC may be off – open the sealed copy with the password
    key = vault_key(uname, password)
    for link in _links():
        try:
            r = hublink._peer_call(link, "/api/hublink/peer/vault/get", {"owner": uname.lower()}, timeout=60)
        except Exception:
            continue
        for v in r.get("vaults") or []:
            try:
                data = json.loads(zlib.decompress(unseal(key, base64.b64decode(v["blob"]))).decode("utf-8"))
            except Exception:
                continue
            row = _make_user(uname, password, {})
            autosync.apply(row["id"], data)
            db.set_server_setting(f"teamhome_{row['id']}", {"hub": v.get("home"), "name": link["name"], "url": None, "since": db.now(), "fromVault": True})
            return row
    # sealed copies kept on this PC itself
    for v in db.all_rows("SELECT * FROM team_vault WHERE owner = ?", (uname.lower(),)):
        try:
            data = json.loads(zlib.decompress(unseal(key, bytes(v["blob"]))).decode("utf-8"))
        except Exception:
            continue
        row = _make_user(uname, password, {})
        autosync.apply(row["id"], data)
        db.set_server_setting(f"teamhome_{row['id']}", {"hub": v["home"], "name": None, "url": None, "since": db.now(), "fromVault": True})
        return row
    return None


def _make_user(uname, password, u):
    display = str(u.get("displayName") or uname)[:60]
    email = u.get("email") if isinstance(u.get("email"), str) and auth.EMAIL_RE.match(u.get("email") or "") else None
    cur = db.q("INSERT INTO users(username, display_name, email, password_hash, role, created_at) VALUES(?,?,?,?, 'member', ?)",
               (uname, display, email, auth.hash_password(password), db.now()))
    uid = cur.lastrowid
    if isinstance(u.get("avatar"), str) and len(u["avatar"]) <= 80:
        db.q("UPDATE users SET avatar = ? WHERE id = ?", (u["avatar"], uid))
    db.q("INSERT OR IGNORE INTO prefs(user_id, data, updated_at) VALUES(?, '{}', ?)", (uid, db.now()))
    return db.one("SELECT * FROM users WHERE id = ?", (uid,))


# ── what the connected PCs ask this one ──
def peer_login(req, _):
    from . import autosync, hublink
    from .api import ApiError
    link = hublink._peer_auth(req, "/api/hublink/peer/login")
    b = req.json() or {}
    uname = str(b.get("username") or "")[:64]
    key = f"teamlogin:{link['remote_id']}:{uname.lower()}"
    if auth.throttled(key):
        raise ApiError(429, "For mange forsøg.", "throttled")
    try:
        password = unseal(_link_key(link, "login"), base64.b64decode(str(b.get("p") or ""))).decode("utf-8")
    except Exception:
        raise ApiError(400, "Ugyldig forespørgsel.", "invalid")
    row = db.one("SELECT * FROM users WHERE username = ?", (uname,))
    if not row or row["role"] == "guest" or not auth.verify_password(password, row["password_hash"]):
        auth.record_failure(key)
        return 200, {"ok": False}
    auth.clear_failures(key)
    tok = autosync.create_token(row["id"], f"{str(b.get('label') or link['name'])[:60]} (teamnet)")
    remember(row, password)
    return 200, {"ok": True, "token": tok, "user": {"displayName": row["display_name"], "avatar": row["avatar"], "email": row["email"]}}


def peer_vault_put(req, _):
    from . import hublink
    from .api import ApiError
    link = hublink._peer_auth(req, "/api/hublink/peer/vault/put")
    b = req.json() or {}
    owner, home = str(b.get("owner") or "").lower()[:64], str(b.get("home") or "")[:32]
    if not auth.USERNAME_RE.match(owner) or home != link["remote_id"]:
        raise ApiError(400, "Ugyldig.", "invalid")
    try:
        blob = base64.b64decode(str(b.get("blob") or ""))
    except Exception:
        raise ApiError(400, "Ugyldig.", "invalid")
    if not blob.startswith(MAGIC) or len(blob) > VAULT_MAX:
        raise ApiError(413, "For stor.", "too_big")
    db.q("INSERT INTO team_vault(owner, home, blob, size, updated_at) VALUES(?,?,?,?,?) "
         "ON CONFLICT(owner, home) DO UPDATE SET blob = excluded.blob, size = excluded.size, updated_at = excluded.updated_at",
         (owner, home, blob, len(blob), db.now()))
    return 200, {"ok": True}


def peer_vault_get(req, _):
    from . import hublink
    hublink._peer_auth(req, "/api/hublink/peer/vault/get")
    owner = str((req.json() or {}).get("owner") or "").lower()[:64]
    rows = db.all_rows("SELECT home, blob, updated_at FROM team_vault WHERE owner = ? ORDER BY updated_at DESC LIMIT 3", (owner,))
    return 200, {"vaults": [{"home": r["home"], "at": r["updated_at"], "blob": base64.b64encode(bytes(r["blob"])).decode("ascii")} for r in rows]}


def status(req, _):
    """For Indstillinger: where my data lives and how many PCs keep a sealed copy."""
    from .api import require_user
    from . import autosync, hublink
    u = require_user(req)
    home = db.get_server_setting(f"teamhome_{u['id']}")
    sent = db.get_server_setting(f"teamvault_sent_{u['id']}")
    pcs = [{"name": r["name"], "url": r["url"]} for r in _links()]
    held = db.one("SELECT COUNT(DISTINCT owner) AS n FROM team_vault")
    return 200, {"me": hublink.hub_name(), "pcs": pcs, "home": home, "sync": autosync.public_status(autosync.get_config(u["id"])),
                 "sealed": sent, "keeping": held["n"] if held else 0, "protected": u["id"] in _keys}


ROUTES = [
    ("POST", r"/api/hublink/peer/login", peer_login),
    ("POST", r"/api/hublink/peer/vault/put", peer_vault_put),
    ("POST", r"/api/hublink/peer/vault/get", peer_vault_get),
    ("GET", r"/api/teamnet", status),
]


def loop():
    """Every 20 minutes: a fresh sealed copy for everyone logged in on this PC."""
    while True:
        time.sleep(20 * 60)
        with _lock:
            uids = list(_keys)
        for uid in uids:
            try:
                push_vault(uid)
            except Exception:
                pass


def install(api_module):
    import re
    install_db()
    if not getattr(api_module, "_teamnet_installed", False):
        api_module.COMPILED.extend((m, re.compile("^" + p + "$"), h) for m, p, h in ROUTES)
        api_module._teamnet_installed = True


def start():
    threading.Thread(target=loop, daemon=True, name="teamnet").start()
