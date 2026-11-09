"""Projekter: a room per project – messages, tasks, described changes (with review), a website, and copies on every PC."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from test_api import Client  # noqa: E402
from test_hublink import start, owner  # noqa: E402


class ProjectsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pa, cls.a = start()
        cls.pb, cls.b = start()
        cls.anna = owner(cls.a, "anna", "Anna Hansen")
        cls.bo = owner(cls.b, "bodil", "Bodil")
        # Anna adds a colleague on her PC
        st, body, _ = cls.anna.req("POST", "/api/users", {"username": "karl", "displayName": "Karl", "password": "Efteraar2026x"})
        assert st in (200, 201), body
        cls.karl = Client(cls.a)
        assert cls.karl.req("POST", "/api/auth/login", {"username": "karl", "password": "Efteraar2026x"})[0] == 200

    @classmethod
    def tearDownClass(cls):
        for p in (cls.pa, cls.pb):
            p.terminate()
            p.wait(5)

    def test_1_room(self):
        a, k = self.anna, self.karl
        self.assertEqual(a.req("POST", "/api/pj", {"name": ""})[0], 400)
        st, r, _ = a.req("POST", "/api/pj", {"name": "Lager-scanneren", "kind": "code", "customer": "Hansen ApS", "members": ["karl"]})
        self.assertEqual(st, 201, r)
        pid = r["project"]["id"]
        self.__class__.pid = pid
        self.assertEqual(sorted(m["username"] for m in r["project"]["members"]), ["anna", "karl"])
        self.assertEqual([p["name"] for p in k.req("GET", "/api/pj")[1]["projects"]], ["Lager-scanneren"])
        # someone who isn't in it can't read it
        outsider = Client(self.a)
        self.assertEqual(outsider.req("GET", f"/api/pj/{pid}")[0], 401)
        # messages, and unread for the other one
        st, m, _ = a.req("POST", f"/api/pj/{pid}/messages", {"text": "Hej @karl – her er planen:\n```python\nprint('hej')\n```"})
        self.assertEqual(st, 201, m)
        self.assertEqual(k.req("GET", "/api/pj")[1]["projects"][0]["unread"], 1)
        ev = k.req("GET", f"/api/pj/{pid}/events")[1]["events"]
        self.assertIn("planen", ev[-1]["body"]["text"])
        self.assertEqual(k.req("DELETE", f"/api/pj/{pid}/messages/{m['event']['id']}")[0], 403, "kun egne beskeder kan slettes")
        # tasks
        st, t, _ = a.req("POST", f"/api/pj/{pid}/tasks", {"title": "Sikr login", "assignee": "karl"})
        self.assertEqual(st, 201, t)
        tid = t["task"]["id"]
        # a change needs a title and a description
        files = [{"path": "scanner/login.py", "content": "def log_ind():\n    return False\n"}, {"path": "site/index.html", "content": "<h1>Lager</h1>"}]
        st, e, _ = k.req("POST", f"/api/pj/{pid}/commits", {"title": "Login", "descr": "kort", "files": files})
        self.assertEqual((st, e["code"]), (400, "descr"))
        st, e, _ = k.req("POST", f"/api/pj/{pid}/commits", {"title": "x", "descr": "Første version af login og forsiden.", "files": files})
        self.assertEqual((st, e["code"]), (400, "title"))
        self.assertEqual(k.req("POST", f"/api/pj/{pid}/commits", {"title": "Ond", "descr": "Prøver at skrive udenfor mappen.", "files": [{"path": "../x.py", "content": "x"}]})[0], 400)
        st, c, _ = k.req("POST", f"/api/pj/{pid}/commits", {"title": "Første version", "descr": "Hvad: login og forside.\nHvorfor: kunden vil se noget.", "files": files, "task": tid, "aiChecked": True})
        self.assertEqual(st, 201, c)
        self.assertTrue(c["commit"]["merged"] and c["commit"]["aiChecked"])
        self.assertEqual([f["path"] for f in k.req("GET", f"/api/pj/{pid}/files")[1]["files"]], ["scanner/login.py", "site/index.html"])
        self.assertTrue(k.req("GET", f"/api/pj/{pid}")[1]["project"]["tasksList"][0]["done"], "opgaven lukkes af ændringen")
        # nothing changed → refused
        self.assertEqual(k.req("POST", f"/api/pj/{pid}/commits", {"title": "Igen", "descr": "Samme indhold som før.", "files": files[:1]})[1]["code"], "empty")
        # with review: waits for someone else
        a.req("PATCH", f"/api/pj/{pid}", {"review": True})
        st, c2, _ = k.req("POST", f"/api/pj/{pid}/commits", {"title": "Bremse på login", "descr": "Venter efter 5 forkerte forsøg.", "files": [{"path": "scanner/login.py", "content": "def log_ind():\n    vent()\n    return False\n"}]})
        self.assertEqual(st, 201, c2)
        cid = c2["commit"]["id"]
        self.assertFalse(c2["commit"]["merged"])
        self.assertNotIn("vent()", k.req("GET", f"/api/pj/{pid}/file?path=scanner/login.py")[1]["content"])
        self.assertEqual(k.req("POST", f"/api/pj/{pid}/commits/{cid}/review", {"state": "approved"})[1]["code"], "own")
        st, rv, _ = a.req("POST", f"/api/pj/{pid}/commits/{cid}/review", {"state": "approved", "text": "Fint"})
        self.assertEqual(st, 200, rv)
        self.assertIn("vent()", k.req("GET", f"/api/pj/{pid}/file?path=scanner/login.py")[1]["content"])
        d = k.req("GET", f"/api/pj/{pid}/commits/{cid}")[1]["commit"]
        self.assertEqual(d["files"][0]["old"], "def log_ind():\n    return False\n")
        # go back
        st, back, _ = a.req("POST", f"/api/pj/{pid}/commits/{cid}/restore")
        self.assertEqual(st, 201, back)
        self.assertNotIn("vent()", k.req("GET", f"/api/pj/{pid}/file?path=scanner/login.py")[1]["content"])
        # the website: off, then for the team, then for everyone
        slug = k.req("GET", f"/api/pj/{pid}")[1]["project"]["slug"]
        self.assertEqual(Client(self.a).req("GET", f"/side/{slug}/", csrf=False)[0], 404)
        a.req("PATCH", f"/api/pj/{pid}", {"site": True, "siteDir": "site"})
        self.assertEqual(Client(self.a).req("GET", f"/side/{slug}/", csrf=False)[0], 403)
        st, page, hdr = k.req("GET", f"/side/{slug}/", csrf=False)
        self.assertEqual(st, 200)
        self.assertIn(b"<h1>Lager</h1>", page)
        self.assertIn("sandbox", hdr.get("Content-Security-Policy", ""))
        a.req("PATCH", f"/api/pj/{pid}", {"sitePublic": True})
        self.assertEqual(Client(self.a).req("GET", f"/side/{slug}/index.html", csrf=False)[0], 200)
        self.assertEqual(Client(self.a).req("GET", f"/side/{slug}/../../api/me", csrf=False)[0], 404)

    def test_2_across_pcs(self):
        # B connects to A
        st, inv, _ = self.anna.req("POST", "/api/hublink/invite", {"url": self.a})
        self.assertEqual(st, 200, inv)
        self.assertEqual(self.bo.req("POST", "/api/hublink/join", {"code": inv["code"], "url": self.b})[0], 200)
        # Anna makes a project with Bodil, who lives on the other PC
        st, r, _ = self.anna.req("POST", "/api/pj", {"name": "Kontorflytning", "members": ["bodil"]})
        self.assertEqual(st, 201, r)
        pid = r["project"]["id"]
        self.anna.req("POST", f"/api/pj/{pid}/messages", {"text": "Switchen er sat op."})
        # B fetches what it is missing – the whole project comes over
        self.assertEqual(self.bo.req("POST", "/api/pj/sync")[0], 200)
        mine = self.bo.req("GET", "/api/pj")[1]["projects"]
        self.assertEqual([p["name"] for p in mine], ["Kontorflytning"])
        ev = self.bo.req("GET", f"/api/pj/{pid}/events")[1]["events"]
        self.assertTrue(any(e["kind"] == "msg" and e["body"]["text"] == "Switchen er sat op." for e in ev))
        # Bodil answers on B; A gets it
        self.bo.req("POST", f"/api/pj/{pid}/messages", {"text": "Jeg tager kablerne."})
        self.bo.req("PATCH", f"/api/pj/{pid}", {"customer": "Hansen ApS"})
        self.anna.req("POST", "/api/pj/sync")
        ev = self.anna.req("GET", f"/api/pj/{pid}/events")[1]["events"]
        self.assertTrue(any(e["kind"] == "msg" and e["body"]["text"] == "Jeg tager kablerne." and e["author"] == "bodil" for e in ev))
        self.assertEqual(self.anna.req("GET", f"/api/pj/{pid}")[1]["project"]["customer"], "Hansen ApS")
        # a project without Bodil never reaches B
        self.anna.req("POST", "/api/pj", {"name": "Hemmeligt", "members": ["karl"]})
        self.bo.req("POST", "/api/pj/sync")
        self.assertEqual([p["name"] for p in self.bo.req("GET", "/api/pj")[1]["projects"]], ["Kontorflytning"])


if __name__ == "__main__":
    unittest.main()
