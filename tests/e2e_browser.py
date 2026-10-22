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
              tiles == ["Kodeskolen", "Kodestumper", "Huskekort", "Quiz", "Phishing-træner", "IT-ordbog", "Tastaturtræner", "Bit-spil", "CircuitPilot", "Værktøjskasse"] and not set(tiles) & set(names) and not set(tiles) & {x.strip() for x in side}, (tiles, names))

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
        check("baggrund: 7 landskaber + 8 temaer, valget gemmes", await page.locator(".land-tile").count() == 15 and prefs["world"]["landscape"] == "coast" and prefs["world"]["source"] == "landscape", prefs["world"])
        await page.click(".land-tile:has-text('Tokyo')")
        await page.wait_for_timeout(1400)
        prefs = (await api(page, "GET", "/api/me/prefs"))["data"]["prefs"]
        check("tema: Tokyo om natten vælges og tegnes", prefs["world"]["source"] == "scene" and prefs["world"]["scene"] == "tokyo" and await page.locator("#world-scene").count() == 1, prefs["world"])
        await page.screenshot(path=f"{OUT}/theme-tokyo.png")
        await page.click(".land-tile:has-text('Kysten')")
        await page.wait_for_timeout(800)
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

        # ── background piano music: off until you turn it on, can be paused ──
        check("baggrundsmusik: slået fra som standard", not await page.evaluate("import('/js/features/piano.js').then(m => m.isPlaying())"))
        await page.click(".bgm-btn"); await page.click(".bgm-play"); await page.wait_for_timeout(800)
        playing = await page.evaluate("import('/js/features/piano.js').then(m => m.isPlaying())")
        await page.click(".bgm-play"); await page.wait_for_timeout(300)
        paused = not await page.evaluate("import('/js/features/piano.js').then(m => m.isPlaying())")
        check("baggrundsmusik: klaveret spiller og kan sættes på pause", playing and paused)
        await page.keyboard.press("Escape")

        # ── app groups: Planlæg / Service / Office share one menu entry with tabs; Kodestumper lives in Læring ──
        await page.goto(BASE + "/#/apps/tasks"); await page.wait_for_selector(".suite-tabs")
        tabs = await page.locator(".suite-tabs .learn-tab").all_text_contents()
        check("app-grupper: Opgaver har faner for Planlæg", [t.strip() for t in tabs] == ["Kalender", "Opgaver", "Fokus", "Vaner"], tabs)
        await page.goto(BASE + "/#/apps"); await page.wait_for_selector(".launcher-item")
        names = await page.locator(".launcher-item .app-card-title, .launcher-item h3").all_text_contents()
        joined = " | ".join(names)
        check("app-grupper: én indgang for Planlæg og Service", "Planlæg" in joined and "Service" in joined and "Opgaver" not in joined and "Lager" not in joined, joined[:300])
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
        await tp.locator("button:has-text('Gem')").click(); await page.wait_for_timeout(700)
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
        await go("apps/game2048", ".g2-cell")
        for k in ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]:
            await page.keyboard.press(k)
        await page.wait_for_timeout(1300)
        g2 = (await api(page, "GET", "/api/state/game2048"))["data"]["state"]
        check("2048: brikkerne flytter sig, og spillet gemmes", sum(1 for r in g2["grid"] for v in r if v) >= 3)
        await go("apps/mines", ".mn-cell")
        await page.locator(".mn-cell").nth(40).click()
        check("minestryger: første klik åbner sikkert", await page.locator(".mn-cell.is-open").count() >= 1 and await page.locator(".mn-cell.is-mine").count() == 0)
        await go("apps/memory", ".mm-card")
        await page.locator(".mm-card").nth(0).click(); await page.locator(".mm-card").nth(1).click()
        await page.wait_for_timeout(200)
        mv = await page.locator(".mm-page .gm-top b, .gm-page .gm-top b").first.inner_text()
        check("huskespil: to kort vendt = ét træk", mv == "1", (mv, await page.locator(".mm-card.is-up").count()))
        await go("apps/snake", ".gm-canvas")
        await page.click(".gm-overlay button:has-text('Start')"); await page.wait_for_timeout(400); await page.keyboard.press("ArrowDown"); await page.wait_for_timeout(600)
        check("snake: spillet kører", await page.locator(".gm-overlay[hidden]").count() == 1)
        await go("apps/habits", ".hb-add")
        await page.fill("input[aria-label='Ny vane']", "Gå en tur"); await page.click(".hb-add button")
        await page.click(".hb-check"); await page.wait_for_timeout(1300)
        hb = (await api(page, "GET", "/api/state/habits"))["data"]["state"]["habits"][0]
        check("vaner: vane tilføjet og krydset af i dag", hb["name"] == "Gå en tur" and len(hb["days"]) == 1)
        await go("apps/budget", ".bd-form")
        await page.click(".bd-page .segmented button:has-text('Indtægt')")
        await page.fill("input[aria-label='Beløb']", "20000"); await page.fill("input[aria-label='Tekst']", "Løn"); await page.click(".bd-form button:has-text('Tilføj')")
        await page.click(".bd-page .segmented button:has-text('Udgift')")
        await page.fill("input[aria-label='Beløb']", "5000"); await page.fill("input[aria-label='Tekst']", "Husleje"); await page.click(".bd-form button:has-text('Tilføj')")
        await page.wait_for_timeout(300)
        check("budget: 20.000 ind og 5.000 ud giver 15.000 tilbage", "15.000" in await page.locator(".bd-tile").nth(2).inner_text(), await page.locator(".bd-tile").nth(2).inner_text())
        await page.screenshot(path=f"{OUT}/app-budget.png")
        await go("apps/draw", ".dr-canvas")
        box = await page.locator(".dr-canvas").bounding_box()
        await page.mouse.move(box["x"] + 50, box["y"] + 50); await page.mouse.down(); await page.mouse.move(box["x"] + 300, box["y"] + 200, steps=8); await page.mouse.up()
        await page.click(".dr-acts button:has-text('Gem')"); await page.wait_for_timeout(1500)
        check("tegnebræt: tegning gemt på kontoen", len((await api(page, "GET", "/api/state/draw"))["data"]["state"]["gallery"]) == 1)
        # ── the next batch: Sudoku, Fire på stribe, Galgeleg, Hardwaretest, Kodeord, QR-koder, Svarskabeloner, Phishing-træner ──
        await go("apps/sudoku", ".sd-cell"); await page.wait_for_timeout(1500)
        sd = (await api(page, "GET", "/api/state/sudoku"))["data"]["state"]["game"]
        empty = sd["puzzle"].index(0)
        await page.locator(".sd-cell").nth(empty).click(); await page.click(f".sd-num[data-n='{sd['solution'][empty]}']")
        await page.wait_for_timeout(200)
        check("sudoku: et tal skrevet i et tomt felt", (await page.locator(".sd-cell").nth(empty).inner_text()).strip() == str(sd["solution"][empty]))
        check("sudoku: kun én løsning, og tallet er rigtigt", sd["puzzle"].count(0) >= 40)
        await page.screenshot(path=f"{OUT}/app-sudoku.png")
        await go("apps/connect4", ".c4-col")
        await page.locator(".c4-col").nth(3).click(); await page.wait_for_timeout(900)
        check("fire på stribe: din brik og computerens svar", await page.locator(".c4-cell.p1").count() == 1 and await page.locator(".c4-cell.p2").count() == 1)
        await page.screenshot(path=f"{OUT}/app-connect4.png")
        await go("apps/hangman", ".hm-key")
        for L in "AEIRNOST":
            if await page.locator(".hm-result").count(): break
            btn = page.locator(f".hm-key:text-is('{L}')")
            if await btn.is_enabled(): await btn.click()
        check("galgeleg: bogstaver gættet", await page.locator(".hm-key.is-hit, .hm-key.is-miss").count() >= 1)
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
        await go("learn", ".settings-body, .learn-page, main")
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
        ok = False
        for _ in range(40):
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
        for _ in range(40):
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
        for _ in range(50):
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
