/**
 * Reversion Proof — the transparent, per-day version of the reversion question.
 *
 * No aggregate to trust blind: this emits EVERY London day's raw numbers so they can be
 * scrolled and each day's chart inspected. It implements the owner's exact mental model:
 *   • from the London-midnight OPEN, the median line sits a distance R above and below,
 *     where R = the forecast median H-L range (Feller 1.572 × σ, causal — no lookahead);
 *   • the day's actual HIGH is where price reverted on the upside, the LOW on the downside;
 *   • a "win" = the reversion (that extreme) landed within `tolPips` of its line.
 *
 * The aggregate is literally the average of the rows: "the median line sits at avgR% above
 * open; price's high reverts at avgHigh% → gap / hit-rate." Nothing hidden, nothing skipped.
 *
 * IMPORTANT (stated so the tool can't mislead): R is the full HIGH-TO-LOW range. The
 * distance from the OPEN to the high is only PART of that range (the rest is open→low), so
 * a line placed a full R above the open is expected to sit ABOVE where the high lands on a
 * two-sided day. The per-day rows + charts make that concrete instead of asking for trust.
 *
 * Pure; composes buildLondonDaily + yzVolSeries. No new vol math.
 */
import { buildLondonDaily } from './volEstimatorAB.js';
import { yzVolSeries } from './volBacktestEngine.js';
import { pipSize } from './instrumentRegistry.js';

const _mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const _sort = a => [...a].sort((x, y) => x - y);
const _median = a => { if (!a.length) return 0; const s = _sort(a); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r3 = x => x == null ? null : Math.round(x * 1000) / 1000;

const MEDIAN_CONST = 1.572;   // Feller H-L median (the "median line") × daily σ

export function reversionProof(intraday, opts = {}) {
  const { pair = 'EURUSD', tolPips = 5, minLookback = 40, maxRows = 500 } = opts;
  const lond = buildLondonDaily(intraday);
  if (lond.length < 120) return { insufficient: true, nDays: lond.length };
  const pip = pipSize(pair);
  const yz = yzVolSeries(lond, 30);   // daily σ, causal

  const rows = [];
  const Rs = [], highs = [], lows = [], upGaps = [], dnGaps = [];
  let upWins = 0, dnWins = 0, n = 0;

  for (let i = minLookback; i < lond.length; i++) {
    const d = lond[i];
    if (!(d.open > 0)) continue;
    const sig = yz[i - 1];               // σ forecast for day i (uses data < i)
    if (!(sig > 0)) continue;
    const R = MEDIAN_CONST * sig * 100;  // median H-L range, % of price
    const highPct = (d.high - d.open) / d.open * 100;   // upside reach from open
    const lowPct = (d.open - d.low) / d.open * 100;     // downside reach from open
    const lineUp = d.open * (1 + R / 100), lineDn = d.open * (1 - R / 100);
    const upGap = Math.abs(highPct - R) / 100 * d.open / pip;   // pips: high vs the up-line
    const dnGap = Math.abs(lowPct - R) / 100 * d.open / pip;    // pips: low vs the down-line
    const upWin = upGap <= tolPips, dnWin = dnGap <= tolPips;

    n++; Rs.push(R); highs.push(highPct); lows.push(lowPct); upGaps.push(upGap); dnGaps.push(dnGap);
    if (upWin) upWins++; if (dnWin) dnWins++;
    rows.push({
      date: d.date, open: d.open,
      R: r3(R), highPct: r3(highPct), lowPct: r3(lowPct),
      lineUp: +lineUp.toFixed(5), lineDn: +lineDn.toFixed(5), high: d.high, low: d.low,
      upGapPips: r3(upGap), dnGapPips: r3(dnGap), upWin, dnWin,
    });
  }
  if (!n) return { insufficient: true, nDays: lond.length };

  const aggregate = {
    nDays: n, tolPips,
    avgR: r3(_mean(Rs)),
    avgHighPct: r3(_mean(highs)), avgLowPct: r3(_mean(lows)),
    medHighPct: r3(_median(highs)), medLowPct: r3(_median(lows)),
    upHitRate: r3(upWins / n * 100), dnHitRate: r3(dnWins / n * 100),
    avgUpGapPips: r3(_mean(upGaps)), avgDnGapPips: r3(_mean(dnGaps)),
    // Where the reversion lands relative to the line (avg extreme ÷ avg line). <1 ⇒ price
    // reverts SHORT of the line; ≈1 ⇒ reverts AT it; >1 ⇒ overshoots.
    reachOverLineUp: r3(_mean(highs) / _mean(Rs)),
    reachOverLineDn: r3(_mean(lows) / _mean(Rs)),
  };
  return {
    pair, pip, medianConst: MEDIAN_CONST, nDays: lond.length,
    dateFrom: lond[0].date, dateTo: lond.at(-1).date,
    aggregate, rows: rows.slice(-maxRows), rowsReturned: Math.min(rows.length, maxRows), rowsTotal: rows.length,
  };
}
