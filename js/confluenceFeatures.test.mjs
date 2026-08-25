/**
 * Unit tests for js/confluenceFeatures.js — the at-a-touch MTF/VWAP/structural
 * context pack. Pure/synthetic: no network, no parquet.
 *   `node js/confluenceFeatures.test.mjs`
 *
 * The load-bearing tests are CAUSALITY and ORIENTATION:
 *   • no higher-timeframe reading may come from a bar that had not closed before
 *     the touch bar began (the `request.security` repaint bug manufactures edge
 *     and still renders a plausible chart — only a test catches it)
 *   • truncating the future must not change any earlier reading
 *   • every directional bucket must mean the SAME thing on an up and a dn touch,
 *     because the analyser pools both sides into one aggregate
 * Plus an equivalence test pinning `resamplePacked` to the existing `resampleTo`,
 * so the packed hot path can't silently drift from the object one.
 */
import assert from 'node:assert/strict';
import { resampleTo, resamplePacked } from './barUtils.js';
import { computeWaveTrend } from './vumanchuCore.js';
import {
  createHtfContext, createConfluenceFeatures, htfIdxAt,
  featWtMtf, featWtSlow, featMomAdx, featHtfTrend, featVwapSide, featConfluence,
  BASE_KEYS, CONFLUENCE_KEYS, CONF_DEFAULTS, HTF_MINUTES,
} from './confluenceFeatures.js';
import { analyseWindow, buildLadder } from './forecastAnalyser.js';

let passed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

// ── Synthetic M1 builders ────────────────────────────────────────────────────
const T0 = 1700000000 - (1700000000 % 86400);   // a UTC midnight

// `drift` per bar, plus a deterministic wiggle (no Math.random — reproducible).
function packedM1(nBars, { start = T0, px0 = 100, drift = 0, wiggle = 0.02 } = {}) {
  const times = new Int32Array(nBars), opens = new Float32Array(nBars);
  const highs = new Float32Array(nBars), lows = new Float32Array(nBars);
  const closes = new Float32Array(nBars), volumes = new Float32Array(nBars);
  let px = px0;
  for (let i = 0; i < nBars; i++) {
    const o = px;
    px = px + drift + wiggle * Math.sin(i / 7);
    times[i] = start + i * 60;
    opens[i] = o; closes[i] = px;
    highs[i] = Math.max(o, px) + 0.01; lows[i] = Math.min(o, px) - 0.01;
    volumes[i] = 100 + (i % 5);
  }
  return { n: nBars, times, opens, highs, lows, closes, volumes };
}
const toBars = p => Array.from({ length: p.n }, (_, i) => ({
  time: p.times[i], open: p.opens[i], high: p.highs[i], low: p.lows[i], close: p.closes[i], volume: p.volumes[i] }));

console.log('confluenceFeatures');

// ── resamplePacked ≡ resampleTo ──────────────────────────────────────────────
t('resamplePacked matches resampleTo bar-for-bar (OHLC + bucket times)', () => {
  const p = packedM1(5000);
  for (const mins of [15, 60, 240]) {
    const a = resamplePacked(p, mins);
    const b = resampleTo(toBars(p), mins);
    assert.equal(a.length, b.length, `${mins}m bar count`);
    for (let i = 0; i < a.length; i++) {
      assert.equal(a[i].time, b[i].time, `${mins}m[${i}].time`);
      for (const k of ['open', 'high', 'low', 'close']) {
        assert.ok(Math.abs(a[i][k] - b[i][k]) < 1e-9, `${mins}m[${i}].${k}`);
      }
    }
  }
});

t('resamplePacked sums tick volume into the bucket', () => {
  const p = packedM1(120);
  const h1 = resamplePacked(p, 60);
  let want = 0; for (let i = 0; i < 60; i++) want += p.volumes[i];
  assert.ok(Math.abs(h1[0].volume - want) < 1e-6);
});

