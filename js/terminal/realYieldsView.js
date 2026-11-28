/**
 * Desk Terminal, Macro tab (Rates & curve): the real-yield layer (HTML), a side-by-side card BESIDE the nominal boards, folded
 * behind a toggle (a <details>, closed by default) so the nominal boards above read exactly as before. Numbers from
 * /api/real-yields (js/realYields.js). Tokens only; a yield change carries a sign and no colour (neither good nor bad).
 * Description only: the Evidence Book chips say what these readings have and have not shown.
 */
import { chipFor } from './corrEvidence.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fin = v => typeof v === 'number' && Number.isFinite(v);
const bp = v => (!fin(v) ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(Math.abs(v) < 10 && v % 1 ? 1 : 0)}`);
const ord = n => (!fin(n) ? '–' : `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`);

/** A 60-print sparkline as inline SVG (stroke only, theme token). */
export function sparkSvg(xs, w = 90, h = 22) {
  const v = (xs ?? []).filter(fin); if (v.length < 2) return '';
  const lo = Math.min(...v), hi = Math.max(...v), sp = hi - lo || 1;
  const pts = v.map((y, i) => `${(i / (v.length - 1) * w).toFixed(1)},${(h - 2 - (y - lo) / sp * (h - 4)).toFixed(1)}`).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--tx2)" stroke-width="1.3"/></svg>`;
}

/** ry = the /api/real-yields payload. '' when it has not landed; a card that says so when it failed. */
export function boardHtml(ry, { open = false } = {}) {
  if (ry === undefined) return '';
  const head = `<summary><span class="lbl">Real-yield layer</span> <span class="muted">TIPS real yields, breakevens and the Australian indexed bond beside the nominal curve · open to show · context, not a signal</span></summary>`;
  if (!ry?.ok) return `<div class="card"><details${open ? ' open' : ''}>${head}<p class="muted">${esc(ry?.error ?? 'The real-yield series did not load')}. The nominal boards above stand on their own.</p></details></div>`;
  const rows = ry.rows.map(r => r.missing
    ? `<tr><td>${esc(r.label)}</td><td class="n mono muted" colspan="6">not loaded</td><td class="muted" style="font-size:11px">${esc(r.source)}</td></tr>`
    : `<tr${r.stale ? ' class="muted"' : ''}><td><b>${esc(r.label)}</b>${r.derived ? ' <span class="chip" title="nominal minus indexed on the same day: derived here, not a traded series">derived</span>' : ''}${r.stale ? ` <span class="chip gold" title="last print ${esc(r.date)}">${r.ageDays}d old</span>` : ''}</td><td class="n mono">${r.value.toFixed(2)}%</td><td class="n mono">${bp(r.chg1dBp)}</td><td class="n mono">${bp(r.chg5dBp)}</td><td class="n mono">${bp(r.chg20dBp)}</td><td class="n mono">${ord(r.pct1y)}</td><td>${sparkSvg(r.spark)}</td><td class="muted" style="font-size:11px">${esc(r.source)} · ${esc(r.date)}</td></tr>`).join('');
  const splits = (ry.splits ?? []).filter(s => s.text).map(s => `<li>${esc(s.text)}${fin(s.residualBp) && Math.abs(s.residualBp) >= 1 ? ` <span class="muted">(${bp(s.residualBp)}bp not explained by the two FRED series: they are separate prints)</span>` : ''}</li>`).join('');
  const ev = [chipFor('cog-spread-direction', 'Real yields and breakevens were among the daily spreads tested for direction at the lines.'), chipFor('yield-ladder-nq', 'No lead from real yields or breakevens to Nasdaq was shown.'), chipFor('broken-link-resolution', 'When real yields and the dollar or gold disagree, history does not say which gives way.'), chipFor('which-gold', 'Real yields drive gold in only part of the windows.')].filter(Boolean).join(' ');
  return `<div class="card"><details${open ? ' open' : ''}>${head}
<div class="scroll" style="margin-top:8px"><table><thead><tr><th>Series</th><th class="n">Now</th><th class="n">1 print, bp</th><th class="n">5 prints</th><th class="n">20 prints</th><th class="n">1y pct</th><th>60 prints</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table></div>
${splits ? `<p class="lbl" style="margin-top:10px">Nominal = real + breakeven (the last 20 prints)</p><ul class="muted" style="font-size:12.5px;margin:4px 0 0 16px">${splits}</ul>` : ''}
<p class="muted" style="font-size:12px">${esc(ry.uk?.note ?? '')} The nominal yields on the boards above are unchanged; this layer only sits beside them.</p>
<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)"><span class="lbl">Evidence Book</span>${ev}<span class="muted" style="font-size:11.5px">${esc(ry.note ?? '')}</span></div>
</details></div>`;
}
