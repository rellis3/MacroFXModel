/**
 * Phase-3 validation script (gold only): prints example impulses and manually
 * cross-checks the ladder arithmetic before scaling to the rest of the
 * instrument set. Run: node sanity_check.mjs [pairKey] [m1Dir]
 */
import { loadM1ForPair } from '../../../js/volBacktestM1Engine.js';
import { runImpulse4hRangeLevels, FIB, ladderPrice, buildH4, detectImpulses, DEFAULT_CFG } from '../../../js/impulse4hRangeLevelsEngine.js';

const pair = process.argv[2] || 'xauusd';
const m1Dir = process.argv[3] || undefined;

const t0 = Date.now();
const packed = m1Dir ? await loadM1ForPair(pair, m1Dir) : await loadM1ForPair(pair);
if (!packed) { console.error(`${pair}: no data`); process.exit(2); }
console.log(`${pair}: loaded ${packed.n} M1 bars in ${Date.now() - t0}ms, ${new Date(packed.times[0] * 1000).toISOString()} -> ${new Date(packed.times[packed.n - 1] * 1000).toISOString()}`);

const t1 = Date.now();
const { h4Bars, atr } = buildH4(packed);
console.log(`H4 resample: ${h4Bars.length} bars in ${Date.now() - t1}ms`);

const impulses = detectImpulses(h4Bars, atr, DEFAULT_CFG);
console.log(`Detected ${impulses.length} impulses (${(impulses.length / h4Bars.length * 100).toFixed(2)}% of H4 bars) using default cfg`);

console.log('\n--- First 10 impulses ---');
for (const imp of impulses.slice(0, 10)) {
  console.log(`${imp.date}  ${imp.bullish ? 'BULL' : 'BEAR'}  range/ATR=${imp.rangeAtrMult.toFixed(2)}x  bodyRatio=${imp.bodyRatio.toFixed(2)}  low=${imp.low.toFixed(2)}  high=${imp.high.toFixed(2)}  range=${imp.range.toFixed(2)}  atr=${imp.atr.toFixed(2)}`);
}

console.log('\n--- Manual ladder arithmetic check (first 3 impulses) ---');
for (const imp of impulses.slice(0, 3)) {
  console.log(`\nImpulse ${imp.date} (${imp.bullish ? 'BULL' : 'BEAR'})  low=${imp.low}  high=${imp.high}  range=${(imp.high - imp.low).toFixed(5)}`);
  for (const f of [-1, -0.5, 0, 0.5, 1, 1.5, 2, 3]) {
    const engineVal = ladderPrice(imp.low, imp.high, f);
    const manualVal = imp.low + (imp.high - imp.low) * f;
    const match = Math.abs(engineVal - manualVal) < 1e-9 ? 'OK' : 'MISMATCH';
    console.log(`  fib=${f.toString().padStart(5)}  ladderPrice()=${engineVal.toFixed(5)}  manual(low+(high-low)*fib)=${manualVal.toFixed(5)}  [${match}]`);
  }
}

console.log(`\nFIB array length: ${FIB.length} (expect 45)`);
console.log('FIB array:', FIB.join(','));

console.log('\n--- Full forward analysis on first 3 impulses (level touches, exhaustion, reversal) ---');
const t2 = Date.now();
const { impulses: records, meta } = runImpulse4hRangeLevels(packed, {}, pair);
console.log(`Full run: ${records.length} impulse records in ${Date.now() - t2}ms`);
for (const r of records.slice(0, 3)) {
  const touchedFibs = Object.entries(r.levelsTouched).filter(([, v]) => v).map(([k]) => k);
  console.log(`\n${r.date} ${r.bullish ? 'BULL' : 'BEAR'} rangeATRx=${r.rangeAtrMult.toFixed(2)}`);
  console.log(`  levels touched (${touchedFibs.length}/45): ${touchedFibs.join(', ')}`);
  console.log(`  maxExtFib=${r.maxExtFib}  exhaustionFibRung=${r.exhaustionFibRung}  exhaustionPrice=${r.exhaustionPrice.toFixed(5)}`);
  console.log(`  reversalAtr=${r.reversalAtr}  reversalFibUnits=${r.reversalFibUnits}  truncated=${r.reversalWindowTruncated}`);
  console.log(`  vwapDistAtrAtImpulse=${r.vwapDistAtrAtImpulse}  vwapDistAtrAtExhaustion=${r.vwapDistAtrAtExhaustion}  vwapTouched=${r.vwapTouchedWithinHorizon}`);
  if (r.trade) console.log(`  trade: side=${r.trade.side} entry=${r.trade.entry.toFixed(5)} sl=${r.trade.sl.toFixed(5)} tp=${r.trade.tp.toFixed(5)} outcome=${r.trade.outcome} rMult=${r.trade.rMult} barsHeld=${r.trade.barsHeld}`);
}

console.log(`\nmeta:`, JSON.stringify(meta, null, 2));
console.log(`\nTotal script time: ${Date.now() - t0}ms`);
