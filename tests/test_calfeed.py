"""Kalender-abonnement: a private .ics address that the phone's calendar can follow."""
import sys
import unittest
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from test_hublink import start, owner  # noqa: E402
from test_api import Client  # noqa: E402


class CalFeedTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.p, cls.base = start()

    @classmethod
    def tearDownClass(cls):
        cls.p.terminate()
        cls.p.wait(5)

    def test_feed(self):
        me = owner(self.base, "anna", "Anna Hansen")
        ev = [{"id": "a1", "title": "Fodbold", "date": "2026-11-10", "start": "17:00", "end": "18:30", "repeat": {"freq": "week", "skip": ["2026-11-17"]}, "remind": "m15"},
              {"id": "b2", "title": "Juleferie", "date": "2026-12-24", "endDate": "2026-12-26", "allDay": True}]
        self.assertEqual(me.req("PUT", "/api/state/calendar", {"state": {"events": ev}})[0], 200)
        self.assertFalse(me.req("GET", "/api/calendar/feed")[1]["active"])
        self.assertEqual(Client(self.base).req("POST", "/api/calendar/feed", {})[0], 401)
        st, r, _ = me.req("POST", "/api/calendar/feed", {})
        self.assertEqual(st, 200, r)
        self.assertTrue(r["webcal"].startswith("webcal://"))
        with urllib.request.urlopen(r["url"], timeout=5) as resp:   # no login: the key in the address is enough
            self.assertIn("text/calendar", resp.headers["Content-Type"])
            ics = resp.read().decode("utf-8")
        for want in ("BEGIN:VCALENDAR", "SUMMARY:Fodbold", "RRULE:FREQ=WEEKLY", "EXDATE;TZID=Europe/Copenhagen:20261117T170000", "TRIGGER:-PT15M",
                     "DTSTART;VALUE=DATE:20261224", "DTEND;VALUE=DATE:20261227", "X-WR-CALNAME:HUBTECH – Anna Hansen", "BEGIN:VTIMEZONE"):
            self.assertIn(want, ics)
        # a new address: the old one stops working
        r2 = me.req("POST", "/api/calendar/feed", {})[1]
        self.assertNotEqual(r2["url"], r["url"])
        with self.assertRaises(urllib.error.HTTPError):
            urllib.request.urlopen(r["url"], timeout=5)
        self.assertEqual(urllib.request.urlopen(r2["url"], timeout=5).status, 200)
        # switched off
        me.req("DELETE", "/api/calendar/feed")
        with self.assertRaises(urllib.error.HTTPError):
            urllib.request.urlopen(r2["url"], timeout=5)


if __name__ == "__main__":
    unittest.main()
