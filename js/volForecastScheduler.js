/**
 * Vol & Range Forecast — server-side scheduler.
 *
 * Responsibilities:
 *   - Fetch ~3 years of daily OHLC from Oanda v20 (primary) or Yahoo Finance (fallback)
 *   - Detect high-impact events via Finnhub calendar (if FINNHUB_KEY set)
 *   - Run computeForecast() for all 10 instruments
 *   - Persist results to KV: 'vol_forecast_latest' + 'vol_forecast_YYYY-MM-DD'
 *   - Maintain an in-memory cache of the latest + last 5 sessions
 *   - Schedule a daily run at VOL_FORECAST_UTC (default 22:00 UTC, Mon–Fri)
 *
 * Data source priority:
 *   1. Oanda v20 candles API (if OANDA_KEY set) — continuous mid prices, no roll distortion
 *   2. Yahoo Finance v8 chart API — free fallback
 *
 * Exports:
 *   forecastState      — live in-memory cache { latest, history }
 *   runVolForecast()   — imperative run (used by server routes too)
 *   startVolForecastScheduler() — call once at server boot
 */

import * as kv from '../kv.js';
import { computeForecast, computeForecastFromRV, detectNewsMultiplier } from './volForecast.js';

// ── Instrument definitions ────────────────────────────────────────────────────
// oandaInstrument: Oanda v20 instrument name (primary data source)
// ticker:          Yahoo Finance ticker (fallback when OANDA_KEY not set)
const INSTRUMENTS = [
  { name: 'GOLD',   oandaInstrument: 'XAU_USD',    ticker: 'GLD',      assetClass: 'commodity' },
  // preferYahoo: Oanda NAS100_USD CFD closes at 22:00 UTC and prices differently
  // from CME NQ futures (RTH close 17:00 ET). Yahoo NQ=F uses CME settlement,
  // matching the reference system. Without this flag NQ vol diverges badly when
  // NQ makes a big intraday move that reverses by 22:00 UTC.
  { name: 'NQ',     oandaInstrument: 'NAS100_USD',  ticker: 'NQ=F',     assetClass: 'index', preferYahoo: true },
  { name: 'EURUSD', oandaInstrument: 'EUR_USD',     ticker: 'EURUSD=X', assetClass: 'fx'        },
  { name: 'GBPUSD', oandaInstrument: 'GBP_USD',     ticker: 'GBPUSD=X', assetClass: 'fx'        },
  { name: 'USDJPY', oandaInstrument: 'USD_JPY',     ticker: 'USDJPY=X', assetClass: 'fx'        },
  { name: 'AUDUSD', oandaInstrument: 'AUD_USD',     ticker: 'AUDUSD=X', assetClass: 'fx'        },
  { name: 'NZDUSD', oandaInstrument: 'NZD_USD',     ticker: 'NZDUSD=X', assetClass: 'fx'        },
  { name: 'USDCAD', oandaInstrument: 'USD_CAD',     ticker: 'USDCAD=X', assetClass: 'fx'        },
  { name: 'USDCHF', oandaInstrument: 'USD_CHF',     ticker: 'USDCHF=X', assetClass: 'fx'        },
  { name: 'GBPJPY', oandaInstrument: 'GBP_JPY',     ticker: 'GBPJPY=X', assetClass: 'fx'        },
  { name: 'EURGBP', oandaInstrument: 'EUR_GBP',     ticker: 'EURGBP=X', assetClass: 'fx'        },
  { name: 'EURJPY', oandaInstrument: 'EUR_JPY',     ticker: 'EURJPY=X', assetClass: 'fx'        },
  { name: 'EURCHF', oandaInstrument: 'EUR_CHF',     ticker: 'EURCHF=X', assetClass: 'fx'        },
  { name: 'GBPCHF', oandaInstrument: 'GBP_CHF',     ticker: 'GBPCHF=X', assetClass: 'fx'        },
  { name: 'AUDJPY', oandaInstrument: 'AUD_JPY',     ticker: 'AUDJPY=X', assetClass: 'fx'        },
  { name: 'CADJPY', oandaInstrument: 'CAD_JPY',     ticker: 'CADJPY=X', assetClass: 'fx'        },
];

