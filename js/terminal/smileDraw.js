/**
 * IV smile replay, one frame as one HTML string (SVG + a small table). Pure; every colour is a theme token. x is the strike's distance from spot in % (out-of-the-money options only), y is Cboe's
 * implied vol in %, on one fixed scale for the whole replay. The nearest expiry is bright, the next ones step back; the same expiry one step earlier is a faint dashed ghost. It shows the quoted
 * smile and how it changed. It does not say where price goes.
 */
import { esc } from './boardViz.js';
import { WINDOW, yRange, frameFacts } from '../smileCore.js';

const f1 = v => (Math.round(v * 10) / 10).toString();
const COLS = ['var(--gold)', 'var(--pur2)', 'var(--tx2)', 'var(--tx3)'];
let uidN = 0;

export function smileStage(frames, i, extra, { w = 680, reduced = false } = {}) {
  const fr = frames?.[i]?.data; if (!fr || !extra) return '<p class="muted">Nothing to draw for this step.</p>';
  const prev = i > 0 ? frames[i - 1].data : null, [lo, hi] = extra.y ?? yRange(frames.map(f => f.data)), X = WINDOW * 100;
  const L = 44, R = w - 12, T = 12, H = 240, id = `smv${++uidN}`, x = m => L + ((m + X) / (2 * X)) * (R - L), y = v => T + (1 - (v - lo) / (hi - lo)) * H, cy = v => Math.max(T, Math.min(T + H, y(v)));
  let grid = ''; for (let g = 0; g <= 4; g++) { const v = lo + ((hi - lo) * g) / 4; grid += `<line x1="${L}" x2="${R}" y1="${f1(y(v))}" y2="${f1(y(v))}" stroke="var(--line2)" stroke-opacity=".3"/><text x="${L - 5}" y="${f1(y(v) + 3.5)}" text-anchor="end" font-size="9.5" fill="var(--tx3)" font-family="var(--mono)">${Math.round(v)}%</text>`; }
  const xt = [-10, -5, 0, 5, 10].map(m => `<text x="${f1(x(m))}" y="${T + H + 14}" text-anchor="middle" font-size="9.5" fill="${m === 0 ? 'var(--tx)' : 'var(--tx3)'}" font-family="var(--mono)">${m === 0 ? 'spot' : `${m > 0 ? '+' : '−'}${Math.abs(m)}%`}</text>`).join('');
  const path = pts => 'M' + pts.map(p => `${f1(x(p[0]))},${f1(cy(p[1]))}`).join('L');
  let ghosts = '', lines = '';
  (fr.curves ?? []).forEach((c, k) => {
    const pc = prev?.curves?.find(q => q.exp === c.exp); if (pc && pc.pts.length > 2 && k < 2) ghosts += `<path d="${path(pc.pts)}" fill="none" stroke="${COLS[k]}" stroke-opacity=".4" stroke-width="1.3" stroke-dasharray="4 3"/>`;
  });
  [...(fr.curves ?? [])].reverse().forEach((c, rk) => {
    const k = (fr.curves.length - 1) - rk; if (c.pts.length < 2) return;
    lines += `<path d="${path(c.pts)}" fill="none" stroke="${COLS[k] ?? COLS[3]}" stroke-width="${k === 0 ? 2.4 : 1.6}" stroke-linejoin="round" stroke-linecap="round"${k === 0 && !reduced ? ` filter="url(#${id})"` : ''}/>`;
  });
  const legend = (fr.curves ?? []).map((c, k) => `<g transform="translate(${L + 8 + k * 120},${T + 10})"><line x1="0" x2="16" y1="0" y2="0" stroke="${COLS[k] ?? COLS[3]}" stroke-width="2.4"/><text x="21" y="3.5" font-size="10" fill="var(--tx2)" font-family="var(--mono)">${c.dte === 0 ? 'same day' : `${c.dte}d`} · ${esc(c.exp.slice(5))}</text></g>`).join('');
  const svg = `<svg class="rpv-svg smv-svg" viewBox="0 0 ${w} ${T + H + 36}" width="100%" role="img" aria-label="${esc(extra.sym)} implied-vol smile, ${esc(fr.label ?? '')}: ${(fr.curves ?? []).map(c => `${c.dte} days ${c.atm ?? 'n/a'}% at the money`).join(', ')}">
<defs><filter id="${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<rect x="${L}" y="${T}" width="${R - L}" height="${H}" rx="4" fill="var(--bg2)" fill-opacity=".5" stroke="var(--line2)" stroke-opacity=".5"/>${grid}
<line x1="${f1(x(0))}" x2="${f1(x(0))}" y1="${T}" y2="${T + H}" stroke="var(--tx)" stroke-opacity=".5" stroke-dasharray="2 3"/>${ghosts}${lines}${legend}${xt}
<text x="${L}" y="${T + H + 32}" font-size="9.5" fill="var(--tx3)">${esc('puts below spot, calls above · bright = nearest expiry · faint dashed = the same expiry one step earlier')}</text></svg>`;
  const rows = (fr.curves ?? []).map((c, k) => { const p = prev?.curves?.find(q => q.exp === c.exp); const d = p && p.atm != null && c.atm != null ? c.atm - p.atm : null; return `<tr><td>${c.dte === 0 ? 'same day' : `${c.dte} days`} · ${esc(c.exp)}</td><td class="n">${c.atm == null ? '–' : `${c.atm.toFixed(1)}%`}</td><td class="n">${d == null ? '–' : `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}`}</td><td class="n">${c.skew5 == null ? '–' : c.skew5.toFixed(1)}</td><td class="n">${c.n}</td></tr>`; }).join('');
  const table = rows ? `<div class="oit-tblw"><table class="oit-tbl"><thead><tr><th>Expiry</th><th class="n">At the money</th><th class="n">Change</th><th class="n" title="vol of a put 5% below spot minus a call 5% above">5% skew</th><th class="n">Contracts</th></tr></thead><tbody>${rows}</tbody></table></div>` : '';
  const f = frameFacts(fr, prev);
  return `${svg}${table}<p class="gw-touch muted">${esc(extra.sym)}${fr.spot ? ` · spot ${Number(fr.spot).toLocaleString('en-GB', { maximumFractionDigits: 2 })}` : ''}${f ? ` · nearest expiry ${f.dte === 0 ? 'today' : `in ${f.dte} days`}` : ''}</p><div class="gw-ex" data-noexport><button type="button" class="btn" data-smv-ex="csv" title="Save these smiles as a CSV file (made in this browser)">CSV</button><button type="button" class="btn" data-smv-ex="png" title="Save the chart as a PNG image (made in this browser)">PNG</button></div>`;
}
