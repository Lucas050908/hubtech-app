"""Gnist with big models: a local Ollama or LM Studio on this computer (OpenAI-compatible API), reached through HUBTECH.

The browser can only run small models (WebAssembly memory). Ollama/LM Studio run 4–32 GB models with the graphics card;
HUBTECH forwards the chat to it and streams the answer back. Standard library only. Only the owner can change the address.
"""
import json
import urllib.error
import urllib.request
from urllib.parse import urlparse

from . import db
from .api import ApiError, require_user, require_owner

DEFAULT_URL = "http://127.0.0.1:11434"
# the sizes Gnist suggests (Ollama library names) – roughly how much memory each needs
TIERS = [
    {"ram": 4, "model": "qwen3:4b", "size": 2.5, "note": "Hurtig og god på de fleste computere"},
    {"ram": 8, "model": "qwen3:8b", "size": 5.2, "note": "Klogere – god til dansk, kode og planlægning"},
    {"ram": 16, "model": "qwen3:14b", "size": 9.3, "note": "Meget dygtig – kræver et godt grafikkort eller 16 GB RAM"},
    {"ram": 32, "model": "qwen3:32b", "size": 20.0, "note": "Den største – kræver 32 GB RAM eller et stort grafikkort"},
]


def base_url():
    url = (db.get_server_setting("ai.external_url", DEFAULT_URL) or DEFAULT_URL).strip().rstrip("/")
    return url


def _valid(url):
    p = urlparse(url)
    return p.scheme in ("http", "https") and bool(p.netloc) and len(url) <= 300


def _get(url, timeout=4):
    r = urllib.request.Request(url, headers={"User-Agent": "HUBTECH-Gnist"})
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return json.loads(resp.read(2_000_000).decode("utf-8"))


def probe(url):
    """What answers at the address: Ollama (/api/tags) or another OpenAI-compatible server (/v1/models)."""
    try:
        tags = _get(url + "/api/tags")
        models = [{"id": m.get("name") or m.get("model"), "size": m.get("size") or 0} for m in tags.get("models", []) if m.get("name") or m.get("model")]
        return {"ok": True, "kind": "ollama", "models": models}
    except (urllib.error.URLError, OSError, ValueError):
        pass
    try:
        data = _get(url + "/v1/models")
        models = [{"id": m.get("id"), "size": 0} for m in data.get("data", []) if m.get("id")]
        return {"ok": True, "kind": "openai", "models": models}
    except (urllib.error.URLError, OSError, ValueError):
        return {"ok": False, "kind": None, "models": []}


def status(req, _):
    u = require_user(req)
    url = base_url()
    out = {"url": url, "tiers": TIERS, "canEdit": u.get("role") == "owner", **probe(url)}
    return 200, out


def set_url(req, _):
    require_owner(req)
    url = str((req.json() or {}).get("url") or "").strip().rstrip("/") or DEFAULT_URL
    if not _valid(url):
        raise ApiError(400, "Skriv en adresse som http://127.0.0.1:11434.", "invalid_url")
    db.set_server_setting("ai.external_url", url)
    return 200, {"url": url, **probe(url)}


def _stream_lines(resp):
    buf = b""
    while True:
        chunk = resp.read1(8192) if hasattr(resp, "read1") else resp.read(8192)
        if not chunk:
            break
        buf += chunk
        while b"\n" in buf:
            line, buf = buf.split(b"\n", 1)
            yield line.strip()
    if buf.strip():
        yield buf.strip()


def chat(req, _):
    """Stream an answer as plain text (one UTF-8 piece at a time)."""
    require_user(req)
    body = req.json() or {}
    model = str(body.get("model") or "").strip()
    msgs = body.get("messages") or []
    if not model or not isinstance(msgs, list) or not msgs:
        raise ApiError(400, "Mangler model eller beskeder.", "invalid")
    clean = [{"role": m.get("role") if m.get("role") in ("system", "user", "assistant") else "user", "content": str(m.get("content") or "")[:60000]} for m in msgs[:80] if isinstance(m, dict)]
    payload = {"model": model, "messages": clean, "stream": True,
               "max_tokens": max(16, min(8192, int(body.get("max_tokens") or 1024))),
               "temperature": max(0.0, min(1.5, float(body.get("temperature") or 0.4)))}
    r = urllib.request.Request(base_url() + "/v1/chat/completions", data=json.dumps(payload).encode("utf-8"),
                               headers={"Content-Type": "application/json", "User-Agent": "HUBTECH-Gnist"}, method="POST")
    try:
        resp = urllib.request.urlopen(r, timeout=300)
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = json.loads(e.read(4000).decode("utf-8")).get("error", {}).get("message", "")
        except Exception:
            pass
        raise ApiError(502, f"Modellen svarede med en fejl ({e.code}). {detail}".strip(), "external_error")
    except (urllib.error.URLError, OSError):
        raise ApiError(502, "Kunne ikke nå Ollama/LM Studio. Kører programmet på computeren?", "external_offline")

    def gen():
        with resp:
            for line in _stream_lines(resp):
                if not line.startswith(b"data:"):
                    continue
                data = line[5:].strip()
                if data == b"[DONE]":
                    break
                try:
                    j = json.loads(data.decode("utf-8"))
                    piece = ((j.get("choices") or [{}])[0].get("delta") or {}).get("content") or ""
                except (ValueError, AttributeError, IndexError):
                    continue
                if piece:
                    yield piece.encode("utf-8")
    return 200, gen(), {"Content-Type": "text/plain; charset=utf-8"}


def pull(req, _):
    """Download a model in Ollama (only the owner), streaming progress lines as JSON."""
    require_owner(req)
    model = str((req.json() or {}).get("model") or "").strip()
    if not model or len(model) > 120 or any(c in model for c in " \n\r\t\"'"):
        raise ApiError(400, "Ugyldigt modelnavn.", "invalid")
    r = urllib.request.Request(base_url() + "/api/pull", data=json.dumps({"model": model, "stream": True}).encode("utf-8"),
                               headers={"Content-Type": "application/json", "User-Agent": "HUBTECH-Gnist"}, method="POST")
    try:
        resp = urllib.request.urlopen(r, timeout=3600)
    except (urllib.error.URLError, OSError):
        raise ApiError(502, "Kunne ikke nå Ollama. Kører programmet på computeren?", "external_offline")

    def gen():
        with resp:
            for line in _stream_lines(resp):
                if not line:
                    continue
                try:
                    j = json.loads(line.decode("utf-8"))
                except ValueError:
                    continue
                out = {"status": j.get("status", ""), "completed": j.get("completed") or 0, "total": j.get("total") or 0}
                if j.get("error"):
                    out = {"error": str(j["error"])[:300]}
                yield (json.dumps(out) + "\n").encode("utf-8")
    return 200, gen(), {"Content-Type": "application/x-ndjson; charset=utf-8"}


ROUTES = [
    ("GET", r"/api/ai/external", status),
    ("PUT", r"/api/ai/external", set_url),
    ("POST", r"/api/ai/external/chat", chat),
    ("POST", r"/api/ai/external/pull", pull),
]


def install(api_module):
    import re
    if not getattr(api_module, "_aiexternal_installed", False):
        api_module.COMPILED.extend((m, re.compile("^" + p + "$"), h) for m, p, h in ROUTES)
        api_module._aiexternal_installed = True
