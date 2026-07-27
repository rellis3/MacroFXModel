// Unit tests for streamBlend.js — proves the MATH on synthetic streams with a
// KNOWN correlation. This verifies the combiner is correct; it says nothing about
// whether the real momentum/reversion streams actually diversify (that needs real
// data on Railway). Run: node js/streamBlend.test.mjs
import { alignByDate, blendReport, blendStreams } from './streamBlend.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('FAIL:', msg); } };
const approx = (x, y, tol, msg) => ok(Math.abs(x - y) <= tol, `${msg} (got ${x}, want ~${y}±${tol})`);

// Deterministic PRNG so the test is reproducible without Math.random.
function* lcg(seed) { let s = seed >>> 0; while (true) { s = (1103515245 * s + 12345) >>> 0; yield s / 0xffffffff; } }
function gaussians(n, seed) {
  const g = lcg(seed), out = [];
  for (let i = 0; i < n; i++) { // Box–Muller
    const u1 = Math.max(1e-9, g.next().value), u2 = g.next().value;
    out.push(Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2));
  }
  return out;
}
// Sortable sequential date keys (lexical sort == chronological, like real ISO dates).
const dnum = i => 'd' + String(i).padStart(6, '0');

// ── 1. Correlation recovery: build b = ρ·a + √(1-ρ²)·noise, check measured corr ≈ ρ.
{
  const N = 4000, rho = -0.5;
  const za = gaussians(N, 1), zn = gaussians(N, 999);
  const a = za.map(x => x * 0.01);
  const b = za.map((x, i) => (rho * x + Math.sqrt(1 - rho * rho) * zn[i]) * 0.01);
  const rep = blendReport(a, b);
  ok(rep.ok, '1: report ok');
  approx(rep.corr, rho, 0.05, '1: recovers known correlation');
}

// ── 2. Negatively-correlated equal-Sharpe streams → blend Sharpe beats BOTH legs.
{
  const N = 3000;
  const za = gaussians(N, 7), zb = gaussians(N, 8);
  // Two streams, same positive drift (large vs sampling error so both legs are
  // clearly positive-Sharpe), correlation ≈ -0.6 → blend must beat both.
  const rho = -0.6, drift = 0.0015;
  const a = za.map(x => drift + x * 0.01);
  const b = za.map((x, i) => drift + (rho * x + Math.sqrt(1 - rho * rho) * zb[i]) * 0.01);
  const rep = blendReport(a, b);
  ok(rep.corr < -0.4, '2: correlation is strongly negative');
  ok(rep.equalWeight.sharpe > rep.a.sharpe && rep.equalWeight.sharpe > rep.b.sharpe,
     `2: equal-weight blend Sharpe (${rep.equalWeight.sharpe}) beats both legs (${rep.a.sharpe}, ${rep.b.sharpe})`);
  ok(rep.diversificationRatio > 1.1, `2: diversification ratio > 1.1 (got ${rep.diversificationRatio})`);
}

// ── 3. Perfectly-correlated identical streams → NO diversification benefit.
{
  const N = 1000;
  const a = gaussians(N, 3).map(x => 0.0003 + x * 0.008);
  const b = [...a];
  const rep = blendReport(a, b);
  approx(rep.corr, 1, 0.001, '3: corr = 1 for identical streams');
  approx(rep.diversificationRatio, 1, 0.001, '3: no diversification when identical');
  approx(rep.equalWeight.sharpe, rep.a.sharpe, 0.001, '3: blend Sharpe = leg Sharpe');
}

// ── 4. alignByDate keeps only common dates, in order, dropping the rest.
{
  const A = new Map([['2024-01-01', 0.01], ['2024-01-02', -0.02], ['2024-01-03', 0.03]]);
  const B = [{ date: '2024-01-02', ret: 0.05 }, { date: '2024-01-03', ret: -0.01 }, { date: '2024-01-04', ret: 0.02 }];
  const al = alignByDate(A, B);
  ok(al.dates.length === 2 && al.dates[0] === '2024-01-02' && al.dates[1] === '2024-01-03', '4: common dates only, sorted');
  ok(al.a[0] === -0.02 && al.b[0] === 0.05, '4: values pulled from correct stream');
  ok(al.droppedA === 1 && al.droppedB === 1, '4: reports dropped non-common dates');
}

// ── 5. blendStreams end-to-end on date-keyed input; accepts {date,pnl} too.
{
  const N = 300;
  const dates = Array.from({ length: N }, (_, i) => dnum(i));
  const za = gaussians(N, 11), zb = gaussians(N, 12);
  const A = dates.map((date, i) => ({ date, ret: 0.0003 + za[i] * 0.01 }));
  const B = dates.map((date, i) => ({ date, pnl: 0.0003 + (-0.5 * za[i] + 0.866 * zb[i]) * 0.01 })); // pnl alias
  const rep = blendStreams(A, B);
  ok(rep.ok, '5: blendStreams ok on date-keyed {ret}/{pnl} input');
  ok(rep.dates.from === dates[0] && rep.dates.to === dates[N - 1], '5: reports date span');
  ok(rep.corr < 0, '5: negative correlation carried through');
}

// ── 6. Guards: too few observations.
ok(!blendReport([1, 2, 3], [1, 2, 3]).ok, '6: rejects <20 observations');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
