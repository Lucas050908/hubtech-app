"""App-værkstedet: users build small web apps (HTML/CSS/JS) and run them inside HUBTECH.

Safety: an app is served from /api/studio/run/<id> with a CSP that includes `sandbox allow-scripts …` (no
allow-same-origin), so the app runs in an opaque origin – it can't read HUBTECH cookies, call the API as the user or
touch the parent page. Its localStorage is emulated: the server embeds the viewer's saved data for that app, and
changes are posted to the parent page, which stores them with PUT /api/studio/data/<id>.
"""
import html
import json
import re
import secrets

from . import db
from .api import ApiError, body_str, require_user

FILE_RE = re.compile(r"^[A-Za-z0-9_-]{1,40}\.(html|css|js|json|md|txt|svg)$")
ID_RE = re.compile(r"^a[0-9a-f]{16}$")
MAX_FILES = 20
MAX_TOTAL = 400 * 1024
MAX_DATA = 256 * 1024
MAX_APPS = 100

RUN_CSP = ("default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob: https:; "
           "media-src data: blob: https:; font-src data:; connect-src https:; form-action 'none'; base-uri 'none'; "
           "frame-ancestors 'self'; sandbox allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock")

# console + error bridge and localStorage emulation, injected first into every app
BRIDGE = r"""<script>(function(){
var P=function(m){try{parent.postMessage(Object.assign({__studio:1},m),'*')}catch(e){}};
var fmt=function(a){return [].map.call(a,function(x){if(x instanceof Error)return x.message;if(typeof x==='object'){try{return JSON.stringify(x)}catch(e){}}return String(x)}).join(' ')};
['log','info','warn','error'].forEach(function(k){var o=console[k];console[k]=function(){P({type:'console',level:k,text:fmt(arguments).slice(0,2000)});try{o.apply(console,arguments)}catch(e){}}});
var M=__MAP__,where=function(n){var f=null;for(var i=0;i<M.length;i++){if(M[i][1]<n)f=M[i]}return f?f[0]+' linje '+(n-f[1]):'linje '+n};
addEventListener('error',function(e){P({type:'console',level:'error',text:(e.message||'Fejl')+(e.lineno?' ('+where(e.lineno)+')':'')})});
addEventListener('unhandledrejection',function(e){P({type:'console',level:'error',text:'Promise: '+String(e.reason&&e.reason.message||e.reason)})});
var D=__DATA__,t=0,save=function(){clearTimeout(t);t=setTimeout(function(){P({type:'store',data:D})},250)};
var S={getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(D,k)?D[k]:null},setItem:function(k,v){D[String(k)]=String(v);save()},
removeItem:function(k){delete D[String(k)];save()},clear:function(){D={};save()},key:function(i){return Object.keys(D)[i]||null}};
Object.defineProperty(S,'length',{get:function(){return Object.keys(D).length}});
try{Object.defineProperty(window,'localStorage',{value:S,configurable:true})}catch(e){}
window.hubtech={version:1,toast:function(text){P({type:'toast',text:String(text).slice(0,200)})}};
P({type:'ready'});
})();</script>"""


def _clean_files(files):
    if not isinstance(files, dict) or not files:
        raise ApiError(400, "Appen skal have mindst én fil.", "invalid")
    if len(files) > MAX_FILES:
        raise ApiError(400, f"Højst {MAX_FILES} filer pr. app.", "limit")
    out, total = {}, 0
    for name, text in files.items():
        if not isinstance(name, str) or not FILE_RE.match(name):
            raise ApiError(400, f"Ugyldigt filnavn: {str(name)[:40]}. Brug fx app.js, style.css eller data.json.", "invalid_name")
        if not isinstance(text, str):
            raise ApiError(400, f"Filen {name} har et ugyldigt indhold.", "invalid")
        total += len(text.encode("utf-8"))
        out[name] = text
    if total > MAX_TOTAL:
        raise ApiError(413, "Appen er for stor (højst 400 KB kode).", "too_large")
    if "index.html" not in out:
        raise ApiError(400, "Appen skal have en index.html.", "no_index")
    return out


def _row(r, uid, files=False):
    owner = db.one("SELECT username, display_name, avatar FROM users WHERE id = ?", (r["owner_id"],))
    d = {"id": r["id"], "name": r["name"], "icon": r["icon"], "description": r["description"], "published": bool(r["published"]),
         "mine": r["owner_id"] == uid, "owner": {"name": owner["display_name"], "username": owner["username"], "avatar": owner["avatar"]} if owner else None,
         "remixOf": r["remix_of"], "runs": r["runs"], "createdAt": r["created_at"], "updatedAt": r["updated_at"]}
    if files:
        d["files"] = json.loads(r["files"])
    else:
        d["size"] = len(r["files"])
    return d


