// Positioned text extraction off the main thread (js/paperPages.js extractPages). Like pdfWorker.mjs, but pdf-parse's
// custom `pagerender` keeps, per page, every pdf.js text item with its position:
//   { n, w, h, items:[{ str, x, y, w, h, font }] }   x,y = item.transform[4],[5] (PDF units, origin bottom-left)
// pdf-parse 1.1.1 bundles pdf.js 1.10.100; pagerender(pageData) must return a string, so each page goes back as JSON text.
import { parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';
const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
let OPS = null;   // getOperatorList() needs font faces off (no DOM in a worker thread), else pdf.js throws from a message handler
try { const lib = createRequire(import.meta.url)('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js'); lib.PDFJS.disableFontFace = true; OPS = lib.OPS; } catch { /* no rules */ }
{ const log = console.log.bind(console); console.log = (...a) => { if (!/^Warning: (?:Unable to decode image|TT: undefined function)/.test(String(a[0]))) log(...a); }; }   // pdf.js chatter about images it cannot decode here (no DOM); the text and rules do not need them
let pageNo = 0;
const r2 = v => Math.round(v * 100) / 100;
// Horizontal rules drawn on the page (fraction bars, radical overbars): [x0, x1, y, thickness] in PDF units. Text extraction never
// sees them, so the operator list is walked with a small CTM stack. Cheap, bounded, and a failure just means no rules.
function mul(a, b) { return [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]]; }
const ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
async function pageRules(pageData) {
  if (!OPS) return [];
  const out = [];
  try {
    const ol = await pageData.getOperatorList();
    let ctm = [1, 0, 0, 1, 0, 0], lw = 1; const stack = []; let segs = [];
    const flush = (stroke, fill) => {
      for (const s of segs) {
        if (s.rect) {
          const [x, y, w, h] = s.rect, p0 = ap(ctm, x, y), p1 = ap(ctm, x + w, y + h);
          const W = Math.abs(p1[0] - p0[0]), Hh = Math.abs(p1[1] - p0[1]);
          if (fill && Hh <= 2.5 && W >= 3 && W <= 600) out.push([Math.min(p0[0], p1[0]), Math.max(p0[0], p1[0]), (p0[1] + p1[1]) / 2, Math.max(Hh, 0.1)]);
        } else if (stroke && s.a && s.b) {
          const p0 = ap(ctm, s.a[0], s.a[1]), p1 = ap(ctm, s.b[0], s.b[1]);
          if (Math.abs(p1[1] - p0[1]) <= 0.3 && Math.abs(p1[0] - p0[0]) >= 3 && Math.abs(p1[0] - p0[0]) <= 600) out.push([Math.min(p0[0], p1[0]), Math.max(p0[0], p1[0]), (p0[1] + p1[1]) / 2, Math.max(lw * Math.hypot(ctm[0], ctm[1]), 0.1)]);
        }
      }
      segs = [];
    };
    for (let i = 0; i < ol.fnArray.length && out.length < 4000; i++) {
      const fn = ol.fnArray[i], a = ol.argsArray[i];
      if (fn === OPS.save) stack.push(ctm); else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
      else if (fn === OPS.transform) ctm = mul(a, ctm);
      else if (fn === OPS.setLineWidth) lw = a[0];
      else if (fn === OPS.constructPath) {
        const ops = a[0], co = a[1]; let k = 0, cur = null;
        for (const o of ops) {
          if (o === OPS.moveTo) { cur = [co[k], co[k + 1]]; k += 2; }
          else if (o === OPS.lineTo) { const q = [co[k], co[k + 1]]; k += 2; if (cur) segs.push({ a: cur, b: q }); cur = q; }
          else if (o === OPS.curveTo) k += 6; else if (o === OPS.curveTo2 || o === OPS.curveTo3) k += 4;
          else if (o === OPS.rectangle) { segs.push({ rect: [co[k], co[k + 1], co[k + 2], co[k + 3]] }); k += 4; }
        }
      } else if (fn === OPS.stroke || fn === OPS.closeStroke) flush(true, false);
      else if (fn === OPS.fill || fn === OPS.eoFill) flush(false, true);
      else if (fn === OPS.fillStroke || fn === OPS.eoFillStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke) flush(true, true);
      else if (fn === OPS.endPath) segs = [];
      else if (fn === OPS.paintImageMaskXObject || fn === OPS.paintInlineImageXObject) {   // some producers draw a rule as a one-pixel-high stencil
        const p0 = ap(ctm, 0, 0), p1 = ap(ctm, 1, 1), W = Math.abs(p1[0] - p0[0]), Hh = Math.abs(p1[1] - p0[1]);
        if (Hh <= 2.5 && W >= 3 && W <= 600) out.push([Math.min(p0[0], p1[0]), Math.max(p0[0], p1[0]), (p0[1] + p1[1]) / 2, Math.max(Hh, 0.1)]);
      }
    }
  } catch { /* none */ }
  return out.map(r => r.map(r2));
}
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
  const rules = await pageRules(pageData);
  return JSON.stringify({ n, w: r2(w), h: r2(h), items, ...(rules.length ? { rules } : {}) });
}
try {
  const opts = { pagerender, ...(workerData.max ? { max: workerData.max } : {}) };
  const parsed = await pdfParse(Buffer.from(workerData.buf), opts);
  const pages = [];
  for (const chunk of String(parsed.text ?? '').split('\n\n')) { if (!chunk.startsWith('{')) continue; try { pages.push(JSON.parse(chunk)); } catch { /* page failed */ } }
  parentPort.postMessage({ ok: true, pages, numpages: parsed.numpages ?? null });
} catch (e) { parentPort.postMessage({ ok: false, error: String(e?.message ?? e).slice(0, 300) }); }
