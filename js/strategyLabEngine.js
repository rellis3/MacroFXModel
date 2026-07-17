/**
 * Strategy Lab — the spec-driven gauntlet backtester.
 *
 * Purpose: make every "I saw this strategy in a video" idea a same-day honest
 * verdict instead of a new bespoke engine. A strategy is a SPEC (a plain object
 * naming a signal + params), not a new leg function. The engine runs any list
 * of specs over any daily-bar universe through one code path: signal →
 * position series → next-bar returns → costs on turnover → IS/OOS split at ONE
 * shared calendar date → deflated Sharpe across everything tried.
 *
 * The default GAUNTLET_SPECS are the 12 famous retail strategies (EMA cross,
 * golden cross, MACD, RSI mean reversion, RSI-2 dip buy, Bollinger reversion,
 * Donchian/Turtle, 52-week-high momentum, Supertrend, stochastic+trend,
 * Ichimoku breakout) plus two pinned references: buy-and-hold (the benchmark)
 * and tsmom (the replicated time-series-momentum incumbent, imported from
 * trendFollowEngine — never copied).
 *
 * Honesty rules baked in, not optional:
 *   • No lookahead — position held into bar i is decided from data ≤ i-1
 *     (same convention as trendFollowEngine.backtestMarket).
 *   • Costs on by default — round-trip spread charged on every unit of turnover.
 *   • One chronological split DATE shared by every instrument (not a per-pair
 *     bar index — the hedge-v2 defect this avoids).
 *   • Signals are evaluated on closes only. NO intrabar stop/TP modeling — the
 *     daily path is unknown (house anti-pattern). Exits are close-evaluated
 *     state machines.
 *   • Every variant evaluated (including sweep neighbours) is counted as a
 *     trial in the deflated-Sharpe correction. The gauntlet cannot "forget"
 *     how many things it tried.
 *
 * Pure: no network, no env. Data is passed in as [{symbol, bars}] where bars
 * are fetchD1-shaped {date, open, high, low, close}, oldest first.
 */

import { ema, rsiWilder, atrWilder } from './indicatorCore.js';
import { momentumSignal } from './trendFollowEngine.js';
import { portfolioStats, deflatedSharpe } from './backtestStats.js';

// ── Small pure series helpers (close-only, aligned, NaN until seeded) ────────
function smaSeries(values, n) {
  const out = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}
function rollingMax(values, n) {           // max of the PRIOR n values (excludes i)
  const out = new Array(values.length).fill(NaN);
  for (let i = n; i < values.length; i++) {
    let m = -Infinity;
    for (let j = i - n; j < i; j++) if (values[j] > m) m = values[j];
    out[i] = m;
  }
  return out;
}
function rollingMin(values, n) {           // min of the PRIOR n values (excludes i)
  const out = new Array(values.length).fill(NaN);
  for (let i = n; i < values.length; i++) {
    let m = Infinity;
    for (let j = i - n; j < i; j++) if (values[j] < m) m = values[j];
    out[i] = m;
  }
  return out;
}
function stdevRolling(values, n) {
  const out = new Array(values.length).fill(NaN);
  for (let i = n - 1; i < values.length; i++) {
    let s = 0, s2 = 0;
    for (let j = i - n + 1; j <= i; j++) { s += values[j]; s2 += values[j] * values[j]; }
    const m = s / n, v = s2 / n - m * m;
    out[i] = v > 0 ? Math.sqrt(v) : 0;
  }
  return out;
}
// Highest-high / lowest-low midline over the trailing n bars INCLUDING i (Ichimoku).
function donchianMid(bars, n) {
  const out = new Array(bars.length).fill(NaN);
  for (let i = n - 1; i < bars.length; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - n + 1; j <= i; j++) { if (bars[j].high > hi) hi = bars[j].high; if (bars[j].low < lo) lo = bars[j].low; }
    out[i] = (hi + lo) / 2;
  }
  return out;
}

const closesOf = bars => bars.map(b => b.close);
const shortSide = (dir) => (dir === 'longshort' ? -1 : 0);

