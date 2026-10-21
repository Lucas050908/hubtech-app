"""API tests (standard library only).  Run:  python3 -m unittest discover -s tests -v

Starts a real server on a free port with a temporary data dir and a temporary fake Cursor
installation (real SQLite state.vscdb + real git repo), then exercises the HTTP API.
"""
import http.cookiejar
import io
import json
import os
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Client:
    def __init__(self, base):
        self.base = base
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def req(self, method, path, body=None, headers=None, csrf=True):
        h = {"Content-Type": "application/json"}
        if csrf:
            h["X-Requested-With"] = "hubtech"
        h.update(headers or {})
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(self.base + path, data=data, method=method, headers=h)
        try:
            with self.opener.open(r, timeout=10) as resp:
                raw = resp.read()
                return resp.status, (json.loads(raw) if raw[:1] in (b"{", b"[") else raw), dict(resp.headers)
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                return e.code, json.loads(raw), dict(e.headers)
            except ValueError:
                return e.code, raw, dict(e.headers)


class ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="hubtech-test-"))
        # fake Cursor installation with one real git repo and one missing folder
        proj = cls.tmp / "projects" / "demo-repo"
        proj.mkdir(parents=True)
        (proj / "README.md").write_text("# demo\n\nEt testprojekt til HUBTECH.\n")
        (proj / "main.py").write_text("print('hi')\n")
        subprocess.run(["git", "init", "-q", str(proj)], check=True)
        subprocess.run(["git", "-C", str(proj), "-c", "user.email=t@t", "-c", "user.name=T", "add", "-A"], check=True)
        subprocess.run(["git", "-C", str(proj), "-c", "user.email=t@t", "-c", "user.name=T", "commit", "-qm", "init"], check=True)
        gs = cls.tmp / "Cursor" / "User" / "globalStorage"
        gs.mkdir(parents=True)
        db = sqlite3.connect(gs / "state.vscdb")
        db.execute("CREATE TABLE ItemTable (key TEXT UNIQUE, value BLOB)")
        entries = [{"folderUri": proj.as_uri()}, {"folderUri": (cls.tmp / "gone").as_uri()}]
        db.execute("INSERT INTO ItemTable VALUES (?, ?)", ("history.recentlyOpenedPathsList", json.dumps({"entries": entries})))
        db.commit()
        db.close()
        cls.open_log = cls.tmp / "opened.log"
        cli = cls.tmp / "cursor"
        cli.write_text(f"#!/bin/sh\necho \"$@\" >> {cls.open_log}\n")
        cli.chmod(0o755)
        cls.port = free_port()
        env = dict(os.environ, HUBTECH_DATA_DIR=str(cls.tmp / "data"), HUBTECH_QUIET="1",
                   HUBTECH_CURSOR_USER_DIR=str(cls.tmp / "Cursor"), HUBTECH_CURSOR_CLI=str(cli),
                   HUBTECH_SIGNUP="first", HUBTECH_OFFICE_VERSION_SECONDS="0")
        cls.proc = subprocess.Popen([sys.executable, str(ROOT / "server" / "app.py"), "--port", str(cls.port)], env=env,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        cls.base = f"http://127.0.0.1:{cls.port}"
        for _ in range(50):
            try:
                urllib.request.urlopen(cls.base + "/api/health", timeout=1)
                break
            except OSError:
                time.sleep(0.1)
        cls.owner = Client(cls.base)
        st, body, hdr = cls.owner.req("POST", "/api/auth/register", {"username": "owner", "displayName": "Ejer", "password": "Sommer2026xx"})
        assert st == 201, body
        cls.owner_cookie_header = hdr.get("Set-Cookie", "")
        cls.owner.req("POST", "/api/users", {"username": "office_m", "displayName": "Medlem", "password": "Efteraar2026x"})
        cls.member = Client(cls.base)
        cls.member.req("POST", "/api/auth/login", {"username": "office_m", "password": "Efteraar2026x"})
        cls.anon = Client(cls.base)

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait(5)
        shutil.rmtree(cls.tmp, ignore_errors=True)

    # ── auth ──
    def test_password_hashing(self):
        from server import auth
        h = auth.hash_password("Sommer2026xx")
        self.assertTrue(h.startswith("scrypt$"))
        self.assertNotIn("Sommer2026xx", h)
        self.assertTrue(auth.verify_password("Sommer2026xx", h))
        self.assertFalse(auth.verify_password("forkert", h))
        self.assertNotEqual(h, auth.hash_password("Sommer2026xx"), "salt must differ")

    def test_cookie_flags(self):
        self.assertIn("HttpOnly", self.owner_cookie_header)
        self.assertIn("SameSite=Lax", self.owner_cookie_header)

    def test_first_user_is_owner_and_signup_then_closes(self):
        st, body, _ = self.owner.req("GET", "/api/me")
        self.assertEqual(body["user"]["role"], "owner")
        st, body, _ = Client(self.base).req("POST", "/api/auth/register", {"username": "x_late", "password": "Sommer2026xx"})
        self.assertEqual(st, 403)
        self.assertEqual(body["code"], "signup_closed")

    def test_login_wrong_password_and_throttle(self):
        c = Client(self.base)
        codes = [c.req("POST", "/api/auth/login", {"username": "owner", "password": "nope"})[0] for _ in range(6)]
        self.assertEqual(codes[:5], [401] * 5)
        self.assertEqual(codes[5], 429)

    def test_csrf_header_required(self):
        st, body, _ = self.owner.req("PUT", "/api/me/prefs", {"theme": "light"}, csrf=False)
        self.assertEqual(st, 403)
        st, body, _ = self.owner.req("PUT", "/api/me/prefs", {"theme": "light"}, headers={"Origin": "http://evil.example"})
        self.assertEqual(st, 403)

    def test_unauthenticated_is_401(self):
        st, _, _ = Client(self.base).req("GET", "/api/me")
        self.assertEqual(st, 401)

    def test_logout_invalidates_session(self):
        st, _, _ = self.owner.req("POST", "/api/users", {"username": "temp_user", "displayName": "Temp", "password": "Vinter2026xx"})
        self.assertEqual(st, 201)
        c = Client(self.base)
        self.assertEqual(c.req("POST", "/api/auth/login", {"username": "temp_user", "password": "Vinter2026xx"})[0], 200)
        self.assertEqual(c.req("GET", "/api/me")[0], 200)
        self.assertEqual(c.req("POST", "/api/auth/logout")[0], 200)
        self.assertEqual(c.req("GET", "/api/me")[0], 401)

    # ── data ──
    def test_state_roundtrip_and_isolation(self):
        self.assertEqual(self.owner.req("PUT", "/api/state/circuitpilot", {"state": {"xp": 1234, "stats": {}}})[0], 200)
        st, body, _ = self.owner.req("GET", "/api/state/circuitpilot")
        self.assertEqual(body["state"]["xp"], 1234)
        self.owner.req("POST", "/api/users", {"username": "member1", "displayName": "M", "password": "Vinter2026xx"})
        m = Client(self.base)
        m.req("POST", "/api/auth/login", {"username": "member1", "password": "Vinter2026xx"})
        st, body, _ = m.req("GET", "/api/state/circuitpilot")
        self.assertIsNone(body["state"], "users must not see each other's state")
        st, body, _ = self.owner.req("GET", "/api/me/summary")
        self.assertGreaterEqual(body["xp"], 1234)

    def test_summary_learning_xp(self):
        o = self.owner
        o.req("PUT", "/api/state/codeschool", {"state": {"done": {"py1": {"at": 1}, "py2": {"at": 2}}, "quiz": {"py1": {"0": True, "1": False}}}})
        o.req("PUT", "/api/state/flashcards", {"state": {"decks": [], "cards": [], "reviews": 7}})
        st, body, _ = o.req("GET", "/api/me/summary")
        self.assertEqual(body["breakdown"]["codeschool"], 2 * 20 + 5)
        self.assertEqual(body["breakdown"]["flashcards"], 14)
        o.req("PUT", "/api/state/flashcards", {"state": {"reviews": "nonsense"}})
        o.req("PUT", "/api/state/codeschool", {"state": {"done": [], "quiz": {"x": "y"}}})
        st, body, _ = o.req("GET", "/api/me/summary")
        self.assertEqual(st, 200)
        self.assertEqual(body["breakdown"]["flashcards"], 0)

    def test_state_validation(self):
        self.assertEqual(self.owner.req("PUT", "/api/state/../etc", {"state": {}})[0], 404)
        self.assertEqual(self.owner.req("PUT", "/api/state/BAD!", {"state": {}})[0], 400)
        self.assertEqual(self.owner.req("PUT", "/api/state/ok-app", {"state": "string"})[0], 400)
        big = {"state": {"blob": "x" * (4 * 1024 * 1024 + 1000)}}   # over the 4 MB state limit, under the 6 MB body limit
        self.assertEqual(self.owner.req("PUT", "/api/state/ok-app", big)[0], 413)

    def test_prefs_merge(self):
        self.owner.req("PUT", "/api/me/prefs", {"theme": "light"})
        self.owner.req("PUT", "/api/me/prefs", {"pinnedApps": ["cursor"]})
        st, body, _ = self.owner.req("GET", "/api/me/prefs")
        self.assertEqual(body["prefs"]["theme"], "light")
        self.assertEqual(body["prefs"]["pinnedApps"], ["cursor"])

    # ── projects / Cursor ──
    def test_projects_from_cursor_storage(self):
        st, body, _ = self.owner.req("GET", "/api/projects?refresh=1")
        self.assertEqual(st, 200)
        self.assertTrue(body["status"]["cursorInstalled"])
        names = {p["name"]: p for p in body["projects"]}
        self.assertIn("demo-repo", names)
        self.assertTrue(names["demo-repo"]["isGit"])
        self.assertEqual(names["demo-repo"]["description"], "Et testprojekt til HUBTECH.")
        self.assertIn("gone", names)
        self.assertFalse(names["gone"]["exists"])
        pid = names["demo-repo"]["id"]
        st, body, _ = self.owner.req("GET", f"/api/projects/{pid}")
        self.assertEqual(body["project"]["git"]["lastCommit"]["subject"], "init")
        self.assertTrue(any(f["name"] == "main.py" for f in body["project"]["files"]))
        self.assertNotIn("content", json.dumps(body["project"]["files"]))
        st, body, _ = self.owner.req("POST", f"/api/projects/{pid}/open", {})
        self.assertTrue(body["ok"], body)
        time.sleep(0.4)
        self.assertIn("demo-repo", self.open_log.read_text())

    def test_project_meta_validation(self):
        st, body, _ = self.owner.req("GET", "/api/projects")
        pid = body["projects"][0]["id"]
        self.assertEqual(self.owner.req("PATCH", f"/api/projects/{pid}/meta", {"status": "hacked"})[0], 400)
        st, body, _ = self.owner.req("PATCH", f"/api/projects/{pid}/meta", {"status": "active", "tags": ["a", "b"], "favorite": True})
        self.assertEqual(body["meta"], {"status": "active", "tags": ["a", "b"], "favorite": True})
        self.assertEqual(self.owner.req("GET", "/api/projects/../../etc")[0], 404)
        self.assertEqual(self.owner.req("GET", "/api/projects/zzzz")[0], 400)

    def test_member_cannot_access_local_projects(self):
        self.owner.req("POST", "/api/users", {"username": "member2", "displayName": "M2", "password": "Vinter2026xx"})
        m = Client(self.base)
        m.req("POST", "/api/auth/login", {"username": "member2", "password": "Vinter2026xx"})
        self.assertEqual(m.req("GET", "/api/projects")[0], 403)
        self.assertEqual(m.req("PUT", "/api/integrations/cursor", {"roots": ["/"]})[0], 403)
        self.assertEqual(m.req("PUT", "/api/integrations/byteforge/url", {"url": "http://x"})[0], 403)
        st, body, _ = m.req("GET", "/api/integrations")
        self.assertTrue(body["cursor"]["restricted"])

    def test_remote_credentials_are_stripped(self):
        from server.cursor_integration import _clean_remote
        self.assertEqual(_clean_remote("https://user:token@github.com/a/b.git"), "https://github.com/a/b.git")

    # ── HUBTECH Office ──
    def test_office_conflict_is_not_silently_overwritten(self):
        st, b, _ = self.owner.req("POST", "/api/office/docs", {"kind": "doc", "title": "Konflikt", "data": {"html": "<p>A</p>"}})
        doc = b["doc"]
        # saved from another device with an older base: refused, nothing changed
        st, b, _ = self.owner.req("PUT", f"/api/office/docs/{doc['id']}", {"data": {"html": "<p>B</p>"}, "base": doc["updatedAt"] - 5})
        self.assertEqual(st, 409); self.assertEqual(b["code"], "conflict")
        st, b, _ = self.owner.req("GET", f"/api/office/docs/{doc['id']}")
        self.assertIn("A", b["doc"]["data"]["html"])
        # up-to-date base saves; force overwrites deliberately
        st, b, _ = self.owner.req("PUT", f"/api/office/docs/{doc['id']}", {"data": {"html": "<p>C</p>"}, "base": doc["updatedAt"]})
        self.assertEqual(st, 200)
        st, b, _ = self.owner.req("PUT", f"/api/office/docs/{doc['id']}", {"data": {"html": "<p>D</p>"}, "base": doc["updatedAt"] - 5, "force": True})
        self.assertEqual(st, 200)
        st, b, _ = self.owner.req("GET", f"/api/office/docs/{doc['id']}")
        self.assertIn("D", b["doc"]["data"]["html"])

    def test_office_documents_lifecycle(self):
        st, b, _ = self.owner.req("POST", "/api/office/docs", {"kind": "doc", "title": "Rapport", "data": {"html": "<p>Hej</p>"}, "preview": "Hej"})
        self.assertEqual(st, 201)
        doc = b["doc"]
        self.assertEqual(doc["kind"], "doc")
        st, b, _ = self.owner.req("PUT", f"/api/office/docs/{doc['id']}", {"title": "Rapport v2", "data": {"html": "<p>Ny</p>"}, "starred": True})
        self.assertEqual(st, 200)
        self.assertTrue(b["doc"]["starred"])
        st, b, _ = self.owner.req("GET", f"/api/office/docs/{doc['id']}")
        self.assertEqual(b["doc"]["data"]["html"], "<p>Ny</p>")
        self.assertEqual(b["doc"]["title"], "Rapport v2")
        st, b, _ = self.owner.req("POST", f"/api/office/docs/{doc['id']}/duplicate")
        self.assertEqual(st, 201)
        copy_id = b["doc"]["id"]
        st, b, _ = self.owner.req("GET", "/api/office/docs")
        ids = [d["id"] for d in b["docs"]]
        self.assertIn(doc["id"], ids)
        self.assertIn(copy_id, ids)
        self.assertNotIn("data", b["docs"][0])          # the list never ships document bodies
        st, _, _ = self.owner.req("DELETE", f"/api/office/docs/{copy_id}")
        self.assertEqual(st, 200)
        st, _, _ = self.owner.req("GET", f"/api/office/docs/{copy_id}")
        self.assertEqual(st, 404)

    def test_office_validation_and_isolation(self):
        st, _, _ = self.owner.req("POST", "/api/office/docs", {"kind": "exe", "title": "x"})
        self.assertEqual(st, 400)
        st, b, _ = self.owner.req("POST", "/api/office/docs", {"kind": "sheet", "title": "Privat", "data": {"sheets": []}})
        doc_id = b["doc"]["id"]
        # another user can neither read, change nor delete it
        for method, body in (("GET", None), ("PUT", {"title": "hacked"}), ("DELETE", None)):
            st, _, _ = self.member.req(method, f"/api/office/docs/{doc_id}", body)
            self.assertEqual(st, 404, method)
        st, b, _ = self.member.req("GET", "/api/office/docs")
        self.assertNotIn(doc_id, [d["id"] for d in b["docs"]])
        st, _, _ = self.owner.req("GET", "/api/office/docs/../../etc")
        self.assertIn(st, (400, 404))
        st, _, _ = self.anon.req("GET", "/api/office/docs")
        self.assertEqual(st, 401)

    def test_states_prefix_for_servicehelp(self):
        self.owner.req("PUT", "/api/state/svc-log", {"state": {"v": "[1,2]"}})
        self.owner.req("PUT", "/api/state/svc-cust", {"state": {"v": "[]"}})
        self.member.req("PUT", "/api/state/svc-log", {"state": {"v": "member"}})
        st, b, _ = self.owner.req("GET", "/api/states/svc-")
        self.assertEqual(st, 200)
        self.assertEqual(b["states"]["svc-log"], {"v": "[1,2]"})
        self.assertIn("svc-cust", b["states"])
        st, b, _ = self.member.req("GET", "/api/states/svc-")
        self.assertEqual(b["states"], {"svc-log": {"v": "member"}})

    # ── static & headers ──
    def test_office_version_history(self):
        o = self.owner
        st, body, _ = o.req("POST", "/api/office/docs", {"kind": "doc", "title": "Historik", "data": {"html": "<p>v1</p>"}})
        did = body["doc"]["id"]
        o.req("PUT", f"/api/office/docs/{did}", {"data": {"html": "<p>v2</p>"}})
        o.req("PUT", f"/api/office/docs/{did}", {"data": {"html": "<p>v3</p>"}})
        o.req("PUT", f"/api/office/docs/{did}", {"title": "Kun titel"})   # title-only change: no new version
        st, body, _ = o.req("GET", f"/api/office/docs/{did}/versions")
        self.assertEqual(st, 200)
        self.assertEqual(len(body["versions"]), 2)
        oldest = body["versions"][-1]["id"]
        st, v, _ = o.req("GET", f"/api/office/docs/{did}/versions/{oldest}")
        self.assertEqual(v["version"]["data"], {"html": "<p>v1</p>"})
        st, body, _ = o.req("POST", f"/api/office/docs/{did}/versions/{oldest}/restore", {})
        self.assertEqual(st, 200)
        self.assertEqual(body["doc"]["data"], {"html": "<p>v1</p>"})
        st, body, _ = o.req("GET", f"/api/office/docs/{did}/versions")
        self.assertEqual(body["versions"][0]["reason"], "before-restore")
        # other users cannot see the history
        self.assertEqual(self.member.req("GET", f"/api/office/docs/{did}/versions")[0], 404)
        self.assertEqual(self.member.req("GET", f"/api/office/docs/{did}/versions/{oldest}")[0], 404)
        self.assertEqual(o.req("GET", f"/api/office/docs/{did}/versions/999999")[0], 404)

    def test_office_image_upload(self):
        png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
               b"\x00\x00\x00\rIDATx\x9cc\xf8\xcf\xc0\xf0\x1f\x00\x05\x00\x01\xff\x89\x99=\x1d\x00\x00\x00\x00IEND\xaeB`\x82")

        def up(client, data):
            r = urllib.request.Request(self.base + "/api/office/files", data=data, method="POST",
                                       headers={"X-Requested-With": "hubtech", "Content-Type": "application/octet-stream", "X-File-Name": "test.png"})
            try:
                with client.opener.open(r, timeout=10) as resp:
                    return resp.status, json.loads(resp.read())
            except urllib.error.HTTPError as e:
                return e.code, json.loads(e.read())
        st, body = up(self.owner, png)
        self.assertEqual(st, 201, body)
        url = body["file"]["url"]
        st, raw, hdr = self.owner.req("GET", url)
        self.assertEqual(st, 200)
        self.assertEqual(raw, png)
        self.assertEqual(hdr["Content-Type"], "image/png")
        self.assertIn("sandbox", hdr.get("Content-Security-Policy", ""))
        self.assertEqual(self.member.req("GET", url)[0], 404)       # private to its owner
        self.assertEqual(self.anon.req("GET", url)[0], 401)
        st, body = up(self.owner, b"<svg onload=alert(1)></svg>")
        self.assertEqual(st, 400)                                    # only real images
        st, body = up(self.owner, b"<html>" + b"x" * 100)
        self.assertEqual(st, 400)

    def test_office_search(self):
        o = self.owner
        o.req("POST", "/api/office/docs", {"kind": "doc", "title": "Mødereferat", "data": {"html": "<h1>Referat</h1><p>Vi aftalte at bestille <b>kondensatorer</b> til værkstedet.</p>"}})
        o.req("POST", "/api/office/docs", {"kind": "sheet", "title": "Lager", "data": {"sheets": [{"name": "Ark1", "cells": {"A1": {"v": "Kondensator 100µF"}, "B1": {"v": "=SUM(1)"}}}]}})
        st, body, _ = o.req("GET", "/api/office/search?q=kondensator")
        self.assertEqual(st, 200)
        titles = [r["title"] for r in body["results"]]
        self.assertIn("Mødereferat", titles)
        self.assertIn("Lager", titles)
        self.assertTrue(any("kondensatorer" in r["snippet"] for r in body["results"]))
        st, body, _ = self.member.req("GET", "/api/office/search?q=kondensator")
        self.assertEqual(body["results"], [])
        self.assertEqual(o.req("GET", "/api/office/search?q=k")[1]["results"], [])

    def test_https_cookie_and_network_settings(self):
        c = Client(self.base)
        st, body, hdr = c.req("POST", "/api/auth/login", {"username": "office_m", "password": "Efteraar2026x"}, headers={"X-Forwarded-Proto": "https"})
        self.assertEqual(st, 200)
        self.assertIn("Secure", hdr.get("Set-Cookie", ""))
        st, body, hdr = Client(self.base).req("POST", "/api/auth/login", {"username": "office_m", "password": "Efteraar2026x"})
        self.assertNotIn("Secure", hdr.get("Set-Cookie", ""))
        st, n, _ = self.owner.req("GET", "/api/system/network")
        self.assertEqual(st, 200)
        self.assertFalse(n["open"])
        self.assertEqual(self.member.req("GET", "/api/system/network")[0], 403)
        self.assertEqual(self.member.req("PUT", "/api/system/network", {"lanAccess": True})[0], 403)

    def test_system_info_and_shutdown_rules(self):
        st, body, _ = self.owner.req("GET", "/api/system")
        self.assertEqual(st, 200)
        self.assertTrue(body["canShutdown"])
        self.assertFalse(body["launcher"])
        st, body, _ = self.member.req("GET", "/api/system")
        self.assertEqual(st, 200)
        self.assertFalse(body["canShutdown"])
        self.assertIsNone(body["dataDir"])
        self.assertEqual(self.anon.req("GET", "/api/system")[0], 401)
        self.assertEqual(self.member.req("POST", "/api/system/shutdown", {})[0], 403)
        self.assertEqual(self.anon.req("POST", "/api/system/shutdown", {})[0], 401)
        self.assertEqual(self.owner.req("POST", "/api/system/shutdown", {}, csrf=False)[0], 403)

    def test_installable_app_files(self):
        st, body, hdr = self.anon.req("GET", "/manifest.webmanifest")
        self.assertEqual(st, 200)
        m = json.loads(body if isinstance(body, (bytes, str)) else json.dumps(body))
        self.assertEqual(m["display"], "standalone")
        self.assertTrue(any(i["sizes"] == "512x512" for i in m["icons"]))
        for i in m["icons"]:
            self.assertEqual(self.anon.req("GET", "/" + i["src"].lstrip("/"))[0], 200, i["src"])
        st, body, hdr = self.anon.req("GET", "/sw.js")
        self.assertEqual(st, 200)
        self.assertIn("javascript", hdr.get("Content-Type", ""))
        st, body, _ = self.anon.req("GET", "/")
        self.assertIn(b'rel="manifest"', body)

    def test_static_security(self):
        st, body, hdr = self.owner.req("GET", "/")
        self.assertEqual(st, 200)
        self.assertIn("script-src 'self'", hdr.get("Content-Security-Policy", ""))
        self.assertEqual(hdr.get("X-Content-Type-Options"), "nosniff")
        st, _, _ = self.owner.req("GET", "/../server/config.py")
        self.assertIn(st, (400, 404))
        st, _, _ = self.owner.req("GET", "/%2e%2e/server/config.py")
        self.assertIn(st, (400, 404))


