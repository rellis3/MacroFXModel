/**
 * Replay of the growth and inflation regime: one SVG string for one month. Pure; every colour is a theme token. A four-cell quadrant (growth across,
 * inflation up) on ONE scale for the whole window, a faint trail of every earlier month in the window with the last twelve stronger, the current month
 * glowing, and a strip underneath coloured by regime with the current month marked. Describes where the economy has been in the cycle; the structure of the
 * regime as a predictor of direction is not a claim made here.
 */
import { esc } from './boardViz.js';
import { REGIME_NAME, regimeBound, monthLabel } from '../replayVizCore.js';

const f1 = v => (Math.round(v * 10) / 10).toString();
const COL = { goldilocks: 'var(--up)', reflation: 'var(--gold)', stagflation: 'var(--dn)', deflation: 'var(--blue)' };
let n = 0;

export function regimeStage(frames, i, { w = 560, reduced = false } = {}) {
  const f = frames?.[i]; if (!f) return '<p class="muted">Nothing to draw for this month.</p>';
  const B = regimeBound(frames), id = `rrg${++n}`;
  const L = 46, T = 14, qw = w - L - 14, qh = 250, cx = L + qw / 2, cy = T + qh / 2;
  const x = v => cx + (Math.max(-B, Math.min(B, v)) / B) * (qw / 2 - 6), y = v => cy - (Math.max(-B, Math.min(B, v)) / B) * (qh / 2 - 6);
  const cell = (name, key, x0, y0) => {
    const on = f.data.regime === key;
    return `<rect x="${x0}" y="${y0}" width="${f1(qw / 2 - 1)}" height="${f1(qh / 2 - 1)}" rx="8" fill="${COL[key]}" fill-opacity="${on ? '.2' : '.07'}"/><text x="${f1(x0 + 10)}" y="${f1(y0 + 18)}" font-size="${on ? 13 : 11.5}" font-weight="${on ? 700 : 500}" fill="${on ? 'var(--tx)' : 'var(--tx3)'}">${esc(name)}</text>`;
  };
  const cells = cell('Reflation', 'reflation', cx + 1, T) + cell('Stagflation', 'stagflation', L, T) + cell('Goldilocks', 'goldilocks', cx + 1, cy + 1) + cell('Slowdown', 'deflation', L, cy + 1);
  const pts = frames.slice(0, i + 1).map(fr => [x(fr.data.growth), y(fr.data.inflation), fr.data.regime]);
  const trail = [];
  for (let k = 1; k < pts.length; k++) {
    const recent = pts.length - 1 - k < 12;
    trail.push(`<line x1="${f1(pts[k - 1][0])}" y1="${f1(pts[k - 1][1])}" x2="${f1(pts[k][0])}" y2="${f1(pts[k][1])}" stroke="var(--tx2)" stroke-width="${recent ? 1.8 : 1}" stroke-opacity="${reduced ? (recent ? '.7' : '.3') : (recent ? (0.3 + 0.6 * (1 - (pts.length - 1 - k) / 12)).toFixed(2) : '.18')}"/>`);
  }
  const dots = pts.slice(-12).map((p, k, a) => `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${k === a.length - 1 ? 0 : 2.6}" fill="${COL[p[2]]}" fill-opacity=".85"/>`).join('');
  const head = pts[pts.length - 1], hc = COL[f.data.regime];
  const sy = T + qh + 26, cw = (w - L - 14) / frames.length;
  const strip = frames.map((fr, k) => `<rect x="${f1(L + k * cw)}" y="${sy}" width="${f1(Math.max(1, cw - 0.6))}" height="14" fill="${COL[fr.data.regime]}" fill-opacity="${k <= i ? '.85' : '.25'}"/>`).join('');
  const H = sy + 36;
  return `<svg class="rpv-svg" viewBox="0 0 ${w} ${H}" width="100%" role="img" aria-label="Growth and inflation in ${esc(monthLabel(f.data.m))}: ${esc(REGIME_NAME[f.data.regime])}, growth ${f.data.growth.toFixed(2)}, inflation ${f.data.inflation.toFixed(2)}"><defs><filter id="${id}"><feGaussianBlur stdDeviation="4"/></filter></defs>
${cells}<line x1="${L}" x2="${L + qw}" y1="${f1(cy)}" y2="${f1(cy)}" stroke="var(--line2)" stroke-width="1.2"/><line x1="${f1(cx)}" x2="${f1(cx)}" y1="${T}" y2="${T + qh}" stroke="var(--line2)" stroke-width="1.2"/>
<text x="${L + qw}" y="${f1(cy - 5)}" text-anchor="end" font-size="9.5" fill="var(--tx3)">growth above trend →</text><text x="${L + 4}" y="${f1(cy - 5)}" font-size="9.5" fill="var(--tx3)">← below</text><text x="${f1(cx + 5)}" y="${T + 10}" font-size="9.5" fill="var(--tx3)">inflation up</text>
${trail.join('')}${dots}
${reduced ? '' : `<circle cx="${f1(head[0])}" cy="${f1(head[1])}" r="12" fill="${hc}" fill-opacity=".45" filter="url(#${id})"/>`}<circle cx="${f1(head[0])}" cy="${f1(head[1])}" r="6" fill="${hc}" stroke="var(--bg1)" stroke-width="2"/>
<text x="${L}" y="${sy - 7}" font-size="10" fill="var(--tx2)">each cell below is one month, coloured by its regime (bright up to the current month)</text>${strip}
<text x="${L}" y="${sy + 30}" font-size="9.5" fill="var(--tx3)" font-family="var(--mono)">${esc(monthLabel(frames[0].data.m))}</text><text x="${w - 14}" y="${sy + 30}" text-anchor="end" font-size="9.5" fill="var(--tx3)" font-family="var(--mono)">${esc(monthLabel(frames[frames.length - 1].data.m))}</text></svg>`;
}
