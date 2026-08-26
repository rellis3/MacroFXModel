/**
 * Unit tests for js/vwapFixedSigmaAtlasEngine.js. Pure/synthetic: no network.
 *   node js/vwapFixedSigmaAtlasEngine.test.mjs
 *
 * Load-bearing categories: end-to-end shape, §6.1 perturb-the-future
 * causality, fixedSigma genuinely being FIXED within a session (the whole
 * point of the port vs. the already-tested-null growing-σ band), and
 * MFE/MAE arithmetic correctness on a hand-computed path.
 */
import assert from 'node:assert/strict';
import { vwapFixedSigmaAtlasWalk } from './vwapFixedSigmaAtlasEngine.js';

let passed = 0;
const t = (n, f) => { try { f(); passed++; console.log(`  ✓ ${n}`); }
  catch (e) { console.error(`  ✗ ${n}\n    ${e.message}`); process.exitCode = 1; } };

console.log('vwapFixedSigmaAtlasEngine');

const T0 = 1577836800;   // 2020-01-01 00:00:00 UTC
const DAY = 86400;

function packedM1(nBars, { drift = 0.0004, wiggle = 0.06, seedPx = 100 } = {}) {
  const times = new Int32Array(nBars), opens = new Float32Array(nBars);
  const highs = new Float32Array(nBars), lows = new Float32Array(nBars);
  const closes = new Float32Array(nBars), volumes = new Float32Array(nBars);
  let px = seedPx;
  for (let i = 0; i < nBars; i++) {
    const o = px;
    px = px + drift * Math.sin(i / 3000) + wiggle * Math.sin(i / 9) + (i % 251 === 0 ? wiggle * 4 : 0);
    times[i] = T0 + i * 60; opens[i] = o; closes[i] = px;
    highs[i] = Math.max(o, px) + 0.05; lows[i] = Math.min(o, px) - 0.05;
    volumes[i] = 50 + (i % 17);
  }
  return { n: nBars, times, opens, highs, lows, closes, volumes };
}

function oneDay(dayIdx, closeFn, { wick = 0.02 } = {}) {
  const nb = 1440;
  const times = new Int32Array(nb), opens = new Float32Array(nb);
  const highs = new Float32Array(nb), lows = new Float32Array(nb);
  const closes = new Float32Array(nb), volumes = new Float32Array(nb);
  let prevClose = closeFn(0);
  for (let i = 0; i < nb; i++) {
    const c = closeFn(i);
    const o = i === 0 ? c : prevClose;
    times[i] = T0 + dayIdx * DAY + i * 60;
    opens[i] = o; closes[i] = c;
    highs[i] = Math.max(o, c) + wick; lows[i] = Math.min(o, c) - wick;
    volumes[i] = 60; prevClose = c;
  }
  return { times, opens, highs, lows, closes, volumes };
}
function concatDays(days) {
  const nb = days.reduce((s, d) => s + d.times.length, 0);
  const out = { n: nb, times: new Int32Array(nb), opens: new Float32Array(nb), highs: new Float32Array(nb),
    lows: new Float32Array(nb), closes: new Float32Array(nb), volumes: new Float32Array(nb) };
  let off = 0;
  for (const d of days) {
    out.times.set(d.times, off); out.opens.set(d.opens, off); out.highs.set(d.highs, off);
    out.lows.set(d.lows, off); out.closes.set(d.closes, off); out.volumes.set(d.volumes, off);
    off += d.times.length;
  }
  return out;
}
function warmupDays(count, { base = 100, amp = 0.3 } = {}) {
  const days = [];
  for (let i = 0; i < count; i++) days.push(oneDay(i, m => base + amp * Math.sin(m / 180) + (i % 5) * 0.05));
  return days;
}

const P = packedM1(60 * 24 * 90);

t('vwapFixedSigmaAtlasWalk runs end-to-end on synthetic data and returns well-shaped rows', () => {
  const { rows, coverage } = vwapFixedSigmaAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', minLookbackSessions: 25 });
  assert.ok(coverage, 'coverage present');
  for (const r of rows) {
    assert.ok(['short', 'long'].includes(r.side));
    assert.ok([2, 2.5, 3].includes(r.level));
    assert.ok(r.mfePips >= 0 && r.maePips >= 0, 'MFE/MAE must be non-negative (max-excursion, not signed)');
    assert.equal(r.measureBars, 20, 'default measureBars');
    assert.ok(r.fixedSigma > 0);
    assert.ok(r.divAgree >= 0 && r.divAgree <= 4);
    assert.ok(['Asia', 'London', 'NY'].includes(r.session));
  }
});

