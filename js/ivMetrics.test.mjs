// Synthetic tests for the IV-surface metrics. No network.
//   node js/ivMetrics.test.mjs
import { expectedMove, ivDynamics, riskReversal, vannaState } from './ivMetrics.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) fails++; };
const near = (a, b, t = 1e-6) => Math.abs(a - b) <= t;

console.log('[expectedMove — ATM straddle]');
{
  // gold-ish: ATM 4050 (spot 4057), call 21.3 + put 21.1 = 42.4 → ±42.4 pts ≈ 1.05%.
  const strikes = [4000, 4050, 4100], callPx = [57.4, 21.3, 4.6], putPx = [7.2, 21.1, 54.4];
  const em = expectedMove(strikes, callPx, putPx, 4057, { dte: 28 });
  ok('ATM strike nearest spot (4050)', em.atmStrike === 4050, `${em.atmStrike}`);
  ok('straddle = 42.4', near(em.move, 42.4), `${em.move}`);
  ok('pct ≈ 1.045%', near(em.pct, 42.4 / 4057 * 100, 1e-3), `${em.pct}`);
  ok('upper/lower band', near(em.upper, 4099.4) && near(em.lower, 4014.6), `${em.upper}/${em.lower}`);
  ok('daily = move/√dte', near(em.daily, 42.4 / Math.sqrt(28), 1e-3), `${em.daily}`);
  ok('guards → null', expectedMove([], [], [], 4057) === null && expectedMove(strikes, callPx, putPx, 0) === null);
}

console.log('[ivDynamics — ATM change + skew steepening]');
{
  const strikes = [3900, 4050, 4200], spot = 4050;
  const iv = [0.36, 0.288, 0.34], ivPrior = [0.30, 0.264, 0.30];   // wings +6/+4, ATM +2.4
  const d = ivDynamics(strikes, iv, ivPrior, spot, { wingPct: 0.02 });
  ok('ATM IV in % (28.8)', near(d.atmIV, 28.8, 0.01), `${d.atmIV}`);
  ok('ATM change +2.4', near(d.atmChg, 2.4, 0.01), `${d.atmChg}`);
  ok('wings rose more than ATM → steepening > 0', d.skewSteepening > 0, `${d.skewSteepening}`);
  ok('rising flag true', d.rising === true);
}

console.log('[riskReversal — put vs call skew]');
{
  const strikes = [3900, 4050, 4200], spot = 4050;
  const iv = [0.36, 0.288, 0.30];   // 3% OTM put (3928→3900) IV 0.36 > 3% OTM call (4171→4200) IV 0.30
  const rr = riskReversal(strikes, iv, spot, { pct: 0.03 });
  ok('RR positive (put-skewed / downside fear)', rr.rr > 0, `${rr.rr}`);
  ok('tilt = downside', rr.tilt === 'downside', rr.tilt);
  ok('reports both wings', rr.putStrike === 3900 && rr.callStrike === 4200, `${rr.putStrike}/${rr.callStrike}`);
}

console.log('[vannaState — VEX × IV direction]');
{
  ok('+VEX & IV falling → tailwind firing', (() => { const v = vannaState(5e6, -1.2); return v.state === 'tailwind' && v.firing; })());
  ok('+VEX & IV rising → headwind', vannaState(5e6, 1.2).state === 'headwind');
  ok('−VEX & IV rising → tailwind', vannaState(-5e6, 1.2).state === 'tailwind');
  ok('tiny IV move → not firing', vannaState(5e6, -0.1).firing === false);
  ok('zero VEX → neutral', vannaState(0, -1).state === 'neutral');
}

console.log(`\n${fails === 0 ? 'ALL PASSED ✓' : fails + ' FAILED ✗'}`);
process.exit(fails === 0 ? 0 : 1);
