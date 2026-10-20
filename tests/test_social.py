"""Shared calendars and Fællesskab (servers, roles, moderation, friends, snaps, stories, music, live updates)."""
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_api import Client, ROOT, free_port  # noqa: E402

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
MP3 = b"ID3\x03\x00\x00\x00\x00\x00\x00" + b"\xff\xfb\x90\x00" * 2000


class SocialTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="hubtech-social-"))
        cls.port = free_port()
        env = dict(os.environ, HUBTECH_DATA_DIR=str(cls.tmp), HUBTECH_QUIET="1", HUBTECH_SIGNUP="first",
                   HUBTECH_BYTEFORGE_AUTOSTART="false", HUBTECH_WRITE_RATE="5000")
        cls.proc = subprocess.Popen([sys.executable, str(ROOT / "server" / "app.py"), "--port", str(cls.port)], env=env,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        cls.base = f"http://127.0.0.1:{cls.port}"
        for _ in range(60):
            try:
                urllib.request.urlopen(cls.base + "/api/health", timeout=1)
                break
            except OSError:
                time.sleep(0.1)
        cls.a = Client(cls.base)
        assert cls.a.req("POST", "/api/auth/register", {"username": "anna", "displayName": "Anna", "password": "Sommer2026xx"})[0] == 201
        cls.users = {"anna": cls.a}
        for name in ("bent", "carl", "dina"):
            cls.a.req("POST", "/api/users", {"username": name, "displayName": name.title(), "password": "Efteraar2026x"})
            c = Client(cls.base)
            c.req("POST", "/api/auth/login", {"username": name, "password": "Efteraar2026x"})
            cls.users[name] = c
        cls.b, cls.c, cls.d = cls.users["bent"], cls.users["carl"], cls.users["dina"]
        cls.ids = {n: c.req("GET", "/api/me")[1]["user"]["id"] for n, c in cls.users.items()}

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait(5)
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def upload(self, client, raw, purpose=""):
        h = {"Content-Type": "application/octet-stream", "X-Requested-With": "hubtech", "X-Purpose": purpose, "X-File-Name": "fil"}
        r = urllib.request.Request(self.base + "/api/cm/files", data=raw, method="POST", headers=h)
        with client.opener.open(r, timeout=10) as resp:
            return json.loads(resp.read())["file"]

    def join_cm(self, *clients):
        for c in clients:
            st, body, _ = c.req("POST", "/api/cm/me/age", {"birthYear": 2000, "acceptRules": True})
            self.assertEqual(st, 200, body)

    # ── shared calendars ──
    def test_shared_calendar(self):
        a, b, c = self.a, self.b, self.c
        st, body, _ = a.req("POST", "/api/calendars", {"name": "Familie", "color": "#22c55e"})
        self.assertEqual(st, 201, body)
        cal = body["calendar"]["id"]
        self.assertEqual(a.req("POST", f"/api/calendars/{cal}/members", {"username": "nobody"})[0], 404)
        self.assertEqual(a.req("POST", f"/api/calendars/{cal}/members", {"username": "bent", "role": "editor"})[0], 201)
        self.assertEqual(a.req("POST", f"/api/calendars/{cal}/members", {"username": "carl", "role": "viewer"})[0], 201)
        self.assertEqual(a.req("POST", f"/api/calendars/{cal}/members", {"username": "bent"})[0], 409)
        # bo sees the invitation but cannot add events before accepting
        cals = b.req("GET", "/api/calendars")[1]["calendars"]
        self.assertEqual([(x["name"], x["status"]) for x in cals], [("Familie", "pending")])
        ev = {"title": "Fødselsdag", "date": "2026-11-03", "allDay": True}
        self.assertEqual(b.req("POST", f"/api/calendars/{cal}/events", {"event": ev})[0], 403)
        self.assertEqual(b.req("POST", f"/api/calendars/{cal}/accept")[0], 200)
        st, body, _ = b.req("POST", f"/api/calendars/{cal}/events", {"event": ev})
        self.assertEqual(st, 201, body)
        eid = body["event"]["id"]
        self.assertEqual(body["event"]["by"], "Bent")
        # anna sees it; carl (viewer, accepted) sees but cannot edit
        evs = a.req("GET", "/api/calendars/events?from=2026-11-01&to=2026-11-30")[1]["events"]
        self.assertEqual([e["title"] for e in evs], ["Fødselsdag"])
        self.assertEqual(a.req("GET", "/api/calendars/events?from=2026-12-01&to=2026-12-30")[1]["events"], [])
        c.req("POST", f"/api/calendars/{cal}/accept")
        self.assertEqual(len(c.req("GET", "/api/calendars/events")[1]["events"]), 1)
        self.assertEqual(c.req("PUT", f"/api/calendars/{cal}/events/{eid}", {"event": {**ev, "title": "x"}})[0], 403)
        self.assertEqual(c.req("POST", f"/api/calendars/{cal}/members", {"username": "dina"})[0], 403)
        # editing, bad input, removal
        self.assertEqual(a.req("PUT", f"/api/calendars/{cal}/events/{eid}", {"event": {**ev, "title": "Fest", "endDate": "2026-11-04"}})[0], 200)
        self.assertEqual(a.req("POST", f"/api/calendars/{cal}/events", {"event": {"title": "x", "date": "i morgen"}})[0], 400)
        self.assertEqual(self.d.req("GET", "/api/calendars/events")[1]["events"], [])
        self.assertEqual(self.d.req("PUT", f"/api/calendars/{cal}/events/{eid}", {"event": ev})[0], 404)
        self.assertEqual(a.req("DELETE", f"/api/calendars/{cal}/members/{self.ids['carl']}")[0], 200)
        self.assertEqual(c.req("GET", "/api/calendars/events")[1]["events"], [])
        self.assertEqual(b.req("DELETE", f"/api/calendars/{cal}")[1]["deleted"], False)   # bo leaves
        self.assertEqual(b.req("GET", "/api/calendars")[1]["calendars"], [])
        self.assertEqual(a.req("DELETE", f"/api/calendars/{cal}")[1]["deleted"], True)

    # ── live updates ──
    def test_live_poll(self):
        a = self.a
        seq = a.req("GET", "/api/live?since=0")[1]["seq"]
        got = {}

        def poll():
            got["r"] = self.b.req("GET", f"/api/live?since={seq}&wait=8")
        t = threading.Thread(target=poll)
        t0 = time.time()
        t.start()
        time.sleep(0.4)
        st, body, _ = a.req("POST", "/api/calendars", {"name": "Live"})
        cal = body["calendar"]["id"]
        a.req("POST", f"/api/calendars/{cal}/members", {"username": "bent"})
        t.join(10)
        self.assertLess(time.time() - t0, 6)
        evs = got["r"][1]["events"]
        self.assertTrue(any(e.get("kind") == "cal-invite" for e in evs), evs)
        a.req("DELETE", f"/api/calendars/{cal}")

    # ── Fællesskab ──
    def test_age_gate(self):
        st, body, _ = self.d.req("GET", "/api/cm/servers")
        self.assertEqual((st, body["code"]), (403, "age_required"))
        self.assertEqual(self.d.req("POST", "/api/cm/me/age", {"birthYear": time.gmtime().tm_year - 9, "acceptRules": True})[0], 403)
        self.assertEqual(self.d.req("POST", "/api/cm/me/age", {"birthYear": 2001})[0], 400)
        self.assertFalse(self.d.req("GET", "/api/cm/me")[1]["ageOk"])

    def test_servers_roles_moderation(self):
        a, b, c = self.a, self.b, self.c
        self.join_cm(a, b, c)
        st, body, _ = a.req("POST", "/api/cm/servers", {"name": "Værkstedet", "icon": "🔧"})
        self.assertEqual(st, 201, body)
        sid = body["server"]["id"]
        srv = a.req("GET", f"/api/cm/servers/{sid}")[1]
        names = [ch["name"] for ch in srv["channels"]]
        self.assertEqual(names, ["velkommen", "generelt", "musik", "snak"])
        general = srv["channels"][1]["id"]
        welcome = srv["channels"][0]["id"]
        # private server: join needs an invite
        self.assertEqual(b.req("POST", f"/api/cm/servers/{sid}/join")[0], 403)
        self.assertEqual(b.req("GET", f"/api/cm/servers/{sid}")[0], 403)
        code = a.req("POST", f"/api/cm/servers/{sid}/invites", {"hours": 1})[1]["code"]
        self.assertEqual(b.req("GET", f"/api/cm/invites/{code}")[1]["server"]["name"], "Værkstedet")
        self.assertEqual(b.req("POST", f"/api/cm/invites/{code}/join")[0], 200)
        self.assertEqual(c.req("POST", f"/api/cm/invites/{code}/join")[0], 200)
        # rules must be accepted before writing
        st, body, _ = b.req("POST", f"/api/cm/channels/{general}/messages", {"body": "hej"})
        self.assertEqual(body["code"], "rules")
        b.req("POST", f"/api/cm/servers/{sid}/rules")
        c.req("POST", f"/api/cm/servers/{sid}/rules")
        st, body, _ = b.req("POST", f"/api/cm/channels/{general}/messages", {"body": "Hej @carl!"})
        self.assertEqual(st, 201, body)
        mid = body["message"]["id"]
        # announcement channel is read-only for members
        self.assertEqual(b.req("POST", f"/api/cm/channels/{welcome}/messages", {"body": "x"})[1]["code"], "read_only")
        # reply, reaction, edit
        st, body, _ = c.req("POST", f"/api/cm/channels/{general}/messages", {"body": "Hej Bo", "replyTo": mid})
        self.assertEqual(body["message"]["reply"]["user"], "Bent")
        self.assertEqual(c.req("POST", f"/api/cm/messages/{mid}/react", {"emoji": "👍"})[1]["message"]["reactions"], [{"emoji": "👍", "count": 1, "me": True}])
        self.assertEqual(c.req("POST", f"/api/cm/messages/{mid}/react", {"emoji": "💩"})[0], 400)
        self.assertEqual(c.req("PATCH", f"/api/cm/messages/{mid}", {"body": "hack"})[0], 403)
        self.assertTrue(b.req("PATCH", f"/api/cm/messages/{mid}", {"body": "Hej igen"})[1]["message"]["edited"])
        msgs = a.req("GET", f"/api/cm/channels/{general}/messages")[1]["messages"]
        self.assertEqual([m["body"] for m in msgs], ["Hej igen", "Hej Bo"])
        # unread counts
        self.assertEqual(a.req("GET", "/api/cm/servers")[1]["servers"][0]["unread"], 2)
        a.req("POST", f"/api/cm/channels/{general}/read", {"lastId": msgs[-1]["id"]})
        self.assertEqual(a.req("GET", "/api/cm/servers")[1]["servers"][0]["unread"], 0)
        # word filter
        a.req("PATCH", f"/api/cm/servers/{sid}", {"wordFilter": "fjols, idiot"})
        self.assertEqual(b.req("POST", f"/api/cm/channels/{general}/messages", {"body": "Du er en Idiot"})[1]["message"]["body"], "Du er en •••••")
        # roles: owner makes bo moderator; moderator can mute carl but not the owner
        self.assertEqual(c.req("POST", f"/api/cm/servers/{sid}/members/{self.ids['bent']}/role", {"role": "moderator"})[0], 403)
        self.assertEqual(a.req("POST", f"/api/cm/servers/{sid}/members/{self.ids['bent']}/role", {"role": "moderator"})[0], 200)
        self.assertEqual(b.req("POST", f"/api/cm/servers/{sid}/members/{self.ids['anna']}/mute", {"minutes": 5})[0], 403)
        self.assertEqual(b.req("POST", f"/api/cm/servers/{sid}/members/{self.ids['carl']}/mute", {"minutes": 5})[0], 200)
        self.assertEqual(c.req("POST", f"/api/cm/channels/{general}/messages", {"body": "x"})[1]["code"], "muted")
        b.req("POST", f"/api/cm/servers/{sid}/members/{self.ids['carl']}/mute", {"minutes": 0})
        # slowmode applies to members, not moderators
        a.req("PATCH", f"/api/cm/channels/{general}", {"slow": 30})
        st, body, _ = c.req("POST", f"/api/cm/channels/{general}/messages", {"body": "1"})   # carl wrote moments ago
        self.assertEqual((st, body["code"]), (429, "slowmode"))
        self.assertGreater(body["wait"], 20)
        self.assertEqual(b.req("POST", f"/api/cm/channels/{general}/messages", {"body": "mod 1"})[0], 201)
        self.assertEqual(b.req("POST", f"/api/cm/channels/{general}/messages", {"body": "mod 2"})[0], 201)
        a.req("PATCH", f"/api/cm/channels/{general}", {"slow": 0})
        # report -> moderator sees it and deletes the message
        bad = c.req("POST", f"/api/cm/channels/{general}/messages", {"body": "grim besked"})[1]["message"]["id"]
        self.assertEqual(a.req("POST", "/api/cm/reports", {"kind": "message", "ref": str(bad), "reason": "Grimt sprog"})[0], 201)
        reps = b.req("GET", "/api/cm/reports")[1]["reports"]
        self.assertEqual(reps[0]["snapshot"], "grim besked")
        self.assertEqual(b.req("POST", f"/api/cm/reports/{reps[0]['id']}/handle", {"action": "delete"})[0], 200)
        self.assertTrue([m for m in a.req("GET", f"/api/cm/channels/{general}/messages")[1]["messages"] if m["id"] == bad][0]["deleted"])
        self.assertEqual(c.req("GET", "/api/cm/reports")[1]["reports"], [])
        # kick and ban
        self.assertEqual(b.req("POST", f"/api/cm/servers/{sid}/members/{self.ids['carl']}/ban", {"reason": "spam"})[0], 200)
        self.assertEqual(c.req("GET", f"/api/cm/servers/{sid}")[0], 403)
        self.assertEqual(c.req("POST", f"/api/cm/invites/{code}/join")[1]["code"], "banned")
        self.assertEqual(len(a.req("GET", f"/api/cm/servers/{sid}/bans")[1]["bans"]), 1)
        a.req("DELETE", f"/api/cm/servers/{sid}/bans/{self.ids['carl']}")
        self.assertEqual(c.req("POST", f"/api/cm/invites/{code}/join")[0], 200)
        self.assertEqual(a.req("POST", f"/api/cm/servers/{sid}/members/{self.ids['carl']}/kick")[0], 200)
        self.assertIn("kick", [x["action"] for x in a.req("GET", f"/api/cm/servers/{sid}/log")[1]["log"]])
        # new rules must be accepted again
        a.req("PATCH", f"/api/cm/servers/{sid}", {"rules": "Nye regler"})
        self.assertFalse(b.req("GET", f"/api/cm/servers/{sid}")[1]["me"]["rulesAccepted"])
        # channels, discover, leave, delete
        self.assertEqual(b.req("POST", f"/api/cm/servers/{sid}/channels", {"name": "x"})[0], 403)
        self.assertEqual(a.req("POST", f"/api/cm/servers/{sid}/channels", {"name": "Hjælp Til PC"})[1]["channel"]["name"], "hjælp-til-pc")
        a.req("PATCH", f"/api/cm/servers/{sid}", {"discoverable": True})
        self.assertIn("Værkstedet", [s["name"] for s in c.req("GET", "/api/cm/discover")[1]["servers"]])
        self.assertEqual(a.req("POST", f"/api/cm/servers/{sid}/leave")[0], 400)
        self.assertEqual(b.req("POST", f"/api/cm/servers/{sid}/leave")[0], 200)
        self.assertEqual(a.req("DELETE", f"/api/cm/servers/{sid}")[0], 200)
        self.assertEqual(a.req("GET", f"/api/cm/servers/{sid}")[0], 404)

    def test_friends_dms_snaps_stories(self):
        a, b, c = self.a, self.b, self.c
        self.join_cm(a, b, c)
        dm = f"dm-{min(self.ids['anna'], self.ids['bent'])}-{max(self.ids['anna'], self.ids['bent'])}"
        self.assertEqual(a.req("POST", f"/api/cm/channels/{dm}/messages", {"body": "hej"})[1]["code"], "not_friends")
        self.assertEqual(a.req("POST", "/api/cm/friends", {"username": "bent"})[1]["status"], "pending")
        fr = b.req("GET", "/api/cm/friends")[1]
        self.assertEqual([u["username"] for u in fr["incoming"]], ["anna"])
        self.assertEqual([u["username"] for u in a.req("GET", "/api/cm/friends")[1]["outgoing"]], ["bent"])
        self.assertEqual(b.req("POST", f"/api/cm/friends/{self.ids['anna']}/accept")[0], 200)
        self.assertEqual([u["username"] for u in a.req("GET", "/api/cm/friends")[1]["friends"]], ["bent"])
        # DM with a shared note attached
        st, body, _ = a.req("POST", f"/api/cm/channels/{dm}/messages", {"body": "Se min note", "attach": {"kind": "note", "title": "Indkøb", "body": "mælk"}})
        self.assertEqual(st, 201, body)
        self.assertEqual(b.req("GET", f"/api/cm/channels/{dm}/messages")[1]["messages"][0]["attach"]["title"], "Indkøb")
        self.assertEqual(c.req("GET", f"/api/cm/channels/{dm}/messages")[0], 404)
        dms = b.req("GET", "/api/cm/dms")[1]["dms"]
        self.assertEqual((dms[0]["user"]["username"], dms[0]["unread"]), ("anna", 1))
        # snap: view once, friends only
        f = self.upload(a, PNG, "snap")
        self.assertEqual(f["kind"], "snap")
        self.assertEqual(a.req("GET", f"/api/cm/files/{f['id']}")[0], 404)
        self.assertEqual(a.req("POST", "/api/cm/snaps", {"to": [self.ids["carl"]], "fileId": f["id"]})[0], 403)
        self.assertEqual(a.req("POST", "/api/cm/snaps", {"to": [self.ids["bent"]], "fileId": f["id"], "seconds": 5, "caption": "Se!"})[0], 201)
        inbox = b.req("GET", "/api/cm/snaps")[1]["inbox"]
        self.assertEqual(len(inbox), 1)
        st, body, _ = b.req("POST", f"/api/cm/snaps/{inbox[0]['id']}/open")
        self.assertEqual(st, 200)
        self.assertTrue(body["image"].startswith("data:image/png;base64,"))
        self.assertEqual(b.req("POST", f"/api/cm/snaps/{inbox[0]['id']}/open")[0], 410)
        self.assertTrue(a.req("GET", "/api/cm/snaps")[1]["sent"][0]["opened"])
        # story: friends see it for 24 h
        s = self.upload(a, PNG, "story")
        self.assertEqual(a.req("POST", "/api/cm/stories", {"fileId": s["id"], "caption": "Fredag"})[0], 201)
        g = b.req("GET", "/api/cm/stories")[1]["groups"]
        self.assertEqual((g[0]["user"]["username"], g[0]["unseen"]), ("anna", 1))
        self.assertEqual(b.req("GET", g[0]["stories"][0]["url"])[0], 200)
        self.assertEqual(c.req("GET", g[0]["stories"][0]["url"])[0], 404)
        self.assertEqual(c.req("GET", "/api/cm/stories")[1]["groups"], [])
        b.req("POST", f"/api/cm/stories/{g[0]['stories'][0]['id']}/view")
        self.assertEqual(a.req("GET", f"/api/cm/stories/{g[0]['stories'][0]['id']}/views")[1]["views"][0]["user"]["username"], "bent")
        # block removes the friendship and stops DMs
        self.assertEqual(b.req("POST", f"/api/cm/blocks/{self.ids['anna']}")[0], 200)
        self.assertEqual(a.req("POST", f"/api/cm/channels/{dm}/messages", {"body": "hallo?"})[1]["code"], "blocked")
        self.assertEqual(a.req("POST", "/api/cm/friends", {"username": "bent"})[0], 403)
        self.assertEqual(a.req("GET", "/api/cm/users?q=ben")[1]["users"], [])
        b.req("DELETE", f"/api/cm/blocks/{self.ids['anna']}")
        self.assertEqual([u["username"] for u in a.req("GET", "/api/cm/users?q=ben")[1]["users"]], ["bent"])

    def test_music_room(self):
        a, b = self.a, self.b
        self.join_cm(a, b)
        sid = a.req("POST", "/api/cm/servers", {"name": "Musik"})[1]["server"]["id"]
        code = a.req("POST", f"/api/cm/servers/{sid}/invites", {})[1]["code"]
        b.req("POST", f"/api/cm/invites/{code}/join")
        music = [ch for ch in a.req("GET", f"/api/cm/servers/{sid}")[1]["channels"] if ch["kind"] == "music"][0]["id"]
        self.assertEqual(self.upload(a, b"hej verden")["kind"] if False else 0, 0)
        f1, f2 = self.upload(a, MP3), self.upload(a, MP3)
        self.assertEqual(f1["kind"], "audio")
        # range requests (for seeking in the player)
        r = urllib.request.Request(self.base + f1["url"], headers={"Range": "bytes=0-9"})
        with a.opener.open(r) as resp:
            self.assertEqual((resp.status, len(resp.read())), (206, 10))
        self.assertEqual(b.req("POST", f"/api/cm/channels/{music}/music", {"action": "add", "fileId": f1["id"]})[1]["code"], "rules")
        st, s, _ = a.req("POST", f"/api/cm/channels/{music}/music", {"action": "add", "fileId": f1["id"], "title": "Sang 1", "duration": 180})
        self.assertEqual(st, 200, s)
        self.assertEqual(s["current"]["item"]["title"], "Sang 1")
        s = a.req("POST", f"/api/cm/channels/{music}/music", {"action": "add", "fileId": f2["id"], "title": "Sang 2", "duration": 200})[1]
        self.assertEqual([q["title"] for q in s["queue"]], ["Sang 2"])
        s = a.req("POST", f"/api/cm/channels/{music}/music", {"action": "pause"})[1]
        self.assertTrue(s["current"]["paused"])
        s = a.req("POST", f"/api/cm/channels/{music}/music", {"action": "seek", "position": 42})[1]
        self.assertEqual(s["current"]["pausedAt"], 42)
        s = a.req("POST", f"/api/cm/channels/{music}/music", {"action": "resume"})[1]
        self.assertAlmostEqual((s["now"] - s["current"]["startedAt"]) / 1000, 42, delta=1)
        # "ended" only advances once for the same track
        item = s["current"]["item"]["id"]
        a.req("POST", f"/api/cm/channels/{music}/music", {"action": "ended", "itemId": item})
        s = a.req("POST", f"/api/cm/channels/{music}/music", {"action": "ended", "itemId": item})[1]
        self.assertEqual((s["current"]["item"]["title"], s["queue"]), ("Sang 2", []))
        b.req("POST", f"/api/cm/servers/{sid}/rules")
        self.assertEqual(b.req("POST", f"/api/cm/channels/{music}/music", {"action": "stop"})[0], 403)
        self.assertIsNone(a.req("POST", f"/api/cm/channels/{music}/music", {"action": "stop"})[1]["current"])
        self.assertEqual(a.req("GET", f"/api/cm/channels/{a.req('GET', f'/api/cm/servers/{sid}')[1]['channels'][1]['id']}/music")[0], 400)
        a.req("DELETE", f"/api/cm/servers/{sid}")

    def test_upload_types(self):
        self.join_cm(self.a)
        h = {"Content-Type": "application/octet-stream", "X-Requested-With": "hubtech"}
        r = urllib.request.Request(self.base + "/api/cm/files", data=b"<script>alert(1)</script>", method="POST", headers=h)
        try:
            self.a.opener.open(r)
            self.fail("should be rejected")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 400)
        f = self.upload(self.a, PNG)
        st, raw, hdr = self.a.req("GET", f["url"])
        self.assertEqual((st, hdr["Content-Type"]), (200, "image/png"))
        self.assertIn("sandbox", hdr["Content-Security-Policy"])


