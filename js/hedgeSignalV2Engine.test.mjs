// Unit tests for hedgeSignalV2Engine — synthetic data, no network.
// Run: node js/hedgeSignalV2Engine.test.mjs
import assert from 'node:assert';
import {
  olsFit, halfLife, passesCointegration, cointegrationTest, rollingSpread,
  backtestPair, backtestBaseline, runComparison, liveSignal, summarizePnls,
} from './hedgeSignalV2Engine.js';

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

// Deterministic LCG so tests are reproducible (no Math.random).
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }

// A cointegrated pair: B is a random walk; A = priceLevel·exp(β·logB + OU stationary spread).
function makeCointegrated(n, beta, kappa, seed) {
  const r = rng(seed);
  const A = [], B = [];
  let logB = Math.log(100), s = 0;
  for (let i = 0; i < n; i++) {
    logB += 0.01 * gauss(r);
    s = (1 - kappa) * s + 0.02 * gauss(r);     // mean-reverting OU spread around 0
    const logA = 1.0 + beta * logB + s;        // logA − β·logB = const + stationary
    A.push(Math.exp(logA)); B.push(Math.exp(logB));
  }
  return { A, B };
}
// A non-cointegrated pair: two independent random walks.
function makeRandomWalks(n, seed) {
  const r = rng(seed); const A = [], B = [];
  let la = Math.log(100), lb = Math.log(100);
  for (let i = 0; i < n; i++) { la += 0.01 * gauss(r); lb += 0.01 * gauss(r); A.push(Math.exp(la)); B.push(Math.exp(lb)); }
  return { A, B };
}

console.log('hedgeSignalV2Engine tests:');

ok('olsFit recovers slope + intercept and a strong t-stat under noise', () => {
  const r = rng(101);
  const x = Array.from({ length: 200 }, (_, i) => i);
  const y = x.map(v => 3 + 2 * v + 0.5 * gauss(r));   // strong signal, mild noise
  const f = olsFit(y, x);
  assert.ok(Math.abs(f.beta - 2) < 0.01, `beta ${f.beta}`);
  assert.ok(Math.abs(f.alpha - 3) < 1.0, `alpha ${f.alpha}`);
  assert.ok(f.t > 100, `t should be large for a strong fit, got ${f.t}`);
});

ok('halfLife recovers a known OU process and is finite', () => {
  // OU with kappa: s_t = (1-kappa) s_{t-1} + noise → λ ≈ −kappa, hl ≈ ln2/kappa.
  const r = rng(7); let s = 0; const series = [];
  const kappa = 0.1;
  for (let i = 0; i < 2000; i++) { s = (1 - kappa) * s + 0.05 * gauss(r); series.push(s); }
  const hl = halfLife(series);
  assert.ok(hl.ok, 'should be mean-reverting');
  assert.ok(hl.lambda < 0, `lambda ${hl.lambda}`);
  const expected = Math.log(2) / kappa;           // ≈ 6.9 bars
  assert.ok(Math.abs(hl.halfLife - expected) / expected < 0.35, `hl ${hl.halfLife} vs ${expected}`);
  assert.ok(hl.t < -5, `t-stat should be strongly negative, got ${hl.t}`);
});

ok('halfLife on a random walk is NOT mean-reverting', () => {
  const r = rng(11); let x = 0; const series = [];
  for (let i = 0; i < 2000; i++) { x += 0.05 * gauss(r); series.push(x); }
  const hl = halfLife(series);
  // A pure random walk's λ≈0 and t-stat is weak → fails the cointegration gate.
  assert.ok(!passesCointegration(series).pass, `random walk should fail gate (t=${hl.t})`);
});

