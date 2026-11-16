/**
 * Replay of the Fed path odds (Atlanta Fed window odds): one SVG string for one date. Pure; every colour is a theme token.
 * Top: for each of the four forward windows, a bar up for the odds of a rate above the current range and a bar down for the odds below it, on a fixed
 * 0-100% scale. Bottom: the hike odds of the four windows across every date held, the current date marked, so the viewer sees where in the history the
 * frame sits. Odds are for the 3-month average rate over a window, not for a meeting. Description of how the priced path moved, not a forecast.
 */
import { esc, fin } from './boardViz.js';
import { windowLabel } from '../replayVizCore.js';

const f1 = v => (Math.round(v * 10) / 10).toString();
const COLS = ['var(--gold)', 'var(--pur2)', 'var(--up)', 'var(--tx2)'];
let n = 0;

export function fedStage(frames, i, { w = 560, reduced = false } = {}) {
  const f = frames?.[i]; if (!f) return '<p class="muted">Nothing to draw for this date.</p>';
  const W = f.data.w, k = W.length, id = `rfg${++n}`;
  const L = 38, R = 14, midY = 92, half = 70, colW = (w - L - R) / k;
  const top = W.map((x, j) => {
    const cx = L + colW * (j + 0.5), bw = Math.min(46, colW * 0.5), col = COLS[j % COLS.length];
    const hu = fin(x.hike) ? (x.hike / 100) * half : 0, cd = fin(x.cut) ? (x.cut / 100) * half : 0;
    return `<g><rect x="${f1(cx - bw / 2)}" y="${f1(midY - hu)}" width="${f1(bw)}" height="${f1(Math.max(hu, fin(x.hike) ? 1 : 0))}" rx="3" fill="${col}" fill-opacity=".85"${!reduced && j === 0 && hu > 2 ? ` filter="url(#${id})"` : ''}/>
<rect x="${f1(cx - bw / 2)}" y="${midY}" width="${f1(bw)}" height="${f1(Math.max(cd, fin(x.cut) ? 1 : 0))}" rx="3" fill="${col}" fill-opacity=".35"/>
<text x="${f1(cx)}" y="${f1(midY - hu - 5)}" text-anchor="middle" font-size="11" fill="var(--tx)" font-family="var(--mono)">${fin(x.hike) ? Math.round(x.hike) + '%' : 'n/a'}</text>
<text x="${f1(cx)}" y="${f1(midY + cd + 13)}" text-anchor="middle" font-size="10" fill="var(--tx2)" font-family="var(--mono)">${fin(x.cut) ? Math.round(x.cut) + '%' : 'n/a'}</text>
<text x="${f1(cx)}" y="${midY + half + 28}" text-anchor="middle" font-size="11.5" fill="var(--tx)" font-weight="700">${esc(windowLabel(x.ref))}</text></g>`;
  }).join('');
  const hy = midY + half + 52, hh = 88, x = j => L + (frames.length < 2 ? 0 : (j / (frames.length - 1)) * (w - L - R)), y = v => hy + (1 - v / 100) * hh;
  const lines = W.map((_, c) => {
    let d = ''; let pen = false;
    frames.forEach((fr, j) => { const v = fr.data.w[c]?.hike; if (!fin(v)) { pen = false; return; } d += `${pen ? 'L' : 'M'}${f1(x(j))},${f1(y(v))}`; pen = true; });
    const cur = f.data.w[c]?.hike;
    return `<path d="${d}" fill="none" stroke="${COLS[c % COLS.length]}" stroke-width="1.6" stroke-opacity=".8" stroke-linejoin="round"/>${fin(cur) ? `<circle cx="${f1(x(i))}" cy="${f1(y(cur))}" r="4" fill="${COLS[c % COLS.length]}" stroke="var(--bg1)" stroke-width="1.5"/>` : ''}`;
  }).join('');
  const grid = [0, 50, 100].map(v => `<line x1="${L}" x2="${w - R}" y1="${f1(y(v))}" y2="${f1(y(v))}" stroke="var(--line2)" stroke-width="1" stroke-opacity=".5"/><text x="${L - 6}" y="${f1(y(v) + 3.5)}" text-anchor="end" font-size="10" fill="var(--tx3)" font-family="var(--mono)">${v}%</text>`).join('');
  const H = hy + hh + 24;
  return `<svg class="rpv-svg" viewBox="0 0 ${w} ${H}" width="100%" role="img" aria-label="Fed path odds on ${esc(f.t)}: ${W.map(x2 => `${windowLabel(x2.ref)} window, rate above the current range ${fin(x2.hike) ? Math.round(x2.hike) + ' percent' : 'not available'}`).join('; ')}"><defs><filter id="${id}"><feGaussianBlur stdDeviation="3"/></filter></defs>
<line x1="${L}" x2="${w - R}" y1="${midY}" y2="${midY}" stroke="var(--line2)" stroke-width="1.2"/>
<text x="${L - 6}" y="${midY - half + 4}" text-anchor="end" font-size="9.5" fill="var(--tx3)">above</text><text x="${L - 6}" y="${midY + half}" text-anchor="end" font-size="9.5" fill="var(--tx3)">below</text>
${top}${grid}${lines}
<line x1="${f1(x(i))}" x2="${f1(x(i))}" y1="${hy - 4}" y2="${hy + hh}" stroke="var(--tx)" stroke-width="1" stroke-dasharray="3 3" stroke-opacity=".7"/>
<text x="${L}" y="${hy - 8}" font-size="10.5" fill="var(--tx2)">odds of a rate above the current range, every date held</text></svg>`;
}
