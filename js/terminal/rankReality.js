/**
 * The Currency Manager's ranking against the realised currency performance (Desk Terminal, Charts tab). Descriptive:
 * the desk's own record, never a score or a signal, with n shown.
 *
 * Source: the thesis-vs-reality records (js/thesisReality.js; GET /api/thesis-reality?date=), built after each evening
 * score from the stored run and the day's bars. Each record's currencies block holds the morning ranking, the realised
 * ranking (08:00-21:00 London, moves in u), the biases and the Spearman rank correlation of the two orders
 * (thesisReality.rankCorr). Nothing is recomputed here except averages over the days that exist.
 *
 * Pure. Tested in js/terminal/bookView.test.mjs.
 */
import { rankCorr } from '../thesisReality.js';
import { esc } from './bookView.js';

/** One day's table: desk rank, realised rank, bias and move per currency, in the desk's order, with the day's Spearman. */
export function rankRows(day) {
  const c = day?.currencies; if (!c?.ranking?.length) return null;
  const rows = c.ranking.map((ccy, i) => { const rr = c.realisedRanking.indexOf(ccy); return { ccy, desk: i + 1, realised: rr < 0 ? null : rr + 1, bias: c.biases?.[ccy] ?? null, move: c.realised?.[ccy] ?? null }; });
  for (const r of rows) r.gap = r.realised == null ? null : r.realised - r.desk;
  return { date: day.date, rows, rho: c.rankCorr ?? rankCorr(c.ranking, c.realisedRanking), n: rows.filter(r => r.realised != null).length,
    strongest: c.strongest ?? null, weakest: c.weakest ?? null };
}

/**
 * The history over several day records (oldest first): the heat cells, each day's Spearman, the rolling mean (window w)
 * and the hit rate of the desk's top and bottom calls (the top currency finishing in the realised top half, the
 * bottom one in the bottom half: thesisReality's strongest / weakest verdicts).
 */
export function rankHistory(days, { w = 5 } = {}) {
  const xs = (days ?? []).filter(d => d?.currencies?.ranking?.length).slice().sort((a, b) => a.date.localeCompare(b.date));
  const ORDER = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'], ccys = [...new Set(xs.flatMap(d => d.currencies.ranking))].sort((a, b) => ((ORDER.indexOf(a) + 99) % 99) - ((ORDER.indexOf(b) + 99) % 99));
  const cells = xs.map(d => { const c = d.currencies, n = c.ranking.length; return { date: d.date, of: c.realisedRanking.length, by: Object.fromEntries(ccys.map(k => { const dr = c.ranking.indexOf(k), rr = c.realisedRanking.indexOf(k);
    return [k, { desk: dr < 0 ? null : dr + 1, realised: rr < 0 ? null : rr + 1, mark: dr === 0 ? 'top' : dr === n - 1 ? 'bottom' : null }]; })) }; });
  const rho = xs.map(d => ({ date: d.date, rho: d.currencies.rankCorr ?? rankCorr(d.currencies.ranking, d.currencies.realisedRanking) }));
  const rolling = rho.map((_, i) => { const win = rho.slice(Math.max(0, i - w + 1), i + 1).map(r => r.rho).filter(Number.isFinite); return { date: rho[i].date, mean: win.length ? +(win.reduce((s, v) => s + v, 0) / win.length).toFixed(3) : null, n: win.length }; });
  const calls = xs.flatMap(d => [d.currencies.strongest?.verdict, d.currencies.weakest?.verdict]).filter(v => v === 'right' || v === 'wrong');
  const valid = rho.map(r => r.rho).filter(Number.isFinite);
  return { ccys, cells, rho, rolling, w, days: xs.length,
    meanRho: valid.length ? +(valid.reduce((s, v) => s + v, 0) / valid.length).toFixed(3) : null, rhoN: valid.length,
    hit: { n: calls.length, right: calls.filter(v => v === 'right').length, share: calls.length ? +(calls.filter(v => v === 'right').length / calls.length).toFixed(3) : null } };
}

const sg = v => (v == null || !Number.isFinite(+v) ? '–' : `${+v > 0 ? '+' : ''}${(+v).toFixed(2)}`);
/** realised rank → a colour from green (1st) to red (last). */
export function rankColour(rank, of) {
  if (!rank || !(of > 1)) return 'rgba(138,147,184,.15)';
  const t = (rank - 1) / (of - 1);
  return t <= 0.5 ? `rgba(47,211,154,${(0.65 - t * 1.0).toFixed(2)})` : `rgba(255,93,120,${(0.15 + (t - 0.5) * 1.0).toFixed(2)})`;
}

/** The latest day's table. */
export function rankTableHtml(t) {
  if (!t) return '<p class="muted">No scored day yet.</p>';
  return `<div class="scroll"><table class="bf-tbl"><thead><tr><th>Ccy</th><th class="n">Desk rank</th><th class="n">Realised rank</th><th class="n">Gap</th><th class="n">Bias</th><th class="n">Move u</th></tr></thead><tbody>${t.rows.map(r => `<tr><td class="mono"><b>${esc(r.ccy)}</b></td><td class="n mono">${r.desk}</td><td class="n mono" style="background:${rankColour(r.realised, t.n)}">${r.realised ?? '–'}</td><td class="n mono">${r.gap == null ? '–' : r.gap > 0 ? `+${r.gap}` : r.gap}</td><td class="n mono ${r.bias > 0 ? 'up' : r.bias < 0 ? 'dn' : ''}">${r.bias == null ? '–' : (r.bias > 0 ? '+' : '') + r.bias}</td><td class="n mono ${r.move > 0 ? 'up' : r.move < 0 ? 'dn' : ''}">${sg(r.move)}</td></tr>`).join('')}</tbody></table></div>
<div class="muted" style="font-size:12px;margin-top:6px">Spearman for ${esc(t.date)}: <b class="mono">${sg(t.rho)}</b> over ${t.n} currencies (1 = the same order, −1 = reversed). Gap = realised rank minus desk rank.</div>`;
}

/** The heat of history: days down, currencies across; ▲/▼ where the desk ranked a currency top / bottom (coloured by its realised rank). */
export function rankHeatHtml(h) {
  if (!h?.days) return '<p class="muted">No scored day yet.</p>';
  const head = `<tr><th>Day</th>${h.ccys.map(c => `<th class="n">${esc(c)}</th>`).join('')}<th class="n" title="Spearman rank correlation">rho</th></tr>`;
  const body = h.cells.slice().reverse().map(d => { const r = h.rho.find(x => x.date === d.date)?.rho;
    return `<tr><td class="mono">${esc(d.date.slice(5))}</td>${h.ccys.map(c => { const x = d.by[c];
      return `<td class="n mono rr-c${x.mark ? ' rr-m' : ''}" style="background:${x.mark ? rankColour(x.realised, d.of) : 'transparent'}" title="${esc(`${d.date} ${c}: desk #${x.desk ?? '–'}, realised #${x.realised ?? '–'}`)}">${x.mark === 'top' ? '▲' : x.mark === 'bottom' ? '▼' : ''}${x.realised ?? '–'}</td>`; }).join('')}<td class="n mono">${sg(r)}</td></tr>`; }).join('');
  return `<div class="scroll"><table class="bf-tbl rr-heat"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}
