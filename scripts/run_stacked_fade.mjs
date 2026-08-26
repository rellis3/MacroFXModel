#!/usr/bin/env node
/**
 * Run the pre-registered stacked fade (GOLD_VWAP_FIXED_SIGMA_FINDINGS.md §9)
 * on gold + FX majors.
 *
 *   node scripts/run_stacked_fade.mjs [pairs...]   (default: gold eurusd gbpusd usdjpy)
 */

import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { fixedSigmaWalk } from '../js/vwapFixedSigmaEngine.js';
import { runStackedFade } from '../js/stackedFadeV1Engine.js';
import { summarizeSplit } from '../js/honestForecastEngine.js';

const pairs = process.argv.slice(2).filter(a => !a.startsWith('-'));
const list = pairs.length ? pairs : ['gold', 'eurusd', 'gbpusd', 'usdjpy'];

const tOf = s => s.trades > 1 && s.tradesPerYr > 0
  ? +((s.sharpe / Math.sqrt(s.tradesPerYr)) * Math.sqrt(s.trades)).toFixed(2) : null;

for (const pair of list) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.log(`\n=== ${pair}: no M1 ===`); continue; }
  const costPct = pair === 'gold' ? 0.020 : 0.012;
  const { touches } = fixedSigmaWalk(packed, { instrument: pair, assetClass: pair === 'gold' ? 'commodity' : 'fx' });
  console.log(`\n=== ${pair.toUpperCase()} (cost ${costPct}%) ===`);
  const variants = [
    ['V0 baseline (no gates)', {}],
    ['V1 core (not-NY × reject)', { excludeNY: true, requireReject: true }],
  ];
  if (pair === 'gold') variants.push(['V2 gold (V1 × WT-neutral)', { excludeNY: true, requireReject: true, requireWtNeutral: true }]);
  for (const [label, gates] of variants) {
    const { records, meta } = runStackedFade(packed, touches, { ...gates, costPct });
    const { is, oos } = summarizeSplit(records, 0.4);
    const grossOOS = oos.trades ? +(oos.expectancy + costPct).toFixed(4) : null;
    console.log(`  ${label.padEnd(28)} pool=${meta.pool}  IS n=${String(is.trades).padStart(4)} mean ${String(is.expectancy).padStart(8)}% t ${String(tOf(is)).padStart(6)} | OOS n=${String(oos.trades).padStart(4)} mean ${String(oos.expectancy).padStart(8)}% t ${String(tOf(oos)).padStart(6)} win ${oos.winRate ?? '—'}% gross ${grossOOS}%`);
  }
}
