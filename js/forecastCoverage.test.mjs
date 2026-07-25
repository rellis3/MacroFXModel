// Synthetic, no-network unit tests for forecastCoverage. σ is pinned via the
// injectable seriesFn (same DI pattern as forecastCore.nextSigma), and bars
// are CONSTRUCTED so the true coverage is exact by design — the test knows
// the right answer before the engine runs.
//
//   node js/forecastCoverage.test.mjs

import { coverageFromBars, coverageStats } from './forecastCoverage.js';
import { computeBands } from './forecastCore.js';

let failures = 0;
const ok   = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

console.log('[coverageStats]');
{
  const s = coverageStats(75, 100, 0.75);
  ok('exact nominal → z = 0', near(s.z, 0) && near(s.cov, 0.75));
  // Hand calc: 60/100 vs 0.75 → SE = √(0.75·0.25/100) = 0.0433; z = −0.15/0.0433 = −3.4641.
  const s2 = coverageStats(60, 100, 0.75);
  ok('miss matches hand calc (z = −3.4641)', near(s2.z, -0.15 / Math.sqrt(0.1875 / 100), 1e-12), `z=${s2.z.toFixed(4)}`);
  ok('n = 0 → NaNs, not a throw', Number.isNaN(coverageStats(0, 0, 0.5).cov));
}

// ── Constructed bars: coverage is exact by design ────────────────────────────
// Pinned σ = 0.01, fx. Day cycle of 4 (ranges relative to the pinned bands):
//   1: 0.9·hl50   (inside both)          2: 0.5·hl50 (inside both)
//   3: mid(hl50, hl75) (hl75 only)       4: 1.5·hl75 (outside both)
// ⇒ hl50 coverage = 2/4 = 50%, hl75 = 3/4 = 75%, exactly. Same construction
// for |close−open| vs ocMed/oc75. Every bar: open = 1, low = open,
// high = open·(1+rangeFrac), close = open·(1+ocFrac)  (ocFrac < rangeFrac
// per-day, asserted below, so the bars are geometrically valid).
const SIGMA = 0.01, CLASS = 'fx', WARMUP = 10, CYCLES = 20;
const f = computeBands(1, SIGMA, CLASS);
const rangeCycle = [0.9 * f.hl50, 0.5 * f.hl50, (f.hl50 + f.hl75) / 2, 1.5 * f.hl75];
const ocCycle    = [0.9 * f.ocMed, 0.5 * f.ocMed, (f.ocMed + f.oc75) / 2, 1.5 * f.oc75];
const bars = [];
for (let i = 0; i < WARMUP + 4 * CYCLES; i++) {
  const k = i < WARMUP ? 0 : (i - WARMUP) % 4;
  const rangeFrac = rangeCycle[k], ocFrac = ocCycle[k];
  const open = 1, high = open * (1 + rangeFrac), low = open, close = open * (1 + ocFrac);
  // Warmup days live in 2019; the 80 SCORED days split into two aligned
  // years of 40 (= 10 whole cycles each), so per-year coverage is exact too.
  const y = i < WARMUP ? 2019 : 2020 + Math.floor((i - WARMUP) / 40);
  bars.push({ date: `${y}-01-${String(100 + (i % 40)).slice(1)}`, open, high, low, close });
}
const pinnedSigma = (bs) => new Float64Array(bs.length).fill(SIGMA);

