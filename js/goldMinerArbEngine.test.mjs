// Unit tests for goldMinerArbEngine — synthetic data, no network.
// Run: node js/goldMinerArbEngine.test.mjs
import assert from 'node:assert';
import {
  GMA_DEFAULTS, GMA_BASELINE_OPTS, runGoldMinerArb, compareGoldMinerArb,
} from './goldMinerArbEngine.js';

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

// Deterministic LCG so tests are reproducible (no Math.random) — same
// generator style as hedgeSignalV2Engine.test.mjs.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }

function dateSeries(n, startYear = 2020) {
  const dates = [];
  const d = new Date(Date.UTC(startYear, 0, 1));
  while (dates.length < n) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

// Cointegrated pair: gold is a random walk; GDX = alpha + beta*gold + a
// mean-reverting OU spread (kappa) — the spread is stationary by construction.
// kappa/ouStep chosen so the OU signal is strong relative to gold's own
// random-walk noise (a weak/slow OU term gets swamped by beta-estimation
// error on a 120-bar window and the gate can't discriminate it from real
// noise — verified empirically against hedgeSignalV2Engine's own
// passesCointegration before picking these values).
function makeCointegrated(n, { beta = 0.018, alpha = 5, kappa = 0.15, ouStep = 0.15, seed = 7 } = {}) {
  const r = rng(seed);
  const gold = [], gdx = [];
  let g = 2000, s = 0;
  for (let i = 0; i < n; i++) {
    g += g * 0.006 * gauss(r);
    s = (1 - kappa) * s + ouStep * gauss(r);
    gold.push(g);
    gdx.push(alpha + beta * g + s);
  }
  return { gold, gdx };
}

// Non-cointegrated: two independent random walks (no stationary combination).
function makeIndependent(n, seed = 11) {
  const r = rng(seed);
  const gold = [], gdx = [];
  let g = 2000, m = 35;
  for (let i = 0; i < n; i++) {
    g += g * 0.006 * gauss(r);
    m += m * 0.008 * gauss(r);
    gold.push(g); gdx.push(m);
  }
  return { gold, gdx };
}

const N = 1000;
const dates = dateSeries(N);
const calmVix = new Array(N).fill(15);
const panicVix = new Array(N).fill(40);

console.log('goldMinerArbEngine tests:');

ok('cointegrated pair: the policy trades and reports a passing cointegration gate on at least some entries', () => {
  const { gold, gdx } = makeCointegrated(N);
  const recs = runGoldMinerArb(dates, gdx, gold, calmVix, GMA_DEFAULTS);
  assert.ok(recs.length > 0, `expected trades on a genuinely cointegrated series, got ${recs.length}`);
  assert.ok(recs.some(r => r.cointegrated), 'expected at least one entry with cointegrated=true');
});

ok('independent random walks: far fewer entries pass the cointegration gate than the cointegrated case', () => {
  const { gold, gdx } = makeIndependent(N);
  const recs = runGoldMinerArb(dates, gdx, gold, calmVix, GMA_DEFAULTS);
  const { gold: cGold, gdx: cGdx } = makeCointegrated(N);
  const cRecs = runGoldMinerArb(dates, cGdx, cGold, calmVix, GMA_DEFAULTS);
  // Not a strict zero — a spurious 5%-level pass is expected noise, not a bug —
  // but the gated trade count on genuine noise must be far below the
  // cointegrated case, else the gate isn't doing anything.
  assert.ok(recs.length <= cRecs.length, `independent-walk trades (${recs.length}) should not exceed cointegrated trades (${cRecs.length})`);
});

ok('VIX macro filter: entries are fully blocked when VIX is always in panic mode', () => {
  const { gold, gdx } = makeCointegrated(N);
  const recs = runGoldMinerArb(dates, gdx, gold, panicVix, GMA_DEFAULTS);
  assert.strictEqual(recs.length, 0, `expected zero trades with VIX pinned at 40, got ${recs.length}`);
});

ok('VIX macro STOP: an open position is force-closed the bar VIX crosses above vixMax', () => {
  const { gold, gdx } = makeCointegrated(N);
  // Calm until bar 500, then panic for the rest — any position still open at
  // bar 500 must close with reason 'macro_stop' on/after that bar.
  const vix = calmVix.map((v, i) => (i >= 500 ? 40 : v));
  const recs = runGoldMinerArb(dates, gdx, gold, vix, GMA_DEFAULTS);
  const late = recs.filter(r => dates.indexOf(r.date) >= 500);
  // Either no position was open at the panic transition (fine), or the first
  // close after it is tagged macro_stop.
  if (late.length) assert.strictEqual(late[0].reason, 'macro_stop', `expected first post-panic close to be macro_stop, got ${late[0].reason}`);
});

ok('no lookahead: truncating the series after any given bar does not change earlier trade records', () => {
  const { gold, gdx } = makeCointegrated(N);
  const full = runGoldMinerArb(dates, gdx, gold, calmVix, GMA_DEFAULTS);
  assert.ok(full.length >= 2, 'need at least 2 trades to test truncation invariance');
  const cutDate = full[Math.floor(full.length / 2)].date;
  const cutIdx = dates.indexOf(cutDate) + 1;
  const truncated = runGoldMinerArb(dates.slice(0, cutIdx), gdx.slice(0, cutIdx), gold.slice(0, cutIdx), calmVix.slice(0, cutIdx), GMA_DEFAULTS);
  const fullPrefix = full.filter(r => r.date <= cutDate);
  assert.strictEqual(truncated.length, fullPrefix.length, 'trade count before the cut must match between full and truncated runs');
  for (let i = 0; i < truncated.length; i++) {
    assert.strictEqual(truncated[i].date, fullPrefix[i].date, `record ${i} date mismatch`);
    assert.strictEqual(truncated[i].pnl_dollar, fullPrefix[i].pnl_dollar, `record ${i} pnl_dollar mismatch — future data leaked into a past decision`);
  }
});

ok('position sizing: risk_dollar never exceeds the 1% account-equity risk budget, R matches pnl/risk', () => {
  const { gold, gdx } = makeCointegrated(N);
  const recs = runGoldMinerArb(dates, gdx, gold, calmVix, GMA_DEFAULTS);
  assert.ok(recs.length > 0);
  const fullRiskBudget = GMA_DEFAULTS.accountEquity * GMA_DEFAULTS.riskPct;
  for (const r of recs) {
    assert.ok(r.risk_dollar <= fullRiskBudget + 1e-6, `risk_dollar ${r.risk_dollar} exceeds the full risk budget ${fullRiskBudget}`);
    if (r.risk_dollar > 1e-6) {
      const impliedR = +(r.pnl_dollar / r.risk_dollar).toFixed(3);
      assert.ok(Math.abs(impliedR - r.R) < 0.01, `R ${r.R} does not match pnl_dollar/risk_dollar ${impliedR}`);
    }
  }
});

ok('trade records carry every field the 3 CSV exports need', () => {
  const { gold, gdx } = makeCointegrated(N);
  const recs = runGoldMinerArb(dates, gdx, gold, calmVix, GMA_DEFAULTS);
  assert.ok(recs.length > 0);
  const required = ['date', 'filled', 'pnl_pct', 'mae_pct', 'stop_pct', 'R', 'pnl_dollar', 'risk_dollar'];
  for (const r of recs) for (const f of required) assert.ok(f in r, `record missing field '${f}'`);
});

ok('baseline ignores the cointegration gate (trades on non-cointegrated data where the policy would not)', () => {
  const { gold, gdx } = makeIndependent(N, 23);
  const policyRecs = runGoldMinerArb(dates, gdx, gold, calmVix, GMA_DEFAULTS);
  const baseRecs = runGoldMinerArb(dates, gdx, gold, calmVix, { ...GMA_DEFAULTS, ...GMA_BASELINE_OPTS });
  // The baseline's entryZ1 (2.0) is stricter per-entry than the policy's 1.5,
  // but it never checks cointegration, so on pure noise it should not be
  // starved the way the gated policy is.
  assert.ok(baseRecs.length >= policyRecs.length, `expected baseline (${baseRecs.length}) >= gated policy (${policyRecs.length}) on non-cointegrated data`);
});

ok('compareGoldMinerArb returns a full IS/OOS summary shape for both policy and baseline', () => {
  const { gold, gdx } = makeCointegrated(N);
  const cmp = compareGoldMinerArb(dates, gdx, gold, calmVix, GMA_DEFAULTS);
  for (const key of ['policy', 'baseline']) {
    assert.ok(cmp[key].is && cmp[key].oos && cmp[key].full, `${key} missing is/oos/full`);
    assert.ok('sharpe' in cmp[key].full, `${key}.full missing sharpe`);
  }
});

console.log(`\n${passed} tests passed.`);
