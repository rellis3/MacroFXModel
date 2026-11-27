// js/terminal/helixLayout.js: lays out Helix's canvas labels by their MEASURED width, not by fixed pixel offsets.
// Why: the broadcast raises every canvas font below a floor (root.dataset.fontFloor, 15px) so the labels can be read on a phone. A view that wrote
// "label at x, value at x + 60" or "next row 15px down" then drew text over text. These helpers take the real font size (read back from ctx.font, which
// already carries the floor) and a measure(text) -> width function, so a row, a column or a box grows with its text.
// Pure: no DOM, no canvas. measure is injected (in a view: t => ctx.measureText(t).width), so everything here is unit-tested in helixLayout.test.mjs.
// Per-frame use: slotCache() memoises a computed layout per slot and recomputes only when its font or text changes, so a steady frame allocates nothing new.

/** The pixel size in a canvas font string ('600 13px ui-monospace,monospace' -> 13). Falls back to `fb` when there is none. */
export function fontPx(font, fb = 10) {
  const m = /(\d+(?:\.\d+)?)px/.exec(String(font ?? ''));
  return m ? +m[1] : fb;
}

/** The line height for a font size: k times the size, rounded up (1.35 suits the HUD's monospace). */
export const lineHeight = (px, k = 1.35) => Math.ceil((+px > 0 ? +px : 10) * k);

/** The text cut to fit maxW, with an ellipsis; the whole text when it fits. Binary search on the length, so it costs log(n) measures. */
export function fitText(text, measure, maxW, ell = '…') {
  const t = String(text ?? '');
  if (!(maxW > 0)) return '';
  if (measure(t) <= maxW) return t;
  if (measure(ell) > maxW) return '';
  let lo = 0, hi = t.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (measure(t.slice(0, mid) + ell) <= maxW) lo = mid; else hi = mid - 1; }
  return t.slice(0, lo).trimEnd() + ell;
}

/**
 * Labels in a row, each placed after the last by its measured width plus a gap; a label that would pass x0 + maxW wraps to a new row (lh px down).
 * A single label wider than maxW on its own is cut with fitText. Returns { items: [{ text, x, y, w }], w (widest row), h (rows * lh), rows }.
 */
export function rowLayout(labels, measure, { x0 = 0, y0 = 0, gap = 12, maxW = Infinity, lh = 14 } = {}) {
  const items = []; let x = x0, row = 0, widest = 0;
  for (const raw of labels ?? []) {
    let text = String(raw ?? ''), w = measure(text);
    if (w > maxW) { text = fitText(text, measure, maxW); w = measure(text); }
    if (x > x0 && x - x0 + w > maxW) { row++; x = x0; }
    items.push({ text, x, y: y0 + row * lh, w });
    widest = Math.max(widest, x - x0 + w); x += w + gap;
  }
  return { items, w: widest, h: (items.length ? row + 1 : 0) * lh, rows: items.length ? row + 1 : 0 };
}

/**
 * A grid of cells (rows of strings) laid out in columns as wide as their widest cell. Returns { xs (each column's left x), rowY(i), w, h }.
 * Used for two-up readouts ("▲ GOLD 2.1x   ▲ NQ 1.8x") that used to step a fixed 150px.
 */
export function gridLayout(rows, measure, { x0 = 0, y0 = 0, gap = 18, lh = 14 } = {}) {
  const widths = [];
  for (const r of rows ?? []) (r ?? []).forEach((c, j) => { widths[j] = Math.max(widths[j] ?? 0, measure(String(c ?? ''))); });
  const xs = []; let x = x0; for (let j = 0; j < widths.length; j++) { xs.push(x); x += widths[j] + gap; }
  const n = (rows ?? []).length;
  return { xs, rowY: i => y0 + i * lh, w: widths.length ? x - gap - x0 : 0, h: n * lh };
}

/** A box sized to its lines: the widest measured line plus padding, and lines * lh tall. Returns { w, h, lh }. */
export function boxFor(lines, measure, { px = 11, pad = 10, k = 1.35, minW = 0 } = {}) {
  const lh = lineHeight(px, k); let w = minW;
  for (const s of lines ?? []) w = Math.max(w, measure(String(s ?? '')) + pad * 2);
  return { w: Math.ceil(w), h: (lines ?? []).length * lh + pad * 2, lh };
}

/**
 * A per-slot memo for layouts: get(slot, font, text, compute) returns the cached value while that slot's font and text are unchanged, else calls compute()
 * and keeps the result. Comparing the two strings allocates nothing, so a steady frame does no layout work.
 */
export function slotCache() {
  const m = new Map();
  return {
    get(slot, font, text, compute) {
      const e = m.get(slot);
      if (e && e.font === font && e.text === text) return e.val;
      const val = compute(); if (e) { e.font = font; e.text = text; e.val = val; } else m.set(slot, { font, text, val }); return val;
    },
    size: () => m.size,
    clear: () => m.clear(),
  };
}
