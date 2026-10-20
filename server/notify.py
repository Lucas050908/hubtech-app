"""Notifications that reach you when HUBTECH is closed.

* An inbox per user (table notifications). Everything worth telling – a DM, an @mention, a friend request, a snap,
  a calendar invitation, a report, a call – lands here as well as on the live bus.
* Web push (browsers and an iPhone with HUBTECH on the home screen): the server sends an empty push signed with its
  own VAPID key (server/p256.py), and the service worker fetches the text from the inbox. Empty pushes need no
  payload encryption, so no third-party packages are needed.
* The Android app checks the inbox in the background (JobScheduler) when it is connected to a shared server.
* E-mail: a short summary of what you missed, sent with smtplib when you haven't been online for a while.

Things you see live in the open app are marked "seen", so they don't come again by push or mail.
"""
import base64
import hashlib
import json
import os
import queue
import re
import smtplib
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from . import db, live, p256
from .api import ApiError, body_str, require_owner, require_user

KINDS = ("dm", "mention", "friend", "snap", "calendar", "report", "call", "announce")
LIVE_KIND = {"friend": "friend", "snap": "snap", "cal-invite": "calendar", "report": "report", "announce": "announce", "admin": "announce"}
DEFAULT_PREFS = {"kinds": {k: True for k in KINDS}, "email": False, "emailDelay": 15}
# push services of the browsers – the server never sends to any other host (no SSRF through a fake subscription)
PUSH_HOSTS = re.compile(r"^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|"
                        r"push\.services\.mozilla\.com|[a-z0-9.-]*\.push\.apple\.com|[a-z0-9.-]*\.notify\.windows\.com)$")
KEEP_DAYS = 30
MAIL_GAP = 15 * 60          # at most one mail per person per 15 minutes

_push_q = queue.Queue()
_started = [False]


# ── preferences ──
def prefs(uid):
    r = db.one("SELECT data FROM notify_prefs WHERE user_id = ?", (uid,))
    p = json.loads(json.dumps(DEFAULT_PREFS))
    if r:
        try:
            v = json.loads(r["data"])
            p["kinds"].update({k: bool(x) for k, x in (v.get("kinds") or {}).items() if k in KINDS})
            p["email"] = bool(v.get("email", False))
            p["emailDelay"] = int(v.get("emailDelay", 15)) if int(v.get("emailDelay", 15)) in (5, 15, 60, 240) else 15
        except (ValueError, TypeError, AttributeError):
            pass
    return p


# ── delivering ──
def deliver(users, kind, title, text="", path="/", *, push=True):
    """Put a notification in the inbox of each user (who wants this kind) and push it to their devices."""
    title, text, path = str(title)[:120], str(text or "")[:300], str(path or "/")[:200]
    if not path.startswith("/"):
        path = "/"
    sent = []
    for uid in {int(u) for u in users if u}:
        if not prefs(uid)["kinds"].get(kind, True):
            continue
        seen = 1 if live.online(uid, 40) else 0       # the open app shows it right away
        db.q("INSERT INTO notifications(user_id, kind, title, text, path, created_at, seen) VALUES(?,?,?,?,?,?,?)",
             (uid, kind, title, text, path, db.now(), seen))
        sent.append(uid)
        if push and (not seen or kind == "call"):
            _push_q.put(uid)
    _ensure_worker()
    return sent


def _on_live(users, payload):
    """Hook on the live bus: turns the events the app already sends into notifications."""
    t = payload.get("type")
    if t == "notify":
        deliver(users, LIVE_KIND.get(payload.get("kind"), "friend"), payload.get("title", "HUBTECH"), payload.get("text", ""), payload.get("path", "/"))
    elif t == "msg":
        m = payload.get("message") or {}
        sender = (m.get("user") or {})
        body = m.get("body") or ("Sendte en fil" if m.get("file") else "Delte noget")
        ch = str(payload.get("channel") or "")
        rest = [u for u in users if u != sender.get("id")]
        if ch.startswith("dm-"):
            deliver(rest, "dm", sender.get("name", "Ny besked"), body[:140], f"/apps/community/dm/{ch}")
        else:
            ment = [u for u in payload.get("mentions") or [] if u in rest]
            if ment:
                deliver(ment, "mention", f"{sender.get('name', 'Nogen')} nævnte dig", body[:140], f"/apps/community/c/{ch}")
    elif t == "call-ring":
        who = (payload.get("from") or {}).get("name", "Nogen")
        deliver(users, "call", f"{who} ringer", "Videoopkald – åbn HUBTECH for at svare" if payload.get("video") else "Åbn HUBTECH for at svare",
                "/apps/community/friends")


