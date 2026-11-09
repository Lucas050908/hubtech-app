"""Backups of the HUBTECH database.

* A daily automatic copy is written to DATA_DIR/backups (the 14 newest automatic copies are kept).
* The owner can make a copy at any time, download it, and restore from a copy or an uploaded file.

Copies are made with SQLite's online backup API, so they are consistent even while the server
is running. Restoring also uses the backup API (copy file → live database), so every open
connection sees the restored data at once – no file swapping, no restart.
"""
import re
import sqlite3
import threading
import time
from pathlib import Path

from . import config, db

KEEP_AUTO = 14
KEEP_OTHER = 20
DAY = 24 * 3600
NAME_RE = re.compile(r"^hubtech-(auto|manual|before-restore|before-update)-\d{8}-\d{6}\.db$")
_lock = threading.Lock()


def folder() -> Path:
    p = config.DATA_DIR / "backups"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _kind(name):
    m = NAME_RE.match(name)
    return m.group(1) if m else None


def list_backups():
    out = []
    for p in folder().glob("hubtech-*.db"):
        kind = _kind(p.name)
        if not kind:
            continue
        st = p.stat()
        out.append({"name": p.name, "kind": kind, "size": st.st_size, "createdAt": int(st.st_mtime)})
    out.sort(key=lambda b: b["createdAt"], reverse=True)
    return out


def _prune():
    items = list_backups()
    auto = [b for b in items if b["kind"] == "auto"]
    other = [b for b in items if b["kind"] != "auto"]
    for b in auto[KEEP_AUTO:] + other[KEEP_OTHER:]:
        try:
            (folder() / b["name"]).unlink()
        except OSError:
            pass


def make_backup(kind="manual"):
    """Write a consistent copy of the live database. Returns the backup's info dict."""
    if kind not in ("auto", "manual", "before-restore", "before-update"):
        raise ValueError(kind)
    with _lock:
        stamp = time.strftime("%Y%m%d-%H%M%S")
        target = folder() / f"hubtech-{kind}-{stamp}.db"
        n = 1
        while target.exists():  # two copies within the same second
            n += 1
            target = folder() / f"hubtech-{kind}-{stamp[:-2]}{min(59, int(stamp[-2:]) + n):02d}.db"
        tmp = target.with_suffix(".db.part")
        dst = sqlite3.connect(str(tmp))
        try:
            db.conn().backup(dst)
        finally:
            dst.close()
        tmp.replace(target)
        _prune()
    st = target.stat()
    return {"name": target.name, "kind": kind, "size": st.st_size, "createdAt": int(st.st_mtime)}


def auto_backup_if_due():
    """Called at start-up and every hour: one automatic copy per day."""
    try:
        if db.one("SELECT COUNT(*) AS n FROM users")["n"] == 0:
            return None  # nothing worth saving yet
        last = next((b for b in list_backups() if b["kind"] == "auto"), None)
        if last and time.time() - last["createdAt"] < DAY:
            return None
        return make_backup("auto")
    except Exception as e:  # never take the server down because of a backup
        print(f"  ! Automatisk sikkerhedskopi fejlede: {e}", flush=True)
        return None


def path_of(name):
    if not NAME_RE.match(name or ""):
        return None
    p = folder() / name
    return p if p.is_file() else None


class InvalidBackup(Exception):
    pass


def validate_file(path: Path):
    """Make sure `path` is a HUBTECH database we can restore. Returns its schema version."""
    try:
        with open(path, "rb") as f:
            if f.read(16) != b"SQLite format 3\x00":
                raise InvalidBackup("Filen er ikke en SQLite-database.")
        c = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            if c.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise InvalidBackup("Databasen er beskadiget.")
            tables = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if not {"users", "sessions", "prefs", "app_state"} <= tables:
                raise InvalidBackup("Filen er ikke en HUBTECH-sikkerhedskopi.")
            if c.execute("SELECT COUNT(*) FROM users WHERE role = 'owner'").fetchone()[0] < 1:
                raise InvalidBackup("Sikkerhedskopien har ingen ejer-konto.")
            version = c.execute("PRAGMA user_version").fetchone()[0]
        finally:
            c.close()
    except sqlite3.DatabaseError as e:
        raise InvalidBackup(f"Filen kunne ikke læses som database ({e}).")
    if version > len(db.SCHEMA):
        raise InvalidBackup("Sikkerhedskopien er fra en nyere HUBTECH-version. Opdatér HUBTECH først.")
    return version


def restore_from(path: Path):
    """Replace the live database with the copy at `path` (validated first; a safety copy is made)."""
    validate_file(path)
    safety = make_backup("before-restore")
    with _lock:
        src = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            src.backup(db.conn())
        finally:
            src.close()
    db.migrate()  # bring an older copy up to the current schema
    return safety
