"""Kalender-abonnement: a private .ics address for your own calendar, so the phone's calendar (iPhone, Android,
Outlook, Google) follows HUBTECH by itself. The address holds a random key; only its hash is stored, and the owner of
the calendar can make a new one (the old one stops working) or switch it off.
"""
import datetime
import hashlib
import json
import re
import secrets

from . import db
from .api import ApiError, require_user, is_https

FREQ = {"day": "FREQ=DAILY", "weekday": "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "week": "FREQ=WEEKLY",
        "2week": "FREQ=WEEKLY;INTERVAL=2", "month": "FREQ=MONTHLY", "year": "FREQ=YEARLY"}
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME = re.compile(r"^\d{2}:\d{2}$")


def _esc(s):
    return str(s or "").replace("\\", "\\\\").replace("\n", "\\n").replace(",", "\\,").replace(";", "\\;")


def _fold(line):
    """iCalendar lines are at most 75 octets; longer ones continue on the next line after a space."""
    out, cur = [], b""
    for ch in line:
        b = ch.encode("utf-8")
        if len(cur) + len(b) > 74:
            out.append(cur.decode("utf-8"))
            cur = b" "
        cur += b
    out.append(cur.decode("utf-8"))
    return "\r\n".join(out)


def to_ics(events, name="HUBTECH"):
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HUBTECH//Kalender//DA", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
             f"X-WR-CALNAME:{_esc(name)}", "X-WR-TIMEZONE:Europe/Copenhagen", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
             # Danish time: CET in winter, CEST from the last Sunday of March to the last Sunday of October
             "BEGIN:VTIMEZONE", "TZID:Europe/Copenhagen",
             "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
             "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
             "END:VTIMEZONE"]
    for e in events:
        if not isinstance(e, dict) or not DATE.match(str(e.get("date") or "")):
            continue
        d = e["date"].replace("-", "")
        end_d = str(e.get("endDate") or e["date"])
        end_d = end_d if DATE.match(end_d) else e["date"]
        lines += ["BEGIN:VEVENT", f"UID:{re.sub(r'[^A-Za-z0-9_-]', '', str(e.get('id') or ''))[:40] or secrets.token_hex(6)}@hubtech", f"DTSTAMP:{now}"]
        start, stop = str(e.get("start") or ""), str(e.get("end") or "")
        if e.get("allDay") or not TIME.match(start):
            nxt = (datetime.date.fromisoformat(end_d) + datetime.timedelta(days=1)).strftime("%Y%m%d")
            lines += [f"DTSTART;VALUE=DATE:{d}", f"DTEND;VALUE=DATE:{nxt}"]
            timed = False
        else:
            stop = stop if TIME.match(stop) else start
            lines += [f"DTSTART;TZID=Europe/Copenhagen:{d}T{start.replace(':', '')}00",
                      f"DTEND;TZID=Europe/Copenhagen:{end_d.replace('-', '')}T{stop.replace(':', '')}00"]
            timed = True
        rep = e.get("repeat") if isinstance(e.get("repeat"), dict) else None
        if rep and rep.get("freq") in FREQ:
            until = str(rep.get("until") or "")
            lines.append("RRULE:" + FREQ[rep["freq"]] + (f";UNTIL={until.replace('-', '')}" + ("T235959Z" if timed else "") if DATE.match(until) else ""))
            for x in rep.get("skip") or []:
                if DATE.match(str(x)):
                    lines.append(f"EXDATE;TZID=Europe/Copenhagen:{x.replace('-', '')}T{start.replace(':', '')}00" if timed else f"EXDATE;VALUE=DATE:{x.replace('-', '')}")
        lines.append(f"SUMMARY:{_esc(e.get('title') or 'Aftale')}")
        if e.get("location"):
            lines.append(f"LOCATION:{_esc(e['location'])}")
        if e.get("notes"):
            lines.append(f"DESCRIPTION:{_esc(e['notes'])}")
        if timed and e.get("remind") in ("m15", "h1", "at"):
            lines += ["BEGIN:VALARM", "ACTION:DISPLAY", f"DESCRIPTION:{_esc(e.get('title') or 'Aftale')}",
                      "TRIGGER:" + {"m15": "-PT15M", "h1": "-PT1H", "at": "PT0M"}[e["remind"]], "END:VALARM"]
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(x) for x in lines) + "\r\n"


def _key(uid):
    return f"calfeed_user_{uid}"


def _origin(req):
    host = req.headers.get("Host") or ""
    return ("https" if is_https(req) else "http") + "://" + host


def status(req, _):
    u = require_user(req)
    return 200, {"active": bool(db.get_server_setting(_key(u["id"]), None))}


def make(req, _):
    """Make a new address (an older one stops working)."""
    u = require_user(req)
    old = db.get_server_setting(_key(u["id"]), None)
    if old:
        db.q("DELETE FROM server_settings WHERE key = ?", (f"calfeed:{old}",))
    token = secrets.token_urlsafe(24)
    h = hashlib.sha256(token.encode()).hexdigest()
    db.set_server_setting(f"calfeed:{h}", u["id"])
    db.set_server_setting(_key(u["id"]), h)
    url = f"{_origin(req)}/api/calendar/feed/{token}.ics"
    return 200, {"url": url, "webcal": re.sub(r"^https?://", "webcal://", url)}


def stop(req, _):
    u = require_user(req)
    old = db.get_server_setting(_key(u["id"]), None)
    if old:
        db.q("DELETE FROM server_settings WHERE key IN (?, ?)", (f"calfeed:{old}", _key(u["id"])))
    return 200, {"active": False}


def feed(req, params):
    h = hashlib.sha256(params["token"].encode()).hexdigest()
    uid = db.get_server_setting(f"calfeed:{h}", None)
    if not isinstance(uid, int):
        raise ApiError(404, "Kalenderen findes ikke (adressen er måske skiftet).", "not_found")
    row = db.one("SELECT data FROM app_state WHERE user_id = ? AND app_id = 'calendar'", (uid,))
    user = db.one("SELECT display_name FROM users WHERE id = ?", (uid,))
    try:
        events = (json.loads(row["data"]) or {}).get("events") or [] if row else []
    except (ValueError, TypeError, AttributeError):
        events = []
    name = f"HUBTECH – {user['display_name']}" if user else "HUBTECH"
    return 200, to_ics(events, name).encode("utf-8"), {"Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="hubtech.ics"'}


ROUTES = [
    ("GET", r"/api/calendar/feed", status),
    ("POST", r"/api/calendar/feed", make),
    ("DELETE", r"/api/calendar/feed", stop),
    ("GET", r"/api/calendar/feed/(?P<token>[A-Za-z0-9_-]{20,64})\.ics", feed),
]


def install(api_module):
    api_module.COMPILED.extend((m, re.compile("^" + p + "$"), h) for m, p, h in ROUTES)