t('resamplePacked handles an empty / missing series without throwing', () => {
  assert.deepEqual(resamplePacked({ n: 0, times: [], opens: [], highs: [], lows: [], closes: [] }, 60), []);
  assert.deepEqual(resamplePacked(null, 60), []);
});

// ── Causality — the load-bearing block ───────────────────────────────────────
const P = packedM1(60 * 24 * 40, { drift: 0.0008 });     // 40 days of M1
const CTX = createHtfContext(P);

t('htfIdxAt only ever returns a bar that had CLOSED before the touch bar began', () => {
  for (const tf of ['15m', '1h', '4h']) {
    const s = CTX.byTf[tf];
    for (let k = 20000; k < P.n; k += 977) {
      const t = P.times[k];
      const i = htfIdxAt(CTX, tf, t);
      if (i < 0) continue;
      const closeT = s.bars[i].time + s.mins * 60;
      assert.ok(closeT <= t, `${tf}: used a bar closing at ${closeT} for a touch at ${t}`);
      // …and it must be the LATEST such bar (no needless lag).
      const nextClose = s.bars[i + 1] ? s.bars[i + 1].time + s.mins * 60 : Infinity;
      assert.ok(nextClose > t, `${tf}: a later closed bar was available`);
    }
  }
});

t('a touch exactly ON an HTF close boundary does not use the bar closing at it', () => {
  const s = CTX.byTf['1h'];
  const i0 = 100;
  const closeT = s.bars[i0].time + 3600;           // this 1h bar closes at closeT
  const i = htfIdxAt(CTX, '1h', closeT);           // an M1 bar STARTING at closeT
  assert.ok(i <= i0, 'must not read the bar that closes at the touch minute');
});

t('truncating the future leaves every earlier reading unchanged', () => {
  const cut = 60 * 24 * 25;                         // rebuild from the first 25 days
  const half = { n: cut, times: P.times.slice(0, cut), opens: P.opens.slice(0, cut),
                 highs: P.highs.slice(0, cut), lows: P.lows.slice(0, cut),
                 closes: P.closes.slice(0, cut), volumes: P.volumes.slice(0, cut) };
  const ctx2 = createHtfContext(half);
  for (let k = 20000; k < cut - 5000; k += 1013) {
    const t = P.times[k];
    for (const tf of ['15m', '1h', '4h']) {
      const a = featWtSlow(CTX,  t, true, { ...CONF_DEFAULTS, slowTf: tf });
      const b = featWtSlow(ctx2, t, true, { ...CONF_DEFAULTS, slowTf: tf });
      assert.equal(a.bucket, b.bucket, `${tf} bucket changed when the future was removed`);
    }
  }
});

// ── Orientation — a bucket must mean the same on both sides ──────────────────
// NOTE: `wt1 > wt2` is the Cipher-B momentum CROSS, not a trend read — on a
// steadily rising series the stack is routinely rolling over at the last CLOSED
// bar. So the invariant to pin is the mirror, not a hard-coded direction: an up
// touch and a dn touch at the same instant must be exact complements, and across
// a walk the feature must actually visit both ends (a feature stuck on one
// bucket would pass a naive mirror test while carrying no information).
t('wtMtf is an exact up/dn mirror at every instant, and visits both ends', () => {
  const seen = new Set();
  for (let k = 20000; k < P.n; k += 617) {
    const t = P.times[k];
    const up = featWtMtf(CTX, t, true, CONF_DEFAULTS), dn = featWtMtf(CTX, t, false, CONF_DEFAULTS);
    if (up.bucket == null) continue;
    assert.equal(up.value + dn.value, CONF_DEFAULTS.tfs.length, `agree counts must complement at ${t}`);
    const mirror = { '3·with': '1·against', '1·against': '3·with', '2·mixed': '2·mixed' };
    assert.equal(dn.bucket, mirror[up.bucket], `bucket mirror broke at ${t}`);
    seen.add(up.bucket);
  }
  assert.ok(seen.has('3·with') && seen.has('1·against'), `feature never varied: ${[...seen]}`);
});

