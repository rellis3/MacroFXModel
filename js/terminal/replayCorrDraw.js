/**
 * Replay of the cross-asset correlation matrix: one SVG string for one session. Pure; every colour is a theme token. The grid is the 20 session
 * correlation of daily moves (up = move together, down = opposite ways, brighter = closer to 1), pairs that sit further from their 120 session
 * correlation than noise explains are ringed, and a strip underneath carries the count of ringed pairs through the window against how many would be ringed
 * by chance, with the current session marked. Describes the link between markets; says nothing about direction.
 */
import { esc, fin } from './boardViz.js';

const f1 = v => (Math.round(v * 10) / 10).toString();

export function corrStage(frames, i, keys, { w = 560, reduced = false } = {}) {
  const f = frames?.[i]; if (!f || !keys?.length) return '<p class="muted">Nothing to draw for this session.</p>';
  const k = keys.length, L = 50, T = 44, cell = (w - L - 6) / k, gridH = cell * k;
  const cells = [];
  for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) {
    const r = f.data.r[a]?.[b]; const x = L + b * cell, y = T + a * cell;
    if (a === b) { cells.push(`<rect x="${f1(x)}" y="${f1(y)}" width="${f1(cell - 1)}" height="${f1(cell - 1)}" rx="2" fill="var(--bg3)"/>`); continue; }
    if (!fin(r)) { cells.push(`<rect x="${f1(x)}" y="${f1(y)}" width="${f1(cell - 1)}" height="${f1(cell - 1)}" rx="2" fill="none" stroke="var(--line2)" stroke-opacity=".4"/>`); continue; }
    const mv = f.data.moved[a]?.[b], col = r >= 0 ? 'var(--blue)' : 'var(--gold)';
    cells.push(`<rect x="${f1(x)}" y="${f1(y)}" width="${f1(cell - 1)}" height="${f1(cell - 1)}" rx="2" fill="${col}" fill-opacity="${(0.08 + Math.abs(r) * 0.85).toFixed(2)}"${mv ? ` stroke="var(--tx)" stroke-width="1.6"` : ''}><title>${esc(`${keys[a].toUpperCase()} and ${keys[b].toUpperCase()}: ${r.toFixed(2)}${mv ? ' (moved further than noise explains)' : ''}`)}</title></rect>`);
  }
  const lab = keys.map((key, j) => `<text x="${L - 4}" y="${f1(T + j * cell + cell / 2 + 3)}" text-anchor="end" font-size="9" fill="var(--tx2)" font-family="var(--mono)">${esc(key.toUpperCase().slice(0, 6))}</text><text transform="translate(${f1(L + j * cell + cell / 2 + 3)},${T - 4}) rotate(-60)" font-size="9" fill="var(--tx2)" font-family="var(--mono)">${esc(key.toUpperCase().slice(0, 6))}</text>`).join('');
  const sy0 = T + gridH + 30, sh = 44, mx = Math.max(1, ...frames.map(fr => Math.max(fr.data.nMoved, fr.data.expected))), x = j => L + (frames.length < 2 ? 0 : (j / (frames.length - 1)) * (w - L - 6)), y = v => sy0 + (1 - v / mx) * sh;
  const line = frames.map((fr, j) => `${j ? 'L' : 'M'}${f1(x(j))},${f1(y(fr.data.nMoved))}`).join('');
  const exp = fr => y(fr.data.expected);
  const H = sy0 + sh + 18;
  return `<svg class="rpv-svg" viewBox="0 0 ${w} ${H}" width="100%" role="img" aria-label="Correlation of daily moves between ${k} markets on ${esc(f.t)}: ${f.data.nMoved} of ${f.data.nPairs} pairs moved further than noise explains, about ${f.data.expected} would by chance">
${lab}${cells.join('')}
<text x="${L}" y="${sy0 - 8}" font-size="10.5" fill="var(--tx2)">pairs ringed (moved further than noise explains), every session: <tspan fill="var(--tx)" font-family="var(--mono)">${f.data.nMoved}</tspan> of ${f.data.nPairs}, about ${f.data.expected} by chance (dashed)</text>
<line x1="${L}" x2="${w - 6}" y1="${f1(exp(frames[0]))}" y2="${f1(exp(frames[frames.length - 1]))}" stroke="var(--tx3)" stroke-width="1.2" stroke-dasharray="4 4"/>
<path d="${line}" fill="none" stroke="var(--pur2)" stroke-width="1.8" stroke-linejoin="round"${reduced ? '' : ' stroke-opacity=".95"'}/>
<line x1="${f1(x(i))}" x2="${f1(x(i))}" y1="${sy0}" y2="${sy0 + sh}" stroke="var(--tx)" stroke-width="1" stroke-dasharray="3 3" stroke-opacity=".7"/>
<circle cx="${f1(x(i))}" cy="${f1(y(f.data.nMoved))}" r="4" fill="var(--gold)" stroke="var(--bg1)" stroke-width="1.5"/>
<text x="${w - 6}" y="${H - 2}" text-anchor="end" font-size="9.5" fill="var(--tx3)">blue = together · gold = opposite ways · ring = moved</text></svg>`;
}
