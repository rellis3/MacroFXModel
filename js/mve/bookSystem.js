// mve/bookSystem.js — the factor-neutral spread book as a SIZED SYSTEM: vol-targeted
// equity curve, CAGR / Sharpe / drawdown, and a per-trade list. Pure: no I/O.
// Pre-registration: MD files/MVE_BOOK_SYSTEM_BACKTEST.md.
//
// The audit (bookFactor.runBookLayer) answered "dollar bet or relative value?" at
// an arbitrary size (the neutral book rescaled to the raw book's gross). A system
// needs a sizing rule, so this module adds one — fixed in advance, not tuned:
//
//   1. Each open sleeve trade i (2Y or 10Y, ½ weight each, as in the audit) is a
//      currency vector w_i; its hedged version h_i = projectOut(w_i, [sd⊙V_1..K, 1])
//      — the SAME projection bookFactor.neutralBook uses. The projection is
//      linear, so the book H = Σ h_i and every trade's share of it is exact.
//   2. Ex-ante book vol σ = √(Hᵀ Σ H), Σ = the window's covariance of
//      currency-vs-USD returns (nothing after the close is used).
//   3. Scale s = min(targetVol/√252 / σ, maxGross / gross(H)): the book runs at
//      the target vol whenever anything is open, capped at maxGross× equity.
//   4. Positions (fraction of equity) on the 7 USD majors = s · H; next-day
//      return minus 1 bp one-way on every unit of turnover (hedge legs included).
//
// Per-trade P&L is each trade's own scaled hedged package, marked daily; its
// cost is its own turnover (so trade costs sum to ≥ the book's, which nets).
// MAE is read off the DAILY-close path of the package (no intraday path for a
// 7-leg hedged package — stated, not hidden).

import {
  USD_MAJORS, CCYS, windowFactors, exposureColumns, projectOut, pairToCurrency, currencyToPair, grossOf, BOOK_DEFAULTS,
} from './bookFactor.js';
import {
  sharpeRatio, sortinoRatio, calmar, sharpeStdError, maxDrawdownFromEquity, skewness, excessKurtosis,
  winRate, profitFactor,
} from '../metricsCore.js';

export const SYSTEM_DEFAULTS = {
  targetVol: 0.10,     // 10% annualised ex-ante while positions are open
  maxGross: 5,         // gross notional cap, × equity
  K: 2,                // the audit's noise-band K, frozen
  window: BOOK_DEFAULTS.window,
  costOneWay: 0.0001,  // 1 bp per unit of one-way turnover, every leg
  sleeveWeight: 0.5,   // 2Y and 10Y at ½ each (equal risk, as in the audit)
  riskHorizonDays: 20, // R-unit horizon = the sleeves' max hold
  hedgeMode: 'pcs+usd', // 'pcs+usd' = K PCs + basket + net-USD (primary) · 'pcs' = the audit's hedge · hedge:false = raw
};

// Why 'pcs+usd' (found on synthetic data 2026-09-22, BEFORE any real run of this
// module): after the basket de-mean + standardisation, a broad dollar move lands
// almost entirely on the USD column (every other currency's loading sits near the
// basket average), so it is effectively a one-column component and need not be
// among the top-K PCs. The audit's PC-only hedge left a synthetic dollar book
// ~1/3 short USD (w_USD −3.5 → −1.1) and the dollar edge leaked straight through.
// Projecting off the USD unit vector as well makes the book's net USD exactly 0.
const USD_UNIT = CCYS.map(c => (c === 'USD' ? 1 : 0));

