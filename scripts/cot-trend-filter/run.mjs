// cot-trend-filter, step 2 of 2: does COT positioning improve the desk's trend system?
//
// EXPLORATORY, NOT PRE-REGISTERED. The filter idea came from cot-extreme-duration (fresh
// extremes kept trending, long-held ones went flat), run on the same 2007-2026 data, so a
// pass here is a lead for a forward / lockbox test, not a result. Design fixed in this
// header before any outcome was computed; one seed, 20261022.
//
// Trend system: js/trendFollowEngine.js, IMPORTED, not copied (Lego rule). momentumSignal
// (mean sign of 21/63/126/252-day returns) is the base signal; the arms inject a filtered
// copy through backtestMarket's signalSeries parameter and run through the engine's own
// buildPortfolioReturns with DEFAULTS (inverse-vol sizing, 2bp cost on turnover, equal-
// weight basket vol-targeted to 10% on a strictly-past window). Nothing else is changed.
//
// Data: analysis/output/cot-trend-filter/aligned.json (scripts/cot-trend-filter/prep.py):
// 12 markets (EUR GBP AUD JPY CAD CHF USD GOLD SILVER NQ ES TY) on one business-day grid,
// daily CME futures / ICE DXY closes (JPY/CAD/CHF inverted to pair terms), 2005-01-03 ->
// 2026-08-21 (lockbox cut). Per day, the COT state from the last report released strictly
// before that day: crowd side, and the share of the last 26 reports at the >= 80th
// stretch on each side.
//
// Arms (fixed, no tuning):
//   BASE        momentumSignal unchanged.
//   FILTER_CUT  signal -> 0 on days where the COT crowd is on the SAME side as the signal
//               AND that side was at s >= 80 in >= 2/3 of the last 26 reports
//               ("the trend's own crowd has been stretched for most of 6 months").
//   FILTER_HALF same condition, signal x 0.5.
//   FRESH_ONLY  descriptive only: trade only when the signal side's 26-report stretch
//               share is < 1/3 (signal kept as is where the share is not yet known).
//
// Split: IS 2007-06-01 -> 2016-12-31, OOS 2017-01-01 -> 2026-08-21. The COT state is first
// available 2007-12-10, so the arms are identical before that.
// Per arm and period: Sharpe, annual return, annual vol, CAGR, max DD, turnover per year,
// % of market-days with a non-zero base signal that the filter touched.
// Inference: Sharpe(arm) - Sharpe(BASE) on paired daily portfolio returns, moving-block
// bootstrap, block 63 days, 2000 reps, mulberry32(20261022).
// Decision rule: the filter "helps" only if the OOS Sharpe difference is > 0 with a 95%
// CI excluding 0 AND the IS difference has the same sign. Otherwise it does not.
// Also: per-market OOS Sharpe (base vs cut), an ex-10Y basket (10Y leveraged-fund
// positioning is mostly the cash-futures basis trade), and a calendar-year return table.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { momentumSignal, buildPortfolioReturns, annualize, equityFrom, DEFAULTS } from '../../js/trendFollowEngine.js';
import { maxDrawdownFromEquity } from '../../js/metricsCore.js';
import { mulberry32 } from '../../js/statsCore.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'analysis/output/cot-trend-filter');
const SEED = 20261022, REPS = 2000, BLOCK = 63, DAY = 252;
const IS = ['2007-06-01', '2016-12-31'], OOS = ['2017-01-01', '2026-08-21'];

const data = JSON.parse(fs.readFileSync(path.join(OUT, 'aligned.json'), 'utf8'));
const dates = data.dates;
const SYMS = Object.keys(data.markets);

function condAt(m, sig, i) {
  const s = sig[i];
  if (s > 0) return m.crowd[i] === 1 && m.longShare[i] != null && m.longShare[i] >= 2 / 3;
  if (s < 0) return m.crowd[i] === -1 && m.shortShare[i] != null && m.shortShare[i] >= 2 / 3;
  return false;
}
function freshAt(m, sig, i) {
  const s = sig[i];
  const sh = s > 0 ? m.longShare[i] : s < 0 ? m.shortShare[i] : null;
  return sh == null ? true : sh < 1 / 3;
}

const prepared = {};
for (const sym of SYMS) {
  const m = data.markets[sym];
  const base = momentumSignal(m.closes, DEFAULTS.lookbacks);
  const cond = base.map((_, i) => condAt(m, base, i));
  prepared[sym] = {
    closes: m.closes, base, cond,
    arms: {
      BASE: base,
      FILTER_CUT: base.map((s, i) => (cond[i] ? 0 : s)),
      FILTER_HALF: base.map((s, i) => (cond[i] ? s * 0.5 : s)),
      FRESH_ONLY: base.map((s, i) => (freshAt(m, base, i) ? s : 0)),
    },
  };
}
const ARMS = ['BASE', 'FILTER_CUT', 'FILTER_HALF', 'FRESH_ONLY'];

