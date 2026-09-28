// Tests for js/preregStats.js.   node js/preregStats.test.mjs
import {
  normCdf, normInv, mdeMeanDiff, mdeFromCI, mdeProportion, nForMde, powerVerdict,
  pFromCI, holm, benjaminiHochberg, chanceBaseline,
} from './preregStats.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const near = (a, b, tol = 1e-4) => Math.abs(a - b) <= tol;

ok('normInv(0.975) = 1.95996', near(normInv(0.975), 1.959964));
ok('normInv(0.8) = 0.84162', near(normInv(0.8), 0.841621));
ok('normInv tail (1e-4) = -3.71902', near(normInv(1e-4), -3.719016));
ok('normCdf(1.96) = 0.975', near(normCdf(1.959964), 0.975, 1e-6));
ok('normCdf symmetric', near(normCdf(-0.7) + normCdf(0.7), 1, 1e-9));

// sd 1, 100 v 100, two-sided 5%, 80% power → 2.8016 × √0.02 = 0.3962
ok('mdeMeanDiff textbook', near(mdeMeanDiff({ sd: 1, n1: 100, n2: 100 }), 0.39621));
ok('mdeMeanDiff: design effect 4 doubles it', near(mdeMeanDiff({ sd: 1, n1: 100, n2: 100, deff: 4 }), 2 * 0.39621));
ok('mdeMeanDiff: infinite control = one-sample', near(mdeMeanDiff({ sd: 1, n1: 100 }), 0.28016));
// a 95% CI of ±0.12 → SE 0.0612 → MDE 0.1715 (the rates-pivot-lead interval)
ok('mdeFromCI(±0.12) = 0.1715', near(mdeFromCI({ lo: -0.12, hi: 0.12 }), 0.17154));
// 50% base rate, n=43 (the nowcast N1 calls) → lift 0.2136: only a 71% hit rate was findable
ok('mdeProportion(n=43) = 0.2136', near(mdeProportion({ n: 43 }), 0.21362));
ok('nForMde inverts mdeMeanDiff', (() => { const n = nForMde({ sd: 1, mde: 0.28016 }); return n >= 100 && n <= 101; })());
ok('nForMde with equal control doubles n', near(nForMde({ sd: 1, mde: 0.39621, ratio: 1 }), 100, 1));
ok('powerVerdict', powerVerdict({ mde: 0.08, bar: 0.10 }).verdict === 'POWERED' && powerVerdict({ mde: 0.55, bar: 0.10 }).verdict === 'UNDERPOWERED');

ok('pFromCI: est on the 95% edge → p = 0.05', near(pFromCI({ est: 0.1, lo: 0, hi: 0.2 }), 0.05, 1e-4));

const h = holm([0.01, 0.04, 0.03, 0.005], 0.05);
ok('holm: only the two smallest survive', h.rejected.join() === 'true,false,false,true', h.rejected.join());
ok('holm adjusted monotone', near(h.adjusted[3], 0.02) && near(h.adjusted[0], 0.03) && near(h.adjusted[2], 0.06) && near(h.adjusted[1], 0.06));

const bh = benjaminiHochberg([0.01, 0.04, 0.03, 0.005], 0.05);
ok('BH: all four pass at q=0.05', bh.rejected.every(Boolean));
const bh2 = benjaminiHochberg([0.01, 0.02, 0.2, 0.5], 0.05);
ok('BH: two of four pass', bh2.rejected.join() === 'true,true,false,false');
ok('BH adjusted = min_{k≥i} p·m/k', near(bh2.adjusted[0], 0.04) && near(bh2.adjusted[1], 0.04) && near(bh2.adjusted[2], 0.26667) && near(bh2.adjusted[3], 0.5));

const cb = chanceBaseline({ tests: 5, passes: 1 });
ok('chanceBaseline: 5 cells at 5% → 22.6% at least one', near(cb.pAtLeastOne, 0.226219) && near(cb.pAtLeastObserved, 0.226219));
ok('chanceBaseline: expected = n·alpha', near(chanceBaseline({ tests: 59, passes: 19 }).expected, 2.95));
ok('chanceBaseline: 0 passes has tail 1', near(chanceBaseline({ tests: 10, passes: 0 }).pAtLeastObserved, 1));

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