console.log('\n[coverageFromBars — exact-by-construction]');
{
  ok('construction valid: ocFrac < rangeFrac each day', ocCycle.every((o, i) => o < rangeCycle[i]));
  const r = coverageFromBars(bars, CLASS, { warmup: WARMUP, rollWindow: 40, seriesFn: pinnedSigma });
  ok('n = bars − warmup', r.n === 4 * CYCLES, `n=${r.n}`);
  ok('hl50 coverage exactly 50%', near(r.bands.hl50.cov, 0.50), `=${r.bands.hl50.cov}`);
  ok('hl75 coverage exactly 75%', near(r.bands.hl75.cov, 0.75), `=${r.bands.hl75.cov}`);
  ok('ocMed coverage exactly 50%', near(r.bands.ocMed.cov, 0.50));
  ok('oc75 coverage exactly 75%', near(r.bands.oc75.cov, 0.75));
  ok('z ≈ 0 when calibration is perfect', Math.abs(r.bands.hl75.z) < 1e-9);
  ok('sample size travels with every claim', [r.bands.hl50, r.bands.hl75].every(b => b.n === r.n));

  // Per-year split: both constructed years hold the same exact 75%.
  ok('perYear has both years', r.perYear.length === 2 && r.perYear[0].year === '2020');
  ok('per-year hl75 = 75% in each year', r.perYear.every(y => near(y.hl75.cov, 0.75)), r.perYear.map(y => `${y.year}:${y.hl75.cov}`).join(' '));

  // Rolling window (40 = 10 full cycles) → flat 75% trace.
  ok('rolling emits n − window + 1 points', r.rolling.length === r.n - 40 + 1);
  ok('rolling hl75 flat at 75%', r.rolling.every(p => near(p.cov, 0.75)));

  // Tail severity: the only hl75 breaks are the day-4s at exactly +50%.
  ok('tail75 counts exactly the day-4 breaks', r.tail75.nExc === CYCLES && near(r.tail75.excFrac, 0.25));
  ok('tail75 mean excess exactly 0.5', near(r.tail75.meanExcess, 0.5), `=${r.tail75.meanExcess}`);
  ok('GPD on a degenerate (all-equal) tail stays null/harmless', r.tail75.gpd === null || Number.isFinite(r.tail75.gpd.xi));

  // Ratio medians: cycle ratios r/hl50 = {0.9, 0.5, mid, 1.5·hl75/hl50} —
  // median = mean of 2nd/3rd order stats = (0.9 + mid)/2.
  const mid = (f.hl50 + f.hl75) / 2 / f.hl50;
  ok('ratioMedian50 matches hand calc', near(r.ratioMedian50, (0.9 + mid) / 2, 1e-12), `=${r.ratioMedian50.toFixed(4)}`);
  ok('ratioMedian75 < 1 (hl75 wider than the median day)', r.ratioMedian75 < 1);
}

console.log('\n[no-lookahead / plumbing]');
{
  // Bands for day i must use σ[i] — pin a σ series that CHANGES at a known
  // index and check the coverage flips with it, past-only.
  const twoSigma = (bs) => { const s = new Float64Array(bs.length).fill(SIGMA); for (let i = 50; i < bs.length; i++) s[i] = SIGMA * 10; return s; };
  const r2 = coverageFromBars(bars, CLASS, { warmup: WARMUP, rollWindow: 40, seriesFn: twoSigma });
  // With 10× σ from index 50 on, every band is huge → coverage 100% there,
  // so the pooled hl75 coverage must exceed the calibrated 75%.
  ok('σ regime change propagates to the bands', r2.bands.hl75.cov > 0.75, `=${r2.bands.hl75.cov.toFixed(3)}`);
  // Degenerate inputs never throw.
  const empty = coverageFromBars([], CLASS, { seriesFn: pinnedSigma });
  ok('empty bars → n = 0, no throw', empty.n === 0 && empty.firstDate === null);
  // Real volSigmaSeries path runs end-to-end on a synthetic walk (no network).
  const walk = [];
  let px = 1.1;
  for (let i = 0; i < 400; i++) {
    const drift = 0.004 * Math.sin(i / 9);
    const o = px, c = px * (1 + drift), hi = Math.max(o, c) * 1.003, lo = Math.min(o, c) * 0.997;
    walk.push({ date: `2023-01-${String(100 + (i % 90)).slice(1)}`, open: o, high: hi, low: lo, close: c });
    px = c;
  }
  const rw = coverageFromBars(walk, 'fx');
  ok('default volSigmaSeries path runs, coverage ∈ [0,1]', rw.n > 200 && rw.bands.hl75.cov >= 0 && rw.bands.hl75.cov <= 1, `n=${rw.n} cov75=${rw.bands.hl75.cov.toFixed(3)}`);
}

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