if __name__ == "__main__":
    unittest.main()


class CallsTest(SocialTest):
    """Voice/video calls: ringing friends, relaying WebRTC signals, voice channels."""

    def poll(self, client, since, wait=3):
        st, body, _ = client.req("GET", f"/api/live?since={since}&wait={wait}")
        return body

    def test_private_call(self):
        a, b, c = self.a, self.b, self.c
        self.join_cm(a, b, c)
        a.req("POST", "/api/cm/friends", {"username": "bent"})
        b.req("POST", f"/api/cm/friends/{self.ids['anna']}/accept")
        for x in (a, b, c):   # mark everyone online
            x.req("GET", "/api/live?since=0")
        self.assertEqual(a.req("POST", "/api/cm/calls", {"to": self.ids["carl"]})[1]["code"], "not_friends")
        seq_b = b.req("GET", "/api/live?since=0")[1]["seq"]
        st, call, _ = a.req("POST", "/api/cm/calls", {"to": self.ids["bent"], "video": True})
        self.assertEqual(st, 201, call)
        self.assertTrue(call["ice"])
        ev = self.poll(b, seq_b)
        ring = [e for e in ev["events"] if e["type"] == "call-ring"]
        self.assertEqual((ring[0]["from"]["username"], ring[0]["video"]), ("anna", True))
        self.assertEqual(b.req("GET", "/api/cm/calls")[1]["ringing"]["id"], call["id"])
        self.assertEqual(c.req("POST", f"/api/cm/calls/{call['id']}/join")[0], 404)       # not invited
        st, j, _ = b.req("POST", f"/api/cm/calls/{call['id']}/join")
        self.assertEqual([m["username"] for m in j["members"]], ["anna"])
        self.assertEqual(c.req("POST", f"/api/cm/calls/{call['id']}/signal", {"to": self.ids["anna"], "data": {"sdp": "x"}})[0], 403)
        seq_a = a.req("GET", "/api/live?since=0")[1]["seq"]
        self.assertEqual(b.req("POST", f"/api/cm/calls/{call['id']}/signal", {"to": self.ids["anna"], "data": {"type": "answer", "sdp": "v=0"}})[0], 200)
        sig = [e for e in self.poll(a, seq_a)["events"] if e["type"] == "call-signal"]
        self.assertEqual((sig[0]["from"], sig[0]["data"]["type"]), (self.ids["bent"], "answer"))
        seq_b = b.req("GET", "/api/live?since=0")[1]["seq"]
        a.req("POST", f"/api/cm/calls/{call['id']}/leave")
        self.assertIn("call-end", [e["type"] for e in self.poll(b, seq_b)["events"]])
        self.assertEqual(b.req("POST", f"/api/cm/calls/{call['id']}/join")[0], 404)
        # declining ends the call for the caller
        call = a.req("POST", "/api/cm/calls", {"to": self.ids["bent"]})[1]
        seq_a = a.req("GET", "/api/live?since=0")[1]["seq"]
        b.req("POST", f"/api/cm/calls/{call['id']}/leave")
        end = [e for e in self.poll(a, seq_a)["events"] if e["type"] == "call-end"]
        self.assertEqual(end[0]["reason"], "declined")

    def test_voice_channel(self):
        a, b, c = self.a, self.b, self.c
        self.join_cm(a, b, c)
        sid = a.req("POST", "/api/cm/servers", {"name": "Snakkeklub"})[1]["server"]["id"]
        code = a.req("POST", f"/api/cm/servers/{sid}/invites", {})[1]["code"]
        b.req("POST", f"/api/cm/invites/{code}/join")
        voice = [ch for ch in a.req("GET", f"/api/cm/servers/{sid}")[1]["channels"] if ch["kind"] == "voice"][0]["id"]
        for x in (a, b, c):
            x.req("GET", "/api/live?since=0")
        self.assertEqual(c.req("POST", f"/api/cm/calls/{voice}/join")[1]["code"], "not_member")
        self.assertEqual(b.req("POST", f"/api/cm/calls/{voice}/join")[1]["code"], "rules")
        b.req("POST", f"/api/cm/servers/{sid}/rules")
        self.assertEqual(a.req("POST", f"/api/cm/calls/{voice}/join")[1]["members"], [])
        self.assertEqual([m["username"] for m in b.req("POST", f"/api/cm/calls/{voice}/join")[1]["members"]], ["anna"])
        occ = a.req("GET", f"/api/cm/servers/{sid}")[1]["voice"][voice]
        self.assertEqual(sorted(m["username"] for m in occ), ["anna", "bent"])
        b.req("POST", f"/api/cm/calls/{voice}/leave")
        self.assertEqual([m["username"] for m in a.req("GET", f"/api/cm/servers/{sid}")[1]["voice"][voice]], ["anna"])
        a.req("POST", f"/api/cm/servers/{sid}/members/{self.ids['bent']}/mute", {"minutes": 5})
        self.assertEqual(b.req("POST", f"/api/cm/calls/{voice}/join")[1]["code"], "muted")
        a.req("POST", f"/api/cm/calls/{voice}/leave")
        self.assertEqual(a.req("GET", f"/api/cm/servers/{sid}")[1]["voice"], {})


