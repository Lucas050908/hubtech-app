"""
Automatic two-way sync between two HUBTECH servers (typically the phone app ⇄ the computer).

How it works
- The phone logs in to the computer once and gets a *sync key* (a random token, stored only as a hash
  on the computer). The password is never stored.
- Every few minutes (and when the app is opened) the phone compares timestamps per app-data key and per
  Office document with the computer, pulls what is newer there, and pushes what is newer here.
  Images are immutable and follow by id. Timestamps are copied along, so after a sync both sides agree and
  nothing bounces back and forth.
- If the same app was changed on both devices, the two versions are *merged*: lists of items with an "id"
  (tasks, notes, events, customers, cards, time entries …) are combined item by item – the newest item wins,
  and an item that was there at the last sync but is now gone on one side counts as deleted. Everything else
  (and Office documents) follows "newest wins". Daily automatic backups exist on both sides.
"""
import hashlib
import json
import secrets
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

from . import db

CHUNK_ITEMS = 25          # states / documents per request
CHUNK_FILES = 8           # images per request
INTERVALS = (5, 15, 60)   # minutes


class SyncError(Exception):
    pass


# ── sync keys (stored on the computer that is synced *to*) ──
def _h(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_token(uid, label=""):
    tok = secrets.token_urlsafe(32)
    db.set_server_setting(f"synctok_{_h(tok)}", {"uid": uid, "label": str(label)[:80], "created": db.now()})
    return tok


def user_for_token(tok):
    if not tok or len(tok) > 200:
        return None
    rec = db.get_server_setting(f"synctok_{_h(tok)}")
    if not isinstance(rec, dict) or rec.get("revoked"):
        return None
    return db.one("SELECT * FROM users WHERE id = ?", (rec.get("uid"),))


def revoke_token(tok):
    rec = db.get_server_setting(f"synctok_{_h(tok)}")
    if isinstance(rec, dict):
        rec["revoked"] = db.now()
        db.set_server_setting(f"synctok_{_h(tok)}", rec)


# ── what this server has ──
def manifest(uid):
    rows = db.all_rows("SELECT app_id, data, updated_at FROM app_state WHERE user_id = ?", (uid,))
    states = {r["app_id"]: r["updated_at"] for r in rows}
    hashes = {r["app_id"]: hashlib.sha1(r["data"].encode("utf-8")).hexdigest()[:16] for r in rows}
    office = {r["id"]: r["updated_at"] for r in db.all_rows("SELECT id, updated_at FROM office_docs WHERE user_id = ?", (uid,))}
    files = [r["id"] for r in db.all_rows("SELECT id FROM office_files WHERE user_id = ?", (uid,))]
    return {"states": states, "stateHashes": hashes, "office": office, "files": files}


def fetch(uid, want):
    """A partial export (same format as /api/me/export) with the requested keys and their timestamps."""
    from . import api
    out = {"format": api.EXPORT_FORMAT, "version": 1, "app": "HUBTECH", "states": {}, "stateTimes": {}, "office": [], "files": []}
    ids = [str(x) for x in (want.get("states") or [])][:500]
    for app_id in ids:
        r = db.one("SELECT data, updated_at FROM app_state WHERE user_id = ? AND app_id = ?", (uid, app_id))
        if r:
            out["states"][app_id] = json.loads(r["data"])
            out["stateTimes"][app_id] = r["updated_at"]
    for doc_id in [str(x) for x in (want.get("office") or [])][:500]:
        r = db.one("SELECT * FROM office_docs WHERE user_id = ? AND id = ?", (uid, doc_id))
        if r:
            out["office"].append(api._office_row(r, with_data=True))
    import base64
    for fid in [str(x) for x in (want.get("files") or [])][:100]:
        f = db.one("SELECT id, name, mime, data FROM office_files WHERE user_id = ? AND id = ?", (uid, fid))
        if f:
            out["files"].append({"id": f["id"], "name": f["name"], "mime": f["mime"], "data": base64.b64encode(bytes(f["data"])).decode("ascii")})
    return out


def apply(uid, data):
    from . import api
    return api._import_data(uid, data, keep_times=True, quiet=True)


# ── talking to the other HUBTECH ──
class Remote:
    def __init__(self, url, token):
        self.url, self.token = url.rstrip("/"), token

    def call(self, method, path, body=None, timeout=60):
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(self.url + path, data=data, method=method, headers={
            "X-Requested-With": "hubtech", "Content-Type": "application/json", "Accept": "application/json", "X-Hubtech-Sync": self.token})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise SyncError("Computeren kender ikke længere denne enhed – slå automatisk synkronisering til igen.")
            raise SyncError(f"Computeren svarede med fejl {e.code}.")
        except (urllib.error.URLError, OSError, ValueError) as e:
            raise SyncError(f"Kunne ikke nå {self.url} ({getattr(e, 'reason', e)}).")


def _chunks(xs, n):
    xs = list(xs)
    for i in range(0, len(xs), n):
        yield xs[i:i + n]


# ── merging two versions of the same app-data ──
def _stamp(x):
    for k in ("updated", "updatedAt", "updated_at", "modified", "at"):
        v = x.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return v
    return None


def _id_list(v):
    return isinstance(v, list) and all(isinstance(x, dict) and isinstance(x.get("id"), (str, int)) and not isinstance(x.get("id"), bool) for x in v)


def merge_state(local, remote, local_newer, base=None):
    """Pure: merge two versions of one app's data. Returns (merged, new_base).
    base = {list key: [ids both sides had after the last sync]} – used to tell "deleted" from "new"."""
    base = base or {}
    if not (isinstance(local, dict) and isinstance(remote, dict)):
        return (local if local_newer else remote), {}
    newer, older = (local, remote) if local_newer else (remote, local)
    out = dict(older)
    out.update(newer)
    new_base = {}
    for k in set(local) | set(remote):
        a, b = local.get(k), remote.get(k)
        if not (_id_list(a) and _id_list(b)) or (not a and not b):
            continue
        was = {str(i) for i in base.get(k, [])}
        ma = {str(x["id"]): x for x in a}
        mb = {str(x["id"]): x for x in b}
        first, second = (a, b) if local_newer else (b, a)
        order = list(dict.fromkeys([str(x["id"]) for x in first] + [str(x["id"]) for x in second]))
        merged = []
        for i in order:
            xa, xb = ma.get(i), mb.get(i)
            if xa is not None and xb is not None:
                ta, tb = _stamp(xa), _stamp(xb)
                if ta is not None and tb is not None and ta != tb:
                    merged.append(xa if ta > tb else xb)
                else:
                    merged.append(xa if local_newer else xb)
            elif i in was:
                continue                      # it was synced before and is now gone on one side → deleted
            else:
                merged.append(xa if xa is not None else xb)   # new on one side
        out[k] = merged
        new_base[k] = [x["id"] for x in merged]
    return out, new_base


def plan(local, remote):
    """Pure: which keys to pull and push, from two manifests (exported for tests).
    App-data is compared by content hash when both sides send one – so two different versions saved in the
    same second are still noticed (they end up in both lists and get merged)."""
    def newer(a, b):
        return sorted(k for k, t in a.items() if t > b.get(k, -1))
    lh, rh = local.get("stateHashes"), remote.get("stateHashes")
    ls, rs = local["states"], remote["states"]
    if lh is not None and rh is not None:
        diff = {k for k in set(ls) & set(rs) if lh.get(k) != rh.get(k)}
        pull_s = sorted({k for k in rs if k not in ls} | {k for k in diff if rs[k] >= ls[k]})
        push_s = sorted({k for k in ls if k not in rs} | {k for k in diff if ls[k] >= rs[k]})
    else:
        pull_s, push_s = newer(rs, ls), newer(ls, rs)
    lf, rf = set(local.get("files") or []), set(remote.get("files") or [])
    return {
        "pull": {"states": pull_s, "office": newer(remote["office"], local["office"]), "files": sorted(rf - lf)},
        "push": {"states": push_s, "office": newer(local["office"], remote["office"]), "files": sorted(lf - rf)},
    }


def _bases(uid):
    b = db.get_server_setting(f"autosync_base_{uid}")
    return b if isinstance(b, dict) else {}


def run(uid, remote=None):
    """One sync round for a user. Returns a summary and stores it as the status."""
    cfg = get_config(uid)
    if not cfg and remote is None:
        raise SyncError("Automatisk synkronisering er ikke slået til.")
    remote = remote or Remote(cfg["url"], cfg["token"])
    started = time.time()
    try:
        rm = remote.call("GET", "/api/sync/manifest", timeout=20)
        lm = manifest(uid)
        p = plan(lm, rm)
        pulled = pushed = merged = 0
        # images first, so documents that reference them are complete
        for part in _chunks(p["pull"]["files"], CHUNK_FILES):
            apply(uid, remote.call("POST", "/api/sync/fetch", {"files": part}, timeout=120)); pulled += len(part)
        for part in _chunks(p["push"]["files"], CHUNK_FILES):
            remote.call("POST", "/api/sync/apply", fetch(uid, {"files": part}), timeout=120); pushed += len(part)
        # app-data that only one side has → copy; changed on both → merge and write the same result to both
        both = sorted(set(p["pull"]["states"] + p["push"]["states"]) & set(lm["states"]) & set(rm["states"]))
        only_remote = [k for k in p["pull"]["states"] if k not in both]
        only_local = [k for k in p["push"]["states"] if k not in both]
        for part in _chunks(only_remote, CHUNK_ITEMS):
            apply(uid, remote.call("POST", "/api/sync/fetch", {"states": part}, timeout=120)); pulled += len(part)
        for part in _chunks(only_local, CHUNK_ITEMS):
            remote.call("POST", "/api/sync/apply", fetch(uid, {"states": part}), timeout=120); pushed += len(part)
        bases = _bases(uid)
        for part in _chunks(both, CHUNK_ITEMS):
            theirs = remote.call("POST", "/api/sync/fetch", {"states": part}, timeout=120)
            mine = fetch(uid, {"states": part})
            out = dict(mine, states={}, stateTimes={}, office=[], files=[])
            ts = db.now()
            for k in part:
                if k not in theirs["states"] or k not in mine["states"]:
                    continue
                m, nb = merge_state(mine["states"][k], theirs["states"][k], lm["states"][k] >= rm["states"][k], bases.get(k))
                out["states"][k] = m
                out["stateTimes"][k] = max(ts, lm["states"][k], rm["states"][k])
                bases[k] = nb
                merged += 1
            if out["states"]:
                apply(uid, out)
                remote.call("POST", "/api/sync/apply", out, timeout=120)
        # remember which items both sides now have, also for app-data that was simply copied
        for k in only_remote + only_local:
            st = db.one("SELECT data FROM app_state WHERE user_id = ? AND app_id = ?", (uid, k))
            if st:
                d = json.loads(st["data"])
                if isinstance(d, dict):
                    bases[k] = {lk: [x["id"] for x in lv] for lk, lv in d.items() if _id_list(lv) and lv}
        db.set_server_setting(f"autosync_base_{uid}", bases)
        # Office documents: newest wins
        for part in _chunks(p["pull"]["office"], CHUNK_ITEMS):
            apply(uid, remote.call("POST", "/api/sync/fetch", {"office": part}, timeout=120)); pulled += len(part)
        for part in _chunks(p["push"]["office"], CHUNK_ITEMS):
            remote.call("POST", "/api/sync/apply", fetch(uid, {"office": part}), timeout=120); pushed += len(part)
        res = {"ok": True, "at": db.now(), "pulled": pulled + merged, "pushed": pushed + merged, "merged": merged, "ms": int((time.time() - started) * 1000)}
    except SyncError as e:
        res = {"ok": False, "at": db.now(), "error": str(e)}
    except Exception as e:  # never let a sync crash the server
        res = {"ok": False, "at": db.now(), "error": f"Uventet fejl: {e}"}
    if cfg:
        cfg["last"] = res
        db.set_server_setting(f"autosync_{uid}", cfg)
    return res


# ── configuration on the device that syncs (the phone) ──
def get_config(uid):
    c = db.get_server_setting(f"autosync_{uid}")
    return c if isinstance(c, dict) and c.get("url") and c.get("token") else None


def save_config(uid, url, token, interval):
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise SyncError("Ugyldig adresse.")
    cfg = {"url": url.rstrip("/"), "token": token, "interval": interval if interval in INTERVALS else 15, "since": db.now(), "last": None}
    db.set_server_setting(f"autosync_{uid}", cfg)
    return cfg


def disable(uid):
    cfg = get_config(uid)
    if cfg:
        try:
            Remote(cfg["url"], cfg["token"]).call("DELETE", "/api/sync/token", timeout=8)
        except Exception:
            pass
    db.set_server_setting(f"autosync_{uid}", None)
    db.set_server_setting(f"autosync_base_{uid}", None)


def public_status(cfg):
    if not cfg:
        return {"enabled": False}
    return {"enabled": True, "url": cfg["url"], "interval": cfg.get("interval", 15), "since": cfg.get("since"), "last": cfg.get("last")}


_lock = threading.Lock()
_running = set()


def run_async(uid):
    """Run a sync for this user in the background unless one is already running."""
    with _lock:
        if uid in _running:
            return False
        _running.add(uid)

    def go():
        try:
            run(uid)
        finally:
            with _lock:
                _running.discard(uid)
    threading.Thread(target=go, name=f"hubtech-sync-{uid}", daemon=True).start()
    return True


def loop():
    """Background thread: every minute, sync the users whose interval has passed."""
    while True:
        time.sleep(60)
        try:
            for r in db.all_rows("SELECT key, value FROM server_settings WHERE key LIKE 'autosync_%'"):
                try:
                    cfg = json.loads(r["value"])
                    uid = int(r["key"].split("_", 1)[1])
                except (ValueError, TypeError):
                    continue
                if not isinstance(cfg, dict) or not cfg.get("token"):
                    continue
                last = (cfg.get("last") or {}).get("at") or 0
                if db.now() - last >= int(cfg.get("interval", 15)) * 60:
                    run_async(uid)
        except Exception:
            pass
