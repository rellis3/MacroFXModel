// js/terminal/biasEngineView.js: how the Desk Terminal draws the bias engine (js/biasEngine.js, GET /api/bias-engine; plans/BIAS_ENGINE_SPEC.md
// "Desk Terminal"). Pure: HTML strings and small helpers, no DOM, no fetch. Colours are theme tokens only. Tested in biasEngineView.test.mjs.
//
// Surfaces (js/terminal/tabRegistry.js): panel.asset.engine (Assets cards), panel.ccy.engine (Currencies cards and modal), panel.pair.engine (Pair tab),
// panel.ov.engine (Overview ranking strip), panel.macro.biasengine (Macro section), panel.replay.engine (Replay side card), and panel.be.flip: the
// "what would flip it" line, which reads as an invalidation line, so it is a 'trade' surface, hidden from the desk login by default.
//
// The engine is a rule-based macro checklist with theory weights, scored forward on the bias scoreboard. It is not a trade signal, and every card says so.
import { marketView, CCYS, CCY_WEIGHTS, GOLD_WEIGHTS, INDEX_WEIGHTS, EU_INDEX_WEIGHTS, CMDTY_WEIGHTS, RISK_WEIGHTS, FOOTNOTE, ASSETS } from '../biasEngine.js';

export { FOOTNOTE };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fin = x => typeof x === 'number' && Number.isFinite(x);
/** Signed number with a true minus sign: +0.42, −0.13, 0.00. */
export const sgn = (x, k = 2) => (!fin(x) ? '–' : Number(Math.abs(x).toFixed(k)) === 0 ? (0).toFixed(k) : `${x > 0 ? '+' : '−'}${Math.abs(x).toFixed(k)}`);
const WORD = { BULLISH: 'Bullish', BEARISH: 'Bearish', NEUTRAL: 'Neutral' };
const RATING_DIR = { STRONG_LONG: 1, LONG: 1, FLAT: 0, NEUTRAL: 0, SHORT: -1, STRONG_SHORT: -1 };

/** The engine's side as a sign: +1 Bullish, −1 Bearish, 0 Neutral; null when there is no read. */
export function engineSign(m) {
  if (!m || !m.dir) return null;
  return m.dir === 'BULLISH' ? 1 : m.dir === 'BEARISH' ? -1 : 0;
}
/** "Bearish 7/10", "Neutral" (with "would be 2/10" left to the title), or null. */
export function engineLabel(m) {
  if (!m || !m.dir) return null;
  return m.dir === 'NEUTRAL' ? 'Neutral' : `${WORD[m.dir]} ${m.strength}/10`;
}
/** The engine's −2..+2 score on the page's −5..+5 ring scale (×2.5), or null. */
export const ring5 = m => (fin(m?.score) ? Math.round(m.score * 2.5 * 10) / 10 : null);
const cls = s => (s > 0 ? 'up' : s < 0 ? 'dn' : '');
const pctTxt = x => (fin(x) ? `${Math.round(x * 100)}%` : '–');
const day = s => String(s ?? '').slice(0, 10);
const when = s => { const t = String(s ?? ''); return t ? `${t.slice(0, 10)} ${t.slice(11, 16)} UTC` : ''; };

/** The engine chip: "Engine: Bearish 7/10", coloured by side. '' when there is no read. */
export function engineChip(m, { prefix = 'Engine' } = {}) {
  const l = engineLabel(m); if (!l) return '';
  const t = `Bias engine: score ${sgn(m.score)} of ±2, coverage ${pctTxt(m.coverage)}${m.neutral ? `; neutral because ${m.neutral}` : ''}. ${FOOTNOTE}`;
  return `<span class="chip ${cls(engineSign(m))} be-chip" title="${esc(t)}">${esc(prefix)}: ${esc(l)}</span>`;
}

