"""Projektrum – projects with a conversation, tasks, a note, a shared code folder where every change carries a
description (like a commit on GitHub), and a website that can be published from the folder.

No server: every HUBTECH that one of the members uses keeps a full copy. Everything in a project is an event in an
append-only log (a message, a task change, a change to the code …). A PC that makes an event hands it to the
connected PCs at once (hublink), and every minute each PC also asks the others what it has missed – so a PC that
was off catches up, and a project lives on when its creator's PC is off. Events are only handed to a PC where one
of the project's members has an account. Calls in a project go through calls.py (room "p<project id>").
"""
import base64
import json
import re
import secrets
import threading
import time

from . import db, live
from .api import ApiError, body_str, require_user

PID_RE = re.compile(r"^[0-9a-f]{16}$")
EID_RE = re.compile(r"^[0-9a-f]{32}$")
PATH_RE = re.compile(r"^(?!/)(?!.*\.\.)(?!.*//)[A-Za-z0-9ÆØÅæøå _.\-/()+@]{1,160}$")
KINDS = ("project", "meta", "member", "msg", "msg-del", "task", "note", "commit", "review", "call")
TEXT_MAX = 4000
FILE_MAX = 512 * 1024
COMMIT_MAX = 4 * 1024 * 1024
FILES_MAX = 600
COLORS = ("#e8763a", "#8fb3d9", "#8fcf9b", "#c4a7e7", "#e8b46a", "#7fc4c4", "#e57b6a")
SITE_TYPES = {".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
              ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
              ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
              ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
              ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".pdf": "application/pdf"}
_lock = threading.RLock()
_push_q = []
_push_cond = threading.Condition()
_remote_users = {}        # remote hub id -> the usernames that live there (from its last pull)


def now_ms():
    return int(time.time() * 1000)


# ── storage ──
def install_db():
    db.q("CREATE TABLE IF NOT EXISTS pj_events(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, project TEXT NOT NULL, "
         "author TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL, hub TEXT NOT NULL DEFAULT '')")
    db.q("CREATE INDEX IF NOT EXISTS pj_events_p ON pj_events(project, seq)")
    db.q("CREATE TABLE IF NOT EXISTS pj_projects(id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'work', color TEXT NOT NULL DEFAULT '', "
         "customer TEXT NOT NULL DEFAULT '', deadline TEXT NOT NULL DEFAULT '', about TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at INTEGER NOT NULL, "
         "meta_ts INTEGER NOT NULL DEFAULT 0, review INTEGER NOT NULL DEFAULT 0, site INTEGER NOT NULL DEFAULT 0, site_public INTEGER NOT NULL DEFAULT 0, "
         "site_dir TEXT NOT NULL DEFAULT '', slug TEXT NOT NULL DEFAULT '', archived INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', note_ts INTEGER NOT NULL DEFAULT 0, "
         "note_by TEXT NOT NULL DEFAULT '')")
    db.q("CREATE TABLE IF NOT EXISTS pj_members(project TEXT NOT NULL, username TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'member', "
         "ts INTEGER NOT NULL, gone INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(project, username))")
    db.q("CREATE TABLE IF NOT EXISTS pj_tasks(id TEXT PRIMARY KEY, project TEXT NOT NULL, title TEXT NOT NULL, assignee TEXT NOT NULL DEFAULT '', due TEXT NOT NULL DEFAULT '', "
         "done INTEGER NOT NULL DEFAULT 0, gone INTEGER NOT NULL DEFAULT 0, ts INTEGER NOT NULL, by TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)")
    db.q("CREATE TABLE IF NOT EXISTS pj_commits(id TEXT PRIMARY KEY, project TEXT NOT NULL, title TEXT NOT NULL, descr TEXT NOT NULL, author TEXT NOT NULL, "
         "name TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL, files TEXT NOT NULL, needs_review INTEGER NOT NULL DEFAULT 0, approved_by TEXT NOT NULL DEFAULT '', "
         "changes_by TEXT NOT NULL DEFAULT '', ai_checked INTEGER NOT NULL DEFAULT 0, task TEXT NOT NULL DEFAULT '')")
    db.q("CREATE TABLE IF NOT EXISTS pj_files(project TEXT NOT NULL, path TEXT NOT NULL, content BLOB NOT NULL, b64 INTEGER NOT NULL DEFAULT 0, "
         "cid TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY(project, path))")
    db.q("CREATE TABLE IF NOT EXISTS pj_reads(project TEXT NOT NULL, user_id INTEGER NOT NULL, seq INTEGER NOT NULL, PRIMARY KEY(project, user_id))")


def _project(pid):
    if not PID_RE.match(str(pid or "")):
        raise ApiError(404, "Projektet findes ikke.", "not_found")
    p = db.one("SELECT * FROM pj_projects WHERE id = ?", (pid,))
    if not p:
        raise ApiError(404, "Projektet findes ikke.", "not_found")
    return p


def _is_member(pid, username):
    return bool(db.one("SELECT 1 FROM pj_members WHERE project = ? AND username = ? AND gone = 0", (pid, (username or "").lower())))


def _require_member(req, pid):
    u = require_user(req)
    p = _project(pid)
    if not _is_member(pid, u["username"]):
        raise ApiError(403, "Du er ikke med i projektet.", "forbidden")
    return u, p


def member_usernames(pid):
    return [r["username"] for r in db.all_rows("SELECT username FROM pj_members WHERE project = ? AND gone = 0", (pid,))]


def local_member_ids(pid):
    names = member_usernames(pid)
    if not names:
        return []
    rows = db.all_rows(f"SELECT id FROM users WHERE lower(username) IN ({','.join('?' * len(names))})", names)
    return [r["id"] for r in rows]


def _slug(name, pid):
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").lower().replace("æ", "ae").replace("ø", "oe").replace("å", "aa")).strip("-")[:40] or "projekt"
    return f"{s}-{pid[:4]}"


