"""Navngivning af sikkerhedskopier: flere kopier i samme sekund må hverken kollidere eller hænge.

Klokken skrues frem til to sekunder før et minutskifte, og de to navne er optaget i forvejen.
Med den gamle navnelogik (min(59, sekund + n)) ville make_backup aldrig komme videre.
"""
import importlib
import os
import sys
import tempfile
import threading
import time as real_time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


class FrozenClock:
    """time-modulet, men hvor "nu" står stille på et valgt tidspunkt."""

    def __init__(self, stamp):
        self.base = real_time.mktime(real_time.strptime(stamp, "%Y%m%d-%H%M%S"))

    def time(self):
        return self.base

    def localtime(self, t=None):
        return real_time.localtime(self.base if t is None else t)

    def strftime(self, fmt, t=None):
        return real_time.strftime(fmt, self.localtime() if t is None else t)

    def __getattr__(self, name):
        return getattr(real_time, name)


class BackupNameTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="hubtech-names-"))
        os.environ["HUBTECH_DATA_DIR"] = str(self.tmp)
        os.environ["HUBTECH_QUIET"] = "1"
        from server import config, db
        importlib.reload(config)
        importlib.reload(db)
        from server import backup
        importlib.reload(backup)
        db.migrate()
        self.backup = backup
        self.real_time = backup.time

    def tearDown(self):
        self.backup.time = self.real_time
        os.environ.pop("HUBTECH_DATA_DIR", None)

    def _backup_with_timeout(self, kind="manual", seconds=10):
        """make_backup må ikke kunne hænge: kør den i en tråd og giv op efter `seconds`."""
        out = {}
        t = threading.Thread(target=lambda: out.update(ok=self.backup.make_backup(kind)), daemon=True)
        t.start()
        t.join(seconds)
        self.assertFalse(t.is_alive(), "make_backup blev aldrig færdig – navnevalget hænger i en løkke")
        return out["ok"]

    def test_two_copies_in_the_same_second_get_different_names(self):
        self.backup.time = FrozenClock("20261110-120310")
        first = self._backup_with_timeout()
        second = self._backup_with_timeout()
        self.assertEqual(first["name"], "hubtech-manual-20261110-120310.db")
        self.assertEqual(second["name"], "hubtech-manual-20261110-120311.db")

    def test_the_last_seconds_of_a_minute_do_not_loop(self):
        self.backup.time = FrozenClock("20261110-120358")
        names = [self._backup_with_timeout()["name"] for _ in range(3)]
        self.assertEqual(names, ["hubtech-manual-20261110-120358.db",
                                 "hubtech-manual-20261110-120359.db",
                                 "hubtech-manual-20261110-120400.db"])

    def test_every_name_can_be_listed_and_found_again(self):
        self.backup.time = FrozenClock("20261110-235958")
        names = [self._backup_with_timeout()["name"] for _ in range(4)]
        self.assertEqual(len(set(names)), 4, names)
        for n in names:
            self.assertTrue(self.backup.NAME_RE.match(n), n)
            self.assertIsNotNone(self.backup.path_of(n), n)
        self.assertEqual(names[-1], "hubtech-manual-20261111-000001.db")  # over midnat


if __name__ == "__main__":
    unittest.main()
