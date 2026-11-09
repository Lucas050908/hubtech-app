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
    return c.execute("SELECT " + ", ".join(f"? AS {k}" for k in kw), tuple(kw.values())).fetchone()


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


if __name__ == "__main__":
    unittest.main()
