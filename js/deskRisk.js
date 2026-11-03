/**
 * Phase 11: the portfolio risk manager (plans/DESK_ANALYST_PIPELINE.md §9p). How concentrated is the book, and what
 * does it do in a scenario?
 *
 * Unit: one normal-size card (size 1) moving one daily standard deviation against you = -1 "card-σ". Each market's daily
 * log returns over the last ~60 sessions are divided by that market's own σ, so every card is one unit of daily risk
 * times its size, and correlations come from those standardised returns.
 *   book σ           sqrt(w'Cw): the book's daily risk in card-σ;
 *   effective bets   (Σ|w|)² / w'Cw: 1 when every card is the same bet, N when N equal cards are independent;
 *   contributions    each card's share of the book's variance, w_i (Cw)_i / w'Cw (they sum to 1);
 *   bets             cards grouped where they move together the same way (signed correlation above 0.6);
 *   scenarios        a one-σ move in a factor (the dollar, risk via the Nasdaq, the yen), through each market's beta;
 *   history          the book as if held over each of the last sessions: the worst day and the 5th percentile.
 *
 * Pure. Description, not a forecast. Tested in js/deskRisk.test.mjs.
 */
const DIR = { STRONG_LONG: 1, LONG: 1, SHORT: -1, STRONG_SHORT: -1 };
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const r2 = x => (Number.isFinite(x) ? +x.toFixed(2) : null);

/** Standardised daily returns per market on common dates. closes: { INST: [{ date, close }] } ascending. */
export function standardise(closes, { minDays = 30 } = {}) {
  const series = {};
  for (const [n, rows] of Object.entries(closes ?? {})) {
    const r = [];
    for (let i = 1; i < rows.length; i++) if (rows[i].close > 0 && rows[i - 1].close > 0) r.push({ date: rows[i].date, r: Math.log(rows[i].close / rows[i - 1].close) });
    if (r.length < minDays) continue;
    const s = sd(r.map(x => x.r)); if (!(s > 0)) continue;
    series[n] = new Map(r.map(x => [x.date, x.r / s]));
  }
  const names = Object.keys(series);
  const dates = names.length ? [...series[names[0]].keys()].filter(d => names.every(n => series[n].has(d))).sort() : [];
  return { names, dates, z: Object.fromEntries(names.map(n => [n, dates.map(d => series[n].get(d))])) };
}

const corr = (a, b) => { const ma = mean(a), mb = mean(b); let sab = 0, sa = 0, sb = 0; for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; sa += x * x; sb += y * y; } return sa > 0 && sb > 0 ? sab / Math.sqrt(sa * sb) : 0; };
const beta = (y, f) => { const mf = mean(f), my = mean(y); let c = 0, v = 0; for (let i = 0; i < f.length; i++) { c += (f[i] - mf) * (y[i] - my); v += (f[i] - mf) ** 2; } return v > 0 ? c / v : 0; };

/** Factor series (each scaled to sd 1) from the standardised markets that exist. */
export function factors(z) {
  const avg = parts => { const xs = parts.filter(([n]) => z[n]); if (xs.length < 1) return null; const T = z[xs[0][0]].length; const f = Array.from({ length: T }, (_, t) => mean(xs.map(([n, s]) => s * z[n][t]))); const s = sd(f); return s > 0 ? f.map(x => x / s) : null; };
  return {
    'USD +1σ': avg([['USDJPY', 1], ['USDCAD', 1], ['USDCHF', 1], ['EURUSD', -1], ['GBPUSD', -1], ['AUDUSD', -1], ['NZDUSD', -1]]),
    'Risk-off (Nasdaq −1σ)': (() => { const f = avg([['NQ', 1], ['SPX500', 1]]); return f ? f.map(x => -x) : null; })(),
    'JPY +1σ': avg([['USDJPY', -1], ['EURJPY', -1], ['GBPJPY', -1], ['AUDJPY', -1], ['CADJPY', -1], ['NZDJPY', -1]]),
    'Gold +1σ': avg([['GOLD', 1]]),
  };
}

/** The whole risk read for a book. cards: { INST: { rating, size } } (after the cap). */
export function bookRisk(cards, closes) {
  const { names, dates, z } = standardise(closes);
  const live = names.filter(n => DIR[cards?.[n]?.rating] && Number(cards[n].size) > 0);
  const missing = Object.entries(cards ?? {}).filter(([n, c]) => DIR[c.rating] && Number(c.size) > 0 && !names.includes(n)).map(([n]) => n);
  if (live.length < 2 || dates.length < 20) return { ok: false, reason: `not enough history (${live.length} live cards with data, ${dates.length} common days)`, missing };
  const w = live.map(n => DIR[cards[n].rating] * Number(cards[n].size));
  const C = live.map(a => live.map(b => (a === b ? 1 : corr(z[a], z[b]))));
  const Cw = C.map(row => row.reduce((s, c, j) => s + c * w[j], 0));
  const V = w.reduce((s, x, i) => s + x * Cw[i], 0), gross = w.reduce((s, x) => s + Math.abs(x), 0);
  const contrib = live.map((n, i) => ({ inst: n, weight: r2(w[i]), share: r2(w[i] * Cw[i] / V) })).sort((a, b) => b.share - a.share);
  // bets: greedy clusters of cards that move together the same way (signed correlation > 0.6)
  const left = live.map((n, i) => i).sort((a, b) => Math.abs(w[b]) - Math.abs(w[a])), bets = [];
  while (left.length) {
    const lead = left.shift(), members = [lead];
    for (let k = left.length - 1; k >= 0; k--) { const j = left[k]; if (Math.sign(w[lead]) * Math.sign(w[j]) * C[lead][j] > 0.6) { members.push(j); left.splice(k, 1); } }
    bets.push({ lead: live[lead], cards: members.map(i => live[i]), weight: r2(members.reduce((s, i) => s + Math.abs(w[i]), 0)) });
  }
  const F = factors(z);
  const scenarios = Object.entries(F).filter(([, f]) => f).map(([name, f]) => ({ name, pnl: r2(live.reduce((s, n, i) => s + w[i] * beta(z[n], f), 0)) }));
  const daily = dates.map((d, t) => ({ date: d, pnl: live.reduce((s, n, i) => s + w[i] * z[n][t], 0) }));
  const sorted = [...daily].sort((a, b) => a.pnl - b.pnl), worst = sorted[0];
  return {
    ok: true, days: dates.length, from: dates[0], to: dates.at(-1), cards: live.length, missing,
    bookSigma: r2(Math.sqrt(V)), gross: r2(gross), effectiveBets: r2(gross * gross / V),
    contributions: contrib.slice(0, 10), bets: bets.filter(b => b.cards.length > 1).slice(0, 6), singles: bets.filter(b => b.cards.length === 1).length,
    scenarios, history: { worst: { date: worst.date, pnl: r2(worst.pnl) }, p05: r2(sorted[Math.floor(sorted.length * 0.05)].pnl), best: r2(sorted.at(-1).pnl) },
  };
}