// ── Signal registry ──────────────────────────────────────────────────────────
// Each entry: compute(bars, params, direction) → pos[] in [-1,1] aligned to
// bars, pos[i] using ONLY data ≤ i. `sweep` = neighbour param sets for the
// robustness/magic-value check (each is a full replacement of `defaults`).
export const SIGNALS = {

  buy_hold: {
    label: 'Buy & Hold',
    defaults: {},
    sweep: [],
    compute: (bars) => new Array(bars.length).fill(1),
  },

  ema_cross: {
    label: 'EMA Cross',
    defaults: { fast: 9, slow: 21 },
    sweep: [{ fast: 5, slow: 15 }, { fast: 13, slow: 34 }, { fast: 21, slow: 55 }],
    compute: (bars, p, dir) => {
      const c = closesOf(bars);
      const f = ema(c, p.fast), s = ema(c, p.slow);
      const lo = shortSide(dir);
      return c.map((_, i) => (i < p.slow ? 0 : (f[i] > s[i] ? 1 : lo)));
    },
  },

  golden_cross: {
    label: 'Golden Cross',
    defaults: { fast: 50, slow: 200 },
    sweep: [{ fast: 30, slow: 150 }, { fast: 50, slow: 150 }, { fast: 100, slow: 300 }],
    compute: (bars, p, dir) => {
      const c = closesOf(bars);
      const f = smaSeries(c, p.fast), s = smaSeries(c, p.slow);
      const lo = shortSide(dir);
      return c.map((_, i) => (!Number.isFinite(s[i]) ? 0 : (f[i] > s[i] ? 1 : lo)));
    },
  },

  macd_cross: {
    label: 'MACD Crossover',
    defaults: { fast: 12, slow: 26, signal: 9 },
    sweep: [{ fast: 8, slow: 17, signal: 9 }, { fast: 12, slow: 26, signal: 5 }, { fast: 19, slow: 39, signal: 9 }],
    compute: (bars, p, dir) => {
      const c = closesOf(bars);
      const fastE = ema(c, p.fast), slowE = ema(c, p.slow);
      const line = fastE.map((v, i) => v - slowE[i]);
      const sig = ema(line, p.signal);
      const lo = shortSide(dir);
      return c.map((_, i) => (i < p.slow + p.signal ? 0 : (line[i] > sig[i] ? 1 : lo)));
    },
  },

  rsi_meanrev: {
    label: 'RSI Mean Reversion',
    defaults: { n: 14, buyBelow: 30, exitAbove: 50, smaFilter: 200 },
    sweep: [{ n: 14, buyBelow: 20, exitAbove: 50, smaFilter: 200 }, { n: 14, buyBelow: 35, exitAbove: 50, smaFilter: 200 }, { n: 7, buyBelow: 30, exitAbove: 50, smaFilter: 200 }],
    // Long/flat state machine: enter on a CROSS-under (not merely below), only
    // above the regime SMA; exit when RSI reclaims the midline.
    compute: (bars, p) => {
      const c = closesOf(bars);
      const rsi = rsiWilder(c, p.n);
      const flt = p.smaFilter > 0 ? smaSeries(c, p.smaFilter) : null;
      const pos = new Array(c.length).fill(0);
      let inPos = false;
      for (let i = 1; i < c.length; i++) {
        if (!Number.isFinite(rsi[i]) || !Number.isFinite(rsi[i - 1])) { pos[i] = 0; continue; }
        if (!inPos) {
          const crossUnder = rsi[i] < p.buyBelow && rsi[i - 1] >= p.buyBelow;
          const regimeOk = !flt || (Number.isFinite(flt[i]) && c[i] > flt[i]);
          if (crossUnder && regimeOk) inPos = true;
        } else if (rsi[i] > p.exitAbove) {
          inPos = false;
        }
        pos[i] = inPos ? 1 : 0;
      }
      return pos;
    },
  },

  rsi2_dipbuy: {
    label: 'RSI-2 Dip Buy (Connors)',
    defaults: { n: 2, buyBelow: 10, exitRsi: 65, smaFilter: 200, exitSmaFast: 5 },
    sweep: [{ n: 2, buyBelow: 5, exitRsi: 65, smaFilter: 200, exitSmaFast: 5 }, { n: 2, buyBelow: 15, exitRsi: 65, smaFilter: 200, exitSmaFast: 5 }, { n: 3, buyBelow: 10, exitRsi: 65, smaFilter: 200, exitSmaFast: 5 }],
    compute: (bars, p) => {
      const c = closesOf(bars);
      const rsi = rsiWilder(c, p.n);
      const flt = smaSeries(c, p.smaFilter), fast = smaSeries(c, p.exitSmaFast);
      const pos = new Array(c.length).fill(0);
      let inPos = false;
      for (let i = 1; i < c.length; i++) {
        if (!Number.isFinite(rsi[i]) || !Number.isFinite(flt[i])) { pos[i] = 0; continue; }
        if (!inPos) {
          if (rsi[i] < p.buyBelow && c[i] > flt[i]) inPos = true;
        } else if (c[i] > fast[i] || rsi[i] > p.exitRsi) {
          inPos = false;
        }
        pos[i] = inPos ? 1 : 0;
      }
      return pos;
    },
  },

  bollinger_reversion: {
    label: 'Bollinger Reversion',
    defaults: { n: 20, k: 2 },
    sweep: [{ n: 20, k: 1.5 }, { n: 20, k: 2.5 }, { n: 10, k: 2 }],
    compute: (bars, p) => {
      const c = closesOf(bars);
      const mid = smaSeries(c, p.n), sd = stdevRolling(c, p.n);
      const pos = new Array(c.length).fill(0);
      let inPos = false;
      for (let i = 0; i < c.length; i++) {
        if (!Number.isFinite(mid[i])) { pos[i] = 0; continue; }
        if (!inPos) { if (c[i] < mid[i] - p.k * sd[i]) inPos = true; }
        else if (c[i] >= mid[i]) inPos = false;
        pos[i] = inPos ? 1 : 0;
      }
      return pos;
    },
  },

  donchian_breakout: {
    label: 'Turtle Breakout',
    defaults: { entry: 20, exit: 10 },
    sweep: [{ entry: 10, exit: 5 }, { entry: 55, exit: 20 }, { entry: 30, exit: 15 }],
    // Turtle 20/10: enter long on a close above the prior `entry`-day high,
    // exit on a close below the prior `exit`-day low. Symmetric short side
    // when direction is longshort.
    compute: (bars, p, dir) => {
      const highs = bars.map(b => b.high), lows = bars.map(b => b.low), c = closesOf(bars);
      const hiN = rollingMax(highs, p.entry), loN = rollingMin(lows, p.entry);
      const hiX = rollingMax(highs, p.exit), loX = rollingMin(lows, p.exit);
      const pos = new Array(c.length).fill(0);
      let state = 0;
      const allowShort = dir === 'longshort';
      for (let i = 0; i < c.length; i++) {
        if (!Number.isFinite(hiN[i])) { pos[i] = 0; continue; }
        if (state === 0) {
          if (c[i] > hiN[i]) state = 1;
          else if (allowShort && c[i] < loN[i]) state = -1;
        } else if (state === 1 && c[i] < loX[i]) {
          state = allowShort && c[i] < loN[i] ? -1 : 0;
        } else if (state === -1 && c[i] > hiX[i]) {
          state = c[i] > hiN[i] ? 1 : 0;
        }
        pos[i] = state;
      }
      return pos;
    },
  },

  high52_momentum: {
    label: '52-Week High Momentum',
    defaults: { lookback: 252, near: 0.98, exitMa: 126 },
    sweep: [{ lookback: 252, near: 0.95, exitMa: 126 }, { lookback: 126, near: 0.98, exitMa: 63 }, { lookback: 252, near: 1.0, exitMa: 126 }],
    // Enter when the close is within (1-near) of the prior 52-week closing
    // high; exit when the close loses the exit MA. Long/flat.
    compute: (bars, p) => {
      const c = closesOf(bars);
      const hi = rollingMax(c, p.lookback), ma = smaSeries(c, p.exitMa);
      const pos = new Array(c.length).fill(0);
      let inPos = false;
      for (let i = 0; i < c.length; i++) {
        if (!Number.isFinite(hi[i]) || !Number.isFinite(ma[i])) { pos[i] = 0; continue; }
        if (!inPos) { if (c[i] >= hi[i] * p.near) inPos = true; }
        else if (c[i] < ma[i]) inPos = false;
        pos[i] = inPos ? 1 : 0;
      }
      return pos;
    },
  },

  supertrend: {
    label: 'Supertrend',
    defaults: { n: 10, mult: 3 },
    sweep: [{ n: 10, mult: 2 }, { n: 14, mult: 3 }, { n: 7, mult: 4 }],
    compute: (bars, p, dir) => {
      const atr = atrWilder(bars, p.n);
      const n = bars.length;
      const pos = new Array(n).fill(0);
      const lo = shortSide(dir);
      let fUp = NaN, fDn = NaN, trend = 0;
      for (let i = 0; i < n; i++) {
        const hl2 = (bars[i].high + bars[i].low) / 2;
        const up = hl2 + p.mult * atr[i], dn = hl2 - p.mult * atr[i];
        if (i === 0 || !Number.isFinite(fUp)) { fUp = up; fDn = dn; pos[i] = 0; continue; }
        const pc = bars[i - 1].close;
        fUp = (up < fUp || pc > fUp) ? up : fUp;
        fDn = (dn > fDn || pc < fDn) ? dn : fDn;
        const c = bars[i].close;
        if (c > fUp) trend = 1; else if (c < fDn) trend = -1;
        pos[i] = i < p.n ? 0 : (trend === 1 ? 1 : trend === -1 ? lo : 0);
      }
      return pos;
    },
  },

  stochastic_trend: {
    label: 'Stochastic + Trend Filter',
    defaults: { kN: 14, dN: 3, buyBelow: 20, exitAbove: 80, smaFilter: 200 },
    sweep: [{ kN: 14, dN: 3, buyBelow: 30, exitAbove: 80, smaFilter: 200 }, { kN: 5, dN: 3, buyBelow: 20, exitAbove: 80, smaFilter: 200 }, { kN: 21, dN: 5, buyBelow: 20, exitAbove: 80, smaFilter: 200 }],
    // %K crosses above %D in the oversold zone while price is above the regime
    // SMA → long; exit when %K reaches overbought. Long/flat.
    compute: (bars, p) => {
      const c = closesOf(bars);
      const n = bars.length;
      const k = new Array(n).fill(NaN);
      for (let i = p.kN - 1; i < n; i++) {
        let hi = -Infinity, lo = Infinity;
        for (let j = i - p.kN + 1; j <= i; j++) { if (bars[j].high > hi) hi = bars[j].high; if (bars[j].low < lo) lo = bars[j].low; }
        k[i] = hi > lo ? ((c[i] - lo) / (hi - lo)) * 100 : 50;
      }
      const d = smaSeries(k.map(v => (Number.isFinite(v) ? v : 50)), p.dN);
      const flt = smaSeries(c, p.smaFilter);
      const pos = new Array(n).fill(0);
      let inPos = false;
      for (let i = 1; i < n; i++) {
        if (!Number.isFinite(k[i]) || !Number.isFinite(flt[i])) { pos[i] = 0; continue; }
        if (!inPos) {
          const crossUp = k[i] > d[i] && k[i - 1] <= d[i - 1];
          if (crossUp && k[i] < p.buyBelow && c[i] > flt[i]) inPos = true;
        } else if (k[i] > p.exitAbove) {
          inPos = false;
        }
        pos[i] = inPos ? 1 : 0;
      }
      return pos;
    },
  },

  ichimoku_breakout: {
    label: 'Ichimoku Cloud Breakout',
    defaults: { conv: 9, base: 26, spanB: 52, disp: 26 },
    sweep: [{ conv: 7, base: 22, spanB: 44, disp: 22 }, { conv: 12, base: 33, spanB: 65, disp: 33 }],
    // Close above the (displaced) cloud → long; below → short/flat; inside the
    // cloud → hold the prior state. Cloud at bar i = spans computed at i-disp.
    compute: (bars, p, dir) => {
      const convL = donchianMid(bars, p.conv), baseL = donchianMid(bars, p.base), spanBL = donchianMid(bars, p.spanB);
      const n = bars.length, pos = new Array(n).fill(0);
      const lo = shortSide(dir);
      let state = 0;
      for (let i = 0; i < n; i++) {
        const j = i - p.disp;
        if (j < 0 || !Number.isFinite(spanBL[j]) || !Number.isFinite(convL[j])) { pos[i] = 0; continue; }
        const spanA = (convL[j] + baseL[j]) / 2, spanB = spanBL[j];
        const top = Math.max(spanA, spanB), bot = Math.min(spanA, spanB);
        const c = bars[i].close;
        if (c > top) state = 1; else if (c < bot) state = -1;
        pos[i] = state === 1 ? 1 : state === -1 ? lo : 0;
      }
      return pos;
    },
  },

  tsmom: {
    label: 'TS Momentum (incumbent)',
    defaults: { lookbacks: [63, 126, 252] },
    sweep: [{ lookbacks: [21, 63] }, { lookbacks: [126, 252] }, { lookbacks: [21, 63, 126, 252] }],
    // The replicated edge, imported from trendFollowEngine — continuous [-1,1].
    compute: (bars, p, dir) => {
      const sig = momentumSignal(closesOf(bars), p.lookbacks);
      return dir === 'longshort' ? sig : sig.map(s => Math.max(0, s));
    },
  },
};

