// js/cogDataSources.js
//
// All external data I/O for the COG Nasdaq Macro Threshold Engine: FRED
// (macro/balance-sheet series) and Yahoo Finance chart API (price series).
// Reuses the generic FRED/Yahoo HTTP fetchers from nasdaqDataSources.js
// directly — same free public endpoints, same kv.js-backed HTTP cache, no
// reason to duplicate that layer. This file only adds the input-descriptor
// resolution (cogConfig.js uses two different input shapes — see
// describeInput below) and a synthetic dataset generator shaped for this
// system's own input lists (COG_LIQUIDITY_1A_INPUTS / COG_RISK_INPUTS /
// COG_DIRECTION_INPUTS), never the sibling NLC framework's LIQUIDITY_INPUTS.
//
// Synthetic data is clearly tagged `synthetic: true` and exists purely to
// exercise gate/backtest mechanics without live network access — never a
// substitute for the real fetch path.

import { fetchFredSeries, fetchYahooDaily } from './nasdaqDataSources.js';
import { mulberry32, applyPublicationLag, forwardFillOnto } from './nasdaqTransforms.js';
import { COG_LIQUIDITY_1A_INPUTS, COG_RISK_INPUTS, COG_DIRECTION_INPUTS, COG_EXECUTION, COG_DATA_DEFAULTS, COG_LIQUIDITY_1B_INPUTS, COG_INTRADAY_SCHEDULE } from './cogConfig.js';

// ── Real data: FRED + Yahoo ─────────────────────────────────────────────────

