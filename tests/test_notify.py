"""Notifications when HUBTECH is closed: ES256 signing for web push, the inbox, push subscriptions and mails."""
import hashlib
import os
import socket
import sys
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import test_social  # noqa: E402  (not "from … import SocialTest": unittest would run its tests again)
from server import p256  # noqa: E402


class P256Test(unittest.TestCase):
    def test_sign_and_verify(self):
        d, pub = p256.new_key()
        self.assertEqual(len(pub), 65)
        self.assertTrue(p256.on_curve((int.from_bytes(pub[1:33], "big"), int.from_bytes(pub[33:], "big"))))
        sig = p256.sign(d, b"header.claims")
        self.assertEqual(len(sig), 64)
        self.assertTrue(p256.verify(pub, b"header.claims", sig))
        self.assertFalse(p256.verify(pub, b"header.claimz", sig))
        self.assertFalse(p256.verify(p256.new_key()[1], b"header.claims", sig))

    def test_known_vector(self):
        # RFC 6979 A.2.5, P-256 with SHA-256, message "sample"
        d = 0xC9AFA9D845BA75166B5C215767B1D6934E50C3DB36E89B127B8A622B120F6721
        self.assertEqual(p256.public_bytes(d)[1:33].hex().upper(), "60FED4BA255A9D31C961EB74C6356D68C049B8923B61FA6CE669622E60F29FB6")
        sig = p256.sign(d, b"sample")
        self.assertEqual(sig[:32].hex().upper(), "EFD48B2AACB6A8FD1140DD9CD45E81D69D2C877B56AAF991C34D0EA84EAF3716")
        self.assertEqual(sig[32:].hex().upper(), "F7CB1C942D657C41D436C7A1B6E29F65F3E900DBB9AFF4064DC4AB2F843ACDA8")


class FakeSmtp(threading.Thread):
    """Just enough SMTP to receive one mail."""
    def __init__(self):
        super().__init__(daemon=True)
        self.sock = socket.socket()
        self.sock.bind(("127.0.0.1", 0))
        self.sock.listen(1)
        self.port = self.sock.getsockname()[1]
        self.mails = []

    def run(self):
        while True:
            try:
                c, _ = self.sock.accept()
            except OSError:
                return
            f = c.makefile("rb")
            c.sendall(b"220 fake\r\n")
            data = None
            while True:
                line = f.readline()
                if not line:
                    break
                cmd = line.strip().upper()
                if data is not None:
                    if line in (b".\r\n", b".\n"):
                        self.mails.append(b"".join(data).decode("utf-8", "replace"))
                        data = None
                        c.sendall(b"250 ok\r\n")
                    else:
                        data.append(line)
                elif cmd.startswith(b"EHLO") or cmd.startswith(b"HELO"):
                    c.sendall(b"250 fake\r\n")
                elif cmd == b"DATA":
                    data = []
                    c.sendall(b"354 go\r\n")
                elif cmd == b"QUIT":
                    c.sendall(b"221 bye\r\n")
                    break
                else:
                    c.sendall(b"250 ok\r\n")
            c.close()