/** The desk's side for a card rating (+1 / 0 / −1) or a currency bias (−2..+2); null when it has none. */
export function deskSign({ rating = undefined, bias = undefined } = {}) {
  if (rating !== undefined) return Object.prototype.hasOwnProperty.call(RATING_DIR, rating) ? RATING_DIR[rating] : null;
  return fin(bias) ? Math.sign(bias) : null;
}
/** Engine and desk on different sides (Neutral counts as a side). False when either has no read. */
export function isSplit(m, desk) {
  const e = engineSign(m);
  return e != null && desk != null && e !== desk;
}
export function splitChip(m, desk, who = 'the desk') {
  return isSplit(m, desk) ? `<span class="chip gold be-split" title="${esc(`The bias engine reads ${engineLabel(m)}; ${who} reads ${desk > 0 ? 'bullish' : desk < 0 ? 'bearish' : 'neutral'}. Two different methods, shown side by side; neither is a trade signal.`)}">split</span>` : '';
}

/** The n largest contributions by size (ties: the driver order). */
export function topDrivers(m, n = 3) {
  return [...(m?.drivers ?? [])].map((x, i) => ({ x, i })).sort((a, b) => Math.abs(b.x.contrib ?? 0) - Math.abs(a.x.contrib ?? 0) || a.i - b.i).slice(0, n).map(o => o.x);
}

/** The card's compact Key drivers list: label, reading, signed contribution. */
export function keyDriversHtml(m, n = 3) {
  const ds = topDrivers(m, n); if (!ds.length) return '';
  return `<div class="be-key"><span class="lbl">Key drivers · engine</span><ul>${ds.map(x => `<li><b>${esc(x.leg ? `${x.leg} ` : '')}${esc(x.label)}</b><span class="muted">${esc(x.reading ?? '')}</span><span class="mono ${cls(x.contrib)}">${sgn(x.contrib)}</span></li>`).join('')}</ul></div>`;
}

export const footnoteHtml = (rec = null) => `<p class="muted be-foot">${esc(rec?.footnote ?? FOOTNOTE)}</p>`;

/** The full driver table: reading, d, weight (as given and renormalised), contribution, source, as-of; then the missing drivers and the coverage. */
export function driverTableHtml(m, { legs = false } = {}) {
  if (!m) return '';
  const rows = (m.drivers ?? []).map(x => `<tr><td>${legs && x.leg ? `<span class="chip">${esc(x.leg)}</span> ` : ''}${esc(x.label)}</td><td style="font-size:12px">${esc(x.reading ?? '')}</td><td class="n ${cls(x.d)}">${fin(x.d) ? (x.d > 0 ? `+${x.d}` : x.d < 0 ? `−${Math.abs(x.d)}` : '0') : '–'}</td><td class="n muted" title="weight ${fin(x.w) ? x.w.toFixed(2) : '–'}, renormalised over the drivers present">${fin(x.wNorm) ? x.wNorm.toFixed(2) : '–'}</td><td class="n ${cls(x.contrib)}">${sgn(x.contrib)}</td><td class="muted" style="font-size:11px">${esc(x.source ?? '')}</td><td class="n muted" style="font-size:11px">${esc(day(x.asOf))}</td></tr>`).join('');
  const miss = (m.missing ?? []).map(x => `<li>${legs && x.leg ? `${esc(x.leg)} ` : ''}${esc(x.label)} <span class="muted">(w ${fin(x.w) ? x.w.toFixed(2) : '–'}): ${esc(x.why ?? 'no data')}</span></li>`).join('');
  return `<div class="scroll"><table class="be-table"><thead><tr><th>Driver</th><th>Reading</th><th class="n" title="the reading mapped to −2..+2 by fixed thresholds">d</th><th class="n">w</th><th class="n">contrib</th><th>Source</th><th class="n">as of</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="muted">No driver had data.</td></tr>'}</tbody>
<tfoot><tr><td colspan="4"><b>Score</b> <span class="muted">(Σ w·d over the drivers present)</span></td><td class="n ${cls(m.score)}"><b>${sgn(m.score)}</b></td><td colspan="2" class="muted">coverage ${pctTxt(m.coverage)} of the weight</td></tr></tfoot></table></div>
${miss ? `<details class="be-miss"><summary class="muted">Missing (${(m.missing ?? []).length}): dropped, the rest renormalised</summary><ul>${miss}</ul></details>` : ''}`;
}

