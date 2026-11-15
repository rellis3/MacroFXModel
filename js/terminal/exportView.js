// js/terminal/exportView.js: the DOM half of EXPORT. A small "CSV" and "PNG" pair appears in the header of the boards on a few tabs (the Monitor, Insight, Calendar and Currencies tabs) that
// hold a table or a chart: CSV writes the table as it is on screen, PNG the chart as it is drawn. The file is made in this browser and saved with a normal download: nothing is sent anywhere.
// The command line has EXPORT (the biggest table on the open tab) and EXPORT PNG (its first chart). What is exported is what the page shows (see exportCore.js for what is left out).
//
// A PREVIEW feature (registry id widget.export): js/terminal/terminalFeel.js only loads this file when the session may see that surface.
import { toCsv, tableRows, exportName, resolveCssVars, isChart, biggestTable } from './exportCore.js';

export const SCOPES = ['monitor', 'insight', 'cal', 'ccy'];
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Save a Blob as a file with the browser's own download (an <a download>). Returns true when the click was made. */
export function saveBlob(blob, name, doc = document, win = window) {
  try {
    const url = win.URL.createObjectURL(blob), a = doc.createElement('a');
    a.setAttribute('href', url); a.download = name; a.rel = 'noopener'; a.hidden = true; doc.body.appendChild(a); a.click(); a.remove?.();
    win.setTimeout?.(() => { try { win.URL.revokeObjectURL(url); } catch { /* gone */ } }, 4000);
    return true;
  } catch { return false; }
}

const sizeOf = el => {
  const r = el.getBoundingClientRect?.();
  if (r && r.width > 1) return [r.width, r.height];
  const vb = String(el.getAttribute?.('viewBox') ?? '').split(/[\s,]+/).map(Number);
  return [Number(el.getAttribute?.('width')) || vb[2] || el.width || 0, Number(el.getAttribute?.('height')) || vb[3] || el.height || 0];
};
export const chartsIn = root => [...(root?.querySelectorAll?.('canvas, svg') ?? [])].filter(el => !el.closest?.('button, [data-noexport]') && isChart(...sizeOf(el)));
export const tablesIn = root => [...(root?.querySelectorAll?.('table') ?? [])].filter(t => !t.closest?.('[data-noexport]') && tableRows(t).body.length > 0);

