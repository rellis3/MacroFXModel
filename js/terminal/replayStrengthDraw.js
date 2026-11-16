/**
 * Replay of currency strength: one SVG string for one step. Pure; every colour is a theme token. The eight currencies are drawn as bars from zero,
 * strongest at the top, on ONE scale for the whole replay (so a bar that grows is a currency that moved), the leader glowing, and a faint tick on each row
 * where that currency stood at the first step. Under reduced motion there is no glow. Units are σ: how far a currency moved against the other seven in
 * units of its own normal move for that window. Description of the move, not a call on what comes next.
 */
import { esc, fin } from './boardViz.js';
import { strengthRows, strengthBound } from '../replayVizCore.js';

const f1 = v => (Math.round(v * 10) / 10).toString();
let n = 0;

export function strengthStage(frames, i, hz, ccys, { w = 560, reduced = false, bound = null } = {}) {
  const rows = strengthRows(frames?.[i], hz, ccys);
  if (!rows) return `<p class="muted">No ${esc(hz)} reading at this step: the window needs more finished bars.</p>`;
  const first = strengthRows(frames[0], hz, ccys), B = bound ?? strengthBound(frames, hz);
  const L = 44, R = 64, rowH = 30, T = 18, H = T + rows.length * rowH + 22, mid = L + (w - L - R) / 2, half = (w - L - R) / 2 - 4;
  const x = v => mid + (Math.max(-B, Math.min(B, v)) / B) * half, id = `rsg${++n}`;
  const body = rows.map((r, k) => {
    const y = T + k * rowH, up = r.score >= 0, col = up ? 'var(--up)' : 'var(--dn)', x0 = Math.min(mid, x(r.score)), bw = Math.abs(x(r.score) - mid);
    const g = first?.find(q => q.ccy === r.ccy), glow = k === 0 && !reduced;
    return `<g><text x="${L - 8}" y="${y + 15}" text-anchor="end" font-size="12" fill="var(--tx)" font-weight="700" font-family="var(--mono)">${esc(r.ccy)}</text>
<rect x="${f1(x0)}" y="${y + 5}" width="${f1(Math.max(bw, 1.5))}" height="16" rx="3" fill="${col}" fill-opacity="${k === 0 ? '.95' : '.7'}"${glow ? ` filter="url(#${id})"` : ''}/>
${g && fin(g.score) ? `<line x1="${f1(x(g.score))}" x2="${f1(x(g.score))}" y1="${y + 2}" y2="${y + 24}" stroke="var(--tx2)" stroke-width="1.5" stroke-dasharray="2 2" stroke-opacity=".8"/>` : ''}
<text x="${w - R + 8}" y="${y + 16}" font-size="11.5" fill="var(--tx)" font-family="var(--mono)">${r.score > 0 ? '+' : r.score < 0 ? '−' : ''}${Math.abs(r.score).toFixed(2)}σ</text></g>`;
  }).join('');
  const ticks = [-B, -B / 2, 0, B / 2, B].map(v => `<line x1="${f1(x(v))}" x2="${f1(x(v))}" y1="${T - 4}" y2="${T + rows.length * rowH}" stroke="var(--line2)" stroke-width="${v === 0 ? 1.4 : 1}" stroke-opacity="${v === 0 ? '.9' : '.4'}"/><text x="${f1(x(v))}" y="${H - 6}" text-anchor="middle" font-size="9.5" fill="var(--tx3)" font-family="var(--mono)">${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(v % 1 ? 1 : 0)}</text>`).join('');
  return `<svg class="rpv-svg" viewBox="0 0 ${w} ${H}" width="100%" role="img" aria-label="Currency strength on the ${esc(hz)} window, strongest first: ${rows.map(r => `${r.ccy} ${r.score.toFixed(2)}`).join(', ')}"><defs><filter id="${id}"><feGaussianBlur stdDeviation="3"/></filter></defs>${ticks}${body}
<text x="${w - 2}" y="10" text-anchor="end" font-size="9.5" fill="var(--tx3)">dashed tick = where it stood at the first step · σ</text></svg>`;
}