// Resolves a single Yahoo ticker to an ascending {date, value}[] close
// series, trying any fallback tickers in order if the primary fetch fails or
// returns no bars (free Yahoo index tickers occasionally 404).
async function fetchYahooCloseSeries(tickers) {
  let lastErr = null;
  for (const ticker of tickers) {
    try {
      const bars = await fetchYahooDaily(ticker);
      if (bars.length) {
        return bars.map(b => ({ date: new Date(b.t).toISOString().slice(0, 10), value: b.close }));
      }
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error(`Yahoo: no data for any of [${tickers.join(', ')}]`);
}

async function fetchYahooRatioSeries(tickersA, tickersB) {
  const [a, b] = await Promise.all([fetchYahooCloseSeries(tickersA), fetchYahooCloseSeries(tickersB)]);
  const bMap = new Map(b.map(x => [x.date, x.value]));
  return a
    .map(x => {
      const denom = bMap.get(x.date);
      return Number.isFinite(denom) && denom !== 0 ? { date: x.date, value: x.value / denom } : null;
    })
    .filter(Boolean);
}

// cogConfig.js uses two input shapes: the array-of-objects shape
// (COG_LIQUIDITY_1A_INPUTS, COG_DIRECTION_INPUTS — `source` + `seriesId`/
// `tickers`) and the dict-of-objects shape (COG_RISK_INPUTS — `ticker` /
// `fredSeriesId` directly). This normalizes either onto one descriptor so
// fetchInputRaw only needs one code path.
function describeInput(input) {
  if (input.fredSeriesId) return { kind: 'fred', seriesId: input.fredSeriesId };
  if (input.source === 'fred') return { kind: 'fred', seriesId: input.seriesId };
  if (input.source === 'yahoo' || input.ticker || input.tickers) {
    const primary = input.tickers || [input.ticker];
    const fallback = input.fallbackTickers || (input.fallbackTicker ? [input.fallbackTicker] : []);
    if (primary.length === 2) return { kind: 'yahoo-ratio', tickersA: [primary[0]], tickersB: [primary[1]] };
    return { kind: 'yahoo', tickers: [...primary, ...fallback] };
  }
  throw new Error(`Unrecognized input descriptor: ${JSON.stringify(input)}`);
}

// Fetches one cogConfig.js input entry (any of COG_LIQUIDITY_1A_INPUTS,
// COG_RISK_INPUTS values, COG_DIRECTION_INPUTS) to a raw ascending
// {date, value}[] series. Throws on total fetch failure (e.g. no FRED_KEY) —
// callers must catch per-input and fall back to the weight-present coverage
// policy rather than letting one bad input invalidate the whole gate.
export async function fetchInputRaw(input) {
  const d = describeInput(input);
  if (d.kind === 'fred') return fetchFredSeries(d.seriesId, { start: COG_DATA_DEFAULTS.backtestStart });
  if (d.kind === 'yahoo') return fetchYahooCloseSeries(d.tickers);
  if (d.kind === 'yahoo-ratio') return fetchYahooRatioSeries(d.tickersA, d.tickersB);
  throw new Error(`fetchInputRaw: unhandled kind ${d.kind}`);
}

// Fetches one input and never throws — a single dead ticker/series degrades
// that input to all-NaN (the gate just abstains on it via its own
// weight-present coverage policy) rather than failing the whole dataset.
// `flaggedMissing` inputs (MOVE) are never even attempted — same disclosed,
// not-faked gap as Phase 1.
async function fetchInputOrAbstain(input) {
  if (input.flaggedMissing) return [];
  try { return await fetchInputRaw(input); } catch { return []; }
}

// ── Phase 2/3: real dataset (FRED + Yahoo) ──────────────────────────────────
//
// Same { dates, ohlc, liquiditySeries, riskSeries, directionSeries } shape
// generateSyntheticCogDataset returns — a drop-in replacement for
// cogBacktestEngine.js's runBacktest(), which stays dataset-shape-agnostic.
//
// Date axis = the traded instrument's OWN actual trading days (NQ futures,
// falling back to QQQ if NQ=F has no history for the range) — mirrors the
// sibling NLC system's loadDailyDataset in nasdaqBacktest.js.
//
// Gate 2/3 inputs (vol/correlation/cross-asset — same-day market closes,
// "no publication lag needed" per their own gate file headers) are aligned
// onto that axis by exact date match only; a day with no print for a given
// input is left NaN and that input simply abstains for that bar via the
// gate's existing weight-present coverage policy — never forward-filled,
// same convention nasdaqBacktest.js already uses for its daily series.
//
// Gate 1's macro/balance-sheet inputs publish far less often than daily
// (weekly/monthly), so each one is first shifted forward by its own
// publicationLagDays (a print is never visible before its real publication
// date — no lookahead) and then forward-filled onto the trading-day axis
// (the most recent print holds until the next one arrives) — the exact
// applyPublicationLag + forwardFillOnto pipeline nasdaqLiquidityEngine.js
// already uses for the sibling system's own Gate 1.
export async function fetchRealCogDataset({ start = COG_DATA_DEFAULTS.backtestStart, end } = {}) {
  const { primary, secondary } = COG_EXECUTION.instruments;
  const primaryBars = await fetchYahooDaily(primary.ticker, { start }).catch(() => []);
  const bars = primaryBars.length ? primaryBars : await fetchYahooDaily(secondary.ticker, { start });
  if (!bars.length) throw new Error(`No price data available for ${primary.ticker} or ${secondary.ticker}`);

  let dates = bars.map(b => new Date(b.t).toISOString().slice(0, 10));
  let ohlcBars = bars;
  if (end) {
    const cut = dates.findIndex(d => d > end);
    const n = cut === -1 ? dates.length : cut;
    dates = dates.slice(0, n);
    ohlcBars = ohlcBars.slice(0, n);
  }

  const riskInputEntries = Object.entries(COG_RISK_INPUTS);
  const [liquidityRaw, riskRaw, directionRaw] = await Promise.all([
    Promise.all(COG_LIQUIDITY_1A_INPUTS.map(fetchInputOrAbstain)),
    Promise.all(riskInputEntries.map(([, inp]) => fetchInputOrAbstain(inp))),
    Promise.all(COG_DIRECTION_INPUTS.map(fetchInputOrAbstain)),
  ]);

  const toPoints = (values) => dates.map((date, i) => ({ date, value: values[i] }));
  const sameDayAlign = (raw) => {
    const map = new Map(raw.map(p => [p.date, p.value]));
    return dates.map(d => (map.has(d) ? map.get(d) : NaN));
  };

  const liquiditySeries = {};
  COG_LIQUIDITY_1A_INPUTS.forEach((input, idx) => {
    const lagged = applyPublicationLag(liquidityRaw[idx], input.publicationLagDays);
    liquiditySeries[input.id] = toPoints(forwardFillOnto(lagged, dates));
  });

  const riskSeries = {};
  riskInputEntries.forEach(([id], idx) => { riskSeries[id] = toPoints(sameDayAlign(riskRaw[idx])); });

  const directionSeries = {};
  COG_DIRECTION_INPUTS.forEach((input, idx) => { directionSeries[input.id] = toPoints(sameDayAlign(directionRaw[idx])); });

  const ohlc = dates.map((date, i) => ({
    date, t: ohlcBars[i].t, open: ohlcBars[i].open, high: ohlcBars[i].high, low: ohlcBars[i].low, close: ohlcBars[i].close, volume: ohlcBars[i].volume,
  }));

  return { synthetic: false, dates, ohlc, liquiditySeries, riskSeries, directionSeries };
}

// ── Synthetic self-test dataset (NOT real data — see header) ───────────────

function dateRangeWeekdays(start, end) {
  const dates = [];
  const d = new Date(start + 'T00:00:00Z');
  const endD = new Date(end + 'T00:00:00Z');
  while (d <= endD) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

// Three independent AR(1) macro "drivers" — liquidity, vol/stress, and
// cross-asset direction are only partially correlated in reality, so each
// gets its own process rather than all three deriving from one number.
function generateDrivers(n, rng) {
  function arDriver(phi, shockScale) {
    const out = new Array(n).fill(0);
    let s = 0;
    for (let i = 0; i < n; i++) { s = s * phi + (rng() - 0.5) * shockScale; out[i] = s; }
    return out;
  }
  return {
    liqDriver: arDriver(0.98, 0.15),
    stressDriver: arDriver(0.95, 0.22),
    dirDriver: arDriver(0.97, 0.16),
  };
}

// Deterministic synthetic daily dataset feeding all three gates' input lists
// plus a synthetic NQ OHLC price path for the execution engine. Exists only
// so gate math, no-lookahead alignment and the backtest loop can be
// exercised end to end without live network access.
export function generateSyntheticCogDataset({ start = COG_DATA_DEFAULTS.backtestStart, end, seed = 42 } = {}) {
  const endDate = end || new Date().toISOString().slice(0, 10);
  const dates = dateRangeWeekdays(start, endDate);
  const rng = mulberry32(seed);
  const n = dates.length;
  const { liqDriver, stressDriver, dirDriver } = generateDrivers(n, rng);
  const absStress = stressDriver.map(v => Math.abs(v));

  // Level is a direct (stationary) function of the driver — `base x (1 +
  // sign x amplitude x driver)` — rather than an accumulated random walk, so
  // it stays bounded/mean-reverting over a multi-year backtest instead of
  // drifting to a floor/ceiling and flat-lining for long stretches.
  function levelSeries(driver, { base, sign = 1, amplitude = 0.3, noiseFrac = 0.01, floor = 0.01, lag = 0 }) {
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const d = driver[Math.max(0, i - lag)];
      const value = base * (1 + sign * amplitude * d) + (rng() - 0.5) * (base * noiseFrac);
      out[i] = Math.max(floor, value);
    }
    return dates.map((date, i) => ({ date, value: out[i] }));
  }

  // Gate 1 — one series per COG_LIQUIDITY_1A_INPUTS entry, signed so the gate's
  // own `sign` convention recovers the intended bullish/bearish read.
  const liquiditySeries = {};
  for (const input of COG_LIQUIDITY_1A_INPUTS) {
    liquiditySeries[input.id] = levelSeries(liqDriver, { base: 100, sign: input.sign, amplitude: 0.35, noiseFrac: 0.01 });
  }

  // Gate 2 — vol/correlation inputs track the stress driver (higher = more
  // stress); qqq/spy are price levels tracking the liquidity driver instead.
  const riskSeries = {
    vix:   dates.map((date, i) => ({ date, value: Math.max(9, 16 + absStress[i] * 60 + (rng() - 0.5) * 1.5) })),
    vix3m: dates.map((date, i) => ({ date, value: Math.max(11, 18 + absStress[i] * 45 + (rng() - 0.5) * 1.2) })),
    vvix:  dates.map((date, i) => ({ date, value: Math.max(60, 90 + absStress[i] * 160 + (rng() - 0.5) * 5) })),
    move:  dates.map((date, i) => ({ date, value: Math.max(50, 95 + absStress[i] * 140 + (rng() - 0.5) * 4) })),
    qqq:   levelSeries(liqDriver, { base: 380, sign: 1, amplitude: 0.25, noiseFrac: 0.012, lag: 3 }),
    spy:   levelSeries(liqDriver, { base: 470, sign: 1, amplitude: 0.2, noiseFrac: 0.01, lag: 3 }),
    dxy:   levelSeries(dirDriver, { base: 104, sign: -1, amplitude: 0.08, noiseFrac: 0.005 }),
    us10y: dates.map((date, i) => ({ date, value: Math.max(0.5, 4.2 - dirDriver[i] * 1.5 + (rng() - 0.5) * 0.08) })),
    credit: dates.map((date, i) => ({ date, value: Math.max(2.0, 4.0 + absStress[i] * 6 + (rng() - 0.5) * 0.2) })),
  };

  // Gate 3 — one series per COG_DIRECTION_INPUTS entry, signed so the gate's
  // own `sign` convention recovers the intended LONG/SHORT read.
  const directionBase = {
    dxy: 104, usdjpy: 150, eurusd: 1.08, us2y: 4.5, us10y: 4.2, hygLqd: 0.92,
    creditImpulse: 4.0, gold: 2300, copper: 4.2, oil: 78, es: 5200, rty: 2000,
  };
  const directionSeries = {};
  for (const input of COG_DIRECTION_INPUTS) {
    const base = directionBase[input.id] ?? 100;
    directionSeries[input.id] = levelSeries(dirDriver, { base, sign: input.sign, amplitude: 0.15, noiseFrac: 0.008 });
  }

  // Gate 4 — synthetic NQ OHLC, the only price series this dataset produces
  // that the execution engine is allowed to touch. Built from a blend of the
  // liquidity/direction drivers (drift) and the stress driver (daily vol
  // level) so it's loosely consistent with the macro backdrop without any
  // gate ever reading it directly.
  const price = new Array(n);
  price[0] = 15000;
  for (let i = 1; i < n; i++) {
    const laggedLiq = liqDriver[Math.max(0, i - 5)];
    const laggedDir = dirDriver[Math.max(0, i - 2)];
    const volLevel = 0.007 + 0.014 * absStress[i];
    const drift = 0.0003 + 0.0008 * Math.tanh(laggedLiq) + 0.0006 * Math.tanh(laggedDir);
    const shock = (rng() - 0.5) * volLevel * 2;
    price[i] = price[i - 1] * (1 + drift + shock);
  }
  const ohlc = dates.map((date, i) => {
    const close = price[i];
    const open = i === 0 ? close : price[i - 1];
    const volLevel = 0.004 + 0.008 * absStress[i];
    const high = Math.max(open, close) * (1 + rng() * volLevel);
    const low = Math.min(open, close) * (1 - rng() * volLevel);
    return { date, t: new Date(`${date}T21:00:00Z`).getTime(), open, high, low, close, volume: 1_000_000 + rng() * 500_000 };
  });

  return { synthetic: true, dates, ohlc, liquiditySeries, riskSeries, directionSeries };
}

// ── Synthetic INTRADAY dataset (NOT real data — see header) ────────────────
//
// Feeds js/cogEventBacktestEngine.js: the same daily-resolution Gate1A/
// Gate2/Gate3 inputs as generateSyntheticCogDataset above, held constant
// (forward-filled) across each day's intraday bars — those gates' real
// inputs (balance-sheet prints, vol percentiles, cross-asset daily closes)
// genuinely don't update intraday in this system (see cogConfig.js header),
// so faking intraday movement for them would be exactly the kind of
// half-built scaffolding this file's disclosure standard exists to prevent.
// Gate1B's 7 candidate inputs DO get their own genuinely intraday-updating
// process — a fast, low-persistence AR(1) driver per input, continuous
// across day boundaries (a real FX/rates/vol tape doesn't reset to zero
// overnight) — because that gate's entire premise is "is right now a good
// moment", which requires an input that actually moves within the day.
//
// Built on top of generateSyntheticCogDataset rather than reimplementing the
// daily AR(1) driver machinery a second time — same reuse discipline as the
// rest of this file.
export function generateSyntheticIntradayCogDataset({ start = COG_DATA_DEFAULTS.backtestStart, end, seed = 42 } = {}) {
  const daily = generateSyntheticCogDataset({ start, end, seed });
  const { sessionStartMinute, sessionEndMinute, barIntervalMinutes } = COG_INTRADAY_SCHEDULE;
  const barsPerDay = Math.floor((sessionEndMinute - sessionStartMinute) / barIntervalMinutes) + 1;
  const rng = mulberry32(seed + 1); // independent stream from generateSyntheticCogDataset's own seed usage

  const dates = [];
  const minuteOfDay = [];
  const t = [];
  for (const date of daily.dates) {
    for (let b = 0; b < barsPerDay; b++) {
      const minute = sessionStartMinute + b * barIntervalMinutes;
      dates.push(date);
      minuteOfDay.push(minute);
      t.push(new Date(`${date}T00:00:00Z`).getTime() + minute * 60000);
    }
  }
  const n = dates.length;

  // Gate1A/Gate2/Gate3 are computed by the caller on THIS daily-resolution
  // data directly (daily.dates / daily.liquiditySeries / daily.riskSeries /
  // daily.directionSeries / daily.ohlc, one entry per calendar day) — never
  // re-expanded onto the intraday bar axis. Their rolling windows are
  // defined in TRADING DAYS (e.g. a 252-day percentile lookback); stretching
  // those same window lengths over ~96x as many intraday bars would silently
  // shrink a "1 year" lookback to "~2.6 calendar days" and (for Gate 2's
  // GARCH refits) turn an O(numDays) computation into an O(numBars) one —
  // wrong on both correctness and performance grounds. The event engine
  // looks up that one frozen daily value per trading day directly, by day
  // index, rather than by bar index.

  // Gate1B inputs: fast mean-reverting AR(1) drivers, much lower persistence
  // than the daily drivers above, sampled once per intraday bar.
  function intradayDriver(phi, shockScale) {
    const out = new Array(n).fill(0);
    let s = 0;
    for (let i = 0; i < n; i++) { s = s * phi + (rng() - 0.5) * shockScale; out[i] = s; }
    return out;
  }
  const flowDrivers = {
    dxy:     intradayDriver(0.90, 0.06),
    us10y:   intradayDriver(0.88, 0.05),
    us2y:    intradayDriver(0.88, 0.04),
    hygLqd:  intradayDriver(0.85, 0.05),
    breadth: intradayDriver(0.85, 0.07),
    vix:     intradayDriver(0.80, 0.10),
    vvix:    intradayDriver(0.80, 0.12),
  };
  const flowBase = { dxy: 104, us10y: 4.2, us2y: 4.5, hygLqd: 0.92, breadth: 1.0, vix: 16, vvix: 90 };
  const gate1bSeries = {};
  for (const input of COG_LIQUIDITY_1B_INPUTS) {
    const driver = flowDrivers[input.id];
    const base = flowBase[input.id] ?? 100;
    gate1bSeries[input.id] = dates.map((date, i) => ({ date, value: Math.max(0.01, base * (1 + input.sign * 0.02 * driver[i])) }));
  }

  // Intraday NQ OHLC: a fresh per-bar random walk seeded at the daily
  // dataset's own opening price, drifted/vol-scaled off the same flow
  // drivers above — loosely consistent with the macro backdrop (same
  // standard as generateSyntheticCogDataset's own price path) without any
  // gate ever reading it directly.
  const price = new Array(n);
  price[0] = daily.ohlc[0].open;
  for (let i = 1; i < n; i++) {
    const volLevel = 0.0009 + 0.002 * Math.abs(flowDrivers.vix[i]);
    const drift = 0.00004 * Math.tanh(flowDrivers.breadth[i]) - 0.00003 * Math.tanh(flowDrivers.dxy[i]);
    const shock = (rng() - 0.5) * volLevel * 2;
    price[i] = price[i - 1] * (1 + drift + shock);
  }
  const ohlc = dates.map((date, i) => {
    const close = price[i];
    const open = i === 0 ? close : price[i - 1];
    const volLevel = 0.0006 + 0.0012 * Math.abs(flowDrivers.vix[i]);
    const high = Math.max(open, close) * (1 + rng() * volLevel);
    const low = Math.min(open, close) * (1 - rng() * volLevel);
    return { date, t: t[i], minuteOfDay: minuteOfDay[i], open, high, low, close, volume: 50_000 + rng() * 30_000 };
  });

  return {
    synthetic: true,
    dates, minuteOfDay, t, ohlc, gate1bSeries,
    // True daily-resolution axis for Gate1A/Gate2/Gate3 — one entry per
    // calendar day (daily.dates.length), never re-expanded onto the
    // intraday bar axis above (see comment block earlier in this function).
    daily: {
      dates: daily.dates,
      liquiditySeries: daily.liquiditySeries,
      riskSeries: daily.riskSeries,
      directionSeries: daily.directionSeries,
      ohlc: daily.ohlc,
    },
  };
}
