"""Errors from the browsers (the AI engine, uncaught script errors) – kept on the server so problems on users'
devices can be found and fixed. Only technical text is stored: no conversation, no form data, no passwords.
Shown in Admin → Fejl. Max 500 rows; each device can send at most 30 per 10 minutes.
"""
import json
import re
import sys
import threading
import time

from . import db
from .adminapp import require_admin, log
from .api import ApiError

KEEP = 500
_rate = {}
_lock = threading.Lock()
SECRETISH = re.compile(r"(token|password|adgangskode|secret|session|cookie|authorization)[=:]\s*\S+", re.I)


def _clean(v, n):
    return SECRETISH.sub(r"\1=***", str(v or ""))[:n]


def report(req, _):
    ip = getattr(req, "visitor_ip", "") or getattr(req, "client_ip", "") or "?"
    now = time.time()
    with _lock:
        hits = [t for t in _rate.get(ip, []) if now - t < 600]
        if len(hits) >= 30:
            return 202, {"ok": False}
        hits.append(now)
        _rate[ip] = hits
        if len(_rate) > 5000:
            _rate.clear()
    b = req.json() or {}
    kind = re.sub(r"[^a-z0-9_-]", "", str(b.get("kind") or "js").lower())[:24] or "js"
    msg = _clean(b.get("message"), 500)
    if not msg:
        raise ApiError(400, "Tom fejl.", "invalid")
    extra = b.get("extra") if isinstance(b.get("extra"), dict) else {}
    extra = {str(k)[:30]: _clean(v, 200) for k, v in list(extra.items())[:12]}
    page = _clean(b.get("page"), 120)
    uid = req.user["id"] if getattr(req, "user", None) else None
    db.q("INSERT INTO client_errors(user_id, kind, message, page, extra, created_at) VALUES(?,?,?,?,?,?)",
         (uid, kind, msg, page, json.dumps(extra, ensure_ascii=False), db.now()))
    db.q("DELETE FROM client_errors WHERE id <= (SELECT MAX(id) FROM client_errors) - ?", (KEEP,))
    print(f"[browserfejl] {kind}: {msg[:160]}", file=sys.stderr, flush=True)
    return 202, {"ok": True}


def list_errors(req, _):
    require_admin(req)
    rows = db.all_rows("SELECT e.*, u.display_name AS name FROM client_errors e LEFT JOIN users u ON u.id = e.user_id ORDER BY e.id DESC LIMIT 200")
    out = []
    for r in rows:
        try:
            extra = json.loads(r["extra"] or "{}")
        except ValueError:
            extra = {}
        out.append({"id": r["id"], "kind": r["kind"], "message": r["message"], "page": r["page"], "extra": extra, "user": r["name"], "at": r["created_at"]})
    return 200, {"errors": out}


def clear_errors(req, _):
    u = require_admin(req)
    n = db.q("DELETE FROM client_errors").rowcount
    log(u["id"], "errors-clear", f"{n} fejl")
    return 200, {"ok": True}


ROUTES = [
    ("POST", r"/api/client-errors", report),
    ("GET", r"/api/admin/errors", list_errors),
    ("DELETE", r"/api/admin/errors", clear_errors),
]


def install(api_module):
    if not getattr(api_module, "_clientlog_installed", False):
        api_module.COMPILED.extend((m, re.compile("^" + p + "$"), h) for m, p, h in ROUTES)
        api_module._clientlog_installed = True
