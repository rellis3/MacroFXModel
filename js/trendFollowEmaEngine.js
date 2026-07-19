// trendFollowEmaEngine.js — EMA-crossover A/B against the momentum signal.
//
// THE QUESTION: the "standard" retail trend strategy is buy/sell on a moving-
// average cross (e.g. 15/50/100 EMA). Is it any good — and how does it compare
// to the slow sign-of-return momentum signal the trend engine deliberately chose
// instead ("Slow, not a twitchy EMA")?
//
// HOW (Lego, not a fork): the crossover is expressed as an injected SIGNAL into
// the SAME `backtestMarket`/`backtestBasket` primitive — same inverse-vol sizing,
// same portfolio vol-target, same costs, same no-lookahead bar-to-bar accounting.
// Only the signal function changes, so the A/B isolates the signal and nothing
// else. (Mirrors how trendFollowV2Engine injects `volSeries` to isolate sizing.)
//
// HONEST PRIOR (stated before running): a naive single-pair MA cross is folklore
// — but it's a crude proxy for time-series momentum, which IS replicated. Expect:
// the cross LOSES to momentum (more whipsaw → more turnover → more cost), loses
// to buy-and-hold single-pair after costs, and the basket+vol-sizing version may
// scrape modestly positive — because the edge is the diversification and sizing,
// NOT the cross.
//
// Pure & no-lookahead: markets passed in as { symbol, closes[] } (daily, oldest-
// first). Reuses indicatorCore.ema + the trend primitive. No fetching here.

import { ema } from './indicatorCore.js';
import { backtestBasket, buildPortfolioReturns, DEFAULTS } from './trendFollowEngine.js';
import { stdev } from './statsCore.js';

const DAY = 252;
export const EMA_DEFAULT_SPANS = [15, 50, 100];

// ── EMA-crossover signal ──────────────────────────────────────────────────────
// Graded 3-EMA stack score in {-1,-0.5,0,0.5,1}, the direct analog of
// momentumSignal's averaged sign: +1 when fast>mid>slow (fully stacked long),
// −1 when fast<mid<slow (stacked short), partial when only one pair agrees.
// signal[i] uses closes ≤ i only (EMA is causal). Zeroed during warmup (i < slow
// span) so the engine sits flat instead of trading unstable early EMAs.
export function emaCrossSignal(closes, spans = EMA_DEFAULT_SPANS) {
  const [fast, mid, slow] = spans;
  const eF = ema(closes, fast), eM = ema(closes, mid), eS = ema(closes, slow);
  const n = closes.length, sig = new Array(n).fill(0);
  const warm = Math.max(fast, mid, slow);
  for (let i = 0; i < n; i++) {
    if (i < warm) { sig[i] = 0; continue; }
    sig[i] = (Math.sign(eF[i] - eM[i]) + Math.sign(eM[i] - eS[i])) / 2;
  }
  return sig;
}

// Attach the injected EMA signal to each market so it flows through the unchanged
// trend primitive (backtestBasket reads m.signalSeries).
export function withEmaSignal(markets, spans = EMA_DEFAULT_SPANS) {
  return markets.map(m => ({ ...m, signalSeries: emaCrossSignal(m.closes, spans) }));
}

// Buy-and-hold annualized Sharpe per market — the naive benchmark floor.
export function buyHoldStats(markets) {
  return markets.map(m => {
    const c = m.closes, rets = [];
    for (let i = 1; i < c.length; i++) if (c[i - 1] > 0) rets.push((c[i] - c[i - 1]) / c[i - 1]);
    const mu = rets.reduce((s, x) => s + x, 0) / (rets.length || 1), sd = stdev(rets, 1);
    return { symbol: m.symbol, buyHoldSharpe: sd > 0 ? +((mu / sd) * Math.sqrt(DAY)).toFixed(2) : 0 };
  });
}

// ── A/B: momentum vs EMA-cross, same primitive ────────────────────────────────
// Returns both baskets + per-market single-pair Sharpe for each signal + the
// buy-and-hold floor. The honest comparison is basket OOS Sharpe and whether
// either beats buy-and-hold after costs.
export function compareTrendSignals(markets, cfg = {}, spans = EMA_DEFAULT_SPANS) {
  const c = { ...DEFAULTS, ...cfg };
  const momentum = backtestBasket(markets, c);
  const emaCross = backtestBasket(withEmaSignal(markets, spans), c);
  return {
    ok: momentum.ok && emaCross.ok,
    error: momentum.error || emaCross.error || null,
    spans, config: c,
    momentum, emaCross,
    buyHold: buyHoldStats(markets),
  };
}

// ── EMA span IS/OOS split (does the span CHOICE overfit?) ──────────────────────
// Select the span-triple on the in-sample first half by Sharpe, evaluate THAT on
// the held-out second half. Mirrors trendFollowEngine.isOosSplit but over EMA
// spans and via the injected signal.
const _EMA_GRID = [
  { name: 'fast (5,15,50)',    spans: [5, 15, 50] },
  { name: 'std (15,50,100)',   spans: [15, 50, 100] },
  { name: 'golden (20,50,200)',spans: [20, 50, 200] },
  { name: 'slow (50,100,200)', spans: [50, 100, 200] },
];
function sharpeOf(dailyRet) {
  const r = dailyRet.filter(Number.isFinite);
  const m = r.reduce((s, x) => s + x, 0) / (r.length || 1), sd = stdev(r, 1);
  return sd > 0 ? +((m / sd) * Math.sqrt(DAY)).toFixed(2) : 0;
}
export function emaIsOosSplit(markets, cfg = {}, grid = _EMA_GRID) {
  const c = { ...DEFAULTS, ...cfg };
  const configs = [];
  let bars = null;
  for (const g of grid) {
    const pr = buildPortfolioReturns(withEmaSignal(markets, g.spans), c);
    if (!pr.ok) continue;
    const L = pr.scaled.length, half = Math.floor(L / 2);
    bars = L;
    configs.push({ name: g.name, spans: g.spans, isSharpe: sharpeOf(pr.scaled.slice(0, half)), oosSharpe: sharpeOf(pr.scaled.slice(half)) });
  }
  if (!configs.length) return { ok: false, error: 'no configs evaluated (need ≥260 aligned bars)' };
  const isSelected = [...configs].sort((a, b) => b.isSharpe - a.isSharpe)[0];
  const oosOracle = [...configs].sort((a, b) => b.oosSharpe - a.oosSharpe)[0];
  const overfitGap = +(isSelected.isSharpe - isSelected.oosSharpe).toFixed(2);
  return { ok: true, bars, configs, isSelected, oosOracle, overfitGap, pickedOracle: isSelected.name === oosOracle.name };
}
