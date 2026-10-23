"""Quizshow: PIN rooms, guests joining without an account, points for fast right answers, the host's controls,
and the code-runner sandbox's headers."""
import json
import sys
import unittest
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_remote import FreshServer  # noqa: E402

QUIZ = {"title": "Test", "questions": [
    {"q": "2 + 2?", "options": ["3", "4", "5"], "correct": 1, "time": 10},
    {"q": "Farver i et dansk flag?", "options": ["Rød", "Hvid", "Blå"], "correct": [0, 1], "time": 20},
    {"q": "", "options": ["a", "b"], "correct": 0},            # no text: skipped
]}


class QuizshowTest(FreshServer):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.host = cls.Client(cls.base)
        st, r, _ = cls.host.req("POST", "/api/auth/register", {"username": "vaert", "displayName": "Værten", "password": "Sommer2026xx"})
        assert st == 201, r

    def anon(self, method, path, body=None):
        r = urllib.request.Request(self.base + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                                   headers={"Content-Type": "application/json", "X-Requested-With": "hubtech"})
        try:
            with urllib.request.urlopen(r, timeout=10) as resp:
                return resp.status, json.loads(resp.read()), dict(resp.headers)
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}"), dict(e.headers)

    def test_flow(self):
        st, room, _ = self.host.req("POST", "/api/qs", {"quiz": QUIZ})
        self.assertEqual(st, 201)
        pin = room["pin"]
        self.assertEqual(room["qn"], 2, "the empty question is skipped")
        st, a, _ = self.anon("POST", f"/api/qs/{pin}/join", {"name": "Ida"})
        self.assertEqual(st, 200)
        st, b, _ = self.anon("POST", f"/api/qs/{pin}/join", {"name": "Ole"})
        self.assertEqual(self.anon("POST", f"/api/qs/{pin}/join", {"name": "ida"})[1]["code"], "taken")
        self.assertEqual(self.anon("POST", f"/api/qs/{pin}/host", {"action": "next"})[0], 401, "only the host")
        self.assertEqual(self.anon("GET", "/api/qs/000000")[0], 404)
        st, s, _ = self.host.req("POST", f"/api/qs/{pin}/host", {"action": "next"})
        self.assertEqual(s["phase"], "question")
        self.assertNotIn("correct", self.anon("GET", f"/api/qs/{pin}?p={a['p']}")[1], "the right answer is secret while asking")
        st, s, _ = self.anon("POST", f"/api/qs/{pin}/answer", {"p": a["p"], "choice": 1})
        self.assertTrue(s["me"]["answered"])
        self.assertEqual(self.anon("POST", f"/api/qs/{pin}/answer", {"p": a["p"], "choice": 0})[1]["code"], "answered")
        st, s, _ = self.anon("POST", f"/api/qs/{pin}/answer", {"p": b["p"], "choice": 0})
        self.assertEqual(s["phase"], "reveal", "everyone answered: reveal at once")
        ida = self.anon("GET", f"/api/qs/{pin}?p={a['p']}")[1]
        self.assertTrue(ida["me"]["ok"]); self.assertGreater(ida["me"]["got"], 900); self.assertEqual(ida["counts"], [1, 1, 0]); self.assertEqual(ida["correct"], [1])
        ole = self.anon("GET", f"/api/qs/{pin}?p={b['p']}")[1]
        self.assertFalse(ole["me"]["ok"]); self.assertEqual(ole["me"]["rank"], 2)
        self.assertEqual(self.host.req("POST", f"/api/qs/{pin}/host", {"action": "next"})[1]["phase"], "board")
        self.assertEqual(self.host.req("POST", f"/api/qs/{pin}/host", {"action": "next"})[1]["qi"], 1)
        self.anon("POST", f"/api/qs/{pin}/answer", {"p": b["p"], "choice": 1})       # one of two right answers counts
        s = self.host.req("POST", f"/api/qs/{pin}/host", {"action": "next"})[1]       # stop the time
        self.assertEqual(s["phase"], "reveal")
        self.assertEqual(self.host.req("POST", f"/api/qs/{pin}/host", {"action": "next"})[1]["phase"], "end")
        self.assertEqual([p["name"] for p in self.anon("GET", f"/api/qs/{pin}")[1]["board"]], ["Ida", "Ole"])
        self.assertEqual(self.anon("POST", f"/api/qs/{pin}/join", {"name": "Sen"})[1]["code"], "ended")

    def test_runner_is_sandboxed(self):
        r = urllib.request.urlopen(self.base + "/api/code/runner", timeout=10)
        csp = r.headers.get("Content-Security-Policy", "")
        self.assertIn("sandbox allow-scripts", csp)
        self.assertNotIn("allow-same-origin", csp)
        self.assertIn("connect-src 'none'", csp)


if __name__ == "__main__":
    unittest.main()