// ── The default gauntlet — the video's 12 famous strategies + references ─────
export const GAUNTLET_SPECS = [
  { name: 'Buy & Hold (benchmark)', signal: 'buy_hold', benchmark: true },
  { name: 'EMA Cross (9/21)', signal: 'ema_cross' },
  { name: 'Golden Cross (50/200)', signal: 'golden_cross' },
  { name: 'MACD Crossover (12/26/9)', signal: 'macd_cross' },
  { name: 'RSI Mean Reversion (14)', signal: 'rsi_meanrev' },
  { name: 'RSI-2 Dip Buy (Connors)', signal: 'rsi2_dipbuy' },
  { name: 'Bollinger Reversion (20,2)', signal: 'bollinger_reversion' },
  { name: 'Turtle Breakout (20/10)', signal: 'donchian_breakout' },
  { name: '52-Week High Momentum', signal: 'high52_momentum' },
  { name: 'Supertrend (10,3)', signal: 'supertrend' },
  { name: 'Stochastic + Trend Filter', signal: 'stochastic_trend' },
  { name: 'Ichimoku Cloud Breakout', signal: 'ichimoku_breakout' },
  { name: 'TS Momentum (incumbent)', signal: 'tsmom' },
];

// ── Generic position-series backtest ─────────────────────────────────────────
// The strategy-agnostic core of trendFollowEngine.backtestMarket: position
// decided from data ≤ i-1 earns ret[i]; cost charged on |Δposition| at the bar
// the new position starts earning. Returns fractional daily returns.
export function positionBacktest(closes, pos, { costBp = 2 } = {}) {
  const n = closes.length;
  const rets = new Array(n).fill(0);
  for (let i = 1; i < n; i++) rets[i] = closes[i - 1] > 0 ? (closes[i] - closes[i - 1]) / closes[i - 1] : 0;
  const dailyRet = new Array(n).fill(0), grossRet = new Array(n).fill(0);
  let turnover = 0;
  for (let i = 1; i < n; i++) {
    grossRet[i] = pos[i - 1] * rets[i];
    const dPos = Math.abs(pos[i - 1] - (i >= 2 ? pos[i - 2] : 0));
    turnover += dPos;
    dailyRet[i] = grossRet[i] - dPos * (costBp / 1e4);
  }
  return { dailyRet, grossRet, turnover };
}

