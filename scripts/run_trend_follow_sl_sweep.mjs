#!/usr/bin/env node
/**
 * Owner's direct follow-up to the null with-trend result (`run_trend_follow.
 * mjs`, GOLD_VWAP_FIXED_SIGMA_FINDINGS.md §14): "if this works it reacts to
 * the band very quick, so the SL should be small" — a specific, testable
 * mechanical hypothesis, not a vibe: tighten the stop (TP stays fixed at the
 * next band out) and see whether a genuine continuation confirms fast enough
 * that a tight stop rarely gets clipped by noise before the move shows
 * itself, which would show up as R:R improving faster than win-rate erodes.
 *
 * Uses `stackedFadeV1Engine.js`'s new `followSlSigma` config (default 1.0 =
 * the already-null §14 baseline, a ~1:1 R:R). Sweeps SL distance from the
 * touched band toward VWAP: 1.0σ (baseline, re-run here for direct
 * comparison) / 0.75σ / 0.5σ (~2:1 R:R) / 0.25σ (~4:1 R:R), each × the two
 * §14 gates (V0-follow regardless, V-expanding on bandSlope), × gold +
 * EURUSD/GBPUSD/USDJPY.
 *
 * PRE-REGISTERED BEFORE RUNNING: same bar as §14 (OOS t>2, positive mean,
 * n>=30, positive gross, gold + >=2/3 FX majors same direction) — AND,
 * because this is now an 8-cell-per-instrument SWEEP (multiple testing), a
 * single tightness level clearing the bar on ONE instrument is NOT treated
 * as a finding on its own; it needs to hold IS AND OOS AND replicate across
 * instruments the same way every other finding in this study has been
 * required to. Every cell is printed, not just the best-looking one — the
 * house rule this study keeps re-learning the hard way (§9's V2 "best
 * conditions" cell was the worst OOS cell of that whole test).
 * Priors: tightening the stop mechanically raises R:R, so SOME improvement
 * in the raw numbers is close to guaranteed by construction even with zero
 * real edge — the question is whether win-rate holds up enough to turn that
 * into an actual positive expectancy after costs, not whether the numbers
 * move (they will).
 *
 *   Usage: node scripts/run_trend_follow_sl_sweep.mjs [pairs...]
 */

import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { fixedSigmaWalk } from '../js/vwapFixedSigmaEngine.js';
import { runStackedFade } from '../js/stackedFadeV1Engine.js';
import { summarizeSplit } from '../js/honestForecastEngine.js';

const pairs = process.argv.slice(2).filter(a => !a.startsWith('-'));
const list = pairs.length ? pairs : ['gold', 'eurusd', 'gbpusd', 'usdjpy'];
const SL_SIGMAS = [1.0, 0.75, 0.5, 0.25];

const tOf = s => s.trades > 1 && s.tradesPerYr > 0
  ? +((s.sharpe / Math.sqrt(s.tradesPerYr)) * Math.sqrt(s.trades)).toFixed(2) : null;

const summary = [];
for (const pair of list) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.log(`\n=== ${pair}: no M1 ===`); continue; }
  const costPct = pair === 'gold' ? 0.020 : 0.012;
  const { touches } = fixedSigmaWalk(packed, { instrument: pair, assetClass: pair === 'gold' ? 'commodity' : 'fx' });
  console.log(`\n=== ${pair.toUpperCase()} — with-trend SL-tightness sweep, cost ${costPct}% ===`);
  for (const gate of [
    ['V0-follow (regardless)', {}],
    ['V-expanding (bandSlope=3·expanding)', { requireBandSlopeExpanding: true }],
  ]) {
    const [gateLabel, gateCfg] = gate;
    for (const slSigma of SL_SIGMAS) {
      const { records, meta } = runStackedFade(packed, touches, { action: 'follow', followSlSigma: slSigma, ...gateCfg, costPct });
      const { is, oos } = summarizeSplit(records, 0.4);
      const grossOOS = oos.trades ? +(oos.expectancy + costPct).toFixed(4) : null;
      const rr = (1 / slSigma).toFixed(2);
      const label = `${gateLabel}  SL=${slSigma}σ (R:R~${rr}:1)`;
      console.log(`  ${label.padEnd(56)} pool=${String(meta.pool).padStart(5)}  IS n=${String(is.trades).padStart(4)} mean ${String(is.expectancy).padStart(8)}% t ${String(tOf(is)).padStart(6)} | OOS n=${String(oos.trades).padStart(4)} mean ${String(oos.expectancy).padStart(8)}% t ${String(tOf(oos)).padStart(6)} win ${String(oos.winRate ?? '—').padStart(5)}% gross ${grossOOS}%`);
      summary.push({ pair, gate: gateLabel, slSigma, isN: is.trades, isMean: is.expectancy, isT: tOf(is),
        oosN: oos.trades, oosMean: oos.expectancy, oosT: tOf(oos), oosWin: oos.winRate, oosGross: grossOOS });
    }
  }
}

console.log('\n=== Cells clearing the pre-registered bar on THIS instrument alone (OOS t>2, positive, n>=30, gross>0) ===');
const clears = summary.filter(s => s.oosT > 2 && s.oosMean > 0 && s.oosN >= 30 && s.oosGross > 0);
if (!clears.length) console.log('  (none)');
for (const s of clears) console.log(`  ${s.pair} ${s.gate} SL=${s.slSigma}σ — OOS n=${s.oosN} mean=${s.oosMean}% t=${s.oosT} gross=${s.oosGross}%`);

console.log('\n=== Full cross-instrument grid (OOS mean%, by gate x SL-sigma) ===');
for (const gateLabel of ['V0-follow (regardless)', 'V-expanding (bandSlope=3·expanding)']) {
  console.log(`  ${gateLabel}:`);
  for (const slSigma of SL_SIGMAS) {
    const row = list.map(pair => {
      const s = summary.find(x => x.pair === pair && x.gate === gateLabel && x.slSigma === slSigma);
      return s ? `${pair}=${s.oosMean}%(t${s.oosT})` : `${pair}=—`;
    }).join('  ');
    console.log(`    SL=${slSigma}σ: ${row}`);
  }
}
