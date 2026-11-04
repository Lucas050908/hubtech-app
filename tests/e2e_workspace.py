"""Browser test for the workspace apps (Kalender, Opgaver, Noter, Vaner, Budget, søgningen). Runs after e2e_browser.py
against the same server (it uses the accounts that test made):

    HUBTECH_DATA_DIR=/tmp/hubtech-e2e python3 server/app.py --port 8193
    python3 tests/e2e_browser.py http://127.0.0.1:8193 /tmp/shots [cursor-open-log]

Exercises the real user flows and prints PASS/FAIL per check. Exit code 1 on any failure.
"""
import asyncio
import json, base64
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
        # ── Spil sammen: Fire på stribe online and the Fart-tast race between two people ──
        async def login_ctx(user, pw, **kw):
            c = await browser.new_context(**(kw or {"viewport": {"width": 1280, "height": 860}}))
            await c.add_init_script("try { localStorage.setItem('hubtech.friendsAsked','1'); localStorage.setItem('hubtech.updateCheck', String(Date.now())); } catch(e) {}")
            pg = await c.new_page()
            await pg.goto(BASE + "/#/login"); await pg.fill("#login-user", user); await pg.fill("#login-pass", pw); await pg.click("button[type=submit]")
            await pg.wait_for_selector(".home-title", timeout=20000)
            return c, pg
        c1, p1 = await login_ctx("oliver", "Sommer2026x!")
        c2, p2 = await login_ctx("maja", "Vinter2026xx", **p.devices["Pixel 7"])
        await p2.wait_for_timeout(2500)
        try:
            await api(p1, "PUT", "/api/state/calendar", {"state": {"events": []}})
            await p1.evaluate("localStorage.removeItem('hubtech.cal.view')")
            await p1.goto(BASE + "/#/apps/calendar"); await p1.wait_for_selector(".cal-quick input")
            await p1.fill(".cal-quick input", "Fodbold hver tirsdag 17-18:30 @ Hallen")
            hint = await p1.inner_text(".cal-quick-hint")
            check("kalender: hurtig tilføj viser, hvad den forstod", "Fodbold" in hint and "17:00–18:30" in hint and "hver uge" in hint and "Hallen" in hint, hint)
            await p1.screenshot(path=f"{OUT}/cal-quick.png")
            await p1.press(".cal-quick input", "Enter"); await p1.wait_for_timeout(800)
            evs = (await api(p1, "GET", "/api/state/calendar"))["data"]["state"]["events"]
            check("kalender: hurtig tilføj gemmer en gentaget aftale", len(evs) == 1 and evs[0]["repeat"]["freq"] == "week" and evs[0]["start"] == "17:00")
            await p1.wait_for_timeout(500)
            n = await p1.locator(".cal-pill:has-text('Fodbold')").count()
            check("kalender: gentagelsen vises hver uge i måneden", n >= 3, n)
            await p1.screenshot(path=f"{OUT}/cal-month-repeat.png")
            # one-off event, then drag it to another day
            await p1.fill(".cal-quick input", "Tandlæge i morgen kl 10"); await p1.press(".cal-quick input", "Enter"); await p1.wait_for_timeout(800)
            evs = (await api(p1, "GET", "/api/state/calendar"))["data"]["state"]["events"]
            tl = next(e for e in evs if e["title"] == "Tandlæge")
            src_pill = p1.locator(".cal-pill:has-text('Tandlæge')").first
            cells = p1.locator(".cal-cell:not(.is-out)")
            target = None
            for i in range(await cells.count()):
                d = await cells.nth(i).get_attribute("data-d")
                if d != tl["date"] and await cells.nth(i).locator(".cal-pill").count() == 0:
                    target = d; break
            await src_pill.drag_to(p1.locator(f".cal-cell[data-d='{target}']"))
            await p1.wait_for_timeout(800)
            evs = (await api(p1, "GET", "/api/state/calendar"))["data"]["state"]["events"]
            check("kalender: træk en aftale til en anden dag", next(e for e in evs if e["title"] == "Tandlæge")["date"] == target, target)
            # week view
            await p1.click(".cal-bar .segmented button:has-text('Uge')"); await p1.wait_for_selector(".cal-wk-col")
            check("kalender: ugevisning med syv dage", await p1.locator(".cal-wk-col").count() == 7)
            await p1.screenshot(path=f"{OUT}/cal-week.png")
            # search
            await p1.fill(".cal-search", "hallen"); await p1.wait_for_selector(".cal-results .cal-item")
            check("kalender: søgning finder aftalen på stedet", "Fodbold" in await p1.inner_text(".cal-results"))
            await p1.fill(".cal-search", "")
            # delete only one time of the series
            await p1.click(".cal-bar .segmented button:has-text('Måned')"); await p1.wait_for_selector(".cal-pill")
            before = await p1.locator(".cal-pill:has-text('Fodbold')").count()
            await p1.locator(".cal-pill:has-text('Fodbold')").nth(1).click(); await p1.wait_for_selector(".cal-series-note")
            await p1.click(".modal button:has-text('Slet')"); await p1.click(".modal button:has-text('Kun denne gang')"); await p1.wait_for_timeout(800)
            after = await p1.locator(".cal-pill:has-text('Fodbold')").count()
            check("kalender: slet kun én gang af en gentaget aftale", after == before - 1, (before, after))
            await p1.screenshot(path=f"{OUT}/cal-after-skip.png")
            await p2.goto(BASE + "/#/apps/calendar"); await p2.wait_for_selector(".cal-quick input")
            over = await p2.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            await p2.click(".cal-bar .segmented button:has-text('Uge')"); await p2.wait_for_selector(".cal-wk-col")
            over2 = await p2.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            check("kalender: telefon uden vandret rulning", over <= 2 and over2 <= 2, (over, over2))
            await p2.screenshot(path=f"{OUT}/cal-phone-week.png")
            await api(p1, "PUT", "/api/state/tasks", {"state": {"tasks": []}})
            await p1.goto(BASE + "/#/apps/tasks"); await p1.wait_for_selector(".kb-add input")
            await p1.fill(".kb-add input[aria-label='Ny opgave']", "Ring til Jensen i morgen kl 10 !")
            hint = await p1.inner_text(".kb-hint")
            check("opgaver: skriv dato og tid i teksten – den forstås", "Ring til Jensen" in hint and "kl. 10:00" in hint and "høj" in hint, hint)
            await p1.screenshot(path=f"{OUT}/tasks-smart.png")
            await p1.press(".kb-add input[aria-label='Ny opgave']", "Enter"); await p1.wait_for_timeout(700)
            t = (await api(p1, "GET", "/api/state/tasks"))["data"]["state"]["tasks"][0]
            check("opgaver: gemt med deadline, tid og høj prioritet", t["title"] == "Ring til Jensen" and t["dueTime"] == "10:00" and t["prio"] == "high" and t["due"])
            await p1.fill(".kb-add input[aria-label='Ny opgave']", "Tøm opvaskemaskinen hver dag"); await p1.press(".kb-add input[aria-label='Ny opgave']", "Enter"); await p1.wait_for_timeout(500)
            # checklist in the editor
            await p1.dblclick(".kb-card:has-text('Ring til Jensen')"); await p1.wait_for_selector(".modal input[aria-label='Nyt punkt på tjeklisten']")
            for x in ["Find nummeret", "Hav tilbuddet klar", "Skriv noter"]:
                await p1.fill(".modal input[aria-label='Nyt punkt på tjeklisten']", x); await p1.press(".modal input[aria-label='Nyt punkt på tjeklisten']", "Enter")
            await p1.click(".modal .kb-ck >> nth=0 >> input[type=checkbox]")
            await p1.screenshot(path=f"{OUT}/tasks-checklist.png")
            await p1.click(".modal .btn-primary:has-text('Gem')"); await p1.wait_for_timeout(600)
            check("opgaver: tjekliste med fremskridt på kortet", "1/3" in await p1.inner_text(".kb-card:has-text('Ring til Jensen')") and await p1.locator(".kb-card:has-text('Ring til Jensen') .kb-prog").count() == 1)
            # repeating task comes back when done
            card = p1.locator(".kb-card:has-text('Tøm opvaskemaskinen')")
            check("opgaver: gentaget opgave viser det", "Hver dag" in await card.inner_text())
            await card.locator(".kb-next").click(); await p1.wait_for_timeout(300)
            await p1.locator(".kb-card:has-text('Tøm opvaskemaskinen') .kb-next").first.click(); await p1.wait_for_timeout(700)
            ts = (await api(p1, "GET", "/api/state/tasks"))["data"]["state"]["tasks"]
            ops = [x for x in ts if x["title"] == "Tøm opvaskemaskinen"]
            check("opgaver: færdig gentaget opgave kommer igen med næste dato", len(ops) == 2 and sorted(x["status"] for x in ops) == ["done", "todo"] and next(x for x in ops if x["status"] == "todo")["due"] > next(x for x in ops if x["status"] == "done")["due"], ops)
            await p1.screenshot(path=f"{OUT}/tasks-board.png")
            await p1.click(".kb-filters .segmented button:has-text('I dag')"); await p1.wait_for_timeout(300)
            check("opgaver: filter “I dag”", await p1.locator(".kb-list[data-status=todo] .kb-card").count() == 0)
            await api(p1, "PUT", "/api/state/notes", {"state": {"notes": []}})
            await p1.goto(BASE + "/#/apps/notes"); await p1.click(".note-side-head button[aria-label='Ny note']")
            await p1.fill(".note-title", "Indkøb")
            await p1.click(".note-body")
            await p1.keyboard.type("[ ] mælk"); await p1.keyboard.press("Enter"); await p1.keyboard.type("brød"); await p1.keyboard.press("Enter"); await p1.keyboard.press("Enter")
            await p1.keyboard.type("Husk #weekend")
            body = await p1.input_value(".note-body")
            check("noter: Enter fortsætter tjeklisten, to gange slutter den", body == "[ ] mælk\n[ ] brød\nHusk #weekend", repr(body))
            await p1.click(".note-toolbar .segmented button:has-text('Vis')"); await p1.wait_for_selector(".note-ck")
            await p1.click(".note-ck >> nth=0")
            await p1.wait_for_timeout(300)
            check("noter: vis-tilstand med afkrydsning, der gemmes", await p1.locator(".note-ck.is-done").count() == 1)
            await p1.wait_for_timeout(1200)
            n = (await api(p1, "GET", "/api/state/notes"))["data"]["state"]["notes"][0]
            check("noter: afkrydsningen er gemt i teksten", n["body"].startswith("[x] mælk"), n["body"])
            check("noter: #emner vises i siden", await p1.locator(".note-tags .note-tag:has-text('#weekend')").count() == 1)
            await p1.screenshot(path=f"{OUT}/notes-view.png")
            await p1.click(".note-toolbar button[aria-label='Læg i papirkurven']"); await p1.wait_for_timeout(400)
            check("noter: slettet note ligger i papirkurven", await p1.locator(".note-trash-btn:has-text('Papirkurv (1)')").count() == 1)
            await p1.click(".note-trash-btn"); await p1.click(".note-item"); await p1.click(".note-editor button:has-text('Gendan')"); await p1.wait_for_timeout(400)
            check("noter: gendan fra papirkurven", await p1.locator(".note-item:has-text('Indkøb')").count() == 1 and await p1.locator(".note-trash-btn").count() == 0)
            await api(p1, "PUT", "/api/state/habits", {"state": {"habits": []}})
            await p1.goto(BASE + "/#/apps/habits"); await p1.wait_for_selector(".hb-sugg .chip")
            await p1.click(".hb-sugg .chip:has-text('Træn')"); await p1.wait_for_selector(".hb-item")
            check("vaner: forslag tilføjes med ét tryk og ugemål", "3 gange om ugen" in await p1.inner_text(".hb-item"))
            await p1.click(".hb-item .hb-day >> nth=26")   # yesterday
            await p1.wait_for_timeout(300)
            check("vaner: ret en glemt dag i rækken", await p1.locator(".hb-item .hb-day.is-on").count() == 1)
            await p1.click(".hb-item .hb-check"); await p1.wait_for_timeout(300)
            await p1.click(".hb-item button[aria-label^='Redigér']"); await p1.fill(".modal input[aria-label=Navn]", "Løb"); await p1.click(".modal .btn-primary")
            await p1.wait_for_timeout(300)
            check("vaner: omdøb en vane", "Løb" in await p1.inner_text(".hb-item b"))
            await p1.screenshot(path=f"{OUT}/habits.png")
            await p1.click(".hb-item button[aria-label^='Redigér']"); await p1.click(".modal button:has-text('Slet')"); await p1.wait_for_timeout(300)
            await p1.click(".toast button:has-text('Fortryd')"); await p1.wait_for_timeout(300)
            check("vaner: slet kan fortrydes", await p1.locator(".hb-item").count() == 1)
            import datetime
            t = datetime.date.today(); cur = f"{t.year}-{t.month:02d}"; pm = (t.replace(day=1) - datetime.timedelta(days=1)); prev = f"{pm.year}-{pm.month:02d}"
            items = [{"id": "a", "month": prev, "kind": "in", "amount": 18000, "cat": "Løn", "text": "Løn", "fixed": True},
                     {"id": "b", "month": prev, "kind": "out", "amount": 6000, "cat": "Bolig", "text": "Husleje", "fixed": True},
                     {"id": "c", "month": prev, "kind": "out", "amount": 2500, "cat": "Mad", "text": "Indkøb", "fixed": False}]
            await api(p1, "PUT", "/api/state/budget", {"state": {"items": items}})
            await p1.goto(BASE + "/#/apps/budget"); await p1.wait_for_selector(".bd-carry")
            check("budget: ny måned tilbyder de faste poster", "2 faste poster" in await p1.inner_text(".bd-carry"))
            await p1.click(".bd-carry button"); await p1.wait_for_timeout(400)
            check("budget: faste poster hentet med ét tryk", await p1.locator(".bd-row").count() == 2 and await p1.locator(".bd-carry .callout, .bd-carry").count() == 0)
            await p1.click(".bd-lim-btn:has-text('Bolig')"); await p1.fill(".modal input", "5000"); await p1.click(".modal .btn-primary"); await p1.wait_for_timeout(300)
            check("budget: grænse pr. kategori viser, når man er over", await p1.locator(".bd-bar.is-over").count() == 1 and "1.000" in await p1.inner_text(".bd-bar.is-over"))
            await p1.click(".bd-row:has-text('Husleje')"); await p1.fill(".modal input[aria-label='Beløb']", "4800"); await p1.click(".modal .btn-primary"); await p1.wait_for_timeout(300)
            check("budget: ret en post", "4.800" in await p1.inner_text(".bd-row:has-text('Husleje')") and await p1.locator(".bd-bar.is-over").count() == 0)
            check("budget: de sidste 12 måneder", await p1.locator(".bd-yb").count() == 12)
            await p1.screenshot(path=f"{OUT}/budget.png", full_page=True)
            await p1.click(".bd-row:has-text('Husleje') button[aria-label^='Slet']"); await p1.click(".toast button:has-text('Fortryd')"); await p1.wait_for_timeout(300)
            check("budget: slet kan fortrydes", await p1.locator(".bd-row").count() == 2)
            await api(p1, "PUT", "/api/state/calendar", {"state": {"events": []}})
            await p1.goto(BASE + "/#/"); await p1.wait_for_selector(".home-title")
            await p1.keyboard.press("Control+k"); await p1.wait_for_selector(".palette-input")
            await p1.fill(".palette-input", "aftale tandlæge i morgen kl 10")
            await p1.wait_for_timeout(300)
            first = await p1.inner_text(".palette-item.is-sel")
            check("søgning: “aftale …” foreslår at oprette aftalen øverst", "Ny aftale: Tandlæge" in first and "kl. 10:00" in first, first)
            await p1.screenshot(path=f"{OUT}/palette-create.png")
            await p1.press(".palette-input", "Enter"); await p1.wait_for_timeout(1200)
            evs = (await api(p1, "GET", "/api/state/calendar"))["data"]["state"]["events"]
            check("søgning: aftalen er lagt i kalenderen", len(evs) == 1 and evs[0]["title"] == "Tandlæge" and evs[0]["start"] == "10:00")
            await p1.keyboard.press("Control+k"); await p1.fill(".palette-input", "kalender"); await p1.wait_for_timeout(200)
            check("søgning: almindelig søgning virker stadig først", "Kalender" in await p1.inner_text(".palette-item.is-sel"))
            await p1.keyboard.press("Escape")
            await p1.goto(BASE + "/#/apps/calendar"); await p1.wait_for_selector(".cal-quick input")
            await p1.click("button:has-text('I telefonen')"); await p1.wait_for_selector(".modal button:has-text('Lav min kalender-adresse')")
            await p1.click(".modal button:has-text('Lav min kalender-adresse')"); await p1.wait_for_selector(".modal input[aria-label='Kalenderens adresse']")
            url = await p1.input_value(".modal input[aria-label='Kalenderens adresse']")
            ics = await p1.evaluate("(u) => fetch(u, {credentials: 'omit'}).then(r => r.text())", url)
            check("kalender: abonnér i telefonen giver en .ics-adresse uden login", ics.startswith("BEGIN:VCALENDAR") and "SUMMARY:" in ics)
            try:
                await p1.wait_for_selector(".modal .hl-qr svg", timeout=4000)
            except Exception:
                pass
            await p1.screenshot(path=f"{OUT}/cal-subscribe.png")
            await p1.keyboard.press("Escape")
            await p1.goto(BASE + "/#/apps/tasks"); await p1.wait_for_selector(".kb-sort")
            await p1.select_option(".kb-sort", "due"); await p1.wait_for_timeout(300)
            check("opgaver: sortér efter deadline", await p1.locator(".kb-card").count() >= 1)
        except Exception as ex:
            print('ERR', str(ex)[:600], flush=True); await p1.screenshot(path=f'{OUT}/dbg-p1.png'); raise
        await c1.close(); await c2.close()
        await browser.close()
    failed = sum(1 for r in results if not r[1])
    print(f"{len(results) - failed}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)

asyncio.run(main())
