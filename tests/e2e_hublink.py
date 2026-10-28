"""Browser test: two HUBTECHs are connected in the UI, and the owner of one visits the other with his own account.

    python3 tests/e2e_hublink.py /tmp/shots
Starts two fresh servers by itself. Prints PASS/FAIL per check, exit code 1 on any failure.
"""
import asyncio
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/hubtech-shots"
os.makedirs(OUT, exist_ok=True)
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail and not ok else ""), flush=True)


def start(host="127.0.0.1"):
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    env = dict(os.environ, HUBTECH_DATA_DIR=tempfile.mkdtemp(prefix="hubtech-e2e-link-"), HUBTECH_QUIET="1", HUBTECH_SIGNUP="", HUBTECH_NO_NOTIFY_WORKER="1", HUBTECH_BYTEFORGE_AUTOSTART="false")
    p = subprocess.Popen([sys.executable, str(ROOT / "server" / "app.py"), "--port", str(port)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://{host}:{port}"
    for _ in range(100):
        try:
            urllib.request.urlopen(base + "/api/health", timeout=1); break
        except OSError:
            time.sleep(0.1)
    return p, base


async def owner(browser, base, user, name):
    c = await browser.new_context(viewport={"width": 1280, "height": 900})
    await c.add_init_script("try { localStorage.setItem('hubtech.friendsAsked','1'); localStorage.setItem('hubtech.updateCheck', String(Date.now())); } catch(e) {}")
    pg = await c.new_page()
    await pg.goto(base + "/#/signup"); await pg.wait_for_selector("#su-name")
    await pg.fill("#su-name", name); await pg.fill("#su-user", user); await pg.fill("#su-pass", "Sommer2026xx!"); await pg.fill("#su-pass2", "Sommer2026xx!")
    await pg.click("button[type=submit]"); await pg.wait_for_selector(".home-title", timeout=20000)
    await pg.evaluate("fetch('/api/me/onboarding', {method: 'POST', headers: {'X-Requested-With': 'hubtech', 'Content-Type': 'application/json'}, body: JSON.stringify({done: true, step: 9})})")
    await pg.reload(); await pg.wait_for_selector(".home-title")
    return c, pg


async def main():
    pa, a = start()
    pb, b = start("localhost")   # another host name, so the two keep their own login cookie
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            ca, pga = await owner(browser, a, "oliver", "Oliver Jensen")
            cb, pgb = await owner(browser, b, "maja", "Maja Holm")
            # Oliver: the menu takes him to Forbindelser, he makes a code for his own address
            await pga.goto(a + "/#/hubs"); await pga.wait_for_selector(".hubs-page .hl-empty")
            check("forbindelser: siden åbner med en tom liste og tre trin", await pga.locator(".hl-step").count() == 3)
            await pga.fill("input[aria-label='Navnet på din HUBTECH']", "Olivers værksted"); await pga.press("input[aria-label='Navnet på din HUBTECH']", "Tab")
            await pga.wait_for_timeout(300)
            if not await pga.locator("input[aria-label='Egen adresse']").is_visible():
                await pga.click("summary:has-text('Bruger du en anden adresse?')")
            await pga.fill("input[aria-label='Egen adresse']", a)
            await pga.click(".hubs-page button:has-text('Lav en kode')"); await pga.wait_for_selector(".hl-codetext")
            code = await pga.input_value(".hl-codetext")
            try:
                await pga.wait_for_selector(".hl-qr svg", timeout=5000)
            except Exception:
                pass
            check("forbindelser: en kode med QR laves", code.startswith("HUB1-") and await pga.locator(".hl-qr svg").count() == 1)
            await pga.screenshot(path=f"{OUT}/hubs-invite.png")
            # Maja pastes it on her HUBTECH and connects
            await pgb.goto(b + "/#/hubs"); await pgb.wait_for_selector("textarea[aria-label='Indsæt forbindelseskode']")
            if not await pgb.locator("input[aria-label='Min adresse']").is_visible():
                await pgb.click("summary:has-text('Den adresse, din vens')")
            await pgb.fill("input[aria-label='Min adresse']", b)
            await pgb.fill("textarea[aria-label='Indsæt forbindelseskode']", code); await pgb.click(".hubs-page button:has-text('Tjek koden')")
            await pgb.wait_for_selector(".hl-peek")
            check("forbindelser: koden viser, hvem man forbinder med", "Olivers værksted" in await pgb.inner_text(".hl-peek"))
            await pgb.click(".hl-peek button:has-text('Forbind med')"); await pgb.wait_for_selector(".hl-card")
            check("forbindelser: forbundet – vises hos den, der indsatte koden", "Olivers værksted" in await pgb.inner_text(".hl-card"))
            await pgb.screenshot(path=f"{OUT}/hubs-connected.png")
            await pga.reload(); await pga.wait_for_selector(".hl-card")
            check("forbindelser: … og hos den, der lavede koden", "Majas HUBTECH" in await pga.inner_text(".hl-card"))
            await pga.goto(a + "/#/"); await pga.wait_for_selector(".home-hub", timeout=10000)
            check("hjem: forbundne HUBTECH'er kan besøges fra forsiden", "Majas HUBTECH" in await pga.inner_text(".home-hub"))
            await pga.screenshot(path=f"{OUT}/hubs-home.png")
            # Oliver visits Maja's HUBTECH with one click
            await pga.locator(".home-hub").scroll_into_view_if_needed(); await pga.wait_for_timeout(600)
            await pga.click(".home-hub", timeout=8000)
            await pga.wait_for_url(b + "/#/**", timeout=15000); await pga.wait_for_selector(".home-title", timeout=20000)
            me = await pga.evaluate("fetch('/api/me', {headers: {'X-Requested-With': 'hubtech'}}).then(r => r.json())")
            check("besøg: logget ind på den anden HUBTECH med sit eget navn", me["user"]["displayName"] == "Oliver Jensen" and me["user"]["role"] == "member")
            await pga.screenshot(path=f"{OUT}/hubs-visit.png")
            await pga.goto(b + "/#/hubs"); await pga.wait_for_selector(".hl-visitor")
            check("besøg: man kan se, at man er gæst, og gå hjem igen", "Olivers værksted" in await pga.inner_text(".hl-visitor") and await pga.locator("button:has-text('Tilbage til min HUBTECH')").count() == 1)
            await pga.click("button:has-text('Tilbage til min HUBTECH')"); await pga.wait_for_url(a + "/#/**", timeout=15000)
            check("besøg: tilbage hjemme", a in pga.url)
            # an invitation link lets a friend without a HUBTECH make an account (sign-up is closed)
            await pga.goto(a + "/#/hubs"); await pga.click(".hubs-page button:has-text('Lav et invitationslink')"); await pga.wait_for_selector("input[aria-label='Invitationslink']")
            link = (await pga.input_value("input[aria-label='Invitationslink']")).replace(a.replace("127.0.0.1", "localhost"), a)
            link = a + "/#/signup?invite=" + link.split("invite=")[1]
            c4 = await browser.new_context(); p4 = await c4.new_page()
            await p4.goto(link); await p4.wait_for_selector(".callout.ok", timeout=10000)
            check("invitation: tilmeldingssiden viser, hvem der inviterer", "Oliver Jensen har inviteret dig" in await p4.inner_text(".callout.ok"))
            await p4.screenshot(path=f"{OUT}/hubs-invite-signup.png")
            await p4.fill("#su-name", "Karla Nielsen"); await p4.fill("#su-user", "karla"); await p4.fill("#su-pass", "Sommer2026xx!"); await p4.fill("#su-pass2", "Sommer2026xx!")
            await p4.click("button[type=submit]"); await p4.wait_for_selector(".home-title", timeout=20000)
            me4 = await p4.evaluate("fetch('/api/me', {headers: {'X-Requested-With': 'hubtech'}}).then(r => r.json())")
            check("invitation: kontoen oprettes, selv om tilmelding er lukket", me4["user"]["displayName"] == "Karla Nielsen")
            await c4.close()
            # Maja's login page shows a button for people from Oliver's HUBTECH
            c3 = await browser.new_context(); p3 = await c3.new_page()
            await p3.goto(b + "/#/login"); await p3.wait_for_selector(".hl-login", timeout=10000)
            check("login: “Log ind med …” for forbundne HUBTECH'er", "Olivers værksted" in await p3.inner_text(".hl-login"))
            await p3.screenshot(path=f"{OUT}/hubs-login.png")
            # a big app group has an “Alle” button with a searchable grid
            await pga.goto(a + "/#/apps/blocks"); await pga.wait_for_selector(".suite-all")
            await pga.click(".suite-all"); await pga.fill(".modal input[type=search]", "juvel")
            await pga.wait_for_timeout(200)
            check("app-grupper: “Alle” viser gruppen som et gitter med søgning", await pga.locator(".modal .lx-tile").count() == 1 and "Juveler" in await pga.inner_text(".modal .lx-tile"))
            await pga.screenshot(path=f"{OUT}/suite-all.png")
            await pga.press(".modal input[type=search]", "Enter"); await pga.wait_for_url("**/apps/gems", timeout=5000)
            # on a phone: no sideways scrolling on the new pages
            cm = await browser.new_context(**p.devices["Pixel 7"]); pm = await cm.new_page()
            await pm.goto(a + "/#/login"); await pm.fill("#login-user", "oliver"); await pm.fill("#login-pass", "Sommer2026xx!"); await pm.click("button[type=submit]")
            await pm.wait_for_selector(".home-title", timeout=20000)
            wide = {}
            for route in ["/", "/hubs", "/apps"]:
                await pm.goto(a + "/#" + route); await pm.wait_for_timeout(1500)
                over = await pm.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
                if over > 2: wide[route] = over
                await pm.screenshot(path=f"{OUT}/phone{route.replace('/', '-') or '-home'}.png", full_page=False)
            check("telefon: ingen vandret rulning på hjem, forbindelser og apps", not wide, str(wide))
            await browser.close()
    finally:
        for proc in (pa, pb):
            proc.terminate()
    failed = sum(1 for r in results if not r[1])
    print(f"{len(results) - failed}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)

asyncio.run(main())