t('wtMtf returns no read at all when the stack is only partly warm', () => {
  const short = createHtfContext(packedM1(60 * 24 * 3));   // 3 days: 4h is cold
  const t = short.byTf['15m'].bars.at(-1).time;
  assert.equal(featWtMtf(short, t, true, CONF_DEFAULTS).bucket, null);
});

t('wtSlow / htfTrend flip bucket ends with the touch side', () => {
  const t = P.times[P.n - 1];
  const upS = featWtSlow(CTX, t, true, CONF_DEFAULTS), dnS = featWtSlow(CTX, t, false, CONF_DEFAULTS);
  assert.equal(upS.value, -dnS.value);
  const upT = featHtfTrend(CTX, t, true, CONF_DEFAULTS), dnT = featHtfTrend(CTX, t, false, CONF_DEFAULTS);
  assert.equal(upT.value, -dnT.value);
  assert.equal(upT.bucket, '3·with');            // built with a positive drift
  assert.equal(dnT.bucket, '1·against');
});

t('momAdx is undirected (same bucket either side) and bucketed monotonically', () => {
  const t = P.times[P.n - 1];
  const a = featMomAdx(CTX, t, CONF_DEFAULTS);
  assert.ok(a.value >= 0);
  // Thresholds are checked trend-first, so a range read needs BOTH raised.
  assert.equal(featMomAdx(CTX, t, { ...CONF_DEFAULTS, adxTrend: 0 }).bucket, '3·trend');
  assert.equal(featMomAdx(CTX, t, { ...CONF_DEFAULTS, adxTrend: 200, adxRange: 150 }).bucket, '1·range');
  assert.equal(featMomAdx(CTX, t, { ...CONF_DEFAULTS, adxTrend: 200, adxRange: 0 }).bucket, '2·mixed');
});

// ── VWAP ─────────────────────────────────────────────────────────────────────
t('vwapSide measures the line’s extension BEYOND vwap, symmetrically', () => {
  // Dead-flat (no drift, no wiggle) so VWAP is exactly 100 and the mirror is exact.
  const bars = toBars(packedM1(300, { drift: 0, wiggle: 0 }));
  const open = 100, sigma = 0.01;                          // 1% daily σ → 1.0 price
  const near = featVwapSide(bars, 200, 100.1, open, sigma, true, CONF_DEFAULTS);
  const far  = featVwapSide(bars, 200, 101.0, open, sigma, true, CONF_DEFAULTS);
  assert.equal(near.bucket, '3·near');
  assert.equal(far.bucket, '1·far');
  // Mirror: a dn line the same distance the other side reads identically.
  const dn = featVwapSide(bars, 200, 100 - (101.0 - 100), open, sigma, false, CONF_DEFAULTS);
  assert.ok(Math.abs(dn.value - far.value) < 0.05, `${dn.value} vs ${far.value}`);
});

t('vwapSide is causal — only bars up to the touch feed the average', () => {
  const grow = toBars(packedM1(400, { drift: 0.01, wiggle: 0 }));
  const early = featVwapSide(grow, 100, 105, 100, 0.01, true, CONF_DEFAULTS);
  const late  = featVwapSide(grow, 399, 105, 100, 0.01, true, CONF_DEFAULTS);
  assert.ok(early.value > late.value, 'vwap must catch up as the session runs');
});

