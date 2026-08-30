#!/usr/bin/env node
/**
 * §21 — do any of the four confirmation filters fix §20's whipsaw problem?
 * Each filter alone first (minimal-DOF per CLAUDE.md's staging rule), then
 * one natural combination. Same house bar: OOS t>2, n>=30, positive gross,
 * same sign IS/OOS, gold + >=2/3 FX majors. Stated prior: genuinely open —
 * §20 found gross P&L ~0 on the unfiltered signal, so a filter that mostly
 * just cuts trade COUNT would reduce the (illusory) significance of a
 * near-zero number without necessarily flipping it positive, UNLESS the
 * filtered subset hides a real gross edge under the noise. Unknown either way.
 *
 *   node scripts/run_vwap_trend_cross_filters.mjs [pairs...]
 */

import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { runVwapReversion } from '../js/vwapReversionEngine.js';
import { summarizeSplit } from '../js/honestForecastEngine.js';

const pairs = process.argv.slice(2).filter(a => !a.startsWith('-'));
const list = pairs.length ? pairs : ['gold', 'eurusd', 'gbpusd', 'usdjpy'];

const tOf = s => s.trades > 1 && s.tradesPerYr > 0
  ? +((s.sharpe / Math.sqrt(s.tradesPerYr)) * Math.sqrt(s.trades)).toFixed(2) : null;

const variants = [
  ['V0 baseline (§20, no filters)', {}],
  ['V1 confirm=3m', { confirmTfMinutes: 3 }],
  ['V2 confirm=5m', { confirmTfMinutes: 5 }],
  ['V3 confirm=15m', { confirmTfMinutes: 15 }],
  ['V4 minCrossSigma=0.5', { minCrossSigma: 0.5 }],
  ['V5 minCrossSigma=1.0', { minCrossSigma: 1.0 }],
  ['V6 trendRegime adx>=20', { requireTrendRegime: true, adxThreshold: 20 }],
  ['V7 trendRegime adx>=25', { requireTrendRegime: true, adxThreshold: 25 }],
  ['V8 excludeSession=London', { excludeSession: 'London' }],
  ['V9 confirm=5m + minCrossSigma=0.5', { confirmTfMinutes: 5, minCrossSigma: 0.5 }],
];

for (const pair of list) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.log(`\n=== ${pair}: no M1 ===`); continue; }
  const costPct = pair === 'gold' ? 0.020 : 0.012;
  console.log(`\n=== ${pair.toUpperCase()} (cost ${costPct}%) ===`);
  for (const [label, cfg] of variants) {
    const records = runVwapReversion(packed, { mode: 'vwap_trend_cross', sessionAnchor: 'day', dir: 'both', costPct, ...cfg });
    const filled = records.filter(r => r.filled);
    const { is, oos } = summarizeSplit(records, 0.4);
    const grossOOS = oos.trades ? +(oos.expectancy + costPct).toFixed(4) : null;
    console.log(`  ${label.padEnd(34)} filled=${String(filled.length).padStart(4)}/${records.length}  IS n=${String(is.trades).padStart(4)} mean ${String(is.expectancy).padStart(8)}% t ${String(tOf(is)).padStart(6)} | OOS n=${String(oos.trades).padStart(4)} mean ${String(oos.expectancy).padStart(8)}% t ${String(tOf(oos)).padStart(6)} win ${oos.winRate ?? '—'}% gross ${grossOOS}%`);
  }
}