def missed_call(users, caller_name):
    deliver(users, "call", "Ubesvaret opkald", f"{caller_name} ringede til dig.", "/apps/community/friends", push=True)


# ── web push ──
def _b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def vapid():
    """(private int, public key bytes) – made once and kept in server_settings."""
    v = db.get_server_setting("vapid")
    if v and v.get("d"):
        d = int(v["d"], 16)
        return d, base64.b64decode(v["pub"])
    d, pub = p256.new_key()
    db.set_server_setting("vapid", {"d": format(d, "x"), "pub": base64.b64encode(pub).decode()})
    return d, pub


def _vapid_header(endpoint):
    d, pub = vapid()
    u = urllib.parse.urlsplit(endpoint)
    owner = db.one("SELECT email FROM users WHERE role = 'owner' AND email IS NOT NULL LIMIT 1")
    claims = {"aud": f"{u.scheme}://{u.netloc}", "exp": int(time.time()) + 12 * 3600,
              "sub": f"mailto:{owner['email']}" if owner else "mailto:hubtech@example.com"}
    head = _b64u(json.dumps({"typ": "JWT", "alg": "ES256"}, separators=(",", ":")).encode())
    body = _b64u(json.dumps(claims, separators=(",", ":")).encode())
    sig = _b64u(p256.sign(d, f"{head}.{body}".encode()))
    return f"vapid t={head}.{body}.{sig}, k={_b64u(pub)}"


def valid_endpoint(ep):
    try:
        u = urllib.parse.urlsplit(ep)
    except ValueError:
        return False
    return u.scheme == "https" and bool(PUSH_HOSTS.match((u.hostname or "").lower())) and len(ep) < 1000


def send_push(endpoint):
    """One empty push. Returns the HTTP status (or 0 when the push service can't be reached)."""
    if not valid_endpoint(endpoint):
        return 400
    req = urllib.request.Request(endpoint, data=b"", method="POST",
                                 headers={"TTL": "86400", "Urgency": "high", "Content-Length": "0", "Authorization": _vapid_header(endpoint)})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except (urllib.error.URLError, OSError, ValueError):
        return 0


def _push_user(uid):
    for s in db.all_rows("SELECT id, endpoint FROM push_subs WHERE user_id = ?", (uid,)):
        st = send_push(s["endpoint"])
        if st in (404, 410, 400, 403):            # gone or not ours any more
            db.q("DELETE FROM push_subs WHERE id = ?", (s["id"],))


# ── e-mail ──
def smtp_config():
    """The owner's mail server; HUBTECH_SMTP_* in the environment wins over what is saved in Indstillinger."""
    c = db.get_server_setting("smtp", {}) or {}
    env = {"host": "HUBTECH_SMTP_HOST", "port": "HUBTECH_SMTP_PORT", "user": "HUBTECH_SMTP_USER", "password": "HUBTECH_SMTP_PASSWORD",
           "sender": "HUBTECH_SMTP_FROM", "security": "HUBTECH_SMTP_SECURITY", "baseUrl": "HUBTECH_PUBLIC_URL"}
    out = {k: c.get(k, "") for k in env}
    fromenv = False
    for k, e in env.items():
        if os.environ.get(e):
            out[k], fromenv = os.environ[e], True
    try:
        out["port"] = int(out.get("port") or 0) or (465 if out.get("security") == "ssl" else 587)
    except ValueError:
        out["port"] = 587
    out["security"] = out.get("security") if out.get("security") in ("starttls", "ssl", "none") else "starttls"
    out["fromEnv"] = fromenv
    return out


