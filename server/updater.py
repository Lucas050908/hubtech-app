"""Update HUBTECH from a .zip the owner chooses (Indstillinger → Om → Opdatering).

Rules:
  * only program files are written (server/, web/, tools/, tests/, integrations/, sources/ and a few
    files in the root); the data folder (~/.hubtech – database, backups, logs) is never touched,
    and neither are .env / *.env files or databases
  * nothing is deleted – files that disappeared from the new version stay (harmless)
  * before installing: a backup of the database ("Før opdatering") and a zip of the current program
    files in <program folder>/.update-backup/, so an update can always be undone by hand
"""
import io
import re
import shutil
import tempfile
import threading
import time
import zipfile
from pathlib import Path, PurePosixPath

from . import backup, config

ROOT = config.ROOT
ALLOWED_DIRS = ("server", "web", "tools", "tests", "integrations", "sources")
ALLOWED_FILES = ("README.md", "HUBTECH.pyw", "Installer HUBTECH.pyw", "hubtech.ico", "start.sh", "start.command", "start.bat", ".env.example")
SKIP_PARTS = {"__pycache__", ".git", "node_modules", ".update-backup"}
SKIP_NAMES = re.compile(r"(^|/)(\.env|[^/]*\.env|[^/]*\.db|[^/]*\.db-(wal|shm)|[^/]*\.pyc)$", re.I)
MAX_ZIP = 300 * 1024 * 1024
VERSION_RE = re.compile(r'^VERSION\s*=\s*["\']([0-9][0-9A-Za-z.+-]*)["\']', re.M)

_lock = threading.Lock()
_pending = {}   # id → {"path": Path, "info": {...}, "at": time}


class UpdateError(Exception):
    pass


def _vtuple(v):
    return tuple(int(x) if x.isdigit() else 0 for x in re.split(r"[.+-]", v)[:4])


def _root_prefix(names):
    """The folder inside the zip that holds the program (zips are often wrapped in 'hubtech/')."""
    have = set(names)
    for n in sorted(names, key=len):
        if n == "server/config.py" or n.endswith("/server/config.py"):
            base = n[: -len("server/config.py")]
            if base + "web/index.html" in have:
                return base
    raise UpdateError("Zip-filen indeholder ikke HUBTECH (fandt ikke server/config.py og web/index.html).")


def _data_inside_root():
    try:
        return config.DATA_DIR.resolve().relative_to(ROOT.resolve()).as_posix()
    except ValueError:
        return None


def _plan(zf):
    names = [i.filename for i in zf.infolist() if not i.is_dir()]
    prefix = _root_prefix(names)
    data_rel = _data_inside_root()
    files = []
    for info in zf.infolist():
        if info.is_dir() or not info.filename.startswith(prefix):
            continue
        rel = info.filename[len(prefix):]
        p = PurePosixPath(rel)
        if not rel or p.is_absolute() or ".." in p.parts or "\\" in rel or ":" in p.parts[0]:
            continue  # zip-slip / odd names
        if any(part in SKIP_PARTS for part in p.parts) or SKIP_NAMES.search(rel):
            continue
        if not (p.parts[0] in ALLOWED_DIRS or (len(p.parts) == 1 and rel in ALLOWED_FILES)):
            continue
        if data_rel and (rel == data_rel or rel.startswith(data_rel + "/")):
            continue  # the data folder lives inside the program folder – never overwrite it
        if info.file_size > 50 * 1024 * 1024:
            continue
        files.append((info, rel))
    return prefix, files


def check(raw: bytes):
    """Inspect an uploaded update. Returns info incl. an id to install it with."""
    if len(raw) > MAX_ZIP:
        raise UpdateError("Zip-filen er for stor.")
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        raise UpdateError("Filen er ikke en gyldig zip-fil.")
    with zf:
        prefix, files = _plan(zf)
        try:
            cfg = zf.read(prefix + "server/config.py").decode("utf-8", "replace")
        except KeyError:
            raise UpdateError("server/config.py mangler i zip-filen.")
        m = VERSION_RE.search(cfg)
        new = m.group(1) if m else "0"
        changed = 0
        for info, rel in files:
            target = ROOT / rel
            try:
                if not target.is_file() or target.stat().st_size != info.file_size or target.read_bytes() != zf.read(info):
                    changed += 1
            except OSError:
                changed += 1
    tmp = Path(tempfile.mkdtemp(prefix="hubtech-update-")) / "update.zip"
    tmp.write_bytes(raw)
    uid = re.sub(r"[^a-z0-9]", "", str(time.time_ns()))[-12:]
    info = {"id": uid, "current": config.VERSION, "version": new, "newer": _vtuple(new) > _vtuple(config.VERSION),
            "same": _vtuple(new) == _vtuple(config.VERSION), "files": len(files), "changed": changed}
    with _lock:
        for k, v in list(_pending.items()):           # forget old uploads
            if time.time() - v["at"] > 3600:
                shutil.rmtree(v["path"].parent, ignore_errors=True)
                _pending.pop(k, None)
        _pending[uid] = {"path": tmp, "info": info, "at": time.time()}
    return info


def _backup_program(files):
    """Zip the current versions of the files about to be replaced."""
    folder = ROOT / ".update-backup"
    folder.mkdir(exist_ok=True)
    out = folder / f"hubtech-{config.VERSION}-{time.strftime('%Y%m%d-%H%M%S')}.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for _, rel in files:
            p = ROOT / rel
            if p.is_file():
                z.write(p, rel)
    old = sorted(folder.glob("hubtech-*.zip"))
    for p in old[:-5]:   # keep the five newest
        try:
            p.unlink()
        except OSError:
            pass
    return out


def install(uid):
    with _lock:
        item = _pending.pop(uid, None)
    if not item:
        raise UpdateError("Opdateringen findes ikke længere. Vælg zip-filen igen.")
    try:
        with zipfile.ZipFile(item["path"]) as zf:
            _, files = _plan(zf)
            if not files:
                raise UpdateError("Der er ingen filer at installere.")
            db_copy = backup.make_backup("before-update")
            prog_copy = _backup_program(files)
            written = 0
            for info, rel in files:
                target = (ROOT / rel).resolve()
                if ROOT.resolve() not in target.parents:
                    continue
                data = zf.read(info)
                if target.is_file() and target.read_bytes() == data:
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                tmp = target.with_name(target.name + ".hubtech-new")
                tmp.write_bytes(data)
                tmp.replace(target)
                written += 1
    finally:
        shutil.rmtree(item["path"].parent, ignore_errors=True)
    return {"written": written, "version": item["info"]["version"], "dbBackup": db_copy["name"], "programBackup": prog_copy.name}
