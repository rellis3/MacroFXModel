// cot-crowding-programme Phase 4, step 2: cells A1-A4 on the desk's trend system.
//
// Registered design: forge/COT_CROWDING_PROGRAMME_PREREG.md (705e46ea). Nothing here is a new
// variant; the four arms, splits, bootstrap and gates are the prereg's. Seed 20261024.
//
// Engine: js/trendFollowEngine.js IMPORTED unchanged (momentumSignal, buildPortfolioReturns,
// DEFAULTS: lookbacks 21/63/126/252, inverse-vol sizing, 2bp turnover cost, equal-weight basket
// vol-targeted to 10% on a strictly-past window). Arms inject a modified signal through
// backtestMarket's signalSeries parameter (via buildPortfolioReturns' m.signalSeries).
//
// Inputs: analysis/output/cot-crowding-programme/phase4_aligned.json (phase4_prep.py): 34 markets,
// one business-day grid, per-day state of the last report released strictly before the day.
//
// "On the signal's side": crowd == sign(base signal). State codes 1 A, 2 B, 3 C, 4 D, 0 none.
//   A1 entry filter: when the base signal changes sign to s != 0 while (st in {B,D} and crowd == s),
//      hold 0 until that condition clears (or the base signal changes sign again), then follow base.
//   A2 risk scaling: signal x 0.5 while st in {B,D} and crowd == sign(signal).
//   A3 exit: signal 0 while st == D and crowd == sign(signal).
//   A4 state-scaled: A x1, C x1, B x0.5, D x0 (same side).
// Splits: IS 2007-06-01..2016-12-31; OOS 2017-01-01..2026-08-21; OOS subperiods 2017-2021, 2022..2026-08-21.
// Inference: paired 63-day moving-block bootstrap of daily basket returns, B = 2000, mulberry32(20261024);
// Sharpe diff (A1/A3/A4) and CVaR(97.5%) diff (A2); p from the CI by normal approximation (pFromCI).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { momentumSignal, buildPortfolioReturns, annualize, equityFrom, DEFAULTS } from '../../js/trendFollowEngine.js';
import { maxDrawdownFromEquity } from '../../js/metricsCore.js';
import { mulberry32 } from '../../js/statsCore.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'analysis/output/cot-crowding-programme');
const SEED = 20261024, REPS = 2000, BLOCK = 63, DAY = 252;
const PERIODS = { IS: ['2007-06-01', '2016-12-31'], OOS: ['2017-01-01', '2026-08-21'],
                  OOS1: ['2017-01-01', '2021-12-31'], OOS2: ['2022-01-01', '2026-08-21'] };

const data = JSON.parse(fs.readFileSync(path.join(OUT, 'phase4_aligned.json'), 'utf8'));
const dates = data.dates, SYMS = Object.keys(data.markets);
const sgn = x => (x > 0 ? 1 : x < 0 ? -1 : 0);

function arms(m) {
  const base = momentumSignal(m.closes, DEFAULTS.lookbacks);
  const n = base.length, st = m.st, cr = m.crowd;
  const vuln = i => (st[i] === 2 || st[i] === 4) && cr[i] === sgn(base[i]) && cr[i] !== 0;
  const a1 = new Array(n), a2 = new Array(n), a3 = new Array(n), a4 = new Array(n);
  let blocked = 0;   // side currently held flat by the entry filter
  for (let i = 0; i < n; i++) {
    const s = sgn(base[i]), prev = i ? sgn(base[i - 1]) : 0;
    if (blocked && s !== blocked) blocked = 0;                         // base flipped: filter released
    if (!blocked && s !== 0 && s !== prev && vuln(i)) blocked = s;     // new entry into a vulnerable crowd
    if (blocked && !vuln(i)) blocked = 0;                              // condition cleared
    a1[i] = blocked ? 0 : base[i];
    const same = cr[i] !== 0 && cr[i] === s;
    a2[i] = same && (st[i] === 2 || st[i] === 4) ? base[i] * 0.5 : base[i];
    a3[i] = same && st[i] === 4 ? 0 : base[i];
    a4[i] = !same ? base[i] : st[i] === 2 ? base[i] * 0.5 : st[i] === 4 ? 0 : base[i];
  }
  return { BASE: base, A1: a1, A2: a2, A3: a3, A4: a4 };
}
const prepared = Object.fromEntries(SYMS.map(s => [s, { closes: data.markets[s].closes, set: data.markets[s].set, arms: arms(data.markets[s]) }]));
const ARMS = ['BASE', 'A1', 'A2', 'A3', 'A4'];

