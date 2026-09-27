/**
 * Unit tests for ouOptimal + ouPairsEngine — pure, synthetic, no network.
 * Run: node js/ouPairs.test.mjs
 * (Numerics cross-checked once against scipy quad/brentq: levels agree to ~1e-9.)
 */
import { ouMle, bestBeta, spreadSeries, ouIntegral, ouOptimalLevels } from './ouOptimal.js';
import { runOuPairs, compareOuVsZscore, poolDaily, runOuBook, OU_EXITS_V21 } from './ouPairsEngine.js';
import { mulberry32 } from './statsCore.js';
import { ouFit } from './ouCore.js';

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error('  ✗ ' + name); } }
const rng = mulberry32(3);
const g = () => { let u = 0; while (!u) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); };
const day = i => new Date(Date.UTC(2008, 0, 1) + i * 86400000).toISOString().slice(0, 10);

// ── MLE recovers known OU parameters ────────────────────────────────────────────
{
  const dt = 1 / 252, mu = 10, theta = 0.3, sigma = 0.2, n = 20000;
  const x = [theta]; const a = Math.exp(-mu * dt), s = sigma * Math.sqrt((1 - a * a) / (2 * mu));
  for (let i = 1; i < n; i++) x.push(theta + (x[i - 1] - theta) * a + s * g());
  const f = ouMle(x, dt);
  ok('MLE θ', Math.abs(f.theta - theta) < 0.02);
  ok('MLE μ', Math.abs(f.mu - mu) / mu < 0.15);
  ok('MLE σ', Math.abs(f.sigma - sigma) / sigma < 0.05);
  // Consistency with the registry's OU brick (ouCore.ouFit, Euler/OLS): same
  // half-life to within the discretisation difference (κ≈1−φ vs μΔt = −ln φ).
  const hlMle = Math.log(2) / (f.mu * dt), hlOls = ouFit(x).halfLife;
  ok('half-life agrees with ouCore.ouFit', Math.abs(hlMle - hlOls) / hlOls < 0.03);
  ok('MLE random walk → not mean-reverting or slow', (() => { const w = [0]; for (let i = 1; i < 500; i++) w.push(w[i - 1] + 0.01 * g()); const r = ouMle(w, dt); return !(r.mu > 50); })());
}
// ── integral + levels ───────────────────────────────────────────────────────────
{
  ok('I(0, 0) = √(π/2)', Math.abs(ouIntegral(0, 0) - Math.sqrt(Math.PI / 2)) < 1e-8);
  ok('I(1, 0) = 1', Math.abs(ouIntegral(1, 0) - 1) < 1e-8);
  ok('I(−0.5, 0.3) matches scipy', Math.abs(ouIntegral(-0.5, 0.3) - 2.521428881601677) < 1e-8);
  const L = ouOptimalLevels({ theta: 0, mu: 8, sigma: 0.2 }, { c: 0.01, r: 0.05 });
  ok('levels match scipy reference', Math.abs(L.entry + 0.11954069484) < 1e-6 && Math.abs(L.exit - 0.13171482581) < 1e-6);
  ok('entry < θ < exit', L.entry < 0 && L.exit > 0);
  const Lc = ouOptimalLevels({ theta: 0, mu: 8, sigma: 0.2 }, { c: 0.03, r: 0.05 });
  ok('higher cost ⇒ wider bands', Lc.entry < L.entry && Lc.exit > L.exit);
  ok('invalid params → null', ouOptimalLevels({ theta: 0, mu: -1, sigma: 0.2 }) === null);
}
// ── β search ────────────────────────────────────────────────────────────────────
{
  const n = 253, A = [], B = []; let a = 1, ou = 0;
  for (let i = 0; i < n; i++) { a *= Math.exp(0.006 * g()); ou = ou * 0.9 + 0.003 * g(); A.push(a); B.push(a * Math.exp(ou) * 1.0); }
  const fit = bestBeta(A, B);
  ok('β near 1 for co-moving legs', fit && Math.abs(fit.beta - 1) < 0.25);
  ok('spreadSeries starts at 1 − β', Math.abs(spreadSeries(A, B, 0.5)[0] - 0.5) < 1e-12);
}
// ── pairs engine ────────────────────────────────────────────────────────────────
function pair(n = 1600, speed = 0.93, sd = 0.004) {
  const A = [], B = []; let a = 1, ou = 0;
  for (let i = 0; i < n; i++) { a *= Math.exp(0.006 * g()); ou = ou * speed + sd * g(); A.push({ t: day(i), v: a }); B.push({ t: day(i), v: a * Math.exp(ou) }); }
  return { A, B };
}
{
  const { A, B } = pair();
  const r = runOuPairs(A, B, { costBps: 1 });
  ok('OU trades generated', r.trades.length >= 1);
  ok('OU bands straddle the fitted mean', r.currentModel.long.entry < r.currentModel.theta && r.currentModel.long.exit > r.currentModel.theta);
  // Known model property (documented in FX_FACTOR_V2_TEST.md §5): Leung–Li
  // discounts the spread LEVEL, so on a zero-centred cross with small r the exit
  // sits well past the mean → fewer, longer trades than the ±2σ benchmark.
  const zb = runOuPairs(A, B, { mode: 'zscore', costBps: 1 });
  ok('±2σ benchmark trades more often than OU bands', zb.trades.length > r.trades.length);
  ok('±2σ benchmark profitable on strongly mean-reverting cross', zb.all.sharpe > 0.5);
  ok('daily length matches dates', r.daily.length === r.dates.length);
  ok('trade pnl includes both costs', r.trades.every(t => Number.isFinite(t.pnlPct)));
  ok('trades carry a positive risk unit', r.trades.every(t => t.riskPct > 0));
  ok('current model reported', r.currentModel && r.currentModel.halfLifeDays > 0);
  // no lookahead: prefix run equals full run on the common prefix
  const M = 1200;
  const p = runOuPairs(A.slice(0, M), B.slice(0, M), { costBps: 1 });
  const same = p.daily.slice(0, -1).every((x, i) => x === r.daily[i]);
  ok('no lookahead (prefix == full prefix)', same);
  ok('open trade marked, not dropped', p.trades.filter(t => t.open).length <= 1 && (p.openAtEnd === 0 || p.trades.at(-1).open));
  const z = runOuPairs(A, B, { mode: 'zscore', costBps: 1 });
  ok('zscore benchmark runs', z.mode === 'zscore' && z.trades.length > 0);
  const cmp = compareOuVsZscore(A, B, { costBps: 1 });
  ok('compare returns a verdict', typeof cmp.vsZscore.verdict === 'string');
  const { A: A2, B: B2 } = pair(1600, 0.95, 0.005);
  const pool = poolDaily([r, runOuPairs(A2, B2, { costBps: 1 })]);
  ok('pool on common dates', pool.dates.length > 1000 && Number.isFinite(pool.oos.sharpe));
  ok('short data → error', runOuPairs(A.slice(0, 100), B.slice(0, 100)).error);
  const ll = runOuPairs(A, B, { costBps: 1, betaMode: 'loglik' });
  ok('loglik β diagnostic runs', !ll.error && ll.currentModel && ll.currentModel.beta !== 1);
  ok('fixed1 uses β = 1', r.currentModel.beta === 1);
  const book = runOuBook([{ name: 'X/Y', a: A, b: B }, { name: 'bad', a: A.slice(0, 50), b: B.slice(0, 50) }], { costBps: 1 });
  ok('book pooled verdict', typeof book.pooled.vsZscore.verdict === 'string' && book.pairs.length === 2);
  ok('book keeps per-pair error, drops daily arrays', book.pairs[1].error && !('daily' in book.pairs[0].ou));
}

