// js/terminal/scorecardView.js: the Macro scorecard made auditable, and the factor bar the Currency card and modal reuse.
// The composite is the plain mean of the factors that have data (js/macroScorecardEngine.js rollUpFactors): a factor with no usable series is EXCLUDED, never
// a zero. So a currency scored on 4 of 6 factors is a different statement from one scored on all 6, and the board says which factors are missing and why
// (the series was discontinued, is too old, or has no feed) instead of showing a bare dash. Description only: the composite is not a signal (macro-as-signal
// is a banked null, five times). Pure string builders: no fetch, no DOM. Colours are tokens only.
import { FACTORS } from '../macroScorecardEngine.js';

const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fin = v => Number.isFinite(v);
const sg = (v, d = 2) => (fin(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}` : '–');
const cls = v => (!fin(v) || v === 0 ? '' : v > 0 ? 'up' : 'dn');

export const FACTOR_KEYS = Object.keys(FACTORS);
const DIM_LABEL = { rateDiff: 'rate gap', realYield: 'real yield', yieldCurve: 'yield curve', cpi: 'CPI', ppi: 'PPI', gdp: 'GDP', ism: 'PMI', laborMarket: 'labour data',
  retailSales: 'retail sales', consumerConfidence: 'consumer confidence', tradeBalance: 'trade balance' };
const SHORT = { rates: 'Rates', inflation: 'Inflation', growth: 'Growth', labour: 'Labour', demand: 'Demand', external: 'External' };

/** Why one dimension is not in the score: discontinued (with the reason), too old, or no feed. */
export function dimWhy(row, dim, sc) {
  const name = DIM_LABEL[dim] ?? dim, d = sc?.discontinued?.[dim]?.[row.ccy];
  if (d) return `${name}: series ended ${d.since ?? ''}${d.reason ? ` (${d.reason})` : ''}`;
  const st = (row.stale ?? []).find(x => x.dim === dim);
  if (st) return `${name}: last reading ${st.asOf ?? '?'} is ${st.ageDays} days old, past its limit, so it is left out`;
  return `${name}: no series for ${row.ccy}`;
}

/** One factor of one currency: its score, the dimensions behind it, and what is missing and why. */
export function factorState(row, key, sc) {
  const fx = row?.factors?.[key] ?? null, def = FACTORS[key];
  const have = fx?.dims ?? [];
  const missing = def.dims.filter(d => !have.includes(d)).map(d => ({ dim: d, label: DIM_LABEL[d] ?? d, why: dimWhy(row, d, sc) }));
  return { key, label: def.label, short: SHORT[key] ?? def.label, score: fin(fx?.score) ? fx.score : null, have, missing, of: def.dims.length, partial: fin(fx?.score) && missing.length > 0 };
}

/** The whole row: six factor states, how many are scored, and each factor's share of the composite (score / number scored: the composite is their mean). */
export function rowStates(row, sc) {
  const st = FACTOR_KEYS.map(k => factorState(row, k, sc));
  const scored = st.filter(x => x.score != null);
  return { ccy: row?.ccy, composite: fin(row?.composite) ? row.composite : null, states: st.map(x => ({ ...x, share: x.score != null && scored.length ? x.score / scored.length : null })), scored: scored.length, total: st.length,
    missingFactors: st.filter(x => x.score == null).map(x => x.label) };
}

/** "5 of 6" chip: plain when all six, amber when one or two are out, red below four. Words as well as colour. */
export function coverageChip(n, total = 6) {
  const c = n >= total ? '' : n >= total - 2 ? ' gold' : ' dn';
  return `<span class="chip${c}" title="${E(`${n} of ${total} macro factors have data for this currency; the composite is the mean of those ${n}`)}">${n} of ${total}${n >= total ? '' : n >= total - 2 ? ' · partial' : ' · thin'}</span>`;
}

/** The diverging stacked bar: each scored factor's share of the composite, positives to the right of the centre line, negatives to the left; missing factors listed hatched. */
export function stackHtml(row, sc, { compact = false } = {}) {
  const r = rowStates(row, sc);
  const pos = r.states.filter(x => x.share > 0), neg = r.states.filter(x => x.share < 0);
  const rightSum = pos.reduce((a, x) => a + x.share, 0), leftSum = -neg.reduce((a, x) => a + x.share, 0);
  const scale = Math.max(0.5, rightSum, leftSum);
  const seg = x => `<i class="msc-seg ${x.share > 0 ? 'p' : 'n'}" style="flex:${(Math.abs(x.share) / scale * 100).toFixed(2)} 0 0;opacity:${(0.55 + Math.min(0.45, Math.abs(x.score) * 0.45)).toFixed(2)}" title="${E(`${x.label} ${sg(x.score)} → ${sg(x.share)} of the composite`)}"><b>${compact ? '' : E(x.short)}</b></i>`;
  const track = `<div class="msc-track${compact ? ' mini' : ''}" role="img" aria-label="${E(`${r.ccy} composite ${sg(r.composite)} from ${r.scored} of ${r.total} factors`)}"><div class="msc-half l">${[...neg].reverse().map(seg).join('')}</div><span class="msc-mid"></span><div class="msc-half r">${pos.map(seg).join('')}</div></div>`;
  if (compact) return `<div class="msc-line">${track}<span class="msc-cov">${coverageChip(r.scored)}</span></div>`;
  const pills = r.states.map(x => x.score != null
    ? `<span class="msc-pill ${cls(x.score)}" title="${E(x.partial ? `${x.label}: ${x.have.length} of ${x.of} series. Missing: ${x.missing.map(m => m.why).join('; ')}` : `${x.label}: all ${x.of} series`)}"><span>${E(x.short)}</span><b class="mono">${sg(x.score)}</b>${x.partial ? '<em>partial</em>' : ''}</span>`
    : `<span class="msc-pill miss" title="${E(`${x.label} is not in the score. ${x.missing.map(m => m.why).join('; ')}`)}"><span>${E(x.short)}</span><b>missing</b></span>`).join('');
  const why = r.states.filter(x => x.score == null || x.partial).flatMap(x => x.missing.map(m => `${x.label}: ${m.why}`));
  return `<div class="msc"><div class="msc-head"><span class="lbl">What the composite is made of</span><span class="mono ${cls(r.composite)}">${sg(r.composite)}</span>${coverageChip(r.scored)}</div>${track}<div class="msc-pills">${pills}</div>${why.length ? `<div class="muted msc-why">Left out: ${why.map(E).join(' · ')}.</div>` : ''}<div class="muted msc-note">The composite is the plain mean of the factors that have data, equal weights; it describes, it does not predict.</div></div>`;
}

/** The Macro-tab scorecard table: composite with its coverage chip, six factor cells, missing ones hatched and labelled. */
export function scorecardHtml(sc, { flag = {} } = {}) {
  const ranked = sc?.ranked ?? [];
  if (!ranked.length) return '';
  const rows = ranked.map(r => rowStates(r, sc));
  const full = rows.filter(x => x.scored === x.total).length;
  const head = `<tr><th>Currency</th><th>Composite</th><th>Factors</th>${FACTOR_KEYS.map(k => `<th>${E(FACTORS[k].label)}</th>`).join('')}</tr>`;
  const body = rows.map(r => `<tr><td class="n">${flag[r.ccy] ?? ''} ${E(r.ccy)}</td><td class="n mono ${cls(r.composite)}">${sg(r.composite)}</td><td>${coverageChip(r.scored)}</td>${r.states.map(x => x.score != null
    ? `<td class="n mono ${cls(x.score)}" title="${E(x.partial ? `${x.have.length} of ${x.of} series. Missing: ${x.missing.map(m => m.why).join('; ')}` : `all ${x.of} series`)}">${sg(x.score)}${x.partial ? ' <span class="muted" title="partial">◐</span>' : ''}</td>`
    : `<td class="n msc-missing" title="${E(x.missing.map(m => m.why).join('; '))}"><span>missing</span></td>`).join('')}</tr>`).join('');
  const legend = full < rows.length ? `<p class="muted" style="font-size:12px;margin:8px 0 0">${rows.length - full} of ${rows.length} currencies are scored on fewer than six factors. A hatched "missing" cell means no usable series (hover for which and why); ◐ means the factor rests on some, not all, of its series. A missing factor is left out of the composite, never counted as zero.</p>` : `<p class="muted" style="font-size:12px;margin:8px 0 0">All eight currencies have all six factors.</p>`;
  return `<div class="card" style="margin-top:14px"><div class="ch"><span class="lbl">Macro scorecard</span><span class="r muted">equal-weight composite of six factors; a factor with no data is left out, not zeroed</span></div><div class="scroll"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>${legend}</div>`;
}
