"""Forbind HUBTECH'er: two servers link with a code, and people visit the other one with their own account."""
import os
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from test_api import Client, ROOT, free_port  # noqa: E402


def start():
    tmp = Path(tempfile.mkdtemp(prefix="hubtech-link-"))
    port = free_port()
    env = dict(os.environ, HUBTECH_DATA_DIR=str(tmp), HUBTECH_QUIET="1", HUBTECH_SIGNUP="", HUBTECH_NO_NOTIFY_WORKER="1",
               HUBTECH_BYTEFORGE_AUTOSTART="false", HUBTECH_WRITE_RATE="5000")
    proc = subprocess.Popen([sys.executable, str(ROOT / "server" / "app.py"), "--port", str(port)], env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}"
    for _ in range(80):
        try:
            urllib.request.urlopen(base + "/api/health", timeout=1)
            break
        except OSError:
            time.sleep(0.1)
    return proc, base


def owner(base, user, name):
    c = Client(base)
    if c.req("POST", "/api/auth/login", {"username": user, "password": "Sommer2026xx"})[0] != 200:
        assert c.req("POST", "/api/auth/register", {"username": user, "displayName": name, "password": "Sommer2026xx"})[0] == 201
    return c


class HubLinkTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pa, cls.a = start()
        cls.pb, cls.b = start()

    @classmethod
    def tearDownClass(cls):
        for p in (cls.pa, cls.pb):
            p.terminate()
            p.wait(5)

    def test_link_and_visit(self):
        anna = owner(self.a, "anna", "Anna Hansen")
        bo = owner(self.b, "bodil", "Bo")
        # A's owner makes an invitation for its own address
        st, inv, _ = anna.req("POST", "/api/hublink/invite", {"url": self.a})
        self.assertEqual(st, 200, inv)
        self.assertTrue(inv["code"].startswith("HUB1-"))
        # a member can't
        self.assertEqual(Client(self.a).req("POST", "/api/hublink/invite", {"url": self.a})[0], 401)
        # B's owner looks at the code, then connects
        st, pk, _ = bo.req("POST", "/api/hublink/peek", {"code": "Her er koden: " + inv["code"] + " \n"})
        self.assertEqual((st, pk["name"], pk["url"]), (200, "Annas HUBTECH", self.a))
        self.assertEqual(anna.req("POST", "/api/hublink/peek", {"code": inv["code"]})[1]["code"], "own_code")
        st, j, _ = bo.req("POST", "/api/hublink/join", {"code": inv["code"], "url": self.b})
        self.assertEqual(st, 200, j)
        self.assertEqual(j["link"]["name"], "Annas HUBTECH")
        # the code works only once
        self.assertEqual(bo.req("POST", "/api/hublink/join", {"code": inv["code"], "url": self.b})[1]["code"], "remote_error")
        links_a = anna.req("GET", "/api/hublink")[1]["links"]
        self.assertEqual([l["name"] for l in links_a], ["Bos HUBTECH"])
        # Anna visits B: a ticket, and B logs her in on a guest account
        st, g, _ = anna.req("POST", f"/api/hublink/links/{links_a[0]['id']}/go")
        self.assertEqual(st, 200, g)
        self.assertTrue(g["url"].startswith(self.b + "/#/hub/"))
        ticket = g["url"].split("/#/hub/")[1]
        visitor = Client(self.b)
        st, s, _ = visitor.req("POST", "/api/hublink/sso", {"ticket": ticket})
        self.assertEqual(st, 200, s)
        self.assertEqual((s["user"]["displayName"], s["user"]["role"], s["from"]), ("Anna Hansen", "member", "Annas HUBTECH"))
        me = visitor.req("GET", "/api/hublink")[1]
        self.assertEqual(me["visitorFrom"]["name"], "Annas HUBTECH")
        # a ticket works once
        self.assertEqual(Client(self.b).req("POST", "/api/hublink/sso", {"ticket": ticket})[1]["code"], "used")
        # a forged one doesn't work
        raw, sig = ticket.split(".")
        self.assertEqual(Client(self.b).req("POST", "/api/hublink/sso", {"ticket": raw + "." + sig[::-1]})[1]["code"], "bad_ticket")
        # the second visit reuses the same account
        g2 = anna.req("POST", f"/api/hublink/links/{links_a[0]['id']}/go")[1]
        s2 = Client(self.b).req("POST", "/api/hublink/sso", {"ticket": g2["url"].split("/#/hub/")[1]})[1]
        self.assertEqual(s2["user"]["id"], s["user"]["id"])
        # the guest can't log in with a password, can't invite, and going "back" sends them home
        self.assertEqual(Client(self.b).req("POST", "/api/auth/login", {"username": s["user"]["username"], "password": ""})[0], 400)
        self.assertEqual(visitor.req("POST", "/api/hublink/invite", {"url": self.b})[0], 403)
        lb = bo.req("GET", "/api/hublink")[1]["links"][0]
        back = visitor.req("POST", f"/api/hublink/links/{lb['id']}/go")[1]
        self.assertTrue(back.get("home"))
        # the other way round works too: Bo visits A
        gb = bo.req("POST", f"/api/hublink/links/{lb['id']}/go")[1]
        self.assertEqual(Client(self.a).req("POST", "/api/hublink/sso", {"ticket": gb["url"].split("/#/hub/")[1]})[0], 200)
        # the login page on B can list where people come from
        self.assertEqual([x["name"] for x in Client(self.b).req("GET", "/api/hublink/public")[1]["links"]], ["Annas HUBTECH"])
        # B's owner turns off visits from A
        self.assertEqual(bo.req("PATCH", f"/api/hublink/links/{lb['id']}", {"allowLogin": False})[0], 200)
        g3 = anna.req("POST", f"/api/hublink/links/{links_a[0]['id']}/go")[1]
        self.assertEqual(Client(self.b).req("POST", "/api/hublink/sso", {"ticket": g3["url"].split("/#/hub/")[1]})[1]["code"], "not_allowed")
        # removing the link logs the guests out
        self.assertEqual(bo.req("DELETE", f"/api/hublink/links/{lb['id']}")[0], 200)
        self.assertEqual(visitor.req("GET", "/api/me")[0], 401)

    def test_invite_link_lets_a_friend_sign_up(self):
        o = owner(self.a, "anna", "Anna Hansen")
        x = Client(self.a)
        self.assertEqual(x.req("POST", "/api/auth/register", {"username": "karl1", "password": "Sommer2026xx"})[1]["code"], "signup_closed")
        st, inv, _ = o.req("POST", "/api/users/invites", {"days": 7, "uses": 1})
        self.assertEqual(st, 201, inv)
        info = x.req("GET", f"/api/auth/invite/{inv['token']}")[1]
        self.assertEqual((info["by"], info["hub"]), ("Anna Hansen", "Annas HUBTECH"))
        st, r, _ = x.req("POST", "/api/auth/register", {"username": "karl1", "displayName": "Karl", "password": "Sommer2026xx", "invite": inv["token"]})
        self.assertEqual((st, r["user"]["role"]), (201, "member"))
        x.req("POST", "/api/cm/me/age", {"birthYear": 2000, "acceptRules": True})
        friends = x.req("GET", "/api/cm/friends")
        self.assertIn("Anna Hansen", str(friends[1]), "inviter and invitee are friends")
        self.assertEqual(Client(self.a).req("POST", "/api/auth/register", {"username": "karl2", "password": "Sommer2026xx", "invite": inv["token"]})[1]["code"], "bad_invite", "used up")
        self.assertEqual(Client(self.a).req("GET", "/api/users/invites")[0], 401)
        self.assertEqual(o.req("GET", "/api/users/invites")[1]["invites"], [])


if __name__ == "__main__":
    unittest.main()
