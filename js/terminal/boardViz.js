/**
 * Desk Terminal: the drawing primitives the newer boards share (credit & liquidity, curve, regime, releases, currency strength, vol).
 * Pure: strings in, SVG/HTML strings out; no DOM, no clock, no fetch. Every colour is a theme token (var(--x)), so a theme change repaints
 * everything with no redraw; motion is CSS (js/terminal/terminal-tabs.css, .bv-*) and is off under prefers-reduced-motion. Every mark sits on
 * one scale per drawing and every label names a value the drawing reaches.
 *
 *   arcGauge     a glowing half-dial with zone ticks and a needle that sweeps in (the stress read)
 *   ridgeCurves  a curve through time as a depth ridgeline: oldest at the back, today in front and glowing (the yield curve)
 *   pctRails     "where is it in its own history": a rail per row with the 1y / 5y tick and a glowing marker (slopes, spreads)
 *   glowLine     a line with a soft glow, an area wash and an emphasised endpoint (a series)
 *   stateStrip   a row of cells, one per day, coloured by a state (the regime memory)
 */

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fin = v => v != null && Number.isFinite(+v);
const f1 = v => (Math.round(v * 10) / 10).toString();
const f2 = v => (Math.round(v * 100) / 100).toString();
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

let _uid = 0;
/** A short unique id for gradients/filters so two drawings on one page never share a definition. */
export const uid = p => `${p}${(++_uid).toString(36)}`;

