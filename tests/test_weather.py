"""Vejret til topbaren: /api/weather oversætter Open-Meteo til dansk og gemmer svaret (netværket er udskiftet her)."""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("HUBTECH_DATA_DIR", tempfile.mkdtemp())
from server import api  # noqa: E402


class Req:
    def __init__(self, city):
        self.query = {"city": [city]} if city is not None else {}


class WeatherTest(unittest.TestCase):
    def setUp(self):
        api._WEATHER_CACHE.clear()
        self.user = mock.patch.object(api, "require_user", return_value={"id": 1, "role": "owner"})
        self.user.start()

    def tearDown(self):
        self.user.stop()

    def test_translates_and_caches(self):
        calls = []

        def fake(url):
            calls.append(url)
            if "geocoding" in url:
                return {"results": [{"name": "Aarhus", "latitude": 56.15, "longitude": 10.2}]}
            return {"current": {"temperature_2m": 1.6, "weather_code": 71}}
        with mock.patch.object(api, "_fetch_json", side_effect=fake):
            st, body = api.weather(Req("Aarhus"), None)
            self.assertEqual((st, body), (200, {"ok": True, "city": "Aarhus", "temp": 2, "text": "Let sne", "icon": "snow"}))
            api.weather(Req("aarhus"), None)
        self.assertEqual(len(calls), 2, "andet kald kommer fra lageret")
        self.assertIn("name=Aarhus", calls[0])

    def test_default_city_and_errors(self):
        with mock.patch.object(api, "_fetch_json", return_value={"results": []}) as f:
            st, body = api.weather(Req(""), None)
            self.assertEqual((st, body["ok"]), (200, False))
            self.assertIn("København", body["error"])
            self.assertIn("K%C3%B8benhavn", f.call_args[0][0])
        with mock.patch.object(api, "_fetch_json", side_effect=OSError("offline")):
            st, body = api.weather(Req("Odense"), None)
            self.assertEqual((st, body["ok"]), (200, False))
            self.assertNotIn("Odense".lower(), api._WEATHER_CACHE, "fejl gemmes ikke")

    def test_codes(self):
        self.assertEqual(api.weather_text(0), ("Klart", "sun"))
        self.assertEqual(api.weather_text(63)[1], "rain")
        self.assertEqual(api.weather_text(1234), ("Skiftende", "cloud"))


if __name__ == "__main__":
    unittest.main()
