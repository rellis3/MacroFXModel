#!/usr/bin/env node
/**
 * Run the Range-Fib × VWAP trade rules (GOLD_VWAP_FIXED_SIGMA_FINDINGS.md §8b,
 * pre-registered) on gold + FX majors, and print the §8a rangeConf dimension
 * check on each FX pair's fresh atlas walk.
 *
 *   node scripts/run_rangefib_vwap.mjs [pairs...]   (default: gold eurusd gbpusd usdjpy)
 */

import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { runRangeFibVwap } from '../js/rangeFibVwapEntryV1Engine.js';
import { fixedSigmaWalk } from '../js/vwapFixedSigmaEngine.js';
import { returnedWithin, returnEligible } from '../js/vwapFixedSigmaReport.js';
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
  for (const mode of ['line_on_vwap_extension', 'line_fade_stretched']) {
    const { records } = runRangeFibVwap(packed, { mode, costPct });
    const { is, oos } = summarizeSplit(records, 0.4);
    const grossOOS = oos.trades ? +(oos.expectancy + costPct).toFixed(4) : null;
    console.log(`  ${mode.padEnd(24)} IS n=${String(is.trades).padStart(4)} mean ${String(is.expectancy).padStart(8)}% t ${String(tOf(is)).padStart(6)} | OOS n=${String(oos.trades).padStart(4)} mean ${String(oos.expectancy).padStart(8)}% t ${String(tOf(oos)).padStart(6)} win ${oos.winRate}% gross ${grossOOS}%`);
  }
  // §8a check on FX (gold's numbers are in the findings doc already).
  if (pair !== 'gold') {
    const { touches } = fixedSigmaWalk(packed, { instrument: pair, assetClass: 'fx' });
    const firsts = touches.filter(t => t.ordinal === 1);
    for (const [name, pool, pred] of [
      ['race out% ±1σ by rangeConf', firsts.filter(t => t.band === 1), t => t.outcome === 'out'],
      ['return≤240m ±2-3σ by rangeConf', firsts.filter(t => t.band >= 2 && t.band <= 3 && returnEligible(t)), t => returnedWithin(t)],
    ]) {
      const base = pool.filter(pred).length / pool.length * 100;
      const row = ['0·none', '1·asia', '2·monday', '3·both'].map(b => {
        const g = pool.filter(t => t.rangeConf === b);
        return g.length >= 10 ? `${b} Δ${(g.filter(pred).length / g.length * 100 - base).toFixed(1)} (n=${g.length})` : `${b} — (n=${g.length})`;
      }).join('  ');
      console.log(`  ${name}: base ${base.toFixed(1)}%  ${row}`);
    }
  }
}