const idxRange = ([a, b]) => {
  const lo = dates.findIndex(d => d >= a);
  let hi = dates.length - 1; while (hi >= 0 && dates[hi] > b) hi--;
  return [lo, hi];
};
const [isLo, isHi] = idxRange(IS), [oosLo, oosHi] = idxRange(OOS);

function runBasket(syms, arm) {
  const markets = syms.map(s => ({ symbol: s, closes: prepared[s].closes, signalSeries: prepared[s].arms[arm] }));
  const pr = buildPortfolioReturns(markets, DEFAULTS);
  if (!pr.ok) throw new Error(pr.error);
  if (pr.L !== dates.length) throw new Error('alignment: L != grid length');
  return pr;
}

function stats(ret, lo, hi) {
  const r = ret.slice(lo, hi + 1);
  const a = annualize(r);
  const eq = equityFrom([0, ...r]);
  const years = r.length / DAY;
  return { sharpe: +a.sharpe.toFixed(3), annRet: +(a.annReturn * 100).toFixed(2), annVol: +(a.annVol * 100).toFixed(2),
           cagr: +((Math.pow(eq[eq.length - 1], 1 / years) - 1) * 100).toFixed(2),
           maxDD: +(maxDrawdownFromEquity(eq) * 100).toFixed(2), days: r.length };
}
function turnoverPerYear(pr, lo, hi) {
  let tot = 0;
  for (const p of pr.per) {
    for (let i = Math.max(lo, 1); i <= hi; i++) tot += Math.abs(p.positions[i] - p.positions[i - 1]);
  }
  return +(tot / pr.per.length / ((hi - lo + 1) / DAY)).toFixed(2);
}
function filteredShare(syms, arm, lo, hi) {
  let n = 0, k = 0;
  for (const s of syms) {
    const P = prepared[s];
    for (let i = lo; i <= hi; i++) {
      if (P.base[i] === 0) continue;
      n++; if (P.arms[arm][i] !== P.base[i]) k++;
    }
  }
  return n ? +(100 * k / n).toFixed(2) : 0;
}

const sharpeRaw = r => { let m = 0; for (const x of r) m += x; m /= r.length; let v = 0; for (const x of r) v += (x - m) ** 2; const sd = Math.sqrt(v / (r.length - 1)); return sd > 0 ? m / sd * Math.sqrt(DAY) : 0; };
function bootDiff(a, b, lo, hi, rng) {
  const A = a.slice(lo, hi + 1), B = b.slice(lo, hi + 1), n = A.length;
  const est = sharpeRaw(A) - sharpeRaw(B);
  const nb = Math.ceil(n / BLOCK), out = [];
  const xa = new Array(nb * BLOCK), xb = new Array(nb * BLOCK);
  for (let r = 0; r < REPS; r++) {
    let k = 0;
    for (let j = 0; j < nb; j++) {
      const st = Math.floor(rng() * (n - BLOCK + 1));
      for (let t = 0; t < BLOCK; t++) { xa[k] = A[st + t]; xb[k] = B[st + t]; k++; }
    }
    out.push(sharpeRaw(xa) - sharpeRaw(xb));
  }
  out.sort((x, y) => x - y);
  return { est: +est.toFixed(3), lo: +out[Math.floor(0.025 * REPS)].toFixed(3), hi: +out[Math.floor(0.975 * REPS) - 1].toFixed(3),
           pPos: +(out.filter(x => x > 0).length / REPS).toFixed(3) };
}

function yearly(ret) {
  const by = {};
  for (let i = isLo; i <= oosHi; i++) { const y = dates[i].slice(0, 4); by[y] = (by[y] ?? 1) * (1 + ret[i]); }
  return Object.fromEntries(Object.entries(by).map(([y, g]) => [y, +((g - 1) * 100).toFixed(2)]));
}

