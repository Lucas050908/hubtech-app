"""Gnist with big models: a local Ollama or LM Studio on this computer (OpenAI-compatible API), reached through HUBTECH.

The browser can only run small models (WebAssembly memory). Ollama/LM Studio run 4–32 GB models with the graphics card;
HUBTECH forwards the chat to it and streams the answer back. Standard library only. Only the owner can change the address.
"""
import json
import re
import time
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
    out = {"url": url, "tiers": TIERS, "canEdit": u.get("role") == "owner", **probe(url),
           "cloud": cloud_list(), "providers": cloud_providers(u.get("role") == "owner")}
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
    if model.startswith("cloud:"):        # Claude or another AI service – HUBTECH adds the owner's key
        return chat_cloud(model, clean, max(16, min(8192, int(body.get("max_tokens") or 1024))), max(0.0, min(1.5, float(body.get("temperature") or 0.4))))
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


# ── Claude and other AI services in the cloud ─────────────────────────────────────────────────────────────────
# The owner pastes an API key once (Indstillinger in Gnist). The key stays on this HUBTECH – it is never sent to a
# browser – and every chat goes through HUBTECH, which adds the key. Standard library only.
PROVIDERS = {
    "anthropic": {"name": "Claude (Anthropic)", "base": "https://api.anthropic.com", "kind": "anthropic",
                  "models": ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5", "claude-fable-5-1"],
                  "help": "Lav en nøgle på console.anthropic.com → API Keys."},
    "openai": {"name": "OpenAI (ChatGPT)", "base": "https://api.openai.com/v1", "kind": "openai", "models": [],
               "help": "Lav en nøgle på platform.openai.com → API keys."},
    "gemini": {"name": "Google Gemini", "base": "https://generativelanguage.googleapis.com/v1beta/openai", "kind": "openai", "models": [],
               "help": "Lav en nøgle i Google AI Studio (aistudio.google.com)."},
    "mistral": {"name": "Mistral", "base": "https://api.mistral.ai/v1", "kind": "openai", "models": [],
                "help": "Lav en nøgle på console.mistral.ai."},
    "groq": {"name": "Groq", "base": "https://api.groq.com/openai/v1", "kind": "openai", "models": [],
             "help": "Lav en nøgle på console.groq.com."},
}
_model_cache = {}


def _key(pid):
    return (db.get_server_setting(f"ai.cloud.{pid}.key", "") or "").strip()


def _label(pid, model):
    if pid == "anthropic":
        parts = model.split("-")            # claude-sonnet-5-5 → Claude Sonnet 5.5
        if len(parts) >= 4:
            return f"Claude {parts[1].capitalize()} {parts[2]}.{parts[3]}"
    return model


def _cloud_models(pid):
    p = PROVIDERS[pid]
    key = _key(pid)
    if not key:
        return []
    if p["models"]:
        return list(p["models"])
    hit = _model_cache.get(pid)
    if hit and hit[0] > time.time():
        return hit[1]
    models = []
    try:
        r = urllib.request.Request(p["base"] + "/models", headers={"Authorization": f"Bearer {key}", "User-Agent": "HUBTECH-Gnist"})
        with urllib.request.urlopen(r, timeout=8) as resp:
            data = json.loads(resp.read(2_000_000).decode("utf-8"))
        ids = [str(m.get("id") or "").removeprefix("models/") for m in data.get("data", [])]
        chatty = [i for i in ids if i and not re.search(r"embed|whisper|tts|dall|image|audio|moderation|realtime|transcribe|search|guard|vision-preview", i, re.I)]
        models = sorted(chatty)[:40]
    except (urllib.error.URLError, OSError, ValueError):
        models = []
    _model_cache[pid] = (time.time() + 3600, models)
    return models


def cloud_list():
    out = []
    for pid, p in PROVIDERS.items():
        for m in _cloud_models(pid):
            out.append({"id": f"cloud:{pid}/{m}", "name": _label(pid, m), "provider": p["name"]})
    return out


def cloud_providers(owner):
    return [{"id": pid, "name": p["name"], "set": bool(_key(pid)), "help": p["help"] if owner else ""} for pid, p in PROVIDERS.items()]


