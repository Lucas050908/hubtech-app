"""End-to-end browser test (Playwright). Run against a server started with a fresh data dir:

    HUBTECH_DATA_DIR=/tmp/hubtech-e2e python3 server/app.py --port 8193
    python3 tests/e2e_browser.py http://127.0.0.1:8193 /tmp/shots [cursor-open-log]

Exercises the real user flows and prints PASS/FAIL per check. Exit code 1 on any failure.
"""
import asyncio
import json
import urllib.parse
import os
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

        # ── CircuitPilot saves through the bridge ──
        await page.goto(BASE + "/#/learn/circuitpilot")
        frame_el = await page.wait_for_selector("iframe.cp-frame")
        frame = await frame_el.content_frame()
        await frame.wait_for_selector("#nav-train", timeout=8000)
        await frame.click("#nav-train")
        await frame.wait_for_selector("#q-opts .opt, #q-opts button", timeout=5000)
        await frame.locator("#q-opts > *").first.click()
        await page.wait_for_timeout(1600)
        cp = await api(page, "GET", "/api/state/circuitpilot")
        cps = cp["data"]["state"] or {}
        check("CircuitPilot progress stored on server", cps.get("stats", {}).get("qT", 0) >= 1 and cps.get("username") == "Oliver Jensen", cps.get("stats"))
        await frame.click("#nav-lab")
        await page.wait_for_timeout(400)
        await frame.click("#ohm-done")
        await page.wait_for_timeout(1500)
        cp = await api(page, "GET", "/api/state/circuitpilot")
        check("CircuitPilot lab completion stored", "ohm" in (cp["data"]["state"]["stats"].get("labsDone") or []))
        await page.screenshot(path=f"{OUT}/e2e_circuitpilot.png")

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
        check("palette empty state", await page.locator(".palette-empty").count() == 1)
        await page.keyboard.press("Escape")

        # ── favorites ──
        await page.goto(BASE + "/#/apps")
        await page.wait_for_selector(".launcher-item")
        await page.locator(".app-card-fav").first.click()
        await page.wait_for_timeout(500)
        fav = await api(page, "GET", "/api/favorites")
        check("favorite stored", len(fav["data"]["favorites"]) == 1)

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
        st["tasks"].insert(0, {"id": "rem1", "title": "Ring til kunden", "notes": "", "status": "todo", "prio": "high", "due": _now.strftime("%Y-%m-%d"),
                               "dueTime": (_now + _dt.timedelta(minutes=5)).strftime("%H:%M"), "remind": "m15", "created": 1, "updated": 1})
        await api(page, "PUT", "/api/state/tasks", {"state": st})
        await page.reload()
        await page.wait_for_selector(".kb-card")
        for _ in range(40):
            if await page.locator(".toast:has-text('Påmindelse')").count():
                break
            await page.wait_for_timeout(250)
        check("tasks: reminder shown when it is due", await page.locator(".toast:has-text('Ring til kunden')").count() >= 1)
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

        # ── Servicehjælp saves to the account ──
        await page.goto(BASE + "/#/apps/servicehelp")
        fr = page.frame_locator("iframe.cp-frame")
        await fr.locator("#tabs").wait_for()
        try:
            await fr.locator("#wgo").click(timeout=2500)
        except Exception:
            pass
        await fr.locator("#tabs button[data-t=kunder]").click()
        await fr.locator("#kunder summary").click()
        await fr.locator("#cun").fill("Jensen A/S")
        await fr.locator("#cuadd").click()
        await page.wait_for_timeout(1500)
        svc = (await api(page, "GET", "/api/states/svc-"))["data"]["states"]
        check("servicehjælp: customer stored on the HUBTECH account", "Jensen A/S" in (svc.get("svc-cust") or {}).get("v", ""), list(svc))
        png = await page.evaluate("""() => { const c = document.createElement('canvas'); c.width = 900; c.height = 600; const x = c.getContext('2d');
            for (let i = 0; i < 300; i++) { x.fillStyle = `hsl(${i * 7 % 360},70%,50%)`; x.fillRect(Math.random() * 900, Math.random() * 600, 60, 60); } return c.toDataURL('image/png').split(',')[1]; }""")
        import base64 as _b64
        photo = f"{OUT}/svc-photo.png"
        open(photo, "wb").write(_b64.b64decode(png))
        await fr.locator("#pf").set_input_files(photo)
        await page.wait_for_timeout(2500)
        svc = (await api(page, "GET", "/api/states/svc-"))["data"]["states"]
        dp = json.dumps(svc.get("svc-draftp") or {})
        check("servicehjælp: photos are stored as image files, not inside the data", "/api/office/files/" in dp and "data:image" not in dp, dp[:120])

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
        await page.click("text=Log ud")
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

        # 4xx resource logs come from the deliberate negative tests above (weak password, wrong login, logout check)
        real = [e for e in errors if not e.startswith("Failed to load resource: the server responded with a status of 4")]
        check("no uncaught JS errors", not real, real[:5])

        # ── new apps: Kalender, Lager, Tidsregistrering, Kodestumper ──
        await page.goto(BASE + "/#/apps/calendar")
        await page.wait_for_selector(".cal-grid .cal-cell")
        await page.click(".app-hero-btn:has-text('Ny aftale')")
        await page.fill(".modal input[aria-label='Titel']", "Service hos Jensen")
        await page.click(".modal .btn-primary")
        await page.wait_for_selector(".cal-item:has-text('Service hos Jensen')")
        cal = (await api(page, "GET", "/api/state/calendar"))["data"]["state"] or {}
        await page.wait_for_timeout(700)
        cal = (await api(page, "GET", "/api/state/calendar"))["data"]["state"] or {}
        check("kalender: aftale oprettet og gemt", any(e["title"] == "Service hos Jensen" for e in cal.get("events", [])))
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
        check("læring: gamle /apps-links sendes videre til Guides & Læring", "#/learn/codeschool/python/py1" in page.url and (await page.text_content(".learn-tab.is-on")).strip() == "Kodeskolen", page.url)
        await page.goto(BASE + "/#/learn")
        await page.wait_for_selector(".learn-app")
        tiles = await page.locator(".learn-app h3").all_text_contents()
        await page.goto(BASE + "/#/apps")
        await page.wait_for_selector(".launcher-item")
        names = await page.locator(".launcher-item .app-card-name").all_text_contents()
        side = await page.locator(".nav-item").all_text_contents()
        check("læring: læringsapps samlet på læringssiden, ikke i launcher og menu",
              tiles == ["Kodeskolen", "Huskekort", "CircuitPilot", "Værktøjskasse"] and not set(tiles) & set(names) and not set(tiles) & {x.strip() for x in side}, (tiles, names))

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

        # ── backgrounds: seven landscapes and the quality setting ──
        await page.goto(BASE + "/#/settings/world")
        await page.wait_for_selector(".land-tile")
        await page.click(".land-tile:has-text('Kysten')")
        await page.wait_for_timeout(1400)
        prefs = (await api(page, "GET", "/api/me/prefs"))["data"]["prefs"]
        check("baggrund: 7 landskaber, valget gemmes", await page.locator(".land-tile").count() == 7 and prefs["world"]["landscape"] == "coast", prefs["world"].get("landscape"))
        await page.click(".land-tile:has-text('Dalen')")

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
        check("fællesskab: server med 3 kanaler oprettes", await page.locator(".cm-chan").count() == 3)
        await page.click(".cm-chan:has-text('generelt')")
        await page.wait_for_selector(".cm-chan.is-active:has-text('generelt')")
        sid = (await api(page, "GET", "/api/cm/servers"))["data"]["servers"][0]["id"]
        code = (await api(page, "POST", f"/api/cm/servers/{sid}/invites", {}))["data"]["code"]
        cctx = await browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
        mj = await cctx.new_page()
        mj.on("pageerror", lambda e: errors.append("maja: " + str(e)))
        await mj.goto(BASE + "/#/login")
        await mj.wait_for_selector("#login-user")
        await mj.fill("#login-user", "maja"); await mj.fill("#login-pass", "Vinter2026xx"); await mj.click("button[type=submit]")
        await mj.wait_for_selector(".home-title", timeout=8000)
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
        r = await api(mj, "POST", f"/api/calendars/{cals[0]['id']}/events", {"event": {"title": "Farmors fødselsdag", "date": "2026-10-25", "allDay": True}})
        await page.wait_for_timeout(2500)
        await page.goto(BASE + "/#/apps/calendar?r=1")
        await page.wait_for_selector(".cal-pill")
        check("delt kalender: den andens aftale vises i min kalender", await page.locator(".cal-pill:has-text('Farmors fødselsdag')").count() >= 1)
        await page.wait_for_timeout(800)
        await page.screenshot(path=f"{OUT}/e2e_cal_shared.png")
        # Servicehjælp writes into the same calendar
        await page.evaluate("""async () => { const s = (await (await fetch('/api/state/calendar')).json()).state; s.events.push({ id: 'svc1', title: 'Service hos Jensen', date: '2026-10-26', allDay: false, start: '08:00', color: '#f07a1b', svcCat: 0 }); await fetch('/api/state/calendar', { method: 'PUT', headers: { 'X-Requested-With': 'hubtech', 'Content-Type': 'application/json' }, body: JSON.stringify({ state: s }) }); }""")
        await page.goto(BASE + "/#/apps/servicehelp")
        sh = page.frame_locator("iframe.sh-frame, iframe")
        await page.wait_for_timeout(3500)
        cal_in_svc = await page.evaluate("""() => { const f = [...document.querySelectorAll('iframe')].find(x => x.src.includes('servicehelp')); try { return f.contentWindow.localStorage.getItem('cal'); } catch (e) { return 'ERR ' + e; } }""")
        check("én kalender: Servicehjælp ser HUBTECH-kalenderens aftaler", "Service hos Jensen" in (cal_in_svc or "") and "Serverdag" in (cal_in_svc or ""), (cal_in_svc or "")[:200])
        await page.evaluate("""() => { const f = [...document.querySelectorAll('iframe')].find(x => x.src.includes('servicehelp')); const w = f.contentWindow; const all = JSON.parse(w.localStorage.getItem('cal')); all.push({ id: 'c' + Date.now(), d: '2026-10-27', t: '09:30', x: 'Akut opgave\\nKundens adresse', c: 1, s: 0 }); w.localStorage.setItem('cal', JSON.stringify(all)); }""")
        await page.wait_for_timeout(2000)
        evs = (await api(page, "GET", "/api/state/calendar"))["data"]["state"]["events"]
        new = [e for e in evs if e["title"] == "Akut opgave"]
        check("én kalender: aftaler fra Servicehjælp lander i Kalender", len(new) == 1 and new[0]["start"] == "09:30" and new[0]["notes"] == "Kundens adresse", new)

        # ── local AI assistant: pop-up, own model file, answer, actions, teacher mode ──
        tiny = os.environ.get("HUBTECH_TEST_GGUF", "/tmp/claude-0/fixture/tiny.gguf")
        await page.goto(BASE + "/#/apps/notes")
        await page.wait_for_timeout(600)
        await page.keyboard.press("Control+j")
        await page.wait_for_selector(".ai-panel:not([hidden])")
        check("ai: pop-up åbner med Ctrl+J", True)
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
        for pth in extra + ["/", "/apps", "/apps/tasks", "/apps/notes", "/apps/hubtech", f"/apps/hubtech/sheet/{msheet}", "/apps/servicehelp", "/settings/about", "/apps/calendar", "/apps/inventory", "/apps/timesheet", "/apps/snippets", "/learn/codeschool", "/learn/codeschool/python/py4", "/learn/codeschool/play", "/learn/flashcards", "/learn/toolkit", "/apps/customers", "/share?text=hej"]:
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
        await ap.wait_for_selector("#login-user")
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
            v = await ap.evaluate(run_axe)
            if v:
                bad[pth] = v
        bad = {k: v for k, v in bad.items() if v}
        check("accessibility: no serious/critical axe violations", not bad, bad)
        await actx.close()
        await browser.close()
    failed = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)


asyncio.run(main())
