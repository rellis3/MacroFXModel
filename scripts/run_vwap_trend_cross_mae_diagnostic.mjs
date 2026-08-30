#!/usr/bin/env node
/**
 * §22b — vwap_trend_cross has never had a stop-loss, unlike every fade-family
 * test in this study. Before concluding anything further about the sigma
 * sweep, check whether that's (also) a fat-tail-risk problem: pull the real
 * MAE (max adverse excursion, walked off the actual OHLC path) distribution
 * at minCrossSigma=1.0 -- the highest threshold where §21 showed genuine,
 * non-sign-flipped negative results on all 4 instruments -- and ask two
 * separate questions:
 *
 *   1) Descriptive: how big are the adverse moves, split win vs loss?
 *   2) Does a REAL stop (a forward-walked exit the moment price wicks past
 *      entryPx ± stopSigma·σ — `stopSigma` on vwap_trend_cross, engine-level,
 *      2026-08-30) help? An earlier version of this script tried to answer
 *      this by retroactively capping each trade's pnl at its own recorded
 *      MAE -- that's invalid: MAE is measured off intrabar wicks while the
 *      natural exit is measured off closes, so MAE >= the natural exit's
 *      adverse move BY CONSTRUCTION, meaning a retroactive cap can only ever
 *      make pnl same-or-worse. It can never show a stop helping even if one
 *      genuinely would. Fixed by simulating the stop forward in the engine
 *      itself and re-running real trades, the only honest way to test it.
 *
 * Pre-registered priors (both genuinely open):
 *   - If a stopSigma level improves OOS expectancy/t while keeping n>=30 and
 *     the same sign IS/OOS, that's a real structural finding worth carrying
 *     forward as a feature.
 *   - If every stopSigma level is flat-to-worse than the no-stop baseline,
 *     this is a slow-bleed null (many small negative-EV trades), not a
 *     fat-tail one -- consistent with §20's original diagnosis (gross P&L
 *     ~0, not a few blown-up losers) -- and a stop is not the fix.
 *
 *   node scripts/run_vwap_trend_cross_mae_diagnostic.mjs [pairs...]
 */

import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { runVwapReversion } from '../js/vwapReversionEngine.js';
import { summarizeSplit } from '../js/honestForecastEngine.js';

const pairs = process.argv.slice(2).filter(a => !a.startsWith('-'));
const list = pairs.length ? pairs : ['gold', 'eurusd', 'gbpusd', 'usdjpy'];
const MINCROSS = 1.0;
const STOPS = [1, 1.5, 2, 2.5, 3, 4, 5];

const tOf = s => s.trades > 1 && s.tradesPerYr > 0
  ? +((s.sharpe / Math.sqrt(s.tradesPerYr)) * Math.sqrt(s.trades)).toFixed(2) : null;

function pct(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))));
  return +s[idx].toFixed(3);
}
function mean(arr) { return arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(3) : null; }

for (const pair of list) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.log(`\n=== ${pair}: no M1 ===`); continue; }
  const costPct = pair === 'gold' ? 0.020 : 0.012;

  // Descriptive MAE pass: no stop, so MAE reflects the full un-truncated path.
  const noStopRecords = runVwapReversion(packed, { mode: 'vwap_trend_cross', sessionAnchor: 'day', dir: 'both', costPct, minCrossSigma: MINCROSS });
  const filled = noStopRecords.filter(r => r.filled && r.maeSigma != null);
  const winners = filled.filter(r => r.pnl_pct > 0);
  const losers = filled.filter(r => r.pnl_pct <= 0);

  console.log(`\n=== ${pair.toUpperCase()} (cost ${costPct}%, minCrossSigma=${MINCROSS}) ===`);
  console.log(`  filled=${filled.length}  winners=${winners.length}  losers=${losers.length}`);
  console.log(`  MAE(sigma) winners: mean ${mean(winners.map(r => r.maeSigma))}  p50 ${pct(winners.map(r => r.maeSigma), 0.5)}  p90 ${pct(winners.map(r => r.maeSigma), 0.9)}`);
  console.log(`  MAE(sigma) losers:  mean ${mean(losers.map(r => r.maeSigma))}  p50 ${pct(losers.map(r => r.maeSigma), 0.5)}  p90 ${pct(losers.map(r => r.maeSigma), 0.9)}`);

  const { is: is0, oos: oos0 } = summarizeSplit(noStopRecords, 0.4);
  const gross0 = oos0.trades ? +(oos0.expectancy + costPct).toFixed(4) : null;
  console.log(`  no-stop baseline:  IS n=${is0.trades} mean ${is0.expectancy}% t ${tOf(is0)} | OOS n=${oos0.trades} mean ${oos0.expectancy}% t ${tOf(oos0)} gross ${gross0}%`);

  // Real forward-walked stop pass: re-run the engine itself with stopSigma set.
  for (const K of STOPS) {
    const records = runVwapReversion(packed, { mode: 'vwap_trend_cross', sessionAnchor: 'day', dir: 'both', costPct, minCrossSigma: MINCROSS, stopSigma: K });
    const stoppedCount = records.filter(r => r.filled && r.outcome === 'stopped').length;
    const { is, oos } = summarizeSplit(records, 0.4);
    const gross = oos.trades ? +(oos.expectancy + costPct).toFixed(4) : null;
    console.log(`  stopSigma=${String(K).padStart(3)}  stopped=${String(stoppedCount).padStart(4)}/${filled.length}  IS n=${String(is.trades).padStart(4)} mean ${String(is.expectancy).padStart(8)}% t ${String(tOf(is)).padStart(6)} | OOS n=${String(oos.trades).padStart(4)} mean ${String(oos.expectancy).padStart(8)}% t ${String(tOf(oos)).padStart(6)} gross ${gross}%`);
  }
}