# ── the event log ──
def _clean_event(ev):
    """Check an event's shape (from this PC or another). Returns a clean dict or raises ValueError."""
    if not isinstance(ev, dict):
        raise ValueError("event")
    out = {"id": str(ev.get("id") or ""), "project": str(ev.get("project") or ""), "author": str(ev.get("author") or "").lower()[:64],
           "name": str(ev.get("name") or "")[:80], "ts": int(ev.get("ts") or 0), "kind": str(ev.get("kind") or ""), "hub": str(ev.get("hub") or "")[:32]}
    body = ev.get("body")
    if not EID_RE.match(out["id"]) or not PID_RE.match(out["project"]) or out["kind"] not in KINDS or not out["author"] or out["ts"] <= 0:
        raise ValueError("event")
    if not isinstance(body, dict) or len(json.dumps(body)) > COMMIT_MAX + 64 * 1024:
        raise ValueError("body")
    out["body"] = body
    return out


def apply(ev):
    """Store one event and update the project's tables. Returns the local seq, or 0 if it was already here."""
    ev = _clean_event(ev)
    with _lock:
        cur = db.q("INSERT OR IGNORE INTO pj_events(id, project, author, name, ts, kind, body, hub) VALUES(?,?,?,?,?,?,?,?)",
                   (ev["id"], ev["project"], ev["author"], ev["name"], ev["ts"], ev["kind"], json.dumps(ev["body"], separators=(",", ":")), ev["hub"]))
        if not cur.rowcount:
            return 0
        seq = cur.lastrowid
        _materialize(ev)
        if ev["kind"] == "project":
            # things that came before the project itself (another PC sent them first): apply them again now
            for r in db.all_rows("SELECT * FROM pj_events WHERE project = ? AND seq != ? AND kind != 'project' ORDER BY ts, id", (ev["project"], seq)):
                _materialize(_raw(r))
    return seq


def _materialize(ev):
    pid, b, ts, k = ev["project"], ev["body"], ev["ts"], ev["kind"]
    if k == "project":
        if not db.one("SELECT 1 FROM pj_projects WHERE id = ?", (pid,)):
            db.q("INSERT INTO pj_projects(id, name, kind, color, customer, deadline, about, created_by, created_at, meta_ts, review, slug) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                 (pid, str(b.get("name") or "Projekt")[:80], "code" if b.get("kind") == "code" else "work", str(b.get("color") or COLORS[0])[:9],
                  str(b.get("customer") or "")[:80], str(b.get("deadline") or "")[:10], str(b.get("about") or "")[:600], ev["author"], ts, ts,
                  1 if b.get("review") else 0, str(b.get("slug") or _slug(b.get("name"), pid))[:48]))
        _member(pid, ev["author"], ev["name"], "owner", ts, False)
        for m in b.get("members") or []:
            if isinstance(m, dict):
                _member(pid, str(m.get("username") or ""), str(m.get("name") or ""), "member", ts, False)
    elif k == "meta":
        p = db.one("SELECT meta_ts FROM pj_projects WHERE id = ?", (pid,))
        if p and ts >= p["meta_ts"]:
            fields = {"name": 80, "customer": 80, "deadline": 10, "about": 600, "color": 9, "site_dir": 120}
            sets, args = [], []
            for f, n in fields.items():
                if f in b:
                    sets.append(f"{f} = ?"); args.append(str(b[f] or "")[:n])
            for f in ("review", "site", "site_public", "archived"):
                if f in b:
                    sets.append(f"{f} = ?"); args.append(1 if b[f] else 0)
            if sets:
                db.q(f"UPDATE pj_projects SET {', '.join(sets)}, meta_ts = ? WHERE id = ?", (*args, ts, pid))
    elif k == "member":
        _member(pid, str(b.get("username") or ""), str(b.get("name") or ""), "member", ts, b.get("op") == "remove")
    elif k == "task":
        tid = str(b.get("tid") or "")
        if EID_RE.match(tid):
            row = db.one("SELECT ts FROM pj_tasks WHERE id = ?", (tid,))
            if not row:
                db.q("INSERT INTO pj_tasks(id, project, title, assignee, due, done, gone, ts, by, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                     (tid, pid, str(b.get("title") or "Opgave")[:200], str(b.get("assignee") or "").lower()[:64], str(b.get("due") or "")[:10],
                      1 if b.get("done") else 0, 1 if b.get("gone") else 0, ts, ev["author"], ts))
            elif ts >= row["ts"]:
                sets, args = ["ts = ?"], [ts]
                for f, n in (("title", 200), ("assignee", 64), ("due", 10)):
                    if f in b:
                        sets.append(f"{f} = ?"); args.append(str(b[f] or "")[:n].lower() if f == "assignee" else str(b[f] or "")[:n])
                for f in ("done", "gone"):
                    if f in b:
                        sets.append(f"{f} = ?"); args.append(1 if b[f] else 0)
                db.q(f"UPDATE pj_tasks SET {', '.join(sets)} WHERE id = ?", (*args, tid))
    elif k == "note":
        p = db.one("SELECT note_ts FROM pj_projects WHERE id = ?", (pid,))
        if p and ts >= p["note_ts"]:
            db.q("UPDATE pj_projects SET note = ?, note_ts = ?, note_by = ? WHERE id = ?", (str(b.get("text") or "")[:20000], ts, ev["name"] or ev["author"], pid))
    elif k == "commit":
        cid = str(b.get("cid") or ev["id"])
        files = b.get("files") if isinstance(b.get("files"), list) else []
        db.q("INSERT OR IGNORE INTO pj_commits(id, project, title, descr, author, name, ts, files, needs_review, ai_checked, task) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
             (cid, pid, str(b.get("title") or "")[:120], str(b.get("descr") or "")[:4000], ev["author"], ev["name"], ts, json.dumps(files, separators=(",", ":")),
              1 if b.get("needsReview") else 0, 1 if b.get("aiChecked") else 0, str(b.get("task") or "")[:32]))
        for f in files:
            if isinstance(f, dict):
                _refresh_file(pid, str(f.get("path") or ""))
    elif k == "review":
        c = db.one("SELECT * FROM pj_commits WHERE id = ?", (str(b.get("cid") or ""),))
        if c and ev["author"] != c["author"]:
            col = "approved_by" if b.get("state") == "approved" else "changes_by"
            names = set(filter(None, c[col].split(",")))
            names.add(ev["author"])
            db.q(f"UPDATE pj_commits SET {col} = ? WHERE id = ?", (",".join(sorted(names)), c["id"]))
            for f in json.loads(c["files"]):
                _refresh_file(pid, str(f.get("path") or ""))


