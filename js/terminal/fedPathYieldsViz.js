/**
 * Fed path against the yields: the three drawings (inline SVG strings). Pure: no DOM, no clock. Every colour is a theme token
 * (var(--x)), so a theme change repaints them with no redraw; motion is CSS (js/terminal/terminal-tabs.css, .fpy-*) and is off under
 * prefers-reduced-motion. Every mark sits on one scale per drawing and every label names a value the drawing reaches.
 *
 *   pathRibbonSvg(res, zq)   the priced policy path over the next meetings as a glowing ribbon, the earlier strips as ghosts, the gap
 *                            to the chosen one shaded. A thin contract ends the solid line (dashed after it, hollow marks).
 *   curveSvg(board)          the Treasury curve now, with the curve 1D / 5D / 20D ago as a ghost the pills switch between, the gap shaded.
 *                            The earlier curves are the level minus the change over that span, per tenor: exact, not fitted.
 *   flowSvg(res)             the 2Y's move split into the part the futures path accounts for and the rest, as two ribbons from one node,
 *                            on ONE bp scale across the windows, so the three rows compare.
 */
import { pricedRateOn, liquidPrefix } from '../fedPathYieldsCore.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f = v => (Math.round(v * 10) / 10).toString();
const fin = v => v != null && Number.isFinite(+v);
const bp = v => (!fin(v) ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}bp`);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dlab = d => `${MON[+String(d).slice(5, 7) - 1] ?? ''} ${+String(d).slice(8, 10)}`;
const DAY = 864e5, ts = d => Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`);

