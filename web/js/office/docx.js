/**
 * HTML → real Word document (.docx, Office Open XML) for HUBTECH Office.
 * Handles what the editor produces: headings, paragraphs, bold/italic/underline/strike,
 * sub/superscript, colours, highlight, font sizes, alignment, links, bullet/numbered/check lists
 * (nested), tables, images, quotes, code and horizontal rules.
 */
import { sanitizeHtml } from './sanitize.js';
import { loadJsZip, inlineImages } from './store.js';

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FONT_SIZES = { 1: 8, 2: 10, 3: 12, 4: 14, 5: 18, 6: 24, 7: 36 };
const PAGE_W_EMU = 6120000;  // ~17 cm text width (A4 with 2 cm margins)

function cssColor(v) {
  if (!v) return null;
  v = v.trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3})$/);
  if (m) return m[1].split('').map(c => c + c).join('').toUpperCase();
  m = v.match(/^#([0-9a-f]{6})$/);
  if (m) return m[1].toUpperCase();
  m = v.match(/^rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?\)$/);
  if (m) {
    if (m[4] !== undefined && Number(m[4]) === 0) return null;
    return [m[1], m[2], m[3]].map(n => Math.max(0, Math.min(255, +n)).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  const named = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', orange: 'FFA500', gray: '808080', grey: '808080', purple: '800080' };
  return named[v] || null;
}
function sizePt(v) {
  if (!v) return null;
  const m = String(v).match(/^([\d.]+)(px|pt|em|rem)?$/);
  if (!m) return { 'x-small': 8, small: 10, medium: 12, large: 14, 'x-large': 18, 'xx-large': 24 }[v] || null;
  const n = +m[1];
  return m[2] === 'pt' ? n : m[2] === 'em' || m[2] === 'rem' ? n * 12 : n * 0.75;
}
const highlight = (hex) => {   // Word highlight only knows a few names – pick the nearest
  if (!hex) return null;
  const opts = { yellow: 'FFFF00', green: '00FF00', cyan: '00FFFF', magenta: 'FF00FF', blue: '0000FF', red: 'FF0000', lightGray: 'D3D3D3', darkGray: 'A9A9A9' };
  const rgb = (h) => [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  const [r, g, b] = rgb(hex);
  let best = 'yellow', d = Infinity;
  for (const [n, h] of Object.entries(opts)) { const [R, G, B] = rgb(h); const dd = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2; if (dd < d) { d = dd; best = n; } }
  return best;
};

function imageSize(src) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res({ w: im.naturalWidth || 400, h: im.naturalHeight || 300 });
    im.onerror = () => res({ w: 400, h: 300 });
    im.src = src;
  });
}