def _member(pid, username, name, role, ts, gone):
    username = (username or "").lower()[:64]
    if not re.fullmatch(r"[a-z0-9._\-]{2,64}", username):
        return
    row = db.one("SELECT ts, role FROM pj_members WHERE project = ? AND username = ?", (pid, username))
    if not row:
        db.q("INSERT INTO pj_members(project, username, name, role, ts, gone) VALUES(?,?,?,?,?,?)", (pid, username, name[:80], role, ts, 1 if gone else 0))
    elif ts >= row["ts"]:
        db.q("UPDATE pj_members SET name = CASE WHEN ? = '' THEN name ELSE ? END, role = ?, ts = ?, gone = ? WHERE project = ? AND username = ?",
             (name, name[:80], "owner" if row["role"] == "owner" else role, ts, 1 if gone else 0, pid, username))


def _merged(c):
    return not c["needs_review"] or bool(c["approved_by"])


def _refresh_file(pid, path):
    """The file's content is the newest (time, id) merged change that touches it – the same on every PC, whatever
    order the changes arrived in."""
    best = None
    for c in db.all_rows("SELECT * FROM pj_commits WHERE project = ? AND files LIKE ?", (pid, f'%"path":{json.dumps(path)}%')):
        if not _merged(c):
            continue
        for f in json.loads(c["files"]):
            if f.get("path") == path and (best is None or (c["ts"], c["id"]) > (best[0]["ts"], best[0]["id"])):
                best = (c, f)
    if not best or best[1].get("op") == "del":
        db.q("DELETE FROM pj_files WHERE project = ? AND path = ?", (pid, path))
        return
    c, f = best
    raw = str(f.get("content") or "")
    db.q("INSERT INTO pj_files(project, path, content, b64, cid, ts) VALUES(?,?,?,?,?,?) ON CONFLICT(project, path) DO UPDATE SET "
         "content = excluded.content, b64 = excluded.b64, cid = excluded.cid, ts = excluded.ts",
         (pid, path, raw.encode("utf-8"), 1 if f.get("b64") else 0, c["id"], c["ts"]))


def emit(user, pid, kind, body):
    """Make an event here, store it, tell the members and hand it to the connected PCs."""
    from . import hublink
    ev = {"id": secrets.token_hex(16), "project": pid, "author": user["username"].lower(), "name": user["display_name"], "ts": now_ms(),
          "kind": kind, "body": body, "hub": hublink.hub_id()}
    seq = apply(ev)
    _notify(pid, kind, seq, ev)
    with _push_cond:
        _push_q.append(ev)
        _push_cond.notify()
    return ev, seq


def _notify(pid, kind, seq, ev):
    payload = {"type": "pj", "project": pid, "kind": kind, "seq": seq, "author": ev["author"]}
    if kind == "msg":
        payload["text"] = str(ev["body"].get("text") or "")[:140]
        payload["name"] = ev["name"]
    live.publish(local_member_ids(pid), payload)


# ── what the user sees ──
def _card(username, name=""):
    r = db.one("SELECT id, username, display_name, avatar FROM users WHERE lower(username) = ?", (username,))
    online = bool(r) and live.online(r["id"])
    return {"username": username, "name": (r["display_name"] if r else "") or name or username, "avatar": r["avatar"] if r else None,
            "here": bool(r), "online": online, "id": r["id"] if r else None}


def _unread(pid, uid, username):
    r = db.one("SELECT seq FROM pj_reads WHERE project = ? AND user_id = ?", (pid, uid))
    return db.one("SELECT COUNT(*) AS n FROM pj_events WHERE project = ? AND seq > ? AND kind IN ('msg','commit') AND author != ?",
                  (pid, r["seq"] if r else 0, username))["n"]


def _call_people(pid):
    try:
        from . import calls
        return calls.project_call(pid)
    except Exception:
        return []


def _project_out(p, u, full=False):
    members = db.all_rows("SELECT * FROM pj_members WHERE project = ? AND gone = 0 ORDER BY role DESC, username", (p["id"],))
    last = db.one("SELECT name, kind, body, ts FROM pj_events WHERE project = ? AND kind IN ('msg','commit','task') ORDER BY seq DESC LIMIT 1", (p["id"],))
    tasks = db.one("SELECT COUNT(*) AS n, SUM(done) AS d FROM pj_tasks WHERE project = ? AND gone = 0", (p["id"],))
    out = {"id": p["id"], "name": p["name"], "kind": p["kind"], "color": p["color"], "customer": p["customer"], "deadline": p["deadline"],
           "about": p["about"], "createdBy": p["created_by"], "archived": bool(p["archived"]), "review": bool(p["review"]),
           "members": [dict(_card(m["username"], m["name"]), role=m["role"]) for m in members],
           "unread": _unread(p["id"], u["id"], u["username"].lower()), "call": _call_people(p["id"]),
           "tasks": {"open": (tasks["n"] or 0) - (tasks["d"] or 0), "done": tasks["d"] or 0},
           "last": None}
    if last:
        b = json.loads(last["body"])
        out["last"] = {"name": last["name"], "ts": last["ts"], "text": (b.get("text") or b.get("title") or "")[:120], "kind": last["kind"]}
    if full:
        out.update({"note": p["note"], "noteBy": p["note_by"], "noteTs": p["note_ts"], "slug": p["slug"], "site": bool(p["site"]),
                    "sitePublic": bool(p["site_public"]), "siteDir": p["site_dir"], "me": u["username"].lower(),
                    "tasksList": [_task_out(t) for t in db.all_rows("SELECT * FROM pj_tasks WHERE project = ? AND gone = 0 ORDER BY done, CASE WHEN due = '' THEN 1 ELSE 0 END, due, created_at", (p["id"],))],
                    "fileCount": db.one("SELECT COUNT(*) AS n FROM pj_files WHERE project = ?", (p["id"],))["n"],
                    "pending": db.one("SELECT COUNT(*) AS n FROM pj_commits WHERE project = ? AND needs_review = 1 AND approved_by = ''", (p["id"],))["n"]})
    return out


