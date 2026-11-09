"""Minecraft-server: a page about HUBTECH's Minecraft server – address, version, how to join, rules, links and news –
with live status read straight from the server (Java "Server List Ping" over TCP, Bedrock "unconnected ping" over
UDP). Everyone can see it; the owner and the admins (see adminapp.py) can change the information.
Standard library only: the SRV lookup (play.example.com → the real host and port) is a tiny DNS query.
"""
import json
import random
import re
import socket
import struct
import threading
import time

from . import db
from .adminapp import is_admin, log
from .api import ApiError, require_user

DEFAULTS = {
    "name": "HUBTECH Minecraft",
    "address": "b-cabin.gl.joinmc.link",
    "port": 0,                      # 0 = default (25565), or what the SRV record says
    "edition": "java",              # java | bedrock | both
    "bedrockAddress": "",
    "bedrockPort": 19132,
    "version": "1.21.8",
    "description": "HUBTECH's egen Minecraft-server. Kom og byg med!",
    "howTo": "",
    "rules": ["Vær sød ved hinanden", "Ingen griefing – byg ikke i andres ting uden lov", "Ingen snyd eller hacks"],
    "links": [],
    "news": [],
    "showStatus": True,
}
HOST_RE = re.compile(r"^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$")
_cache = {"at": 0.0, "key": None, "data": None}
_lock = threading.Lock()


def info():
    v = db.get_server_setting("minecraft") or {}
    out = json.loads(json.dumps(DEFAULTS))
    out.update({k: v[k] for k in DEFAULTS if k in v})
    return out


# ── reading the server's status ──
def _varint(n):
    out = b""
    n &= 0xFFFFFFFF
    while True:
        b = n & 0x7F
        n >>= 7
        out += bytes([b | (0x80 if n else 0)])
        if not n:
            return out


def _read_varint(sock):
    n = shift = 0
    for _ in range(5):
        b = sock.recv(1)
        if not b:
            raise OSError("closed")
        n |= (b[0] & 0x7F) << shift
        if not b[0] & 0x80:
            return n
        shift += 7
    raise OSError("bad varint")


def _recv_exact(sock, n):
    buf = b""
    while len(buf) < n:
        part = sock.recv(n - len(buf))
        if not part:
            raise OSError("closed")
        buf += part
    return buf


def srv_lookup(host):
    """_minecraft._tcp.<host> → (target, port) or None. Asks public DNS directly (no packages needed)."""
    name = f"_minecraft._tcp.{host}"
    qid = random.randint(0, 65535)
    q = struct.pack(">HHHHHH", qid, 0x0100, 1, 0, 0, 0) + b"".join(bytes([len(p)]) + p.encode() for p in name.split(".")) + b"\0" + struct.pack(">HH", 33, 1)
    for server in ("1.1.1.1", "8.8.8.8"):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.settimeout(2)
                s.sendto(q, (server, 53))
                data = s.recv(2048)
        except OSError:
            continue
        if len(data) < 12 or struct.unpack(">H", data[:2])[0] != qid:
            continue
        an = struct.unpack(">H", data[6:8])[0]
        i = 12
        while data[i] != 0:                       # skip the question name
            i += data[i] + 1
        i += 5

        def read_name(j):
            parts, jumped, end = [], False, None
            for _ in range(64):
                ln = data[j]
                if ln == 0:
                    j += 1
                    break
                if ln & 0xC0 == 0xC0:
                    if not jumped:
                        end = j + 2
                    j = ((ln & 0x3F) << 8) | data[j + 1]
                    jumped = True
                    continue
                parts.append(data[j + 1:j + 1 + ln].decode("ascii", "replace"))
                j += ln + 1
            return ".".join(parts), (end if jumped else j)
        for _ in range(an):
            _, i = read_name(i)
            rtype, _, _, rdlen = struct.unpack(">HHIH", data[i:i + 10])
            i += 10
            if rtype == 33:
                _, _, port = struct.unpack(">HHH", data[i:i + 6])
                target, _ = read_name(i + 6)
                return target.rstrip("."), port
            i += rdlen
        return None
    return None


