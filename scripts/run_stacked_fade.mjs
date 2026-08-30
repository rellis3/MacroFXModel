#!/usr/bin/env node
/**
 * Run the pre-registered stacked fade (GOLD_VWAP_FIXED_SIGMA_FINDINGS.md §9)
 * on gold + FX majors.
 *
 *   node scripts/run_stacked_fade.mjs [pairs...] [--sigma-mode fixedRms|developing] [--bands 2,3]
 *
 * §16 (2026-08-30): owner asked to build a tradable system from the
 * developing-band descriptive work ("vwap out and then band back to vwap") —
 * `--sigma-mode developing` reruns the SAME pre-registered fade with no new
 * engine, only the touch walk switched to the self-widening band unit, plus
 * a new `V1-dev` variant using §15's own held findings (excludeNY AND
 * excludeOverlap — the one theme that cross-validated across both the
 * return book and the band-walk book).
 */

import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { fixedSigmaWalk } from '../js/vwapFixedSigmaEngine.js';
import { runStackedFade } from '../js/stackedFadeV1Engine.js';
import { summarizeSplit } from '../js/honestForecastEngine.js';

const args = process.argv.slice(2);
const pairs = args.filter(a => !a.startsWith('-') && args[args.indexOf(a) - 1] !== '--sigma-mode' && args[args.indexOf(a) - 1] !== '--bands');
const list = pairs.length ? pairs : ['gold', 'eurusd', 'gbpusd', 'usdjpy'];
const sigmaMode = args.includes('--sigma-mode') ? args[args.indexOf('--sigma-mode') + 1] : 'fixedRms';
const bands = args.includes('--bands') ? args[args.indexOf('--bands') + 1].split(',').map(Number) : [2, 3];

const tOf = s => s.trades > 1 && s.tradesPerYr > 0
  ? +((s.sharpe / Math.sqrt(s.tradesPerYr)) * Math.sqrt(s.trades)).toFixed(2) : null;

for (const pair of list) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.log(`\n=== ${pair}: no M1 ===`); continue; }
  const costPct = pair === 'gold' ? 0.020 : 0.012;
  const { touches } = fixedSigmaWalk(packed, { instrument: pair, assetClass: pair === 'gold' ? 'commodity' : 'fx', sigmaMode });
  console.log(`\n=== ${pair.toUpperCase()} (cost ${costPct}%, sigmaMode=${sigmaMode}, bands=[${bands}]) ===`);
  const variants = sigmaMode === 'developing'
    ? [
        ['V0-dev baseline (no gates)', { bands }],
        ['V0-dev band-3-only', { bands: [3] }],
        ['V1-dev (not-NY × not-overlap, §15)', { bands, excludeNY: true, excludeOverlap: true }],
        ['V1-dev band-3-only', { bands: [3], excludeNY: true, excludeOverlap: true }],
        ['V2-dev band-3-only + PMO agree', { bands: [3], requirePmoAgree: true }],
        ['V3-dev band-3 + exhaustion (reject × spike)', { bands: [3], requireReject: true, requireApproachSpike: true }],
        ['V4-dev band-3 + tpRetrace 0.75', { bands: [3], tpRetraceFrac: 0.75 }],
        ['V5-dev band-3 + tpRetrace 0.5', { bands: [3], tpRetraceFrac: 0.5 }],
        ['V6-dev band-3 + exhaustion × tpRetrace 0.5', { bands: [3], requireReject: true, requireApproachSpike: true, tpRetraceFrac: 0.5 }],
      ]
    : [
        ['V0 baseline (no gates)', { bands }],
        ['V1 core (not-NY × reject)', { bands, excludeNY: true, requireReject: true }],
        ...(pair === 'gold' ? [['V2 gold (V1 × WT-neutral)', { bands, excludeNY: true, requireReject: true, requireWtNeutral: true }]] : []),
      ];
  for (const [label, gates] of variants) {
    const { records, meta } = runStackedFade(packed, touches, { ...gates, costPct });
    const { is, oos } = summarizeSplit(records, 0.4);
    const grossOOS = oos.trades ? +(oos.expectancy + costPct).toFixed(4) : null;
    console.log(`  ${label.padEnd(36)} pool=${meta.pool}  IS n=${String(is.trades).padStart(4)} mean ${String(is.expectancy).padStart(8)}% t ${String(tOf(is)).padStart(6)} | OOS n=${String(oos.trades).padStart(4)} mean ${String(oos.expectancy).padStart(8)}% t ${String(tOf(oos)).padStart(6)} win ${oos.winRate ?? '—'}% gross ${grossOOS}%`);
  }
}
