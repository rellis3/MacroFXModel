// Synthetic, no-network unit tests for the multi-factor combiner.
//   node js/multiFactorEngine.test.mjs
//
// Deterministic (seeded LCG, no Math.random — which is blocked in this repo).
// Proves: the date inner-join, no-lookahead vol targeting, and the core claim
// that blending uncorrelated positive-drift streams RAISES Sharpe vs the legs.

import { combineFactors, joinFactors, trailingVol, statsOf } from './multiFactorEngine.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// Seeded LCG → deterministic standard-normal via Box-Muller.
function makeRng(seed) {
  let s = seed >>> 0;
  const u = () => { s = (1664525 * s + 1013904223) >>> 0; return (s >>> 0) / 4294967296; };
  return () => { const a = Math.max(1e-12, u()), b = u(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); };
}
function isoDates(n) {   // consecutive calendar days from a fixed epoch
  const out = [], base = Date.UTC(2010, 0, 1);
  for (let i = 0; i < n; i++) out.push(new Date(base + i * 86400000).toISOString().slice(0, 10));
  return out;
}
// A factor stream: iid daily returns with drift `mu` and vol `sd`.
function factor(name, dates, seed, mu, sd) {
  const rng = makeRng(seed);
  return { name, dates, dailyRet: dates.map(() => mu + sd * rng()) };
}

const N = 1500;
const dates = isoDates(N);

// ── 1. joinFactors inner-joins on common dates ───────────────────────────────
{
  const a = { name: 'A', dates: ['2020-01-01', '2020-01-02', '2020-01-03'], dailyRet: [0.1, 0.2, 0.3] };
  const b = { name: 'B', dates: ['2020-01-02', '2020-01-03', '2020-01-04'], dailyRet: [0.5, 0.6, 0.7] };
  const j = joinFactors([a, b]);
  ok('join keeps only common dates', j.dates.length === 2 && j.dates[0] === '2020-01-02' && j.dates[1] === '2020-01-03');
  ok('join aligns each column', j.byName.A[0] === 0.2 && j.byName.B[0] === 0.5 && j.byName.A[1] === 0.3 && j.byName.B[1] === 0.6);
  ok('join needs ≥2 usable factors', joinFactors([a]).dates.length === 0);
}

// ── 2. trailingVol is strictly past (no lookahead) ───────────────────────────
{
  const r = Array.from({ length: 100 }, (_, i) => (i % 2 ? 0.01 : -0.01));
  const v = trailingVol(r, 30);
  // vol[t] must not depend on r[t]: perturbing r[t] alone leaves vol[t] unchanged.
  const r2 = r.slice(); r2[50] = 999;
  const v2 = trailingVol(r2, 30);
  ok('trailingVol[t] ignores r[t] (no lookahead)', near(v[50], v2[50]) && v[50] > 0, `v=${v[50]}`);
  ok('trailingVol[t] DOES change when a past bar changes', !near(v[51], v2[51]));
  ok('trailingVol undefined before 20 obs', !Number.isFinite(v[5]));
}

// ── 3. Blending two uncorrelated positive streams raises Sharpe ───────────────
{
  const f1 = factor('alpha', dates, 12345, 0.0004, 0.01);   // Sharpe ~0.63 ann
  const f2 = factor('beta',  dates, 67890, 0.0004, 0.01);   // independent, same profile
  const res = combineFactors([f1, f2], { minOverlap: 260 });
  ok('combine ok', res.ok, res.ok ? '' : res.error);
  const legSharpe = Math.max(res.perFactor[0].sharpe, res.perFactor[1].sharpe);
  ok('blend Sharpe > best single leg (diversification works)', res.headline.sharpe > legSharpe, `blend=${res.headline.sharpe} leg=${legSharpe}`);
  ok('avg pairwise correlation ~0 for independent legs', Math.abs(res.diversification.avgCorrelation) < 0.15, `ρ=${res.diversification.avgCorrelation}`);
  ok('diversification ratio > 1', res.diversification.diversificationRatio > 1, `dr=${res.diversification.diversificationRatio}`);
  ok('portfolio realised vol near target', Math.abs(res.headline.annVol - 10) < 4, `annVol=${res.headline.annVol}%`);
  ok('honest read is the good case', /Diversification is doing real work/.test(res.read));
}

// ── 4. Highly-correlated legs are flagged (no real diversification) ──────────
{
  const base = factor('base', dates, 111, 0.0003, 0.01);
  // clone with tiny idiosyncratic noise → ρ ≈ 1
  const rng = makeRng(222);
  const clone = { name: 'clone', dates, dailyRet: base.dailyRet.map(x => x + 0.0005 * rng()) };
  const res = combineFactors([base, clone], {});
  ok('high-correlation blend flagged', /highly correlated|one bet wearing/.test(res.read), `ρ=${res.diversification.avgCorrelation}`);
  ok('avg correlation reported high', res.diversification.avgCorrelation > 0.7, `ρ=${res.diversification.avgCorrelation}`);
}

// ── 5. A dead (negative-drift) blend is reported dead, not dressed up ────────
{
  const f1 = factor('lose1', dates, 333, -0.0003, 0.01);
  const f2 = factor('lose2', dates, 444, -0.0003, 0.01);
  const res = combineFactors([f1, f2], {});
  ok('negative blend has negative-ish Sharpe', res.headline.sharpe < 0.2, `sharpe=${res.headline.sharpe}`);
  ok('honest read admits the caveat', /Caveats/.test(res.read));
}

// ── 6. Guardrails ────────────────────────────────────────────────────────────
{
  const short = isoDates(100);
  const res = combineFactors([factor('a', short, 1, 0.0004, 0.01), factor('b', short, 2, 0.0004, 0.01)], {});
  ok('too little overlap → ok:false', !res.ok && /common dates/.test(res.error));
  const one = combineFactors([factor('solo', dates, 1, 0.0004, 0.01)], {});
  ok('single factor → ok:false', !one.ok);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
