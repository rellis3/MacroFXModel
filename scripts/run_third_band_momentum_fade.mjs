#!/usr/bin/env node
/**
 * Owner's request (2026-08-27): test gold ALONE first, ±3σ fixed-sigma
 * band only (not 2σ), entering on the touch and targeting VWAP-as-of-the-
 * touch (frozen) — "regardless" (V0, no gate) vs conditioned on the raw
 * WaveTrend momentum oscillator's SIGN agreeing with the extension:
 *   sell only if wt1>0 when price hits the UPPER 3σ band
 *   buy  only if wt1<0 when price hits the LOWER 3σ band
 * (i.e. momentum hasn't crossed back through zero yet — the opposite bet
 * from the already-tested wtState=2·neutral gate, which requires momentum
 * to already be UN-extended.)
 *
 * Reuses the existing, harness-gated `stackedFadeV1Engine.js` mechanics
 * unchanged (entry at next bar's open, TP=VWAP-at-touch frozen, SL=1.5x
 * ATR(15m), 240min cap, one trade/day, costs on) — only the band filter
 * and the new `requireMomentumAgree` gate differ from the already-run V0.
 *
 * PRE-REGISTERED BEFORE RUNNING (this comment written first, results filled
 * in below by the script's own printed output — not edited after the fact):
 *   "worked" = OOS per-trade t>2, positive mean, OOS n>=30, positive gross.
 *   Priors: the pooled bands-[2,3] V0 baseline already ran null on gold
 *   (OOS n=852, mean -0.008%, t=-0.64, gross +0.012% — GOLD_VWAP_FIXED_
 *   SIGMA_FINDINGS.md §9) — band-3-only is a SUBSET of that pool, so V0
 *   restricted to band 3 is very likely still null; this run mainly
 *   confirms that with the narrower pool, not a fresh test. The genuinely
 *   untested piece is requireMomentumAgree — no prior result exists for
 *   it specifically. Every gated variant tried so far in this study (V1,
 *   V2, the impulse-entry modes, the range-fib entries) came back null,
 *   so the base-rate expectation here is also null; stated plainly, not
 *   softened, before the numbers below are read.
 *
 *   Usage: node scripts/run_third_band_momentum_fade.mjs
 */

import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { fixedSigmaWalk } from '../js/vwapFixedSigmaEngine.js';
import { runStackedFade } from '../js/stackedFadeV1Engine.js';
import { summarizeSplit } from '../js/honestForecastEngine.js';

const tOf = s => s.trades > 1 && s.tradesPerYr > 0
  ? +((s.sharpe / Math.sqrt(s.tradesPerYr)) * Math.sqrt(s.trades)).toFixed(2) : null;

const packed = await loadM1ForPair('gold');
if (!packed?.n) { console.error('gold: no M1 data'); process.exit(2); }
const costPct = 0.020;

const { touches } = fixedSigmaWalk(packed, { instrument: 'gold', assetClass: 'commodity' });
const band3 = touches.filter(t => t.band === 3);
console.log(`gold: ${touches.length} total touches, ${band3.length} at band=3`);

const variants = [
  ['V0 band3 (regardless — no gate)', {}],
  ['V-momentum (wt1 agrees with extension)', { requireMomentumAgree: true }],
];

console.log(`\n=== GOLD, ±3σ fixed-sigma band only (cost ${costPct}%) ===`);
for (const [label, gates] of variants) {
  const { records, meta, trades } = runStackedFade(packed, band3, { bands: [3], ...gates, costPct });
  const { is, oos } = summarizeSplit(records, 0.4);
  const grossOOS = oos.trades ? +(oos.expectancy + costPct).toFixed(4) : null;
  console.log(`  ${label.padEnd(42)} pool=${String(meta.pool).padStart(4)}  IS n=${String(is.trades).padStart(4)} mean ${String(is.expectancy).padStart(8)}% t ${String(tOf(is)).padStart(6)} | OOS n=${String(oos.trades).padStart(4)} mean ${String(oos.expectancy).padStart(8)}% t ${String(tOf(oos)).padStart(6)} win ${oos.winRate ?? '—'}% gross ${grossOOS}%`);
  if (trades.length) {
    const sells = trades.filter(t => t.side === 'SELL').length, buys = trades.filter(t => t.side === 'BUY').length;
    console.log(`    (${buys} BUY / ${sells} SELL, avg wtStateValue at touch: ${(trades.reduce((s, t) => s + (t.wtStateValue ?? 0), 0) / trades.length).toFixed(2)})`);
  }
}