def _task_out(t):
    return {"id": t["id"], "title": t["title"], "assignee": t["assignee"], "due": t["due"], "done": bool(t["done"]), "by": t["by"], "ts": t["ts"]}


def _event_out(r):
    return {"seq": r["seq"], "id": r["id"], "author": r["author"], "name": r["name"], "ts": r["ts"], "kind": r["kind"], "body": _slim(r["kind"], json.loads(r["body"]))}


def _slim(kind, b):
    if kind == "commit":   # the conversation shows the change, not the files' contents
        files = b.get("files") or []
        return {"cid": b.get("cid"), "title": b.get("title"), "descr": (b.get("descr") or "")[:600], "needsReview": bool(b.get("needsReview")),
                "aiChecked": bool(b.get("aiChecked")), "files": [{"path": f.get("path"), "op": f.get("op", "set"), "add": f.get("add", 0), "del": f.get("del", 0)} for f in files if isinstance(f, dict)]}
    return b


# ── routes for the user ──
def list_projects(req, _):
    u = require_user(req)
    rows = db.all_rows("SELECT p.* FROM pj_projects p JOIN pj_members m ON m.project = p.id WHERE m.username = ? AND m.gone = 0 "
                       "ORDER BY p.archived, (SELECT MAX(seq) FROM pj_events e WHERE e.project = p.id) DESC", (u["username"].lower(),))
    return 200, {"projects": [_project_out(p, u) for p in rows]}


def people(req, _):
    """Who can be added: everyone with an account on this PC, and everyone already in one of my projects."""
    u = require_user(req)
    seen, out = set(), []
    for r in db.all_rows("SELECT username, display_name FROM users WHERE role != 'guest' ORDER BY display_name COLLATE NOCASE"):
        k = r["username"].lower()
        if k not in seen and k != u["username"].lower():
            seen.add(k); out.append({"username": k, "name": r["display_name"]})
    for r in db.all_rows("SELECT DISTINCT m2.username, m2.name FROM pj_members m1 JOIN pj_members m2 ON m2.project = m1.project WHERE m1.username = ? AND m2.gone = 0",
                         (u["username"].lower(),)):
        if r["username"] not in seen and r["username"] != u["username"].lower():
            seen.add(r["username"]); out.append({"username": r["username"], "name": r["name"] or r["username"]})
    return 200, {"people": out}


def create(req, _):
    u = require_user(req)
    if u["role"] == "guest":
        raise ApiError(403, "Gæster kan ikke oprette projekter.", "forbidden")
    b = req.json()
    name = body_str(b, "name", 80, required=True)
    pid = secrets.token_hex(8)
    members = []
    for m in (b.get("members") or [])[:30]:
        un = str(m or "").lower().strip()
        if re.fullmatch(r"[a-z0-9._\-]{2,64}", un) and un != u["username"].lower():
            r = db.one("SELECT display_name FROM users WHERE lower(username) = ?", (un,))
            members.append({"username": un, "name": r["display_name"] if r else un})
    color = b.get("color") if b.get("color") in COLORS else COLORS[int(pid[:2], 16) % len(COLORS)]
    emit(u, pid, "project", {"name": name, "kind": "code" if b.get("kind") == "code" else "work", "color": color,
                             "customer": body_str(b, "customer", 80), "deadline": body_str(b, "deadline", 10), "about": body_str(b, "about", 600),
                             "members": members, "review": bool(b.get("review")), "slug": _slug(name, pid)})
    return 201, {"project": _project_out(_project(pid), u, True)}


def get_project(req, params):
    u, p = _require_member(req, params["pid"])
    return 200, {"project": _project_out(p, u, True)}


def update_project(req, params):
    u, p = _require_member(req, params["pid"])
    b = req.json()
    body = {}
    for f, n in (("name", 80), ("customer", 80), ("deadline", 10), ("about", 600), ("site_dir", 120)):
        key = "siteDir" if f == "site_dir" else f
        if key in b:
            body[f] = body_str(b, key, n)
    if "color" in b and b["color"] in COLORS:
        body["color"] = b["color"]
    for f, key in (("review", "review"), ("site", "site"), ("site_public", "sitePublic"), ("archived", "archived")):
        if key in b:
            body[f] = bool(b[key])
    if body.get("name") == "":
        raise ApiError(400, "Projektet skal have et navn.", "missing")
    if body:
        emit(u, p["id"], "meta", body)
    return 200, {"project": _project_out(_project(p["id"]), u, True)}


