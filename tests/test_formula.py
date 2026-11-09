"""Runs the JavaScript formula-engine tests (tests/formula.test.mjs) when Node.js is installed."""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class FormulaEngineTest(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node"), "Node.js er ikke installeret")
    def test_formula_engine(self):
        r = subprocess.run(["node", str(ROOT / "tests" / "formula.test.mjs")], capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    @unittest.skipUnless(shutil.which("node"), "Node.js er ikke installeret")
    def test_invoice(self):
        r = subprocess.run(["node", str(ROOT / "tests" / "invoice.test.mjs")], capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    @unittest.skipUnless(shutil.which("node"), "Node.js er ikke installeret")
    def test_it_tools(self):
        r = subprocess.run(["node", str(ROOT / "tests" / "ittools.test.mjs")], capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    @unittest.skipUnless(shutil.which("node"), "Node.js er ikke installeret")
    def test_spaced_repetition(self):
        r = subprocess.run(["node", str(ROOT / "tests" / "srs.test.mjs")], capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    @unittest.skipUnless(shutil.which("node"), "Node.js er ikke installeret")
    def test_ai_assistant(self):
        r = subprocess.run(["node", str(ROOT / "tests" / "ai.test.mjs")], capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    @unittest.skipUnless(shutil.which("node"), "Node.js er ikke installeret")
    def test_apps_logic(self):
        r = subprocess.run(["node", str(ROOT / "tests" / "apps.test.mjs")], capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)


if __name__ == "__main__":
    unittest.main()
