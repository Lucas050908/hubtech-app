"""Kan appen installeres på en telefon?

Et manglende ikon eller en forkert MIME-type giver et tomt hjemskærmsikon eller slet
ingen "Tilføj til hjemmeskærm" — og det opdager man først på telefonen, aldrig i
browseren på en computer. Derfor tjekkes det her.
"""
import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
sys.path.insert(0, str(ROOT))
PNG = b"\x89PNG\r\n\x1a\n"


def _manifest(name):
    return json.loads((WEB / name).read_text(encoding="utf-8"))


class ManifestTest(unittest.TestCase):
    def test_hovedmanifestet_har_det_der_skal_til(self):
        m = _manifest("manifest.webmanifest")
        for key in ("name", "short_name", "start_url", "scope", "display", "icons"):
            self.assertIn(key, m, f"manifestet mangler {key}")
        self.assertEqual(m["display"], "standalone")
        self.assertEqual(m["lang"], "da", "brugerfladen er på dansk")
        self.assertTrue(m["theme_color"].startswith("#"))
        sizes = {i["sizes"] for i in m["icons"]}
        self.assertIn("192x192", sizes, "Android kræver et 192-ikon")
        self.assertIn("512x512", sizes, "installationsdialogen bruger 512-ikonet")
        self.assertTrue([i for i in m["icons"] if i.get("purpose") == "maskable"],
                        "uden et maskable-ikon bliver ikonet beskåret på Android")

    def test_alle_ikoner_i_begge_manifester_findes(self):
        for name in ("manifest.webmanifest", "widget.webmanifest"):
            m = _manifest(name)
            srcs = [i["src"] for i in m.get("icons", [])]
            for sc in m.get("shortcuts", []):
                srcs += [i["src"] for i in sc.get("icons", [])]
            self.assertTrue(srcs, f"{name} har ingen ikoner")
            for src in sorted(set(srcs)):
                p = WEB / src
                with self.subTest(manifest=name, ikon=src):
                    self.assertTrue(p.is_file(), f"{name} peger på {src}, som ikke findes")
                    data = p.read_bytes()
                    self.assertTrue(data.startswith(PNG), f"{src} er ikke en PNG")
                    self.assertGreater(len(data), 500, f"{src} er mistænkeligt lille")

    def test_index_html_har_det_en_iphone_har_brug_for(self):
        html = (WEB / "index.html").read_text(encoding="utf-8")
        self.assertIn('rel="manifest"', html)
        self.assertIn("viewport-fit=cover", html, "uden den dækker indholdet ikke hakket i skærmen")
        for meta in ("apple-touch-icon", "apple-mobile-web-app-capable", "apple-mobile-web-app-title", "theme-color"):
            self.assertIn(meta, html, f"index.html mangler {meta}")
        for ref in set(re.findall(r'(?:href|src)="(assets/[^"]+)"', html)):
            with self.subTest(fil=ref):
                self.assertTrue((WEB / ref).is_file(), f"index.html peger på {ref}, som ikke findes")


class MimeTest(unittest.TestCase):
    def test_serveren_sender_manifestet_som_manifest(self):
        # Browseren afviser et manifest, der kommer som text/plain.
        from server.app import CONTENT_TYPES
        self.assertEqual(CONTENT_TYPES[".webmanifest"], "application/manifest+json")
        self.assertEqual(CONTENT_TYPES.get(".png"), "image/png")


if __name__ == "__main__":
    unittest.main()