const YAHOO_BASE       = 'https://query1.finance.yahoo.com/v8/finance/chart';
const OANDA_BAR_COUNT  = 800;  // ~3 years of trading days (5000 max per Oanda request)

// ── M15 realized-vol pipeline ─────────────────────────────────────────────────
const M15_GRAN        = 'M15';
const M15_BACKFILL_MS = 2 * 365.25 * 24 * 60 * 60 * 1000;  // 2-year backfill window
const RV_MAX_DAYS     = 500;                                  // days to keep in KV
const RV_KV_PREFIX    = 'vol_rv2_';                           // v2: GK per M15 bar (was close-to-close)
const GK_ADJ_SCHED    = 2 * Math.LN2 - 1;                   // 2ln2−1 ≈ 0.3863

// Hour (UTC) at which the daily forecast runs. After US session close + buffer.
const TARGET_HOUR_UTC = parseInt(process.env.VOL_FORECAST_UTC ?? '22');

// ── In-memory cache ───────────────────────────────────────────────────────────
export const forecastState = {
  latest:  null,   // most recent forecast object
  history: [],     // last 5 forecasts, newest first
};

// ── Date helpers ──────────────────────────────────────────────────────────────
const DOW_NAMES   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

function nextTradingDay(from) {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function formatSessionLabel(date) {
  const dow = DOW_NAMES[date.getUTCDay()];
  const mon = MONTH_NAMES[date.getUTCMonth()];
  return `${dow.toUpperCase()}, ${mon} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

// ── Oanda fetch (primary) ─────────────────────────────────────────────────────
function _oandaBase() {
  return (process.env.OANDA_ENV || 'live') === 'practice'
    ? 'https://api-fxpractice.oanda.com'
    : 'https://api-fxtrade.oanda.com';
}

async function fetchOHLCOanda(instrument) {
  const url = `${_oandaBase()}/v3/instruments/${encodeURIComponent(instrument)}/candles`
            + `?granularity=D&count=${OANDA_BAR_COUNT}&price=M`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` },
    signal:  AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Oanda HTTP ${res.status} for ${instrument}`);
  const data = await res.json();
  const bars = (data.candles ?? [])
    .filter(c => c.complete && c.mid)
    .map(c => ({
      open:  parseFloat(c.mid.o),
      high:  parseFloat(c.mid.h),
      low:   parseFloat(c.mid.l),
      close: parseFloat(c.mid.c),
    }))
    .filter(b => b.close > 0);
  if (bars.length < 60) throw new Error(`Only ${bars.length} valid bars for ${instrument}`);
  return bars;
}

// ── Yahoo Finance fetch (fallback) ────────────────────────────────────────────
async function fetchOHLCYahoo(ticker) {
  const url = `${YAHOO_BASE}/${encodeURIComponent(ticker)}?range=3y&interval=1d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MacroFX/1.0; +https://macrofxmodel.com)' },
    signal:  AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status} for ${ticker}`);
  const data   = await res.json();
  const result = data.chart?.result?.[0];
  if (!result) throw new Error(`No chart data for ${ticker}`);
  const ts = result.timestamp ?? [];
  const q  = result.indicators.quote[0];
  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if (o == null || h == null || l == null || c == null) continue;
    if (h <= 0 || l <= 0 || c <= 0 || o <= 0) continue;
    bars.push({ open: o, high: h, low: l, close: c });
  }
  if (bars.length < 60) throw new Error(`Only ${bars.length} valid bars for ${ticker}`);
  return bars;
}

// Dispatcher: Oanda if key is available, unless instrument sets preferYahoo.
async function fetchOHLC(cfg) {
  if (process.env.OANDA_KEY && !cfg.preferYahoo) return fetchOHLCOanda(cfg.oandaInstrument);
  return fetchOHLCYahoo(cfg.ticker);
}

// ── M15 bar fetching (batched) ────────────────────────────────────────────────
// Fetches M15 bars from `fromIso` forward in 5000-bar chunks.
// Returns the raw Oanda candle objects (with .time and .mid fields).
async function fetchM15Batched(instrument, fromIso) {
  const allBars = [];
  let cursor    = fromIso;
  const toMs    = Date.now();

  while (new Date(cursor).getTime() < toMs) {
    const url = `${_oandaBase()}/v3/instruments/${encodeURIComponent(instrument)}/candles`
              + `?granularity=${M15_GRAN}&from=${encodeURIComponent(cursor)}&count=5000&price=M`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` },
      signal:  AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Oanda M15 HTTP ${res.status} for ${instrument}`);

    const data = await res.json();
    const bars = (data.candles ?? []).filter(c => c.complete && c.mid);
    if (bars.length === 0) break;

    allBars.push(...bars);

    if (bars.length < 5000) break;   // partial batch → at current time

    // Advance cursor past last received bar
    const lastMs = new Date(bars.at(-1).time).getTime();
    cursor = new Date(lastMs + 15 * 60 * 1000).toISOString();

    await new Promise(r => setTimeout(r, 120));  // be polite to Oanda
  }

  return allBars;
}

// ── Convert M15 bars → daily realized variance ────────────────────────────────
// Chains log-returns across consecutive bars, assigns each return to the
// UTC date of the later bar, sums squared returns per day.
// Applies Garman-Klass to each M15 bar individually and sums per UTC day.
// Using each bar's own O,H,L,C rather than bar-to-bar closes means:
//   • Intraday spikes within a 15-min window are captured via H-L
//   • Missing overnight/weekend bars contribute zero (no movement assumed)
//   • No chaining required — each bar is independent
function barsToDailyRV(m15bars) {
  if (m15bars.length < 1) return [];

  const sorted = m15bars.slice().sort((a, b) => a.time.localeCompare(b.time));
  const rvMap  = new Map();

  for (const bar of sorted) {
    const h = parseFloat(bar.mid.h);
    const l = parseFloat(bar.mid.l);
    const o = parseFloat(bar.mid.o);
    const c = parseFloat(bar.mid.c);
    if (h <= 0 || l <= 0 || o <= 0 || c <= 0) continue;
    if (h < l) continue;   // bad bar

    const lnHL = Math.log(h / l);
    const lnCO = Math.log(c / o);
    if (!isFinite(lnHL) || !isFinite(lnCO) || lnHL > 0.15) continue;

    const gk   = Math.max(0.5 * lnHL * lnHL - GK_ADJ_SCHED * lnCO * lnCO, 0);
    const date = bar.time.substring(0, 10);
    rvMap.set(date, (rvMap.get(date) ?? 0) + gk);
  }

  return Array.from(rvMap.entries())
    .map(([date, rv]) => ({ date, rv }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter(d => d.rv > 0);
}

// ── Daily RV series: load from KV, backfill / update, save ───────────────────
async function getDailyRV(cfg) {
  const kvKey = RV_KV_PREFIX + cfg.name;

  // Load stored series
  let rvSeries = [];
  try {
    const raw = await kv.get(kvKey);
    if (raw) rvSeries = JSON.parse(raw);
  } catch (e) {
    console.error(`[VOL-FORECAST] RV KV read error ${cfg.name}:`, e.message);
  }

  // Check if already current (last stored date ≥ yesterday UTC)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
  const lastDate  = rvSeries.at(-1)?.date ?? null;
  if (lastDate && lastDate >= yesterday) {
    console.log(`[VOL-FORECAST] ${cfg.name} RV cache current (${lastDate}, ${rvSeries.length} days)`);
    return rvSeries;
  }

  // Fetch from start of last stored date (re-anchors the first return chain)
  // or from 2 years ago for a full backfill.
  const fromIso = lastDate
    ? new Date(lastDate + 'T00:00:00Z').toISOString()
    : new Date(Date.now() - M15_BACKFILL_MS).toISOString();

  const batchLabel = lastDate ? `update from ${lastDate}` : '2-year backfill';
  console.log(`[VOL-FORECAST] ${cfg.name} M15 fetch — ${batchLabel} …`);

  const newBars = await fetchM15Batched(cfg.oandaInstrument, fromIso);
  if (newBars.length === 0) {
    console.warn(`[VOL-FORECAST] ${cfg.name} M15 fetch returned no bars`);
    return rvSeries;
  }

  // Merge new daily RVs into stored series (deduplicate by date — latest wins)
  const newRVs = barsToDailyRV(newBars);
  const merged = new Map(rvSeries.map(d => [d.date, d.rv]));
  for (const { date, rv } of newRVs) merged.set(date, rv);

  rvSeries = Array.from(merged.entries())
    .map(([date, rv]) => ({ date, rv }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-RV_MAX_DAYS);

  try {
    await kv.put(kvKey, JSON.stringify(rvSeries));
    console.log(`[VOL-FORECAST] ${cfg.name} RV stored: ${rvSeries.length} days (last: ${rvSeries.at(-1)?.date})`);
  } catch (e) {
    console.error(`[VOL-FORECAST] RV KV write error ${cfg.name}:`, e.message);
  }

  return rvSeries;
}

// ── Finnhub event fetch ───────────────────────────────────────────────────────
async function fetchNewsEvents(targetDate) {
  const key = process.env.FINNHUB_KEY;
  if (!key) return [];
  try {
    const d   = targetDate.toISOString().split('T')[0];
    const url = `https://finnhub.io/api/v1/calendar/economic?from=${d}&to=${d}&token=${key}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MacroFXDashboard/1.0' },
      signal:  AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.economicCalendar ?? [];
  } catch {
    return [];
  }
}

