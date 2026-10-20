"""App-værkstedet: small web apps that run sandboxed inside HUBTECH."""
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_api import Client, ROOT, free_port  # noqa: E402

FILES = {"index.html": '<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body><h1>Hej</h1><script src="app.js"></script></body></html>',
         "style.css": "h1 { color: red; }", "app.js": "localStorage.setItem('n', '1'); console.log('kører');"}


class StudioTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="hubtech-studio-"))
        cls.port = free_port()
        env = dict(os.environ, HUBTECH_DATA_DIR=str(cls.tmp), HUBTECH_QUIET="1", HUBTECH_SIGNUP="first", HUBTECH_BYTEFORGE_AUTOSTART="false")
        cls.proc = subprocess.Popen([sys.executable, str(ROOT / "server" / "app.py"), "--port", str(cls.port)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.base = f"http://127.0.0.1:{cls.port}"
        for _ in range(60):
            try:
                urllib.request.urlopen(cls.base + "/api/health", timeout=1)
                break
            except OSError:
                time.sleep(0.1)
        cls.a = Client(cls.base)
        cls.a.req("POST", "/api/auth/register", {"username": "anna", "displayName": "Anna", "password": "Sommer2026xx"})
        cls.a.req("POST", "/api/users", {"username": "bent", "displayName": "Bent", "password": "Efteraar2026x"})
        cls.b = Client(cls.base)
        cls.b.req("POST", "/api/auth/login", {"username": "bent", "password": "Efteraar2026x"})

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait(5)
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_create_run_publish_remix(self):
        a, b = self.a, self.b
        self.assertEqual(a.req("POST", "/api/studio/apps", {"name": "x", "files": {"../hack.html": "x"}})[0], 400)
        self.assertEqual(a.req("POST", "/api/studio/apps", {"name": "x", "files": {"app.js": "x"}})[1]["code"], "no_index")
        self.assertEqual(a.req("POST", "/api/studio/apps", {"name": "x", "files": {"index.html": "x" * 500000}})[0], 413)
        st, body, _ = a.req("POST", "/api/studio/apps", {"name": "Tæller", "icon": "🔢", "files": FILES})
        self.assertEqual(st, 201, body)
        aid = body["app"]["id"]
        # runs as a sandboxed document with the css/js inlined
        st, raw, hdr = a.req("GET", f"/api/studio/run/{aid}")
        self.assertEqual(st, 200)
        self.assertIn("sandbox allow-scripts", hdr["Content-Security-Policy"])
        self.assertNotIn("allow-same-origin", hdr["Content-Security-Policy"])
        doc = raw.decode()
        self.assertIn("h1 { color: red; }", doc)
        self.assertIn("console.log('kører')", doc)
        self.assertIn("__studio", doc)
        # private until published
        self.assertEqual(b.req("GET", f"/api/studio/apps/{aid}")[0], 404)
        self.assertEqual(b.req("GET", f"/api/studio/run/{aid}")[0], 404)
        self.assertEqual(b.req("PUT", f"/api/studio/apps/{aid}", {"name": "hack"})[0], 404)
        a.req("PUT", f"/api/studio/apps/{aid}", {"published": True})
        self.assertEqual([x["name"] for x in b.req("GET", "/api/studio/apps")[1]["gallery"]], ["Tæller"])
        self.assertEqual(b.req("GET", f"/api/studio/run/{aid}")[0], 200)
        self.assertEqual(b.req("PUT", f"/api/studio/apps/{aid}", {"name": "hack"})[0], 404)
        self.assertEqual(b.req("DELETE", f"/api/studio/apps/{aid}")[0], 404)
        # each viewer has their own saved data, embedded into the next run
        self.assertEqual(b.req("PUT", f"/api/studio/data/{aid}", {"data": {"n": "42"}})[0], 200)
        self.assertIn('"n": "42"', b.req("GET", f"/api/studio/run/{aid}")[1].decode())
        self.assertNotIn('"n": "42"', a.req("GET", f"/api/studio/run/{aid}")[1].decode())
        self.assertEqual(b.req("PUT", f"/api/studio/data/{aid}", {"data": {"n": 1}})[0], 400)
        # remix into my own apps
        st, body, _ = b.req("POST", f"/api/studio/apps/{aid}/remix")
        self.assertEqual(st, 201)
        self.assertEqual(body["app"]["files"]["style.css"], FILES["style.css"])
        self.assertTrue(body["app"]["mine"])
        self.assertEqual(b.req("PUT", f"/api/studio/apps/{body['app']['id']}", {"files": {**FILES, "data.json": "{}"}})[0], 200)
        self.assertEqual(a.req("DELETE", f"/api/studio/apps/{aid}")[0], 200)
        self.assertEqual(b.req("GET", f"/api/studio/run/{aid}")[0], 404)


if __name__ == "__main__":
    unittest.main()
