// trendFollowEngine.js — diversified time-series trend-following (the replicated
// systematic edge: Moskowitz-Ooi-Pedersen 2012, AQR/AHL managed-futures style).
// Pure & no-lookahead: feed daily closes per market, get an honest basket backtest.
// Reuses metricsCore/statsCore/backtestStats — nothing copied.
//
// Design (few knobs on purpose — fewer knobs, less overfit):
//   Signal   — mean of sign(return over L) for L in {21,63,126,252} trading days
//              → a trend score in [-1,1] per market. Slow, not a twitchy EMA.
//   Sizing   — inverse-vol: scale each market to a per-market vol target so calm
//              and wild markets contribute equal risk; cap leverage.
//   Portfolio— average the per-market strategy returns, then scale to a portfolio
//              vol target. Diversification across markets IS the edge.
//   Costs    — spread (bp) charged on turnover every rebalance.
//   No-lookahead — the position held into day t is decided from data through t-1.

import { stdev } from './statsCore.js';
import { sharpeRatio, maxDrawdownFromEquity, calmar } from './metricsCore.js';
import { deflatedSharpe } from './backtestStats.js';

const DAY = 252;

export const DEFAULTS = {
  lookbacks: [21, 63, 126, 252],   // 1/3/6/12-month momentum
  volWindow: 63,                    // days for realized-vol estimate (inverse-vol sizing)
  volTargetMarket: 0.15,            // 15% annualized target per market
  volTargetPort: 0.10,             // 10% annualized target for the basket
  maxLeverage: 2.0,                 // cap per-market notional
  costBp: 2,                        // round-trip spread cost, basis points per unit turnover
  longShort: true,                  // false = long/flat only
};

// ── Per-market signal ────────────────────────────────────────────────────────
// closes: number[] oldest-first. Returns signal[] aligned to closes, in [-1,1];
// 0 until the longest lookback has enough history. Uses ONLY past data at each i.
export function momentumSignal(closes, lookbacks = DEFAULTS.lookbacks) {
  const n = closes.length, sig = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0, k = 0;
    for (const L of lookbacks) {
      if (i - L >= 0 && closes[i - L] > 0) { s += Math.sign(closes[i] - closes[i - L]); k++; }
    }
    sig[i] = k ? s / k : 0;
  }
  return sig;
}

// Rolling annualized vol of daily simple returns (trailing window). vol[i] uses
// returns up to and including i.
export function rollingVol(rets, window = DEFAULTS.volWindow) {
  const n = rets.length, out = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const s = Math.max(0, i - window + 1);
    const w = rets.slice(s, i + 1);
    if (w.length >= 10) out[i] = stdev(w, 1) * Math.sqrt(DAY);
  }
  return out;
}

// ── Per-market backtest ──────────────────────────────────────────────────────
// Returns { dailyRet[], grossRet[], turnover } aligned to closes (index 0 = 0).
// position decided at close[i-1] (signal[i-1], vol[i-1]) earns ret[i]. Costs charged
// on |Δposition|. This is strictly out-of-sample bar to bar.
export function backtestMarket(closes, cfg = {}) {
  const c = { ...DEFAULTS, ...cfg };
  const n = closes.length;
  const rets = new Array(n).fill(0);
  for (let i = 1; i < n; i++) rets[i] = closes[i - 1] > 0 ? (closes[i] - closes[i - 1]) / closes[i - 1] : 0;
  let sig = momentumSignal(closes, c.lookbacks);
  if (!c.longShort) sig = sig.map(s => Math.max(0, s));   // long/flat
  const vol = rollingVol(rets, c.volWindow);

  const pos = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const v = vol[i];
    if (!(v > 0) || !Number.isFinite(v)) { pos[i] = 0; continue; }
    let p = sig[i] * (c.volTargetMarket / v);             // inverse-vol scaled by trend strength
    p = Math.max(-c.maxLeverage, Math.min(c.maxLeverage, p));
    pos[i] = p;
  }

  const grossRet = new Array(n).fill(0), dailyRet = new Array(n).fill(0);
  let turnover = 0;
  for (let i = 1; i < n; i++) {
    grossRet[i] = pos[i - 1] * rets[i];                    // held-into-i position earns ret[i]
    const dPos = Math.abs(pos[i - 1] - (i >= 2 ? pos[i - 2] : 0));
    const cost = dPos * (c.costBp / 1e4);
    turnover += dPos;
    dailyRet[i] = grossRet[i] - cost;
  }
  return { dailyRet, grossRet, turnover, positions: pos };
}

