#!/usr/bin/env node
/**
 * §22a — minCrossSigma was the one filter that moved every instrument the
 * same (improving) direction in §21, tested only at 0.5/1.0. Push further
 * (1.5/2.0/2.5) to see if the monotonic improvement continues, plateaus, or
 * reverses -- the same diagnostic shape as this study's other threshold
 * sweeps (§14a, §18's tpRetraceFrac).
 *
 *   node scripts/run_vwap_trend_cross_sigma_sweep.mjs [pairs...]
 */
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { runVwapReversion } from '../js/vwapReversionEngine.js';
import { summarizeSplit } from '../js/honestForecastEngine.js';

const pairs = process.argv.slice(2).filter(a => !a.startsWith('-'));
const list = pairs.length ? pairs : ['gold', 'eurusd', 'gbpusd', 'usdjpy'];
const tOf = s => s.trades > 1 && s.tradesPerYr > 0
  ? +((s.sharpe / Math.sqrt(s.tradesPerYr)) * Math.sqrt(s.trades)).toFixed(2) : null;

for (const pair of list) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.log(`\n=== ${pair}: no M1 ===`); continue; }
  const costPct = pair === 'gold' ? 0.020 : 0.012;
  console.log(`\n=== ${pair.toUpperCase()} (cost ${costPct}%) ===`);
  for (const minCrossSigma of [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]) {
    const records = runVwapReversion(packed, { mode: 'vwap_trend_cross', sessionAnchor: 'day', dir: 'both', costPct, minCrossSigma });
    const filled = records.filter(r => r.filled);
    const { is, oos } = summarizeSplit(records, 0.4);
    const grossOOS = oos.trades ? +(oos.expectancy + costPct).toFixed(4) : null;
    console.log(`  minCrossSigma=${minCrossSigma.toFixed(1)}  filled=${String(filled.length).padStart(4)}/${records.length}  IS n=${String(is.trades).padStart(4)} mean ${String(is.expectancy).padStart(8)}% t ${String(tOf(is)).padStart(6)} | OOS n=${String(oos.trades).padStart(4)} mean ${String(oos.expectancy).padStart(8)}% t ${String(tOf(oos)).padStart(6)} win ${oos.winRate ?? '—'}% gross ${grossOOS}%`);
  }
}
