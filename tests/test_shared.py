"""Shared documents: who may see and do what, votes, forms and booking via the public link, wiki pages, files."""
import base64
import datetime
import json
import sys
import unittest
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_remote import FreshServer  # noqa: E402

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")


class SharedTest(FreshServer):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.c = {}
        for i, (u, n) in enumerate([("anna", "Anna"), ("bodil", "Bo"), ("carl", "Carl")]):
            c = cls.Client(cls.base)
            st, r, _ = c.req("POST", "/api/auth/register", {"username": u, "displayName": n, "password": "Sommer2026xx"})
            assert st == 201, r
            if i == 0:
                c.req("PUT", "/api/users/signup", {"mode": "open"})
            cls.c[u] = c
        cls.ids = {n: c.req("GET", "/api/me")[1]["user"]["id"] for n, c in cls.c.items()}
        cls.ids["bo"] = cls.ids["bodil"]

    def setUp(self):
        self.a, self.b, self.x = self.c["anna"], self.c["bodil"], self.c["carl"]

    def anon(self, method, path, body=None):
        r = urllib.request.Request(self.base + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                                   headers={"Content-Type": "application/json", "X-Requested-With": "hubtech"})
        try:
            with urllib.request.urlopen(r, timeout=10) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_poll_visibility_and_votes(self):
        st, d, _ = self.a.req("POST", "/api/sh/poll", {"title": "Pizza eller burger?", "data": {"options": ["Pizza", "Burger"]}, "members": [self.ids["bo"]]})
        self.assertEqual(st, 201, d)
        pid = d["doc"]["id"]
        self.assertEqual(self.x.req("GET", f"/api/sh/doc/{pid}")[0], 404, "not shared with Carl")
        self.assertEqual([x["title"] for x in self.b.req("GET", "/api/sh/poll")[1]["docs"]], ["Pizza eller burger?"])
        self.assertEqual(self.b.req("POST", f"/api/sh/doc/{pid}/entries", {"kind": "vote", "data": {"choices": [5]}})[0], 400)
        self.b.req("POST", f"/api/sh/doc/{pid}/entries", {"kind": "vote", "data": {"choices": [0]}})
        self.b.req("POST", f"/api/sh/doc/{pid}/entries", {"kind": "vote", "data": {"choices": [1]}})
        votes = [e for e in self.a.req("GET", f"/api/sh/doc/{pid}")[1]["entries"] if e["kind"] == "vote"]
        self.assertEqual([v["data"]["choices"] for v in votes], [[1]], "one vote per person – changing it replaces it")
        self.assertEqual(self.b.req("PATCH", f"/api/sh/doc/{pid}", {"title": "x"})[0], 403, "members can't edit")
        # everyone on this HUBTECH
        self.a.req("PATCH", f"/api/sh/doc/{pid}", {"visibility": "all"})
        self.assertEqual(self.x.req("GET", f"/api/sh/doc/{pid}")[0], 200)
        self.a.req("PATCH", f"/api/sh/doc/{pid}", {"data": {"options": ["Pizza", "Burger"], "closed": True}})
        self.assertEqual(self.x.req("POST", f"/api/sh/doc/{pid}/entries", {"kind": "vote", "data": {"choices": [0]}})[1]["code"], "closed")

    def test_form_public_link(self):
        fields = [{"id": "n", "type": "text", "label": "Navn", "required": True}, {"id": "k", "type": "choice", "label": "Klasse", "options": ["7.A", "7.B"]}]
        d = self.a.req("POST", "/api/sh/form", {"title": "Tilmelding til lejr", "data": {"fields": fields}, "public": True})[1]["doc"]
        token = d["token"]
        st, pub = self.anon("GET", f"/api/pub/{token}")
        self.assertEqual(st, 200)
        self.assertNotIn("token", pub["doc"], "the link isn't shown to guests")
        self.assertEqual(self.anon("POST", f"/api/pub/{token}/entries", {"kind": "response", "data": {"answers": {"k": "7.A"}}})[1]["code"], "missing")
        self.assertEqual(self.anon("POST", f"/api/pub/{token}/entries", {"kind": "response", "data": {"answers": {"n": "Ida", "k": "7.A"}, "name": "Ida"}})[0], 200)
        self.b.req("POST", f"/api/pub/{token}/entries", {"kind": "response", "data": {"answers": {"n": "Bo", "k": "7.B"}}})
        self.assertEqual(len(self.a.req("GET", f"/api/sh/doc/{d['id']}")[1]["entries"]), 2, "the owner sees all answers")
        self.assertEqual(len(self.anon("GET", f"/api/pub/{token}")[1]["entries"]), 0, "guests don't see the others' answers")
        self.assertEqual(self.anon("GET", "/api/pub/forkerttokenforkerttoken")[0], 404)
        # not public any more
        self.a.req("PATCH", f"/api/sh/doc/{d['id']}", {"public": False})
        self.assertEqual(self.anon("GET", f"/api/pub/{token}")[0], 404)
        self.assertEqual(self.b.req("GET", f"/api/pub/{token}")[0], 200, "signed in people with the link still get in")

    def test_booking(self):
        tomorrow = datetime.date.today() + datetime.timedelta(days=1)
        cfg = {"weekdays": [0, 1, 2, 3, 4, 5, 6], "from": "09:00", "to": "11:00", "length": 30, "daysAhead": 14}
        d = self.a.req("POST", "/api/sh/booking", {"title": "Frisør Anna", "data": cfg, "public": True})[1]["doc"]
        st, pub = self.anon("GET", f"/api/pub/{d['token']}")
        self.assertEqual(next(x for x in pub["days"] if x["date"] == tomorrow.isoformat())["times"], ["09:00", "09:30", "10:00", "10:30"])
        slot = {"date": tomorrow.isoformat(), "time": "09:30", "name": "Ida", "phone": "12345678"}
        self.assertEqual(self.anon("POST", f"/api/pub/{d['token']}/entries", {"kind": "booking", "data": slot})[0], 200)
        self.assertEqual(self.anon("POST", f"/api/pub/{d['token']}/entries", {"kind": "booking", "data": {**slot, "name": "Ole"}})[1]["code"], "taken")
        self.assertEqual(self.anon("POST", f"/api/pub/{d['token']}/entries", {"kind": "booking", "data": {**slot, "time": "09:15"}})[0], 400, "not a slot")
        taken = self.anon("GET", f"/api/pub/{d['token']}")[1]["entries"]
        self.assertEqual(taken, [{"id": taken[0]["id"], "kind": "booking", "data": {"date": tomorrow.isoformat(), "time": "09:30"}, "taken": True}], "guests only see that it's taken")
        self.assertEqual(self.a.req("GET", f"/api/sh/doc/{d['id']}")[1]["entries"][0]["data"]["phone"], "12345678")

    def test_wiki_and_members_join(self):
        d = self.a.req("POST", "/api/sh/wiki", {"title": "Klassens wiki"})[1]["doc"]
        self.assertEqual(self.b.req("POST", f"/api/sh/doc/{d['id']}/join", {"token": "forkert-token-forkert"})[0], 403)
        self.assertEqual(self.b.req("POST", f"/api/sh/doc/{d['id']}/join", {"token": d["token"]})[0], 200)
        self.b.req("POST", f"/api/sh/doc/{d['id']}/entries", {"kind": "page", "data": {"slug": "forside", "title": "Forside", "body": "Hej"}})
        self.a.req("POST", f"/api/sh/doc/{d['id']}/entries", {"kind": "page", "data": {"slug": "forside", "title": "Forside", "body": "Hej alle"}})
        pages = self.b.req("GET", f"/api/sh/doc/{d['id']}")[1]["entries"]
        self.assertEqual(len(pages), 1, "same name = same page")
        self.assertEqual(pages[0]["data"]["body"], "Hej alle"); self.assertEqual(pages[0]["data"]["history"][0]["body"], "Hej")

    def test_files_and_delete(self):
        r = urllib.request.Request(self.base + "/api/sh/files", data=PNG, method="POST", headers={"Content-Type": "application/octet-stream", "X-Requested-With": "hubtech"})
        with self.a.opener.open(r, timeout=10) as resp:
            url = json.loads(resp.read())["url"]
        with urllib.request.urlopen(self.base + url, timeout=5) as resp:
            self.assertEqual(resp.read(), PNG)
        d = self.a.req("POST", "/api/sh/post", {"title": "", "data": {"text": "Hej verden", "images": [url]}, "visibility": "all"})[1]["doc"]
        self.b.req("POST", f"/api/sh/doc/{d['id']}/entries", {"kind": "like", "data": {}})
        self.b.req("POST", f"/api/sh/doc/{d['id']}/entries", {"kind": "comment", "data": {"text": "Flot!"}})
        feed = self.x.req("GET", "/api/sh/post")[1]["docs"]
        self.assertEqual(feed[0]["counts"], {"like": 1, "comment": 1})
        self.assertEqual(self.b.req("POST", f"/api/sh/doc/{d['id']}/entries", {"kind": "like", "data": {"remove": True}})[1]["removed"] > 0, True, "unlike")
        self.assertEqual(self.b.req("DELETE", f"/api/sh/doc/{d['id']}")[0], 403)
        self.assertEqual(self.a.req("DELETE", f"/api/sh/doc/{d['id']}")[0], 200)
        self.assertEqual(self.b.req("GET", f"/api/sh/doc/{d['id']}")[0], 404)


    def test_wishlist_is_a_surprise(self):
        d = self.a.req("POST", "/api/sh/wishlist", {"title": "Fødselsdag", "data": {"items": [{"id": "w1", "text": "Bog"}, {"id": "w2", "text": "Spil"}]}, "members": [self.ids["bo"], self.ids["carl"]]})[1]["doc"]
        self.assertEqual(self.a.req("POST", f"/api/sh/doc/{d['id']}/entries", {"kind": "reserve", "data": {"item": "w1"}})[0], 403, "not your own")
        self.assertEqual(self.b.req("POST", f"/api/sh/doc/{d['id']}/entries", {"kind": "reserve", "data": {"item": "w1"}})[0], 200)
        self.assertEqual(self.x.req("POST", f"/api/sh/doc/{d['id']}/entries", {"kind": "reserve", "data": {"item": "w1"}})[1]["code"], "taken")
        self.assertEqual(self.x.req("POST", f"/api/sh/doc/{d['id']}/entries", {"kind": "reserve", "data": {"item": "w1", "remove": True}})[0], 403)
        self.assertEqual([e["kind"] for e in self.a.req("GET", f"/api/sh/doc/{d['id']}")[1]["entries"]], [], "the owner sees nothing")
        self.assertNotIn("reserve", self.a.req("GET", "/api/sh/wishlist")[1]["docs"][0]["counts"])
        self.assertEqual(len(self.x.req("GET", f"/api/sh/doc/{d['id']}")[1]["entries"]), 1, "the others can see it's taken")
        self.assertEqual(self.b.req("POST", f"/api/sh/doc/{d['id']}/entries", {"kind": "reserve", "data": {"item": "w1", "remove": True}})[0], 200)
        self.assertEqual(self.x.req("GET", f"/api/sh/doc/{d['id']}")[1]["entries"], [])
        self.x.req("POST", f"/api/sh/doc/{d['id']}/entries", {"kind": "comment", "data": {"text": "Skal vi gå sammen om spillet?"}})
        self.assertEqual(self.a.req("GET", f"/api/sh/doc/{d['id']}")[1]["entries"], [], "the chat about gifts is hidden too")

    def test_signup_datepoll_chores_songs(self):
        # Fordeling: guests via the link sign up for a slot, and a full slot says so
        d = self.a.req("POST", "/api/sh/signup", {"title": "Sommerfest", "data": {"slots": [{"id": "s1", "text": "Kage", "need": 1}, {"id": "s2", "text": "Saftevand", "need": 2}]}, "public": True})[1]["doc"]
        tok = self.a.req("GET", f"/api/sh/doc/{d['id']}")[1]["doc"]["token"]
        self.assertEqual(self.anon("POST", f"/api/pub/{tok}/entries", {"kind": "claim", "data": {"slot": "s1", "name": "Mormor"}})[0], 200)
        self.assertEqual(self.anon("POST", f"/api/pub/{tok}/entries", {"kind": "claim", "data": {"slot": "s1", "name": "Morfar"}})[1]["code"], "taken")
        self.assertEqual(self.anon("POST", f"/api/pub/{tok}/entries", {"kind": "claim", "data": {"slot": "nope", "name": "X"}})[0], 400)
        claims = [e for e in self.a.req("GET", f"/api/sh/doc/{d['id']}")[1]["entries"] if e["kind"] == "claim"]
        self.assertEqual(len(claims), 1)
        # Find en dato: one answer per person, only valid options
        p = self.a.req("POST", "/api/sh/datepoll", {"title": "Klassefest", "data": {"options": ["2026-11-06", "2026-11-13"]}, "members": [self.ids["bo"]]})[1]["doc"]
        self.assertEqual(self.b.req("POST", f"/api/sh/doc/{p['id']}/entries", {"kind": "pick", "data": {"yes": [5]}})[0], 400)
        r0 = self.b.req("POST", f"/api/sh/doc/{p['id']}/entries", {"kind": "pick", "data": {"yes": [0], "maybe": [1]}}); self.assertEqual(r0[0], 200, r0)
        self.b.req("POST", f"/api/sh/doc/{p['id']}/entries", {"kind": "pick", "data": {"yes": [1], "maybe": []}})
        ans = [e for e in self.a.req("GET", f"/api/sh/doc/{p['id']}")[1]["entries"] if e["kind"] == "pick"]
        self.assertEqual([a["data"]["yes"] for a in ans], [[1]])
        # Pligter: only chores on the list count
        c = self.a.req("POST", "/api/sh/chores", {"title": "Hjemme", "data": {"chores": [{"id": "c1", "name": "Tøm opvaskeren", "pts": 2}]}, "members": [self.ids["bo"]]})[1]["doc"]
        self.assertEqual(self.b.req("POST", f"/api/sh/doc/{c['id']}/entries", {"kind": "done", "data": {"chore": "c1"}})[0], 200)
        self.assertEqual(self.b.req("POST", f"/api/sh/doc/{c['id']}/entries", {"kind": "done", "data": {"chore": "x"}})[0], 400)
        self.assertEqual(self.x.req("POST", f"/api/sh/doc/{c['id']}/entries", {"kind": "done", "data": {"chore": "c1"}})[0], 404)
        # Sangønsker: guests wish, members vote once per song
        sg = self.a.req("POST", "/api/sh/songs", {"title": "Fest", "data": {}, "public": True, "members": [self.ids["bo"]]})[1]["doc"]
        tok = self.a.req("GET", f"/api/sh/doc/{sg['id']}")[1]["doc"]["token"]
        self.assertEqual(self.anon("POST", f"/api/pub/{tok}/entries", {"kind": "song", "data": {"title": "", "name": "Ida"}})[0], 400)
        sid = self.anon("POST", f"/api/pub/{tok}/entries", {"kind": "song", "data": {"title": "En glad sang", "name": "Ida"}})[1]["id"]
        self.b.req("POST", f"/api/sh/doc/{sg['id']}/entries", {"kind": "vote", "data": {"song": sid}})
        self.b.req("POST", f"/api/sh/doc/{sg['id']}/entries", {"kind": "vote", "data": {"song": sid}})
        self.assertEqual(len([e for e in self.a.req("GET", f"/api/sh/doc/{sg['id']}")[1]["entries"] if e["kind"] == "vote"]), 1)

if __name__ == "__main__":
    unittest.main()
