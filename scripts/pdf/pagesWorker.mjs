// Positioned text extraction off the main thread (js/paperPages.js extractPages). Like pdfWorker.mjs, but pdf-parse's
// custom `pagerender` keeps, per page, every pdf.js text item with its position:
//   { n, w, h, items:[{ str, x, y, w, h, font }] }   x,y = item.transform[4],[5] (PDF units, origin bottom-left)
// pdf-parse 1.1.1 bundles pdf.js 1.10.100; pagerender(pageData) must return a string, so each page goes back as JSON text.
import { parentPort, workerData } from 'node:worker_threads';
const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
let pageNo = 0;
const r2 = v => Math.round(v * 100) / 100;
async function pagerender(pageData) {
  const n = ++pageNo;
  const view = Array.isArray(pageData.view) ? pageData.view : [0, 0, 612, 792];
  let w = (view[2] ?? 612) - (view[0] ?? 0), h = (view[3] ?? 792) - (view[1] ?? 0);
  try { const vp = pageData.getViewport(1.0); if (vp?.width > 0 && vp?.height > 0) { w = vp.width; h = vp.height; } } catch { /* keep view */ }
  const tc = await pageData.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
  const items = [];
  for (const it of tc.items ?? []) {
    const t = it.transform; if (typeof it.str !== 'string' || !Array.isArray(t)) continue;
    const o = { str: it.str, x: r2(t[4]), y: r2(t[5]), w: r2(it.width ?? 0), h: r2(it.height || Math.hypot(t[2] ?? 0, t[3] ?? 0)), font: String(it.fontName ?? '') };
    if (Math.abs(t[0] ?? 1) < Math.abs(t[1] ?? 0)) o.r = 1;   // rotated text (arXiv margin stamp, rotated tables): the block builder ignores it
    items.push(o);
  }
  return JSON.stringify({ n, w: r2(w), h: r2(h), items });
}
try {
  const opts = { pagerender, ...(workerData.max ? { max: workerData.max } : {}) };
  const parsed = await pdfParse(Buffer.from(workerData.buf), opts);
  const pages = [];
  for (const chunk of String(parsed.text ?? '').split('\n\n')) { if (!chunk.startsWith('{')) continue; try { pages.push(JSON.parse(chunk)); } catch { /* page failed */ } }
  parentPort.postMessage({ ok: true, pages, numpages: parsed.numpages ?? null });
} catch (e) { parentPort.postMessage({ ok: false, error: String(e?.message ?? e).slice(0, 300) }); }