def _motd_text(d):
    """The description can be plain text or Minecraft's JSON text components."""
    if isinstance(d, str):
        return re.sub(r"§.", "", d)
    if isinstance(d, dict):
        return _motd_text(d.get("text", "")) + "".join(_motd_text(x) for x in d.get("extra", []) or [])
    if isinstance(d, list):
        return "".join(_motd_text(x) for x in d)
    return ""


def ping_java(host, port=0, timeout=3.0):
    target, tport = host, port or 25565
    if not port:
        srv = srv_lookup(host)
        if srv:
            target, tport = srv
    t0 = time.time()
    with socket.create_connection((target, tport), timeout=timeout) as s:
        s.settimeout(timeout)
        hs = _varint(0) + _varint(767) + _varint(len(host)) + host.encode() + struct.pack(">H", tport) + _varint(1)
        s.sendall(_varint(len(hs)) + hs + _varint(1) + _varint(0))
        _read_varint(s)                                  # packet length
        if _read_varint(s) != 0:
            raise OSError("unexpected packet")
        n = _read_varint(s)
        raw = _recv_exact(s, n)
        ms = int((time.time() - t0) * 1000)
    d = json.loads(raw.decode("utf-8", "replace"))
    players = d.get("players") or {}
    return {"online": True, "players": players.get("online", 0), "max": players.get("max", 0),
            "names": [p.get("name", "") for p in (players.get("sample") or [])][:12],
            "version": (d.get("version") or {}).get("name", ""), "motd": _motd_text(d.get("description", "")).strip()[:200], "ping": ms}


RAKNET_MAGIC = bytes.fromhex("00ffff00fefefefefdfdfdfd12345678")


def ping_bedrock(host, port=19132, timeout=3.0):
    t0 = time.time()
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.settimeout(timeout)
        s.sendto(b"\x01" + struct.pack(">Q", int(t0 * 1000) & 0xFFFFFFFFFFFFFFFF) + RAKNET_MAGIC + struct.pack(">Q", random.getrandbits(63)), (host, port or 19132))
        data, _ = s.recvfrom(2048)
    if not data or data[0] != 0x1C:
        raise OSError("unexpected answer")
    ln = struct.unpack(">H", data[33:35])[0]
    parts = data[35:35 + ln].decode("utf-8", "replace").split(";")
    return {"online": True, "motd": re.sub(r"§.", "", parts[1] if len(parts) > 1 else "")[:200], "version": parts[3] if len(parts) > 3 else "",
            "players": int(parts[4]) if len(parts) > 4 and parts[4].isdigit() else 0, "max": int(parts[5]) if len(parts) > 5 and parts[5].isdigit() else 0,
            "names": [], "ping": int((time.time() - t0) * 1000)}


def status(force=False):
    i = info()
    key = (i["address"], i["port"], i["edition"], i["bedrockAddress"], i["bedrockPort"])
    with _lock:
        if not force and _cache["key"] == key and time.time() - _cache["at"] < 25:
            return _cache["data"]
    out = {"checkedAt": int(time.time())}
    if i["edition"] in ("java", "both") and i["address"]:
        try:
            out["java"] = ping_java(i["address"], i["port"])
        except (OSError, ValueError, struct.error, IndexError):
            out["java"] = {"online": False}
    if i["edition"] in ("bedrock", "both") and (i["bedrockAddress"] or i["address"]):
        try:
            out["bedrock"] = ping_bedrock(i["bedrockAddress"] or i["address"], i["bedrockPort"])
        except (OSError, ValueError, struct.error, IndexError):
            out["bedrock"] = {"online": False}
    with _lock:
        _cache.update(at=time.time(), key=key, data=out)
    return out


