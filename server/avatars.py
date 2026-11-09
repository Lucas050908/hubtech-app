"""Profile pictures from the user's own device. The browser crops and scales the picture to 512×512 before it is
sent (the server has no image library), so here we only check that it really is a JPEG, PNG or WebP of a sane size,
store it under the data folder and point users.avatar at it. The emoji avatars keep working as before.
"""
import hashlib
import re

from . import config, db, live
from .api import ApiError, require_user
from . import auth

MAX_BYTES = 2 * 1024 * 1024
URL_RE = re.compile(r"^/api/avatars/(\d+)/([0-9a-f]{16})\.(webp|jpg|png)$")
TYPES = {"image/webp": "webp", "image/jpeg": "jpg", "image/png": "png"}


def folder():
    p = config.DATA_DIR / "avatars"
    p.mkdir(parents=True, exist_ok=True)
    return p


def sniff(raw):
    if raw[:3] == b"\xff\xd8\xff":
        return "jpg"
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "webp"
    return None


def _remove_files(uid):
    for f in folder().glob(f"{uid}-*"):
        try:
            f.unlink()
        except OSError:
            pass


def upload(req, _):
    u = require_user(req)
    raw = req.raw_body()
    if not raw:
        raise ApiError(400, "Vælg et billede.", "invalid")
    if len(raw) > MAX_BYTES:
        raise ApiError(413, "Billedet er for stort (højst 2 MB).", "too_large")
    ext = sniff(raw)
    if not ext:
        raise ApiError(400, "Billedet skal være JPG, PNG eller WebP.", "invalid_type")
    h = hashlib.sha256(raw).hexdigest()[:16]
    _remove_files(u["id"])
    (folder() / f"{u['id']}-{h}.{ext}").write_bytes(raw)
    url = f"/api/avatars/{u['id']}/{h}.{ext}"
    db.q("UPDATE users SET avatar = ? WHERE id = ?", (url, u["id"]))
    _announce(u["id"])
    return 200, {"user": auth.public_user(db.one("SELECT * FROM users WHERE id = ?", (u["id"],)))}


def remove(req, _):
    u = require_user(req)
    _remove_files(u["id"])
    db.q("UPDATE users SET avatar = '⚡' WHERE id = ? AND avatar LIKE '/api/avatars/%'", (u["id"],))
    _announce(u["id"])
    return 200, {"user": auth.public_user(db.one("SELECT * FROM users WHERE id = ?", (u["id"],)))}


def _announce(uid):
    try:
        live.publish([uid], {"type": "me-changed"})
    except Exception:
        pass


def serve(req, params):
    require_user(req)                     # pictures are for people logged in to this HUBTECH
    uid, h, ext = params["uid"], params["h"], params["ext"]
    f = folder() / f"{int(uid)}-{h}.{ext}"
    if not f.is_file():
        raise ApiError(404, "Billedet findes ikke.", "not_found")
    ctype = {"webp": "image/webp", "jpg": "image/jpeg", "png": "image/png"}[ext]
    # the name contains the picture's hash, so it never changes – browsers may keep it
    return 200, f.read_bytes(), {"Content-Type": ctype, "Cache-Control": "private, max-age=31536000, immutable"}


ROUTES = [
    ("POST", r"/api/me/avatar", upload),
    ("DELETE", r"/api/me/avatar", remove),
    ("GET", r"/api/avatars/(?P<uid>\d+)/(?P<h>[0-9a-f]{16})\.(?P<ext>webp|jpg|png)", serve),
]


def install(api_module):
    if not getattr(api_module, "_avatars_installed", False):
        api_module.COMPILED.extend((m, re.compile("^" + p + "$"), h) for m, p, h in ROUTES)
        api_module._avatars_installed = True
