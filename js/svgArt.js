/**
 * SVG ART SANITISER — lets a language model draw a banner without being able to put anything dangerous in it.
 *
 * The newsletter asks a model for abstract header art. A model's output is untrusted text, and SVG can carry scripts,
 * event handlers, external references and CSS. So nothing the model writes is ever inserted as-is: it is parsed with a
 * strict allowlist (a fixed set of drawing elements, a fixed set of presentation attributes, each value checked against a
 * pattern) and REBUILT from the pieces that passed. Anything outside the list rejects the whole drawing, and the caller
 * falls back to the data-driven banner. There is no "strip the bad bit and carry on": a half-sanitised drawing is how
 * these filters get bypassed.
 *
 * Pure: no DOM, no network. Used by server.js (so unsafe SVG never leaves the server) and by the newsletter module.
 */

const TAG = { svg: 'svg', g: 'g', defs: 'defs', lineargradient: 'linearGradient', radialgradient: 'radialGradient', stop: 'stop', rect: 'rect', circle: 'circle', ellipse: 'ellipse', line: 'line', polyline: 'polyline', polygon: 'polygon', path: 'path' };
const ATTR = { viewbox: 'viewBox', x: 'x', y: 'y', cx: 'cx', cy: 'cy', r: 'r', rx: 'rx', ry: 'ry', x1: 'x1', y1: 'y1', x2: 'x2', y2: 'y2', fx: 'fx', fy: 'fy', points: 'points', d: 'd', fill: 'fill', stroke: 'stroke', 'stroke-width': 'stroke-width', opacity: 'opacity', 'fill-opacity': 'fill-opacity', 'stroke-opacity': 'stroke-opacity', offset: 'offset', 'stop-color': 'stop-color', 'stop-opacity': 'stop-opacity', id: 'id', gradientunits: 'gradientUnits', transform: 'transform', gradienttransform: 'gradientTransform', 'stroke-linecap': 'stroke-linecap', 'stroke-linejoin': 'stroke-linejoin', 'stroke-dasharray': 'stroke-dasharray', width: 'width', height: 'height', xmlns: 'xmlns', preserveaspectratio: 'preserveAspectRatio' };