// ── Core computation ──────────────────────────────────────────────────────────
export async function runVolForecast(targetDate) {
  const target = targetDate ?? new Date(_applicableSessionDate(new Date()) + 'T12:00:00Z');
  const utcDow = target.getUTCDay();

  const events  = await fetchNewsEvents(target);
  const { mult: newsMult, label: newsLabel } = detectNewsMultiplier(events);

  const sessionDate  = target.toISOString().split('T')[0];
  const sessionLabel = formatSessionLabel(target);
  const dataSource   = process.env.OANDA_KEY ? 'oanda' : 'yahoo';

  const instruments = {};
  const errors      = [];

  for (const cfg of INSTRUMENTS) {
    try {
      let f;
      if (process.env.OANDA_KEY) {
        const ohlc = await fetchOHLCOanda(cfg.oandaInstrument);
        f = computeForecast(ohlc, cfg.assetClass, newsMult);
      } else {
        const ohlc = await fetchOHLCYahoo(cfg.ticker);
        f = computeForecast(ohlc, cfg.assetClass, newsMult);
      }
      instruments[cfg.name] = f;
      console.log(`[VOL-FORECAST]  ${cfg.name.padEnd(6)} vol=${f.vol_annual.toFixed(2)}%  HL=${f.hl_median}–${f.hl_75}%  OC=${f.oc_median}–${f.oc_75}%  [${dataSource}]`);
    } catch (err) {
      console.error(`[VOL-FORECAST] ${cfg.name} error: ${err.message}`);
      errors.push({ name: cfg.name, error: err.message });
    }
  }

  const forecast = {
    ok:            Object.keys(instruments).length > 0,
    session_date:  sessionDate,
    session_label: sessionLabel,
    computed_at:   new Date().toISOString(),
    instruments,
    meta: {
      dow_label:   DOW_NAMES[utcDow],
      news_flag:   newsLabel,
      news_mult:   newsMult,
      data_source: dataSource,
      ...(errors.length ? { errors } : {}),
    },
  };

  // Persist to KV
  const json = JSON.stringify(forecast);
  try {
    await kv.put('vol_forecast_latest', json);
    await kv.put(`vol_forecast_${sessionDate}`, json);
  } catch (err) {
    console.error('[VOL-FORECAST] KV write error:', err.message);
  }

  // Update in-memory cache
  forecastState.latest  = forecast;
  forecastState.history = [forecast, ...forecastState.history].slice(0, 5);

  const n = Object.keys(instruments).length;
  console.log(`[VOL-FORECAST] ${sessionLabel}  ${n} instruments  source=${dataSource}  news=${newsLabel ?? '—'}`);
  return forecast;
}