def add_member(req, params):
    u, p = _require_member(req, params["pid"])
    un = str(req.json().get("username") or "").lower().strip()
    if not re.fullmatch(r"[a-z0-9._\-]{2,64}", un):
        raise ApiError(400, "Ugyldigt brugernavn.", "invalid")
    r = db.one("SELECT display_name FROM users WHERE lower(username) = ?", (un,))
    known = r or db.one("SELECT name FROM pj_members WHERE username = ? LIMIT 1", (un,))
    if not known:
        raise ApiError(404, "Personen findes ikke her eller i jeres andre projekter.", "unknown")
    emit(u, p["id"], "member", {"username": un, "name": r["display_name"] if r else known["name"], "op": "add"})
    return 200, {"project": _project_out(_project(p["id"]), u, True)}


def remove_member(req, params):
    u, p = _require_member(req, params["pid"])
    un = str(params["username"]).lower()
    if un == p["created_by"] and un != u["username"].lower():
        raise ApiError(403, "Den, der har lavet projektet, kan kun selv forlade det.", "forbidden")
    emit(u, p["id"], "member", {"username": un, "op": "remove"})
    return 200, {"ok": True}


def events(req, params):
    u, p = _require_member(req, params["pid"])
    before = int((req.query.get("before") or ["0"])[0] or 0)
    after = int((req.query.get("after") or ["0"])[0] or 0)
    lim = max(1, min(200, int((req.query.get("limit") or ["80"])[0] or 80)))
    kinds = "('msg','msg-del','commit','review','member','call','task','project')"
    if after:
        rows = db.all_rows(f"SELECT * FROM pj_events WHERE project = ? AND seq > ? AND kind IN {kinds} ORDER BY seq LIMIT ?", (p["id"], after, lim))
    else:
        rows = db.all_rows(f"SELECT * FROM pj_events WHERE project = ? {'AND seq < ?' if before else ''} AND kind IN {kinds} ORDER BY seq DESC LIMIT ?",
                           (p["id"], before, lim) if before else (p["id"], lim))[::-1]
    return 200, {"events": [_event_out(r) for r in rows], "more": len(rows) == lim and not after}


def post_message(req, params):
    u, p = _require_member(req, params["pid"])
    b = req.json()
    text = body_str(b, "text", TEXT_MAX)
    code = b.get("code")
    body = {"text": text}
    if isinstance(code, dict) and str(code.get("text") or "").strip():
        body["code"] = {"lang": str(code.get("lang") or "")[:20], "text": str(code["text"])[:TEXT_MAX * 3]}
    if isinstance(b.get("reply"), str) and EID_RE.match(b["reply"]):
        body["reply"] = b["reply"]
    if not text.strip() and "code" not in body:
        raise ApiError(400, "Skriv en besked.", "missing")
    ev, seq = emit(u, p["id"], "msg", body)
    _mark_read(p["id"], u["id"], seq)
    return 201, {"event": _event_out(db.one("SELECT * FROM pj_events WHERE seq = ?", (seq,)))}


def delete_message(req, params):
    u, p = _require_member(req, params["pid"])
    r = db.one("SELECT author FROM pj_events WHERE id = ? AND project = ? AND kind = 'msg'", (params["eid"], p["id"]))
    if not r or r["author"] != u["username"].lower():
        raise ApiError(403, "Du kan kun slette dine egne beskeder.", "forbidden")
    emit(u, p["id"], "msg-del", {"target": params["eid"]})
    return 200, {"ok": True}


def add_task(req, params):
    u, p = _require_member(req, params["pid"])
    b = req.json()
    tid = secrets.token_hex(16)
    emit(u, p["id"], "task", {"tid": tid, "title": body_str(b, "title", 200, required=True), "assignee": body_str(b, "assignee", 64).lower(),
                              "due": body_str(b, "due", 10), "done": False})
    return 201, {"task": _task_out(db.one("SELECT * FROM pj_tasks WHERE id = ?", (tid,)))}


def update_task(req, params):
    u, p = _require_member(req, params["pid"])
    t = db.one("SELECT * FROM pj_tasks WHERE id = ? AND project = ?", (params["tid"], p["id"]))
    if not t:
        raise ApiError(404, "Opgaven findes ikke.", "not_found")
    b = req.json()
    body = {"tid": t["id"]}
    for f, n in (("title", 200), ("assignee", 64), ("due", 10)):
        if f in b:
            body[f] = body_str(b, f, n)
    for f in ("done", "gone"):
        if f in b:
            body[f] = bool(b[f])
    if "title" in body and not body["title"]:
        raise ApiError(400, "Opgaven skal have en titel.", "missing")
    if b.get("done") and not t["done"]:
        body["title"] = body.get("title", t["title"])   # the conversation says which task was closed
    emit(u, p["id"], "task", body)
    return 200, {"task": _task_out(db.one("SELECT * FROM pj_tasks WHERE id = ?", (t["id"],)))}


def put_note(req, params):
    u, p = _require_member(req, params["pid"])
    emit(u, p["id"], "note", {"text": body_str(req.json(), "text", 20000)})
    return 200, {"ok": True}


def mark_read(req, params):
    u, p = _require_member(req, params["pid"])
    seq = int(req.json().get("seq") or 0) or (db.one("SELECT MAX(seq) AS s FROM pj_events WHERE project = ?", (p["id"],))["s"] or 0)
    _mark_read(p["id"], u["id"], seq)
    return 200, {"ok": True}


def _mark_read(pid, uid, seq):
    db.q("INSERT INTO pj_reads(project, user_id, seq) VALUES(?,?,?) ON CONFLICT(project, user_id) DO UPDATE SET seq = MAX(seq, excluded.seq)", (pid, uid, seq))


# ── the shared folder ──
def files(req, params):
    u, p = _require_member(req, params["pid"])
    rows = db.all_rows("SELECT path, length(content) AS size, b64, cid, ts FROM pj_files WHERE project = ? ORDER BY path", (p["id"],))
    return 200, {"files": [{"path": r["path"], "size": r["size"], "binary": bool(r["b64"]), "cid": r["cid"], "ts": r["ts"]} for r in rows]}