/** Build a .docx Blob from editor HTML. */
export async function htmlToDocx(html, title = 'Dokument') {
  const JSZip = await loadJsZip();
  const body = new DOMParser().parseFromString(`<body>${sanitizeHtml(await inlineImages(html))}</body>`, 'text/html').body;
  const rels = [];            // [id, type, target, external]
  const media = [];           // [name, base64, ext]
  const numbering = [];       // list instances: {abs: 'bullet'|'decimal'}
  let relN = 10, imgN = 0, docPrId = 1;

  // ── preload image sizes (async), then render synchronously ──
  const sizes = new Map();
  await Promise.all([...body.querySelectorAll('img')].map(async (im) => { sizes.set(im, await imageSize(im.getAttribute('src'))); }));

  const runProps = (st) => {
    let p = '';
    if (st.code) p += '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>';
    if (st.b) p += '<w:b/><w:bCs/>';
    if (st.i) p += '<w:i/><w:iCs/>';
    if (st.s) p += '<w:strike/>';
    if (st.color) p += `<w:color w:val="${st.color}"/>`;
    if (st.size) p += `<w:sz w:val="${Math.round(st.size * 2)}"/><w:szCs w:val="${Math.round(st.size * 2)}"/>`;
    if (st.hl) p += `<w:highlight w:val="${st.hl}"/>`;
    if (st.u) p += '<w:u w:val="single"/>';
    if (st.va) p += `<w:vertAlign w:val="${st.va}"/>`;
    if (st.link) p += '<w:rStyle w:val="Hyperlink"/>';
    return p ? `<w:rPr>${p}</w:rPr>` : '';
  };
  const textRun = (text, st) => {
    const parts = String(text).split('\t');
    return `<w:r>${runProps(st)}${parts.map((t, i) => (i ? '<w:tab/>' : '') + (t ? `<w:t xml:space="preserve">${esc(t)}</w:t>` : '')).join('')}</w:r>`;
  };
  const imageRun = (im) => {
    const src = im.getAttribute('src') || '';
    const m = src.match(/^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/i);
    if (!m) return '';  // remote images are not embedded
    let ext = m[1].toLowerCase().replace('jpeg', 'jpg');
    if (ext === 'webp') return '';  // Word cannot show webp
    imgN++;
    const name = `image${imgN}.${ext}`;
    const rid = `rId${relN++}`;
    media.push([name, m[2]]);
    rels.push([rid, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', `media/${name}`]);
    const { w, h } = sizes.get(im) || { w: 400, h: 300 };
    let cx = Math.round(w * 9525), cy = Math.round(h * 9525);
    const styleW = parseFloat(im.style.width);
    if (styleW && /%$/.test(im.style.width)) { const k = (PAGE_W_EMU * styleW / 100) / cx; cx *= k; cy *= k; }
    if (cx > PAGE_W_EMU) { cy = Math.round(cy * PAGE_W_EMU / cx); cx = PAGE_W_EMU; }
    cx = Math.round(cx); cy = Math.round(cy);
    const id = docPrId++;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Billede ${id}" descr="${esc(im.getAttribute('alt') || '')}"/>`
      + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
      + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>`
      + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>`
      + '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  };

  const styleOf = (el, st) => {
    const n = { ...st };
    const t = el.tagName;
    if (t === 'B' || t === 'STRONG') n.b = true;
    if (t === 'I' || t === 'EM') n.i = true;
    if (t === 'U') n.u = true;
    if (t === 'S' || t === 'STRIKE' || t === 'DEL') n.s = true;
    if (t === 'SUB') n.va = 'subscript';
    if (t === 'SUP') n.va = 'superscript';
    if (t === 'CODE') n.code = true;
    if (t === 'MARK') n.hl = 'yellow';
    if (t === 'FONT') {
      const c = cssColor(el.getAttribute('color')); if (c) n.color = c;
      const sz = FONT_SIZES[el.getAttribute('size')]; if (sz) n.size = sz;
    }
    const s = el.style;
    if (s) {
      if (s.fontWeight === 'bold' || +s.fontWeight >= 600) n.b = true;
      if (s.fontStyle === 'italic') n.i = true;
      if (/underline/.test(s.textDecoration)) n.u = true;
      if (/line-through/.test(s.textDecoration)) n.s = true;
      const c = cssColor(s.color); if (c) n.color = c;
      const bg = cssColor(s.backgroundColor); if (bg) n.hl = highlight(bg);
      const sz = sizePt(s.fontSize); if (sz) n.size = sz;
    }
    return n;
  };

  /** inline content of a block → runs */
  const inline = (node, st) => {
    let out = '';
    for (const c of node.childNodes) {
      if (c.nodeType === 3) {
        const t = c.textContent.replace(/[\r\n]+/g, ' ');
        if (t) out += textRun(st.pre ? c.textContent : t, st);
        continue;
      }
      if (c.nodeType !== 1) continue;
      const t = c.tagName;
      if (t === 'BR') { out += '<w:r><w:br/></w:r>'; continue; }
      if (t === 'IMG') { out += imageRun(c); continue; }
      if (t === 'INPUT') { out += textRun(c.checked || c.hasAttribute('checked') ? '☒ ' : '☐ ', st); continue; }
      if (t === 'A' && /^(https?:|mailto:)/i.test(c.getAttribute('href') || '')) {
        const rid = `rId${relN++}`;
        rels.push([rid, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', c.getAttribute('href'), true]);
        out += `<w:hyperlink r:id="${rid}" w:history="1">${inline(c, { ...styleOf(c, st), link: true })}</w:hyperlink>`;
        continue;
      }
      if (BLOCKS.has(t)) { out += inline(c, st); continue; }  // stray block inside inline context
      out += inline(c, styleOf(c, st));
    }
    return out;
  };

  const alignOf = (el) => {
    const a = (el.style?.textAlign || el.getAttribute?.('align') || '').toLowerCase();
    return { center: 'center', right: 'right', justify: 'both', left: 'left' }[a] || null;
  };
  const para = (runs, { style, align, num, indent, border, keepEmpty = true, spacing } = {}) => {
    let pPr = '';
    if (style) pPr += `<w:pStyle w:val="${style}"/>`;
    if (num) pPr += `<w:numPr><w:ilvl w:val="${num.lvl}"/><w:numId w:val="${num.id}"/></w:numPr>`;
    if (border) pPr += '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="A0AEC0"/></w:pBdr>';
    if (spacing) pPr += spacing;
    if (indent) pPr += `<w:ind w:left="${indent}"/>`;
    if (align) pPr += `<w:jc w:val="${align}"/>`;
    if (!runs && !keepEmpty) return '';
    return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${runs}</w:p>`;
  };

  const BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'TABLE', 'BLOCKQUOTE', 'PRE', 'HR', 'FIGURE', 'FIGCAPTION']);

  const list = (el, lvl, numId) => {
    let out = '';
    for (const li of el.children) {
      if (li.tagName !== 'LI') { out += blocks(li, { lvl }); continue; }
      // the li's own inline content, then nested lists
      const nested = [...li.children].filter(c => c.tagName === 'UL' || c.tagName === 'OL');
      const clone = li.cloneNode(true);
      [...clone.children].filter(c => c.tagName === 'UL' || c.tagName === 'OL').forEach(c => c.remove());
      const hasBlockKids = [...clone.children].some(c => ['P', 'DIV', 'H1', 'H2', 'H3', 'H4'].includes(c.tagName));
      if (hasBlockKids) {
        let first = true;
        for (const c of clone.childNodes) {
          if (c.nodeType === 1 && ['P', 'DIV', 'H1', 'H2', 'H3', 'H4'].includes(c.tagName)) {
            out += para(inline(c, {}), { num: first ? { lvl, id: numId } : null, indent: first ? null : 720 * (lvl + 1), align: alignOf(c) });
            first = false;
          }
        }
      } else {
        out += para(inline(clone, {}), { num: { lvl, id: numId }, align: alignOf(li) });
      }
      for (const n of nested) out += listOf(n, lvl + 1);
    }
    return out;
  };
  const listOf = (el, lvl = 0) => {
    const check = el.hasAttribute('data-check');
    const kind = el.tagName === 'OL' ? 'decimal' : check ? 'none' : 'bullet';
    numbering.push(kind);
    return list(el, Math.min(lvl, 8), numbering.length);
  };

  const table = (el) => {
    const rows = [...el.querySelectorAll(':scope > tr, :scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr')];
    if (!rows.length) return '';
    const cols = Math.max(...rows.map(r => [...r.children].reduce((n, c) => n + (+c.getAttribute('colspan') || 1), 0)));
    const w = Math.floor(9638 / cols);
    let out = '<w:tbl><w:tblPr><w:tblStyle w:val="HubtechTable"/><w:tblW w:w="5000" w:type="pct"/>'
      + '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="B8C2CC"/>`).join('') + '</w:tblBorders>'
      + '<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>'
      + `<w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
    for (const r of rows) {
      out += '<w:tr>';
      for (const c of r.children) {
        const span = +c.getAttribute('colspan') || 1;
        const th = c.tagName === 'TH';
        let inner = '';
        const blockKids = [...c.children].some(k => BLOCKS.has(k.tagName));
        if (blockKids) inner = blocks(c, { th });
        else inner = para(inline(c, th ? { b: true } : {}), { align: alignOf(c), spacing: '<w:spacing w:before="0" w:after="0"/>' });
        if (!inner.includes('<w:p')) inner += '<w:p/>';
        out += `<w:tc><w:tcPr><w:tcW w:w="${w * span}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${th ? '<w:shd w:val="clear" w:color="auto" w:fill="E8EEF5"/>' : ''}</w:tcPr>${inner}</w:tc>`;
      }
      out += '</w:tr>';
    }
    return out + '</w:tbl><w:p/>';
  };

  /** block-level walk */
  function blocks(root, ctx = {}) {
    let out = '';
    let pending = '';   // loose inline content between blocks
    const flush = () => { if (pending.replace(/<[^>]+>/g, '').trim() || pending.includes('<w:drawing') || pending.includes('<w:br')) out += para(pending, { style: ctx.quote ? 'Quote' : null }); pending = ''; };
    for (const c of root.childNodes) {
      if (c.nodeType === 3) { pending += inline({ childNodes: [c] }, ctx.th ? { b: true } : {}); continue; }
      if (c.nodeType !== 1) continue;
      const t = c.tagName;
      if (!BLOCKS.has(t)) {
        if (t === 'BR') { flush(); continue; }
        pending += inline({ childNodes: [c] }, ctx.th ? { b: true } : {});
        continue;
      }
      flush();
      const align = alignOf(c);
      switch (t) {
        case 'H1': case 'H2': case 'H3': case 'H4':
          out += para(inline(c, {}), { style: `Heading${Math.min(+t[1], 3)}`, align }); break;
        case 'UL': case 'OL': out += listOf(c, ctx.lvl || 0); break;
        case 'TABLE': out += table(c); break;
        case 'HR': out += para('', { border: true }); break;
        case 'PRE': out += c.textContent.split('\n').map(line => para(textRun(line, { code: true }), { style: 'Code' })).join(''); break;
        case 'BLOCKQUOTE': out += [...c.children].some(k => BLOCKS.has(k.tagName)) ? blocks(c, { ...ctx, quote: true }) : para(inline(c, {}), { style: 'Quote', align }); break;
        case 'FIGURE': out += blocks(c, ctx); break;
        case 'FIGCAPTION': out += para(inline(c, { i: true }), { style: 'Caption', align: align || 'center' }); break;
        case 'LI': out += para(inline(c, {}), { num: null }); break;
        default: {  // P, DIV
          if ([...c.children].some(k => BLOCKS.has(k.tagName) && k.tagName !== 'DIV')) { out += blocks(c, ctx); break; }
          if ([...c.children].some(k => k.tagName === 'DIV')) { out += blocks(c, ctx); break; }
          out += para(inline(c, ctx.th ? { b: true } : {}), { style: ctx.quote ? 'Quote' : null, align });
        }
      }
    }
    flush();
    return out;
  }

  let bodyXml = blocks(body);
  if (!bodyXml) bodyXml = '<w:p/>';
  bodyXml += '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>';

  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    + 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${bodyXml}</w:body></w:document>`;

  const bulletChars = ['•', '◦', '▪'];
  const absXml = (id, kind) => `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${Array.from({ length: 9 }, (_, l) => {
    const ind = `<w:pPr><w:ind w:left="${720 * (l + 1)}" w:hanging="360"/></w:pPr>`;
    if (kind === 'decimal') return `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${['decimal', 'lowerLetter', 'lowerRoman'][l % 3]}"/><w:lvlText w:val="%${l + 1}."/><w:lvlJc w:val="left"/>${ind}</w:lvl>`;
    if (kind === 'none') return `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="none"/><w:lvlText w:val=""/><w:lvlJc w:val="left"/>${ind}</w:lvl>`;
    return `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${bulletChars[l % 3]}"/><w:lvlJc w:val="left"/>${ind}<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr></w:lvl>`;
  }).join('')}</w:abstractNum>`;
  const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`
    + numbering.map((k, i) => absXml(i, k)).join('')
    + numbering.map((_, i) => `<w:num w:numId="${i + 1}"><w:abstractNumId w:val="${i}"/></w:num>`).join('') + '</w:numbering>';

  const heading = (n, sz, color) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${n === 1 ? 360 : 240}" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/><w:b/><w:color w:val="${color}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`
    + '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="da-DK"/></w:rPr></w:rPrDefault>'
    + '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    + heading(1, 36, '1A3A5C') + heading(2, 28, '1F4E79') + heading(3, 24, '2E6DA4')
    + '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="7FB2E5"/></w:pBdr><w:ind w:left="360"/></w:pPr><w:rPr><w:i/><w:color w:val="44546A"/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F2F4F7"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:rPr><w:i/><w:color w:val="595959"/><w:sz w:val="18"/></w:rPr></w:style>'
    + '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>'
    + '<w:style w:type="table" w:styleId="HubtechTable"><w:name w:val="HUBTECH Tabel"/><w:tblPr><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>'
    + '</w:styles>';

  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    + '<Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    + '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
    + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
    + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>');
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`
    + `<dc:title>${esc(title)}</dc:title><dc:creator>HUBTECH Office</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  zip.file('docProps/app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>HUBTECH Office</Application></Properties>');
  zip.file('word/document.xml', docXml);
  zip.file('word/styles.xml', styles);
  zip.file('word/numbering.xml', numberingXml);
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>'
    + rels.map(([id, type, target, ext]) => `<Relationship Id="${id}" Type="${type}" Target="${esc(target)}"${ext ? ' TargetMode="External"' : ''}/>`).join('')
    + '</Relationships>');
  for (const [name, b64] of media) zip.file(`word/media/${name}`, b64, { base64: true });
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
}
