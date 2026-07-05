// Unit tests for creditLeadLagEngine.js — synthetic series with a KNOWN planted
// lead (credit widening → NQ vol rises a couple of days later). The study must
// recover it AND show credit beating vol's own persistence out of sample.
// Run: node js/creditLeadLagEngine.test.mjs
import { pearson, spearman, forwardRealizedVol, trailingRealizedVol,
  leadLagTable, runCreditLeadLag } from './creditLeadLagEngine.js';

let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.error('  ✗', m); } };

// deterministic RNG (Mulberry32) + normal
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const norm = r => (mu, sd) => { const u1 = Math.max(r(), 1e-9), u2 = r(); return mu + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };

// ── 1. pearson / spearman ────────────────────────────────────────────────────
{
  const x = [1, 2, 3, 4, 5], y = [2, 4, 6, 8, 10];
  ok(Math.abs(pearson(x, y).r - 1) < 1e-9, 'perfect positive → r=1');
  ok(pearson(x, y).t > 5, 'perfect corr → large t');
  ok(Math.abs(pearson(x, y.slice().reverse()).r + 1) < 1e-9, 'perfect negative → r=-1');
  ok(Math.abs(spearman(x, [1, 8, 9, 20, 100]).ic - 1) < 1e-9, 'monotonic → spearman IC=1');
  ok(pearson([1, 2], [1, 2]).r === null, 'too few points → null');
}

// ── 2. forwardRealizedVol: no lookahead + sane magnitude ─────────────────────
{
  // constant multiplicative step → zero realized vol (returns identical)
  const c = Array.from({ length: 50 }, (_, i) => 100 * Math.pow(1.001, i));
  const fv = forwardRealizedVol(c, 5);
  ok(fv[10] != null && fv[10] < 1e-6, 'constant-growth series → ~0 forward vol');
  // last `horizon` entries are null (no forward window)
  ok(fv[49] === null && fv[48] === null, 'tail has no forward vol');
  // trailing vol nonzero when returns vary
  const r = rng(3), g = norm(r);
  let p = 100; const cc = [100]; for (let i = 1; i < 200; i++) { p *= Math.exp(g(0, 0.01)); cc.push(p); }
  ok(trailingRealizedVol(cc, 5)[100] > 0, 'varying returns → positive trailing vol');
}

// ── 3. leadLagTable recovers a planted lag ───────────────────────────────────
{
  const r = rng(11), g = norm(r);
  const driver = Array.from({ length: 300 }, () => g(0, 1));
  const target = new Array(300).fill(0);
  for (let t = 0; t < 300; t++) target[t + 3] != null && (target[t + 3] = driver[t] + g(0, 0.3));
  for (let t = 0; t < 297; t++) target[t + 3] = driver[t] + g(0, 0.3);   // target lags driver by 3
  const tbl = leadLagTable(driver, target, 8);
  const best = tbl.filter(x => x.r != null).sort((a, b) => b.r - a.r)[0];
  ok(best.lag === 3, `recovers planted lead of 3 (got ${best.lag})`);
  ok(best.r > 0.7, `strong r at the planted lag (got ${best.r?.toFixed(2)})`);
}

// ── 4. End-to-end: credit widening leads NQ vol, and beats vol persistence ────
{
  const r = rng(202), g = norm(r);
  const N = 500, L = 2, H = 5;
  // HY OAS: random walk with occasional widening bursts (pct-points)
  const hy = [3.0];
  const shock = new Array(N).fill(0);
  for (let t = 1; t < N; t++) {
    // widening burst every ~40 days
    const burst = (t % 40 < 6) ? 0.06 : 0;
    shock[t] = burst;
    let v = hy[t - 1] + g(0, 0.01) + burst - 0.004;   // mild mean-reversion drift
    v = Math.max(1.5, Math.min(9, v));
    hy.push(v);
  }
  // daily HY change, used to drive NQ vol L days later
  const dHy = hy.map((v, i) => (i ? v - hy[i - 1] : 0));
  // NQ closes: daily return sd rises when HY widened L days ago
  let px = 15000; const nq = [px];
  for (let t = 1; t < N; t++) {
    const stress = Math.max(0, dHy[Math.max(0, t - L)]);   // recent HY widening
    const sd = 0.008 + 2.2 * stress;                        // vol scales with lagged HY widening
    px *= Math.exp(g(0, sd));
    nq.push(px);
  }

  const out = runCreditLeadLag(hy, nq, { horizon: H, maxLag: 8, oosFrac: 0.35 });
  ok(out.ok, `study runs (${out.error ?? ''})`);
  ok(out.coverage.rows === N, 'uses all aligned rows');
  ok(out.bestLead && out.bestLead.r > 0.1, `credit velocity leads NQ vol, positive r (got ${out.bestLead?.r?.toFixed(2)})`);
  const cIC = out.verdict.credit_oos_ic, bIC = out.verdict.benchmark_oos_ic;
  ok(cIC != null && cIC > 0.1, `credit has positive OOS information coefficient (got ${cIC?.toFixed(2)})`);
  ok(out.verdict.beatsBenchmark, `credit beats vol-predicts-vol OOS (credit ${cIC?.toFixed(2)} vs bench ${bIC?.toFixed(2)})`);
  ok(out.hit.credit_velocity5.rate > 0.5, `above-median widening predicts above-median vol >50% (got ${(out.hit.credit_velocity5.rate*100).toFixed(0)}%)`);
}

// ── 5. Guard: too little data ────────────────────────────────────────────────
ok(runCreditLeadLag([1,2,3], [1,2,3]).ok === false, 'too little data → ok:false');

console.log(`\ncreditLeadLagEngine.test: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