def file_get(req, params):
    u, p = _require_member(req, params["pid"])
    path = (req.query.get("path") or [""])[0]
    r = db.one("SELECT * FROM pj_files WHERE project = ? AND path = ?", (p["id"], path))
    if not r:
        raise ApiError(404, "Filen findes ikke.", "not_found")
    return 200, {"path": r["path"], "content": bytes(r["content"]).decode("utf-8"), "binary": bool(r["b64"]), "cid": r["cid"], "ts": r["ts"]}


def _count_lines(old, new):
    """Lines added and removed – a quick count for the list (the full diff is made in the browser)."""
    a, b = (old or "").splitlines(), (new or "").splitlines()
    from collections import Counter
    ca, cb = Counter(a), Counter(b)
    return sum((cb - ca).values()), sum((ca - cb).values())


def commit(req, params):
    """Hand in a change to the shared folder. A title and a description are required – like a commit on GitHub."""
    u, p = _require_member(req, params["pid"])
    b = req.json()
    title = body_str(b, "title", 120).strip()
    descr = body_str(b, "descr", 4000).strip()
    if len(title) < 3:
        raise ApiError(400, "Giv ændringen en titel (mindst 3 tegn).", "title")
    if len(descr) < 10:
        raise ApiError(400, "Beskriv ændringen: hvad er ændret, og hvorfor (mindst 10 tegn).", "descr")
    raw = b.get("files")
    if not isinstance(raw, list) or not raw:
        raise ApiError(400, "Der er ingen ændrede filer.", "empty")
    out, total, paths = [], 0, set()
    for f in raw[:200]:
        if not isinstance(f, dict):
            continue
        path = str(f.get("path") or "").strip()
        if not PATH_RE.match(path) or path in paths:
            raise ApiError(400, f"Ugyldigt filnavn: {path[:60]}", "path")
        paths.add(path)
        cur = db.one("SELECT content, b64, cid FROM pj_files WHERE project = ? AND path = ?", (p["id"], path))
        if f.get("delete"):
            if not cur:
                continue
            a, d = _count_lines(None if cur["b64"] else bytes(cur["content"]).decode("utf-8"), "")
            out.append({"path": path, "op": "del", "base": cur["cid"], "add": 0, "del": d})
            continue
        content = f.get("content")
        if not isinstance(content, str):
            raise ApiError(400, "Ugyldigt indhold.", "invalid")
        b64 = bool(f.get("binary"))
        if b64:
            try:
                base64.b64decode(content, validate=True)
            except Exception:
                raise ApiError(400, "Ugyldig fil.", "invalid")
        size = len(content.encode("utf-8"))
        if size > FILE_MAX * (1.4 if b64 else 1):
            raise ApiError(413, f"{path} er for stor (højst {FILE_MAX // 1024} KB pr. fil).", "too_big")
        total += size
        old = None if not cur or cur["b64"] else bytes(cur["content"]).decode("utf-8")
        if cur and not b64 and old == content:
            continue
        add, rem = (0, 0) if b64 else _count_lines(old, content)
        out.append({"path": path, "op": "set", "content": content, "b64": b64, "base": cur["cid"] if cur else "", "add": add, "del": rem})
    if not out:
        raise ApiError(400, "Intet er ændret i forhold til den fælles mappe.", "empty")
    if total > COMMIT_MAX:
        raise ApiError(413, "Ændringen er for stor (højst 4 MB ad gangen).", "too_big")
    if db.one("SELECT COUNT(*) AS n FROM pj_files WHERE project = ?", (p["id"],))["n"] + len(out) > FILES_MAX:
        raise ApiError(413, f"Højst {FILES_MAX} filer i et projekt.", "too_many")
    cid = secrets.token_hex(16)
    task = str(b.get("task") or "")
    emit(u, p["id"], "commit", {"cid": cid, "title": title, "descr": descr, "files": out, "needsReview": bool(p["review"]),
                                "aiChecked": bool(b.get("aiChecked")), "task": task if EID_RE.match(task) else ""})
    if EID_RE.match(task) and db.one("SELECT 1 FROM pj_tasks WHERE id = ? AND project = ? AND done = 0", (task, p["id"])):
        t = db.one("SELECT title FROM pj_tasks WHERE id = ?", (task,))
        emit(u, p["id"], "task", {"tid": task, "done": True, "title": t["title"]})
    return 201, {"commit": _commit_out(db.one("SELECT * FROM pj_commits WHERE id = ?", (cid,)), False)}


def _commit_out(c, with_files=True):
    files = json.loads(c["files"])
    out = {"id": c["id"], "title": c["title"], "descr": c["descr"], "author": c["author"], "name": c["name"], "ts": c["ts"],
           "needsReview": bool(c["needs_review"]), "approvedBy": [x for x in c["approved_by"].split(",") if x],
           "changesBy": [x for x in c["changes_by"].split(",") if x], "merged": _merged(c), "aiChecked": bool(c["ai_checked"]),
           "files": [{"path": f.get("path"), "op": f.get("op", "set"), "add": f.get("add", 0), "del": f.get("del", 0), "binary": bool(f.get("b64"))} for f in files]}
    if with_files:
        for o, f in zip(out["files"], files):
            o["new"] = None if f.get("op") == "del" or f.get("b64") else f.get("content")
            o["old"] = _content_before(c, f.get("path"))
    return out


def _content_before(c, path):
    """The file as it was just before this change (the newest merged change before it)."""
    best = None
    for x in db.all_rows("SELECT * FROM pj_commits WHERE project = ? AND files LIKE ? AND (ts < ? OR (ts = ? AND id < ?))",
                         (c["project"], f'%"path":{json.dumps(path)}%', c["ts"], c["ts"], c["id"])):
        if not _merged(x):
            continue
        for f in json.loads(x["files"]):
            if f.get("path") == path and (best is None or (x["ts"], x["id"]) > (best[0]["ts"], best[0]["id"])):
                best = (x, f)
    if not best or best[1].get("op") == "del" or best[1].get("b64"):
        return None
    return best[1].get("content")


