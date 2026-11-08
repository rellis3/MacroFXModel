// Graphics regions of a PDF page (pure): where the pictures are. Text extraction never sees charts, which are either embedded
// raster images or vector paths (many small path ops), so the page's operator list is walked with a CTM / clip stack and every
// painted image and path becomes a box; nearby boxes are merged into regions.
//
//   graphicsRegions(fnArray, argsArray, OPS, pageW, pageH) -> [[x0, y0, x1, y1, kind, n]]   PDF units, origin bottom-left
//     kind 'i' = the region holds a raster image, 'v' = vector paths only; n = how many marks it merges (capped).
//
// Left out on purpose: thin full-width rules (page header/footer rules, table rules), page borders and full-page backgrounds,
// white fills, glyph-like marks (bitmap-font stencils, bullets, fraction bars) and any region smaller than a postage stamp.
// Callers pass OPS (pdf.js operator numbers), so the same code runs against synthetic arrays in tests.

const r2 = v => Math.round(v * 100) / 100;
function mul(a, b) { return [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]]; }
const ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const isWhite = c => Array.isArray(c) && c.length >= 3 && c.slice(0, 3).every(v => v >= 250);

/** Raw boxes ({x0,y0,x1,y1,k}) of everything painted: images ('i'), paths ('v'). */
export function collectBoxes(fnArray, argsArray, OPS, pageW = 612, pageH = 792, { maxBoxes = 30000 } = {}) {
  const out = [];
  if (!fnArray || !argsArray || !OPS) return out;
  let ctm = [1, 0, 0, 1, 0, 0], lw = 1, fillWhite = false, clip = null;
  const stack = [];
  let pend = null;   // bbox of the path under construction, in page coordinates
  const grow = (x, y) => { const p = ap(ctm, x, y); if (!pend) pend = { x0: p[0], y0: p[1], x1: p[0], y1: p[1] }; else { if (p[0] < pend.x0) pend.x0 = p[0]; if (p[0] > pend.x1) pend.x1 = p[0]; if (p[1] < pend.y0) pend.y0 = p[1]; if (p[1] > pend.y1) pend.y1 = p[1]; } };
  const addBox = (b, k) => {
    let { x0, y0, x1, y1 } = b;
    if (clip) { x0 = Math.max(x0, clip.x0); y0 = Math.max(y0, clip.y0); x1 = Math.min(x1, clip.x1); y1 = Math.min(y1, clip.y1); }
    if (!(x1 > x0 - 1e-6) || !(y1 > y0 - 1e-6) || ![x0, y0, x1, y1].every(Number.isFinite)) return;
    if (x1 < 0 || y1 < 0 || x0 > pageW || y0 > pageH) return;
    out.push({ x0, y0, x1, y1, k });
  };
  const paint = (stroke, fill) => {
    if (!pend) return;
    const b = pend; pend = null;
    if (fill && !stroke && fillWhite) return;   // a white fill is a background, not a mark
    const e = stroke ? Math.max(lw * Math.hypot(ctm[0], ctm[1]), 0) / 2 : 0;
    addBox({ x0: b.x0 - e, y0: b.y0 - e, x1: b.x1 + e, y1: b.y1 + e }, 'v');
  };
  const image = (m, k) => {
    const c = [ap(m, 0, 0), ap(m, 1, 0), ap(m, 0, 1), ap(m, 1, 1)];
    addBox({ x0: Math.min(...c.map(p => p[0])), x1: Math.max(...c.map(p => p[0])), y0: Math.min(...c.map(p => p[1])), y1: Math.max(...c.map(p => p[1])) }, k);
  };
  for (let i = 0; i < fnArray.length && out.length < maxBoxes; i++) {
    const fn = fnArray[i], a = argsArray[i];
    if (fn === OPS.save) stack.push({ ctm, clip, fillWhite, lw });
    else if (fn === OPS.restore) { const s = stack.pop(); if (s) ({ ctm, clip, fillWhite, lw } = s); }
    else if (fn === OPS.transform && Array.isArray(a)) ctm = mul(a, ctm);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push({ ctm, clip, fillWhite, lw }); if (Array.isArray(a?.[0])) ctm = mul(a[0], ctm); }
    else if (fn === OPS.paintFormXObjectEnd) { const s = stack.pop(); if (s) ({ ctm, clip, fillWhite, lw } = s); }
    else if (fn === OPS.setLineWidth) lw = +a?.[0] || 0;
    else if (fn === OPS.setFillRGBColor) fillWhite = isWhite(a);
    else if (fn === OPS.setFillGray) fillWhite = (+a?.[0] || 0) >= 0.98 || (+a?.[0] || 0) >= 250;
    else if (fn === OPS.constructPath && Array.isArray(a)) {
      const ops = a[0] ?? [], co = a[1] ?? []; let k = 0;
      for (const o of ops) {
        if (o === OPS.moveTo || o === OPS.lineTo) { grow(co[k], co[k + 1]); k += 2; }
        else if (o === OPS.curveTo) { grow(co[k], co[k + 1]); grow(co[k + 2], co[k + 3]); grow(co[k + 4], co[k + 5]); k += 6; }
        else if (o === OPS.curveTo2 || o === OPS.curveTo3) { grow(co[k], co[k + 1]); grow(co[k + 2], co[k + 3]); k += 4; }
        else if (o === OPS.rectangle) { grow(co[k], co[k + 1]); grow(co[k] + co[k + 2], co[k + 1] + co[k + 3]); k += 4; }
      }
    }
    else if (fn === OPS.stroke || fn === OPS.closeStroke) paint(true, false);
    else if (fn === OPS.fill || fn === OPS.eoFill) paint(false, true);
    else if (fn === OPS.fillStroke || fn === OPS.eoFillStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke) paint(true, true);
    else if (fn === OPS.clip || fn === OPS.eoClip) { if (pend) clip = clip ? { x0: Math.max(clip.x0, pend.x0), y0: Math.max(clip.y0, pend.y0), x1: Math.min(clip.x1, pend.x1), y1: Math.min(clip.y1, pend.y1) } : { ...pend }; }
    else if (fn === OPS.endPath) pend = null;
    else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageXObjectRepeat) image(ctm, 'i');
    else if (fn === OPS.paintImageMaskXObject) image(ctm, 'm');   // stencil: a glyph of a bitmap font, a rule, or a one-colour picture
    else if (fn === OPS.paintInlineImageXObjectGroup || fn === OPS.paintImageMaskXObjectGroup) { for (const im of Array.isArray(a?.[0]) ? a[0] : []) if (Array.isArray(im?.transform)) image(mul(im.transform, ctm), fn === OPS.paintImageMaskXObjectGroup ? 'm' : 'i'); }
    else if (fn === OPS.paintImageMaskXObjectRepeat) image(ctm, 'm');
  }
  return out;
}

