// Equations as maths in the reader (plans/PAPER_LIBRARY.md "Equations as maths"): KaTeX from cdnjs (pinned), loaded only when the first equation with
// LaTeX is about to be drawn. If it cannot load, or a formula will not render, the caller shows the original crop instead.
// Pure helpers (mode, labels) are testable in node; the loader needs a browser.
export const KATEX_VER = '0.16.11';
export const KATEX_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/' + KATEX_VER + '/';
export const EQ_MODE_KEY = 'lib-eq-mode';

/** 'rendered' (default) or 'original' (image crops) — the header switch, remembered in localStorage. */
export function eqMode(storage) { try { return storage.getItem(EQ_MODE_KEY) === 'original' ? 'original' : 'rendered'; } catch { return 'rendered'; } }
export function setEqMode(storage, mode) { try { storage.setItem(EQ_MODE_KEY, mode === 'original' ? 'original' : 'rendered'); } catch { /* not remembered */ } }

/** A block with LaTeX the reader can draw. */
export const hasMath = b => !!b && b.type === 'eq' && typeof b.latex === 'string' && b.latex.trim().length > 0;
export const anyMath = blocks => Array.isArray(blocks) && blocks.some(hasMath);

const LABELS = { arxiv: 'arXiv source', rule: 'read from the PDF', model: 'tidied by AI' };
const TITLES = {
  arxiv: 'The exact LaTeX of this equation, taken from arXiv\'s own HTML version of the paper.',
  rule: 'Rebuilt from the positions of the glyphs in the PDF by rules (no AI). The original image is one tap away.',
  model: 'An AI model tidied this equation from the PDF text and its neighbouring sentences. Check it against the original.',
};
export const sourceLabel = s => LABELS[s] || '';
export const sourceTitle = s => TITLES[s] || '';

let libP = null;
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error('KaTeX failed to load')); document.head.appendChild(s); }); }
function loadCss(href) { return new Promise(res => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = () => res(true); l.onerror = () => res(false); document.head.appendChild(l); }); }
/** window.katex, or null when it cannot be loaded (offline, blocked): the caller falls back to the crop. */
export function loadKatex() {
  if (!libP) libP = (async () => {
    if (typeof window !== 'undefined' && window.katex) return window.katex;
    await Promise.all([loadCss(KATEX_BASE + 'katex.min.css'), loadScript(KATEX_BASE + 'katex.min.js')]);
    return window.katex || null;
  })().catch(() => { libP = null; return null; });
  return libP;
}
/** Draws `latex` into `el` (display mode). Returns false (and leaves `el` empty) when KaTeX refuses it. */
export function renderInto(el, latex, katex) {
  try { el.textContent = ''; katex.render(latex, el, { displayMode: true, throwOnError: true, strict: 'ignore', trust: false, output: 'htmlAndMathml', maxExpand: 500 }); return true; }
  catch { el.textContent = ''; return false; }
}