def _get(app_id, uid, write=False):
    if not ID_RE.match(app_id or ""):
        raise ApiError(404, "Appen findes ikke.", "not_found")
    r = db.one("SELECT * FROM studio_apps WHERE id = ?", (app_id,))
    if not r or (r["owner_id"] != uid and (write or not r["published"])):
        raise ApiError(404, "Appen findes ikke.", "not_found")
    return r


def apps_list(req, _):
    u = require_user(req)
    mine = db.all_rows("SELECT * FROM studio_apps WHERE owner_id = ? ORDER BY updated_at DESC", (u["id"],))
    gallery = db.all_rows("SELECT * FROM studio_apps WHERE published = 1 AND owner_id != ? ORDER BY runs DESC, updated_at DESC LIMIT 100", (u["id"],))
    return 200, {"mine": [_row(r, u["id"]) for r in mine], "gallery": [_row(r, u["id"]) for r in gallery]}


def app_create(req, _):
    u = require_user(req)
    b = req.json()
    if db.one("SELECT COUNT(*) AS n FROM studio_apps WHERE owner_id = ?", (u["id"],))["n"] >= MAX_APPS:
        raise ApiError(400, f"Du kan højst have {MAX_APPS} apps.", "limit")
    files = _clean_files(b.get("files"))
    aid, t = "a" + secrets.token_hex(8), db.now()
    db.q("INSERT INTO studio_apps(id, owner_id, name, icon, description, files, published, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
         (aid, u["id"], body_str(b, "name", 60, required=True), body_str(b, "icon", 8) or "🧩", body_str(b, "description", 300), json.dumps(files), 0, t, t))
    return 201, {"app": _row(_get(aid, u["id"]), u["id"], files=True)}


def app_get(req, params):
    u = require_user(req)
    return 200, {"app": _row(_get(params["id"], u["id"]), u["id"], files=True)}


def app_update(req, params):
    u = require_user(req)
    r = _get(params["id"], u["id"], write=True)
    b = req.json()
    fields = {}
    if "files" in b:
        fields["files"] = json.dumps(_clean_files(b.get("files")))
    if "name" in b:
        fields["name"] = body_str(b, "name", 60, required=True)
    if "icon" in b:
        fields["icon"] = body_str(b, "icon", 8) or "🧩"
    if "description" in b:
        fields["description"] = body_str(b, "description", 300)
    if "published" in b:
        fields["published"] = 1 if b.get("published") else 0
    fields["updated_at"] = db.now()
    for k, v in fields.items():
        db.q(f"UPDATE studio_apps SET {k} = ? WHERE id = ?", (v, r["id"]))
    return 200, {"app": _row(_get(r["id"], u["id"]), u["id"], files=True)}


def app_delete(req, params):
    u = require_user(req)
    r = _get(params["id"], u["id"], write=True)
    db.q("DELETE FROM studio_apps WHERE id = ?", (r["id"],))
    return 200, {"ok": True}


def app_remix(req, params):
    """Copy a published app (or your own) into your apps."""
    u = require_user(req)
    r = _get(params["id"], u["id"])
    if db.one("SELECT COUNT(*) AS n FROM studio_apps WHERE owner_id = ?", (u["id"],))["n"] >= MAX_APPS:
        raise ApiError(400, f"Du kan højst have {MAX_APPS} apps.", "limit")
    aid, t = "a" + secrets.token_hex(8), db.now()
    db.q("INSERT INTO studio_apps(id, owner_id, name, icon, description, files, published, remix_of, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
         (aid, u["id"], (r["name"] + " (kopi)")[:60], r["icon"], r["description"], r["files"], 0, r["id"], t, t))
    return 201, {"app": _row(_get(aid, u["id"]), u["id"], files=True)}


def _load_data(uid, app_id):
    row = db.one("SELECT data FROM app_state WHERE user_id = ? AND app_id = 'studio-data'", (uid,))
    allv = json.loads(row["data"]) if row else {}
    d = allv.get(app_id) if isinstance(allv, dict) else None
    return d if isinstance(d, dict) else {}