/** A smooth path through points (Catmull-Rom to cubic Bezier), the way the terminal's other curves are drawn. */
export function smooth(pts, t = 0.5) {
  if (pts.length < 2) return '';
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t / 3 * 1, p1[1] + (p2[1] - p0[1]) * t / 3 * 1], c2 = [p2[0] - (p3[0] - p1[0]) * t / 3, p2[1] - (p3[1] - p1[1]) * t / 3];
    d += `C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

const DEFS = `<defs><filter id="fpy-glow" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="3.2"/></filter>
<linearGradient id="fpy-fan" x1="0" x2="1" y1="0" y2="0"><stop offset="0" style="stop-color:var(--pur);stop-opacity:.05"/><stop offset="1" style="stop-color:var(--pur);stop-opacity:.34"/></linearGradient></defs>`;

/** 1. The priced path as a ribbon. res = fedPathYields(...); zq = the strip ({asOf, meetings, weekAgo, ago}). */
export function pathRibbonSvg(res, zq, { maxMeetings = 6 } = {}) {
  const now = (zq?.meetings ?? []).filter(m => m && fin(m.rAfter) && fin(m.rBefore) && m.meeting >= String(zq.asOf).slice(0, 10)).slice(0, maxMeetings);
  if (now.length < 2) return '';
  const asOf = String(zq.asOf).slice(0, 10), liquidDates = new Set(liquidPrefix(now).map(m => m.meeting));
  const W = 560, H = 230, L = 44, R = 22, T = 26, B = 38;
  const xs = i => L + (i / now.length) * (W - L - R);                      // slot 0 = today, slot i = after meeting i
  const series = [{ id: 'now', strip: zq, label: 'now' }];
  for (const w of res?.windows ?? []) {
    if (!w.available) continue;
    const s = w.win === 5 ? zq.weekAgo : zq.ago?.[w.span];
    if (s?.meetings?.length) series.push({ id: `w${w.win}`, strip: s, label: `${w.label} ago`, win: w.win, asOf: String(s.asOf).slice(5, 10) });
  }
  const val = (s, i) => (i === 0 ? pricedRateOn(s.strip, asOf, new Set(now.map(m => m.meeting))) : (s.strip.meetings ?? []).find(m => m.meeting === now[i - 1].meeting)?.rAfter);
  const lines = series.map(s => ({ ...s, v: Array.from({ length: now.length + 1 }, (_, i) => val(s, i)) })).filter(s => s.v.every(fin));
  if (!lines.length || lines[0].id !== 'now') return '';
  const all = lines.flatMap(s => s.v);
  let lo = Math.min(...all), hi = Math.max(...all); if (hi - lo < 0.2) { const c = (hi + lo) / 2; lo = c - 0.1; hi = c + 0.1; }
  const pad = (hi - lo) * 0.18; lo -= pad; hi += pad;
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const pts = s => s.v.map((v, i) => [xs(i), y(v)]);
  const grid = [0, 1, 2].map(k => { const v = lo + (hi - lo) * (k / 2); return `<line x1="${L}" x2="${W - R}" y1="${f(y(v))}" y2="${f(y(v))}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${f(y(v) + 3.5)}" text-anchor="end" font-size="10" fill="var(--tx3)" font-family="var(--mono)">${v.toFixed(2)}</text>`; }).join('');
  const xl = [`<text x="${f(xs(0))}" y="${H - 14}" text-anchor="middle" font-size="10" fill="var(--tx3)" font-family="var(--mono)">${esc(dlab(asOf))}</text>`, ...now.map((m, i) => `<text x="${f(xs(i + 1))}" y="${H - 14}" text-anchor="middle" font-size="10" fill="var(--tx3)" font-family="var(--mono)">${esc(dlab(m.meeting))}</text>`)].join('');
  const main = lines[0], ref = lines.find(s => s.win === 5) ?? lines[1] ?? null;
  const fan = ref ? `<path class="fpy-fan" d="${smooth(pts(main))}L${pts(ref).slice().reverse().map(p => `${f(p[0])},${f(p[1])}`).join('L')}Z" fill="url(#fpy-fan)"><title>gap between now and ${esc(ref.label)}</title></path>` : '';
  const ghosts = lines.slice(1).map((s, k) => `<path d="${smooth(pts(s))}" fill="none" stroke="${s === ref ? 'var(--pur2)' : 'var(--tx3)'}" stroke-width="${s === ref ? 1.8 : 1.2}" stroke-dasharray="${s === ref ? '5 4' : '2 4'}" opacity="${s === ref ? 1 : 0.8}"><title>the same contracts ${esc(s.label)}${s.asOf ? ` (${esc(s.asOf)})` : ''}</title></path>`).join('');
  // the solid ribbon runs to the first thin contract, then dashes (held flat there)
  const nLiq = liquidPrefix(now).length, cut = Math.min(now.length, nLiq);   // slots 0..cut are liquid
  const P = pts(main);
  const solid = cut >= 1 ? smooth(P.slice(0, cut + 1)) : '';
  const dashed = cut < now.length ? smooth(P.slice(Math.max(0, cut))) : '';
  const ribbon = (d, cls, dash) => (d ? `<path class="${cls}" d="${d}" pathLength="1" fill="none" stroke="var(--gold)" stroke-width="${cls === 'fpy-glow' ? 7 : 2.8}" stroke-linecap="round"${dash ? ' stroke-dasharray="1 .02"' : ''}${cls === 'fpy-glow' ? ' filter="url(#fpy-glow)" opacity=".5"' : ''}/>` : '');
  const glow = `${solid ? `<path class="fpy-glowline fpy-sweep" d="${solid}" pathLength="1" fill="none" stroke="var(--gold)" stroke-width="8" stroke-linecap="round" filter="url(#fpy-glow)" opacity=".45"/>` : ''}`;
  const line = `${solid ? `<path class="fpy-sweep" d="${solid}" pathLength="1" fill="none" stroke="var(--gold)" stroke-width="2.8" stroke-linecap="round"/>` : ''}${dashed ? `<path d="${dashed}" fill="none" stroke="var(--gold)" stroke-width="2.2" stroke-dasharray="3 5" opacity=".75"><title>past here the contracts traded almost nothing: the price is stale, so the rate is held flat</title></path>` : ''}`;
  void ribbon;
  const dots = P.map((p, i) => { const thin = i > cut; const m = main.v[i]; const lab = `${m.toFixed(2)}%`; return `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${i === 0 ? 3.4 : 4.2}" fill="${thin || i === 0 ? 'var(--bg)' : 'var(--gold)'}" stroke="var(--gold)" stroke-width="1.8"><title>${esc(i === 0 ? `priced today ${lab}` : `after ${dlab(now[i - 1].meeting)}: ${lab}${thin ? ' (thin contract)' : ''}`)}</title></circle>${i > 0 ? `<text x="${f(p[0])}" y="${f(p[1] - 11)}" text-anchor="middle" font-size="10.5" fill="var(--tx)" font-family="var(--mono)">${lab}</text>` : ''}`; }).join('');
  const leg = [['now', 'var(--gold)', ''], ...lines.slice(1).map(s => [`${s.label}${s.asOf ? ` ${s.asOf}` : ''}`, s === ref ? 'var(--pur2)' : 'var(--tx3)', s === ref ? '5 3' : '2 3'])].map(([n, c, d]) => `<span style="display:inline-flex;align-items:center;gap:6px"><svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" stroke="${c}" stroke-width="2"${d ? ` stroke-dasharray="${d}"` : ''}/></svg>${esc(n)}</span>`).join('');
  return `<svg class="fpy-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Priced fed funds rate after each of the next meetings, now against earlier strips">${DEFS}${grid}${xl}${fan}${ghosts}${glow}${line}${dots}</svg><div class="fpy-leg">${leg}</div>`;
}

