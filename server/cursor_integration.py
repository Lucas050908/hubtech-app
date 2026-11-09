"""Cursor integration — reads real project data from the machine the server runs on.

Sources (all read-only):
  1. Cursor's own "recently opened" list   <Cursor user dir>/User/globalStorage/state.vscdb
  2. Cursor's workspace storage            <Cursor user dir>/User/workspaceStorage/*/workspace.json
  3. Extra project roots configured by the owner (scanned max. 2 levels deep for git repos / projects)

Actions:
  - open a project in Cursor via the `cursor` CLI (fallback: cursor:// deep link in the browser)
  - read git metadata (branch, last commit, uncommitted changes, remote)
  - list top-level files (names and sizes only — file contents are never served)

Nothing here writes to the user's projects.
"""
import hashlib
import json
import os
import platform
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from urllib.parse import unquote, urlparse

from . import config, db

IGNORED_DIRS = {"node_modules", ".git", "__pycache__", ".venv", "venv", "dist", "build", ".next",
                "target", ".idea", ".vscode", ".cache", "vendor", "Pods", ".gradle", "coverage"}
PROJECT_MARKERS = (".git", "package.json", "pyproject.toml", "requirements.txt", "Cargo.toml", "go.mod",
                   ".cursor", ".cursorrules", "index.html", "pom.xml", "composer.json", "Gemfile")
LANG_BY_EXT = {
    ".py": "Python", ".js": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript", ".ts": "TypeScript",
    ".tsx": "TypeScript", ".jsx": "JavaScript", ".html": "HTML", ".css": "CSS", ".scss": "CSS",
    ".rs": "Rust", ".go": "Go", ".java": "Java", ".kt": "Kotlin", ".swift": "Swift", ".c": "C", ".h": "C",
    ".cpp": "C++", ".cc": "C++", ".hpp": "C++", ".cs": "C#", ".php": "PHP", ".rb": "Ruby", ".lua": "Lua",
    ".sh": "Shell", ".ps1": "PowerShell", ".bat": "Batch", ".vue": "Vue", ".svelte": "Svelte",
    ".dart": "Dart", ".sql": "SQL", ".ino": "Arduino", ".md": "Markdown", ".json": "JSON", ".yml": "YAML",
    ".yaml": "YAML",
}
NON_CODE = {"Markdown", "JSON", "YAML"}

_cache = {"at": 0, "data": None}
_cache_lock = threading.Lock()
_detail_cache = {}
CACHE_TTL = 30


# ── Discovery of Cursor installation ──────────────────────────────────────
def candidate_user_dirs():
    if config.CURSOR_USER_DIR:
        return [Path(os.path.expanduser(config.CURSOR_USER_DIR))]
    home = Path.home()
    sysname = platform.system()
    if sysname == "Darwin":
        return [home / "Library" / "Application Support" / "Cursor"]
    if sysname == "Windows":
        appdata = os.environ.get("APPDATA") or str(home / "AppData" / "Roaming")
        return [Path(appdata) / "Cursor"]
    xdg = os.environ.get("XDG_CONFIG_HOME") or str(home / ".config")
    return [Path(xdg) / "Cursor", home / ".cursor-server" / "data"]  # desktop + remote-server installs


def find_user_dir():
    for d in candidate_user_dirs():
        if (d / "User").is_dir():
            return d
    return None


def find_cli():
    if config.CURSOR_CLI:
        p = Path(os.path.expanduser(config.CURSOR_CLI))
        return str(p) if p.exists() else None
    found = shutil.which("cursor")
    if found:
        return found
    sysname = platform.system()
    candidates = []
    if sysname == "Darwin":
        candidates.append("/Applications/Cursor.app/Contents/Resources/app/bin/cursor")
        candidates.append(str(Path.home() / "Applications/Cursor.app/Contents/Resources/app/bin/cursor"))
    elif sysname == "Windows":
        local = os.environ.get("LOCALAPPDATA", "")
        candidates.append(os.path.join(local, "Programs", "cursor", "resources", "app", "bin", "cursor.cmd"))
    else:
        candidates += ["/usr/bin/cursor", "/opt/Cursor/resources/app/bin/cursor",
                       str(Path.home() / "Applications" / "cursor"), "/usr/share/cursor/bin/cursor"]
    for c in candidates:
        if c and Path(c).exists():
            return c
    return None


def project_roots():
    roots = list(config.PROJECT_ROOTS)
    roots += db.get_server_setting("cursor.project_roots", []) or []
    out, seen = [], set()
    for r in roots:
        p = Path(os.path.expanduser(r.strip()))
        key = str(p)
        if key and key not in seen:
            seen.add(key)
            out.append(p)
    return out