// ── Session status (intraday tracking vs forecast) ────────────────────────────

// Ratio of expected |O-C| to expected H-L from BM theory: HN_P50 / BM_P50
const EXPECTED_DIRECTIONALITY = 0.6745 / 1.572 * 100;  // ~42.9%

// Anchor the open to the first H1 bar at/after 00:00 UTC today.
// High = rolling max of all H1 highs since midnight.
// Low  = rolling min of all H1 lows  since midnight.
// Close = last available H1 bar's close (current price).
// For FX/Gold the 00:00 bar exists; for equity indices (NQ) the first bar
// is the market open (~13:00 UTC), which becomes the effective anchor.
async function fetchMidnightAnchoredBar(instrument) {
  const now = new Date();
  const midnight = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    0, 0, 0,
  ));
  const url = `${_oandaBase()}/v3/instruments/${encodeURIComponent(instrument)}/candles`
            + `?granularity=H1&from=${encodeURIComponent(midnight.toISOString())}&price=M`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` },
    signal:  AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Oanda HTTP ${res.status}`);

  // Include incomplete bars — the in-progress hour contributes to H/L/C.
  const candles = ((await res.json()).candles ?? []).filter(c => c.mid);
  if (candles.length === 0) throw new Error('No bars since midnight');

  const open  = parseFloat(candles[0].mid.o);  // midnight (or market open) anchor
  const high  = Math.max(...candles.map(c => parseFloat(c.mid.h)));
  const low   = Math.min(...candles.map(c => parseFloat(c.mid.l)));
  const last  = candles.at(-1);
  const close = parseFloat(last.mid.c);

  return {
    open, high, low, close,
    complete:    !!last.complete,
    time:        last.time,
    anchor_time: candles[0].time,
    bar_count:   candles.length,
    bars:        candles,   // raw H1 candles for reach-time computation
  };
}

