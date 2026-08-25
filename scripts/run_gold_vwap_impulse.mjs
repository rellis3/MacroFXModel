#!/usr/bin/env node
/**
 * Run the VWAP impulse-entry A/B on gold's local M1 parquet — the trade-level
 * stage-2 test pre-registered in GOLD_VWAP_FIXED_SIGMA_FINDINGS.md §6.
 *
 *   node scripts/run_gold_vwap_impulse.mjs
 *
 * Prints, per mode × trigger TF (30m/1h/4h): n, IS/OOS mean per trade (net %),
 * per-trade t, win rate, plus the gross (cost-back-out) mean — and the one
 * labeled sensitivity (continuation entries restricted to the 12:00-16:00 UTC
 * overlap window).
 */

import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { runVwapImpulseEntry, DEFAULT_CFG } from '../js/vwapImpulseEntryV1Engine.js';
import { summarizeSplit } from '../js/honestForecastEngine.js';

const packed = await loadM1ForPair('gold');
if (!packed?.n) { console.error('No gold M1 data.'); process.exit(1); }
console.log(`gold M1: ${packed.n.toLocaleString()} bars`);

// Per-trade t-stat from the summary's own fields: perTradeSharpe·√n.
const tOf = (s) => s.trades > 1 && s.tradesPerYr > 0
  ? +((s.sharpe / Math.sqrt(s.tradesPerYr)) * Math.sqrt(s.trades)).toFixed(2) : null;

function report(label, records, costPct) {
  const { is, oos, splitDate } = summarizeSplit(records, 0.4);
  const grossOOS = oos.trades ? +(oos.expectancy + costPct).toFixed(4) : null;
  console.log(`  ${label.padEnd(38)} split ${splitDate ?? '—'}`);
  console.log(`    IS : n=${String(is.trades).padStart(4)}  mean ${String(is.expectancy).padStart(8)}%  t ${String(tOf(is)).padStart(6)}  win ${is.winRate}%`);
  console.log(`    OOS: n=${String(oos.trades).padStart(4)}  mean ${String(oos.expectancy).padStart(8)}%  t ${String(tOf(oos)).padStart(6)}  win ${oos.winRate}%  gross ${grossOOS}%`);
}

for (const mode of ['pullback_continuation', 'band_reentry_fade']) {
  console.log(`\n── ${mode} ──`);
  for (const tf of [30, 60, 240]) {
    const t0 = Date.now();
    const { records, meta } = runVwapImpulseEntry(packed, { mode, triggerTfMin: tf, instrument: 'gold' });
    report(`${tf}m trigger (${meta.impulses} impulses)`, records, DEFAULT_CFG.costPct);
    console.log(`    (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
}

console.log('\n── Labeled sensitivity: continuation, entries in 12:00-16:00 UTC only ──');
for (const tf of [30, 60, 240]) {
  const { records } = runVwapImpulseEntry(packed, {
    mode: 'pullback_continuation', triggerTfMin: tf, sessionFilter: [12, 16], instrument: 'gold' });
  report(`${tf}m trigger, overlap-only`, records, DEFAULT_CFG.costPct);
}
