/**
 * HAR-IV unit tests — pure, synthetic, no network. Validates the new estimator:
 *  1. solveN recovers a known linear fit (matches solve4 on a 4×4).
 *  2. ivVarSeries: annualised IV% → daily variance, NaN-safe.
 *  3. When IV carries genuine forward info about RV, HAR-IV beats HAR-RV on
 *     matched OOS QLIKE.
 *  4. When IV is pure noise, HAR-IV does NOT materially beat HAR-RV (no free lunch).
 *  5. Partial IV coverage (history starts late) → HAR-IV only forecasts on the
 *     covered span; the matched comparison uses the common set.
 */
import assert from 'node:assert';
import {
  harIvPred, harRvPred, ivVarSeries, scoreOnIndices, solveN, solve4, runBench, IV_INDEX_BY_INSTRUMENT,
} from './volForecastBench.js';

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };

// deterministic RNG
function rng(seed) { let s = seed; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; }

// ── 1. solveN vs solve4 on a 4×4 ─────────────────────────────────────────────
{
  // build X'X, X'y for a known beta on random design
  const r = rng(3); const N = 200, beta = [0.4, 0.3, 0.2, 0.1];
  const XtX = Array.from({ length: 4 }, () => new Float64Array(4)); const Xty = new Float64Array(4);
  for (let t = 0; t < N; t++) {
    const x = [1, r(), r(), r()]; const y = beta.reduce((s, b, i) => s + b * x[i], 0);
    for (let a = 0; a < 4; a++) { Xty[a] += x[a] * y; for (let b = 0; b < 4; b++) XtX[a][b] += x[a] * x[b]; }
  }
  const b4 = solve4(XtX, Xty), bN = solveN(XtX, Xty, 4);
  ok(b4.every((v, i) => Math.abs(v - bN[i]) < 1e-9), 'solveN matches solve4 on 4×4');
  ok(bN.every((v, i) => Math.abs(v - beta[i]) < 1e-6), 'solveN recovers the planted beta');
}

// ── 2. ivVarSeries conversion ────────────────────────────────────────────────
{
  const iv = ivVarSeries([15.87, NaN, 0, 25.0]);   // GVZ ~15.87% annualised
  const expect0 = ((15.87 / 100) / Math.sqrt(252)) ** 2;
  ok(Math.abs(iv[0] - expect0) < 1e-18, 'annualised IV% → daily variance');
  ok(Number.isNaN(iv[1]) && Number.isNaN(iv[2]), 'NaN/zero IV → NaN (dropped)');
  ok(iv[3] > iv[0], 'higher IV → higher daily variance');
}

// ── synthetic RV with an IV that leads it (regime the options market "knows") ──
// rv_t = base regime var; iv_t (annualised %) is a noisy read of NEXT day's regime,
// so iv at t-1 genuinely informs rv_t beyond rv's own lags.
function makeSeries({ n = 1500, ivInformative = true, ivStart = 0, seed = 11 }) {
  const r = rng(seed);
  const rv = new Float64Array(n); const ivPct = new Array(n).fill(NaN);
  let regime = 1.0e-4;
  const regimeArr = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    if (r() < 0.03) regime = (0.5 + 2 * r()) * 1.0e-4;    // occasional regime shift
    regimeArr[t] = regime;
    rv[t] = Math.max(regime * (0.6 + 0.8 * r()), 1e-9);   // noisy realized var around the regime
  }
  for (let t = 0; t < n; t++) {
    if (t < ivStart) continue;
    // IV (annualised %) reflects the CURRENT+NEXT regime (forward-looking) if informative,
    // else pure noise. daily σ = √regime ; annualised % = σ·√252·100.
    const fwd = ivInformative ? regimeArr[Math.min(t + 1, n - 1)] : (0.5 + 2 * r()) * 1.0e-4;
    const sig = Math.sqrt(Math.max(fwd, 1e-12)) * (0.9 + 0.2 * r());
    ivPct[t] = sig * Math.sqrt(252) * 100;
  }
  return { rv, ivVar: ivVarSeries(ivPct) };
}

function matchedOOS(rv, ivVar) {
  const pIV = harIvPred(rv, ivVar), pRV = harRvPred(rv);
  const common = [];
  for (let i = 0; i < rv.length; i++)
    if (Number.isFinite(pIV[i]) && pIV[i] > 0 && Number.isFinite(pRV[i]) && pRV[i] > 0) common.push(i);
  return {
    n: common.length,
    iv: scoreOnIndices(pIV, rv, common).oos.qlike,
    rv: scoreOnIndices(pRV, rv, common).oos.qlike,
  };
}

// ── 3. informative IV → HAR-IV beats HAR-RV on matched OOS QLIKE ──────────────
{
  const { rv, ivVar } = makeSeries({ ivInformative: true });
  const m = matchedOOS(rv, ivVar);
  ok(m.n > 300, 'informative: enough common obs');
  ok(m.iv < m.rv, `informative IV beats HAR-RV OOS (iv ${m.iv.toFixed(4)} < rv ${m.rv.toFixed(4)})`);
}

