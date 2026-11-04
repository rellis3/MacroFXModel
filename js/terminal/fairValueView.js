/**
 * The short-term FX fair value (/api/fx-fair-value, js/fxFairValue.js) drawn for the Desk Terminal: a summary table for
 * the Macro tab (beside the BIS fair value) and a card for the Pair tab. Pure HTML-string builders, no fetch.
 *
 * Every view prints the model's verdict word first (DESCRIPTION ONLY · <word>, from the Evidence Book entry
 * fx-short-term-fair-value) and says what the half-life is: how fast the GAP fades, which in the test was the model
 * moving to price, not price moving to the model.
 */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fin = v => v != null && Number.isFinite(+v);
const sg = (v, dp = 2) => (fin(v) ? `${+v > 0 ? '+' : ''}${(+v).toFixed(dp)}` : '–');
const px = v => (fin(v) ? (+v >= 20 ? (+v).toFixed(3) : (+v).toFixed(5)) : '–');
const zCls = z => (!fin(z) ? '' : z >= 2 ? 'dn' : z <= -2 ? 'up' : Math.abs(z) >= 1 ? 'gold' : '');
const hlTxt = h => (h?.ok ? `${h.halfLife ?? '–'}d <span class="muted">[${h.halfLifeCi?.[0] ?? '–'}, ${h.halfLifeCi?.[1] ?? '∞'}]</span>` : '–');

/** The verdict chip: red-ish unless validated. */
export function verdictChip(d) {
  const v = String(d?.verdict ?? 'UNTESTED');
  return `<span class="chip ${v === 'VALIDATED' ? 'up' : 'gold'}" title="${esc(d?.note ?? '')}">${esc(d?.label ?? v)}</span>`;
}
/** This market's row of the board, or null. */
export const rowOf = (d, inst) => (d?.rows ?? []).find(r => r.pair === String(inst ?? '').toUpperCase()) ?? null;