/** What would change the label. A 'trade' surface (it reads as an invalidation line): wrapped in panel.be.flip, off for the desk login by default. */
export function flipHtml(m) {
  return m?.flip ? `<div class="sfc" data-surface="panel.be.flip"><div class="be-flip"><span class="lbl">What would flip the engine</span><p>${esc(m.flip)}</p></div></div>` : '';
}

/** The full engine block for a market (the Assets full view, the Currency modal): chip, why, the table, flip, footnote. */
export function fullBlockHtml(m, { title = 'Bias engine', desk = null, who = 'the desk', rec = null, legs = false } = {}) {
  if (!m) return '';
  return `<div class="be-block"><div class="sec"><h2>${esc(title)}</h2><span class="lbl">rule-based macro checklist · weights ${esc(rec?.weights ?? 'theory-v1')}${rec?.live ? ' · live read, not stored' : rec?.date ? ` · issue ${esc(rec.date)}` : ''}</span></div>
<div class="drv" style="align-items:center">${engineChip(m)}${splitChip(m, desk, who)}<span>score ${sgn(m.score)} of ±2</span><span>coverage ${pctTxt(m.coverage)}</span>${m.asOf ? `<span>as of ${esc(when(m.asOf))}</span>` : ''}</div>
${m.why ? `<p class="be-why">${esc(m.why)}</p>` : ''}${driverTableHtml(m, { legs })}${flipHtml(m)}${footnoteHtml(rec)}</div>`;
}

/** The Assets card's compact line: the chip and the split chip beside the desk rating. */
export function cardChipsHtml(m, desk) { return m ? `${engineChip(m)}${splitChip(m, desk)}` : ''; }

/** Agreement between the engine and the desk: over the desk's cards the engine covers, and over the eight currencies. */
export function agreement(rec, { cards = {}, ccy = {} } = {}) {
  const out = { markets: { agree: 0, total: 0, split: [] }, currencies: { agree: 0, total: 0, split: [] } };
  if (!rec) return out;
  for (const [n, c] of Object.entries(cards ?? {})) {
    const d = deskSign({ rating: c?.rating }), m = marketView(rec, n), e = engineSign(m);
    if (d == null || e == null || !fin(m?.score)) continue;
    out.markets.total++; if (d === e) out.markets.agree++; else out.markets.split.push(n);
  }
  for (const c of CCYS) {
    const d = deskSign({ bias: ccy?.[c]?.bias }), m = rec.currencies?.[c], e = engineSign(m);
    if (d == null || e == null || !fin(m?.score)) continue;
    out.currencies.total++; if (d === e) out.currencies.agree++; else out.currencies.split.push(c);
  }
  return out;
}
export function agreementLine(a) {
  const p = [];
  if (a?.markets?.total) p.push(`engine vs desk agree on ${a.markets.agree} of ${a.markets.total} markets`);
  if (a?.currencies?.total) p.push(`${a.currencies.agree} of ${a.currencies.total} currencies`);
  return p.join(' · ');
}