// Entries = transitions into a new nonzero direction (sign flip or flat→position).
export function countEntries(pos, from = 0, to = Infinity) {
  let n = 0;
  const sgn = x => (x > 1e-9 ? 1 : x < -1e-9 ? -1 : 0);
  for (let i = Math.max(1, from); i < Math.min(pos.length, to); i++) {
    const a = sgn(pos[i - 1]), b = sgn(pos[i]);
    if (b !== 0 && b !== a) n++;
  }
  return n;
}

// ── Single spec on a single market ───────────────────────────────────────────
export function runSpec(bars, spec, { direction = 'longflat', costBp = 2 } = {}) {
  const def = SIGNALS[spec.signal];
  if (!def) throw new Error(`unknown signal '${spec.signal}'`);
  const params = { ...def.defaults, ...(spec.params ?? {}) };
  const pos = def.compute(bars, params, spec.direction ?? direction);
  const closes = closesOf(bars);
  const bt = positionBacktest(closes, pos, { costBp: spec.costBp ?? costBp });
  return { pos, params, ...bt, dates: bars.map(b => b.date) };
}

// ── The shared chronological split date ──────────────────────────────────────
// One calendar date for every instrument: the (1-oosFrac) quantile of the UNION
// of all trading dates. Splitting each pair at its own bar index would put the
// boundary at different dates per pair — the defect this avoids.
export function splitDateFor(markets, oosFrac = 0.3) {
  const all = new Set();
  for (const m of markets) for (const b of m.bars) all.add(b.date);
  const dates = [...all].sort();
  if (!dates.length) return null;
  return dates[Math.min(dates.length - 1, Math.floor(dates.length * (1 - oosFrac)))];
}

