// Synthetic, no-network unit tests for analyticsDesk. The brick is an
// ASSEMBLY — the underlying math is pinned by each brick's own suite — so the
// tests here check composition: fields present, units sane, regime-appropriate
// readings on constructed markets, and graceful nulls, never throws.
//
//   node js/analyticsDesk.test.mjs

import { deskSnapshot } from './analyticsDesk.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };

// Deterministic bar builders (no Math.random).
function mkBars(n, closeFn, rangePct = 0.006) {
  const bars = [];
  for (let i = 0; i < n; i++) {
    const c = closeFn(i), o = i ? closeFn(i - 1) : c;
    const hi = Math.max(o, c) * (1 + rangePct / 2), lo = Math.min(o, c) * (1 - rangePct / 2);
    bars.push({ date: `d${i}`, open: o, high: hi, low: lo, close: c });
  }
  return bars;
}
// Oscillating (mean-reverting) market around 1.10.
const revBars = mkBars(500, i => 1.10 * (1 + 0.01 * Math.sin(i / 7)));
// Persistent trend market.
const trendBars = mkBars(500, i => 1.10 * Math.exp(0.0008 * i));

console.log('[shape & units]');
{
  const s = deskSnapshot(revBars, 'fx');
  ok('ok with enough bars', s.ok === true && s.n === 500);
  ok('σ finite and positive', s.sigma > 0, `σ=${s.sigma?.toExponential(2)}`);
  ok('bands ordered up75 > up50 > close > dn50 > dn75',
     s.bands && s.bands.up75 > s.bands.up50 && s.bands.up50 > s.lastClose &&
     s.lastClose > s.bands.dn50 && s.bands.dn50 > s.bands.dn75);
  ok('regime is a string', typeof s.regime === 'string' && s.regime.length > 0, s.regime);
  ok('dayType T finite', Number.isFinite(s.dayTypeT));
  // DFA α is not bounded by 1: ~0.5 = independent increments, >1 = the
  // increments themselves look integrated (a very smooth series; a random
  // walk's LEVELS read ~1.5). Real return series land ~0.4–0.8.
  ok('Hurst finite and in the DFA range [0,2]', s.hurst >= 0 && s.hurst <= 2, `H=${s.hurst?.toFixed(3)}`);
  ok('entropy normalized ∈ [0,1]', s.entropy.normalized >= 0 && s.entropy.normalized <= 1);
  ok('shift percentile ∈ [0,1] with history n', s.entropy.shiftPctile >= 0 && s.entropy.shiftPctile <= 1 && s.entropy.n > 20);
  ok('rangeZ finite', Number.isFinite(s.rangeZ));
  ok('tail present with ordered var99 ≤ es99 ≤ 1-in-250', !s.tail || (s.tail.var99 <= s.tail.es99 && s.tail.var99 <= s.tail.loss1in250),
     s.tail ? `var99=${(s.tail.var99 * 100).toFixed(2)}%` : 'null');
}

console.log('\n[regime-appropriate readings]');
{
  const rev = deskSnapshot(revBars, 'fx');
  const tr  = deskSnapshot(trendBars, 'fx');
  ok('oscillating market: OU says reverting with finite half-life', rev.ou?.ok === true && rev.ou.halfLifeDays > 0, `hl=${rev.ou?.halfLifeDays?.toFixed(1)}d`);
  ok('trend market: OU does NOT claim reversion', !tr.ou?.ok, `ok=${tr.ou?.ok}`);

  // Hurst must DISCRIMINATE, not just differ in the 3rd decimal. The old
  // levels-based estimator returned ~0.93 for both of these (measured
  // 2026-07-25) — a passing "trend > osc" assert on a 0.01 gap was the test
  // failing to notice a degenerate metric. Random-walk returns must read near
  // 0.5, which is what makes the number interpretable at all.
  let seed = 12345;
  const rnd = () => { seed = (1103515245 * seed + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
  const walkBars = [];
  let pw = 1.10;
  for (let i = 0; i < 600; i++) {
    const o = pw; pw *= 1 + 0.004 * rnd();
    walkBars.push({ date: `w${i}`, open: o, high: Math.max(o, pw) * 1.001, low: Math.min(o, pw) * 0.999, close: pw });
  }
  const walk = deskSnapshot(walkBars, 'fx');
  ok('random-walk market: Hurst ≈ 0.5 (metric is calibrated, not saturated)',
     Math.abs(walk.hurst - 0.5) < 0.12, `H=${walk.hurst.toFixed(3)}`);

  // A market whose RETURNS are positively autocorrelated — the thing a Hurst
  // reading is meant to detect. (A constant-drift curve is not: its returns
  // are a constant, so any correct estimator reads ≈0 there.)
  const persBars = [];
  let pp = 1.10, pr = 0;
  for (let i = 0; i < 600; i++) {
    pr = 0.85 * pr + 0.004 * rnd();
    const o = pp; pp *= 1 + pr;
    persBars.push({ date: `p${i}`, open: o, high: Math.max(o, pp) * 1.001, low: Math.min(o, pp) * 0.999, close: pp });
  }
  const pers = deskSnapshot(persBars, 'fx');
  ok('persistent-increment market reads > 0.6', pers.hurst > 0.6, `H=${pers.hurst.toFixed(3)}`);
  ok('persistent separated from random walk by a real margin (≥0.2)',
     pers.hurst - walk.hurst >= 0.2, `${pers.hurst.toFixed(3)} vs ${walk.hurst.toFixed(3)}`);
}

console.log('\n[graceful degradation]');
{
  const short = deskSnapshot(revBars.slice(0, 100), 'fx');
  ok('too few bars → ok:false with reason, no throw', short.ok === false && typeof short.error === 'string');
  ok('empty → ok:false', deskSnapshot([], 'fx').ok === false);
  // Index/commodity classes run through their own σ paths without throwing.
  ok('index class runs', deskSnapshot(revBars, 'index').ok === true);
  ok('commodity class runs', deskSnapshot(revBars, 'commodity').ok === true);
}

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