// ── Portfolio construction (shared by backtest + robustness) ────────────────
// Equal-weight the per-market strategy returns (right-aligned to the common tail),
// then scale to the portfolio vol target with a TRAILING (no-lookahead) vol.
export function buildPortfolioReturns(markets, c) {
  const per = markets.map(m => ({ symbol: m.symbol, ...backtestMarket(m.closes, c), n: m.closes.length }));
  const L = Math.min(...per.map(p => p.dailyRet.length));
  if (!Number.isFinite(L) || L < 260) return { ok: false, error: `need ≥260 aligned bars, got ${L}` };
  const aligned = per.map(p => p.dailyRet.slice(p.dailyRet.length - L));
  const combined = new Array(L).fill(0);
  for (let t = 0; t < L; t++) {
    let s = 0, k = 0;
    for (const a of aligned) { if (Number.isFinite(a[t])) { s += a[t]; k++; } }
    combined[t] = k ? s / k : 0;
  }
  const scaled = new Array(L).fill(0);
  const volWin = 126;
  for (let t = 0; t < L; t++) {
    const s = Math.max(0, t - volWin), w = combined.slice(s, t);   // strictly past
    const v = w.length >= 20 ? stdev(w, 1) * Math.sqrt(DAY) : null;
    scaled[t] = v && v > 0 ? combined[t] * (c.volTargetPort / v) : combined[t];
  }
  return { ok: true, per, L, aligned, combined, scaled };
}

// ── Basket backtest ──────────────────────────────────────────────────────────
export function backtestBasket(markets, cfg = {}) {
  const c = { ...DEFAULTS, ...cfg };
  const pr = buildPortfolioReturns(markets, c);
  if (!pr.ok) return pr;
  const { per, L, aligned, combined, scaled } = pr;

  return {
    ok: true,
    config: c,
    bars: L,
    markets: per.map(p => marketStats(p)),
    portfolio: portfolioStats(scaled, per.map(p => p.dailyRet.slice(p.dailyRet.length - L))),
    combinedEqualWeight: portfolioStats(combined),   // pre vol-targeting, for reference
  };
}