/** Merge boxes that touch or lie within `gap` of each other into regions (single-link, spatial hash; bounded work). */
export function clusterBoxes(boxes, gap = 6) {
  const n = boxes.length; if (!n) return [];
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const cell = Math.max(gap * 2, 8), grid = new Map(), bigs = [];
  const near = (a, b) => a.x0 - gap <= b.x1 && b.x0 - gap <= a.x1 && a.y0 - gap <= b.y1 && b.y0 - gap <= a.y1;
  for (let i = 0; i < n; i++) {
    const b = boxes[i];
    const cx0 = Math.floor((b.x0 - gap) / cell), cx1 = Math.floor((b.x1 + gap) / cell), cy0 = Math.floor((b.y0 - gap) / cell), cy1 = Math.floor((b.y1 + gap) / cell);
    if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > 400) {   // a very large box (a plot frame): compared with everything seen so far, and later boxes compare with it
      for (let j = 0; j < i; j++) if (near(b, boxes[j])) parent[find(j)] = find(i);
      bigs.push(i);
      continue;
    }
    for (const j of bigs) if (near(b, boxes[j])) parent[find(j)] = find(i);
    for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
      const key = cx * 100003 + cy; let list = grid.get(key);
      if (!list) { list = []; grid.set(key, list); }
      for (const j of list) if (near(b, boxes[j])) parent[find(j)] = find(i);
      list.push(i);
    }
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i), b = boxes[i]; let g = groups.get(r);
    if (!g) { g = { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, n: 0, img: 0, big: 0 }; groups.set(r, g); }
    g.x0 = Math.min(g.x0, b.x0); g.y0 = Math.min(g.y0, b.y0); g.x1 = Math.max(g.x1, b.x1); g.y1 = Math.max(g.y1, b.y1); g.n++;
    if (b.k === 'i') g.img++;
  }
  return [...groups.values()];
}

/**
 * Regions of a page that hold a picture: [[x0, y0, x1, y1, kind, n]]. Sorted top to bottom, then left to right.
 * Keeps a region only if it is at least ~22 x 22 units (or an embedded image of at least 16 x 16) and is not a page frame.
 */
export function graphicsRegions(fnArray, argsArray, OPS, pageW = 612, pageH = 792) {
  try {
    const raw = collectBoxes(fnArray, argsArray, OPS, pageW, pageH);
    const keep = [];
    for (const b of raw) {
      const w = b.x1 - b.x0, h = b.y1 - b.y0;
      if (w >= 0.85 * pageW && h >= 0.85 * pageH) continue;                       // page border or full-page background
      if (b.k !== 'i' && Math.min(w, h) <= 2.5 && Math.max(w, h) >= 0.55 * pageW) continue;   // thin full-width rule (header, footer, table rule)
      if (b.k === 'm' && w <= 24 && h <= 24) continue;                           // bitmap-font glyph or stencil mark
      if (b.k === 'i' && (w < 6 || h < 6)) continue;                             // spacer
      if (Math.max(w, h) < 0.4 && b.k === 'v') continue;                         // a dot
      keep.push(b.k === 'm' ? { ...b, k: 'v' } : b);
    }
    const out = [];
    for (const g of clusterBoxes(keep, 6)) {
      const w = g.x1 - g.x0, h = g.y1 - g.y0;
      const big = g.img ? (w >= 16 && h >= 16) : (w >= 22 && h >= 22);
      if (!big) continue;
      if (w >= 0.85 * pageW && h >= 0.85 * pageH) continue;
      out.push([r2(Math.max(0, g.x0)), r2(Math.max(0, g.y0)), r2(Math.min(pageW, g.x1)), r2(Math.min(pageH, g.y1)), g.img ? 'i' : 'v', Math.min(g.n, 9999)]);
    }
    out.sort((p, q) => q[3] - p[3] || p[0] - q[0]);
    return out.slice(0, 80);
  } catch { return []; }
}
