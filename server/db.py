"""SQLite persistence. One connection per thread, WAL mode, schema migrations by version."""
import json
import sqlite3
import threading
import time

from . import config

_local = threading.local()

SCHEMA = [
    # v1
    """
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL,
        email TEXT,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        avatar TEXT NOT NULL DEFAULT '⚡',
        created_at INTEGER NOT NULL,
        last_login_at INTEGER,
        onboarding_done INTEGER NOT NULL DEFAULT 0,
        onboarding_step INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        user_agent TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS prefs (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        data TEXT NOT NULL DEFAULT '{}',
        updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_state (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        app_id TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, app_id)
    );
    CREATE TABLE IF NOT EXISTS favorites (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        ref TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, kind, ref)
    );
    CREATE TABLE IF NOT EXISTS project_meta (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, project_id)
    );
    CREATE TABLE IF NOT EXISTS activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        app_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT,
        ref TEXT,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS server_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """,
    # v2: HUBTECH Office – documents, spreadsheets and presentations per user
    """
    CREATE TABLE IF NOT EXISTS office_docs (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        preview TEXT NOT NULL DEFAULT '',
        data TEXT NOT NULL,
        starred INTEGER NOT NULL DEFAULT 0,
        trashed INTEGER NOT NULL DEFAULT 0,
        size INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_office_user ON office_docs(user_id, updated_at DESC);
    """,
    # v3: version history for Office documents + uploaded images (instead of data URLs inside documents)
    """
    CREATE TABLE IF NOT EXISTS office_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id TEXT NOT NULL REFERENCES office_docs(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        data TEXT NOT NULL,
        size INTEGER NOT NULL DEFAULT 0,
        reason TEXT NOT NULL DEFAULT 'auto',
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_office_versions_doc ON office_versions(doc_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS office_files (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL DEFAULT '',
        mime TEXT NOT NULL,
        size INTEGER NOT NULL,
        data BLOB NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_office_files_user ON office_files(user_id, created_at);
    """,
    # v4: shared calendars + Fællesskab (servers, rooms, roles, messages, friends, snaps, stories, moderation, music)
    """
    CREATE TABLE IF NOT EXISTS cal_shared (
        id TEXT PRIMARY KEY,
        owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#38bdf8',
        created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cal_members (
        cal_id TEXT NOT NULL REFERENCES cal_shared(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'editor',
        status TEXT NOT NULL DEFAULT 'pending',
        invited_by INTEGER,
        added_at INTEGER NOT NULL,
        PRIMARY KEY (cal_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_cal_members_user ON cal_members(user_id);
    CREATE TABLE IF NOT EXISTS cal_events (
        id TEXT PRIMARY KEY,
        cal_id TEXT NOT NULL REFERENCES cal_shared(id) ON DELETE CASCADE,
        data TEXT NOT NULL,
        date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        created_by INTEGER,
        updated_by INTEGER,
        updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cal_events ON cal_events(cal_id, date);

    CREATE TABLE IF NOT EXISTS cm_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '#5865f2',
        description TEXT NOT NULL DEFAULT '',
        rules TEXT NOT NULL DEFAULT '',
        owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        discoverable INTEGER NOT NULL DEFAULT 0,
        word_filter TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cm_members (
        server_id TEXT NOT NULL REFERENCES cm_servers(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member',
        joined_at INTEGER NOT NULL,
        rules_accepted_at INTEGER,
        muted_until INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (server_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_cm_members_user ON cm_members(user_id);
    CREATE TABLE IF NOT EXISTS cm_bans (
        server_id TEXT NOT NULL REFERENCES cm_servers(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        by_id INTEGER,
        reason TEXT NOT NULL DEFAULT '',
        at INTEGER NOT NULL,
        PRIMARY KEY (server_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS cm_channels (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL REFERENCES cm_servers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'text',
        topic TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0,
        post_role TEXT NOT NULL DEFAULT 'member',
        slow_seconds INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cm_channels_server ON cm_channels(server_id, position);
    CREATE TABLE IF NOT EXISTS cm_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL DEFAULT '',
        file_id TEXT,
        attach TEXT,
        reply_to INTEGER,
        created_at INTEGER NOT NULL,
        edited_at INTEGER,
        deleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_cm_messages ON cm_messages(channel_id, id);
    CREATE TABLE IF NOT EXISTS cm_reactions (
        message_id INTEGER NOT NULL REFERENCES cm_messages(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        emoji TEXT NOT NULL,
        PRIMARY KEY (message_id, user_id, emoji)
    );
    CREATE TABLE IF NOT EXISTS cm_invites (
        code TEXT PRIMARY KEY,
        server_id TEXT NOT NULL REFERENCES cm_servers(id) ON DELETE CASCADE,
        created_by INTEGER,
        uses INTEGER NOT NULL DEFAULT 0,
        max_uses INTEGER NOT NULL DEFAULT 0,
        expires_at INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cm_reads (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL,
        last_id INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, channel_id)
    );
    CREATE TABLE IF NOT EXISTS cm_files (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        mime TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        size INTEGER NOT NULL,
        data BLOB NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cm_friends (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        requested_by INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, friend_id)
    );
    CREATE TABLE IF NOT EXISTS cm_blocks (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        at INTEGER NOT NULL,
        PRIMARY KEY (user_id, blocked_id)
    );
    CREATE TABLE IF NOT EXISTS cm_snaps (
        id TEXT PRIMARY KEY,
        from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        file_id TEXT,
        caption TEXT NOT NULL DEFAULT '',
        seconds INTEGER NOT NULL DEFAULT 8,
        created_at INTEGER NOT NULL,
        opened_at INTEGER,
        expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cm_snaps_to ON cm_snaps(to_id, created_at);
    CREATE TABLE IF NOT EXISTS cm_stories (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        file_id TEXT,
        caption TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cm_story_views (
        story_id TEXT NOT NULL REFERENCES cm_stories(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        at INTEGER NOT NULL,
        PRIMARY KEY (story_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS cm_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        ref TEXT NOT NULL,
        server_id TEXT,
        target_user INTEGER,
        reason TEXT NOT NULL DEFAULT '',
        snapshot TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        handled_by INTEGER,
        handled_at INTEGER,
        action TEXT
    );
    CREATE TABLE IF NOT EXISTS cm_profiles (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        age_ok_at INTEGER,
        bio TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS cm_music (
        channel_id TEXT PRIMARY KEY,
        queue TEXT NOT NULL DEFAULT '[]',
        current TEXT NOT NULL DEFAULT 'null',
        updated_at INTEGER NOT NULL
    );
    """,
    # v5: App-værkstedet (small web apps made by users, optionally published to everyone)
    """
    CREATE TABLE IF NOT EXISTS studio_apps (
        id TEXT PRIMARY KEY,
        owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '🧩',
        description TEXT NOT NULL DEFAULT '',
        files TEXT NOT NULL DEFAULT '{}',
        published INTEGER NOT NULL DEFAULT 0,
        remix_of TEXT,
        runs INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_studio_owner ON studio_apps(owner_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_studio_pub ON studio_apps(published, updated_at);
    """,
    # v6: notifications that reach you when HUBTECH is closed (inbox, web push, e-mail) – see server/notify.py
    """
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    path TEXT NOT NULL DEFAULT '/',
    created_at INTEGER NOT NULL,
    seen INTEGER NOT NULL DEFAULT 0,
    emailed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, id);
CREATE TABLE IF NOT EXISTS push_subs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    hash TEXT NOT NULL UNIQUE,
    last_id INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notify_prefs (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    last_mail INTEGER NOT NULL DEFAULT 0
);
""",
    # v7: Admin – who the owner has given access, and what the admins did (server/adminapp.py)
    """
    CREATE TABLE IF NOT EXISTS admin_access (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        granted_by INTEGER,
        granted_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
    );
    """,
]


