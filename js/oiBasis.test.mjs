// Reproduces the full-strike-table basis bug + proves the guardrail. No DOM/network.
//   node js/oiBasis.test.mjs
import { estimateSpotFromOI, basisImplausible, MAX_BASIS_FRAC } from './oi.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) fails++; };

// A realistic gold OI ladder: spot ≈ 4030, most OI clustered near ATM (3900–4150),
// plus a long tail of deep-OTM downside puts (protective/legacy positions) that a
// "paste the whole table" pulls in. The centroid drifts DOWN toward that tail.
function goldLadder() {
  const strikes = [], calls = [], puts = [];
  for (let k = 2000; k <= 5000; k += 50) {
    strikes.push(k);
    // Calls peak just above spot; puts carry a heavy deep-OTM downside tail.
    const near = Math.exp(-((k - 4030) ** 2) / (2 * 120 ** 2));
    calls.push(Math.round(8000 * near));
    puts.push(Math.round(8000 * near + (k < 3200 ? 6000 : 0)));   // fat low-strike put tail
  }
  return { strikes, calls, puts };
}

console.log('[the bug: full-table centroid drifts far from ATM]');
{
  const { strikes, calls, puts } = goldLadder();
  const est = estimateSpotFromOI(strikes, calls, puts);
  const spot = 4030;
  ok('full-table estimate lands well below true spot (reproduces the drift)', est < spot * 0.9, `est=${est.toFixed(0)} spot=${spot}`);
  const basis = est - spot;
  ok('that basis is implausible (would shift every strike)', basisImplausible(basis, spot), `basis=${basis.toFixed(0)}`);
}

console.log('[near-ATM slice (~25 strikes) still estimates fine]');
{
  const strikes = [], calls = [], puts = [];
  for (let k = 3800; k <= 4250; k += 25) {
    strikes.push(k);
    const near = Math.exp(-((k - 4030) ** 2) / (2 * 100 ** 2));
    calls.push(Math.round(8000 * near)); puts.push(Math.round(8000 * near));
  }
  const est = estimateSpotFromOI(strikes, calls, puts);
  ok('near-ATM estimate ≈ spot', !basisImplausible(est - 4030, 4030), `est=${est.toFixed(0)}`);
}

console.log('[guardrail thresholds]');
ok('a real gold carry basis (~$30) is kept', !basisImplausible(30, 4030));
ok('a real FX basis (0.002 on 1.08) is kept', !basisImplausible(0.002, 1.08));
ok('a real index basis (~1.5% of 6000) is kept', !basisImplausible(80, 6000));
ok('the gold garbage (~$1863 on 4028) is clipped', basisImplausible(1863, 4028));
ok('the S&P garbage (~4000 on 6000) is clipped', basisImplausible(4000, 6000));
ok('cap is exactly 5% of spot', Math.abs(MAX_BASIS_FRAC * 4030 - 201.5) < 1e-9);
ok('non-finite / zero spot never trips the guard', !basisImplausible(NaN, 4030) && !basisImplausible(50, 0));

console.log(`\n${fails === 0 ? 'ALL PASSED ✓' : fails + ' FAILED ✗'}`);
process.exit(fails === 0 ? 0 : 1);
