"""End-to-end browser test (Playwright). Run against a server started with a fresh data dir:

    HUBTECH_DATA_DIR=/tmp/hubtech-e2e python3 server/app.py --port 8193
    python3 tests/e2e_browser.py http://127.0.0.1:8193 /tmp/shots [cursor-open-log]

Exercises the real user flows and prints PASS/FAIL per check. Exit code 1 on any failure.
"""
import asyncio
import base64
import json
import urllib.parse
import os
os.environ.setdefault("HUBTECH_HUB_DISCOVERY", "0")   # test servers must not find (and connect to) each other
import sys

from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8193"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/hubtech-shots"
OPEN_LOG = sys.argv[3] if len(sys.argv) > 3 else None
os.makedirs(OUT, exist_ok=True)
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail and not ok else ""))


async def api(page, method, path, body=None):
    return await page.evaluate("""async ([m, p, b]) => {
        const r = await fetch(p, {method: m, headers: {'X-Requested-With': 'hubtech', 'Content-Type': 'application/json'}, body: b ? JSON.stringify(b) : undefined});
        return {status: r.status, data: await r.json().catch(() => null)};
    }""", [method, path, body])


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 1440, "height": 900})
        # the one-time "friends on other networks?" question has its own test further down
        await ctx.add_init_script("try { localStorage.setItem('hubtech.friendsAsked', '1') } catch (e) {}")
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        # ── first run & sign-up ──
        await page.goto(BASE + "/")
        await page.wait_for_selector(".landing-title", timeout=8000)
        check("landing renders", await page.locator(".landing-title").count() == 1)
        await page.click("text=Opret ejerkonto")
        await page.wait_for_selector("#su-user")
        await page.fill("#su-name", "Oliver Jensen")
        await page.fill("#su-user", "oliver")
        await page.fill("#su-pass", "short")
        await page.fill("#su-pass2", "short")
        await page.click("button[type=submit]")
        await page.wait_for_timeout(600)
        check("weak password rejected with field error", "10 tegn" in (await page.text_content("#su-pass-err") or ""))
        await page.fill("#su-pass", "Sommer2026x!")
        await page.fill("#su-pass2", "Sommer2026x!")
        await page.click("button[type=submit]")
        await page.wait_for_selector(".home-title", timeout=8000)
        check("sign-up lands on Hjem", "Oliver" in await page.text_content(".home-title"))

        # ── onboarding tour ──
        await page.wait_for_selector(".tour-card", timeout=5000)
        check("onboarding starts for new user", await page.locator(".tour-card").count() == 1)
        check("rundturen fortælles af maskotten Gnist", await page.locator(".tour-card .gnist-mark").count() == 1 and "Gnist" in await page.inner_text(".tour-card"))
        steps = 0
        while await page.locator(".tour-card").count() and steps < 15:
            btn = page.locator(".tour-card .btn-primary")
            await btn.click()
            await page.wait_for_timeout(450)
            steps += 1
        me = await api(page, "GET", "/api/me")
        check("onboarding completes and is stored", me["data"]["user"]["onboarding"]["done"] is True, me)
        await page.screenshot(path=f"{OUT}/e2e_home.png")
        await page.reload()
        await page.wait_for_timeout(2200)
        check("tour not repeated after reload", await page.locator(".tour-card").count() == 0)

        # ── course progress ──
        await page.goto(BASE + "/#/learn/course/servicetekniker/day/1")
        await page.wait_for_selector(".task")
        for i in range(3):
            await page.locator(".task").nth(i).click()
            await page.wait_for_timeout(150)
        await page.fill(".day-card textarea", "Husk at spørge om servicesager.")
        await page.wait_for_timeout(1400)
        st = await api(page, "GET", "/api/state/course-servicetekniker")
        d0 = (st["data"]["state"] or {}).get("days", {}).get("0", {})
        check("course tasks + notes saved to server", d0.get("complete") and d0.get("notes", "").startswith("Husk"), d0)
        summ = await api(page, "GET", "/api/me/summary")
        check("XP aggregated (onboarding 50 + course 95)", summ["data"]["xp"] == 145, summ["data"])

        # ── Widgets i topbaren og Tilpas: vælg widgets, hvad de viser, og hvilke kort Hjem har ──
        await page.goto(BASE + "/#/"); await page.wait_for_selector(".home .home-hero")
        await page.wait_for_selector(".top-widgets .tw-streak")
        look = await page.evaluate("({ style: document.documentElement.dataset.style, look: document.documentElement.dataset.look, src: document.documentElement.dataset.worldSource, scene: !!document.getElementById('world-scene') && !document.getElementById('world-scene').hidden })")
        check("design D (Rolig og varm) er standard: flad baggrund uden scene", look == {"style": "orken", "look": "rolig", "src": "none", "scene": False}, look)
        rail = await page.evaluate("[...document.querySelectorAll('.irail .irail-item')].filter(e => e.getClientRects().length).map(e => e.dataset.id)")
        check("design D: ikon-menu i venstre side", "home" in rail and "settings" in rail and len(rail) >= 6, rail)
        font = await page.evaluate("getComputedStyle(document.querySelector('.home-title')).fontFamily")
        check("design D: overskrifter med Fraunces", "Fraunces" in font, font)
        await page.screenshot(path=f"{OUT}/design-rolig.png")
        check("widgets: streak og online i topbaren (vejret står ved uret)", await page.locator(".top-widgets .tw-chip").count() == 2, await page.inner_text(".top-widgets"))
        check("ørken-designet: ur, hilsen, fire nøgletal og dock", await page.locator(".home-clock").is_visible() and "Oliver" in await page.inner_text(".home-greet") and await page.locator(".home-stat").count() == 4 and await page.locator(".dock .dock-item").count() >= 5)
        check("design D: ingen taskbar på pc – ikon-menuen klarer det", not await page.locator(".dock").is_visible())
        await page.click(".irail-item[data-id='learn']"); await page.wait_for_url("**/#/learn", timeout=8000); await page.wait_for_timeout(500)
        check("ikon-menu: går til Læring og markerer den", "#/learn" in page.url and await page.get_attribute(".irail-item[data-id='learn']", "aria-current") == "page", page.url)
        await page.click(".irail-item[data-id='home']"); await page.wait_for_selector(".home .home-hero")
        await page.screenshot(path=f"{OUT}/widgets-topbar.png")
        await page.click(".tb-more"); await page.click(".tw-customize"); await page.wait_for_selector(".tw-dialog")
        await page.screenshot(path=f"{OUT}/widgets-tilpas.png")
        await page.locator(".tw-row-head:has-text('Streak') .switch").click()
        await page.wait_for_timeout(150)
        check("widgets: streak kan slås fra", await page.locator(".top-widgets .tw-streak").count() == 0)
        await page.locator(".tw-row-head:has-text('Online') .switch").click(); await page.wait_for_timeout(100)
        await page.locator(".tw-row-head:has-text('Online') .switch").click(); await page.wait_for_timeout(100)
        await page.click(".tw-dialog .segmented button:has-text('Kun antal')"); await page.wait_for_timeout(150)
        check("widgets: online viser kun antal", await page.locator(".tw-online .tw-faces").count() == 0 and await page.locator(".tw-online .tw-dot").count() == 1)
        await page.click(".tw-dialog .segmented button:has-text('Knap og stemning')"); await page.wait_for_timeout(100)
        check("widgets: musik med titel", await page.locator(".top-actions .with-title .bgm-title").is_visible())
        await page.locator(".tw-card:has-text('Nøgletal') .switch").click(); await page.wait_for_timeout(150)
        await page.locator(".tw-card:has-text('Dine apps') .switch").click(); await page.wait_for_timeout(150)
        check("widgets: kort på Hjem kan slås til og fra", await page.locator(".home-stats").is_hidden() and await page.locator("[data-tour='home-apps']").is_visible())
        await page.click(".modal-actions button:has-text('Færdig')")
        await page.wait_for_timeout(900)
        pr = (await api(page, "GET", "/api/me/prefs"))["data"]["prefs"].get("widgets", {})
        check("widgets: valgene gemmes på profilen", pr.get("streak") is False and pr.get("onlineMode") == "count" and pr.get("musicMode") == "title" and pr.get("home", {}).get("stats") is False and pr.get("home", {}).get("apps") is True, pr)
        await page.reload(); await page.wait_for_selector(".home .home-hero")
        check("widgets: valgene huskes efter genindlæsning", await page.locator(".top-widgets .tw-streak").count() == 0 and await page.locator(".home-stats").is_hidden())
        await page.click(".tb-more"); await page.click(".tw-customize"); await page.click(".tw-reset"); await page.click(".modal-actions button:has-text('Færdig')")
        await page.wait_for_selector(".top-widgets .tw-streak")
        # the dock: choose how many apps it shows
        await page.click(".tb-more"); await page.click(".tw-customize"); await page.wait_for_selector(".tw-dock")
        n0 = await page.locator(".dock .dock-item").count()
        await page.locator(".tw-dock-item").first.locator("[aria-label^='Fjern']").click(); await page.wait_for_timeout(200)
        check("dock: en app kan fjernes", await page.locator(".dock .dock-item").count() == n0 - 1, (n0, await page.locator(".dock .dock-item").count()))
        await page.fill(".tw-dock-count input[type=range]", "3"); await page.dispatch_event(".tw-dock-count input[type=range]", "change"); await page.wait_for_timeout(200)
        check("dock: antallet af apps kan vælges", await page.locator(".dock .dock-item").count() == 3)
        await page.select_option(".tw-add", "linux"); await page.wait_for_timeout(200)
        check("dock: en app kan tilføjes", await page.locator(".dock .dock-item[data-id='linux']").count() == 1)
        await page.click(".tw-reset"); await page.click(".modal-actions button:has-text('Færdig')"); await page.wait_for_timeout(300)
        check("dock: nulstil giver standard-docken med Gnist", await page.locator(".dock .dock-item").count() == n0 and await page.locator(".dock .dock-item[data-id='gnist']").count() == 1)
        check("Hjem: dagens tip fra Gnist", "Tip fra Gnist" in await page.inner_text(".home-tip"))
        await page.click(".irail-item[data-id='gnist']"); await page.wait_for_selector(".gn-page .ai-panel.is-page")
        check("Gnist: egen app på fuld skærm", await page.locator(".gn-page .ai-panel.is-page").is_visible() and await page.locator(".ai-fab").is_hidden())
        check("Gnist: en tydelig Ny chat-knap og en liste med chats", await page.locator(".gn-side .gn-newchat").is_visible() and await page.locator(".ai-head .ai-new").count() == 1)
        await page.wait_for_timeout(700)   # let the page finish fading in
        await page.screenshot(path=f"{OUT}/gnist-app.png")
        await page.click(".irail-item[data-id='home']"); await page.wait_for_selector(".home .home-hero")
        check("Gnist: vinduet er tilbage som lille pop-up, når appen forlades", await page.locator("body > .ai-panel").count() == 1 and await page.locator(".ai-fab").is_visible())
        check("widgets: nulstil giver standardvalgene", await page.locator(".home-stats").is_visible() and await page.locator("[data-tour='home-apps']").is_hidden())
        await page.goto(BASE + "/#/apps/connect4"); await page.wait_for_selector(".c4-board"); await page.wait_for_timeout(500)
        hue = await page.evaluate("() => [getComputedStyle(document.querySelector('.c4-page')).getPropertyValue('--app').trim(), getComputedStyle(document.querySelector('.app-hero-icon')).getPropertyValue('--app').trim()]")
        check("nyt design i apps: siden bruger den røde tråd, ikonet sin egen farve", hue[0] in ("#f97316", "#c2410c", "#e8763a", "#c2581f") and hue[0] != hue[1], hue)
        await page.screenshot(path=f"{OUT}/design-i-app.png")
        await page.goto(BASE + "/#/apps/casino"); await page.wait_for_timeout(600)
        check("kasinoet er fjernet: gamle links går til Apps", page.url.endswith("#/apps") and await page.locator(".cs-table").count() == 0, page.url)

        # ── Linux-terminal: a real Linux in v86 – boot, type, save, come back ──
        await page.goto(BASE + "/#/learn/linux"); await page.wait_for_selector(".lx-term .xterm")
        await page.wait_for_selector(".lx-boot", state="hidden", timeout=150000)
        await page.wait_for_timeout(1200)
        await page.click(".lx-term")
        await page.keyboard.type("echo blåbærgrød > hej.txt && cat hej.txt && uname -s\n")
        await page.wait_for_timeout(2500)
        scr = await page.evaluate("document.querySelector('.lx-term .xterm-rows')?.innerText || ''")
        check("linux: en rigtig Linux starter og svarer (med æøå)", "blåbærgrød" in scr and "Linux" in scr, scr[-200:])
        await page.click(".lx-keys .lx-key:has-text('CTRL')")
        check("linux: CTRL i tasterækken er klæbrig", await page.get_attribute(".lx-keys .lx-key:has-text('CTRL')", "aria-pressed") == "true")
        await page.click(".lx-keys .lx-key:has-text('CTRL')")
        await page.screenshot(path=f"{OUT}/linux.png")
        await page.click(".lx-actions button:has-text('Gem maskinen')")
        for _ in range(120):
            if "gemt kl." in await page.inner_text(".lx-status"): break
            await page.wait_for_timeout(500)
        check("linux: maskinen kan gemmes", "gemt kl." in await page.inner_text(".lx-status"), await page.inner_text(".lx-status"))
        await page.goto(BASE + "/#/learn"); await page.wait_for_timeout(800)
        await page.goto(BASE + "/#/learn/linux"); await page.wait_for_selector(".lx-term .xterm")
        for _ in range(120):
            if "Kører" in await page.inner_text(".lx-status"): break
            await page.wait_for_timeout(250)
        await page.wait_for_timeout(1200); await page.click(".lx-term"); await page.keyboard.type("cat hej.txt\n"); await page.wait_for_timeout(1500)
        scr = await page.evaluate("document.querySelector('.lx-term .xterm-rows')?.innerText || ''")
        check("linux: filerne er der stadig næste gang", scr.count("blåbærgrød") >= 1 and "cat hej.txt" in scr, scr[-200:])

        # ── Elværkstedet (replaced CircuitPilot): old links redirect, simulator, calculations and fault finding save XP ──
        await page.goto(BASE + "/#/learn/circuitpilot"); await page.wait_for_selector(".el-page", timeout=10000)
        check("elværkstedet: gamle CircuitPilot-links sendes videre", "/learn/electro" in page.url, page.url)
        await page.goto(BASE + "/#/learn/electro/sim"); await page.wait_for_selector(".el-schematic")
        await page.select_option("select[aria-label='Modstand R1']", "0"); await page.wait_for_timeout(200)
        check("elværkstedet: LED uden formodstand brænder af", "Brændt af" in await page.inner_text(".lab-stats") and "formodstand" in await page.inner_text(".lab-result"))
        await page.select_option("select[aria-label='Modstand R1']", "330"); await page.wait_for_timeout(300)
        check("elværkstedet: med 330 Ω lyser LED’en", "Lyser" in await page.inner_text(".lab-stats"))
        await page.screenshot(path=f"{OUT}/app-electro-sim.png")
        await page.goto(BASE + "/#/learn/electro/calc"); await page.wait_for_selector(".el-q")
        await page.select_option("select[aria-label='Opgavetype']", "series"); await page.wait_for_timeout(200)
        import re as _re
        nums = [int(x) for x in _re.findall(r"(\d+) Ω", await page.inner_text(".el-q"))]
        await page.fill(".el-ans", str(sum(nums))); await page.press(".el-ans", "Enter"); await page.wait_for_selector(".lab-result.is-ok")
        check("elværkstedet: en rigtig udregning godkendes", "Rigtigt" in await page.inner_text(".lab-result"))
        await page.goto(BASE + "/#/learn/electro/faults"); await page.click(".lab-case[data-fault='lamp-wire']")
        await page.click(".lab-test >> nth=0"); await page.click(".lab-test >> nth=2"); await page.wait_for_selector(".lab-finding")
        await page.click(".lab-answer:has-text('Afbrydelse')"); await page.wait_for_selector(".lab-result.is-ok")
        await page.wait_for_timeout(900)
        el = (await api(page, "GET", "/api/state/electro"))["data"]["state"] or {}
        check("elværkstedet: XP, fejl og badges gemmes på kontoen", el.get("xp", 0) >= 25 + 15 + 60 and el.get("faults", {}).get("lamp-wire") == 60 and "first-circuit" in (el.get("achievements") or []), el)
        await page.screenshot(path=f"{OUT}/app-electro-fault.png")

        # ── projects ──
        await page.goto(BASE + "/#/projects")
        await page.wait_for_selector(".project-card", timeout=8000)
        names = await page.locator(".project-card h3").all_text_contents()
        check("real projects listed from Cursor storage", "webapp-platform" in names and "elektroniklab" in names, names)
        check("missing project flagged", await page.locator(".project-card.is-missing").count() >= 1)
        await page.fill(".pt-search input", "elektro")
        for _ in range(20):
            if await page.locator(".project-card").count() == 1:
                break
            await page.wait_for_timeout(100)
        check("project search filters", await page.locator(".project-card").count() == 1, await page.locator(".project-card h3").all_text_contents())
        await page.fill(".pt-search input", "")
        await page.wait_for_timeout(300)
        card = page.locator(".project-card", has_text="webapp-platform")
        await card.locator("button", has_text="Åbn i Cursor").click()
        await page.wait_for_timeout(900)
        if OPEN_LOG:
            log = open(OPEN_LOG).read() if os.path.exists(OPEN_LOG) else ""
            check("“Åbn i Cursor” launches the cursor CLI with the project path", "webapp-platform" in log, log)
        await card.click()
        await page.wait_for_selector(".project-detail")
        check("git branch shown on detail page", await page.locator(".project-detail .chip-info").count() >= 1)
        await page.locator(".segmented button", has_text="Aktiv").click()
        await page.fill(".tag-input", "nextjs")
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(700)
        pid = page.url.split("/")[-1]
        pd = await api(page, "GET", f"/api/projects/{pid}")
        meta = pd["data"]["project"]["meta"]
        check("project organisation saved (status + tags)", meta.get("status") == "active" and "nextjs" in meta.get("tags", []), meta)
        await page.screenshot(path=f"{OUT}/e2e_project_detail.png")

        # ── command palette → season ──
        await page.keyboard.press("Control+k")
        await page.wait_for_selector(".palette-input")
        await page.fill(".palette-input", "vinter")
        await page.wait_for_timeout(200)
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(1200)
        prefs = await api(page, "GET", "/api/me/prefs")
        check("palette command switches season and saves pref", prefs["data"]["prefs"]["world"]["season"] == "winter" and prefs["data"]["prefs"]["world"]["seasonMode"] == "manual", prefs["data"])
        await page.keyboard.press("Control+k")
        await page.fill(".palette-input", "xyzzyqq")
        await page.wait_for_timeout(200)
        check("palette: no match offers to create it instead", await page.locator(".palette-empty").count() == 0 and await page.locator(".palette-item:has-text('Ny opgave: xyzzyqq')").count() == 1)
        await page.fill(".palette-input", "qz")
        await page.wait_for_timeout(200)
        check("palette empty state", await page.locator(".palette-empty").count() == 1)
        await page.keyboard.press("Escape")

        # ── Alle apps: pin an app – it goes in the menu on the left ──
        await page.goto(BASE + "/#/apps")
        await page.wait_for_selector(".ab-page .ab-row")
        await page.click(".ab-page .ab-row:has(.ab-txt b:text-is('Kalaha')) .ab-pin"); await page.wait_for_timeout(700)
        prefs = (await api(page, "GET", "/api/me/prefs"))["data"]
        check("alle apps: fastgør gemmes og lægger appen i menuen", "kalaha" in ((prefs.get("prefs") or prefs).get("widgets") or {}).get("dock", []) and await page.locator(".irail .irail-item[data-id='kalaha']").count() == 1, prefs)
        await page.click(".ab-page .ab-row:has(.ab-txt b:text-is('Kalaha')) .ab-pin"); await page.wait_for_timeout(500)
        check("alle apps: og kan fjernes igen", await page.locator(".irail .irail-item[data-id='kalaha']").count() == 0)

        # ── new apps: Opgaver, Noter, Fokus, Værktøjskasse ──
        await page.goto(BASE + "/#/apps/tasks")
        await page.wait_for_selector(".kb-add-title input")
        await page.fill(".kb-add-title input", "Skriv rapport")
        await page.keyboard.press("Enter")
        await page.fill(".kb-add-title input", "Lodde print")
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(200)
        await page.locator(".kb-card", has_text="Lodde print").locator(".kb-next").click()  # todo -> doing
        await page.wait_for_timeout(200)
        await page.locator(".kb-card", has_text="Lodde print").locator(".kb-next").click()  # doing -> done
        await page.wait_for_timeout(900)
        st = (await api(page, "GET", "/api/state/tasks"))["data"]["state"]
        statuses = {t["title"]: t["status"] for t in (st or {}).get("tasks", [])}
        check("tasks: created and moved to done, saved on server", statuses == {"Skriv rapport": "todo", "Lodde print": "done"}, statuses)
        await page.reload()
        await page.wait_for_selector(".kb-card")
        check("tasks: board restored after reload", await page.locator(".kb-col").nth(2).locator(".kb-card").count() == 1)
        # reminder: a task whose reminder time has passed → toast + marked as reminded on the server
        import datetime as _dt
        _now = _dt.datetime.now()
        st["tasks"].insert(0, {"id": "rem1", "title": "Ring til kunden", "notes": "", "status": "todo", "prio": "high", "due": (_now + _dt.timedelta(minutes=5)).strftime("%Y-%m-%d"),
                               "dueTime": (_now + _dt.timedelta(minutes=5)).strftime("%H:%M"), "remind": "m15", "created": 1, "updated": 1})
        await api(page, "PUT", "/api/state/tasks", {"state": st})
        await page.reload()
        await page.wait_for_selector(".kb-card")
        for _ in range(40):
            if await page.locator(".toast:has-text('Påmindelse')").count():
                break
            await page.wait_for_timeout(250)
        check("tasks: reminder shown when it is due", await page.locator(".toast:has-text('Ring til kunden')").count() >= 1)
        await page.wait_for_timeout(4500)
        check("tasks: reminder shown only once", await page.locator(".toast:has-text('Ring til kunden')").count() == 1)
        await page.wait_for_timeout(1200)
        st2 = (await api(page, "GET", "/api/state/tasks"))["data"]["state"]
        card = page.locator(".kb-col").nth(0).locator(".kb-card").first
        await card.focus()
        await page.keyboard.press("Alt+ArrowRight")
        await page.wait_for_timeout(1200)
        st3 = (await api(page, "GET", "/api/state/tasks"))["data"]["state"]
        moved = [t for t in st3["tasks"] if t["status"] == "doing"]
        check("tasks: Alt+→ moves a card with the keyboard", len(moved) == 1 and await page.evaluate("document.activeElement?.classList.contains('kb-card')"), [t["title"] for t in moved])
        check("tasks: reminder marked as sent", any(t.get("id") == "rem1" and t.get("reminded") for t in st2["tasks"]))

        await page.goto(BASE + "/#/apps/notes")
        await page.wait_for_selector(".notes-page")
        await page.locator(".app-hero-btn", has_text="Ny note").click()
        await page.fill(".note-title", "Indkøb")
        await page.fill(".note-body", "Modstande 4k7\nLoddetin")
        await page.wait_for_timeout(1200)
        st = (await api(page, "GET", "/api/state/notes"))["data"]["state"]
        n = (st or {}).get("notes", [])
        check("notes: note autosaved on server", len(n) == 1 and n[0]["title"] == "Indkøb" and "4k7" in n[0]["body"], n)
        await page.reload()
        await page.wait_for_selector(".note-item")
        check("notes: note listed after reload", "Indkøb" in await page.inner_text(".note-list"))

        await page.goto(BASE + "/#/learn/toolkit")
        await page.wait_for_selector("#tk-ohm")
        await page.fill("#tk-ohm input[aria-label^='Spænding']", "12")
        await page.fill("#tk-ohm input[aria-label^='Strøm']", "20m")
        out = await page.inner_text("#tk-ohm .tk-out")
        check("toolkit: Ohm's law 12 V / 20 mA = 600 Ω", "600" in out and "Ω" in out, out)
        check("toolkit: colour code default 4,7 kΩ", "4,7 kΩ" in await page.inner_text("#tk-color .tk-out"))

        await page.goto(BASE + "/#/apps/focus")
        await page.wait_for_selector(".fx-main")
        await page.click(".fx-panel .segmented button:has-text('Fokus')")
        await page.click(".fx-main")
        await page.wait_for_timeout(1300)
        t1 = await page.inner_text(".fx-time")
        check("focus: timer counts down", t1 != "25:00" and t1.startswith("24:"), t1)
        await page.click(".fx-main")  # pause
        await page.click("button:has-text('Nulstil')")
        check("focus: reset back to 25:00", await page.inner_text(".fx-time") == "25:00")

        # ── HUBTECH Office ──
        await page.goto(BASE + "/#/apps/hubtech")
        await page.wait_for_selector(".ofh-tpl")
        await page.locator(".ofh-tpl", has_text="Tomt dokument").click()
        await page.wait_for_selector(".doc-page")
        await page.click(".doc-page")
        await page.keyboard.type("Rapport om printeren")
        await page.keyboard.press("Control+a")
        await page.locator(".ofx-tools button[aria-label^='Fed']").click()
        await page.wait_for_timeout(1500)
        doc_id = page.url.split("/")[-1]
        d = (await api(page, "GET", f"/api/office/docs/{doc_id}"))["data"]["doc"]
        check("office: document autosaved with formatting", "Rapport om printeren" in d["data"]["html"] and ("<b>" in d["data"]["html"] or "font-weight" in d["data"]["html"]), d["data"]["html"][:120])
        # another device edits the file while it is open here → banner, nothing overwritten silently
        await page.wait_for_timeout(1100)
        await api(page, "PUT", f"/api/office/docs/{doc_id}", {"data": {"html": "<p>Fra telefonen</p>"}})
        await page.click(".doc-page"); await page.keyboard.press("End"); await page.keyboard.type(" mere")
        await page.wait_for_selector(".ofx-banner:not([hidden])", timeout=8000)
        check("office: conflict banner shown", "anden enhed" in await page.inner_text(".ofx-banner"))
        check("påmindelse: ikke vist igen senere", await page.locator(".toast:has-text('Ring til kunden')").count() == 0)
        d = (await api(page, "GET", f"/api/office/docs/{doc_id}"))["data"]["doc"]
        check("office: other device's version kept until you choose", "Fra telefonen" in d["data"]["html"])
        await page.screenshot(path=f"{OUT}/office-conflict.png")
        await page.click(".ofx-banner button:has-text('Behold min version')")
        await page.wait_for_timeout(800)
        d = (await api(page, "GET", f"/api/office/docs/{doc_id}"))["data"]["doc"]
        check("office: 'Behold min version' saves mine", "mere" in d["data"]["html"], d["data"]["html"][:80])
        # unsaved draft from last time (closed with no connection) → offered on open
        await page.evaluate("""(id) => localStorage.setItem('hubtech.draft.' + id, JSON.stringify({ at: Date.now() + 60000, payload: { data: { html: '<p>Gemt lokalt</p>' } } }))""", doc_id)
        await page.reload(); await page.wait_for_selector(".ofx-banner:not([hidden])", timeout=8000)
        check("office: unsaved draft offered on open", "ikke blev gemt" in await page.inner_text(".ofx-banner"))
        await page.screenshot(path=f"{OUT}/office-draft.png")
        await page.click(".ofx-banner button:has-text('Gendan')")
        await page.wait_for_timeout(1500)
        d = (await api(page, "GET", f"/api/office/docs/{doc_id}"))["data"]["doc"]
        check("office: draft restored to the account", "Gemt lokalt" in d["data"]["html"])
        await page.goto(BASE + "/#/apps/hubtech")
        await page.wait_for_selector(".ofh-tpl")
        await page.locator(".ofh-tpl", has_text="Tomt regneark").click()
        await page.wait_for_selector(".sh-grid td")
        await page.click("td[data-c='0'][data-r='0']")
        for v in ["12", "30,5", "=SUM(A1:A2)*2"]:
            await page.keyboard.type(v)
            await page.keyboard.press("Enter")
        a3 = await page.inner_text("td[data-c='0'][data-r='2']")
        check("office: spreadsheet formula =SUM(A1:A2)*2 gives 85", a3 == "85", a3)
        await page.wait_for_timeout(1500)
        sid = page.url.split("/")[-1]
        sd = (await api(page, "GET", f"/api/office/docs/{sid}"))["data"]["doc"]
        check("office: spreadsheet saved on server", sd["data"]["sheets"][0]["cells"].get("A3", {}).get("v") == "=SUM(A1:A2)*2")
        await page.goto(BASE + "/#/apps/hubtech")
        await page.wait_for_selector(".ofh-tpl")
        await page.locator(".ofh-tpl", has_text="Tom præsentation").click()
        await page.wait_for_selector(".sl-stage .sld")
        await page.locator(".ofx-addslide").click()
        await page.locator(".ofx-menu button", has_text="Titel og indhold").click()
        await page.wait_for_timeout(200)
        await page.click(".sl-stage .sld-title")
        await page.keyboard.type("Dagsorden")
        await page.wait_for_timeout(1500)
        check("office: presentation has 2 slides", await page.locator(".sl-thumb").count() == 2)
        await page.click(".ofx-present")
        await page.wait_for_selector(".sl-present")
        await page.keyboard.press("ArrowRight")
        check("office: presenter mode navigates", (await page.inner_text(".sl-pcount")).startswith("2"))
        await page.keyboard.press("Escape")
        await page.goto(BASE + "/#/apps/hubtech")
        await page.wait_for_selector(".ofh-file")
        check("office: home lists the 3 new files", await page.locator(".ofh-file").count() >= 3)

        # ── office extras: charts, conditional formatting, search, history ──
        sheet = {"sheets": [{"name": "Ark1", "rows": 30, "cols": 8, "colW": {}, "cells": {"A1": {"v": "Måned"}, "B1": {"v": "Salg"}, "A2": {"v": "Jan"}, "B2": {"v": "10"}, "A3": {"v": "Feb"}, "B3": {"v": "-4"}, "C1": {"v": "=LOPSLAG(\"Feb\";A2:B3;2;FALSK)"}, "D1": {"v": "=DATO(2026;10;20)"}},
                             "cond": [{"range": "B2:B3", "type": "neg", "color": "red"}]}], "active": 0}
        r = await api(page, "POST", "/api/office/docs", {"kind": "sheet", "title": "Salgstal kvartal", "data": sheet})
        sid = r["data"]["doc"]["id"]
        await page.goto(BASE + f"/#/apps/hubtech/sheet/{sid}")
        await page.wait_for_selector(".sh-grid td")
        await page.wait_for_timeout(300)
        cells = await page.evaluate("[...document.querySelectorAll('.sh-grid tbody tr')][0].querySelectorAll('td')[2].textContent + '|' + [...document.querySelectorAll('.sh-grid tbody tr')][0].querySelectorAll('td')[3].textContent")
        check("sheet: Danish LOPSLAG + DATO shown as date", cells == "-4|20-10-2026", cells)
        neg_bg = await page.evaluate("getComputedStyle([...document.querySelectorAll('.sh-grid tbody tr')][2].querySelectorAll('td')[1]).backgroundColor")
        check("sheet: conditional formatting colours negative numbers", neg_bg == "rgb(255, 215, 213)", neg_bg)
        await page.click(".sh-grid tbody tr:nth-child(1) td:nth-child(2)")
        await page.click("button[title='Indsæt diagram']")
        await page.wait_for_selector(".modal .cf-form")
        await page.click(".modal .btn-primary")
        await page.wait_for_selector(".ch-card svg", timeout=5000)
        check("sheet: chart inserted from the toolbar", await page.locator(".ch-card .ch-bar").count() == 2)
        await page.click("button[title='Frys rækker/kolonner']")
        await page.click(".ofx-menu >> text=Frys øverste række")
        await page.wait_for_timeout(200)
        check("sheet: freeze top row", await page.evaluate("getComputedStyle(document.querySelector('.sh-grid tbody td')).position") == "sticky")
        await page.wait_for_timeout(1200)
        await page.keyboard.press("Control+k")
        await page.fill(".palette-input", "Salgstal")
        await page.wait_for_selector(".palette-group:has-text('Office-filer')", timeout=4000)
        check("search: Ctrl+K finds Office files", await page.locator(".palette-item:has-text('Salgstal kvartal')").count() >= 1)
        await page.keyboard.press("Escape")
        await page.click("button[title='Flere handlinger']")
        await page.click(".ofx-menu >> text=Versionshistorik")
        await page.wait_for_selector(".vh-body")
        check("office: version history dialog opens", await page.locator(".vh-item.is-current").count() == 1)
        await page.keyboard.press("Escape")

        # clean up, so the Kunder test below starts from nothing
        await page.evaluate("""() => Promise.all(['customers', 'svc-log', 'svc-drv'].map(k => fetch('/api/state/' + k, { method: 'PUT', headers: { 'X-Requested-With': 'hubtech', 'Content-Type': 'application/json' }, body: JSON.stringify({ state: k === 'customers' ? { customers: [], invoices: [], company: {}, nextNo: 1 } : { v: '[]' } }) })))""")

        # ── installable desktop app ──
        await page.goto(BASE + "/?source=app#/settings/about")
        await page.wait_for_selector(".desk-panel .desk-status")
        check("app window mode detected (?source=app)", await page.evaluate("document.documentElement.classList.contains('is-app')"))
        check("settings → Om offers 'Luk HUBTECH' to the owner on this computer", await page.locator("text=Luk HUBTECH").count() >= 1)
        sw = await page.evaluate("navigator.serviceWorker.getRegistration('/').then(r => !!r).catch(() => false)")
        if not sw:
            await page.wait_for_timeout(1500)
            sw = await page.evaluate("navigator.serviceWorker.getRegistration('/').then(r => !!r).catch(() => false)")
        check("service worker registered (installable)", sw)
        check("?source=app removed from the address", "source=app" not in page.url, page.url)

        # ── data & backups ──
        await page.goto(BASE + "/#/settings/data")
        await page.wait_for_selector(".bk-list")
        await page.wait_for_timeout(400)
        before = await page.locator(".bk-row").count()
        await page.click("text=Lav sikkerhedskopi nu")
        for _ in range(25):
            if await page.locator(".bk-row").count() > before:
                break
            await page.wait_for_timeout(200)
        check("settings: backup can be made from the page", await page.locator(".bk-row").count() > before, before)
        exp = await api(page, "GET", "/api/me/export")
        check("settings: personal export contains office files", exp["status"] == 200 and len(exp["data"]["office"]) >= 3, exp["status"])
        b64 = await page.evaluate("""async () => { const m = await import('/js/office/docx.js'); const b = await m.htmlToDocx('<h1>Hej</h1><p>Test</p>', 'T'); return b.size; }""")
        check("office: real .docx can be generated", b64 > 1000, b64)

        # ── logout / login persists ──
        await page.click(".user-chip")
        await page.click(".menu [role=menuitem]:has-text('Log ud')")
        await page.wait_for_selector(".landing-title")
        r = await api(page, "GET", "/api/me")
        check("logout ends session", r["status"] == 401)
        await page.goto(BASE + "/#/dashboard")
        await page.wait_for_selector("#login-user")
        check("protected route redirects to login", "next=" in page.url)
        await page.fill("#login-user", "oliver")
        await page.fill("#login-pass", "forkert-kode")
        await page.click("button[type=submit]")
        await page.wait_for_timeout(500)
        check("wrong password shows error", "Forkert" in (await page.text_content(".auth-card .callout.bad") or ""))
        await page.fill("#login-pass", "Sommer2026x!")
        await page.click("button[type=submit]")
        await page.wait_for_selector(".progress-panel", timeout=8000)
        check("login returns to requested page", "/dashboard" in page.url)
        summ = await api(page, "GET", "/api/me/summary")
        check("progress persists across sessions", summ["data"]["xp"] >= 145, summ["data"])
        await page.wait_for_timeout(800)
        await page.screenshot(path=f"{OUT}/e2e_dashboard.png")

        # ── permissions: owner creates a member, member cannot see projects ──
        r = await api(page, "POST", "/api/users", {"username": "maja", "displayName": "Maja", "password": "Vinter2026xx"})
        check("owner can create users", r["status"] == 201, r)
        ctx2 = await browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        m = await ctx2.new_page()
        m.on("pageerror", lambda e: errors.append("mobile: " + str(e)))
        await m.goto(BASE + "/#/login")
        await m.wait_for_selector("#login-user")
        await m.fill("#login-user", "maja")
        await m.fill("#login-pass", "Vinter2026xx")
        await m.click("button[type=submit]")
        await m.wait_for_selector(".home-title", timeout=8000)
        r = await api(m, "GET", "/api/projects")
        check("member gets 403 for local projects", r["status"] == 403)
        r = await api(m, "PUT", "/api/integrations/cursor", {"roots": ["/"]})
        check("member cannot change integrations", r["status"] == 403)
        try:
            await m.wait_for_selector(".tour-card", timeout=4000)
        except Exception:
            pass
        if await m.locator(".tour-card").count():
            await m.locator(".tour-card .btn-ghost", has_text="Spring over").click()
            await m.wait_for_timeout(400)
        await m.screenshot(path=f"{OUT}/e2e_mobile_home.png", full_page=False)
        sb = await m.locator(".search-trigger").bounding_box()
        check("mobil: søgning er en rund knap med ikon", sb and sb["width"] >= 32 and abs(sb["width"] - sb["height"]) <= 4, sb)
        vis = await m.evaluate("() => [...document.querySelectorAll('.dock .dock-item')].filter(e => e.getClientRects().length).map(e => e.dataset.id)")
        check("mobil: docken viser højst 6 apps, altid med Alle apps", 2 <= len(vis) <= 6 and "apps" in vis, vis)

        await m.click(".menu-btn")
        await m.wait_for_timeout(400)
        await m.screenshot(path=f"{OUT}/e2e_mobile_nav.png")
        await m.goto(BASE + "/#/learn/course/servicetekniker/day/2")
        await m.wait_for_selector(".day-card")
        await m.wait_for_timeout(600)
        await m.screenshot(path=f"{OUT}/e2e_mobile_course.png")
        overflow = await m.evaluate("document.documentElement.scrollWidth - innerWidth")
        check("no horizontal overflow on mobile", overflow <= 1, overflow)

        # ── session expiry is handled gracefully ──
        await m.evaluate("document.cookie")  # no-op (HttpOnly cookie not readable – by design)
        await ctx2.clear_cookies()
        await m.goto(BASE + "/#/dashboard")
        await m.wait_for_timeout(1500)
        check("expired/missing session → login", "#/login" in m.url)

        # ── light theme ──
        await page.evaluate("document.documentElement.dataset.theme='light'")
        await page.goto(BASE + "/#/")
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/e2e_light.png")
        check("Hjem: Gnist giver en kort brief, når der er noget i dag", "Gnist i dag:" in await page.inner_text(".home-tip"), await page.inner_text(".home-tip"))

        # 4xx resource logs come from the deliberate negative tests above (weak password, wrong login, logout check)
        real = [e for e in errors if not e.startswith("Failed to load resource: the server responded with a status of 4")]
        check("no uncaught JS errors", not real, real[:5])

        # ── new apps: Kalender, Lager, Tidsregistrering, Kodestumper ──
        await page.goto(BASE + "/#/apps/calendar")
        await page.wait_for_selector(".cal-grid .cal-cell")
        await page.click(".app-hero-btn:has-text('Ny aftale')")
        await page.fill(".modal input[aria-label='Titel']", "Service hos Jensen")
        check("påmindelser: en ny aftale får standard-påmindelsen (15 min før)", await page.locator(".modal .rm-row").count() == 1 and await page.input_value(".modal .rm-row input[aria-label='Hvor længe før']") == "15")
        await page.click(".modal .rm-quick:has-text('Dagen før')")
        await page.click(".modal .btn-primary")
        await page.wait_for_selector(".cal-item:has-text('Service hos Jensen')")
        check("påmindelser: vises ved aftalen", "15 min før" in await page.inner_text(".cal-item:has-text('Service hos Jensen')"))
        cal = (await api(page, "GET", "/api/state/calendar"))["data"]["state"] or {}
        await page.wait_for_timeout(700)
        cal = (await api(page, "GET", "/api/state/calendar"))["data"]["state"] or {}
        check("kalender: aftale oprettet og gemt", any(e["title"] == "Service hos Jensen" for e in cal.get("events", [])))
        ev0 = next((e for e in cal.get("events", []) if e["title"] == "Service hos Jensen"), {})
        check("påmindelser: flere pr. aftale, med klokkeslæt", [(r.get("n"), r.get("unit"), r.get("time")) for r in ev0.get("reminders", [])] == [(15, "min", None), (1, "day", "09:00")], ev0.get("reminders"))
        await page.click(".app-hero-actions button:has-text('Påmindelser')"); await page.wait_for_selector(".modal .rm-dialog")
        await page.check(".modal .rm-check:has-text('Stille tid hver dag') input"); await page.check(".modal .rm-check:has-text('Lyd') input")
        await page.click(".modal .btn-primary:has-text('Gem')"); await page.wait_for_timeout(900)
        rs = ((await api(page, "GET", "/api/state/calendar"))["data"]["state"] or {}).get("remindSettings") or {}
        check("påmindelser: stille tid og lyd gemmes", rs.get("quiet", {}).get("on") is True and rs.get("how", {}).get("sound") is True and rs.get("quiet", {}).get("from") == "22:00", rs)
        hol = await page.evaluate("import('/js/pages/calendar.js').then(m => [m.holidays(2026).get('2026-04-05'), m.holidays(2026).get('2026-05-14')])")
        check("kalender: danske helligdage (påske, Kr. himmelfart)", hol == ["Påskedag", "Kristi himmelfartsdag"], hol)
        ics = await page.evaluate("import('/js/pages/calendar.js').then(m => m.fromIcs(m.toIcs([{id:'x',title:'Møde; vigtigt',date:'2026-11-02',start:'10:00',end:'11:30',location:'Kontor, 2. sal',notes:'a\\nb'}])))")
        check("kalender: .ics ud og ind igen", ics and ics[0]["title"] == "Møde; vigtigt" and ics[0]["start"] == "10:00" and ics[0]["location"] == "Kontor, 2. sal", ics)

        await page.goto(BASE + "/#/apps/inventory")
        await page.wait_for_selector(".inv-table tbody tr")
        before = await page.locator(".inv-qty").first.text_content()
        await page.locator(".inv-stepper button[aria-label^='Læg 1 til']").first.click()
        check("lager: + lægger én til", int(await page.locator(".inv-qty").first.text_content()) == int(before) + 1)
        await page.click(".app-hero-ghost:has-text('Indkøbsliste')")
        await page.wait_for_selector(".inv-shop")
        check("lager: indkøbsliste over varer under minimum", "ESP32" in (await page.text_content(".inv-shop")))
        await page.keyboard.press("Escape")

        await page.goto(BASE + "/#/apps/timesheet")
        await page.wait_for_selector(".ts-start")
        await page.fill(".ts-fields input >> nth=0", "Test-opgave")
        await page.click(".ts-start")
        for _ in range(30):
            if (await page.text_content(".ts-clock")) != "0:00:00":
                break
            await page.wait_for_timeout(150)
        check("tid: uret kører", (await page.text_content(".ts-clock")) != "0:00:00" and await page.locator(".ts-start.is-running").count() == 1, await page.text_content(".ts-clock"))
        await page.evaluate("""async () => { const r = await fetch('/api/state/timesheet'); const s = (await r.json()).state; s.running.start -= 3600e3;
            await fetch('/api/state/timesheet', {method:'PUT', headers:{'X-Requested-With':'hubtech','Content-Type':'application/json'}, body: JSON.stringify({state: s})}); }""")
        await page.reload()
        await page.wait_for_selector(".ts-start.is-running")
        await page.click(".ts-start")
        await page.wait_for_selector(".ts-entry:has-text('Test-opgave')")
        check("tid: stop gemmer en registrering på ca. 1 time", "1:00" in (await page.locator(".ts-entry:has-text('Test-opgave') .ts-dur").text_content()))

        await page.goto(BASE + "/#/apps/snippets")
        await page.wait_for_selector(".sn-item")
        await page.click(".app-hero-btn:has-text('Ny kodestump')")
        await page.fill(".sn-title", "Docker ps")
        await page.fill(".sn-code", "docker ps -a  # alle containere")
        await page.wait_for_timeout(900)
        hl = await page.inner_html(".sn-hl")
        check("kodestumper: gemmes og farves", "hl-c" in hl and "hl-k" in hl, hl[:120])

        # ── Kodeskolen: real Python (Pyodide), JavaScript worker, HTML checks, text answers ──
        async def cs_lesson(path, title):
            await page.goto(BASE + "/#/learn/codeschool/" + path)
            for _ in range(80):
                if await page.evaluate("t => document.querySelector('.cs-title')?.textContent === t && !!document.querySelector('.cs-work')", title):
                    break
                await page.wait_for_timeout(100)
        async def cs_type(code):
            await page.evaluate("c => { const t = document.querySelector('.cs-work .sn-code'); t.value = c; t.dispatchEvent(new Event('input')); }", code)
        async def cs_banner():
            await page.wait_for_selector(".cs-banner", timeout=40000)
            return await page.get_attribute(".cs-banner", "class") or ""
        await page.goto(BASE + "/#/learn/codeschool")
        await page.wait_for_selector(".cs-course")
        check("kodeskolen: 8 kurser vises", await page.locator(".cs-course").count() == 8)
        await cs_lesson("python/py1", "Dit første program")
        await cs_type('print("forkert")')
        await page.click("text=Tjek opgaven")
        check("kodeskolen: forkert Python-svar afvises", "is-bad" in await cs_banner())
        sol = await page.evaluate("async () => (await import('/js/data/code-courses.js')).courseById('python').lessons[0].task.solution")
        await cs_type(sol)
        await page.click("text=Tjek opgaven")
        await page.wait_for_selector(".cs-banner.is-ok", timeout=40000)
        check("kodeskolen: Python kører i browseren og rigtig løsning godkendes", True)
        await cs_type("while True:\n    pass\n")
        await page.click(".cs-work button:has-text('Kør')")
        stopped = False
        for _ in range(100):
            if "Stoppet efter" in (await page.text_content(".cs-out") or ""):
                stopped = True
                break
            await page.wait_for_timeout(200)
        check("kodeskolen: uendelig løkke stoppes", stopped)
        await cs_lesson("javascript/js1", "console.log og variabler")
        sol = await page.evaluate("async () => (await import('/js/data/code-courses.js')).courseById('javascript').lessons[0].task.solution")
        await cs_type(sol)
        await page.click("text=Tjek opgaven")
        check("kodeskolen: JavaScript-opgave godkendes", "is-ok" in await cs_banner())
        await cs_lesson("web/web2", "CSS: farver og skrift")
        await page.click("text=Tjek opgaven")
        b1 = await cs_banner()
        sol = await page.evaluate("async () => (await import('/js/data/code-courses.js')).courseById('web').lessons[1].task.solution")
        await cs_type(sol)
        await page.click("text=Tjek opgaven")
        await page.wait_for_selector(".cs-banner.is-ok", timeout=10000)
        check("kodeskolen: HTML/CSS tjekkes på den viste side", "is-bad" in b1)
        await cs_lesson("git/git1", "Terminalens grundkommandoer")
        sol = await page.evaluate("async () => (await import('/js/data/code-courses.js')).courseById('git').lessons[0].task.solution")
        await page.fill(".cs-answer", sol)
        await page.click("text=Tjek opgaven")
        check("kodeskolen: terminal-svar godkendes", "is-ok" in await cs_banner())
        await page.locator(".cs-opt").first.click()
        summ = (await api(page, "GET", "/api/me/summary"))["data"]
        check("kodeskolen: XP tæller med i profilen", summ["breakdown"].get("codeschool", 0) >= 80, summ["breakdown"])

        await cs_lesson("sql/sql2", "WHERE og ORDER BY")
        await cs_type("SELECT titel, dato FROM opgaver WHERE status = 'åben' ORDER BY dato DESC;")
        await page.click("text=Tjek opgaven")
        b_sql = await cs_banner()
        txt_sql = await page.text_content(".cs-banner")
        await cs_type("SELECT titel, dato FROM opgaver WHERE status = 'åben' ORDER BY dato;")
        await page.click("text=Tjek opgaven")
        await page.wait_for_selector(".cs-banner.is-ok", timeout=15000)
        check("kodeskolen: SQL kører i SQLite og forkert rækkefølge forklares", "is-bad" in b_sql and "ORDER BY" in txt_sql, txt_sql)

        # ── Huskekort: starter decks, keyboard study session, scheduling, XP ──
        await page.goto(BASE + "/#/learn/flashcards")
        await page.wait_for_selector(".fc-deck")
        check("huskekort: startsæt oprettes", await page.locator(".fc-deck").count() == 2)
        await page.click(".fc-deck >> nth=1 >> .app-solid")
        await page.wait_for_selector(".fc-flash")
        await page.keyboard.press("Space")
        await page.wait_for_selector(".fc-grade")
        await page.keyboard.press("1")
        for _ in range(40):
            if await page.locator(".fc-done").count():
                break
            await page.keyboard.press("Space")
            await page.wait_for_timeout(50)
            await page.keyboard.press("3")
            await page.wait_for_timeout(50)
        await page.wait_for_selector(".fc-done")
        await page.wait_for_timeout(900)
        fst = (await api(page, "GET", "/api/state/flashcards"))["data"]["state"]
        net = fst["decks"][1]["id"]
        ivls = {c["ivl"] for c in fst["cards"] if c["deck"] == net}
        check("huskekort: gennemgang med tastatur planlægger kortene", ivls == {1} and fst["reviews"] == 9, (ivls, fst["reviews"]))
        await page.goto(BASE + "/#/learn/flashcards")
        await page.click("text=Hent quizspørgsmål")
        await page.wait_for_selector(".fc-card")
        check("huskekort: kort hentes fra Kodeskolen", "quizzer" in (await page.text_content(".app-hero")))
        summ = (await api(page, "GET", "/api/me/summary"))["data"]
        check("huskekort: XP tæller med", summ["breakdown"].get("flashcards") == 18, summ["breakdown"])

        # ── all learning lives in Guides & Læring ──
        await page.goto(BASE + "/#/apps/codeschool/python/py1")
        await page.wait_for_selector(".cs-title")
        await page.wait_for_timeout(200)
        check("læring: gamle /apps-links sendes videre til Guides & Læring", "#/learn/codeschool/python/py1" in page.url and (await page.text_content(".lnb-name")).strip() == "Kodeskolen" and "Kodeskolen" in await page.inner_text(".tb-crumb"), page.url)
        await page.goto(BASE + "/#/learn")
        await page.wait_for_selector(".learn-app")
        tiles = await page.locator(".learn-app h3").all_text_contents()
        await page.goto(BASE + "/#/apps")
        await page.wait_for_selector(".ab-page .ab-row")
        learn = await page.locator("#ab-page-learn .ab-txt b").all_text_contents()
        names = await page.locator(".ab-page .ab-group:not(#ab-page-learn) .ab-txt b").all_text_contents()
        side = await page.locator(".nav-item").all_text_contents()
        check("læring: læringsapps samlet på læringssiden og under Lær og øv i Alle apps – ikke i menuen",
              tiles == ["Øvelseslab", "Linux-terminal", "Kode-editor", "Kodeskolen", "Kodestumper", "Huskekort", "Quiz", "Phishing-træner", "IT-ordbog", "Tastaturtræner", "Bit-spil", "Elværkstedet", "Værktøjskasse"] and set(tiles) <= set(learn) and not set(tiles) & set(names) and not set(tiles) & {x.strip() for x in side}, (tiles, learn, names))

        # ── Kode-editor: a real editor (CodeMirror), files, run, errors on the line ──
        await page.goto(BASE + "/#/learn/codepad"); await page.wait_for_selector(".kx-cm .cm-editor", timeout=20000)
        check("kode-editor: CodeMirror med linjenumre og farver", await page.locator(".kx-cm .cm-lineNumbers").count() == 1 and await page.locator(".kx-cm .tok-keyword").count() > 0)
        check("kode-editor: filer i en liste og som faner", await page.locator(".kx-file").count() >= 5 and await page.locator(".kx-tab").count() >= 1)
        await page.click(".kx-files button[aria-label='Ny fil']"); await page.fill(".modal input[aria-label='Filnavn']", "fejl.py"); await page.press(".modal input[aria-label='Filnavn']", "Enter")
        await page.wait_for_selector(".kx-tab.is-on:has-text('fejl.py')")
        await page.click(".kx-cm .cm-content"); await page.keyboard.press("Control+a"); await page.keyboard.press("Delete")
        await page.keyboard.type("x = 1\nprint('hej')\ny = x / 0\n")
        await page.keyboard.press("Control+Enter")
        await page.wait_for_selector(".kx-out.is-error", timeout=60000)
        out = await page.inner_text(".kx-out")
        check("kode-editor: Python kører, og fejlen forklares", "hej" in out and "ZeroDivisionError" in out, out[:200])
        await page.wait_for_selector(".kx-cm .cm-lintRange-error", timeout=5000)
        check("kode-editor: fejlen markeres på linje 3", True)
        await page.keyboard.press("Control+f"); await page.wait_for_selector(".kx-cm .cm-search", timeout=5000)
        check("kode-editor: søg og erstat med Ctrl+F", True)
        await page.keyboard.press("Escape")
        await page.screenshot(path=f"{OUT}/codepad-editor.png")
        await page.wait_for_timeout(900)
        cp = (await api(page, "GET", "/api/state/codepad"))["data"]["state"]
        check("kode-editor: filen er gemt på kontoen", any(f["name"] == "fejl.py" and "x / 0" in f["text"] for f in cp.get("docs", [])))
        # ── Notesbog in Office: click to write, a to-do, a drawing, search and all to-dos ──
        await page.goto(BASE + "/#/apps/notebook"); await page.wait_for_selector(".nb-canvas .nb-block")
        check("notesbog: en fane i Office", await page.locator(".part-tabs .learn-tab.is-on:has-text('Notesbog')").count() == 1 and "HUBTECH Office" in await page.inner_text(".tb-crumb"))
        await page.click(".nb-list-h button:has-text('Side')"); await page.wait_for_selector(".nb-title")
        await page.fill(".nb-title", "Netværk i nyt lokale")
        box = await page.locator(".nb-canvas").bounding_box()
        await page.mouse.click(box["x"] + 60, box["y"] + 60); await page.wait_for_selector(".nb-text-ed:focus")
        await page.keyboard.type("Switch i skabet ved døren")
        await page.click(".nb-bar .nb-tool:has-text('Tjekliste')"); await page.wait_for_selector(".nb-todo-t:focus")
        await page.keyboard.type("Mål Wi-Fi"); await page.keyboard.press("Enter"); await page.keyboard.type("Bestil access point")
        await page.click(".nb-bar .nb-tool:has-text('Tegn')")
        await page.mouse.move(box["x"] + 420, box["y"] + 320); await page.mouse.down(); await page.mouse.move(box["x"] + 520, box["y"] + 360, steps=8); await page.mouse.move(box["x"] + 600, box["y"] + 300, steps=8); await page.mouse.up()
        await page.wait_for_timeout(900)
        nbst = (await api(page, "GET", "/api/state/notebook"))["data"]["state"]
        pg = next((x for b in nbst["books"] for s2 in b["sections"] for x in s2["pages"] if x.get("title") == "Netværk i nyt lokale"), None)
        check("notesbog: tekst, to-do og tegning gemmes på kontoen", pg and any("Switch" in (b2.get("html") or "") for b2 in pg["blocks"]) and any(b2["kind"] == "todo" and [i["text"] for i in b2["items"]] == ["Mål Wi-Fi", "Bestil access point"] for b2 in pg["blocks"]) and len(pg["ink"]) == 1, pg)
        await page.screenshot(path=f"{OUT}/notesbog.png")
        await page.fill(".nb-search-in", "access point"); await page.wait_for_selector(".nb-pg.is-hit")
        check("notesbog: søgning finder siden", "Netværk i nyt lokale" in await page.inner_text(".nb-list"))
        await page.fill(".nb-search-in", ""); await page.click(".nb-todos-btn"); await page.wait_for_selector(".nb-todo-all li")
        check("notesbog: alle åbne punkter samlet", "Bestil access point" in await page.inner_text(".nb-todo-all"))
        await page.goto(BASE + "/#/apps/notebook"); await page.wait_for_selector("button[aria-label='Mere om siden']", timeout=20000)
        await page.click("button[aria-label='Mere om siden']"); await page.wait_for_selector(".nb-menu")
        async with page.expect_download() as nbdl:
            await page.click(".nb-menu button:has-text('Hent som .md')")
        nbd = await nbdl.value
        md = open(await nbd.path(), encoding="utf-8").read()
        check("notesbog: siden hentes som markdown med tekst og tjekliste",
              "Netværk i nyt lokale" in md and "Switch i skabet ved døren" in md and "Bestil access point" in md
              and nbd.suggested_filename.endswith(".md"), (nbd.suggested_filename, md[:200]))
        await page.goto(BASE + "/#/learn/codepad"); await page.wait_for_selector(".kx-cm .cm-editor", timeout=20000)
        # the editor fills the screen: the files fold away, Gnist only when you want her
        h0 = await page.evaluate("document.querySelector('.kx-cm').getBoundingClientRect().height")
        await page.click(".kx-fold[aria-label='Vis filer']"); await page.wait_for_timeout(200)
        w1 = await page.evaluate("document.querySelector('.kx-center').getBoundingClientRect().width")
        check("kode-editor: fylder skærmen, og filerne kan foldes væk", h0 > 400 and await page.locator(".kx-files").is_hidden() and w1 > 1150 and await page.locator(".kx-teach").is_hidden(), (h0, w1))
        await page.click(".kx-fold[aria-label='Vis filer']")
        # Lær og øv: the top bar picks between the learning apps (no row of 14 tabs)
        await page.click(".tb-crumb-btn"); await page.wait_for_selector(".lnb-pop")
        check("lær og øv: vælgeren i topbaren viser læringsapps i grupper", await page.locator(".lnb-pop .lnb-item").count() == 13 and await page.locator(".lnb-pop .lnb-item.is-on:has-text('Kode-editor')").count() == 1 and await page.locator(".page > .lnb").is_hidden())
        await page.screenshot(path=f"{OUT}/laering-vaelger.png")
        await page.click(".lnb-pop .lnb-item:has-text('Quiz')"); await page.wait_for_url("**/learn/quiz", timeout=6000)
        await page.wait_for_selector(".lnb-pop", state="detached", timeout=6000)   # the picker's own text also says "Quiz": wait until it is gone
        await page.wait_for_selector(".tb-crumb:has-text('Quiz')", timeout=6000)
        check("lær og øv: et klik skifter app og lukker vælgeren", await page.locator(".lnb-pop").count() == 0 and "Quiz" in await page.inner_text(".tb-crumb"))
        # Arbejdstilstand: warmer light, softer contrast and fewer distractions – saved with the profile
        await page.click(".tb-work"); await page.wait_for_selector(".tb-work-pop"); await page.click(".tb-work-go"); await page.wait_for_timeout(700)
        tint = await page.evaluate("getComputedStyle(document.querySelector('.work-tint')).opacity")
        check("arbejdstilstand: varmere lys, blødere kontrast og færre forstyrrelser", await page.evaluate("['work-on','work-soft','work-calm'].every(c => document.documentElement.classList.contains(c))") and float(tint) > 0.05 and await page.locator(".tb-status").is_hidden(), tint)
        await page.click(".tb-work-pop .tb-seg button:has-text('Kraftig')"); await page.wait_for_timeout(700)
        await page.screenshot(path=f"{OUT}/arbejdstilstand.png")
        wk = (await api(page, "GET", "/api/me/prefs"))["data"]["prefs"].get("work", {})
        check("arbejdstilstand: valgene gemmes på profilen", wk.get("on") is True and wk.get("warm") == 3, wk)
        await page.click(".tb-work-go"); await page.keyboard.press("Escape"); await page.wait_for_timeout(500)
        check("arbejdstilstand: kan slås fra igen", not await page.evaluate("document.documentElement.classList.contains('work-on')"))

        # ── Projekter: a room per project – conversation, tasks, described changes, website ──
        await page.goto(BASE + "/#/apps/projects"); await page.wait_for_selector(".pj-page")
        for _ in range(6):   # reminder cards from the calendar tests sit bottom right – press Set on them first
            if not await page.locator(".rm-card button:has-text('Set')").count(): break
            await page.locator(".rm-card button:has-text('Set')").first.click(); await page.wait_for_timeout(150)
        await page.click(".pj-list-h button[aria-label='Nyt projekt']")
        await page.fill(".modal input[aria-label='Navn']", "Lager-scanneren"); await page.click(".modal .segmented button:has-text('Kode')")
        await page.click(".modal button:has-text('Opret projekt')"); await page.wait_for_selector(".pj-head h2:has-text('Lager-scanneren')", timeout=10000)
        await page.fill(".pj-compose-in", "Hej holdet – vi starter med login. `ping 192.168.1.1` virker."); await page.press(".pj-compose-in", "Enter")
        await page.wait_for_selector(".pj-msg .pj-p code:has-text('ping 192.168.1.1')", timeout=8000)
        check("projekter: en besked med kode vises i samtalen", True)
        check("projekter: knap til at ringe til holdet", await page.locator(".pj-head button:has-text('Ring til holdet')").count() == 1)
        await page.click(".pj-tab:has-text('Opgaver')"); await page.fill(".pj-task-add input[aria-label='Ny opgave']", "Sikr login"); await page.click(".pj-task-add button:has-text('Tilføj')")
        await page.wait_for_selector(".pj-task:has-text('Sikr login')", timeout=8000)
        await page.click(".pj-tab:has-text('Kode')"); await page.wait_for_selector(".pj-files")
        await page.click(".pj-files button[aria-label='Ny fil']"); await page.fill(".modal input", "site/index.html"); await page.press(".modal input", "Enter")
        await page.wait_for_selector(".pj-ed .cm-editor", timeout=20000)
        await page.click(".pj-ed .cm-content"); await page.keyboard.type("<h1>Lageret")   # the editor closes the tag itself
        await page.wait_for_selector(".pj-submit input[aria-label='Commit-titel']", timeout=8000)
        await page.click(".pj-submit button:text-is('Commit')")
        check("projekter: en ændring kræver en beskrivelse", "titel" in (await page.inner_text(".pj-submit .field-error")).lower())
        await page.fill(".pj-submit input[aria-label='Commit-titel']", "Første forside")
        await page.fill(".pj-submit textarea[aria-label='Commit-beskrivelse']", "Hvad: en forside til lageret.\nHvorfor: kunden vil se noget.")
        await page.select_option(".pj-submit select[aria-label='Lukker opgave']", label="Sikr login")
        await page.click(".pj-submit button:text-is('Commit')")
        await page.wait_for_selector(".pj-file:has-text('site/index.html'):not(:has(.pj-new))", timeout=8000)
        await page.screenshot(path=f"{OUT}/projekter-kode.png")
        await page.click(".pj-tab:has-text('Commits')"); await page.wait_for_selector(".pj-commit h3:has-text('Første forside')", timeout=8000)
        check("projekter: ændringen står med beskrivelse og forskel", "kunden vil se noget" in await page.inner_text(".pj-descr") and await page.locator(".pj-dl.is-add").count() >= 1)
        await page.click(".pj-tab:has-text('Samtale')"); await page.wait_for_selector(".pj-commit-card:has-text('Første forside')", timeout=8000)
        check("projekter: ændringen og den lukkede opgave vises i samtalen", await page.locator(".pj-sys:has-text('lukkede opgaven')").count() == 1)
        await page.screenshot(path=f"{OUT}/projekter-samtale.png")
        pj = (await api(page, "GET", "/api/pj"))["data"]["projects"][0]
        await api(page, "PATCH", f"/api/pj/{pj['id']}", {"site": True, "siteDir": "site", "sitePublic": True})
        slug = (await api(page, "GET", f"/api/pj/{pj['id']}"))["data"]["project"]["slug"]
        anon = await browser.new_context(); ap0 = await anon.new_page()
        await ap0.goto(BASE + f"/side/{slug}/"); check("projekter: mappen udgives som hjemmeside", (await ap0.inner_text("h1")).strip() == "Lageret")
        await anon.close()

        # ── Værktøjskasse: IT tools ──
        await page.goto(BASE + "/#/learn/toolkit")
        await page.wait_for_selector("#tk-subnet")
        await page.fill("#tk-subnet input", "172.16.5.4/30")
        sn = await page.locator("#tk-subnet .tk-res b").all_text_contents()
        await page.fill("#tk-bases input >> nth=1", "ff")
        check("værktøjskasse: subnet og talsystemer regner rigtigt", sn[0] == "172.16.5.4/30" and sn[1] == "2" and await page.input_value("#tk-bases input >> nth=2") == "1111 1111", sn)

        # ── Kunder: import from the other apps, customer page, invoice draft, PDF, stock, status ──
        await page.evaluate("""async () => {
            const now = Date.now(), H = 3600e3, d = new Date(), p = n => String(n).padStart(2,'0'), iso = x => `${x.getFullYear()}-${p(x.getMonth()+1)}-${p(x.getDate())}`;
            const put = (k, s) => fetch('/api/state/'+k,{method:'PUT',headers:{'X-Requested-With':'hubtech','Content-Type':'application/json'},body:JSON.stringify({state:s})});
            await Promise.all([
              put('svc-cust', {v: JSON.stringify([{k:'Jensen A/S',kp:'Mette Jensen',a:'Industrivej 4, Vejle',t:'75 12 34 56'}])}),
              put('svc-log', {v: JSON.stringify([{d:'2026-10-08',k:'Jensen A/S',e:'Printer',t:'Ny rulle'}])}),
              put('timesheet', {rate: 400, entries: [{id:'t1',start:now-50*H,end:now-50*H+5400e3,desc:'Printer',project:'Jensen A/S',billable:true},{id:'t2',start:now-26*H,end:now-24*H,desc:'Netværk',project:'Bager Hansen',billable:true}]}),
              put('inventory', {items:[{id:'i1',name:'Toner HP 26A',qty:4,min:2,price:449}]}),
              put('calendar', {events:[{id:'e1',title:'Service hos Jensen A/S',date:iso(d),start:'09:00',end:'10:00'}]}),
            ]); }""")
        await page.goto(BASE + "/#/apps/customers")
        await page.wait_for_selector(".cu-import")
        await page.click(".cu-import button")
        await page.wait_for_selector(".cu-row")
        rows = await page.locator(".cu-row-main b").all_text_contents()
        check("kunder: importeres fra Servicehjælp og Tidsregistrering", sorted(rows) == ["Bager Hansen", "Jensen A/S"], rows)
        await page.click(".cu-row:has-text('Jensen A/S')")
        await page.wait_for_selector(".cu-grid")
        txt = await page.text_content(".cu-grid")
        check("kunder: kundesiden samler tid, aftaler og rapporter", "Printer" in txt and "Service hos Jensen A/S" in txt and "Ny rulle" in txt)
        await page.click(".cu-actions .app-solid")
        await page.wait_for_selector(".cu-lines tbody tr")
        await page.click("button:has-text('Del fra lager')")
        await page.fill(".modal input[type=number]", "1")
        await page.click(".modal .btn-primary")
        await page.wait_for_timeout(300)
        tot = await page.text_content(".cu-totals .is-total b")
        check("kunder: fakturaudkast med timer (kvarter) og del", tot == "1.311,25 kr.", tot)   # (1,5 t × 400 + 449) × 1,25
        async with page.expect_download() as dl:
            await page.click("button:has-text('Hent PDF')")
        d = await dl.value
        pdf_path = await d.path()
        check("kunder: faktura hentes som PDF", d.suggested_filename.endswith(".pdf") and open(pdf_path, "rb").read(5) == b"%PDF-", d.suggested_filename)
        await page.click("button:has-text('Markér som sendt')")
        await page.wait_for_timeout(1200)
        inv_state = (await api(page, "GET", "/api/state/inventory"))["data"]["state"]
        ts_state = (await api(page, "GET", "/api/state/timesheet"))["data"]["state"]
        check("kunder: sendt faktura trækker fra lager og markerer timerne", inv_state["items"][0]["qty"] == 3 and next(e for e in ts_state["entries"] if e["id"] == "t1").get("invoice"), (inv_state["items"][0]["qty"]))
        await page.goto(BASE + "/#/")
        await page.wait_for_selector(".today-agenda")
        check("hjem: I dag viser dagens aftale", "Service hos Jensen A/S" in (await page.text_content(".today-panel")))

        # ── print / PDF: calendar and notes ──
        await page.goto(BASE + "/#/apps/calendar")
        await page.wait_for_selector(".cal-cell")
        await page.click("button:has-text('Print / PDF')")
        await page.wait_for_selector(".cal-print")
        async with page.expect_download() as dl:
            await page.click(".modal button:has-text('Hent PDF')")
        d = await dl.value
        check("kalender: måned hentes som PDF", d.suggested_filename.endswith(".pdf") and open(await d.path(), "rb").read(5) == b"%PDF-", d.suggested_filename)
        await page.goto(BASE + "/#/apps/notes?new=1")
        await page.wait_for_selector(".note-title")
        await page.wait_for_timeout(500)
        await page.fill(".note-title", "Testnote til print")
        await page.fill(".note-body", "[x] færdig\n[ ] mangler")
        await page.wait_for_timeout(700)
        check("noter: genvej ?new=1 opretter en note", "new=1" not in page.url)
        await page.click(".note-toolbar button[title='Print / PDF']")
        async with page.expect_download() as dl:
            await page.click(".modal button:has-text('Hent PDF')")
        d = await dl.value
        check("noter: note hentes som PDF", open(await d.path(), "rb").read(5) == b"%PDF-", d.suggested_filename)

        # ── Del til HUBTECH (what the Android share sheet opens) ──
        await page.goto(BASE + "/#/share?text=" + urllib.parse.quote("Husk at bestille toner\nTil Jensen A/S"))
        await page.wait_for_selector(".share-box")
        await page.click("button:has-text('Lav en opgave')")
        await page.wait_for_selector(".kb-col, .tasks-page", timeout=10000)
        await page.wait_for_timeout(800)
        tk = (await api(page, "GET", "/api/state/tasks"))["data"]["state"]["tasks"]
        check("deling: delt tekst bliver til en opgave", tk[0]["title"] == "Husk at bestille toner" and "Jensen" in tk[0]["notes"], tk[0])

        # ── one background: Højhuse om natten, also when an old choice is saved ──
        await api(page, "PUT", "/api/me/prefs", {"world": {"source": "landscape", "landscape": "coast"}})
        await page.goto(BASE + "/#/settings/world"); await page.reload()
        await page.wait_for_selector("[data-tour='world-settings'] select[aria-label='Stil']")
        check("udseende: design D viser ikke en baggrund, den ikke har", await page.locator(".world-hero").count() == 0 and await page.locator("[data-tour='world-settings'] select[aria-label='Stil'] option").first.inner_text() == "Rolig og varm (standard)")
        look = await page.evaluate("({ src: document.documentElement.dataset.worldSource, scene: !!document.getElementById('world-scene') && !document.getElementById('world-scene').hidden, tiles: document.querySelectorAll('.land-tile').length })")
        check("baggrund: design D tegner ingen baggrund – og der er ingen andre at vælge", look == {"src": "none", "scene": False, "tiles": 0}, look)

        # ── scanner: without a camera the code can be typed ──
        await page.goto(BASE + "/#/apps/inventory")
        await page.wait_for_selector(".inv-scan")
        await page.click(".inv-scan")
        await page.wait_for_selector(".scan-manual input")
        await page.fill(".scan-manual input", "UKENDT-123")
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(500)
        check("scanner: kode kan skrives, og Lager søger på den", await page.input_value(".inv-bar input[type=search]") == "UKENDT-123")

        # ── Fællesskab: age gate, server, rules, live chat, reactions, DM, music room, mobile ──
        await page.goto(BASE + "/#/apps/community")
        await page.wait_for_selector(".cm-gate")
        await page.fill(".cm-gate input[type=number]", "2015")
        await page.check(".cm-gate input[type=checkbox]")
        await page.click(".cm-gate .btn-primary")
        await page.wait_for_timeout(500)
        check("fællesskab: under 13 år afvises", "13 år" in (await page.text_content(".cm-gate .field-error") or ""))
        await page.fill(".cm-gate input[type=number]", "1998")
        await page.click(".cm-gate .btn-primary")
        await page.wait_for_selector(".cm-app", timeout=8000)
        await page.click(".cm-rail-btn[aria-label='Opret en server']")
        await page.fill(".modal input[aria-label=Navn]", "Værkstedet")
        await page.click(".modal .btn-primary")
        await page.wait_for_selector(".cm-chan.is-active", timeout=8000)
        check("fællesskab: server med 4 kanaler oprettes", await page.locator(".cm-chan").count() == 4)
        await page.click(".cm-chan:has-text('generelt')")
        await page.wait_for_selector(".cm-chan.is-active:has-text('generelt')")
        sid = (await api(page, "GET", "/api/cm/servers"))["data"]["servers"][0]["id"]
        code = (await api(page, "POST", f"/api/cm/servers/{sid}/invites", {}))["data"]["code"]
        cctx = await browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
        mj = await cctx.new_page()
        mj.on("pageerror", lambda e: errors.append("maja: " + str(e)))
        await mj.goto(BASE + "/#/login")
        await mj.wait_for_selector("#login-user")
        mj.on("console", lambda m: errors.append("maja console: " + m.text) if m.type == "error" else None)
        await mj.fill("#login-user", "maja"); await mj.fill("#login-pass", "Vinter2026xx"); await mj.click("button[type=submit]")
        try:
            await mj.wait_for_selector(".home-title", timeout=15000)
        except Exception:
            await mj.screenshot(path=f"{OUT}/maja-stuck.png"); print("MAJA STUCK", mj.url, errors[-5:], flush=True); raise
        await api(mj, "POST", "/api/me/onboarding", {"done": True, "step": 9})
        await api(mj, "POST", "/api/cm/me/age", {"birthYear": 2001, "acceptRules": True})
        await mj.goto(BASE + f"/#/apps/community/invite/{code}")
        await mj.wait_for_selector(".cm-invite .btn-primary", timeout=8000)
        await mj.click(".cm-invite .btn-primary")
        await mj.wait_for_selector(".cm-rulesgate", timeout=8000)
        check("fællesskab: invitation → regler skal accepteres før man skriver", await mj.locator(".cm-input").count() == 0)
        await mj.click(".cm-rulesgate .btn-primary")
        await mj.wait_for_selector(".cm-input")
        await mj.fill(".cm-input", "Hej fra telefonen 👋")
        await mj.click(".cm-send")
        await page.wait_for_selector(".cm-msg:has-text('Hej fra telefonen')", timeout=30000)
        check("fællesskab: beskeder kommer frem live", True)
        await page.hover(".cm-msg:has-text('Hej fra telefonen')")
        await page.click(".cm-msg:has-text('Hej fra telefonen') [aria-label=Reagér]")
        await page.click(".cm-react-pop [aria-label='Reagér med 👍']")
        await mj.wait_for_selector(".cm-react", timeout=30000)
        check("fællesskab: reaktioner vises hos den anden", "1" in (await mj.text_content(".cm-react") or ""))
        await page.fill(".cm-input", "Se `ls -la` og **fed** tekst @maja")
        await page.keyboard.press("Enter")
        await page.wait_for_selector(".cm-msg .cm-ic")
        check("fællesskab: kode, fed og @omtale formateres", await page.locator(".cm-msg b:has-text('fed')").count() == 1 and await page.locator(".cm-mention").count() >= 1)
        # the server's own emoji: upload in the settings, use it with :navn: and as a reaction
        await page.click(".cm-side-h.is-server"); await page.click(".cm-menu button:has-text('Indstillinger')")
        await page.click(".modal .segmented button:has-text('Emojis')")
        emoji_png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAALElEQVR4nGNgGJ7g/xaG/7gwRZoJGkKMZryGjBowGAwg1hCcmokxhKBmugMAdZwl2rXFLMoAAAAASUVORK5CYII=")
        await page.set_input_files(".cm-emoji-add input[type=file]", files=[{"name": "Hub Kat.png", "mimeType": "image/png", "buffer": emoji_png}])
        await page.wait_for_selector(".cm-emoji-add .btn-primary:not([disabled])", timeout=5000)
        check("emojis: navnet foreslås ud fra filen", await page.input_value(".cm-emoji-add input.input") == "hub_kat")
        await page.click(".cm-emoji-add .btn-primary")
        await page.wait_for_selector(".cm-emoji-item", timeout=8000)
        await page.screenshot(path=f"{OUT}/e2e_cm_emojis.png")
        await page.click(".modal button:has-text('Luk')"); await page.wait_for_timeout(800)
        await page.fill(".cm-input", "Se min nye "); await page.type(".cm-input", ":hub")
        await page.wait_for_selector(".cm-emoji-suggest:not([hidden]) .cm-sugg", timeout=5000)
        check("emojis: :hub foreslår serverens emoji", "hub_kat" in (await page.inner_text(".cm-emoji-suggest")))
        await page.keyboard.press("Tab")
        check("emojis: Tab indsætter navnet", (await page.input_value(".cm-input")).endswith(":hub_kat: "))
        await page.keyboard.press("Enter")
        await page.wait_for_selector(".cm-msg img.cm-cemoji[alt=':hub_kat:']", timeout=8000)
        await mj.wait_for_selector(".cm-msg img.cm-cemoji[alt=':hub_kat:']", timeout=15000)
        loaded = False
        for _ in range(20):
            loaded = await mj.evaluate("[...document.querySelectorAll('.cm-msg img.cm-cemoji')].some(i => i.complete && i.naturalWidth > 0)")
            if loaded:
                break
            await mj.wait_for_timeout(250)
        check("emojis: vises som billede hos begge", loaded)
        await page.fill(".cm-input", ":hub_kat:"); await page.keyboard.press("Escape"); await page.keyboard.press("Enter")
        await page.wait_for_selector(".cm-text.is-jumbo img.cm-cemoji", timeout=8000)
        check("emojis: en besked med kun emoji vises stort", True)
        last = page.locator(".cm-msg").last
        await last.hover(); await last.locator("[aria-label=Reagér]").click()
        await page.click(".cm-react-pop [aria-label='Reagér med :hub_kat:']")
        await mj.wait_for_selector(".cm-react img.cm-cemoji", timeout=15000)
        check("emojis: reaktion med serverens emoji ses hos den anden", True)
        await page.screenshot(path=f"{OUT}/e2e_cm_emoji_chat.png")
        ov = await mj.evaluate("Math.max(document.documentElement.scrollWidth, innerWidth) - screen.width")
        check("fællesskab: ingen vandret scroll på mobil", ov <= 1, ov)
        await mj.screenshot(path=f"{OUT}/e2e_cm_mobile_chat.png")
        await page.screenshot(path=f"{OUT}/e2e_cm_channel.png")
        # friends + DM + a shared note from the composer
        await api(page, "POST", "/api/cm/friends", {"username": "maja"})
        oid = (await api(page, "GET", "/api/me"))["data"]["user"]["id"]
        await api(mj, "POST", f"/api/cm/friends/{oid}/accept")
        mid = (await api(mj, "GET", "/api/me"))["data"]["user"]["id"]
        dm = f"dm-{min(oid, mid)}-{max(oid, mid)}"
        r = await api(mj, "POST", f"/api/cm/channels/{dm}/messages", {"body": "Her er planen", "attach": {"kind": "event", "title": "Serverdag", "date": "2026-11-07", "start": "10:00", "end": "14:00"}})
        check("fællesskab: DM mellem venner", r["status"] == 201, r)
        await page.goto(BASE + f"/#/apps/community/dm/{dm}")
        await page.wait_for_selector(".cm-attach", timeout=8000)
        await page.click(".cm-attach .btn")
        await page.wait_for_timeout(800)
        evs = (await api(page, "GET", "/api/state/calendar"))["data"]["state"]["events"]
        check("fællesskab: delt aftale kan lægges i egen kalender", any(e["title"] == "Serverdag" for e in evs))
        # music room
        await page.goto(BASE + f"/#/apps/community/s/{sid}")
        await page.wait_for_selector(".cm-chan")
        await page.click(".cm-chan:has-text('musik')")
        await page.wait_for_selector(".mu", timeout=8000)
        check("fællesskab: musikrum med kø og 'Lyt med'", await page.locator(".mu-listen").count() == 1 and "ikke noget" in (await page.text_content(".mu-title") or ""))
        await page.screenshot(path=f"{OUT}/e2e_cm_music.png")
        # moderation from the member card
        await page.goto(BASE + f"/#/apps/community/s/{sid}")
        await page.wait_for_selector(".cm-chan.is-active")
        await page.evaluate("document.querySelector('.cm-msg .cm-ava') && null")
        r = await api(page, "POST", f"/api/cm/servers/{sid}/members/{mid}/mute", {"minutes": 10})
        await mj.wait_for_timeout(2500)
        r2 = await api(mj, "POST", f"/api/cm/channels/{(await api(page, 'GET', f'/api/cm/servers/{sid}'))['data']['channels'][1]['id']}/messages", {"body": "x"})
        check("fællesskab: moderator kan gøre tavs", r["status"] == 200 and r2["data"]["code"] == "muted", r2)
        await api(page, "POST", f"/api/cm/servers/{sid}/members/{mid}/mute", {"minutes": 0})

        # ── one calendar: Servicehjælp + Kalender, and shared calendars between users ──
        await page.goto(BASE + "/#/apps/calendar")
        await page.wait_for_selector(".cal-cals")
        await page.click(".cal-cals >> text=Ny delt kalender")
        await page.fill(".modal input[aria-label=Navn]", "Familie")
        await page.click(".modal .btn-primary")
        await page.wait_for_selector(".cal-inv-row")
        await page.fill(".cal-inv-row input", "maja")
        await page.click(".cal-inv-row .btn-primary")
        await page.wait_for_selector(".cal-member:has-text('Maja')", timeout=8000)
        await page.click(".modal-actions .btn:has-text('Luk')") if await page.locator(".modal-actions .btn:has-text('Luk')").count() else await page.keyboard.press("Escape")
        await mj.goto(BASE + "/#/apps/calendar")
        await mj.wait_for_selector(".cal-invite", timeout=8000)
        await mj.click(".cal-invite .btn-primary")
        await mj.wait_for_selector(".cal-chip:has-text('Familie')", timeout=8000)
        check("delt kalender: invitation accepteres", True)
        cals = (await api(mj, "GET", "/api/calendars"))["data"]["calendars"]
        r = await api(mj, "POST", f"/api/calendars/{cals[0]['id']}/events", {"event": {"title": "Farmors fødselsdag", "date": __import__("datetime").date.today().replace(day=15).isoformat(), "allDay": True}})
        await page.wait_for_timeout(2500)
        await page.goto(BASE + "/#/apps/calendar?r=1")
        await page.wait_for_selector(".cal-pill")
        check("delt kalender: den andens aftale vises i min kalender", await page.locator(".cal-pill:has-text('Farmors fødselsdag')").count() >= 1)
        await page.wait_for_timeout(800)
        await page.screenshot(path=f"{OUT}/e2e_cal_shared.png")

        # ── local AI assistant: pop-up, own model file, answer, actions, teacher mode ──
        tiny = os.environ.get("HUBTECH_TEST_GGUF", "/tmp/claude-0/fixture/tiny.gguf")
        await page.goto(BASE + "/#/apps/notes")
        await page.wait_for_timeout(600)
        await page.keyboard.press("Control+j")
        await page.wait_for_selector(".ai-panel:not([hidden])")
        check("ai: pop-up åbner med Ctrl+J", True)
        check("ai: siden er isoleret, så AI'en kan bruge flere kerner", await page.evaluate("crossOriginIsolated === true && typeof SharedArrayBuffer === 'function'"))
        await page.click(".ai-head [aria-label='Indstillinger for assistenten']")
        await page.fill(".ai-settings input[type=range]", "0.75")
        await page.dispatch_event(".ai-settings input[type=range]", "change")
        await page.wait_for_timeout(200)
        check("ai: RAM-grænse vælger en lille model", "Qwen 2.5 · 0,5B" in (await page.text_content(".ai-set-hint") or ""), await page.text_content(".ai-set-hint"))
        if os.path.exists(tiny):
            await page.select_option(".ai-settings select[aria-label=Model]", "file")
            await page.set_input_files(".ai-settings input[type=file]", tiny)
            await page.select_option(".ai-settings select[aria-label='Hukommelse (kontekst)']", "4096")
            await page.click(".ai-settings >> text=Start med valget")
            for _ in range(120):
                if "klar" in (await page.text_content(".ai-status") or ""): break
                await page.wait_for_timeout(500)
            await page.fill(".ai-input", "Hvad skal jeg i dag?")
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(800)
            for _ in range(120):
                if await page.evaluate("!document.querySelector('.ai-send').classList.contains('is-stop')"): break
                await page.wait_for_timeout(500)
            txt = await page.evaluate("document.querySelector('.ai-msg.is-bot:last-of-type')?.textContent || ''")
            check("ai: modellen kører lokalt og svarer", len(txt) > 3, txt[:80])
            # Gnist draws charts: numbers in the question are drawn at once
            await page.fill(".ai-input", "lav en graf over jan 5, feb 8 og mar 3"); await page.keyboard.press("Enter")
            await page.wait_for_selector(".ai-chart svg", timeout=5000)
            check("ai: Gnist tegner en graf og kan gemme den som billede", await page.locator(".ai-chart rect").count() >= 3 and await page.locator(".ai-chart a[download]").count() == 1)
            await page.screenshot(path=f"{OUT}/ai-graf.png")
            # attach a CSV: a chart at once
            await page.set_input_files(".ai-attach input[type=file]", files=[{"name": "salg.csv", "mimeType": "text/csv", "buffer": "Måned;Salg\nJan;120\nFeb;180\nMar;150".encode("utf-8")}])
            await page.wait_for_selector(".ai-attached:has-text('salg.csv')", timeout=3000)
            await page.fill(".ai-input", "vis det som en graf"); await page.keyboard.press("Enter")
            await page.wait_for_selector(".ai-msg.is-bot:has-text('salg.csv') .ai-chart svg", timeout=5000)
            check("ai: en vedhæftet CSV-fil bliver til en graf", await page.locator(".ai-msg.is-bot:has-text('salg.csv') .ai-chart polyline").count() == 1)
            # Gnist remembers: handled at once by HUBTECH, saved on the account
            await page.fill(".ai-input", "Husk at jeg arbejder med lasere"); await page.keyboard.press("Enter")
            await page.wait_for_selector(".ai-msg.is-bot:has-text('husker jeg nu')", timeout=5000)
            mem = (await api(page, "GET", "/api/state/gnist"))["data"]["state"].get("memory") or []
            check("ai: Gnist husker det, man beder hende om, på kontoen", any("lasere" in m["text"] for m in mem), mem)
            # a question HUBTECH's guides answer: the answer shows its sources, and "Prøv igen" asks once more
            await page.click(".ai-head [aria-label='Ny samtale']")
            await page.fill(".ai-input", "Min printer er offline – hvad gør jeg?")
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(800)
            for _ in range(120):
                if await page.evaluate("!document.querySelector('.ai-send').classList.contains('is-stop')"): break
                await page.wait_for_timeout(500)
            src = await page.locator(".ai-sources a.ai-source").all_text_contents()
            check("ai: svaret viser kilder fra HUBTECHs guides og kurser", any("rinter" in x for x in src), src)
            href = await page.get_attribute(".ai-sources a.ai-source", "href")
            check("ai: kilderne linker til guiden, lektionen eller værktøjet", (href or "").startswith(("#/learn/", "#/apps/printerdoctor", "#/apps/")) and href != "#/apps/notes", href)
            await page.screenshot(path=f"{OUT}/ai-kilder.png")
            await page.click(".ai-msg-tools [aria-label='Prøv igen med et nyt svar']")
            await page.wait_for_timeout(600)
            for _ in range(120):
                if await page.evaluate("!document.querySelector('.ai-send').classList.contains('is-stop')"): break
                await page.wait_for_timeout(500)
            check("ai: prøv igen giver et nyt svar i stedet for et ekstra", await page.locator(".ai-msg.is-user").count() == 1 and await page.locator(".ai-msg.is-bot").count() == 1)
            # earlier conversations are kept on the profile (for every model, small or big) and can be opened again
            await page.click(".ai-head [aria-label='Ny samtale']"); await page.wait_for_timeout(800)
            await page.click(".ai-head [aria-label='Tidligere samtaler']"); await page.wait_for_selector(".ai-hist-item", timeout=8000)
            check("ai: tidligere samtaler gemmes", "printer" in (await page.inner_text(".ai-hist-item")).lower())
            await page.click(".ai-hist-item"); await page.wait_for_timeout(400)
            check("ai: en tidligere samtale kan åbnes igen", await page.locator(".ai-msg.is-user").count() == 1)
            st = (await api(page, "GET", "/api/state/gnist"))["data"]["state"]
            check("ai: samtalerne ligger på profilen (følger med på tværs af enheder og modeller)", len(st.get("chats", [])) >= 1)
            await page.click(".ai-head [aria-label='Indstillinger for assistenten']"); await page.wait_for_selector(".ai-ext-h")
            await page.wait_for_timeout(1200)
            check("ai: store modeller (4–32 GB) via Ollama/LM Studio kan vælges", "Store modeller" in await page.inner_text(".ai-ext") and ("Ikke fundet" in await page.inner_text(".ai-ext") or await page.locator(".ai-tier").count() == 4), await page.inner_text(".ai-ext"))
            await page.click(".ai-head [aria-label='Indstillinger for assistenten']")
            # impatient use of the engine: two clicks in a row, a new choice while a model is on its way, "sleep" while it loads
            # and while it answers. The older load stops quietly, the newest wins, nothing hangs and no error is reported.
            await page.evaluate("document.body.insertAdjacentHTML('beforeend', '<input type=file id=race-file style=\"position:fixed;left:0;top:0;opacity:.01\">')")
            await page.set_input_files("#race-file", tiny)
            await page.evaluate("""(async () => {
              const E = await import('/js/ai/engine.js'), file = document.querySelector('#race-file').files[0], out = {};
              const settle = async (ps) => (await Promise.allSettled(ps)).map(r => r.status === 'fulfilled' ? 'ok' : (r.reason?.code || ('ERR: ' + (r.reason?.message || r.reason))));
              await E.unload();
              out.twice = [await settle([E.load({ file, ctx: 1024 }), E.load({ file, ctx: 1024 })]), E.state.status];
              out.choice = [await settle([E.load({ file, ctx: 512 }), E.load({ file, ctx: 2048 })]), E.state.status, E.isReady()];
              await E.unload();
              const p = E.load({ file, ctx: 1024 }), u = E.unload();
              out.sleepLoading = [await settle([p, u]), E.state.status, E.isReady()];
              out.three = [await settle([E.load({ file, ctx: 512 }), E.load({ file, ctx: 1024 }), E.load({ file, ctx: 2048 })]), E.state.status];
              const c = E.chat([{ role: 'user', content: 'Hej' }], { maxTokens: 40 });
              await new Promise(r => setTimeout(r, 150));
              out.sleepAnswering = [await settle([c, E.unload()]), E.state.status];
              await E.load({ file, ctx: 1024 });
              out.after = [typeof await E.chat([{ role: 'user', content: 'Hej' }], { maxTokens: 12 }), E.state.status, E.isReady()];
              await E.unload();
              return out;
            })().then(r => { window.__race = r; }, e => { window.__race = { failed: String(e && e.message || e) }; }); 0""")
            race = None
            for _ in range(240):
                await page.wait_for_timeout(500)
                try: race = await page.evaluate("window.__race || null")
                except Exception: continue
                if race: break
            check("ai: utålmodig brug (to klik, nyt valg, sov midt i det hele) giver hverken fejl eller hængning", race == {
                "twice": [["ok", "ok"], "ready"], "choice": [["superseded", "ok"], "ready", True], "sleepLoading": [["superseded", "ok"], "idle", False],
                "three": [["superseded", "superseded", "ok"], "ready"], "sleepAnswering": [["ok", "ok"], "idle"], "after": ["string", "ready", True]}, race)
            await page.evaluate("document.querySelector('#race-file')?.remove()")
        else:
            check("ai: test-model findes (sæt HUBTECH_TEST_GGUF)", False, tiny)
        # action proposals need a confirmation before anything changes
        await page.evaluate("""() => { localStorage.setItem('hubtech.ai.chat', JSON.stringify([{ role: 'user', content: 'Lav en aftale' }, { role: 'assistant', content: 'Klart.\\n<handling>{"type":"aftale","titel":"Tandlæge","dato":"2026-10-29","start":"10:00","slut":"10:30"}</handling>' }])); }""")
        await page.reload()
        await page.wait_for_selector(".ai-fab", state="attached")
        await page.keyboard.press("Control+j")
        await page.wait_for_selector(".ai-action")
        before = len((await api(page, "GET", "/api/state/calendar"))["data"]["state"]["events"])
        await page.click(".ai-action .btn-primary")
        await page.wait_for_timeout(900)
        evs = (await api(page, "GET", "/api/state/calendar"))["data"]["state"]["events"]
        check("ai: foreslået aftale oprettes først efter godkendelse", len(evs) == before + 1 and any(e["title"] == "Tandlæge" and e["start"] == "10:00" for e in evs))
        await page.screenshot(path=f"{OUT}/e2e_ai_panel.png")
        await page.keyboard.press("Escape")
        # Kodeskolen turns it into a teacher
        await page.goto(BASE + "/#/learn/codeschool/python/py1")
        await page.wait_for_selector(".cs-task", timeout=10000)
        await page.wait_for_selector(".ai-fab", state="attached")
        await page.keyboard.press("Control+j")
        await page.wait_for_selector(".ai-panel:not([hidden])")
        check("ai: lærertilstand i Kodeskolen", await page.locator(".ai-mode:not([hidden])").count() == 1)
        await page.evaluate("""() => { localStorage.setItem('hubtech.ai.chat', JSON.stringify([{ role: 'user', content: 'Giv mig løsningen' }, { role: 'assistant', tutor: true, content: 'Prøv selv!\\n```python\\nprint("Hej verden")\\nprint(12 * 12)\\nx = 1\\ny = 2\\n```' }])); }""")
        await page.reload()
        await page.wait_for_selector(".cs-task", timeout=10000)
        await page.wait_for_selector(".ai-fab", state="attached")
        await page.keyboard.press("Control+j")
        await page.wait_for_selector(".ai-hidden")
        check("ai: lærertilstand skjuler længere kode (løsninger)", await page.locator(".ai-msg pre").count() == 0)
        await page.keyboard.press("Escape")
        await page.evaluate("localStorage.removeItem('hubtech.ai.chat')")
        # phone: full-screen assistant from the top bar
        await mj.goto(BASE + "/#/apps/notes")
        await mj.wait_for_timeout(800)
        await mj.click(".ai-top")
        await mj.wait_for_selector(".ai-panel:not([hidden])")
        await mj.wait_for_timeout(600)
        box = await mj.evaluate("(() => { const r = document.querySelector('.ai-panel').getBoundingClientRect(); return [r.width, r.height, innerWidth, innerHeight]; })()")
        check("ai: fylder skærmen på mobil", box[0] >= box[2] - 1 and box[1] >= box[3] - 1, box)
        await mj.screenshot(path=f"{OUT}/e2e_ai_mobile.png")
        await cctx.close()

        # ── background piano music: off until you turn it on, can be paused ──
        check("baggrundsmusik: slået fra som standard", not await page.evaluate("import('/js/features/piano.js').then(m => m.isPlaying())"))
        await page.click(".bgm-btn"); await page.click(".bgm-play"); await page.wait_for_timeout(800)
        playing = await page.evaluate("import('/js/features/piano.js').then(m => m.isPlaying())")
        await page.click(".bgm-play"); await page.wait_for_timeout(300)
        paused = not await page.evaluate("import('/js/features/piano.js').then(m => m.isPlaying())")
        check("baggrundsmusik: klaveret spiller og kan sættes på pause", playing and paused)
        await page.keyboard.press("Escape")

        # ── app groups: Planlæg / Service / Office share one menu entry with tabs; Kodestumper lives in Læring ──
        await page.goto(BASE + "/#/apps/tasks"); await page.wait_for_selector(".page"); await page.wait_for_timeout(400)
        check("apps: ingen app-faner i toppen – du skifter app i docken", await page.locator(".suite-tabs").count() == 0)
        await page.goto(BASE + "/#/apps"); await page.wait_for_selector(".ab-page .ab-row")
        groups = [x.strip() for x in await page.locator(".ab-index-a span").all_text_contents()]
        check("alle apps: grupperne står i oversigten til venstre", all(x in groups for x in ["Fastgjort", "Planlæg", "Kunder og drift", "Økonomi", "Udvikling", "HUBTECH Office", "Pauserum", "Lær og øv"]), groups)
        n_budget = await page.locator("#ab-page-money .ab-txt b").all_text_contents()
        parts = await page.locator("#ab-page-money .ab-part").all_text_contents()
        check("alle apps: Økonomi er én app – dens dele står under den", n_budget == ["Økonomi"] and {"Budget", "Opsparing", "Sparegris", "Udlån"} <= set(parts), (n_budget, parts))
        await page.click("#ab-page-money .ab-part:has-text('Opsparing')"); await page.wait_for_url("**/apps/savings")
        await page.wait_for_selector(".part-tabs .learn-tab.is-on:has-text('Opsparing')")
        check("økonomi: hver del er en fane i Økonomi", await page.locator(".part-tabs .learn-tab").count() == 7 and "Økonomi" in await page.inner_text(".tb-crumb"))
        await page.click(".part-tabs .learn-tab:has-text('Overblik')"); await page.wait_for_selector(".eco-card")
        check("økonomi: overblikket viser alle seks dele", await page.locator(".eco-card").count() == 6)
        # ── regner Økonomi rigtigt? Facit regnet i hånden: annuitetsformlen og renters rente ──
        await page.goto(BASE + "/#/apps/savings"); await page.wait_for_selector(".os-big")
        sf = page.locator(".os-wrap input")
        for i, v in enumerate(["0", "1000", "5", "10"]):
            await sf.nth(i).fill(v)
        await page.wait_for_timeout(500)
        os_txt = await page.inner_text(".os-big")
        check("opsparing: 1.000 kr. om måneden i 10 år til 5 % giver 155.282 kr.",
              "155.282 kr." in os_txt and "120.000 kr." in os_txt and "35.282 kr." in os_txt, os_txt)
        await page.goto(BASE + "/#/apps/calculator"); await page.wait_for_timeout(600)
        await page.click("button:has-text('Lån')"); await page.wait_for_selector(".calc-form input")
        lf = page.locator(".calc-form input")
        for i, v in enumerate(["1000000", "4", "30"]):
            await lf.nth(i).fill(v)
        await page.wait_for_timeout(500)
        loan_txt = await page.inner_text(".calc-out")
        loan_rows = await page.locator(".nc-table tbody tr").all_inner_texts()
        check("lommeregner: 1 mio. kr. over 30 år til 4 % giver 4.774,15 kr. om måneden",
              "4.774,15 kr." in loan_txt and "1.718.695,06 kr." in loan_txt, loan_txt)
        check("lommeregner: afdragsplanen har et år pr. række og ender med 0 i restgæld",
              len(loan_rows) == 30 and loan_rows[-1].split("\t")[-1].strip() in ("0 kr.", "0,00 kr."), loan_rows[-1] if loan_rows else loan_rows)
        await page.goto(BASE + "/#/apps"); await page.wait_for_selector(".ab-page .ab-row")
        await page.fill(".ab-page .ab-search", "kalaha"); await page.wait_for_selector(".ab-page .ab-row.is-first")
        check("apps: søgning finder en enkelt app", "Kalaha" in await page.inner_text(".ab-page .ab-body") and await page.locator(".ab-page .ab-group").count() == 0)
        await page.fill(".ab-page .ab-search", "")
        await page.screenshot(path=f"{OUT}/apps-page.png")
        # the drawer from the menu: over the page you're on, search, Enter opens, Esc closes and gives the focus back
        await page.goto(BASE + "/#/apps/calendar"); await page.wait_for_selector(".cal-grid")
        await page.click(".irail-item[data-id='apps']"); await page.wait_for_selector(".adr .ab-row")
        check("alle apps: skuffen glider frem over siden – søgefeltet har fokus", "/apps/calendar" in page.url and await page.evaluate("document.activeElement.classList.contains('ab-search')") and await page.get_attribute(".irail-item[data-id='apps']", "aria-expanded") == "true")
        await page.screenshot(path=f"{OUT}/apps-drawer.png")
        await page.keyboard.press("Escape"); await page.wait_for_timeout(200)
        check("alle apps: Esc lukker skuffen og giver fokus tilbage", await page.locator(".adr").count() == 0 and await page.evaluate("document.activeElement.dataset.id") == "apps")
        await page.click(".irail-item[data-id='apps']"); await page.wait_for_selector(".adr .ab-search")
        await page.keyboard.type("sudoku"); await page.keyboard.press("Enter"); await page.wait_for_url("**/apps/sudoku", timeout=6000)
        check("alle apps: Enter åbner den første app og lukker skuffen", await page.locator(".adr").count() == 0)
        # ── your own shortcuts: + in the menu – this page or a website; drag to move them, right-click to remove ──
        await page.goto(BASE + "/#/learn/guide/add-app"); await page.wait_for_timeout(1200)
        await page.click(".irail-add"); await page.wait_for_selector(".sc-add .sc-here")
        here = await page.locator(".sc-add .sc-here input").input_value()
        await page.click(".sc-add .sc-here button:has-text('Fastgør')"); await page.wait_for_timeout(600)
        pin = page.locator(".irail .irail-item.is-pin[href='#/learn/guide/add-app']")
        check("genveje: + fastgør siden, du står på", await pin.count() == 1 and bool(here) and await pin.get_attribute("aria-label") == here and await pin.get_attribute("aria-current") == "page", here)
        await page.click(".irail-add"); await page.wait_for_selector(".sc-add")
        await page.fill(".sc-add input[aria-label='Adresse på hjemmesiden']", "dr.dk"); await page.press(".sc-add input[aria-label='Adresse på hjemmesiden']", "Enter"); await page.wait_for_timeout(600)
        web = page.locator(".irail .irail-item.is-pin[href='https://dr.dk/']")
        check("genveje: en hjemmeside åbner i et nyt vindue", await web.count() == 1 and await web.get_attribute("target") == "_blank")
        await page.screenshot(path=f"{OUT}/genveje.png")
        order0 = await page.evaluate("[...document.querySelectorAll('.irail .is-pin')].map(e => e.dataset.id)")
        b1 = await web.bounding_box(); b0 = await pin.bounding_box()
        await page.mouse.move(b1["x"] + 20, b1["y"] + 20); await page.mouse.down(); await page.mouse.move(b1["x"] + 20, b1["y"] + 10, steps=3); await page.mouse.move(b0["x"] + 20, b0["y"] + 4, steps=6); await page.mouse.up(); await page.wait_for_timeout(600)
        order1 = await page.evaluate("[...document.querySelectorAll('.irail .is-pin')].map(e => e.dataset.id)")
        check("genveje: træk for at flytte – og et træk åbner ikke linket", order1 != order0 and order1.index(order0[-1]) < order1.index(order0[-2]) and len(page.context.pages) == 1 and "/learn/guide/add-app" in page.url, (order0, order1))
        await page.locator(".irail .irail-item.is-pin[href='https://dr.dk/']").click(button="right"); await page.wait_for_selector(".sc-menu")
        await page.click(".sc-menu .sc-mi:has-text('Fjern fra menuen')"); await page.wait_for_timeout(600)
        check("genveje: højreklik → fjern fra menuen", await page.locator(".irail .irail-item.is-pin[href='https://dr.dk/']").count() == 0 and await pin.count() == 1)
        await page.goto(BASE + "/#/apps/snippets"); await page.wait_for_timeout(800)
        check("app-grupper: Kodestumper ligger under Guides & Læring", "/learn/snippets" in page.url)
        # ── Minecraft-server: address with copy, editable by the owner ──
        await page.goto(BASE + "/#/apps/minecraft"); await page.wait_for_selector(".mc-addr-btn")
        check("minecraft: adressen vises", "b-cabin.gl.joinmc.link" in (await page.text_content(".mc-addr-btn") or ""))
        await page.click(".app-hero >> text=Rediger"); await page.wait_for_selector(".mc-edit")
        await page.fill(".mc-edit input[aria-label='Adresse (Java)']", "play.hubtech.dk:25566")
        await page.fill(".mc-edit input[aria-label='Version']", "1.21.9")
        await page.click(".mc-edit >> text=Gem"); await page.wait_for_selector(".mc-addr-btn")
        check("minecraft: ejeren kan ændre adresse og version", "play.hubtech.dk:25566" in (await page.text_content(".mc-addr-btn") or "") and "1.21.9" in (await page.text_content(".app-hero") or ""))
        await page.screenshot(path=f"{OUT}/e2e_minecraft.png", full_page=True)
        # ── Admin: the owner sees it and can give access ──
        await page.goto(BASE + "/#/apps/admin"); await page.wait_for_selector(".adm-tiles")
        check("admin: ejeren ser overblikket", await page.locator(".adm-tile").count() >= 6)
        await page.goto(BASE + "/#/apps/admin/users"); await page.wait_for_selector(".adm-user")
        await page.screenshot(path=f"{OUT}/e2e_admin.png", full_page=True)
        # delete an account: only after typing the username
        await api(page, "POST", "/api/users", {"username": "slettes", "displayName": "Prøve Person", "password": "Vinter2026xx"})
        await page.goto(BASE + "/#/apps/admin/users"); await page.reload(); await page.wait_for_selector(".adm-user:has-text('Prøve Person')")
        await page.click(".adm-user:has-text('Prøve Person') .adm-del")
        await page.wait_for_selector(".modal >> text=Slet Prøve Persons konto?")
        check("slet konto: knappen er låst, til brugernavnet er skrevet", await page.locator(".modal button:has-text('Slet kontoen')").is_disabled())
        await page.fill(".modal input[aria-label='Skriv brugernavnet for at bekræfte']", "slettes")
        await page.screenshot(path=f"{OUT}/delete-account.png")
        await page.click(".modal button:has-text('Slet kontoen')")
        await page.wait_for_selector(".adm-user:has-text('Prøve Person')", state="detached", timeout=6000)
        us = (await api(page, "GET", "/api/admin/users"))["data"]["users"]
        check("slet konto: kontoen er væk", all(u["username"] != "slettes" for u in us))
        check("log ud: knap i sidemenuen", await page.locator(".sidebar .side-logout").count() == 1)
        await page.goto(BASE + "/#/settings/security"); await page.wait_for_selector(".settings-body >> text=Aktive sessioner")
        check("log ud: knap under Sikkerhed", await page.locator(".settings-body button:has-text('Log ud')").first.is_visible())
        await page.goto(BASE + "/#/settings/apps"); await page.wait_for_selector(".settings-body >> text=På denne enhed")
        await page.wait_for_selector(".settings-body >> text=Opkald mellem netværk", timeout=8000)   # owner-only panels load a moment later
        check("indstillinger: notifikationer på enhed og mail", await page.locator(".settings-body >> text=På mail").count() >= 1 and await page.locator(".settings-body >> text=Mailserver").count() >= 1)
        # calls between different networks: the owner can add a TURN server, and it is handed to the call
        check("opkald: TURN-indstilling for ejeren", await page.locator(".settings-body >> text=Opkald mellem netværk").count() == 1)
        tp = page.locator("section:has-text('Opkald mellem netværk')")
        await tp.locator("input[aria-label='TURN-adresser']").fill("turn:turn.example.com:3478")
        await tp.locator("input[aria-label='Brugernavn']").fill("hub")
        await tp.locator("input[aria-label='Adgangskode']").fill("hemmelig")
        await tp.locator("button:has-text('Gem')").click(); await page.wait_for_timeout(1500)
        ic = (await api(page, "GET", "/api/cm/calls/ice-config"))["data"]
        check("opkald: TURN-server gemt", ic["urls"] == ["turn:turn.example.com:3478"] and ic["hasCredential"], ic)
        await tp.screenshot(path=f"{OUT}/turn-settings.png")
        await api(page, "PUT", "/api/cm/calls/ice-config", {"urls": ""})
        # the Windows app: connect to a friend's HUBTECH (the window's bridge is simulated here)
        wctx = await browser.new_context(viewport={"width": 1280, "height": 860}, storage_state=await ctx.storage_state())
        await wctx.add_init_script("""window.hubtechDesktop = { version: 1, server: '' }; window.__sent = [];
          window.chrome = window.chrome || {}; const ls = [];
          window.chrome.webview = { postMessage: (m) => { window.__sent.push(m); if (typeof m === 'string' && m.includes('ikke-til')) setTimeout(() => ls.forEach(f => f({ data: 'hubtech-server-error:Serveren kunne ikke nås.' })), 200); },
            addEventListener: (t, f) => ls.push(f), removeEventListener: () => {} };""")
        wp = await wctx.new_page()
        await wp.goto(BASE + "/#/settings/about"); await wp.wait_for_selector("text=Forbind til en anden HUBTECH")
        await wp.fill("input[aria-label='Adressen på den anden HUBTECH']", "https://ikke-til.example")
        await wp.click("section:has-text('Forbind til en anden HUBTECH') button:has-text('Forbind')")
        await wp.wait_for_selector("text=Serveren kunne ikke nås.")
        sent = await wp.evaluate("window.__sent")
        check("windows-app: forbind sender adressen til vinduet og viser fejl", "hubtech-server:https://ikke-til.example" in sent, sent)
        await wp.screenshot(path=f"{OUT}/windows-server.png")
        await wctx.close()
        # first start: the owner is asked once if friends elsewhere should join – and HUBTECH sets up Tailscale itself
        ts_state = os.environ.get("FAKE_TS_STATE")
        if ts_state:
            json.dump({"daemon": True, "loggedIn": True}, open(ts_state, "w"))
            fctx = await browser.new_context(viewport={"width": 1280, "height": 860}, storage_state=await ctx.storage_state())
            fp = await fctx.new_page()
            await fp.goto(BASE + "/#/"); await fp.evaluate("localStorage.removeItem('hubtech.friendsAsked')"); await fp.reload()
            await fp.wait_for_selector(".modal >> text=Skal venner på andre netværk", timeout=12000)
            check("venner: spørges første gang", True)
            await fp.click(".modal button:has-text('Sæt det op for mig')")
            await fp.wait_for_selector(".modal >> text=Tillad offentlig adgang", timeout=10000)
            await fp.screenshot(path=f"{OUT}/friends-allow.png")
            json.dump({"daemon": True, "loggedIn": True, "funnelAllowed": True}, open(ts_state, "w"))
            await fp.wait_for_selector(".modal >> text=min-pc.tail1234.ts.net", timeout=12000)
            check("venner: offentlig adresse vises når Tailscale er klar", "kan nu nås fra alle netværk" in await fp.inner_text(".modal"))
            await fp.screenshot(path=f"{OUT}/friends-done.png")
            await fp.click(".modal button:has-text('Luk')")
            await fp.goto(BASE + "/#/"); await fp.wait_for_timeout(3500)
            check("venner: spørges kun én gang", await fp.locator(".modal >> text=Skal venner på andre netværk").count() == 0)
            await fctx.close()
            await api(page, "POST", "/api/system/public-access", {"on": False})
        # the friend's first screen in the app: use a friend's HUBTECH instead of making one's own
        lctx = await browser.new_context(viewport={"width": 1280, "height": 860})
        await lctx.add_init_script("""window.hubtechDesktop = { version: 1, server: '' }; window.__sent = [];
          window.chrome = window.chrome || {}; window.chrome.webview = { postMessage: (m) => window.__sent.push(m), addEventListener: () => {}, removeEventListener: () => {} };""")
        lp = await lctx.new_page()
        await lp.goto(BASE + "/"); await lp.click("button:has-text('Forbind til en vens HUBTECH')")
        await lp.fill("input[aria-label='Adressen på din vens HUBTECH']", "https://min-pc.tail1234.ts.net")
        await lp.click(".modal button:has-text('Forbind')")
        await lp.wait_for_timeout(300)
        check("venner: appens første skærm kan forbinde til en vens HUBTECH", "hubtech-server:https://min-pc.tail1234.ts.net" in await lp.evaluate("window.__sent"))
        await lp.screenshot(path=f"{OUT}/friends-connect.png")
        await lctx.close()
        # mic blocked by the device: say exactly where to allow it (here: Windows in a browser)
        bctx = await browser.new_context(viewport={"width": 1280, "height": 860}, storage_state=await ctx.storage_state())
        await bctx.add_init_script("""navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('blocked', 'NotAllowedError'));
          Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36' });""")
        bp = await bctx.new_page()
        await bp.goto(BASE + "/#/settings/apps"); await bp.wait_for_selector("button:has-text('Test mikrofonen')")
        await bp.click("button:has-text('Test mikrofonen')")
        await bp.wait_for_selector(".modal >> text=HUBTECH må ikke bruge mikrofonen", timeout=6000)
        txt = await bp.inner_text(".modal")
        check("mikrofon blokeret: præcis vejledning til enheden", "ikonet til venstre for adressen" in txt and "Giv skrivebordsapps adgang" in txt, txt[:200])
        await bp.screenshot(path=f"{OUT}/mic-blocked.png")
        await bctx.close()
        # the Android app on its own: the computer is off → the phone's own HUBTECH, and "Skift tilbage" when it's back
        octx = await browser.new_context(**p.devices["Pixel 7"], storage_state=await ctx.storage_state())
        await octx.add_init_script("""window.__back = 0; window.HubtechAndroid = { isAndroidApp: () => true, appInfo: () => '{"versionCode":1000099}',
          offlineState: () => '{"remote":"https://min-pc.tail1234.ts.net","offline":true}', backToRemote: () => { window.__back++; } };
          try { localStorage.setItem('hubtech.updateCheck', String(Date.now())); localStorage.setItem('hubtech.friendsAsked', '1'); } catch (e) {}""")
        op = await octx.new_page()
        await op.goto(BASE + "/#/"); await op.wait_for_selector(".toast:has-text('Du bruger HUBTECH på telefonen')", timeout=12000)
        check("mobil uden computer: siger at telefonens egen HUBTECH bruges", True)
        await op.screenshot(path=f"{OUT}/offline-phone.png")
        await op.evaluate("window.hubtechServerBack(); 0")
        await op.click(".toast button:has-text('Skift tilbage')")
        check("mobil uden computer: 'Skift tilbage' når computeren er tændt igen", await op.evaluate("window.__back") == 1)
        await octx.close()
        # ── the new apps: IT-support, learning, games and workspace ──
        async def go(route, sel):
            await page.goto(BASE + "/#/" + route); await page.reload(); await page.wait_for_selector(sel, timeout=10000)
        await go("apps/printerdoctor", ".pd-problem")
        await page.click(".pd-problem:has-text('offline')")
        await page.fill("input[aria-label='Printermodel']", "HP LaserJet M404")
        await page.click("button:has-text('Start fejlfinding')")
        for ans in ["Ja", "Nej", "Ja", "Ja", "Nej", "Ja"]:      # tændt · ikke USB · har IP · svarer på ping · ikke offline-flueben · IP passer → genstart køen
            await page.click(f".pd-q button:has-text('{ans}')"); await page.wait_for_timeout(150)
        await page.wait_for_selector(".pd-fix")
        await page.click(".pd-fix button:has-text('Det virkede')")
        await page.wait_for_selector(".pd-done.is-ok")
        await page.click("button:has-text('Gem som servicenote')"); await page.wait_for_timeout(1500)
        notes = (await api(page, "GET", "/api/state/notes"))["data"]["state"]
        pdst = (await api(page, "GET", "/api/state/printerdoctor"))["data"]["state"]
        check("printer-doktor: sag løst og gemt som servicenote", pdst["cases"][0]["solved"] and any("Servicenote" in n["title"] and "LaserJet" in n["title"] for n in notes["notes"]), pdst["cases"][0]["log"])
        await page.screenshot(path=f"{OUT}/app-printerdoctor.png")
        await go("apps/commands", ".cmd")
        await page.fill("input[aria-label='Søg i kommandoer']", "flushdns"); await page.wait_for_timeout(200)
        check("kommandoer: søgning finder ipconfig /flushdns", await page.locator(".cmd").count() >= 1 and "flushdns" in await page.locator(".cmd").first.inner_text())
        await page.locator(".cmd-star").first.click(); await page.wait_for_timeout(1300)
        check("kommandoer: favorit gemmes", len((await api(page, "GET", "/api/state/commands"))["data"]["state"]["fav"]) == 1)
        await go("apps/checklists", ".pd-problem")
        await page.click(".pd-problem:has-text('Kundebesøg')"); await page.wait_for_selector(".cl-item")
        await page.locator(".cl-item input").nth(0).check(); await page.locator(".cl-item input").nth(1).check(); await page.wait_for_timeout(1300)
        cl = (await api(page, "GET", "/api/state/checklists"))["data"]["state"]["lists"][0]
        check("tjeklister: kundebesøg med 2 punkter krydset af", sum(1 for i in cl["items"] if i["done"]) == 2, cl["title"])
        await go("learn/glossary", ".gl-term")
        await page.fill("input[aria-label='Søg i ordbogen']", "toner"); await page.wait_for_timeout(200)
        check("it-ordbog: søgning finder Toner", "Toner" in await page.inner_text(".gl-list"))
        await go("learn/typing", ".ty-box")
        txt = (await page.inner_text(".ty-text")).replace("\u00a0", " ")
        await page.locator(".ty-input").focus(); await page.keyboard.type(txt, delay=15)
        await page.wait_for_selector(".ty-result", timeout=8000)
        check("tastaturtræner: teksten skrevet, hastighed vist", "ord/min" in await page.inner_text(".ty-result"))
        await page.screenshot(path=f"{OUT}/app-typing.png")
        await go("learn/quiz", ".qz-card")
        await page.click(".qz-card:has-text('Printer')")
        for _ in range(10):
            await page.locator(".gl-opt").first.click(); await page.click("button:has-text('Næste'), button:has-text('Se resultat')")
        await page.wait_for_selector(".gl-score"); await page.wait_for_timeout(1300)
        check("quiz: printerquizzen gennemført og gemt", (await api(page, "GET", "/api/state/quiz"))["data"]["state"]["best"].get("printer") is not None)
        await go("learn/bits", ".bt-bit")
        await page.click("button:has-text('Start spillet')")
        t = int(await page.inner_text(".bt-target"))
        for i, v in enumerate([8, 4, 2, 1]):
            if t & v: await page.locator(".bt-bit").nth(i).click()
        await page.wait_for_timeout(200)
        check("bit-spil: tallet lavet med bits giver point", await page.locator(".bt-stage .ty-live b").nth(1).inner_text() == "1")
        await go("apps/budget", ".bd-form")
        await page.click(".bd-page .segmented button:has-text('Indtægt')")
        await page.fill("input[aria-label='Beløb']", "20000"); await page.fill("input[aria-label='Tekst']", "Løn"); await page.click(".bd-form button:has-text('Tilføj')")
        await page.click(".bd-page .segmented button:has-text('Udgift')")
        await page.fill("input[aria-label='Beløb']", "5000"); await page.fill("input[aria-label='Tekst']", "Husleje"); await page.click(".bd-form button:has-text('Tilføj')")
        await page.wait_for_timeout(300)
        check("budget: 20.000 ind og 5.000 ud giver 15.000 tilbage", "15.000" in await page.locator(".bd-tile").nth(2).inner_text(), await page.locator(".bd-tile").nth(2).inner_text())
        await page.screenshot(path=f"{OUT}/app-budget.png")
        # ── the next batch: Sudoku, Fire på stribe, Galgeleg, Hardwaretest, Kodeord, QR-koder, Svarskabeloner, Phishing-træner ──
        await go("apps/sudoku", ".sd-cell"); await page.wait_for_timeout(1500)
        sd = (await api(page, "GET", "/api/state/sudoku"))["data"]["state"]["game"]
        empty = sd["puzzle"].index(0)
        await page.locator(".sd-cell").nth(empty).click(); await page.click(f".sd-num[data-n='{sd['solution'][empty]}']")
        await page.wait_for_timeout(200)
        check("sudoku: et tal skrevet i et tomt felt", (await page.locator(".sd-cell").nth(empty).inner_text()).strip() == str(sd["solution"][empty]))
        check("sudoku: kun én løsning, og tallet er rigtigt", sd["puzzle"].count(0) >= 40)
        await page.screenshot(path=f"{OUT}/app-sudoku.png")
        await page.click(".sd-page .segmented button:has-text('Dagens sudoku')")
        await page.click(".modal button:has-text('Nyt spil')")          # the game in progress is replaced
        await page.wait_for_selector(".panel:has-text('Dagens liste')")
        p1_ = await page.evaluate("[...document.querySelectorAll('.sd-cell')].map(c => c.textContent.trim()).join(',')")
        await page.wait_for_timeout(1500)                                  # saved on the account
        await page.reload(); await page.wait_for_selector(".sd-cell")
        check("dagens sudoku: samme opgave efter genindlæsning og med dagens liste", p1_ == await page.evaluate("[...document.querySelectorAll('.sd-cell')].map(c => c.textContent.trim()).join(',')") and await page.locator(".panel:has-text('Dagens liste')").is_visible())
        await go("apps/connect4", ".c4-col")
        await page.locator(".c4-local .c4-col").nth(3).click(); await page.wait_for_timeout(900)
        await page.click(".c4-coach"); await page.wait_for_timeout(200)
        check("fire på stribe: Gnist forklarer viser et råd og markerer kolonnen", "Læg i kolonne" in await page.inner_text(".gn-coach-slot") and await page.locator(".c4-col.is-hint").count() == 1, await page.inner_text(".gn-coach-slot"))
        await page.click(".c4-coach")
        check("fire på stribe: din brik og computerens svar", await page.locator(".c4-cell.p1").count() == 1 and await page.locator(".c4-cell.p2").count() == 1)
        await page.screenshot(path=f"{OUT}/app-connect4.png")
        await go("apps/hwtest", ".hw-kv")
        check("hardwaretest: systeminfo vises", "Processorkerner" in await page.inner_text(".hw-info"))
        await page.click(".hw-page .segmented button:has-text('Tastatur')"); await page.wait_for_selector(".hw-key")
        for k in ["KeyA", "KeyS", "Space", "Enter"]:
            await page.keyboard.press(k.replace("Key", "") if k.startswith("Key") else k)
        check("hardwaretest: tryk på taster bliver grønne", await page.locator(".hw-key.is-ok").count() >= 4, await page.locator(".hw-key.is-ok").count())
        await page.click(".hw-verdict button:has-text('Ja')")
        await page.screenshot(path=f"{OUT}/app-hwtest.png")
        await page.click(".hw-page .segmented button:has-text('Skærm')"); await page.click("button:has-text('Start skærmtest')")
        await page.wait_for_selector(".hw-fs"); await page.keyboard.press("Escape"); await page.wait_for_timeout(200)
        check("hardwaretest: skærmtest i fuld skærm lukker med Esc", await page.locator(".hw-fs").count() == 0)
        await page.click("button:has-text('Gem som servicenote')"); await page.wait_for_timeout(1500)
        notes = (await api(page, "GET", "/api/state/notes"))["data"]["state"]["notes"]
        check("hardwaretest: rapport gemt i Noter", any(n["title"].startswith("Hardwaretest") and "Tastatur: OK" in n["body"] for n in notes))
        await go("apps/passwords", ".pw-out")
        pw = await page.inner_text(".pw-out")
        check("kodeord: kodesætning med 5 ord og tal", len(pw.split("-")) == 6, pw)
        await page.click(".pw-page .segmented button:has-text('Tjek en kode')")
        await page.fill("input[aria-label='Kode der skal tjekkes']", "Sommer2024!")
        check("kodeord: 'Sommer2024!' vurderes som svag", "svag" in (await page.inner_text(".pw-verdict")).lower())
        await page.screenshot(path=f"{OUT}/app-passwords.png")
        await go("apps/qrtool", ".qr-form")
        await page.fill("input[aria-label='Netværksnavn (SSID)']", "Gæstenet"); await page.fill("input[aria-label='Adgangskode']", "velkommen123")
        await page.wait_for_selector(".qr-preview svg", timeout=8000)
        await page.click(".qr-acts button:has-text('Gem')"); await page.wait_for_timeout(1300)
        qs = (await api(page, "GET", "/api/state/qrtool"))["data"]["state"]["saved"]
        check("qr-koder: Wi-Fi-kode vist og gemt", len(qs) == 1 and qs[0]["data"]["ssid"] == "Gæstenet")
        await page.screenshot(path=f"{OUT}/app-qrtool.png")
        await go("apps/replies", ".rp-out")
        await page.fill("input[aria-label='kundens navn']", "Anne"); await page.fill("input[aria-label='dit navn']", "Lucas")
        txt = await page.inner_text(".rp-out")
        check("svarskabeloner: felterne udfyldes i teksten", txt.startswith("Hej Anne") and "Lucas" in txt, txt[:80])
        await go("learn/phishing", ".ph-card")
        await page.click(".ph-btns button >> nth=0"); await page.wait_for_selector(".ph-answer")
        await page.wait_for_timeout(1300)
        check("phishing-træner: svar giver forklaring og gemmes", len((await api(page, "GET", "/api/state/phishing"))["data"]["state"]["seen"]) == 1)
        await page.screenshot(path=f"{OUT}/app-phishing.png")
        await page.goto(BASE + "/#/learn/guide/sec-clicked"); await page.wait_for_timeout(1200)
        check("sikkerhedsguides: “Jeg har klikket på et falsk link” findes", "falsk link" in await page.inner_text("main"))
        # ── Kryds og bolle, Aim-træner, Gæt flaget, Budget med skat ──
        await go("apps/budget", ".bd-tax")
        await page.fill("input[aria-label='Løn før skat pr. måned']", "30000")
        out = await page.inner_text(".bd-tax-out")
        check("budget: løn før skat giver udbetalt løn", "Til udbetaling" in out and "AM-bidrag" in out, out)
        await page.click("button:has-text('Brug som indtægt denne måned')"); await page.wait_for_timeout(1300)
        bd = (await api(page, "GET", "/api/state/budget"))["data"]["state"]
        net = [i for i in bd["items"] if i["text"] == "Løn (efter skat)"]
        # 30000 − 99 ATP = 29901; AM 2392,08 → 27508,92; A-skat 37 % af (27508,92 − 4500) = 8513,30 → 18996
        check("budget: udbetalt løn regnet rigtigt (18.996 kr.)", net and net[0]["amount"] == 18996, net)
        # ── Skak ──
        await go("apps/chess", ".ch-setup-row")
        await page.click(".ch-page button:has-text('Start partiet')"); await page.wait_for_selector(".ch-board")
        await page.click(".ch-sq[data-sq='e2']")
        check("skak: lovlige træk vises", await page.locator(".ch-sq.is-target").count() == 2)
        check("skak: Gnist forklarer kun, hvis man vælger det", await page.locator(".ch-coach").count() == 0)
        await page.click(".ch-sq[data-sq='e4']")
        await page.wait_for_selector(".ch-moves li span:nth-child(3):not(:empty)", timeout=15000)
        await page.wait_for_timeout(1800)
        ch = (await api(page, "GET", "/api/state/chess"))["data"]["state"]["game"]
        check("skak: computeren svarer, og partiet gemmes", len(ch["line"]) == 2 and ch["s"]["moves"][0] == "e4", str(ch["s"]["moves"]))
        await page.click(".ch-sq[data-sq='e1']")
        check("skak: kongen kan ikke flytte gennem egne brikker", await page.locator(".ch-sq.is-target").count() == 1)
        await page.click(".ch-sq[data-sq='g1']"); await page.click(".ch-sq[data-sq='f3']")
        await page.wait_for_selector(".ch-moves li:nth-child(2) span:nth-child(3):not(:empty)", timeout=15000)
        await page.screenshot(path=f"{OUT}/app-chess.png")
        await page.click(".ch-page button:has-text('Fortryd')"); await page.wait_for_timeout(300)
        check("skak: fortryd tager dit og computerens træk tilbage", await page.locator(".ch-moves li").count() == 1)
        await page.click(".ch-page button:has-text('Hint')")
        await page.wait_for_selector(".ch-sq.is-hint", timeout=10000)
        check("skak: hint viser et træk", await page.locator(".ch-sq.is-hint").count() == 2)
        # two on one screen with a clock
        await page.click(".ch-page button:has-text('Nyt parti')"); await page.wait_for_timeout(400)
        if await page.locator(".modal button:has-text('Nyt parti')").count():
            await page.click(".modal button:has-text('Nyt parti')")
        await page.wait_for_selector(".ch-setup-row")
        await page.click(".ch-setup-row button:has-text('To på samme skærm')"); await page.click(".ch-setup-row button:has-text('3 min + 2 s')")
        await page.click(".ch-page button:has-text('Start partiet')"); await page.wait_for_selector(".ch-clock")
        await page.click(".ch-sq[data-sq='d2']"); await page.click(".ch-sq[data-sq='d4']"); await page.wait_for_timeout(1500)
        black = await page.inner_text(".ch-clock.is-on")
        check("skak: skakuret går for den, der skal trække", black.startswith("2:5"), black)
        await page.screenshot(path=f"{OUT}/app-chess-clock.png")
        # rated game against a bot: seven bots, resigning moves the rating, the ranking shows it
        await page.click(".ch-page button:has-text('Nyt parti')"); await page.wait_for_timeout(300)
        if await page.locator(".modal button:has-text('Nyt parti')").count():
            await page.click(".modal button:has-text('Nyt parti')")
        await page.wait_for_selector(".ch-setup-row")
        await page.click(".ch-setup-row button:has-text('Mod en bot')"); await page.wait_for_selector(".ch-bot")
        tiers = [x.strip() for x in await page.locator(".ch-tiers button").all_text_contents()]
        await page.click(".ch-tiers button:has-text('Begynder')"); await page.wait_for_selector(".ch-bot[data-bot='mini']")
        check("skak: 16 bots i fire faner – Begynder har Mini-Mia og Gnist", len(tiers) == 4 and all(t.endswith("4") for t in tiers) and await page.locator(".ch-bot").count() == 4 and await page.locator(".ch-bot[data-bot='gnist']").count() == 1, tiers)
        await page.click(".ch-tiers button:has-text('Stærk')")
        check("skak: den stærkeste er Stormester Storm (2400)", "2400" in await page.inner_text(".ch-bot[data-bot='storm']") and await page.locator(".ch-rec").count() == 0)
        await page.click(".ch-tiers button >> nth=2"); await page.click(".ch-bot[data-bot='tanja']"); await page.click(".ch-setup-row button:has-text('Med rating')"); await page.click(".ch-setup-row button:has-text('Hvid')")
        await page.screenshot(path=f"{OUT}/app-chess-bots.png")
        await page.click(".ch-page button:has-text('Start partiet')"); await page.wait_for_selector(".ch-board")
        check("skak: botten står med navn og rating", "Taktik-Tanja (1300)" in await page.inner_text(".ch-main"))
        await page.click(".ch-sq[data-sq='d2']"); await page.click(".ch-sq[data-sq='d4']")
        await page.wait_for_selector(".ch-moves li span:nth-child(3):not(:empty)", timeout=20000)
        await page.click(".ch-page button:has-text('Opgiv')"); await page.click(".modal button:has-text('Opgiv')"); await page.wait_for_timeout(800)
        rt = (await api(page, "GET", "/api/state/chess"))["data"]["state"].get("rating") or {}
        check("skak: et tabt parti med rating flytter din rating", rt.get("games") == 1 and 760 < rt.get("r", 0) < 800, rt)
        lad = (await api(page, "GET", "/api/chess/ratings"))["data"]["entries"]
        check("skak: ranglisten viser din rating", any(e["me"] and e["r"] == rt.get("r") for e in lad), lad)
        await page.click(".ch-page button:has-text('Nyt parti')"); await page.wait_for_selector(".ch-rating")
        check("skak: rang og rating vises", str(rt.get("r")) in await page.inner_text(".ch-rating") and "Springer" in await page.inner_text(".ch-rating"))
        # Gnist teaches chess: lessons with a board, then a game where she explains the moves
        check("skak: lektionerne er kun et tilbud – de er foldet sammen", await page.locator(".chl-board").count() == 0)
        await page.click(".chl button:has-text('Start lektionerne')")
        check("skak: Gnist har lektioner med et bræt", await page.locator(".chl-board .chl-sq").count() == 64)
        await page.click(".chl button:has-text('Næste')")
        check("skak: lektionen om tårnet viser, hvor det kan gå", "Tårnet" in await page.inner_text(".chl-title") and await page.locator(".chl-sq.is-dot").count() == 14)
        await page.screenshot(path=f"{OUT}/chess-gnist-lesson.png")
        await page.click(".chl button:has-text('Spil og lær mod Gnist')"); await page.wait_for_selector(".ch-board")
        check("skak: Gnist byder velkommen som træner", "Hint" in await page.inner_text(".ch-coach"))
        await page.click(".ch-sq[data-sq='e2']"); await page.click(".ch-sq[data-sq='e4']")
        await page.wait_for_selector(".ch-moves li span:nth-child(3):not(:empty)", timeout=15000); await page.wait_for_timeout(400)
        coach_txt = await page.inner_text(".ch-coach")
        check("skak: Gnist forklarer dit træk og sit eget", "midten" in coach_txt and "Jeg flyttede" in coach_txt, coach_txt)
        await page.screenshot(path=f"{OUT}/chess-gnist-coach.png")
        await page.click(".ch-page button:has-text('Hint')")
        await page.wait_for_function("() => (document.querySelector('.ch-coach')?.innerText || '').includes('Hint:')", timeout=10000)
        check("skak: hintet kommer med en forklaring", "Hint:" in await page.inner_text(".ch-coach"))
        # ── Netværksberegner ──
        await go("apps/netcalc", ".nc-input")
        await page.fill(".nc-input", "10.0.5.77/22"); await page.wait_for_timeout(200)
        out = await page.inner_text(".nc-out")
        check("netværk: subnet regnes ud", "10.0.4.0/22" in out and "10.0.7.255" in out and "1.022" in out, out[:200])
        await page.fill("input[aria-label='En anden adresse']", "10.0.6.1")
        check("netværk: samme net?", "Ja" in await page.inner_text(".nc-same"))
        await page.screenshot(path=f"{OUT}/app-netcalc.png")
        await page.click(".nc-page .segmented button:has-text('Downloadtid')")
        check("netværk: downloadtid", "5 min. 20 sek." in await page.inner_text(".nc-big"))
        # ── Regnemaskine ──
        await go("apps/calculator", ".calc-input")
        await page.fill(".calc-input", "(2+3)·4^2 − √9"); await page.wait_for_timeout(100)
        check("regnemaskine: viser resultatet, mens man skriver", "77" in await page.inner_text(".calc-result"))
        await page.press(".calc-input", "Enter")
        check("regnemaskine: = og historik", await page.input_value(".calc-input") == "77" and "77" in await page.inner_text(".calc-hist"))
        await page.click(".calc-key[aria-label='Divider']"); await page.click(".calc-key:text-is('0')"); await page.click(".calc-key.is-eq")
        check("regnemaskine: forklarer fejl på dansk", "dividere med 0" in await page.inner_text(".calc-result"))
        await page.screenshot(path=f"{OUT}/app-calculator.png")
        await page.click(".calc-page .segmented button:has-text('Lån og opsparing')"); await page.wait_for_selector(".calc-out")
        check("regnemaskine: lån pr. måned", "3.866,56 kr." in await page.inner_text(".calc-out"))
        # ── Spil sammen: Fire på stribe online and the Fart-tast race between two people ──
        async def login_ctx(user, pw, **kw):
            c = await browser.new_context(**(kw or {"viewport": {"width": 1280, "height": 860}}))
            await c.add_init_script("try { localStorage.setItem('hubtech.friendsAsked','1'); localStorage.setItem('hubtech.updateCheck', String(Date.now())); } catch(e) {}")
            pg = await c.new_page()
            await pg.goto(BASE + "/#/login"); await pg.fill("#login-user", user); await pg.fill("#login-pass", pw); await pg.click("button[type=submit]")
            await pg.wait_for_selector(".home-title", timeout=20000)
            return c, pg
        c1, p1 = await login_ctx("oliver", "Sommer2026x!")
        p1_errs = []; p1.on("pageerror", lambda e: p1_errs.append(str(e)[:300])); p1.on("console", lambda m: p1_errs.append(m.type + ": " + m.text[:200]) if m.type in ("error", "warning") else None)
        c2, p2 = await login_ctx("maja", "Vinter2026xx", **p.devices["Pixel 7"])
        await p2.wait_for_timeout(2500)      # the live connection is up
        await p1.goto(BASE + "/#/apps/connect4/online"); await p1.reload(); await p1.wait_for_selector(".gr-player")
        await p1.click(".gr-player:has-text('Maja')"); await p1.click(".c4-page button:has-text('Udfordr')")
        await p1.wait_for_selector(".c4-online .c4-status:has-text('Venter')")
        await p2.wait_for_selector(".toast:has-text('vil spille Fire på stribe')", timeout=15000)
        check("spil sammen: invitationen dukker op hos den anden", True)
        await p2.click(".toast:has-text('vil spille') button:has-text('Åbn')")
        await p2.wait_for_selector(".c4-vs", timeout=10000)
        await p1.wait_for_selector(".c4-online .c4-status:has-text('tur')", timeout=10000)
        check("spil sammen: begge ser brættet, når invitationen er taget imod", "Venter" not in await p1.inner_text(".c4-online .c4-status"))
        await p2.screenshot(path=f"{OUT}/online-c4-phone.png")
        first, second = (p1, p2) if "Din tur" in await p1.inner_text(".c4-online .c4-status") else (p2, p1)
        for i in range(3):
            await first.wait_for_selector(".c4-online .c4-status:has-text('Din tur')"); await first.locator(".c4-online .c4-col").nth(0).click()
            await second.wait_for_selector(".c4-online .c4-status:has-text('Din tur')"); await second.locator(".c4-online .c4-col").nth(1).click()
        await first.wait_for_selector(".c4-online .c4-status:has-text('Din tur')"); await first.locator(".c4-online .c4-col").nth(0).click()
        await second.wait_for_selector(".c4-online .c4-status:has-text('vandt')", timeout=8000)
        await first.wait_for_selector(".c4-online .c4-status:has-text('Du vandt')", timeout=8000)
        check("spil sammen: fire på stribe online – vinderen ses hos begge", await first.locator(".c4-online .c4-cell.is-win").count() == 4 and await second.locator(".c4-online .c4-cell.is-win").count() == 4)
        await p1.screenshot(path=f"{OUT}/online-c4.png")
        # Kryds og bolle online + someone watching
        await p1.goto(BASE + "/#/apps/community/friends"); await p1.reload(); await p1.wait_for_timeout(1500)
        btn = p1.locator("button[aria-label='Spil med Maja']")
        if await btn.count():
            await btn.first.click(); await p1.wait_for_selector(".modal:has-text('Spil med Maja')")
            await p1.click(".modal button:has-text('Fire på stribe')"); await p1.wait_for_selector(".c4-online", timeout=10000)
            check("fællesskab: udfordr en ven til et spil", "/apps/connect4/online/" in p1.url)
            rid = p1.url.split("/")[-1]; await api(p1, "POST", f"/api/games/rooms/{rid}/leave", {})
        else:
            check("fællesskab: udfordr en ven til et spil", False, "ingen knap")
        # Ejendomskongen online
        await p1.goto(BASE + "/#/apps/chess/online"); await p1.reload(); await p1.wait_for_selector(".gr-player")
        await p1.click(".gr-player:has-text('Maja')"); await p1.click(".ch-page button:has-text('Udfordr')")
        await p2.wait_for_selector(".toast:has-text('vil spille Skak')", timeout=15000)
        await p2.click(".toast:has-text('Skak') button:has-text('Åbn')")
        await p1.wait_for_selector(".ch-page button:has-text('Start partiet'):not([disabled])", timeout=10000)
        await p1.click(".ch-setup-row button:has-text('Hvid')"); await p1.click(".ch-page button:has-text('Start partiet')")
        await p1.wait_for_selector(".ch-board", timeout=10000); await p2.wait_for_selector(".ch-board.is-flipped", timeout=10000)
        await p1.click(".ch-sq[data-sq='e2']"); await p1.click(".ch-sq[data-sq='e4']")
        await p2.wait_for_selector(".ch-moves li:has-text('e4')", timeout=8000)
        await p2.click(".ch-sq[data-sq='c7']"); await p2.click(".ch-sq[data-sq='c5']")
        await p1.wait_for_selector(".ch-moves li:has-text('c5')", timeout=8000)
        check("skak online: trækkene går begge veje live", True)
        check("skak online: skakur hos begge", await p2.locator(".ch-clock").count() == 2 and await p1.locator(".ch-clock.is-on").count() == 1)
        await p1.click(".ch-page button:has-text('Tilbyd remis')")
        await p2.wait_for_selector(".ch-offer:has-text('tilbyder remis')", timeout=8000)
        await p2.click(".ch-offer button:has-text('Tag imod')")
        await p1.wait_for_selector(".ch-status.is-over:has-text('Uafgjort')", timeout=8000)
        check("skak online: remis efter aftale", True)
        await p2.wait_for_timeout(500); await p2.screenshot(path=f"{OUT}/online-chess-phone.png")
        await p1.goto(BASE + "/#/"); await p2.goto(BASE + "/#/")
        # race
        # ── Sammen: Afstemninger, Arrangementer og Formularer (delt mellem to, og et link uden konto) ──
        await p1.goto(BASE + "/#/apps/polls"); await p1.wait_for_selector(".pl-page .sh-top")
        await p1.click(".pl-page button:has-text('Ny afstemning')")
        await p1.fill("input[aria-label='Spørgsmål']", "Pizza eller burger?")
        await p1.fill("input[aria-label='Mulighed 1']", "Pizza"); await p1.fill("input[aria-label='Mulighed 2']", "Burger")
        await p1.click(".pl-page button:has-text('Opret og del')")
        await p1.wait_for_selector(".modal .sh-person-btn:has-text('Maja')")
        await p1.click(".modal .sh-person-btn:has-text('Maja')"); await p1.click(".modal button:has-text('Gem')")
        await p1.wait_for_selector(".pl-opt")
        await p2.wait_for_selector(".toast:has-text('har delt noget med dig')", timeout=15000)
        check("afstemninger: den anden får besked, når hun bliver inviteret", True)
        await p2.goto(BASE + "/#/apps/polls"); await p2.wait_for_selector(".sh-card:has-text('Pizza eller burger?')")
        await p2.click(".sh-card:has-text('Pizza eller burger?')"); await p2.wait_for_selector(".pl-pick")
        await p2.click("button[aria-label='Stem på Burger']")
        await p1.wait_for_selector(".pl-opt.is-top:has-text('Burger')", timeout=10000)
        check("afstemninger: stemmen dukker op live hos den, der spurgte", "100 %" in await p1.inner_text(".pl-opt.is-top"))
        await p1.click("button[aria-label='Stem på Pizza']"); await p1.wait_for_timeout(600)
        check("afstemninger: to stemmer, 50/50", (await p1.inner_text(".pl-opts")).count("50 %") == 2)
        await p1.screenshot(path=f"{OUT}/app-polls.png")
        await p2.screenshot(path=f"{OUT}/app-polls-phone.png")
        # Arrangementer
        await p1.goto(BASE + "/#/apps/forms"); await p1.wait_for_selector(".fm-page .sh-top")
        await p1.click(".fm-page button:has-text('Feedback')")
        await p1.wait_for_selector(".fm-builder")
        check("formularer: skabelonen har fire spørgsmål og en forhåndsvisning", await p1.locator(".fm-bfield").count() == 4 and await p1.locator(".fm-preview .fm-scale").count() == 1)
        await p1.click(".fm-add button:has-text('Ét valg')")
        await p1.fill("input[aria-label='Spørgsmål 5']", "Hvilken dag passer bedst?")
        await p1.fill(".fm-bfield:nth-child(5) textarea", "Mandag\nTirsdag\nOnsdag")
        await p1.screenshot(path=f"{OUT}/app-forms-builder.png")
        await p1.click(".sh-detail-h button:has-text('Gem og del')")
        await p1.wait_for_selector(".modal"); await p1.click(".modal button:has-text('Gem')")
        await p1.wait_for_selector(".fm-url")
        link = await p1.inner_text(".fm-url")
        c3 = await browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        anon = await c3.new_page(); await anon.goto(link); await anon.wait_for_selector(".fm-pub .fm-fill")
        check("formularer: linket virker uden en konto", await anon.locator(".pub-foot:has-text('Prøv HUBTECH')").count() == 1)
        await anon.click(".fm-pub button:has-text('Send')")
        check("formularer: obligatoriske spørgsmål tjekkes", "Udfyld" in await anon.inner_text(".fm-pub .field-error"))
        await anon.click(".fm-scale-n:has-text('4')"); await anon.fill("textarea[aria-label='Hvad var godt?']", "Maden")
        await anon.click(".fm-choice:has-text('Ja')"); await anon.click(".fm-choice:has-text('Tirsdag')")
        await anon.screenshot(path=f"{OUT}/app-forms-public.png")
        await anon.click(".fm-pub button:has-text('Send')")
        await anon.wait_for_selector(".pub-done")
        check("formularer: tak-siden vises efter svaret", "Tak for dit svar" in await anon.inner_text(".pub-done"))
        await c3.close()
        await p1.wait_for_selector(".fm-sumbar b:has-text('1')", timeout=10000)
        txt = await p1.inner_text(".fm-page")
        check("formularer: svaret dukker op live som grafer", "Maden" in txt and "100 %" in txt)
        await p1.screenshot(path=f"{OUT}/app-forms-results.png")
        async with p1.expect_download() as dl:
            await p1.click(".fm-sumbar button:has-text('Hent til Excel')")
        csv = open(await (await dl.value).path(), encoding="utf-8-sig").read()
        check("formularer: svarene kan hentes til Excel", "Hvilken dag passer bedst?" in csv and "Tirsdag" in csv and ";" in csv, csv[:120])
        # Væggen – a post with a #tag and a picture, a heart and a comment from the other one
        def _png(rgb, w=64, h=48):
            import struct, zlib
            raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
            ch = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
            return b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + ch(b"IDAT", zlib.compress(raw)) + ch(b"IEND", b"")
        await p2.goto(BASE + "/#/apps/qa"); await p2.wait_for_selector(".qa-page .sh-top")
        await p2.click(".qa-page button:has-text('Stil et spørgsmål')")
        await p2.fill("input[aria-label='Dit spørgsmål']", "Hvordan finder man arealet af en cirkel?")
        await p2.select_option("select[aria-label='Fag']", "Matematik")
        await p2.fill("textarea[aria-label='Forklaring']", "Vi har fået en opgave med radius 3 cm.")
        await p2.click(".qa-page button:has-text('Stil spørgsmålet')")
        await p2.wait_for_selector(".qa-q h2")
        await p1.goto(BASE + "/#/apps/qa"); await p1.wait_for_selector(".qa-card:has-text('arealet af en cirkel')")
        await p1.click(".qa-subjects .sh-tag:has-text('Matematik')")
        check("spørg og svar: spørgsmålet kan findes under faget", await p1.locator(".qa-card:has-text('arealet af en cirkel')").count() == 1)
        await p1.click(".qa-card:has-text('arealet af en cirkel')"); await p1.wait_for_selector(".qa-write")
        await p1.fill("textarea[aria-label='Dit svar']", "Brug A = π · r². Med r = 3 cm bliver det ca. 28,3 cm².")
        await p1.click(".qa-write button:has-text('Send svar')")
        await p2.wait_for_selector(".qa-answer:has-text('28,3')", timeout=10000)
        await p2.click(".qa-answer button[aria-label='Godt svar']"); await p2.wait_for_timeout(500)
        await p2.click(".qa-answer button:has-text('Det løste det')")
        await p2.wait_for_selector(".qa-answer.is-accepted")
        await p1.wait_for_selector(".qa-answer.is-accepted", timeout=10000)
        check("spørg og svar: svaret stemmes op og markeres som løsningen", (await p1.inner_text(".qa-answer .qa-vote b")) == "1")
        await p1.screenshot(path=f"{OUT}/app-qa.png")
        # Fotoalbum
        await p1.goto(BASE + "/#/apps/expenses"); await p1.wait_for_selector(".ex-page .sh-top")
        await p1.click(".ex-page button:has-text('Ny gruppe')")
        await p1.fill("input[aria-label='Navn på gruppen']", "Sommerhus")
        await p1.fill("input[aria-label='Gæst uden konto']", "Bo"); await p1.keyboard.press("Enter")
        await p1.click(".ex-page button:has-text('Opret og invitér')")
        await p1.wait_for_selector(".modal .sh-person-btn:has-text('Maja')")
        await p1.click(".modal .sh-person-btn:has-text('Maja')"); await p1.click(".modal button:has-text('Gem')")
        await p1.wait_for_selector(".ex-summary")
        await p1.click(".ex-add"); await p1.wait_for_selector(".modal .ex-split")
        await p1.fill(".modal input[aria-label='Hvad']", "Indkøb"); await p1.fill(".modal input[aria-label='Beløb i kr.']", "300")
        await p1.click(".modal button:has-text('Tilføj')"); await p1.wait_for_selector(".ex-row:has-text('Indkøb')")
        await p2.goto(BASE + "/#/apps/expenses"); await p2.wait_for_selector(".sh-card:has-text('Sommerhus')")
        await p2.click(".sh-card:has-text('Sommerhus')"); await p2.wait_for_selector(".ex-summary")
        await p2.click(".ex-add"); await p2.wait_for_selector(".modal .ex-split")
        await p2.fill(".modal input[aria-label='Hvad']", "Benzin"); await p2.fill(".modal input[aria-label='Beløb i kr.']", "90")
        await p2.select_option(".modal select[aria-label='Kategori']", "Transport")
        await p2.click(".modal .ex-person:has-text('Bo') input"); await p2.click(".modal button:has-text('Tilføj')")
        await p1.wait_for_selector(".ex-row:has-text('Benzin')", timeout=10000)
        pay = await p1.inner_text(".ex-pay")
        check("fællesudgifter: hvem skylder hvem regnes rigtigt", "55,00 kr." in pay and "100,00 kr." in pay and "Bo" in pay, pay)
        check("fællesudgifter: min status vises", "155,00 kr." in await p1.inner_text(".ex-summary"))
        await p1.screenshot(path=f"{OUT}/app-expenses.png")
        await p1.click(".ex-payrow:has-text('Maja') button:has-text('Betalt')"); await p1.click(".modal button:has-text('Ja, betalt')")
        await p1.wait_for_selector(".ex-row:has-text('Maja betalte')")
        await p1.wait_for_timeout(500)
        pay2 = await p1.inner_text(".ex-pay")
        check("fællesudgifter: en betaling gør Maja kvit", "Maja" not in pay2, pay2)
        # Wiki – a page with a link to a new page, history
        await p1.goto(BASE + "/#/apps/wiki"); await p1.wait_for_selector(".wk-page .sh-top")
        await p1.click(".wk-page button:has-text('Ny wiki')")
        await p1.fill("input[aria-label='Navn på wikien']", "Klassens noter")
        await p1.click(".wk-page button:has-text('Opret')")
        await p1.wait_for_selector(".modal"); await p1.click(".modal .sh-person-btn:has-text('Maja')"); await p1.click(".modal button:has-text('Gem')")
        await p1.wait_for_selector(".wk-md")
        check("wiki: forsiden laves med links til nye sider", await p1.locator(".wk-link.is-new").count() == 2)
        await p1.click(".wk-link:has-text('Regler')"); await p1.wait_for_selector(".wk-editor")
        await p1.fill("textarea[aria-label='Sidens tekst']", "# Regler\n\n- Vær **sød** ved hinanden\n- Se også [[Forside]]")
        check("wiki: forhåndsvisning mens man skriver", await p1.locator(".wk-preview strong:has-text('sød')").count() == 1)
        await p1.click(".wk-editor button:has-text('Gem')"); await p1.wait_for_selector(".wk-head h2:has-text('Regler')")
        check("wiki: siden gemmes og viser hvem der linker til den", await p1.locator(".wk-back .sh-tag:has-text('Forside')").count() == 1, await p1.inner_text(".wk-main"))
        await p2.goto(BASE + "/#/apps/wiki"); await p2.click(".sh-card:has-text('Klassens noter')"); await p2.wait_for_selector(".wk-md")
        await p2.click(".wk-pages button:has-text('Regler')"); await p2.click(".wk-head button:has-text('Ret')")
        await p2.fill("textarea[aria-label='Sidens tekst']", "# Regler\n\n- Vær sød ved hinanden\n- Ingen mobiler i timen")
        await p2.click(".wk-editor button:has-text('Gem')"); await p2.wait_for_selector(".wk-md li:has-text('mobiler')")
        await p1.wait_for_selector(".wk-md li:has-text('mobiler')", timeout=10000)
        await p1.click(".wk-head button:has-text('Historik')")
        await p1.wait_for_selector(".wk-main details")
        await p1.click(".wk-main details summary")
        check("wiki: den anden kan rette, og den gamle version gemmes", "sød" in await p1.inner_text(".wk-main details"), await p1.inner_text(".wk-main"))
        await p1.click(".wk-main button:has-text('Gendan')"); await p1.wait_for_selector(".wk-md strong:has-text('sød')")
        check("wiki: en gammel version kan hentes tilbage", await p1.locator(".wk-md li:has-text('mobiler')").count() == 0)
        await p1.screenshot(path=f"{OUT}/app-wiki.png")
        # Udfordringer
        await p1.goto(BASE + "/#/apps/booking"); await p1.wait_for_selector(".bk2-page .sh-top")
        await p1.click(".bk2-page button:has-text('Ny bookingside')")
        await p1.fill("input[aria-label='Navn']", "Lektiehjælp i matematik"); await p1.fill("input[aria-label='Sted']", "Biblioteket")
        for d in ["Lør", "Søn"]:
            await p1.click(f".bk2-wd .sh-tag:has-text('{d}')")
        await p1.click(".bk2-page button:has-text('Opret siden')"); await p1.wait_for_selector(".fm-url")
        blink = await p1.inner_text(".fm-url")
        c5 = await browser.new_context(**p.devices["Pixel 7"]); g = await c5.new_page()
        await g.goto(blink); await g.wait_for_selector(".bk2-pub .bk2-day")
        await g.locator(".bk2-day:not([disabled])").nth(1).click()
        tm = await g.locator(".bk2-time:not([disabled])").first.inner_text()
        await g.locator(".bk2-time:not([disabled])").first.click()
        await g.fill("input[aria-label='Dit navn']", "Sofie"); await g.fill("input[aria-label='E-mail']", "sofie@eksempel.dk")
        await g.screenshot(path=f"{OUT}/app-booking-public.png")
        await g.click(".bk2-form button:has-text('Book')"); await g.wait_for_selector(".pub-done")
        check("booking: en tid kan bookes via linket uden konto", "Du er booket" in await g.inner_text(".pub-done"))
        await c5.close()
        await p1.wait_for_selector(f".bk2-row:has-text('Sofie')", timeout=10000)
        check("booking: ejeren ser bookingen live med navn og tid", tm in await p1.inner_text(".bk2-row:has-text('Sofie')"))
        await p1.screenshot(path=f"{OUT}/app-booking.png")
        # Sidebygger – build a page, the guestbook works on the public link
        await p1.goto(BASE + "/#/apps/pages"); await p1.wait_for_selector(".pg-page .sh-top")
        await p1.click(".pg-page button:has-text('Ny side')"); await p1.wait_for_selector(".pg-preview .pg-site")
        await p1.fill("textarea[aria-label='Om dig']", "Jeg elsker kode og fodbold.")
        await p1.fill("input[aria-label='Link 1 adresse']", "hubtech.dk")
        await p1.click(".pg-theme:has-text('Hav')")
        check("sidebygger: forhåndsvisningen følger med", "kode og fodbold" in await p1.inner_text(".pg-preview") and await p1.locator(".pg-preview .pg-link").count() == 1)
        await p1.wait_for_timeout(1500); await p1.wait_for_selector(".sh-detail-h .faint:has-text('Gemt')", timeout=5000)
        await p1.screenshot(path=f"{OUT}/app-pages.png")
        plink = await p1.get_attribute(".sh-detail-h a:has-text('Se siden')", "href")
        c6 = await browser.new_context(**p.devices["Pixel 7"]); g = await c6.new_page()
        await g.goto(plink); await g.wait_for_selector(".pg-pub .pg-site")
        check("sidebygger: siden kan ses uden konto, med tema", "kode og fodbold" in await g.inner_text(".pg-site"))
        await g.fill("input[aria-label='Dit navn']", "Mormor"); await g.fill("textarea[aria-label='Hilsen']", "Flot side!")
        await g.click(".pg-guest-form button"); await g.wait_for_selector(".pg-entry:has-text('Flot side!')")
        check("sidebygger: gæstebogen virker for gæster", True)
        await g.screenshot(path=f"{OUT}/app-pages-public.png")
        await c6.close()
        # Tavlen – two people add and vote on notes live
        await p1.goto(BASE + "/#/apps/board"); await p1.wait_for_selector(".tv-tpls")
        await p1.click(".tv-tpl:has-text('Evaluering')"); await p1.wait_for_selector(".modal .sh-person-btn:has-text('Maja')")
        await p1.click(".modal .sh-person-btn:has-text('Maja')"); await p1.click(".modal button:has-text('Gem')")
        await p1.wait_for_selector(".tv-zone:has-text('Det gik godt')"); await p1.wait_for_selector(".modal", state="detached"); await p1.wait_for_timeout(800)
        await p1.click(".tv-bar button:has-text('Ny seddel')"); await p1.wait_for_selector(".tv-edit")
        await p1.fill(".tv-edit", "Godt samarbejde"); await p1.keyboard.press("Enter")
        await p1.wait_for_selector(".tv-text:has-text('Godt samarbejde')")
        await p2.goto(BASE + "/#/apps/board"); await p2.click(".sh-card:has-text('Evaluering')")
        await p2.wait_for_selector(".tv-note:has-text('Godt samarbejde')")
        await p2.click(".tv-note:has-text('Godt samarbejde') .tv-vote")
        await p1.wait_for_selector(".tv-note:has-text('Godt samarbejde') .tv-vote:has-text('1')", timeout=10000)
        check("tavlen: sedler og stemmer deles live", True)
        box = await p1.locator(".tv-note:has-text('Godt samarbejde')").bounding_box()
        await p1.mouse.move(box["x"] + 40, box["y"] + 40); await p1.mouse.down(); await p1.mouse.move(box["x"] + 700, box["y"] + 90, steps=10); await p1.mouse.up()
        await p1.wait_for_timeout(1500)
        items = [e for e in (await api(p1, "GET", f"/api/sh/doc/{(await api(p1, 'GET', '/api/sh/board'))['data']['docs'][0]['id']}"))["data"]["entries"] if e["kind"] == "item"]
        check("tavlen: en seddel kan trækkes til et nyt sted", items and items[0]["data"]["x"] > 500, str(items[:1]))
        await p1.screenshot(path=f"{OUT}/app-board.png")
        # Skoleskema
        await p1.goto(BASE + "/#/apps/codelab"); await p1.wait_for_selector(".cl-list")
        await p1.click(".cl-item:has-text('Læg sammen')"); await p1.wait_for_selector(".cl-code")
        await p1.click(".cl-editor + .row button:has-text('Kør tests')"); await p1.wait_for_selector(".cl-result", timeout=10000)
        check("kodeudfordringer: startkoden består ikke", "0 af 4" in await p1.inner_text(".cl-result"))
        await p1.fill(".cl-code", "function sum(a, b) {\n  console.log('hej', a);\n  return a + b;\n}")
        await p1.click(".cl-editor + .row button:has-text('Kør tests')"); await p1.wait_for_selector(".cl-result.is-ok", timeout=10000)
        check("kodeudfordringer: en rigtig løsning består og viser console.log", "hej 2" in await p1.inner_text(".cl-out"))
        await p1.fill(".cl-code", "function sum(a, b) { while (true) {} }")
        await p1.click(".cl-editor + .row button:has-text('Kør tests')"); await p1.wait_for_selector(".cl-err", timeout=10000)
        check("kodeudfordringer: en uendelig løkke stoppes", "for lang tid" in await p1.inner_text(".cl-err"))
        await p1.screenshot(path=f"{OUT}/app-codelab.png")
        await p1.goto(BASE + "/#/apps/codelab"); await p1.wait_for_selector(".lb-row.is-me", timeout=10000)
        check("kodeudfordringer: point kommer på toplisten", "10" in await p1.inner_text(".lb-row.is-me"))
        # Quizshow – the host on a big screen, a guest and Maja answer on their phones
        await p1.goto(BASE + "/#/apps/checkers/online"); await p1.reload(); await p1.wait_for_selector(".gr-player")
        await p1.click(".gr-player:has-text('Maja')"); await p1.click(".dm-page button:has-text('Udfordr')")
        await p1.wait_for_selector(".tr-lobby"); dam_room = p1.url.split("/")[-1]
        try:
            await p2.wait_for_selector(".toast:has-text('vil spille Dam')", timeout=8000)
            await p2.click(".toast:has-text('vil spille Dam') button:has-text('Åbn')")
        except Exception:
            await p2.goto(BASE + f"/#/apps/checkers/online/{dam_room}")
        await p1.wait_for_selector(".dm-page button:has-text('Start spillet'):not([disabled])", timeout=15000)
        await p1.click(".dm-page button:has-text('Start spillet')")
        await p1.wait_for_selector(".dm-board"); await p2.wait_for_selector(".dm-board", timeout=10000)
        check("dam online: begge ser brættet", await p2.locator(".dm-cell .dm-piece").count() == 24)
        await p1.click(".dm-cell.can >> nth=0"); await p1.click(".dm-cell.is-dest >> nth=0")
        await p2.wait_for_selector(".dm-status:has-text('Din tur')", timeout=10000)
        await p2.click(".dm-cell.can >> nth=0"); await p2.click(".dm-cell.is-dest >> nth=0")
        await p1.wait_for_selector(".dm-status:has-text('Din tur')", timeout=10000)
        check("dam online: trækkene går begge veje", True)
        await p1.goto(BASE + "/#/apps/journal"); await p1.wait_for_selector(".jr-text")
        await p1.click(".jr-mood[aria-label='God']"); await p1.fill(".jr-text", "En god dag med nye apps."); await p1.fill("input[aria-label='God ting 1']", "Kode")
        await p1.wait_for_timeout(1500)
        jd = (await api(p1, "GET", "/api/state/journal"))["data"]["state"]["days"]
        check("dagbog: tekst, humør og gode ting gemmes", any(v.get("mood") == 4 and "nye apps" in v.get("text", "") for v in jd.values()))
        await p1.screenshot(path=f"{OUT}/app-journal.png")
        # Stopur
        await p1.goto(BASE + "/#/apps/timers"); await p1.wait_for_selector(".tm-sw")
        await p1.click(".tm-page button:has-text('Start') >> nth=0"); await p1.wait_for_timeout(1300)
        await p1.click(".tm-page button:has-text('Omgang')"); await p1.click(".tm-page button:has-text('Stop')")
        check("stopur: tiden løber og omgange gemmes", await p1.locator(".tm-laps li").count() == 1 and (await p1.inner_text(".tm-sw")).startswith("0:01"))
        await p1.fill("input[aria-label='Minutter']", "0"); await p1.fill("input[aria-label='Sekunder']", "2"); await p1.fill("input[aria-label='Navn på nedtælling']", "Test")
        await p1.click(".tm-page button:has-text('Start') >> nth=-1")
        await p1.wait_for_selector(".toast:has-text('Test er færdig')", timeout=6000)
        check("stopur: en nedtælling ringer", True)
        await p1.screenshot(path=f"{OUT}/app-timers.png")
        # Lær: Regnemester, Grundstoffer, Tidslinjen og Hemmelige koder
        await p1.goto(BASE + "/#/apps/ciphers"); await p1.wait_for_selector(".cp-in")
        await p1.fill(".cp-in", "Hej med dig")
        check("hemmelige koder: Cæsar med flyt 3", (await p1.inner_text(".cp-out")).strip() == "Khm phg glj")
        await p1.click(".cp-kinds .sh-tag:has-text('Morse')"); await p1.fill(".cp-in", "sos")
        check("hemmelige koder: morse", (await p1.inner_text(".cp-out")).strip() == "... --- ...")
        await p1.screenshot(path=f"{OUT}/app-ciphers.png")
        # Spilhal: Blokfald, Murbrækker, Kodeknækker, Skubbepuslespil, Følg mønstret, Ordsøg
        await p1.goto(BASE + "/#/apps/texttools"); await p1.wait_for_selector(".tx-in")
        await p1.fill(".tx-in", "Hunden løber. Katten sover i solen! Det er en dejlig sommerdag."); await p1.wait_for_timeout(500)
        check("tekstværktøjer: ord og LIX", "11" in await p1.inner_text(".tx-stats") and "LIX 13" in await p1.inner_text(".tx-lix"))
        await p1.click(".tx-tools button:has-text('STORE BOGSTAVER')")
        check("tekstværktøjer: store bogstaver", (await p1.input_value(".tx-in")).startswith("HUNDEN"))
        await p1.goto(BASE + "/#/apps/colors"); await p1.wait_for_selector(".co-codes")
        check("farver: farvekoder og kontrast", "rgb(59, 130, 246)" in await p1.inner_text(".co-codes") and ": 1" in await p1.inner_text(".co-ratio"))
        await p1.goto(BASE + "/#/apps/piggy"); await p1.wait_for_selector(".piggy-page input[aria-label='Sparemål']")
        await p1.fill("input[aria-label='Sparemål']", "Ny cykel"); await p1.fill("input[aria-label='Beløb i kr.']", "2000"); await p1.fill("input[aria-label='Sparer pr. uge']", "100")
        await p1.click(".piggy-page button:has-text('Tilføj')"); await p1.fill("input[aria-label='Beløb til Ny cykel']", "500"); await p1.click(".pg2-goal button:has-text('Sæt ind')")
        check("sparegris: 25 % og 15 uger tilbage", "25%" in await p1.inner_text(".pg2-goal") and "15 uger" in await p1.inner_text(".pg2-goal"))
        await p1.screenshot(path=f"{OUT}/app-piggy.png")
        await p1.goto(BASE + "/#/apps/worldclock"); await p1.wait_for_selector(".wc-card")
        check("verdensur: tre byer med tid", await p1.locator(".wc-card").count() == 3 and any(ch.isdigit() for ch in await p1.inner_text(".wc-time >> nth=0")))
        await p1.goto(BASE + "/#/apps/charts"); await p1.wait_for_selector(".chx-canvas")
        check("diagrammer: data og diagram", await p1.locator("input[aria-label^='Navn ']").count() == 4)
        await p1.screenshot(path=f"{OUT}/app-charts.png")
        for gid, sel in [("tts", ".tx-in"), ("recorder", ".rc-btn")]:
            await p1.goto(BASE + f"/#/apps/{gid}"); await p1.wait_for_selector(f"{sel}, .t2-page p", timeout=10000)
        check("læs op og optager åbner", True)
        # Hjerterfri, Meyer, Fri celle, Banko
        await p1.goto(BASE + "/#/apps/loans"); await p1.wait_for_selector("input[aria-label='Hvad er lånt ud']")
        await p1.fill("input[aria-label='Hvad er lånt ud']", "Boremaskine"); await p1.fill("input[aria-label='Hvem']", "Naboen")
        await p1.fill("input[aria-label='Afleveres senest']", "2020-01-01"); await p1.click(".loans-page button:has-text('Tilføj')")
        await p1.wait_for_selector(".ln-item")
        check("udlån: for sent vises", "for sent" in await p1.inner_text(".ln-item.is-late") and await p1.locator(".ln-late-chip").count() == 1)
        await p1.screenshot(path=f"{OUT}/app-loans.png")
        await p1.click(".ln-item button:has-text('Afleveret')"); await p1.click(".loans-page .segmented button:has-text('Afleveret')")
        check("udlån: afleveret flyttes", await p1.locator(".ln-item.is-back").count() == 1)
        await p1.goto(BASE + "/#/apps/units"); await p1.wait_for_selector(".om-out")
        await p1.fill(".om-in", "2.5")
        check("omregner: 2,5 km er 2.500 m", (await p1.inner_text(".om-out")).strip() == "2.500 m")
        await p1.click(".l3-bar .segmented button:has-text('Temperatur')"); await p1.fill(".om-in", "100"); await p1.select_option("select[aria-label='Til']", "°F")
        await p1.fill(".om-in", "100")
        check("omregner: 100 °C er 212 °F", "212" in await p1.inner_text(".om-out"))
        await p1.screenshot(path=f"{OUT}/app-units.png")
        async def share_with_maja(public=True):
            await p1.wait_for_selector(".modal .sh-person-btn:has-text('Maja')", timeout=10000)
            await p1.click(".modal .sh-person-btn:has-text('Maja')")
            if public and await p1.locator(".modal .sh-link input[type=checkbox]").count():
                await p1.check(".modal .sh-link input[type=checkbox]")
            await p1.click(".modal button:has-text('Gem')"); await p1.wait_for_selector(".modal", state="detached")
        def doc_id():
            return p1.url.split("/d/")[1].split("?")[0]
        await p1.goto(BASE + "/#/apps/datepoll"); await p1.click(".datepoll-page .sh-top button:has-text('Ny datoafstemning')")
        await p1.fill(".datepoll-page input[aria-label='Titel']", "Klassefest")
        for d in ["2026-11-06", "2026-11-13", "2026-11-20"]:
            await p1.fill("input[aria-label='Dato']", d); await p1.click(".datepoll-page button:has-text('Tilføj dato')")
        await p1.click(".datepoll-page button:has-text('Opret')"); await share_with_maja()
        did = doc_id(); dtok = (await api(p1, "GET", f"/api/sh/doc/{did}"))["data"]["doc"]["token"]
        await p1.click(".dp-me .dp-btn >> nth=1"); await p1.wait_for_selector(".dp-me .dp-btn.is-yes")
        await p2.goto(BASE + f"/#/apps/datepoll/d/{did}"); await p2.click(".dp-me .dp-btn >> nth=1"); await p2.wait_for_selector(".dp-me .dp-btn.is-yes")
        anon = await browser.new_context(viewport={"width": 420, "height": 860}); pa = await anon.new_page()
        await pa.goto(BASE + f"/#/p/{dtok}"); await pa.wait_for_selector(".dp-pub")
        await pa.fill("input[aria-label='Dit navn']", "Farmor"); await pa.click(".dp-pub .dp-btn >> nth=0"); await pa.click(".datepoll-pub button:has-text('Send svar')")
        await pa.wait_for_selector(".dp-name:has-text('Farmor')")
        await p1.wait_for_timeout(1500); await p1.reload(); await p1.wait_for_selector(".dp-table")
        check("find en dato: tre svar, og den bedste dato lyser op", await p1.locator(".dp-table tbody tr").count() == 3 and "13/11" in await p1.inner_text(".dp-table th.is-best"))
        await p1.screenshot(path=f"{OUT}/app-datepoll.png")
        await p1.goto(BASE + "/#/apps/savings"); await p1.wait_for_selector(".os-big")
        await p1.fill("input[aria-label='Startbeløb (kr.)']", "0"); await p1.fill("input[aria-label='Sparer hver måned (kr.)']", "100"); await p1.fill("input[aria-label='Rente pr. år (%)']", "0"); await p1.fill("input[aria-label='Antal år']", "2")
        check("opsparing: 100 kr. om måneden i 2 år uden rente er 2.400 kr.", "2.400 kr." in await p1.inner_text(".os-big > b"))
        await p1.fill("input[aria-label='Rente pr. år (%)']", "5"); await p1.fill("input[aria-label='Antal år']", "10")
        check("opsparing: renter giver mere end det indbetalte", await p1.locator(".os-col").count() == 10 and "renterne har givet" in await p1.inner_text(".os-big"))
        await p1.screenshot(path=f"{OUT}/app-savings.png")
        await p1.goto(BASE + "/#/apps/numsys"); await p1.wait_for_selector(".ns-in")
        await p1.fill("input[aria-label='Decimal']", "255")
        check("talsystemer: 255 er 11111111 og FF", await p1.input_value("input[aria-label='Binær']") == "11111111" and await p1.input_value("input[aria-label='Hex']") == "FF")
        await p1.click(".ns-bit >> nth=0")
        check("talsystemer: klik på en bit ændrer tallet", await p1.input_value("input[aria-label='Decimal']") == "127")
        await p1.screenshot(path=f"{OUT}/app-numsys.png")
        await p1.goto(BASE + "/#/apps/shortcuts"); await p1.wait_for_selector(".gv-row")
        await p1.click(".l3-bar .segmented button:has-text('Windows')"); await p1.click(".l3-bar .segmented button:has-text('Øv dig')"); await p1.wait_for_selector(".l3-ask b")
        what = (await p1.inner_text(".l3-ask b")).rstrip("?")
        keys = await p1.evaluate("async (w) => (await import('/js/features/batch9.js')).SHORTCUTS.find(x => x[0] === w)[1]", what)
        if keys.startswith("Ctrl+") and "Win" not in keys and "Esc" not in keys and keys != "Ctrl++":
            await p1.keyboard.press(keys.replace("Ctrl+", "Control+").replace("Shift+", "Shift+"))
            await p1.wait_for_selector(".l3-fb")
            check("genveje: at trykke genvejen giver point", await p1.locator(".l3-fb.ok").count() == 1, keys)
        else:
            await p1.click(".shortcuts-page button:has-text('Vis svaret')")
            check("genveje: svaret kan vises", await p1.locator(".l3-fb kbd").count() >= 1)
        await p1.screenshot(path=f"{OUT}/app-shortcuts.png")
        await p1.goto(BASE + "/#/apps/splitbill"); await p1.wait_for_selector("input[aria-label='Regningen (kr.)']")
        await p1.fill("input[aria-label='Regningen (kr.)']", "600"); await p1.fill("input[aria-label='Antal personer']", "4"); await p1.click(".l3-card .segmented button:has-text('10 %')")
        check("del regningen: 600 kr. + 10 % på fire = 165 kr.", "165 kr." in await p1.inner_text(".os-big > b"))
        await p1.click(".l3-bar .segmented button:has-text('Hvem skylder hvem?')")
        check("del regningen: hvem skylder hvem", "Carl → Anna" in await p1.inner_text(".splitbill-page"))
        await p1.screenshot(path=f"{OUT}/app-splitbill.png")
        await p1.goto(BASE + "/#/apps/writing"); await p1.wait_for_selector(".wr-text")
        await p1.fill(".wr-text", "Der var engang en drage. Den var bange for ild!"); await p1.wait_for_timeout(200)
        check("skriveværksted: ord og sætninger tælles", "10" in await p1.inner_text(".wr-stats") and "2 sætninger" in await p1.inner_text(".wr-stats"))
        await p1.click(".writing-page button:has-text('Gem historien')")
        check("skriveværksted: historien gemmes", await p1.locator(".wr-story").count() == 1)
        await p1.screenshot(path=f"{OUT}/app-writing.png")
        await p1.goto(BASE + "/#/apps/dayplan"); await p1.wait_for_selector(".dp2-item")
        await p1.click(".dp2-check >> nth=0")
        check("dagens plan: skema med billeder, og et punkt krydses af", await p1.locator(".dp2-item").count() == 8 and await p1.locator(".dp2-item.is-done").count() == 1)
        await p1.screenshot(path=f"{OUT}/app-dayplan.png")
        await page.goto(BASE + "/#/learn/guide/printer-offline"); await page.wait_for_timeout(1200)
        check("printer-guides: guiden “Printeren er offline” findes", "Printeren er" in await page.inner_text("main"))
        # ── Ejer: the owner's own app ──
        await page.goto(BASE + "/#/apps/owner"); await page.reload(); await page.wait_for_selector(".owner-page .adm-tile", timeout=10000)
        check("ejer-app: overblik for ejeren", await page.locator(".owner-page .adm-tile").count() == 6)
        await page.screenshot(path=f"{OUT}/owner-overview.png")
        await page.goto(BASE + "/#/apps/owner/users"); await page.wait_for_selector(".owner-page .adm-user")
        await page.fill("input[aria-label='Brugernavn']", "emma"); await page.fill("input[aria-label='Navn']", "Emma")
        await page.click(".owner-page button:has-text('Opret konto')")
        await page.wait_for_selector(".own-invite", timeout=8000)
        inv = await page.inner_text(".own-invite")
        check("ejer-app: opret konto giver en besked med login", "Brugernavn: emma" in inv and "Adgangskode:" in inv and "/#/hent" in inv, inv)
        await page.wait_for_timeout(500); check("ejer-app: antal brugere opdateres", "3 brugere" in await page.inner_text(".owner-page .panel-title"))
        await page.screenshot(path=f"{OUT}/owner-users.png")
        await page.goto(BASE + "/#/apps/owner/download"); await page.wait_for_selector(".own-qr svg", timeout=8000)
        check("ejer-app: QR-koder til at hente og opdatere", await page.locator(".own-qr svg").count() == 2)
        await page.screenshot(path=f"{OUT}/owner-download.png", full_page=True)
        mem = await browser.new_context(viewport={"width": 1280, "height": 860})
        mp2 = await mem.new_page()
        await mp2.goto(BASE + "/#/login"); await mp2.fill("#login-user", "maja"); await mp2.fill("#login-pass", "Vinter2026xx"); await mp2.click("button[type=submit]")
        await mp2.wait_for_selector(".home-title", timeout=20000)
        await mp2.goto(BASE + "/#/apps"); await mp2.wait_for_timeout(1200)
        check("ejer-app: skjult for andre end ejeren", await mp2.locator("a[href='#/apps/owner']").count() == 0 and (await api(mp2, "GET", "/api/owner/overview"))["status"] == 403)
        await mem.close()
        # "Hent HUBTECH" – public page friends open, with QR codes on a computer and the right button on a phone
        pub = await browser.new_context(viewport={"width": 1280, "height": 900})
        pp = await pub.new_page()
        await pp.goto(BASE + "/#/hent"); await pp.wait_for_selector(".dl-btn", timeout=8000); await pp.wait_for_selector(".dl-qr svg", timeout=8000)
        check("hent-siden: virker uden login, med QR til hent og opdatér", await pp.locator(".dl-qr svg").count() == 2 and await pp.locator(".dl-btn").count() >= 2)
        await pp.screenshot(path=f"{OUT}/hent-desktop.png", full_page=True)
        await pub.close()
        droid = await browser.new_context(**p.devices["Pixel 7"])
        dp = await droid.new_page()
        await dp.goto(BASE + "/#/hent"); await dp.wait_for_selector(".dl-btn")
        first = await dp.locator(".dl-btn").first.inner_text()
        check("hent-siden: Android får Android-knappen først", "Android" in first and await dp.locator(".dl-btn.is-primary").count() == 1, first)
        await dp.screenshot(path=f"{OUT}/hent-android.png", full_page=True)
        await droid.close()
        # behind Tailscale: the network page explains how friends on other networks get in
        await page.goto(BASE + "/#/settings/about"); await page.wait_for_timeout(1200)
        check("netværk: guide til venner på andre netværk", await page.locator("text=Venner på andre netværk").count() == 1)

        # ── App-værkstedet: templates, live preview in a sandbox, console, AI writes files ──
        await page.goto(BASE + "/#/apps/studio")
        await page.wait_for_selector(".studio-page")
        await page.click(".studio-page >> text=Ny app")
        await page.click(".st-tpl:has-text('To-do-liste')")
        await page.fill(".modal input[aria-label=Navn]", "Huskeliste")
        await page.click(".modal .btn-primary")
        await page.wait_for_selector(".st-edit-page")
        await page.wait_for_timeout(2500)
        fr = next((f for f in page.frames if "/api/studio/run/" in f.url), None)
        ok = False
        if fr:
            await fr.fill("#text", "Køb mælk"); await fr.click("form button"); await page.wait_for_timeout(1200)
            ok = await fr.locator("li").count() == 1
        check("app-værksted: skabelon kører i forhåndsvisningen", ok)
        sandboxed = await fr.evaluate("(() => { try { document.cookie; return false } catch (e) { return true } })()") if fr else False
        check("app-værksted: appen kører i en sandkasse uden adgang til cookies", sandboxed)
        sid_app = page.url.split("/edit/")[1].split("?")[0]
        await page.wait_for_timeout(800)
        r = await page.evaluate(f"fetch('/api/studio/run/{sid_app}').then(r => r.text())")
        check("app-værksted: appens data gemmes på kontoen", "Køb mælk" in r)
        await page.click(".st-tab button:has-text('app.js')")
        await page.click(".st-ed textarea")
        await page.keyboard.press("Control+End")
        await page.keyboard.type("\nikkeDefineret();")
        await page.wait_for_timeout(3000)
        con = await page.text_content(".st-console") or ""
        check("app-værksted: fejl vises i konsollen med fil og linje", "ikkeDefineret" in con and "app.js linje" in con, con)
        await page.evaluate("""() => localStorage.setItem('hubtech.ai.chat', JSON.stringify([{ role: 'user', content: 'Lav en overskrift' }, { role: 'assistant', builder: true, content: 'Her er en ny side:\\n```html index.html\\n<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body><h1 id="t">Lavet af AI</h1></body></html>\\n```' }]))""")
        await page.reload()
        await page.wait_for_selector(".st-edit-page")
        await page.wait_for_selector(".ai-fab", state="attached")
        await page.keyboard.press("Control+j")
        await page.wait_for_selector(".ai-file .btn-primary")
        check("ai: app-bygger-tilstand i App-værkstedet", await page.locator(".ai-mode.is-builder:not([hidden])").count() == 1)
        await page.click(".ai-file .btn-primary")
        await page.wait_for_timeout(2500)
        fr = next((f for f in page.frames if "/api/studio/run/" in f.url), None)
        check("ai: foreslået fil bruges i appen og køres", fr is not None and (await fr.text_content("#t") or "") == "Lavet af AI")
        await page.keyboard.press("Escape")
        await page.click(".st-bar >> text=Fortryd")
        await page.wait_for_timeout(1500)
        check("app-værksted: AI-ændringen kan fortrydes", "Mine opgaver" in (await page.evaluate(f"fetch('/api/studio/apps/{sid_app}').then(r => r.json()).then(d => d.app.files['index.html'])")))
        await page.evaluate("localStorage.removeItem('hubtech.ai.chat')")
        await page.screenshot(path=f"{OUT}/e2e_studio.png")

        # ── calls: a video call between two users (fake camera + microphone) and a voice channel ──
        cbr = await p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        async def call_user(name, pw, **kw):
            cx = await cbr.new_context(permissions=["microphone", "camera"], **kw)
            pg = await cx.new_page()
            pg.on("pageerror", lambda e: errors.append(f"call {name}: " + str(e)))
            await pg.goto(BASE + "/#/login"); await pg.wait_for_selector("#login-user")
            await pg.fill("#login-user", name); await pg.fill("#login-pass", pw); await pg.click("button[type=submit]")
            await pg.wait_for_selector(".home-title", timeout=20000)
            return pg
        ca = await call_user("oliver", "Sommer2026x!", viewport={"width": 1440, "height": 900})
        cb = await call_user("maja", "Vinter2026xx", **p.devices["Pixel 7"])
        await ca.evaluate("h => location.hash = h", f"#/apps/community/dm/{dm}")
        await ca.wait_for_selector(".cm-main-h [title='Videoopkald']", timeout=10000)
        await cb.evaluate("h => location.hash = h", "#/apps/notes")
        await cb.wait_for_timeout(2500)
        await ca.click(".cm-main-h [title='Videoopkald']")
        await cb.wait_for_selector(".ring", timeout=30000)
        check("opkald: det ringer hos vennen", True)
        await cb.click(".ring [aria-label='Tag imod med video']")
        # WebRTC i en headless browser kan være længe om at få billeder begge veje, især med tre
        # parter. 60 sekunder i stedet for 20: en forbindelse, der aldrig kommer op, fejler stadig,
        # men en langsom-men-virkende gør ikke. Løkken stopper straks, når den er forbundet.
        ok = False
        for _ in range(120):
            va = await ca.evaluate("[...document.querySelectorAll('.call-tile:not(.is-self) video')].some(v => v.videoWidth > 0)")
            vb = await cb.evaluate("[...document.querySelectorAll('.call-tile:not(.is-self) video')].some(v => v.videoWidth > 0)")
            if va and vb and ":" in (await ca.text_content(".call-status") or ""):
                ok = True; break
            await ca.wait_for_timeout(500)
        check("opkald: video og lyd forbundet begge veje", ok)
        await cb.screenshot(path=f"{OUT}/e2e_call_phone.png")
        await cb.click(".call [aria-label='Slå mikrofonen fra']")
        check("opkald: mikrofonen kan slås fra", await cb.locator(".call [aria-label='Slå mikrofonen til']").count() == 1)
        await ca.click(".call .is-end")
        await cb.wait_for_timeout(2500)
        check("opkald: læg på afslutter hos begge", await cb.locator(".call").count() == 0 and await ca.locator(".call").count() == 0)
        vs = (await api(ca, "POST", "/api/cm/servers", {"name": "Talekanal-test"}))["data"]["server"]["id"]
        vcode = (await api(ca, "POST", f"/api/cm/servers/{vs}/invites", {}))["data"]["code"]
        await api(cb, "POST", f"/api/cm/invites/{vcode}/join"); await api(cb, "POST", f"/api/cm/servers/{vs}/rules")
        await ca.evaluate("h => location.hash = h", f"#/apps/community/s/{vs}")
        await ca.wait_for_selector(".cm-voice .cm-chan")
        await ca.click(".cm-voice .cm-chan")
        await ca.wait_for_selector(".call")
        await cb.evaluate("h => location.hash = h", f"#/apps/community/s/{vs}")
        await cb.wait_for_selector(".cm-back"); await cb.wait_for_timeout(600); await cb.click(".cm-back")
        await cb.wait_for_selector(".cm-voice-u", timeout=10000)
        await cb.click(".cm-voice .cm-chan")
        ok = False
        for _ in range(120):
            if "2 med" in (await ca.text_content(".call-status") or "") and await ca.locator(".call-tile:not(.is-self)").count() == 1:
                ok = True; break
            await ca.wait_for_timeout(500)
        check("talekanal: to deltagere forbundet", ok)
        await ca.screenshot(path=f"{OUT}/e2e_voice.png")
        # music for everyone in the call: HUBTECH's own piano music
        await ca.click(".call [aria-label='Musik til alle']")
        await ca.click(".call-music >> text=Klaver (uden ophavsret)")
        await cb.wait_for_timeout(2500)
        check("musik i opkald: de andre ser, hvad der spiller", "Klavermusik af HUBTECH" in (await cb.text_content(".call-status") or ""))
        await cb.click(".call .is-end"); await ca.click(".call .is-end")
        # group call: ring two friends at once
        await api(ca, "POST", "/api/users", {"username": "sara", "displayName": "Sara", "password": "Foraar2026xx"})
        cs = await call_user("sara", "Foraar2026xx", viewport={"width": 1280, "height": 800})
        await api(cs, "POST", "/api/cm/me/age", {"birthYear": 2000, "acceptRules": True})
        await api(ca, "POST", "/api/cm/friends", {"username": "sara"})
        await api(cs, "POST", f"/api/cm/friends/{oid}/accept")
        await cs.evaluate("h => location.hash = h", "#/apps/notes"); await cs.wait_for_timeout(2000)
        await cb.evaluate("h => location.hash = h", "#/apps/notes"); await cb.wait_for_timeout(2000)
        await ca.evaluate("h => location.hash = h", "#/apps/community/friends")
        await ca.wait_for_selector(".cm-main-h >> text=Gruppeopkald")
        await ca.click(".cm-main-h >> text=Gruppeopkald")
        for box in await ca.locator(".modal .sn-friend input").all():
            await box.check()
        await ca.click(".modal .btn-primary")
        await cb.wait_for_selector(".ring", timeout=30000); await cs.wait_for_selector(".ring", timeout=30000)
        await cb.click(".ring [aria-label='Tag imod']"); await cs.click(".ring [aria-label='Tag imod']")
        ok = False
        for _ in range(120):
            if "3 med" in (await ca.text_content(".call-status") or "") and await ca.locator(".call-tile:not(.is-self)").count() == 2 and await cs.locator(".call-tile:not(.is-self)").count() == 2:
                ok = True; break
            await ca.wait_for_timeout(500)
        check("gruppeopkald: tre personer forbundet med hinanden", ok)
        await ca.screenshot(path=f"{OUT}/e2e_group_call.png")
        await ca.click(".call .is-end"); await ca.wait_for_timeout(1500)
        check("gruppeopkald: fortsætter, når én lægger på", await cb.locator(".call").count() == 1 and await cs.locator(".call").count() == 1)
        await cb.click(".call .is-end"); await cs.click(".call .is-end")
        # ── Indstillinger → Apps og opkald: test the microphone and camera, and the setting reaches the call ──
        await ca.wait_for_timeout(800)
        await ca.goto(BASE + "/#/settings/apps"); await ca.wait_for_selector(".settings-body >> text=Støjdæmpning")
        await ca.click("button:has-text('Test opkald')")
        await ca.wait_for_selector(".ct-verdict", timeout=45000)
        ct = await ca.inner_text(".ct")
        check("test opkald: mikrofon og prøveopkald tjekkes uden en anden person", "Mikrofonen virker" in ct and "prøveopkald kunne forbindes" in ct, ct)
        await ca.screenshot(path=f"{OUT}/call-test.png")
        await ca.click("button:has-text('Test mikrofonen')")
        lvl = 0
        for _ in range(20):
            lvl = max(lvl, int(await ca.get_attribute(".as-meter", "aria-valuenow") or 0))
            if lvl > 0: break
            await ca.wait_for_timeout(250)
        check("indstillinger: mikrofontest viser lydniveau", lvl > 0, lvl)
        await ca.click("button:has-text('Se kameraet')"); await ca.wait_for_timeout(1500)
        check("indstillinger: kameraet vises", await ca.evaluate("(() => { const v = document.querySelector('.as-preview'); return !!v && !v.hidden && v.videoWidth > 0; })()"))
        n_dev = await ca.evaluate("document.querySelectorAll('select[aria-label=Mikrofon] option').length")
        check("indstillinger: mikrofoner kan vælges", n_dev >= 2, n_dev)
        await ca.click("[aria-label='Start med kameraet slukket'] >> xpath=..")
        await ca.screenshot(path=f"{OUT}/e2e_settings_apps.png", full_page=True)
        await ca.goto(BASE + "/#/settings/profile"); await ca.wait_for_timeout(600)
        check("indstillinger: mikrofon og kamera slukkes, når siden forlades", await ca.evaluate("!document.querySelector('.as-preview')"))
        saved = await ca.evaluate("JSON.parse(localStorage.getItem('hubtech.call') || '{}').camOff === true")
        check("indstillinger: 'start med kameraet slukket' gemmes", saved)
        await ca.goto(BASE + "/#/apps/community/friends"); await ca.wait_for_timeout(1200)
        await ca.evaluate("localStorage.setItem('hubtech.call', JSON.stringify({ camOff: false }))")
        await cbr.close()

        # ── Android phone (Pixel 7 emulation, touch) ──
        mctx = await browser.new_context(**p.devices["Pixel 7"])
        mp = await mctx.new_page()
        await mp.goto(BASE + "/#/login")
        await mp.wait_for_selector("#login-user")
        await mp.fill("#login-user", "oliver")
        await mp.fill("#login-pass", "Sommer2026x!")
        await mp.tap("button[type=submit]")
        await mp.wait_for_selector(".home-title")
        mdocs = (await api(mp, "GET", "/api/office/docs"))["data"]["docs"]
        msheet = next(d["id"] for d in mdocs if d["kind"] == "sheet")
        overflow = {}
        mcust = (await api(mp, "GET", "/api/state/customers"))["data"]["state"]
        extra = [f"/apps/customers/c/{mcust['customers'][0]['id']}", f"/apps/customers/invoice/{mcust['invoices'][0]['id']}"] if mcust and mcust.get("invoices") else []
        # Listen skal dække de indholdstunge sider, ikke kun de åbenlyse: IT-ordbogen stod ikke her,
        # og dens lange emne-chip gjorde siden bredere end telefonen, så browseren zoomede alt ud.
        for pth in extra + ["/", "/apps", "/apps/tasks", "/apps/notes", "/apps/hubtech", f"/apps/hubtech/sheet/{msheet}", "/settings/about", "/apps/calendar", "/apps/inventory", "/apps/timesheet", "/apps/snippets", "/learn/codeschool", "/learn/codeschool/python/py4", "/learn/codeschool/play", "/learn/flashcards", "/learn/toolkit", "/apps/customers", "/share?text=hej",
                           "/apps/glossary", "/apps/quiz", "/apps/wiki", "/apps/economy", "/apps/notebook", "/apps/printerdoctor", "/apps/commands", "/apps/checklists", "/apps/labs", "/apps/polls", "/apps/forms", "/apps/studio", "/apps/electro", "/projects", "/dashboard", "/learn", "/settings/apps", "/settings/world"]:
            await mp.goto(BASE + "/#" + pth)
            await mp.wait_for_timeout(900)
            # sideways scrolling – or the phone browser zooming out because something is wider than the screen
            ov = await mp.evaluate("Math.max(document.documentElement.scrollWidth, innerWidth) - screen.width")
            if ov > 1:
                overflow[pth] = ov
        check("android: no sideways scrolling on the main pages", not overflow, overflow)
        await mp.goto(BASE + f"/#/apps/hubtech/sheet/{msheet}")
        await mp.wait_for_selector(".sh-grid td")
        rows = await mp.evaluate("(() => { const t = document.querySelector('.ofx-tools'); return Math.round(t.scrollHeight / 44); })()")
        check("android: office toolbar is one scrollable row", rows <= 1, rows)
        cell = mp.locator(".sh-grid tbody tr:nth-child(8) td:nth-child(4)")
        await cell.tap()
        await cell.tap()
        await mp.wait_for_timeout(250)
        check("android: tap a selected cell to edit it", await mp.locator(".sh-edit").count() == 1)
        await mp.keyboard.press("Escape")
        small = await mp.evaluate("""[...document.querySelectorAll('.icon-btn, .btn, .ofx-tool')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && r.height < 40; }).length""")
        check("android: buttons are finger-sized (≥ 40 px)", small == 0, small)
        await mctx.close()

        # ── accessibility: axe-core (WCAG 2 A/AA) finds no serious or critical problems ──
        axe_src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "vendor", "axe.min.js"), encoding="utf-8").read()
        actx = await browser.new_context(viewport={"width": 1440, "height": 900}, bypass_csp=True)
        ap = await actx.new_page()
        run_axe = axe_src + "; axe.run(document.querySelector('#root') || document, {runOnly: ['wcag2a', 'wcag2aa']}).then(r => r.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => v.id + ' (' + v.nodes.length + '): ' + v.nodes[0].target.join(' ')))"
        await ap.goto(BASE + "/#/login")
        await ap.wait_for_selector("#login-user"); await ap.wait_for_timeout(900)   # after the page has faded in
        bad = {"/login": await ap.evaluate(run_axe)}
        await ap.fill("#login-user", "oliver")
        await ap.fill("#login-pass", "Sommer2026x!")
        await ap.click("button[type=submit]")
        await ap.wait_for_selector(".home-title")
        docs = (await api(ap, "GET", "/api/office/docs"))["data"]["docs"]
        pages = ["/", "/dashboard", "/apps", "/apps/tasks", "/apps/notes", "/apps/focus", "/learn/toolkit", "/apps/hubtech", "/apps/calendar", "/apps/inventory", "/apps/timesheet", "/apps/snippets", "/learn/codeschool", "/learn/codeschool/python", "/learn/codeschool/python/py4", "/learn/codeschool/web/web2", "/learn/codeschool/sql/sql4", "/learn/codeschool/play", "/learn/flashcards", "/apps/customers", "/apps/studio", "/apps/community", "/apps/community/friends", "/apps/community/snaps", "/apps/community/discover", "/settings/world", "/share?text=hej", "/settings/profile", "/settings/data", "/settings/about", "/learn", "/projects"]
        for k in ("doc", "sheet", "slides"):
            d = next((x for x in docs if x["kind"] == k), None)
            if d:
                pages.append(f"/apps/hubtech/{k}/{d['id']}")
        for pth in pages:
            await ap.goto(BASE + "/#" + pth)
            await ap.wait_for_timeout(900)
            for _ in range(6):   # reminder cards fade in over the page – press Set on them first
                if not await ap.locator(".rm-card button:has-text('Set')").count(): break
                await ap.locator(".rm-card button:has-text('Set')").first.click(); await ap.wait_for_timeout(150)
            await ap.wait_for_timeout(300)
            v = await ap.evaluate(run_axe)
            if v:
                bad[pth] = v
        # the light theme too (headings and numbers were white on white there): the pages you see most
        await api(ap, "PUT", "/api/me/prefs", {"theme": "light"})
        await ap.reload(); await ap.wait_for_timeout(1200)
        light_ok = await ap.evaluate("document.documentElement.dataset.theme") == "light"
        for pth in ["/", "/apps", "/apps/tasks", "/apps/hubtech", "/apps/calendar", "/learn", "/learn/course/hubtech/day/1", "/settings/world", "/apps/economy", "/apps/notebook"]:
            await ap.goto(BASE + "/#" + pth)
            await ap.wait_for_timeout(900)
            for _ in range(6):
                if not await ap.locator(".rm-card button:has-text('Set')").count(): break
                await ap.locator(".rm-card button:has-text('Set')").first.click(); await ap.wait_for_timeout(150)
            await ap.wait_for_timeout(300)
            v = await ap.evaluate(run_axe)
            if v:
                bad["lyst tema " + pth] = v
        await api(ap, "PUT", "/api/me/prefs", {"theme": "dark"})
        check("accessibility: det lyse tema blev testet", light_ok)
        bad = {k: v for k, v in bad.items() if v}
        check("accessibility: no serious/critical axe violations", not bad, bad)
        await actx.close()
        await browser.close()
    failed = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)


asyncio.run(main())