const range = ([a, b]) => { const lo = dates.findIndex(d => d >= a); let hi = dates.length - 1; while (hi >= 0 && dates[hi] > b) hi--; return [lo, hi]; };
const R = Object.fromEntries(Object.entries(PERIODS).map(([k, v]) => [k, range(v)]));

function basket(syms, arm) {
  const pr = buildPortfolioReturns(syms.map(s => ({ symbol: s, closes: prepared[s].closes, signalSeries: prepared[s].arms[arm] })), DEFAULTS);
  if (!pr.ok) throw new Error(pr.error);
  if (pr.L !== dates.length) throw new Error('alignment: L != grid length');
  return pr;
}
const cvar = (r, q = 0.025) => { const s = [...r].sort((a, b) => a - b); const k = Math.max(1, Math.floor(s.length * q)); let t = 0; for (let i = 0; i < k; i++) t += s[i]; return t / k; };
const sharpeRaw = r => { let m = 0; for (const x of r) m += x; m /= r.length; let v = 0; for (const x of r) v += (x - m) ** 2; const sd = Math.sqrt(v / (r.length - 1)); return sd > 0 ? m / sd * Math.sqrt(DAY) : 0; };
function stats(ret, [lo, hi]) {
  const r = ret.slice(lo, hi + 1), a = annualize(r), eq = equityFrom([0, ...r]), yrs = r.length / DAY;
  return { sharpe: +a.sharpe.toFixed(3), cagr: +((Math.pow(eq[eq.length - 1], 1 / yrs) - 1) * 100).toFixed(2),
           maxDD: +(maxDrawdownFromEquity(eq) * 100).toFixed(2), cvar975: +(cvar(r) * 100).toFixed(3), annVol: +(a.annVol * 100).toFixed(2), days: r.length };
}
function turnover(pr, [lo, hi]) { let t = 0; for (const p of pr.per) for (let i = Math.max(lo, 1); i <= hi; i++) t += Math.abs(p.positions[i] - p.positions[i - 1]); return +(t / pr.per.length / ((hi - lo + 1) / DAY)).toFixed(2); }
function altered(syms, arm, [lo, hi]) { let n = 0, k = 0; for (const s of syms) { const P = prepared[s].arms; for (let i = lo; i <= hi; i++) { if (P.BASE[i] === 0) continue; n++; if (P[arm][i] !== P.BASE[i]) k++; } } return n ? +(100 * k / n).toFixed(2) : 0; }

const phi = z => 0.5 * (1 + erf(z / Math.SQRT2));
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
const pFromCI = (est, lo, hi) => { const se = (hi - lo) / (2 * 1.959964); return se > 0 ? 2 * (1 - phi(Math.abs(est) / se)) : 1; };

function bootPaired(a, b, [lo, hi], rng, fn) {
  const A = a.slice(lo, hi + 1), B = b.slice(lo, hi + 1), n = A.length, nb = Math.ceil(n / BLOCK);
  const est = fn(A) - fn(B), out = [], xa = new Array(nb * BLOCK), xb = new Array(nb * BLOCK);
  for (let r = 0; r < REPS; r++) {
    let k = 0;
    for (let j = 0; j < nb; j++) { const st = Math.floor(rng() * (n - BLOCK + 1)); for (let t = 0; t < BLOCK; t++) { xa[k] = A[st + t]; xb[k] = B[st + t]; k++; } }
    out.push(fn(xa) - fn(xb));
  }
  out.sort((x, y) => x - y);
  const l = out[Math.floor(0.025 * REPS)], h = out[Math.floor(0.975 * REPS) - 1];
  return { est: +est.toFixed(4), lo: +l.toFixed(4), hi: +h.toFixed(4), p: +pFromCI(est, l, h).toFixed(4) };
}

