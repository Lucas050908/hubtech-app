/** Download every HUBTECH Office file as real Word/Excel/PowerPoint files in one .zip. */
import { listDocs, getDoc, loadJsZip, safeName } from './store.js';

const FOLDERS = { doc: 'Dokumenter', sheet: 'Regneark', slides: 'Præsentationer' };
const EXT = { doc: 'docx', sheet: 'xlsx', slides: 'pptx' };

export async function officeZip(onProgress = () => {}) {
  const [JSZip, { htmlToDocx }, { workbookBlob }, { pptxBlob }] = await Promise.all([
    loadJsZip(), import('./docx.js'), import('./sheet.js'), import('./slides.js'),
  ]);
  const docs = (await listDocs()).filter(d => !d.trashed);
  const zip = new JSZip();
  const used = new Set();
  const failed = [];
  let i = 0;
  for (const meta of docs) {
    onProgress(++i, docs.length, meta.title);
    try {
      const d = await getDoc(meta.id);
      const blob = d.kind === 'doc' ? await htmlToDocx(d.data?.html || '', d.title)
        : d.kind === 'sheet' ? await workbookBlob(d.data)
          : await pptxBlob(d.data, d.title);
      let base = `${FOLDERS[d.kind]}/${safeName(d.title)}`, name = `${base}.${EXT[d.kind]}`, n = 2;
      while (used.has(name.toLowerCase())) name = `${base} (${n++}).${EXT[d.kind]}`;
      used.add(name.toLowerCase());
      zip.file(name, blob);
    } catch (e) {
      failed.push(meta.title);
    }
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  return { blob, count: docs.length - failed.length, failed };
}