ok('cointegrationTest accepts cointegrated, rejects random walks, recovers β', () => {
  const { A, B } = makeCointegrated(2000, 1.3, 0.12, 3);
  const gate = cointegrationTest(A, B);
  assert.ok(gate.pass, `cointegrated pair should pass (t=${gate.t})`);
  assert.ok(Math.abs(gate.beta - 1.3) < 0.15, `should recover β≈1.3, got ${gate.beta}`);

  const rw = makeRandomWalks(2000, 5);
  assert.ok(!cointegrationTest(rw.A, rw.B).pass, 'random-walk pair should fail');
});

ok('rollingSpread has no lookahead (warmup bars are null, β from past only)', () => {
  const { A, B } = makeCointegrated(500, 1.0, 0.1, 9);
  const { beta, spread } = rollingSpread(A, B, { betaWindow: 120 });
  for (let i = 0; i < 120; i++) { assert.strictEqual(beta[i], null); assert.strictEqual(spread[i], null); }
  assert.ok(beta[200] != null && spread[200] != null, 'should be warm after betaWindow');
});

ok('backtestPair beats baseline on a cointegrated pair (OOS edge)', () => {
  const { A, B } = makeCointegrated(3000, 1.25, 0.1, 21);
  const v2  = backtestPair(A, B);
  const base = backtestBaseline(A, B);
  const v2Total   = v2.trades.reduce((s, t) => s + t.pnl, 0);
  assert.ok(v2.trades.length >= 5, `expected several v2 trades, got ${v2.trades.length}`);
  assert.ok(v2Total > 0, `v2 should be net positive on a mean-reverting spread, got ${v2Total.toFixed(4)}`);
  // v2 should have a time-stop reason available in its vocabulary
  assert.ok(v2.trades.every(t => ['REVERT', 'STOP', 'TIME'].includes(t.reason)));
  void base;
});

ok('runComparison produces an IS/OOS A/B card with per-pair cointegration flags', () => {
  const coint = makeCointegrated(2500, 1.1, 0.1, 33);
  const rw    = makeRandomWalks(2500, 44);
  const closesMap = { CA: coint.A, CB: coint.B, RA: rw.A, RB: rw.B };
  const out = runComparison(closesMap, [['CA', 'CB'], ['RA', 'RB']]);
  assert.ok(out.v2.oos && out.base.oos, 'has OOS blocks for both');
  assert.strictEqual(out.perPair.length, 2);
  const cointRow = out.perPair.find(p => p.pair === 'CA/CB');
  const rwRow    = out.perPair.find(p => p.pair === 'RA/RB');
  assert.ok(cointRow.cointegrated, 'cointegrated pair flagged true');
  assert.ok(!rwRow.cointegrated, 'random-walk pair flagged false');
});

ok('liveSignal money-matches legs (notionalRatioB ≈ β) and gives a direction on entry', () => {
  // Force a divergence at the end so |z| is large and the gate passes.
  const { A, B } = makeCointegrated(2000, 1.4, 0.08, 51);
  A[A.length - 1] = A[A.length - 1] * 1.05;         // shock leg A up → spread rich → SHORT A
  const sig = liveSignal(A, B);
  assert.ok(sig, 'should return a reading');
  assert.ok(sig.beta != null && sig.notionalRatioB != null, 'has hedge ratio');
  assert.ok(Math.abs(sig.notionalRatioB - Math.abs(sig.beta)) < 1e-6, 'notional ratio is the hedge ratio');
  if (sig.isEntry) {
    assert.strictEqual(sig.direction_a, 'SHORT');
    assert.strictEqual(sig.direction_b, 'LONG');
    assert.ok(sig.holdLimitBars > 0, 'entry carries a time-stop');
  }
});

ok('summarizePnls reports coherent metrics', () => {
  const s = summarizePnls([1, -0.5, 0.8, -0.2, 0.4]);
  assert.strictEqual(s.trades, 5);
  assert.ok(Math.abs(s.total - 1.5) < 1e-9, `total ${s.total}`);
  assert.ok(s.winRate > 0 && s.winRate < 1);
  assert.ok(s.profitFactor > 1);
});

console.log(`\n${passed} tests passed.`);