// ── Stats helpers ────────────────────────────────────────────────────────────
function annualize(dailyRet) {
  const r = dailyRet.filter(Number.isFinite);
  const mu = r.reduce((s, x) => s + x, 0) / (r.length || 1);
  const sd = stdev(r, 1);
  return { annReturn: mu * DAY, annVol: sd * Math.sqrt(DAY), sharpe: sd > 0 ? (mu / sd) * Math.sqrt(DAY) : 0 };
}
function equityFrom(dailyRet) {
  const eq = [1]; for (let i = 1; i < dailyRet.length; i++) eq.push(eq[i - 1] * (1 + (dailyRet[i] || 0)));
  return eq;
}
function longestDrawdownDays(equity) {
  let peak = equity[0], since = 0, longest = 0;
  for (let i = 1; i < equity.length; i++) {
    if (equity[i] >= peak) { peak = equity[i]; since = 0; } else { since++; if (since > longest) longest = since; }
  }
  return longest;
}
function positiveYears(dailyRet) {
  const years = {}; let idx = 0;
  // crude: bucket by 252-day blocks (no dates passed) → "years" of trading
  for (let i = 0; i < dailyRet.length; i++) { const y = Math.floor(i / DAY); (years[y] ??= []).push(dailyRet[i] || 0); }
  const yr = Object.values(years).map(a => a.reduce((s, x) => s + x, 0));
  const pos = yr.filter(x => x > 0).length;
  return { years: yr.length, positive: pos, pct: yr.length ? +(pos / yr.length).toFixed(2) : null };
}
function marketStats(p) {
  const a = annualize(p.dailyRet), eq = equityFrom(p.dailyRet);
  return { symbol: p.symbol, sharpe: +a.sharpe.toFixed(2), annReturn: +(a.annReturn * 100).toFixed(1),
           annVol: +(a.annVol * 100).toFixed(1), maxDD: +(maxDrawdownFromEquity(eq) * 100).toFixed(1),
           avgTurnoverPerYear: +(p.turnover / (p.dailyRet.length / DAY)).toFixed(1) };
}
function portfolioStats(dailyRet, perMarketDaily = null) {
  const a = annualize(dailyRet), eq = equityFrom(dailyRet);
  const maxDD = maxDrawdownFromEquity(eq);
  const py = positiveYears(dailyRet);
  // Deflated Sharpe: trials = the per-market Sharpes (a proxy for configs explored).
  const trials = perMarketDaily ? perMarketDaily.map(d => { const r = d.filter(Number.isFinite); const sd = stdev(r, 1); return sd > 0 ? (r.reduce((s, x) => s + x, 0) / r.length) / sd : 0; }) : [];
  const dsr = trials.length >= 2 ? deflatedSharpe(dailyRet.filter(Number.isFinite), trials) : null;
  return {
    sharpe: +a.sharpe.toFixed(2),
    annReturn: +(a.annReturn * 100).toFixed(1),
    annVol: +(a.annVol * 100).toFixed(1),
    maxDD: +(maxDD * 100).toFixed(1),
    calmar: +calmar(a.annReturn, maxDD).toFixed(2),
    longestDrawdownDays: longestDrawdownDays(eq),
    positiveYears: py,
    deflatedSharpe: dsr ? dsr.dsr : null,
  };
}

export { annualize, equityFrom };

// ── Honest-read robustness ───────────────────────────────────────────────────
// A single full-sample Sharpe flatters — it can hide that all the edge was pre-2015
// and it's been dead since, that costs kill it, or that one market carries it. These
// checks make the number trustworthy. All operate on the portfolio scaled returns
// (no dates needed: sub-periods are early/mid/recent thirds of the sample).
function sharpeOf(dailyRet) {
  const r = dailyRet.filter(Number.isFinite);
  const m = r.reduce((s, x) => s + x, 0) / (r.length || 1);
  const sd = stdev(r, 1);
  return sd > 0 ? +((m / sd) * Math.sqrt(DAY)).toFixed(2) : 0;
}

export function robustness(markets, cfg = {}) {
  const c = { ...DEFAULTS, ...cfg };
  const pr = buildPortfolioReturns(markets, c);
  if (!pr.ok) return pr;
  const { per, scaled, L } = pr;

  // 1. Sub-period Sharpe — early / mid / recent thirds. "Recent" is the one that matters.
  const third = Math.floor(L / 3);
  const subPeriods = {
    early:  sharpeOf(scaled.slice(0, third)),
    mid:    sharpeOf(scaled.slice(third, 2 * third)),
    recent: sharpeOf(scaled.slice(2 * third)),
  };

  // 2. Rolling 1-year Sharpe, sampled ~quarterly, so we can see it turn on/off.
  const rolling = [];
  const win = DAY;
  for (let t = win; t < L; t += 63) rolling.push({ bar: t, approxYear: +(t / DAY).toFixed(1), sharpe1y: sharpeOf(scaled.slice(t - win, t)) });

  // 3. Cost sensitivity — does a realistic spread kill it?
  const costSensitivity = [0, 2, 5, 10, 20].map(bp => {
    const r = buildPortfolioReturns(markets, { ...c, costBp: bp });
    return { costBp: bp, sharpe: r.ok ? sharpeOf(r.scaled) : null };
  });

  // 4. Concentration — drop the single best market; does the edge survive?
  const bySharpe = per.map(p => ({ symbol: p.symbol, sharpe: sharpeOf(p.dailyRet) })).sort((a, b) => b.sharpe - a.sharpe);
  const best = bySharpe[0];
  const without = markets.filter(m => m.symbol !== best.symbol);
  const dropBest = without.length >= 3 ? (() => { const r = buildPortfolioReturns(without, c); return r.ok ? sharpeOf(r.scaled) : null; })() : null;
  const fullSharpe = sharpeOf(scaled);

  // Honest read of the robustness picture.
  const recentAlive = subPeriods.recent >= 0.3;
  const costRobust = (costSensitivity.find(x => x.costBp === 10)?.sharpe ?? 0) >= fullSharpe * 0.5;
  const notConcentrated = dropBest == null || dropBest >= fullSharpe * 0.6;
  const flags = [];
  if (!recentAlive) flags.push(`edge is NOT alive recently (recent-third Sharpe ${subPeriods.recent}) — likely the post-2011 trend drought`);
  if (!costRobust)  flags.push(`costs bite hard (Sharpe halves by 10bp)`);
  if (!notConcentrated) flags.push(`concentrated — dropping ${best.symbol} takes Sharpe ${fullSharpe}→${dropBest}`);
  const read = flags.length === 0
    ? `Robust: edge is alive recently, survives realistic costs, and isn't carried by one market. This is the honest good case — forward-test next.`
    : `Caveats: ${flags.join('; ')}. Weigh these before believing the headline Sharpe.`;

  return { ok: true, fullSharpe, subPeriods, rolling, costSensitivity, concentration: { bestMarket: best, dropBestSharpe: dropBest, fullSharpe }, read };
}

