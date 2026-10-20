/**
 * CircuitPilot ↔ HUBTECH bridge.
 * Replaces CircuitPilot's original browser-only account system with the platform account:
 *  - the logged-in HUBTECH user is the CircuitPilot user (name + avatar)
 *  - progress is loaded from / saved to /api/state/circuitpilot (debounced, flushed on exit)
 *  - leaderboards come from the server (all users of this HUBTECH installation)
 *  - one-time import of old browser-only progress (cp_u_* keys) if found on this origin
 */
(function () {
  const H = { 'Accept': 'application/json', 'X-Requested-With': 'hubtech' };
  let timer = null, pending = null, lastSaved = null;

  async function req(method, url, body) {
    const r = await fetch(url, { method, credentials: 'same-origin', headers: body ? { ...H, 'Content-Type': 'application/json' } : H, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401) { parent.postMessage({ type: 'cp:unauthorized' }, location.origin); throw new Error('unauthorized'); }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  function legacyAccount() {
    try {
      const cur = localStorage.getItem('cp_cur');
      if (!cur) return null;
      const a = JSON.parse(localStorage.getItem('cp_u_' + cur) || 'null');
      return a && typeof a.xp === 'number' ? a : null;
    } catch { return null; }
  }

  function flush() {
    if (!pending) return;
    const a = pending; pending = null;
    clearTimeout(timer);
    const body = JSON.stringify({ state: a });
    if (body === lastSaved) return;
    lastSaved = body;
    // keepalive lets the save complete even if the page is being closed
    fetch('/api/state/circuitpilot', { method: 'PUT', credentials: 'same-origin', keepalive: true, headers: { ...H, 'Content-Type': 'application/json' }, body })
      .then(r => { if (r.ok) parent.postMessage({ type: 'cp:saved', xp: a.xp, level: a.level, achievements: (a.achievements || []).length }, location.origin); else parent.postMessage({ type: 'cp:save-error' }, location.origin); })
      .catch(() => parent.postMessage({ type: 'cp:save-error' }, location.origin));
  }

  const ready = (async () => {
    const [me, st] = await Promise.all([req('GET', '/api/me'), req('GET', '/api/state/circuitpilot')]);
    const user = me.user;
    let acc = st.state;
    let imported = false;
    if (!acc) {
      const legacy = legacyAccount();
      if (legacy && confirm('Der blev fundet CircuitPilot-fremskridt i denne browser (' + legacy.xp + ' XP, bruger “' + legacy.username + '”).\n\nVil du flytte det over på din HUBTECH-konto?')) {
        acc = legacy; imported = true;
      }
    }
    return { user, acc, imported };
  })();

  window.CPBridge = {
    ready,
    user: null,
    save(a) {
      pending = JSON.parse(JSON.stringify(a));
      clearTimeout(timer);
      timer = setTimeout(flush, 700);
    },
    flush,
    async leaderboard() {
      try { return (await req('GET', '/api/circuitpilot/leaderboard')).entries; } catch { return []; }
    },
    activity(title, detail) {
      req('POST', '/api/activity', { app: 'circuitpilot', kind: 'learn', title, detail }).catch(() => {});
    },
  };
  ready.then(r => { window.CPBridge.user = r.user; }).catch(() => {});
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

  // theme sync with the platform
  function applyTheme(t) { document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark'; }
  try { applyTheme(parent.document.documentElement.dataset.theme); } catch { applyTheme('dark'); }
  addEventListener('message', (e) => {
    if (e.origin !== location.origin) return;
    if (e.data?.type === 'theme') applyTheme(e.data.theme);
    if (e.data?.type === 'flush') flush();
  });
})();
