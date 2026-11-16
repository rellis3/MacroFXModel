/**
 * Replay of the yield curve: one SVG string for one frame. Pure (strings in, string out); every colour is a theme token, so a theme change repaints it.
 * The y axis is fixed for the whole replay (curveBounds), so the picture never jumps; faint ghosts of the earlier days sit behind the glowing current
 * curve, the first day is a dashed outline, and a strip underneath carries the 2s10s slope through the window with a marker on the current day.
 * Under reduced motion there are no ghosts fading in and no glow blur: the frame is drawn plainly.
 */
import { esc, fin } from './boardViz.js';

const f1 = v => (Math.round(v * 10) / 10).toString();
let n = 0;

export function curveStage(frames, i, { w = 560, h = 330, bounds, reduced = false } = {}) {
  const f = frames?.[i];
  if (!f || !bounds) return '<p class="muted">Nothing to draw for this day.</p>';
  const ks = f.data.pts.map(p => p.k), L = 44, R = 14, T = 14, plotH = 210, stripTop = T + plotH + 34, stripH = 46;
  const x = k => L + (ks.indexOf(k) / (ks.length - 1)) * (w - L - R);
  const y = v => T + (1 - (v - bounds.lo) / (bounds.hi - bounds.lo)) * plotH;
  const id = `rcg${++n}`;
  const path = fr => fr.data.pts.map((p, j) => `${j ? 'L' : 'M'}${f1(x(p.k))},${f1(y(p.v))}`).join('');
  // y grid: about five labelled values, all inside the scale
  const step = (bounds.hi - bounds.lo) > 3 ? 1 : (bounds.hi - bounds.lo) > 1.5 ? 0.5 : 0.25;
  const grid = [];
  for (let v = Math.ceil(bounds.lo / step) * step; v <= bounds.hi + 1e-9; v += step) grid.push(Math.round(v * 100) / 100);
  const gridSvg = grid.map(v => `<line x1="${L}" x2="${w - R}" y1="${f1(y(v))}" y2="${f1(y(v))}" stroke="var(--line2)" stroke-width="1" stroke-opacity=".5"/><text x="${L - 6}" y="${f1(y(v) + 3.5)}" text-anchor="end" font-size="10" fill="var(--tx3)" font-family="var(--mono)">${v.toFixed(step < 0.5 ? 2 : 1)}</text>`).join('');
  const xl = ks.map(k => `<text x="${f1(x(k))}" y="${T + plotH + 16}" text-anchor="middle" font-size="11" fill="var(--tx2)" font-family="var(--mono)">${esc(k)}</text>`).join('');
  // ghosts: up to 14 earlier days spread over the elapsed window; older = fainter
  const ghosts = [];
  if (i > 0 && !reduced) {
    const g = Math.min(14, i), stride = i / g;
    for (let q = 0; q < g; q++) ghosts.push(frames[Math.floor(q * stride)]);
  }
  const ghostSvg = ghosts.map((fr, q) => `<path d="${path(fr)}" fill="none" stroke="var(--pur2)" stroke-width="1.2" stroke-opacity="${(0.08 + 0.22 * ((q + 1) / ghosts.length)).toFixed(2)}" stroke-linejoin="round"/>`).join('');
  const first = i > 0 ? `<path d="${path(frames[0])}" fill="none" stroke="var(--tx2)" stroke-width="1.4" stroke-dasharray="4 4" stroke-opacity=".7"/>` : '';
  const cur = path(f);
  const dots = f.data.pts.map(p => `<circle cx="${f1(x(p.k))}" cy="${f1(y(p.v))}" r="4.5" fill="var(--bg1)" stroke="var(--gold)" stroke-width="2"/><text x="${f1(x(p.k))}" y="${f1(y(p.v) - 11)}" text-anchor="middle" font-size="10.5" fill="var(--tx)" font-family="var(--mono)">${p.v.toFixed(2)}</text>`).join('');
  // the 2s10s strip across the whole window, marker on the current day
  const sl = frames.map(fr => fr.data.s2s10), lo = Math.min(0, ...sl), hi = Math.max(0, ...sl), span = (hi - lo) || 1;
  const sx = j => L + (frames.length < 2 ? 0 : (j / (frames.length - 1)) * (w - L - R)), sy = v => stripTop + (1 - (v - lo) / span) * stripH;
  const sline = sl.map((v, j) => `${j ? 'L' : 'M'}${f1(sx(j))},${f1(sy(v))}`).join('');
  const cs = sl[i], inverted = fin(cs) && cs < 0;
  const strip = `<line x1="${L}" x2="${w - R}" y1="${f1(sy(0))}" y2="${f1(sy(0))}" stroke="var(--dn)" stroke-width="1" stroke-dasharray="3 3" stroke-opacity=".6"/>
<path d="${sline}" fill="none" stroke="var(--tx2)" stroke-width="1.6" stroke-linejoin="round"/>
<circle cx="${f1(sx(i))}" cy="${f1(sy(cs))}" r="5" fill="${inverted ? 'var(--dn)' : 'var(--gold)'}" stroke="var(--bg1)" stroke-width="1.5"/>
<text x="${L - 6}" y="${f1(sy(0) + 3.5)}" text-anchor="end" font-size="10" fill="var(--tx3)" font-family="var(--mono)">0</text>
<text x="${L}" y="${stripTop - 6}" font-size="10.5" fill="var(--tx2)">2y to 10y slope through the window (bp): <tspan fill="${inverted ? 'var(--dn)' : 'var(--tx)'}" font-family="var(--mono)">${cs > 0 ? '+' : cs < 0 ? '−' : ''}${Math.abs(cs)}bp</tspan></text>`;
  const H = stripTop + stripH + 10;
  return `<svg class="rpv-svg" viewBox="0 0 ${w} ${H}" width="100%" role="img" aria-label="The Treasury curve on ${esc(f.t)}: ${f.data.pts.map(p => `${p.k} ${p.v.toFixed(2)} percent`).join(', ')}"><defs><filter id="${id}"><feGaussianBlur stdDeviation="3.5"/></filter></defs>
${gridSvg}${xl}${ghostSvg}${first}
${reduced ? '' : `<path d="${cur}" fill="none" stroke="var(--pur2)" stroke-width="6" stroke-opacity=".45" stroke-linejoin="round" filter="url(#${id})"/>`}
<path d="${cur}" fill="none" stroke="var(--pur2)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>${dots}${strip}
<text x="${w - R}" y="${T - 2}" text-anchor="end" font-size="10" fill="var(--tx3)">dashed = first day · faint = earlier days · percent</text></svg>`;
}