// ── 4. noise IV → HAR-IV does NOT materially beat HAR-RV ──────────────────────
{
  const { rv, ivVar } = makeSeries({ ivInformative: false });
  const m = matchedOOS(rv, ivVar);
  ok(m.iv >= m.rv * 0.995, `noise IV gives no real edge (iv ${m.iv.toFixed(4)} ≳ rv ${m.rv.toFixed(4)})`);
}

// ── 5. partial IV coverage: HAR-IV only forecasts on the covered span ─────────
{
  const n = 1500, ivStart = 900;
  const { rv, ivVar } = makeSeries({ n, ivInformative: true, ivStart });
  const pIV = harIvPred(rv, ivVar);
  let firstFinite = -1;
  for (let i = 0; i < n; i++) if (Number.isFinite(pIV[i])) { firstFinite = i; break; }
  ok(firstFinite >= ivStart, `HAR-IV forecasts only after IV coverage begins (first ${firstFinite} ≥ ${ivStart})`);
  ok(pIV.slice(0, ivStart).every((v) => Number.isNaN(v)), 'no HAR-IV forecast before IV history');
}

// ── 6. runBench wires ivVar → matched block present + graceful without it ─────
{
  const { rv, ivVar } = makeSeries({ ivInformative: true });
  // synth bars: runBench needs bars for the other estimators; build minimal OHLC from rv
  const n = rv.length; const bars = []; let px = 100;
  for (let i = 0; i < n; i++) {
    const s = Math.sqrt(rv[i]); const o = px; const c = px * (1 + (i % 2 ? s : -s) * 0.3);
    const hi = Math.max(o, c) * (1 + s * 0.2), lo = Math.min(o, c) * (1 - s * 0.2);
    bars.push({ open: o, high: hi, low: lo, close: c, time: i * 86400 }); px = c;
  }
  const withIV = runBench(bars, 'commodity', { ivVar });
  ok(withIV.matched && withIV.matched.nCommon > 0, 'runBench returns matched block when ivVar present');
  ok(typeof withIV.matched.ivBeatsRvOos === 'boolean', 'matched reports ivBeatsRvOos verdict');
  ok(withIV.estimators.some((e) => e.key === 'harIV'), 'harIV listed & scored when ivVar present');
  const noIV = runBench(bars, 'commodity', {});
  ok(noIV.matched === null, 'runBench matched=null without ivVar (graceful)');
  ok(!noIV.estimators.some((e) => e.key === 'harIV'), 'harIV excluded from default run without ivVar (IV-gated)');
}

// ── 6b. the REAL NQ pathology: OLS predicts ≤0 variance → floor must bound QLIKE ──
// Scaling can't fix this (OLS is scale-equivariant — it genuinely wants negative).
// Build an IV that ANTI-correlates with RV in-sample (→ negative IV coefficient), then
// spike IV out-of-sample so the fit extrapolates to negative predicted variance. The
// floor (1% of median RV) must catch it: every forecast stays a sane variance and OOS
// QLIKE stays finite/bounded instead of the 7.5e5 blow-up.
{
  const r = rng(29); const n = 1400; const rv = new Float64Array(n); const ivVar = new Float64Array(n).fill(NaN);
  const med = 1.5e-4;
  for (let t = 0; t < n; t++) rv[t] = Math.max(med * (0.4 + 1.2 * r()), 1e-9);   // NQ-scale RV
  // IV daily-variance anti-correlated with RV in-sample (high IV where RV is low)
  for (let t = 0; t < n; t++) ivVar[t] = Math.max(med * (1.6 - (rv[t] / med)) + med * 0.1 * r(), 1e-9);
  const cut = Math.floor(n * 0.6);
  for (let t = cut; t < n; t++) if (r() < 0.05) ivVar[t] *= 12;                    // OOS IV spikes → OLS extrapolates negative
  const pIV = harIvPred(rv, ivVar);
  const finite = [...pIV].filter((v) => Number.isFinite(v));
  const floor = med * 0.01;
  ok(finite.length > 400, 'pathology: HAR-IV still produces forecasts');
  ok(finite.every((v) => v >= floor * 0.999), 'pathology: every forecast floored ≥ 1% median RV (never ~0)');
  const m = matchedOOS(rv, ivVar);
  ok(Number.isFinite(m.iv) && m.iv < 1e4, `pathology: OOS QLIKE bounded (${m.iv.toFixed(1)}), not 7.5e5`);
}

// ── 7. IV index map covers the ranked classes ────────────────────────────────
ok(IV_INDEX_BY_INSTRUMENT.GOLD === 'GVZCLS' && IV_INDEX_BY_INSTRUMENT.NQ === 'VXNCLS' &&
   IV_INDEX_BY_INSTRUMENT.EURUSD === 'EVZCLS' && IV_INDEX_BY_INSTRUMENT.WTI === 'OVXCLS',
   'IV index map: gold/nasdaq/eurusd/oil wired');

console.log(`volForecastBench HAR-IV: ${passed} assertions passed`);
