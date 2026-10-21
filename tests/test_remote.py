"""HUBTECH sets up Tailscale Funnel by itself (friends on other networks) – against a stand-in `tailscale`."""
import json
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_social  # noqa: E402

FAKE = Path(__file__).resolve().parent / "fake_tailscale.py"


@unittest.skipIf(os.name == "nt", "the stand-in is a POSIX script")
class RemoteAccessTest(unittest.TestCase):
    tearDownClass = classmethod(test_social.SocialTest.tearDownClass.__func__)

    @classmethod
    def setUpClass(cls):
        cls.state = Path(tempfile.mkdtemp(prefix="hubtech-ts-")) / "state.json"
        cls.state.write_text("{}")
        extra = {"HUBTECH_TAILSCALE_EXE": str(FAKE), "FAKE_TS_STATE": str(cls.state), "HUBTECH_NO_NOTIFY_WORKER": "1"}
        old = {k: os.environ.get(k) for k in extra}
        os.environ.update(extra)
        try:
            test_social.SocialTest.setUpClass.__func__(cls)
        finally:
            for k, v in old.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

    def ts(self, **kw):
        s = json.loads(self.state.read_text() or "{}")
        s.update(kw)
        self.state.write_text(json.dumps(s))

    def wait_job(self, pred, seconds=10):
        for _ in range(seconds * 10):
            st, info, _ = self.a.req("GET", "/api/system/public-access")
            if pred(info):
                return info
            time.sleep(0.1)
        self.fail(f"timed out: {info}")

    def test_step_by_step_setup(self):
        a, b = self.a, self.b
        self.assertEqual(b.req("GET", "/api/system/public-access")[0], 403)      # owner only
        self.assertEqual(b.req("POST", "/api/system/public-access", {})[0], 403)
        # forwarded through a proxy = not "this computer"
        self.assertEqual(a.req("GET", "/api/system/public-access", headers={"X-Forwarded-For": "203.0.113.5"})[0], 403)
        # 1) Tailscale installed, but not running → HUBTECH starts it
        st, r, _ = a.req("POST", "/api/system/public-access", {})
        self.assertEqual((st, r["step"]), (200, "start"), r)
        # 2) running, not logged in → login link is captured
        self.ts(daemon=True)
        self.assertEqual(a.req("POST", "/api/system/public-access", {})[1]["step"], "login")
        info = self.wait_job(lambda i: (i["job"] or {}).get("url"))
        self.assertEqual(info["job"]["url"], "https://login.tailscale.com/a/abc123")
        self.ts(loggedIn=True)
        self.wait_job(lambda i: i["tailscale"]["running"] and i["job"]["done"])
        # 3) logged in → funnel; the first time Tailscale asks to allow Funnel
        self.assertEqual(a.req("POST", "/api/system/public-access", {})[1]["step"], "funnel")
        info = self.wait_job(lambda i: (i["job"] or {}).get("url"))
        self.assertIn("/f/funnel", info["job"]["url"])
        self.assertFalse(info["tailscale"]["funnel"])
        self.ts(funnelAllowed=True)
        info = self.wait_job(lambda i: i["tailscale"]["funnel"])
        self.assertEqual(info["tailscale"]["url"], "https://min-pc.tail1234.ts.net")
        self.assertEqual(json.loads(self.state.read_text())["port"], str(self.port))   # pointed at HUBTECH's port
        self.assertTrue(self.wait_job(lambda i: i["enabled"])["enabled"])
        self.assertEqual(a.req("POST", "/api/system/public-access", {})[1]["step"], "done")
        # off again
        self.assertEqual(a.req("POST", "/api/system/public-access", {"on": False})[1]["step"], "off")
        info = a.req("GET", "/api/system/public-access")[1]
        self.assertEqual((info["tailscale"]["funnel"], info["enabled"]), (False, False))


if __name__ == "__main__":
    unittest.main()