/** 2. The Treasury curve with a ghost for 1D / 5D / 20D ago, switched by radio pills (pure CSS, no script). */
export function curveSvg(board, { idp = 'fpyc' } = {}) {
  const tn = (board?.tenors ?? []).filter(t => fin(t.level));
  if (tn.length < 3) return '';
  const W = 560, H = 230, L = 44, R = 26, T = 26, B = 34;
  const specs = [[1, '1D', 'chg1d'], [5, '5D', 'chg7d'], [20, '20D', 'chg28d']];
  const ghosts = specs.map(([win, label, key]) => ({ win, label, v: tn.map(t => (fin(t[key]) ? t.level - t[key] / 100 : null)) })).filter(g => g.v.every(fin));
  const now = tn.map(t => t.level);
  const all = [...now, ...ghosts.flatMap(g => g.v)];
  let lo = Math.min(...all), hi = Math.max(...all); if (hi - lo < 0.2) { const c = (hi + lo) / 2; lo = c - 0.1; hi = c + 0.1; }
  const pad = (hi - lo) * 0.2; lo -= pad; hi += pad;
  const x = i => L + (i / (tn.length - 1)) * (W - L - R), y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const P = v => v.map((a, i) => [x(i), y(a)]);
  const grid = [0, 1, 2].map(k => { const v = lo + (hi - lo) * (k / 2); return `<line x1="${L}" x2="${W - R}" y1="${f(y(v))}" y2="${f(y(v))}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${f(y(v) + 3.5)}" text-anchor="end" font-size="10" fill="var(--tx3)" font-family="var(--mono)">${v.toFixed(2)}</text>`; }).join('');
  const xl = tn.map((t, i) => `<text x="${f(x(i))}" y="${H - 12}" text-anchor="middle" font-size="10.5" fill="var(--tx3)" font-family="var(--mono)">${esc(String(t.k).toUpperCase())}</text>`).join('');
  const nowP = P(now);
  const g = ghosts.map(gh => { const gp = P(gh.v); return `<g class="fpy-gh fpy-gh-${gh.win}"><path d="${smooth(nowP)}L${gp.slice().reverse().map(p => `${f(p[0])},${f(p[1])}`).join('L')}Z" fill="url(#fpy-fan)"/><path d="${smooth(gp)}" fill="none" stroke="var(--pur2)" stroke-width="1.9" stroke-dasharray="5 4"><title>the curve ${esc(gh.label)} ago</title></path>${tn.map((t, i) => { const d = (now[i] - gh.v[i]) * 100; return `<text x="${f(x(i))}" y="${f(y(now[i]) - 12)}" text-anchor="middle" font-size="10" fill="var(--tx2)" font-family="var(--mono)">${bp(d)}</text>`; }).join('')}</g>`; }).join('');
  const line = `<path class="fpy-glowline fpy-sweep" d="${smooth(nowP)}" pathLength="1" fill="none" stroke="var(--tx)" stroke-width="8" stroke-linecap="round" filter="url(#fpy-glow)" opacity=".28"/><path class="fpy-sweep" d="${smooth(nowP)}" pathLength="1" fill="none" stroke="var(--tx)" stroke-width="2.6" stroke-linecap="round"/>`;
  const dots = nowP.map((p, i) => `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="3.8" fill="var(--tx)"><title>${esc(String(tn[i].k).toUpperCase())} ${now[i].toFixed(2)}%</title></circle>`).join('');
  const pills = ghosts.map((gh, i) => `<input type="radio" name="${idp}" id="${idp}-${gh.win}" class="fpy-r" ${gh.win === (ghosts.find(z => z.win === 5) ? 5 : ghosts[0].win) ? 'checked' : ''}><label for="${idp}-${gh.win}" class="fpy-pill">${esc(gh.label)}</label>`).join('');
  return `<div class="fpy-cv">${pills}<svg class="fpy-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="US Treasury curve now against a chosen earlier date">${DEFS}${grid}${xl}${g}${line}${dots}</svg><div class="fpy-leg"><span style="display:inline-flex;align-items:center;gap:6px"><svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" stroke="var(--tx)" stroke-width="2.4"/></svg>now</span><span style="display:inline-flex;align-items:center;gap:6px"><svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" stroke="var(--pur2)" stroke-width="2" stroke-dasharray="5 3"/></svg>the pill's date; labels are the change in bp</span></div></div>`;
}

