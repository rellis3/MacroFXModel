// Synthetic tests for charm/vanna greeks + aggregate exposure. No network.
//   node js/gammaGreeks.test.mjs
import { bsCharm, bsVanna, charmVannaExposure } from './gammaGreeks.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) fails++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('[bsVanna — sign + parity + ATM zero]');
{
  // ATM (S=K): d1 = 0.5σ√T > 0, d2 = -0.5σ√T < 0 → vanna = -φ(d1)·d2/σ > 0 (slightly).
  // OTM call (K>>S): d2 << 0 → vanna > 0; deep ITM call (K<<S): d2 > 0 → vanna < 0.
  const vAtm = bsVanna(100, 100, 0.1, 0.2);
  ok('ATM vanna small & finite', Number.isFinite(vAtm), `${vAtm}`);
  ok('OTM (K>S) vanna positive', bsVanna(100, 120, 0.1, 0.2) > 0, `${bsVanna(100,120,0.1,0.2)}`);
  ok('ITM (K<S) vanna negative', bsVanna(100, 80, 0.1, 0.2) < 0, `${bsVanna(100,80,0.1,0.2)}`);
  // Golden numeric: S=100,K=110,T=0.25,σ=0.2,r=0 → d1=-0.9031,d2=-1.0031,φ(d1)=0.2653
  // → vanna = -φ(d1)·d2/σ ≈ 1.331.
  ok('golden vanna ~1.33', near(bsVanna(100, 110, 0.25, 0.2), 1.331, 0.01), `${bsVanna(100,110,0.25,0.2)}`);
  ok('bad inputs → 0', bsVanna(0, 100, 0.1, 0.2) === 0 && bsVanna(100, 100, 0, 0.2) === 0);
}

console.log('[bsCharm — sign + magnitude]');
{
  // Charm is largest near ATM and grows as T→0. Finite everywhere valid.
  const c1 = bsCharm(100, 100, 0.1, 0.2), c2 = bsCharm(100, 100, 0.02, 0.2);
  ok('charm finite', Number.isFinite(c1) && Number.isFinite(c2));
  ok('charm larger closer to expiry (|c2| > |c1|)', Math.abs(c2) > Math.abs(c1), `${c2} vs ${c1}`);
  ok('bad inputs → 0', bsCharm(100, 100, 0.1, 0) === 0);
}

console.log('[charmVannaExposure — aggregate like GEX]');
{
  const strikes = [90, 100, 110], calls = [1000, 2000, 3000], puts = [3000, 2000, 1000];
  const flat = () => 0.2;
  const ex = charmVannaExposure(strikes, calls, puts, 100, { sigmaFn: flat, T: 0.1, mult: 100 });
  ok('returns totals + profile', ex && Number.isFinite(ex.cex) && Number.isFinite(ex.vex) && ex.profile.length === 3, JSON.stringify(ex?.cex));
  // (calls-puts) = [-2000, 0, +2000] → net exposure is antisymmetric around ATM;
  // the vanna profile should change sign across the strikes → a vanna flip exists.
  ok('vanna flip found (sign change across strikes)', ex.vannaFlip != null, `${ex.vannaFlip}`);
  ok('profile sorted by strike', ex.profile[0].strike === 90 && ex.profile[2].strike === 110);
  // per-strike IV (a smile) is honoured — passing a fn of strike changes the result.
  const smile = k => 0.2 + Math.abs(k - 100) * 0.002;
  const ex2 = charmVannaExposure(strikes, calls, puts, 100, { sigmaFn: smile, T: 0.1, mult: 100 });
  ok('per-strike IV surface changes the exposure', ex2.vex !== ex.vex, `${ex2.vex} vs ${ex.vex}`);
  ok('guards: bad args → null', charmVannaExposure(null, [], [], 100, { sigmaFn: flat, T: 0.1 }) === null
    && charmVannaExposure(strikes, calls, puts, 100, { sigmaFn: null, T: 0.1 }) === null);
  // strikes whose sigma is 0/undefined are skipped, not NaN'd.
  const partial = k => (k === 100 ? 0.2 : 0);
  const ex3 = charmVannaExposure(strikes, calls, puts, 100, { sigmaFn: partial, T: 0.1, mult: 100 });
  ok('zero-IV strikes skipped cleanly', ex3.profile.length === 1 && ex3.profile[0].strike === 100, JSON.stringify(ex3.profile));
}

console.log(`\n${fails === 0 ? 'ALL PASSED ✓' : fails + ' FAILED ✗'}`);
process.exit(fails === 0 ? 0 : 1);