# ── URI helpers ───────────────────────────────────────────────────────────
def uri_to_path(uri: str):
    """file:///home/a/b -> /home/a/b ; file:///c%3A/x -> c:/x ; others -> None (remote)."""
    try:
        u = urlparse(uri)
    except ValueError:
        return None
    if u.scheme != "file":
        return None
    path = unquote(u.path)
    if u.netloc:  # UNC path
        path = f"//{u.netloc}{path}"
    if len(path) >= 3 and path[0] == "/" and path[2] == ":":  # /c:/Users -> c:/Users
        path = path[1:]
    return path


def project_id(key: str) -> str:
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]


# ── Reading Cursor's storage ──────────────────────────────────────────────
def _read_state_db(dbfile: Path):
    """Read ItemTable from a VS Code-style state.vscdb in read-only mode (copy as fallback)."""
    def _query(path):
        c = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=2)
        try:
            row = c.execute("SELECT value FROM ItemTable WHERE key = 'history.recentlyOpenedPathsList'").fetchone()
            return row[0] if row else None
        finally:
            c.close()
    try:
        return _query(dbfile.as_posix())
    except sqlite3.Error:
        tmpdir = tempfile.mkdtemp(prefix="hubtech-cursor-")
        try:
            tmp = Path(tmpdir) / "state.vscdb"
            shutil.copy2(dbfile, tmp)
            return _query(tmp.as_posix())
        except (OSError, sqlite3.Error):
            return None
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)


def read_recent(user_dir: Path):
    items = []
    dbfile = user_dir / "User" / "globalStorage" / "state.vscdb"
    if dbfile.is_file():
        raw = _read_state_db(dbfile)
        if raw:
            try:
                data = json.loads(raw if isinstance(raw, str) else raw.decode("utf-8", "replace"))
            except ValueError:
                data = {}
            for rank, e in enumerate(data.get("entries", [])):
                if "folderUri" in e:
                    items.append({"uri": e["folderUri"], "kind": "folder", "rank": rank, "label": e.get("label")})
                elif "workspace" in e and isinstance(e["workspace"], dict):
                    items.append({"uri": e["workspace"].get("configPath", ""), "kind": "workspace",
                                  "rank": rank, "label": e.get("label")})
    # older Cursor / VS Code versions kept this in storage.json
    sj = user_dir / "User" / "globalStorage" / "storage.json"
    if not items and sj.is_file():
        try:
            data = json.loads(sj.read_text(encoding="utf-8"))
            lst = (data.get("openedPathsList") or {}).get("entries") or []
            for rank, e in enumerate(lst):
                if "folderUri" in e:
                    items.append({"uri": e["folderUri"], "kind": "folder", "rank": rank})
        except (OSError, ValueError):
            pass
    return items