function cov(X) {
  const n = X.length, m = X[0].length;
  const mu = new Array(m).fill(0);
  for (const r of X) for (let j = 0; j < m; j++) mu[j] += r[j] / n;
  const C = Array.from({ length: m }, () => new Array(m).fill(0));
  for (const r of X) for (let i = 0; i < m; i++) { const di = r[i] - mu[i]; for (let j = i; j < m; j++) C[i][j] += di * (r[j] - mu[j]); }
  for (let i = 0; i < m; i++) for (let j = i; j < m; j++) { C[i][j] /= (n - 1); C[j][i] = C[i][j]; }
  return C;
}
const quad = (w, C) => { let s = 0; for (let i = 0; i < w.length; i++) for (let j = 0; j < w.length; j++) s += w[i] * C[i][j] * w[j]; return s; };
const scale = (pos, k) => Object.fromEntries(Object.entries(pos).map(([p, v]) => [p, v * k]));
const pairKeyOf = tr => String(tr.pairKey || tr.pair).toLowerCase().replace('/', '');

// ── one day's system book (THE single implementation: runBookSystem's walk and the
//    forward tracker both call this) ─────────────────────────────────────────
// win: the currency returns ending at the decision close; trades: sleeve trades
// ({pair|pairKey, sign|dir, entry|date, exit|exitDate}); closeDate: the decision close.
export function systemBookAt({ win, trades, closeDate, o: oIn = {} }) {
  const o = { ...SYSTEM_DEFAULTS, ...oIn };
  const hedge = o.hedge !== false;
  const fm = windowFactors(win);
  const cols = [...exposureColumns(fm, o.K), new Array(CCYS.length).fill(1), ...(o.hedgeMode === 'pcs+usd' ? [USD_UNIT] : [])];
  const C = cov(win);
  const norm = x => ({ x, pair: x.pair ?? pairKeyOf(x), sign: x.sign ?? (x.dir === 'LONG' ? 1 : -1), entry: x.entry ?? x.date, exit: x.exit ?? x.exitDate });
  const legs = trades.map(norm).filter(n => n.entry <= closeDate && closeDate < n.exit).map(n => {
    const w = pairToCurrency({ [n.pair]: o.sleeveWeight * n.sign });
    return { x: n.x, pair: n.pair, w, h: hedge ? projectOut(w, cols) : w };
  });
  const H = new Array(CCYS.length).fill(0), Wraw = new Array(CCYS.length).fill(0);
  for (const l of legs) { l.h.forEach((v, i) => { H[i] += v; }); l.w.forEach((v, i) => { Wraw[i] += v; }); }
  const sig = Math.sqrt(Math.max(0, quad(H, C)));
  const Hp = currencyToPair(H);
  const g = grossOf(Hp);
  // A book that hedges away to ~nothing (e.g. a pure dollar bet under 'pcs+usd') is
  // flat, not float noise scaled up to the gross cap: compare against the raw legs.
  const rawGross = legs.reduce((a, l) => a + grossOf(currencyToPair(l.w)), 0);
  const s = (sig > 1e-12 && g > 1e-9 * Math.max(rawGross, 1e-12)) ? Math.min(o.targetVol / Math.sqrt(252) / sig, o.maxGross / g) : 0;
  const book = scale(Hp, s);
  const expCols = exposureColumns(fm, o.K);
  const expo = w => expCols.map(c => c.reduce((a, v, i) => a + v * w[i], 0));
  const hg = H.reduce((a, v) => a + Math.abs(v), 0) / 2;
  return {
    legs, H, sig, g, s, book, C,
    exposurePre: expo(Wraw.map(v => v * s)), exposurePost: expo(H.map(v => v * s)),
    usdShare: hg > 1e-12 ? Math.abs(H[CCYS.indexOf('USD')]) / hg : null,
  };
}

