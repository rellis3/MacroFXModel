// Paper text pipeline (pure): positioned pdf.js text items -> reading blocks, with equations and tables located by page and box.
//
//   buildBlocks(pages) -> { blocks:[{ i, type:'h1'|'h2'|'p'|'eq'|'table'|'fig'|'refs', text, page, bbox:[x0,y0,x1,y1]|null, label? }],
//                           pageSize:{ [page]:[w,h] } }          bbox in PDF units, origin bottom-left
//   plainText(blocks) / conclusion(blocks) / abstractOf(blocks)
//
// Input is { pages:[{ n, w, h, items:[{ str, x, y, w, h, font }] }] } (or the bare array) from js/paperPages.js. No model, no network.
//
// HEURISTICS
//  - Lines: items are clustered by baseline (tolerance 0.35 x body height). Items smaller than the body (sub/superscripts, limits)
//    or lone radicals/accents join the nearest line within about one body height; fraction parts stay separate lines.
//  - Columns: a gutter is a vertical band, in the middle of the text area, that few lines cross (<= 35 percent) and with at least
//    4 lines wholly left and right of it. Items are then assigned to the left column, the right column or "full width" (they
//    cross the gutter), and read: full-width line, then the left column, then the right column, band by band.
//    A sparse page (few lines) inherits the gutter the rest of the document uses if little crosses it.
//  - Text in unmapped fonts (chart labels as punctuation soup) is dropped; so are runs of >= 6 very short lines (figure labels).
//  - Headers/footers: a line in the top or bottom 12 percent of the page whose text (digits masked) recurs on >= 40 percent of
//    pages (at least 2) is dropped; bare page numbers in those bands too. Rotated text (arXiv stamp) is ignored.
//  - Headings: line height >= 1.12 x body; numbered titles ("2.1 Data") and ALL-CAPS or well-known names ("Introduction",
//    "References") when short and set apart (different font, or isolated, or capitals). The first run of the largest big lines on
//    page 1 is the title (h1); every other heading is h2 (the number stays in the text). "Abstract" is found by name, also run-in.
//    A size-only heading must also be aligned to the column and be followed by body text (diagram labels are not headings).
//    Page-1 lines between the title and the Abstract/Introduction (authors, affiliations) are paragraphs, never headings or equations.
//  - Paragraphs: lines reflow by baseline gap (> 1.35 x pitch), first-line indent, and short sentence-final lines; a paragraph
//    continues across a column or page break while it has not ended a sentence. Hyphenated line breaks are rejoined. Footnote-size
//    lines are pulled out of the flow, figure/table blocks too (they are emitted when the running paragraph ends).
//  - Equations: a line (or a few adjacent lines: fraction rows, aligned rows, a detached "(3)") with <= 2 prose words, enough math
//    glyphs (Greek, math operators, = < > + ...), and either centered, clearly indented or carrying a right-edge equation number.
//    Body-width lines with prose words are never equations, so inline math stays inside its paragraph. The box is the union of
//    the item boxes, padded, and clamped to the midline of the gap to neighbouring text so a crop does not show prose.
//  - Tables: rows with >= 3 cells (gaps >= 1.2 x body) of mostly numbers, >= 3 rows, with the "Table N" caption (above or below)
//    folded in. Items that hold several cells (pdf.js merges tab-spaced runs: "4.81%    5.19%", a glued label "Performance (p. a.)1.14%",
//    back-to-back negatives) are split first. A "Table N" caption without such rows is anchored: the lines right under (or over) it that
//    look like rows with numbers lined up in columns, or the lines between the drawn rules under it, until the first normal paragraph
//    line. The block box is caption + rows + the rules that frame them; the reader shows it as an image crop, never as text.
//  - Figures: "Figure N:" captions are 'fig' blocks. The page's picture regions (pages[].gfx from js/pdfGraphics.js: embedded images
//    and clusters of vector paths) are matched to the caption: the region above it or below it (the document's usual side wins
//    ties), in the caption's column(s), with no body text between; further regions of a multi-panel figure up to the nearest body
//    text; short labels around the plot (ticks, legend, axis titles) are absorbed and not read as text. The box is caption +
//    graphic + padding and the block carries gfx:true. No graphic found: the box is the caption only, as before.
//  - Footnotes: a raised, superscript-sized one or two digit item that directly follows a word or punctuation is dropped from the
//    paragraph text when the same number starts a footnote line lower on the page; that footnote body (small print at the page bottom)
//    becomes a 'p' block with foot:true (shown small, skipped when listening). Years, decimals and exponents are never touched.
//  - References: from a References/Bibliography heading to the end (or an Appendix heading) as one 'refs' block.
//
// KNOWN FAILURE MODES
//  - Scanned PDFs have no text layer: no items, no blocks (the caller falls back to the flat text, then to "original PDF").
//  - Text inside figures (axis labels, legends) can leak as short paragraphs; runs of >= 6 very short unclaimed lines are dropped,
//    but a chart can still get through. A chart drawn with text glyphs (no image, no paths) has no graphic region, so its 'fig' box is
//    the caption only; so is a table drawn as an image (a 'fig' block with its caption; with a vector frame it gets the graphic).
//    A picture set far (> 90 units) from its caption is only attached when it is big and nothing lies between; a caption longer than
//    12 lines is cut. Text tables without numbers (word grids) are found only if drawn rules frame them.
//  - Font names are opaque ids (no bold flag): headings rely on size, numbering, capitals, a different font and isolation.
//  - Display equations set flush left with prose-width lines, or typeset with real words ("if", "otherwise" many times), may be read
//    as prose; an in-line-only equation list can be read as an equation. Wide equations crossing the gutter of a two-column page and
//    tables whose columns straddle the gutter may be split. Multi-line equations with a blank-line gap > 2 body heights split.
//  - Compound words broken at a real hyphen are glued ("well-known" at a line end becomes "wellknown"). Math fonts that emit
//    private-use glyphs give garbled equation text; the box still crops the page correctly, which is why the reader shows the image.
//  - Every function returns fewer blocks instead of throwing on odd input.