def read_workspace_storage(user_dir: Path):
    """Map folder URI -> last-modified time of its workspace storage (approx. last opened)."""
    out = {}
    ws = user_dir / "User" / "workspaceStorage"
    if not ws.is_dir():
        return out
    try:
        entries = list(ws.iterdir())
    except OSError:
        return out
    for d in entries[:2000]:
        wj = d / "workspace.json"
        if not wj.is_file():
            continue
        try:
            data = json.loads(wj.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        uri = data.get("folder") or data.get("workspace")
        if not uri:
            continue
        try:
            mtime = max((f.stat().st_mtime for f in d.iterdir()), default=d.stat().st_mtime)
        except OSError:
            mtime = 0
        out[uri] = max(out.get(uri, 0), mtime)
    return out


def scan_roots(roots):
    found = []
    for root in roots:
        if not root.is_dir():
            continue
        try:
            level1 = sorted(p for p in root.iterdir() if p.is_dir() and not p.name.startswith("."))
        except OSError:
            continue
        for p in level1[:400]:
            if p.name in IGNORED_DIRS:
                continue
            if _is_project(p):
                found.append(p)
                continue
            try:  # one more level (e.g. ~/code/<org>/<repo>)
                for q in sorted(x for x in p.iterdir() if x.is_dir() and not x.name.startswith(".")):
                    if q.name not in IGNORED_DIRS and _is_project(q):
                        found.append(q)
            except OSError:
                pass
    return found


def _is_project(p: Path) -> bool:
    return any((p / m).exists() for m in PROJECT_MARKERS)


# ── Project metadata ──────────────────────────────────────────────────────
def _git(path: str, *args, timeout=3):
    try:
        r = subprocess.run(["git", "-C", path, *args], capture_output=True, text=True, timeout=timeout,
                           encoding="utf-8", errors="replace")
        return r.stdout.strip() if r.returncode == 0 else None
    except (OSError, subprocess.SubprocessError):
        return None


def git_info(path: str):
    if not (Path(path) / ".git").exists():
        return None
    branch = _git(path, "rev-parse", "--abbrev-ref", "HEAD")
    if branch is None:
        return {"available": False}
    last = _git(path, "log", "-1", "--format=%h%x1f%s%x1f%ct%x1f%an")
    status = _git(path, "status", "--porcelain")
    remote = _git(path, "remote", "get-url", "origin")
    info = {"available": True, "branch": branch, "dirty": 0, "remote": _clean_remote(remote)}
    if status is not None:
        info["dirty"] = len([l for l in status.splitlines() if l.strip()])
    if last:
        parts = last.split("\x1f")
        if len(parts) == 4:
            info["lastCommit"] = {"hash": parts[0], "subject": parts[1][:200], "time": int(parts[2]),
                                  "author": parts[3][:80]}
    return info


def _clean_remote(remote):
    """Strip credentials from remote URLs before they ever leave the server."""
    if not remote:
        return None
    try:
        u = urlparse(remote)
        if u.scheme in ("http", "https") and (u.username or u.password):
            return u._replace(netloc=u.hostname + (f":{u.port}" if u.port else "")).geturl()
    except ValueError:
        return None
    return remote


def describe(path: Path):
    for name in ("package.json",):
        f = path / name
        if f.is_file():
            try:
                d = json.loads(f.read_text(encoding="utf-8", errors="replace")[:200_000])
                if isinstance(d.get("description"), str) and d["description"].strip():
                    return d["description"].strip()[:280]
            except ValueError:
                pass
    for name in ("README.md", "readme.md", "README.MD", "Readme.md", "README.txt", "README"):
        f = path / name
        if f.is_file():
            try:
                text = f.read_text(encoding="utf-8", errors="replace")[:20_000]
            except OSError:
                continue
            for para in text.split("\n\n"):
                s = " ".join(l.strip() for l in para.splitlines() if l.strip())
                if s and not s.startswith(("#", "![", "<", "[!", "```", "|", "---", "===")):
                    return s[:280]
    return None


def languages(path: Path, limit=2500):
    counts = {}
    seen = 0
    base_depth = len(path.parts)
    for dirpath, dirnames, filenames in os.walk(path):
        depth = len(Path(dirpath).parts) - base_depth
        dirnames[:] = [d for d in dirnames if d not in IGNORED_DIRS and not d.startswith(".")] if depth < 4 else []
        for fn in filenames:
            lang = LANG_BY_EXT.get(os.path.splitext(fn)[1].lower())
            if lang:
                counts[lang] = counts.get(lang, 0) + 1
            seen += 1
            if seen >= limit:
                break
        if seen >= limit:
            break
    code = {k: v for k, v in counts.items() if k not in NON_CODE} or counts
    total = sum(code.values()) or 1
    return [{"name": k, "share": round(v / total, 3)} for k, v in sorted(code.items(), key=lambda kv: -kv[1])[:5]]


def top_level_files(path: Path, limit=200):
    out = []
    try:
        for p in sorted(path.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))[:limit]:
            try:
                st = p.stat()
            except OSError:
                continue
            out.append({"name": p.name, "dir": p.is_dir(), "size": st.st_size if p.is_file() else None,
                        "mtime": int(st.st_mtime), "hidden": p.name.startswith(".")})
    except OSError:
        pass
    return out


# ── Public API ────────────────────────────────────────────────────────────
def status():
    user_dir = find_user_dir()
    roots = project_roots()
    return {
        "cursorInstalled": user_dir is not None,
        "userDir": str(user_dir) if user_dir else None,
        "searched": [str(p) for p in candidate_user_dirs()],
        "cli": find_cli(),
        "roots": [{"path": str(r), "exists": r.is_dir()} for r in roots],
        "platform": platform.system(),
    }