const rng = mulberry32(SEED);
function family(label, syms) {
  const pr = Object.fromEntries(ARMS.map(a => [a, runBasket(syms, a)]));
  const res = { label, markets: syms, arms: {}, diff: {} };
  for (const a of ARMS) {
    res.arms[a] = {
      IS: { ...stats(pr[a].scaled, isLo, isHi), turnover: turnoverPerYear(pr[a], isLo, isHi), filteredPct: filteredShare(syms, a, isLo, isHi) },
      OOS: { ...stats(pr[a].scaled, oosLo, oosHi), turnover: turnoverPerYear(pr[a], oosLo, oosHi), filteredPct: filteredShare(syms, a, oosLo, oosHi) },
    };
  }
  for (const a of ARMS.slice(1)) {
    res.diff[a] = { IS: bootDiff(pr[a].scaled, pr.BASE.scaled, isLo, isHi, rng), OOS: bootDiff(pr[a].scaled, pr.BASE.scaled, oosLo, oosHi, rng) };
    const d = res.diff[a];
    d.helps = d.OOS.est > 0 && d.OOS.lo > 0 && Math.sign(d.IS.est) === Math.sign(d.OOS.est);
  }
  res.yearly = Object.fromEntries(['BASE', 'FILTER_CUT', 'FILTER_HALF'].map(a => [a, yearly(pr[a].scaled)]));
  res.perMarket = Object.fromEntries(syms.map((s, j) => {
    const sh = (a, lo, hi) => +annualize(pr[a].per[j].dailyRet.slice(lo, hi + 1)).sharpe.toFixed(3);
    return [s, { IS_base: sh('BASE', isLo, isHi), IS_cut: sh('FILTER_CUT', isLo, isHi),
                 OOS_base: sh('BASE', oosLo, oosHi), OOS_cut: sh('FILTER_CUT', oosLo, oosHi),
                 OOS_filteredPct: filteredShare([s], 'FILTER_CUT', oosLo, oosHi) }];
  }));
  return res;
}

const all = family('all 12 markets', SYMS);
const ex10 = family('ex-10Y (11 markets)', SYMS.filter(s => s !== 'TY'));

// sanity: full-sample BASE Sharpe of the engine on this data
const basePr = runBasket(SYMS, 'BASE');
const sanity = { fullSampleBase: stats(basePr.scaled, isLo, oosHi) };

const results = {
  id: 'cot-trend-filter', label: 'exploratory, not pre-registered', seed: SEED, block: BLOCK, reps: REPS,
  IS, OOS, cotFirstAvailable: '2007-12-10', engine: 'js/trendFollowEngine.js DEFAULTS', defaults: DEFAULTS,
  sanity, families: { all, ex10 },
};
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));

// compact page data
const pick = f => ({
  arms: Object.fromEntries(Object.entries(f.arms).map(([a, v]) => [a, {
    IS: [v.IS.sharpe, v.IS.cagr, v.IS.maxDD, v.IS.turnover, v.IS.filteredPct],
    OOS: [v.OOS.sharpe, v.OOS.cagr, v.OOS.maxDD, v.OOS.turnover, v.OOS.filteredPct] }])),
  diff: Object.fromEntries(Object.entries(f.diff).map(([a, d]) => [a, { IS: [d.IS.est, d.IS.lo, d.IS.hi], OOS: [d.OOS.est, d.OOS.lo, d.OOS.hi], helps: d.helps }])),
  yearly: f.yearly,
  perMarket: Object.fromEntries(Object.entries(f.perMarket).map(([s, v]) => [s, [v.OOS_base, v.OOS_cut, v.OOS_filteredPct]])),
});
const page = { id: 'cot-trend-filter', status: 'exploratory, not pre-registered', IS, OOS,
  fields: 'arms: [Sharpe, CAGR %, max DD %, turnover/yr, % of signal-days filtered]; diff: [Sharpe diff vs BASE, 95% CI lo, hi]; perMarket: [OOS Sharpe base, OOS Sharpe cut, % OOS signal-days cut]',
  all: pick(all), ex10: pick(ex10) };
fs.writeFileSync(path.join(ROOT, 'js/cotTrendFilterData.js'),
  '// GENERATED by scripts/cot-trend-filter/run.mjs -- do not edit by hand.\n'
  + '// Does a COT filter improve the desk\'s trend system (js/trendFollowEngine.js)? 2007-2026, lockbox excluded.\n'
  + '// Exploratory, not pre-registered: analysis/output/cot-trend-filter/RESULTS.md\n'
  + 'window.COT_TREND_FILTER = ' + JSON.stringify(page) + ';\n');

const line = (f) => {
  console.log(`\n== ${f.label}`);
  for (const a of ARMS) { const v = f.arms[a]; console.log(a.padEnd(12), 'IS', JSON.stringify(v.IS), '\n'.padEnd(14), 'OOS', JSON.stringify(v.OOS)); }
  for (const [a, d] of Object.entries(f.diff)) console.log('diff', a.padEnd(12), 'IS', JSON.stringify(d.IS), 'OOS', JSON.stringify(d.OOS), 'helps', d.helps);
  console.log('perMarket', JSON.stringify(f.perMarket));
  console.log('yearly', JSON.stringify(f.yearly));
};
console.log('sanity', JSON.stringify(sanity));
line(all); line(ex10);