import { stripStamps, isStampLine } from './paperStamps.js';
const LIGATURES = { 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st' };
const MATH_STRONG = /[\p{Script=Greek}\p{Mn}ˆ˜¯∂∞√∑∫∏∈∉⊂⊆≤≥≈≠≡±×÷−∗⋅·‖∇∀∃→↦∥^_\u{1D400}-\u{1D7FF}]/u;
const MATH_WEAK = /[=<>+|~]/;
const MATH_STRONG_G = new RegExp(MATH_STRONG.source, 'gu');
const MATH_WORDS = new Set(['argmin', 'argmax', 'softmax', 'sigmoid', 'tanh', 'sinh', 'cosh', 'sech', 'diag', 'sign', 'relu', 'proj', 'trace', 'rank', 'cov', 'corr', 'var', 'exp', 'log', 'min', 'max', 'sup', 'inf', 'lim', 'det', 'sin', 'cos', 'tan']);
const STOP = /\b(the|and|for|are|that|with|where|which|this|from|each|then|when|else|let|any|all|can|not|has|have|its|is|be|of|to|in|as|by|we|if|or|an|at|on)\b/gi;
const KNOWN_HEADS = /^(abstract|summary|introduction|background|related (work|literature)s?|literature review|preliminaries|notation|data|data and methodology|methodology|methods?|model|the model|empirical (results|analysis|strategy)|results|results and discussion|discussion|conclusions?|concluding remarks?|conclusions? and (future work|discussion|implications)|summary and conclusions?|discussion and conclusions?|future work|acknowledg(e)?ments?|appendix.*|appendices|references|bibliography|works cited|supplementary.*|robustness( checks)?|experiments?|theory|analysis|literature)$/i;
const REFS_HEAD = /^(references|bibliography|works cited|reference list|literature cited)$/i;
const APPX_HEAD = /^(appendix|appendices|supplementary|online appendix|supplemental)\b/i;
const CONC_HEAD = /^(?:(?:\d+(?:\.\d+)*\.?|[IVX]+\.?)\s*)?(conclusions?|concluding remarks?|conclusions? and [a-z ]+|summary and conclusions?|discussion and conclusions?|final remarks)\s*$/i;
const ABSTRACT_HEAD = /^(?:(?:\d+\.?|[IVX]+\.?)\s*)?(abstract|summary)\s*$/i;
const NUM_HEAD = /^(?:\d{1,2}(?:\.\d{1,2}){0,3}\.?|[IVX]{1,5}\.|[A-Z](?:\.\d{1,2})*\.?)\s+[A-Z\u00c0-\u00de][a-z]/;
const CFG = { tolY: 0.35, spaceGap: 0.16, headRatio: 1.12, titleRatio: 1.15, gutterCover: 0.35, bandFrac: 0.12, pitchBreak: 1.35, cellGap: 1.2 };

const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const r1 = v => Math.round(v * 10) / 10;
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };
const endsSentence = t => /[.?!:;”")\]]\s*$/.test(t) && !/\b(et al|e\.g|i\.e|vs|cf|Fig|Eq|Eqs|No)\.\s*$/.test(t);
const normTxt = t => String(t ?? '').replace(/[ﬀ-ﬆ]/g, c => LIGATURES[c]).replace(/[    ]/g, ' ');

// ---------- input -------------------------------------------------------------------------------------------------------------
function normalizePages(input) {
  const arr = Array.isArray(input) ? input : Array.isArray(input?.pages) ? input.pages : [];
  const out = [];
  arr.forEach((p, idx) => {
    if (!p || !Array.isArray(p.items)) return;
    const seen = new Set(), items = [];
    for (const it of p.items) {
      if (!it || typeof it.str !== 'string') continue;
      const str = normTxt(it.str);
      if (!str.trim()) continue;
      const x = num(it.x, NaN), y = num(it.y, NaN);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const h = num(it.h, 0) > 0 ? num(it.h) : 0, w = Math.max(0, num(it.w, 0));
      const key = `${str}|${Math.round(x / 1.5)}|${Math.round(y / 1.5)}`;   // overprinted duplicates (fake bold)
      if (seen.has(key)) continue; seen.add(key);
      items.push({ str, x, y, w: w || str.length * (h || 8) * 0.5, h, font: String(it.font ?? ''), r: it.r ? 1 : 0 });
    }
    const rules = Array.isArray(p.rules) ? p.rules.filter(r => Array.isArray(r) && r.length >= 3 && r.every(Number.isFinite)) : [];
    const gfx = Array.isArray(p.gfx) ? p.gfx.filter(g => Array.isArray(g) && g.length >= 4 && g.slice(0, 4).every(Number.isFinite) && g[2] > g[0] && g[3] > g[1]).map(g => ({ x0: g[0], y0: g[1], x1: g[2], y1: g[3] })) : [];
    out.push({ n: num(p.n, idx + 1), w: num(p.w, 612) || 612, h: num(p.h, 792) || 792, items, rules, gfx });
  });
  return out;
}

function bodyStats(pages) {
  const bins = new Map(), fonts = new Map();
  for (const p of pages) for (const it of p.items) { if (it.r || !(it.h > 0)) continue; const k = Math.round(it.h * 4) / 4; bins.set(k, (bins.get(k) ?? 0) + it.str.length); }
  let B = 10, best = 0;
  for (const [k, c] of bins) if (c > best) { best = c; B = k; }
  for (const p of pages) for (const it of p.items) { if (it.r || Math.abs(it.h - B) > 0.12 * B) continue; fonts.set(it.font, (fonts.get(it.font) ?? 0) + it.str.length); }
  let bodyFont = '', fb = 0; for (const [f, c] of fonts) if (c > fb) { fb = c; bodyFont = f; }
  for (const p of pages) for (const it of p.items) if (!(it.h > 0)) it.h = B;
  return { B, bodyFont };
}

/**
 * Some producers (old Word / Acrobat output) report text heights several times the real glyph size (the text matrix carries the
 * scale), so a line box would reach far above its baseline. If the body height is much larger than the baseline pitch allows,
 * all heights are scaled down to a plausible body size (ratios, which every heuristic uses, are unchanged).
 */
function fixHeights(pages, B) {
  const gaps = [];
  for (const p of pages) {
    const ys = [...new Set(p.items.filter(it => !it.r && Math.abs(it.h - B) <= 0.1 * B).map(it => Math.round(it.y * 2) / 2))].sort((a, b) => b - a);
    for (let k = 1; k < ys.length; k++) { const d = ys[k - 1] - ys[k]; if (d >= 4 && d <= 60) gaps.push(d); }
  }
  const pitch = median(gaps);
  if (!(pitch > 0) || B <= 2.2 * pitch || B <= 24) return B;
  const nb = Math.min(12, pitch), f = nb / B;
  for (const p of pages) for (const it of p.items) it.h *= f;
  return nb;
}

// ---------- lines --------------------------------------------------------------------------------------------------------------
const isAccent = s => /^[\s√∑∏∫⌈⌉⌊⌋ˆˇ˜¯~^̀-ͯ]+$/.test(s);
const boxOf = it => ({ x0: it.x, x1: it.x + it.w, y0: it.y - 0.25 * it.h, y1: it.y + 0.8 * it.h });

function finalizeLine(items, B, page, col) {
  items.sort((a, b) => a.x - b.x || b.y - a.y);
  let s = '', prevEnd = null;
  for (const it of items) {
    if (it._fn) continue;   // a footnote marker glued to a word: kept in the geometry, left out of the text
    if (prevEnd != null && it.x - prevEnd > CFG.spaceGap * B && !/\s$/.test(s) && !/^\s/.test(it.str)) s += ' ';
    s += it.str; prevEnd = Math.max(prevEnd ?? -1e9, it.x + it.w);
  }
  const main = items.filter(it => it.h >= 0.82 * B), hs = new Map();
  for (const it of (main.length ? main : items)) { const k = Math.round(it.h * 4) / 4; hs.set(k, (hs.get(k) ?? 0) + it.str.length); }
  let h = B, hb = -1; for (const [k, c] of hs) if (c > hb) { hb = c; h = k; }
  const ys = (main.length ? main : items).map(it => it.y);
  const fonts = new Map(); for (const it of main.length ? main : items) fonts.set(it.font, (fonts.get(it.font) ?? 0) + it.str.length);
  let font = '', fc = 0; for (const [f, c] of fonts) if (c > fc) { fc = c; font = f; }
  const text = s.replace(/\s+/g, ' ').trim();
  return {
    page, col, items, text, h, font, y: median(ys),
    x0: Math.min(...items.map(i => i.x)), x1: Math.max(...items.map(i => i.x + i.w)),
    top: Math.max(...items.map(i => i.y + 0.8 * i.h)), bot: Math.min(...items.map(i => i.y - 0.25 * i.h)),
    chars: text.replace(/\s/g, '').length, colLeft: 0, colRight: 0,
  };
}

function buildLines(items, B, page, col) {
  const main = [], small = [];
  for (const it of items) (it.h < 0.82 * B || isAccent(it.str) ? small : main).push(it);
  main.sort((a, b) => b.y - a.y || a.x - b.x);
  const groups = [], tol = CFG.tolY * B;
  for (const it of main) {
    let g = null;
    for (let k = groups.length - 1; k >= 0 && k >= groups.length - 3; k--) if (Math.abs(groups[k].y - it.y) <= tol) { g = groups[k]; break; }
    if (!g) { g = { items: [], y: it.y }; groups.push(g); }
    g.y = (g.y * g.items.length + it.y) / (g.items.length + 1); g.items.push(it);
  }
  const lone = [];   // a lone glyph on its own baseline (a big operator in a math font) belongs to the line it touches
  for (let k = groups.length - 1; k >= 0; k--) if (groups[k].items.length === 1 && groups[k].items[0].str.trim().length <= 2) { lone.push(groups[k].items[0]); groups.splice(k, 1); }
  for (const g of groups) { g.x0 = Math.min(...g.items.map(i => i.x)); g.x1 = Math.max(...g.items.map(i => i.x + i.w)); }
  for (const it of lone) {
    let best = null, bd = Infinity; const ie = it.x + it.w;
    for (const g of groups) {
      const d = Math.abs(it.y - g.y); if (d > 1.1 * B) continue;
      if (g.items.some(o => (o.x >= ie - 1 && o.x - ie <= 0.5 * B) || (o.x + o.w <= it.x + 1 && it.x - (o.x + o.w) <= 0.5 * B)) && d < bd) { bd = d; best = g; }
    }
    if (best) { best.items.push(it); best.x0 = Math.min(best.x0, it.x); best.x1 = Math.max(best.x1, it.x + it.w); }
    else small.push(it);
  }
  for (const it of small) {
    let best = null, bd = Infinity; const lim = Math.max(1.1 * B, 0.6 * it.h), ie = it.x + it.w;
    for (const g of groups) {
      const d = Math.abs(it.y - g.y);
      if (d > lim || it.x < g.x0 - 1.5 * B || it.x > g.x1 + 1.5 * B) continue;
      // a neighbour whose left or right edge sits against this item (base letter of a subscript, text after a radical)
      const touch = g.items.some(o => (o.x >= ie - 1 && o.x - ie <= 0.5 * B) || (o.x + o.w <= it.x + 1 && it.x - (o.x + o.w) <= 0.5 * B) || Math.abs(o.x - it.x) <= 0.5 * B || Math.abs(o.x + o.w - ie) <= 0.5 * B);
      const score = d + (touch ? 0 : 3 * B);
      if (score < bd) { bd = score; best = g; }
    }
    if (best) { best.items.push(it); best.x0 = Math.min(best.x0, it.x); best.x1 = Math.max(best.x1, it.x + it.w); }
    else groups.push({ items: [it], y: it.y, x0: it.x, x1: it.x + it.w });
  }
  groups.sort((a, b) => b.y - a.y);
  return groups.map(g => finalizeLine(g.items, B, page, col));
}

/** Word-gap-merged intervals of a line: [{ a, b, items }]. */
function intervals(items, B) {
  const sorted = [...items].sort((p, q) => p.x - q.x), out = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && it.x - last.b < 0.75 * B) { last.b = Math.max(last.b, it.x + it.w); last.items.push(it); }
    else out.push({ a: it.x, b: it.x + it.w, items: [it] });
  }
  return out;
}

function gutterFallback(ls, B, fb) {   // a sparse page inherits the gutter the rest of the document uses, if little crosses it
  if (!fb || ls.length < 2) return null;
  const ivs = ls.map(l => intervals(l.items, B));
  const crossing = ivs.filter(iv => iv.some(v => v.a < fb.b && v.b > fb.a)).length;
  let nl = 0, nr = 0; for (const iv of ivs) for (const v of iv) { if (v.b <= fb.mid) nl++; else if (v.a >= fb.mid) nr++; }
  return crossing <= 0.5 * ls.length && nl >= 1 && nr >= 1 ? fb : null;
}

function detectGutter(lines, B, fb) {
  const ls = lines.filter(l => l.chars > 0); const n = ls.length; if (n < 10) return gutterFallback(ls, B, fb);
  const lo = pct(ls.map(l => l.x0), 0.1), hi = pct(ls.map(l => l.x1), 0.9); if (hi - lo < 200) return gutterFallback(ls, B, fb);
  const ivs = ls.map(l => intervals(l.items, B));
  const from = Math.floor(lo + 0.3 * (hi - lo)), to = Math.ceil(lo + 0.7 * (hi - lo));
  const cover = [];
  for (let x = from; x <= to; x++) cover.push(ivs.reduce((c, iv) => c + (iv.some(v => v.a <= x && v.b >= x) ? 1 : 0), 0));
  let best = null, start = -1;
  // the widest low-coverage band, but a band that almost no line crosses beats a wider one that a column of text (or a table's
  // wide cell gap) runs through
  for (let k = 0; k <= cover.length; k++) {
    const ok = k < cover.length && cover[k] <= CFG.gutterCover * n;
    if (ok && start < 0) start = k;
    if (!ok && start >= 0) {
      const run = { a: from + start, b: from + k - 1 }; run.w = run.b - run.a;
      run.clean = run.w >= 0.7 * B && cover.slice(start, k).reduce((s, c) => s + c, 0) / (k - start) <= 0.08 * n;
      if (!best || (run.clean && !best.clean) || (run.clean === best.clean && run.w > best.w)) best = run;
      start = -1;
    }
  }
  if (!best || best.w < 0.7 * B) return gutterFallback(ls, B, fb);
  const mid = (best.a + best.b) / 2;
  let nl = 0, nr = 0;
  for (const iv of ivs) for (const v of iv) { if (v.b <= mid) nl++; else if (v.a >= mid) nr++; }
  if (nl < 4 || nr < 4 || Math.min(nl, nr) < 0.2 * Math.max(nl, nr)) return gutterFallback(ls, B, fb);
  // real columns are made of long runs (text lines); a figure's scattered labels are not
  let wl = 0, wr = 0;
  for (const iv of ivs) for (const v of iv) { if (v.b <= mid && v.b - v.a >= 0.35 * (mid - lo)) wl++; else if (v.a >= mid && v.b - v.a >= 0.35 * (hi - mid)) wr++; }
  if (wl < 3 || wr < 3 || wl < 0.3 * nl || wr < 0.3 * nr) return gutterFallback(ls, B, fb);
  return { mid, a: best.a, b: best.b, lo, hi };
}