const rng = mulberry32(SEED);
function family(label, syms, withBoot = true) {
  const pr = Object.fromEntries(ARMS.map(a => [a, basket(syms, a)]));
  const res = { label, nMarkets: syms.length, arms: {}, diff: {} };
  for (const a of ARMS) {
    res.arms[a] = Object.fromEntries(Object.keys(PERIODS).map(k => [k, { ...stats(pr[a].scaled, R[k]), turnover: turnover(pr[a], R[k]), alteredPct: altered(syms, a, R[k]) }]));
  }
  if (withBoot) {
    for (const a of ARMS.slice(1)) {
      const d = { sharpeOOS: bootPaired(pr[a].scaled, pr.BASE.scaled, R.OOS, rng, sharpeRaw),
                  sharpeIS: bootPaired(pr[a].scaled, pr.BASE.scaled, R.IS, rng, sharpeRaw),
                  sharpeOOS1: +(stats(pr[a].scaled, R.OOS1).sharpe - stats(pr.BASE.scaled, R.OOS1).sharpe).toFixed(3),
                  sharpeOOS2: +(stats(pr[a].scaled, R.OOS2).sharpe - stats(pr.BASE.scaled, R.OOS2).sharpe).toFixed(3) };
      if (a === 'A2') {
        d.cvarOOS = bootPaired(pr[a].scaled, pr.BASE.scaled, R.OOS, rng, r => cvar(r) * 100);
        d.cvarOOS1 = +(stats(pr[a].scaled, R.OOS1).cvar975 - stats(pr.BASE.scaled, R.OOS1).cvar975).toFixed(4);
        d.cvarOOS2 = +(stats(pr[a].scaled, R.OOS2).cvar975 - stats(pr.BASE.scaled, R.OOS2).cvar975).toFixed(4);
        d.maxDDdiffOOS = +(res.arms[a].OOS.maxDD - res.arms.BASE.OOS.maxDD).toFixed(2);
      }
      res.diff[a] = d;
    }
  }
  res.yearly = Object.fromEntries(ARMS.map(a => { const by = {}; for (let i = R.IS[0]; i <= R.OOS[1]; i++) { const y = dates[i].slice(0, 4); by[y] = (by[y] ?? 1) * (1 + pr[a].scaled[i]); } return [a, Object.fromEntries(Object.entries(by).map(([y, g]) => [y, +((g - 1) * 100).toFixed(2)]))]; }));
  return { res, pr };
}

const main = family('all 34 markets', SYMS);
const disc = family('12 discovery markets (sanity vs cot-trend-filter BASE)', SYMS.filter(s => prepared[s].set === 'discovery'), false);
const ex10 = family('ex-10Y (33 markets, descriptive)', SYMS.filter(s => s !== 'TY'), false);

// registered gates
const D = main.res.diff, cells = {};
for (const a of ['A1', 'A3', 'A4']) {
  const d = D[a], s = Math.sign(d.sharpeOOS.est);
  const checks = { 'OOS Sharpe diff CI excludes 0': d.sharpeOOS.lo > 0 || d.sharpeOOS.hi < 0,
                   'same sign both OOS subperiods': s !== 0 && Math.sign(d.sharpeOOS1) === s && Math.sign(d.sharpeOOS2) === s,
                   'improves (diff > 0)': d.sharpeOOS.est > 0 };
  cells[a] = { metric: 'OOS Sharpe diff vs BASE', est: d.sharpeOOS.est, ci: [d.sharpeOOS.lo, d.sharpeOOS.hi], p: d.sharpeOOS.p, checks };
}
{
  const d = D.A2, s = Math.sign(d.cvarOOS.est);
  cells.A2 = { metric: 'OOS daily CVaR(97.5%) diff vs BASE (% points; + = less severe tail)', est: d.cvarOOS.est, ci: [d.cvarOOS.lo, d.cvarOOS.hi], p: d.cvarOOS.p,
    checks: { 'CVaR improves, CI excludes 0': d.cvarOOS.lo > 0,
              'max DD no worse': d.maxDDdiffOOS >= 0,
              'Sharpe diff lower CI > -0.10': d.sharpeOOS.lo > -0.10,
              'CVaR diff same sign both OOS subperiods': s !== 0 && Math.sign(d.cvarOOS1) === s && Math.sign(d.cvarOOS2) === s },
    sharpeOOS: d.sharpeOOS, maxDDdiffOOS: d.maxDDdiffOOS };
}
const out = { id: 'cot-crowding-programme', phase: 4, part: 'trend system A1-A4', seed: SEED, block: BLOCK, reps: REPS, periods: PERIODS,
  engine: 'js/trendFollowEngine.js DEFAULTS (imported unchanged)', defaults: DEFAULTS, cells, main: main.res, sanityDiscovery: disc.res, ex10Y: ex10.res };
fs.writeFileSync(path.join(OUT, 'phase4_trend.json'), JSON.stringify(out, null, 1));

console.log('SANITY discovery BASE', JSON.stringify(disc.res.arms.BASE.IS), JSON.stringify(disc.res.arms.BASE.OOS));
for (const a of ARMS) console.log(a.padEnd(5), 'IS', JSON.stringify(main.res.arms[a].IS), '\n      OOS', JSON.stringify(main.res.arms[a].OOS), '\n      OOS1', JSON.stringify(main.res.arms[a].OOS1), 'OOS2', JSON.stringify(main.res.arms[a].OOS2));
for (const [a, c] of Object.entries(cells)) console.log(a, JSON.stringify(c));
for (const a of ARMS) console.log('ex10', a, JSON.stringify(ex10.res.arms[a].OOS));
