"""Admin app: only the owner and the people the owner gives access can use it."""
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_social  # noqa: E402  (not "from … import SocialTest": unittest would run its tests again)


class AdminTest(unittest.TestCase):
    join_cm = test_social.SocialTest.join_cm
    tearDownClass = classmethod(test_social.SocialTest.tearDownClass.__func__)

    @classmethod
    def setUpClass(cls):
        os.environ["HUBTECH_NO_NOTIFY_WORKER"] = "1"
        try:
            test_social.SocialTest.setUpClass.__func__(cls)
        finally:
            os.environ.pop("HUBTECH_NO_NOTIFY_WORKER", None)

    def test_access_and_actions(self):
        a, b, c = self.a, self.b, self.c
        bent = self.ids["bent"]
        self.assertTrue(a.req("GET", "/api/me")[1]["user"]["admin"])                 # the owner always
        self.assertFalse(b.req("GET", "/api/me")[1]["user"]["admin"])
        for path in ("/api/admin/overview", "/api/admin/users", "/api/admin/log"):
            self.assertEqual(b.req("GET", path)[0], 403, path)
        self.assertEqual(b.req("POST", "/api/admin/announce", {"title": "x"})[0], 403)
        # only the owner can give access
        self.assertEqual(b.req("PUT", f"/api/admin/access/{bent}", {"admin": True})[0], 403)
        self.assertEqual(a.req("PUT", f"/api/admin/access/{self.ids['anna']}", {"admin": False})[1]["code"], "owner")
        self.assertEqual(a.req("PUT", f"/api/admin/access/{bent}", {"admin": True})[0], 200)
        self.assertTrue(b.req("GET", "/api/me")[1]["user"]["admin"])
        st, o, _ = b.req("GET", "/api/admin/overview")
        self.assertEqual(st, 200, o)
        self.assertEqual(o["users"], 4)
        self.assertEqual(o["admins"], 2)
        users = b.req("GET", "/api/admin/users")[1]
        self.assertFalse(users["isOwner"])
        self.assertTrue(all(u["email"] == "" for u in users["users"]))              # e-mails only for the owner
        # an admin can't give access, and can't log the owner out
        self.assertEqual(b.req("PUT", f"/api/admin/access/{self.ids['carl']}", {"admin": True})[0], 403)
        self.assertEqual(b.req("POST", f"/api/admin/users/{self.ids['anna']}/logout")[0], 403)
        # reports: an admin sees all of them, also without joining Fællesskab
        self.join_cm(a, c)
        st, body, _ = a.req("POST", "/api/cm/servers", {"name": "Klubben"})
        self.assertEqual(st, 201, body)
        sid = body["server"]["id"]
        self.assertEqual(c.req("POST", "/api/cm/reports", {"kind": "server", "ref": sid, "reason": "spam"})[0], 201)
        reps = b.req("GET", "/api/cm/reports")[1]["reports"]
        self.assertEqual([r["reason"] for r in reps], ["spam"])
        self.assertEqual(b.req("POST", f"/api/cm/reports/{reps[0]['id']}/handle", {"action": "resolved"})[0], 200)
        # announcement to everyone → in everyone's inbox
        last = c.req("GET", "/api/notify/inbox?since=-1")[1]["last"]
        st, body, _ = b.req("POST", "/api/admin/announce", {"title": "Nedetid lørdag", "text": "Kl. 10-11"})
        self.assertEqual((st, body["sent"]), (200, 4))
        items = c.req("GET", f"/api/notify/inbox?since={last}")[1]["items"]
        self.assertEqual([(i["kind"], i["title"]) for i in items], [("announce", "Nedetid lørdag")])
        # log a user out everywhere
        self.assertEqual(b.req("POST", f"/api/admin/users/{self.ids['dina']}/logout")[1]["sessions"], 1)
        self.assertEqual(self.d.req("GET", "/api/me")[0], 401)
        log = a.req("GET", "/api/admin/log")[1]["log"]
        self.assertEqual([x["action"] for x in log][:3], ["logout", "announce", "access-on"])
        # access taken away again
        a.req("PUT", f"/api/admin/access/{bent}", {"admin": False})
        self.assertEqual(b.req("GET", "/api/admin/overview")[0], 403)

    def test_minecraft_info(self):
        a, b, c = self.a, self.b, self.c
        st, body, _ = c.req("GET", "/api/mc")
        self.assertEqual(st, 200, body)
        self.assertFalse(body["canEdit"])
        self.assertEqual(body["server"]["address"], "b-cabin.gl.joinmc.link")
        self.assertEqual(c.req("PUT", "/api/mc", {"version": "1.22"})[0], 403)
        st, body, _ = a.req("PUT", "/api/mc", {"address": "https://Play.Hubtech.dk:25570/", "port": 0, "version": "1.21.9",
                                                "rules": ["Vær sød", " "], "links": [{"label": "Kort", "url": "https://map.example.dk"}, {"label": "x", "url": "javascript:alert(1)"}]})
        self.assertEqual(st, 200, body)
        sv = body["server"]
        self.assertEqual((sv["address"], sv["port"], sv["version"]), ("play.hubtech.dk", 25570, "1.21.9"))
        self.assertEqual(sv["rules"], ["Vær sød"])
        self.assertEqual([l["url"] for l in sv["links"]], ["https://map.example.dk"])
        self.assertEqual(a.req("PUT", "/api/mc", {"address": "bad host!"})[1]["code"], "invalid")
        self.assertEqual(c.req("GET", "/api/mc")[1]["server"]["version"], "1.21.9")
        st, body, _ = c.req("GET", "/api/mc/status")
        self.assertEqual(st, 200)
        self.assertIn("java", body["status"])        # the address doesn't exist → offline, but answered


if __name__ == "__main__":
    unittest.main()