/**
 * Footnote markers on a page: a superscript-sized one or two digit item (smaller than the body, baseline raised) that directly
 * follows a word or sentence punctuation, when the same number also starts a footnote line lower on the page (a small digit item
 * with nothing to its left on its baseline). Conservative: years, decimals, citations and exponents after a single letter or digit
 * do not qualify; without a matching footnote body nothing is marked. Sets it._fn on the markers.
 */
function markNoteMarkers(items, B) {
  const small = items.filter(it => /^\d{1,2}$/.test(it.str.trim()) && it.h > 0 && it.h < 0.8 * B);
  if (small.length < 2) return 0;
  const bodyStart = b => !items.some(o => o !== b && o.x < b.x - 1 && o.x + o.w > b.x - 4 * B && Math.abs(o.y - b.y) < 0.5 * B);
  let n = 0;
  for (const c of small) {
    const num = c.str.trim();
    if (!small.some(b => b !== c && b.str.trim() === num && b.y < c.y - 3 * B && bodyStart(b))) continue;
    let prev = null;
    for (const o of items) {
      if (o === c || o._fn || o.h < 0.82 * B || !(o.x + o.w <= c.x + 1.5) || c.x - (o.x + o.w) > 0.35 * B || c.y - o.y < 0.2 * B || c.y - o.y > 0.9 * B) continue;
      if (!prev || o.x + o.w > prev.x + prev.w) prev = o;
    }
    if (!prev) continue;
    const t = prev.str.trimEnd();
    if (/[A-Za-z\u00c0-\u024f]{2}$/.test(t) || /[.,;:)\u201d\u2019"'\]]$/.test(t) && !/\d[.,]$/.test(t) && !/\b(?:19|20)\d\d$/.test(t.slice(0, -1))) { c._fn = 1; n++; }
  }
  return n;
}

function pageLines(page, B, fb) {
  const items = page.items.filter(it => !it.r);
  markNoteMarkers(items, B);
  if (!items.length) return { lines: [], gutter: null };
  const raw = buildLines(items, B, page.n, 'F');
  const g = detectGutter(raw, B, fb);
  let lines;
  if (!g) lines = raw;
  else {
    const F = [], Lf = [], Rf = [];
    for (const L of raw) for (const iv of intervals(L.items, B)) (iv.a <= g.mid && iv.b >= g.mid ? F : (iv.a + iv.b) / 2 < g.mid ? Lf : Rf).push(...iv.items);
    const LL = buildLines(Lf, B, page.n, 'L'), RR = buildLines(Rf, B, page.n, 'R'), FF = buildLines(F, B, page.n, 'F');
    // read band by band: full-width lines separate the column bands
    lines = [];
    const edges = FF.map(l => l.y);
    const bands = edges.length + 1;
    for (let b = 0; b < bands; b++) {
      const hiY = b === 0 ? Infinity : edges[b - 1], loY = b === edges.length ? -Infinity : edges[b];
      const inBand = l => l.y < hiY && l.y >= loY && !(b > 0 && l.y === hiY);
      if (b > 0) lines.push(FF[b - 1]);
      lines.push(...LL.filter(inBand), ...RR.filter(inBand));
    }
  }
  const stat = (arr, ext) => {
    const big = arr.filter(l => l.chars >= 15);
    const src = big.length >= 3 ? big : arr;
    return src.length ? { left: pct(src.map(l => l.x0), 0.2), right: pct(src.map(l => l.x1), 0.85) } : ext;
  };
  const all = stat(lines, { left: 0, right: page.w });
  const per = { F: g ? { left: g.lo, right: g.hi } : all, L: stat(lines.filter(l => l.col === 'L'), all), R: stat(lines.filter(l => l.col === 'R'), all) };
  for (const l of lines) { const s = per[l.col]; l.colLeft = Math.min(s.left, l.x0 > s.left + 400 ? l.x0 : s.left); l.colRight = Math.max(s.right, s.left + 1); }
  return { lines, gutter: g };
}

// ---------- per-line features -------------------------------------------------------------------------------------------------
function feat(L, B) {
  if (L._f) return L._f;
  const t = L.text;
  const longWords = (t.match(/(?<![A-Za-z_])[A-Za-z]{4,}(?![A-Za-z_(\d\u2080-\u2089])/g) ?? []).filter(w => !MATH_WORDS.has(w.toLowerCase())).length;
  const stops = (t.match(STOP) ?? []).filter(w => w.length >= 3).length;
  const words = longWords + Math.floor(stops / 2);
  let mw = 0;
  for (const ch of t) { if (MATH_STRONG.test(ch)) mw += 1; else if (MATH_WEAK.test(ch)) mw += 0.5; }
  const shortItems = L.items.filter(i => i.str.trim().length <= 2).length;
  const nSmall = L.items.filter(i => i.h < 0.85 * L.h || Math.abs(i.y - L.y) > 0.15 * L.h).length;
  // equation number: a last item "(3)" at the right edge after a clear gap, or a text "...   (3)" run
  let numItem = null;
  const last = L.items[L.items.length - 1];
  const colW = Math.max(1, L.colRight - L.colLeft);
  if (last && /^\(\s*\d{1,3}(?:\.\d{1,2})?[a-z]?\s*\)$/.test(last.str.trim()) && L.items.length >= 2) {
    const prev = L.items.filter(i => i !== last).reduce((m, i) => Math.max(m, i.x + i.w), -1e9);
    if (last.x - prev >= 1.0 * B && last.x + last.w >= L.colRight - 0.08 * colW - 0.5 * B) numItem = last;
  } else if (last && /\S\s{2,}\(\s*\d{1,3}[a-z]?\s*\)\s*$/.test(last.str) && last.x + last.w >= L.colRight - 0.08 * colW) numItem = last;
  if (!numItem && L.items.length >= 3) {   // number at the left margin (some journals)
    const first = L.items[0], second = L.items[1];
    if (/^\(\s*\d{1,3}(?:\.\d{1,2})?[a-z]?\s*\)$/.test(first.str.trim()) && first.x <= L.colLeft + 1.5 * B && second.x - (first.x + first.w) >= 1.2 * B) numItem = first;
  }
  const numOnly = /^\(\s*\d{1,3}(?:\.\d{1,2})?[a-z]?\s*\)$/.test(t) && L.x0 >= L.colRight - 0.25 * colW;
  const label = numItem ? (numItem.str.match(/\(\s*([^)\s]+)\s*\)/)?.[1] ?? null) : numOnly ? t.replace(/[()\s]/g, '') : null;
  const rest = numItem ? L.items.filter(i => i !== numItem) : L.items;
  const exX1 = Math.max(...rest.map(i => i.x + i.w)), exX0 = Math.min(...rest.map(i => i.x));
  return (L._f = { words, mw, shortItems, nSmall, numItem, numOnly, label, exX1, exX0 });
}

function eqClass(L, B) {
  const f = feat(L, B);
  if (f.numOnly) return 'num';
  const colW = L.colRight - L.colLeft; if (!(colW > 4 * B)) return null;
  if (f.words >= (f.numItem ? 4 : 3) || L.chars < 1) return null;
  const x0 = f.exX0, x1 = f.exX1, w = x1 - x0, cx = (x0 + x1) / 2, cc = (L.colLeft + L.colRight) / 2;
  const centered = Math.abs(cx - cc) <= 0.08 * colW && w <= 0.85 * colW;
  const indented = x0 - L.colLeft >= 1.8 * B && w <= 0.9 * colW;
  const flushFull = x0 <= L.colLeft + B && x1 >= L.colRight - 0.12 * colW;
  if (f.words === 0 && f.mw >= 2 && (centered || indented || f.numItem || f.mw >= 4)) return 'strong';
  if (f.words <= 2 && centered && L.chars >= 5 && /[=\u2248\u2264\u2265\u2260\u2261<>\u2208]/.test(L.text) && !/[a-z]{3,}[.,;]$/.test(L.text)) return 'strong';
  if (f.words === 0 && f.mw >= 1.5 && centered && w <= 0.5 * colW && L.chars >= 4) return 'strong';
  if (f.words <= 2 && f.mw >= (f.words === 2 ? 4 : 2) && !flushFull && (centered || indented || f.numItem)) return 'strong';
  if (f.numItem && f.words === 0 && L.chars >= 3 && !flushFull) return 'strong';
  if (f.numItem && f.words <= 3 && f.mw >= 1 && !flushFull) return 'strong';
  if (f.words <= 1 && w <= 0.7 * colW && (centered || indented) && (f.mw >= 1 || f.nSmall >= 1 || L.chars <= 10)) return 'weak';
  return null;
}

// ---------- document pass ------------------------------------------------------------------------------------------------------
function dropRunning(pageLinesList, pages) {
  const nP = pageLinesList.length; if (nP < 1) return;
  const key = l => l.text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
  const edge = (l, p) => l.y > p.h * (1 - CFG.bandFrac) || l.y < p.h * CFG.bandFrac;
  const count = new Map();
  pageLinesList.forEach((pl, i) => {
    const seen = new Set();
    for (const l of pl.lines) { if (!edge(l, pages[i])) continue; const k = key(l); if (k && !seen.has(k)) { seen.add(k); count.set(k, (count.get(k) ?? 0) + 1); } }
  });
  const need = Math.max(2, Math.ceil(0.4 * nP));
  pageLinesList.forEach((pl, i) => {
    pl.lines = pl.lines.filter(l => {
      if (!edge(l, pages[i])) return true;
      if (/^(page\s+)?[\divxlc]{1,5}(\s*(of|\/)\s*\d+)?$/i.test(l.text) && l.chars <= 8) return false;
      if (/^[-–—]\s*\d{1,4}\s*[-–—]$/.test(l.text)) return false;
      return !(nP >= 2 && (count.get(key(l)) ?? 0) >= need);
    });
  });
}

const NUMTOK = /(?:(?<![\d])[-\u2212\u2013])?\(?\d[\d,]*(?:\.\d+)?%?\)?\**/g;   // a sign belongs to the number unless a digit comes right before it (a range like 1-52)
/**
 * Items sorted by x, with an item that holds several cells split into one piece per cell. pdf.js merges tab-spaced runs into one
 * item ("4.81%    5.19%    5.51%"), and some producers glue a label to its numbers ("Performance (p. a.)1.14%  1.25%") or print
 * negative numbers back to back ("-56.53%-59.29%"). A piece's x is estimated from its character position. Prose is never split:
 * numbers are only separated from each other when nothing but spaces lies between them.
 */
function expandCells(items) {
  const out = [];
  const tightSplit = str => {   // label + numbers with nothing but spaces between the numbers
    const ms = [...str.matchAll(NUMTOK)];
    if (ms.length < 2 || !ms.every((m, k) => k === 0 || !str.slice(ms[k - 1].index + ms[k - 1][0].length, m.index).trim())) return null;
    const res = [], first = ms[0].index, last = ms[ms.length - 1], head = str.slice(0, first);
    if (head.trim()) res.push({ t: head.trim(), at: head.length - head.trimStart().length });
    ms.forEach(m => res.push({ t: m[0], at: m.index }));
    const tail = str.slice(last.index + last[0].length);
    if (tail.trim()) res.push({ t: tail.trim(), at: last.index + last[0].length + (tail.length - tail.trimStart().length) });
    return res;
  };
  const gapSplit = str => {
    const res = []; let pos = 0;
    for (const part of str.split(/(\s{2,})/)) { if (part.trim()) res.push({ t: part.trim(), at: pos + part.length - part.trimStart().length }); pos += part.length; }
    return res;
  };
  for (const it of [...items].sort((a, b) => a.x - b.x)) {
    const multi = /\S\s{2,}\S/.test(it.str);
    if (!multi && (it.str.match(NUMTOK) ?? []).length < 2) { out.push(it); continue; }
    const tight = tightSplit(it.str), ps = tight ?? (multi ? gapSplit(it.str) : null);
    if (!ps || ps.length < 2) { out.push(it); continue; }
    const k = it.w / Math.max(1, it.str.length);
    ps.forEach((p, q) => out.push({ ...it, str: p.t, x: it.x + Math.max(0, p.at) * k, w: p.t.length * k, ...(tight && q ? { brk: true } : {}) }));   // brk: a number cell of its own, whatever the estimated gap (prose with a double space is left to the gap rule)
  }
  return out;
}

const isNumCell = c => { const letters = (c.s.match(/[A-Za-z]/g) ?? []).length; return (/\d/.test(c.s) && letters <= 3 && !/\b(19|20)\d\d\b\s*[a-z]?\)?\s*$/.test(c.s)) || (c.s.length <= 14 && letters <= 3) || /^[\u2013\u2014\-\u2212]$/.test(c.s.trim()); };