def send_mail(to, subject, text, html_body=None):
    c = smtp_config()
    if not c["host"]:
        raise ApiError(400, "Der er ikke sat en mailserver op endnu.", "no_smtp")
    msg = EmailMessage()
    sender = c["sender"] or c["user"]
    msg["From"] = formataddr(("HUBTECH", sender)) if "<" not in sender else sender
    msg["To"] = to
    msg["Subject"] = subject
    msg["Message-ID"] = make_msgid(domain=(sender.split("@")[-1].strip(">") or "hubtech"))
    msg.set_content(text)
    if html_body:
        msg.add_alternative(html_body, subtype="html")
    ctx = ssl.create_default_context()
    if c["security"] == "ssl":
        s = smtplib.SMTP_SSL(c["host"], c["port"], timeout=20, context=ctx)
    else:
        s = smtplib.SMTP(c["host"], c["port"], timeout=20)
    try:
        s.ehlo()
        if c["security"] == "starttls":
            s.starttls(context=ctx)
            s.ehlo()
        if c["user"]:
            s.login(c["user"], c["password"])
        s.send_message(msg)
    finally:
        try:
            s.quit()
        except Exception:
            pass


def _esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def digest_mail(name, rows, base):
    n = len(rows)
    subject = "1 ny ting i HUBTECH" if n == 1 else f"{n} nye ting i HUBTECH"
    link = (base.rstrip("/") + "/#") if base else ""
    lines = [f"Hej {name}", "", "Det her er sket, mens du ikke var i HUBTECH:", ""]
    for r in rows[:20]:
        lines.append(f"• {r['title']}" + (f" – {r['text']}" if r["text"] else ""))
    if n > 20:
        lines.append(f"… og {n - 20} mere")
    if link:
        lines += ["", f"Åbn HUBTECH: {link}{rows[-1]['path']}"]
    lines += ["", "Du kan slå mails fra under Indstillinger → Apps og opkald."]
    items = "".join(f"<li style=\"margin:0 0 8px\"><b>{_esc(r['title'])}</b>" + (f"<br><span style=\"color:#5b6b80\">{_esc(r['text'])}</span>" if r["text"] else "") + "</li>" for r in rows[:20])
    html_body = (f"<div style=\"font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;color:#14202e\">"
                 f"<h2 style=\"margin:0 0 6px\">Hej {_esc(name)}</h2><p>Det her er sket, mens du ikke var i HUBTECH:</p>"
                 f"<ul style=\"padding-left:18px\">{items}</ul>" + (f"<p>… og {n - 20} mere</p>" if n > 20 else "")
                 + (f"<p><a href=\"{_esc(link + rows[-1]['path'])}\" style=\"display:inline-block;background:#2f6bff;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none\">Åbn HUBTECH</a></p>" if link else "")
                 + "<p style=\"color:#7a8797;font-size:13px\">Du kan slå mails fra under Indstillinger → Apps og opkald.</p></div>")
    return subject, "\n".join(lines), html_body


def mail_due():
    """Send the summaries that are due. Called every minute by the worker."""
    c = smtp_config()
    if not c["host"]:
        return 0
    now, sent = db.now(), 0
    for p in db.all_rows("SELECT p.user_id, p.data, p.last_mail, u.email, u.display_name FROM notify_prefs p JOIN users u ON u.id = p.user_id "
                         "WHERE u.email IS NOT NULL AND u.email != ''"):
        pr = prefs(p["user_id"])
        if not pr["email"]:
            continue
        uid = p["user_id"]
        if live.online(uid, 90):               # you're here – you've seen it in the app
            db.q("UPDATE notifications SET emailed = 1 WHERE user_id = ? AND emailed = 0", (uid,))
            continue
        rows = db.all_rows("SELECT * FROM notifications WHERE user_id = ? AND emailed = 0 AND seen = 0 ORDER BY id", (uid,))
        if not rows or rows[0]["created_at"] > now - pr["emailDelay"] * 60 or now - (p["last_mail"] or 0) < MAIL_GAP:
            continue
        subject, text, html_body = digest_mail(p["display_name"], rows, c["baseUrl"])
        try:
            send_mail(p["email"], subject, text, html_body)
        except Exception:
            continue
        db.q("UPDATE notifications SET emailed = 1 WHERE user_id = ? AND id <= ?", (uid, rows[-1]["id"]))
        db.q("UPDATE notify_prefs SET last_mail = ? WHERE user_id = ?", (now, uid))
        sent += 1
    return sent


