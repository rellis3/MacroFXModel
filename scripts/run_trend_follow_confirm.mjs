#!/usr/bin/env node
/**
 * Owner's direct follow-up to the null stop-tightness sweep (§14a): "let's
 * look at the 1m closed candle... all this was meant to be on an ultra low
 * timeframe like 1m/3m." The structural mutation §14a's own diagnosis
 * pointed at: require a CLOSE beyond the touched band before entering, not
 * just the wick that defines the touch — the exact "closes not wicks"
 * convention `vwapExtensionAtlasEngine.js` already established for this
 * repo, reused (not reinvented) via `stackedFadeV1Engine.js`'s new
 * `confirmTfMinutes` config.
 *
 * confirmTfMinutes=1 (the new default even for the ALREADY-null §14/§14a
 * baseline): the touch bar's OWN close must already be beyond the band —
 * a wick-only touch whose bar closes back inside is skipped, not traded.
 * confirmTfMinutes=3: wait for the enclosing 3-minute bucket's own close
 * instead. TP/SL geometry is UNCHANGED from §14/§14a (next band out / one
 * band back, at the original followSlSigma=1.0 default) — only the entry
 * TRIGGER and its timing change.
 *
 * PRE-REGISTERED BEFORE RUNNING: same bar as §14/§14a (OOS t>2, positive
 * mean, n>=30, positive gross, gold + >=2/3 FX majors same direction).
 * Priors: requiring a close (not just a wick) filters out the touches most
 * likely to have been noise in the first place — the base pool should
 * shrink — but every trade-level test on this construction (six in a row
 * now, including one specifically targeting bandSlope=expanding, the best-
 * corroborated descriptive finding of the whole study) has come back null,
 * so the honest expectation remains null, not "this is the one."
 *
 *   Usage: node scripts/run_trend_follow_confirm.mjs [pairs...]
 */

import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { fixedSigmaWalk } from '../js/vwapFixedSigmaEngine.js';
import { runStackedFade } from '../js/stackedFadeV1Engine.js';
import { summarizeSplit } from '../js/honestForecastEngine.js';

const pairs = process.argv.slice(2).filter(a => !a.startsWith('-'));
const list = pairs.length ? pairs : ['gold', 'eurusd', 'gbpusd', 'usdjpy'];

const tOf = s => s.trades > 1 && s.tradesPerYr > 0
  ? +((s.sharpe / Math.sqrt(s.tradesPerYr)) * Math.sqrt(s.trades)).toFixed(2) : null;

const summary = [];
for (const pair of list) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.log(`\n=== ${pair}: no M1 ===`); continue; }
  const costPct = pair === 'gold' ? 0.020 : 0.012;
  const { touches } = fixedSigmaWalk(packed, { instrument: pair, assetClass: pair === 'gold' ? 'commodity' : 'fx' });
  console.log(`\n=== ${pair.toUpperCase()} — closed-candle confirmation, cost ${costPct}% ===`);
  for (const gate of [
    ['V0-follow (regardless)', {}],
    ['V-expanding (bandSlope=3·expanding)', { requireBandSlopeExpanding: true }],
  ]) {
    const [gateLabel, gateCfg] = gate;
    for (const confirmTfMinutes of [1, 3]) {
      const { records, meta } = runStackedFade(packed, touches, { action: 'follow', confirmTfMinutes, ...gateCfg, costPct });
      const { is, oos } = summarizeSplit(records, 0.4);
      const grossOOS = oos.trades ? +(oos.expectancy + costPct).toFixed(4) : null;
      const label = `${gateLabel}  confirm=${confirmTfMinutes}m`;
      console.log(`  ${label.padEnd(52)} pool=${String(meta.pool).padStart(5)}  IS n=${String(is.trades).padStart(4)} mean ${String(is.expectancy).padStart(8)}% t ${String(tOf(is)).padStart(6)} | OOS n=${String(oos.trades).padStart(4)} mean ${String(oos.expectancy).padStart(8)}% t ${String(tOf(oos)).padStart(6)} win ${String(oos.winRate ?? '—').padStart(5)}% gross ${grossOOS}%`);
      summary.push({ pair, gate: gateLabel, confirmTfMinutes, oosN: oos.trades, oosMean: oos.expectancy, oosT: tOf(oos), oosWin: oos.winRate, oosGross: grossOOS });
    }
  }
}

console.log('\n=== Cells clearing the pre-registered bar on THIS instrument alone (OOS t>2, positive, n>=30, gross>0) ===');
const clears = summary.filter(s => s.oosT > 2 && s.oosMean > 0 && s.oosN >= 30 && s.oosGross > 0);
if (!clears.length) console.log('  (none)');
for (const s of clears) console.log(`  ${s.pair} ${s.gate} confirm=${s.confirmTfMinutes}m — OOS n=${s.oosN} mean=${s.oosMean}% t=${s.oosT} gross=${s.oosGross}%`);

console.log('\n=== Full cross-instrument grid (OOS mean%, by gate x confirm-minutes) ===');
for (const gateLabel of ['V0-follow (regardless)', 'V-expanding (bandSlope=3·expanding)']) {
  console.log(`  ${gateLabel}:`);
  for (const confirmTfMinutes of [1, 3]) {
    const row = list.map(pair => {
      const s = summary.find(x => x.pair === pair && x.gate === gateLabel && x.confirmTfMinutes === confirmTfMinutes);
      return s ? `${pair}=${s.oosMean}%(t${s.oosT},n${s.oosN})` : `${pair}=—`;
    }).join('  ');
    console.log(`    confirm=${confirmTfMinutes}m: ${row}`);
  }
}