def list_projects(force=False):
    with _cache_lock:
        if not force and _cache["data"] is not None and time.time() - _cache["at"] < CACHE_TTL:
            return _cache["data"]
    user_dir = find_user_dir()
    projects = {}

    def add(key, path, name, source, kind="folder", rank=None, last_opened=None, remote_uri=None):
        pid = project_id(key)
        p = projects.get(pid)
        if p is None:
            exists = bool(path) and Path(path).exists()
            p = projects[pid] = {
                "id": pid, "name": name, "path": path, "uri": remote_uri, "kind": kind, "exists": exists,
                "remote": path is None, "sources": [], "recentRank": None, "lastOpened": None,
            }
        if source not in p["sources"]:
            p["sources"].append(source)
        if rank is not None and (p["recentRank"] is None or rank < p["recentRank"]):
            p["recentRank"] = rank
        if last_opened and (p["lastOpened"] or 0) < last_opened:
            p["lastOpened"] = int(last_opened)

    if user_dir:
        ws_times = read_workspace_storage(user_dir)
        for item in read_recent(user_dir):
            uri = item["uri"]
            path = uri_to_path(uri)
            if item["kind"] == "workspace" and path:
                name = Path(path).stem.replace(".code-workspace", "")
                proj_path = str(Path(path).parent) if path.endswith(".code-workspace") else path
            else:
                proj_path = path
                name = Path(path).name if path else (item.get("label") or uri.rstrip("/").split("/")[-1])
            add(proj_path or uri, proj_path, name or uri, "cursor-recent", item["kind"], item["rank"],
                ws_times.get(uri), None if path else uri)
        for uri, mtime in ws_times.items():
            path = uri_to_path(uri)
            if path and path.endswith(".code-workspace"):
                continue
            add(path or uri, path, Path(path).name if path else uri.rstrip("/").split("/")[-1],
                "cursor-workspace", "folder", None, mtime, None if path else uri)

    for p in scan_roots(project_roots()):
        try:
            mtime = p.stat().st_mtime
        except OSError:
            mtime = None
        add(str(p), str(p), p.name, "project-root", "folder", None, None)
        if mtime:
            projects[project_id(str(p))].setdefault("modified", int(mtime))

    for p in projects.values():
        if p["path"] and p["exists"]:
            pp = Path(p["path"])
            p["description"] = describe(pp)
            p["isGit"] = (pp / ".git").exists()
            try:
                p["modified"] = int(pp.stat().st_mtime)
            except OSError:
                p["modified"] = None
        else:
            if p["remote"] and p.get("uri"):
                auth = urlparse(p["uri"]).netloc
                p["description"] = f"Fjernprojekt · {unquote(auth)}" if auth else "Fjernprojekt"
            p.setdefault("description", None)
            p.setdefault("isGit", False)

    data = {"projects": sorted(projects.values(),
                               key=lambda x: (x["recentRank"] is None, x["recentRank"] or 0,
                                              -(x["lastOpened"] or 0), x["name"].lower())),
            "status": status(), "scannedAt": int(time.time())}
    with _cache_lock:
        _cache["data"], _cache["at"] = data, time.time()
    return data


def get_project(pid: str):
    for p in list_projects()["projects"]:
        if p["id"] == pid:
            return p
    return None


def project_detail(pid: str):
    p = get_project(pid)
    if not p:
        return None
    cached = _detail_cache.get(pid)
    if cached and time.time() - cached[0] < CACHE_TTL:
        return cached[1]
    d = dict(p)
    if p["path"] and p["exists"]:
        pp = Path(p["path"])
        d["git"] = git_info(p["path"])
        d["languages"] = languages(pp)
        d["files"] = top_level_files(pp)
        d["hasCursorRules"] = (pp / ".cursorrules").exists() or (pp / ".cursor" / "rules").exists()
    _detail_cache[pid] = (time.time(), d)
    return d


def open_in_cursor(pid: str):
    """Launch Cursor on the project. Returns (ok, message, deeplink)."""
    p = get_project(pid)
    if not p:
        return False, "Projektet findes ikke længere.", None
    deeplink = None
    if p["path"]:
        deeplink = "cursor://file/" + Path(p["path"]).as_posix().lstrip("/") if sys.platform != "win32" \
            else "cursor://file/" + Path(p["path"]).as_posix()
        if not p["exists"]:
            return False, "Mappen findes ikke længere på disken.", None
    cli = find_cli()
    if not cli:
        return False, "Cursor-kommandoen blev ikke fundet. Brug knappen i browseren i stedet.", deeplink
    args = [cli]
    if p["path"]:
        args.append(p["path"])
    elif p.get("uri"):
        args += ["--folder-uri", p["uri"]]
    try:
        kwargs = {"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL, "stdin": subprocess.DEVNULL}
        if sys.platform == "win32":
            kwargs["creationflags"] = 0x00000008  # DETACHED_PROCESS
            kwargs["shell"] = cli.endswith(".cmd")
        else:
            kwargs["start_new_session"] = True
        subprocess.Popen(args, **kwargs)
        return True, "Åbner i Cursor…", deeplink
    except OSError as e:
        return False, f"Kunne ikke starte Cursor ({e.strerror}).", deeplink


def reveal_in_file_manager(pid: str):
    p = get_project(pid)
    if not p or not p["path"] or not p["exists"]:
        return False, "Mappen findes ikke."
    try:
        if sys.platform == "darwin":
            subprocess.Popen(["open", p["path"]])
        elif sys.platform == "win32":
            subprocess.Popen(["explorer", p["path"]])
        else:
            if not shutil.which("xdg-open"):
                return False, "xdg-open findes ikke på denne maskine."
            subprocess.Popen(["xdg-open", p["path"]], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True, "Åbner mappen…"
    except OSError as e:
        return False, f"Kunne ikke åbne mappen ({e.strerror})."


def invalidate():
    with _cache_lock:
        _cache["data"] = None
    _detail_cache.clear()
