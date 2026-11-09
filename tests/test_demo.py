"""The demo (server/demo.py): a test account with examples, in its own folder, only on this computer."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CHECK = r"""
import json, os, sys
sys.path.insert(0, sys.argv[1])
from server import demo, db, auth, config
db.migrate()
first, again = demo.seed(), demo.seed()
u = db.one("SELECT * FROM users WHERE username = 'demo'")
print(json.dumps({
  "first": first, "again": again, "owner": u["role"], "login": auth.verify_password(demo.PASSWORD, u["password_hash"]),
  "dir": str(config.DATA_DIR), "host": os.environ.get("HUBTECH_HOST"), "discovery": os.environ.get("HUBTECH_HUB_DISCOVERY"),
  "projects": [r["name"] for r in db.all_rows("SELECT name FROM pj_projects ORDER BY name")],
  "files": [r["path"] for r in db.all_rows("SELECT path FROM pj_files")],
  "tasks": len(json.loads(db.one("SELECT data FROM app_state WHERE user_id = ? AND app_id = 'tasks'", (u["id"],))["data"])["tasks"]),
}))
"""


class DemoTest(unittest.TestCase):
    def test_demo_account_and_examples(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = dict(os.environ, HUBTECH_DEMO_DIR=tmp)
            env.pop("HUBTECH_DATA_DIR", None)
            out = subprocess.run([sys.executable, "-c", CHECK, str(ROOT)], env=env, capture_output=True, text=True, timeout=60, cwd=tmp)
            self.assertEqual(out.returncode, 0, out.stderr)
            r = json.loads(out.stdout.strip().splitlines()[-1])
            self.assertTrue(r["first"]); self.assertFalse(r["again"], "only made once – your changes in the demo are kept")
            self.assertEqual(r["owner"], "owner"); self.assertTrue(r["login"])
            self.assertEqual(Path(r["dir"]).resolve(), Path(tmp).resolve(), "the demo never touches the real HUBTECH")
            self.assertEqual((r["host"], r["discovery"]), ("127.0.0.1", "0"), "only this computer, no neighbours")
            self.assertEqual(r["projects"], ["Kontorflytning", "Lager-scanneren"])
            self.assertEqual(r["files"], ["site/index.html"]); self.assertEqual(r["tasks"], 3)


if __name__ == "__main__":
    unittest.main()