// trades: [{ sleeve, pair, dir, date (entry close), exitDate (exit close) }]
// Returns daily streams + trade list. `hedge:false` runs the SAME sizing on the
// unhedged trades (the raw sleeves at the same target vol) — the incumbent.
export function runBookSystem({ dates, R, pairRet, closeDates, trades, opts = {} }) {
  const o = { ...SYSTEM_DEFAULTS, ...opts };
  const hedge = o.hedge !== false;
  const n = R.length;
  const pairs = Object.keys(USD_MAJORS);
  const tgtDaily = o.targetVol / Math.sqrt(252);
  const tr = trades.map((t, id) => ({
    id, sleeve: t.sleeve, pair: pairKeyOf(t), dir: t.dir, entry: t.date, exit: t.exitDate || closeDates[closeDates.length - 1],
    sign: t.dir === 'LONG' ? 1 : -1, prev: {}, gross: 0, cost: 0, path: [], days: 0, entryRisk: null, entryEquity: null,
  }));
  const out = { dates: [], gross: [], cost: [], net: [], leverage: [], exAnteVol: [], nOpen: [], usdShare: [] };
  let prevBook = {}, equity = 1;

  for (let t = o.window - 1; t < n - 1; t++) {
    const ci = t + 1;                       // close index the decision is made at
    const d = closeDates[ci];
    const win = R.slice(t - o.window + 1, t + 1);
    const { legs, H, sig, g, s, book, C } = systemBookAt({ win, trades: tr, closeDate: d, o: { ...o, hedge } });
    const open = legs.map(l => l.x);

    // next-day P&L of the book and of each trade's own package
    const ret = p => pairRet[p][t + 1];
    let gross = 0; for (const [p, v] of Object.entries(book)) if (v) gross += v * ret(p);
    let cost = 0; for (const p of pairs) cost += Math.abs((book[p] || 0) - (prevBook[p] || 0)) * o.costOneWay;
    const net = gross - cost;
    for (const l of legs) {
      const x = l.x, pos = scale(currencyToPair(l.h), s);
      if (x.entryRisk == null) {
        x.entryRisk = Math.sqrt(Math.max(0, quad(l.h.map(v => v * s), C))) * Math.sqrt(o.riskHorizonDays);
        x.entryEquity = equity;
      }
      let gx = 0; for (const [p, v] of Object.entries(pos)) if (v) gx += v * ret(p);
      let cx = 0; for (const p of pairs) cx += Math.abs((pos[p] || 0) - (x.prev[p] || 0)) * o.costOneWay;
      x.gross += gx; x.cost += cx; x.days++; x.prev = pos;
      x.path.push(x.gross - x.cost);
    }
    // trades that were open at the last close and aren't now (exit reached, even if
    // the exit date itself was a dropped weekend/missing day): closing costs its turnover
    const openIds = new Set(open.map(x => x.id));
    for (const x of tr) if (!openIds.has(x.id) && Object.keys(x.prev).length) {
      let cx = 0; for (const p of pairs) cx += Math.abs(x.prev[p] || 0) * o.costOneWay;
      x.cost += cx; x.prev = {}; x.path.push(x.gross - x.cost);
    }
    equity *= 1 + net;
    prevBook = book;
    out.dates.push(dates[t + 1]); out.gross.push(gross); out.cost.push(cost); out.net.push(net);
    out.leverage.push(g * s); out.exAnteVol.push(sig * s * Math.sqrt(252)); out.nOpen.push(open.length);
    // leftover dollar: |net USD| as a share of the book's one-sided currency gross
    const hg = H.reduce((a, v) => a + Math.abs(v), 0) / 2;
    out.usdShare.push(hg > 1e-12 ? Math.abs(H[CCYS.indexOf('USD')]) / hg : null);
  }

  const tradeList = tr.filter(x => x.days > 0).map(x => ({
    id: x.id, sleeve: x.sleeve, pair: x.pair.toUpperCase(), dir: x.dir, entry: x.entry, exit: x.exit, days: x.days,
    retPct: +((x.gross - x.cost) * 100).toFixed(4),
    grossPct: +(x.gross * 100).toFixed(4), costPct: +(x.cost * 100).toFixed(4),
    maePct: +(Math.min(0, ...x.path) * 100).toFixed(4),
    riskPct: x.entryRisk != null ? +(x.entryRisk * 100).toFixed(4) : null,
    R: x.entryRisk > 0 ? +((x.gross - x.cost) / x.entryRisk).toFixed(3) : null,
    maeR: x.entryRisk > 0 ? +(Math.min(0, ...x.path) / x.entryRisk).toFixed(3) : null,
    entryEquity: x.entryEquity,
  }));
  return { ...out, trades: tradeList, config: { ...o, hedge, hedgeMode: hedge ? o.hedgeMode : 'none' } };
}

