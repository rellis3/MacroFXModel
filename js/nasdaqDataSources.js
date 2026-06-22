// js/nasdaqDataSources.js
//
// All external data I/O for the NASDAQ Liquidity Continuation Framework:
// FRED (macro/balance-sheet series) and Yahoo Finance chart API (price
// series), each cached through the repo's generic kv.js store under a
// dedicated `nlc_` ("Nasdaq Liquidity Continuation") key namespace so this
// system's caches can never collide with, or be confused for, any existing
// system's data.
//
// Also exports a clearly-labeled SYNTHETIC dataset generator. Real network
// access to FRED/Yahoo may not exist in every environment this code runs in
// (e.g. a sandboxed build/CI step); the synthetic path exists purely to
// exercise the pipeline's mechanics (math, no-lookahead handling, gate
// wiring) end to end in that case. Every synthetic series is tagged
// `synthetic: true` and must never be presented as, or mixed into, real
// market/macro output.
//
// Self-contained: no imports from, and no shared state with, any other
// data-fetching code already in this repository.

import * as kv from '../kv.js';
import { LIQUIDITY_INPUTS, DATA_DEFAULTS } from './nasdaqConfig.js';
import { mulberry32 } from './nasdaqTransforms.js';

const KEY_PREFIX = 'nlc_';

function cacheKey(kind, id) {
  return `${KEY_PREFIX}${kind}_${id}`.replace(/[^a-zA-Z0-9_:.-]/g, '_');
}

async function cached(key, ttlSeconds, fetcher) {
  const raw = await kv.get(key);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.fetchedAt && (Date.now() - parsed.fetchedAt) / 1000 < ttlSeconds) {
        return parsed.data;
      }
    } catch { /* corrupt cache entry — fall through and refetch */ }
  }
  const data = await fetcher();
  await kv.put(key, JSON.stringify({ fetchedAt: Date.now(), data }));
  return data;
}

// ── FRED ─────────────────────────────────────────────────────────────────────

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

export async function fetchFredSeries(seriesId, { start = DATA_DEFAULTS.backtestStart, end } = {}) {
  const fredKey = process.env.FRED_KEY || process.env.FRED_API_KEY;
  if (!fredKey) throw new Error('FRED_KEY not set');
  const key = cacheKey('fred', `${seriesId}_${start}_${end || 'latest'}`);
  return cached(key, DATA_DEFAULTS.cacheTtlSeconds, async () => {
    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: fredKey,
      file_type: 'json',
      observation_start: start,
    });
    if (end) params.set('observation_end', end);
    const r = await fetch(`${FRED_BASE}?${params.toString()}`);
    if (!r.ok) throw new Error(`FRED ${seriesId}: HTTP ${r.status}`);
    const json = await r.json();
    return (json.observations || [])
      .filter(o => o.value !== '.')
      .map(o => ({ date: o.date, value: parseFloat(o.value) }));
  });
}

// ── Yahoo Finance chart API ──────────────────────────────────────────────────

export async function fetchYahooChart(ticker, { interval = '1d', range, period1, period2 } = {}) {
  const key = cacheKey('yahoo', `${ticker}_${interval}_${range || `${period1}-${period2}`}`);
  return cached(key, DATA_DEFAULTS.cacheTtlSeconds, async () => {
    const params = new URLSearchParams({ interval });
    if (range) params.set('range', range);
    if (period1) params.set('period1', String(period1));
    if (period2) params.set('period2', String(period2));
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?${params.toString()}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) throw new Error(`Yahoo ${ticker}: HTTP ${r.status}`);
    const json = await r.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error(`Yahoo ${ticker}: no data in response`);
    const ts = result.timestamp || [];
    const q = result.indicators?.quote?.[0] || {};
    return ts
      .map((t, i) => ({
        t: t * 1000,
        open: q.open?.[i], high: q.high?.[i], low: q.low?.[i], close: q.close?.[i], volume: q.volume?.[i],
      }))
      .filter(b => Number.isFinite(b.close) && Number.isFinite(b.high) && Number.isFinite(b.low));
  });
}