def conn() -> sqlite3.Connection:
    c = getattr(_local, "conn", None)
    if c is None:
        config.DATA_DIR.mkdir(parents=True, exist_ok=True)
        c = sqlite3.connect(str(config.DB_PATH), timeout=10, isolation_level=None)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA foreign_keys = ON")
        c.execute("PRAGMA journal_mode = WAL")
        c.execute("PRAGMA busy_timeout = 5000")
        _local.conn = c
    return c


def close_thread_conn() -> None:
    c = getattr(_local, "conn", None)
    if c is not None:
        c.close()
        _local.conn = None


def migrate() -> None:
    c = conn()
    version = c.execute("PRAGMA user_version").fetchone()[0]
    for i, script in enumerate(SCHEMA[version:], start=version + 1):
        c.executescript(script)
        c.execute(f"PRAGMA user_version = {i}")
    # restrict DB file permissions (best effort, POSIX)
    try:
        config.DB_PATH.chmod(0o600)
    except OSError:
        pass


def now() -> int:
    return int(time.time())


def q(sql: str, args=()):
    return conn().execute(sql, args)


def one(sql: str, args=()):
    return conn().execute(sql, args).fetchone()


def all_rows(sql: str, args=()):
    return conn().execute(sql, args).fetchall()


def get_server_setting(key: str, default=None):
    row = one("SELECT value FROM server_settings WHERE key = ?", (key,))
    if not row:
        return default
    try:
        return json.loads(row["value"])
    except ValueError:
        return default


def set_server_setting(key: str, value) -> None:
    q("INSERT INTO server_settings(key, value) VALUES(?, ?) "
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, json.dumps(value)))