def cleanup():
    db.q("DELETE FROM notifications WHERE created_at < ?", (db.now() - KEEP_DAYS * 86400,))


# ── worker thread: pushes right away, mails once a minute ──
def _worker():
    last_mail = 0.0
    while True:
        try:
            uid = _push_q.get(timeout=20)
        except queue.Empty:
            uid = None
        try:
            if uid is not None:
                pending = {uid}
                while not _push_q.empty():
                    pending.add(_push_q.get_nowait())
                for x in pending:
                    _push_user(x)
            if time.time() - last_mail > 60:
                last_mail = time.time()
                mail_due()
        except Exception:
            pass


def _ensure_worker():
    if not _started[0] and not os.environ.get("HUBTECH_NO_NOTIFY_WORKER"):
        _started[0] = True
        threading.Thread(target=_worker, daemon=True, name="hubtech-notify").start()


# ── API ──
def _out(r):
    return {"id": r["id"], "kind": r["kind"], "title": r["title"], "text": r["text"], "path": r["path"], "at": r["created_at"], "seen": bool(r["seen"])}


def get_prefs(req, _):
    u = require_user(req)
    c = smtp_config()
    return 200, {"prefs": prefs(u["id"]), "email": u["email"] or "", "mailReady": bool(c["host"]),
                 "pushKey": _b64u(vapid()[1]), "devices": db.one("SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?", (u["id"],))["n"]}


def put_prefs(req, _):
    u = require_user(req)
    b = req.json() or {}
    p = prefs(u["id"])
    if isinstance(b.get("kinds"), dict):
        p["kinds"].update({k: bool(v) for k, v in b["kinds"].items() if k in KINDS})
    if "email" in b:
        p["email"] = bool(b["email"])
        if p["email"] and not u["email"]:
            raise ApiError(400, "Skriv din e-mailadresse under Profil først.", "no_email")
    if "emailDelay" in b:
        try:
            d = int(b["emailDelay"])
        except (TypeError, ValueError):
            d = 15
        p["emailDelay"] = d if d in (5, 15, 60, 240) else 15
    db.q("INSERT INTO notify_prefs(user_id, data) VALUES(?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data", (u["id"], json.dumps(p)))
    return 200, {"prefs": p}


def inbox(req, _):
    """New notifications. ?since=N (the phone app) or ?sub=<hash> (a browser's service worker, which keeps no state)."""
    u = require_user(req)
    q = getattr(req, "query", {}) or {}
    sub = (q.get("sub") or [""])[0]
    since_raw = (q.get("since") or [""])[0]
    last = db.one("SELECT COALESCE(MAX(id), 0) AS m FROM notifications WHERE user_id = ?", (u["id"],))["m"]
    if sub:
        s = db.one("SELECT id, last_id FROM push_subs WHERE hash = ? AND user_id = ?", (sub, u["id"]))
        if not s:
            return 200, {"items": [], "last": last}
        since = s["last_id"]
        db.q("UPDATE push_subs SET last_id = ? WHERE id = ?", (last, s["id"]))
    else:
        try:
            since = int(since_raw)
        except ValueError:
            since = -1
        if since < 0:                              # first time: start from now
            return 200, {"items": [], "last": last}
    rows = db.all_rows("SELECT * FROM notifications WHERE user_id = ? AND id > ? AND seen = 0 ORDER BY id DESC LIMIT 10", (u["id"], since))
    return 200, {"items": [_out(r) for r in reversed(rows)], "last": last}


def recent(req, _):
    u = require_user(req)
    rows = db.all_rows("SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50", (u["id"],))
    return 200, {"items": [_out(r) for r in rows]}


def subscribe(req, _):
    u = require_user(req)
    b = req.json() or {}
    ep = body_str(b, "endpoint", 1000, required=True)
    if not valid_endpoint(ep):
        raise ApiError(400, "Den push-tjeneste kender HUBTECH ikke.", "bad_endpoint")
    h = hashlib.sha256(ep.encode()).hexdigest()
    last = db.one("SELECT COALESCE(MAX(id), 0) AS m FROM notifications WHERE user_id = ?", (u["id"],))["m"]
    db.q("INSERT INTO push_subs(user_id, endpoint, hash, last_id, created_at) VALUES(?,?,?,?,?) "
         "ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, last_id = excluded.last_id", (u["id"], ep, h, last, db.now()))
    return 200, {"ok": True, "sub": h}


