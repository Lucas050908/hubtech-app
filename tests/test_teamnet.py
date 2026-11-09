"""Teamnet: the sealed copy can only be opened with the right password, and a change is noticed."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TeamnetSeal(unittest.TestCase):
    def setUp(self):
        os.environ.setdefault("HUBTECH_DATA_DIR", tempfile.mkdtemp())
        from server import teamnet
        self.t = teamnet

    def test_roundtrip(self):
        k = self.t.vault_key("Maja", "Sommer2026xx!")
        data = os.urandom(5000) + "æøå".encode()
        blob = self.t.seal(k, data)
        self.assertNotIn(data[:64], blob)
        self.assertEqual(self.t.unseal(k, blob), data)
        self.assertEqual(self.t.unseal(self.t.vault_key("maja", "Sommer2026xx!"), blob), data, "brugernavn uden store/små bogstaver")

    def test_wrong_password(self):
        blob = self.t.seal(self.t.vault_key("maja", "rigtig-kode-123"), b"hemmeligt")
        with self.assertRaises(ValueError):
            self.t.unseal(self.t.vault_key("maja", "forkert-kode-123"), blob)

    def test_tampered(self):
        k = self.t.vault_key("maja", "rigtig-kode-123")
        blob = bytearray(self.t.seal(k, b"hemmeligt indhold"))
        blob[25] ^= 1
        with self.assertRaises(ValueError):
            self.t.unseal(k, bytes(blob))

    def test_two_seals_differ(self):
        k = self.t.vault_key("maja", "rigtig-kode-123")
        self.assertNotEqual(self.t.seal(k, b"samme"), self.t.seal(k, b"samme"))


if __name__ == "__main__":
    unittest.main()