/**
 * A table the strict row finder missed, anchored on its "Table N" caption: the lines right below the caption that look like table
 * rows (>= 2 cells with numbers, or short label rows) until the first normal paragraph line, kept only if at least two numeric rows
 * line up in columns (a cell edge within ~3.5 units of another row's). Returns { a, b } stream indexes or null.
 */
function looseTableRows(stream, from, B, P, owned, first = from) {
  const rowKind = L => {
    if (owned.has(L) || !L._cells) return 0;
    const c = L._cells, nc = c.filter(isNumCell).length;
    if (L.chars > 140 || (endsSentence(L.text) && L.chars > 50 && c.length < 3)) return 0;
    if (c.length >= 2 && nc >= 1 && nc >= Math.min(2, c.length - 1)) return 2;   // numeric row
    if (c.length >= 2 && L.chars <= 80) return 1;                                  // header / label row
    if (c.length === 1 && L.chars <= 40 && !endsSentence(L.text)) return 3;        // row label, panel title (one in a row at most)
    return 0;
  };
  const cap = stream[from];
  const scan = dir => {   // dir +1: rows below the caption's last line; -1: rows above its first line
    const start = dir > 0 ? from : first, nb = stream[start + dir];
    if (!nb || nb.page !== cap.page || nb.col !== cap.col || Math.abs(stream[start].y - nb.y) > 3.2 * P) return null;
    let end = start, gaps = 0, nNum = 0, nRow = 0;
    const num = [];
    for (let j = start + dir; j >= 0 && j < stream.length; j += dir) {
      const L = stream[j], prev = stream[j - dir];
      if (L.page !== cap.page || L.col !== cap.col || Math.abs(prev.y - L.y) > 2.4 * P) break;
      const k = rowKind(L);
      if (!k) break;
      if (k === 3) { if (++gaps > 1) break; continue; }
      gaps = 0; end = j; nRow++;
      if (k === 2) { nNum++; num.push(L); }
    }
    if (nNum < 2 || nRow < 3) return null;
    const beyond = stream[end + dir];   // rows that run straight into another "Table N" caption belong to that caption
    if (beyond && beyond.page === cap.page && beyond.col === cap.col && Math.abs(stream[end].y - beyond.y) <= 3.2 * P && CAP_TAB_LOOSE.test(beyond.text)) return null;
    let aligned = 0;
    for (const L of num) {
      const hit = num.some(M => M !== L && L._cells.some(x => isNumCell(x) && M._cells.some(y => isNumCell(y) && (Math.abs(x.x1 - y.x1) <= 3.5 || Math.abs(x.x0 - y.x0) <= 3.5))));
      if (hit) aligned++;
    }
    return aligned >= Math.ceil(0.6 * num.length) ? { a: Math.min(start + dir, end), b: Math.max(start + dir, end), gap: Math.abs(stream[start].y - stream[start + dir].y) } : null;
  };
  const down = scan(1), up = scan(-1);
  const pick = down && up ? (up.gap < down.gap ? up : down) : down ?? up;
  return pick ? { a: pick.a, b: pick.b } : null;
}

/** A table framed by drawn rules (top rule just under the caption, further rules below it): the lines between them. Returns { a, b } or null. */
function ruledTableRows(stream, from, rules, P, owned) {
  const cap = stream[from]; if (!rules?.length) return null;
  const colL = cap.colLeft, colR = cap.colRight, capBot = cap.bot;
  const near = rules.filter(r => r[2] < capBot + 2 && Math.min(r[1], colR + 20) - Math.max(r[0], colL - 20) >= 0.6 * Math.min(colR - colL, r[1] - r[0]) && r[1] - r[0] >= 0.5 * (colR - colL)).sort((p, q) => q[2] - p[2]);
  if (!near.length || capBot - near[0][2] > 3.2 * P) return null;
  const upper = rules.filter(r => r[2] > cap.top && r[2] - cap.top <= 3.2 * P && r[1] - r[0] >= 0.5 * (colR - colL)).map(r => r[2] - cap.top);
  if (upper.length && Math.min(...upper) < 0.6 * (capBot - near[0][2])) return null;   // a rule much closer above: the caption sits under its table
  const chain = [near[0]];
  for (const r of near.slice(1)) { const last = chain[chain.length - 1]; if (last[2] - r[2] > 280) break; if (Math.abs(r[0] - chain[0][0]) <= 15 && Math.abs(r[1] - chain[0][1]) <= 15 && last[2] - r[2] > 4) chain.push(r); }
  if (chain.length < 2) return null;
  const yBot = chain[chain.length - 1][2] - 2, x0 = chain[0][0] - 4, x1 = chain[0][1] + 4;
  let a = -1, b = -1;
  for (let j = from + 1; j < stream.length; j++) {
    const L = stream[j];
    if (L.page !== cap.page || L.top < yBot) { if (L.page !== cap.page) break; continue; }
    if (L.bot > capBot + 1 || owned.has(L) || L.x1 < x0 || L.x0 > x1) continue;
    if (a < 0) a = j; b = j;
  }
  return a >= 0 && b - a + 1 >= 2 ? { a, b } : null;
}

function markTables(stream, B, P) {
  const cellsOf = L => {
    const cells = []; let cur = null;
    for (const it of expandCells(L.items)) {
      if (cur && !it.brk && it.x - cur.x1 < CFG.cellGap * B) { cur.s += (it.x - cur.x1 > CFG.spaceGap * B ? ' ' : '') + it.str; cur.x1 = Math.max(cur.x1, it.x + it.w); }
      else { cur = { s: it.str, x0: it.x, x1: it.x + it.w }; cells.push(cur); }
    }
    return cells;
  };
  const isNum = isNumCell;
  stream.forEach(L => { const c = cellsOf(L); L._cells = c; const sg = (L.text.match(MATH_STRONG_G) ?? []).length, dg = (L.text.match(/\d/g) ?? []).length; if (sg >= 2 && dg < 0.25 * L.chars) { L._tab = 0; return; } L._tab = c.length >= 3 && c.filter(isNum).length >= Math.ceil(c.length / 2) ? 2 : c.length >= 3 && L.chars < 90 && feat(L, B).words <= 8 ? 1 : c.length === 2 && L.chars < 60 && c.filter(x => /\d/.test(x.s) && isNum(x)).length >= 1 && feat(L, B).words <= 3 ? 1 : 0; });
  const groups = [];
  for (let i = 0; i < stream.length; i++) {
    if (stream[i]._tab !== 2 || stream[i]._claimed) continue;
    let a = i, b = i, gaps = 0;
    const adj = (p, q) => stream[p].page === stream[q].page && Math.abs(stream[p].y - stream[q].y) <= 2.2 * P;
    for (let j = i - 1; j >= 0 && adj(j, j + 1); j--) { if (stream[j]._tab) { a = j; gaps = 0; } else if (stream[j].chars < 40 && ++gaps <= 1) continue; else break; }
    gaps = 0;
    for (let j = i + 1; j < stream.length && adj(j, j - 1); j++) { if (stream[j]._tab) { b = j; gaps = 0; } else if (stream[j].chars < 40 && ++gaps <= 1) continue; else break; }
    const rows = stream.slice(a, b + 1).filter(l => l._tab);
    if (rows.length < 3 || rows.filter(l => l._tab === 2).length < 2) continue;
    for (let k = a; k <= b; k++) stream[k]._claimed = 1;
    groups.push({ a, b });
    i = b;
  }
  return groups;
}