function computeSessionMetrics(bar, fc, bars = []) {
  const { open: o, high: h, low: l, close: c } = bar;
  const r2 = x => Math.round(x * 100) / 100;

  const hl  = r2((h - l) / o * 100);
  const oc  = r2((c - o) / o * 100);    // signed
  const oh  = r2((h - o) / o * 100);    // always ≥ 0
  const ol  = r2((o - l) / o * 100);    // always ≥ 0
  const dir = r2(hl > 0 ? Math.abs(oc) / hl * 100 : 0);

  // vs forecast medians
  const hlVsMed = r2(hl - fc.hl_median);
  const hlVs75  = r2(hl - fc.hl_75);

  // Remaining vs oc_median (absolute one-sided expected move)
  const ocRem = r2(Math.max(fc.oc_median - Math.abs(oc), 0));
  const ohRem = r2(Math.max(fc.oc_median - oh, 0));
  const olRem = r2(Math.max(fc.oc_median - ol, 0));

  // Ratios of actual to forecast (%)
  const ohRatio = r2(fc.oc_median > 0 ? oh / fc.oc_median * 100 : 0);
  const olRatio = r2(fc.oc_median > 0 ? ol / fc.oc_median * 100 : 0);

  // Reach times — walk H1 bars chronologically, record first bar where each
  // threshold was crossed. Time is bar open (start of that hour).
  let ohReachedAt = null, olReachedAt = null, ocReachedAt = null;
  if (bars.length > 0 && fc.oc_median > 0) {
    const medPrice = fc.oc_median / 100 * o;   // threshold in price units
    let runHigh = o, runLow = o;
    for (const b of bars) {
      const bH = parseFloat(b.mid.h);
      const bL = parseFloat(b.mid.l);
      const bC = parseFloat(b.mid.c);
      if (bH > runHigh) runHigh = bH;
      if (bL < runLow ) runLow  = bL;
      if (!ohReachedAt && (runHigh - o) >= medPrice) ohReachedAt = b.time;
      if (!olReachedAt && (o - runLow)  >= medPrice) olReachedAt = b.time;
      if (!ocReachedAt && Math.abs(bC - o) >= medPrice) ocReachedAt = b.time;
    }
  }

  // Bias
  const ohR = ohRatio / 100, olR = olRatio / 100;
  let bias, biasDetail;
  if      (olR > 1.25 && ohR < 0.55) { bias = 'Strong bearish'; biasDetail = 'downside leg dominating, upside contained'; }
  else if (ohR > 1.25 && olR < 0.55) { bias = 'Strong bullish'; biasDetail = 'upside leg dominating, downside contained'; }
  else if (olR > 1.0  && ohR < 0.75) { bias = 'Bearish bias';   biasDetail = 'downside extended'; }
  else if (ohR > 1.0  && olR < 0.75) { bias = 'Bullish bias';   biasDetail = 'upside extended'; }
  else if (ohR > 0.8  && olR > 0.8 ) { bias = 'Two-way';        biasDetail = 'both sides active'; }
  else                                 { bias = 'Neutral';        biasDetail = 'session developing'; }

  // Shape
  let shape;
  if      (dir > 65) shape = 'Highly directional';
  else if (dir > 43) shape = 'Moderate direction';
  else if (dir > 25) shape = 'Two-way / balanced';
  else               shape = 'Very two-way / choppy';

  // Outlook
  const hlConsumed = fc.hl_median > 0 ? hl / fc.hl_median : 0;
  let outlook;
  if      (hlConsumed > 0.85 && dir < 30) outlook = 'Most range consumed with little direction — likely to close near open.';
  else if (hlConsumed > 0.85 && dir > 55) outlook = 'Most range consumed directionally — trend continuation possible but extended.';
  else if (hlConsumed > 0.85)             outlook = 'Most range consumed — session likely winding down.';
  else if (hlConsumed > 0.60 && dir > 50) outlook = 'Significant range consumed directionally — watch for continuation vs. reversal.';
  else if (hlConsumed > 0.60)             outlook = 'Good range consumed — session dynamics established.';
  else if (hlConsumed < 0.25)             outlook = 'Minimal range so far — session still developing.';
  else                                     outlook = 'Moderate range consumed — more movement expected.';

  return {
    hl, oc, oh, ol, dir,
    hl_vs_med: hlVsMed, hl_vs_75: hlVs75,
    oc_rem: ocRem, oh_rem: ohRem, ol_rem: olRem,
    oh_ratio: ohRatio, ol_ratio: olRatio,
    oh_reached_at: ohReachedAt,
    ol_reached_at: olReachedAt,
    oc_reached_at: ocReachedAt,
    bias, bias_detail: biasDetail, shape, outlook,
  };
}