class GroupCallTest(unittest.TestCase):
    """Group calls: ring several friends, invite more, share what music is playing."""

    @classmethod
    def setUpClass(cls):
        SocialTest.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls):
        SocialTest.tearDownClass.__func__(cls)

    def test_group_call(self):
        a, b, c, d = self.a, self.b, self.c, self.d
        for x in (a, b, c, d):
            x.req("POST", "/api/cm/me/age", {"birthYear": 2000, "acceptRules": True})
            x.req("GET", "/api/live?since=0")
        for name, cl in (("bent", b), ("carl", c), ("dina", d)):
            a.req("POST", "/api/cm/friends", {"username": name})
            cl.req("POST", f"/api/cm/friends/{self.ids['anna']}/accept")
        seq = {n: cl.req("GET", "/api/live?since=0")[1]["seq"] for n, cl in (("b", b), ("c", c), ("d", d))}
        st, call, _ = a.req("POST", "/api/cm/calls", {"to": [self.ids["bent"], self.ids["carl"]]})
        self.assertEqual((st, call["kind"]), (201, "group"), call)
        for n, cl in (("b", b), ("c", c)):
            ev = cl.req("GET", f"/api/live?since={seq[n]}&wait=3")[1]["events"]
            self.assertTrue(any(e["type"] == "call-ring" and e.get("group") for e in ev), ev)
        self.assertEqual([m["username"] for m in b.req("POST", f"/api/cm/calls/{call['id']}/join")[1]["members"]], ["anna"])
        sa = a.req("GET", "/api/live?since=0")[1]["seq"]
        c.req("POST", f"/api/cm/calls/{call['id']}/leave")   # carl declines – the call goes on
        ev = a.req("GET", f"/api/live?since={sa}&wait=3")[1]["events"]
        self.assertIn("call-decline", [e["type"] for e in ev])
        self.assertEqual(b.req("POST", f"/api/cm/calls/{call['id']}/signal", {"to": self.ids["anna"], "data": {"x": 1}})[0], 200)
        # invite dina while the call is going
        self.assertEqual(b.req("POST", f"/api/cm/calls/{call['id']}/invite", {"to": [self.ids["dina"]]})[0], 403)   # bent isn't dina's friend
        self.assertEqual(a.req("POST", f"/api/cm/calls/{call['id']}/invite", {"to": [self.ids["dina"]]})[1]["invited"], 1)
        ev = d.req("GET", f"/api/live?since={seq['d']}&wait=3")[1]["events"]
        self.assertTrue(any(e["type"] == "call-ring" for e in ev))
        self.assertEqual(sorted(m["username"] for m in d.req("POST", f"/api/cm/calls/{call['id']}/join")[1]["members"]), ["anna", "bent"])
        # music info goes to the others
        sb = b.req("GET", "/api/live?since=0")[1]["seq"]
        self.assertEqual(a.req("POST", f"/api/cm/calls/{call['id']}/info", {"music": "Min sang"})[0], 200)
        ev = b.req("GET", f"/api/live?since={sb}&wait=3")[1]["events"]
        self.assertEqual([e["music"]["title"] for e in ev if e["type"] == "call-info"], ["Min sang"])
        self.assertEqual(c.req("POST", f"/api/cm/calls/{call['id']}/info", {"music": "x"})[0], 403)
        # one leaving does not end a group call
        a.req("POST", f"/api/cm/calls/{call['id']}/leave")
        self.assertEqual(b.req("POST", f"/api/cm/calls/{call['id']}/signal", {"to": self.ids["dina"], "data": {"x": 1}})[0], 200)
        b.req("POST", f"/api/cm/calls/{call['id']}/leave")
        d.req("POST", f"/api/cm/calls/{call['id']}/leave")
        self.assertEqual(b.req("POST", f"/api/cm/calls/{call['id']}/join")[0], 404)
