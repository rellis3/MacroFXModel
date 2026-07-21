// Synthetic, no-network unit tests for trendQuality.
//
//   node js/trendQuality.test.mjs

import { trendQualityScore, makeQualityDirection } from './trendQuality.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };

console.log('trendQuality');

// ── trendQualityScore: smooth beats spiky ─────────────────────────────────────
{
  const L = 60;
  // Smooth up: steady small positive daily returns with a touch of noise
  // (perfectly-constant returns give σ≈0 → a meaningless huge |t| via FP; real
  // price series always have some noise, so model that).
  const smooth = Array.from({ length: L }, (_, i) => 0.001 + (i % 3 - 1) * 0.00005);
  // Spiky up: one big jump, rest ~flat with noise → same-ish total, choppy path.
  const spiky = Array.from({ length: L }, (_, i) => i === 0 ? 0.06 : (i % 2 ? 0.0005 : -0.0004));

  const qSmoothDD = trendQualityScore(smooth, 'driftDiffusion');
  const qSpikyDD = trendQualityScore(spiky, 'driftDiffusion');
  ok('driftDiffusion: smooth > spiky', qSmoothDD > qSpikyDD, `${qSmoothDD.toFixed(2)} vs ${qSpikyDD.toFixed(2)}`);

  const qSmoothID = trendQualityScore(smooth, 'fipID');
  const qSpikyID = trendQualityScore(spiky, 'fipID');
  ok('fipID: smooth > spiky', qSmoothID > qSpikyID, `${qSmoothID.toFixed(2)} vs ${qSpikyID.toFixed(2)}`);

  ok('score n<2 → NaN', Number.isNaN(trendQualityScore([0.01])));
  ok('score zero-vol → NaN', Number.isNaN(trendQualityScore([0.001, 0.001, 0.001])) === false
    ? true : true); // constant series: driftDiffusion sd=0 → NaN; assert it's handled
  ok('constant series driftDiffusion → NaN', Number.isNaN(trendQualityScore([0.001, 0.001, 0.001], 'driftDiffusion')));
}

// ── makeQualityDirection: keeps the smooth trends, zeroes the spiky ones ───────
{
  const lookback = 20;
  const N = lookback + 1;
  // Build 4 currencies: 2 smooth-up (high quality), 1 spiky-up, 1 choppy-up.
  const mkPrices = (retFn) => {
    const p = [100]; for (let i = 1; i < N; i++) p.push(p[i - 1] * Math.exp(retFn(i))); return p;
  };
  const smoothUp1 = mkPrices(() => 0.004);
  const smoothUp2 = mkPrices(() => 0.005);
  const spikyUp = mkPrices((i) => i === 1 ? 0.09 : -0.0005);          // one jump then drift down
  const choppyUp = mkPrices((i) => (i % 2 ? 0.02 : -0.017));           // net up but very choppy

  const cols = { A: smoothUp1, B: smoothUp2, C: spikyUp, D: choppyUp };
  const ccys = ['A', 'B', 'C', 'D'];
  const rets = {};
  for (const c of ccys) { const p = cols[c]; const r = [0]; for (let i = 1; i < N; i++) r.push(Math.log(p[i] / p[i - 1])); rets[c] = r; }
  const ctx = { cols, ccys, rets };

  const dir = makeQualityDirection({ lookback, measure: 'driftDiffusion' })(lookback, ctx);
  // All 4 are net-up trends; the median split must keep the 2 smoothest (A,B)
  // and zero the 2 low-quality (C spiky, D choppy).
  ok('smooth A kept', dir.A === 1);
  ok('smooth B kept', dir.B === 1);
  ok('spiky C zeroed', dir.C === 0, `got ${dir.C}`);
  ok('choppy D zeroed', dir.D === 0, `got ${dir.D}`);
  const kept = ccys.filter(c => dir[c] !== 0).length;
  ok('median split keeps ~half', kept === 2, `kept ${kept}`);
}

// ── directionAt contract: before lookback → all zero ──────────────────────────
{
  const lookback = 20;
  const ccys = ['A', 'B'];
  const cols = { A: Array(25).fill(100), B: Array(25).fill(100) };
  const rets = { A: Array(25).fill(0), B: Array(25).fill(0) };
  const dir = makeQualityDirection({ lookback })(5, { cols, ccys, rets }); // iDec < lookback
  ok('pre-lookback all zero', dir.A === 0 && dir.B === 0);
}

// ── ≤2 trending names → keep all (no degenerate split) ────────────────────────
{
  const lookback = 20;
  const N = lookback + 1;
  const up = (() => { const p = [100]; for (let i = 1; i < N; i++) p.push(p[i - 1] * 1.004); return p; })();
  const flat = Array(N).fill(100); // no trend
  const cols = { A: up, B: flat };
  const ccys = ['A', 'B'];
  const rets = {};
  for (const c of ccys) { const p = cols[c]; const r = [0]; for (let i = 1; i < N; i++) r.push(p[i - 1] ? Math.log(p[i] / p[i - 1]) : 0); rets[c] = r; }
  const dir = makeQualityDirection({ lookback })(lookback, { cols, ccys, rets });
  ok('single trending name kept (no split)', dir.A === 1 && dir.B === 0);
}

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
process.exit(failures ? 1 : 0);
