/**
 * js/newsletterTermV2Svg.js: the charts of the terminal newsletter, version 2 (plans/NEWSLETTER_TERMINAL_V2.md). Pure: data in, SVG string out.
 * No scripts, no fonts or images fetched; every shape has an explicit fill or stroke so it prints the same everywhere.
 *
 * Colours come from a palette object k: the page passes CSS variables (CSS_PAL, so the dark and the light variants share one set of charts),
 * the poster passes hard hex (HEX_PAL, because a poster is an image and has no stylesheet). Chart text is never cut with "..."; labels are
 * shortened by the caller's own wording and measured by textWidth() so a test can check that nothing runs outside its box.
 */
export const MONO = "Consolas,'SF Mono',Menlo,'DejaVu Sans Mono',monospace";
export const SANS = "-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
export const HEX_PAL = { bg: '#070a17', bg1: '#0c1124', bg2: '#111833', bg3: '#18203f', line: '#232c55', tx: '#eef0fb', tx2: '#a9b0d0', tx3: '#6d7599', pur: '#8b7cf6', pur2: '#b4a9ff', gold: '#e8b85a', up: '#2fd39a', dn: '#ff5d78' };
export const LIGHT_PAL = { bg: '#f4f5fb', bg1: '#ffffff', bg2: '#f0f1fa', bg3: '#e1e4f3', line: '#cdd2ea', tx: '#141a38', tx2: '#4a5380', tx3: '#7b83a8', pur: '#5b4bd8', pur2: '#5b4bd8', gold: '#a8741a', up: '#0f9a6a', dn: '#d6264a' };
export const CSS_PAL = Object.fromEntries(Object.keys(HEX_PAL).map(n => [n, `var(--${n})`]));

export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f1 = (v, d = 1) => Number(v).toFixed(d);
export const fmt = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
const fin = v => typeof v === 'number' && Number.isFinite(v);
/** A monospace width estimate in SVG units for a string at a font size (0.61 em per glyph): the chart tests use it to check a label fits its box. */
export const textWidth = (s, size) => String(s).length * size * 0.61;

