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
            await p1.click(".cal-bar .segmented button:has-text('Uge')"); await p1.wait_for_selector(".cal-tg-col")
            check("kalender: ugevisning med syv dage", await p1.locator(".cal-tg-col").count() == 7)
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
            import datetime as _dt
            _t = _dt.date.today().replace(day=20)
            await api(p1, "PUT", "/api/state/birthdays", {"state": {"people": [{"id": "f1", "name": "Farmor", "date": f"1950-{_t.month:02d}-20"}]}})
            await p1.goto(BASE + "/#/"); await p1.wait_for_selector(".home-title")
            await p1.goto(BASE + "/#/apps/calendar"); await p1.click(".cal-bar .segmented button:has-text('Måned')")
            try:
                await p1.wait_for_selector(f".cal-pill:has-text('Farmor ({_t.year - 1950} år)')", timeout=8000); ok = True
            except Exception:
                ok = False
            check("kalender: fødselsdage fra Fødselsdage vises med alder", ok)
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
            import datetime as _dt
            t = _dt.date.today().isoformat()
            evs = [{"id": "w1", "title": "Møde", "date": t, "start": "09:00", "end": "10:30", "allDay": False, "color": "#38bdf8"},
                   {"id": "w2", "title": "Frokost", "date": t, "start": "10:00", "end": "11:00", "allDay": False, "color": "#f472b6"},
                   {"id": "w3", "title": "Ferie", "date": t, "allDay": True, "color": "#4ade80"}]
            await api(p1, "PUT", "/api/state/calendar", {"state": {"events": evs}})
            await p1.evaluate("localStorage.setItem('hubtech.cal.view', 'week')")
            await p1.goto(BASE + "/#/"); await p1.wait_for_selector(".home-title")
            await p1.goto(BASE + "/#/apps/calendar"); await p1.wait_for_selector(".cal-tg")
            await p1.wait_for_timeout(1200)   # shared calendars and birthdays load after the first draw
            check("kalender: ugen som skema med timer", await p1.locator(".cal-tg-ev").count() == 2 and await p1.locator(".cal-tg-adcell .cal-pill:has-text('Ferie')").count() == 1)
            boxes = [await p1.locator(f".cal-tg-ev:has-text('{n}')").bounding_box() for n in ("Møde", "Frokost")]
            check("kalender: aftaler, der overlapper, står side om side", abs(boxes[0]["x"] - boxes[1]["x"]) > 10 and boxes[0]["width"] < 120)
            await p1.screenshot(path=f"{OUT}/cal-timegrid.png")
            # drag Møde to 14:00 the same day (scroll the timetable so 09–15 is in view first)
            await p1.evaluate("document.querySelector('.cal-tg-scroll').scrollTop = 2 * 44; document.querySelector('.cal-tg-scroll').scrollIntoView({block: 'center'})")
            await p1.wait_for_timeout(200)
            col = p1.locator(".cal-tg-col.is-today")
            cb = await col.bounding_box()
            src = p1.locator(".cal-tg-ev:has-text('Møde')")
            sb = await src.bounding_box()
            # 14:00 is (14-7) hours below the top
            sb = await src.bounding_box(); cb = await col.bounding_box()
            await p1.mouse.move(sb["x"] + 8, sb["y"] + 4); await p1.mouse.down()
            await p1.mouse.move(cb["x"] + 12, cb["y"] + (14 - 7) * 44 + 4, steps=12); await p1.mouse.up()
            await p1.wait_for_timeout(600)
            st = (await api(p1, "GET", "/api/state/calendar"))["data"]["state"]["events"]
            m = next(e for e in st if e["id"] == "w1")
            check("kalender: træk en aftale til et andet tidspunkt – længden bevares", m["start"] == "14:00" and m["end"] == "15:30", (m["start"], m["end"]))
            # click an empty slot → new appointment at that time
            await p1.evaluate("document.querySelector('.cal-tg-scroll').scrollTop = 6 * 44; document.querySelector('.cal-tg-scroll').scrollIntoView({block: 'center'})")
            await p1.wait_for_timeout(200)
            await p1.locator(".cal-tg-col.is-today").click(position={"x": 10, "y": (16 - 7) * 44 + 10}); await p1.wait_for_selector(".modal")
            st1 = await p1.input_value(".modal input[aria-label='Starttid'], .modal input[type=time] >> nth=0")
            check("kalender: klik på et tidspunkt laver en aftale der", st1 == "16:00", st1)
            await p1.keyboard.press("Escape")
            await p1.evaluate("localStorage.setItem('hubtech.cal.view', 'month')")
            d = await api(p1, "POST", "/api/office/docs", {"kind": "doc", "title": "Rapport"})
            dd = d["data"]; did = (dd.get("doc") or dd)["id"]
            await p1.goto(BASE + f"/#/apps/hubtech/doc/{did}"); await p1.wait_for_selector(".doc-page")
            await p1.click(".doc-page")
            await p1.keyboard.type("# Indledning"); await p1.keyboard.press("Enter")
            await p1.keyboard.type("- æbler"); await p1.keyboard.press("Enter"); await p1.keyboard.type("pærer"); await p1.keyboard.press("Enter"); await p1.keyboard.press("Enter")
            await p1.keyboard.type("Æbler er gode. Æbler er røde."); await p1.keyboard.press("Enter")
            html = await p1.inner_html(".doc-page")
            check("dokument: “# ” bliver en overskrift og “- ” en punktliste", "<h1>Indledning</h1>" in html and "<li>æbler</li>" in html and "<li>pærer</li>" in html, html[:300])
            await p1.keyboard.press("Control+h"); await p1.wait_for_selector(".ofx-find:not([hidden])")
            await p1.fill(".ofx-find input[aria-label=Find]", "æbler")
            n = await p1.inner_text(".ofx-find-n")
            check("dokument: find viser antal", "af 3" in n, n)
            await p1.fill(".ofx-find input[aria-label='Erstat med']", "pærer"); await p1.click(".ofx-find button:has-text('Erstat alle')")
            await p1.wait_for_timeout(200)
            txt = await p1.inner_text(".doc-page")
            check("dokument: erstat alle", "æbler" not in txt.lower() and txt.lower().count("pærer") == 4, txt)
            await p1.screenshot(path=f"{OUT}/doc-find.png")
            await p1.keyboard.press("Escape")
            await p1.click(".doc-page"); await p1.keyboard.press("Control+End")
            await p1.click(".ofx-tool[aria-label='Indsæt tabel']"); await p1.click(".modal .btn-primary")
            await p1.wait_for_selector(".ofx-tabletools:not([hidden])")
            await p1.click(".ofx-tabletools .ofx-tool[aria-label='Indsæt kolonne til højre']")
            cols = await p1.locator(".doc-page table tr >> nth=0").locator("th, td").count()
            check("dokument: tabelværktøjer dukker op og tilføjer en kolonne", cols == 4, cols)
            await p1.click(".ofx-tool[aria-label='Overblik over overskrifter']")
            check("dokument: overblik med overskrifterne", "Indledning" in await p1.inner_text(".ofx-outline"))
            await p1.screenshot(path=f"{OUT}/doc-tools.png")
            d = await api(p1, "POST", "/api/office/docs", {"kind": "sheet", "title": "Uger"})
            dd = d["data"]; sid = (dd.get("doc") or dd)["id"]
            await p1.goto(BASE + f"/#/apps/hubtech/sheet/{sid}"); await p1.wait_for_selector(".sh-grid td")
            await p1.click(".sh-grid td[data-c='0'][data-r='0']")
            for v in ["Mandag", "Tirsdag"]:
                await p1.keyboard.type(v); await p1.keyboard.press("Enter")
            await p1.click(".sh-grid td[data-c='1'][data-r='0']"); await p1.keyboard.type("10"); await p1.keyboard.press("Enter"); await p1.keyboard.type("20"); await p1.keyboard.press("Enter")
            await p1.click(".sh-grid td[data-c='2'][data-r='0']"); await p1.keyboard.type("=B1*2"); await p1.keyboard.press("Enter")
            # select A1:C2 then drag the handle down to row 5
            await p1.click(".sh-grid td[data-c='0'][data-r='0']"); await p1.click(".sh-grid td[data-c='2'][data-r='1']", modifiers=["Shift"])
            hb = await p1.locator(".sh-handle").bounding_box()
            tgt = await p1.locator(".sh-grid td[data-c='2'][data-r='4']").bounding_box()
            await p1.mouse.move(hb["x"] + 4, hb["y"] + 4); await p1.mouse.down(); await p1.mouse.move(tgt["x"] + 10, tgt["y"] + 8, steps=8); await p1.mouse.up()
            await p1.wait_for_timeout(300)
            col = lambda c: [p1.locator(f".sh-grid td[data-c='{c}'][data-r='{r}']").inner_text() for r in range(5)]
            a = [await x for x in col(0)]; b = [await x for x in col(1)]; c = [await x for x in col(2)]
            check("regneark: træk i hjørnet fortsætter ugedage og tal", a == ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag"] and b == ["10", "20", "30", "40", "50"], (a, b))
            check("regneark: formler følger med, når de fyldes ned (mønsteret gentages som i Excel)", c == ["20", "", "60", "", "100"], c)
            await p1.screenshot(path=f"{OUT}/sheet-fill.png")
            # right-click: insert a row above row 2, the formula in C3 now points at B3
            await p1.click(".sh-grid td[data-c='0'][data-r='1']", button="right"); await p1.click(".ofx-menu button:has-text('Indsæt række over')")
            await p1.wait_for_timeout(300)
            await p1.click(".sh-grid td[data-c='2'][data-r='3']")
            fxv = await p1.input_value(".sh-fx")
            check("regneark: højreklik → indsæt række, og formlerne retter sig", fxv == "=B4*2" and await p1.locator(".sh-grid td[data-c='0'][data-r='1']").inner_text() == "", fxv)
            await p1.keyboard.press("Control+z"); await p1.wait_for_timeout(300)
            check("regneark: fortryd indsat række", await p1.locator(".sh-grid td[data-c='0'][data-r='1']").inner_text() == "Tirsdag")
            import datetime as _dt
            t = _dt.date.today().isoformat()
            await api(p1, "PUT", "/api/state/calendar", {"state": {"events": [{"id": "g1", "title": "Tandlæge", "date": t, "start": "10:00", "end": "11:00", "allDay": False, "color": "#38bdf8"},
                {"id": "g2", "title": "Fodbold", "date": "2026-01-01", "start": "17:00", "end": "18:00", "allDay": False, "repeat": {"freq": "day"}}]}})
            await api(p1, "PUT", "/api/state/tasks", {"state": {"tasks": [{"id": "k1", "title": "Ring til Jensen", "status": "todo", "prio": "med", "due": t, "created": 1, "updated": 1}]}})
            await api(p1, "PUT", "/api/state/habits", {"state": {"habits": [{"id": "h1", "name": "Gå en tur", "emoji": "🚶", "goal": 7, "days": []}]}})
            await p1.goto(BASE + "/widget"); await p1.wait_for_selector(".wg-sec")
            check("widget: /widget åbner “I dag” uden menuer", await p1.locator(".wg-list li:has-text('Tandlæge')").count() == 1 and await p1.locator(".wg-list li:has-text('Fodbold')").count() == 1 and await p1.locator(".sidebar, .side-nav, .topbar").count() == 0)
            man = await p1.evaluate("document.querySelector('link[rel=manifest]').getAttribute('href')")
            check("widget: egen manifest, så den kan installeres som sin egen app", man == "widget.webmanifest", man)
            await p1.click(".wg-check"); await p1.wait_for_timeout(600)
            ts = (await api(p1, "GET", "/api/state/tasks"))["data"]["state"]["tasks"]
            check("widget: sæt flueben ved en opgave", ts[0]["status"] == "done")
            await p1.click(".wg-habit"); await p1.wait_for_timeout(600)
            hb = (await api(p1, "GET", "/api/state/habits"))["data"]["state"]["habits"]
            check("widget: sæt flueben ved en vane", t in hb[0]["days"])
            await p1.fill(".wg-add input", "Møde i morgen kl 9"); await p1.press(".wg-add input", "Enter"); await p1.wait_for_timeout(700)
            ev = (await api(p1, "GET", "/api/state/calendar"))["data"]["state"]["events"]
            check("widget: tilføj en aftale fra widgetten", any(e["title"] == "Møde" and e["start"] == "09:00" for e in ev))
            await p1.set_viewport_size({"width": 400, "height": 700})
            await p1.screenshot(path=f"{OUT}/widget-window.png")
            await p1.set_viewport_size({"width": 1280, "height": 900})
            await p2.goto(BASE + "/widget"); await p2.wait_for_selector(".wg-sec")
            over = await p2.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            check("widget: på telefonen uden vandret rulning", over <= 2, over)
            await p2.screenshot(path=f"{OUT}/widget-phone.png")
            c5 = await browser.new_context(); p5 = await c5.new_page()
            await p5.goto(BASE + "/widget"); await p5.wait_for_selector("#login-user", timeout=10000)
            check("widget: uden login sendes man til log ind", "widget" in p5.url, p5.url)
            await c5.close()
            await p1.goto(BASE + "/#/settings/apps"); await p1.wait_for_selector(".wgset-grid")
            check("indstillinger: widget-vejledning til Windows, iPhone og Android", await p1.locator(".wgset-how").count() == 3)
            # small helpers: overlap warning, keyboard shortcuts, quick deadlines, checklist → tasks
            import datetime as _d2
            t0 = _d2.date.today().isoformat()
            await api(p1, "PUT", "/api/state/calendar", {"state": {"events": [{"id": "o1", "title": "Møde", "date": t0, "start": "10:00", "end": "11:00", "allDay": False}]}})
            await p1.evaluate("localStorage.setItem('hubtech.cal.view', 'month')")
            await p1.goto(BASE + "/#/"); await p1.wait_for_selector(".home-title")
            await p1.goto(BASE + "/#/apps/calendar"); await p1.wait_for_selector(".cal-pill"); await p1.wait_for_timeout(600)
            await p1.keyboard.press("n"); await p1.wait_for_selector(".modal input[aria-label='Start']")
            await p1.fill(".modal input[aria-label='Dato']", t0)
            await p1.fill(".modal input[aria-label='Start']", "10:30"); await p1.dispatch_event(".modal input[aria-label='Start']", "change")
            await p1.wait_for_timeout(200)
            check("kalender: N laver en ny aftale, og overlap vises", "Overlapper med" in await p1.inner_text(".modal .cal-clash"))
            check("kalender: når starten flyttes, beholder aftalen sin længde", await p1.input_value(".modal input[aria-label='Slut']") == "11:30")
            await p1.keyboard.press("Escape")
            await p1.goto(BASE + "/#/apps/tasks"); await p1.wait_for_selector(".kb-card")
            await p1.locator(".kb-card").first.dblclick(); await p1.wait_for_selector(".modal .kb-quickdue")
            await p1.click(".modal .kb-quickdue button:has-text('I morgen')")
            tom = (_d2.date.today() + _d2.timedelta(days=1)).isoformat()
            check("opgaver: hurtigknap til deadline", await p1.input_value(".modal input[aria-label='Deadline']") == tom)
            await p1.keyboard.press("Escape")
            await api(p1, "PUT", "/api/state/notes", {"state": {"notes": [{"id": "nn1", "title": "Weekend", "body": "[ ] Køb maling\n[x] Ring til Bo\n[ ] Klip hæk", "pinned": False, "color": "", "created": 1, "updated": 1}]}})
            await p1.goto(BASE + "/#/"); await p1.wait_for_selector(".home-title")
            await p1.goto(BASE + "/#/apps/notes"); await p1.click(".note-item:has-text('Weekend')")
            await p1.click(".note-toolbar button[aria-label^='Send 2 punkter']"); await p1.wait_for_timeout(800)
            tt = [x["title"] for x in (await api(p1, "GET", "/api/state/tasks"))["data"]["state"]["tasks"]]
            check("noter: ikke-afkrydsede punkter bliver til opgaver", "Køb maling" in tt and "Klip hæk" in tt and "Ring til Bo" not in tt, tt[:5])
            # machine and software courses
            await p1.goto(BASE + "/#/learn"); await p1.wait_for_selector(".maker-courses .guide-card", timeout=10000)
            n = await p1.locator(".maker-courses .guide-card").count()
            check("kurser: læringsappenes og maskinernes kurser i Guides & Læring", n >= 25, n)
            await p1.screenshot(path=f'{OUT}/ws-kurser.png', full_page=False)
            await p1.click(".maker-courses .guide-card[data-course='lightburn']"); await p1.wait_for_selector(".day-grid")
            check("kurser: LightBurn-oversigten viser lektioner", "lektioner" in (await p1.inner_text(".course-page")).lower() and await p1.locator(".day-tile").count() >= 5)
            await p1.click(".day-tile >> nth=0"); await p1.wait_for_selector(".day-card .tasks input")
            await p1.click(".day-card .task >> nth=0"); await p1.wait_for_timeout(300)
            await p1.screenshot(path=f'{OUT}/ws-kursus-lightburn.png', full_page=False)
            await p1.goto(BASE + "/#/"); await p1.wait_for_selector(".home-title"); await p1.wait_for_timeout(600)
            st = (await api(p1, "GET", "/api/state/course-lightburn"))["data"]["state"]
            check("kurser: afkrydsning gemmes pr. kursus", bool(st and st["days"]["0"]["tasks"][0]), st)
            summ = (await api(p1, "GET", "/api/me/summary"))["data"] or {}
            check("kurser: øvelser giver XP på kontoen", (summ.get("courseTasksDone") or 0) >= 1, summ)
            await p1.goto(BASE + "/#/learn/course/kode-python/day/1"); await p1.wait_for_selector(".day-card .g-code pre")
            check("kurser: Kodeskolens lektioner kan læses som kursus med kodeeksempel", "print" in await p1.inner_text(".day-card .g-code pre"))
            check("kurser: link til selve lektionen i Kodeskolen", await p1.locator(".day-card .read-list a[href='#/learn/codeschool/python/py1']").count() == 1)
            await p1.goto(BASE + "/#/learn"); await p1.wait_for_selector(".maker-courses .guide-card")
            await p1.fill("input[aria-label='Søg i guides og kurser']", "ipconfig"); await p1.wait_for_timeout(500)
            check("kurser: søgningen finder lektioner i kurserne", await p1.locator(".guide-card[href^='#/learn/course/kommandoer']").count() >= 1)
            await p1.screenshot(path=f'{OUT}/ws-kursus-soeg.png', full_page=False)
            await p1.goto(BASE + "/#/learn/course/findesikke"); await p1.wait_for_selector(".course-page")
            check("kurser: ukendt kursus giver en venlig besked", "Kurset findes ikke" in await p1.inner_text(".course-page"))
        except Exception as ex:
            print('ERR', str(ex)[:600], flush=True); await p1.screenshot(path=f'{OUT}/dbg-p1.png'); raise
        await c1.close(); await c2.close()
        await browser.close()
    failed = sum(1 for r in results if not r[1])
    print(f"{len(results) - failed}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)

asyncio.run(main())