/** A chart element -> PNG Blob (canvas: as drawn; svg: serialised with the theme colours filled in, then drawn on a canvas). Resolves null when it cannot. */
export async function chartToPng(el, win = window, doc = document) {
  const [w0, h0] = sizeOf(el), scale = 2;
  const css = n => win.getComputedStyle(doc.documentElement).getPropertyValue(n);
  const paint = (img, w, h) => new Promise(res => {
    const c = doc.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const g = c.getContext('2d'); g.fillStyle = css('--bg1').trim() || 'black'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob(b => res(b), 'image/png');
  });
  try {
    if (el.tagName?.toLowerCase() === 'canvas') return await paint(el, el.width / (win.devicePixelRatio || 1) || w0, el.height / (win.devicePixelRatio || 1) || h0);
    const clone = el.cloneNode(true); clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', w0); clone.setAttribute('height', h0);
    const color = win.getComputedStyle(el).color || css('--tx');
    const text = resolveCssVars(new win.XMLSerializer().serializeToString(clone), css).replace(/currentColor/g, color || 'gray');
    const img = new win.Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`; });
    return await paint(img, w0, h0);
  } catch { return null; }
}

export function mountExport({ doc = document, win = window, scopes = SCOPES, now = () => Date.now() } = {}) {
  const roots = scopes.map(id => doc.getElementById(id)).filter(Boolean);
  if (!roots.length || doc.body.dataset?.exMounted) return null;
  if (doc.body.dataset) doc.body.dataset.exMounted = '1';
  const titleOf = (el, root) => {
    const card = el.closest?.('.card') ?? root, lbl = card?.querySelector?.('.ch .lbl, .lbl');
    return String(lbl?.textContent ?? '').trim() || root?.id || 'board';
  };
  let noteT = null;
  const note = text => {
    let b = doc.getElementById('ex-note');
    if (!b) { b = doc.createElement('div'); b.id = 'ex-note'; b.className = 'ex-note'; b.setAttribute('role', 'status'); b.setAttribute('aria-live', 'polite'); doc.body.appendChild(b); }
    b.textContent = text; b.hidden = !text;
    if (noteT && win.clearTimeout) win.clearTimeout(noteT);
    noteT = text && win.setTimeout ? win.setTimeout(() => { b.hidden = true; }, 5000) : null;
  };
  function doCsv(table, title) {
    const { head, body } = tableRows(table);
    if (!body.length) { note('That table has no rows to export.'); return false; }
    const ok = saveBlob(new win.Blob([toCsv(head, body)], { type: 'text/csv;charset=utf-8' }), exportName(title, 'csv', now()), doc, win);
    note(ok ? `Saved ${body.length} row${body.length === 1 ? '' : 's'} as CSV.` : 'The browser blocked the download.'); return ok;
  }
  async function doPng(el, title) {
    const blob = await chartToPng(el, win, doc);
    if (!blob) { note('That chart could not be turned into an image here.'); return false; }
    const ok = saveBlob(blob, exportName(title, 'png', now()), doc, win);
    note(ok ? 'Saved the chart as a PNG.' : 'The browser blocked the download.'); return ok;
  }
  // one small bar per card that holds a table or a chart: "Export  CSV  PNG"
  let scheduled = false;
  function decorate() {
    scheduled = false;
    for (const root of roots) {
      for (const card of root.querySelectorAll?.('.card') ?? []) {
        if (card.querySelector?.('.ex-bar')) continue;
        const t = tablesIn(card)[0], c = chartsIn(card)[0]; if (!t && !c) continue;
        const bar = doc.createElement('span'); bar.className = 'ex-bar'; bar.setAttribute('data-noexport', ''); bar.setAttribute('data-surface', 'widget.export');
        bar.innerHTML = `<span class="ex-in" data-surface="widget.export"><span class="ex-l">Export</span>${t ? '<button type="button" class="ex-b" data-ex="csv" title="Save this table as a CSV file (made in this browser)">CSV</button>' : ''}${c ? '<button type="button" class="ex-b" data-ex="png" title="Save this chart as a PNG image (made in this browser)">PNG</button>' : ''}</span>`;
        const head = card.querySelector('.ch') ?? card.querySelector('.tt-head') ?? card; head.appendChild(bar);
      }
    }
  }
  const schedule = () => { if (!scheduled) { scheduled = true; (win.requestAnimationFrame ?? (f => win.setTimeout(f, 50)))(decorate); } };
  const obs = win.MutationObserver ? new win.MutationObserver(schedule) : null;
  for (const r of roots) obs?.observe?.(r, { childList: true, subtree: true });
  const onClick = e => {
    const b = e.target.closest?.('[data-ex]'); if (!b) return;
    const card = b.closest('.card') ?? b.parentNode, root = roots.find(r => r.contains?.(card)) ?? roots[0];
    if (b.dataset.ex === 'csv') { const t = biggestTable(tablesIn(card)); if (t) doCsv(t, titleOf(t, root)); } else { const c = chartsIn(card)[0]; if (c) doPng(c, titleOf(c, root)); }
  };
  for (const r of roots) r.addEventListener('click', onClick);
  const openRoot = () => roots.find(r => !r.hidden) ?? null;
  win.deskExport = {
    /** The command line's EXPORT: the biggest table on the open tab. */
    csv: () => { const r = openRoot() ?? doc.querySelector('main section:not([hidden])'); const t = biggestTable(tablesIn(r)); return t ? doCsv(t, titleOf(t, r)) : (note('There is no table on this tab to export.'), false); },
    /** EXPORT PNG: the first chart on the open tab. */
    png: () => { const r = openRoot() ?? doc.querySelector('main section:not([hidden])'); const c = chartsIn(r)[0]; return c ? doPng(c, titleOf(c, r)) : (note('There is no chart on this tab to export.'), false); },
    scan: decorate,
  };
  decorate();
  return { decorate, destroy() { obs?.disconnect?.(); for (const r of roots) r.removeEventListener('click', onClick); for (const b of doc.querySelectorAll('.ex-bar')) b.remove(); delete win.deskExport; if (doc.body.dataset) delete doc.body.dataset.exMounted; } };
}