def commits(req, params):
    u, p = _require_member(req, params["pid"])
    rows = db.all_rows("SELECT * FROM pj_commits WHERE project = ? ORDER BY ts DESC LIMIT 100", (p["id"],))
    return 200, {"commits": [_commit_out(c, False) for c in rows]}


def commit_get(req, params):
    u, p = _require_member(req, params["pid"])
    c = db.one("SELECT * FROM pj_commits WHERE id = ? AND project = ?", (params["cid"], p["id"]))
    if not c:
        raise ApiError(404, "Ændringen findes ikke.", "not_found")
    return 200, {"commit": _commit_out(c)}


def review(req, params):
    u, p = _require_member(req, params["pid"])
    c = db.one("SELECT * FROM pj_commits WHERE id = ? AND project = ?", (params["cid"], p["id"]))
    if not c:
        raise ApiError(404, "Ændringen findes ikke.", "not_found")
    if c["author"] == u["username"].lower():
        raise ApiError(403, "En anden end dig skal godkende din ændring.", "own")
    b = req.json()
    state = "approved" if b.get("state") == "approved" else "changes"
    emit(u, p["id"], "review", {"cid": c["id"], "state": state, "text": body_str(b, "text", 2000), "title": c["title"]})
    return 200, {"commit": _commit_out(db.one("SELECT * FROM pj_commits WHERE id = ?", (c["id"],)), False)}


def restore(req, params):
    """Go back: make a new change that puts a file (or all files of an earlier change) back as they were."""
    u, p = _require_member(req, params["pid"])
    c = db.one("SELECT * FROM pj_commits WHERE id = ? AND project = ?", (params["cid"], p["id"]))
    if not c:
        raise ApiError(404, "Ændringen findes ikke.", "not_found")
    out = []
    for f in json.loads(c["files"]):
        before = _content_before(c, f.get("path"))
        cur = db.one("SELECT cid FROM pj_files WHERE project = ? AND path = ?", (p["id"], f.get("path")))
        if before is None:
            if cur:
                out.append({"path": f["path"], "op": "del", "base": cur["cid"], "add": 0, "del": 0})
        else:
            out.append({"path": f["path"], "op": "set", "content": before, "b64": False, "base": cur["cid"] if cur else "", "add": 0, "del": 0})
    if not out:
        raise ApiError(400, "Der er intet at gå tilbage til.", "empty")
    cid = secrets.token_hex(16)
    emit(u, p["id"], "commit", {"cid": cid, "title": f"Fortryd: {c['title']}"[:120], "descr": f"Sætter filerne tilbage til før “{c['title']}”.",
                                "files": out, "needsReview": False, "aiChecked": False, "task": ""})
    return 201, {"commit": _commit_out(db.one("SELECT * FROM pj_commits WHERE id = ?", (cid,)), False)}


# ── the website ──
def site_file(slug, rel, user):
    """(bytes, content type) for /side/<slug>/<rel>, or None. Team sites only for logged-in members."""
    p = db.one("SELECT * FROM pj_projects WHERE slug = ? AND site = 1", (slug,))
    if not p:
        return None
    if not p["site_public"] and not (user and _is_member(p["id"], user["username"])):
        return "login"
    base = (p["site_dir"] or "").strip("/")
    rel = rel.strip("/")
    cands = [rel] if rel and not rel.endswith("/") else []
    cands += [f"{rel}/index.html".lstrip("/") if rel else "index.html"]
    for c in cands:
        path = f"{base}/{c}" if base else c
        r = db.one("SELECT content, b64 FROM pj_files WHERE project = ? AND path = ?", (p["id"], path))
        if r:
            data = bytes(r["content"])
            if r["b64"]:
                data = base64.b64decode(data)
            ext = "." + path.rsplit(".", 1)[-1].lower() if "." in path.rsplit("/", 1)[-1] else ""
            return data, SITE_TYPES.get(ext, "application/octet-stream")
    return False


# ── between the PCs ──
def _links():
    try:
        return db.all_rows("SELECT * FROM hub_links ORDER BY id")
    except Exception:
        return []


def _local_usernames():
    return [r["username"].lower() for r in db.all_rows("SELECT username FROM users WHERE role != 'guest'")]


def peer_push(req, _):
    from . import hublink
    hublink._peer_auth(req, "/api/hublink/peer/projects/push")
    n = 0
    for ev in (req.json() or {}).get("events") or []:
        try:
            seq = apply(ev)
        except ValueError:
            continue
        if seq:
            n += 1
            _notify(ev["project"], ev["kind"], seq, ev)
    return 200, {"ok": True, "new": n}


def peer_pull(req, _):
    """Events another PC is missing: for projects that one of its users is in. A project it doesn't have yet comes in full."""
    from . import hublink
    link = hublink._peer_auth(req, "/api/hublink/peer/projects/pull")
    b = req.json() or {}
    since = int(b.get("since") or 0)
    users = sorted({str(x).lower() for x in (b.get("users") or [])[:2000] if isinstance(x, str)})
    known = {str(x) for x in (b.get("known") or [])[:5000] if isinstance(x, str)}
    _remote_users[link["remote_id"]] = set(users)        # who lives there – events are only pushed where a member is
    last = db.one("SELECT MAX(seq) AS s FROM pj_events")["s"] or 0
    if not users:
        return 200, {"events": [], "cursor": last}
    q = ",".join("?" * len(users))
    pids = [r["project"] for r in db.all_rows(f"SELECT DISTINCT project FROM pj_members WHERE gone = 0 AND username IN ({q})", users)]
    out, budget, more = [], 6 * 1024 * 1024, False
    new = [x for x in pids if x not in known][:10]
    for pid in new:
        for r in db.all_rows("SELECT * FROM pj_events WHERE project = ? ORDER BY seq", (pid,)):
            out.append(_raw(r)); budget -= len(r["body"])
    old = [x for x in pids if x not in new]
    cursor = last
    if old:
        cursor = since
        rows = db.all_rows(f"SELECT * FROM pj_events WHERE seq > ? AND project IN ({','.join('?' * len(old))}) ORDER BY seq LIMIT 400", (since, *old))
        for r in rows:
            if budget <= 0:
                more = True
                break
            out.append(_raw(r)); budget -= len(r["body"]); cursor = r["seq"]
        else:
            if len(rows) == 400:
                more = True
            else:
                cursor = last
    if len([x for x in pids if x not in known]) > len(new):
        more = True
    return 200, {"events": out, "cursor": max(since, cursor), "more": more}