const statsOf = (dailyPct) => portfolioStats(dailyPct, { mc: false });

// ── Evaluate one spec across a universe → one leaderboard row ────────────────
export function evaluateSpec(markets, spec, { direction = 'longflat', costBp = 2, splitDate } = {}) {
  const perMarket = [];
  const byDate = new Map();               // date → [dailyPct...] for the equal-weight portfolio
  let entries = 0, entriesOos = 0;
  for (const m of markets) {
    const r = runSpec(m.bars, spec, { direction, costBp });
    const splitIdx = splitDate ? r.dates.findIndex(d => d >= splitDate) : r.dates.length;
    const si = splitIdx < 0 ? r.dates.length : splitIdx;
    const dailyPct = r.dailyRet.map(x => x * 100);
    entries += countEntries(r.pos);
    entriesOos += countEntries(r.pos, si);
    for (let i = 0; i < dailyPct.length; i++) {
      if (!byDate.has(r.dates[i])) byDate.set(r.dates[i], []);
      byDate.get(r.dates[i]).push(dailyPct[i]);
    }
    perMarket.push({
      symbol: m.symbol,
      bars: m.bars.length,
      entries: countEntries(r.pos),
      exposure: +(r.pos.reduce((s, x) => s + Math.abs(x), 0) / r.pos.length).toFixed(2),
      turnover: +r.turnover.toFixed(1),
      full: statsOf(dailyPct),
      is: statsOf(dailyPct.slice(0, si)),
      oos: statsOf(dailyPct.slice(si)),
    });
  }
  // Equal-weight portfolio daily series, aligned by calendar date.
  const dates = [...byDate.keys()].sort();
  const portDaily = dates.map(d => { const a = byDate.get(d); return a.reduce((s, x) => s + x, 0) / a.length; });
  const pi = splitDate ? dates.findIndex(d => d >= splitDate) : dates.length;
  const psi = pi < 0 ? dates.length : pi;
  return {
    name: spec.name ?? SIGNALS[spec.signal].label,
    signal: spec.signal,
    params: { ...SIGNALS[spec.signal].defaults, ...(spec.params ?? {}) },
    benchmark: !!spec.benchmark,
    entries, entriesOos,
    perMarket,
    portfolio: {
      full: statsOf(portDaily),
      is: statsOf(portDaily.slice(0, psi)),
      oos: statsOf(portDaily.slice(psi)),
    },
    _portDaily: portDaily,                // consumed by the DSR pass, stripped before return
  };
}

