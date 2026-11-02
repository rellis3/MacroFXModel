// Swing Map Monte Carlo: reproducible, random walk when k = 0, and the pull does what it says.
//   node js/swingPaths.test.mjs
import { simulatePaths, touchShare, mulberry32, driftSegments } from './swingPaths.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  → ' + e : ''}`); if (!c) fails++; };

console.log('[reproducible and sane]');
{
  const a = simulatePaths({ close: 100, sigma: 0.01, sessions: 20, n: 1500, seed: 7 });
  const b = simulatePaths({ close: 100, sigma: 0.01, sessions: 20, n: 1500, seed: 7 });
  ok('same seed, same answer', JSON.stringify(a.quantiles) === JSON.stringify(b.quantiles));
  ok('k = 0 median stays near the start', Math.abs(a.quantiles[20].p50 / 100 - 1) < 0.01, String(a.quantiles[20].p50));
  const spread = Math.log(a.quantiles[20].p90 / a.quantiles[20].p10);
  ok('p10-p90 spread ~ 2 x 1.2816 x sigma x sqrt(20)', Math.abs(spread - 2 * 1.2816 * 0.01 * Math.sqrt(20)) < 0.01, spread.toFixed(4));
  ok('no expiries, no drift', a.drift.every(d => d.d === 0));
  ok('bad input -> null', simulatePaths({ close: 0, sigma: 0.01 }) === null);
  const r = mulberry32(1); const xs = Array.from({ length: 1000 }, r);
  ok('rng in [0,1)', xs.every(x => x >= 0 && x < 1));
}

console.log('[the pull: near expiry down, far expiry up]');
{
  const ex = [{ s: 5, target: 97, oi: 1000 }, { s: 15, target: 104, oi: 1000 }];
  const p = simulatePaths({ close: 100, sigma: 0.005, sessions: 15, expiries: ex, k: 1, n: 3000, seed: 3 });
  ok('median dips toward the 5-session target first', p.quantiles[5].p50 < 99, String(p.quantiles[5].p50));
  ok('then turns up toward the 15-session target', p.quantiles[15].p50 > p.quantiles[5].p50 + 2, `${p.quantiles[5].p50} -> ${p.quantiles[15].p50}`);
  ok('most-touched path follows the same shape', p.modal[5].px < 99.5 && p.modal[15].px > 101, `${p.modal[5].px} ${p.modal[15].px}`);
  ok('drift switches sign as the near expiry rolls off', p.drift[0].d < 0 && p.drift[10].d > 0);
  const flat = simulatePaths({ close: 100, sigma: 0.005, sessions: 15, expiries: ex, k: 0, n: 3000, seed: 3 });
  ok('k = 0 with the same expiries is a plain walk', Math.abs(flat.quantiles[15].p50 - 100) < 0.6);
  ok('touch share of the far target higher with the pull', touchShare(p, 104) > touchShare(flat, 104));
}

console.log('[drift segments in words]');
{
  const d = [-1, -1, -1, 1, 1, 1, 1, -0.1, 1, 1].map((x, t) => ({ t, d: x }));
  const sg = driftSegments(d);
  ok('down then up, a one-day wobble folded in', sg.text === 'down days 1-3, up days 4-10', sg.text);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
