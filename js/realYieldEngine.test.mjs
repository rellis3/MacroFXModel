// Synthetic tests for realYieldEngine.js. No network.
//   node js/realYieldEngine.test.mjs
import { REAL_YIELD_UNIVERSE, mergeRealYield, realYieldScore } from './realYieldEngine.js';
import { CPI_UNIVERSE } from './cpiEngine.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[mergeRealYield — forward-fills the latest KNOWN CPI reading onto each yield date]');
{
  const y10 = [{ date: '2024-01-01', value: 4.5 }, { date: '2024-02-01', value: 4.6 }, { date: '2024-03-01', value: 4.7 }];
  // Quarterly-style CPI: one reading covers Jan-Mar.
  const cpi = [{ date: '2024-01-01', yoy: 3.0 }];
  const merged = mergeRealYield(y10, cpi);
  ok('all 3 yield dates get the same (only known) CPI reading', merged.every(m => m.cpiYoy === 3.0));
  ok('real = y10 - cpiYoy for each', merged[2].real === 4.7 - 3.0, merged[2].real);
}
{
  // CPI updates partway through: Feb's yield should pick up the NEW reading, not stay on Jan's.
  const y10 = [{ date: '2024-01-01', value: 4.5 }, { date: '2024-02-01', value: 4.6 }, { date: '2024-03-01', value: 4.7 }];
  const cpi = [{ date: '2024-01-01', yoy: 3.0 }, { date: '2024-02-01', yoy: 2.5 }];
  const merged = mergeRealYield(y10, cpi);
  ok('Jan yield uses Jan CPI', merged[0].cpiYoy === 3.0);
  ok('Feb+Mar yield use the newer Feb CPI (forward-filled, not future-leaking)', merged[1].cpiYoy === 2.5 && merged[2].cpiYoy === 2.5);
}
{
  // No CPI reading yet as of the yield's date -> that point is dropped, not
  // given a null/garbage real yield.
  const y10 = [{ date: '2023-06-01', value: 4.0 }, { date: '2024-01-01', value: 4.5 }];
  const cpi = [{ date: '2023-12-01', yoy: 3.0 }];
  const merged = mergeRealYield(y10, cpi);
  ok('pre-CPI-history yield point dropped, not leaked from the future', merged.length === 1 && merged[0].date === '2024-01-01');
}

console.log('[realYieldScore — combines y10 + CPI headline into a comparable real-yield level]');
{
  const y10Obs = new Map();
  const cpiObs = new Map();
  for (let i = 0; i < 13; i++) {
    const d = `2024-${String(i + 1).padStart(2, '0')}-01`;
    y10Obs.set(d, 4.5);
    // 13-point index series implying ~2% YoY (isIndex:true, USD-style).
    cpiObs.set(d, 100 * (1 + (0.02 / 12) * i));
  }
  const meta = { series: 'CPIAUCSL', isIndex: true };
  const r = realYieldScore(y10Obs, cpiObs, meta);
  ok('latestY10 is 4.5', r.latestY10 === 4.5);
  ok('latestCpiYoy is ~2%', Math.abs(r.latestCpiYoy - 2) < 0.2, r.latestCpiYoy);
  ok('latestReal is ~2.5 (4.5 - 2.0)', Math.abs(r.latestReal - 2.5) < 0.2, r.latestReal);
}
{
  // OECD-style pre-computed-YoY CPI (isIndex:false) — must NOT be re-derived.
  const y10Obs = new Map([['2024-01-01', 2.5], ['2024-02-01', 2.6]]);
  const cpiObs = new Map([['2024-01-01', 1.5], ['2024-02-01', 1.2]]);
  const meta = { series: 'CPALTT01DEM659N', isIndex: false };
  const r = realYieldScore(y10Obs, cpiObs, meta);
  ok('latestCpiYoy is the raw value (1.2), not re-derived', r.latestCpiYoy === 1.2, r.latestCpiYoy);
  ok('latestReal is 2.6 - 1.2 = 1.4', r.latestReal === 1.4, r.latestReal);
}

console.log('[realYieldScore — rich vs own history reads positive]');
{
  const y10Obs = new Map(), cpiObs = new Map();
  // 19 months flat at 1% real (y10=3, cpi=2), then a jump in y10 to 6% (cpi stays 2%).
  for (let i = 0; i < 19; i++) { y10Obs.set(`d${String(i).padStart(2, '0')}`, 3); cpiObs.set(`d${String(i).padStart(2, '0')}`, 2); }
  y10Obs.set('d19', 6); cpiObs.set('d19', 2);
  const meta = { series: 'x', isIndex: false };
  const r = realYieldScore(y10Obs, cpiObs, meta);
  ok('latestReal is the jump (4)', r.latestReal === 4, r.latestReal);
  ok('z reads strongly positive (unusual vs its own recent history)', r.z > 2, r.z);
  ok('score saturates toward +1', r.score > 0.8, r.score);
}

console.log('[realYieldScore — too little merged history]');
{
  const y10Obs = new Map([['d0', 4], ['d1', 4.2]]);
  const cpiObs = new Map([['d0', 2]]);
  const meta = { series: 'x', isIndex: false };
  const r = realYieldScore(y10Obs, cpiObs, meta);
  ok('short series -> null score, not a crash', r.score === null);
  ok('still reports the latest raw level', r.latestReal === 2.2, r.latestReal);
}

console.log('[realYieldScore — score field itself is rounded, not just latestReal]');
{
  // CPI flat at 0 so real = y10 directly; y10 follows the same
  // oscillate-then-moderate-jump pattern every other engine's regression
  // test uses to reproduce the z/2.5 float tail.
  const y10Obs = new Map(), cpiObs = new Map();
  for (let i = 0; i < 19; i++) { y10Obs.set(`d${String(i).padStart(2, '0')}`, i % 2 === 0 ? 1.05 : 0.95); cpiObs.set(`d${String(i).padStart(2, '0')}`, 0); }
  y10Obs.set('d19', 1.03); cpiObs.set('d19', 0);
  const meta = { series: 'x', isIndex: false };
  const r = realYieldScore(y10Obs, cpiObs, meta);
  ok('score has no floating-point tail', r.score === +r.score.toFixed(2), r.score);
}

console.log('[REAL_YIELD_UNIVERSE sanity]');
{
  ok('covers all 8 currencies', ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'].every(c => REAL_YIELD_UNIVERSE[c]));
  ok('every currency also has a CPI_UNIVERSE headline entry to pair with (imported from cpiEngine.js)', Object.keys(REAL_YIELD_UNIVERSE).every(c => CPI_UNIVERSE[c]?.headline));
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll realYieldEngine tests passed.');
