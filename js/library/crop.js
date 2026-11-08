// Equation / table image crops: PDF-unit bbox (origin bottom-left) -> canvas pixel rectangle.
export function cropRect(bbox, pageSize, canvasW, canvasH, pad = 4) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || !Array.isArray(pageSize) || !(pageSize[0] > 0) || !(pageSize[1] > 0)) return null;
  let [x0, y0, x1, y1] = bbox.map(Number);
  if (![x0, y0, x1, y1].every(isFinite)) return null;
  if (x1 < x0) [x0, x1] = [x1, x0];
  if (y1 < y0) [y0, y1] = [y1, y0];
  const [W, H] = pageSize;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W, x1 + pad); y1 = Math.min(H, y1 + pad);
  const kx = canvasW / W, ky = canvasH / H;
  const sx = Math.floor(x0 * kx), sy = Math.floor((H - y1) * ky);
  const sw = Math.ceil((x1 - x0) * kx), sh = Math.ceil((y1 - y0) * ky);
  if (sw < 2 || sh < 2) return null;
  return { sx, sy, sw: Math.min(sw, canvasW - sx), sh: Math.min(sh, canvasH - sy) };
}
/** Page render scale: crisp crops, but a bounded canvas. */
export function renderScale(pageSize, targetWidth = 1100, maxScale = 3) {
  if (!pageSize || !(pageSize[0] > 0)) return 1.5;
  return Math.min(maxScale, Math.max(1, targetWidth / pageSize[0]));
}