/** 3. The 2Y move as a flowing split. One bp scale across every window. */
export function flowSvg(res) {
  const ws = (res?.windows ?? []).filter(w => w.available && fin(w.y2) && fin(w.path) && fin(w.remainder));
  if (!ws.length) return '';
  const W = 700, rowH = 92, T = 10, X0 = 176, X1 = 440, Rw = 12, SPREAD = 9;
  const maxGross = Math.max(...ws.map(w => Math.abs(w.path) + Math.abs(w.remainder)), 1);
  const k = Math.min(1.6, (rowH - 40) / maxGross);               // px per bp, the same for every row
  const gap = 4, H = T + ws.length * rowH;
  let body = '';
  ws.forEach((w, r) => {
    const top = T + r * rowH + 2, a = Math.max(2, Math.abs(w.path) * k), b = Math.max(2, Math.abs(w.remainder) * k);
    const total = a + b + gap, y0 = top + (rowH - 6 - total) / 2;
    const opp = Math.sign(w.path) !== Math.sign(w.remainder) && w.remainder !== 0;
    // left node: the 2Y (height = the two parts stacked); right nodes: the futures path and the rest
    const ribbon = (ya, ha, yb, hb, fill, dash, op) => `<path d="M${X0},${f(ya)}C${f(X0 + 120)},${f(ya)} ${f(X1 - 120)},${f(yb)} ${X1},${f(yb)}L${X1},${f(yb + hb)}C${f(X1 - 120)},${f(yb + hb)} ${f(X0 + 120)},${f(ya + ha)} ${X0},${f(ya + ha)}Z" fill="${fill}" fill-opacity="${op}" stroke="${fill}" stroke-width="1"${dash ? ` stroke-dasharray="${dash}"` : ''} class="fpy-flow"/>`;
    const yPath = y0, yRest = y0 + a + gap, yPathR = y0 - SPREAD, yRestR = y0 + a + gap + SPREAD;   // the two ribbons leave one node and fan apart
    body += `<g><text x="6" y="${f(y0 + total / 2 + 4)}" font-size="12" fill="var(--tx3)" font-family="var(--mono)">${esc(w.label)}</text>
<rect x="${X0 - Rw}" y="${f(y0)}" width="${Rw}" height="${f(total)}" rx="2" fill="var(--tx)" fill-opacity=".85"><title>2Y ${bp(w.y2)}</title></rect>
${ribbon(yPath, a, yPathR, a, 'var(--pur)', '', 0.5)}${ribbon(yRest, b, yRestR, b, 'var(--gold)', opp ? '4 3' : '', opp ? 0.18 : 0.5)}
<rect x="${X1}" y="${f(yPathR)}" width="${Rw}" height="${f(a)}" rx="2" fill="var(--pur)"><title>the futures path ${bp(w.path)}</title></rect>
<rect x="${X1}" y="${f(yRestR)}" width="${Rw}" height="${f(b)}" rx="2" fill="var(--gold)"><title>the rest ${bp(w.remainder)}</title></rect>
<text x="${X0 - Rw - 8}" y="${f(y0 + total / 2 + 4)}" text-anchor="end" font-size="12" fill="var(--tx)" font-family="var(--mono)">2Y ${bp(w.y2)}</text>
<text x="${X1 + Rw + 8}" y="${f(yPathR + a / 2 + 4)}" font-size="11.5" fill="var(--tx)" font-family="var(--mono)">futures path ${bp(w.path)}${w.share != null ? ` · ${Math.round(w.share * 100)}%` : ''}</text>
<text x="${X1 + Rw + 8}" y="${f(yRestR + b / 2 + 4)}" font-size="11.5" fill="var(--tx2)" font-family="var(--mono)">${opp ? 'offset' : 'term premium etc.'} ${bp(w.remainder)}</text></g>`;
  });
  return `<svg class="fpy-svg" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:820px" role="img" aria-label="The 2-year yield move split into the part the priced fed funds path accounts for and the rest">${body}</svg><div class="fpy-leg"><span>one scale for all rows: ribbon thickness is the size in bp</span><span>a dashed pale ribbon means the rest moved the opposite way (an offset)</span></div>`;
}

export { esc as _esc, DAY, ts };
