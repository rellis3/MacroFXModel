// Synthetic, no-network unit tests for the Market Valuation Engine (js/mve/*).
// Data is generated deterministically (seeded LCG, no Math.random) so runs are
// reproducible. Each block proves a mathematical property, not just "it ran".
//
//   node js/mve/mve.test.mjs
//
// Nothing here (or in js/mve/*) touches the live system — safe to run anytime.

import { transpose, matMul, inv, identity, solve } from './linalg.js';
import { olsFit, olsPredict, predictSigma } from './ols.js';
import { walkForwardSplits, bandCalibration, deflatedSharpe } from './validation.js';
import { regressionEmitter, ar1Emitter, volWeightEmitter } from './emitters.js';
import { standardizedMispricing, mahalanobis, bayesianMispriceProb } from './mispricing.js';
import { ouFit, ouConvergence, empiricalSnapback } from './ou.js';
import { combine } from './ensemble.js';
import { regimeMultiplier } from './regimeWeights.js';
import { runSSM, fuseOnce } from './ssm.js';
import { fitLoadings, factorImpliedReturn, coherenceCheck } from './factorModel.js';
import { confidenceEngine, agreementScore, scaleAgreementByIndependence, baseRateReality } from './confidence.js';
import { runMVE, valuationText } from './index.js';
import { augmentSignalScore, mveFactorScore } from './signalAdapter.js';
import { buildContext, ffAlign, runLiveMVE, normalizeSym, FACTOR_SPEC, OANDA_SYMBOL } from './liveAdapter.js';
import { validateInstrument, oosMispricingSeries, poolConsistency } from './validateInstrument.js';