// In-memory session cache — avoids hammering Oanda on every dashboard poll.
let _sessionCache   = null;
let _sessionCacheAt = 0;
const SESSION_TTL_MS = 90 * 1000;  // 90 seconds

export async function getSessionStatus() {
  if (!forecastState.latest)        return { ok: false, reason: 'no_forecast' };
  if (!process.env.OANDA_KEY)       return { ok: false, reason: 'no_oanda_key', message: 'Live session tracking requires Oanda API key.' };
  if (_sessionCache && (Date.now() - _sessionCacheAt) < SESSION_TTL_MS) return _sessionCache;

  const fc          = forecastState.latest;
  const instruments = {};

  await Promise.all(INSTRUMENTS.map(async cfg => {
    try {
      const bar = await fetchMidnightAnchoredBar(cfg.oandaInstrument);
      const f   = fc.instruments[cfg.name];
      if (!f) return;
      instruments[cfg.name] = {
        ...computeSessionMetrics(bar, f, bar.bars),
        forecast:    { hl_median: f.hl_median, hl_75: f.hl_75, oc_median: f.oc_median, oc_75: f.oc_75 },
        bar_time:    bar.time,
        anchor_time: bar.anchor_time,
        bar_count:   bar.bar_count,
        complete:    bar.complete,
      };
    } catch (err) {
      instruments[cfg.name] = { error: err.message };
    }
  }));

  const result = {
    ok:            true,
    session_date:  fc.session_date,
    session_label: fc.session_label,
    fetched_at:    new Date().toISOString(),
    expected_dir:  Math.round(EXPECTED_DIRECTIONALITY * 10) / 10,
    instruments,
  };

  _sessionCache   = result;
  _sessionCacheAt = Date.now();
  return result;
}

