/*
 * Reads Excel/OpenDocument files in a worker of its own. SheetJS 0.18.5 (the last version on npm) has two known
 * problems with crafted files – prototype pollution (CVE-2023-30533) and a slow regular expression (CVE-2024-22363).
 * Here they can't reach HUBTECH: the worker has its own objects, only plain data is sent back, and the page stops
 * the worker if it takes too long.
 */
importScripts('/vendor/xlsx.full.min.js');
onmessage = (e) => {
  try {
    const wb = XLSX.read(e.data, { type: 'array', cellFormula: true, sheetStubs: true });
    const out = { SheetNames: wb.SheetNames.slice(0, 20).map(String), Sheets: {} };
    for (const name of out.SheetNames) {
      const ws = wb.Sheets[name] || {}, o = {};
      for (const k of Object.keys(ws)) {
        const c = ws[k];
        if (k === '!ref') o[k] = String(c);
        else if (k === '!cols') o[k] = (c || []).map(col => (col && col.wpx ? { wpx: Number(col.wpx) } : null));
        else if (k[0] !== '!' && /^[A-Z]{1,3}[0-9]{1,7}$/.test(k)) o[k] = { v: c.v instanceof Date ? c.v.toISOString() : c.v, f: c.f ? String(c.f) : undefined };
      }
      const r = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { e: { r: 0, c: 0 } };
      o['!range'] = { r: r.e.r, c: r.e.c };
      out.Sheets[name] = o;
    }
    postMessage({ ok: true, wb: out });
  } catch (err) {
    postMessage({ ok: false, error: String((err && err.message) || err) });
  }
};
