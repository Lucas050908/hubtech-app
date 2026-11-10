"""Gnist with big models: HUBTECH finds a local Ollama, lists its models, streams answers and pulls models (fake Ollama here)."""
import json
import os
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("HUBTECH_DATA_DIR", tempfile.mkdtemp())
from server import aiexternal, db  # noqa: E402


def row(**kw):
    """A user as the server has it: a sqlite3.Row (no .get()), not a dict."""
    import sqlite3
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    try:
        return c.execute("SELECT " + ", ".join(f"? AS {k}" for k in kw), tuple(kw.values())).fetchone()
    finally:
        c.close()


class FakeOllama(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, body, ctype="application/json"):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/tags":
            return self._send(json.dumps({"models": [{"name": "qwen3:8b", "size": 5200000000}]}).encode())
        self.send_response(404); self.end_headers()

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n) or b"{}")
        FakeOllama.last = body
        if self.path == "/v1/chat/completions":
            parts = ["Hej", " Lucas", " – æøå"]
            out = "".join(f"data: {json.dumps({'choices': [{'delta': {'content': p}}]})}\n\n" for p in parts) + "data: [DONE]\n\n"
            return self._send(out.encode(), "text/event-stream")
        if self.path == "/api/pull":
            lines = [{"status": "pulling", "completed": 10, "total": 100}, {"status": "success"}]
            return self._send("".join(json.dumps(x) + "\n" for x in lines).encode(), "application/x-ndjson")
        self.send_response(404); self.end_headers()


class FakeCloud(BaseHTTPRequestHandler):
    """Claude's API and an OpenAI-style API as the newest models behave: they say 400 to parameters they don't take."""
    calls = []
    mode = "ok"

    def log_message(self, *a):
        pass

    def _json(self, status, obj):
        body = json.dumps(obj).encode()
        self.send_response(status); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body))); self.end_headers()
        self.wfile.write(body)

    def _sse(self, events):
        body = "".join(f"data: {json.dumps(e)}\n\n" for e in events).encode()
        self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.send_header("Content-Length", str(len(body))); self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n) or b"{}")
        FakeCloud.calls.append({"path": self.path, "body": body, "version": self.headers.get("anthropic-version"), "key": self.headers.get("x-api-key"), "auth": self.headers.get("Authorization")})
        if FakeCloud.mode == "badkey":
            return self._json(401, {"type": "error", "error": {"type": "authentication_error", "message": "invalid x-api-key"}})
        if self.path == "/v1/messages":
            if "temperature" in body:
                return self._json(400, {"type": "error", "error": {"type": "invalid_request_error", "message": "temperature: this model does not support sampling parameters"}})
            if FakeCloud.mode == "plain" and "output_config" in body:
                return self._json(400, {"type": "error", "error": {"type": "invalid_request_error", "message": "output_config: Extra inputs are not permitted"}})
            if body["messages"][-1]["role"] != "user":
                return self._json(400, {"type": "error", "error": {"type": "invalid_request_error", "message": "the conversation must end with a user turn"}})
            ev = [{"type": "message_start"}, {"type": "content_block_start", "index": 0, "content_block": {"type": "thinking", "thinking": ""}},
                  {"type": "content_block_delta", "index": 0, "delta": {"type": "thinking_delta", "thinking": "Brugeren hilser."}},
                  {"type": "content_block_delta", "index": 1, "delta": {"type": "text_delta", "text": "Hej"}},
                  {"type": "content_block_delta", "index": 1, "delta": {"type": "text_delta", "text": " – æøå"}}]
            if FakeCloud.mode == "breaks":
                ev.append({"type": "error", "error": {"type": "overloaded_error", "message": "Overloaded"}})
            return self._sse(ev + [{"type": "message_stop"}])
        if self.path == "/chat/completions":
            if "max_tokens" in body or "temperature" in body:
                return self._json(400, {"error": {"message": "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.", "type": "invalid_request_error"}})
            return self._sse([{"choices": [{"delta": {"content": "Hej"}}]}, {"choices": [{"delta": {"content": " igen"}}]}])
        self.send_response(404); self.end_headers()


class Req:
    def __init__(self, body=None):
        self._b = body or {}

    def json(self):
        return self._b


class AiExternalTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        db.migrate()
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), FakeOllama)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.url = f"http://127.0.0.1:{cls.srv.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def setUp(self):
        self.p = [mock.patch.object(aiexternal, "require_user", return_value=row(id=1, role="owner")),
                  mock.patch.object(aiexternal, "require_owner", return_value=row(id=1, role="owner"))]
        for x in self.p:
            x.start()

    def tearDown(self):
        for x in self.p:
            x.stop()

    def test_flow(self):
        st, out = aiexternal.set_url(Req({"url": self.url + "/"}), None)
        self.assertEqual((st, out["url"], out["ok"], out["kind"]), (200, self.url, True, "ollama"))
        self.assertEqual(out["models"][0]["id"], "qwen3:8b")
        st, out = aiexternal.status(Req(), None)
        self.assertTrue(out["ok"] and out["canEdit"])
        self.assertEqual([t["ram"] for t in out["tiers"]], [4, 8, 16, 32])
        st, gen, headers = aiexternal.chat(Req({"model": "qwen3:8b", "messages": [{"role": "user", "content": "Hej"}], "max_tokens": 50}), None)
        self.assertEqual(b"".join(gen).decode("utf-8"), "Hej Lucas – æøå")
        self.assertTrue(FakeOllama.last["stream"])
        st, gen, headers = aiexternal.pull(Req({"model": "qwen3:8b"}), None)
        lines = [json.loads(x) for x in b"".join(gen).decode().splitlines()]
        self.assertEqual(lines[0], {"status": "pulling", "completed": 10, "total": 100})

    def test_bad_input(self):
        with self.assertRaises(aiexternal.ApiError):
            aiexternal.set_url(Req({"url": "ftp://x"}), None)
        with self.assertRaises(aiexternal.ApiError):
            aiexternal.pull(Req({"model": "a b"}), None)
        with self.assertRaises(aiexternal.ApiError):
            aiexternal.chat(Req({"model": "", "messages": []}), None)

    def test_member_sees_the_list_but_cannot_edit(self):
        with mock.patch.object(aiexternal, "require_user", return_value=row(id=2, role="member")):
            st, out = aiexternal.status(Req(), None)
        self.assertEqual(st, 200)
        self.assertFalse(out["canEdit"])

    def test_offline(self):
        db.set_server_setting("ai.external_url", "http://127.0.0.1:9")
        self.assertFalse(aiexternal.status(Req(), None)[1]["ok"])
        with self.assertRaises(aiexternal.ApiError) as e:
            aiexternal.chat(Req({"model": "x", "messages": [{"role": "user", "content": "hej"}]}), None)
        self.assertEqual(e.exception.code, "external_offline")


class CloudTest(unittest.TestCase):
    """Claude and the other AI services: the request the newest models accept, and a plainer one when they say 400."""
    @classmethod
    def setUpClass(cls):
        db.migrate()
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), FakeCloud)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.url = f"http://127.0.0.1:{cls.srv.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def setUp(self):
        FakeCloud.calls = []; FakeCloud.mode = "ok"
        self.p = [mock.patch.object(aiexternal, "require_user", return_value=row(id=1, role="owner")),
                  mock.patch.object(aiexternal, "_key", return_value="test-noegle"),
                  mock.patch.dict(aiexternal.PROVIDERS["anthropic"], {"base": self.url}),
                  mock.patch.dict(aiexternal.PROVIDERS["openai"], {"base": self.url})]
        for x in self.p:
            x.start()

    def tearDown(self):
        for x in self.p:
            x.stop()

    def ask(self, model, msgs=None):
        st, gen, _ = aiexternal.chat(Req({"model": model, "messages": msgs or [{"role": "system", "content": "Du er Gnist."}, {"role": "user", "content": "Hej"}], "max_tokens": 700, "temperature": 0.4}), None)
        return b"".join(gen).decode("utf-8")

    def test_claude_no_temperature_room_for_thinking_only_the_text(self):
        self.assertEqual(self.ask("cloud:anthropic/claude-sonnet-5-5"), "Hej – æøå")   # the thinking is not part of the answer
        c = FakeCloud.calls
        self.assertEqual(len(c), 1)
        self.assertNotIn("temperature", c[0]["body"])
        self.assertGreaterEqual(c[0]["body"]["max_tokens"], 3700)
        self.assertEqual((c[0]["body"]["system"], c[0]["body"]["output_config"], c[0]["version"], c[0]["key"]), ("Du er Gnist.", {"effort": "low"}, "2026-10-21", "test-noegle"))

    def test_claude_falls_back_to_a_plainer_request_on_400(self):
        FakeCloud.mode = "plain"
        self.assertEqual(self.ask("cloud:anthropic/claude-haiku-5-5"), "Hej – æøå")
        self.assertEqual([("output_config" in c["body"]) for c in FakeCloud.calls], [True, False])

    def test_claude_conversation_ends_with_the_user(self):
        msgs = [{"role": "assistant", "content": "Hej, jeg er Gnist"}, {"role": "user", "content": "Hvad er DNS?"}, {"role": "assistant", "content": "DNS er"}]
        self.assertEqual(self.ask("cloud:anthropic/claude-opus-5-5", msgs), "Hej – æøå")
        self.assertEqual([m["role"] for m in FakeCloud.calls[-1]["body"]["messages"]], ["user"])

    def test_an_error_in_the_middle_is_shown(self):
        FakeCloud.mode = "breaks"
        out = self.ask("cloud:anthropic/claude-sonnet-5-5")
        self.assertTrue(out.startswith("Hej – æøå") and "afbrød svaret: Overloaded" in out, out)

    def test_a_bad_key_is_not_tried_again(self):
        FakeCloud.mode = "badkey"
        with self.assertRaises(aiexternal.ApiError) as e:
            self.ask("cloud:anthropic/claude-sonnet-5-5")
        self.assertEqual((e.exception.code, len(FakeCloud.calls)), ("cloud_auth", 1))

    def test_openai_style_model_that_wants_max_completion_tokens(self):
        self.assertEqual(self.ask("cloud:openai/gpt-nyeste"), "Hej igen")
        bodies = [c["body"] for c in FakeCloud.calls]
        self.assertEqual((len(bodies), "max_tokens" in bodies[0], "max_completion_tokens" in bodies[1], "temperature" in bodies[1]), (2, True, True, False))
        self.assertEqual(FakeCloud.calls[0]["auth"], "Bearer test-noegle")


if __name__ == "__main__":
    unittest.main()
