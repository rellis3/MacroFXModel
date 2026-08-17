import { loadM1ForPair } from '/home/user/MacroFXModel/js/volBacktestM1Engine.js';
import { resampleBars } from '/home/user/MacroFXModel/js/patternEngine.js';
import { findImpulseRetracements, kmeans1D, histogram } from '/home/user/MacroFXModel/js/impulseRetracementGeometry.js';
import fs from 'fs';

const pair = process.argv[2];                 // 'gold' | 'nq'
const m1Dir = process.argv[3] || undefined;
const outDir = process.argv[4];
const RESAMPLE_MIN = process.argv[5] ? Number(process.argv[5]) : 5;   // M5 default — matches the multi-candle "zone" span visible in the screenshots; pass arg 5 to override (e.g. 1 for native M1)

const packed = m1Dir ? await loadM1ForPair(pair, m1Dir) : await loadM1ForPair(pair);
if (!packed) { process.stderr.write(`${pair}: no data\n`); process.exit(2); }

const t0 = Date.now();
const bars = resampleBars(packed, RESAMPLE_MIN);
process.stderr.write(`${pair}: ${bars.length} M${RESAMPLE_MIN} bars from ${packed.n} M1 (resample ${Date.now()-t0}ms)\n`);

const t1 = Date.now();
const occ = findImpulseRetracements(bars, {});
process.stderr.write(`${pair}: ${occ.length} impulsive legs found (>=2x ATR) in ${Date.now()-t1}ms\n`);

const byOutcome = { continued: 0, invalidated: 0, timeout: 0 };
for (const o of occ) byOutcome[o.outcome]++;

const continued = occ.filter(o => o.outcome === 'continued');
const fracs = continued.map(o => o.retraceFrac);

// Size buckets on legAtrMult (impulse size relative to ATR) — does a BIGGER
// impulse retrace to a different depth than a small one?
const sizeBuckets = [
  { label: '2.0-3.0x ATR', test: o => o.legAtrMult >= 2.0 && o.legAtrMult < 3.0 },
  { label: '3.0-5.0x ATR', test: o => o.legAtrMult >= 3.0 && o.legAtrMult < 5.0 },
  { label: '5.0x+ ATR',    test: o => o.legAtrMult >= 5.0 },
];
const bySize = sizeBuckets.map(b => {
  const xs = continued.filter(b.test).map(o => o.retraceFrac);
  xs.sort((a, c) => a - c);
  const median = xs.length ? xs[Math.floor(xs.length / 2)] : null;
  const mean = xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
  return { label: b.label, n: xs.length, median, mean };
});

// EMA agreement at the turn: does the fast/slow EMA already agree with the
// leg's own direction right at the turning point (i.e. would an EMA-cross
// filter have been "green" exactly when price actually turned)?
const emaAgree = continued.filter(o => o.emaAgreeAtTurn).length;
const emaAgreeFrac = continued.length ? emaAgree / continued.length : null;
// ...and does emaAgree correlate with a SHALLOWER or DEEPER retracement?
const agreeXs = continued.filter(o => o.emaAgreeAtTurn).map(o => o.retraceFrac);
const disagreeXs = continued.filter(o => !o.emaAgreeAtTurn).map(o => o.retraceFrac);
const meanOf = xs => xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;

const { centroids, counts } = kmeans1D(fracs, 3);
const hist = histogram(fracs, 0.05, 0, 1.2);   // allow slightly >1 (overshoot past origin before "continued" still counted if resumed fires first)

// ── Regression: does impulse SIZE predict retracement DEPTH? ────────────────
// x = log(legAtrMult) (the relationship saturates — see bySize above — so a
// log-x fit is the honest functional form, not a raw-x line through a curve).
// Plain OLS + Pearson r, computed once here (not worth a shared brick for a
// single bivariate scatter fit).
function olsWithR(xs, ys) {
  const n = xs.length;
  if (n < 2) return { slope: null, intercept: null, r: null, n };
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  const slope = sxx > 1e-12 ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  const r = (sxx > 1e-12 && syy > 1e-12) ? sxy / Math.sqrt(sxx * syy) : null;
  return { slope, intercept, r, n };
}
const logSizes = continued.map(o => Math.log(o.legAtrMult));
const regression = olsWithR(logSizes, fracs);   // retraceFrac ≈ intercept + slope*ln(legAtrMult)

// Compact 2D density (legAtrMult × retraceFrac) for a chart scatter/heatmap —
// small enough to commit (unlike the full per-leg occurrences dump).
const sizeBins = 24, sizeMin = 2.0, sizeMax = 8.0;      // ATR multiples 2..8, clipped
const fracBins = 24, fracMinV = 0, fracMaxV = 1.2;
const density = Array.from({ length: sizeBins }, () => new Array(fracBins).fill(0));
for (const o of continued) {
  const sx = Math.min(sizeBins - 1, Math.max(0, Math.floor((Math.min(o.legAtrMult, sizeMax) - sizeMin) / (sizeMax - sizeMin) * sizeBins)));
  const fy = Math.min(fracBins - 1, Math.max(0, Math.floor((Math.min(o.retraceFrac, fracMaxV) - fracMinV) / (fracMaxV - fracMinV) * fracBins)));
  density[sx][fy]++;
}

const summary = {
  pair, resampleMin: RESAMPLE_MIN,
  totalLegs: occ.length, byOutcome,
  continuedN: continued.length,
  retraceFrac: {
    mean: meanOf(fracs),
    median: fracs.slice().sort((a, b) => a - b)[Math.floor(fracs.length / 2)],
    p25: fracs.slice().sort((a, b) => a - b)[Math.floor(fracs.length * 0.25)],
    p75: fracs.slice().sort((a, b) => a - b)[Math.floor(fracs.length * 0.75)],
  },
  kmeans3: { centroids, counts },
  bySize,
  emaAgreeAtTurnFrac: emaAgreeFrac,
  meanRetraceWhenEmaAgrees: meanOf(agreeXs),
  meanRetraceWhenEmaDisagrees: meanOf(disagreeXs),
  histogram: hist,
  sizeVsDepthRegression: { ...regression, form: 'retraceFrac ≈ intercept + slope × ln(legAtrMult)' },
  density2d: { sizeBins, sizeMin, sizeMax, fracBins, fracMin: fracMinV, fracMax: fracMaxV, counts: density },
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/${pair}.geometry.json`, JSON.stringify(summary, null, 2));
fs.writeFileSync(`${outDir}/${pair}.occurrences.json`, JSON.stringify(occ));
process.stderr.write(`${pair}: DONE. legs=${occ.length} continued=${continued.length} median retrace=${summary.retraceFrac.median?.toFixed(3)} kmeans centroids=${centroids.map(c=>c.toFixed(3))} counts=${counts} regression r=${regression.r?.toFixed(3)} slope=${regression.slope?.toFixed(3)}\n`);