// ── metrics ─────────────────────────────────────────────────────────────────
export function systemMetrics(net, dates, { leverage = null, costs = null, trades = null, usdShare = null } = {}) {
  const n = net.length;
  if (n < 2) return null;
  let eq = 1; const curve = net.map(r => (eq *= 1 + r));
  const years = n / 252;
  const cagr = Math.pow(curve[n - 1], 1 / years) - 1;
  const mean = net.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(net.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const sharpe = sharpeRatio(net, 252, 1);
  const mdd = maxDrawdownFromEquity([1, ...curve]);
  let peak = 1, under = 0, maxUnder = 0;
  for (const v of curve) { if (v >= peak) { peak = v; under = 0; } else { under++; maxUnder = Math.max(maxUnder, under); } }
  const active = leverage ? leverage.filter(l => l > 1e-9) : null;
  const m = {
    days: n, years: +years.toFixed(2), from: dates[0], to: dates[n - 1],
    cagrPct: +(cagr * 100).toFixed(2), annVolPct: +(sd * Math.sqrt(252) * 100).toFixed(2),
    sharpe: +sharpe.toFixed(3), sharpeSE: +sharpeStdError(sharpe, n, 252).toFixed(3),
    sortino: +sortinoRatio(net, 252).toFixed(3),
    maxDdPct: +(mdd * 100).toFixed(2), calmar: +calmar(cagr, mdd).toFixed(3),
    longestUnderwaterDays: maxUnder, totalPct: +((curve[n - 1] - 1) * 100).toFixed(2),
    skew: +skewness(net).toFixed(3), exKurt: +excessKurtosis(net).toFixed(3),
    pctDaysInMarket: active ? +(active.length / n * 100).toFixed(1) : null,
    avgGrossWhenActive: active && active.length ? +(active.reduce((a, b) => a + b, 0) / active.length).toFixed(2) : null,
    costDragPctPerYr: costs ? +(costs.reduce((a, b) => a + b, 0) / years * 100).toFixed(3) : null,
  };
  if (usdShare) {
    const u = usdShare.filter(v => v != null);
    m.meanUsdSharePct = u.length ? +(u.reduce((a, b) => a + b, 0) / u.length * 100).toFixed(1) : null;
  }
  if (leverage) m.pctActiveDaysAtGrossCap = active && active.length ? +(active.filter(l => l >= SYSTEM_DEFAULTS.maxGross - 1e-9).length / active.length * 100).toFixed(1) : null;
  if (trades) {
    const r = trades.map(t => t.retPct);
    m.trades = trades.length;
    m.winRatePct = +(winRate(r) * 100).toFixed(1);
    m.profitFactor = +profitFactor(r).toFixed(2);
    m.avgTradePct = r.length ? +(r.reduce((a, b) => a + b, 0) / r.length).toFixed(4) : null;
    m.avgHoldDays = trades.length ? +(trades.reduce((a, t) => a + t.days, 0) / trades.length).toFixed(1) : null;
  }
  return m;
}

export function byPeriod(dates, net, len) {   // len 4 = year, 7 = month
  const out = {};
  dates.forEach((d, i) => { const k = d.slice(0, len); out[k] = (out[k] ?? 1) * (1 + net[i]); });
  for (const k in out) out[k] = +((out[k] - 1) * 100).toFixed(2);
  return out;
}

// Pre-registered reading (MVE_BOOK_SYSTEM_BACKTEST.md §3).
export function readSystem(full, is, oos, fullCost2x) {
  const checks = {
    fullSharpeGe05: full.sharpe >= 0.5,
    isSharpePositive: is.sharpe > 0,
    oosSharpeGe05: oos.sharpe >= 0.5,
    maxDdWithin25: full.maxDdPct >= -25,
    cost2xFullSharpeGe03: fullCost2x.sharpe >= 0.3,
  };
  const pass = Object.values(checks).every(Boolean);
  return { verdict: pass ? 'SYSTEM-WORTHY' : 'NOT-YET', checks };
}
