"""Kører JavaScript-testene (tests/*.test.mjs), når Node.js er installeret.

Filerne findes automatisk. Listen var før håndskrevet, og en ny testfil kunne
derfor ligge i tests/ uden nogensinde at blive kørt af suiten.
"""
import shutil
import subprocess
import unittest
from pathlib import Path

TESTS = Path(__file__).resolve().parent
FILES = sorted(TESTS.glob("*.test.mjs"))


class NodeTests(unittest.TestCase):
    def test_der_findes_node_tests(self):
        self.assertTrue(FILES, "fandt ingen *.test.mjs i tests/")


def _runner(path):
    @unittest.skipUnless(shutil.which("node"), "Node.js er ikke installeret")
    def test(self):
        r = subprocess.run(["node", str(path)], capture_output=True, text=True, timeout=180)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
    test.__doc__ = f"node tests/{path.name}"
    return test


for _f in FILES:
    setattr(NodeTests, "test_" + _f.name[: -len(".test.mjs")].replace("-", "_"), _runner(_f))


if __name__ == "__main__":
    unittest.main()