def _raw(r):
    return {"id": r["id"], "project": r["project"], "author": r["author"], "name": r["name"], "ts": r["ts"], "kind": r["kind"], "body": json.loads(r["body"]), "hub": r["hub"]}


def pull_from(link):
    from . import hublink
    key = f"pj_cursor_{link['remote_id']}"
    for _ in range(10):
        since = int(db.get_server_setting(key, 0) or 0)
        known = [r["id"] for r in db.all_rows("SELECT id FROM pj_projects")]
        r = hublink._peer_call(link, "/api/hublink/peer/projects/pull", {"since": since, "users": _local_usernames(), "known": known}, timeout=30)
        for ev in r.get("events") or []:
            try:
                seq = apply(ev)
            except ValueError:
                continue
            if seq:
                _notify(ev["project"], ev["kind"], seq, _clean_event(ev))
        db.set_server_setting(key, int(r.get("cursor") or since))
        if not r.get("more"):
            break


def sync_route(req, _):
    """Fetch what the other PCs have now (the page asks when it opens; otherwise it happens every minute)."""
    require_user(req)
    sync_now()
    return 200, {"ok": True}


def sync_now():
    for link in _links():
        try:
            pull_from(link)
        except Exception:
            pass


def _pusher():
    from . import hublink
    while True:
        with _push_cond:
            while not _push_q:
                _push_cond.wait(30)
            batch = _push_q[:50]
            del _push_q[:50]
        for link in _links():
            there = _remote_users.get(link["remote_id"])
            if not there:
                continue       # it hasn't asked yet – it gets everything when it does
            mine = [ev for ev in batch if there & set(member_usernames(ev["project"]))]
            if not mine:
                continue
            try:
                hublink._peer_call(link, "/api/hublink/peer/projects/push", {"events": mine}, timeout=15)
            except Exception:
                pass   # the other PC asks for it itself when it is back


def _puller():
    time.sleep(8)
    while True:
        sync_now()
        time.sleep(60)


ROUTES = [
    ("GET", r"/api/pj", list_projects),
    ("POST", r"/api/pj", create),
    ("GET", r"/api/pj/people", people),
    ("POST", r"/api/pj/sync", sync_route),
    ("GET", r"/api/pj/(?P<pid>[0-9a-f]{16})", get_project),
    ("PATCH", r"/api/pj/(?P<pid>[0-9a-f]{16})", update_project),
    ("POST", r"/api/pj/(?P<pid>[0-9a-f]{16})/members", add_member),
    ("DELETE", r"/api/pj/(?P<pid>[0-9a-f]{16})/members/(?P<username>[A-Za-z0-9._\-]{2,64})", remove_member),
    ("GET", r"/api/pj/(?P<pid>[0-9a-f]{16})/events", events),
    ("POST", r"/api/pj/(?P<pid>[0-9a-f]{16})/messages", post_message),
    ("DELETE", r"/api/pj/(?P<pid>[0-9a-f]{16})/messages/(?P<eid>[0-9a-f]{32})", delete_message),
    ("POST", r"/api/pj/(?P<pid>[0-9a-f]{16})/tasks", add_task),
    ("PATCH", r"/api/pj/(?P<pid>[0-9a-f]{16})/tasks/(?P<tid>[0-9a-f]{32})", update_task),
    ("PUT", r"/api/pj/(?P<pid>[0-9a-f]{16})/note", put_note),
    ("POST", r"/api/pj/(?P<pid>[0-9a-f]{16})/read", mark_read),
    ("GET", r"/api/pj/(?P<pid>[0-9a-f]{16})/files", files),
    ("GET", r"/api/pj/(?P<pid>[0-9a-f]{16})/file", file_get),
    ("GET", r"/api/pj/(?P<pid>[0-9a-f]{16})/commits", commits),
    ("POST", r"/api/pj/(?P<pid>[0-9a-f]{16})/commits", commit),
    ("GET", r"/api/pj/(?P<pid>[0-9a-f]{16})/commits/(?P<cid>[0-9a-f]{32})", commit_get),
    ("POST", r"/api/pj/(?P<pid>[0-9a-f]{16})/commits/(?P<cid>[0-9a-f]{32})/review", review),
    ("POST", r"/api/pj/(?P<pid>[0-9a-f]{16})/commits/(?P<cid>[0-9a-f]{32})/restore", restore),
    ("POST", r"/api/hublink/peer/projects/push", peer_push),
    ("POST", r"/api/hublink/peer/projects/pull", peer_pull),
]


def install(api_module):
    install_db()
    if not getattr(api_module, "_projects_installed", False):
        api_module.COMPILED.extend((m, re.compile("^" + p + "$"), h) for m, p, h in ROUTES)
        api_module._projects_installed = True


def start():
    threading.Thread(target=_pusher, daemon=True, name="projects-push").start()
    threading.Thread(target=_puller, daemon=True, name="projects-pull").start()