// ---------- figure graphics -------------------------------------------------------------------------------------------------------
// The page's picture regions (pages[].gfx from js/pdfGraphics.js) are matched to the "Figure N" captions: the region next to the
// caption (above it or below it, same column), plus the other regions of a multi-panel figure up to the nearest body text, plus the
// short labels around the plot (tick labels, legend), which are then not read as text. Pure; mutates the records and `owned`.
const GFX = { maxGap: 90, farGap: 240, panelGap: 130, margin: 10 };
function attachFigureGraphics(figs, pages, linesByPage, B, owned) {
  const pageOf = new Map(pages.map(p => [p.n, p]));
  const byPage = new Map();
  for (const f of figs) { const n = f.lines[0].page; if (!byPage.has(n)) byPage.set(n, []); byPage.get(n).push(f); }
  const free = l => !owned.has(l) || l._junk;
  const labelLike = l => (l.chars <= 28 || (l.chars <= 90 && /^\(?(?:panel|plot|chart|graph)\s+[A-Za-z0-9]\b|^\([a-z]\)\s/i.test(l.text))) && l.h <= 1.05 * B && !NUM_HEAD.test(l.text);
  const ovl = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
  const cands = [];
  const jobs = [];
  for (const [pn, fl] of byPage) {
    const page = pageOf.get(pn); if (!page?.gfx?.length) continue;
    const lines = linesByPage.get(pn) ?? [];
    const regs = page.gfx.map(g => {
      const r = { ...g, labels: [] }, M = GFX.margin;
      for (const l of lines) {
        if (!free(l)) continue;
        if (l.x1 < r.x0 - M || l.x0 > r.x1 + M || l.top < r.y0 - M || l.bot > r.y1 + M) continue;
        const inside = (l.top + l.bot) / 2 >= r.y0 - 2 && (l.top + l.bot) / 2 <= r.y1 + 2;
        if (l._junk || (labelLike(l) && (inside || l.chars <= 18))) r.labels.push(l);
      }
      r.ex0 = Math.min(r.x0, ...r.labels.map(l => l.x0)); r.ex1 = Math.max(r.x1, ...r.labels.map(l => l.x1));
      r.ey0 = Math.min(r.y0, ...r.labels.map(l => l.bot)); r.ey1 = Math.max(r.y1, ...r.labels.map(l => l.top));
      return r;
    });
    for (const f of fl) {
      const cl = f.lines, capTop = Math.max(...cl.map(l => l.top)), capBot = Math.min(...cl.map(l => l.bot));
      let xr;
      if (cl[0].col === 'F') xr = [Math.min(...cl.map(l => l.x0)), Math.max(...cl.map(l => l.x1))];
      else xr = [Math.min(...cl.map(l => l.colLeft)), Math.max(...cl.map(l => l.colRight))];
      jobs.push({ f, pn, lines, regs, capTop, capBot, xr, cl, allLabels: new Set(regs.flatMap(r => r.labels)) });
    }
  }
  const sameCol = (j, r) => ovl(j.xr[0], j.xr[1], r.ex0, r.ex1) >= 0.4 * Math.min(r.ex1 - r.ex0, j.xr[1] - j.xr[0]);
  // body text, or another block's lines (a caption, an equation), in the vertical gap (lo, hi) over this figure's columns
  const blocked = (j, r, lo, hi) => {
    if (hi - lo <= 1) return false;
    const x0 = Math.min(j.xr[0], r.ex0), x1 = Math.max(j.xr[1], r.ex1);
    return j.lines.some(l => !l._junk && !(free(l) && labelLike(l)) && !j.allLabels.has(l) && !j.cl.includes(l) && l.bot >= lo - 0.5 && l.top <= hi + 0.5
      && ovl(l.x0, l.x1, x0, x1) >= Math.min(40, 0.3 * (l.x1 - l.x0)) && Math.min(l.top, hi) - Math.max(l.bot, lo) >= 0.5 * (l.top - l.bot));
  };
  const votes = { above: 0, below: 0 };
  for (const j of jobs) {
    const have = new Set();
    for (const r of j.regs) {
      if (!sameCol(j, r)) continue;
      const ga = r.ey0 - j.capTop, gb = j.capBot - r.ey1;
      const reach = (r.ex1 - r.ex0) * (r.ey1 - r.ey0) >= 15000 ? GFX.farGap : GFX.maxGap;   // a big picture may sit far from its caption when nothing lies between
      if (ga >= -4 && ga <= reach && (r.ey0 + r.ey1) / 2 > j.capTop && !blocked(j, r, j.capTop, r.ey0)) { cands.push({ j, r, dir: 'above', gap: Math.max(0, ga) }); have.add('above'); }
      if (gb >= -4 && gb <= reach && (r.ey0 + r.ey1) / 2 < j.capBot && !blocked(j, r, r.ey1, j.capBot)) { cands.push({ j, r, dir: 'below', gap: Math.max(0, gb) }); have.add('below'); }
    }
    if (have.size === 1) votes[[...have][0]]++;
  }
  const dom = votes.below > votes.above ? 'below' : 'above';   // 'above' = the graphic is above its caption (caption under the figure)
  for (const c of cands) c.score = c.dir === dom ? c.gap : 1.5 * c.gap + 4;
  cands.sort((p, q) => p.score - q.score);
  const taken = new Set(), got = new Map();
  for (const c of cands) {
    if (taken.has(c.r) || got.has(c.j)) continue;
    taken.add(c.r); got.set(c.j, { dir: c.dir, regs: [c.r] });
  }
  for (const [j, g] of got) {   // the other panels of the same figure: stacked or side by side, no body text in between
    const side = r => (g.dir === 'above' ? (r.ey0 + r.ey1) / 2 > j.capTop : (r.ey0 + r.ey1) / 2 < j.capBot);
    for (let grew = true, guard = 0; grew && guard < 12; guard++) {
      grew = false;
      const U = { y0: Math.min(...g.regs.map(r => r.ey0)), y1: Math.max(...g.regs.map(r => r.ey1)) };
      for (const r of j.regs) {
        if (taken.has(r) || !sameCol(j, r) || !side(r)) continue;
        const gap = Math.max(0, r.ey0 - U.y1, U.y0 - r.ey1);
        if (gap > GFX.panelGap || blocked(j, r, Math.min(U.y1, r.ey1), Math.max(U.y0, r.ey0))) continue;
        if (g.dir === 'above' && r.ey0 < j.capTop) continue;
        if (g.dir === 'below' && r.ey1 > j.capBot) continue;
        taken.add(r); g.regs.push(r); grew = true;
      }
    }
    const rs = g.regs;
    j.f.gfx = [Math.min(...rs.map(r => r.ex0)), Math.min(...rs.map(r => r.ey0)), Math.max(...rs.map(r => r.ex1)), Math.max(...rs.map(r => r.ey1))];
    j.f.inLines = [];
    for (const r of rs) for (const l of r.labels) { l._junk = 1; owned.add(l); j.f.inLines.push(l); }
    // short unclaimed lines inside the figure box (an axis title set apart from the plot) belong to it too
    const [fx0, fy0, fx1, fy1] = j.f.gfx, capLo = Math.min(j.capBot, fy0), capHi = Math.max(j.capTop, fy1);
    for (const l of j.lines) if (free(l) && !l._junk && labelLike(l) && l.top <= capHi + 0.5 && l.bot >= capLo - 0.5 && !(l.top > j.capTop && l.bot < j.capBot) && ovl(l.x0, l.x1, fx0, fx1) > 0.5 * (l.x1 - l.x0) && !j.cl.includes(l)) { l._junk = 1; owned.add(l); j.f.inLines.push(l); }
  }
}

// Text kept beside the crop for the figure/table notes (js/libraryFigs.js), never in paragraphs, search or listening:
// table cells (rows of cells joined by '|', <= 40 rows x 12 columns) and the text absorbed inside a graphic (<= 300 chars).
const CELLS_ROWS = 40, CELLS_COLS = 12, INTEXT_MAX = 300;
function tableCells(rows) {
  const out = [];
  for (const l of rows ?? []) {
    const c = (l._cells ?? []).map(x => String(x.s ?? '').replace(/[|\s]+/g, ' ').trim()).filter(Boolean).slice(0, CELLS_COLS);
    if (c.length) out.push(c.join('|').slice(0, 240));
    if (out.length >= CELLS_ROWS) break;
  }
  return out;
}
const TICKISH = /^[-\u2212\u2013+]?\(?\d[\d,.]*%?\)?$/;
function figInText(lines) {
  const seen = new Set(), words = [], ticks = [];
  for (const l of [...(lines ?? [])].sort((a, b) => b.top - a.top || a.x0 - b.x0)) {
    const t = String(l.text ?? '').replace(/\s+/g, ' ').trim(); if (!t) continue;
    if (TICKISH.test(t)) { const v = parseFloat(t.replace(/[,%()\u2212\u2013]/g, m => (m === '\u2212' || m === '\u2013' ? '-' : '')).replace(/,/g, '')); if (Number.isFinite(v)) ticks.push({ v, t }); continue; }
    if (/^[^A-Za-z0-9]*$/.test(t) || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase()); words.push(t);
  }
  if (ticks.length >= 2) { const lo = ticks.reduce((a, b) => (b.v < a.v ? b : a)), hi = ticks.reduce((a, b) => (b.v > a.v ? b : a)); if (lo.t !== hi.t) words.push(`ticks ${lo.t} to ${hi.t}`); }
  return words.join(' | ').slice(0, INTEXT_MAX);
}
const PAD = 3.5;   // crop padding in PDF units around equation and table boxes
const CAP_FIG = /^(figure|fig\.)\s*(\d+|[IVX]+)\s*[:.—–|-]/i;
const CAP_TAB = /^(table|tab\.)\s*(\d+|[IVX]+)\s*[:.—–|-]/i;
const CAP_TAB_LOOSE = /^(table|tab\.)\s*(\d+|[IVX]+)\b/i;

function capLines(stream, i, B, P) {
  // caption continues while lines follow at normal spacing in the same column
  const out = [i];
  for (let j = i + 1; j < stream.length && out.length < 12; j++) {
    const a = stream[j - 1], b = stream[j];
    if (b.page !== a.page || b.col !== a.col || a.y - b.y > 1.4 * P || b._claimed || b._tab >= 1 || Math.abs(b.h - a.h) > 0.1 * B) break;
    if (/^(figure|fig\.|table|tab\.)\s*\d+/i.test(b.text) || endsSentence(a.text) && a.x1 < a.colRight - 0.2 * (a.colRight - a.colLeft)) break;
    out.push(j);
  }
  return out;
}

function headingLevel(L, ctx) {
  const { B, bodyFont, P } = ctx, t = L.text;
  if (L.chars < 2 || t.length > 120 || L._claimed) return 0;
  const colW = Math.max(1, L.colRight - L.colLeft);
  const f = feat(L, B);
  if (f.label) return 0;
  const bare = t.replace(/^(?:\d{1,2}(?:\.\d{1,2}){0,3}\.?|[IVX]{1,5}\.|[A-Z]\.?)\s+/, '').replace(/[.:]+$/, '').trim();
  const wordsN = t.split(/\s+/).length, caps = t.replace(/[^A-Za-z]/g, ''), allCaps = caps.length >= 4 && caps === caps.toUpperCase() && wordsN <= 10;
  const short = L.x1 - L.x0 <= 0.9 * colW;
  const apart = (L.font && L.font !== bodyFont) || (ctx.gapAbove(L) >= 1.3 * P && ctx.gapBelow(L) >= 1.1 * P);
  if (ctx.inRefs) return APPX_HEAD.test(t) && short ? 2 : 0;
  const aligned = Math.abs(L.x0 - L.colLeft) <= 2.5 * B || Math.abs((L.x0 + L.x1) / 2 - (L.colLeft + L.colRight) / 2) <= 0.1 * colW;
  if (ctx.front && L.page === ctx.firstPage && L.idx < ctx.front && !KNOWN_HEADS.test(bare) && !NUM_HEAD.test(t)) return 0;
  const nx = ctx.next(L), prose = (nx && nx.chars >= 25 && Math.abs(nx.h - B) <= 0.12 * B) || (nx && (NUM_HEAD.test(nx.text) || KNOWN_HEADS.test(nx.text.replace(/^(?:\d{1,2}(?:\.\d{1,2}){0,3}\.?|[IVX]{1,5}\.)\s+/, '').trim())));
  if (L.h >= CFG.headRatio * B && wordsN <= 16 && !/[.,;]$/.test(t) && short && aligned && f.mw < 3 && (prose || NUM_HEAD.test(t) || KNOWN_HEADS.test(bare))) return 2;
  if (KNOWN_HEADS.test(bare) && short && wordsN <= 8 && (apart || allCaps || NUM_HEAD.test(t) || L.h > 1.03 * B)) return 2;
  if (NUM_HEAD.test(t) && f.mw < 2 && short && t.length <= 90 && wordsN <= 12 && !/[.,;]$/.test(t) && !/^[A-Z]\.?\s/.test(t.replace(/^(\d)/, 'x')) && (apart || allCaps || L.h > 1.03 * B)) return 2;
  if (/^[A-Z]\s+[A-Z]/.test(t) && !/^[A-Z]\s+(The|A|An|In|On|Of)\b/.test(t) && short && t.length <= 60 && wordsN <= 7 && !/[.,;]$/.test(t) && L.font !== bodyFont && ctx.inAppendix) return 2;
  if (allCaps && caps.length >= 4 && t.length <= 70 && short && f.mw < 2 && !(L.page === 1 && !KNOWN_HEADS.test(bare)) && apart) return 2;
  return 0;
}

const BULLET = /^(?:[\u2022\u25e6\u25aa\u2023\u2219\u25cf]|[-\u2013]\s|\(?\d{1,2}[.)]\s|\([a-z]\)\s)/;
const cleanText = t => stripStamps(t).replace(/\s+/g, ' ').replace(/ ([\u0300-\u036f])/g, '$1').replace(/([\u0300-\u036f])\u0131/g, '$1i').normalize('NFC').trim();
const joinLines = arr => {
  let s = '';
  for (const l of arr) {
    const t = l.text; if (!s) { s = t; continue; }
    if (/[A-Za-zÀ-ɏ]{2}[-‐­]$/.test(s) && /^[a-zß-ÿ]/.test(t)) s = s.slice(0, -1) + t;
    else s += ' ' + t;
  }
  return cleanText(s);
};

function unionBox(lines, pad = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of lines) for (const it of l.items) { const b = boxOf(it); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
  if (!Number.isFinite(x0)) return null;
  return [r1(x0 - pad), r1(y0 - pad), r1(x1 + pad), r1(y1 + pad)];
}

/** Box of an equation/table group: union of item boxes, padded, clamped to the midline of the gap to neighbouring prose. */
function paddedBox(lines, pageLinesAll, B, pad, xPad = pad) {
  const u = unionBox(lines); if (!u) return null;
  let [x0, y0, x1, y1] = u;
  const mine = new Set(lines);
  let nearAbove = Infinity, nearBelow = -Infinity;
  for (const l of pageLinesAll) {
    if (mine.has(l) || l.x1 < x0 - 2 || l.x0 > x1 + 2) continue;
    if (l.bot >= y1 - 0.5) nearAbove = Math.min(nearAbove, l.bot);
    else if (l.top <= y0 + 0.5) nearBelow = Math.max(nearBelow, l.top);
  }
  const ny1 = nearAbove === Infinity ? y1 + pad : nearAbove > y1 ? Math.min(y1 + pad, (y1 + nearAbove) / 2) : y1;
  const ny0 = nearBelow === -Infinity ? y0 - pad : nearBelow < y0 ? Math.max(y0 - pad, (y0 + nearBelow) / 2) : y0;
  return [r1(Math.max(0, x0 - xPad)), r1(ny0), r1(x1 + xPad), r1(ny1)];
}

/** A table box grown to the drawn rules that frame it (top, header and bottom rules, and the full width of the table): rules within ~8 units above/below the box and over at least half of its width. */
function withRules(box, rules, size) {
  if (!box || !rules.length) return box;
  let [x0, y0, x1, y1] = box; const w = x1 - x0, Y0 = y0, Y1 = y1;
  for (const r of rules) {
    if (r[2] < Y0 - 8 || r[2] > Y1 + 2 || r[1] - r[0] > 1.6 * w + 20) continue;
    if (Math.min(r[1], x1) - Math.max(r[0], x0) < 0.5 * Math.min(w, r[1] - r[0])) continue;
    x0 = Math.min(x0, r[0] - 1.5); x1 = Math.max(x1, r[1] + 1.5);
    if (r[2] < Y0) y0 = Math.min(y0, r[2] - 1.5); else if (r[2] > Y1) y1 = Math.max(y1, r[2] + 1.5);
  }
  return [r1(Math.max(0, x0)), r1(Math.max(0, y0)), r1(Math.min(size?.[0] ?? Infinity, x1)), r1(Math.min(size?.[1] ?? Infinity, y1))];
}

/**
 * The raw geometry of an equation block, for the LaTeX reconstruction (js/mathLatex.js): every positioned text item of its lines
 * ([str, x, y, w, h, fontIndex], PDF units) plus the drawn horizontal rules next to it ([x0, x1, y, thickness]); fonts are indexed.
 */
function eqSource(lines, rules, B) {
  const fonts = [], its = [];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const l of lines) for (const it of l.items) {
    if (it.r) continue;
    let f = fonts.indexOf(it.font); if (f < 0) { f = fonts.length; fonts.push(it.font); }
    its.push([it.str, r1(it.x), r1(it.y), r1(it.w), r1(it.h), f]);
    x0 = Math.min(x0, it.x); x1 = Math.max(x1, it.x + it.w); y0 = Math.min(y0, it.y - 0.3 * it.h); y1 = Math.max(y1, it.y + 0.9 * it.h);
  }
  if (!its.length || its.length > 400) return null;
  const rs = rules.filter(r => r[1] >= x0 - B && r[0] <= x1 + B && r[2] >= y0 - 0.5 * B && r[2] <= y1 + 0.5 * B).slice(0, 40).map(r => [r1(r[0]), r1(r[1]), Math.round(r[2] * 100) / 100, Math.round((r[3] ?? 0.5) * 100) / 100]);
  return { it: its, fonts, ...(rs.length ? { rules: rs } : {}) };
}

