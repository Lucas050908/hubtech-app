"""HUBTECH som demo – en færdig testkonto med eksempler, så en ven kan kigge rundt.

    python3 server/demo.py              (Windows: py server\\demo.py)

Åbn derefter http://127.0.0.1:8095 og log ind med

    brugernavn: demo
    adgangskode: hubtech-demo

Demoen er helt for sig selv: dens data ligger i ~/.hubtech-demo (ikke i din rigtige HUBTECH), den kan kun nås fra
den computer, den kører på, den leder ikke efter andre HUBTECH'er på netværket, og den kan ikke gøres offentlig.
Slet mappen ~/.hubtech-demo for at starte forfra.
"""
import os
import sys
from pathlib import Path

# set before anything from the server is imported: its own folder, this computer only, no neighbours, no public address
os.environ["HUBTECH_DATA_DIR"] = os.environ.get("HUBTECH_DEMO_DIR", "~/.hubtech-demo")
os.environ["HUBTECH_HOST"] = "127.0.0.1"
os.environ["HUBTECH_HUB_DISCOVERY"] = "0"
os.environ["HUBTECH_TAILSCALE_EXE"] = str(Path(__file__).with_name("no-public-address-in-the-demo"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import app, auth, db, projects  # noqa: E402

USERNAME, PASSWORD, PORT = "demo", "hubtech-demo", 8095


def _state(uid, app_id, data):
    import json
    db.q("INSERT INTO app_state(user_id, app_id, data, updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id, app_id) DO UPDATE SET data = excluded.data",
         (uid, app_id, json.dumps(data), db.now()))


def seed():
    """The test account and some examples – only the first time (your changes in the demo are kept after that)."""
    if db.one("SELECT 1 FROM users WHERE username = ?", (USERNAME,)):
        return False
    import datetime as dt
    import secrets
    now = db.now()
    cur = db.q("INSERT INTO users(username, display_name, password_hash, role, created_at, onboarding_done) VALUES(?,?,?,?,?,1)",
               (USERNAME, "Demo", auth.hash_password(PASSWORD), "owner", now))
    uid = cur.lastrowid
    db.q("INSERT INTO prefs(user_id, data, updated_at) VALUES(?, '{}', ?)", (uid, now))
    # a colleague, so the projects have two people in them (she can't log in – her password is random)
    db.q("INSERT INTO users(username, display_name, password_hash, role, created_at, onboarding_done) VALUES(?,?,?,?,?,1)",
         ("maja", "Maja", auth.hash_password(secrets.token_urlsafe(24)), "member", now))
    me = db.one("SELECT * FROM users WHERE id = ?", (uid,))
    maja = db.one("SELECT * FROM users WHERE username = 'maja'")

    today = dt.date.today()
    d = lambda n: (today + dt.timedelta(days=n)).isoformat()   # noqa: E731
    _state(uid, "calendar", {"events": [
        {"id": "e1", "title": "Møde med Hansen", "date": d(0), "start": "13:00", "end": "14:00", "allDay": False, "location": "Vestergade 12", "reminders": [{"id": "r1", "n": 15, "unit": "min"}]},
        {"id": "e2", "title": "Service hos Jensen", "date": d(1), "start": "09:00", "end": "10:30", "allDay": False, "location": "Industrivej 4", "reminders": [{"id": "r2", "n": 1, "unit": "day", "time": "18:00"}]},
        {"id": "e3", "title": "Fredagsbar", "date": d((4 - today.weekday()) % 7), "start": "15:00", "end": "17:00", "allDay": False, "location": "Kantinen"},
    ]})
    _state(uid, "tasks", {"tasks": [
        {"id": "t1", "title": "Bestil toner til printeren", "notes": "HP LaserJet i receptionen", "status": "todo", "prio": "high", "due": d(0), "project": None, "remind": "none", "created": now * 1000, "updated": now * 1000},
        {"id": "t2", "title": "Opdater Windows på kasse 2", "notes": "", "status": "doing", "prio": "med", "due": d(2), "project": None, "remind": "none", "created": now * 1000, "updated": now * 1000},
        {"id": "t3", "title": "Skriv tilbud til Hansen", "notes": "", "status": "todo", "prio": "med", "due": d(5), "project": None, "remind": "none", "created": now * 1000, "updated": now * 1000},
    ]})
    _state(uid, "notes", {"notes": [
        {"id": "n1", "title": "Wi-Fi i mødelokalet", "body": "Svagt signal ved vinduet.\n[ ] Mål med telefonen\n[ ] Bestil 3. adgangspunkt", "updated": now * 1000},
        {"id": "n2", "title": "Nyttige kommandoer", "body": "ipconfig /all\nping 192.168.1.1\ntracert 8.8.8.8", "updated": now * 1000},
    ]})

    # two projects: a job with the customer, and a bit of code with a described change (like a commit)
    job = secrets.token_hex(8)
    projects.emit(me, job, "project", {"name": "Kontorflytning", "kind": "work", "color": "#e8763a", "customer": "Hansen & Co", "deadline": d(14),
                                       "about": "Netværk, printere og pc'er flyttes til det nye kontor.", "members": [{"username": "maja", "name": "Maja"}], "review": False, "slug": "kontorflytning"})
    projects.emit(me, job, "msg", {"text": "Hej Maja – switchen står i skabet ved døren. Kassen skal på VLAN 20."})
    projects.emit(maja, job, "msg", {"text": "Super! Jeg tager kablerne med i morgen. Husk gæstenettet på VLAN 99."})
    for tid, title, done in (("a1b2c3d4e5f60718", "Mål Wi-Fi i mødelokalet", False), ("a1b2c3d4e5f60719", "Bestil 3. adgangspunkt", False), ("a1b2c3d4e5f6071a", "Tegn netværket", True)):
        projects.emit(me, job, "task", {"tid": tid, "title": title, "done": done})
    code = secrets.token_hex(8)
    projects.emit(me, code, "project", {"name": "Lager-scanneren", "kind": "code", "color": "#6aa9e8", "customer": "", "deadline": "", "about": "En lille side, hvor lageret scannes med telefonen.",
                                        "members": [{"username": "maja", "name": "Maja"}], "review": False, "slug": "lager-scanneren"})
    html = "<!doctype html>\n<html lang=\"da\">\n<meta charset=\"utf-8\">\n<title>Lageret</title>\n<h1>Lageret</h1>\n<p>Scan en vare for at se, hvor mange der er tilbage.</p>\n</html>\n"
    projects.emit(me, code, "commit", {"cid": secrets.token_hex(16), "title": "Første forside", "descr": "Hvad: en forside til lageret.\nHvorfor: kunden vil kunne se noget allerede i denne uge.",
                                       "files": [{"path": "site/index.html", "op": "set", "content": html, "b64": False, "base": "", "add": html.count("\n"), "del": 0}], "needsReview": False, "aiChecked": False, "task": ""})
    projects.emit(maja, code, "msg", {"text": "Flot! Skal vi have et søgefelt øverst?"})
    return True


def main():
    db.migrate()
    made = seed()
    print(f"\n  ◆ HUBTECH-demo{' (ny)' if made else ''}: åbn http://127.0.0.1:{PORT}\n    Log ind med  brugernavn: {USERNAME}   adgangskode: {PASSWORD}\n"
          f"    Data ligger for sig selv i {os.path.expanduser(os.environ['HUBTECH_DATA_DIR'])} – slet mappen for at starte forfra.\n", flush=True)
    app.main(["--host", "127.0.0.1", "--port", str(PORT)])


if __name__ == "__main__":
    main()