export function polar(cx, cy, r, deg) { const a = deg * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
export function arc(cx, cy, r, a0, a1) {
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  return `M${f1(x0)},${f1(y0)} A${r},${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} 1 ${f1(x1)},${f1(y1)}`;
}
const glow = (id, sd = 2.2, box = '-30%" y="-30%" width="160%" height="160%') =>
  `<filter id="${id}" filterUnits="objectBoundingBox" x="${box}"><feGaussianBlur stdDeviation="${sd}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
/** Glow for a line that can be perfectly horizontal or vertical (an object bounding box of zero size draws nothing): user space instead. */
const glowU = (id, w, h, sd = 2.2) =>
  `<filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><feGaussianBlur stdDeviation="${sd}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
const svgOpen = (W, H, label) => `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">`;
const T = (x, y, s, o = {}) => `<text x="${f1(x)}" y="${f1(y)}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''} font-family="${o.font ?? MONO}" font-size="${o.size ?? 11}"${o.weight ? ` font-weight="${o.weight}"` : ''} fill="${o.fill}"${o.ls ? ` letter-spacing="${o.ls}"` : ''}${o.op != null ? ` fill-opacity="${o.op}"` : ''}>${esc(s)}</text>`;

// ── currency strength heat strip ────────────────────────────────────────────────────────────────────────────────
/** S = /api/ccy-strength. windows = which of 1H/4H/1D/1W to draw (skips an unavailable one). */
export function heatStrip(k, S, windows = ['1H', '4H', '1D', '1W'], width = 360) {
  const H = S?.horizons ?? {}, cols = windows.filter(w => H[w]?.available);
  if (!cols.length) return '';
  const score = Object.fromEntries(cols.map(w => [w, Object.fromEntries(H[w].scores.map(x => [x.ccy, x.score]))]));
  const ref = cols.includes('1W') ? '1W' : cols[cols.length - 1];
  const order = [...H[ref].scores].sort((a, b) => b.score - a.score).map(x => x.ccy);
  const lab = 52, cw = (width - lab) / cols.length, rh = 30, top = 38, Ht = top + rh * order.length + 6;
  const o = [svgOpen(width, Ht, `Currency strength in sigma over ${cols.length} windows`)];
  cols.forEach((w, j) => {
    const cx = lab + cw * j + cw / 2;
    o.push(T(cx, 14, w, { anchor: 'middle', size: 11, weight: 700, fill: k.tx2, ls: 1 }));
    o.push(T(cx, 27, H[w].sinceClose ? 'since close' : `${H[w].leader} leads`, { anchor: 'middle', size: 8, fill: k.tx3 }));
  });
  order.forEach((c, i) => {
    const y = top + i * rh;
    o.push(T(0, y + 19, c, { size: 13, weight: 800, fill: k.tx }));
    cols.forEach((w, j) => {
      const v = score[w][c]; if (!fin(v)) return;
      const a = Math.min(Math.abs(v) / 3, 1), col = v > 0 ? k.up : k.dn, x = lab + cw * j;
      o.push(`<rect x="${f1(x + 2)}" y="${y + 2}" width="${f1(cw - 4)}" height="${rh - 4}" rx="6" fill="${col}" fill-opacity="${f1(0.10 + 0.62 * a, 2)}" stroke="${col}" stroke-opacity="${f1(0.25 + 0.5 * a, 2)}"/>`);
      o.push(T(x + cw / 2, y + 19, fmt(v), { anchor: 'middle', size: 12, weight: 700, fill: k.tx }));
    });
  });
  return o.join('') + '</svg>';
}

// ── the US yield curve with ghosts ──────────────────────────────────────────────────────────────────────────────
/** cur = one frame { t, data: { pts: [{k, v}] } }; ghosts = [{ frame, label }] oldest last (drawn faintest). */
export function curveChart(k, cur, ghosts = [], width = 360, height = 214, id = 'cv') {
  const keys = cur?.data?.pts?.map(p => p.k) ?? []; if (keys.length < 2) return '';
  const l = 34, r = 14, t = 14, b = 26, xs = Object.fromEntries(keys.map((key, i) => [key, l + (width - l - r) * i / (keys.length - 1)]));
  const all = [cur, ...ghosts.map(g => g.frame)].flatMap(f => f.data.pts.map(p => p.v)).filter(fin);
  const lo = Math.floor(Math.min(...all) * 4) / 4 - 0.1, hi = Math.ceil(Math.max(...all) * 4) / 4 + 0.1;
  const Y = v => t + (height - t - b) * (1 - (v - lo) / (hi - lo));
  const o = [svgOpen(width, height, 'US yield curve now against earlier curves'), `<defs>${glow(id)}</defs>`];
  for (let g = lo; g <= hi + 1e-9; g += 0.25) {
    o.push(`<line x1="${l}" x2="${width - r}" y1="${f1(Y(g))}" y2="${f1(Y(g))}" stroke="${k.line}" stroke-dasharray="2 4"/>`);
    o.push(T(l - 5, Y(g) + 3, f1(g, 2), { anchor: 'end', size: 9, fill: k.tx3 }));
  }
  for (const key of keys) o.push(T(xs[key], height - 8, key === 'FF' ? 'FF' : key, { anchor: 'middle', size: 10, fill: k.tx2 }));
  [...ghosts].reverse().forEach((g, i) => {
    const pts = g.frame.data.pts.map(p => `${f1(xs[p.k])},${f1(Y(p.v))}`).join(' '), op = 0.28 + 0.14 * i;
    o.push(`<polyline points="${pts}" fill="none" stroke="${k.pur2}" stroke-opacity="${f1(op, 2)}" stroke-width="1.5" stroke-dasharray="${i === 0 ? '1 4' : i === 1 ? '4 3' : 'none'}"/>`);
    const last = g.frame.data.pts[g.frame.data.pts.length - 1];
    o.push(T(width - r - 2, Y(last.v) - 3, g.label, { anchor: 'end', size: 8, fill: k.pur2, op: f1(op + 0.25, 2) }));
  });
  const pts = cur.data.pts.map(p => `${f1(xs[p.k])},${f1(Y(p.v))}`).join(' ');
  o.push(`<polyline points="${pts}" fill="none" stroke="${k.gold}" stroke-width="2.6" stroke-linejoin="round" filter="url(#${id})"/>`);
  for (const p of cur.data.pts) {
    o.push(`<circle cx="${f1(xs[p.k])}" cy="${f1(Y(p.v))}" r="3.6" fill="${k.gold}"/>`);
    o.push(T(xs[p.k], Y(p.v) - 8, f1(p.v, 2), { anchor: 'middle', size: 9.5, weight: 700, fill: k.tx }));
  }
  return o.join('') + '</svg>';
}

// ── Fed odds ────────────────────────────────────────────────────────────────────────────────────────────────────
/** winds = /api/fed-path windows [{ ref: 'YYYY-MM-DD', hike: %, hikeAgo: { d1, w1, m1 } }]. */
export function fedBars(k, winds, width = 360, id = 'fd') {
  if (!winds?.length) return '';
  const rh = 46, Ht = rh * winds.length + 6, l = 56, r = 44, bw = width - l - r;
  const o = [svgOpen(width, Ht, 'Probability of a Fed rate rise priced by each meeting, with earlier readings as ticks'), `<defs>${glow(id, 2.4, '-10%" y="-80%" width="120%" height="260%')}</defs>`];
  winds.forEach((w, i) => {
    const y = 6 + i * rh, d = new Date(`${w.ref}T00:00:00Z`), ref = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
    o.push(T(0, y + 15, ref, { size: 11, weight: 700, fill: k.tx }));
    o.push(`<rect x="${l}" y="${y + 4}" width="${bw}" height="14" rx="7" fill="${k.bg3}"/>`);
    o.push(`<rect x="${l}" y="${y + 4}" width="${f1(Math.max(2, bw * (w.hike ?? 0) / 100))}" height="14" rx="7" fill="${k.gold}" fill-opacity=".85" filter="url(#${id})"/>`);
    o.push(T(width, y + 16, `${Math.round(w.hike ?? 0)}%`, { anchor: 'end', size: 12, weight: 800, fill: k.tx }));
    [['d1', '1d', 0.9], ['w1', '1w', 0.65], ['m1', '1m', 0.4]].forEach(([key, lb, op]) => {
      const v = w.hikeAgo?.[key]; if (!fin(v)) return;
      const x = l + bw * v / 100;
      o.push(`<line x1="${f1(x)}" x2="${f1(x)}" y1="${y + 1}" y2="${y + 21}" stroke="${k.pur2}" stroke-width="1.6" stroke-opacity="${op}"/>`);
      o.push(T(x, y + 32, lb, { anchor: 'middle', size: 8, fill: k.pur2, op: f1(op + 0.1, 2) }));
    });
  });
  return o.join('') + '</svg>';
}

// ── vol clock dials ─────────────────────────────────────────────────────────────────────────────────────────────
const TAG = { fair: 'FAIR', continue: 'CONTINUE', exhaust: 'EXHAUST' };
/** One dial. t = a /api/vol-clock tile { sym, tag, ratio, clock: { used }, lines: { k75, k90 } }. */
export function dialShape(k, t, cx, cy, R, filterId, small = false) {
  const used = t.clock?.used ?? 0, k75 = t.lines?.k75 ?? 1.4, k90 = t.lines?.k90 ?? 1.9, top = Math.max(k90 * 1.12, 1.25, used * 1.05);
  const A0 = 135, A1 = 405, ang = v => A0 + (A1 - A0) * Math.min(v / top, 1);
  const col = used >= k90 ? k.dn : used >= k75 ? k.gold : used >= 1 ? k.up : k.pur2, sw = f1(R * 0.17);
  const o = [`<path d="${arc(cx, cy, R, A0, A1)}" fill="none" stroke="${k.bg3}" stroke-width="${sw}" stroke-linecap="round"/>`];
  if (used > 0) o.push(`<path d="${arc(cx, cy, R, A0, ang(used))}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" filter="url(#${filterId})"/>`);
  for (const v of [1.0, k75, k90]) { const [x0, y0] = polar(cx, cy, R * 0.74, ang(v)), [x1, y1] = polar(cx, cy, R * 1.12, ang(v)); o.push(`<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="${k.tx3}" stroke-width="1"/>`); }
  o.push(T(cx, cy + R * 0.12, `${Math.round(used * 100)}%`, { anchor: 'middle', size: Math.round(R * 0.5), weight: 800, fill: k.tx }));
  o.push(T(cx, cy + R + 14, t.sym, { anchor: 'middle', size: small ? 9 : 11, weight: 700, fill: k.tx }));
  const tg = TAG[t.tag] ?? String(t.tag ?? '').toUpperCase(), tc = t.tag === 'continue' ? k.up : t.tag === 'exhaust' ? k.gold : t.tag === 'fair' ? k.pur2 : k.tx3;
  o.push(T(cx, cy + R + 26, `${tg}${t.ratio ? ` · ${Number(t.ratio).toFixed(2)}×` : ''}`, { anchor: 'middle', size: 8, fill: tc, ls: 1 }));
  return o.join('');
}
export function dialsGrid(k, tiles, width = 360, id = 'dl') {
  const list = (tiles ?? []).filter(t => t?.clock && fin(t.clock.used)); if (!list.length) return '';
  const cols = 3, cw = width / cols, rows = Math.ceil(list.length / cols), Ht = rows * 112 + 4;
  const o = [svgOpen(width, Ht, 'Range used against the forecast median, by market'), `<defs>${glow(id, 2)}</defs>`];
  [...list].sort((a, b) => b.clock.used - a.clock.used).forEach((t, i) => o.push(dialShape(k, t, cw * (i % cols) + cw / 2, Math.floor(i / cols) * 112 + 40, 30, id, false)));
  return o.join('') + '</svg>';
}

// ── ranked bars (unusual now, yesterday's biggest moves) ───────────────────────────────────────────────────────
/** rows = [{ label, value (0..1 percentile or signed share), text, hot?, signed? }]. Left label, bar, right text: nothing is cut. */
export function rankedBars(k, rows, { width = 360, labelW = 150, textW = 62, ariaLabel = 'Ranked bars' } = {}) {
  if (!rows?.length) return '';
  const rh = 24, Ht = rows.length * rh + 6, bx = labelW, bw = width - labelW - textW, mid = bx + bw / 2;
  const o = [svgOpen(width, Ht, ariaLabel)];
  rows.forEach((r, i) => {
    const y = 4 + i * rh, v = Math.max(-1, Math.min(1, r.value));
    let lab = String(r.label); while (textWidth(lab, 10.5) > labelW - 6 && lab.includes(' ')) lab = lab.replace(/\s+\S+$/, '');   // shorten by whole words, never clip or ellipsis
    o.push(T(0, y + 14, lab, { size: 10.5, weight: 700, fill: k.tx }));
    o.push(`<rect x="${bx}" y="${y + 4}" width="${bw}" height="11" rx="5.5" fill="${k.bg3}"/>`);
    if (r.signed) {
      const w = Math.abs(v) * bw / 2, col = v >= 0 ? k.up : k.dn;
      o.push(`<rect x="${f1(v >= 0 ? mid : mid - w)}" y="${y + 4}" width="${f1(Math.max(2, w))}" height="11" rx="5.5" fill="${col}" fill-opacity=".85"/>`);
      o.push(`<line x1="${f1(mid)}" x2="${f1(mid)}" y1="${y + 1}" y2="${y + 18}" stroke="${k.tx3}" stroke-width="1"/>`);
    } else o.push(`<rect x="${bx}" y="${y + 4}" width="${f1(Math.max(3, bw * v))}" height="11" rx="5.5" fill="${r.hot ? k.gold : k.pur}" fill-opacity=".9"/>`);
    o.push(T(width, y + 14, r.text, { anchor: 'end', size: 10.5, weight: 700, fill: r.hot ? k.gold : k.tx2 }));
  });
  return o.join('') + '</svg>';
}

// ── the desk's morning read against a random-coin band ──────────────────────────────────────────────────────────
/** One score S against the placebo band (mean, sd, p95): an honest "inside the band" picture. */
export function scoreBand(k, { S, mean, sd, p95 }, width = 360) {
  if (![S, mean, sd, p95].every(fin)) return '';
  const lo = Math.min(S, mean - 3 * sd) - 0.05, hi = Math.max(S, p95) + 0.12, X = v => 14 + (width - 28) * (v - lo) / (hi - lo), Ht = 76;
  const o = [svgOpen(width, Ht, 'The desk score against the band a random coin produces')];
  o.push(`<rect x="14" y="30" width="${width - 28}" height="14" rx="7" fill="${k.bg3}"/>`);
  o.push(`<rect x="${f1(X(mean - sd))}" y="30" width="${f1(X(mean + sd) - X(mean - sd))}" height="14" fill="${k.pur}" fill-opacity=".45"/>`);
  o.push(`<rect x="${f1(X(mean - 2 * sd))}" y="33" width="${f1(X(mean + 2 * sd) - X(mean - 2 * sd))}" height="8" fill="${k.pur}" fill-opacity=".22"/>`);
  o.push(`<line x1="${f1(X(p95))}" x2="${f1(X(p95))}" y1="24" y2="50" stroke="${k.gold}" stroke-width="1.6" stroke-dasharray="3 3"/>`);
  o.push(T(X(p95), 20, 'random coin, 95th', { anchor: 'middle', size: 8.5, fill: k.gold }));
  o.push(`<circle cx="${f1(X(S))}" cy="37" r="7" fill="${S > p95 ? k.up : k.tx}" stroke="${k.bg1}" stroke-width="2"/>`);
  o.push(T(X(S), 66, `desk ${fmt(S, 2)}`, { anchor: 'middle', size: 11, weight: 800, fill: k.tx }));
  return o.join('') + '</svg>';
}

// ── the day's range: median, 75th and 90th percentile days, with the live price ─────────────────────────────────
/** m = { price, open, up: {p50,p75,p90} %, down: {p50,p75,p90} %, high, low } all in price units except the % ladders. */
export function rangeBand(k, m, width = 360) {
  if (!m || !fin(m.price) || !m.up || !m.down) return '';
  const Ht = 150, l = 16, r = 16, P = m.open ?? m.price, U = m.up, D = m.down;
  const hi = P * (1 + U.p90 / 100), lo = P * (1 - D.p90 / 100), pad = (hi - lo) * 0.08, a = lo - pad, b = hi + pad;
  const Y = v => 18 + (Ht - 40) * (1 - (v - a) / (b - a)), x0 = l + 54, x1 = width - r;
  const o = [svgOpen(width, Ht, 'The forecast range of the session from its open, with the price now')];
  for (const [side, rung, lbl] of [['up', U, 'p90'], ['up', U, 'p75'], ['up', U, 'p50']]) { const v = P * (1 + rung[lbl] / 100); o.push(`<line x1="${x0}" x2="${x1}" y1="${f1(Y(v))}" y2="${f1(Y(v))}" stroke="${k.pur2}" stroke-opacity="${lbl === 'p50' ? 0.9 : lbl === 'p75' ? 0.6 : 0.35}" stroke-dasharray="${lbl === 'p50' ? 'none' : '4 4'}"/>`); o.push(T(l, Y(v) + 3, `${lbl} ${f1(v, v > 1000 ? 0 : v > 100 ? 1 : 4)}`, { size: 9, fill: k.tx2 })); }
  for (const lbl of ['p50', 'p75', 'p90']) { const v = P * (1 - D[lbl] / 100); o.push(`<line x1="${x0}" x2="${x1}" y1="${f1(Y(v))}" y2="${f1(Y(v))}" stroke="${k.pur2}" stroke-opacity="${lbl === 'p50' ? 0.9 : lbl === 'p75' ? 0.6 : 0.35}" stroke-dasharray="${lbl === 'p50' ? 'none' : '4 4'}"/>`); o.push(T(l, Y(v) + 3, `${lbl} ${f1(v, v > 1000 ? 0 : v > 100 ? 1 : 4)}`, { size: 9, fill: k.tx2 })); }
  o.push(`<line x1="${x0}" x2="${x1}" y1="${f1(Y(P))}" y2="${f1(Y(P))}" stroke="${k.tx3}" stroke-width="1"/>`); o.push(T(x1, Y(P) - 4, 'open', { anchor: 'end', size: 8.5, fill: k.tx3 }));
  if (fin(m.high) && fin(m.low)) o.push(`<rect x="${f1(x0 + 8)}" y="${f1(Y(m.high))}" width="12" height="${f1(Math.max(2, Y(m.low) - Y(m.high)))}" rx="5" fill="${k.pur}" fill-opacity=".8"/>`);
  o.push(`<line x1="${x0}" x2="${x1}" y1="${f1(Y(m.price))}" y2="${f1(Y(m.price))}" stroke="${k.gold}" stroke-width="2.2"/>`);
  o.push(T(x1, Y(m.price) + 12, `now ${f1(m.price, m.price > 1000 ? 1 : 4)}`, { anchor: 'end', size: 10, weight: 800, fill: k.gold }));
  return o.join('') + '</svg>';
}

// ── ghost paths: past sessions in units of the forecast median range ────────────────────────────────────────────
/** paths = [{ pts: [[minutesFromOpen, value]], label }] values in forecast-median-range units from the open; today = same shape or null. */
export function ghostPaths(k, paths, today, width = 360, height = 190, id = 'gp') {
  const all = [...paths, ...(today ? [today] : [])].filter(p => p?.pts?.length); if (!all.length) return '';
  const vals = all.flatMap(p => p.pts.map(q => q[1])), m = Math.max(1, ...vals.map(Math.abs)), l = 34, r = 10, t = 12, b = 22, maxT = Math.max(...all.flatMap(p => p.pts.map(q => q[0])), 60);
  const X = tm => l + (width - l - r) * tm / maxT, Y = v => t + (height - t - b) * (1 - (v + m) / (2 * m));
  const o = [svgOpen(width, height, 'The last sessions from their open, in units of the forecast median range'), `<defs>${glow(id)}</defs>`];
  for (const g of [-1, -0.5, 0, 0.5, 1]) if (Math.abs(g) <= m) { o.push(`<line x1="${l}" x2="${width - r}" y1="${f1(Y(g))}" y2="${f1(Y(g))}" stroke="${k.line}" stroke-dasharray="${g === 0 ? 'none' : '2 4'}"/>`); o.push(T(l - 5, Y(g) + 3, fmt(g, 1), { anchor: 'end', size: 9, fill: k.tx3 })); }
  paths.forEach((p, i) => o.push(`<polyline points="${p.pts.map(q => `${f1(X(q[0]))},${f1(Y(q[1]))}`).join(' ')}" fill="none" stroke="${k.pur2}" stroke-opacity="${f1(0.16 + 0.05 * (paths.length - i > 6 ? 0 : 6 - (paths.length - i)), 2)}" stroke-width="1.3"/>`));
  if (today?.pts?.length) { o.push(`<polyline points="${today.pts.map(q => `${f1(X(q[0]))},${f1(Y(q[1]))}`).join(' ')}" fill="none" stroke="${k.gold}" stroke-width="2.6" stroke-linejoin="round" filter="url(#${id})"/>`); const e = today.pts[today.pts.length - 1]; o.push(`<circle cx="${f1(X(e[0]))}" cy="${f1(Y(e[1]))}" r="4" fill="${k.gold}"/>`); }
  o.push(T(width / 2, height - 5, 'hours from the London open', { anchor: 'middle', size: 8.5, fill: k.tx3 }));
  for (const h of [0, 4, 8, 12]) if (h * 60 <= maxT) o.push(T(X(h * 60), height - 14, String(h), { anchor: 'middle', size: 8.5, fill: k.tx3 }));
  return o.join('') + '</svg>';
}

// ── option levels against price (a level ladder, in forecast σ) ─────────────────────────────────────────────────
/** levels = [{ label, price }]; price = the live price; unit = the σ in price units (for the right-hand "+0.7σ" note). */
export function levelLadder(k, levels, price, unit, width = 360) {
  const ls = (levels ?? []).filter(l => fin(l.price)); if (!ls.length || !fin(price)) return '';
  const all = [...ls.map(l => l.price), price], a = Math.min(...all), b = Math.max(...all), pad = (b - a) * 0.12 || 1, lo = a - pad, hi = b + pad;
  const Ht = 196, Y = v => 10 + (Ht - 20) * (1 - (v - lo) / (hi - lo)), x0 = 108, x1 = width - 74;
  const rows = [...ls, { label: 'price now', price, now: true }].sort((p, q) => q.price - p.price);
  // push apart labels that would overlap (a label is 12 units high)
  let last = -99; const ys = rows.map(r => { let y = Y(r.price); if (y - last < 13) y = last + 13; last = y; return y; });
  const o = [svgOpen(width, Ht, 'Option levels against the price now')];
  o.push(`<line x1="${x0}" x2="${x0}" y1="6" y2="${Ht - 6}" stroke="${k.line}"/>`);
  rows.forEach((r, i) => {
    const y = Y(r.price), yl = ys[i], col = r.now ? k.gold : k.pur2;
    o.push(`<line x1="${x0 - 6}" x2="${x1}" y1="${f1(y)}" y2="${f1(y)}" stroke="${col}" stroke-width="${r.now ? 2.4 : 1.4}" stroke-opacity="${r.now ? 1 : 0.7}" stroke-dasharray="${r.now ? 'none' : '5 4'}"/>`);
    o.push(T(x0 - 10, yl + 3, r.label, { anchor: 'end', size: 9.5, weight: r.now ? 800 : 600, fill: r.now ? k.gold : k.tx2 }));
    const d = r.price - price, s = unit > 0 && !r.now ? `${fmt(d / unit, 1)}σ` : '';
    o.push(T(x1 + 6, yl + 3, r.now ? f1(r.price, r.price > 1000 ? 1 : 4) : `${f1(r.price, r.price > 1000 ? 0 : 3)} ${s}`.trim(), { size: 9, weight: r.now ? 800 : 500, fill: r.now ? k.gold : k.tx2 }));
  });
  return o.join('') + '</svg>';
}

// ── poster-only pieces ───────────────────────────────────────────────────────────────────────────────────────────
/** The currency wheel: eight spokes, outer bar = the 1-week strength, inner bar = the 4-hour. */
export function wheel(k, S, cx, cy, filterId) {
  const H = S?.horizons ?? {}, w1 = H['1W']?.available ? Object.fromEntries(H['1W'].scores.map(x => [x.ccy, x.score])) : null, h4 = H['4H']?.available ? Object.fromEntries(H['4H'].scores.map(x => [x.ccy, x.score])) : {};
  if (!w1) return '';
  const order = Object.keys(w1).sort((a, b) => w1[b] - w1[a]), r0 = 96, rmax = 240, o = [];
  for (const ring of [r0, r0 + (rmax - r0) / 3, r0 + 2 * (rmax - r0) / 3, rmax]) o.push(`<circle cx="${cx}" cy="${cy}" r="${f1(ring, 0)}" fill="none" stroke="${k.line}" stroke-dasharray="2 6"/>`);
  o.push(T(cx, cy - 6, 'STRENGTH', { anchor: 'middle', size: 15, fill: k.tx3, ls: 3 }), T(cx, cy + 18, '1W outer · 4H inner', { anchor: 'middle', size: 13, fill: k.tx3 }));
  order.forEach((c, i) => {
    const a = -90 + 360 * i / order.length, v1 = w1[c], v4 = h4[c];
    const col = v1 > 0 ? k.up : k.dn, len = r0 + (rmax - r0) * Math.min(Math.abs(v1) / 4, 1), [x0, y0] = polar(cx, cy, r0, a), [x1, y1] = polar(cx, cy, len, a);
    o.push(`<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="${col}" stroke-width="22" stroke-linecap="round" stroke-opacity=".9" filter="url(#${filterId})"/>`);
    if (fin(v4)) { const l4 = r0 + (rmax - 70 - r0) * Math.min(Math.abs(v4) / 2.5, 1), [x2, y2] = polar(cx, cy, l4, a); o.push(`<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${k.tx}" stroke-width="5" stroke-linecap="round" stroke-opacity=".85"/>`); }
    const [lx, ly] = polar(cx, cy, rmax + 44, a);
    o.push(T(lx, ly + 6, c, { anchor: 'middle', size: 26, weight: 800, fill: k.tx }), T(lx, ly + 26, `${fmt(v1)}σ`, { anchor: 'middle', size: 15, fill: col }));
  });
  return o.join('');
}
/** A next-24-hours strip: dots for the releases, left to right in time, each with its UTC time and a short name (names are wrapped by the caller). */
export function eventStrip(k, items, width = 360, height = 96) {
  const list = (items ?? []).filter(i => fin(i.hours)); if (!list.length) return '';
  const l = 14, r = 14, X = h => l + (width - l - r) * Math.min(Math.max(h, 0), 30) / 30, o = [svgOpen(width, height, 'Releases in the next 30 hours')];
  o.push(`<line x1="${l}" x2="${width - r}" y1="34" y2="34" stroke="${k.line}" stroke-width="2"/>`);
  for (const h of [0, 6, 12, 18, 24, 30]) { o.push(`<line x1="${f1(X(h))}" x2="${f1(X(h))}" y1="30" y2="38" stroke="${k.tx3}"/>`); o.push(T(X(h), 52, h === 0 ? 'now' : `+${h}h`, { anchor: 'middle', size: 8.5, fill: k.tx3 })); }
  list.slice(0, 4).forEach((i, n) => { const x = X(i.hours); o.push(`<circle cx="${f1(x)}" cy="34" r="6" fill="${k.gold}"/>`); o.push(T(Math.min(Math.max(x, 40), width - 40), 72 + (n % 2) * 12, i.label, { anchor: 'middle', size: 9.5, weight: 700, fill: k.tx })); });
  return o.join('') + '</svg>';
}
export { glow, glowU, svgOpen, T, fin };