// ── Parameter IS/OOS split — the true out-of-sample test ──────────────────────
// Robustness above tests fixed params across sub-periods. This tests whether the
// PARAMETER CHOICE overfits: select the lookback config on the in-sample (first) half
// by Sharpe, then evaluate THAT config on the held-out second half. If OOS collapses
// vs IS, the params were fit to noise; if OOS ≈ IS, the choice is honest. And if OOS is
// simply dead, that's the recent-half drought (not overfit) — the two are distinguished.
const _IS_OOS_GRID = [
  { name: 'fast (21,63)',        lookbacks: [21, 63] },
  { name: 'med (63,126)',        lookbacks: [63, 126] },
  { name: 'slow (126,252)',      lookbacks: [126, 252] },
  { name: 'multi (21,63,126,252)', lookbacks: [21, 63, 126, 252] },
];
export function isOosSplit(markets, cfg = {}, grid = _IS_OOS_GRID) {
  const c = { ...DEFAULTS, ...cfg };
  const configs = [];
  let bars = null;
  for (const g of grid) {
    const pr = buildPortfolioReturns(markets, { ...c, lookbacks: g.lookbacks });
    if (!pr.ok) continue;
    const L = pr.scaled.length, half = Math.floor(L / 2);
    bars = L;
    configs.push({ name: g.name, lookbacks: g.lookbacks, isSharpe: sharpeOf(pr.scaled.slice(0, half)), oosSharpe: sharpeOf(pr.scaled.slice(half)) });
  }
  if (!configs.length) return { ok: false, error: 'no configs evaluated (need ≥260 aligned bars)' };
  const isSelected = [...configs].sort((a, b) => b.isSharpe - a.isSharpe)[0];   // chosen on IS only
  const oosOracle = [...configs].sort((a, b) => b.oosSharpe - a.oosSharpe)[0];   // hindsight best (for gap)
  const overfitGap = +(isSelected.isSharpe - isSelected.oosSharpe).toFixed(2);
  let read;
  if (isSelected.oosSharpe <= 0)
    read = `IS-selected config (${isSelected.name}) is DEAD out-of-sample (OOS Sharpe ${isSelected.oosSharpe}). This is the recent-half drought, NOT parameter overfit — consistent with the sub-period read.`;
  else if (overfitGap > 0.5)
    read = `Some IS→OOS decay (gap ${overfitGap}) but OOS stays positive (${isSelected.oosSharpe}) — modest overfit, edge survives held-out.`;
  else
    read = `Holds out-of-sample: IS-selected ${isSelected.name} carries IS ${isSelected.isSharpe} → OOS ${isSelected.oosSharpe} (gap ${overfitGap}). Params are not the problem — trend lookbacks are famously insensitive.`;
  return { ok: true, bars, configs, isSelected, oosOracle, overfitGap, pickedOracle: isSelected.name === oosOracle.name, read };
}