// ---------- main ------------------------------------------------------------------------------------------------------------------
function build(input) {
  const pages = normalizePages(input);
  const empty = { blocks: [], pageSize: {} };
  if (!pages.length) return empty;
  let { B, bodyFont } = bodyStats(pages);
  B = fixHeights(pages, B);
  const pageSize = {}; for (const p of pages) pageSize[p.n] = [r1(p.w), r1(p.h)];
  const rulesByPage = new Map(pages.map(p => [p.n, p.rules ?? []]));

  let perPage = [];
  const first = pages.map(p => { try { return pageLines(p, B); } catch { return { lines: [], gutter: null }; } });
  const gs = first.map(r => r.gutter).filter(Boolean).sort((a, b) => a.mid - b.mid);
  const docG = gs.length >= 1 && gs.length >= 0.3 * pages.length ? gs[gs.length >> 1] : null;
  pages.forEach((p, k) => { try { perPage.push(first[k].gutter || !docG ? first[k].lines : pageLines(p, B, docG).lines); } catch { perPage.push([]); } });
  const pl = perPage.map(lines => ({ lines }));
  dropRunning(pl, pages);
  for (const x of pl) x.lines = x.lines.filter(l => !isStampLine(l.text));   // arXiv / SSRN margin stamps, download lines, bare URLs
  perPage = pl.map(x => x.lines);
  const stream = perPage.flat();
  if (!stream.length) return empty;
  const pageLinesMap = new Map(); for (const l of stream) { if (!pageLinesMap.has(l.page)) pageLinesMap.set(l.page, []); pageLinesMap.get(l.page).push(l); }

  // line pitch (baseline to baseline within a column)
  const dys = [];
  for (let k = 1; k < stream.length; k++) { const a = stream[k - 1], b = stream[k]; if (a.page === b.page && a.col === b.col && Math.abs(a.h - B) < 0.12 * B && Math.abs(b.h - B) < 0.12 * B) { const d = a.y - b.y; if (d > 0.9 * B && d < 2.0 * B) dys.push(d); } }
  const P = median(dys) || 1.2 * B;
  const idx = new Map(stream.map((l, k) => [l, k]));
  const gapAbove = l => { const k = idx.get(l); const a = stream[k - 1]; return a && a.page === l.page && a.col === l.col ? a.y - l.y : 99 * P; };
  const gapBelow = l => { const k = idx.get(l); const b = stream[k + 1]; return b && b.page === l.page && b.col === l.col ? l.y - b.y : 99 * P; };
  stream.forEach((l, k) => { l.idx = k; });
  const firstPage = stream[0].page;
  const frontK = stream.findIndex(l => l.page === firstPage && l.chars <= 40 && /^(abstract|summary|(\d+\.?|[IVX]+\.?)?\s*introduction)\.?$/i.test(l.text.replace(/^(?:\d{1,2}\.?|[IVX]{1,4}\.)\s+/, '').trim()));
  const ctx = { B, bodyFont, P, gapAbove, gapBelow, next: l => stream[l.idx + 1], inRefs: false, inAppendix: false, front: frontK > 0 ? frontK : 0, firstPage };

  const claims = new Map();   // every claimed line -> { kind, lines:[...] in reading order, ... }
  const owned = new Set();
  // 0. text in unmapped fonts (chart labels come out as punctuation soup): dropped
  for (const l of stream) {
    if (l.chars < 10) continue;
    const letters = (l.text.match(/[A-Za-z]/g) ?? []).length, sym = (l.text.match(/[<>?@#$%&*!"|^~]/g) ?? []).length, strong = (l.text.match(MATH_STRONG_G) ?? []).length;
    const digits = (l.text.match(/\d/g) ?? []).length;   // a row of percentages is numbers, not font soup
    if (letters / l.chars < 0.4 && sym >= 4 && strong < 2 && digits < 0.25 * l.chars) { l._junk = 1; owned.add(l); }
  }
  // 1. tables and captions
  const tabGroups = markTables(stream, B, P);
  const take = (lines, rec) => { const ls = [...new Set(lines)].sort((a, b) => idx.get(a) - idx.get(b)); const r = { ...rec, lines: ls }; for (const l of ls) { owned.add(l); claims.set(l, r); } };
  for (let k = 0; k < stream.length; k++) {
    const L = stream[k]; if (owned.has(L)) continue;
    const isFig = CAP_FIG.test(L.text) && L.h <= 1.1 * B, isTab = CAP_TAB.test(L.text) && L.h <= 1.1 * B;
    const tabNear = tabGroups.find(g => (g.a - k >= 1 && g.a - k <= 3) || (k - g.b >= 1 && k - g.b <= 3));
    if (isFig || isTab || (CAP_TAB_LOOSE.test(L.text) && tabNear && L.chars < 160)) {
      const ci = capLines(stream, k, B, P), cap = ci.map(j => stream[j]);
      const m = L.text.match(/^(figure|fig\.|table|tab\.)\s*(\d+|[IVX]+)/i);
      const isT = /^t/i.test(m?.[1] ?? '');
      const label = m ? `${isT ? 'Table' : 'Figure'} ${m[2]}` : undefined;
      if (isT) {
        const g = tabGroups.find(gr => (gr.a > ci[ci.length - 1] && gr.a - ci[ci.length - 1] <= 3 && !gr._cap) || (gr.b < k && k - gr.b <= 3 && !gr._cap));
        if (g) {
          g._cap = true;
          const rows = stream.slice(g.a, g.b + 1);
          const all = [...cap, ...rows].sort((p, q) => stream.indexOf(p) - stream.indexOf(q));
          take(all.filter(l => !owned.has(l)), { kind: 'table', caption: joinLines(cap), rows, label });
          continue;
        }
        const lr = looseTableRows(stream, ci[ci.length - 1], B, P, owned, ci[0]) ?? ruledTableRows(stream, ci[ci.length - 1], rulesByPage.get(L.page) ?? [], P, owned);
        if (lr && !/^(?:table|tab\.)\s*\d+\.\d+\s+[a-z]/i.test(L.text)) {   // not a sentence that starts with a section-style number ("Table 3.1 shows ...")
          const rows = stream.slice(lr.a, lr.b + 1).filter(l => !owned.has(l));
          take([...cap, ...rows], { kind: 'table', caption: joinLines(cap), rows, label });
          k = Math.max(k, lr.b);
          continue;
        }
      }
      take(cap, { kind: 'fig', label, caption: joinLines(cap) });
      k = ci[ci.length - 1];
    }
  }
  for (const g of tabGroups) {
    if (g._cap) continue;
    const rows = stream.slice(g.a, g.b + 1).filter(l => !owned.has(l));
    if (rows.length >= 4 && rows.filter(l => l._tab === 2).length >= 3) take(rows, { kind: 'table', caption: '', rows });
  }

  try { attachFigureGraphics([...new Set([...claims.values()].filter(c => c.kind === 'fig'))], pages, pageLinesMap, B, owned); } catch { /* captions only */ }

  // 2. headings (title, sections), then equations
  const heads = new Map();
  const p1 = stream.filter(l => l.page === pages[0].n && !owned.has(l) && l.chars >= 4);
  const maxH = Math.max(0, ...p1.slice(0, 40).map(l => l.h));
  if (maxH >= CFG.titleRatio * B) {
    const first = stream.findIndex(l => !owned.has(l) && l.page === pages[0].n && l.h >= maxH * 0.94 && l.chars >= 4);
    if (first >= 0) {
      let last = first;
      while (last + 1 < stream.length && stream[last + 1].page === stream[first].page && Math.abs(stream[last + 1].h - stream[first].h) <= 0.06 * maxH && stream[last].y - stream[last + 1].y <= 2.2 * stream[first].h && !owned.has(stream[last + 1])) last++;
      heads.set(stream[first], { level: 1, lines: stream.slice(first, last + 1) });
      for (const l of stream.slice(first, last + 1)) owned.add(l);
    }
  }
  let inRefs = false;
  for (let k = 0; k < stream.length; k++) {
    const L = stream[k]; if (owned.has(L)) continue;
    ctx.inRefs = inRefs;
    const lvl = headingLevel(L, ctx);
    if (!lvl) continue;
    const lines = [L];
    while (k + 1 < stream.length && lines.length < 3) {   // a heading that wraps
      const n = stream[k + 1];
      if (owned.has(n) || n.page !== L.page || n.col !== L.col || Math.abs(n.h - L.h) > 0.04 * B || n.font !== L.font || L.y - n.y > 1.5 * L.h || /[.:]$/.test(lines[lines.length - 1].text) || n.chars > 70 || L.h < CFG.headRatio * B) break;
      lines.push(n); k++;
    }
    for (const l of lines) owned.add(l);
    heads.set(lines[0], { level: lvl, lines });
    const bare = joinLines(lines).replace(/^(?:\d{1,2}(?:\.\d{1,2}){0,3}\.?|[IVX]{1,5}\.|[A-Z]\.?)\s+/, '').replace(/[.:]+$/, '').trim();
    if (REFS_HEAD.test(bare)) inRefs = true; else if (APPX_HEAD.test(joinLines(lines))) { inRefs = false; ctx.inAppendix = true; }
  }

  // 3. equations
  const cls = stream.map(l => (owned.has(l) || (ctx.front && l.page === firstPage && l.idx < ctx.front) ? null : eqClass(l, B)));
  const near = (a, b, d) => a.page === b.page && Math.abs(a.y - b.y) <= d && (a.col === b.col || a.col === 'F' || b.col === 'F');
  const xOverlap = (g, l) => { const x0 = Math.min(...g.map(q => q.x0)), x1 = Math.max(...g.map(q => feat(q, B).exX1)); return l.x1 >= x0 - 1.5 * B && l.x0 <= x1 + 1.5 * B; };
  const groups = [];
  // true when the run of tight, unnumbered strong lines starting at k is closed by a numbered strong line (number-on-last-line layout)
  const numberedBelow = k0 => {
    for (let j = k0; j < stream.length; j++) {
      if (!cls[j]) return false;   // prose ends the chain; fraction rows and limits ('weak') are part of it
      if (j > k0 && !near(stream[j - 1], stream[j], 2.0 * B + 0.4 * P)) return false;
      if (cls[j] === 'num' || feat(stream[j], B).numItem) return true;
    }
    return false;
  };
  for (let k = 0; k < stream.length; k++) {   // consecutive strong lines form one equation, a numbered line closes it
    if (cls[k] !== 'strong') continue;
    const prev = groups[groups.length - 1], pl = prev && prev[prev.length - 1];
    const cur0 = stream[k], fk = feat(cur0, B);
    // a denominator or limit sitting right under a numbered line still belongs to it: narrow, unnumbered, inside its extent, one row below
    const tail = pl && feat(pl, B).numItem && !fk.numItem && Math.min(...prev.map(q => q.y)) - cur0.y <= 1.7 * B && near(pl, cur0, 2.0 * B + 0.4 * P)
      && cur0.x0 >= Math.min(...prev.map(q => feat(q, B).exX0)) - B && cur0.x1 <= Math.max(...prev.map(q => feat(q, B).exX1)) + B && (cur0.x1 - cur0.x0) <= 0.7 * (Math.max(...prev.map(q => feat(q, B).exX1)) - Math.min(...prev.map(q => feat(q, B).exX0)));
    // a system numbered on its first line, "(2.1)" beside line 1 of 3: the unnumbered lines right below belong to it unless the chain ends in a number of its own
    const sysTail = pl && feat(pl, B).numItem && !fk.numItem && near(pl, cur0, 2.0 * B + 0.4 * P) && xOverlap(prev, cur0) && !numberedBelow(k);
    if (pl && ((!feat(pl, B).numItem && near(pl, cur0, 2.0 * B + 0.4 * P) && xOverlap(prev, cur0)) || tail || sysTail)) prev.push(cur0); else groups.push([cur0]);
  }
  for (let k = 0; k < stream.length; k++) {   // fraction rows, limits and detached numbers go to the nearest equation
    if (cls[k] !== 'weak' && cls[k] !== 'num') continue;
    let best = null, bd = Infinity;
    for (const g of groups) for (const q of g) { const d = Math.abs(q.y - stream[k].y); if (d < bd && near(q, stream[k], 2.0 * B + 0.4 * P) && xOverlap(g, stream[k])) { bd = d; best = g; } }
    if (best && !(cls[k] === 'weak' && best.some(q => q === stream[k]))) best.push(stream[k]);
  }
  for (const g of groups) {
    const lines = g.sort((x, y) => idx.get(x) - idx.get(y));
    const label = lines.map(l => feat(l, B).label).find(Boolean);
    take(lines, { kind: 'eq', label: label ?? undefined });
  }

  // 4. walk the stream and assemble blocks
  const blocks = [], deferred = [];
  const push = (type, text, page, bbox, label) => { const b = { i: blocks.length, type, text, page, bbox: bbox ?? null }; if (label) b.label = label; blocks.push(b); return b; };
  let cur = [];
  const flushDeferred = () => { while (deferred.length) deferred.shift()(); };
  const flushPara = () => {
    if (cur.length) {
      const first = cur[0], onFirst = cur.filter(l => l.page === first.page);
      const text = joinLines(cur);
      if (text.length >= 2) push('p', text, first.page, unionBox(onFirst));
      cur = [];
    }
    flushDeferred();
  };
  const continues = (a, b) => {
    const colW = Math.max(1, a.colRight - a.colLeft);
    if (Math.abs(a.h - b.h) > 0.1 * B || a.font !== b.font && Math.abs(a.h - b.h) > 0.05 * B) return false;
    if (a.page !== b.page || a.col !== b.col) {
      if (b.x0 - Math.min(a.x0, b.colLeft + 0.5 * B) >= 0.8 * B && b.x0 - b.colLeft <= 4 * B) return false;
      return a.x1 >= a.colRight - 0.2 * colW && (!endsSentence(a.text) || /^[a-z]/.test(b.text));
    }
    const dy = a.y - b.y, ind = b.x0 - a.x0;
    if (dy > CFG.pitchBreak * P || dy < -0.5 * B) return false;
    if (BULLET.test(b.text)) return false;
    if (!BULLET.test(a.text) && ind >= 0.8 * B && ind <= 4 * B && a.x1 >= a.colRight - 0.18 * colW) return false;
    if (a.x1 < a.colRight - 0.18 * colW && endsSentence(a.text)) return false;
    if (a.x1 < a.colRight - 0.45 * colW) return false;
    return true;
  };
  let refs = null, junkRun = [];
  const flushRefs = () => { if (!refs) return; const rl = refs.lines, parts = []; for (const l of rl) { const prev = parts.length ? rl[rl.indexOf(l) - 1] : null; if (!parts.length || /^\[\d+\]|^\d{1,3}\.\s+[A-Z]/.test(l.text) || (prev && endsSentence(prev.text) && prev.x1 < prev.colRight - 0.1 * (prev.colRight - prev.colLeft) && /^[A-Z]/.test(l.text))) parts.push(l.text); else { const s = parts[parts.length - 1]; parts[parts.length - 1] = /[A-Za-z]{2}-$/.test(s) && /^[a-z]/.test(l.text) ? s.slice(0, -1) + l.text : s + ' ' + l.text; } } push('refs', parts.join('\n'), rl[0].page, null); refs = null; };
  const flushJunk = () => { if (junkRun.length >= 6 && junkRun.filter(l => l.chars <= 14).length >= 0.8 * junkRun.length) junkRun.forEach(l => { l._junk = 1; }); junkRun = []; };
  // pre-mark junk (figure labels): runs of very short unclaimed lines
  for (const l of stream) { if (owned.has(l) || l.chars > 14 || l.h < 0.6 * B) { flushJunk(); continue; } junkRun.push(l); }
  flushJunk();

  const emitClaim = (cl, L) => {
    if (cl.kind === 'eq') { const eb = push('eq', cl.lines.map(l => l.text).join(' '), L.page, paddedBox(cl.lines, pageLinesMap.get(L.page) ?? [], B, PAD, PAD), cl.label); const sr = eqSource(cl.lines, rulesByPage.get(L.page) ?? [], B); if (sr) eb.src = sr; }
    else if (cl.kind === 'table') { const tb = push('table', cl.caption || cl.rows.map(l => l._cells.map(c => c.s).join(' | ')).join('\n').slice(0, 600), L.page, withRules(paddedBox(cl.lines, pageLinesMap.get(L.page) ?? [], B, PAD, PAD), rulesByPage.get(L.page) ?? [], pageSize[L.page]), cl.label); const cells = tableCells(cl.rows); if (cells.length) tb.cells = cells; }
    else {
      let bx = unionBox(cl.lines, 1.5), gfx = false;
      if (cl.gfx && bx) { const sz = pageSize[L.page]; bx = [r1(Math.max(0, Math.min(bx[0], cl.gfx[0] - PAD))), r1(Math.max(0, Math.min(bx[1], cl.gfx[1] - PAD))), r1(Math.min(sz[0], Math.max(bx[2], cl.gfx[2] + PAD))), r1(Math.min(sz[1], Math.max(bx[3], cl.gfx[3] + PAD)))]; gfx = true; }
      const fb = push('fig', cl.caption, L.page, bx, cl.label); if (gfx) fb.gfx = true;
      const it = figInText(cl.inLines); if (it) fb.inText = it;
    }
  };
  const noteLines = [];
  for (let k = 0; k < stream.length; k++) {
    const L = stream[k];
    if (refs) {
      const hd = heads.get(L);
      if (hd && APPX_HEAD.test(joinLines(hd.lines))) { flushRefs(); }
      else {
        const rc = claims.get(L);
        if (rc && rc.kind !== 'eq') { if (rc.lines[0] === L) emitClaim(rc, L); continue; }   // figures and tables set after the references (end-of-paper exhibits)
        if (!L._junk) refs.lines.push(L);
        continue;
      }
    }
    const hd = heads.get(L);
    if (hd) {
      flushPara();
      const text = joinLines(hd.lines);
      push(hd.level === 1 ? 'h1' : 'h2', text, L.page, unionBox(hd.lines));
      const bare = text.replace(/^(?:\d{1,2}(?:\.\d{1,2}){0,3}\.?|[IVX]{1,5}\.|[A-Z]\.?)\s+/, '').replace(/[.:]+$/, '').trim();
      if (REFS_HEAD.test(bare)) refs = { lines: [] };
      k += hd.lines.length - 1;
      continue;
    }
    const cl = claims.get(L);
    if (cl) {
      if (cl.lines[0] !== L) continue;
      const emit = () => emitClaim(cl, L);
      if (cl.kind === 'eq') { flushPara(); emit(); } else if (cur.length) deferred.push(emit); else emit();
      continue;
    }
    if (L._junk) continue;
    if (L.chars <= 8 && !/[A-Za-z]{3}/.test(L.text) && L.items.every(i => i.h < 0.9 * B || /^[\d\s=+\-\u2212,.()]+$/.test(i.str))) continue;   // stray limits / fraction rows
    if (L.h < 0.93 * B && L.chars >= 6) {   // footnote-size text: out of the flow
      noteLines.push(L);
      const nxt = stream[k + 1];
      const closing = !(nxt && nxt.h < 0.93 * B && nxt.chars >= 6 && nxt.page === L.page && Math.abs(L.y - nxt.y) <= 1.6 * P && !claims.has(nxt) && !heads.has(nxt));
      if (closing) { const nl = noteLines.splice(0); const text = joinLines(nl); if (text.length >= 6) { const pg = nl[0].page, bx = unionBox(nl), foot = /^(?:\d{1,2}|[*\u2020\u2021\u00a7\u00b6])\s*\S/.test(text) && nl[0].y < 0.45 * (pageSize[pg]?.[1] ?? 792); deferred.push(() => { const fb = push('p', text, pg, bx); if (foot) fb.foot = true; }); if (!cur.length) flushDeferred(); } }
      continue;
    }
    // run-in "Abstract. text" / "Abstract— text"
    const ab = L.text.match(/^(abstract|summary)\s*[.:—–-]+\s*(\S.*)$/i);
    if (ab && ab[2].length > 20 && !cur.length) { push('h2', ab[1][0].toUpperCase() + ab[1].slice(1).toLowerCase(), L.page, null); L.text = ab[2]; }
    if (cur.length && !continues(cur[cur.length - 1], L)) flushPara();
    cur.push(L);
  }
  flushRefs(); flushPara();
  // two equation/table crops never cover the same lines: where neighbouring boxes overlap vertically, the shared edge goes to the middle of the overlap
  const boxed = blocks.filter(b => (b.type === 'eq' || b.type === 'table') && b.bbox);
  for (let a = 0; a < boxed.length; a++) for (let c = a + 1; c < boxed.length; c++) {
    const A = boxed[a], C = boxed[c]; if (A.page !== C.page) continue;
    const [up, dn] = A.bbox[3] >= C.bbox[3] ? [A, C] : [C, A];
    if (Math.min(up.bbox[2], dn.bbox[2]) <= Math.max(up.bbox[0], dn.bbox[0]) || up.bbox[1] >= dn.bbox[3]) continue;
    const mid = r1((up.bbox[1] + dn.bbox[3]) / 2); up.bbox[1] = mid; dn.bbox[3] = mid;
  }
  for (let q = 0; q < blocks.length; q++) blocks[q].i = q;
  return { blocks, pageSize };
}

/** Build reading blocks from positioned pages. Never throws; returns { blocks:[], pageSize:{} } on odd input. */
export function buildBlocks(pages) {
  try { return build(pages); } catch { return { blocks: [], pageSize: {} }; }
}

/** Search text: headings and paragraphs only (no equations, tables, figure captions, references). */
export function plainText(blocks) {
  try { return (Array.isArray(blocks) ? blocks : []).filter(b => b && (b.type === 'p' || b.type === 'h1' || b.type === 'h2') && typeof b.text === 'string').map(b => b.text).join('\n\n'); } catch { return ''; }
}

const bareHead = t => String(t ?? '').replace(/^(?:\d{1,2}(?:\.\d{1,2}){0,3}\.?|[IVX]{1,5}\.)\s*/, '').trim();

/** The paragraphs (strings) under a "Conclusion(s)" / "Concluding remarks" heading, up to the next heading. */
export function conclusion(blocks) {
  try {
    const bs = Array.isArray(blocks) ? blocks : [];
    const k = bs.findIndex(b => b && (b.type === 'h1' || b.type === 'h2') && CONC_HEAD.test(String(b.text ?? '').trim()));
    if (k < 0) return [];
    const out = [];
    for (let j = k + 1; j < bs.length; j++) { const b = bs[j]; if (b.type === 'h1' || b.type === 'h2' || b.type === 'refs') break; if (b.type === 'p') out.push(b.text); }
    return out;
  } catch { return []; }
}

/** The abstract: the paragraph(s) under an "Abstract" heading; else the first long paragraph on page 1; '' if none. */
export function abstractOf(blocks) {
  try {
    const bs = Array.isArray(blocks) ? blocks : [];
    const k = bs.findIndex(b => b && (b.type === 'h1' || b.type === 'h2') && ABSTRACT_HEAD.test(bareHead(b.text)));
    if (k >= 0) {
      const out = [];
      for (let j = k + 1; j < bs.length; j++) { const b = bs[j]; if (b.type === 'h1' || b.type === 'h2' || b.type === 'refs') break; if (b.type === 'p') out.push(b.text); }
      if (out.length) return out.join('\n\n');
    }
    const first = bs.find(b => b && b.type === 'p' && b.page === (bs[0]?.page ?? 1) && b.text.length >= 300);
    return first ? first.text : '';
  } catch { return ''; }
}
