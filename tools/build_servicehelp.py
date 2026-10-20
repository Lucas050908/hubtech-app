#!/usr/bin/env python3
"""
Builds web/apps/servicehelp/index.html from the original sources/servicehjaelp.html.

The app's own code is kept as-is. Only these things are changed:
  * jsPDF is loaded from the bundled copy (vendor/) instead of a CDN  -> works offline, strict CSP
  * Google Fonts is replaced by the platform's own fonts (Manrope)
  * sh-theme.css (platform look) and sh-bridge.js (saves to the HUBTECH account) are added
  * the Claude-cloud login (cinit) is handed to the bridge
  * the app's own script is parked (type="text/x-hubtech-app"); the bridge starts it once the
    user's data has been fetched asynchronously

Run:  python3 tools/build_servicehelp.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "sources" / "servicehjaelp.html"
OUT = ROOT / "web" / "apps" / "servicehelp" / "index.html"


def sub_once(html, old, new):
    n = html.count(old)
    if n != 1:
        raise SystemExit(f"Forventede præcis én forekomst af {old[:60]!r}, fandt {n}. Er kildefilen ændret?")
    return html.replace(old, new)


def main():
    html = SRC.read_text(encoding="utf-8")
    html = sub_once(html, '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>',
                    '<script src="vendor/jspdf.umd.min.js"></script>')
    html = sub_once(html, '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">',
                    '<link rel="stylesheet" href="../../fonts/fonts.css">')
    html = sub_once(html, "</head>", '<link rel="stylesheet" href="sh-theme.css">\n<script src="sh-bridge.js"></script>\n</head>')
    html = sub_once(html, "<script>\n", '<script type="text/x-hubtech-app" id="sh-app">\n')
    html = sub_once(html, "async function cinit(){setCloud('wait');", "async function cinit(){if(window.HTB){HTB.cinit();return}setCloud('wait');")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"Skrev {OUT.relative_to(ROOT)} ({len(html) // 1024} KB)")


if __name__ == "__main__":
    main()
