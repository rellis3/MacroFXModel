/**
 * Give-back — per-bot exit-quality analytics from the closed-trade logs.
 *
 * Answers the owner's question ("we run massively in profit intraday then end
 * red — how, and how do I get out better per bot?") on the dashboard, no Python.
 * For every CLOSED trade it compares the PEAK favourable move (MFE) with what
 * the exit actually kept — the give-back — and aggregates it per bot.
 *
 * MFE/MAE source, in order:
 *   1. `mfe_pips`/`mae_pips` already on the row (the pylego brokers now log them
 *      live — PaperBroker water-marks, Mt5Broker M1 reconstruction).
 *   2. Reconstructed here from the real M1 high/low path when the row predates
 *      that logging — `excursionFromM1` (same packed-array contract + `bisect`
 *      as loadM1ForPair / barUtils, never a close-to-close approximation).
 *
 * Pure + offline-testable: the caller injects the M1 loader and pip resolver, so
 * this brick has no network/DOM/global state. Tested in js/giveback.test.mjs.
 */
import { bisect } from './barUtils.js';

// Reconstruct favourable/adverse excursion (in pips) for one trade from packed
// M1. packed = { n, times[](epoch s), highs[], lows[] }. Returns
// { mfePips>=0, maePips<=0 } or null when the window has no bars.
export function excursionFromM1(packed, trade, pip) {
  const { time_open: to, time_close: tc, direction, open_price: entry } = trade;
  if (!packed || !packed.n || !to || !tc || !entry || !pip) return null;
  const start = bisect(packed.times, to);
  let maxH = -Infinity, minL = Infinity, seen = 0;
  for (let i = start; i < packed.n && packed.times[i] < tc; i++) {
    if (packed.highs[i] > maxH) maxH = packed.highs[i];
    if (packed.lows[i]  < minL) minL = packed.lows[i];
    seen++;
  }
  if (!seen || !isFinite(maxH) || !isFinite(minL)) return null;
  const isLong = direction === 'BUY' || direction === 'LONG';
  const fav = isLong ? (maxH - entry) : (entry - minL);   // favourable distance
  const adv = isLong ? (entry - minL) : (maxH - entry);   // adverse distance
  return { mfePips: Math.max(0, fav) / pip, maePips: -Math.max(0, adv) / pip };
}

const _median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const _pct = (a, p) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))];
};

/**
 * Build one bot's give-back summary from its trade-log rows. Each row is the
 * rollup shape: { direction, open_price, close_price, profit, time_open,
 * time_close, mfe_pips?, mae_pips? }. `pipFor(symbolOrKey)` → pip size.
 * Rows still missing mfe_pips after enrichment are counted as `pending` and
 * excluded from the stats (never guessed).
 */
export function summarizeGiveback(rows, pipFor) {
  const per = [];
  let pending = 0;
  for (const r of rows) {
    if (r.mfe_pips == null || r.open_price == null || r.close_price == null) { pending++; continue; }
    const pip = pipFor(r.key || r.symbol) || 0.0001;
    const isLong = r.direction === 'BUY' || r.direction === 'LONG';
    const realizedPips = (isLong ? (r.close_price - r.open_price) : (r.open_price - r.close_price)) / pip;
    const mfePips = r.mfe_pips;
    const givebackPips = mfePips - realizedPips;                 // peak not kept
    // $ per pip backed out of the row's own realised profit (no pip-value table
    // needed): |profit / realisedPips|. Null when it closed at entry.
    const dpp = (r.profit != null && Math.abs(realizedPips) > 1e-9)
      ? Math.abs(r.profit / realizedPips) : null;
    per.push({
      time_close: r.time_close, symbol: r.symbol, direction: r.direction, reason: r.reason,
      mfePips, realizedPips, givebackPips,
      givebackFrac: mfePips > 1e-9 ? givebackPips / mfePips : 0,
      profit: r.profit ?? null,
      givebackUsd: dpp != null ? givebackPips * dpp : null,
      mfeUsd: dpp != null ? mfePips * dpp : null,
    });
  }
  const n = per.length;
  const winners = per.filter(t => t.realizedPips > 0);
  const losers  = per.filter(t => t.realizedPips <= 0);
  // "Reached real green then closed <= breakeven" — the give-back that stings.
  const greenThenRed = per.filter(t => t.mfePips > 2 && t.realizedPips <= 0);
  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);

  return {
    n, pending,
    medianMfePips: _median(per.map(t => t.mfePips)),
    medianRealizedPips: _median(per.map(t => t.realizedPips)),
    medianGivebackPips: _median(per.map(t => t.givebackPips)),
    medianGivebackFrac: _median(per.map(t => t.givebackFrac)),
    mfeP90Pips: _pct(per.map(t => t.mfePips), 90),
    winners: winners.length,
    losers: losers.length,
    winnersGivebackFrac: _median(winners.map(t => t.givebackFrac)),
    losersMedianMfePips: _median(losers.map(t => t.mfePips)),
    greenThenRed: greenThenRed.length,
    totalMfeUsd: sum(per, t => t.mfeUsd),
    totalGivebackUsd: sum(per, t => t.givebackUsd),
    totalRealizedUsd: sum(per, t => t.profit),
    trades: per.sort((a, b) => (b.time_close || 0) - (a.time_close || 0)),
  };
}