// ── Structural confluence ────────────────────────────────────────────────────
t('confluence tolerance is σ-relative, and distinct sources drive the bucket', () => {
  const bars = toBars(packedM1(200, { drift: 0 }));
  const open = 100, sigma = 0.01;                 // tol = 0.10 × 0.01 × 100 = 0.10
  const level = 101;
  const one  = [{ price: 101.05, source: 'pivots' }];
  const two  = [{ price: 101.05, source: 'pivots' }, { price: 100.96, source: 'swing_sr' }];
  const none = [{ price: 101.50, source: 'pivots' }];
  assert.equal(featConfluence(bars, 50, level, open, sigma, one,  CONF_DEFAULTS).bucket, '2·single');
  assert.equal(featConfluence(bars, 50, level, open, sigma, two,  CONF_DEFAULTS).bucket, '3·multi');
  assert.equal(featConfluence(bars, 50, level, open, sigma, none, CONF_DEFAULTS).bucket, '1·none');
  // Same partner, a tenth of the σ → now outside tolerance. Scale, not pips.
  const tight = { ...CONF_DEFAULTS, confTolFrac: 0.01 };
  assert.equal(featConfluence(bars, 50, level, open, sigma, one, tight).bucket, '1·none');
});

t('confluence with no level list is a null read, not a 1·none', () => {
  const bars = toBars(packedM1(200));
  assert.equal(featConfluence(bars, 50, 101, 100, 0.01, null, CONF_DEFAULTS).bucket, null);
  assert.equal(featConfluence(bars, 50, 101, 100, 0, [{ price: 101, source: 'x' }], CONF_DEFAULTS).bucket, null);
});

// ── The pack, and its wiring into analyseWindow ──────────────────────────────
t('pack declares all 12 keys and degrades gracefully with no HTF context', () => {
  const pack = createConfluenceFeatures({ htf: null });
  assert.deepEqual(pack.KEYS, [...BASE_KEYS, ...CONFLUENCE_KEYS]);
  const bars = toBars(packedM1(300));
  const f = pack.compute({ bars, touchIdx: 200, open: 100, sigma: 0.01, side: 'up',
                           wt1: pack.wtSeries(bars), level: 100.5, pip: 0.01, confLevels: null });
  for (const k of pack.KEYS) assert.ok(k in f, `missing ${k}`);
  assert.equal(f.wtMtf.bucket, null, 'no HTF context → null MTF read');
  assert.ok(f.vwapSide.bucket, 'window-local features still compute');
});

t('analyseWindow stores the pack’s wider column set on every line row', () => {
  const pack = createConfluenceFeatures({ htf: CTX });
  const bars = toBars(packedM1(1400, { start: T0 + 86400 * 30, px0: 100, drift: 0.002 }));
  const open = bars[0].open;
  const rows = analyseWindow({ open, bars }, buildLadder(open, 0.01, 'fx'),
    { sigma: 0.01, tf: pack, pip: 0.01,
      confLevels: [{ price: open * 1.005, source: 'pivots' }, { price: open * 1.0051, source: 'swing_sr' }] });
  assert.ok(rows.length === 8, `expected 8 line rows, got ${rows.length}`);
  for (const r of rows) for (const k of pack.KEYS) assert.ok(k in r, `${r.name}_${r.side} missing ${k}`);
  const touched = rows.filter(r => r.hit && r.outcome !== 'no_intraday');
  assert.ok(touched.length, 'synthetic drift should tag at least one line');
  assert.ok(touched.some(r => r.confluence), 'confluence bucket should be populated on a touch');
  assert.ok(touched.some(r => r.wtMtf), 'MTF bucket should be populated on a touch');
});

t('analyseWindow without a pack still writes exactly the legacy six columns', () => {
  const bars = toBars(packedM1(1400, { drift: 0.002 }));
  const open = bars[0].open;
  const rows = analyseWindow({ open, bars }, buildLadder(open, 0.01, 'fx'), { sigma: 0.01, tf: null });
  for (const k of BASE_KEYS) assert.ok(k in rows[0], `missing legacy ${k}`);
  for (const k of CONFLUENCE_KEYS) assert.ok(!(k in rows[0]), `unexpected ${k} without a pack`);
});

console.log(`\n${passed} passed${process.exitCode ? ' — FAILURES ABOVE' : ''}`);