def data_put(req, params):
    """An app's saved localStorage for this user."""
    u = require_user(req)
    r = _get(params["id"], u["id"])
    data = req.json().get("data")
    if not isinstance(data, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in data.items()):
        raise ApiError(400, "Ugyldige data.", "invalid")
    if len(json.dumps(data)) > MAX_DATA:
        raise ApiError(413, "Appen gemmer for meget (højst 256 KB).", "too_large")
    row = db.one("SELECT data FROM app_state WHERE user_id = ? AND app_id = 'studio-data'", (u["id"],))
    allv = json.loads(row["data"]) if row else {}
    if not isinstance(allv, dict):
        allv = {}
    allv[r["id"]] = data
    db.q("INSERT INTO app_state(user_id, app_id, data, updated_at) VALUES(?, 'studio-data', ?, ?) "
         "ON CONFLICT(user_id, app_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at", (u["id"], json.dumps(allv), db.now()))
    return 200, {"ok": True}


def _inline(files):
    """index.html with style.css / app.js references replaced by the files themselves."""
    doc = files.get("index.html", "")

    def css(m):
        name = m.group(1)
        return f"<style>/* {name} */\n{files[name]}\n</style>" if name in files else m.group(0)

    def js(m):
        attrs, name = m.group(1), m.group(2)
        if name not in files:
            return m.group(0)
        mod = ' type="module"' if re.search(r"""type=["']module""", attrs, re.I) else ""
        code = files[name].replace("</script", "<\\/script")
        return f"<script{mod}>/* {name} */\n{code}\n</script>"
    doc = re.sub(r"""<link\b[^>]*?href=["']\.?/?([A-Za-z0-9_-]+\.css)["'][^>]*>""", css, doc, flags=re.I)
    doc = re.sub(r"""<script\b([^>]*?)\bsrc=["']\.?/?([A-Za-z0-9_-]+\.js)["'][^>]*>\s*</script>""", js, doc, flags=re.I)
    return doc


def app_run(req, params):
    """The app as a sandboxed HTML document (for the iframe)."""
    u = require_user(req)
    draft = req.query.get("draft", [""])[0] == "1"
    r = _get(params["id"], u["id"])
    files = json.loads(r["files"])
    if r["owner_id"] != u["id"] and not draft:
        db.q("UPDATE studio_apps SET runs = runs + 1 WHERE id = ?", (r["id"],))
    data = json.dumps(_load_data(u["id"], r["id"]), ensure_ascii=False).replace("<", "\\u003c")
    bridge = BRIDGE.replace("__DATA__", data).replace("\n", " ")   # one line, so line numbers below stay easy to map
    doc = _inline(files)
    if re.search(r"<head[^>]*>", doc, re.I):
        doc = re.sub(r"(<head[^>]*>)", lambda m: m.group(1) + bridge, doc, count=1, flags=re.I)
    else:
        doc = f"<!doctype html><html lang=\"da\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">{bridge}<title>{html.escape(r['name'])}</title></head><body>{doc}</body></html>"
    # where each inlined file starts (the line with its /* name */ marker), so errors can say "app.js linje 12"
    marks, line = [], 1
    for ln in doc.split("\n"):
        m = re.match(r"^<(?:script|style)[^>]*>/\* ([A-Za-z0-9_-]+\.(?:js|css)) \*/$", ln.strip())
        if m:
            marks.append([m.group(1), line])
        line += 1
    if "index.html" in files:
        marks.insert(0, ["index.html", 0])
    doc = doc.replace("__MAP__", json.dumps(marks), 1)
    return 200, doc.encode("utf-8"), {"Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": RUN_CSP, "Cache-Control": "no-store"}


ROUTES = [
    ("GET", r"/api/studio/apps", apps_list),
    ("POST", r"/api/studio/apps", app_create),
    ("GET", r"/api/studio/apps/(?P<id>a[0-9a-f]+)", app_get),
    ("PUT", r"/api/studio/apps/(?P<id>a[0-9a-f]+)", app_update),
    ("DELETE", r"/api/studio/apps/(?P<id>a[0-9a-f]+)", app_delete),
    ("POST", r"/api/studio/apps/(?P<id>a[0-9a-f]+)/remix", app_remix),
    ("PUT", r"/api/studio/data/(?P<id>a[0-9a-f]+)", data_put),
    ("GET", r"/api/studio/run/(?P<id>a[0-9a-f]+)", app_run),
]


def install(api_module):
    if not getattr(api_module, "_studio_installed", False):
        api_module.COMPILED.extend((m, re.compile("^" + p + "$"), h) for m, p, h in ROUTES)
        api_module._studio_installed = True