export async function fetchYahooDaily(ticker, { start = DATA_DEFAULTS.backtestStart } = {}) {
  const period1 = Math.floor(new Date(start + 'T00:00:00Z').getTime() / 1000);
  const period2 = Math.floor(Date.now() / 1000);
  return fetchYahooChart(ticker, { interval: '1d', period1, period2 });
}

export async function fetchYahooIntraday(ticker, { granularity = DATA_DEFAULTS.intraday.granularity } = {}) {
  const days = granularity === DATA_DEFAULTS.hourlyFallback.granularity
    ? DATA_DEFAULTS.hourlyFallback.maxLookbackDays
    : DATA_DEFAULTS.intraday.maxLookbackDays;
  return fetchYahooChart(ticker, { interval: granularity, range: `${days}d` });
}

// Resolves one LIQUIDITY_INPUTS entry (nasdaqConfig.js) to a raw {date,value}[]
// series, ascending by date. Two-ticker inputs (e.g. hygLqd) resolve to the
// ratio of their daily closes.
export async function fetchLiquidityInputRaw(input) {
  if (input.source === 'fred') {
    return fetchFredSeries(input.seriesId);
  }
  if (input.source === 'yahoo') {
    if (input.tickers.length === 1) {
      const bars = await fetchYahooDaily(input.tickers[0]);
      return bars.map(b => ({ date: new Date(b.t).toISOString().slice(0, 10), value: b.close }));
    }
    const [a, b] = await Promise.all(input.tickers.map(t => fetchYahooDaily(t)));
    const bMap = new Map(b.map(x => [new Date(x.t).toISOString().slice(0, 10), x.close]));
    return a
      .map(x => {
        const date = new Date(x.t).toISOString().slice(0, 10);
        const denom = bMap.get(date);
        return Number.isFinite(denom) && denom !== 0 ? { date, value: x.close / denom } : null;
      })
      .filter(Boolean);
  }
  throw new Error(`Unknown source for input ${input.id}: ${input.source}`);
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

// Deterministic synthetic daily dataset: a price series with a built-in lagged
// dependence on a synthetic "liquidity driver", plus one synthetic series per
// LIQUIDITY_INPUTS entry. Exists only so the backtest engine's mechanics
// (alignment, lag handling, gate math, P&L accounting) can be exercised
// without real network access — never a substitute for the real backtest.
export function generateSyntheticDailyDataset({ start = DATA_DEFAULTS.backtestStart, end, seed = 42 } = {}) {
  const endDate = end || new Date().toISOString().slice(0, 10);
  const dates = dateRangeWeekdays(start, endDate);
  const rng = mulberry32(seed);
  const n = dates.length;

  const liqDriver = new Array(n).fill(0);
  let liqState = 0;
  for (let i = 0; i < n; i++) {
    liqState = liqState * 0.98 + (rng() - 0.5) * 0.15;
    liqDriver[i] = liqState;
  }

  const price = new Array(n);
  price[0] = 4000;
  for (let i = 1; i < n; i++) {
    const laggedDriver = liqDriver[Math.max(0, i - 5)];
    const drift = 0.0002 + 0.0006 * Math.tanh(laggedDriver);
    const shock = (rng() - 0.5) * 0.018;
    price[i] = price[i - 1] * (1 + drift + shock);
  }

  const liquiditySeries = {};
  for (const input of LIQUIDITY_INPUTS) {
    const base = 100;
    const out = new Array(n);
    let level = base;
    for (let i = 0; i < n; i++) {
      level += input.sign * liqDriver[i] * 0.5 + (rng() - 0.5) * (base * 0.01);
      out[i] = level;
    }
    liquiditySeries[input.id] = dates.map((date, i) => ({ date, value: out[i] }));
  }

  const ohlc = dates.map((date, i) => {
    const close = price[i];
    const open = i === 0 ? close : price[i - 1];
    const high = Math.max(open, close) * (1 + rng() * 0.004);
    const low = Math.min(open, close) * (1 - rng() * 0.004);
    return { t: new Date(`${date}T21:00:00Z`).getTime(), date, open, high, low, close, volume: 1_000_000 + rng() * 500_000 };
  });

  return { synthetic: true, dates, ohlc, liquiditySeries };
}