class NotifyTest(unittest.TestCase):
    """Uses SocialTest's server and users (without running its tests again)."""
    upload = test_social.SocialTest.upload
    join_cm = test_social.SocialTest.join_cm
    tearDownClass = classmethod(test_social.SocialTest.tearDownClass.__func__)

    @classmethod
    def setUpClass(cls):
        os.environ["HUBTECH_NO_NOTIFY_WORKER"] = "1"     # the test must not contact real push services
        try:
            test_social.SocialTest.setUpClass.__func__(cls)
        finally:
            os.environ.pop("HUBTECH_NO_NOTIFY_WORKER", None)

    def test_inbox_push_and_mail(self):
        a, b = self.a, self.b
        self.join_cm(a, b)
        st, body, _ = b.req("GET", "/api/notify/prefs")
        self.assertEqual(st, 200, body)
        self.assertTrue(body["prefs"]["kinds"]["dm"])
        self.assertEqual(len(body["pushKey"]), 87)          # 65 bytes, base64url
        last = b.req("GET", "/api/notify/inbox?since=-1")[1]["last"]
        # a friend request and a DM while bent is away → both are in his inbox
        a.req("POST", "/api/cm/friends", {"username": "bent"})
        b.req("POST", f"/api/cm/friends/{self.ids['anna']}/accept")
        dm = f"dm-{min(self.ids['anna'], self.ids['bent'])}-{max(self.ids['anna'], self.ids['bent'])}"
        self.assertEqual(a.req("POST", f"/api/cm/channels/{dm}/messages", {"body": "Er du der?"})[0], 201)
        items = b.req("GET", f"/api/notify/inbox?since={last}")[1]["items"]
        self.assertEqual([(i["kind"], i["title"]) for i in items], [("friend", "Ny venneanmodning"), ("dm", "Anna")])
        self.assertEqual(items[1]["path"], f"/apps/community/dm/{dm}")
        anna_items = a.req("GET", "/api/notify/recent")[1]["items"]
        self.assertEqual([i["title"] for i in anna_items][:1], ["I er nu venner"])
        # turning a kind off stops it
        self.assertEqual(b.req("PUT", "/api/notify/prefs", {"kinds": {"dm": False}})[0], 200)
        last = items[-1]["id"]
        a.req("POST", f"/api/cm/channels/{dm}/messages", {"body": "Hallo?"})
        self.assertEqual(b.req("GET", f"/api/notify/inbox?since={last}")[1]["items"], [])
        b.req("PUT", "/api/notify/prefs", {"kinds": {"dm": True}})
        # push subscriptions only for the browsers' push services
        self.assertEqual(b.req("POST", "/api/notify/push", {"endpoint": "https://evil.example/x"})[0], 400)
        self.assertEqual(b.req("POST", "/api/notify/push", {"endpoint": "http://fcm.googleapis.com/fcm/send/x"})[0], 400)
        ep = "https://fcm.googleapis.com/fcm/send/abc123"
        st, body, _ = b.req("POST", "/api/notify/push", {"endpoint": ep})
        self.assertEqual(st, 200, body)
        self.assertEqual(body["sub"], hashlib.sha256(ep.encode()).hexdigest())
        self.assertEqual(b.req("POST", "/api/notify/test")[0], 200)
        got = b.req("GET", f"/api/notify/inbox?sub={body['sub']}")[1]["items"]
        self.assertEqual([i["title"] for i in got], ["Test fra HUBTECH"])
        self.assertEqual(b.req("GET", f"/api/notify/inbox?sub={body['sub']}")[1]["items"], [])     # each device gets it once
        self.assertEqual(a.req("GET", f"/api/notify/inbox?sub={body['sub']}")[1]["items"], [])     # not someone else's device
        # mail: only the owner sets up the mail server; the password is never sent back
        self.assertEqual(b.req("PUT", "/api/notify/smtp", {"host": "x"})[0], 403)
        self.assertEqual(b.req("PUT", "/api/notify/prefs", {"email": True})[1]["code"], "no_email")
        smtp = FakeSmtp()
        smtp.start()
        st, body, _ = a.req("PUT", "/api/notify/smtp", {"host": "127.0.0.1", "port": smtp.port, "security": "none", "sender": "hub@example.com", "password": "hemmelig"})
        self.assertEqual(st, 200, body)
        self.assertTrue(body["hasPassword"])
        self.assertNotIn("password", body)
        self.assertNotIn("hemmelig", str(a.req("GET", "/api/notify/smtp")[1]))
        a.req("PATCH", "/api/me", {"email": "anna@example.com"})
        st, body, _ = a.req("POST", "/api/notify/test", {"email": True})
        self.assertEqual(st, 200, body)
        self.assertEqual(len(smtp.mails), 1)
        self.assertIn("To: anna@example.com", smtp.mails[0])
        self.assertIn("Subject: Test fra HUBTECH", smtp.mails[0])
        smtp.sock.close()

    def test_digest_text(self):
        from server import notify
        rows = [{"title": "Anna", "text": "Er du der?", "path": "/apps/community/dm/dm-1-2"}, {"title": "Ny snap", "text": "", "path": "/apps/community/snaps"}]
        subject, text, html = notify.digest_mail("Bent", rows, "https://hub.example.dk")
        self.assertEqual(subject, "2 nye ting i HUBTECH")
        self.assertIn("• Anna – Er du der?", text)
        self.assertIn("https://hub.example.dk/#/apps/community/snaps", text)
        self.assertNotIn("<script", notify.digest_mail("<script>", rows, "")[2])


if __name__ == "__main__":
    unittest.main()