def unsubscribe(req, _):
    u = require_user(req)
    b = req.json() or {}
    ep = body_str(b, "endpoint", 1000)
    db.q("DELETE FROM push_subs WHERE user_id = ? AND endpoint = ?", (u["id"], ep))
    return 200, {"ok": True}


def test(req, _):
    u = require_user(req)
    b = req.json() or {}
    if b.get("email"):
        if not u["email"]:
            raise ApiError(400, "Skriv din e-mailadresse under Profil først.", "no_email")
        try:
            send_mail(u["email"], "Test fra HUBTECH", f"Hej {u['display_name']}\n\nMails fra HUBTECH virker. 🎉\n",
                      f"<p>Hej {_esc(u['display_name'])}</p><p>Mails fra HUBTECH virker. 🎉</p>")
        except ApiError:
            raise
        except (smtplib.SMTPAuthenticationError,) as e:
            raise ApiError(400, "Mailserveren afviste brugernavn eller adgangskode. Hos Gmail og Outlook skal du bruge en app-adgangskode.", "smtp_auth") from e
        except Exception as e:
            raise ApiError(502, f"Mailen kunne ikke sendes: {e}", "smtp_failed") from e
        return 200, {"ok": True, "to": u["email"]}
    # a test notification – marked unseen so it also reaches the phone and the browser's push
    db.q("INSERT INTO notifications(user_id, kind, title, text, path, created_at, seen) VALUES(?,?,?,?,?,?,0)",
         (u["id"], "friend", "Test fra HUBTECH", "Notifikationer virker på denne enhed. 🎉", "/settings/apps", db.now()))
    _push_q.put(u["id"])
    _ensure_worker()
    return 200, {"ok": True, "devices": db.one("SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?", (u["id"],))["n"]}


def get_smtp(req, _):
    require_owner(req)
    c = smtp_config()
    return 200, {"host": c["host"], "port": c["port"], "user": c["user"], "sender": c["sender"], "security": c["security"],
                 "baseUrl": c["baseUrl"], "hasPassword": bool(c["password"]), "fromEnv": c["fromEnv"]}


def put_smtp(req, _):
    require_owner(req)
    b = req.json() or {}
    cur = db.get_server_setting("smtp", {}) or {}
    new = {"host": body_str(b, "host", 200), "user": body_str(b, "user", 200), "sender": body_str(b, "sender", 200),
           "security": body_str(b, "security", 10) or "starttls", "baseUrl": body_str(b, "baseUrl", 300)}
    try:
        new["port"] = int(b.get("port") or 0) or ""
    except (TypeError, ValueError):
        raise ApiError(400, "Porten skal være et tal.", "invalid", {"field": "port"})
    if new["security"] not in ("starttls", "ssl", "none"):
        new["security"] = "starttls"
    if new["baseUrl"] and not re.match(r"^https?://[^\s/]+", new["baseUrl"]):
        raise ApiError(400, "Adressen skal starte med https://", "invalid", {"field": "baseUrl"})
    pw = b.get("password")
    new["password"] = cur.get("password", "") if pw is None else str(pw)[:300]
    db.set_server_setting("smtp", new)
    return get_smtp(req, None)


ROUTES = [
    ("GET", r"/api/notify/prefs", get_prefs),
    ("PUT", r"/api/notify/prefs", put_prefs),
    ("GET", r"/api/notify/inbox", inbox),
    ("GET", r"/api/notify/recent", recent),
    ("POST", r"/api/notify/push", subscribe),
    ("POST", r"/api/notify/push/remove", unsubscribe),
    ("POST", r"/api/notify/test", test),
    ("GET", r"/api/notify/smtp", get_smtp),
    ("PUT", r"/api/notify/smtp", put_smtp),
]


def install(api_module):
    if not getattr(api_module, "_notify_installed", False):
        api_module.COMPILED.extend((m, re.compile("^" + p + "$"), h) for m, p, h in ROUTES)
        api_module._notify_installed = True
    live.add_hook(_on_live)
