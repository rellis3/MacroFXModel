// js/cogHistoricalDataLoader.js
//
// OANDA v20 historical candle loader for the V2 COG persistent state engine.
// Produces the same { synthetic, dates, minuteOfDay, t, ohlc, gate1bSeries,
// daily } shape as generateSyntheticIntradayCogDataset — a drop-in dataset
// for runV2Backtest().
//
// Data sources:
//   Intraday price  : OANDA v20 NAS100_USD M5 candles (5-min bars)
//   gate1bSeries    : daily FRED/Yahoo closes forward-filled to each intraday
//                     bar (disclosed: these don't update intraday in practice)
//   liquiditySeries : COG_LIQUIDITY_1A_INPUTS via FRED, same pipeline as
//                     fetchRealCogDataset (publication lag + forward fill)
//   riskSeries      : COG_RISK_INPUTS via Yahoo/FRED, same-day alignment
//   directionSeries : COG_DIRECTION_INPUTS via Yahoo/FRED, same-day alignment
//
// gate1bSeries ID → source mapping (COG_LIQUIDITY_1B_INPUTS has no fetch
// descriptors — see cogConfig.js; mappings hard-coded here):
//   dxy     → Yahoo DX-Y.NYB  (fallback: UUP ETF)
//   us10y   → FRED DGS10      (10yr Treasury, daily)
//   us2y    → FRED DGS2       (2yr Treasury, daily)
//   hygLqd  → Yahoo HYG/LQD ratio
//   breadth → abstains        (no free daily breadth feed; disclosed)
//   vix     → FRED VIXCLS     (fallback: Yahoo ^VIX)
//   vvix    → Yahoo ^VVIX     (fallback: abstain)
//
// NEVER commit, log, or echo OANDA_API_KEY or OANDA_ACCOUNT_ID.

import { fetchFredSeries, fetchYahooDaily } from './nasdaqDataSources.js';
import { applyPublicationLag, forwardFillOnto } from './nasdaqTransforms.js';
import {
  COG_LIQUIDITY_1A_INPUTS, COG_RISK_INPUTS, COG_DIRECTION_INPUTS,
  COG_LIQUIDITY_1B_INPUTS, COG_INTRADAY_SCHEDULE, COG_DATA_DEFAULTS,
} from './cogConfig.js';
import { fetchInputRaw } from './cogDataSources.js';

// ── UK DST ─────────────────────────────────────────────────────────────────────
// BST (UTC+1): last Sunday in March 01:00 UTC → last Sunday in October 01:00 UTC.

function _lastSundayDate(year, month) {
  // Returns the day-of-month for the last Sunday of the given month (0-indexed).
  const last = new Date(Date.UTC(year, month + 1, 0));
  return last.getUTCDate() - last.getUTCDay();
}

function _isBST(utcMs) {
  const y = new Date(utcMs).getUTCFullYear();
  const bstStart = Date.UTC(y, 2, _lastSundayDate(y, 2), 1); // last Sun Mar 01:00 UTC
  const bstEnd   = Date.UTC(y, 9, _lastSundayDate(y, 9), 1); // last Sun Oct 01:00 UTC
  return utcMs >= bstStart && utcMs < bstEnd;
}

function _ukOffsetMs(utcMs) { return _isBST(utcMs) ? 3_600_000 : 0; }

// YYYY-MM-DD string in UK local time.
function _utcToUKDate(utcMs) {
  return new Date(utcMs + _ukOffsetMs(utcMs)).toISOString().slice(0, 10);
}