const NUM = /^-?\d*\.?\d+(e-?\d+)?%?$/i;
const COLOR = /^(none|transparent|currentColor|#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]{3,20}|url\(#[A-Za-z][\w-]{0,30}\))$/i;
const VALID = {
  viewbox: v => /^-?[\d.]+(\s+-?[\d.]+){3}$/.test(v), points: v => /^[\d\s.,\-eE+]+$/.test(v) && v.length < 2500, d: v => /^[MmLlHhVvCcSsQqTtAaZz\d\s.,\-eE+]+$/.test(v) && v.length < 3500,
  fill: v => COLOR.test(v), stroke: v => COLOR.test(v), 'stop-color': v => COLOR.test(v),
  transform: v => /^(\s*(translate|rotate|scale|skewX|skewY)\(\s*-?[\d.]+(\s*[, ]\s*-?[\d.]+){0,2}\s*\)\s*)+$/.test(v), gradienttransform: v => /^(\s*(translate|rotate|scale)\(\s*-?[\d.]+(\s*[, ]\s*-?[\d.]+){0,2}\s*\)\s*)+$/.test(v),
  id: v => /^[A-Za-z][\w-]{0,30}$/.test(v), gradientunits: v => /^(userSpaceOnUse|objectBoundingBox)$/.test(v), xmlns: v => v === 'http://www.w3.org/2000/svg',
  'stroke-linecap': v => /^(butt|round|square)$/.test(v), 'stroke-linejoin': v => /^(miter|round|bevel)$/.test(v), 'stroke-dasharray': v => /^[\d\s.,]+$/.test(v), preserveaspectratio: v => /^[xXyYMinaxlsce\s]+$/.test(v),
};
const NUMERIC = ['x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'fx', 'fy', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'offset', 'stop-opacity', 'width', 'height'];
for (const k of NUMERIC) VALID[k] = v => NUM.test(v);

const FORBIDDEN = /<\s*(script|style|foreignObject|image|text|tspan|use|a|iframe|animate|set|filter|pattern|mask|clipPath|marker|symbol|title|desc|metadata)\b|<!|<\?|javascript:|data:|\bon\w+\s*=|\bhref\s*=|\bsrc\s*=|expression\(|@import|&#|&[a-z]+;/i;

/**
 * @param {string} raw      whatever the model wrote (may be wrapped in a code fence or prose)
 * @param {{maxLen?:number,maxElements?:number}} opts
 * @returns {{ok:true, svg:string, elements:number} | {ok:false, reason:string}}
 */
export function sanitizeSvg(raw, { maxLen = 16000, maxElements = 140 } = {}) {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: 'empty' };
  const m = raw.match(/<svg[\s\S]*<\/svg>/i);
  if (!m) return { ok: false, reason: 'no <svg> element' };
  const src = m[0];
  if (src.length > maxLen) return { ok: false, reason: `too long (${src.length} > ${maxLen})` };
  if (FORBIDDEN.test(src)) return { ok: false, reason: 'contains a forbidden construct' };

  const out = []; const stack = []; let elements = 0; let pos = 0, sawRoot = false;
  const tagRe = /<(\/?)([A-Za-z][\w-]*)((?:\s+[^<>]*?)?)(\/?)>/g;
  let t;
  while ((t = tagRe.exec(src)) !== null) {
    if (src.slice(pos, t.index).trim() !== '') return { ok: false, reason: 'text content is not allowed' };
    pos = tagRe.lastIndex;
    const [, closing, nameRaw, attrStr, selfClose] = t, name = nameRaw.toLowerCase();
    if (!TAG[name]) return { ok: false, reason: `element <${nameRaw}> is not allowed` };
    if (closing) {
      if (stack.pop() !== name) return { ok: false, reason: 'unbalanced tags' };
      out.push(`</${TAG[name]}>`); continue;
    }
    if (++elements > maxElements) return { ok: false, reason: 'too many elements' };
    const isRoot = name === 'svg';
    if (isRoot && sawRoot) return { ok: false, reason: 'nested <svg>' };
    if (!isRoot && !sawRoot) return { ok: false, reason: 'content before <svg>' };
    if (isRoot) sawRoot = true;
    const attrs = []; const rest = attrStr.replace(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (_m, k, a, b) => { attrs.push([k.toLowerCase(), a ?? b]); return ' '; });
    if (rest.replace(/[\s/]/g, '') !== '') return { ok: false, reason: 'malformed attributes' };
    const seen = new Set(), keep = [];
    for (const [k, v] of attrs) {
      if (!ATTR[k]) return { ok: false, reason: `attribute "${k}" is not allowed` };
      if (seen.has(k)) return { ok: false, reason: `duplicate attribute "${k}"` };
      seen.add(k);
      if (isRoot && ['width', 'height', 'xmlns', 'viewbox', 'preserveaspectratio'].includes(k)) continue;   // the root's size and box are fixed below
      if (!VALID[k] || !VALID[k](v.trim())) return { ok: false, reason: `value for "${k}" is not allowed` };
      keep.push(`${ATTR[k]}="${v.trim().replace(/"/g, '')}"`);
    }
    if (isRoot) out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 160" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" role="img" aria-hidden="true"${keep.length ? ' ' + keep.join(' ') : ''}>`);
    else out.push(`<${TAG[name]}${keep.length ? ' ' + keep.join(' ') : ''}${selfClose ? '/' : ''}>`);
    if (!selfClose) stack.push(name);
  }
  if (src.slice(pos).trim() !== '') return { ok: false, reason: 'trailing content' };
  if (stack.length) return { ok: false, reason: 'unclosed tags' };
  if (!sawRoot) return { ok: false, reason: 'no root' };
  return { ok: true, svg: out.join(''), elements };
}
