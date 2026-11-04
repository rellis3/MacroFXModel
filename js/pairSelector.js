/**
 * The pair selector (plans/DESK_ANALYST_PIPELINE.md §9ae): after the currency manager ranks the eight currencies, which
 * pair expresses that view best? A cross is often the cleanest expression: if EUR is strongest and CHF weakest,
 * EUR/CHF is exactly that view, while EUR/USD also carries a dollar view the desk may not hold.
 *
 * For every pair of the eight currencies (28, quoted in market order):
 *   gap        bias(base) − bias(quote), each bias −2..+2 weighted by its conviction (high 1, medium 0.75, low 0.5)
 *   cost       one round-trip spread (the measured spread profile, pips) as a share of the day's expected move u
 *              (the card's ladder: half the p50 up-to-down span); a pair costing a large share of u is a poor vehicle
 *   carry      the policy-rate differential in the trade's direction (% a year); reported, lightly weighted
 *   card       whether the morning book's card on that pair (if the desk trades it) leans the same way
 * score = |gap| − 2 × min(cost, 0.5) + 0.05 × carry in favour (capped ±0.25) + 0.25 if the card agrees − 0.25 if it opposes.
 * The list is chosen greedily with at most `maxPerCcy` picks sharing a currency, so three JPY crosses do not pass as
 * three ideas. Description of the book, not a new forecast: it never changes the scored book.
 *
 * Pure. Tested in js/pairSelector.test.mjs.
 */
export const CCYS = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];   // market quoting order
const W = { high: 1, medium: 0.75, low: 0.5 };
const r2 = x => (Number.isFinite(x) ? +x.toFixed(2) : null);
const r3 = x => (Number.isFinite(x) ? +x.toFixed(3) : null);
const DIR = { STRONG_LONG: 1, LONG: 1, SHORT: -1, STRONG_SHORT: -1 };

/** Every pair of the eight, base before quote in market order: EURUSD, GBPJPY, AUDNZD... */
export const ALL_PAIRS = CCYS.flatMap((b, i) => CCYS.slice(i + 1).map(q => `${b}${q}`));

/** The day's expected move u (price) from a card's ladder: half the span between the up and down p50 lines. */
export const uOf = card => { const up = card?.levels?.up?.p50, dn = card?.levels?.down?.p50; return Number.isFinite(up) && Number.isFinite(dn) && up > dn ? (up - dn) / 2 : null; };
const pipOf = pair => (pair.endsWith('JPY') ? 0.01 : 0.0001);

/**
 * currencies: { CCY: { bias, conviction } } (the currency manager's view); cards: the book's instruments
 * { PAIR: { rating, size, levels } }; spreads: { pairlower: pips }; rates: { CCY: { rate } } (policy, % a year).
 */
export function selectPairs({ currencies = {}, cards = {}, spreads = {}, rates = {} } = {}, { top = 6, maxPerCcy = 2 } = {}) {
  const v = c => { const x = currencies[c]; return Number.isFinite(x?.bias) ? x.bias * (W[x.conviction] ?? 0.5) : null; };
  const rows = [];
  for (const p of ALL_PAIRS) {
    const b = p.slice(0, 3), q = p.slice(3), vb = v(b), vq = v(q);
    if (vb == null || vq == null) continue;
    const gap = vb - vq, dir = gap > 0 ? 1 : gap < 0 ? -1 : 0, card = cards[p], u = uOf(card), sp = spreads[p.toLowerCase()];
    const cost = Number.isFinite(sp) && u ? (sp * pipOf(p)) / u : null;
    const rb = rates[b]?.rate, rq = rates[q]?.rate, carry = Number.isFinite(rb) && Number.isFinite(rq) && dir ? dir * (rb - rq) : null;
    const cardDir = DIR[card?.rating] && card?.size > 0 ? DIR[card.rating] : 0, agrees = cardDir && dir ? cardDir === dir : null;
    const score = Math.abs(gap) - 2 * Math.min(cost ?? 0.15, 0.5) + Math.max(-0.25, Math.min(0.25, 0.05 * (carry ?? 0))) + (agrees === true ? 0.25 : agrees === false ? -0.25 : 0);
    rows.push({ pair: p, base: b, quote: q, direction: dir > 0 ? 'Long' : dir < 0 ? 'Short' : 'None', gap: r2(gap), u: u ? +u.toPrecision(4) : null, spreadPips: Number.isFinite(sp) ? sp : null,
      costShare: r3(cost), carry: r2(carry), card: card ? { rating: card.rating, size: card.size } : null, cardAgrees: agrees, usdFree: b !== 'USD' && q !== 'USD', score: r3(score), traded: !!card });
  }
  rows.sort((a, b) => b.score - a.score);
  const used = {}, picks = [];
  for (const r of rows) {
    if (picks.length >= top || r.direction === 'None') continue;
    if ((used[r.base] ?? 0) >= maxPerCcy || (used[r.quote] ?? 0) >= maxPerCcy) continue;
    used[r.base] = (used[r.base] ?? 0) + 1; used[r.quote] = (used[r.quote] ?? 0) + 1;
    picks.push({ ...r, why: whyOf(r, currencies) });
  }
  // the view's cleanest expression: strongest against weakest by weighted bias
  const ranked = CCYS.filter(c => v(c) != null).sort((a, b) => v(b) - v(a));
  const best = ranked.length >= 2 ? rows.find(r => (r.base === ranked[0] && r.quote === ranked.at(-1)) || (r.base === ranked.at(-1) && r.quote === ranked[0])) ?? null : null;
  const matrix = Object.fromEntries(CCYS.map(b => [b, Object.fromEntries(CCYS.map(q => [q, v(b) != null && v(q) != null && b !== q ? r2(v(b) - v(q)) : null]))]));
  return { picks, strongestWeakest: best, ranked, matrix, rows, label: 'how the currency view is best expressed; a description of the book, not a new forecast' };
}

function whyOf(r, currencies) {
  const s = (c, x) => `${c} ${x > 0 ? '+' : ''}${x} (${currencies[c]?.conviction ?? 'low'})`;
  const bits = [`${r.direction === 'Long' ? `${r.base} over ${r.quote}` : `${r.quote} over ${r.base}`}: ${s(r.base, currencies[r.base]?.bias)} against ${s(r.quote, currencies[r.quote]?.bias)}`];
  if (r.costShare != null) bits.push(`spread ${Math.round(r.costShare * 100)}% of the day's move`);
  if (r.carry != null) bits.push(`carry ${r.carry > 0 ? '+' : ''}${r.carry}% a year ${r.carry >= 0 ? 'in favour' : 'against'}`);
  if (r.cardAgrees != null) bits.push(r.cardAgrees ? 'the book\'s card agrees' : 'the book\'s card leans the other way');
  if (r.usdFree) bits.push('no dollar leg');
  return bits.join(' · ');
}