// Integer minutes from UK midnight (0–1439).
function _utcToUKMinuteOfDay(utcMs) {
  const d = new Date(utcMs + _ukOffsetMs(utcMs));
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

// ── OANDA M5 historical candle paginator ───────────────────────────────────────

const _OANDA_MAX_COUNT  = 5000;
const _OANDA_BAR_MS     = 5 * 60_000;
const _OANDA_RETRY_DELAYS = [2_000, 4_000, 8_000, 16_000];

function _oandaBase(env) {
  return (env === 'practice')
    ? 'https://api-fxpractice.oanda.com'
    : 'https://api-fxtrade.oanda.com';
}

// Fetches one page of OANDA M5 candles with exponential-backoff retry.
// oandaKey comes from process.env — never logged here.
async function _fetchOandaPage(url, oandaKey) {
  let lastErr;
  for (let attempt = 0; attempt <= _OANDA_RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, _OANDA_RETRY_DELAYS[attempt - 1]));
    try {
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${oandaKey}` },
        signal: AbortSignal.timeout(60_000),
      });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        throw new Error(`OANDA ${r.status}: ${body.slice(0, 300)}`);
      }
      const d = await r.json();
      // Only complete candles (the in-progress candle has complete=false).
      return (d.candles ?? []).filter(c => c.complete !== false && c.mid);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

// Fetches all complete M5 candles for `instrument` in [startIso, endIso),
// paginating automatically. Calls onProgress({ pagesLoaded, totalBars }) if
// provided. oandaKey must be sourced from process.env by the caller.
async function _fetchAllOandaM5(instrument, startIso, endIso, oandaKey, env, onProgress) {
  const base  = _oandaBase(env);
  const endMs = new Date(endIso).getTime();
  let fromMs  = new Date(startIso).getTime();
  const all   = [];

  while (fromMs < endMs) {
    const fromStr = new Date(fromMs).toISOString().replace(/\.000Z$/, 'Z');
    const url = `${base}/v3/instruments/${encodeURIComponent(instrument)}/candles` +
      `?granularity=M5&count=${_OANDA_MAX_COUNT}&from=${encodeURIComponent(fromStr)}&price=M`;

    const page = await _fetchOandaPage(url, oandaKey);
    if (!page.length) break;

    if (onProgress) onProgress({ pagesLoaded: Math.ceil((all.length + 1) / _OANDA_MAX_COUNT), totalBars: all.length + page.length });

    let hitEnd = false;
    for (const c of page) {
      const ts = new Date(c.time).getTime();
      if (ts >= endMs) { hitEnd = true; break; }
      all.push(c);
    }

    if (hitEnd || page.length < _OANDA_MAX_COUNT) break;
    // Advance to the next bar's open time (5 minutes after the last received bar).
    fromMs = new Date(page[page.length - 1].time).getTime() + _OANDA_BAR_MS;
  }

  return all;
}

// ── Yahoo Finance authenticated series fetcher ─────────────────────────────────
// Yahoo Finance v8 API requires session cookies + crumb since 2024. The module-
// level session cache avoids re-fetching on every call. A 401/403 response from
// the chart endpoint invalidates the cache so the next request starts a fresh
// session automatically.

const _YAHOO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
let _yahooSession = null;
let _yahooSessionExpiry = 0;

async function _getYahooSession() {
  if (_yahooSession && Date.now() < _yahooSessionExpiry) return _yahooSession;

  const baseHeaders = { 'User-Agent': _YAHOO_UA, 'Accept': '*/*', 'Accept-Language': 'en-US,en;q=0.9' };

  // Step 1: hit the Yahoo Finance homepage to obtain session cookies (A3, GUCS, …)
  let cookieStr = '';
  try {
    const r = await fetch('https://finance.yahoo.com/', {
      headers: { ...baseHeaders, 'Accept': 'text/html,application/xhtml+xml,*/*' },
      signal: AbortSignal.timeout(15_000),
    });
    const setCookies = typeof r.headers.getSetCookie === 'function'
      ? r.headers.getSetCookie()
      : (r.headers.get('set-cookie') ? [r.headers.get('set-cookie')] : []);
    const jar = {};
    for (const c of setCookies) {
      const nv = c.split(';')[0];
      const eq = nv.indexOf('=');
      if (eq > 0) jar[nv.slice(0, eq).trim()] = nv.slice(eq + 1).trim();
    }
    cookieStr = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  } catch (e) {
    console.warn('[cogHistoricalDataLoader] Yahoo homepage fetch failed (continuing):', e.message);
  }

  // Step 2: fetch the crumb token
  const crumbHeaders = { ...baseHeaders, 'Referer': 'https://finance.yahoo.com/' };
  if (cookieStr) crumbHeaders['Cookie'] = cookieStr;
  const cr = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: crumbHeaders,
    signal: AbortSignal.timeout(15_000),
  });
  if (!cr.ok) throw new Error(`Yahoo crumb: HTTP ${cr.status}`);
  const crumb = (await cr.text()).trim();
  if (!crumb || crumb.startsWith('<') || crumb.length > 50) {
    throw new Error(`Yahoo crumb: unexpected response (${crumb.length} chars, starts "${crumb.slice(0, 30)}")`);
  }

  // Merge any new cookies from the crumb response
  if (typeof cr.headers.getSetCookie === 'function') {
    const jar = Object.fromEntries(
      cookieStr.split('; ').filter(Boolean).map(c => {
        const eq = c.indexOf('=');
        return eq > 0 ? [c.slice(0, eq), c.slice(eq + 1)] : null;
      }).filter(Boolean)
    );
    for (const c of cr.headers.getSetCookie()) {
      const nv = c.split(';')[0];
      const eq = nv.indexOf('=');
      if (eq > 0) jar[nv.slice(0, eq).trim()] = nv.slice(eq + 1).trim();
    }
    cookieStr = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  _yahooSession = { crumb, cookieStr };
  _yahooSessionExpiry = Date.now() + 3_600_000;
  return _yahooSession;
}

// Fetches a Yahoo Finance close series with crumb+cookie auth. Tries each ticker
// in order (primary then fallbacks). On 401/403 the session cache is invalidated
// and the request is retried once with a fresh crumb.
async function _fetchYahooAuthSeries(tickers, startDate) {
  const period1 = Math.floor(new Date(startDate + 'T00:00:00Z').getTime() / 1000);
  const period2 = Math.floor(Date.now() / 1000);
  let lastErr;
  for (const ticker of tickers) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { crumb, cookieStr } = await _getYahooSession();
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
          `?interval=1d&period1=${period1}&period2=${period2}&crumb=${encodeURIComponent(crumb)}`;
        const headers = { 'User-Agent': _YAHOO_UA, 'Accept': 'application/json,*/*', 'Referer': 'https://finance.yahoo.com/' };
        if (cookieStr) headers['Cookie'] = cookieStr;
        const r = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
        if (r.status === 401 || r.status === 403) {
          _yahooSession = null; _yahooSessionExpiry = 0;
          throw Object.assign(new Error(`Yahoo ${ticker}: ${r.status}`), { _retry: true });
        }
        if (!r.ok) throw new Error(`Yahoo ${ticker}: HTTP ${r.status}`);
        const json = await r.json();
        const result = json?.chart?.result?.[0];
        if (!result) throw new Error(`Yahoo ${ticker}: no chart result`);
        const ts = result.timestamp || [];
        const closes = result.indicators?.quote?.[0]?.close || [];
        const bars = ts
          .map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), value: closes[i] }))
          .filter(b => Number.isFinite(b.value));
        if (bars.length) return bars;
        throw new Error(`Yahoo ${ticker}: 0 finite bars in response`);
      } catch (e) {
        lastErr = e;
        if (e._retry && attempt === 0) continue;
        break;
      }
    }
  }
  throw lastErr ?? new Error(`Yahoo: no data for [${tickers.join(', ')}]`);
}

// ── gate1b daily series fetch ──────────────────────────────────────────────────
// Hard-coded ID → fetch descriptor map because COG_LIQUIDITY_1B_INPUTS carries
// no `source` / `seriesId` fields of its own (see cogConfig.js header).

const _GATE1B_SOURCES = {
  dxy:     { kind: 'yahoo',       tickers: ['DX-Y.NYB', 'UUP'] },
  us10y:   { kind: 'fred',        seriesId: 'DGS10'             },
  us2y:    { kind: 'fred',        seriesId: 'DGS2'              },
  hygLqd:  { kind: 'yahoo-ratio', tickersA: ['HYG'], tickersB: ['LQD'] },
  breadth: { kind: 'abstain'                                     },
  vix:     { kind: 'fred',        seriesId: 'VIXCLS', fallbackYahoo: ['^VIX'] },
  vvix:    { kind: 'yahoo',       tickers: ['^VVIX']            },
};

async function _fetchGate1bDailySeries(startDate) {
  async function fredOrEmpty(seriesId) {
    try { return await fetchFredSeries(seriesId, { start: startDate }); }
    catch { return []; }
  }

  async function yahooCloseSeries(tickers) {
    try { return await _fetchYahooAuthSeries(tickers, startDate); }
    catch { return []; }
  }

  async function yahooRatioSeries(tickersA, tickersB) {
    const [a, b] = await Promise.all([yahooCloseSeries(tickersA), yahooCloseSeries(tickersB)]);
    const bMap = new Map(b.map(x => [x.date, x.value]));
    return a.map(x => {
      const d = bMap.get(x.date);
      return Number.isFinite(d) && d !== 0 ? { date: x.date, value: x.value / d } : null;
    }).filter(Boolean);
  }

  const results = {};
  await Promise.all(
    Object.entries(_GATE1B_SOURCES).map(async ([id, src]) => {
      if (src.kind === 'abstain') { results[id] = []; return; }
      if (src.kind === 'fred') {
        let data = await fredOrEmpty(src.seriesId);
        if (!data.length && src.fallbackYahoo) data = await yahooCloseSeries(src.fallbackYahoo);
        results[id] = data;
      } else if (src.kind === 'yahoo') {
        results[id] = await yahooCloseSeries(src.tickers);
      } else if (src.kind === 'yahoo-ratio') {
        results[id] = await yahooRatioSeries(src.tickersA, src.tickersB);
      }
    })
  );
  return results;
}

// Forward-fills a {date, value}[] daily series onto an array of bar date
// strings (one per intraday bar), returning a {date, value}[] of the same
// length as barDates. Bars whose date precedes the first daily print get NaN.
function _forwardFillDailyToIntraday(dailySeries, barDates) {
  const sorted = [...dailySeries].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  let ptr = 0;
  let last = NaN;
  return barDates.map(date => {
    while (ptr < sorted.length && sorted[ptr].date <= date) {
      if (Number.isFinite(sorted[ptr].value)) last = sorted[ptr].value;
      ptr++;
    }
    return { date, value: last };
  });
}

// ── Gate1A / Gate2 / Gate3 daily series ───────────────────────────────────────
// Same alignment pipeline as fetchRealCogDataset in cogDataSources.js:
//   liquiditySeries : publication lag + forward fill onto tradingDates
//   riskSeries      : same-day alignment
//   directionSeries : same-day alignment

async function _buildDailyGateSeries(tradingDates) {
  const fetchSummary = {};

  async function inputOrAbstain(input, id) {
    const inputId = id ?? input.id ?? '?';
    if (input.flaggedMissing) {
      fetchSummary[inputId] = { source: 'flaggedMissing', ok: false, bars: 0 };
      return [];
    }
    // Determine if this input is Yahoo-sourced — the V1 COG_RISK_INPUTS dict uses
    // `ticker` (not `source`), while COG_DIRECTION_INPUTS / COG_LIQUIDITY_1A_INPUTS
    // use `source: 'yahoo'`. Both paths go through our authenticated fetcher.
    const isYahoo = input.source === 'yahoo' ||
      (!input.source && !input.fredSeriesId && !input.seriesId &&
       (input.ticker != null || input.tickers != null));
    try {
      let data;
      if (isYahoo) {
        const primary  = input.tickers || (input.ticker  ? [input.ticker]  : []);
        const fallback = input.fallbackTickers || (input.fallbackTicker ? [input.fallbackTicker] : []);
        if (primary.length >= 2) {
          // Two-ticker ratio series (e.g. hygLqd = HYG / LQD)
          const [a, b] = await Promise.all([
            _fetchYahooAuthSeries([primary[0]], COG_DATA_DEFAULTS.backtestStart),
            _fetchYahooAuthSeries([primary[1]], COG_DATA_DEFAULTS.backtestStart),
          ]);
          const bMap = new Map(b.map(x => [x.date, x.value]));
          data = a.map(x => {
            const d = bMap.get(x.date);
            return Number.isFinite(d) && d !== 0 ? { date: x.date, value: x.value / d } : null;
          }).filter(Boolean);
        } else {
          data = await _fetchYahooAuthSeries([...primary, ...fallback], COG_DATA_DEFAULTS.backtestStart);
        }
      } else {
        data = await fetchInputRaw(input);
      }
      fetchSummary[inputId] = { source: input.source || (input.fredSeriesId || input.seriesId ? 'fred' : 'yahoo'), ok: true, bars: data.length };
      return data;
    } catch (e) {
      fetchSummary[inputId] = { source: input.source || (isYahoo ? 'yahoo' : 'fred'), ok: false, bars: 0, error: e.message.slice(0, 120) };
      console.warn(`[cogHistoricalDataLoader] ${inputId}: fetch failed — ${e.message}`);
      return [];
    }
  }

  const riskInputEntries = Object.entries(COG_RISK_INPUTS);

  const [liquidityRaw, riskRaw, directionRaw] = await Promise.all([
    Promise.all(COG_LIQUIDITY_1A_INPUTS.map(input => inputOrAbstain(input, input.id))),
    Promise.all(riskInputEntries.map(([id, inp]) => inputOrAbstain(inp, id))),
    Promise.all(COG_DIRECTION_INPUTS.map(input => inputOrAbstain(input, input.id))),
  ]);

  const toPoints = vals => tradingDates.map((date, i) => ({ date, value: vals[i] }));
  const sameDayAlign = raw => {
    const map = new Map(raw.map(p => [p.date, p.value]));
    return tradingDates.map(d => (map.has(d) ? map.get(d) : NaN));
  };

  const liquiditySeries = {};
  COG_LIQUIDITY_1A_INPUTS.forEach((input, idx) => {
    const lagged = applyPublicationLag(liquidityRaw[idx], input.publicationLagDays);
    liquiditySeries[input.id] = toPoints(forwardFillOnto(lagged, tradingDates));
  });

  const riskSeries = {};
  riskInputEntries.forEach(([id], idx) => { riskSeries[id] = toPoints(sameDayAlign(riskRaw[idx])); });

  const directionSeries = {};
  COG_DIRECTION_INPUTS.forEach((input, idx) => { directionSeries[input.id] = toPoints(sameDayAlign(directionRaw[idx])); });

  return { liquiditySeries, riskSeries, directionSeries, fetchSummary };
}

// ── Main export ────────────────────────────────────────────────────────────────

// Loads a historical V2 COG dataset from OANDA M5 candles + FRED/Yahoo macro
// series, and returns the same shape as generateSyntheticIntradayCogDataset —
// a drop-in dataset for runV2Backtest().
//
// Options:
//   start      {string}   YYYY-MM-DD start date (default: COG_DATA_DEFAULTS.backtestStart)
//   end        {string}   YYYY-MM-DD end date, exclusive (default: today)
//   instrument {string}   OANDA instrument code (default: 'NAS100_USD')
//   oandaKey   {string}   OANDA API key — MUST come from process.env, never logged
//   oandaEnv   {string}   'live' | 'practice' (default: 'live')
//   onProgress {function} Optional progress callback: ({ phase, ...detail }) => void
//
// Disclosed limitations:
//   - gate1bSeries are daily closes forward-filled to each intraday bar; they
//     do not update bar-by-bar (same as the synthetic dataset).
//   - breadth abstains entirely (no free daily breadth feed available).
//   - A Setup Gate validation at 23:30 the previous night cannot be observed
//     because the session window is 08:00-16:00 UK; real round-the-clock bars
//     would be needed for that.
export async function loadHistoricalCogDataset({
  start       = COG_DATA_DEFAULTS.backtestStart,
  end,
  instrument  = 'NAS100_USD',
  oandaKey,
  oandaEnv    = 'live',
  onProgress,
} = {}) {
  if (!oandaKey) throw new Error('oandaKey required — pass process.env.OANDA_KEY, never hardcode');

  const endDate  = end || new Date().toISOString().slice(0, 10);
  const startIso = `${start}T00:00:00Z`;
  const endIso   = `${endDate}T23:59:59Z`;

  const { sessionStartMinute, sessionEndMinute } = COG_INTRADAY_SCHEDULE;

  // ── 1. Fetch OANDA M5 candles ───────────────────────────────────────────────
  if (onProgress) onProgress({ phase: `Fetching OANDA M5 candles for ${instrument} [${start} → ${endDate}]…` });
  const rawCandles = await _fetchAllOandaM5(
    instrument, startIso, endIso, oandaKey, oandaEnv,
    p => onProgress && onProgress({ phase: 'Fetching OANDA M5 candles…', ...p })
  );

  if (!rawCandles.length) {
    throw new Error(`No OANDA M5 candles returned for ${instrument} [${start}, ${endDate}]`);
  }

  // ── 2. Convert raw candles → intraday session bars ──────────────────────────
  if (onProgress) onProgress({ phase: 'Converting to UK session bars…' });

  const sessionBars = [];
  for (const c of rawCandles) {
    const utcMs = new Date(c.time).getTime();
    const ukMin = _utcToUKMinuteOfDay(utcMs);
    if (ukMin < sessionStartMinute || ukMin > sessionEndMinute) continue;
    sessionBars.push({
      date:        _utcToUKDate(utcMs),
      minuteOfDay: ukMin,
      t:           utcMs,
      open:        parseFloat(c.mid.o),
      high:        parseFloat(c.mid.h),
      low:         parseFloat(c.mid.l),
      close:       parseFloat(c.mid.c),
      volume:      c.volume ?? 0,
    });
  }

  if (!sessionBars.length) {
    throw new Error(`No bars in session window [${sessionStartMinute}–${sessionEndMinute} min] after UK DST filtering`);
  }

  // Parallel arrays consumed by runV2Backtest.
  const dates       = sessionBars.map(b => b.date);
  const minuteOfDay = sessionBars.map(b => b.minuteOfDay);
  const t           = sessionBars.map(b => b.t);
  const ohlc        = sessionBars; // {date, t, minuteOfDay, open, high, low, close, volume}

  // ── 3. Build daily axis from session bars ───────────────────────────────────
  if (onProgress) onProgress({ phase: 'Building daily OHLC…' });

  const tradingDates = [...new Set(dates)].sort();

  // Aggregate session bars to daily OHLC (open = first bar, close = last bar).
  const dailyMap = new Map();
  for (const b of sessionBars) {
    if (!dailyMap.has(b.date)) {
      dailyMap.set(b.date, { date: b.date, t: b.t, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume });
    } else {
      const d = dailyMap.get(b.date);
      if (b.high  > d.high)  d.high  = b.high;
      if (b.low   < d.low)   d.low   = b.low;
      d.close  = b.close;  // last intraday bar is the daily close
      d.volume += b.volume;
    }
  }
  const dailyOhlc = tradingDates.map(d => dailyMap.get(d));

  // ── 4. Fetch gate1b daily series, forward-fill to intraday bars ─────────────
  if (onProgress) onProgress({ phase: 'Fetching gate1b macro series (DXY, rates, HYG/LQD, VIX, VVIX)…' });
  const gate1bDailyRaw = await _fetchGate1bDailySeries(start);

  const gate1bSeries = {};
  for (const input of COG_LIQUIDITY_1B_INPUTS) {
    const daily = gate1bDailyRaw[input.id] || [];
    gate1bSeries[input.id] = _forwardFillDailyToIntraday(daily, dates);
  }

  // ── 5. Fetch Gate1A / Gate2 / Gate3 daily macro series ─────────────────────
  if (onProgress) onProgress({ phase: 'Fetching Gate1A/Gate2/Gate3 macro series (FRED + Yahoo)…' });
  const { liquiditySeries, riskSeries, directionSeries, fetchSummary } = await _buildDailyGateSeries(tradingDates);

  if (onProgress) onProgress({ phase: 'Dataset assembled — ready for runV2Backtest' });

  return {
    synthetic: false,
    source: 'oanda',
    instrument,
    dateRange: { start, end: endDate },
    dates,
    minuteOfDay,
    t,
    ohlc,
    gate1bSeries,
    gate1bCoverage: Object.fromEntries(
      Object.entries(gate1bSeries).map(([id, series]) => [
        id,
        { total: series.length, finite: series.filter(p => Number.isFinite(p.value)).length },
      ])
    ),
    fetchSummary,
    daily: {
      dates: tradingDates,
      liquiditySeries,
      riskSeries,
      directionSeries,
      ohlc: dailyOhlc,
    },
  };
}
