/*
 * Servicehjælp inside HUBTECH.
 * The original app stores everything with localStorage (+ an optional Claude cloud sync).
 * This bridge keeps the app's code unchanged and routes its localStorage keys to the
 * user's HUBTECH account instead:  key "log"  ⇄  /api/state/svc-log  ({ v: "<string>" }).
 *
 *  - The app's script is parked by the build (type="text/x-hubtech-app") and started only after
 *    the user's data has been fetched asynchronously – a small loading screen shows meanwhile.
 *  - Photos (data URLs) are uploaded once as image files (/api/office/files/…) and only their
 *    address is stored in the account; on start they are fetched back, so the app still sees
 *    ordinary data URLs (its PDF export needs them). This keeps reports with many photos far
 *    below the size limit for app data.
 *  - Writes are debounced per key and flushed when the page is left.
 *  - Theme follows HUBTECH; the cloud banner is replaced by "gemt på din HUBTECH-konto".
 */
(function () {
  'use strict';
  var KEY_RE = /^[a-z0-9]{1,30}$/;            // the app's own keys (log, cal, cust, draft, …)
  var NO_SYNC = { theme: 1 };                    // follows HUBTECH, never stored
  var DATA_URL_RE = /data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]{2000,}/g;
  var FILE_URL_RE = /\/api\/office\/files\/[A-Za-z0-9_-]{16,40}/g;
  var LS = window.localStorage;
  var M = Object.create(null);
  var user = null, ready = false;
  var host = window.parent !== window ? window.parent : null;
  var post = function (msg) { try { host && host.postMessage(msg, location.origin); } catch (e) { /* */ } };
  var H = { 'X-Requested-With': 'hubtech' };

  var theme = 'dark';
  try { theme = (host || window).document.documentElement.dataset.theme || 'dark'; } catch (e) { /* */ }
  M.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.classList.add('in-hubtech');

  // ── photos: data URL ⇄ uploaded file ──
  var toUrl = new Map();     // data URL → /api/office/files/…
  var toData = new Map();    // /api/office/files/… → data URL
  function b64ToBlob(dataUrl) {
    var i = dataUrl.indexOf(','), mime = dataUrl.slice(5, dataUrl.indexOf(';')), bin = atob(dataUrl.slice(i + 1));
    var a = new Uint8Array(bin.length);
    for (var j = 0; j < bin.length; j++) a[j] = bin.charCodeAt(j);
    return new Blob([a], { type: mime });
  }
  function upload(dataUrl) {
    return fetch('/api/office/files', { method: 'POST', credentials: 'same-origin', body: b64ToBlob(dataUrl),
      headers: { 'X-Requested-With': 'hubtech', 'Content-Type': 'application/octet-stream', 'X-File-Name': 'servicehjaelp.jpg' } })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (j) { toUrl.set(dataUrl, j.file.url); toData.set(j.file.url, dataUrl); return j.file.url; });
  }
  /** value for the server: photos replaced by their file address (uploading new ones first) */
  function dehydrate(v, offline) {
    if (typeof v !== 'string' || v.indexOf('data:image/') < 0) return Promise.resolve(v);
    var found = v.match(DATA_URL_RE) || [], todo = [];
    found.forEach(function (d) { if (!toUrl.has(d) && todo.indexOf(d) < 0) todo.push(d); });
    var up = offline ? Promise.resolve() : Promise.all(todo.map(function (d) { return upload(d).catch(function () { /* keep inline */ }); }));
    return up.then(function () { return v.replace(DATA_URL_RE, function (d) { return toUrl.get(d) || d; }); });
  }
  function fetchData(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
      .then(function (b) { return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsDataURL(b); }); })
      .then(function (d) { toData.set(url, d); toUrl.set(d, url); return d; });
  }
  /** value for the app: file addresses replaced by the photos themselves */
  function hydrateAll() {
    var urls = [];
    Object.keys(M).forEach(function (k) { var m = typeof M[k] === 'string' ? M[k].match(FILE_URL_RE) : null; (m || []).forEach(function (u) { if (urls.indexOf(u) < 0) urls.push(u); }); });
    var i = 0, failed = 0;
    function worker() {
      if (i >= urls.length) return Promise.resolve();
      var u = urls[i++];
      progress('Henter fotos ' + Math.min(i, urls.length) + ' af ' + urls.length + ' …');
      return fetchData(u).catch(function () { failed++; }).then(worker);
    }
    return Promise.all([worker(), worker(), worker(), worker()]).then(function () {
      Object.keys(M).forEach(function (k) { if (typeof M[k] === 'string' && M[k].indexOf('/api/office/files/') >= 0) M[k] = M[k].replace(FILE_URL_RE, function (u) { return toData.get(u) || u; }); });
      if (failed) console.warn('Servicehjælp: ' + failed + ' fotos kunne ikke hentes');
    });
  }

  // ── loading screen while the account data arrives ──
  var veil = null;
  function showVeil() {
    if (veil || ready) return;
    veil = document.createElement('div');
    veil.id = 'htb-loading';
    veil.setAttribute('role', 'status');
    veil.innerHTML = '<div class="htb-spin"></div><b>Henter dine data …</b><span id="htb-progress"></span>';
    (document.body || document.documentElement).appendChild(veil);
  }
  function progress(t) { var p = document.getElementById('htb-progress'); if (p) p.textContent = t; }
  if (document.body) showVeil(); else document.addEventListener('DOMContentLoaded', showVeil);

  // ── saving ──
  var pending = Object.create(null), timer = null, failing = false;
  function cloud(t) { try { var c = document.getElementById('cloud'); if (c) c.textContent = t; } catch (e) { /* */ } }
  function send(k, keepalive) {
    return dehydrate(k in M ? M[k] : null, keepalive).then(function (v) {
      var b = JSON.stringify({ state: { v: v } });
      return fetch('/api/state/svc-' + k, {
        method: 'PUT', headers: { 'X-Requested-With': 'hubtech', 'Content-Type': 'application/json' }, body: b,
        credentials: 'same-origin', keepalive: !!keepalive && b.length < 60000,
      });
    }).then(function (res) {
      if (res.status === 401) { post({ type: 'svc:unauthorized' }); throw new Error('401'); }
      if (res.status === 413) { post({ type: 'svc:too-large', key: k }); throw new Error('413'); }
      if (!res.ok) throw new Error(String(res.status));
    });
  }
  function flush(keepalive) {
    clearTimeout(timer);
    var ks = Object.keys(pending);
    if (!ks.length) return Promise.resolve();
    pending = Object.create(null);
    cloud('☁️ Gemmer…');
    return Promise.all(ks.map(function (k) { return send(k, keepalive).catch(function (e) { pending[k] = 1; throw e; }); }))
      .then(function () { failing = false; cloud('☁️ Gemt på din konto ✓'); post({ type: 'svc:saved' }); })
      .catch(function () {
        cloud('⚠️ Ikke gemt – prøver igen');
        if (!failing) post({ type: 'svc:save-error' });
        failing = true;
        timer = setTimeout(flush, 8000);
      });
  }
  function queue(k) {
    if (NO_SYNC[k] || !ready) return;
    pending[k] = 1;
    clearTimeout(timer);
    timer = setTimeout(flush, 700);
  }

  // ── one calendar: the app's "cal" key is the HUBTECH calendar (/api/state/calendar) ──
  // svc entry {id, d: date, t: time, x: "title\nlocation/notes", c: category, s: done}  ⇄  HUBTECH event
  var CAL_COLORS = ['#f07a1b', '#e03131', '#2f9e44', '#1c7ed6', '#7048e8', '#f5b301', '#0ca678', '#868e96'];
  var HUB_TO_CAT = { '#38bdf8': 3, '#34d399': 6, '#f59e0b': 5, '#ff4f8b': 1, '#a78bfa': 4, '#94a3b8': 7 };
  var hub = { events: [] }, hubTimer = null, hubDirty = false;
  function catOf(e) { if (typeof e.svcCat === 'number') return e.svcCat; var i = CAL_COLORS.indexOf(e.color); return i >= 0 ? i : (HUB_TO_CAT[e.color] != null ? HUB_TO_CAT[e.color] : 3); }
  function textOf(e) { return [e.title || '', e.location || '', e.notes || ''].filter(function (x, i) { return i === 0 || x; }).join('\n'); }
  function toSvc(events) {
    return events.map(function (e) { return { id: e.id, d: e.date, t: e.allDay ? '' : (e.start || ''), x: textOf(e), c: catOf(e), s: e.done ? 1 : 0 }; });
  }
  function fromSvc(list) {
    var byId = Object.create(null), out = [];
    hub.events.forEach(function (e) { byId[String(e.id)] = e; });
    list.forEach(function (it) {
      if (!it || !it.d) return;
      var id = String(it.id), e = byId[id], lines = String(it.x || '').split('\n');
      var c = typeof it.c === 'number' ? it.c : 0;
      if (!e) {
        e = { id: id, title: lines[0] || 'Aftale', date: it.d, allDay: !it.t, start: it.t || null, end: null, location: '', notes: lines.slice(1).join('\n').trim(),
              color: CAL_COLORS[c] || CAL_COLORS[0], svcCat: c, remind: 'none', done: !!it.s, from: 'servicehjaelp' };
      } else {
        e = Object.assign({}, e);
        if (String(it.x || '') !== textOf(e)) {
          var rest = lines.slice(1);
          if (e.location && rest[0] === e.location) rest.shift(); else e.location = '';
          e.title = lines[0] || 'Aftale'; e.notes = rest.join('\n').trim();
        }
        if (it.d !== e.date) {
          if (e.endDate) {   // keep the length of multi-day events
            var len = (Date.parse(e.endDate) - Date.parse(e.date)) / 864e5;
            e.endDate = new Date(Date.parse(it.d) + len * 864e5).toISOString().slice(0, 10);
          }
          e.date = it.d;
        }
        var t = it.t || '';
        if (t !== (e.allDay ? '' : (e.start || ''))) { e.allDay = !t; e.start = t || null; if (!t) e.end = null; }
        if (c !== catOf(e)) { e.svcCat = c; e.color = CAL_COLORS[c] || e.color; }
        e.done = !!it.s;
      }
      out.push(e);
    });
    hub.events = out;
  }
  function saveHub(keepalive) {
    clearTimeout(hubTimer);
    if (!hubDirty) return Promise.resolve();
    hubDirty = false;
    var b = JSON.stringify({ state: hub });
    cloud('☁️ Gemmer…');
    return fetch('/api/state/calendar', { method: 'PUT', credentials: 'same-origin', keepalive: !!keepalive && b.length < 60000,
      headers: { 'X-Requested-With': 'hubtech', 'Content-Type': 'application/json' }, body: b })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); cloud('☁️ Gemt på din konto ✓'); post({ type: 'svc:saved' }); post({ type: 'svc:calendar' }); })
      .catch(function () { hubDirty = true; cloud('⚠️ Ikke gemt – prøver igen'); hubTimer = setTimeout(saveHub, 8000); });
  }
  function setCal(v) {
    var list;
    try { list = JSON.parse(v); } catch (e) { return; }
    if (!Array.isArray(list)) return;
    fromSvc(list);
    M.cal = JSON.stringify(toSvc(hub.events));
    if (!ready) return;
    hubDirty = true;
    clearTimeout(hubTimer);
    hubTimer = setTimeout(saveHub, 700);
  }

  // ── route the app's localStorage keys to the account ──
  var P = Storage.prototype, oGet = P.getItem, oSet = P.setItem, oRem = P.removeItem;
  P.getItem = function (k) { if (this === LS && KEY_RE.test(k)) return k in M ? M[k] : null; return oGet.call(this, k); };
  P.setItem = function (k, v) {
    if (this === LS && k === 'cal') { v = String(v); if (M.cal !== v) setCal(v); return; }
    if (this === LS && KEY_RE.test(k)) { v = String(v); if (M[k] === v) return; M[k] = v; queue(k); return; }
    return oSet.call(this, k, v);
  };
  P.removeItem = function (k) {
    if (this === LS && k === 'cal') { setCal('[]'); return; }
    if (this === LS && KEY_RE.test(k)) { if (!(k in M)) return; delete M[k]; queue(k); return; }
    return oRem.call(this, k);
  };

  addEventListener('pagehide', function () { flush(true); saveHub(true); });
  addEventListener('message', function (e) {
    if (e.origin !== location.origin) return;
    var d = e.data || {};
    if (d.type === 'flush') { flush(true); saveHub(true); }
    if (d.type === 'svc:scan-result' && d.field && d.value) {
      var inp = document.getElementById(d.field);
      if (inp) { inp.value = d.value; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); inp.focus(); }
    }
    if (d.type === 'theme' && d.theme) {
      M.theme = d.theme;
      document.documentElement.setAttribute('data-theme', d.theme);
      try { if (typeof window.thm === 'function') window.thm(d.theme); } catch (err) { /* */ }
    }
  });

  // replaces the app's Claude-cloud login (called from the patched cinit)
  window.HTB = {
    get user() { return user; },
    cinit: function () {
      try {
        /* global CLD, $, esc, ini */
        CLD.on = false;
        CLD.name = (user && user.displayName) || '';
        $('cb').classList.add('hide');
        cloud(failing ? '⚠️ Ikke gemt – prøver igen' : '☁️ Gemt på din konto ✓');
        $('acct').innerHTML = user
          ? '<div class="hint" style="margin:0">Logget ind som</div><b>' + esc(CLD.name) + '</b><div class="hint" style="margin:2px 0 0">Dine data gemmes på din HUBTECH-konto</div>'
          : '<div class="hint" style="margin:0">Ikke logget ind i HUBTECH.</div>';
        $('av').textContent = ini();
      } catch (e) { console.warn('Servicehjælp-bro:', e); }
    },
  };

  // ── boot: fetch the account data, then start the app ──
  function getJson(url) {
    return fetch(url, { headers: H, credentials: 'same-origin' }).then(function (r) {
      if (r.status === 401) { post({ type: 'svc:unauthorized' }); return null; }
      return r.ok ? r.json() : null;
    });
  }
  // Android app: WebView can't download blobs – hand PDFs to the app, which saves them in Downloads/HUBTECH
  function androidPdf() {
    var A = window.HubtechAndroid;
    if (!A || !A.saveFile || !window.jspdf || !window.jspdf.jsPDF) return;
    window.jspdf.jsPDF.API.save = function (name) {
      var blob = this.output('blob'), fr = new FileReader();
      fr.onload = function () { A.saveFile(name || 'servicehjaelp.pdf', 'application/pdf', String(fr.result).split(',')[1] || ''); };
      fr.readAsDataURL(blob);
      return this;
    };
  }
  function startApp() {
    ready = true;
    if (hubDirty) saveHub();
    try { androidPdf(); } catch (e) { /* */ }
    var parked = document.getElementById('sh-app');
    if (parked && !parked.dataset.started) {
      parked.dataset.started = '1';
      var s = document.createElement('script');
      s.textContent = parked.textContent;
      document.body.appendChild(s);
    }
    if (veil) { veil.classList.add('is-done'); setTimeout(function () { veil && veil.remove(); }, 260); }
  }
  var dom = new Promise(function (r) { if (document.readyState !== 'loading') r(); else document.addEventListener('DOMContentLoaded', r); });
  Promise.all([getJson('/api/states/svc-'), getJson('/api/me'), getJson('/api/state/calendar')]).then(function (res) {
    var st = (res[0] && res[0].states) || {};
    Object.keys(st).forEach(function (id) { var v = st[id] && st[id].v; if (typeof v === 'string') M[id.slice(4)] = v; });
    user = res[1] && res[1].user || null;
    // the calendar: HUBTECH's own, plus a one-time move of Servicehjælp's old separate calendar into it
    var cs = res[2] && res[2].state;
    if (cs && typeof cs === 'object' && !Array.isArray(cs)) hub = cs;
    if (!Array.isArray(hub.events)) hub.events = [];
    if (!hub.svcMigrated && res[2]) {
      var old = [];
      try { old = JSON.parse(M.cal || '[]') || []; } catch (e) { old = []; }
      if (Array.isArray(old) && old.length) {
        var have = Object.create(null);
        hub.events.forEach(function (e) { have[String(e.id)] = 1; });
        var keep = hub.events.slice();
        fromSvc(toSvc(keep).concat(old.filter(function (it) { return it && !have[String(it.id)]; })));
      }
      hub.svcMigrated = true;
      hubDirty = true;
    }
    M.cal = JSON.stringify(toSvc(hub.events));
    if (user && !M.tek) M.tek = user.displayName || '';
    M.theme = theme;
    return hydrateAll();
  }).catch(function (e) {
    console.warn('Servicehjælp: kunne ikke hente data', e);
    cloud('⚠️ Ikke forbundet til HUBTECH');
  }).then(function () { return dom; }).then(startApp).then(addScanButtons);

  // 📷 next to the serial-number fields: HUBTECH opens the camera scanner and sends the code back
  function addScanButtons() {
    if (!host) return;
    ['gs', 'r12'].forEach(function (id) {
      var inp = document.getElementById(id);
      if (!inp || inp.dataset.scan) return;
      inp.dataset.scan = '1';
      var wrap = document.createElement('div');
      wrap.className = 'htb-scanwrap';
      inp.parentNode.insertBefore(wrap, inp);
      wrap.appendChild(inp);
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'htb-scan'; b.title = 'Scan serienummeret'; b.setAttribute('aria-label', 'Scan serienummeret med kameraet');
      b.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/></svg>';
      b.addEventListener('click', function () { post({ type: 'svc:scan', field: id }); });
      wrap.appendChild(b);
    });
  }
})();