/** A smooth path through points (Catmull-Rom to cubic Bezier). */
export function smoothPath(pts, t = 0.5) {
  if (pts.length < 2) return '';
  let d = `M${f1(pts[0][0])},${f1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    d += `C${f1(p1[0] + (p2[0] - p0[0]) * t / 3)},${f1(p1[1] + (p2[1] - p0[1]) * t / 3)} ${f1(p2[0] - (p3[0] - p1[0]) * t / 3)},${f1(p2[1] - (p3[1] - p1[1]) * t / 3)} ${f1(p2[0])},${f1(p2[1])}`;
  }
  return d;
}

/**
 * A half-dial. value on [min,max]; zones = [{from,to,tone}] (tone: 'up'|'gold'|'dn'|'flat') drawn as the track; ticks = [{v,label}].
 * The needle arc sweeps in from the left (CSS .bv-sweep). tone for the glowing fill follows the zone the value sits in.
 */
export function arcGauge({ value, min, max, zones = [], ticks = [], label = '', sub = '', w = 260 }) {
  if (!fin(value)) return '';
  const R = 96, cx = 130, cy = 118, H = 150, sw = 13;
  const ang = v => Math.PI * (1 - clamp((v - min) / (max - min), 0, 1));                        // pi (left) .. 0 (right)
  const pt = (v, r = R) => [cx + r * Math.cos(ang(v)), cy - r * Math.sin(ang(v))];
  const arc = (a, b, r = R) => { const [x0, y0] = pt(a, r), [x1, y1] = pt(b, r); return `M${f1(x0)},${f1(y0)}A${r},${r} 0 0 1 ${f1(x1)},${f1(y1)}`; };
  const TONE = { up: 'var(--up)', gold: 'var(--gold)', dn: 'var(--dn)', flat: 'var(--flat)' };
  const zoneOf = v => zones.find(z => v >= z.from && v <= z.to)?.tone ?? 'gold';
  const tone = zoneOf(value), col = TONE[tone] ?? 'var(--gold)';
  const id = uid('bvg');
  const track = zones.map(z => `<path d="${arc(Math.max(min, z.from), Math.min(max, z.to))}" fill="none" stroke="${TONE[z.tone] ?? 'var(--line2)'}" stroke-opacity=".22" stroke-width="${sw}" stroke-linecap="butt"/>`).join('');
  const tk = ticks.map(t => { const [x0, y0] = pt(t.v, R - sw / 2 - 2), [x1, y1] = pt(t.v, R + sw / 2 + 2), [lx, ly] = pt(t.v, R + sw / 2 + 12);
    return `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="var(--tx3)" stroke-width="1"/><text x="${f1(lx)}" y="${f1(ly + 3)}" text-anchor="middle" font-size="9.5" fill="var(--tx3)" font-family="var(--mono)">${esc(t.label ?? t.v)}</text>`; }).join('');
  const [nx, ny] = pt(value, R);
  const from = Math.max(min, Math.min(0, max)), fill = arc(Math.min(from, value), Math.max(from, value));
  return `<svg class="bv-svg" viewBox="0 0 ${w} ${H}" width="${w}" role="img" aria-label="${esc(label)} ${f2(value)}">
<defs><filter id="${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.4"/></filter></defs>
${track}
<path d="${fill}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" opacity=".5" filter="url(#${id})" class="bv-sweep" pathLength="1"/>
<path d="${fill}" fill="none" stroke="${col}" stroke-width="${sw - 5}" stroke-linecap="round" class="bv-sweep" pathLength="1"/>
${tk}
<circle cx="${f1(nx)}" cy="${f1(ny)}" r="6" fill="${col}" stroke="var(--bg1)" stroke-width="2" class="bv-fade"/>
<text x="${cx}" y="${cy - 14}" text-anchor="middle" font-size="26" font-weight="700" fill="var(--tx)" font-family="var(--mono)">${value > 0 ? '+' : ''}${f2(value)}</text>
<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="10.5" fill="var(--tx2)">${esc(label)}</text>
${sub ? `<text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="9.5" fill="var(--tx3)">${esc(sub)}</text>` : ''}
</svg>`;
}

/**
 * A curve through time as a depth ridgeline. curves = [{ date, pts: [{ k, v }] }] oldest first, all with the same tenors k in the same order.
 * x = tenor slot, y = level (one scale for all), each older curve sits further back (up and to the right) and fainter; the newest is in front
 * and glows. Each ridge is filled with the panel colour so it hides the ones behind it. Labels: tenors under the front curve, the levels on the
 * left (the front curve's scale), the dates of the oldest and newest ridge.
 */
export function ridgeCurves({ curves, tenors, w = 560, h = 300, depthX = 0.5, depthY = 3 }) {
  const cs = (curves ?? []).filter(c => c?.pts?.length === tenors.length && c.pts.every(p => fin(p.v)));
  if (cs.length < 3) return '';
  const n = cs.length, L = 46, B = 46, T = 20, R = 18;
  const plotW = w - L - R - depthX * (n - 1), plotH = h - T - B - depthY * (n - 1);
  const all = cs.flatMap(c => c.pts.map(p => p.v)); let lo = Math.min(...all), hi = Math.max(...all); if (hi - lo < 0.3) { const c = (hi + lo) / 2; lo = c - 0.15; hi = c + 0.15; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const xs = k => (k / (tenors.length - 1)) * plotW, ys = v => (1 - (v - lo) / (hi - lo)) * plotH;
  const id = uid('bvr');
  // layer i = 0 (oldest, furthest back) .. n-1 (front): offset grows toward the FRONT, so the front is bottom-left
  const off = i => [L + (n - 1 - i) * depthX, T + i * depthY];
  const rid = cs.map((c, i) => {
    const [ox, oy] = off(i), pts = c.pts.map((p, j) => [ox + xs(j), oy + ys(p.v)]), line = smoothPath(pts);
    const base = oy + plotH + 6, area = `${line}L${f1(pts[pts.length - 1][0])},${f1(base)}L${f1(pts[0][0])},${f1(base)}Z`;
    const front = i === n - 1, op = front ? 1 : clamp(0.16 + 0.62 * (i / (n - 1)), 0.16, 0.8);
    return `<g class="bv-ridge" style="--d:${(i * 0.025).toFixed(3)}s"><path d="${area}" class="bv-occ" stroke="none"/>
<path d="${line}" fill="none" stroke="${front ? 'var(--gold)' : 'var(--pur2)'}" stroke-opacity="${f2(op)}" stroke-width="${front ? 2.4 : 1.1}"${front ? ` filter="url(#${id})"` : ''}/>${front ? `<path d="${line}" fill="none" stroke="var(--gold)" stroke-width="2.2"/>` : ''}</g>`;
  }).join('');
  const [fx, fy] = off(n - 1);
  const lab = tenors.map((t, j) => `<text x="${f1(fx + xs(j))}" y="${f1(fy + plotH + 22)}" text-anchor="middle" font-size="10" fill="var(--tx3)" font-family="var(--mono)">${esc(t)}</text>`).join('');
  const grid = [0, 0.5, 1].map(q => { const v = lo + (hi - lo) * q; return `<text x="${L - 6}" y="${f1(fy + ys(v) + 3)}" text-anchor="end" font-size="10" fill="var(--tx3)" font-family="var(--mono)">${v.toFixed(2)}</text>`; }).join('');
  const [bx, by] = off(0);
  const dates = `<text x="${f1(bx + plotW)}" y="${f1(by - 6)}" text-anchor="end" font-size="10" fill="var(--tx3)" font-family="var(--mono)">${esc(cs[0].date)}</text>
<text x="${f1(fx)}" y="${f1(fy + plotH + 38)}" font-size="10" fill="var(--gold2)" font-family="var(--mono)">${esc(cs[n - 1].date)} (front)</text>`;
  return `<svg class="bv-svg" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="The yield curve through time, oldest at the back"><defs><filter id="${id}" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="3"/></filter></defs>${grid}${rid}${lab}${dates}</svg>`;
}

/**
 * Rails: one row per item with a track 0-100, tick marks for the 1y and 5y percentiles, and a glowing marker where it sits now.
 * rows = [{ label, value (text), pct (0-100), pct2 (optional second percentile), note }]. Tone: the marker is gold in the middle, dn/up at the ends
 * only when `ends` is given ('hi' = a high percentile is the notable end).
 */
export function pctRails(rows, { w = 520, marks = [25, 50, 75], rightW = 96 } = {}) {
  const rs = (rows ?? []).filter(r => fin(r.pct));
  if (!rs.length) return '';
  const rowH = 34, L = 108, R = rightW, H = rs.length * rowH + 22, id = uid('bvp');
  const x = p => L + (p / 100) * (w - L - R);
  const body = rs.map((r, i) => {
    const y = 18 + i * rowH, extreme = r.pct >= 90 || r.pct <= 10, col = extreme ? (r.pct >= 90 ? 'var(--gold)' : 'var(--pur2)') : 'var(--tx2)';
    return `<g class="bv-fade" style="--d:${(i * 0.06).toFixed(2)}s"><text x="0" y="${y + 4}" font-size="11.5" fill="var(--tx2)">${esc(r.label)}</text>
<rect x="${L}" y="${y - 3}" width="${w - L - R}" height="6" rx="3" fill="var(--bg3)"/>
<rect x="${L}" y="${y - 3}" width="${f1(x(r.pct) - L)}" height="6" rx="3" fill="${col}" fill-opacity=".28"/>
${marks.map(q => `<line x1="${f1(x(q))}" x2="${f1(x(q))}" y1="${y - 6}" y2="${y + 6}" stroke="var(--line2)" stroke-width="1"/>`).join('')}
${fin(r.pct2) ? `<line x1="${f1(x(r.pct2))}" x2="${f1(x(r.pct2))}" y1="${y - 8}" y2="${y + 8}" stroke="var(--tx3)" stroke-width="1.5" stroke-dasharray="2 2"/>` : ''}
<circle cx="${f1(x(r.pct))}" cy="${y}" r="9" fill="${col}" opacity=".35" filter="url(#${id})"/><circle cx="${f1(x(r.pct))}" cy="${y}" r="5" fill="${col}" stroke="var(--bg1)" stroke-width="1.5"/>
<text x="${w - R + 12}" y="${y + 4}" font-size="11" fill="var(--tx)" font-family="var(--mono)">${esc(r.value ?? '')}</text>
<text x="${w}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--tx3)" font-family="var(--mono)">${Math.round(r.pct)}th</text></g>`;
  }).join('');
  return `<svg class="bv-svg" viewBox="0 0 ${w} ${H}" width="100%" role="img" aria-label="Where each reading sits in its own history"><defs><filter id="${id}"><feGaussianBlur stdDeviation="3"/></filter></defs>${body}
<text x="${f1(x(0))}" y="${H - 4}" font-size="9.5" fill="var(--tx3)" font-family="var(--mono)">lowest in its window</text><text x="${f1(x(100))}" y="${H - 4}" text-anchor="end" font-size="9.5" fill="var(--tx3)" font-family="var(--mono)">highest</text></svg>`;
}

/** A series as a line with glow, a faint area wash and an emphasised last point. pts = numbers (even steps) or [x,y]. Optional bands [{from,to,tone}]. */
export function glowLine(vals, { w = 300, h = 76, tone = 'var(--pur2)', zeroLine = false, lo: lo0 = null, hi: hi0 = null, label = '' } = {}) {
  const v = (vals ?? []).filter(fin).map(Number); if (v.length < 3) return '';
  let lo = lo0 ?? Math.min(...v), hi = hi0 ?? Math.max(...v); if (zeroLine) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); } if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const T = 6, B = 6, x = i => (i / (v.length - 1)) * (w - 8) + 4, y = a => T + (1 - (a - lo) / (hi - lo)) * (h - T - B);
  const pts = v.map((a, i) => [x(i), y(a)]), line = smoothPath(pts), id = uid('bvl');
  const zy = zeroLine ? y(0) : null;
  return `<svg class="bv-svg" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${esc(label)}"><defs><filter id="${id}" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="2.6"/></filter>
<linearGradient id="${id}g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:${tone};stop-opacity:.22"/><stop offset="1" style="stop-color:${tone};stop-opacity:0"/></linearGradient></defs>
${zy != null ? `<line x1="4" x2="${w - 4}" y1="${f1(zy)}" y2="${f1(zy)}" stroke="var(--line2)" stroke-dasharray="3 3"/>` : ''}
<path d="${line}L${f1(pts[pts.length - 1][0])},${h - B}L${f1(pts[0][0])},${h - B}Z" fill="url(#${id}g)" class="bv-fade"/>
<path d="${line}" fill="none" stroke="${tone}" stroke-width="3.4" opacity=".5" filter="url(#${id})" class="bv-sweep" pathLength="1"/>
<path d="${line}" fill="none" stroke="${tone}" stroke-width="1.7" class="bv-sweep" pathLength="1"/>
<circle cx="${f1(pts[pts.length - 1][0])}" cy="${f1(pts[pts.length - 1][1])}" r="3.6" fill="${tone}" stroke="var(--bg1)" stroke-width="1.5" class="bv-fade"/></svg>`;
}

/** A row of cells, one per item. cells = [{ tone ('up'|'dn'|'gold'|'pur'|'flat'|null), title }]. */
export function stateStrip(cells, { cell = 9, gap = 2 } = {}) {
  const TONE = { up: 'var(--up)', dn: 'var(--dn)', gold: 'var(--gold)', pur: 'var(--pur2)', flat: 'var(--line2)' };
  return `<div class="bv-strip" role="img" aria-label="one cell per day, oldest first">${(cells ?? []).map((c, i) => `<i style="width:${cell}px;background:${TONE[c.tone] ?? 'var(--bg3)'};opacity:${c.tone ? (c.tone === 'flat' ? 0.5 : 0.85) : 0.5};margin-right:${gap}px;--d:${(i * 0.012).toFixed(3)}s" title="${esc(c.title ?? '')}"></i>`).join('')}</div>`;
}