// ── Daily scheduler ───────────────────────────────────────────────────────────
// Polls every 5 minutes. Fires the run once per calendar day after TARGET_HOUR_UTC.

let _lastRunDate = null;

async function _schedulerTick() {
  const now = new Date();
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return;                             // skip weekends
  if (now.getUTCHours() < TARGET_HOUR_UTC) return;               // too early
  const todayStr = now.toISOString().split('T')[0];
  if (_lastRunDate === todayStr) return;                          // already ran
  _lastRunDate = todayStr;

  console.log(`[VOL-FORECAST] Daily trigger at ${now.toISOString()}`);
  runVolForecast().catch(e => console.error('[VOL-FORECAST] Daily run failed:', e.message));
}

// Returns the session date that should currently be shown:
//   Before TARGET_HOUR_UTC → the nearest upcoming trading day (today or Monday if weekend)
//   At/after TARGET_HOUR_UTC on a weekday → the NEXT trading day (today's close is in)
function _applicableSessionDate(now) {
  const d   = new Date(now);
  const day = d.getUTCDay();
  const isPastCutoff = day !== 0 && day !== 6 && d.getUTCHours() >= TARGET_HOUR_UTC;
  if (isPastCutoff) return nextTradingDay(d).toISOString().split('T')[0];
  // Before cutoff (or weekend): nearest upcoming weekday
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0];
}

export async function startVolForecastScheduler() {
  // Warm up from KV
  try {
    const raw = await kv.get('vol_forecast_latest');
    if (raw) {
      const cached = JSON.parse(raw);
      forecastState.latest  = cached;
      forecastState.history = [cached];
      console.log(`[VOL-FORECAST] Warm from KV: ${cached.session_date}`);
    }
  } catch (e) {
    console.error('[VOL-FORECAST] KV warm-up error:', e.message);
  }

  // Only trigger an immediate run when we genuinely lack the currently applicable
  // forecast.  Before 22:00 UTC the applicable session is today — so a mid-day
  // restart with today's forecast cached will NOT re-run prematurely.
  const neededDate = _applicableSessionDate(new Date());
  const cachedDate = forecastState.latest?.session_date;
  const needsImmediateRun = !cachedDate || cachedDate !== neededDate;

  if (needsImmediateRun) {
    console.log(`[VOL-FORECAST] No forecast for ${neededDate} — computing on startup …`);
    runVolForecast(new Date(neededDate + 'T12:00:00Z'))
      .catch(e => console.error('[VOL-FORECAST] Startup run failed:', e.message));
  }

  // Scheduler: check every 5 minutes
  setInterval(_schedulerTick, 5 * 60 * 1000);
  const src = process.env.OANDA_KEY ? 'oanda' : 'yahoo';
  console.log(`[VOL-FORECAST] Scheduler active — daily run at ${TARGET_HOUR_UTC}:00 UTC  source=${src}`);
}