const perObsSharpe = (daily) => {
  const n = daily.length;
  if (n < 3) return 0;
  const m = daily.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(daily.reduce((s, x) => s + (x - m) ** 2, 0) / n);
  return sd > 1e-12 ? m / sd : 0;
};

// ── The gauntlet ─────────────────────────────────────────────────────────────
// Runs every spec (and, when sweep=true, every registered neighbour variant)
// over the universe. EVERY variant evaluated becomes a DSR trial — the
// multiple-testing bill is presented with the results, not hidden.
export function runGauntlet(markets, specs = GAUNTLET_SPECS, {
  direction = 'longflat', costBp = 2, oosFrac = 0.3, sweep = false, minOosTrades = 30,
} = {}) {
  if (!markets.length) return { ok: false, error: 'no markets supplied' };
  const splitDate = splitDateFor(markets, oosFrac);
  const rows = [];
  const trialSRs = [];                    // per-observation Sharpe of EVERYTHING tried

  for (const spec of specs) {
    const row = evaluateSpec(markets, spec, { direction, costBp, splitDate });
    trialSRs.push(perObsSharpe(row._portDaily));

    if (sweep && SIGNALS[spec.signal].sweep.length && !spec.benchmark) {
      row.sweep = SIGNALS[spec.signal].sweep.map(params => {
        const v = evaluateSpec(markets, { ...spec, params }, { direction, costBp, splitDate });
        trialSRs.push(perObsSharpe(v._portDaily));
        return { params, fullSharpe: v.portfolio.full.sharpe, oosSharpe: v.portfolio.oos.sharpe };
      });
      // Magic-value flag: the chosen params look alive but the neighbourhood is dead.
      const base = row.portfolio.oos.sharpe;
      const neigh = row.sweep.map(s => s.oosSharpe);
      const neighMed = [...neigh].sort((a, b) => a - b)[Math.floor(neigh.length / 2)];
      row.magicValue = base > 0.3 && (neighMed < 0 || neighMed < base * 0.4);
    }
    rows.push(row);
  }

  // Deflated Sharpe per row, against every trial this gauntlet ran.
  for (const row of rows) {
    row.deflated = trialSRs.length >= 2 ? deflatedSharpe(row._portDaily, trialSRs) : null;
    delete row._portDaily;
  }

  // Honest verdict per row: OOS Sharpe positive, enough OOS trades, DSR not noise,
  // and (for non-benchmarks) it must beat buy-and-hold's OOS Sharpe to matter.
  const bh = rows.find(r => r.benchmark);
  for (const row of rows) {
    const flags = [];
    if (row.entriesOos < minOosTrades && row.signal !== 'buy_hold') flags.push(`OOS trades ${row.entriesOos} < ${minOosTrades}`);
    if (row.portfolio.oos.sharpe <= 0) flags.push('OOS Sharpe ≤ 0');
    if (row.deflated && row.deflated.dsr < 0.5) flags.push(`DSR ${row.deflated.dsr} — consistent with the best-of-${row.deflated.nTrials}-trials noise floor`);
    if (bh && !row.benchmark && row.portfolio.oos.sharpe <= bh.portfolio.oos.sharpe) flags.push('does not beat buy & hold OOS');
    if (row.magicValue) flags.push('magic-value params — neighbours are dead');
    row.flags = flags;
    row.survives = flags.length === 0 && !row.benchmark;
  }

  rows.sort((a, b) => (b.benchmark ? 1e9 : b.portfolio.oos.sharpe) - (a.benchmark ? 1e9 : a.portfolio.oos.sharpe));
  const survivors = rows.filter(r => r.survives).map(r => r.name);
  return {
    ok: true,
    splitDate, oosFrac, costBp, direction,
    universe: markets.map(m => m.symbol),
    nTrials: trialSRs.length,
    rows,
    survivors,
    read: survivors.length
      ? `${survivors.length} spec(s) survive the full gate (OOS>b&h, ≥${minOosTrades} OOS trades, DSR≥0.5${sweep ? ', neighbours alive' : ''}): ${survivors.join('; ')}. Next bar is forward validation, not celebration.`
      : `No spec survives the honest gate (${trialSRs.length} variants tried). That is the expected base-rate outcome for famous indicator strategies on liquid markets — the null is the result, banked cheaply.`,
  };
}