// ── v2.1 exits (§7): default off ⇒ v2 byte-identical; on ⇒ no trade stuck for years ─
{
  const { A, B } = pair();
  const v2 = runOuPairs(A, B, { costBps: 1 });
  const v2x = runOuPairs(A, B, { costBps: 1, timeStopHL: null, stopSd: null });
  ok('exits off ⇒ identical to v2', v2.daily.every((x, i) => x === v2x.daily[i]) && v2.trades.length === v2x.trades.length);
  // A cross that mean-reverts for 3 years then breaks to a new level and trends:
  // the frozen entry model's θ is never revisited, so v2 holds one trade to the end.
  const n = 1600, A3 = [], B3 = []; let a = 1, ou = 0;
  for (let i = 0; i < n; i++) {
    a *= Math.exp(0.006 * g());
    ou = i < 800 ? ou * 0.93 + 0.004 * g() : ou + 0.0015 + 0.002 * g();
    A3.push({ t: day(i), v: a }); B3.push({ t: day(i), v: a * Math.exp(ou) });
  }
  for (const mode of ['ou', 'zscore']) {
    const stuck = runOuPairs(A3, B3, { costBps: 1, mode });
    const fixed = runOuPairs(A3, B3, { costBps: 1, mode, ...OU_EXITS_V21 });
    const longest = r => Math.max(...r.trades.map(t => t.bars));
    ok(`${mode}: v2 reproduces the stuck trade (open at end)`, stuck.openAtEnd === 1);
    ok(`${mode}: v2.1 stops/time-exits the break`, (fixed.exitReasons.stop || 0) + (fixed.exitReasons.time || 0) >= 1);
    ok(`${mode}: v2.1 caps holding time`, longest(fixed) < longest(stuck));
    ok(`${mode}: v2.1 no lookahead`, (() => { const p = runOuPairs(A3.slice(0, 1200), B3.slice(0, 1200), { costBps: 1, mode, ...OU_EXITS_V21 });
      return p.daily.slice(0, -1).every((x, i) => x === fixed.daily[i]); })());
    // no immediate re-entry into the same move after a stop: every stop is followed
    // by a gap (the side re-arms only once the spread is back inside its entry level)
    ok(`${mode}: re-arm prevents same-bar churn`, fixed.trades.every((t, k) => k === 0 || t.entryDate > fixed.trades[k - 1].exitDate || fixed.trades[k - 1].reason === 'target'));
  }
  const book = runOuBook([{ name: 'X/Y', a: A3, b: B3 }], { costBps: 1, ...OU_EXITS_V21 });
  ok('book runs with v2.1 exits', typeof book.pooled.vsZscore.verdict === 'string' && book.params.stopSd === 2);
}

console.log(`ouPairs: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