/** The Overview strip: the engine's currency ranking (strongest to weakest) with each score, and the agreement line. */
export function rankingStripHtml(rec, { deskRanking = null, agree = null, flag = {} } = {}) {
  if (!rec?.currencies || !rec.ranking?.length) return '';
  const rows = rec.ranking.map((c, i) => { const m = rec.currencies[c], s = m?.score, dr = deskRanking ? deskRanking.indexOf(c) : -1;
    return `<div class="sbox" tabindex="0" data-ccy="${esc(c)}" title="${esc(m?.why ?? '')}"><b>${flag[c] ?? ''} ${esc(c)}</b><div class="vbar"><i style="height:${fin(s) ? Math.max(4, Math.abs(s) * 20) : 2}px;background:${s > 0 ? 'var(--up)' : s < 0 ? 'var(--dn)' : 'var(--flat)'}"></i></div><div class="v ${cls(s)}">${sgn(s)}</div><span class="muted">${esc(engineLabel(m) ?? 'no data')}${dr >= 0 ? ` · desk #${dr + 1}` : ''}</span><span class="be-rk mono muted">#${i + 1}</span></div>`; }).join('');
  const line = agree ? agreementLine(agree) : '';
  return `<div class="card be-rank"><div class="ch"><span class="lbl">Currency ranking · bias engine</span><span class="r">${rec.live ? '<span class="chip" title="computed now, not stored and not scored">live read</span>' : rec.date ? `<span class="chip">${esc(rec.date)}</span>` : ''}${line ? `<span class="chip pur" title="Same side, Neutral counting as a side. Markets: the desk's cards the engine covers.">${esc(line)}</span>` : ''}</span></div><div class="strength">${rows}</div>${footnoteHtml(rec)}</div>`;
}

// ── the Macro section: currencies × drivers, the weights, coverage and the gaps ──
export const CCY_COLS = [['policy', 'Policy'], ['rates', 'Rate diff'], ['data', 'Data'], ['realYield', 'Real yield'], ['risk', 'Risk role'], ['commodity', 'Commodity'], ['positioning', 'COT'], ['trend', 'Trend']];
/** A heat background for a contribution (theme tokens): stronger as |contrib| nears `full`. */
export function heat(c, full = 0.5) {
  if (!fin(c) || c === 0) return 'var(--bg3)';
  const a = 0.08 + Math.min(1, Math.abs(c) / full) * 0.45;
  return `rgba(var(--${c > 0 ? 'up' : 'dn'}rgb),${a.toFixed(2)})`;
}
/** One grid cell for a market and a driver key: its contribution, missing (·) or not applicable (n/a). */
export function cellOf(m, key) {
  const d = (m?.drivers ?? []).find(x => x.key === key);
  if (d) return { kind: 'used', contrib: d.contrib, d: d.d, title: `${d.label}: ${d.reading ?? ''} → d ${d.d}, w ${fin(d.wNorm) ? d.wNorm.toFixed(2) : '–'}, contribution ${sgn(d.contrib)}${d.asOf ? ` (as of ${day(d.asOf)})` : ''}` };
  const x = (m?.missing ?? []).find(y => y.key === key);
  if (x) return { kind: 'missing', title: `${x.label}: missing (${x.why ?? 'no data'})` };
  return { kind: 'na', title: 'not applicable to this market' };
}
const cellTd = (m, key) => { const c = cellOf(m, key);
  return c.kind === 'used' ? `<td style="background:${heat(c.contrib)}" title="${esc(c.title)}">${sgn(c.contrib)}</td>` : `<td class="muted" title="${esc(c.title)}">${c.kind === 'missing' ? '·' : 'n/a'}</td>`; };
function gridTable(rows, cols, rec) {
  return `<div class="scroll"><table class="heat be-grid"><thead><tr><th></th>${cols.map(([, l]) => `<th style="text-align:center">${esc(l)}</th>`).join('')}<th style="text-align:center">Score</th><th style="text-align:center">Read</th><th style="text-align:center">Coverage</th></tr></thead><tbody>${rows.map(([name, m]) => `<tr><th${m ? ` data-be="${esc(name)}"` : ''}>${esc(name)}</th>${cols.map(([k]) => cellTd(m, k)).join('')}<td style="background:${heat(m?.score, 1.2)}"><b>${sgn(m?.score)}</b></td><td>${engineChip(m, { prefix: 'Engine' }).replace('Engine: ', '') || '–'}</td><td class="${fin(m?.coverage) && m.coverage < 0.5 ? 'dn' : ''}">${pctTxt(m?.coverage)}</td></tr>`).join('')}</tbody></table></div>`;
}
const WEIGHT_SETS = () => [['Currencies', CCY_WEIGHTS], ['Gold, silver', GOLD_WEIGHTS], ['US indices', INDEX_WEIGHTS], ['DE30, UK100', EU_INDEX_WEIGHTS], ['Oil, copper', CMDTY_WEIGHTS], ['Risk score R', RISK_WEIGHTS]];
export function weightsHtml() {
  return `<div class="grid g3">${WEIGHT_SETS().map(([t, w]) => `<div class="be-w"><span class="lbl">${esc(t)}</span>${Object.entries(w).map(([k, v]) => `<div class="be-wr"><span>${esc(k)}</span><div class="bar"><i style="width:${Math.round(v * 400)}%;max-width:100%;background:var(--pur)"></i></div><span class="mono">${v.toFixed(2)}</span></div>`).join('')}</div>`).join('')}</div>`;
}
/** The whole Macro section. '' when there is no record. */
export function macroSectionHtml(rec) {
  if (!rec?.currencies) return '';
  const ccyRows = (rec.ranking?.length ? [...rec.ranking, ...CCYS.filter(c => !rec.ranking.includes(c))] : CCYS).map(c => [c, rec.currencies[c]]);
  const assets = ASSETS.filter(a => rec.markets?.[a]).map(a => [a, rec.markets[a]]);
  const assetKeys = [...new Set(assets.flatMap(([, m]) => [...(m.drivers ?? []), ...(m.missing ?? [])].map(x => x.key)))];
  const ASSET_LBL = { realYield: 'Real yield', usd: 'USD', fedPath: 'Fed path', ratesPath: 'ECB/BoE path', rates: 'Rates', ccy: 'Own ccy', risk: 'Risk', data: 'Data', globalData: 'Global data', inventories: 'Inventories', positioning: 'COT', trend: 'Trend' };
  const R = rec.risk;
  return `<div class="card be-macro"><div class="ch"><span class="lbl">Bias engine · currencies × drivers</span><span class="r">${rec.live ? '<span class="chip" title="computed now, not stored and not scored">live read</span>' : rec.date ? `<span class="chip">issue ${esc(rec.date)}</span>` : ''}<span class="chip pur">weights ${esc(rec.weights ?? 'theory-v1')}</span>${rec.asOf ? `<span class="muted">as of ${esc(when(rec.asOf))}</span>` : ''}</span></div>
<p class="muted" style="margin-top:0">Each cell is a driver's contribution to the currency's score (w·d, the weights renormalised over the drivers present): green pushes the currency up, red down. · is missing (dropped), n/a does not apply. Hover a cell for its reading.</p>
${gridTable(ccyRows, CCY_COLS, rec)}
${R ? `<div class="drv" style="margin-top:10px"><span class="lbl" style="align-self:center">Global risk R</span><span class="${cls(R.score)}">R ${sgn(R.score)} (risk-on +)</span><span>coverage ${pctTxt(R.coverage)}</span>${(R.drivers ?? []).map(d => `<span title="${esc(d.source ?? '')}">${esc(d.label)}: ${esc(d.reading ?? '')} → ${sgn(d.contrib)}</span>`).join('')}</div>` : ''}</div>
${assets.length ? `<div class="card" style="margin-top:14px"><div class="ch"><span class="lbl">Bias engine · assets × drivers</span></div>${gridTable(assets, assetKeys.map(k => [k, ASSET_LBL[k] ?? k]), rec)}</div>` : ''}
<div class="card" style="margin-top:14px"><div class="ch"><span class="lbl">Weights · ${esc(rec.weights ?? 'theory-v1')}</span><span class="r muted">theory weights, revised only from the forward record</span></div>${weightsHtml()}</div>
<div class="card" style="margin-top:14px"><div class="ch"><span class="lbl">Gaps</span><span class="r muted">${(rec.gaps ?? []).length} missing input${(rec.gaps ?? []).length === 1 ? '' : 's'}, grouped by reason</span></div>${(rec.gaps ?? []).length ? `<ul class="be-gaps">${rec.gaps.map(g => `<li>${esc(g)}</li>`).join('')}</ul>` : '<p class="muted">No gaps: every driver had data.</p>'}${footnoteHtml(rec)}</div>`;
}

/** The Pair tab card: the pair score, then both legs' drivers side by side. view: the ?market= answer's `market` (a pairFrom view, or an asset/currency). */
export function pairCardHtml(view, head = {}) {
  if (!view) return '';
  const legs = view.legs ?? null;
  const side = leg => { const ds = (view.drivers ?? []).filter(x => x.leg === leg).sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib)), miss = (view.missing ?? []).filter(x => x.leg === leg);
    return `<div class="be-leg"><div class="ch" style="margin-bottom:6px"><b class="mono">${esc(leg)}</b><span class="r mono ${cls(view.legScores?.[leg])}">score ${sgn(view.legScores?.[leg])}</span></div><table class="be-table"><tbody>${ds.map(x => `<tr><td>${esc(x.label)}<br><span class="muted" style="font-size:11px">${esc(x.reading ?? '')}</span></td><td class="n ${cls(x.contrib)}">${sgn(x.contrib)}</td></tr>`).join('') || '<tr><td class="muted">No drivers.</td></tr>'}</tbody></table>${miss.length ? `<p class="muted" style="font-size:11px;margin:6px 0 0">missing: ${miss.map(x => esc(x.label)).join(', ')}</p>` : ''}</div>`; };
  return `<div class="ch"><span class="lbl">Bias engine · ${esc(view.market ?? '')}</span><span class="r">${engineChip(view)}${splitChip(view, head.desk ?? null)}${head.live ? '<span class="chip" title="computed now, not stored and not scored">live read</span>' : head.date ? `<span class="chip">${esc(head.date)}</span>` : ''}</span></div>
<div class="drv"><span>score ${sgn(view.score)} of ±2${legs ? ' = (base − quote) / 2' : ''}</span><span>coverage ${pctTxt(view.coverage)}</span></div>
${view.why ? `<p class="be-why">${esc(view.why)}</p>` : ''}
${legs ? `<p class="muted" style="font-size:12px;margin:0 0 6px">Each leg's contributions are halved; the quote's are negated, so a driver that lifts ${esc(legs[1])} counts against ${esc(legs[0])}/${esc(legs[1])}.</p><div class="be-legs">${side(legs[0])}${side(legs[1])}</div>` : driverTableHtml(view)}
${flipHtml(view)}${footnoteHtml(head)}`;
}

/** The Replay side card: the engine's stored read for the replayed day, for this market. '' when none was issued that day. */
export function replayHtml(view, head = {}) {
  if (!view) return '';
  return `<div>${engineChip(view)} <span class="chip">${esc(head.date ?? day(head.asOf))}</span></div><div class="be-key" style="margin-top:6px"><ul>${topDrivers(view, 4).map(x => `<li><b>${esc(x.leg ? `${x.leg} ` : '')}${esc(x.label)}</b><span class="muted">${esc(x.reading ?? '')}</span><span class="mono ${cls(x.contrib)}">${sgn(x.contrib)}</span></li>`).join('')}</ul></div><p class="muted" style="margin:8px 0 0;font-size:11.5px">The engine's issue for that morning (written ${esc(when(head.asOf))}), score ${sgn(view.score)} of ±2, coverage ${pctTxt(view.coverage)}. ${esc(head.footnote ?? FOOTNOTE)}</p>`;
}