t('perturbing bars strictly AFTER a cutoff must not change any earlier row (§6.1)', () => {
  const base = packedM1(60 * 24 * 60, { wiggle: 0.06 });
  const wild = { ...base, highs: base.highs.slice(), lows: base.lows.slice(), closes: base.closes.slice(), opens: base.opens.slice() };
  const start = base.n - 3 * 1440;
  for (let i = start; i < base.n; i++) { wild.highs[i] += 3; wild.lows[i] -= 3; wild.closes[i] += 1.5; }

  const a = vwapFixedSigmaAtlasWalk(base, { instrument: 'EURUSD', assetClass: 'fx', minLookbackSessions: 25 });
  const b = vwapFixedSigmaAtlasWalk(wild, { instrument: 'EURUSD', assetClass: 'fx', minLookbackSessions: 25 });
  const cutDate = new Date(base.times[start] * 1000).toISOString().slice(0, 10);
  const keyOf = r => `${r.date}|${r.side}|${r.level}|${r.touchTime}`;
  const byKeyA = new Map(a.rows.map(r => [keyOf(r), r]));
  let checked = 0;
  for (const rb of b.rows) {
    if (rb.date >= cutDate) continue;
    const ra = byKeyA.get(keyOf(rb));
    if (!ra) continue;
    checked++;
    assert.deepEqual(rb, ra, `row ${keyOf(rb)} changed from perturbing a later day`);
  }
  assert.ok(checked > 3, `expected several pre-perturbation rows to compare, got ${checked}`);
});

t('fixedSigma is genuinely FIXED across every row touched within the same day (not a growing intraday value)', () => {
  const { rows } = vwapFixedSigmaAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', minLookbackSessions: 25 });
  const byDate = new Map();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, r.fixedSigma);
    else assert.equal(r.fixedSigma, byDate.get(r.date), `fixedSigma varied within day ${r.date}`);
  }
  assert.ok(byDate.size > 3, 'expected multiple days with touches to compare');
});

t('MFE/MAE arithmetic matches a hand-computed path for an engineered short touch', () => {
  const warm = warmupDays(28, { base: 100, amp: 0.02 });   // very quiet warm-up -> small, stable fixedSigma
  // Day 28: flat, then a sharp spike up (crosses +2σ off a near-100 entry
  // given the tiny warm-up sigma), then a dip BELOW the pre-spike baseline
  // (genuinely favourable for a short) followed by a push above the spike
  // (genuinely adverse) — both unambiguous regardless of the exact fitted
  // sigma, since entry stays close to 100 either way.
  const day = oneDay(28, m => {
    if (m < 300) return 100 + 0.01 * Math.sin(m / 50);
    if (m === 300) return 100.5;   // spike — crosses +2σ
    if (m === 301) return 99.8;    // dips below the ~100 baseline — favourable for the short
    if (m === 302) return 100.7;   // pushes above the spike — adverse for the short
    return 100.0;
  }, { wick: 0.0 });
  const A = concatDays([...warm, day, oneDay(29, m => 100 + 0.02 * Math.sin(m / 180))]);
  const { rows } = vwapFixedSigmaAtlasWalk(A, { instrument: 'SYN', assetClass: 'fx', minLookbackSessions: 25, levels: [2], measureBars: 3 });
  const targetDate = new Date((T0 + 28 * DAY) * 1000).toISOString().slice(0, 10);
  const r = rows.find(x => x.date === targetDate && x.side === 'short' && x.level === 2);
  assert.ok(r, 'expected a short +2σ touch event to complete on the engineered day');
  // entry ≈ vwap(≈100) + 2×fixedSigma(≈0.014) ≈ 100.028 — favourable =
  // entry-99.8 ≈ 0.228, adverse = 100.7-entry ≈ 0.672. Checked as ranges
  // (not exact equality) since entry depends on the warm-up's fitted sigma.
  assert.ok(r.mfePips >= 0.15 && r.mfePips <= 0.30, `expected MFE ≈0.23 (dip to 99.8 vs entry≈100.03), got ${r.mfePips}`);
  assert.ok(r.maePips >= 0.6 && r.maePips <= 0.75, `expected MAE ≈0.67 (push to 100.7 vs entry≈100.03), got ${r.maePips}`);
});

console.log(`${passed} passed`);
process.exit(process.exitCode || 0);