# ── API ──
def get_info(req, _):
    u = require_user(req)
    return 200, {"server": info(), "canEdit": is_admin(u["id"])}


def get_status(req, _):
    require_user(req)
    if not info()["showStatus"]:
        return 200, {"status": None}
    return 200, {"status": status()}


def _s(b, k, n, default=""):
    v = b.get(k, default)
    if v is None:
        v = default
    if not isinstance(v, str):
        raise ApiError(400, f"Feltet '{k}' har et ugyldigt format.", "invalid", {"field": k})
    v = v.strip()
    if len(v) > n:
        raise ApiError(400, f"Feltet '{k}' er for langt.", "too_long", {"field": k})
    return v


def put_info(req, _):
    u = require_user(req)
    if not is_admin(u["id"]):
        raise ApiError(403, "Kun ejeren og administratorer kan ændre oplysningerne.", "forbidden")
    b = req.json() or {}
    cur = info()
    new = dict(cur)
    for k, n in (("name", 60), ("version", 40), ("description", 600), ("howTo", 1500)):
        if k in b:
            new[k] = _s(b, k, n)
    for k, lo in (("port", 0), ("bedrockPort", 1)):
        if k in b:
            try:
                p = int(b[k] or 0)
            except (TypeError, ValueError):
                raise ApiError(400, "Porten skal være et tal.", "invalid", {"field": k})
            if not (lo <= p <= 65535):
                raise ApiError(400, "Porten skal være mellem 1 og 65535.", "invalid", {"field": k})
            new[k] = p or (19132 if k == "bedrockPort" else 0)
    for k in ("address", "bedrockAddress"):
        if k in b:
            v = _s(b, k, 253).lower()
            v = re.sub(r"^[a-z]+://", "", v).split("/")[0]
            if ":" in v and k == "address" and v.rsplit(":", 1)[1].isdigit():   # "host:port" typed in one field
                v, p = v.rsplit(":", 1)
                new["port"] = int(p)
            if v and not HOST_RE.match(v):
                raise ApiError(400, "Adressen ser ikke rigtig ud (fx play.mitnavn.dk eller 123.45.67.89).", "invalid", {"field": k})
            new[k] = v
    if "edition" in b:
        new["edition"] = b["edition"] if b["edition"] in ("java", "bedrock", "both") else "java"
    if "showStatus" in b:
        new["showStatus"] = bool(b["showStatus"])
    if "rules" in b:
        rules = b["rules"] if isinstance(b["rules"], list) else []
        new["rules"] = [str(r).strip()[:200] for r in rules if str(r).strip()][:30]
    if "links" in b:
        links = []
        for l in (b["links"] if isinstance(b["links"], list) else [])[:12]:
            if not isinstance(l, dict):
                continue
            label, url = str(l.get("label", "")).strip()[:60], str(l.get("url", "")).strip()[:500]
            if url and re.match(r"^https?://[^\s]+$", url):
                links.append({"label": label or url, "url": url})
        new["links"] = links
    if "news" in b:
        news = []
        for x in (b["news"] if isinstance(b["news"], list) else [])[:20]:
            if isinstance(x, dict) and str(x.get("title", "")).strip():
                news.append({"title": str(x["title"]).strip()[:120], "text": str(x.get("text", "")).strip()[:1000], "at": int(x.get("at") or db.now())})
        new["news"] = news
    db.set_server_setting("minecraft", new)
    log(u["id"], "minecraft", new["address"])
    _cache["at"] = 0
    return 200, {"server": new, "canEdit": True}


ROUTES = [
    ("GET", r"/api/mc", get_info),
    ("PUT", r"/api/mc", put_info),
    ("GET", r"/api/mc/status", get_status),
]


def install(api_module):
    if not getattr(api_module, "_mc_installed", False):
        api_module.COMPILED.extend((m, re.compile("^" + p + "$"), h) for m, p, h in ROUTES)
        api_module._mc_installed = True