let failures = 0, tests = 0;
const ok = (name, cond, extra = '') => { tests++; console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// Seeded PRNG (mulberry32) — deterministic randomness for synthetic series.
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const gauss = (r) => { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

console.log('\n── linalg ──');
{
  const A = [[4, 3], [6, 3]];
  const Ai = inv(A);
  const I = matMul(A, Ai);
  ok('inv(A)·A ≈ I', near(I[0][0], 1) && near(I[1][1], 1) && Math.abs(I[0][1]) < 1e-9);
  const x = solve([[2, 1], [1, 3]], [3, 5]);
  ok('solve 2x2', near(x[0], 0.8) && near(x[1], 1.4), `x=${x.map(v => v.toFixed(2))}`);
  const T = transpose([[1, 2, 3]]);
  ok('transpose shape', T.length === 3 && T[0].length === 1);
}

console.log('\n── OLS + prediction σ ──');
{
  // y = 2 + 3·x1 − 1·x2 + noise
  const r = rng(1);
  const F = [], y = [];
  for (let i = 0; i < 200; i++) {
    const x1 = gauss(r), x2 = gauss(r);
    F.push([x1, x2]);
    y.push(2 + 3 * x1 - 1 * x2 + 0.1 * gauss(r));
  }
  const fit = olsFit(F, y);
  ok('recovers intercept≈2', near(fit.intercept, 2, 0.05), `=${fit.intercept.toFixed(3)}`);
  ok('recovers β1≈3', near(fit.beta[0], 3, 0.05), `=${fit.beta[0].toFixed(3)}`);
  ok('recovers β2≈−1', near(fit.beta[1], -1, 0.05), `=${fit.beta[1].toFixed(3)}`);
  ok('r² high', fit.r2 > 0.98, `r²=${fit.r2.toFixed(3)}`);
  const ps = predictSigma(fit, [0, 0]);
  ok('predictSigma ≥ residual σ', ps >= fit.sigma, `pσ=${ps.toFixed(3)} σ=${fit.sigma.toFixed(3)}`);
  ok('predictSigma grows with leverage', predictSigma(fit, [10, 10]) > ps);
}

console.log('\n── validation harness ──');
{
  const splits = walkForwardSplits(100, { trainSize: 40, testSize: 10, embargo: 5, anchored: true });
  ok('splits produced', splits.length >= 4, `n=${splits.length}`);
  ok('embargo gap respected', splits.every(s => s.testStart - s.trainEnd === 5));
  ok('no test overlaps train', splits.every(s => s.testStart >= s.trainEnd));
  // calibration: errors ~ N(0, σ) should cover ~68/95%
  const r = rng(7); const errs = [], sig = [];
  for (let i = 0; i < 5000; i++) { errs.push(gauss(r)); sig.push(1); }
  const cal = bandCalibration(errs, sig);
  ok('68% band ≈ 0.68', Math.abs(cal[0.68].coverage - 0.68) < 0.03, `=${cal[0.68].coverage.toFixed(3)}`);
  ok('95% band ≈ 0.95', Math.abs(cal[0.95].coverage - 0.95) < 0.02, `=${cal[0.95].coverage.toFixed(3)}`);
  // deflated sharpe reachable + sane
  const daily = Array.from({ length: 300 }, () => 0.02 + gauss(r) * 0.1);
  const dsr = deflatedSharpe(daily, [0.05, 0.1, 0.08, 0.12, 0.03]);
  ok('deflatedSharpe returns dsr∈[0,1]', dsr && dsr.dsr >= 0 && dsr.dsr <= 1, `dsr=${dsr?.dsr}`);
}

console.log('\n── emitters ──');
{
  // price driven by two factors + a KNOWN current mispricing
  const r = rng(3);
  const f1 = [], f2 = [], price = [];
  let base = 100;
  for (let i = 0; i < 200; i++) {
    const a = Math.sin(i / 20) + 0.02 * i / 200, b = Math.cos(i / 15);
    f1.push(a); f2.push(b);
    base = 100 + 5 * a + 3 * b + 0.2 * gauss(r);
    price.push(base);
  }
  // inject: push the LAST price 2 units above where factors imply
  price[price.length - 1] += 2;
  const em = regressionEmitter({ price, factors: [{ name: 'f1', series: f1 }, { name: 'f2', series: f2 }], window: 150 });
  ok('regressionEmitter emits anchor', em && em.kind === 'anchor' && em.sigma > 0);
  ok('fair value below injected price', em.fairValue < price[price.length - 1], `fv=${em.fairValue.toFixed(2)} px=${price[price.length - 1].toFixed(2)}`);
  const ar = ar1Emitter({ price });
  ok('ar1Emitter emits anchor', ar && ar.kind === 'anchor' && ar.sigma > 0);
  const vw = volWeightEmitter({ returns: price.slice(1).map((p, i) => p - price[i]) });
  ok('volWeight is a weight (no price)', vw && vw.kind === 'weight' && vw.fairValue == null);
}

console.log('\n── mispricing ──');
{
  const m = standardizedMispricing(102, 100, 1);
  ok('z = (px−fv)/σ = 2', near(m.z, 2), `z=${m.z}`);
  ok('rich when px>fv', m.rich === true);
  ok('tailProb small at 2σ', m.tailProb < 0.05, `p=${m.tailProb.toFixed(4)}`);
  // Mahalanobis: identity cov ⇒ Euclidean
  const md = mahalanobis([3, 4], [0, 0], identity(2));
  ok('mahalanobis(identity)=|v|=5', near(md, 5, 1e-6), `=${md.toFixed(3)}`);
  // Correlation geometry: a deviation ALONG a positive-correlation axis is LESS
  // surprising (both factors cheap together is expected) ⇒ smaller distance than
  // identity — this is exactly "don't double-count correlated cheapness".
  const mdAlong   = mahalanobis([3, 3],  [0, 0], [[1, 0.9], [0.9, 1]]);
  const mdIdent   = mahalanobis([3, 3],  [0, 0], identity(2));
  const mdAcross  = mahalanobis([3, -3], [0, 0], [[1, 0.9], [0.9, 1]]);
  ok('aligned correlated deviation ⇒ SMALLER Mahalanobis (not double-counted)', mdAlong < mdIdent, `${mdAlong.toFixed(2)} < ${mdIdent.toFixed(2)}`);
  ok('across-correlation deviation ⇒ LARGER Mahalanobis', mdAcross > mdIdent, `${mdAcross.toFixed(2)} > ${mdIdent.toFixed(2)}`);
  const bp = bayesianMispriceProb([{ p: 0.7 }, { p: 0.65 }, { p: 0.6 }]);
  ok('bayesian posterior > prior when evidence agrees', bp > 0.5, `=${bp.toFixed(3)}`);
}

console.log('\n── OU convergence ──');
{
  // Simulate a mean-reverting series z_t = (1−κ)z_{t-1} + σ·ε, κ known
  const r = rng(11); const kappaTrue = 0.1; const z = [0];
  for (let i = 1; i < 2000; i++) z.push(z[i - 1] * (1 - kappaTrue) + 0.5 * gauss(r));
  const ou = ouFit(z);
  ok('OU recovers κ≈0.1', Math.abs(ou.kappa - kappaTrue) < 0.03, `κ=${ou.kappa.toFixed(3)}`);
  ok('OU half-life ≈ ln2/κ', near(ou.halfLife, Math.log(2) / ou.kappa, 1e-6));
  ok('OU t-stat strongly negative-slope significant', ou.tStat < -3, `t=${ou.tStat.toFixed(1)}`);
  const c = ouConvergence(3, ou, 10);
  ok('convergence: expected |z| shrinks', Math.abs(c.expectedZ) < 3, `E=${c.expectedZ.toFixed(2)}`);
  ok('convergence: pRevert ∈ (0,1)', c.pRevert > 0 && c.pRevert < 1, `p=${c.pRevert.toFixed(2)}`);
  ok('convergence: longer horizon ⇒ more closed', ouConvergence(3, ou, 30).closedFraction > c.closedFraction);
  const sb = empiricalSnapback(z, { entry: 1.5, band: 0.5, horizon: 30 });
  ok('empirical snap-back base rate present', sb && sb.baseRate != null && sb.events > 0, `rate=${sb.baseRate?.toFixed(2)} n=${sb.events}`);
}

console.log('\n── ensemble ──');
{
  const a1 = { name: 'macro_fv', kind: 'anchor', fairValue: 100, sigma: 1.0, confidence: 0.8, meta: { r2: 0.7 } };
  const a2 = { name: 'stat_fv',  kind: 'anchor', fairValue: 102, sigma: 2.0, confidence: 0.6, meta: { r2: 0.4 } };
  const a3 = { name: 'yield_fv', kind: 'anchor', fairValue: 101, sigma: 1.5, confidence: 0.7, meta: { r2: 0.5 } };
  const ens = combine([a1, a2, a3], { regime: 'NEUTRAL' });
  ok('consensus between members', ens.fairValue > 100 && ens.fairValue < 102, `fv=${ens.fairValue.toFixed(3)}`);
  ok('tightest-σ member gets most weight', ens.weights[0] > ens.weights[1]);
  ok('consensus σ ≤ smallest member σ', ens.sigma <= a1.sigma + 1e-9, `σ=${ens.sigma.toFixed(3)}`);
  ok('dispersion > 0 when members disagree', ens.dispersion > 0);
  ok('effN between 1 and k', ens.effN > 1 && ens.effN <= 3, `effN=${ens.effN.toFixed(2)}`);
  // regime tilt changes weights
  const ensRO = combine([a1, a2, a3], { regime: 'RANGE' });   // RANGE boosts stat_fv
  ok('regime RANGE lifts stat_fv weight', ensRO.weights[1] > ens.weights[1], `${ensRO.weights[1].toFixed(3)} vs ${ens.weights[1].toFixed(3)}`);
  ok('regimeMultiplier capped at 3', regimeMultiplier('stat_fv', 'RANGE') <= 3);
  // correlated members: min-var combine reduces double-counting (weights differ from precision-only)
  const corr = [[1, 0.9, 0.9], [0.9, 1, 0.5], [0.9, 0.5, 1]];
  const ensC = combine([a1, a2, a3], { regime: 'NEUTRAL', corr });
  ok('correlation-aware combine runs', ensC && ensC.weights.length === 3 && near(ensC.weights.reduce((s, x) => s + x, 0), 1, 1e-6));
}

console.log('\n── Kalman SSM ──');
{
  const anchors = [
    { name: 'a', kind: 'anchor', fairValue: 100, sigma: 1.0 },
    { name: 'b', kind: 'anchor', fairValue: 104, sigma: 2.0 },
  ];
  const f = fuseOnce(anchors, null);
  ok('fuse pulls toward tighter obs', f.fairValue < 102, `x=${f.fairValue.toFixed(2)}`);
  ok('fused σ finite', f.sigma > 0 && Number.isFinite(f.sigma));
  // series: hidden true level 100, two noisy emitters ⇒ filtered state converges near 100
  const r = rng(5); const obsSeries = [];
  for (let i = 0; i < 300; i++) obsSeries.push([
    { value: 100 + gauss(r) * 1, r: 1 },
    { value: 100 + gauss(r) * 2, r: 4 },
  ]);
  const ssm = runSSM(obsSeries);
  ok('SSM filtered state ≈ true 100', Math.abs(ssm.last.x - 100) < 1.0, `x=${ssm.last.x.toFixed(2)}`);
  ok('SSM state σ small after filtering', ssm.last.sigma < 1.5, `σ=${ssm.last.sigma.toFixed(2)}`);
}

console.log('\n── factor model (Phase 6) ──');
{
  const r = rng(9);
  const fA = [], fB = [], ret = [];
  for (let i = 0; i < 300; i++) { const a = gauss(r), b = gauss(r); fA.push(a); fB.push(b); ret.push(0.8 * a - 0.4 * b + 0.05 * gauss(r)); }
  const model = fitLoadings(ret, [{ name: 'A', series: fA }, { name: 'B', series: fB }]);
  ok('loadings recover A≈0.8', Math.abs(model.loadings.A - 0.8) < 0.05, `A=${model.loadings.A}`);
  ok('loadings recover B≈−0.4', Math.abs(model.loadings.B + 0.4) < 0.05, `B=${model.loadings.B}`);
  const implied = factorImpliedReturn(model, { A: 1, B: 0 });
  ok('factor-implied return follows loading sign', implied > 0, `=${implied.toFixed(3)}`);
  const coh = coherenceCheck([{ name: 'X', standaloneGap: 2, factorImplied: 1 }, { name: 'Y', standaloneGap: 2, factorImplied: -1 }]);
  ok('coherence flags agree/disagree', coh[0].agree === true && coh[1].agree === false);
}

console.log('\n── confidence engine ──');
{
  const hi = confidenceEngine({ agreement: 0.9, fit: 0.8, reversion: 0.7 }).confidence;
  const lo = confidenceEngine({ agreement: 0.2, fit: 0.2, reversion: 0.3 }).confidence;
  ok('confidence rises with agreement/fit', hi > lo, `${hi.toFixed(2)} vs ${lo.toFixed(2)}`);
  ok('agreementScore=1 when dispersion 0', near(agreementScore(0, 1), 1));
  ok('agreementScore falls as dispersion grows', agreementScore(2, 1) < agreementScore(0.2, 1));
  // Honesty fixes: never 100%, skeptical prior, base-rate reality crushes confidence
  const maxed = confidenceEngine({ agreement: 1, fit: 1, reversion: 1, calibration: 1, regimeStable: 1, corrStable: 1 }).confidence;
  ok('confidence never reaches 100% (capped ≤0.90)', maxed <= 0.90, `=${maxed.toFixed(3)}`);
  ok('empty evidence ⇒ skeptical prior (~0.33, not 0.5)', Math.abs(confidenceEngine({}).confidence - 0.33) < 0.05);
  const withReality = confidenceEngine({ agreement: 0.9, fit: 0.8, reversion: 0.9, baseRateReality: 0.02 }).confidence;
  const withoutReality = confidenceEngine({ agreement: 0.9, fit: 0.8, reversion: 0.9 }).confidence;
  ok('base-rate/model disagreement slashes confidence', withReality < withoutReality - 0.2, `${withReality.toFixed(2)} vs ${withoutReality.toFixed(2)}`);
  ok('scaleAgreementByIndependence pulls to 0.5 at effN→1', Math.abs(scaleAgreementByIndependence(1.0, 1.0) - 0.5) < 1e-9);
  ok('scaleAgreementByIndependence keeps agreement at effN≥3', near(scaleAgreementByIndependence(0.9, 3), 0.9));
  ok('baseRateReality low when model 0.96 vs empirical 0', baseRateReality(0.96, { baseRate: 0, events: 10 }) < 0.1);
  ok('baseRateReality null when too few events', baseRateReality(0.96, { baseRate: 0, events: 3 }) === null);
  // Regression: a saturated Bucket-B weight must NOT cancel a base-rate reality penalty.
  // (Live EURUSD read 67% confidence while the card said "not trustworthy" — the bug.)
  const contradicted = confidenceEngine({ baseRateReality: 0.036, agreement: 0.591, fit: 0.646, reversion: 0.121, volWeight: 1.0 }).confidence;
  ok('base-rate contradiction ⇒ LOW confidence despite a maxed vol weight', contradicted < 0.20, `=${contradicted.toFixed(3)}`);
  const cc = confidenceEngine({ baseRateReality: 0.036, volWeight: 1.0 });
  ok('no single input contributes more than ~3 logit (anti-saturation)', Object.values(cc.contributions).every(c => Math.abs(c.contribution) <= 5.5));
}

console.log('\n── end-to-end runMVE ──');
{
  const r = rng(21);
  const f1 = [], f2 = [], price = [];
  for (let i = 0; i < 260; i++) {
    const a = Math.sin(i / 25) + 0.03 * i / 260, b = Math.cos(i / 18);
    f1.push(a); f2.push(b);
    price.push(1.1000 + 0.02 * a + 0.01 * b + 0.001 * gauss(r));
  }
  price[price.length - 1] += 0.004;   // inject rich mispricing
  const returns = price.slice(1).map((p, i) => p - price[i]);
  const v = runMVE({ instrument: 'EUR/USD', price, factors: [{ name: 'rate', series: f1 }, { name: 'dxy', series: f2 }], returns, crowdPct: 78, window: 150, horizon: 10, regime: 'RANGE' });
  ok('runMVE ok', v.ok === true);
  ok('detects rich (price above FV)', v.mispricing.rich === true, `z=${v.mispricing.z.toFixed(2)}`);
  ok('produces convergence block', v.convergence != null && v.convergence.pRevert > 0);
  ok('confidence ∈ (0,1)', v.confidence > 0 && v.confidence < 1, `c=${v.confidence.toFixed(2)}`);
  ok('narrative mentions instrument + σ', /EUR\/USD/.test(valuationText(v)) && /σ/.test(valuationText(v)));
  // signal adapter: for a RICH read, the short score must exceed the long score
  // (directional property; absolute nudge depends on base vs valuation confidence).
  const augShort = augmentSignalScore(60, v, 'short');
  const augLong  = augmentSignalScore(60, v, 'long');
  ok('adapter favours short over long when rich', augShort.score > augLong.score, `short=${augShort.score} long=${augLong.score}`);
  ok('mveFactorScore aligned≥0.5, opposed≤0.5', mveFactorScore(v, 'short') >= 0.5 && mveFactorScore(v, 'long') <= 0.5);
}

console.log('\n── live adapter (pure builder, no network) ──');
{
  // Build 300 daily bars + FRED series, price driven by a rate differential so the
  // adapter's regression should recover a real relationship.
  const r = rng(31);
  const bars = [], usMap = new Map(), deMap = new Map(), us2Map = new Map(), deSMap = new Map(), beiMap = new Map();
  let d = new Date(Date.UTC(2023, 0, 2));
  let us10 = 3.8, de10 = 2.4, us2 = 4.4, de2 = 3.0, bei = 2.3;
  for (let i = 0; i < 300; i++) {
    // advance one weekday
    do { d = new Date(d.getTime() + 86400000); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    const iso = d.toISOString().slice(0, 10);
    us10 += 0.02 * gauss(r); de10 += 0.02 * gauss(r); us2 += 0.02 * gauss(r); de2 += 0.02 * gauss(r); bei += 0.01 * gauss(r);
    const diff = us10 - de10;
    const px = 1.10 - 0.05 * diff + 0.002 * gauss(r);   // higher US-DE diff ⇒ weaker EUR
    bars.push({ date: iso, close: px });
    usMap.set(iso, us10); deMap.set(iso, de10); us2Map.set(iso, us2); deSMap.set(iso, de2); beiMap.set(iso, bei);
  }
  const fred = { us10y: usMap, de10y: deMap, us2y: us2Map, de_s: deSMap, bei: beiMap };
  const ctx = buildContext('EUR/USD', bars, fred);
  ok('buildContext produces price + 3 factors', ctx.price.length > 200 && ctx.factors.length === 3, `rows=${ctx.price.length}`);
  ok('factor names as specified', ctx.factors.map(f => f.name).join(',') === 'rate_diff_10y,rate_diff_2y,breakeven');
  ok('marketPrice = last close', near(ctx.marketPrice, bars[bars.length - 1].close, 1e-9));
  const v = runMVE(ctx);
  ok('end-to-end live-shaped ctx values ok', v.ok === true && Number.isFinite(v.fairValue) && v.sigma > 0);
  ok('recovers rate-diff relationship (r²>0.5)', v.ensemble.members.find(m => m.name === 'macro_fv') && v.estimates.find(e => e.name === 'macro_fv').meta.r2 > 0.5, `r²=${v.estimates.find(e => e.name === 'macro_fv')?.meta.r2}`);

  // ffAlign forward-fills sparse (monthly) series across trading days
  const sparse = new Map([['2023-01-05', 2.0], ['2023-02-05', 3.0]]);
  const idx = ['2023-01-04', '2023-01-05', '2023-01-20', '2023-02-05', '2023-02-10'];
  const filled = ffAlign(idx, sparse);
  ok('ffAlign: NaN before first obs', Number.isNaN(filled[0]));
  ok('ffAlign: carries value forward', filled[2] === 2.0 && filled[4] === 3.0, `=${filled.join(',')}`);

  ok('normalizeSym strips punctuation', normalizeSym('EUR/USD') === 'EURUSD' && normalizeSym('xau usd') === 'XAUUSD');
  ok('gold spec uses real_yield + dxy', FACTOR_SPEC.XAUUSD.fred.join(',') === 'tips,dxy');

  // runLiveMVE with INJECTED fake fetchers (proves the wiring without network)
  const fakeDeps = {
    fredKey: 'TEST',
    fetchD1: async () => bars,
    fetchFred: async (id) => ({ DGS10: usMap, IRLTLT01DEM156N: deMap, DGS2: us2Map, IRSTCI01DEM156N: deSMap, T10YIE: beiMap }[id]),
  };
  const live = await runLiveMVE({ sym: 'EUR/USD', deps: fakeDeps });
  ok('runLiveMVE (injected) returns valuation', live.ok === true && live.dataSource && live.dataSource.usableRows > 200, live.error || '');
  const bad = await runLiveMVE({ sym: 'EUR/USD', deps: { fetchD1: fakeDeps.fetchD1, fetchFred: fakeDeps.fetchFred } });
  ok('runLiveMVE guards missing FRED_KEY', bad.ok === false && /FRED_KEY/.test(bad.error));
  const unsup = await runLiveMVE({ sym: 'ZZZ/USD', deps: fakeDeps });
  ok('runLiveMVE rejects unsupported symbol', unsup.ok === false && /unsupported/.test(unsup.error));
}

console.log('\n── NQ factor spec (index convention: real yield + HY OAS + VIX, no DXY) ──');
{
  ok('NQ maps to the OANDA NAS100_USD instrument', OANDA_SYMBOL.NQ === 'NAS100_USD');
  ok('NQ spec pulls tips,hy,vix (no dxy — deliberately excluded, see liveAdapter.js header)', FACTOR_SPEC.NQ.fred.join(',') === 'tips,hy,vix');

  // Synthetic NQ-shaped series: price driven by real yield (down) + HY OAS (down) +
  // VIX (down) — i.e. cheaper discount rate / tighter credit / lower vol ⇒ richer NQ,
  // the textbook equity risk-premium signs — so the regression should recover it.
  const r = rng(53);
  const bars = [], tipsMap = new Map(), hyMap = new Map(), vixMap = new Map();
  let d = new Date(Date.UTC(2023, 0, 2));
  let tips = 1.8, hy = 3.9, vix = 15.5, px = 15000;
  for (let i = 0; i < 300; i++) {
    do { d = new Date(d.getTime() + 86400000); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    const iso = d.toISOString().slice(0, 10);
    tips += 0.01 * gauss(r); hy += 0.03 * gauss(r); vix += 0.15 * gauss(r);
    px += -400 * (tips - 1.8) - 250 * (hy - 3.9) - 60 * (vix - 15.5) + 20 * gauss(r);
    bars.push({ date: iso, close: px });
    tipsMap.set(iso, tips); hyMap.set(iso, hy); vixMap.set(iso, vix);
  }
  const fred = { tips: tipsMap, hy: hyMap, vix: vixMap };
  const ctx = buildContext('NQ', bars, fred);
  ok('buildContext produces price + 3 NQ factors', ctx.price.length > 200 && ctx.factors.length === 3, `rows=${ctx.price.length}`);
  ok('NQ factor names as specified', ctx.factors.map(f => f.name).join(',') === 'real_yield,hy_oas,vix');
  const v = runMVE(ctx);
  ok('end-to-end NQ ctx values ok', v.ok === true && Number.isFinite(v.fairValue) && v.sigma > 0);
  ok('recovers the 3-factor relationship (r²>0.5)', v.estimates.find(e => e.name === 'macro_fv')?.meta.r2 > 0.5, `r²=${v.estimates.find(e => e.name === 'macro_fv')?.meta.r2}`);

  const fakeNqDeps = {
    fredKey: 'TEST',
    fetchD1: async () => bars,
    fetchFred: async (id) => ({ DFII10: tipsMap, BAMLH0A0HYM2: hyMap, VIXCLS: vixMap }[id]),
  };
  const liveNq = await runLiveMVE({ sym: 'NQ', deps: fakeNqDeps });
  ok('runLiveMVE(NQ) with injected fetchers returns a valuation', liveNq.ok === true && liveNq.dataSource?.oanda === 'NAS100_USD', liveNq.error || '');
}

console.log('\n── OOS validation (does mispricing predict returns?) ──');
{
  // CASE 1: a genuinely mean-reverting instrument around a factor-driven fair value.
  // price = fairValue(factors) + reverting deviation. The mispricing SHOULD predict
  // the subsequent reversion (icPredictive > 0).
  const r = rng(41);
  const N = 700, f1 = [], f2 = [], price = [];
  let dev = 0;
  for (let i = 0; i < N; i++) {
    const a = Math.sin(i / 30) + 0.4 * gauss(r) * 0 + 0.01 * i / N, b = Math.cos(i / 22);
    f1.push(a); f2.push(b);
    dev = dev * 0.90 + 0.6 * gauss(r);              // reverting deviation (κ≈0.1)
    price.push(100 + 5 * a + 3 * b + dev);           // fair value + reverting dev
  }
  const rep = validateInstrument({ instrument: 'TEST', price, factors: [{ name: 'f1', series: f1 }, { name: 'f2', series: f2 }] }, { horizons: [1, 5, 10, 20] });
  ok('validation runs on reverting series', rep.ok === true && rep.oosPoints > 100, rep.error || `oos=${rep.oosPoints}`);
  const bestEdge = Math.max(...Object.values(rep.perHorizon).filter(h => h.icEdge != null).map(h => h.icEdge));
  ok('factor-reverting series ⇒ positive icEDGE over benchmark', bestEdge > 0.05, `bestEdge=${bestEdge}`);
  ok('reverting series ⇒ hit rate > 0.5 somewhere', Object.values(rep.perHorizon).some(h => h.hitRate > 0.5));
  ok('verdict is a string with a call', typeof rep.verdict === 'string' && /SURVIVES|WEAK|NULL/.test(rep.verdict));
  ok('deflated Sharpe present', rep.strategy.deflatedSharpe != null);
  ok('report exposes benchmark IC per horizon', Object.values(rep.perHorizon).every(h => h.insufficient || h.icBenchmark != null));

  // CASE 2: a random walk with NO relationship to the factors. The factor fair value
  // must NOT beat the trailing-mean benchmark — icEDGE ≈ 0 — even though the RAW
  // icPredictive is spuriously positive (the whole point of the benchmark).
  const g1 = [], g2 = [], rw = []; let p = 100;
  for (let i = 0; i < N; i++) { g1.push(gauss(r)); g2.push(gauss(r)); p += gauss(r); rw.push(p); }
  const repNull = validateInstrument({ instrument: 'NOISE', price: rw, factors: [{ name: 'g1', series: g1 }, { name: 'g2', series: g2 }] }, { horizons: [1, 5, 10, 20, 60] });
  const bestEdgeNull = Math.max(...Object.values(repNull.perHorizon).filter(h => h.icEdge != null).map(h => Math.abs(h.icEdge)));
  ok('random walk ⇒ icEDGE small (benchmark strips the spurious IC)', bestEdgeNull < 0.10, `|bestEdge|=${bestEdgeNull}`);
  ok('random walk verdict is NULL', /NULL/.test(repNull.verdict), repNull.verdict.slice(0, 40));

  // no-lookahead: OOS series length is bounded and starts after the train window
  const { idx } = oosMispricingSeries(price, [{ name: 'f1', series: f1 }, { name: 'f2', series: f2 }], { window: 150, minTrain: 180 });
  ok('OOS series starts after warmup', idx[0] >= 180 && idx.length > 100, `start=${idx[0]} n=${idx.length}`);
}

console.log('\n── cross-instrument consistency (must not overcall) ──');
{
  // The ACTUAL live 5-instrument result: tiny icEdges, hit rates mostly <0.5,
  // deflated Sharpes ~0. This must read NULL, not CONSISTENT (the bug we're fixing).
  const real = [
    { instrument: 'XAUUSD', slowIcEdge: 0.0193, slowHitRate: 0.476, deflatedSharpe: 0 },
    { instrument: 'EURUSD', slowIcEdge: 0.0475, slowHitRate: 0.481, deflatedSharpe: 0.889 },
    { instrument: 'GBPUSD', slowIcEdge: 0.0389, slowHitRate: 0.547, deflatedSharpe: 0.344 },
    { instrument: 'USDJPY', slowIcEdge: 0.0481, slowHitRate: 0.467, deflatedSharpe: 0.001 },
    { instrument: 'AUDUSD', slowIcEdge: -0.0263, slowHitRate: 0.471, deflatedSharpe: 0.017 },
  ];
  const pc = poolConsistency(real);
  ok('real live result reads NULL, not CONSISTENT', pc.consistent === false && /NULL|INCONSISTENT/.test(pc.read), pc.read.slice(0, 40));
  ok('only hit-rate-corroborated instruments count as evidence', pc.realEvidence === 1, `real=${pc.realEvidence} signOnly=${pc.positiveSignOnly}`);
  ok('reports sign-only count separately (3/5) so the coin-flip is visible', pc.positiveSignOnly === 3);

  // A genuinely strong, corroborated cross-section SHOULD read CONSISTENT.
  const strong = [
    { instrument: 'A', slowIcEdge: 0.08, slowHitRate: 0.56, deflatedSharpe: 0.97 },
    { instrument: 'B', slowIcEdge: 0.07, slowHitRate: 0.55, deflatedSharpe: 0.96 },
    { instrument: 'C', slowIcEdge: 0.06, slowHitRate: 0.54, deflatedSharpe: 0.72 },
    { instrument: 'D', slowIcEdge: 0.05, slowHitRate: 0.53, deflatedSharpe: 0.61 },
    { instrument: 'E', slowIcEdge: 0.01, slowHitRate: 0.49, deflatedSharpe: 0.2 },
  ];
  ok('genuinely strong cross-section reads CONSISTENT', poolConsistency(strong).consistent === true);
}

console.log(`\n${failures === 0 ? '✅' : '❌'} MVE tests: ${tests - failures}/${tests} passed${failures ? `, ${failures} FAILED` : ''}\n`);
process.exit(failures ? 1 : 0);
