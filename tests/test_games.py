"""Spil sammen: rooms for Fire på stribe and the typing race, server-timed Fart-tast and the leaderboards."""
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_remote import FreshServer  # noqa: E402


class GamesTest(FreshServer):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.users = {}
        for i, (u, n) in enumerate([("anna", "Anna"), ("bodil", "Bo"), ("carl", "Carl")]):
            c = cls.Client(cls.base)
            st, r, _ = c.req("POST", "/api/auth/register", {"username": u, "displayName": n, "password": "Sommer2026xx"})
            assert st == 201, r
            if i == 0:
                c.req("PUT", "/api/users/signup", {"mode": "open"})
            cls.users[u] = c

    def setUp(self):
        self.a, self.b, self.c = self.users["anna"], self.users["bodil"], self.users["carl"]

    def call(self, method, path, body=None, cookie=None):
        st, r, _ = cookie.req(method, path, body)
        return st, r

    def test_connect4_online(self):
        s, d = self.call("GET", "/api/games/players", cookie=self.a)
        self.assertEqual(s, 200)
        names = [p["name"] for p in d["players"]]
        self.assertEqual(sorted(names), ["Bo", "Carl"])
        bo = next(p["id"] for p in d["players"] if p["name"] == "Bo")
        s, d = self.call("POST", "/api/games/rooms", {"game": "connect4", "invite": [bo]}, cookie=self.a)
        self.assertEqual(s, 201, d)
        rid = d["room"]["id"]
        s, d = self.call("GET", "/api/games/rooms", cookie=self.b)
        self.assertEqual([r["id"] for r in d["rooms"]], [rid])
        s, _ = self.call("GET", f"/api/games/rooms/{rid}", cookie=self.c)
        self.assertEqual(s, 404, "others can't see the game")
        s, d = self.call("POST", f"/api/games/rooms/{rid}/join", {}, cookie=self.b)
        self.assertEqual(d["room"]["status"], "playing")
        order = [p["name"] for p in d["room"]["players"]]
        first, second = (self.a, self.b) if order[0] == "Anna" else (self.b, self.a)
        s, d = self.call("POST", f"/api/games/rooms/{rid}/move", {"col": 0}, cookie=second)
        self.assertEqual(s, 409, "not your turn")
        for i in range(3):
            self.assertEqual(self.call("POST", f"/api/games/rooms/{rid}/move", {"col": 0}, cookie=first)[0], 200)
            self.assertEqual(self.call("POST", f"/api/games/rooms/{rid}/move", {"col": 1}, cookie=second)[0], 200)
        s, d = self.call("POST", f"/api/games/rooms/{rid}/move", {"col": 0}, cookie=first)
        st = d["room"]["state"]
        self.assertEqual((d["room"]["status"], st["winner"], st["score"]), ("done", 1, [1, 0]))
        s, d = self.call("POST", f"/api/games/rooms/{rid}/rematch", {}, cookie=second)
        self.assertEqual(d["room"]["status"], "playing")
        self.assertEqual(d["room"]["state"]["score"], [0, 1], "the score follows the players, who swap colours")
        s, d = self.call("POST", f"/api/games/rooms/{rid}/leave", {}, cookie=first)
        s, d = self.call("GET", f"/api/games/rooms/{rid}", cookie=second)
        self.assertEqual(d["room"]["status"], "done")

    def test_tictactoe_online(self):
        _, d = self.call("GET", "/api/games/players", cookie=self.a)
        carl = next(p["id"] for p in d["players"] if p["name"] == "Carl")
        _, d = self.call("POST", "/api/games/rooms", {"game": "ttt", "invite": [carl]}, cookie=self.a)
        rid = d["room"]["id"]
        _, d = self.call("POST", f"/api/games/rooms/{rid}/join", {}, cookie=self.c)
        first, second = (self.a, self.c) if d["room"]["players"][0]["name"] == "Anna" else (self.c, self.a)
        for who, cell in [(first, 0), (second, 4), (first, 1), (second, 8)]:
            self.assertEqual(self.call("POST", f"/api/games/rooms/{rid}/move", {"cell": cell}, cookie=who)[0], 200)
        self.assertEqual(self.call("POST", f"/api/games/rooms/{rid}/move", {"cell": 4}, cookie=first)[0], 400, "taken")
        _, d = self.call("POST", f"/api/games/rooms/{rid}/move", {"cell": 2}, cookie=first)
        self.assertEqual((d["room"]["status"], d["room"]["state"]["winner"], d["room"]["state"]["cells"]), ("done", 1, [0, 1, 2]))

    def test_draw_and_guess(self):
        _, d = self.call("GET", "/api/games/players", cookie=self.a)
        ids = [p["id"] for p in d["players"]]
        _, d = self.call("POST", "/api/games/rooms", {"game": "draw", "invite": ids}, cookie=self.a)
        rid = d["room"]["id"]
        self.call("POST", f"/api/games/rooms/{rid}/join", {}, cookie=self.b)
        self.call("POST", f"/api/games/rooms/{rid}/join", {}, cookie=self.c)
        _, d = self.call("POST", f"/api/games/rooms/{rid}/start", {}, cookie=self.a)
        room = d["room"]
        self.assertNotIn("_word", room["state"], "the word is secret")
        users = {"Anna": self.a, "Bo": self.b, "Carl": self.c}
        names = {p["id"]: p["name"] for p in room["players"]}
        drawer = users[names[room["state"]["drawer"]]]
        guessers = [c for n, c in users.items() if c is not drawer]
        _, full = self.call("GET", f"/api/games/rooms/{rid}/draw", cookie=drawer)
        word = full["word"]
        self.assertTrue(word)
        self.assertIsNone(self.call("GET", f"/api/games/rooms/{rid}/draw", cookie=guessers[0])[1]["word"])
        s, _ = self.call("POST", f"/api/games/rooms/{rid}/draw", {"strokes": [{"c": "#ff0000", "w": 5, "p": [0.1, 0.1, 0.5, 0.5]}]}, cookie=drawer)
        self.assertEqual(s, 200)
        self.assertEqual(self.call("POST", f"/api/games/rooms/{rid}/draw", {"strokes": []}, cookie=guessers[0])[0], 409, "only the drawer draws")
        self.assertEqual(len(self.call("GET", f"/api/games/rooms/{rid}/draw", cookie=guessers[1])[1]["strokes"]), 1)
        _, r = self.call("POST", f"/api/games/rooms/{rid}/guess", {"text": "forkert"}, cookie=guessers[0])
        self.assertFalse(r["right"])
        _, r = self.call("POST", f"/api/games/rooms/{rid}/guess", {"text": word.upper() + "!"}, cookie=guessers[0])
        self.assertTrue(r["right"])
        _, r = self.call("POST", f"/api/games/rooms/{rid}/guess", {"text": word}, cookie=guessers[1])
        _, d = self.call("GET", f"/api/games/rooms/{rid}", cookie=self.a)
        st = d["room"]["state"]
        self.assertEqual(st["turn"], 1, "everyone guessed → the next one draws")
        self.assertEqual(st["reveal"], word)
        self.assertGreater(sum(st["scores"].values()), 100)

    def test_property_online(self):
        _, d = self.call("GET", "/api/games/players", cookie=self.a)
        bo = next(p["id"] for p in d["players"] if p["name"] == "Bo")
        _, d = self.call("POST", "/api/games/rooms", {"game": "property", "invite": [bo]}, cookie=self.a)
        rid = d["room"]["id"]
        self.call("POST", f"/api/games/rooms/{rid}/join", {}, cookie=self.b)
        self.assertEqual(self.call("POST", f"/api/games/rooms/{rid}/start", {}, cookie=self.b)[0], 403, "only the host starts")
        _, d = self.call("POST", f"/api/games/rooms/{rid}/start", {}, cookie=self.a)
        self.assertEqual(d["room"]["status"], "playing")
        self.assertEqual(self.call("POST", f"/api/games/rooms/{rid}/sync", {"blob": {"phase": "roll"}}, cookie=self.b)[0], 403, "only the host sends the state")
        s, d = self.call("POST", f"/api/games/rooms/{rid}/sync", {"blob": {"phase": "roll", "turn": 0}}, cookie=self.a)
        self.assertEqual((s, d["ver"]), (200, 1))
        self.assertEqual(self.call("GET", f"/api/games/rooms/{rid}", cookie=self.b)[1]["room"]["state"]["blob"]["turn"], 0)
        self.assertEqual(self.call("POST", f"/api/games/rooms/{rid}/act", {"name": "roll"}, cookie=self.b)[0], 200)
        self.assertEqual(self.call("POST", f"/api/games/rooms/{rid}/act", {"name": "roll"}, cookie=self.c)[0], 404, "not in the game")
        self.assertEqual(self.call("POST", f"/api/games/rooms/{rid}/sync", {"blob": {"x": "y" * 400000}}, cookie=self.a)[0], 400, "size limit")

    def test_watch_a_game(self):
        _, d = self.call("GET", "/api/games/players", cookie=self.a)
        bo = next(p["id"] for p in d["players"] if p["name"] == "Bo")
        _, d = self.call("POST", "/api/games/rooms", {"game": "connect4", "invite": [bo]}, cookie=self.a)
        rid = d["room"]["id"]
        _, d = self.call("GET", "/api/games/live", cookie=self.c)
        self.assertNotIn(rid, [r["id"] for r in d["rooms"]], "an invite isn't a game yet")
        self.call("POST", f"/api/games/rooms/{rid}/join", {}, cookie=self.b)
        _, d = self.call("GET", "/api/games/live", cookie=self.c)
        self.assertIn(rid, [r["id"] for r in d["rooms"]])
        s, d = self.call("POST", f"/api/games/rooms/{rid}/watch", {}, cookie=self.c)
        self.assertEqual((s, d["room"]["watchers"]), (200, 1))
        self.assertEqual(self.call("GET", f"/api/games/rooms/{rid}", cookie=self.c)[0], 200)
        self.assertEqual(self.call("POST", f"/api/games/rooms/{rid}/move", {"col": 3}, cookie=self.c)[0], 409, "watchers can't play")
        self.call("POST", f"/api/games/rooms/{rid}/unwatch", {}, cookie=self.c)
        self.assertEqual(self.call("GET", f"/api/games/rooms/{rid}", cookie=self.c)[0], 404)

    def test_typing_solo_is_timed_by_server(self):
        s, run = self.call("POST", "/api/games/typing", {}, cookie=self.a)
        tok, text = run["token"], run["text"]
        s, d = self.call("POST", f"/api/games/typing/{tok}/finish", {"typed": text}, cookie=self.a)
        self.assertEqual(s, 404, "the clock must have been started")
        s, run = self.call("POST", "/api/games/typing", {}, cookie=self.a)
        tok, text = run["token"], run["text"]
        self.call("POST", f"/api/games/typing/{tok}/go", {}, cookie=self.a)
        s, d = self.call("POST", f"/api/games/typing/{tok}/finish", {"typed": text + "x"}, cookie=self.a)
        self.assertEqual(s, 400, "the text must match")
        s, run = self.call("POST", "/api/games/typing", {}, cookie=self.a)
        tok, text = run["token"], run["text"]
        self.call("POST", f"/api/games/typing/{tok}/go", {}, cookie=self.a)
        time.sleep(len(text) * 0.05 + 0.3)        # a little under 240 words a minute
        s, d = self.call("POST", f"/api/games/typing/{tok}/finish", {"typed": text, "errors": 2}, cookie=self.a)
        self.assertEqual(s, 200, d)
        self.assertTrue(d["counted"] and d["record"])
        self.assertEqual(d["board"]["rows"][0]["user"]["name"], "Anna")
        self.assertLessEqual(d["wpm"], 240)
        s, d = self.call("POST", f"/api/games/typing/{tok}/finish", {"typed": text}, cookie=self.a)
        self.assertEqual(s, 404, "a run can only be used once")

    def test_scores(self):
        self.assertEqual(self.call("POST", "/api/games/boards/snake", {"score": 12}, cookie=self.a)[0], 200)
        self.assertEqual(self.call("POST", "/api/games/boards/snake", {"score": 30}, cookie=self.b)[0], 200)
        s, d = self.call("POST", "/api/games/boards/snake", {"score": 5}, cookie=self.a)
        self.assertFalse(d["record"])
        self.assertEqual([r["user"]["name"] for r in d["board"]["rows"]], ["Bo", "Anna"])
        self.assertEqual(self.call("POST", "/api/games/boards/snake", {"score": 99999}, cookie=self.a)[0], 400)
        self.assertEqual(self.call("POST", "/api/games/boards/typing", {"score": 200}, cookie=self.a)[0], 400, "typing only via the timed run")
        self.call("POST", "/api/games/boards/mines-easy", {"score": 40}, cookie=self.a)
        s, d = self.call("POST", "/api/games/boards/mines-easy", {"score": 25}, cookie=self.b)
        self.assertEqual(d["board"]["rows"][0]["user"]["name"], "Bo", "lowest time wins")
        s, d = self.call("GET", "/api/games/boards", cookie=self.c)
        self.assertEqual(len(d["boards"]), 12)

    def test_race(self):
        _, d = self.call("GET", "/api/games/players", cookie=self.a)
        ids = [p["id"] for p in d["players"]]
        _, d = self.call("POST", "/api/games/rooms", {"game": "typing", "invite": ids}, cookie=self.a)
        rid = d["room"]["id"]
        self.assertEqual(self.call("POST", f"/api/games/rooms/{rid}/start", {}, cookie=self.a)[0], 409, "alone")
        self.call("POST", f"/api/games/rooms/{rid}/join", {}, cookie=self.b)
        self.assertEqual(self.call("POST", f"/api/games/rooms/{rid}/start", {}, cookie=self.b)[0], 403, "only the host starts")
        _, d = self.call("POST", f"/api/games/rooms/{rid}/start", {}, cookie=self.a)
        text = d["room"]["state"]["text"]
        self.assertEqual(d["room"]["invited"], [], "Carl didn't join in time")
        self.assertEqual(self.call("POST", f"/api/games/rooms/{rid}/progress", {"typed": "x"}, cookie=self.a)[0], 409, "countdown")
        time.sleep(4.2)
        self.call("POST", f"/api/games/rooms/{rid}/progress", {"typed": text[:20]}, cookie=self.b)
        self.call("POST", f"/api/games/rooms/{rid}/progress", {"typed": text}, cookie=self.a)
        _, d = self.call("GET", f"/api/games/rooms/{rid}", cookie=self.b)
        prog = d["room"]["state"]["progress"]
        me = str(next(p["id"] for p in d["room"]["players"] if p["name"] == "Anna"))
        self.assertEqual(prog[me]["place"], 1)
        self.assertEqual(d["room"]["status"], "playing")
        self.assertGreater(prog[me]["wpm"], 250, "typed in no time ...")
        s, d = self.call("GET", "/api/games/boards/typing", cookie=self.a)
        self.assertTrue(all(r["score"] <= 250 for r in d["rows"]), "... so it doesn't count on the list")


if __name__ == "__main__":
    unittest.main()
