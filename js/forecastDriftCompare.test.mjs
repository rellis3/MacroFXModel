/**
 * Offline tests for the forecast drift comparator. Synthetic bars only — proves the two
 * forecasters are compared correctly and that the commodity HV20-vs-YZ σ mismatch shows up
 * as a non-zero, reported drift. Run: node js/forecastDriftCompare.test.mjs
 */
import { compareForecastLines } from './forecastDriftCompare.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };

// Deterministic OHLC: a gentle random-ish walk (seeded, no Math.random) with realistic
// intrabar ranges so both σ estimators have high/low/close to work with.
function makeBars(n, { base = 100, vol = 0.01, seed = 7 } = {}) {
  const bars = []; let px = base, s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff - 0.5; };
  for (let i = 0; i < n; i++) {
    const ret = rnd() * vol * 2;
    const open = px, close = px * (1 + ret);
    const hi = Math.max(open, close) * (1 + Math.abs(rnd()) * vol);
    const lo = Math.min(open, close) * (1 - Math.abs(rnd()) * vol);
    bars.push({ open, high: hi, low: lo, close, time: 1_600_000_000 + i * 86400 });
    px = close;
  }
  return bars;
}

console.log('[compareForecastLines]');

// 1. Shape + fields for each asset class.
for (const ac of ['fx', 'index', 'commodity']) {
  const r = compareForecastLines(makeBars(300, { vol: ac === 'commodity' ? 0.014 : 0.008 }), ac);
  ok(`${ac}: returns plan & ref band %s for all four lines`,
     ['hl50', 'hl75', 'ocMed', 'oc75'].every(k => r.bandsPct.plan[k] > 0 && r.bandsPct.ref[k] > 0));
  ok(`${ac}: reports a signed drift per line + an avg |drift|`,
     typeof r.avgAbsDriftPct === 'number' && r.driftPct.hl50 != null,
     `avg|drift|=${r.avgAbsDriftPct}% σ:plan ${r.sigma.planVol} vs ref ${r.sigma.refVol}`);
}

// 2. Commodity uses DIFFERENT σ estimators (HV20 plan vs YZ ref) → a measurable σ drift.
{
  const r = compareForecastLines(makeBars(300, { vol: 0.016 }), 'commodity');
  ok('commodity: plan vs reference σ differ (HV20 ≠ YZ) → non-zero σ drift',
     Math.abs(r.sigma.driftPct ?? 0) > 0.01, `σ drift=${r.sigma.driftPct}%`);
  ok('commodity: the σ mismatch propagates into the line drift',
     Math.abs(r.avgAbsDriftPct) > 0.01, `avg|drift|=${r.avgAbsDriftPct}%`);
}

// 3. Guards: too few bars → throws (both forecasters need history).
{
  let threw = false;
  try { compareForecastLines(makeBars(30), 'fx'); } catch { threw = true; }
  ok('too few bars → throws', threw);
}

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
if (failures) process.exit(1);
