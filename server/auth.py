"""Authentication: password hashing (scrypt, PBKDF2 fallback), sessions and login throttling.

- Passwords are never stored or logged in clear text.
- Session tokens are random 256-bit values; only their SHA-256 hash is stored.
- Cookies are HttpOnly + SameSite=Lax (+ Secure when HUBTECH_SECURE_COOKIES=true).
"""
import base64
import hashlib
import hmac
import re
import secrets
import threading
import time

from . import config, db

SCRYPT_N, SCRYPT_R, SCRYPT_P = 2 ** 14, 8, 1
PBKDF2_ITER = 600_000
COOKIE_NAME = "hubtech_session"

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$")


def _b64(b: bytes) -> str:
    return base64.b64encode(b).decode("ascii")


def _unb64(s: str) -> bytes:
    return base64.b64decode(s.encode("ascii"))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    pw = password.encode("utf-8")
    try:
        dk = hashlib.scrypt(pw, salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=32)
        return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_b64(salt)}${_b64(dk)}"
    except (AttributeError, ValueError):  # Python built without OpenSSL scrypt
        dk = hashlib.pbkdf2_hmac("sha256", pw, salt, PBKDF2_ITER)
        return f"pbkdf2_sha256${PBKDF2_ITER}${_b64(salt)}${_b64(dk)}"


def verify_password(password: str, stored: str) -> bool:
    pw = password.encode("utf-8")
    try:
        parts = stored.split("$")
        if parts[0] == "scrypt":
            n, r, p = int(parts[1]), int(parts[2]), int(parts[3])
            salt, expected = _unb64(parts[4]), _unb64(parts[5])
            dk = hashlib.scrypt(pw, salt=salt, n=n, r=r, p=p, dklen=len(expected))
        elif parts[0] == "pbkdf2_sha256":
            it, salt, expected = int(parts[1]), _unb64(parts[2]), _unb64(parts[3])
            dk = hashlib.pbkdf2_hmac("sha256", pw, salt, it)
        else:
            return False
        return hmac.compare_digest(dk, expected)
    except (ValueError, IndexError):
        return False


# A dummy hash so that unknown usernames take the same time as wrong passwords
_DUMMY_HASH = hash_password(secrets.token_hex(8))


def validate_password(pw: str):
    if not isinstance(pw, str) or len(pw) < 10:
        return "Adgangskoden skal være mindst 10 tegn."
    if len(pw) > 200:
        return "Adgangskoden er for lang."
    if pw.lower() == pw or pw.upper() == pw or not re.search(r"\d", pw):
        if not (len(pw) >= 16):  # long passphrases are allowed without the mix
            return "Brug både store og små bogstaver og mindst ét tal (eller en passphrase på 16+ tegn)."
    return None


# ── Throttling ────────────────────────────────────────────────────────────
_attempts = {}
_attempts_lock = threading.Lock()
MAX_ATTEMPTS = 5
WINDOW = 5 * 60


def throttled(key: str) -> int:
    """Return seconds until the key may try again (0 = allowed)."""
    t = time.time()
    with _attempts_lock:
        lst = [x for x in _attempts.get(key, []) if t - x < WINDOW]
        _attempts[key] = lst
        if len(lst) >= MAX_ATTEMPTS:
            return int(WINDOW - (t - lst[0])) + 1
    return 0


def record_failure(key: str) -> None:
    with _attempts_lock:
        _attempts.setdefault(key, []).append(time.time())


def clear_failures(key: str) -> None:
    with _attempts_lock:
        _attempts.pop(key, None)


# ── Sessions ──────────────────────────────────────────────────────────────
def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def create_session(user_id: int, user_agent: str = "") -> str:
    token = secrets.token_urlsafe(32)
    t = db.now()
    db.q("INSERT INTO sessions(token_hash, user_id, created_at, expires_at, last_seen, user_agent) "
         "VALUES(?,?,?,?,?,?)",
         (_token_hash(token), user_id, t, t + config.SESSION_DAYS * 86400, t, (user_agent or "")[:200]))
    db.q("UPDATE users SET last_login_at = ? WHERE id = ?", (t, user_id))
    return token


def session_user(token: str):
    """Resolve a session token to a user row. Sliding expiry, refreshed at most once per hour."""
    if not token or len(token) > 100:
        return None
    th = _token_hash(token)
    row = db.one("SELECT s.expires_at, s.last_seen, u.* FROM sessions s JOIN users u ON u.id = s.user_id "
                 "WHERE s.token_hash = ?", (th,))
    if not row:
        return None
    t = db.now()
    if row["expires_at"] < t:
        db.q("DELETE FROM sessions WHERE token_hash = ?", (th,))
        return None
    if t - row["last_seen"] > 3600:
        db.q("UPDATE sessions SET last_seen = ?, expires_at = ? WHERE token_hash = ?",
             (t, t + config.SESSION_DAYS * 86400, th))
    return row


def destroy_session(token: str) -> None:
    if token:
        db.q("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))


def destroy_user_sessions(user_id: int, except_token: str = None) -> None:
    if except_token:
        db.q("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", (user_id, _token_hash(except_token)))
    else:
        db.q("DELETE FROM sessions WHERE user_id = ?", (user_id,))


def purge_expired() -> None:
    db.q("DELETE FROM sessions WHERE expires_at < ?", (db.now(),))


def cookie_header(token: str, max_age: int = None, secure: bool = False) -> str:
    if max_age is None:
        max_age = config.SESSION_DAYS * 86400
    parts = [f"{COOKIE_NAME}={token}", "Path=/", "HttpOnly", "SameSite=Lax", f"Max-Age={max_age}"]
    if config.SECURE_COOKIES or secure:
        parts.append("Secure")
    return "; ".join(parts)


def clear_cookie_header(secure: bool = False) -> str:
    return cookie_header("", 0, secure)


def public_user(row) -> dict:
    return {
        "id": row["id"],
        "username": row["username"],
        "displayName": row["display_name"],
        "email": row["email"] or "",
        "role": row["role"],
        "avatar": row["avatar"],
        "createdAt": row["created_at"],
        "lastLoginAt": row["last_login_at"],
        "onboarding": {"done": bool(row["onboarding_done"]), "step": row["onboarding_step"]},
        "admin": _is_admin(row),
    }


def _is_admin(row):
    """Owner, or someone the owner gave access to the Admin app."""
    if row["role"] == "owner":
        return True
    try:
        return bool(db.one("SELECT 1 FROM admin_access WHERE user_id = ?", (row["id"],)))
    except Exception:
        return False
