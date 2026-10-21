"""Admin app: only the owner and the people the owner gives access can use it."""
import json
import os
import urllib.error
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

    def test_turn_server_setting_and_visitor_throttle(self):
        a, b = self.a, self.b
        self.assertEqual(b.req("GET", "/api/cm/calls/ice-config")[0], 403)
        self.assertEqual(b.req("PUT", "/api/cm/calls/ice-config", {"urls": "turn:x.example:3478"})[0], 403)
        st, r, _ = a.req("PUT", "/api/cm/calls/ice-config", {"urls": "http://evil.example", "username": "u"})
        self.assertEqual((st, r["code"]), (400, "invalid"))
        st, r, _ = a.req("PUT", "/api/cm/calls/ice-config", {"urls": "turn:turn.example.com:3478, turns:turn.example.com:443?transport=tcp", "username": "hub", "credential": "hemmelig"})
        self.assertEqual(st, 200, r)
        self.assertEqual((len(r["urls"]), r["hasCredential"]), (2, True))
        st, r, _ = a.req("PUT", "/api/cm/calls/ice-config", {"urls": "turn:turn.example.com:3478", "username": "hub"})   # no password typed = keep it
        self.assertTrue(r["hasCredential"])
        st, cfg, _ = a.req("GET", "/api/cm/calls/ice-config")
        self.assertNotIn("credential", cfg)                     # never sent back to the settings page
        # the TURN server is handed to the browsers when a call starts
        self.join_cm(a, b, self.c)
        a.req("POST", "/api/cm/friends", {"username": "bent"})
        b.req("POST", f"/api/cm/friends/{self.ids['anna']}/accept")
        st, call, _ = a.req("POST", "/api/cm/calls", {"to": self.ids["bent"]})
        self.assertEqual(st, 201, call)
        turn = [s for s in call["ice"] if any(u.startswith("turn:") for u in s["urls"])]
        self.assertEqual((turn[0]["username"], turn[0]["credential"]), ("hub", "hemmelig"))
        self.assertTrue(any("stun:" in u for s in call["ice"] for u in s["urls"]))
        a.req("POST", f"/api/cm/calls/{call['id']}/leave")
        self.assertEqual(a.req("PUT", "/api/cm/calls/ice-config", {"urls": ""})[1]["urls"], [])
        # behind "tailscale funnel" every visitor comes from 127.0.0.1: one person's wrong passwords
        # must not lock the account for everybody else
        x = test_social.Client(self.base)
        for _ in range(6):
            x.req("POST", "/api/auth/login", {"username": "carl", "password": "forkert-kode1A"}, headers={"X-Forwarded-For": "203.0.113.9"})
        self.assertEqual(x.req("POST", "/api/auth/login", {"username": "carl", "password": "forkert-kode1A"}, headers={"X-Forwarded-For": "203.0.113.9"})[0], 429)
        st, _, _ = x.req("POST", "/api/auth/login", {"username": "carl", "password": "forkert-kode1A"}, headers={"X-Forwarded-For": "198.51.100.4"})
        self.assertEqual(st, 401)   # another visitor is not throttled

    def test_delete_accounts(self):
        a, b = self.a, self.b
        st, made, _ = a.req("POST", "/api/users", {"username": "dorte", "displayName": "Dorte", "password": "Vinter2026xx"})
        self.assertEqual(st, 201, made)
        did = made["user"]["id"]
        d = test_social.Client(self.base)
        self.assertEqual(d.req("POST", "/api/auth/login", {"username": "dorte", "password": "Vinter2026xx"})[0], 200)
        d.req("PUT", "/api/state/notes", {"state": {"notes": [{"id": "n1", "title": "Hemmelig"}]}})
        # an ordinary member may not delete anyone
        self.assertEqual(self.c.req("DELETE", f"/api/admin/users/{did}", {"confirm": "dorte"})[0], 403)
        # the username must be typed
        st, r, _ = a.req("DELETE", f"/api/admin/users/{did}", {"confirm": "dort"})
        self.assertEqual((st, r["code"]), (400, "confirm"))
        # nobody deletes the owner or themselves from here
        self.assertEqual(a.req("DELETE", f"/api/admin/users/{self.ids['anna']}", {"confirm": "anna"})[1]["code"], "self")
        a.req("PUT", f"/api/admin/access/{self.ids['bent']}", {"admin": True})
        self.assertEqual(b.req("DELETE", f"/api/admin/users/{self.ids['anna']}", {"confirm": "anna"})[0], 403)
        a.req("PUT", f"/api/admin/access/{did}", {"admin": True})
        self.assertEqual(b.req("DELETE", f"/api/admin/users/{did}", {"confirm": "dorte"})[0], 403)   # an admin can't delete another admin
        a.req("PUT", f"/api/admin/access/{did}", {"admin": False})
        st, r, _ = b.req("DELETE", f"/api/admin/users/{did}", {"confirm": "@Dorte"})                # an admin can delete a member
        self.assertEqual(st, 200, r)
        a.req("PUT", f"/api/admin/access/{self.ids['bent']}", {"admin": False})
        # gone – logged out everywhere, data removed, logged
        self.assertEqual(d.req("GET", "/api/me")[0], 401)
        self.assertNotIn("dorte", [u["username"] for u in a.req("GET", "/api/admin/users")[1]["users"]])
        self.assertEqual(test_social.Client(self.base).req("POST", "/api/auth/login", {"username": "dorte", "password": "Vinter2026xx"})[0], 401)
        self.assertIn("delete-user", [e["action"] for e in a.req("GET", "/api/admin/log")[1]["log"]])
        self.assertEqual(a.req("DELETE", f"/api/admin/users/{did}", {"confirm": "dorte"})[0], 404)

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

    def test_client_errors(self):
        a, c = self.a, self.c
        self.assertEqual(c.req("POST", "/api/client-errors", {"kind": "ai-load", "message": "QuotaExceededError: token=abc123 full", "extra": {"model": "qwen05"}})[0], 202)
        self.assertEqual(c.req("POST", "/api/client-errors", {"kind": "js", "message": ""})[0], 400)
        self.assertEqual(c.req("GET", "/api/admin/errors")[0], 403)
        errs = a.req("GET", "/api/admin/errors")[1]["errors"]
        self.assertEqual(errs[0]["kind"], "ai-load")
        self.assertNotIn("abc123", errs[0]["message"])          # things that look like secrets are masked
        self.assertEqual(errs[0]["extra"]["model"], "qwen05")
        for _ in range(35):
            c.req("POST", "/api/client-errors", {"kind": "js", "message": "flood"})
        self.assertLessEqual(len(a.req("GET", "/api/admin/errors")[1]["errors"]), 31)   # 30 per 10 minutes per device
        self.assertEqual(a.req("DELETE", "/api/admin/errors")[0], 200)
        self.assertEqual(a.req("GET", "/api/admin/errors")[1]["errors"], [])

    def test_profile_picture(self):
        import urllib.request
        b, c = self.b, self.c
        PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000" "1f15c4890000000d49444154789c6360f8cfc0000003010100c9fe92ef0000000049454e44ae426082")
        def up(client, raw, ctype="image/png"):
            r = urllib.request.Request(self.base + "/api/me/avatar", data=raw, method="POST", headers={"Content-Type": ctype, "X-Requested-With": "hubtech"})
            try:
                with client.opener.open(r, timeout=10) as resp:
                    return resp.status, json.loads(resp.read())
            except urllib.error.HTTPError as e:
                return e.code, json.loads(e.read())
        self.assertEqual(up(b, b"<svg onload=alert(1)>")[0], 400)              # only real JPEG/PNG/WebP
        try:                                                                    # too big: refused before it is read
            self.assertEqual(up(b, b"\x89PNG\r\n\x1a\n" + b"x" * (3 * 1024 * 1024))[0], 413)
        except urllib.error.URLError:
            pass
        st, body = up(b, PNG)
        self.assertEqual(st, 200, body)
        url = body["user"]["avatar"]
        self.assertRegex(url, r"^/api/avatars/\d+/[0-9a-f]{16}\.png$")
        r = urllib.request.Request(self.base + url)
        with c.opener.open(r, timeout=10) as resp:                              # friends and others see it
            self.assertEqual(resp.read(), PNG)
            self.assertIn("immutable", resp.headers.get("Cache-Control"))
        anon = urllib.request.build_opener()
        with self.assertRaises(urllib.error.HTTPError):
            anon.open(self.base + url, timeout=10)                               # not for strangers without login
        self.assertEqual(b.req("PATCH", "/api/me", {"displayName": "Bent", "avatar": url})[0], 200)    # saving the profile keeps it
        self.assertEqual(b.req("PATCH", "/api/me", {"avatar": "/api/avatars/1/0000000000000000.png"})[1]["code"], "invalid")
        st, body, _ = b.req("DELETE", "/api/me/avatar")
        self.assertEqual((st, body["user"]["avatar"]), (200, "⚡"))

    def test_presence_contact_search(self):
        a, b, c, d = self.a, self.b, self.c, self.d
        self.join_cm(a, b, c)
        # carl only takes requests from friends of friends; dina from nobody
        self.assertEqual(c.req("PATCH", "/api/cm/me", {"contact": "fof"})[0], 200)
        self.assertEqual(c.req("PATCH", "/api/cm/me", {"contact": "alle"})[1]["code"], "invalid")
        self.assertEqual(b.req("POST", "/api/cm/friends", {"username": "carl"})[1]["code"], "no_requests")
        a.req("POST", "/api/cm/friends", {"username": "bent"}); b.req("POST", f"/api/cm/friends/{self.ids['anna']}/accept")
        self.assertEqual(a.req("POST", "/api/cm/friends", {"username": "carl"})[1]["code"], "no_requests")   # anna isn't a friend's friend either
        c.req("POST", "/api/cm/friends", {"username": "anna"}); a.req("POST", f"/api/cm/friends/{self.ids['carl']}/accept")   # carl may ask anna
        self.assertEqual(b.req("POST", "/api/cm/friends", {"username": "carl"})[0], 201)       # now anna is a mutual friend
        # busy: no calls; invisible: shown as offline
        b.req("GET", "/api/live?since=0")
        self.assertEqual(b.req("PATCH", "/api/cm/me", {"presence": "busy"})[0], 200)
        self.assertEqual(a.req("POST", "/api/cm/calls", {"to": self.ids["bent"]})[1]["code"], "dnd")
        self.assertEqual(b.req("GET", "/api/cm/me")[1]["presence"], "busy")
        b.req("PATCH", "/api/cm/me", {"presence": "invisible"})
        friends = a.req("GET", "/api/cm/friends")[1]["friends"]
        bent = [f for f in friends if f["username"] == "bent"][0]
        self.assertEqual((bent["online"], bent["presence"]), (False, "offline"))
        b.req("PATCH", "/api/cm/me", {"presence": "online"})
        # search in a conversation
        dm = f"dm-{min(self.ids['anna'], self.ids['bent'])}-{max(self.ids['anna'], self.ids['bent'])}"
        for body in ("Hvornår mødes vi?", "Kl. 18 ved stationen", "100% sikker_på det"):
            a.req("POST", f"/api/cm/channels/{dm}/messages", {"body": body})
        hits = b.req("GET", f"/api/cm/channels/{dm}/messages?q=stationen")[1]["messages"]
        self.assertEqual([m["body"] for m in hits], ["Kl. 18 ved stationen"])
        self.assertEqual(len(b.req("GET", f"/api/cm/channels/{dm}/messages?q=%25")[1]["messages"]), 1)   # % is a normal character
        self.assertIn(d.req("GET", f"/api/cm/channels/{dm}/messages?q=stationen")[0], (401, 403, 404))   # not your conversation


if __name__ == "__main__":
    unittest.main()
