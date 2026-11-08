// Lazy pdf.js (cdnjs, pinned) used only to cut equation/table crops out of the original page.
// Loaded the first time an eq/table block is shown; any failure resolves to null so the caller shows a placeholder.
import { cropRect, renderScale } from './crop.js';
import { api } from './api.js';

const VER = '3.11.174';
const BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + VER + '/';
let libP = null;
const docs = new Map();      // paperId -> Promise<PDFDocumentProxy|null>
const pages = new Map();     // id:page -> Promise<{canvas, size}|null>

function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('pdf.js failed to load')); document.head.appendChild(s); });
}
export function loadPdfJs() {
  if (!libP) libP = (async () => {
    await loadScript(BASE + 'pdf.min.js');
    const lib = window.pdfjsLib;
    if (!lib) throw new Error('pdf.js missing');
    // A cross-origin worker is not allowed directly; wrap it in a same-origin blob.
    try {
      const code = await (await fetch(BASE + 'pdf.worker.min.js')).text();
      lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    } catch { lib.GlobalWorkerOptions.workerSrc = BASE + 'pdf.worker.min.js'; }
    return lib;
  })().catch(() => null);
  return libP;
}
function getDoc(id) {
  if (!docs.has(id)) docs.set(id, (async () => {
    const lib = await loadPdfJs(); if (!lib) return null;
    try { return await lib.getDocument({ url: api.pdfUrl(id), withCredentials: true }).promise; } catch { return null; }
  })());
  return docs.get(id);
}
function renderPage(id, pageNo, size) {
  const k = id + ':' + pageNo;
  if (!pages.has(k)) pages.set(k, (async () => {
    const doc = await getDoc(id); if (!doc) return null;
    try {
      const page = await doc.getPage(pageNo);
      const vp = page.getViewport({ scale: renderScale(size) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      return canvas;
    } catch { return null; }
  })());
  return pages.get(k);
}
/** Returns a canvas element holding the crop, or null (caller shows "page N, open PDF"). */
export async function cropBlock(id, block, pageSizes) {
  const size = pageSizes && pageSizes[block.page];
  if (!block.bbox || !size) return null;
  const src = await renderPage(id, block.page, size);
  if (!src) return null;
  const r = cropRect(block.bbox, size, src.width, src.height);
  if (!r) return null;
  const out = document.createElement('canvas');
  out.width = r.sw; out.height = r.sh;
  out.getContext('2d').drawImage(src, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh);
  return out;
}
