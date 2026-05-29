/**
 * Vol & Range Forecast — server-side scheduler.
 *
 * Responsibilities:
 *   - Fetch 3 years of daily OHLC from Yahoo Finance (v8 chart API)
 *   - Detect high-impact events via Finnhub calendar (if FINNHUB_KEY set)
 *   - Run computeForecast() for GOLD, EURUSD, NQ
 *   - Persist results to KV: 'vol_forecast_latest' + 'vol_forecast_YYYY-MM-DD'
 *   - Maintain an in-memory cache of the latest + last 5 sessions
 *   - Schedule a daily run at VOL_FORECAST_UTC (default 22:00 UTC, Mon–Fri)
 *
 * Exports:
 *   forecastState      — live in-memory cache { latest, history }
 *   runVolForecast()   — imperative run (used by server routes too)
 *   startVolForecastScheduler() — call once at server boot
 */

import * as kv from '../kv.js';
import { computeForecast, detectNewsMultiplier } from './volForecast.js';

// ── Instrument definitions ────────────────────────────────────────────────────
const INSTRUMENTS = [
  { name: 'GOLD',   ticker: 'GLD',      assetClass: 'commodity' },
  { name: 'NQ',     ticker: 'NQ=F',     assetClass: 'index'     },
  { name: 'EURUSD', ticker: 'EURUSD=X', assetClass: 'fx'        },
  { name: 'GBPUSD', ticker: 'GBPUSD=X', assetClass: 'fx'        },
  { name: 'USDJPY', ticker: 'USDJPY=X', assetClass: 'fx'        },
  { name: 'AUDUSD', ticker: 'AUDUSD=X', assetClass: 'fx'        },
  { name: 'NZDUSD', ticker: 'NZDUSD=X', assetClass: 'fx'        },
  { name: 'USDCAD', ticker: 'USDCAD=X', assetClass: 'fx'        },
  { name: 'USDCHF', ticker: 'USDCHF=X', assetClass: 'fx'        },
  { name: 'GBPJPY', ticker: 'GBPJPY=X', assetClass: 'fx'        },
];

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

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

// ── Yahoo Finance fetch ───────────────────────────────────────────────────────
async function fetchOHLC(ticker) {
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

  const instruments = {};
  const errors      = [];

  for (const cfg of INSTRUMENTS) {
    try {
      const ohlc = await fetchOHLC(cfg.ticker);
      const f    = computeForecast(ohlc, cfg.assetClass, newsMult);
      instruments[cfg.name] = f;
      console.log(`[VOL-FORECAST]  ${cfg.name.padEnd(6)} vol=${f.vol_annual.toFixed(2)}%  HL=${f.hl_median}–${f.hl_75}%  OC=${f.oc_median}–${f.oc_75}%`);
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
      dow_label: DOW_NAMES[utcDow],
      news_flag: newsLabel,
      news_mult: newsMult,
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
  console.log(`[VOL-FORECAST] ${sessionLabel}  ${n} instruments  news=${newsLabel ?? '—'}`);
  return forecast;
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
    // Pass the target date explicitly so we compute for the right session.
    runVolForecast(new Date(neededDate + 'T12:00:00Z'))
      .catch(e => console.error('[VOL-FORECAST] Startup run failed:', e.message));
  }

  // Scheduler: check every 5 minutes
  setInterval(_schedulerTick, 5 * 60 * 1000);
  console.log(`[VOL-FORECAST] Scheduler active — daily run at ${TARGET_HOUR_UTC}:00 UTC`);
}