def set_key(req, params):
    require_owner(req)
    pid = params.get("provider") if isinstance(params, dict) else None
    pid = pid or str((req.json() or {}).get("provider") or "")
    if pid not in PROVIDERS:
        raise ApiError(404, "Ukendt AI-tjeneste.", "unknown_provider")
    key = str((req.json() or {}).get("key") or "").strip()
    if key and (len(key) > 400 or any(c.isspace() for c in key)):
        raise ApiError(400, "Nøglen ser forkert ud – kopiér den igen uden mellemrum.", "invalid_key")
    db.set_server_setting(f"ai.cloud.{pid}.key", key)
    _model_cache.pop(pid, None)
    models = _cloud_models(pid) if key else []
    if key and not models:
        raise ApiError(400, "Nøglen blev gemt, men tjenesten svarede ikke med nogen modeller. Tjek at nøglen er rigtig.", "no_models")
    return 200, {"provider": pid, "set": bool(key), "models": [{"id": f"cloud:{pid}/{m}", "name": _label(pid, m)} for m in models]}


def _http_error(e, who):
    detail = ""
    try:
        j = json.loads(e.read(4000).decode("utf-8"))
        detail = (j.get("error") or {}).get("message", "") if isinstance(j.get("error"), dict) else str(j.get("error") or "")
    except Exception:
        pass
    if e.code in (401, 403):
        return ApiError(502, f"{who} afviste nøglen. Ejeren kan sætte en ny nøgle i Gnists indstillinger.", "cloud_auth")
    if e.code == 429:
        return ApiError(502, f"{who} siger, at der er brugt for meget lige nu. Prøv igen om lidt.", "cloud_rate")
    return ApiError(502, f"{who} svarede med en fejl ({e.code}). {detail}".strip(), "cloud_error")


def chat_cloud(model, msgs, max_tokens, temperature):
    pid, _, name = model[len("cloud:"):].partition("/")
    p = PROVIDERS.get(pid)
    key = _key(pid) if p else ""
    if not p or not key or not name:
        raise ApiError(400, "Den AI-tjeneste er ikke sat op på denne HUBTECH.", "cloud_missing")
    if p["kind"] == "anthropic":
        system = "\n\n".join(m["content"] for m in msgs if m["role"] == "system")
        conv = [m for m in msgs if m["role"] != "system"]
        while conv and conv[0]["role"] != "user":   # the API wants the conversation to start with the user
            conv.pop(0)
        payload = {"model": name, "max_tokens": max_tokens, "temperature": min(1.0, temperature), "stream": True, "messages": conv or [{"role": "user", "content": "Hej"}]}
        if system:
            payload["system"] = system
        r = urllib.request.Request(p["base"] + "/v1/messages", data=json.dumps(payload).encode("utf-8"), method="POST",
                                   headers={"Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "User-Agent": "HUBTECH-Gnist"})
    else:
        payload = {"model": name, "messages": msgs, "stream": True, "max_tokens": max_tokens, "temperature": temperature}
        r = urllib.request.Request(p["base"] + "/chat/completions", data=json.dumps(payload).encode("utf-8"), method="POST",
                                   headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}", "User-Agent": "HUBTECH-Gnist"})
    try:
        resp = urllib.request.urlopen(r, timeout=300)
    except urllib.error.HTTPError as e:
        raise _http_error(e, p["name"])
    except (urllib.error.URLError, OSError):
        raise ApiError(502, f"Kunne ikke nå {p['name']}. Er computeren på internettet?", "cloud_offline")

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
                except ValueError:
                    continue
                if p["kind"] == "anthropic":
                    piece = (j.get("delta") or {}).get("text", "") if j.get("type") == "content_block_delta" else ""
                else:
                    piece = (((j.get("choices") or [{}])[0] or {}).get("delta") or {}).get("content") or ""
                if piece:
                    yield piece.encode("utf-8")
    return 200, gen(), {"Content-Type": "text/plain; charset=utf-8"}


ROUTES = [
    ("GET", r"/api/ai/external", status),
    ("PUT", r"/api/ai/external", set_url),
    ("POST", r"/api/ai/external/chat", chat),
    ("POST", r"/api/ai/external/pull", pull),
    ("PUT", r"/api/ai/cloud/(?P<provider>[a-z]+)", set_key),
]


def install(api_module):
    import re
    if not getattr(api_module, "_aiexternal_installed", False):
        api_module.COMPILED.extend((m, re.compile("^" + p + "$"), h) for m, p, h in ROUTES)
        api_module._aiexternal_installed = True