/** Price and fair value over the board's history as a two-line SVG (price solid, fair dashed). */
export function pathSvg(hist, w = 300, h = 60) {
  const H = (hist ?? []).filter(x => fin(x.price) && fin(x.fair)); if (H.length < 2) return '';
  const all = H.flatMap(x => [x.price, x.fair]), lo = Math.min(...all), hi = Math.max(...all), sp = hi - lo || 1;
  const X = i => ((i / (H.length - 1)) * w).toFixed(1), Y = v => (h - 2 - ((v - lo) / sp) * (h - 4)).toFixed(1);
  const line = k => H.map((x, i) => `${i ? 'L' : 'M'}${X(i)},${Y(x[k])}`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="price against short-term fair value"><path d="${line('fair')}" fill="none" stroke="var(--pur2, #9b8cff)" stroke-width="1.5" stroke-dasharray="4 3"/><path d="${line('price')}" fill="none" stroke="var(--gold, #e8b85a)" stroke-width="1.5"/></svg>`;
}

/** Macro tab: every pair in one table, verdict first. */
export function stfvTable(d) {
  if (!d) return '';
  if (!d.ok) return `<div class="sec"><h2>Short-term fair value</h2><span class="lbl">rates and risk, 250-day rolling</span></div><div class="card muted">${esc(d.error ?? 'Not available.')}</div>`;
  const rows = (d.rows ?? []).map(r => (r.ok
    ? `<tr><td><b>${esc(r.pair)}</b>${r.scored ? '' : ' <span class="muted" title="a cross of the tested legs: shown, not scored">×</span>'}</td><td class="n mono">${px(r.price)}</td><td class="n mono">${px(r.fair)}</td><td class="n mono ${zCls(r.z)}">${sg(r.gapPips, 0)}</td><td class="n mono ${zCls(r.z)}">${sg(r.gapPct)}%</td><td class="n mono ${zCls(r.z)}">${sg(r.z)}</td><td class="n mono">${fin(r.r2) ? r.r2.toFixed(2) : '–'}</td><td>${esc(r.stability?.label ?? '–')}</td><td class="n mono">${hlTxt(r.halfLife)}</td></tr>`
    : `<tr><td><b>${esc(r.pair)}</b></td><td colspan="8" class="muted">${esc(r.error ?? 'no read')}</td></tr>`)).join('');
  return `<div class="sec"><h2>Short-term fair value</h2><span class="lbl">each pair against its 2y and 10y yield gaps and VIX, refitted daily on 250 days · ${verdictChip(d)}</span></div>
<div class="card scroll"><table><thead><tr><th>Pair</th><th class="n">Price</th><th class="n">Fair</th><th class="n">Gap (pips)</th><th class="n">Gap</th><th class="n">z</th><th class="n">R²</th><th>Model</th><th class="n">Gap half-life [95%]</th></tr></thead><tbody>${rows}</tbody></table>
<p class="muted" style="font-size:12px"><b>${esc(d.label)}.</b> ${esc(d.note)} Positive gap = price above the model (rich). × = a cross of the tested legs, shown only. GBP's short leg is the 5-year gilt.</p></div>`;
}

/** Pair tab: one market's card. */
export function stfvPairCard(d, inst) {
  const head = `<div class="ch"><span class="lbl">Short-term fair value · rates and risk</span><span class="r">${d?.ok ? verdictChip(d) : ''}</span></div>`;
  if (!d?.ok) return `${head}<p class="muted">${esc(d?.error ?? 'Not available.')}</p>`;
  const r = rowOf(d, inst);
  if (!r) return `${head}<p class="muted">No short-term fair value for ${esc(inst)}: it covers ${esc((d.rows ?? []).map(x => x.pair).join(', '))} (both legs need a daily 2y yield).</p>`;
  if (!r.ok) return `${head}<p class="muted">${esc(r.error)}</p>`;
  const st = r.stability;
  return `${head}
<div class="tt-tiles"><div class="tt-tile"><div class="lbl">Fair value</div><div class="v mono">${px(r.fair)}</div><div class="s">95% ${px(r.band95?.[0])} – ${px(r.band95?.[1])}</div></div>
<div class="tt-tile"><div class="lbl">Gap</div><div class="v mono ${zCls(r.z)}">${sg(r.gapPips, 0)}p</div><div class="s">${sg(r.gapPct)}% · z ${sg(r.z)}</div></div>
<div class="tt-tile"><div class="lbl">Gap half-life</div><div class="v mono">${r.halfLife?.ok ? `${r.halfLife.halfLife ?? '–'}d` : '–'}</div><div class="s">95% ${r.halfLife?.halfLifeCi?.[0] ?? '–'} – ${r.halfLife?.halfLifeCi?.[1] ?? '∞'} days</div></div></div>
<div>${pathSvg(r.history)}<div class="muted" style="font-size:11px">price (solid) against fair value (dashed), last ${r.history?.length ?? 0} days · ${esc(r.date)}</div></div>
<div class="tt-kv" style="margin-top:8px"><b>R²</b><span class="mono">${fin(r.r2) ? r.r2.toFixed(2) : '–'} (60 refits ${st ? `${st.r2Min}–${st.r2Max}` : '–'}) · ${esc(st?.label ?? '')}</span>${(r.betas ?? []).map((b, i) => `<b>${esc(b.factor)}</b><span class="mono">β ${sg(b.beta, 4)} ± ${fin(b.se) ? (1.96 * b.se).toFixed(4) : '–'} · now ${sg(b.now, 2)}${st?.factors?.[i] ? ` · same sign ${Math.round(st.factors[i].sameSign * 100)}%` : ''}</span>`).join('')}${r.shortLeg ? `<b>Note</b><span>${esc(r.shortLeg)}</span>` : ''}</div>
<p class="tt-note"><b>${esc(d.label)}.</b> ${esc(d.note)}</p>`;
}

/** The chart line for the Pair tab: today's fair value, or null. */
export function fairLevel(d, inst) {
  const r = rowOf(d, inst); return r?.ok && fin(r.fair) ? { price: +r.fair, kind: 'vwap_anchor', label: `ST fair (${String(d.verdict ?? '').toLowerCase()})` } : null;
}
