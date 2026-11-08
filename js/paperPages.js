// Positioned page extraction for the paper library: runs scripts/pdf/pagesWorker.mjs in a worker thread (same timeout and
// two-at-a-time queue as server.js _pdfText) and returns { pages:[{ n, w, h, items:[{ str, x, y, w, h, font }] }] }.
// Also: a fallback that turns an old flat text file into pages, so the reader never has nothing.
import { Worker } from 'node:worker_threads';

const Q = { running: 0, wait: [] };

/** @returns {Promise<{ pages: Array<{n:number,w:number,h:number,items:Array<{str:string,x:number,y:number,w:number,h:number,font:string}>}>, numpages:number|null }>} */
export async function extractPages(buffer, { max = 0, timeoutMs = 120_000 } = {}) {
  if (Q.running >= 2) await new Promise(r => Q.wait.push(r));
  Q.running++;
  try {
    return await new Promise((resolve, reject) => {
      const w = new Worker(new URL('../scripts/pdf/pagesWorker.mjs', import.meta.url), { workerData: { buf: buffer, max }, resourceLimits: { maxOldGenerationSizeMb: 512 } });
      const t = setTimeout(() => { w.terminate(); reject(new Error(`pdf pages timed out after ${Math.round(timeoutMs / 1000)}s`)); }, timeoutMs);
      w.once('message', m => { clearTimeout(t); w.terminate(); m.ok ? resolve({ pages: m.pages, numpages: m.numpages }) : reject(new Error(`pdf pages: ${m.error}`)); });
      w.once('error', e => { clearTimeout(t); reject(e); });
      w.once('exit', code => { clearTimeout(t); if (code) reject(new Error(`pdf pages worker exited (${code})`)); });
    });
  } finally { Q.running--; Q.wait.shift()?.(); }
}

/**
 * An old-style flat text (no positions) as pages the block builder accepts: a new page after ~3000 characters at a
 * paragraph break, one item per line, single column, uniform font; blank lines become larger gaps.
 * Never throws; empty or non-string input gives { pages: [] }.
 */
export function flatTextToPages(text, { charsPerPage = 3000 } = {}) {
  const s = typeof text === 'string' ? text.replace(/\r/g, '') : '';
  if (!s.trim()) return { pages: [] };
  const W = 612, H = 792, top = 740, lh = 12, para = 8;
  const pages = []; let cur = null, y = 0, chars = 0;
  const open = () => { cur = { n: pages.length + 1, w: W, h: H, items: [] }; pages.push(cur); y = top; chars = 0; };
  open();
  let blank = false;
  for (const raw of s.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { blank = true; continue; }
    if (y < 60 || (chars > charsPerPage && blank)) open();
    if (blank && cur.items.length) y -= para;
    blank = false;
    cur.items.push({ str: line.trim(), x: 72, y, w: Math.min(468, line.length * 5), h: 10, font: 'flat' });
    y -= lh; chars += line.length;
  }
  return { pages };
}