class BackupTest(unittest.TestCase):
    """Backups, restore and personal export/import run against their own server (they rewrite the database)."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="hubtech-backup-"))
        cls.port = free_port()
        env = dict(os.environ, HUBTECH_DATA_DIR=str(cls.tmp), HUBTECH_QUIET="1", HUBTECH_SIGNUP="first", HUBTECH_BYTEFORGE_AUTOSTART="false")
        cls.proc = subprocess.Popen([sys.executable, str(ROOT / "server" / "app.py"), "--port", str(cls.port)], env=env,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.base = f"http://127.0.0.1:{cls.port}"
        for _ in range(50):
            try:
                urllib.request.urlopen(cls.base + "/api/health", timeout=1)
                break
            except OSError:
                time.sleep(0.1)
        cls.owner = Client(cls.base)
        assert cls.owner.req("POST", "/api/auth/register", {"username": "ejer", "displayName": "Ejer", "password": "Sommer2026xx"})[0] == 201
        cls.owner.req("POST", "/api/users", {"username": "medlem", "displayName": "M", "password": "Efteraar2026x"})
        cls.member = Client(cls.base)
        cls.member.req("POST", "/api/auth/login", {"username": "medlem", "password": "Efteraar2026x"})

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait(5)
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_backup_and_restore(self):
        o = self.owner
        o.req("PUT", "/api/state/notes", {"state": {"v": "før"}})
        st, body, _ = o.req("POST", "/api/system/backups", {})
        self.assertEqual(st, 201, body)
        name = body["backup"]["name"]
        self.assertTrue(name.startswith("hubtech-manual-"))
        st, body, _ = o.req("GET", "/api/system/backups")
        self.assertIn(name, [b["name"] for b in body["backups"]])
        o.req("PUT", "/api/state/notes", {"state": {"v": "efter"}})
        st, body, _ = o.req("POST", "/api/system/restore", {"name": name})
        self.assertEqual(st, 200, body)
        self.assertFalse(body["loggedOut"])
        self.assertTrue(body["safetyCopy"]["name"].startswith("hubtech-before-restore-"))
        self.assertEqual(o.req("GET", "/api/state/notes")[1]["state"], {"v": "før"})
        # download the copy and restore it again as an upload
        st, raw, hdr = o.req("GET", f"/api/system/backups/{name}")
        self.assertEqual(st, 200)
        self.assertTrue(raw.startswith(b"SQLite format 3"))
        self.assertIn("attachment", hdr.get("Content-Disposition", ""))
        r = urllib.request.Request(self.base + "/api/system/restore", data=raw, method="POST",
                                   headers={"X-Requested-With": "hubtech", "Content-Type": "application/octet-stream"})
        with o.opener.open(r, timeout=10) as resp:
            self.assertEqual(resp.status, 200)
        bad = urllib.request.Request(self.base + "/api/system/restore", data=b"not a database at all", method="POST",
                                     headers={"X-Requested-With": "hubtech", "Content-Type": "application/octet-stream"})
        with self.assertRaises(urllib.error.HTTPError) as cm:
            o.opener.open(bad, timeout=10)
        self.assertEqual(cm.exception.code, 400)
        self.assertEqual(o.req("GET", "/api/system/backups/..%2Fhubtech.db")[0], 404)
        self.assertEqual(o.req("POST", "/api/system/restore", {"name": "../hubtech.db"})[0], 404)

    def test_member_cannot_touch_backups(self):
        self.assertEqual(self.member.req("GET", "/api/system/backups")[0], 403)
        self.assertEqual(self.member.req("POST", "/api/system/backups", {})[0], 403)
        self.assertEqual(self.member.req("POST", "/api/system/restore", {"name": "x"})[0], 403)

    def test_personal_export_and_import(self):
        m = self.member
        m.req("PUT", "/api/state/tasks", {"state": {"items": [1, 2, 3]}})
        st, body, _ = m.req("POST", "/api/office/docs", {"kind": "doc", "title": "Rapport", "data": {"html": "<p>hej</p>"}})
        doc_id = body["doc"]["id"]
        st, exp, _ = m.req("GET", "/api/me/export")
        self.assertEqual(st, 200)
        self.assertEqual(exp["format"], "hubtech-export")
        self.assertEqual(exp["states"]["tasks"], {"items": [1, 2, 3]})
        self.assertIn(doc_id, [d["id"] for d in exp["office"]])
        self.assertNotIn("password_hash", json.dumps(exp))
        m.req("DELETE", f"/api/office/docs/{doc_id}")
        m.req("PUT", "/api/state/tasks", {"state": {"items": []}})
        st, body, _ = m.req("POST", "/api/me/import", exp)
        self.assertEqual(st, 200, body)
        self.assertGreaterEqual(body["imported"]["office"], 1)
        self.assertEqual(m.req("GET", "/api/state/tasks")[1]["state"], {"items": [1, 2, 3]})
        self.assertEqual(m.req("GET", f"/api/office/docs/{doc_id}")[1]["doc"]["data"], {"html": "<p>hej</p>"})
        # another user importing the same file gets copies, never the original ids
        st, body, _ = self.owner.req("POST", "/api/me/import", exp)
        self.assertEqual(st, 200)
        self.assertEqual(m.req("GET", f"/api/office/docs/{doc_id}")[0], 200)
        self.assertEqual(self.owner.req("GET", f"/api/office/docs/{doc_id}")[0], 404)
        self.assertEqual(m.req("POST", "/api/me/import", {"format": "noget-andet"})[0], 400)


class RateLimitAndTokenTest(unittest.TestCase):
    """Write rate limit (429) and the desktop launcher's one-time shutdown key."""

    def test_rate_limit_and_shutdown_token(self):
        tmp = Path(tempfile.mkdtemp(prefix="hubtech-rl-"))
        port = free_port()
        env = dict(os.environ, HUBTECH_DATA_DIR=str(tmp), HUBTECH_QUIET="1", HUBTECH_SIGNUP="first", HUBTECH_BYTEFORGE_AUTOSTART="false",
                   HUBTECH_WRITE_RATE="30", HUBTECH_SHUTDOWN_TOKEN="hemmelig-engangsnoegle-123")
        proc = subprocess.Popen([sys.executable, str(ROOT / "server" / "app.py"), "--port", str(port)], env=env,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            base = f"http://127.0.0.1:{port}"
            for _ in range(50):
                try:
                    urllib.request.urlopen(base + "/api/health", timeout=1)
                    break
                except OSError:
                    time.sleep(0.1)
            c = Client(base)
            self.assertEqual(c.req("POST", "/api/auth/register", {"username": "ejer", "displayName": "Ejer", "password": "Sommer2026xx"})[0], 201)
            # behind a (local) reverse proxy the owner can't stop the server from the browser
            self.assertEqual(c.req("POST", "/api/system/shutdown", {}, headers={"X-Forwarded-For": "203.0.113.9"})[0], 403)
            codes = [c.req("PUT", "/api/state/notes", {"state": {"i": i}})[0] for i in range(40)]
            self.assertIn(429, codes)
            self.assertEqual(codes[0], 200)
            st, body, hdr = c.req("PUT", "/api/state/notes", {"state": {}})
            self.assertEqual(st, 429)
            self.assertTrue(hdr.get("Retry-After"))
            # wrong key → refused; right key → stops without a login
            anon = Client(base)
            self.assertEqual(anon.req("POST", "/api/system/shutdown", {}, headers={"X-Hubtech-Shutdown": "forkert"})[0], 403)
            st, body, _ = anon.req("POST", "/api/system/shutdown", {}, headers={"X-Hubtech-Shutdown": "hemmelig-engangsnoegle-123"})
            self.assertEqual(st, 202, body)
            self.assertEqual(proc.wait(10), 0)
        finally:
            if proc.poll() is None:
                proc.kill()
            shutil.rmtree(tmp, ignore_errors=True)


class UpdateTest(unittest.TestCase):
    """Update from a zip: runs a copy of HUBTECH so the real program folder is never touched."""

    def test_update_from_zip(self):
        import zipfile
        tmp = Path(tempfile.mkdtemp(prefix="hubtech-upd-"))
        prog, data = tmp / "prog", tmp / "data"
        shutil.copytree(ROOT / "server", prog / "server", ignore=shutil.ignore_patterns("__pycache__"))
        (prog / "web").mkdir(parents=True)
        (prog / "web" / "index.html").write_text("<!doctype html><title>gammel</title>", encoding="utf-8")
        port = free_port()
        env = dict(os.environ, HUBTECH_DATA_DIR=str(data), HUBTECH_QUIET="1", HUBTECH_SIGNUP="first", HUBTECH_BYTEFORGE_AUTOSTART="false")
        env.pop("HUBTECH_LAUNCHER", None)
        proc = subprocess.Popen([sys.executable, str(prog / "server" / "app.py"), "--port", str(port)], env=env, cwd=str(prog),
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            base = f"http://127.0.0.1:{port}"
            for _ in range(50):
                try:
                    urllib.request.urlopen(base + "/api/health", timeout=1)
                    break
                except OSError:
                    time.sleep(0.1)
            c = Client(base)
            c.req("POST", "/api/auth/register", {"username": "ejer", "displayName": "Ejer", "password": "Sommer2026xx"})
            c.req("PUT", "/api/state/notes", {"state": {"behold": True}})
            cfg = (prog / "server" / "config.py").read_text(encoding="utf-8").replace('VERSION = "', 'VERSION = "9.', 1)
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w") as z:
                z.writestr("hubtech/server/config.py", cfg)
                z.writestr("hubtech/web/index.html", "<!doctype html><title>ny</title>")
                z.writestr("hubtech/.env", "HEMMELIG=1")                 # never installed
                z.writestr("hubtech/../../evil.txt", "x")                  # zip-slip – ignored
                z.writestr("hubtech/server/hubtech.db", "x")              # databases are never installed

            def post(path, data, ctype):
                r = urllib.request.Request(base + path, data=data, method="POST", headers={"X-Requested-With": "hubtech", "Content-Type": ctype})
                try:
                    with c.opener.open(r, timeout=10) as resp:
                        return resp.status, json.loads(resp.read())
                except urllib.error.HTTPError as e:
                    return e.code, json.loads(e.read())
            st, body = post("/api/system/update/check", buf.getvalue(), "application/zip")
            self.assertEqual(st, 200, body)
            u = body["update"]
            self.assertTrue(u["newer"])
            self.assertEqual(u["files"], 2)
            st, body = post("/api/system/update/check", b"not a zip", "application/zip")
            self.assertEqual(st, 400)
            st, body = post("/api/system/update/install", json.dumps({"id": u["id"]}).encode(), "application/json")
            self.assertEqual(st, 200, body)
            self.assertTrue(body["restarting"])
            self.assertIn("<title>ny</title>", (prog / "web" / "index.html").read_text(encoding="utf-8"))
            self.assertFalse((prog / ".env").exists())
            self.assertFalse((tmp / "evil.txt").exists())
            self.assertTrue(any((prog / ".update-backup").glob("hubtech-*.zip")))
            # the server restarts itself with the new version; data is untouched
            ver = None
            for _ in range(80):
                try:
                    with urllib.request.urlopen(base + "/api/health", timeout=1) as r:
                        ver = json.loads(r.read())["version"]
                    if ver.startswith("9."):
                        break
                except OSError:
                    pass
                time.sleep(0.15)
            self.assertTrue(ver and ver.startswith("9."), ver)
            self.assertEqual(c.req("GET", "/api/state/notes")[1]["state"], {"behold": True})
            self.assertTrue(any((data / "backups").glob("hubtech-before-update-*.db")))
        finally:
            try:
                urllib.request.urlopen(urllib.request.Request(base + "/api/system/shutdown", data=b"{}", method="POST"), timeout=2)
            except Exception:
                pass
            try:
                subprocess.run(["pkill", "-f", str(prog / "server" / "app.py")], capture_output=True)
            except OSError:
                pass
            if proc.poll() is None:
                proc.kill()
            shutil.rmtree(tmp, ignore_errors=True)


class SyncTest(unittest.TestCase):
    """Phone ⇄ computer: pull my data from another HUBTECH and push it back."""

    def _server(self, tmp):
        port = free_port()
        env = dict(os.environ, HUBTECH_DATA_DIR=str(tmp), HUBTECH_QUIET="1", HUBTECH_SIGNUP="first", HUBTECH_BYTEFORGE_AUTOSTART="false")
        proc = subprocess.Popen([sys.executable, str(ROOT / "server" / "app.py"), "--port", str(port)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        base = f"http://127.0.0.1:{port}"
        for _ in range(50):
            try:
                urllib.request.urlopen(base + "/api/health", timeout=1)
                break
            except OSError:
                time.sleep(0.1)
        return proc, base

    def test_pull_and_push(self):
        tmp = Path(tempfile.mkdtemp(prefix="hubtech-sync-"))
        pc, pc_base = self._server(tmp / "pc")
        phone, phone_base = self._server(tmp / "phone")
        try:
            a = Client(pc_base)
            a.req("POST", "/api/auth/register", {"username": "lucas", "displayName": "Lucas", "password": "Sommer2026xx"})
            a.req("PUT", "/api/state/notes", {"state": {"fra": "pc"}})
            a.req("POST", "/api/office/docs", {"kind": "doc", "title": "Rapport fra pc", "data": {"html": "<p>hej</p>"}})
            b = Client(phone_base)
            b.req("POST", "/api/auth/register", {"username": "lucas", "displayName": "Lucas", "password": "Telefon2026xx"})
            st, body, _ = b.req("POST", "/api/sync/pull", {"url": pc_base, "username": "lucas", "password": "forkert-kode"})
            self.assertEqual(st, 400)
            st, body, _ = b.req("POST", "/api/sync/pull", {"url": pc_base, "username": "lucas", "password": "Sommer2026xx"})
            self.assertEqual(st, 200, body)
            self.assertEqual(b.req("GET", "/api/state/notes")[1]["state"], {"fra": "pc"})
            self.assertIn("Rapport fra pc", [d["title"] for d in b.req("GET", "/api/office/docs")[1]["docs"]])
            b.req("PUT", "/api/state/tasks", {"state": {"tasks": [{"id": "x", "title": "Fra telefonen"}]}})
            st, body, _ = b.req("POST", "/api/sync/push", {"url": pc_base, "username": "lucas", "password": "Sommer2026xx"})
            self.assertEqual(st, 200, body)
            self.assertEqual(a.req("GET", "/api/state/tasks")[1]["state"]["tasks"][0]["title"], "Fra telefonen")
            self.assertEqual(b.req("GET", "/api/sync")[1]["url"], pc_base)
            self.assertEqual(b.req("POST", "/api/sync/pull", {"url": "ftp://x", "username": "a", "password": "b"})[0], 400)
            self.assertEqual(Client(phone_base).req("POST", "/api/sync/pull", {"url": pc_base, "username": "a", "password": "b"})[0], 401)
        finally:
            for pr in (pc, phone):
                pr.terminate()
                pr.wait(5)
            shutil.rmtree(tmp, ignore_errors=True)


class MergeTest(unittest.TestCase):
    """autosync.merge_state: lists with ids are merged item by item; deletions are recognised from the last sync."""

    def test_merge(self):
        from server.autosync import merge_state
        phone = {"tasks": [{"id": "a", "title": "A"}, {"id": "p", "title": "Ny på telefon"}], "view": "board"}
        pc = {"tasks": [{"id": "a", "title": "A"}, {"id": "c", "title": "Ny på pc"}], "view": "list"}
        m, base = merge_state(phone, pc, local_newer=True)
        self.assertEqual([t["id"] for t in m["tasks"]], ["a", "p", "c"])     # nothing is lost on the first sync
        self.assertEqual(m["view"], "board")                                  # other keys: the newest side
        self.assertEqual(sorted(base["tasks"]), ["a", "c", "p"])
        # "c" deleted on the phone after that sync, "a" edited on the pc (item stamp decides)
        phone2 = {"tasks": [{"id": "a", "title": "A", "updated": 5}, {"id": "p", "title": "Ny på telefon"}]}
        pc2 = {"tasks": [{"id": "a", "title": "A rettet", "updated": 9}, {"id": "p", "title": "Ny på telefon"}, {"id": "c", "title": "Ny på pc"}, {"id": "d", "title": "Helt ny"}]}
        m2, _ = merge_state(phone2, pc2, local_newer=True, base=base)
        self.assertEqual([t["id"] for t in m2["tasks"]], ["a", "p", "d"])
        self.assertEqual(m2["tasks"][0]["title"], "A rettet")
        # not dicts / no id lists → newest wins
        self.assertEqual(merge_state({"v": "x"}, {"v": "y"}, local_newer=False)[0], {"v": "y"})
        self.assertEqual(merge_state([1, 2], [3], local_newer=True)[0], [1, 2])

    def test_plan_same_second(self):
        from server.autosync import plan
        L = {"states": {"a": 10, "b": 10, "c": 5}, "stateHashes": {"a": "x", "b": "y", "c": "z"}, "office": {"d1": 3}, "files": ["f1"]}
        R = {"states": {"a": 10, "b": 10, "e": 1}, "stateHashes": {"a": "x", "b": "DIFFERENT", "e": "q"}, "office": {"d1": 4}, "files": ["f2"]}
        p = plan(L, R)
        self.assertEqual(p["pull"]["states"], ["b", "e"])      # b: same second, different content → both lists → merged
        self.assertEqual(p["push"]["states"], ["b", "c"])
        self.assertEqual((p["pull"]["office"], p["push"]["office"]), (["d1"], []))
        self.assertEqual((p["pull"]["files"], p["push"]["files"]), (["f2"], ["f1"]))


class AutoSyncTest(SyncTest):
    """Automatic two-way sync with a sync key: newest wins per app/document, images follow, no ping-pong."""

    def test_two_way(self):
        import base64
        tmp = Path(tempfile.mkdtemp(prefix="hubtech-autosync-"))
        pc, pc_base = self._server(tmp / "pc")
        phone, phone_base = self._server(tmp / "phone")
        try:
            a = Client(pc_base)
            a.req("POST", "/api/auth/register", {"username": "lucas", "displayName": "Lucas", "password": "Sommer2026xx"})
            a.req("PUT", "/api/state/notes", {"state": {"fra": "pc"}})
            png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
            r = urllib.request.Request(pc_base + "/api/office/files", data=png, method="POST", headers={"X-Requested-With": "hubtech", "Content-Type": "image/png"})
            with a.opener.open(r, timeout=10) as resp:
                fid = json.loads(resp.read())["file"]["id"]
            st, body, _ = a.req("POST", "/api/office/docs", {"kind": "doc", "title": "Rapport", "data": {"html": f'<p><img src="/api/office/files/{fid}"></p>'}})
            doc_id = body["doc"]["id"]
            b = Client(phone_base)
            b.req("POST", "/api/auth/register", {"username": "lucas", "displayName": "Lucas", "password": "Telefon2026xx"})
            b.req("PUT", "/api/state/tasks", {"state": {"tasks": [{"id": "t", "title": "Fra telefonen"}]}})
            self.assertEqual(b.req("GET", "/api/sync/auto")[1], {"enabled": False})
            self.assertEqual(b.req("POST", "/api/sync/auto", {"url": pc_base, "username": "lucas", "password": "forkert"})[0], 400)
            st, body, _ = b.req("POST", "/api/sync/auto", {"url": pc_base, "username": "lucas", "password": "Sommer2026xx", "interval": 5})
            self.assertEqual(st, 200, body)
            self.assertTrue(body["enabled"] and body["first"]["ok"], body)
            self.assertEqual(body["first"]["pulled"], 3)      # notes, the document, the image
            self.assertEqual(body["first"]["pushed"], 1)      # tasks
            self.assertEqual(b.req("GET", "/api/state/notes")[1]["state"], {"fra": "pc"})
            self.assertEqual(a.req("GET", "/api/state/tasks")[1]["state"]["tasks"][0]["title"], "Fra telefonen")
            self.assertEqual(b.req("GET", f"/api/office/files/{fid}")[0], 200)
            self.assertIn(fid, json.dumps(b.req("GET", f"/api/office/docs/{doc_id}")[1]))
            # nothing changed → nothing moves (timestamps were copied along)
            again = b.req("POST", "/api/sync/auto/run", {"wait": True})[1]
            self.assertEqual((again["pulled"], again["pushed"]), (0, 0), again)
            # changed on both sides – each side's newest change wins per app
            time.sleep(1.1)
            b.req("PUT", "/api/state/notes", {"state": {"fra": "telefon"}})
            a.req("PUT", "/api/state/calendar", {"state": {"events": [{"id": "e", "title": "Aftale fra pc"}]}})
            time.sleep(1.1)
            a.req("PUT", "/api/state/tasks", {"state": {"tasks": [{"id": "t", "title": "Rettet på pc"}]}})
            res = b.req("POST", "/api/sync/auto/run", {"wait": True})[1]
            self.assertTrue(res["ok"], res)
            self.assertEqual(a.req("GET", "/api/state/notes")[1]["state"], {"fra": "telefon"})
            self.assertEqual(b.req("GET", "/api/state/calendar")[1]["state"]["events"][0]["title"], "Aftale fra pc")
            self.assertEqual(b.req("GET", "/api/state/tasks")[1]["state"]["tasks"][0]["title"], "Rettet på pc")
            # an item deleted on one device stays deleted after the next sync, new items from both survive
            b.req("PUT", "/api/state/tasks", {"state": {"tasks": [{"id": "t", "title": "Rettet på pc"}, {"id": "u", "title": "Ny på telefon"}]}})
            a.req("PUT", "/api/state/tasks", {"state": {"tasks": [{"id": "v", "title": "Ny på pc"}]}})          # "t" deleted on the pc
            self.assertTrue(b.req("POST", "/api/sync/auto/run", {"wait": True})[1]["ok"])
            for side in (a, b):
                self.assertEqual(sorted(x["id"] for x in side.req("GET", "/api/state/tasks")[1]["state"]["tasks"]), ["u", "v"])
            again = b.req("POST", "/api/sync/auto/run", {"wait": True})[1]
            self.assertEqual((again["pulled"], again["pushed"]), (0, 0), again)
            # the sync key is required and can be revoked
            self.assertEqual(Client(pc_base).req("GET", "/api/sync/manifest")[0], 401)
            self.assertEqual(Client(pc_base).req("GET", "/api/sync/manifest", headers={"X-Hubtech-Sync": "nope"})[0], 401)
            con = sqlite3.connect(str(tmp / "phone" / "hubtech.db"))
            tok = json.loads(con.execute("SELECT value FROM server_settings WHERE key LIKE 'autosync_%'").fetchone()[0])["token"]
            con.close()
            self.assertEqual(Client(pc_base).req("GET", "/api/sync/manifest", headers={"X-Hubtech-Sync": tok})[0], 200)
            self.assertEqual(b.req("PUT", "/api/sync/auto", {"interval": 60})[1]["interval"], 60)
            self.assertEqual(b.req("DELETE", "/api/sync/auto")[1], {"enabled": False})
            self.assertEqual(Client(pc_base).req("GET", "/api/sync/manifest", headers={"X-Hubtech-Sync": tok})[0], 401)
            self.assertEqual(b.req("POST", "/api/sync/auto/run", {})[0], 400)
        finally:
            for pr in (pc, phone):
                pr.terminate()
                pr.wait(5)
            shutil.rmtree(tmp, ignore_errors=True)


class ShutdownTest(unittest.TestCase):
    """POST /api/system/shutdown stops the server process (used by Indstillinger → Om → Luk HUBTECH)."""

    def test_owner_can_stop_server(self):
        tmp = Path(tempfile.mkdtemp(prefix="hubtech-stop-"))
        port = free_port()
        env = dict(os.environ, HUBTECH_DATA_DIR=str(tmp), HUBTECH_QUIET="1", HUBTECH_SIGNUP="first", HUBTECH_BYTEFORGE_AUTOSTART="false")
        proc = subprocess.Popen([sys.executable, str(ROOT / "server" / "app.py"), "--port", str(port)], env=env,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            base = f"http://127.0.0.1:{port}"
            for _ in range(50):
                try:
                    urllib.request.urlopen(base + "/api/health", timeout=1)
                    break
                except OSError:
                    time.sleep(0.1)
            c = Client(base)
            self.assertEqual(c.req("POST", "/api/auth/register", {"username": "ejer", "displayName": "Ejer", "password": "Sommer2026xx"})[0], 201)
            st, body, _ = c.req("POST", "/api/system/shutdown", {})
            self.assertEqual(st, 202, body)
            self.assertEqual(proc.wait(10), 0)
        finally:
            if proc.poll() is None:
                proc.kill()
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
