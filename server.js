// server.js — MacroFX persistent server
//
// Replaces the Cloudflare Pages Worker + cron worker with a single
// long-running Node.js process that:
//   • Serves the dashboard as static files  (index.html, js/, css/)
//   • Handles all /api/* routes by calling the existing _worker.js logic
//   • Monitors price levels every few seconds with no minimum-interval limit
//
// Deploy to Railway, Render, Fly.io, or any Node 18+ host.
// Required env vars: OANDA_KEY  (+ same vars as _worker.js)
// Optional:         MONITOR_MS  (default 3000), DATA_DIR, PORT

import express              from 'express';
import path                from 'path';
import { fileURLToPath }   from 'url';
import fs                  from 'fs';
import { createInterface as rlCreateInterface } from 'readline';
import { execFile, spawn } from 'child_process';
import { promisify }       from 'util';
import * as kv           from './kv.js';
import worker            from './_worker.js';
import { refreshAllPairs } from './levels.js';
import { fitHMM, hmmSignalScore } from './hmm.js';
import { computeHMM5m } from './hmm5m.js';
import { computeHMM5mV2, computeMacroContext } from './hmm5m-v2.js';
import { trainHMM5mAll, loadTrainedParams, fetchFredMacro } from './hmm5m-train.js';
import { detectPolarityFlip } from './js/polarity.js';
import { assessEntry, resampleBars } from './js/vumanchu.js';
import { startVolForecastScheduler, forecastState, runVolForecast, getSessionStatus } from './js/volForecastScheduler.js';
import { yangZhangVolSeries, hv20Series, ewmaVolSeries } from './js/volForecast.js';
import { getSessionStats, computeSessionStats, isSessionStatsComputing } from './js/sessionStats.js';
import { computeHitRates, isHitRatesComputing, HR_INSTRUMENTS } from './js/hitRateBackfill.js';
import { runFullBacktest, INSTRUMENTS as BT_INSTRUMENTS }            from './js/volBacktestEngine.js';
import { runFullM1Backtest, runFullLevelAnalysis, aggregateLevelHits, loadM1ForPair, BT_M1_DIR, M1_DRIVE_IDS, loadRegimeHistoryFromR2, saveRegimeHistoryToR2 } from './js/volBacktestM1Engine.js';
import { runFullAsiaRangeBacktest, runAsiaRangeBacktest, ASIA_INSTRUMENTS } from './js/asiaRangeEngine.js';
import { runRangeFibBacktest, RANGE_FIB_INSTRUMENTS, FIB_LEVELS as RANGE_FIB_LEVELS } from './js/rangeFibEngine.js';
import { CONFLUENCE_MODULES } from './js/confluenceModules.js';
import { runFullWeeklyBacktest, WEEKLY_INSTRUMENTS as WBT_INSTRUMENTS } from './js/weeklyVolBacktestEngine.js';
import { runMacroEquityBacktest } from './js/macroEquityEngine.js';
import { loadEngine as loadGliEngine } from './GlobalLiquidity/engineLoader.mjs';
import { computeBacktest as computeGliBacktest, weeklyReturns as gliWeeklyReturns, FRED_IDS as GLI_FRED_IDS, FX_FILE_ALIAS as GLI_FX_ALIAS } from './GlobalLiquidity/backtestCore.mjs';
import { runFullZScoreBacktest, ZSCORE_PAIRS } from './js/zscoreSpreadEngine.js';
import { buildConfluenceZoneText } from './js/confluenceZoneExport.js';
import { runFullBacktest as runNasdaqBacktest, loadDailyDataset as loadNasdaqDataset } from './js/nasdaqBacktest.js';
import { computePerformanceReport as computeNasdaqPerformanceReport, monteCarloBootstrap as nasdaqMonteCarloBootstrap, walkForwardStability as nasdaqWalkForwardStability, outOfSampleSplit as nasdaqOutOfSampleSplit } from './js/nasdaqPerformance.js';
import { runResearchSuite as runNasdaqResearchSuite } from './js/nasdaqResearch.js';
import { DATA_DEFAULTS as NASDAQ_DATA_DEFAULTS } from './js/nasdaqConfig.js';
import { generateSyntheticCogDataset, fetchRealCogDataset, generateSyntheticIntradayCogDataset } from './js/cogDataSources.js';
import { runBacktest as runCogBacktest } from './js/cogBacktestEngine.js';
import { runEventBacktest as runCogEventBacktest } from './js/cogEventBacktestEngine.js';
import { computePerformanceReport as computeCogPerformanceReport, monteCarloBootstrap as cogMonteCarloBootstrap, walkForwardStability as cogWalkForwardStability, outOfSampleSplit as cogOutOfSampleSplit } from './js/nasdaqPerformance.js';
import { COG_LIQUIDITY_1A_SCORE, COG_RISK_SCORE, COG_DIRECTION_SCORE, COG_THRESHOLD1_SCORE, COG_EXIT_SCORE, COG_RISK_TIERS, COG_STOP_MODELS, COG_EXECUTION, COG_INTRADAY_SCHEDULE, COG_DATA_DEFAULTS as COG_DATA_DEFAULTS_CFG } from './js/cogConfig.js';
import { computeExitScore } from './js/cogExitEngine.js';
import { runV2Backtest } from './js/cogStateEngine.js';
import { loadHistoricalCogDataset } from './js/cogHistoricalDataLoader.js';
import { COG_V2_TRIGGER_WINDOW, COG_V2_NY_OPEN_MINUTE, COG_V2_ENTRY_DEADLINE_MINUTE, COG_V2_SETUP_NOTE, COG_V2_RISK_NOTE, COG_V2_IMPULSE_PARAMS, COG_V2_TRIGGER_SCORE, COG_V2_SETUP_HYSTERESIS, COG_V2_SLOW_SMOOTH, COG_V2_CONFIDENCE, COG_V2_MIN_SETUP_PERSIST_BARS } from './js/cogV2Config.js';

const __dirname         = path.dirname(fileURLToPath(import.meta.url));
const PORT              = parseInt(process.env.PORT              || '3000');
const MONITOR_MS        = parseInt(process.env.MONITOR_MS        || '3000');
const REFRESH_LEVELS_MS  = parseInt(process.env.REFRESH_LEVELS_MS  || String(30 * 60 * 1000));
const HMM5M_REFRESH_MS        = parseInt(process.env.HMM5M_REFRESH_MS   || String(30 * 1000)); // 30s — V2 bot polls at 30s cadence
const MACRO_REFRESH_MS        = parseInt(process.env.MACRO_REFRESH_MS    || String(6 * 60 * 60 * 1000)); // 6h — FRED data updates once daily
const HMM5M_ALERT_COOLDOWN_MS = 15 * 60 * 1000; // min gap between regime-change Telegram alerts per pair

// ── Cloudflare env-compatible object ─────────────────────────────────────────
// Exposes process.env vars and wraps kv.js so _worker.js runs unchanged.

const cfEnv = {
  FRED_KEY:         process.env.FRED_KEY,
  ANT_KEY:          process.env.ANT_KEY,
  OANDA_KEY:        process.env.OANDA_KEY,
  OANDA_ENV:        process.env.OANDA_ENV || 'live',
  OANDA_ACCOUNT_ID: process.env.OANDA_ACCOUNT_ID,
  FINNHUB_KEY:      process.env.FINNHUB_KEY,
  MYFXBOOK_SESSION: process.env.MYFXBOOK_SESSION,
  FX_SCORES: {
    get:    (key)             => kv.get(key),
    put:    (key, value, opts) => kv.put(key, value, opts),
    delete: (key)             => kv.del(key),
  },
};

// ── Worker request adapter ────────────────────────────────────────────────────
// Converts an Express req into a Web API Request and calls _worker.js.fetch().

async function callWorker(req) {
  const url  = `http://localhost${req.originalUrl}`;
  const init = { method: req.method };
  if (req.method === 'POST' || req.method === 'PUT') {
    init.body    = JSON.stringify(req.body);
    init.headers = { 'content-type': 'application/json' };
  }
  return worker.fetch(new Request(url, init), cfEnv, {});
}

// ── Monitoring constants ──────────────────────────────────────────────────────

const DEFAULT_PAIRS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD',
  'NZD/USD', 'USD/CAD', 'USD/CHF', 'GBP/JPY', 'XAU/USD', 'NAS100_USD',
  'EUR/GBP', 'EUR/JPY', 'EUR/CHF', 'GBP/CHF', 'AUD/JPY', 'CAD/JPY',
  'SPX500_USD', 'DE30_USD', 'UK100_GBP',
  'US30_USD', 'US2000_USD',
];

const PIP_SIZE = {
  'EUR/USD': 0.0001, 'GBP/USD': 0.0001, 'AUD/USD': 0.0001,
  'NZD/USD': 0.0001, 'USD/CAD': 0.0001, 'USD/CHF': 0.0001,
  'GBP/JPY': 0.01,   'USD/JPY': 0.01,   'EUR/GBP': 0.0001,
  'EUR/JPY': 0.01,   'AUD/JPY': 0.01,   'CAD/JPY': 0.01,
  'EUR/CHF': 0.0001, 'GBP/CHF': 0.0001,
  'XAU/USD': 1.0,    'NAS100_USD': 1.0,
  'SPX500_USD': 1.0, 'DE30_USD': 1.0,   'UK100_GBP': 1.0,
  'US30_USD': 1.0, 'US2000_USD': 1.0,
};

const PRICE_DIGITS = {
  'USD/JPY': 3, 'GBP/JPY': 3, 'EUR/JPY': 3, 'AUD/JPY': 3, 'CAD/JPY': 3,
  'XAU/USD': 2, 'NAS100_USD': 1, 'SPX500_USD': 1, 'DE30_USD': 1, 'UK100_GBP': 1,
  'US30_USD': 1, 'US2000_USD': 1,
};

// Typical OANDA spread in pips per pair — used as baseline for spread quality gate
const TYPICAL_SPREAD_PIPS = {
  'EUR/USD': 0.6, 'GBP/USD': 0.9, 'USD/JPY': 0.7,
  'AUD/USD': 0.9, 'NZD/USD': 1.1, 'USD/CAD': 1.1,
  'USD/CHF': 1.0, 'GBP/JPY': 2.0,   'EUR/GBP': 0.9,
  'EUR/JPY': 1.0, 'EUR/CHF': 1.5,   'GBP/CHF': 2.0,
  'AUD/JPY': 1.5, 'CAD/JPY': 2.0,
  'XAU/USD': 0.3, 'NAS100_USD': 1.0,
  'SPX500_USD': 0.3, 'DE30_USD': 0.8, 'UK100_GBP': 0.8,
  'US30_USD': 0.5, 'US2000_USD': 0.5,
};

const DEFAULT_CFG = {
  enabled:        false,
  browserEnabled: true,  // browser tab proximity alerts (server ignores this)
  serverEnabled:  true,  // Railway server monitoring loop on/off
  minGrade:       'B',   // A/B/C/D — minimum grade to alert on
  pairs:       [],
  proxPips:    { default: 5, 'XAU/USD': 15, 'NAS100_USD': 30 },
  cooldownMin:    60,   // minutes before same level+direction can re-alert
  pairCooldownMin: 240, // minutes before any alert on the same pair (4 h default)
  onlyAligned: false,
  vuManChu:    'info',  // 'off' | 'info' (show in message only) | 'filter' (affect grade)
  regimeChangeAlerts: true, // send Telegram when live 1m HMM regime changes
};

// ── In-memory monitoring state ────────────────────────────────────────────────

const state = {
  levels:              {},   // { 'EUR/USD': { data: [...], timestamp: ms } }
  cooldowns:           {},   // { 'EURUSD_1.0847_long': lastSentMs }
  pairLastAlert:       {},   // { 'EUR/USD': lastSentMs } — per-pair rate-limit
  prices:              {},   // { 'EUR/USD': { price: n, at: ms } }
  hmmRegimes:          {},   // { 'EUR/USD': { regime, trendDir, rangeProb, ... } } — daily HMM
  hmm5mRegimes:        {},   // { 'EUR/USD': { regime, pBull, pBear, pRange, confidence, ... } } — live 5m HMM
  hmm5mLastAlert:      {},   // { 'EUR/USD': ms } — cooldown for regime-change Telegram alerts
  hmm5mBars:           {},   // { 'EUR/USD': bars[] } — M1 bars cached for polarity flip detection
  hmm5mV2Regimes:      {},   // shadow V2 regimes — 4-state, learned params
  hmm1hV2Regimes:      {},   // 1h V2 regimes — same HMM on H1 bars for HTF alignment
  hmm30mV2Regimes:     {},   // 30m V2 regimes — same HMM on M30 bars, V7 primary MTF signal
  hmm2hV2Regimes:      {},   // 2h V2 regimes — same HMM on H2 bars, V7 optional 4x HTF gate
  hmm5mTrainedParams:  null, // Baum-Welch learned parameters loaded from KV
  hmm5mMacroContext:   null, // FRED macro overlay loaded from KV
  hmm5mTrainStatus:    {},   // per-pair training progress { sym: { status, iterations, nBars } }
  levelsLoadedDate:    null, // 'YYYY-MM-DD' London date of last daily levels load
  cfg:                 null,
  tg:                  null,
  lastRun:             null,
  lastAlert:           null,
  alertCount:          0,
  errors:              [],
  running:             false,
  runningAt:           0,    // timestamp when state.running was set — for watchdog
  cfgLoadedAt:         0,
  levelsLoadedAt:      0,
  levelsRefreshAt:      0,    // last time refreshAllPairs() completed
  levelsRefreshRunning: false,
  levelsRefreshStartedAt: 0, // monotonic ms when current refresh began (for watchdog)
  lastSummaryAt:       0,    // last time per-pair monitor summary was logged
  skipCounts:          {},   // { 'EUR/USD': { stars, score, prox, cooldown } } — last tick counts
};

// ── Monitoring helpers ────────────────────────────────────────────────────────

async function reloadConfig() {
  const tgRaw   = await kv.get('tg_config');
  state.tg      = tgRaw ? JSON.parse(tgRaw) : null;

  const cfgRaw  = await kv.get('ai_alert_cfg');
  state.cfg     = cfgRaw
    ? { ...DEFAULT_CFG, ...(JSON.parse(cfgRaw).data ?? {}) }
    : { ...DEFAULT_CFG };

  // Merge KV cooldowns into in-memory state — never replace, only fill gaps.
  // Replacing would wipe cooldowns set since the last KV write (every 60 s reload
  // would reset all in-memory cooldowns, causing repeat alerts on the same level).
  const cdRaw = await kv.get('ai_cron_cooldowns');
  if (cdRaw) {
    const loaded = JSON.parse(cdRaw);
    for (const [k, v] of Object.entries(loaded)) {
      if ((state.cooldowns[k] ?? 0) < v) state.cooldowns[k] = v;
    }
  }

  // Prune cooldowns older than 24 h
  const cutoff = Date.now() - 86_400_000;
  for (const k of Object.keys(state.cooldowns)) {
    if (state.cooldowns[k] < cutoff) delete state.cooldowns[k];
  }

  state.cfgLoadedAt = Date.now();
}

async function reloadLevels() {
  for (const sym of DEFAULT_PAIRS) {
    const symKey = sym.replace('/', '');
    const [raw, decisionRaw] = await Promise.all([
      kv.get(`ai_entries_${symKey}`),
      kv.get(`ai_decision_meta_${symKey}`),
    ]);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        // Normalize: server writes { data: entries[] }, browser writes { data: { entries, meta } }
        if (!Array.isArray(parsed.data) && Array.isArray(parsed.data?.entries)) {
          if (parsed.data.meta) parsed.meta = parsed.data.meta;
          parsed.data = parsed.data.entries;
        }
        // Merge decision meta from dedicated CF-KV key (browser-written, CF-routed)
        if (decisionRaw) {
          try {
            const dm = JSON.parse(decisionRaw);
            parsed.meta = { ...(parsed.meta ?? {}), ...(dm.data ?? dm) };
          } catch {}
        }
        state.levels[sym] = parsed;
        // Merge intraday30m into hmmRegimes when present (set by levels.js refreshPair)
        if (parsed.intraday30m) {
          state.hmmRegimes[sym] = { ...(state.hmmRegimes[sym] ?? {}), intraday30m: parsed.intraday30m };
        }
      } catch {}
    }
  }
  state.levelsLoadedAt = Date.now();
}

// Batch-fetch all monitored-pair prices in one OANDA call.
// Called at the start of every monitorTick so price is never more than ~3s stale.
// Falls back to per-pair M1 candle for any pair not returned by the pricing endpoint.
async function fetchAllPrices(pairs) {
  const base = (process.env.OANDA_ENV || 'live') === 'practice'
    ? 'https://api-fxpractice.oanda.com'
    : 'https://api-fxtrade.oanda.com';
  const auth = { Authorization: `Bearer ${process.env.OANDA_KEY}` };
  const now  = Date.now();

  if (process.env.OANDA_ACCOUNT_ID) {
    try {
      const instruments = pairs.map(s => s.replace('/', '_')).join('%2C');
      const r = await fetch(
        `${base}/v3/accounts/${process.env.OANDA_ACCOUNT_ID}/pricing?instruments=${instruments}`,
        { headers: auth, signal: AbortSignal.timeout(8_000) }
      );
      if (r.ok) {
        const d = await r.json();
        const fetched = new Set();
        for (const p of (d.prices ?? [])) {
          if (p.bids?.[0] && p.asks?.[0]) {
            const sym      = p.instrument.replace('_', '/');
            const bid      = parseFloat(p.bids[0].price);
            const ask      = parseFloat(p.asks[0].price);
            const price    = (bid + ask) / 2;
            const pipSz    = PIP_SIZE[sym] ?? 0.0001;
            const spreadPips = (ask - bid) / pipSz;
            state.prices[sym] = { price, spreadPips, at: now };
            fetched.add(sym);
          }
        }
        // Per-pair M1 fallback for any pair the endpoint didn't return
        for (const sym of pairs) {
          if (!fetched.has(sym)) await fetchPriceFallback(sym, base, auth, now);
        }
        return;
      }
    } catch {}
  }

  // No account ID — fetch each pair individually via M1 candle
  for (const sym of pairs) await fetchPriceFallback(sym, base, auth, now);
}

async function fetchPriceFallback(sym, base, auth, now) {
  try {
    const instrument = sym.replace('/', '_');
    const r = await fetch(
      `${base}/v3/instruments/${encodeURIComponent(instrument)}/candles?count=2&granularity=M1&price=M`,
      { headers: auth, signal: AbortSignal.timeout(8_000) }
    );
    if (!r.ok) return;
    const d     = await r.json();
    const last  = d.candles?.slice(-1)[0];
    const price = last?.mid?.c ? parseFloat(last.mid.c) : null;
    if (price != null) state.prices[sym] = { price, at: now };
  } catch {}
}

function fetchPrice(sym) {
  // After fetchAllPrices() runs, cache is always fresh — just read it
  return state.prices[sym]?.price ?? null;
}

async function fetchDailyCandles(sym, count = 60) {
  const instrument = sym.replace('/', '_');
  const base = (process.env.OANDA_ENV || 'live') === 'practice'
    ? 'https://api-fxpractice.oanda.com'
    : 'https://api-fxtrade.oanda.com';
  try {
    const r = await fetch(
      `${base}/v3/instruments/${encodeURIComponent(instrument)}/candles?granularity=D&count=${count}&price=M`,
      { headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` } }
    );
    if (!r.ok) return null;
    const d = await r.json();
    return d.candles?.filter(c => c.complete && c.mid).map(c => parseFloat(c.mid.c)) ?? null;
  } catch { return null; }
}

async function fetchHMMBars(sym, count = 300) {
  const instrument = sym.replace('/', '_');
  const base = (process.env.OANDA_ENV || 'live') === 'practice'
    ? 'https://api-fxpractice.oanda.com'
    : 'https://api-fxtrade.oanda.com';
  try {
    const r = await fetch(
      `${base}/v3/instruments/${encodeURIComponent(instrument)}/candles?granularity=M1&count=${count}&price=M`,
      { headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` }, signal: AbortSignal.timeout(10_000) }
    );
    if (!r.ok) return null;
    const d = await r.json();
    return (d.candles ?? [])
      .filter(c => c.complete !== false && c.mid)
      .map(c => ({ open: c.mid.o, high: c.mid.h, low: c.mid.l, close: c.mid.c }));
  } catch { return null; }
}

// ── Correlation History Builder ───────────────────────────────────────────────
// Fetches multi-year H4 bars from OANDA, computes rolling Pearson correlations
// + OLS factor betas, and saves bot/data/corr_history.json.
// Runs on startup (if file is missing or >7 days old) and weekly.
// No external scripts needed — all pure JS maths.

const CORR_PAIRS = [
  'EURUSD','GBPUSD','USDJPY','AUDUSD','NZDUSD','USDCAD','USDCHF','GBPJPY','EURGBP','XAUUSD',
  'EURJPY','EURCHF','GBPCHF','AUDJPY','CADJPY',
  // Metals
  'XAGUSD','XPTUSD','XCUUSD',
  // Energy
  'WTICO_USD','BCO_USD',
  // Equity indices
  'NAS100_USD','SPX500_USD','US30_USD','US2000_USD',
  // EM / China / Risk barometers
  'USDCNH','USDZAR',
];
const CORR_FACTOR_PROXIES = {
  dxy:   { sym: 'EURUSD', sign: -1.2 },
  rates: { sym: 'USDJPY', sign:  1.0 },
  vix:   { sym: 'USDCHF', sign: -1.0 },
};
const CORR_HISTORY_PATH  = path.join(path.dirname(fileURLToPath(import.meta.url)), 'bot', 'data', 'corr_history.json');
const HEDGE_SIGNALS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'bot', 'data', 'hedge_signals.json');
const HEDGE_SIGNAL_CFG_KEY = 'hedge_signal_cfg';
const CORR_STALE_MS  = 6 * 60 * 60 * 1000;  // rebuild if older than 6 hours
const CORR_WINDOW    = 60;   // H4 bars per rolling window (10 trading days)
const CORR_STEP      = 6;    // snapshot every 6 bars ≈ 1 per day
const CORR_YEARS     = 5;
const CORR_CHUNK     = 4500; // max bars per OANDA request (limit 5000)
let   corrRunning    = false;
let   corrProgress   = { pct: 0, msg: 'Idle', step: '', error: null };

// Convert CORR_PAIRS format (EURUSD) to state.prices key format (EUR/USD)
function _pairToSlash(sym) {
  if (sym.includes('/') || sym.includes('_')) return sym;
  if (sym === 'XAUUSD') return 'XAU/USD';
  if (sym.length === 6) return `${sym.slice(0,3)}/${sym.slice(3)}`;
  return sym;
}

function _h4OandaSym(sym) {
  const ov = { XAUUSD:'XAU_USD', XAGUSD:'XAG_USD', NAS100:'NAS100_USD', SPX500:'SPX500_USD', 'DE30_USD':'DE30_EUR' };
  if (ov[sym]) return ov[sym];
  if (sym.includes('_')) return sym;  // already in OANDA format (e.g. NAS100_USD, DE30_USD)
  if (sym.length === 6 && /^[A-Z]+$/.test(sym)) return `${sym.slice(0,3)}_${sym.slice(3)}`;
  return null;
}

async function fetchH4Bars(sym, years = CORR_YEARS) {
  const osym = _h4OandaSym(sym);
  if (!osym || !process.env.OANDA_KEY) return null;
  const base = (process.env.OANDA_ENV || 'live') === 'practice'
    ? 'https://api-fxpractice.oanda.com' : 'https://api-fxtrade.oanda.com';
  const closes = [], timestamps = [];
  let chunkFrom = new Date(Date.now() - years * 365.25 * 86400_000);
  const now = new Date();
  while (chunkFrom < now) {
    const chunkTo = new Date(Math.min(chunkFrom.getTime() + CORR_CHUNK * 4 * 3600_000, now.getTime()));
    // OANDA rejects requests that include from, to, AND count simultaneously.
    // Use from+to only; chunk size ensures we stay well under the 5000 bar limit.
    const url = `${base}/v3/instruments/${encodeURIComponent(osym)}/candles`
      + `?granularity=H4&price=M`
      + `&from=${chunkFrom.toISOString().slice(0,19)+'Z'}`
      + `&to=${chunkTo.toISOString().slice(0,19)+'Z'}`;
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` },
                                   signal: AbortSignal.timeout(30_000) });
      if (r.ok) {
        const d = await r.json();
        for (const c of (d.candles || []).filter(c => c.mid)) {
          closes.push(parseFloat(c.mid.c));
          timestamps.push(new Date(c.time));
        }
      } else {
        const errText = await r.text().catch(() => '');
        console.warn(`[CORR] OANDA H4 ${sym}: HTTP ${r.status} — ${errText.slice(0,200)}`);
      }
    } catch (e) { console.warn(`[CORR] H4 chunk ${sym}: ${e.message}`); }
    chunkFrom = chunkTo;
    await new Promise(r => setTimeout(r, 250)); // polite gap between OANDA requests
  }
  return closes.length >= CORR_WINDOW + 1 ? { closes, timestamps } : null;
}

function _logRets(arr) {
  const out = [];
  for (let i = 1; i < arr.length; i++) out.push(Math.log(Math.max(arr[i],1e-10)/Math.max(arr[i-1],1e-10)));
  return out;
}
function _pearson(xs, ys) {
  const n = xs.length; if (n < 4) return null;
  let mx=0, my=0; for (let i=0;i<n;i++){mx+=xs[i];my+=ys[i];} mx/=n; my/=n;
  let num=0,da=0,db=0; for (let i=0;i<n;i++){const a=xs[i]-mx,b=ys[i]-my;num+=a*b;da+=a*a;db+=b*b;}
  const d=Math.sqrt(da*db); return d<1e-12?0:Math.max(-1,Math.min(1,num/d));
}
function _ols(y, x) {
  const n=y.length; if (n<3) return [0,0];
  let mx=0,my=0; for (let i=0;i<n;i++){mx+=x[i];my+=y[i];} mx/=n;my/=n;
  let cov=0,vx=0; for (let i=0;i<n;i++){cov+=(x[i]-mx)*(y[i]-my);vx+=(x[i]-mx)**2;}
  if (vx<1e-12) return [0,0];
  const b=cov/vx, a=my-b*mx;
  let ss=0,st=0; for (let i=0;i<n;i++){ss+=(y[i]-a-b*x[i])**2;st+=(y[i]-my)**2;}
  return [+b.toFixed(4), st<1e-12?0:+Math.max(0,Math.min(1,1-ss/st)).toFixed(4)];
}
function _ema(arr, p) {
  const r=[...arr], k=2/(p+1); for (let i=1;i<r.length;i++) r[i]=arr[i]*k+r[i-1]*(1-k); return r;
}
function _regime(closes) {
  const n=closes.length; if (n<25) return 'RANGE';
  const fast=_ema(closes,20), slow=_ema(closes,Math.min(50,n));
  const ref=Math.max(Math.abs(closes[n-1]),1e-10);
  const spread=(fast[n-1]-slow[n-1])/ref, slope=n>=6?(fast[n-1]-fast[n-6])/ref:0;
  if (spread>0.0025&&slope>0.00015) return 'BULL';
  if (spread<-0.0025&&slope<-0.00015) return 'BEAR';
  return 'RANGE';
}

async function buildCorrHistoryJS() {
  if (corrRunning) { console.log('[CORR] Already running — skipped'); return; }
  corrRunning = true;
  corrProgress = { pct: 0, msg: 'Starting…', step: 'init', error: null };
  const t0 = Date.now();
  console.log('[CORR] Building correlation history...');
  try {
    // Fetch all required symbols
    const allSyms = [...new Set([...CORR_PAIRS, ...Object.values(CORR_FACTOR_PROXIES).map(p => p.sym)])];
    const barData = {};
    for (let si = 0; si < allSyms.length; si++) {
      const sym = allSyms[si];
      corrProgress = { pct: Math.round(si / allSyms.length * 60), msg: `Fetching ${sym} bars from OANDA…`, step: 'fetch', error: null };
      const result = await fetchH4Bars(sym, CORR_YEARS);
      if (result) { barData[sym] = result; console.log(`[CORR]   ${sym}: ${result.closes.length} bars`); }
      else { console.log(`[CORR]   ${sym}: skipped (no data / OANDA error)`); }
    }

    const availPairs = CORR_PAIRS.filter(p => barData[p]);
    if (!availPairs.length) {
      corrProgress = { pct: 0, msg: 'No pairs fetched — check OANDA key and account access', step: 'error', error: 'No data returned from OANDA for any pair. Check server logs.' };
      console.log('[CORR] No pairs — abort. Check OANDA_KEY and that your account has access to all instruments.');
      return;
    }
    corrProgress = { pct: 62, msg: `Computing rolling correlations for ${availPairs.length} pairs…`, step: 'compute', error: null };

    // Align all return series to the reference pair's timestamps
    const refPair = availPairs.find(p => ['EURUSD','GBPUSD','USDJPY'].includes(p)) || availPairs[0];
    const refTs   = barData[refPair].timestamps;
    const n       = refTs.length - 1;

    const retSeries = {};
    for (const sym of availPairs) {
      const { closes, timestamps } = barData[sym];
      const rmap = new Map();
      const rets = _logRets(closes);
      for (let i = 0; i < rets.length; i++) rmap.set(timestamps[i+1].getTime(), rets[i]);
      retSeries[sym] = refTs.slice(1).map(ts => rmap.get(ts.getTime()) ?? null);
    }

    // Factor return series (proxy * sign)
    const factorRets = {};
    for (const [fname, { sym, sign }] of Object.entries(CORR_FACTOR_PROXIES))
      if (retSeries[sym]) factorRets[fname] = retSeries[sym].map(v => v !== null ? v * sign : null);

    const refCloses = barData[refPair].closes;
    const records   = [];

    for (let end = CORR_WINDOW; end <= n; end += CORR_STEP) {
      const s      = end - CORR_WINDOW;
      const ts     = refTs[end];
      const regime = _regime(refCloses.slice(Math.max(0, end - 59), end + 1));
      const corr   = {}, beta = {};

      for (let i = 0; i < availPairs.length; i++) {
        const pa = availPairs[i];
        beta[pa] = {};

        // OLS factor betas
        for (const [fname, frets] of Object.entries(factorRets)) {
          const yr=[], fr=[];
          for (let k=s;k<end;k++) if (retSeries[pa][k]!==null&&frets[k]!==null){yr.push(retSeries[pa][k]);fr.push(frets[k]);}
          if (yr.length>=10) { const [b]=_ols(yr,fr); beta[pa][fname]=b; }
        }

        // Pair-pair Pearson correlations (lower triangle)
        for (let j = i+1; j < availPairs.length; j++) {
          const pb=availPairs[j], xa=[], xb=[];
          for (let k=s;k<end;k++) if (retSeries[pa][k]!==null&&retSeries[pb][k]!==null){xa.push(retSeries[pa][k]);xb.push(retSeries[pb][k]);}
          if (xa.length>=10) { const c=_pearson(xa,xb); if (c!==null) corr[`${pa}_${pb}`]=+c.toFixed(4); }
        }
      }
      records.push({ ts: ts.getTime(), ts_str: ts.toISOString().slice(0,16).replace('T',' '), regime, corr, beta });
    }

    // ── Summary statistics ──────────────────────────────────────────────────
    const avgSums={}, avgCnts={}, rgCorrData={}, rgStatData={};
    for (const rec of records) {
      const rg = rec.regime;
      if (!rgCorrData[rg]) rgCorrData[rg]={};
      if (!rgStatData[rg]) rgStatData[rg]={};
      for (const [k,v] of Object.entries(rec.corr)) {
        avgSums[k]=(avgSums[k]||0)+v; avgCnts[k]=(avgCnts[k]||0)+1;
        if (!rgCorrData[rg][k]) rgCorrData[rg][k]=[];
        rgCorrData[rg][k].push(v);
      }
      for (const [pair,betas] of Object.entries(rec.beta)) {
        if (!rgStatData[rg][pair]) rgStatData[rg][pair]={dxy:[],rates:[],vix:[]};
        for (const f of ['dxy','rates','vix']) if (betas[f]!==undefined) rgStatData[rg][pair][f].push(betas[f]);
      }
    }

    const avgCorr={};
    for (const k of Object.keys(avgSums)) avgCorr[k]=+(avgSums[k]/avgCnts[k]).toFixed(4);

    const regimeCorr={};
    for (const [rg,corrs] of Object.entries(rgCorrData)) {
      regimeCorr[rg]={};
      for (const [k,vals] of Object.entries(corrs))
        regimeCorr[rg][k]=+(vals.reduce((s,v)=>s+v,0)/vals.length).toFixed(4);
    }

    const regimeStats={};
    for (const [rg,pairData] of Object.entries(rgStatData)) {
      for (const [pair,vals] of Object.entries(pairData)) {
        if (!regimeStats[pair]) regimeStats[pair]={};
        const mean=a=>a.length?+(a.reduce((s,v)=>s+v,0)/a.length).toFixed(4):null;
        regimeStats[pair][rg]={ dxy_mean:mean(vals.dxy), rates_mean:mean(vals.rates), vix_mean:mean(vals.vix), n:vals.vix.length };
      }
    }

    const output = { generated:new Date().toISOString(), years:CORR_YEARS,
      window_bars:CORR_WINDOW, step_bars:CORR_STEP, pairs:availPairs,
      records, regime_stats:regimeStats, avg_corr:avgCorr, regime_corr:regimeCorr };

    corrProgress = { pct: 95, msg: 'Saving history file…', step: 'save', error: null };
    fs.mkdirSync(path.dirname(CORR_HISTORY_PATH), { recursive: true });
    fs.writeFileSync(CORR_HISTORY_PATH, JSON.stringify(output));
    const kb = Math.round(fs.statSync(CORR_HISTORY_PATH).size / 1024);
    console.log(`[CORR] Done — ${records.length} snapshots, ${availPairs.length} pairs, ${kb} KB, ${Date.now()-t0}ms`);

    // Push compact hedge-alerts summary to KV so CF Pages can read it without
    // hitting /api/hedge-alerts directly (which is Railway-only).
    try {
      const sums2b = {}, sums2c = {}, cnts2 = {}, lastCorr2 = {};
      for (const r of records) {
        for (const [k, v] of Object.entries(r.corr || {})) {
          if (!sums2b[k]) { sums2b[k] = 0; sums2c[k] = 0; cnts2[k] = 0; }
          sums2b[k] += v; sums2c[k] += v * v; cnts2[k]++;
          lastCorr2[k] = v;
        }
      }
      const corr_std2 = {};
      for (const k of Object.keys(sums2b)) {
        const n = cnts2[k], mu = sums2b[k] / n;
        corr_std2[k] = n > 1 ? +(Math.sqrt(Math.max(0, sums2c[k] / n - mu * mu))).toFixed(5) : 0;
      }
      const alertsCache = { generated: output.generated, pairs: availPairs,
        avg_corr: avgCorr, corr_std: corr_std2, last_corr: lastCorr2 };
      await kv.put('hedge_alerts_cache', JSON.stringify(alertsCache), { expirationTtl: 86400 * 7 });
      console.log('[CORR] hedge_alerts_cache written to KV');
    } catch (kvErr) {
      console.warn('[CORR] hedge_alerts_cache KV write failed:', kvErr.message);
    }

    corrProgress = { pct: 100, msg: `Done — ${records.length} snapshots · ${availPairs.length} pairs · ${kb} KB`, step: 'done', error: null };

  } catch (e) {
    console.error('[CORR] Build error:', e.message, e.stack?.split('\n')[1]);
    corrProgress = { pct: 0, msg: `Build failed: ${e.message}`, step: 'error', error: e.message };
  } finally {
    corrRunning = false;
  }
}

async function runCorrHistoryRefresh() {
  if (corrRunning || !process.env.OANDA_KEY) return;
  try {
    const stat = fs.statSync(CORR_HISTORY_PATH);
    if (Date.now() - stat.mtimeMs < CORR_STALE_MS) return; // file is fresh
  } catch { /* file missing — build it */ }
  buildCorrHistoryJS().catch(e => console.error('[CORR]', e.message));
}

// ── Hedge Signal Generator ───────────────────────────────────────────────────
// Scans corr_history for rolling-correlation z-score divergences and fires
// Telegram alerts. Output JSON is designed to be consumed by a Python trading bot.

const DEFAULT_HEDGE_CFG = {
  enabled: true,
  entry_z: 2.0,
  exit_z: 0.5,
  stop_z: 3.5,
  min_score: 0.1,
  min_corr: 0.3,
  allowed_regimes: ['BEAR', 'RANGE', 'BULL'],
  check_interval_min: 15,
};
let _hedgeSigRunning = false;

function _hedgeScore(corr, betaA, betaB) {
  const corrPart  = -corr * 0.7;
  const betaSpread = Math.abs((betaA ?? 0) - (betaB ?? 0));
  const betaPart  = Math.min(betaSpread / 2, 1) * 0.3;
  return +(corrPart + betaPart).toFixed(4);
}

// Welford online state per pair-pair key — accumulates since server start (resets on restart).
// Mirrors the backtest's Welford spread z-score: no lookahead, converges to true long-run mean.
const _spreadWelford = {};

// Update Welford state for the log-spread and return { z, dev } where:
//   z   = (spread − running_mean) / running_std  — PRIMARY entry/exit/stop signal
//   dev = spread − running_mean                  — sign determines direction
// Returns null until ≥10 observations have accumulated.
function _spreadZ(pa, pb, pxA, pxB) {
  const k = `${pa}__${pb}`;
  if (!_spreadWelford[k]) _spreadWelford[k] = { mu: 0, M2: 0, n: 0 };
  const st = _spreadWelford[k];
  const s = Math.log(pxA) - Math.log(pxB);
  st.n++;
  const d1 = s - st.mu;
  st.mu += d1 / st.n;
  st.M2 += d1 * (s - st.mu);
  if (st.n < 10) return null;
  const std = Math.sqrt(st.M2 / (st.n - 1));
  if (std < 1e-8) return null;
  const dev = s - st.mu;
  return { z: dev / std, dev };
}

// Capture exit prices from live state and compute equal-weight P&L for a closing signal.
function _attachExitPnl(sig, pa, pb) {
  const keyA = _pairToSlash(pa);
  const keyB = _pairToSlash(pb);
  const xA = state.prices[keyA]?.price;
  const xB = state.prices[keyB]?.price;
  sig.exit_price_a = xA != null ? +xA.toFixed(PRICE_DIGITS[keyA] ?? 5) : null;
  sig.exit_price_b = xB != null ? +xB.toFixed(PRICE_DIGITS[keyB] ?? 5) : null;
  const pA = (sig.entry_price_a != null && sig.exit_price_a != null)
    ? (sig.exit_price_a - sig.entry_price_a) / sig.entry_price_a * 100 * (sig.direction_a === 'LONG' ? 1 : -1) : null;
  const pB = (sig.entry_price_b != null && sig.exit_price_b != null)
    ? (sig.exit_price_b - sig.entry_price_b) / sig.entry_price_b * 100 * (sig.direction_b === 'LONG' ? 1 : -1) : null;
  if (pA != null) sig.pnl_a_pct = +pA.toFixed(4);
  if (pB != null) sig.pnl_b_pct = +pB.toFixed(4);
  if (pA != null && pB != null) sig.pnl_c_pct = +((pA + pB) / 2).toFixed(4);
}

// force=true bypasses the enabled flag and regime gate (used by the manual Check Now button).
async function computeHedgeSignals(force = false) {
  if (_hedgeSigRunning) return { status: 'busy' };
  _hedgeSigRunning = true;
  try {
    if (!fs.existsSync(CORR_HISTORY_PATH)) return { status: 'no_data', error: 'corr_history.json not found — run a correlation history build first' };
    const data    = JSON.parse(fs.readFileSync(CORR_HISTORY_PATH, 'utf8'));
    const records = data.records || [];
    if (records.length < 20) return { status: 'no_data', error: `Only ${records.length} corr records — need ≥20` };

    const cfgRaw = await kv.get(HEDGE_SIGNAL_CFG_KEY);
    const cfg    = cfgRaw ? { ...DEFAULT_HEDGE_CFG, ...JSON.parse(cfgRaw) } : { ...DEFAULT_HEDGE_CFG };
    if (!cfg.enabled && !force) return { status: 'disabled' };

    // Ensure live prices exist for ALL corr pairs, not just bot-monitored pairs.
    // fetchAllPrices normally runs only for the bot's pair list — corr pairs like
    // EURGBP, EURJPY, AUDJPY, SPX500_USD etc. may be missing without this call.
    const corrPricePairs = (data.pairs || []).map(_pairToSlash);
    await fetchAllPrices(corrPricePairs).catch(() => {});

    // Build rolling stats per pair-pair key
    const sums = {}, sums2 = {}, cnts = {}, lastCorr = {}, lastBeta = {};
    for (const rec of records) {
      for (const [k, v] of Object.entries(rec.corr || {})) {
        if (!sums[k]) { sums[k] = 0; sums2[k] = 0; cnts[k] = 0; }
        sums[k] += v; sums2[k] += v * v; cnts[k]++;
        lastCorr[k] = v;
      }
      Object.assign(lastBeta, rec.beta || {});
    }

    const regime  = (records[records.length - 1]?.regime) || 'UNKNOWN';
    if (!cfg.allowed_regimes.includes(regime) && !force) {
      console.log(`[HEDGE-SIG] Regime ${regime} not in allowed list — skip`);
      return { status: 'regime_blocked', regime };
    }

    let sigData = { signals: [], last_run: null };
    if (fs.existsSync(HEDGE_SIGNALS_PATH)) {
      try { sigData = JSON.parse(fs.readFileSync(HEDGE_SIGNALS_PATH, 'utf8')); } catch {}
    }

    const tgRaw = await kv.get('hedge_signal_tg');
    const tgCfg = tgRaw ? JSON.parse(tgRaw) : null;
    const now   = new Date().toISOString();
    sigData.last_run = now;
    const newSigs = [];

    for (const [key, curCorr] of Object.entries(lastCorr)) {
      const n = cnts[key];
      if (n < 20) continue;
      const mu  = sums[key] / n;
      const std = Math.sqrt(Math.max(0, sums2[key] / n - mu * mu));
      if (std < 0.01) continue;
      const z = (curCorr - mu) / std;

      // Resolve pair names from key (keys built as `${pa}_${pb}` in corr build)
      let pa = null, pb = null;
      for (const p of (data.pairs || [])) {
        if (key.startsWith(p + '_')) { pa = p; pb = key.slice(p.length + 1); break; }
      }
      if (!pa || !pb || !(data.pairs || []).includes(pb)) continue;

      const betaA = lastBeta[pa]?.vix ?? null;
      const betaB = lastBeta[pb]?.vix ?? null;
      const score = _hedgeScore(curCorr, betaA, betaB);

      // Correlation quality gate — skip pairs with weak co-movement
      if (Math.abs(curCorr) < (cfg.min_corr ?? 0.3)) continue;

      // Compute spread z-score from live prices — this is the primary signal for all decisions
      const pxA = state.prices[_pairToSlash(pa)]?.price;
      const pxB = state.prices[_pairToSlash(pb)]?.price;
      const spreadResult = (pxA && pxB) ? _spreadZ(pa, pb, pxA, pxB) : null;
      // spreadResult = { z, dev } or null (history still building)

      // ── Always manage ACTIVE signals first ─────────────────────────────────
      const existing = sigData.signals.find(s => s.pair_a === pa && s.pair_b === pb && s.status === 'ACTIVE');
      if (existing) {
        // Use spread_z for exit/stop; fall back to corrZ only while history builds
        const exitZ = spreadResult !== null ? spreadResult.z : z;
        existing.z_score      = +exitZ.toFixed(3);
        existing.corr_current = +curCorr.toFixed(4);
        existing.hedge_score  = score;
        existing.last_updated = now;
        if (spreadResult !== null) {
          existing.spread_dev = +spreadResult.dev.toFixed(6);
        }
        if (Math.abs(exitZ) < cfg.exit_z) {
          existing.status    = 'EXITED';
          existing.exit_time = now;
          existing.exit_z    = +exitZ.toFixed(3);
          _attachExitPnl(existing, pa, pb);
          if (tgCfg?.token && tgCfg?.chatId) {
            const pnlStr = existing.pnl_c_pct != null ? `  |  P&L: <b>${existing.pnl_c_pct >= 0 ? '+' : ''}${existing.pnl_c_pct.toFixed(3)}%</b>` : '';
            const msg = `✅ <b>Hedge Exit — ${pa} / ${pb}</b>\n`
              + `Spread Z reverted to <b>${existing.z_score}</b> (target &lt; ${cfg.exit_z})${pnlStr}\n`
              + `Close: <b>${pa}</b> ${existing.direction_a}  ·  <b>${pb}</b> ${existing.direction_b}\n`
              + `Regime: ${regime}`;
            sendTelegram(tgCfg.token, tgCfg.chatId, msg).catch(() => {});
          }
        } else if (Math.abs(exitZ) > cfg.stop_z) {
          existing.status    = 'STOPPED';
          existing.exit_time = now;
          existing.exit_z    = +exitZ.toFixed(3);
          _attachExitPnl(existing, pa, pb);
          if (tgCfg?.token && tgCfg?.chatId) {
            const pnlStr = existing.pnl_c_pct != null ? `  |  P&L: <b>${existing.pnl_c_pct >= 0 ? '+' : ''}${existing.pnl_c_pct.toFixed(3)}%</b>` : '';
            const msg = `🛑 <b>Hedge Stop — ${pa} / ${pb}</b>\n`
              + `Spread Z extended to <b>${existing.z_score}</b> (stop &gt; ${cfg.stop_z})${pnlStr}\n`
              + `Close: <b>${pa}</b> ${existing.direction_a}  ·  <b>${pb}</b> ${existing.direction_b}\n`
              + `Regime: ${regime}`;
            sendTelegram(tgCfg.token, tgCfg.chatId, msg).catch(() => {});
          }
        }
        continue; // active signal managed — skip new-entry check
      }

      // ── New entry: use spread_z if warmed up, fall back to corr_z ────────────
      // Mirrors the exit logic: spreadResult is null until _spreadWelford has ≥10
      // observations (resets on restart). Corr_z from full history is always available
      // and is equivalent — once spread Welford warms up it takes over automatically.
      const entryZ = spreadResult !== null ? spreadResult.z : z;
      if (Math.abs(entryZ) < cfg.entry_z) continue;
      if (score < cfg.min_score) continue;

      // Direction: spread_dev sign if available, else corr_z sign (negative = pairs
      // have diverged below mean → expect reversion up → LONG A, SHORT B)
      const devPositive = spreadResult !== null ? spreadResult.dev >= 0 : z > 0;
      const dirA = devPositive ? 'SHORT' : 'LONG';
      const dirB = devPositive ? 'LONG'  : 'SHORT';

      const sig = {
        id: `${pa}-${pb}-${Date.now()}`,
        schema_version: 2,
        pair_a: pa, pair_b: pb,
        direction_a: dirA, direction_b: dirB,
        z_score: +entryZ.toFixed(3),
        hedge_score: score,
        corr_current: +curCorr.toFixed(4),
        corr_mean: +mu.toFixed(4),
        corr_std: +std.toFixed(4),
        beta_vix_a: betaA !== null ? +betaA.toFixed(4) : null,
        beta_vix_b: betaB !== null ? +betaB.toFixed(4) : null,
        z_source: spreadResult !== null ? 'spread' : 'corr',
        regime,
        status: 'ACTIVE',
        entry_time: now,
        entry_z: +entryZ.toFixed(3),
        exit_z_target: cfg.exit_z,
        stop_z: cfg.stop_z,
        last_updated: now,
        entry_price_a: (() => { const p = state.prices[_pairToSlash(pa)]?.price; return p ? +p.toFixed(PRICE_DIGITS[_pairToSlash(pa)] ?? 5) : null; })(),
        entry_price_b: (() => { const p = state.prices[_pairToSlash(pb)]?.price; return p ? +p.toFixed(PRICE_DIGITS[_pairToSlash(pb)] ?? 5) : null; })(),
        spread_dev: spreadResult !== null ? +spreadResult.dev.toFixed(6) : null,
      };
      newSigs.push(sig);
      sigData.signals.push(sig);

      if (tgCfg?.token && tgCfg?.chatId) {
        const bullet = spreadResult.dev > 0 ? '📈' : '📉';
        const msg = `${bullet} <b>Hedge Signal — ${pa} / ${pb}</b>\n`
          + `Spread Z: <b>${sig.z_score}</b>  |  Score: <b>${score}</b>\n`
          + `<b>${pa}</b>: ${dirA}  (β_vix = ${sig.beta_vix_a ?? 'n/a'})\n`
          + `<b>${pb}</b>: ${dirB}  (β_vix = ${sig.beta_vix_b ?? 'n/a'})\n`
          + `Regime: ${regime}  |  Corr: ${sig.corr_current} (μ=${sig.corr_mean} σ=${sig.corr_std})\n`
          + `<i>Spread entry z &gt; ${cfg.entry_z} | exit z &lt; ${cfg.exit_z} | stop z &gt; ${cfg.stop_z}</i>`;
        sendTelegram(tgCfg.token, tgCfg.chatId, msg).catch(() => {});
      }
    }

    fs.mkdirSync(path.dirname(HEDGE_SIGNALS_PATH), { recursive: true });
    fs.writeFileSync(HEDGE_SIGNALS_PATH, JSON.stringify(sigData, null, 2));
    if (newSigs.length) console.log(`[HEDGE-SIG] ${newSigs.length} new:`, newSigs.map(s => `${s.pair_a}/${s.pair_b} z=${s.z_score}`).join(', '));
    return { status: 'ok', newSignals: newSigs.length, totalSignals: sigData.signals?.length ?? 0 };
  } catch (e) {
    console.error('[HEDGE-SIG]', e.message);
    return { status: 'error', error: e.message };
  } finally {
    _hedgeSigRunning = false;
  }
}

// ── Beta Estimation (Kalman OLS) ─────────────────────────────────────────────
// Mirrors bot/modules/beta_estimator.py — runs server-side via OANDA H4 bars.
// Pushes `beta_estimates` to KV every 2 hours so the dashboard beta panel works
// without a local bot. portfolio_beta/deviation/rebalance still need MT5 locally.

const BETA_WINDOW      = 60;          // rolling OLS window (bars)
const BETA_MIN_WINDOW  = 20;          // minimum bars for valid regression
const BETA_BAR_COUNT   = 80;          // H4 bars to fetch per symbol (~13 days)
const BETA_Q           = 1e-4;        // Kalman process noise — beta drift rate
const BETA_R_DEFAULT   = 0.10;        // Kalman observation noise fallback
const BETA_INTERVAL_MS = 2 * 60 * 60 * 1000; // rebuild every 2 hours

const BETA_FACTOR_PROXIES = {
  beta_dxy:   { sym: 'EURUSD', sign: -1.2 },  // DXY proxy (EUR ~57% weight, inverted)
  beta_rates: { sym: 'USDJPY', sign:  1.0 },  // US-Japan rates differential
  beta_vix:   { sym: 'USDCHF', sign: -1.0 },  // Risk-off proxy (CHF safe-haven, inverted)
};

// All pairs to estimate beta for (factor proxy pairs are also in this list)
const BETA_PAIRS = [
  'EURUSD','GBPUSD','USDJPY','AUDUSD','NZDUSD','USDCAD','USDCHF','GBPJPY','EURGBP','XAUUSD',
  'EURJPY','EURCHF','GBPCHF','AUDJPY','CADJPY',
  'NAS100_USD','SPX500_USD','DE30_USD','UK100_GBP','US30_USD','US2000_USD',
];

function _betaLogReturns(closes) {
  const r = [];
  for (let i = 1; i < closes.length; i++) {
    r.push(Math.log(Math.max(closes[i], 1e-10)) - Math.log(Math.max(closes[i-1], 1e-10)));
  }
  return r;
}

function _olsBeta(pr, fr) {
  const n = Math.min(BETA_WINDOW, pr.length, fr.length);
  if (n < BETA_MIN_WINDOW) return { beta: 0, rSq: 0 };
  const pairs = pr.slice(-n).map((y, i) => [y, fr[fr.length - n + i]])
    .filter(([y, x]) => isFinite(y) && isFinite(x));
  if (pairs.length < BETA_MIN_WINDOW) return { beta: 0, rSq: 0 };
  const yA = pairs.map(p => p[0]), xA = pairs.map(p => p[1]);
  const xM = xA.reduce((s, v) => s + v, 0) / xA.length;
  const yM = yA.reduce((s, v) => s + v, 0) / yA.length;
  const num = xA.reduce((s, x, i) => s + (x - xM) * (yA[i] - yM), 0);
  const den = xA.reduce((s, x) => s + (x - xM) ** 2, 0);
  if (Math.abs(den) < 1e-12) return { beta: 0, rSq: 0 };
  const beta = num / den;
  const alpha = yM - beta * xM;
  const ssRes = yA.reduce((s, y, i) => s + (y - alpha - beta * xA[i]) ** 2, 0);
  const ssTot = yA.reduce((s, y) => s + (y - yM) ** 2, 0);
  return { beta, rSq: ssTot > 1e-12 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0 };
}

// Kalman states persist in memory across 2-hour rebuild cycles
const _betaKalmans = {};

function _kalmanStep(kf, pairRet, factorRet) {
  const pPred = kf.p + kf.q;
  if (Math.abs(factorRet) < 1e-10) { kf.p = pPred; return; }
  const h = factorRet;
  const k = pPred * h / (h * h * pPred + kf.r);
  kf.x = kf.x + k * (pairRet - h * kf.x);
  kf.p = Math.max((1 - k * h) * pPred, 1e-8);
}

async function fetchH4BarsShort(sym) {
  const osym = _h4OandaSym(sym);
  if (!osym || !process.env.OANDA_KEY) return null;
  const base = (process.env.OANDA_ENV || 'live') === 'practice'
    ? 'https://api-fxpractice.oanda.com' : 'https://api-fxtrade.oanda.com';
  try {
    const r = await fetch(
      `${base}/v3/instruments/${encodeURIComponent(osym)}/candles?granularity=H4&price=M&count=${BETA_BAR_COUNT}`,
      { headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` }, signal: AbortSignal.timeout(15_000) }
    );
    if (!r.ok) return null;
    const data = await r.json();
    const closes = (data.candles || [])
      .filter(c => c.complete !== false)
      .map(c => parseFloat(c.mid?.c))
      .filter(v => isFinite(v) && v > 0);
    return closes.length >= BETA_MIN_WINDOW + 1 ? closes : null;
  } catch { return null; }
}

let _betaRunning = false;

async function buildBetaEstimates() {
  if (_betaRunning || !process.env.OANDA_KEY) return;
  _betaRunning = true;
  console.log('[BETA] Building beta estimates from OANDA H4 bars…');
  try {
    // Fetch bars — factor proxies must always be fetched
    const allSyms = [...new Set([...BETA_PAIRS, ...Object.values(BETA_FACTOR_PROXIES).map(p => p.sym)])];
    const barData = {};
    for (const sym of allSyms) {
      const closes = await fetchH4BarsShort(sym);
      if (closes) barData[sym] = closes;
    }

    // Build factor return series
    const factorRets = {};
    for (const [factor, { sym, sign }] of Object.entries(BETA_FACTOR_PROXIES)) {
      if (barData[sym]) factorRets[factor] = _betaLogReturns(barData[sym]).map(r => r * sign);
    }
    if (!Object.keys(factorRets).length) {
      console.log('[BETA] No factor proxy bars — aborting');
      return;
    }

    const results = {};
    const ts = Date.now();

    for (const sym of BETA_PAIRS) {
      if (!barData[sym]) continue;
      const pairRets = _betaLogReturns(barData[sym]);
      const symFactors = {};
      const rSqVals = [];

      for (const [factor, fr] of Object.entries(factorRets)) {
        const n = Math.min(pairRets.length, fr.length);
        if (n < BETA_MIN_WINDOW) continue;
        const pr = pairRets.slice(-n), frN = fr.slice(-n);

        const { beta: olsBeta, rSq } = _olsBeta(pr, frN);
        rSqVals.push(rSq);

        // Init Kalman state on first run
        _betaKalmans[sym] = _betaKalmans[sym] || {};
        if (!_betaKalmans[sym][factor]) {
          const nW = Math.min(BETA_WINDOW, n);
          const resids = pr.slice(-nW).map((y, i) => y - olsBeta * frN[frN.length - nW + i]);
          const mean = resids.reduce((s, v) => s + v, 0) / resids.length;
          const obsVar = resids.length > 2
            ? resids.reduce((s, v) => s + (v - mean) ** 2, 0) / resids.length
            : BETA_R_DEFAULT;
          _betaKalmans[sym][factor] = { x: olsBeta, p: 0.05, q: BETA_Q, r: Math.max(obsVar, 1e-6) };
        }
        const kf = _betaKalmans[sym][factor];
        // Incremental update on last 5 bars only (matches Python behaviour)
        const inc = Math.min(5, n);
        for (let i = pr.length - inc; i < pr.length; i++) _kalmanStep(kf, pr[i], frN[i]);

        const variance = kf.p;
        symFactors[factor] = {
          mean:        +kf.x.toFixed(4),
          variance:    +variance.toFixed(6),
          ols:         +olsBeta.toFixed(4),
          uncertainty: variance < 0.01 ? 'LOW' : variance < 0.05 ? 'MEDIUM' : 'HIGH',
        };
      }

      if (Object.keys(symFactors).length) {
        results[sym] = {
          ...symFactors,
          r_squared: rSqVals.length ? +(rSqVals.reduce((s, v) => s + v, 0) / rSqVals.length).toFixed(4) : 0,
          window:    BETA_WINDOW,
          timestamp: ts,
        };
      }
    }

    await kv.put('beta_estimates', JSON.stringify({ data: results, timestamp: ts }));
    console.log(`[BETA] Done — ${Object.keys(results).length} pairs · ${new Date(ts).toISOString()}`);
  } catch (e) {
    console.error('[BETA] Error:', e.message);
  } finally {
    _betaRunning = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function sendTelegram(token, chatId, text) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      signal:  AbortSignal.timeout(10_000),
    });
    return (await r.json()).ok === true;
  } catch { return false; }
}

function _gradeColor(grade) {
  return grade === 'A+' ? '#22c55e' : grade === 'A' ? '#4ade80' : grade === 'B' ? '#f59e0b' : grade === 'C' ? '#94a3b8' : '#ef4444';
}

function computeGrade(entry, hmmData, swing30m = null) {
  // Use browser-computed grade from KV payload when available
  if (entry.grade) {
    return { grade: entry.grade, verdict: entry.verdict ?? 'WATCH', reasons: entry.reasons ?? [], warnings: entry.warnings ?? [] };
  }
  // Server-side fallback when browser hasn't pushed grade yet
  const score      = entry.signalScore ?? 0;
  const rb         = entry.rangeBias;
  const total      = rb ? (rb.confirmCount + rb.conflictCount) : 0;
  const conviction = total > 0 ? (rb.confirmCount - rb.conflictCount) / total : 0;

  const reasons  = [];
  const warnings = [];
  let   hardStop = false;

  if (hmmData?.regime && hmmData.reliable !== false) {
    const isLong    = entry.direction === 'long';
    const withTrend = (isLong && hmmData.trendDir === 'BULL') || (!isLong && hmmData.trendDir === 'BEAR');
    if (hmmData.regime === 'RANGE') {
      reasons.push(`Range ${Math.round((hmmData.rangeProb ?? 0) * 100)}%`);
    } else if (hmmData.regime === 'TREND') {
      const pct = Math.round((hmmData.trendProb ?? 0) * 100);
      if (!withTrend) {
        warnings.push(`${hmmData.trendDir} opposing (${pct}%)`);
        if ((hmmData.trendProb ?? 0) > 0.82) hardStop = true;
      } else {
        reasons.push(`Trend ${hmmData.trendDir} ${pct}%`);
      }
    }
  }

  if (swing30m?.regime === 'TREND') {
    const isLong       = entry.direction === 'long';
    const swingAligned = (isLong && swing30m.dir === 'BULL') || (!isLong && swing30m.dir === 'BEAR');
    if (!swingAligned) warnings.push(`30m BOS ${swing30m.dir} opposing`);
    else if (reasons.length < 3) reasons.push(`30m BOS ${swing30m.dir}`);
  }

  if      (score >= 70) reasons.push(`Signal ${score}%`);
  else if (score <  38) warnings.push(`Weak signal ${score}%`);
  if (total > 0 && conviction >  0.30) reasons.push(`RB ${rb.confirmCount}✓ ${rb.conflictCount}✗`);
  if (total > 0 && conviction < -0.25) warnings.push(`RB conflict ${rb.confirmCount}✓ ${rb.conflictCount}✗`);

  let grade;
  if (hardStop || score < 30)                                          grade = 'SKIP';
  else if (score >= 72 && conviction >= 0.10 && warnings.length === 0) grade = 'A+';
  else if (score >= 60 && warnings.length <= 1)                        grade = 'A';
  else if (score >= 46)                                                 grade = 'B';
  else                                                                  grade = 'C';

  const verdict = grade === 'SKIP'                    ? 'SKIP'
                : (grade === 'A+' || grade === 'A')   ? 'TAKE'
                : grade === 'B'                       ? 'WATCH'
                :                                       'CAUTION';

  return { grade, verdict, reasons: reasons.slice(0, 3), warnings: warnings.slice(0, 2) };
}

function formatAlert(sym, entry, price, distPips) {
  const digits = PRICE_DIGITS[sym] ?? 5;
  const unit   = sym === 'NAS100_USD' ? 'pts' : 'p';
  const dir    = entry.direction === 'long' ? '↑ BUY' : '↓ SELL';
  const stars  = '★'.repeat(Math.min(entry.totalStars ?? 0, 5));
  const at     = distPips <= 0 ? 'AT LEVEL' : `${distPips}${unit} away`;

  const hmm   = state.hmmRegimes[sym];
  const swing = hmm?.intraday30m ?? null;
  const g     = computeGrade(entry, hmm, swing);

  // ── Post-grade overrides (applied at alert time regardless of who computed grade) ──

  // 1. R:R gate: cap grade when risk/reward is poor
  const rr = parseFloat(entry.rrRatio ?? 0) || 0;
  if (rr > 0 && g.grade !== 'SKIP') {
    if (rr < 1.0) {
      if (g.grade === 'A+' || g.grade === 'A') g.grade = 'B';
      g.warnings.push(`R:R 1:${rr} below breakeven`);
      g.verdict = 'WATCH';
    } else if (rr < 1.5 && g.grade === 'A+') {
      g.grade  = 'A';
      g.verdict = 'TAKE';
    }
  }

  // 2. Spread gate: warn when execution cost is elevated
  const liveSpreadPips  = state.prices[sym]?.spreadPips ?? null;
  const typicalSpread   = TYPICAL_SPREAD_PIPS[sym] ?? 1.0;
  const spreadRatio     = liveSpreadPips != null ? liveSpreadPips / typicalSpread : null;
  if (spreadRatio != null && spreadRatio > 3.0) {
    g.grade   = g.grade === 'A+' ? 'A' : g.grade === 'A' ? 'B' : g.grade;
    g.verdict = g.grade === 'A+' || g.grade === 'A' ? 'TAKE' : 'WATCH';
    g.warnings.push(`Spread ${liveSpreadPips.toFixed(1)}p (${spreadRatio.toFixed(1)}× typical) — wait`);
  }

  // 3. Event risk: downgrade if browser flagged a high-impact event on this entry
  const entryTags = (entry.tags ?? []).map(t => typeof t === 'string' ? t : (t.label ?? ''));
  const hasHighEvent = entryTags.some(t => t.includes('Event ⚠'));
  if (hasHighEvent && (g.grade === 'A+' || g.grade === 'A')) {
    g.grade   = 'B';
    g.verdict = 'WATCH';
    g.warnings.push('High-impact event risk');
  }

  // 4. HMM reliability gate: suppress confident regime label when states aren't well-separated
  if (hmm && hmm.reliable === false) {
    g.reasons = g.reasons.filter(r => !r.startsWith('Range') && !r.startsWith('Trend'));
    g.warnings.push('Regime unclear');
  }

  const vi = g.verdict === 'TAKE' ? '✅' : g.verdict === 'WATCH' ? '👁' : g.verdict === 'CAUTION' ? '⚠️' : '🚫';

  const parts = [
    `🎯 <b>${sym} ${dir}</b> ${stars}`,
    `<b>[${g.grade}] ${vi} ${g.verdict}</b>`,
  ];

  if (g.reasons.length)  parts.push(`✅ ${g.reasons.join(' · ')}`);
  if (g.warnings.length) parts.push(`⚠ ${g.warnings.join(' · ')}`);

  parts.push('');
  parts.push(`Level: <b>${entry.price.toFixed(digits)}</b> · ${at}`);
  parts.push(`Current: ${price.toFixed(digits)}`);

  if (entry.tags?.length) parts.push(`Tags: ${entry.tags.slice(0, 3).join(' · ')}`);

  // Yield-spread Z-score — supplementary only, not yet folded into the grade above.
  if (entry.zSpread) {
    const z = entry.zSpread.z;
    parts.push(`Z-conviction: ${z >= 0 ? '+' : ''}${z}σ ×${entry.zConvictionMult} <i>(not yet weighted into grade)</i>`);
  }

  const sltp = [
    entry.sl != null ? `SL ${entry.sl.toFixed(digits)}` : null,
    entry.tp != null ? `TP ${entry.tp.toFixed(digits)}${entry.tpNote ? ` (${entry.tpNote} · ATR)` : ' (ATR)'}` : null,
  ].filter(Boolean).join(' · ');
  if (sltp) parts.push(sltp);
  if (entry.rrRatio) parts.push(`R:R 1:${entry.rrRatio}`);

  // Context line (C): readable sentence — replaces the raw signal/HMM dump
  const regimeCtx = hmm
    ? (hmm.regime === 'RANGE' ? 'Ranging' : `Trending ${hmm.trendDir ?? ''}`.trim())
    : null;
  const swingCtx = swing
    ? (swing.regime === 'TREND' ? `BOS ${swing.dir ?? ''}`.trim() + ' structure' : 'CHoCH structure')
    : null;
  const ctxParts = [regimeCtx, swingCtx].filter(Boolean);
  if (ctxParts.length) parts.push(`Context: ${ctxParts.join(' · ')}`);

  // 1m HMM (B): only show when it conflicts with entry direction
  const hmm5m  = state.hmm5mRegimes[sym];
  const isLong = entry.direction === 'long';
  if (hmm5m && hmm5m.confidence >= 60 &&
      ((isLong && hmm5m.regime === 'BEAR') || (!isLong && hmm5m.regime === 'BULL'))) {
    parts.push(`⚠ 1m: <b>${hmm5m.regime} ${hmm5m.confidence}%</b> — momentum opposing`);
  }

  // VuManChu Cipher B assessment (M1 → M5 resampled)
  const vmMode = state.cfg?.vuManChu ?? 'info';
  let vmExplain = null;
  if (vmMode !== 'off') {
    try {
      const m1Bars = state.hmm5mBars?.[sym];
      if (m1Bars && m1Bars.length >= 160) {
        const parsedBars = m1Bars.map(b => ({
          open:   parseFloat(b.open  ?? b.mid?.o ?? b.o ?? b.close ?? b.mid?.c ?? b.c),
          high:   parseFloat(b.high  ?? b.mid?.h ?? b.h ?? b.close ?? b.mid?.c ?? b.c),
          low:    parseFloat(b.low   ?? b.mid?.l ?? b.l ?? b.close ?? b.mid?.c ?? b.c),
          close:  parseFloat(b.close ?? b.mid?.c ?? b.c),
          volume: parseFloat(b.volume ?? b.vol ?? 0),
        }));
        const m5Bars = resampleBars(parsedBars, 5);
        if (m5Bars.length >= 31) {
          const vm = assessEntry(m5Bars, entry.direction);

          if (vmMode === 'filter' && vm.signal === 'oppose') {
            if (g.grade === 'A+' || g.grade === 'A') {
              g.grade   = 'B';
              g.verdict = 'WATCH';
            }
            if (g.warnings.length < 2) g.warnings.push('VuManChu opposing');
          }

          const wtVal  = vm.wt?.value != null ? ` ${vm.wt.value >= 0 ? '+' : ''}${vm.wt.value.toFixed(1)}` : '';
          const wtSig  = vm.wt?.signal ? `WT ${vm.wt.signal}${wtVal}` : 'WT —';
          const mfPart = vm.mf?.signal ? ` · MF ${vm.mf.signal}` : '';
          const total  = (vm.components ?? 0) + (vm.opposing ?? 0);
          const comp   = total > 0 ? ` [${vm.components}/${total}]` : '';
          const vmIcon = vm.signal === 'agree' ? '✅' : vm.signal === 'oppose' ? '❌' : '〰️';
          parts.push(`${vmIcon} VM: ${wtSig}${mfPart}${comp}`);

          // Build VM plain-English explanation for decoder block
          const wtMeaning = vm.wt?.signal === 'BULLISH' ? 'wave cycling up'
                          : vm.wt?.signal === 'BEARISH' ? 'wave cycling down' : 'wave flat';
          const mfMeaning = vm.mf?.signal === 'BULLISH' ? 'money flowing in'
                          : vm.mf?.signal === 'BEARISH' ? 'money flowing out' : 'money flow flat';
          const confirmStr = total > 0 ? `${vm.components} of ${total} momentum signals confirm` : 'momentum signals checked';
          vmExplain = `〰️ VM = momentum check — ${wtMeaning}, ${mfMeaning} — ${confirmStr}`;
        }
      }
    } catch (_) { /* vumanchu data not yet available */ }
  }

  // Decision engine gate line — sourced from browser KV payload meta
  const dMeta = state.levels[sym]?.meta;
  if (dMeta?.decisionMode) {
    if (dMeta.decisionMode === 'NO_TRADE') {
      parts.push(`🚫 Decision: <b>NO TRADE</b> — ${dMeta.decisionReasons?.[0] ?? 'conditions not met'}`);
    } else {
      const permitted = isLong ? dMeta.decisionPermLong : dMeta.decisionPermShort;
      const gate      = permitted ? '✅ PERMITTED' : '❌ NOT PERMITTED';
      const modeLabel = dMeta.decisionMode.replace(/_/g, ' ');
      parts.push(`${gate} · ${modeLabel} · ${dMeta.decisionParticipation} · Risk ${(dMeta.decisionRiskMult ?? 1).toFixed(2)}×`);
    }
  }

  parts.push('<i>🚂 MacroFX Railway</i>');

  // ── Plain-English decoder block ────────────────────────────────────────────
  const decoderLines = [];
  const totalStars = Math.min(entry.totalStars ?? 0, 5);
  const tagLabels  = (entry.tags ?? []).map(t => typeof t === 'string' ? t : (t.label ?? ''));

  const _starDesc = {
    'Tight Fib':     'precise fib zone',
    'Asia Fib':      'Asia session level',
    'Monday Fib':    'Monday session level',
    'Cross-Session': 'cross-session match',
    'Dense Zone':    'dense confluence cluster',
  };
  const contribs = tagLabels.map(t => _starDesc[t]).filter(Boolean).slice(0, 3);
  const strength = totalStars >= 4 ? 'very strong' : totalStars >= 3 ? 'strong' : totalStars >= 2 ? 'solid' : 'basic';
  decoderLines.push(`${'★'.repeat(totalStars)} = ${strength} level${contribs.length ? ' — ' + contribs.join(' + ') : ''}`);

  const _gradeDesc = {
    'A+': 'top-tier — every signal aligned, high conviction → take it',
    'A':  'good setup — regime, bias & momentum agree → take it',
    'B':  'marginal — conditions mixed, watch but wait',
    'C':  'weak signal — avoid or cut size significantly',
    'SKIP': 'hard stop — do not trade',
  };
  if (_gradeDesc[g.grade]) decoderLines.push(`[${g.grade}] = ${_gradeDesc[g.grade]}`);

  if (tagLabels.some(t => t.toLowerCase().includes('cross'))) {
    decoderLines.push(`📍 Cross-session = level held in Asia AND London/NY — institutions watching this price`);
  }

  if (vmExplain) decoderLines.push(vmExplain);

  // Decision engine plain-English decoder
  if (dMeta?.decisionMode && dMeta.decisionMode !== 'NO_TRADE') {
    const permitted  = isLong ? dMeta.decisionPermLong : dMeta.decisionPermShort;
    const gateWord   = permitted ? '✅ PERMITTED' : '❌ NOT PERMITTED';
    const gateDesc   = permitted ? 'direction cleared — take it' : 'direction blocked — skip or wait for regime shift';

    const _modeDesc = {
      TREND_CONTINUATION: 'join the trend, buy pullbacks / sell rallies',
      MEAN_REVERSION:     'fade range extremes — buy support, sell resistance',
      BREAKOUT:           'wait for confirmed breakout — no pre-emption',
      POSITION_MANAGEMENT:'trend extended — manage existing, no new entries',
      EXHAUSTION:         'range overextended — exit priority only',
    };
    const modeLabel = dMeta.decisionMode.replace(/_/g, ' ');
    const modeDesc  = _modeDesc[dMeta.decisionMode] ?? modeLabel.toLowerCase();

    const _partDesc = {
      FULL:    'full size — high conviction',
      REDUCED: '¾ size — confidence below peak',
      MINIMUM: 'minimum size — unfavourable conditions',
    };
    const partDesc = _partDesc[dMeta.decisionParticipation] ?? dMeta.decisionParticipation;
    const riskPct  = Math.round((dMeta.decisionRiskMult ?? 1) * 100);

    decoderLines.push(`${gateWord} = ${gateDesc}`);
    decoderLines.push(`${modeLabel} = ${modeDesc}`);
    decoderLines.push(`${dMeta.decisionParticipation} = ${partDesc} · Risk ${riskPct}% of normal`);
    if (dMeta.decisionReasons?.length) {
      decoderLines.push(`ℹ️ ${dMeta.decisionReasons[0]}`);
    }
  }

  if (decoderLines.length) {
    parts.push('━━━━━━━━━━━━━━━━━━');
    decoderLines.forEach(l => parts.push(l));
  }

  return parts.filter(p => p !== undefined).join('\n');
}

// ── Daily watchlist — star-based level selection ──────────────────────────────
// Picks the top-starred levels per pair (≥4★ = strong, ≥5★ = prime).
// No separate scoring layer — the star count IS the quality signal.

// ── Main monitoring tick ──────────────────────────────────────────────────────

async function monitorTick() {
  // Watchdog: if a previous tick hung for >60 s, force-release the lock
  if (state.running && Date.now() - state.runningAt > 60_000) {
    console.warn('[MONITOR] Watchdog: releasing stuck running lock (hung >60s)');
    state.running = false;
  }
  if (state.running || !process.env.OANDA_KEY) return;
  state.running  = true;
  state.runningAt = Date.now();
  state.lastRun  = new Date().toISOString();

  try {
    const now = Date.now();

    // Reload Telegram + alert config from KV every 60 s
    if (now - state.cfgLoadedAt > 60_000) await reloadConfig();

    // Daily levels refresh — once at 06:05 London (Asia close + 5 min buffer).
    // Triggers a full OANDA recompute so the fresh Asia session is captured immediately.
    // The 30-min runLevelsRefresh() loop also handles this but may be up to 30 min late.
    {
      const todayLdn = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
      if (state.levelsLoadedDate !== todayLdn) {
        const ldn = new Date().toLocaleString('en-US', { timeZone: 'Europe/London', hour12: false, hour: '2-digit', minute: '2-digit' });
        const [lh, lm] = ldn.split(':').map(Number);
        if (lh === 6 && lm >= 5) {
          state.levelsLoadedDate = todayLdn;
          console.log(`[LEVELS] Daily refresh triggered at ${lh}:${String(lm).padStart(2,'0')} London — ${todayLdn}`);
          runLevelsRefresh().catch(e => console.error('[LEVELS] Daily refresh error:', e.message));
        }
      }
    }

    if (!state.cfg?.enabled || state.cfg?.serverEnabled === false || !state.tg?.token || !state.tg?.chatId) return;

    // Do-not-disturb: skip if today (UTC) is not in the active days list
    {
      const activeDays = state.cfg.activeDays;
      if (Array.isArray(activeDays) && activeDays.length > 0 && !activeDays.includes(new Date().getUTCDay())) return;
    }

    const pairs       = state.cfg.pairs?.length ? state.cfg.pairs : DEFAULT_PAIRS;

    // Fetch all prices in one OANDA batch call — eliminates 30s cache lag
    await fetchAllPrices(pairs);

    const doSummary   = now - (state.lastSummaryAt ?? 0) > 60_000; // throttle to once/min
    let   cdDirty     = false;
    const summaryLines = [];

    for (const sym of pairs) {
      const bucket = state.levels[sym];
      if (!bucket?.data?.length) continue;

      const price = fetchPrice(sym);
      if (price == null) {
        if (doSummary) summaryLines.push(`${sym}: no price (market closed?)`);
        continue;
      }

      const pipSz    = PIP_SIZE[sym]     ?? 0.0001;
      const digits   = PRICE_DIGITS[sym] ?? 5;
      const proxPips = state.cfg.proxPips?.[sym] ?? state.cfg.proxPips?.default ?? 5;
      const proxDist = proxPips * pipSz;

      let skipStars = 0, skipDir = 0, skipProx = 0, skipCooldown = 0, skipScore = 0, skipAligned = 0, skipConflict = 0;

      const _GRADE_ORDER = {'A+': 5, 'A': 4, 'B': 3, 'C': 2, 'D': 1, 'SKIP': 0};
      const minGrade      = state.cfg.minGrade ?? 'B';

      // Sort entries by signalScore desc so highest quality alerts fire first
      const sortedEntries = [...bucket.data].sort((a, b) => (b.signalScore ?? -1) - (a.signalScore ?? -1));

      // Pass 1: collect all candidates that pass per-entry filters and per-level cooldown
      const tickCandidates = [];

      for (const entry of sortedEntries) {
        // Polarity flip — override direction when level was broken and price has returned
        // with regime confirming the new direction. Uses cached M1 bars from HMM refresh.
        const _polarFlip = state.hmm5mBars?.[sym] && entry.direction
          ? detectPolarityFlip(entry, state.hmm5mBars[sym], state.hmm5mRegimes[sym], state.cfg?.flipCandles ?? 3)
          : null;
        const eff = _polarFlip
          ? { ...entry, direction: _polarFlip.newDirection, tags: [_polarFlip.tag, ...(entry.tags ?? [])], isFlipped: true }
          : entry;

        if (!eff.direction)                                                                      { skipDir++;     continue; }
        if ((_GRADE_ORDER[eff.grade] ?? 0) < (_GRADE_ORDER[minGrade] ?? 3))                    { skipScore++;   continue; }
        // onlyAligned: only filter when signalAligned is explicitly false (browser-evaluated).
        // Server-side entries omit the field entirely — treat as "unknown", let through.
        if (state.cfg.onlyAligned && eff.signalAligned === false)                               { skipAligned++; continue; }
        if (state.cfg.minSignalScore && (eff.signalScore ?? 0) < state.cfg.minSignalScore)      { skipScore++;   continue; }
        // Skip counter-trend fades when HMM shows strong trend opposing direction
        const _hmm = state.hmmRegimes[sym];
        if (_hmm?.regime === 'TREND' && _hmm.trendProb > 0.75) {
          const isLong    = eff.direction === 'long';
          const withTrend = (isLong && _hmm.trendDir === 'BULL') || (!isLong && _hmm.trendDir === 'BEAR');
          if (!withTrend) { skipScore++; continue; }
        }

        const dist = Math.abs(eff.price - price);
        if (dist > proxDist)                                                                     { skipProx++;    continue; }

        const ck       = `${sym.replace('/', '')}_${eff.price.toFixed(digits)}_${eff.direction}`;
        const lastSent = state.cooldowns[ck] ?? 0;
        if (now - lastSent < (state.cfg.cooldownMin ?? 60) * 60_000)                            { skipCooldown++; continue; }

        tickCandidates.push({ eff, ck, dist, distPips: Math.round(dist / pipSz), _polarFlip });
      }

      // Pass 2: pick one winner per pair per tick
      if (tickCandidates.length) {
        // Conflict resolution: if both buy and sell levels qualify simultaneously,
        // keep only the one closest to the current price — prevents contradictory alerts.
        const longCands  = tickCandidates.filter(c => c.eff.direction === 'long');
        const shortCands = tickCandidates.filter(c => c.eff.direction === 'short');

        let winner;
        if (longCands.length && shortCands.length) {
          const allSorted = [...tickCandidates].sort((a, b) => a.dist - b.dist);
          winner       = allSorted[0];
          skipConflict = allSorted.length - 1;
          console.log(`[MONITOR] ${sym} conflict: ${longCands.length}L/${shortCands.length}S — kept closest ${winner.eff.direction} @ ${winner.eff.price.toFixed(digits)}`);
        } else {
          winner       = tickCandidates[0]; // highest signalScore (sorted above)
          skipConflict = tickCandidates.length - 1;
        }

        // Per-pair cooldown: enforce a minimum gap between any two alerts on the same pair.
        // Stored in cooldowns dict under a _pair_ prefix so it survives config reloads.
        const pairCooldownMin = state.cfg.pairCooldownMin ?? 240;
        const pairCoolKey     = `_pair_${sym.replace('/', '')}`;
        const pairLastSent    = state.pairLastAlert[sym] ?? (state.cooldowns[pairCoolKey] ?? 0);
        const pairElapsed     = now - pairLastSent;

        if (pairElapsed < pairCooldownMin * 60_000) {
          const remaining = ((pairCooldownMin * 60_000 - pairElapsed) / 60_000).toFixed(0);
          console.log(`[MONITOR] ${sym} pair-cooldown: ${remaining}m remaining`);
          skipCooldown += tickCandidates.length;
        } else {
          state.cooldowns[winner.ck]  = now;
          state.cooldowns[pairCoolKey] = now;
          state.pairLastAlert[sym]    = now;
          cdDirty = true;

          const msg  = formatAlert(sym, winner.eff, price, winner.distPips);
          const sent = await sendTelegram(state.tg.token, state.tg.chatId, msg);

          if (sent) { state.lastAlert = new Date().toISOString(); state.alertCount++; }

          console.log(`[MONITOR] ${sym} ${winner.eff.direction}${winner._polarFlip ? ' [FLIPPED]' : ''} @ ${winner.eff.price.toFixed(digits)} (${winner.distPips}p) — Telegram ${sent ? 'OK' : 'FAILED'}`);
        }
      }

      state.skipCounts[sym] = { stars: skipStars, score: skipScore, dir: skipDir, aligned: skipAligned, prox: skipProx, cooldown: skipCooldown, conflict: skipConflict };

      if (doSummary && bucket.data.length > 0) {
        const maxScore = Math.max(...bucket.data.map(e => e.signalScore ?? 0));
        summaryLines.push(`${sym}[≥${minGrade}]: ${bucket.data.length} entries score=${maxScore}% skip=${skipScore}grade/${skipDir}dir/${skipAligned}align/${skipProx}prox/${skipCooldown}cd/${skipConflict}conflict`);
      }
    }

    if (doSummary && summaryLines.length) {
      console.log('[MONITOR]', summaryLines.join(' | '));
      state.lastSummaryAt = now;
    } else if (doSummary) {
      const cfgSummary = state.cfg
        ? `enabled=${state.cfg.enabled} server=${state.cfg.serverEnabled !== false} minGrade=${state.cfg.minGrade ?? 'B'}`
        : 'cfg=null';
      const tgOk = !!(state.tg?.token && state.tg?.chatId);
      console.log(`[MONITOR] No monitored pairs with levels. ${cfgSummary} tg=${tgOk} levels=${Object.values(state.levels).filter(b => b?.data?.length).length}/${DEFAULT_PAIRS.length}`);
      state.lastSummaryAt = now;
    }

    if (cdDirty) await kv.put('ai_cron_cooldowns', JSON.stringify(state.cooldowns));

  } catch (e) {
    console.error('[MONITOR] Error:', e.message);
    state.errors.push({ at: new Date().toISOString(), msg: e.message });
    if (state.errors.length > 20) state.errors.shift();
  } finally {
    state.running = false;
  }
}

// ── Analysis prompt builder ───────────────────────────────────────────────────
// Mirrors the prompt in _worker.js so both Cloudflare and Railway produce identical briefs.

function buildAnalysisPrompt(pair, s) {
  return `You are a professional FX/futures desk analyst. Analyse the following real-time dashboard snapshot for ${pair} and produce a structured trading intelligence brief. Be direct, specific, and actionable. Think like a prop trader who needs to make a decision in the next 30 minutes.

=== DASHBOARD SNAPSHOT: ${pair} ===

MACRO SCORE & TIER BREAKDOWN
Score: ${s.macroScore ?? 'N/A'} / 16  (${s.macroBias ?? 'N/A'})
Coherence: ${s.agreeCount ?? '?'}/7 tiers agree   Coherence bonus: ${s.coherenceBonus ?? 0}
Tier breakdown:
${s.tiers ? s.tiers.map(t => `  ${t.name}: ${t.score >= 0 ? '+' : ''}${t.score}  -  ${t.reading} (${t.val})`).join('\n') : '  Not available'}

VOLATILITY REGIME
Vol regime: ${s.volRegime ?? 'N/A'}  |  ATR percentile: ${s.atrPct ?? 'N/A'}th  |  ATR: ${s.atr ?? 'N/A'}
Recommended position size: ${s.positionSize ?? 'N/A'}%

PRICE & RANGE DATA
Current price: ${s.price ?? 'N/A'}
Asia range: ${s.asiaHigh ?? 'N/A'} - ${s.asiaLow ?? 'N/A'}  (${s.asiaRangePips ?? 'N/A'} pips)  *  ${s.priceVsAsia ?? 'N/A'}
Asia yesterday: ${s.asiaYestHigh ?? 'N/A'} - ${s.asiaYestLow ?? 'N/A'}
Monday range: ${s.mondayHigh ?? 'N/A'} - ${s.mondayLow ?? 'N/A'}  (${s.mondayRangePips ?? 'N/A'} pips)  *  ${s.priceVsMonday ?? 'N/A'}

DAILY PIVOTS
R3: ${s.r3 ?? 'N/A'}  |  R2: ${s.r2 ?? 'N/A'}  |  R1: ${s.r1 ?? 'N/A'}  |  PP: ${s.pp ?? 'N/A'}
S1: ${s.s1 ?? 'N/A'}  |  S2: ${s.s2 ?? 'N/A'}  |  S3: ${s.s3 ?? 'N/A'}

FIB CONFLUENCES DETECTED (${s.confluenceCount ?? 0} total shown)
${s.confluences && s.confluences.length > 0
  ? s.confluences.map(c => `  ${c.stars}* @ ${c.price}  [${c.sources}]  ${c.tight ? 'TIGHT' : 'NORMAL'}${(c.density || 1) >= 2 ? ` CLUSTER×${c.density}` : ''}  dist: ${c.distPips}p  dir: ${c.direction ?? 'AT LEVEL'}  ${c.aligned ? 'v bias-aligned' : ''}  ${c.pivotMatch ? ` near ${c.pivotMatch}` : ''}`).join('\n')
  : '  None detected in current display mode'}

CME OI / OPTIONS POSITIONING
${s.oi ? `Max Pain: ${s.oi.maxPain}  |  Call Wall: ${s.oi.callWall} (${s.oi.callWallOI} OI)  |  Put Wall: ${s.oi.putWall} (${s.oi.putWallOI} OI)
P/C Ratio: ${s.oi.pcRatio}  ->  ${s.oi.pcBias}
Total Call OI: ${s.oi.totalCallOI}  |  Total Put OI: ${s.oi.totalPutOI}
OI Flow  -  calls: ${s.oi.totalCallChg ?? 'N/A'}  puts: ${s.oi.totalPutChg ?? 'N/A'}
Aggregate GEX: ${s.oi.gex ?? 'N/A'}  |  DEX: ${s.oi.dex ?? 'N/A'}  ->  ${s.oi.gexRead ?? 'N/A'}
Gamma flip level: ${s.oi.gammaFlip ?? 'N/A'}
Top strikes (strike | callOI/putOI | type):
${s.oi.topLevels ? s.oi.topLevels.slice(0, 6).map(l => `  ${l.strike}  C:${l.callOI} / P:${l.putOI}  ${l.strike > s.price ? 'RESISTANCE' : 'SUPPORT'}`).join('\n') : '  N/A'}`
  : '  No OI data loaded for this pair  -  paste via OI button'}

YIELD CURVE & MACRO SNAPSHOT
US 2s10s spread: ${s.us2s10s ?? 'N/A'} bp  ->  ${s.curveShape ?? 'N/A'}
VIX: ${s.vix ?? 'N/A'}  (prev: ${s.vixPrev ?? 'N/A'})  ${s.vix && s.vixPrev ? (s.vix > s.vixPrev ? '^ rising fear' : 'v falling fear') : ''}
HY credit spread: ${s.hy ?? 'N/A'} bp  (prev: ${s.hyPrev ?? 'N/A'} bp)
DXY: ${s.dxy ?? 'N/A'}  (prev: ${s.dxyPrev ?? 'N/A'})
AUD/JPY carry: ${s.audjpy ?? 'N/A'}  (prev: ${s.audjpyPrev ?? 'N/A'})
NFCI: ${s.nfci ?? 'N/A'}
10Y TIPS real yield: ${s.tips ?? 'N/A'}%  |  Breakeven inflation: ${s.bei ?? 'N/A'}%
Cross-asset risk sentiment: ${s.riskSentiment ?? 'N/A'}

Foreign curves: ${s.foreignCurves ?? 'N/A'}

EXECUTION QUALITY (OANDA live spread)
Spread right now: ${s.spreadPips ?? 'N/A'} pips  |  Typical: ${s.typicalSpreadPips ?? 'N/A'} pips  |  Classification: ${s.spreadClassification ?? 'N/A'}
${s.spreadClassification === 'EXTREME' ? 'WARNING: spread is extreme - do not enter, market is illiquid or pre-event' : s.spreadClassification === 'WIDE' ? 'NOTE: spread is elevated - entry cost is high, wait for normalisation or widen stop to account for it' : ''}

RETAIL CROWD POSITIONING (Myfxbook community)
Retail long: ${s.retailLongPct ?? 'N/A'}%  |  Short: ${s.retailShortPct ?? 'N/A'}%  |  Crowding: ${s.retailCrowding ?? 'N/A'}
Avg price of retail longs: ${s.avgLongPrice ?? 'N/A'}  |  Avg price of retail shorts: ${s.avgShortPrice ?? 'N/A'}
Contrarian signal vs macro bias: ${s.retailContrarian ? 'YES - retail crowd opposes macro direction (supportive for trade)' : s.retailSentiment === 'BALANCED' ? 'Crowd is balanced - neutral' : 'NO - retail crowd agrees with macro direction (crowding risk)'}

GARCH VOLATILITY FORECAST
${s.garch ? `GARCH(1,1) daily range forecast: ${s.garch.forecast}  |  68% CI: ${s.garch.ci68}  |  95% CI: ${s.garch.ci95}
Vol clustering: ${s.garch.cluster}  -  ${s.garch.clusterMsg}
Annualised sigma: ${s.garch.sigmaAnn}  |  Used today: ${s.garch.usedToday}  |  ${s.garch.remaining}` : '  GARCH not available (insufficient bar history)'}

REGIME TRANSITION RISK
${s.regimeTransition ? `Risk level: ${s.regimeTransition.risk} (score ${s.regimeTransition.score}/100)
${s.regimeTransition.consecutiveDays} consecutive days in ${s.regimeTransition.regime} vol${s.regimeTransition.compressing ? '  -  ATR compressing (pre-shock risk building)' : s.regimeTransition.expanding ? '  -  ATR expanding' : ''}
${s.regimeTransition.summary}
${s.regimeTransition.detail}` : '  Not available'}

ARMA(1,1) SPREAD FORECAST (10Y rate differential, 5-day)
${s.armaForecast ? `Direction: ${s.armaForecast.direction}  |  Confidence: ${s.armaForecast.confidence}  |  Model skill: ${s.armaForecast.skill}
1-day spread change: ${s.armaForecast.f1d ?? 'N/A'}  |  5-day spread change: ${s.armaForecast.f5d ?? 'N/A'}
Pair implication: ${s.armaForecast.pairBias}
AR(?): ${s.armaForecast.phi}  MA(?): ${s.armaForecast.theta}` : '  ARMA not available (compass data not loaded)'}

SPREAD SIGNAL ENGINE
${s.spreadSignal ? `Bias: ${s.spreadSignal.bias}  |  Type: ${s.spreadSignal.type}  |  Score: ${s.spreadSignal.score}
Fair value gap: ${s.spreadSignal.fvPips ?? 'N/A'} pips ${s.spreadSignal.fvBull ? '(undervalued - buy bias)' : '(overvalued - sell bias)'}
${s.spreadSignal.lagDetected ? '! LAG DETECTED  -  spread moved ahead of price, catch-up move likely' : ''}` : '  Signal engine not available'}

COT POSITIONING (CFTC Traders in Financial Futures — Leveraged Funds / Managed Money)
${s.cot ? `Report date: ${s.cot.reportDate ?? 'N/A'}  |  Open Interest: ${s.cot.openInterest ?? 'N/A'}
Leveraged funds net: ${s.cot.levNet ?? 'N/A'} (${s.cot.levNetChg != null ? (s.cot.levNetChg >= 0 ? '+' : '') + s.cot.levNetChg : 'N/A'} wk)  |  Net % of OI: ${s.cot.levPct != null ? s.cot.levPct.toFixed(1) + '%' : 'N/A'}
Spec traders: ${s.cot.numLevLong ?? 'N/A'} long · ${s.cot.numLevShort ?? 'N/A'} short  |  Avg size: ${s.cot.avgContracts ?? 'N/A'} contracts
Asset Mgr net: ${s.cot.amNet ?? 'N/A'} (${s.cot.amNetChg != null ? (s.cot.amNetChg >= 0 ? '+' : '') + s.cot.amNetChg : 'N/A'} wk)  |  Dealer net: ${s.cot.dealerNet ?? 'N/A'}
Gross L/S ratio: ${s.cot.grossRatio ?? 'N/A'}  |  Crowding: ${s.cot.crowdingPct != null ? s.cot.crowdingPct.toFixed(1) + '% of OI' : 'N/A'}${s.cot.crowdingPct >= 20 ? ' — EXTREME (unwind risk elevated)' : s.cot.crowdingPct >= 10 ? ' — ELEVATED' : ''}` : '  COT data not available (set CFTC URL via COT toolbar button)'}

HIGH CONFLUENCE ENTRIES (from multi-layer scanner)
${s.topEntries && s.topEntries.length > 0
  ? s.topEntries.map(e => `  ${e.stars}* ${e.direction.toUpperCase()} @ ${e.price}  Tags: ${e.tags}  SL: ${e.sl} (${e.slPips}p)  TP: ${e.tp} (${e.tpNote}${e.tpCapped ? ' - vol capped' : ''}, ${e.tpPips}p)  R:R 1:${e.rr}  Size: ${e.size}%`).join('\n')
  : '  No high-confluence entries detected'}

SESSION INTELLIGENCE
Current session: ${s.session?.name ?? 'N/A'}  |  London time: ${s.session?.londonTime ?? 'N/A'}  |  Confidence multiplier: ${s.session?.confidence ?? 'N/A'}x
Context: ${s.session?.desc ?? 'N/A'}

VOLATILITY IMPULSE (5-bar momentum)
${s.volImpulse ? `Bias: ${s.volImpulse.bias.toUpperCase()}  |  Last 5 bars avg TR vs prior 5: ${s.volImpulse.pct >= 0 ? '+' : ''}${s.volImpulse.pct.toFixed(1)}%
${s.volImpulse.bias === 'expanding' ? '→ Vol accelerating — widen stops, beware stop-hunts' : s.volImpulse.bias === 'contracting' ? '→ Vol contracting — tighter stops possible, range trades favoured' : '→ Vol stable — no regime shift signal'}` : '  Not available (< 10 daily bars)'}

USD STRENGTH COMPOSITE (cross-pair normalised)
${s.usdStrength
  ? `${s.usdStrength.label}  |  Score: ${s.usdStrength.score}  |  Pairs: ${s.usdStrength.pairsUsed}/4
Per-pair z-scores: ${s.usdStrength.perPair || 'N/A'}
${s.usdStrength.fredConflict ? '⚠ FRED DXY disagrees with price-based composite — treat composite as primary signal' : 'FRED DXY consistent with composite'}
${s.crossConflict ? `CROSS-PAIR CONFLICT: ${s.crossConflict.type.toUpperCase()} (${s.crossConflict.severity}) — ${s.crossConflict.message}  |  Size adj: ×${s.crossConflict.sizeMult}` : 'No cross-pair conflict with current signal'}`
  : '  Insufficient pair data for composite (need 2+ USD pairs loaded)'}

DOLLAR REGIME (DXY)
${s.dollarRegime ? `${s.dollarRegime.label}  |  DXY: ${s.dollarRegime.dxy ?? 'N/A'}  |  Change: ${s.dollarRegime.change != null ? (s.dollarRegime.change >= 0 ? '+' : '') + s.dollarRegime.change + '%' : 'N/A'}  |  Strength: ${s.dollarRegime.strength}` : '  DXY data not available'}

ECONOMIC EVENT RISK
${s.eventRisk && !s.eventRisk.unavailable
  ? `Risk level: ${s.eventRisk.level.toUpperCase()}  |  Size multiplier: ${s.eventRisk.sizeMult}x
${s.eventRisk.inNext4h && s.eventRisk.inNext4h.length > 0
    ? 'Events next 4h: ' + s.eventRisk.inNext4h.map(e => `${e.country} ${e.impact?.toUpperCase() || '?'} "${e.event || '—'}" ${e.time ? new Date(e.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : ''}`).join(' | ')
    : 'No events in next 4 hours'}
${Object.keys(s.eventRisk.currencyRisk || {}).length > 0
    ? 'Currency risk: ' + Object.entries(s.eventRisk.currencyRisk).map(([c, r]) => `${c}: ${r.high}H/${r.medium}M`).join(', ')
    : ''}`
  : '  Economic calendar unavailable (FINNHUB_KEY not configured)'}

MACRO SURPRISE INDEX (30-day actual vs forecast)
${s.surpriseIndex && Object.keys(s.surpriseIndex).length > 0
  ? Object.entries(s.surpriseIndex).filter(([, v]) => typeof v === 'number').sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([c, v]) => `${c}: ${v >= 0 ? '+' : ''}${v.toFixed(2)}`).join('  |  ') +
    (s.pairSurprise != null ? `\nPair net surprise: ${s.pairSurprise >= 0 ? '+' : ''}${s.pairSurprise.toFixed(2)} (positive = bullish base ccy)` : '')
  : '  Surprise index unavailable (Finnhub not configured or no data with estimates)'}

=== END SNAPSHOT ===

You are a professional FX/futures prop desk analyst. Your job is to give a SPECIFIC, CALIBRATED trading brief - not generic observations.

Rules for your response:
1. Every level you mention must be a specific price, not a description. Say "1.0847" not "near resistance".
2. Every vol / spread observation must reference the actual numbers. Say "GARCH forecasts 42 pips today, 28 used, 14 remaining" not "volatility is moderate".
3. Retail crowd data is contrarian. If 70% of retail are long and macro says short, that is a TAILWIND (squeeze fuel), say so explicitly.
4. Spread classification gates entry quality. If spread is WIDE or EXTREME, say "do not enter now, wait for spread < X pips" with the actual X.
5. avgLongPrice and avgShortPrice are real liquidity clusters. If price is approaching avgShortPrice from below, that is a resistance cluster with real stops above it. Say so.
6. The headline must be one sentence a trader can act on. Not "mixed signals suggest caution." Something like "Fade the 1.0847 Fib/retail-cluster confluence short, target 1.0812, stop 1.0858, wait for spread to normalise below 0.6 pips."
7. goodToDoNow must be specific actions, not attitudes. "Wait for price to reach 1.0847 then look for 5m bearish engulf" not "be patient".
8. avoidNow must also be specific. "Do not chase the move if price is already below 1.0830" not "avoid chasing".
9. riskWarnings must reference actual values from the snapshot. "VIX at 24 (prev 19) - rising fear, USD bid likely to persist" not "volatility risk".
10. If retailCrowding is EXTREME and retailContrarian is true, call out the squeeze setup explicitly in the headline or tradingFramework.

Respond with a single valid JSON object. No markdown. No text outside the JSON. All string values 1-2 sentences max. Max 3 items per arrays.
convictionScore MUST be an integer from 0 to 10 only (0=no conviction, 5=moderate, 10=maximum). Do not use any other scale.
tldr: plain text ~100 words, copy-paste ready brief. Use this exact format (newlines with \\n):
"[PAIR] [BIAS] [SCORE]/10 | [REGIME]\\n[1-2 sentence market read]\\nWatch: [up to 3 key levels with price and type]\\nDo: [specific action]. Avoid: [what to avoid]. Risk: [main risk or event]"

{"overallBias":"LONG|SHORT|NEUTRAL","conviction":"HIGH|MEDIUM|LOW","convictionScore":5,"headline":"","regime":{"label":"TRENDING|RANGING|BREAKOUT RISK|MEAN-REVERSION|CHOPPY","detail":""},"macroRead":"","yieldCurveRead":"","oiRead":"","garchRead":"","armaRead":"","spreadSignalRead":"","cotRead":"","sessionRead":"","dollarRegimeRead":"","eventRiskRead":"","surpriseRead":"","keyLevels":[{"price":"","type":"CALL WALL|PUT WALL|MAX PAIN|GAMMA FLIP|FIB CONFLUENCE|PIVOT|RANGE HIGH|RANGE LOW","significance":""}],"tradingFramework":"","goodToDoNow":["",""],"avoidNow":["",""],"breakoutTrigger":"","reversionTrigger":"","cleanBreakPotential":"LOW|MEDIUM|HIGH","cleanBreakRationale":"","sentimentPositioning":"","reflexivity":"","riskWarnings":["",""],"tldr":""}`;
}

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '25mb' }));

// Real-time monitoring + level-refresh status
app.get('/api/monitor/status', (_req, res) => {
  res.json({
    intervalMs:          MONITOR_MS,
    refreshLevelsMs:     REFRESH_LEVELS_MS,
    lastRun:             state.lastRun,
    lastAlert:           state.lastAlert,
    alertCount:          state.alertCount,
    enabled:             state.cfg?.enabled ?? false,
    running:             state.running,
    runningAgeS:         state.running ? Math.round((Date.now() - state.runningAt) / 1000) : null,
    telegramOK:          !!(state.tg?.token && state.tg?.chatId),
    levelsRefreshAt:       state.levelsRefreshAt ? new Date(state.levelsRefreshAt).toISOString() : null,
    levelsRefreshRunning:  state.levelsRefreshRunning,
    levelsRefreshAgeS:     state.levelsRefreshRunning ? Math.round((Date.now() - state.levelsRefreshStartedAt) / 1_000) : null,
    levelCounts:         Object.fromEntries(DEFAULT_PAIRS.map(p => [p, state.levels[p]?.data?.length ?? 0])),
    lastPrices:          Object.fromEntries(
      Object.entries(state.prices).map(([p, v]) => [p, {
        price: v.price,
        ageS:  Math.round((Date.now() - v.at) / 1_000),
      }])
    ),
    recentErrors:        state.errors.slice(-5),
    skipCounts:          state.skipCounts,
  });
});

// HMM regime data for all pairs
app.get('/api/hmm/regimes', (_req, res) => {
  res.json(state.hmmRegimes);
});

// All loaded levels — debug view of what the bot has in memory
app.get('/api/levels', (_req, res) => {
  const out = {};
  for (const [sym, bucket] of Object.entries(state.levels)) {
    if (!bucket?.data?.length) continue;
    out[sym] = bucket.data.map(e => ({
      price:       e.price,
      direction:   e.direction ?? null,
      stars:       e.totalStars ?? 0,
      signal:      e.signalScore ?? null,
      tags:        (e.tags ?? []).slice(0, 4).join(', '),
    })).sort((a, b) => b.stars - a.stars || (b.signal ?? 0) - (a.signal ?? 0));
  }
  res.json({ loadedAt: state.levelsLoadedAt ? new Date(state.levelsLoadedAt).toISOString() : null, pairs: out });
});

// Manual levels reload — pull latest KV data into memory immediately
app.post('/api/telegram/test-server', async (_req, res) => {
  if (!state.tg?.token || !state.tg?.chatId) {
    return res.json({ ok: false, error: 'Telegram not configured on server' });
  }
  if (state.cfg?.serverEnabled === false) {
    return res.json({ ok: false, error: 'Server alerts are disabled' });
  }
  const sent = await sendTelegram(
    state.tg.token, state.tg.chatId,
    '✅ <b>MacroFX Server (Railway)</b> — server-side alerts connected!',
  );
  res.json({ ok: sent, error: sent ? null : 'Telegram API returned error' });
});

// Full recompute from OANDA — fires runLevelsRefresh() async, returns immediately.
// This is what the dashboard "Reload Levels" button calls.
app.post('/api/levels/reload', (req, res) => {
  if (state.levelsRefreshRunning) {
    const ageS = Math.round((Date.now() - state.levelsRefreshStartedAt) / 1_000);
    return res.json({ ok: false, running: true, message: `Refresh already in progress (${ageS}s)` });
  }
  console.log('[LEVELS] Manual full refresh triggered via /api/levels/reload');
  runLevelsRefresh().catch(e => console.error('[LEVELS] Manual refresh error:', e.message));
  res.json({ ok: true, message: 'Level refresh started — takes ~30s for all pairs', running: true });
});

// Lightweight reload — re-reads KV into memory without hitting OANDA.
// Useful after the browser has pushed new entries to KV.
app.post('/api/levels/reload-kv', async (_req, res) => {
  try {
    await reloadLevels();
    const counts = Object.fromEntries(DEFAULT_PAIRS.map(p => [p, state.levels[p]?.data?.length ?? 0]));
    console.log('[LEVELS] KV reload triggered');
    res.json({ ok: true, loadedAt: new Date(state.levelsLoadedAt).toISOString(), counts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Claude AI analysis — handled natively in Node rather than via callWorker
// so the Anthropic fetch runs in the Railway process and benefits from env vars directly.
app.post('/api/analysis', async (req, res) => {
  const key = process.env.ANT_KEY;
  if (!key) return res.status(503).json({ error: 'ANT_KEY not configured — add it in Railway → Variables' });

  try {
    const { pair, snapshot: s } = req.body ?? {};
    if (!pair || !s) return res.status(400).json({ error: 'Missing pair or snapshot' });

    const prompt = buildAnalysisPrompt(pair, s);

    const antRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: 'You are a professional FX/futures desk analyst. You ALWAYS respond with valid complete JSON only — no markdown, no backticks, no text before or after the JSON object. Keep each string value to 1-2 sentences max. Arrays max 3 items. JSON must be fully closed.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!antRes.ok) {
      const errTxt = await antRes.text();
      console.error('[analysis] Anthropic error', antRes.status, errTxt.slice(0, 500));
      return res.status(502).json({ error: `Anthropic API error ${antRes.status}: ${errTxt.slice(0, 400)}` });
    }

    const antData = await antRes.json();

    if (antData.stop_reason === 'max_tokens') {
      return res.status(502).json({ error: 'Response truncated (hit token limit) — please try again' });
    }

    const rawText = antData.content?.[0]?.text ?? '';
    const clean   = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      return res.status(502).json({ error: `JSON parse failed (stop=${antData.stop_reason}): ${clean.slice(0, 300)}` });
    }

    res.json({ ok: true, analysis: parsed, generatedAt: new Date().toISOString() });
  } catch (e) {
    console.error('[analysis]', e.message);
    res.status(500).json({ error: 'Analysis error: ' + e.message });
  }
});

// ── Historical analysis synthesis — sends statistical summary to Claude ────────
app.post('/api/analysis-historical', async (req, res) => {
  const key = process.env.ANT_KEY;
  if (!key) return res.status(503).json({ error: 'ANT_KEY not configured' });

  const { summary } = req.body ?? {};
  if (!summary) return res.status(400).json({ error: 'Missing summary' });

  const prompt = `You are a patient trading coach explaining backtest results to someone who is brand new to trading. They do not understand statistics, percentages, R-multiples, or jargon. Speak like a friend who trades for a living — plain English only.

The data below is from a 5-year test of a strategy that trades specific price levels (Fibonacci confluence levels) during the London and New York sessions. Here are the results broken down by different conditions.

DATA:
${JSON.stringify(summary, null, 2)}

Your job: translate this into simple plain-English advice. DO NOT use raw numbers, percentages, or R-values in your output. Instead say things like "works well", "rarely works", "about half the time", "strong edge", "avoid this", "best time to trade", etc. Use analogies if helpful.

Return a JSON object with EXACTLY these keys — each value is an array of short plain-English strings (1-2 sentences each, no numbers, no jargon):

{
  "filter_recommendations": [
    "Simple rule 1 a beginner can follow tomorrow — what condition to look for",
    "Simple rule 2",
    "Simple rule 3",
    "Simple rule 4"
  ],
  "structural_edges": [
    "One thing that genuinely works — explain WHY in plain English as if explaining to a friend",
    "Another thing that works"
  ],
  "key_findings": [
    "The single most important thing this data is telling you — no numbers, just what it means",
    "Second most important finding",
    "Third finding"
  ],
  "regime_insights": [
    "When does this strategy work best — what market conditions favour it",
    "When does it struggle"
  ],
  "setups_to_avoid": [
    "A specific situation to avoid — describe it simply so a beginner knows what NOT to do",
    "Another situation to avoid"
  ],
  "data_artefact_warnings": [
    "One result that looks good in the data but probably won't repeat — warn them not to rely on it"
  ]
}

Rules for your response:
- Write like you are texting a friend who just started trading
- Never use a percentage, decimal, or R-value
- Never use words like: quantitative, regime, artefact, confluence, asymmetric, magnitude, percentile, winRate, avgR
- DO use words like: works, doesn't work, strong, weak, often, rarely, best, worst, avoid, look for, wait for
- Each string must be one or two plain sentences maximum
- Respond with valid JSON only, no markdown`;


  try {
    const antRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!antRes.ok) {
      const err = await antRes.text();
      return res.status(502).json({ error: `Anthropic error ${antRes.status}: ${err.slice(0, 300)}` });
    }
    const antData = await antRes.json();
    const raw   = antData.content?.[0]?.text ?? '';
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    let parsed;
    try { parsed = JSON.parse(clean); } catch { parsed = { raw_text: clean }; }
    res.json({ ok: true, analysis: parsed });
  } catch (e) {
    console.error('[analysis-historical]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Backtest AI analysis — sends config + results to Claude, returns structured feedback ──
app.post('/api/ai-backtest', async (req, res) => {
  const key = process.env.ANT_KEY;
  if (!key) return res.status(503).json({ error: 'ANT_KEY not configured in Railway Variables' });

  const { symbol, cfg, results } = req.body ?? {};
  if (!results) return res.status(400).json({ error: 'Missing results' });

  const c = cfg || {};
  const d = results;

  const feats = Object.entries(c.features || {})
    .filter(([, v]) => v.enabled).map(([, v]) => v.label).join(', ') || 'none';

  const winPct  = d.winRate   != null ? (d.winRate   * 100).toFixed(1) + '%' : '—';
  const ddPct   = d.maxDrawdown != null ? (d.maxDrawdown * 100).toFixed(1) + '%' : '—';
  const cagrPct = d.cagr      != null ? (d.cagr      * 100).toFixed(1) + '%' : '—';
  const kellyPct= d.kelly     != null ? (d.kelly     * 100).toFixed(1) + '%' : '—';

  const ewStr = String(c.entryWindow || 800).replace(/(\d{2})$/, ':$1');

  const prompt = `You are an expert FX algorithmic trading analyst. Give practical, specific feedback on this backtest.

STRATEGY: Mean-reversion FX — fade Fibonacci confluence levels from the Asia session range
SYMBOL: ${symbol || 'FX'}  |  MODE: ${c.strategyMode || 'mean_reversion'}
DATE RANGE: ${c.startDate || '?'} → ${c.endDate || '?'}  (${d.dateRange?.years ?? '?'} years)

CONFIG:
  R:R ${c.rrRatio}  |  SL: ${c.slMode}${c.slMode === 'range' ? ` ×${c.slFraction}` : ` ×${c.slMult}ATR`}  |  Min SL: ${c.minSlPips}p
  Confluence: ${c.method}  |  Filter: ${c.signalFilter}  |  Tol: ${c.confTolPips}p
  Min Conviction: ${c.minConviction}  |  Min Confirms: ${c.minConfirms}
  Entry window: ${ewStr} London
  Features: ${feats}
  Costs: ${c.spread}p spread + ${c.slippage}p slippage${c.commission ? ` + £${c.commission}/lot` : ''}
  1m Pattern Filter: ${c.m1PatternFilter || 'none'}

RESULTS:
  Trades: ${d.totalTrades}  |  Wins: ${d.wins}  |  Losses: ${d.losses}
  Win Rate: ${winPct}  |  Profit Factor: ${d.profitFactor?.toFixed(2) ?? '—'}
  Mean R: ${d.meanR?.toFixed(3) ?? '—'}  |  Sharpe: ${d.sharpe?.toFixed(2) ?? '—'}  |  Calmar: ${d.calmar?.toFixed(2) ?? '—'}
  Max Drawdown: ${ddPct}  |  CAGR: ${cagrPct}  |  Kelly: ${kellyPct}
  Break-even cost: ${d.breakEvenCostPips?.toFixed(1) ?? '—'} pips

Reply in this exact format (use ** for bold headers):

**VERDICT** — one sentence: Good / Marginal / Poor and the single most important reason

**STRENGTHS**
• what looks solid
• what looks solid

**CONCERNS**
• risk or weakness
• risk or weakness

**TWEAKS** — 3–5 specific suggestions; include exact parameter name and direction
• suggestion
• suggestion

**FEEL** — 1–2 sentences of trader instinct on this setup`;

  try {
    const antRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!antRes.ok) {
      const err = await antRes.text();
      return res.status(502).json({ error: `Anthropic error ${antRes.status}: ${err.slice(0, 300)}` });
    }

    const antData = await antRes.json();
    const text = antData.content?.[0]?.text ?? '(empty)';
    res.json({ ok: true, text });
  } catch (e) {
    console.error('[ai-backtest]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// CME futures live price — proxies Yahoo Finance so the browser avoids CORS issues.
// Returns { ok, price, symbol } where price is the raw CME futures price.
// Inverted pairs (6J, 6C, 6S) return the raw CME quote; client converts to spot-equivalent.
app.get('/api/futures-quote', async (req, res) => {
  const FUTURES_MAP = {
    'EUR/USD':    '6E=F',
    'GBP/USD':    '6B=F',
    'USD/JPY':    '6J=F',
    'AUD/USD':    '6A=F',
    'XAU/USD':    'GC=F',
    'USD/CAD':    '6C=F',
    'USD/CHF':    '6S=F',
    'NAS100_USD': 'NQ=F',
    'SPX500_USD': 'ES=F',
    'US30_USD':   'YM=F',
    'US2000_USD': 'RTY=F',
    'DE30_USD':   'FDAX=F',
  };
  const pair   = req.query.pair;
  const symbol = FUTURES_MAP[pair];
  if (!symbol) return res.json({ ok: false, error: 'No CME futures contract for this pair' });
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8_000) },
    );
    if (!r.ok) return res.json({ ok: false, error: `Yahoo Finance returned ${r.status}` });
    const data  = await r.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (!price) return res.json({ ok: false, error: 'No price in Yahoo Finance response' });
    res.json({ ok: true, price, symbol });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Live 5m HMM regime data for all pairs
app.get('/api/hmm5m', (_req, res) => {
  res.json(state.hmm5mRegimes);
});

// V2 shadow regime data
app.get('/api/hmm5m-v2', (_req, res) => {
  res.json(state.hmm5mV2Regimes);
});

// V2 1h HTF regime data — used by regime_bot_v2.py for higher-timeframe alignment
app.get('/api/hmm1h-v2', (_req, res) => {
  res.json(state.hmm1hV2Regimes);
});

// V2 30m regime data — primary MTF signal for regime_bot_v7.py
app.get('/api/hmm30m-v2', (_req, res) => {
  res.json(state.hmm30mV2Regimes);
});

// V2 2h regime data — optional 4x HTF confirmation gate for regime_bot_v7.py
app.get('/api/hmm2h-v2', (_req, res) => {
  res.json(state.hmm2hV2Regimes);
});

// V2 training status per pair
app.get('/api/hmm5m-train-status', (_req, res) => {
  res.json({
    ...state.hmm5mTrainStatus,
    _meta: { hasLearnedParams: state.hmm5mTrainedParams !== null },
  });
});

// Trigger V2 Baum-Welch training (runs async, returns immediately)
app.post('/api/hmm5m-train', (_req, res) => {
  if (!process.env.OANDA_KEY) {
    return res.status(400).json({ ok: false, message: 'OANDA_KEY not configured' });
  }
  res.json({ ok: true, message: 'Training started — poll /api/hmm5m-train-status for progress' });
  const pairs = state.cfg?.pairs?.length ? state.cfg.pairs : DEFAULT_PAIRS;
  state.hmm5mTrainStatus = Object.fromEntries(pairs.map(s => [s, { status: 'queued' }]));
  runHMM5mTraining(pairs).catch(e => console.error('[HMM5M-TRAIN]', e.message));
});

// Trained HMM V2 parameters export — consumed by Extract button in V2 modal
app.get('/api/hmm5m-train-params', (_req, res) => {
  if (!state.hmm5mTrainedParams) {
    return res.status(404).json({ ok: false, error: 'No trained parameters found — run V2 Training first.' });
  }
  res.json({ ok: true, params: state.hmm5mTrainedParams });
});

// ── Macro-regime-equity backtest store ───────────────────────────────────────
// In-memory; persists for the lifetime of the process.
// Populated by running: python macro-regime-conditional/macro_equity_backtest.py --base-url <URL>
const macroEquityStore = { trades: [], results: {}, savedAt: null };

app.post('/api/macro-equity-backtest/trades', express.json({ limit: '10mb' }), (req, res) => {
  const { trades, savedAt } = req.body ?? {};
  if (!Array.isArray(trades)) return res.status(400).json({ ok: false, error: 'trades array required' });
  macroEquityStore.trades  = trades;
  macroEquityStore.savedAt = savedAt ?? new Date().toISOString();
  console.log(`[macro-equity-bt] saved ${trades.length} trades`);
  res.json({ ok: true, n: trades.length });
});

app.get('/api/macro-equity-backtest/trades', (_req, res) => {
  if (!macroEquityStore.trades.length)
    return res.status(404).json({ ok: false, error: 'No trades — run macro_equity_backtest.py first' });
  res.json({ ok: true, trades: macroEquityStore.trades, savedAt: macroEquityStore.savedAt });
});

app.post('/api/macro-equity-backtest/results', express.json({ limit: '1mb' }), (req, res) => {
  macroEquityStore.results = req.body ?? {};
  macroEquityStore.savedAt = macroEquityStore.results.run_at ?? new Date().toISOString();
  console.log('[macro-equity-bt] results summary stored');
  res.json({ ok: true });
});

app.get('/api/macro-equity-backtest/results', (_req, res) => {
  if (!Object.keys(macroEquityStore.results).length)
    return res.status(404).json({ ok: false, error: 'No results — run macro_equity_backtest.py first' });
  res.json({ ok: true, results: macroEquityStore.results });
});

// ── VIX vol-carry (P8) backtest store ────────────────────────────────────────
// In-memory; persists for the lifetime of the process. Standalone — unlike the
// macro-equity model above, there is no JS engine port or /run job queue here.
// Populated by running: python vix-vol-carry/vix_vol_carry_backtest.py --base-url <URL>
const vixVolCarryStore = { trades: [], results: {}, savedAt: null };

app.post('/api/vix-vol-carry-backtest/trades', express.json({ limit: '10mb' }), (req, res) => {
  const { trades, savedAt } = req.body ?? {};
  if (!Array.isArray(trades)) return res.status(400).json({ ok: false, error: 'trades array required' });
  vixVolCarryStore.trades  = trades;
  vixVolCarryStore.savedAt = savedAt ?? new Date().toISOString();
  console.log(`[vix-vol-carry-bt] saved ${trades.length} trades`);
  res.json({ ok: true, n: trades.length });
});

app.get('/api/vix-vol-carry-backtest/trades', (_req, res) => {
  if (!vixVolCarryStore.trades.length)
    return res.status(404).json({ ok: false, error: 'No trades — run vix_vol_carry_backtest.py first' });
  res.json({ ok: true, trades: vixVolCarryStore.trades, savedAt: vixVolCarryStore.savedAt });
});

app.post('/api/vix-vol-carry-backtest/results', express.json({ limit: '5mb' }), (req, res) => {
  vixVolCarryStore.results = req.body ?? {};
  vixVolCarryStore.savedAt = vixVolCarryStore.results.run_at ?? new Date().toISOString();
  console.log('[vix-vol-carry-bt] results summary stored');
  res.json({ ok: true });
});

app.get('/api/vix-vol-carry-backtest/results', (_req, res) => {
  if (!Object.keys(vixVolCarryStore.results).length)
    return res.status(404).json({ ok: false, error: 'No results — run vix_vol_carry_backtest.py first' });
  res.json({ ok: true, results: vixVolCarryStore.results });
});

// ── Macro-equity JS engine: data cache + job queue ────────────────────────────

const ME_RAW_CACHE = { data: null, fetchedAt: null };
const ME_CACHE_TTL = 22 * 60 * 60 * 1000; // 22h — FRED updates ~once/day

function _oandaBaseMe() {
  return (process.env.OANDA_ENV || 'live') === 'practice'
    ? 'https://api-fxpractice.oanda.com'
    : 'https://api-fxtrade.oanda.com';
}

// Paginated OANDA D1 fetch from a start date until today (handles >5000 bars).
async function fetchOandaD1Range(instrument, fromDate) {
  const key  = process.env.OANDA_KEY;
  const base = _oandaBaseMe();
  let from = `${fromDate}T00:00:00.000000000Z`;
  const bars = [];

  for (let page = 0; page < 10; page++) {
    const url = `${base}/v3/instruments/${encodeURIComponent(instrument)}/candles`
              + `?granularity=D&from=${encodeURIComponent(from)}&count=4500&price=M`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal:  AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`OANDA ${instrument} HTTP ${r.status}`);
    const data   = await r.json();
    const candles = (data.candles ?? []).filter(c => c.complete !== false && c.mid);
    for (const c of candles) {
      const t = new Date(c.time);
      if (t.getUTCHours() >= 20) t.setUTCDate(t.getUTCDate() + 1);
      bars.push({
        date:  t.toISOString().substring(0, 10),
        open:  parseFloat(c.mid.o),
        close: parseFloat(c.mid.c),
      });
    }
    if (candles.length < 4500) break; // no more pages
    from = candles[candles.length - 1].time; // start next page from last bar
  }

  // Deduplicate (overlapping page boundary)
  const seen = new Set();
  return bars.filter(b => seen.has(b.date) ? false : (seen.add(b.date), true));
}

// Paginated OANDA H1 fetch — used by NQ-QMR backtest engine.
async function fetchOandaH1Range(instrument, fromDate) {
  const key  = process.env.OANDA_KEY;
  const base = _oandaBaseMe();
  let from = `${fromDate}T00:00:00.000000000Z`;
  const bars = [];

  for (let page = 0; page < 30; page++) {
    const url = `${base}/v3/instruments/${encodeURIComponent(instrument)}/candles`
              + `?granularity=H1&from=${encodeURIComponent(from)}&count=5000&price=M`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal:  AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`OANDA H1 ${instrument} HTTP ${r.status}`);
    const data    = await r.json();
    const candles = (data.candles ?? []).filter(c => c.complete !== false && c.mid);
    for (const c of candles) {
      bars.push({
        t: c.time.substring(0, 16), // "2024-01-15T09:00"
        o: parseFloat(c.mid.o),
        h: parseFloat(c.mid.h),
        l: parseFloat(c.mid.l),
        c: parseFloat(c.mid.c),
      });
    }
    if (candles.length < 5000) break;
    from = candles[candles.length - 1].time;
  }
  return bars;
}

// NQ-QMR backtest engine — runs entirely server-side on OANDA H1 bars.
// Two-gate pre-open momentum system:
//   Gate 1 (~09:00 UTC): overnight range position (Asia directional bias)
//   Gate 2 (~12:00 UTC): London continuation (3h into London session)
//   Entry  (~13:00 UTC): 09:25 ET pre-open entry, 0.5% stop, 1.8% max risk
function _qmrStats(trades, curve, equity) {
  const n    = trades.length;
  const wins = trades.filter(t => t.tradeReturn > 0).length;
  const rets = trades.map(t => t.tradeReturn / 100);
  const mu   = rets.reduce((s, r) => s + r, 0) / (rets.length || 1);
  const sig  = Math.sqrt(rets.reduce((s, r) => s + (r - mu) ** 2, 0) / (rets.length || 1));
  const years = curve.length >= 2
    ? (new Date(curve[curve.length-1].date) - new Date(curve[0].date)) / (365.25*864e5) : 1;
  const tpy     = n / Math.max(years, 1);
  const sharpe  = sig > 0 ? (mu / sig) * Math.sqrt(tpy) : 0;
  const downDev = Math.sqrt(rets.reduce((s, r) => s + Math.min(r, 0) ** 2, 0) / (n || 1));
  const sortino = downDev > 0 ? (mu / downDev) * Math.sqrt(tpy) : 0;
  const cagr    = (Math.pow(equity, 1 / Math.max(years, 0.01)) - 1) * 100;
  let peak = 1, maxDD = 0;
  for (const { equity: eq } of curve) {
    if (eq > peak) peak = eq;
    const dd = (peak - eq) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  return { n, wins, winRate: n ? wins / n : 0, cagr: +cagr.toFixed(2),
           sharpe: +sharpe.toFixed(2), sortino: +sortino.toFixed(2),
           maxDD: +(maxDD * 100).toFixed(2),
           totalReturn: +((equity - 1) * 100).toFixed(2) };
}

function _computeNqQmr(bars, cfg = {}) {
  const {
    gate1Threshold  = 0.60,  // price must be in top/bottom X% of overnight range
    gate2MinMovePct = 0.10,  // min London move % to confirm direction
    stopPct         = 0.50,      // static stop % — used when stopMultiplier = 0
    stopMultiplier  = 0.45,      // dynamic: stop = rangePct × stopMultiplier (0 = use fixed stopPct)
    riskPct         = 1.00,      // max account risk per trade (%)
    minRangePct     = 0.15,  // skip day if overnight range < this % (low-vol filter)
    tpPct           = 0,     // take-profit % from entry; 0 = EOD only (e.g. 1.0 = 2R at 0.5% stop)
    direction       = 'both',// 'both' | 'long' | 'short' — filter trade direction
    showSystem2     = false, // also compute rejection-fade trades (Gate1 pass, Gate2 rejects)
    showSystem3     = false, // also compute extension-fade trades (G1+G2 confirm, but move already extreme vs typical day range)
    extPctThreshold = 75,    // percentile (vs trailing history) of move-used-by-entry/ADR above which a confirmed day counts as "extended"
    showSystem4     = false, // also compute chop-fade trades (G1+G2 confirm, but the session's path was inefficient/choppy, not a clean trend)
    effPctThreshold = 25,    // percentile (vs trailing history) of trend efficiency BELOW which a confirmed day counts as "choppy"
  } = cfg;

  // Group H1 bars by UTC date
  const byDate = {};
  for (const b of bars) {
    const date = b.t.substring(0, 10);
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(b);
  }
  const dates = Object.keys(byDate).sort();

  // Full UTC-day range % per date — trailing ADR baseline for the extension filter below.
  // Only ever read for days strictly before the trade being evaluated, so no lookahead.
  const dayRangePct = {};
  for (const d of dates) {
    const db = byDate[d];
    const dh = Math.max(...db.map(b => b.h));
    const dl = Math.min(...db.map(b => b.l));
    const dm = (dh + dl) / 2;
    dayRangePct[d] = dm > 0 ? (dh - dl) / dm * 100 : 0;
  }
  const ADR_LOOKBACK    = 20; // trailing days averaged for the ADR baseline
  const EXT_MIN_SAMPLES = 20; // min prior confirm-day samples before ranking a percentile
  const extRatioHistory = []; // causal — confirm-day extension ratios seen strictly before "today"
  const effRatioHistory = []; // causal — confirm-day trend-efficiency ratios seen strictly before "today"

  const trades = [], trades2 = [], trades3 = [], trades2cf = [], trades4 = [];
  let equity1 = 1.0, equity2 = 1.0, equity3 = 1.0, equity4 = 1.0, equityCombo = 1.0;
  const curve1 = [], curve2 = [], curve3 = [], curve4 = [], curveCombo = [];

  for (let di = 1; di < dates.length; di++) {
    const today = dates[di];
    const prev  = dates[di - 1];

    const dow = new Date(today + 'T12:00:00Z').getUTCDay();
    if (dow === 0 || dow === 6) continue;

    // Overnight bars: prev day UTC hour ≥ 21 AND today UTC hour ≤ 8
    const overnightBars = [
      ...(byDate[prev]  || []).filter(b => parseInt(b.t.substring(11, 13)) >= 21),
      ...(byDate[today] || []).filter(b => parseInt(b.t.substring(11, 13)) <= 8),
    ];
    if (overnightBars.length < 4) continue;

    const asiaH    = Math.max(...overnightBars.map(b => b.h));
    const asiaL    = Math.min(...overnightBars.map(b => b.l));
    const range    = asiaH - asiaL;
    const mid      = (asiaH + asiaL) / 2;
    const rangePct = mid > 0 ? (range / mid) * 100 : 0;
    if (!mid || rangePct < minRangePct) continue;

    // Gate 1: price at ~09:00 UTC relative to overnight range
    const g1bar = (byDate[today] || []).find(b => b.t.substring(11, 13) === '09');
    if (!g1bar) continue;

    const posInRange = (g1bar.c - asiaL) / range;
    let gate1 = null;
    if (posInRange >=  gate1Threshold)         gate1 = 'LONG';
    else if (posInRange <= 1 - gate1Threshold) gate1 = 'SHORT';
    else continue;

    // Gate 2: London open (~07:00 UTC) vs check at ~12:00 UTC
    const ldnBar = (byDate[today] || []).find(b => b.t.substring(11, 13) === '07');
    const g2bar  = (byDate[today] || []).find(b => b.t.substring(11, 13) === '12');
    if (!ldnBar || !g2bar) continue;

    const ldnMove = (g2bar.c - ldnBar.o) / ldnBar.o * 100;
    let gate2 = null;
    if      (ldnMove >  gate2MinMovePct && gate1 === 'LONG')   gate2 = 'LONG';   // S1: London confirms
    else if (ldnMove < -gate2MinMovePct && gate1 === 'SHORT')  gate2 = 'SHORT';  // S1: London confirms
    else if (showSystem2 && ldnMove < -gate2MinMovePct && gate1 === 'LONG')  gate2 = 'SHORT'; // S2: fade
    else if (showSystem2 && ldnMove >  gate2MinMovePct && gate1 === 'SHORT') gate2 = 'LONG';  // S2: fade
    else continue;

    // isS2: gate direction is opposite to Gate1 overnight bias
    const isS2 = (gate1 === 'LONG') !== (gate2 === 'LONG');

    // Direction filter applies to S1 only (S2 fires on rejection days by definition)
    if (!isS2 && direction === 'long'  && gate2 !== 'LONG')  continue;
    if (!isS2 && direction === 'short' && gate2 !== 'SHORT') continue;

    // Entry: ~09:25 ET ≈ 13:00 UTC EDT / 14:00 UTC EST — try 13 first
    const entryBar = (byDate[today] || []).find(b => b.t.substring(11, 13) === '13')
                  || (byDate[today] || []).find(b => b.t.substring(11, 13) === '14');
    if (!entryBar) continue;

    const entry       = entryBar.o;
    const effStopPct  = stopMultiplier > 0
      ? Math.max(+(rangePct * stopMultiplier).toFixed(4), 0.10)
      : stopPct;
    const stop  = gate2 === 'LONG'
      ? entry * (1 - effStopPct / 100)
      : entry * (1 + effStopPct / 100);
    const tp = tpPct > 0
      ? (gate2 === 'LONG' ? entry * (1 + tpPct / 100) : entry * (1 - tpPct / 100))
      : null;

    // Scan bars after entry for TP, stop-out, or EOD exit.
    // Stop is checked before TP within the same bar (conservative — assumes worst case).
    const afterEntry = (byDate[today] || [])
      .filter(b => b.t.substring(11, 13) > '13')
      .sort((a, bk) => a.t.localeCompare(bk.t));

    let exit = null, exitReason = 'EOD';
    for (const bar of afterEntry) {
      if (gate2 === 'LONG'  && bar.l <= stop) { exit = stop; exitReason = 'STOP'; break; }
      if (gate2 === 'SHORT' && bar.h >= stop) { exit = stop; exitReason = 'STOP'; break; }
      if (tp !== null && gate2 === 'LONG'  && bar.h >= tp) { exit = tp; exitReason = 'TP'; break; }
      if (tp !== null && gate2 === 'SHORT' && bar.l <= tp) { exit = tp; exitReason = 'TP'; break; }
      if (parseInt(bar.t.substring(11, 13)) >= 20) { exit = bar.c; exitReason = 'EOD'; break; }
    }
    if (exit === null) {
      const last = afterEntry[afterEntry.length - 1];
      if (!last) continue;
      exit = last.c; exitReason = 'EOD';
    }

    // MFE/MAE: scan entry bar + all afterEntry bars for peak favorable/adverse move.
    // Uses full day H1 resolution — MFE answers "how far did it go in our favour?"
    let mfePct = 0, maePct = 0;
    for (const bar of [entryBar, ...afterEntry]) {
      const fav = gate2 === 'LONG'
        ? (bar.h - entry) / entry * 100
        : (entry - bar.l) / entry * 100;
      const adv = gate2 === 'LONG'
        ? (bar.l - entry) / entry * 100
        : (entry - bar.h) / entry * 100;
      if (fav > mfePct) mfePct = fav;
      if (adv < maePct) maePct = adv;
    }

    const movePct     = gate2 === 'LONG'
      ? (exit - entry) / entry * 100
      : (entry - exit) / entry * 100;
    const leverage    = riskPct / effStopPct;
    const tradeReturn = movePct * leverage;

    // Extension check — only meaningful for continuation (non-S2) days. Tracked
    // regardless of showSystem3 so the percentile history is stable across toggle state.
    let isExtended = false;
    if (!isS2) {
      const histDates   = dates.slice(Math.max(0, di - ADR_LOOKBACK), di);
      const adrBaseline = histDates.length
        ? histDates.reduce((s, d) => s + dayRangePct[d], 0) / histDates.length
        : 0;
      const extensionPct = mid > 0 ? Math.abs(entry - mid) / mid * 100 : 0;
      const extRatio      = adrBaseline > 0 ? extensionPct / adrBaseline : 0;
      if (extRatioHistory.length >= EXT_MIN_SAMPLES) {
        const less    = extRatioHistory.filter(v => v <= extRatio).length;
        const pctRank = less / extRatioHistory.length * 100;
        isExtended = pctRank >= extPctThreshold;
      }
      extRatioHistory.push(extRatio);
    }

    // Choppiness check — trend efficiency (Kaufman ER): net move from session
    // open through entry, divided by the total close-to-close path length
    // travelled getting there. Near 1 = clean trend (real room left to run);
    // near 0 = lots of back-and-forth for little net progress (already stalled).
    // Tracked regardless of showSystem4, same causal-history pattern as extension.
    let isChoppy = false;
    if (!isS2) {
      const entryHour   = entryBar.t.substring(11, 13);
      const sessionBars = [
        ...overnightBars,
        ...(byDate[today] || []).filter(b => {
          const h = b.t.substring(11, 13);
          return h > '08' && h <= entryHour;
        }),
      ].sort((a, b) => a.t.localeCompare(b.t));
      const netMove = Math.abs(entry - sessionBars[0].o);
      let pathLength = 0;
      for (let i = 1; i < sessionBars.length; i++) {
        pathLength += Math.abs(sessionBars[i].c - sessionBars[i - 1].c);
      }
      const effRatio = pathLength > 0 ? netMove / pathLength : 0;
      if (effRatioHistory.length >= EXT_MIN_SAMPLES) {
        const less    = effRatioHistory.filter(v => v <= effRatio).length;
        const pctRank = less / effRatioHistory.length * 100;
        isChoppy = pctRank <= effPctThreshold;
      }
      effRatioHistory.push(effRatio);
    }

    const tradeBase = { date: today, gate1, gate2, direction: gate2, entry, stop, exit, exitReason,
                        stopPct: +effStopPct.toFixed(3),
                        movePct: +movePct.toFixed(3), tradeReturn: +tradeReturn.toFixed(3),
                        mfePct: +mfePct.toFixed(3), maePct: +maePct.toFixed(3) };
    if (isS2) {
      equity2 *= (1 + tradeReturn / 100);
      trades2.push({ ...tradeBase, equity: +equity2.toFixed(6), system: 'S2' });
      curve2.push({ date: today, equity: +equity2.toFixed(6) });

      // Counterfactual: same rejection day, trading Gate 1's original direction
      // instead of fading it — the natural baseline for "is fading the rejection
      // actually better than ignoring it," same pattern as System 3's fade check.
      const cfDir  = gate1;
      const cfStop = cfDir === 'LONG' ? entry * (1 - effStopPct / 100) : entry * (1 + effStopPct / 100);
      const cfTp   = tpPct > 0
        ? (cfDir === 'LONG' ? entry * (1 + tpPct / 100) : entry * (1 - tpPct / 100))
        : null;

      let cfExit = null, cfReason = 'EOD';
      for (const bar of afterEntry) {
        if (cfDir === 'LONG'  && bar.l <= cfStop) { cfExit = cfStop; cfReason = 'STOP'; break; }
        if (cfDir === 'SHORT' && bar.h >= cfStop) { cfExit = cfStop; cfReason = 'STOP'; break; }
        if (cfTp !== null && cfDir === 'LONG'  && bar.h >= cfTp) { cfExit = cfTp; cfReason = 'TP'; break; }
        if (cfTp !== null && cfDir === 'SHORT' && bar.l <= cfTp) { cfExit = cfTp; cfReason = 'TP'; break; }
        if (parseInt(bar.t.substring(11, 13)) >= 20) { cfExit = bar.c; cfReason = 'EOD'; break; }
      }
      if (cfExit === null) {
        const last = afterEntry[afterEntry.length - 1];
        if (last) { cfExit = last.c; cfReason = 'EOD'; }
      }
      if (cfExit !== null) {
        const cfMovePct = cfDir === 'LONG' ? (cfExit - entry) / entry * 100 : (entry - cfExit) / entry * 100;
        const cfReturn   = cfMovePct * leverage;
        trades2cf.push({ date: today, gate1, gate2, direction: cfDir, entry, stop: cfStop, exit: cfExit,
                          exitReason: cfReason, stopPct: +effStopPct.toFixed(3),
                          movePct: +cfMovePct.toFixed(3), tradeReturn: +cfReturn.toFixed(3), system: 'S2cf' });
      }
    } else {
      equity1 *= (1 + tradeReturn / 100);
      trades.push({ ...tradeBase, equity: +equity1.toFixed(6), system: 'S1', extended: isExtended, choppy: isChoppy });
      curve1.push({ date: today, equity: +equity1.toFixed(6) });

      // System 3: same day, opposite (fade) direction — only when the move into entry
      // is already at an extreme vs the trailing ADR baseline.
      if (isExtended) {
        const fadeDir  = gate2 === 'LONG' ? 'SHORT' : 'LONG';
        const fadeStop = fadeDir === 'LONG' ? entry * (1 - effStopPct / 100) : entry * (1 + effStopPct / 100);
        const fadeTp   = tpPct > 0
          ? (fadeDir === 'LONG' ? entry * (1 + tpPct / 100) : entry * (1 - tpPct / 100))
          : null;

        let fadeExit = null, fadeReason = 'EOD';
        for (const bar of afterEntry) {
          if (fadeDir === 'LONG'  && bar.l <= fadeStop) { fadeExit = fadeStop; fadeReason = 'STOP'; break; }
          if (fadeDir === 'SHORT' && bar.h >= fadeStop) { fadeExit = fadeStop; fadeReason = 'STOP'; break; }
          if (fadeTp !== null && fadeDir === 'LONG'  && bar.h >= fadeTp) { fadeExit = fadeTp; fadeReason = 'TP'; break; }
          if (fadeTp !== null && fadeDir === 'SHORT' && bar.l <= fadeTp) { fadeExit = fadeTp; fadeReason = 'TP'; break; }
          if (parseInt(bar.t.substring(11, 13)) >= 20) { fadeExit = bar.c; fadeReason = 'EOD'; break; }
        }
        if (fadeExit === null) {
          const last = afterEntry[afterEntry.length - 1];
          if (last) { fadeExit = last.c; fadeReason = 'EOD'; }
        }

        if (fadeExit !== null) {
          let fadeMfe = 0, fadeMae = 0;
          for (const bar of [entryBar, ...afterEntry]) {
            const fav = fadeDir === 'LONG' ? (bar.h - entry) / entry * 100 : (entry - bar.l) / entry * 100;
            const adv = fadeDir === 'LONG' ? (bar.l - entry) / entry * 100 : (entry - bar.h) / entry * 100;
            if (fav > fadeMfe) fadeMfe = fav;
            if (adv < fadeMae) fadeMae = adv;
          }
          const fadeMovePct = fadeDir === 'LONG' ? (fadeExit - entry) / entry * 100 : (entry - fadeExit) / entry * 100;
          const fadeReturn  = fadeMovePct * leverage;
          equity3 *= (1 + fadeReturn / 100);
          trades3.push({ date: today, gate1, gate2, direction: fadeDir, entry, stop: fadeStop, exit: fadeExit,
                         exitReason: fadeReason, stopPct: +effStopPct.toFixed(3),
                         movePct: +fadeMovePct.toFixed(3), tradeReturn: +fadeReturn.toFixed(3),
                         mfePct: +fadeMfe.toFixed(3), maePct: +fadeMae.toFixed(3),
                         equity: +equity3.toFixed(6), system: 'S3' });
          curve3.push({ date: today, equity: +equity3.toFixed(6) });
        }
      }

      // System 4: same day, opposite (fade) direction — only when the session's
      // path into entry was inefficient/choppy rather than a clean trend. Same
      // fade direction as System 3 — sourceExtended lets the combo de-duplicate
      // a day flagged by both when S3 and S4 are both enabled.
      if (isChoppy) {
        const fadeDir  = gate2 === 'LONG' ? 'SHORT' : 'LONG';
        const fadeStop = fadeDir === 'LONG' ? entry * (1 - effStopPct / 100) : entry * (1 + effStopPct / 100);
        const fadeTp   = tpPct > 0
          ? (fadeDir === 'LONG' ? entry * (1 + tpPct / 100) : entry * (1 - tpPct / 100))
          : null;

        let fadeExit = null, fadeReason = 'EOD';
        for (const bar of afterEntry) {
          if (fadeDir === 'LONG'  && bar.l <= fadeStop) { fadeExit = fadeStop; fadeReason = 'STOP'; break; }
          if (fadeDir === 'SHORT' && bar.h >= fadeStop) { fadeExit = fadeStop; fadeReason = 'STOP'; break; }
          if (fadeTp !== null && fadeDir === 'LONG'  && bar.h >= fadeTp) { fadeExit = fadeTp; fadeReason = 'TP'; break; }
          if (fadeTp !== null && fadeDir === 'SHORT' && bar.l <= fadeTp) { fadeExit = fadeTp; fadeReason = 'TP'; break; }
          if (parseInt(bar.t.substring(11, 13)) >= 20) { fadeExit = bar.c; fadeReason = 'EOD'; break; }
        }
        if (fadeExit === null) {
          const last = afterEntry[afterEntry.length - 1];
          if (last) { fadeExit = last.c; fadeReason = 'EOD'; }
        }

        if (fadeExit !== null) {
          let fadeMfe = 0, fadeMae = 0;
          for (const bar of [entryBar, ...afterEntry]) {
            const fav = fadeDir === 'LONG' ? (bar.h - entry) / entry * 100 : (entry - bar.l) / entry * 100;
            const adv = fadeDir === 'LONG' ? (bar.l - entry) / entry * 100 : (entry - bar.h) / entry * 100;
            if (fav > fadeMfe) fadeMfe = fav;
            if (adv < fadeMae) fadeMae = adv;
          }
          const fadeMovePct = fadeDir === 'LONG' ? (fadeExit - entry) / entry * 100 : (entry - fadeExit) / entry * 100;
          const fadeReturn  = fadeMovePct * leverage;
          equity4 *= (1 + fadeReturn / 100);
          trades4.push({ date: today, gate1, gate2, direction: fadeDir, entry, stop: fadeStop, exit: fadeExit,
                         exitReason: fadeReason, stopPct: +effStopPct.toFixed(3),
                         movePct: +fadeMovePct.toFixed(3), tradeReturn: +fadeReturn.toFixed(3),
                         mfePct: +fadeMfe.toFixed(3), maePct: +fadeMae.toFixed(3),
                         equity: +equity4.toFixed(6), system: 'S4', sourceExtended: isExtended });
          curve4.push({ date: today, equity: +equity4.toFixed(6) });
        }
      }
    }
  }

  const stats = _qmrStats(trades, curve1, equity1);
  const result = { trades, curve: curve1, stats };

  if (showSystem2) {
    result.trades2 = trades2;
    result.curve2  = curve2;
    result.stats2  = _qmrStats(trades2, curve2, equity2);
    result.trades2cf = trades2cf; // counterfactual: Gate 1's direction on the same rejection days
  }
  if (showSystem3) {
    result.trades3 = trades3;
    result.curve3  = curve3;
    result.stats3  = _qmrStats(trades3, curve3, equity3);
  }
  if (showSystem4) {
    result.trades4 = trades4;
    result.curve4  = curve4;
    result.stats4  = _qmrStats(trades4, curve4, equity4);
  }
  if (showSystem2 || showSystem3 || showSystem4) {
    // Carve extended/choppy days out of S1 when System 3/4 are replacing them with
    // a fade trade, so the combined curve never double-counts a single trading day.
    // A day flagged by both (S3 and S4 both enabled) is credited to S3 — both fade
    // the same direction, so the outcome is identical either way.
    const comboPool = [
      ...trades.filter(t => !((showSystem3 && t.extended) || (showSystem4 && t.choppy))),
      ...(showSystem2 ? trades2 : []),
      ...(showSystem3 ? trades3 : []),
      ...(showSystem4 ? trades4.filter(t => !(showSystem3 && t.sourceExtended)) : []),
    ].sort((a, b) => a.date.localeCompare(b.date));
    let eq = 1.0;
    const curveComboFinal = [];
    for (const t of comboPool) {
      eq *= (1 + t.tradeReturn / 100);
      curveComboFinal.push({ date: t.date, equity: +eq.toFixed(6) });
    }
    result.tradesCombo = comboPool;
    result.curveCombo = curveComboFinal;
    result.statsCombo = _qmrStats(comboPool, curveComboFinal, eq);
  }
  return result;
}

// Fetch ^VIX from Yahoo Finance v8 chart endpoint
async function fetchVixYahoo(fromUnix) {
  const toUnix = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX`
            + `?interval=1d&period1=${fromUnix}&period2=${toUnix}`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MacroFX/1.0)' },
    signal:  AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`VIX Yahoo HTTP ${r.status}`);
  const json = await r.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('VIX: unexpected Yahoo response');
  const timestamps = result.timestamp ?? [];
  const closes     = result.indicators?.quote?.[0]?.close ?? [];
  const out = new Map();
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] == null || !isFinite(closes[i])) continue;
    const d = new Date(timestamps[i] * 1000);
    out.set(d.toISOString().substring(0, 10), closes[i]);
  }
  return out;
}

// Fetch OHLC bars for any Yahoo Finance ticker (e.g. 'TLT', 'IEF').
// Returns a Map<date, { open, close }>.
async function fetchYahooOHLC(ticker, fromUnix) {
  const toUnix = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`
            + `?interval=1d&period1=${fromUnix}&period2=${toUnix}`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MacroFX/1.0)' },
    signal:  AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`Yahoo ${ticker} HTTP ${r.status}`);
  const json = await r.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo ${ticker}: unexpected response`);
  const timestamps = result.timestamp ?? [];
  const quote      = result.indicators?.quote?.[0] ?? {};
  const opens      = quote.open  ?? [];
  const closes     = quote.close ?? [];
  const out = new Map();
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] == null || !isFinite(closes[i])) continue;
    const d = new Date(timestamps[i] * 1000).toISOString().substring(0, 10);
    out.set(d, { open: isFinite(opens[i]) ? opens[i] : closes[i], close: closes[i] });
  }
  return out;
}

// Fetch a single FRED series via REST API
async function fetchFredSeries(seriesId, fromDate, fredKey) {
  const url = `https://api.stlouisfed.org/fred/series/observations`
            + `?series_id=${seriesId}&api_key=${fredKey}&file_type=json`
            + `&observation_start=${fromDate}&sort_order=asc`;
  const r = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  if (!r.ok) throw new Error(`FRED ${seriesId} HTTP ${r.status}`);
  const json = await r.json();
  const out = new Map();
  for (const obs of json.observations ?? []) {
    if (obs.value === '.' || obs.value == null) continue;
    const v = parseFloat(obs.value);
    if (isFinite(v)) out.set(obs.date, v);
  }
  return out;
}

// Align a sparse date-keyed map onto a master date array (trading days)
function alignSparse(dateIndex, sparseMap) {
  return dateIndex.map(d => sparseMap.has(d) ? sparseMap.get(d) : NaN);
}

// Forward-fill a sparse date-keyed map onto a master date array — carries the
// last known value forward over gaps (weekends/holidays/reporting lag) instead
// of leaving NaN, since TGA/RRP update on Treasury/Fed business days that don't
// line up 1:1 with the FX/CFD trading calendar.
function forwardFillAlign(dateIndex, sparseMap) {
  const keys = [...sparseMap.keys()].sort();
  let ptr = -1, lastVal = NaN;
  return dateIndex.map(d => {
    while (ptr + 1 < keys.length && keys[ptr + 1] <= d) { ptr++; lastVal = sparseMap.get(keys[ptr]); }
    return lastVal;
  });
}

// Daily Treasury General Account balance from Treasury's Daily Treasury
// Statement (Table I — Operating Cash Balance), via the public Fiscal Data
// API. This is the genuinely-daily counterpart to FRED's WTREGEN (weekly).
// Account-type label is matched by substring rather than filtered server-side
// since the dataset mixes a few account rows per day ("Federal Reserve
// Account", "Tax and Loan Note Accounts", "Total Operating Balance" etc).
async function fetchDtsTgaBalance(fromDate) {
  const base = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/dts/operating_cash_balance';
  const out  = new Map();
  for (let pageNum = 1; pageNum <= 50; pageNum++) {
    const params = new URLSearchParams({
      filter: `record_date:gte:${fromDate}`,
      fields: 'record_date,account_type,close_today_bal',
      sort: 'record_date',
      'page[number]': String(pageNum),
      'page[size]': '1000',
    });
    const r = await fetch(`${base}?${params.toString()}`, { signal: AbortSignal.timeout(25_000) });
    if (!r.ok) throw new Error(`Treasury DTS HTTP ${r.status}`);
    const json = await r.json();
    const rows = json.data ?? [];
    for (const row of rows) {
      if (!String(row.account_type ?? '').toLowerCase().includes('federal reserve')) continue;
      const v = parseFloat(row.close_today_bal);
      if (isFinite(v)) out.set(row.record_date, v / 1000); // millions -> billions, matches RRPONTSYD units
    }
    const totalPages = json.meta?.['total-pages'] ?? 1;
    if (!rows.length || pageNum >= totalPages) break;
  }
  return out;
}

// Fetch and align all raw data needed by the engine
async function fetchMeRawData(fredKey) {
  const FROM_DATE  = '2005-01-01';
  const FROM_UNIX  = 1104537600; // 2005-01-01 00:00:00 UTC

  console.log('[macro-equity-bt] fetching OANDA NAS100_USD…');
  const qqqBars = await fetchOandaD1Range('NAS100_USD', FROM_DATE);
  console.log('[macro-equity-bt] fetching OANDA SPX500_USD…');
  const spyBars = await fetchOandaD1Range('SPX500_USD', FROM_DATE);

  console.log('[macro-equity-bt] fetching ^VIX…');
  let vixMap = new Map();
  try {
    vixMap = await fetchVixYahoo(FROM_UNIX);
  } catch (e) {
    console.warn('[macro-equity-bt] VIX fetch failed (will proceed with NaN VIX):', e.message);
  }

  // NAPM (ISM PMI) was restricted by FRED ~2022; fall back to INDPRO (Industrial Production
  // Index, monthly, Federal Reserve) which carries the same directional manufacturing signal.
  // Both are z-scored before use so the different scales don't matter.
  const FRED_SERIES = ['WALCL', 'WTREGEN', 'RRPONTSYD', 'T10Y2Y', 'BAMLH0A0HYM2', 'DFII10'];
  const ISM_CANDIDATES    = ['NAPM', 'INDPRO'];       // US ISM: try in order; first success wins
  const EU_PMI_CANDIDATES = ['MPMIEZMA156N', 'NAPM']; // Eurozone Mfg PMI; fallback to US ISM

  console.log('[macro-equity-bt] fetching FRED series…');
  const fredMaps = {};
  for (const sid of FRED_SERIES) {
    console.log(`  [macro-equity-bt] FRED ${sid}…`);
    try {
      fredMaps[sid.toLowerCase()] = await fetchFredSeries(sid, FROM_DATE, fredKey);
    } catch (e) {
      console.warn(`  [macro-equity-bt] FRED ${sid} failed (NaN fallback): ${e.message}`);
      fredMaps[sid.toLowerCase()] = new Map();
    }
  }

  // ISM / manufacturing activity — try NAPM first, fall back to INDPRO
  let ismMap = new Map();
  for (const sid of ISM_CANDIDATES) {
    console.log(`  [macro-equity-bt] FRED ${sid} (ISM proxy)…`);
    try {
      ismMap = await fetchFredSeries(sid, FROM_DATE, fredKey);
      console.log(`  [macro-equity-bt] using ${sid} for ISM factor (${ismMap.size} obs)`);
      break;
    } catch (e) {
      console.warn(`  [macro-equity-bt] FRED ${sid} failed: ${e.message}`);
    }
  }
  fredMaps.napm = ismMap;

  // EU PMI — Eurozone Manufacturing PMI (S&P Global / Markit, via FRED)
  let euPmiMap = new Map();
  for (const sid of EU_PMI_CANDIDATES) {
    console.log(`  [macro-equity-bt] FRED ${sid} (EU PMI proxy)…`);
    try {
      euPmiMap = await fetchFredSeries(sid, FROM_DATE, fredKey);
      console.log(`  [macro-equity-bt] using ${sid} for EU PMI factor (${euPmiMap.size} obs)`);
      break;
    } catch (e) {
      console.warn(`  [macro-equity-bt] FRED ${sid} failed: ${e.message}`);
    }
  }
  fredMaps.eupmi = euPmiMap;

  console.log('[macro-equity-bt] fetching OANDA US2000_USD (Russell 2000)…');
  let russellBars = [];
  try { russellBars = await fetchOandaD1Range('US2000_USD', FROM_DATE); }
  catch (e) { console.warn('[macro-equity-bt] US2000_USD fetch failed:', e.message); }

  console.log('[macro-equity-bt] fetching TLT (20Y+ Treasury ETF) from Yahoo Finance…');
  let tltMap = new Map();
  try {
    tltMap = await fetchYahooOHLC('TLT', FROM_UNIX);
    console.log(`[macro-equity-bt] TLT: ${tltMap.size} bars`);
  } catch (e) { console.warn('[macro-equity-bt] TLT Yahoo fetch failed:', e.message); }

  console.log('[macro-equity-bt] fetching GLD (Gold ETF) from Yahoo Finance…');
  let gldMap = new Map();
  try {
    gldMap = await fetchYahooOHLC('GLD', FROM_UNIX);
    console.log(`[macro-equity-bt] GLD: ${gldMap.size} bars`);
  } catch (e) { console.warn('[macro-equity-bt] GLD Yahoo fetch failed:', e.message); }

  console.log('[macro-equity-bt] fetching BIL (T-Bills ETF) from Yahoo Finance…');
  let bilMap = new Map();
  try {
    bilMap = await fetchYahooOHLC('BIL', FROM_UNIX);
    console.log(`[macro-equity-bt] BIL: ${bilMap.size} bars`);
  } catch (e) { console.warn('[macro-equity-bt] BIL Yahoo fetch failed:', e.message); }

  console.log('[macro-equity-bt] fetching OANDA DE30_EUR (DAX / Germany 40)…');
  let daxBars = [];
  try { daxBars = await fetchOandaD1Range('DE30_EUR', FROM_DATE); }
  catch (e) { console.warn('[macro-equity-bt] DE30_EUR OANDA fetch failed, will try Yahoo fallback:', e.message); }
  if (daxBars.length === 0) {
    console.log('[macro-equity-bt] DE30_EUR unavailable — falling back to Yahoo Finance ^GDAXI…');
    try {
      const daxYahooMap = await fetchYahooOHLC('^GDAXI', FROM_UNIX);
      daxBars = [...daxYahooMap.entries()].map(([date, v]) => ({ date, open: v.open, close: v.close }));
      console.log(`[macro-equity-bt] DAX ^GDAXI (Yahoo): ${daxBars.length} bars`);
    } catch (e) { console.warn('[macro-equity-bt] DAX Yahoo ^GDAXI fetch also failed:', e.message); }
  }

  // Build master date index from union of all instrument dates, sorted
  const allDates = new Set([
    ...qqqBars.map(b => b.date),
    ...spyBars.map(b => b.date),
    ...russellBars.map(b => b.date),
    ...[...tltMap.keys()],
    ...[...gldMap.keys()],
    ...[...bilMap.keys()],
    ...daxBars.map(b => b.date),
  ]);
  const dates = [...allDates].sort();

  // Map OANDA bars to date index (Yahoo maps used directly)
  const qqqMap     = new Map(qqqBars.map(b    => [b.date, b]));
  const spyMap     = new Map(spyBars.map(b    => [b.date, b]));
  const russellMap = new Map(russellBars.map(b => [b.date, b]));
  const daxMap     = new Map(daxBars.map(b     => [b.date, b]));

  const qqq = {
    open:  dates.map(d => qqqMap.get(d)?.open  ?? NaN),
    close: dates.map(d => qqqMap.get(d)?.close ?? NaN),
  };
  const spy = {
    open:  dates.map(d => spyMap.get(d)?.open  ?? NaN),
    close: dates.map(d => spyMap.get(d)?.close ?? NaN),
  };
  const russell = {
    open:  dates.map(d => russellMap.get(d)?.open  ?? NaN),
    close: dates.map(d => russellMap.get(d)?.close ?? NaN),
    available: russellBars.length > 0,
  };
  const bond30y = {
    open:  dates.map(d => tltMap.get(d)?.open  ?? NaN),
    close: dates.map(d => tltMap.get(d)?.close ?? NaN),
    available: tltMap.size > 0,
  };
  const gold = {
    open:  dates.map(d => gldMap.get(d)?.open  ?? NaN),
    close: dates.map(d => gldMap.get(d)?.close ?? NaN),
    available: gldMap.size > 0,
  };
  const tbill = {
    open:  dates.map(d => bilMap.get(d)?.open  ?? NaN),
    close: dates.map(d => bilMap.get(d)?.close ?? NaN),
    available: bilMap.size > 0,
  };
  const dax = {
    open:  dates.map(d => daxMap.get(d)?.open  ?? NaN),
    close: dates.map(d => daxMap.get(d)?.close ?? NaN),
    available: daxBars.length > 0,
  };

  const vix  = alignSparse(dates, vixMap);
  const fred = {
    walcl:        alignSparse(dates, fredMaps.walcl),
    wtregen:      alignSparse(dates, fredMaps.wtregen),
    rrpontsyd:    alignSparse(dates, fredMaps.rrpontsyd),
    t10y2y:       alignSparse(dates, fredMaps.t10y2y),
    bamlh0a0hym2: alignSparse(dates, fredMaps.bamlh0a0hym2),
    dfii10:       alignSparse(dates, fredMaps.dfii10),
    napm:         alignSparse(dates, fredMaps.napm),
    eupmi:        alignSparse(dates, fredMaps.eupmi),
  };

  return { dates, qqq, spy, russell, bond30y, gold, tbill, dax, vix, fred };
}

const meJobs = new Map();

function _purgeStaleMeJobs() {
  const cutoff = Date.now() - 90 * 60_000; // keep for 90 min
  for (const [id, job] of meJobs) if (job.startedAt < cutoff) meJobs.delete(id);
}

app.post('/api/macro-equity-backtest/run', express.json({ limit: '1mb' }), (req, res) => {
  const fredKey = process.env.FRED_KEY
    || process.env.FRED_API_KEY
    || req.body?.fredKey;

  if (!fredKey) {
    return res.status(400).json({ ok: false,
      error: 'FRED_KEY not set — add it to Railway env vars or pass as fredKey in request body' });
  }
  if (!process.env.OANDA_KEY) {
    return res.status(400).json({ ok: false, error: 'OANDA_KEY not set' });
  }

  const jobId     = `me_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  // Parse optional config overrides from request body
  const body    = req.body ?? {};
  const config  = {
    weights: {
      netLiq:    parseFloat(body.wNetLiq)    || undefined,
      curve:     parseFloat(body.wCurve)     || undefined,
      credit:    parseFloat(body.wCredit)    || undefined,
      realYield: parseFloat(body.wRealYield) || undefined,
      ism:       parseFloat(body.wIsm)       || undefined,
    },
    highBand:   body.highBand   != null ? parseFloat(body.highBand)   : undefined,
    midBand:    body.midBand    != null ? parseFloat(body.midBand)    : undefined,
    lowBand:    body.lowBand    != null ? parseFloat(body.lowBand)    : undefined,
    allocFloor:         body.allocFloor         != null ? parseFloat(body.allocFloor)         : undefined,
    invertedAllocFloor: body.invertedAllocFloor != null ? parseFloat(body.invertedAllocFloor) : undefined,
  };
  // Remove undefined keys
  Object.keys(config).forEach(k => config[k] == null && delete config[k]);
  Object.keys(config.weights ?? {}).forEach(k => config.weights[k] == null && delete config.weights[k]);

  // Instrument inclusion flags
  const includeRussell = body.includeRussell !== false && body.includeRussell !== 'false';
  const includeTLT     = body.includeTLT     === true  || body.includeTLT     === 'true';
  const includeDAX     = body.includeDAX     === true  || body.includeDAX     === 'true';
  const includeGold    = body.includeGold    === true  || body.includeGold    === 'true';
  const includeBIL     = body.includeBIL     === true  || body.includeBIL     === 'true';
  const portfolioMode  = body.portfolioMode  === true  || body.portfolioMode  === 'true';
  if (portfolioMode) config.portfolioMode = true;

  _purgeStaleMeJobs();
  meJobs.set(jobId, { status: 'running', startedAt, phase: 'Fetching data…' });

  (async () => {
    try {
      // Bust cache if a newly-requested instrument has no data in the current cache
      if (includeDAX && ME_RAW_CACHE.data && !ME_RAW_CACHE.data.dax.available) {
        console.log('[macro-equity-bt] cache bust: DAX requested but not in cache — re-fetching…');
        ME_RAW_CACHE.fetchedAt = null;
      }

      // Use cache if fresh
      let rawData;
      if (ME_RAW_CACHE.data && ME_RAW_CACHE.fetchedAt && Date.now() - ME_RAW_CACHE.fetchedAt < ME_CACHE_TTL) {
        console.log('[macro-equity-bt] using cached raw data');
        rawData = ME_RAW_CACHE.data;
        meJobs.get(jobId).phase = 'Computing signals…';
      } else {
        meJobs.get(jobId).phase = 'Fetching OANDA & FRED data…';
        rawData = await fetchMeRawData(fredKey);
        ME_RAW_CACHE.data      = rawData;
        ME_RAW_CACHE.fetchedAt = Date.now();
      }

      meJobs.get(jobId).phase = 'Running backtest & walk-forward…';

      // Build instruments dict from rawData + inclusion flags
      const instruments = {
        QQQ: { ...rawData.qqq, label: 'QQQ — Nasdaq-100', inverted: false },
        SPY: { ...rawData.spy, label: 'SPY — S&P 500',    inverted: false },
      };
      if (includeRussell && rawData.russell.available) {
        instruments.IWM = { ...rawData.russell, label: 'IWM — Russell 2000', inverted: false };
      }
      if (includeTLT && rawData.bond30y.available) {
        instruments.TLT = { ...rawData.bond30y, label: 'TLT — 20Y+ Treasury', inverted: true };
      }
      if (includeDAX && rawData.dax.available) {
        instruments.DAX = { ...rawData.dax, label: 'DAX — Germany 40', inverted: false, euMode: true };
      }
      if (includeGold && rawData.gold.available) {
        instruments.GOLD = { ...rawData.gold, label: 'GLD — Gold', inverted: false };
      }
      if (includeBIL && rawData.tbill.available) {
        instruments.BIL = { ...rawData.tbill, label: 'BIL — T-Bills', inverted: true };
      }

      const engineData = { dates: rawData.dates, instruments, vix: rawData.vix, fred: rawData.fred };
      const result = runMacroEquityBacktest(engineData, config);

      // Write to macroEquityStore — generic N-instrument
      const storeMetrics  = {};
      const storeBh       = {};
      const storeVerdicts = {};
      for (const key of result.instruments) {
        storeMetrics[key]  = result[key].metrics;
        storeBh[key]       = result[key].bh;
        storeVerdicts[key] = result[key].verdict;
      }
      macroEquityStore.results = {
        run_at:      result.runAt,
        instruments: result.instruments,
        metrics:     storeMetrics,
        bh:          storeBh,
        verdict:     storeVerdicts,
      };
      macroEquityStore.savedAt = result.runAt;


      meJobs.set(jobId, {
        status: 'done', startedAt,
        result: { ok: true, data: result, runAt: result.runAt },
      });
      console.log(`[macro-equity-bt] job ${jobId} done (${Math.round((Date.now() - startedAt) / 1000)}s)`);
    } catch (e) {
      const msg = e?.message || String(e);
      console.error('[macro-equity-bt] error:', msg, e?.stack ?? '');
      meJobs.set(jobId, { status: 'error', error: msg, startedAt });
    }
  })();

  res.json({ ok: true, jobId });
});

app.get('/api/macro-equity-backtest/status/:jobId', (req, res) => {
  const job = meJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, error: 'Job not found or expired' });
  if (job.status === 'running') {
    return res.json({ ok: true, status: 'running',
      elapsed: Math.round((Date.now() - job.startedAt) / 1000),
      phase: job.phase ?? 'Running…' });
  }
  if (job.status === 'done') return res.json({ ok: true, status: 'done', ...job.result });
  return res.status(500).json({ ok: false, status: 'error', error: job.error });
});

// ── Global Liquidity real-data backtest (runs on Railway: FRED_KEY + R2 FX) ────
// POST /api/global-liquidity/backtest/run        → { ok, jobId }
// GET  /api/global-liquidity/backtest/status/:id → { ok, status, ...result }
// Reuses the same engine as the phone page and the shared backtestCore so the
// dashboard, CLI and server can never drift. FX comes from R2 via loadM1ForPair;
// FRED comes from the FRED API using the Railway FRED_KEY.
const gliBtJobs   = new Map();
const GLI_BT_CACHE = { result: null, builtAt: 0 };
const GLI_BT_TTL   = 6 * 60 * 60 * 1000;   // 6h — FRED/FX update at most daily

function _purgeStaleGliJobs() {
  const now = Date.now();
  for (const [id, j] of gliBtJobs) if (now - j.startedAt > 30 * 60 * 1000) gliBtJobs.delete(id);
}

// Pull each FRED series (Railway key) into the /api/fredhistory payload shape.
async function _gliFetchFred(fredKey) {
  const payload = {};
  for (const [k, sid] of Object.entries(GLI_FRED_IDS)) {
    try {
      const map = await fetchFredSeries(sid, '2008-01-01', fredKey);
      payload[k] = [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, value]) => ({ date, value }));
    } catch (e) {
      console.warn(`[gli-bt] FRED ${sid} failed: ${e.message}`);
      payload[k] = [];
    }
  }
  return payload;
}

// Load each pair's weekly returns from R2 (loadM1ForPair) → Map<weekDate, ret>.
async function _gliLoadFx(engine) {
  const fxByPair = {};
  let found = 0;
  for (const pair of engine.CFG.PAIRS) {
    const stem = (GLI_FX_ALIAS[pair] || pair).toLowerCase();
    try {
      const m1 = await loadM1ForPair(stem);     // { times: Int32 epoch-sec, closes: Float32 } | null
      if (!m1 || !m1.n) continue;
      const points = new Array(m1.n);
      for (let i = 0; i < m1.n; i++) points[i] = { t: m1.times[i] * 1000, close: m1.closes[i] };
      fxByPair[pair] = gliWeeklyReturns(points);
      found++;
    } catch (e) { console.warn(`[gli-bt] FX ${pair} failed: ${e.message}`); }
  }
  return { fxByPair, found };
}

app.post('/api/global-liquidity/backtest/run', express.json({ limit: '256kb' }), (req, res) => {
  const fredKey = process.env.FRED_KEY || process.env.FRED_API_KEY || req.body?.fredKey;
  if (!fredKey) {
    return res.status(400).json({ ok: false,
      error: 'FRED_KEY not set — add it to Railway env vars (or pass fredKey in the request body).' });
  }
  const force = req.body?.force === true || req.body?.force === 'true';

  const jobId     = `gli_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  _purgeStaleGliJobs();

  // Serve a fresh cached result instantly (a phone tap shouldn't re-fetch R2 + FRED).
  if (!force && GLI_BT_CACHE.result && Date.now() - GLI_BT_CACHE.builtAt < GLI_BT_TTL) {
    gliBtJobs.set(jobId, { status: 'done', startedAt, result: { ok: true, cached: true, data: GLI_BT_CACHE.result } });
    return res.json({ ok: true, jobId, cached: true });
  }

  gliBtJobs.set(jobId, { status: 'running', startedAt, phase: 'Fetching FRED…' });
  (async () => {
    try {
      const engine = loadGliEngine();
      const payload = await _gliFetchFred(fredKey);
      gliBtJobs.set(jobId, { status: 'running', startedAt, phase: 'Loading FX from R2…' });
      const { fxByPair, found } = await _gliLoadFx(engine);
      if (!found) throw new Error('no FX data loaded (R2/disk unavailable)');
      gliBtJobs.set(jobId, { status: 'running', startedAt, phase: 'Running engine + walk-forward…' });
      const data = computeGliBacktest({ engine, payload, fxByPair, fredSource: 'FRED API (Railway key)' });
      GLI_BT_CACHE.result = data; GLI_BT_CACHE.builtAt = Date.now();
      gliBtJobs.set(jobId, { status: 'done', startedAt, result: { ok: true, cached: false, data } });
      console.log(`[gli-bt] job ${jobId} done (${Math.round((Date.now() - startedAt) / 1000)}s, ${found} pairs)`);
    } catch (e) {
      const msg = e?.message || String(e);
      console.error('[gli-bt] error:', msg, e?.stack ?? '');
      gliBtJobs.set(jobId, { status: 'error', error: msg, startedAt });
    }
  })();

  res.json({ ok: true, jobId });
});

app.get('/api/global-liquidity/backtest/status/:jobId', (req, res) => {
  const job = gliBtJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, error: 'Job not found or expired' });
  if (job.status === 'running') {
    return res.json({ ok: true, status: 'running', elapsed: Math.round((Date.now() - job.startedAt) / 1000), phase: job.phase ?? 'Running…' });
  }
  if (job.status === 'done') return res.json({ ok: true, status: 'done', ...job.result });
  return res.status(500).json({ ok: false, status: 'error', error: job.error });
});

// ── NQ-QMR backtest endpoint ──────────────────────────────────────────────────
const nqQmrBarCache    = new Map(); // instrument → { bars, fetchedAt }
const nqQmrResultCache = { result: null, fetchedAt: null }; // NAS100_USD default only
const NQ_QMR_TTL_MS = 23 * 60 * 60 * 1000;

const NQ_QMR_DEFAULTS = { gate1Threshold: 0.60, gate2MinMovePct: 0.10, stopPct: 0.50, stopMultiplier: 0.45, riskPct: 1.00, minRangePct: 0.15, tpPct: 1.50, direction: 'both', extPctThreshold: 75, effPctThreshold: 25 };

async function _getNqQmrBars(instrument = 'NAS100_USD') {
  const cached = nqQmrBarCache.get(instrument);
  if (cached?.bars && cached.fetchedAt && Date.now() - cached.fetchedAt < NQ_QMR_TTL_MS) {
    return cached.bars;
  }
  const d = new Date(); d.setFullYear(d.getFullYear() - 5);
  const fromDate = d.toISOString().substring(0, 10);
  console.log(`[nq-qmr] fetching OANDA H1 ${instrument} from`, fromDate);
  const bars = await fetchOandaH1Range(instrument, fromDate);
  nqQmrBarCache.set(instrument, { bars, fetchedAt: Date.now() });
  return bars;
}

const NQ_QMR_INSTRUMENTS = new Set([
  'NAS100_USD','SPX500_USD','US30_USD','DE30_EUR','UK100_GBP',
  'XAU_USD',
  'EUR_USD','GBP_USD','USD_JPY','GBP_JPY','AUD_USD','EUR_JPY',
]);

app.get('/api/nq-qmr/backtest', async (req, res) => {
  if (!process.env.OANDA_KEY) return res.status(503).json({ ok: false, error: 'OANDA_KEY not set' });

  const instrument = NQ_QMR_INSTRUMENTS.has(req.query.instrument) ? req.query.instrument : 'NAS100_USD';

  const cfg = {};
  for (const [k, def] of Object.entries(NQ_QMR_DEFAULTS)) {
    if (typeof def === 'string') {
      cfg[k] = req.query[k] ?? def;
    } else {
      cfg[k] = req.query[k] != null ? parseFloat(req.query[k]) : def;
    }
  }
  cfg.showSystem2 = req.query.showSystem2 === 'true';
  cfg.showSystem3 = req.query.showSystem3 === 'true';
  cfg.showSystem4 = req.query.showSystem4 === 'true';

  const isNasDefault = instrument === 'NAS100_USD' && !cfg.showSystem2 && !cfg.showSystem3 && !cfg.showSystem4 && Object.entries(cfg).every(([k, v]) =>
    typeof v === 'string' ? v === NQ_QMR_DEFAULTS[k] : Math.abs(v - NQ_QMR_DEFAULTS[k]) < 0.001
  );
  if (isNasDefault && nqQmrResultCache.result && nqQmrResultCache.fetchedAt && Date.now() - nqQmrResultCache.fetchedAt < NQ_QMR_TTL_MS) {
    return res.json({ ok: true, cached: true, ...nqQmrResultCache.result });
  }

  try {
    const bars   = await _getNqQmrBars(instrument);
    console.log(`[nq-qmr] ${bars.length} H1 bars (${instrument}) — running backtest`);
    const result = _computeNqQmr(bars, cfg);
    if (isNasDefault) { nqQmrResultCache.result = result; nqQmrResultCache.fetchedAt = Date.now(); }
    res.json({ ok: true, cached: false, instrument, ...result });
  } catch (err) {
    console.error('[nq-qmr]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── /api/oanda_ohlc5m  — OHLC candles for any FX/gold pair ──────────────────
// ?symbol=EUR/USD[&granularity=H1]  granularity defaults to M5
// Returns { values:[{datetime, open, high, low, close}] } newest-first,
// datetime in London local time.
const _m5SrvCache = new Map();
const _OHLC_GRAN = { M5: { count: 1500, ttl: 45_000 }, H1: { count: 100, ttl: 10 * 60_000 } };
app.get('/api/oanda_ohlc5m', async (req, res) => {
  if (!process.env.OANDA_KEY) return res.status(503).json({ error: 'OANDA_KEY not configured' });
  const symbol = req.query.symbol;
  if (!symbol) return res.status(400).json({ error: 'symbol param required' });
  const gran = (req.query.granularity || 'M5').toUpperCase();
  if (!_OHLC_GRAN[gran]) return res.status(400).json({ error: `Unsupported granularity: ${gran}` });
  const { count, ttl } = _OHLC_GRAN[gran];
  const instrument = symbol.replace('/', '_');
  const cacheKey   = `ohlc_${gran}_${instrument}`;
  const cached     = _m5SrvCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ttl) return res.json(cached.data);
  try {
    const base = _oandaBaseMe();
    const url  = `${base}/v3/instruments/${encodeURIComponent(instrument)}/candles?granularity=${gran}&count=${count}&price=M`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` },
      signal:  AbortSignal.timeout(20_000),
    });
    if (!r.ok) { const t = await r.text().catch(() => 'err'); return res.status(502).json({ error: `OANDA ${r.status}: ${t.slice(0,200)}` }); }
    const data = await r.json();
    if (!data.candles) return res.status(502).json({ error: 'No candles returned' });
    const values = data.candles
      .filter(c => c.complete && c.mid)
      .map(c => ({
        datetime: new Date(c.time).toLocaleString('sv-SE', { timeZone: 'Europe/London' }).substring(0, 19),
        open: c.mid.o, high: c.mid.h, low: c.mid.l, close: c.mid.c,
      }))
      .reverse();
    const result = { values, meta: { symbol, source: 'oanda', granularity: gran } };
    _m5SrvCache.set(cacheKey, { data: result, ts: Date.now() });
    res.json(result);
  } catch (err) {
    console.error('[oanda_ohlc5m]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── NQ-QMR M5 candles for trade viewer ───────────────────────────────────────
app.get('/api/nq-qmr/m5-candles', async (req, res) => {
  if (!process.env.OANDA_KEY) return res.status(503).json({ ok: false, error: 'OANDA_KEY not set' });
  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ ok: false, error: 'date param required (YYYY-MM-DD)' });
  }
  try {
    const from = `${date}T00:00:00.000000000Z`;
    const nextDay = new Date(date + 'T00:00:00Z');
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const to = nextDay.toISOString().substring(0, 10) + 'T00:00:00.000000000Z';

    const key  = process.env.OANDA_KEY;
    const base = _oandaBaseMe();
    const url  = `${base}/v3/instruments/NAS100_USD/candles`
               + `?granularity=M5&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&price=M`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`OANDA M5 HTTP ${r.status}`);
    const data = await r.json();
    const bars = (data.candles ?? []).filter(c => c.mid).map(c => ({
      t: c.time.substring(0, 16),
      o: parseFloat(c.mid.o),
      h: parseFloat(c.mid.h),
      l: parseFloat(c.mid.l),
      c: parseFloat(c.mid.c),
    }));
    res.json({ ok: true, bars });
  } catch (err) {
    console.error('[nq-qmr m5]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── NQ-QMR parameter optimizer ────────────────────────────────────────────────
app.get('/api/nq-qmr/optimize', async (req, res) => {
  if (!process.env.OANDA_KEY) return res.status(503).json({ ok: false, error: 'OANDA_KEY not set' });
  try {
    const bars = await _getNqQmrBars();
    console.log(`[nq-qmr opt] ${bars.length} H1 bars — grid search`);

    const grid = {
      gate1Threshold:  [0.55, 0.60, 0.65, 0.70, 0.75],
      gate2MinMovePct: [0.08, 0.10, 0.15, 0.20, 0.25],  // 0.05 removed — near-zero disables gate2 selectivity
      stopMultiplier:  [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60],
      minRangePct:     [0.10, 0.12, 0.15, 0.20, 0.25],
      riskPct:         [1.00],
      tpPct:           [0, 0.75, 1.00, 1.25, 1.50, 2.00],  // 0=EOD; 1.0=2R; 1.5=3R; 2.0=4R
    };
    // Max trades cap: configs with >400 trades (~80/yr) sacrifice selectivity — skip them.
    const MAX_N = 400;

    const results = [];
    for (const gate1Threshold of grid.gate1Threshold) {
      for (const gate2MinMovePct of grid.gate2MinMovePct) {
        for (const stopMultiplier of grid.stopMultiplier) {
          for (const minRangePct of grid.minRangePct) {
            for (const riskPct of grid.riskPct) {
              for (const tpPct of grid.tpPct) {
                const cfg = { gate1Threshold, gate2MinMovePct, stopMultiplier, minRangePct, riskPct, tpPct };
                const result = _computeNqQmr(bars, cfg);
                const s = result.stats;
                if (s.n < 30 || s.n > MAX_N || s.cagr <= 0 || s.maxDD <= 0 || s.sharpe <= 0) continue;
                // Score: Sharpe × √CAGR / MaxDD — rewards consistency and growth, punishes drawdown
                const score = s.sharpe * Math.sqrt(s.cagr) / s.maxDD;
                results.push({ cfg, stats: s, score: +score.toFixed(4) });
              }
            }
          }
        }
      }
    }

    const totalGrid = grid.gate1Threshold.length * grid.gate2MinMovePct.length
                    * grid.stopMultiplier.length * grid.minRangePct.length
                    * grid.riskPct.length * grid.tpPct.length;
    results.sort((a, b) => b.score - a.score);
    const top5      = results.slice(0, 5);
    const totalRuns = results.length;
    console.log(`[nq-qmr opt] ${totalRuns}/${totalGrid} valid configs evaluated, top score=${top5[0]?.score}`);
    res.json({ ok: true, top5, totalRuns, totalGrid });
  } catch (err) {
    console.error('[nq-qmr opt]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── NQ-QMR Walk-Forward Retrain ──────────────────────────────────────────────
app.get('/api/nq-qmr/walkforward-retrain', async (req, res) => {
  if (!process.env.OANDA_KEY) return res.status(503).json({ ok: false, error: 'OANDA_KEY not set' });
  try {
    const bars = await _getNqQmrBars();
    const wfGrid = {
      gate1Threshold:  [0.55, 0.60, 0.65, 0.70],
      gate2MinMovePct: [0.08, 0.10, 0.15],
      stopMultiplier:  [0.35, 0.40, 0.45, 0.50, 0.55],
      minRangePct:     [0.12, 0.15, 0.20],
      riskPct:         [1.00],
      tpPct:           [1.00, 1.25, 1.50],
    };
    function addMonths(d, m) { const r = new Date(d); r.setUTCMonth(r.getUTCMonth() + m); return r; }
    const allDates  = [...new Set(bars.map(b => b.t.substring(0, 10)))].sort();
    const firstDate = new Date(allDates[0] + 'T00:00:00Z');
    const lastDate  = new Date(allDates[allDates.length - 1] + 'T00:00:00Z');
    // IS=12mo, OOS=6mo, step=3mo
    const windows = [];
    let wStart = new Date(firstDate);
    while (true) {
      const isEnd  = addMonths(wStart, 12);
      const oosEnd = addMonths(isEnd, 6);
      if (oosEnd > lastDate) break;
      windows.push({
        isStart: wStart.toISOString().substring(0, 10),
        isEnd:   isEnd.toISOString().substring(0, 10),
        oosEnd:  oosEnd.toISOString().substring(0, 10),
      });
      wStart = addMonths(wStart, 3);
    }
    function barsInRange(from, to) {
      return bars.filter(b => b.t.substring(0, 10) >= from && b.t.substring(0, 10) < to);
    }
    function findBest(subBars) {
      let best = null;
      for (const g1 of wfGrid.gate1Threshold)
      for (const g2 of wfGrid.gate2MinMovePct)
      for (const sm of wfGrid.stopMultiplier)
      for (const mr of wfGrid.minRangePct)
      for (const rp of wfGrid.riskPct)
      for (const tp of wfGrid.tpPct) {
        const cfg = { gate1Threshold: g1, gate2MinMovePct: g2, stopMultiplier: sm, minRangePct: mr, riskPct: rp, tpPct: tp };
        const r   = _computeNqQmr(subBars, cfg);
        const s   = r.stats;
        if (s.n < 8 || s.cagr <= 0 || s.maxDD <= 0 || s.sharpe <= 0) continue;
        const score = s.sharpe * Math.sqrt(s.cagr) / s.maxDD;
        if (!best || score > best.score) best = { cfg, stats: s, score };
      }
      return best;
    }
    const results  = [];
    let baseEq = 1.0;
    const oosCurve = [];
    for (const w of windows) {
      const isBars  = barsInRange(w.isStart, w.isEnd);
      const oosBars = barsInRange(w.isEnd, w.oosEnd);
      const best = findBest(isBars);
      if (!best) { results.push({ isStart: w.isStart, isEnd: w.isEnd, oosEnd: w.oosEnd, bestCfg: null, isStats: null, oosStats: null }); continue; }
      const oosR = _computeNqQmr(oosBars, best.cfg);
      for (const p of oosR.curve) {
        oosCurve.push({ date: p.date, equity: +(baseEq * p.equity).toFixed(6) });
      }
      if (oosR.curve.length) baseEq *= oosR.curve[oosR.curve.length - 1].equity;
      results.push({ isStart: w.isStart, isEnd: w.isEnd, oosEnd: w.oosEnd, bestCfg: best.cfg, isStats: best.stats, oosStats: oosR.stats });
    }
    console.log(`[nq-qmr wf-retrain] ${results.length} windows, OOS curve pts: ${oosCurve.length}`);
    res.json({ ok: true, windows: results, oosCurve });
  } catch (err) {
    console.error('[nq-qmr wf-retrain]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Gold backtest trades store ────────────────────────────────────────────────
// In-memory store; persists for the lifetime of the process.
const goldBacktestStore = { trades: [], savedAt: null };

app.post('/api/gold-backtest/trades', express.json({ limit: '20mb' }), (req, res) => {
  const { trades } = req.body ?? {};
  if (!Array.isArray(trades)) return res.status(400).json({ ok: false, error: 'trades array required' });
  goldBacktestStore.trades  = trades;
  goldBacktestStore.savedAt = new Date().toISOString();
  console.log(`[gold-bt] saved ${trades.length} trades for viewer`);
  res.json({ ok: true, n: trades.length });
});

app.get('/api/gold-backtest/trades', (req, res) => {
  if (!goldBacktestStore.trades.length) {
    return res.status(404).json({ ok: false, error: 'No trades found — run the backtester first' });
  }
  res.json({ ok: true, trades: goldBacktestStore.trades, savedAt: goldBacktestStore.savedAt });
});

// ── Gold live trade journal (CSV → JSON) ─────────────────────────────────────
// Reads Gold/logs/gold_trades.csv and returns all rows as structured JSON.
app.get('/api/gold/trades', async (req, res) => {
  const csvPath = path.join(__dirname, 'Gold', 'logs', 'gold_trades.csv');
  try {
    const raw = await fs.promises.readFile(csvPath, 'utf8');
    const lines = raw.trim().split('\n');
    if (lines.length < 2) return res.json({ ok: true, trades: [] });
    const headers = lines[0].split(',');
    const trades = lines.slice(1).map(line => {
      // composition field may contain commas — split on first N-1 delimiters only
      const parts = line.split(',');
      const row = {};
      headers.forEach((h, i) => {
        const v = (parts[i] ?? '').trim();
        row[h.trim()] = isNaN(v) || v === '' ? v : parseFloat(v);
      });
      // composition is the last column and may have had commas — rejoin overflow parts
      if (parts.length > headers.length) {
        row['composition'] = parts.slice(headers.length - 1).join(',').trim();
      }
      return row;
    }).filter(r => r.zone_id);
    res.json({ ok: true, trades, count: trades.length });
  } catch (err) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

// ── CBOE FX/Gold implied vol (EVZCLS/GVZCLS via FRED) ─────────────────────────
// Serves RegimeV2/macro_overlay.py's CBOEVolFetcher for bots that run outside
// Railway (V4/V7 need a local MT5 terminal) and so don't inherit FRED_KEY from
// the container env. They poll this instead of calling FRED directly.
const CVOL_CACHE    = { data: null, fetchedAt: 0 };
const CVOL_TTL_MS   = 6 * 60 * 60 * 1000;  // 6h — matches CBOEVolFetcher._REFRESH_SECS
const CVOL_SERIES   = ['EVZCLS', 'GVZCLS'];

app.get('/api/cvol', async (_req, res) => {
  const fredKey = process.env.FRED_KEY || process.env.FRED_API_KEY;
  if (!fredKey) return res.status(503).json({ ok: false, error: 'FRED_KEY not set' });

  const age = Date.now() - CVOL_CACHE.fetchedAt;
  if (CVOL_CACHE.data && age < CVOL_TTL_MS) {
    return res.json({ ok: true, cached: true, ...CVOL_CACHE.data });
  }

  try {
    const fromDate = new Date(Date.now() - 1825 * 86_400_000).toISOString().slice(0, 10); // 5y
    const results  = await Promise.allSettled(CVOL_SERIES.map(sid => fetchFredSeries(sid, fromDate, fredKey)));

    const levels = {}, pct = {};
    results.forEach((r, i) => {
      const sid = CVOL_SERIES[i];
      if (r.status !== 'fulfilled' || r.value.size < 20) return;
      const values  = [...r.value.values()];
      const current = values[values.length - 1];
      const below   = values.filter(v => v < current).length;
      levels[sid] = Math.round(current * 100) / 100;
      pct[sid]    = Math.round((below / values.length) * 1000) / 10;
    });

    if (Object.keys(levels).length === 0) throw new Error('all FRED series fetches failed');

    const data = { levels, pct, coherence: (pct.EVZCLS ?? 0) >= 50 };
    CVOL_CACHE.data      = data;
    CVOL_CACHE.fetchedAt = Date.now();
    res.json({ ok: true, cached: false, ...data });
  } catch (e) {
    console.warn('[cvol] fetch error:', e.message);
    if (CVOL_CACHE.data) return res.json({ ok: true, cached: true, stale: true, ...CVOL_CACHE.data });
    res.status(502).json({ ok: false, error: e.message });
  }
});

// ── Diversification backtest data cache ───────────────────────────────────────
const DIVERS_CACHE = { data: null, fetchedAt: null };
const DIVERS_TTL_MS = 22 * 60 * 60 * 1000;

app.get('/api/diversification/data', async (req, res) => {
  const fredKey = process.env.FRED_KEY;
  if (!fredKey) return res.status(503).json({ ok: false, error: 'FRED_KEY not set' });

  const age = DIVERS_CACHE.fetchedAt ? Date.now() - DIVERS_CACHE.fetchedAt : Infinity;
  if (DIVERS_CACHE.data && age < DIVERS_TTL_MS) {
    return res.json({ ok: true, cached: true, ...DIVERS_CACHE.data });
  }

  try {
    const FROM_DATE = '2005-01-01';
    const FROM_UNIX = 1104537600; // 2005-01-01 UTC

    console.log('[divers] fetching FRED series in parallel…');
    const fredIds = ['WALCL', 'WTREGEN', 'RRPONTSYD', 'T10Y2Y', 'BAMLH0A0HYM2', 'DFII10', 'NAPM', 'DTWEXBGS', 'CPILFESL'];
    const fredResults = await Promise.allSettled(fredIds.map(sid => fetchFredSeries(sid, FROM_DATE, fredKey)));
    const [walclMap, wtregenMap, rrponMap, curveMap, creditMap, realyieldMap, ismMap, dxyMap, coreCpiMap] =
      fredResults.map(r => r.status === 'fulfilled' ? r.value : new Map());
    fredResults.forEach((r, i) => {
      if (r.status === 'fulfilled') console.log(`  [divers] FRED ${fredIds[i]}: ${r.value.size} obs`);
      else console.warn(`  [divers] FRED ${fredIds[i]} failed: ${r.reason?.message}`);
    });

    // NAPM (ISM Manufacturing PMI) may be restricted on FRED free tier.
    // Try ISMMAN (alternative FRED code) before falling back to INDPRO.
    // INDPRO is physical output (not a survey), so it's a last resort.
    let finalIsmMap = ismMap;
    if (ismMap.size < 10) {
      console.log('[divers] NAPM sparse — trying ISMMAN…');
      try {
        const ismmanMap = await fetchFredSeries('ISMMAN', FROM_DATE, fredKey);
        if (ismmanMap.size >= 10) { finalIsmMap = ismmanMap; console.log(`[divers] using ISMMAN (${ismmanMap.size} obs)`); }
        else throw new Error('ISMMAN also sparse');
      } catch (e) {
        console.warn('[divers] ISMMAN failed:', e.message, '— falling back to INDPRO');
        try { finalIsmMap = await fetchFredSeries('INDPRO', FROM_DATE, fredKey); console.log(`[divers] using INDPRO fallback`); }
        catch (e2) { console.warn('[divers] INDPRO fallback failed:', e2.message); }
      }
    }

    console.log('[divers] fetching Yahoo ETFs + VIX…');
    const [spyResult, tltResult, gldResult, vixResult] = await Promise.allSettled([
      fetchYahooOHLC('SPY', FROM_UNIX),
      fetchYahooOHLC('TLT', FROM_UNIX),
      fetchYahooOHLC('GLD', FROM_UNIX),
      fetchVixYahoo(FROM_UNIX),
    ]);
    const spyMap = spyResult.status === 'fulfilled' ? spyResult.value : new Map();
    const tltMap = tltResult.status === 'fulfilled' ? tltResult.value : new Map();
    const gldMap = gldResult.status === 'fulfilled' ? gldResult.value : new Map();
    const vixMap = vixResult.status === 'fulfilled' ? vixResult.value : new Map();
    console.log(`  [divers] SPY ${spyMap.size} | TLT ${tltMap.size} | GLD ${gldMap.size} | VIX ${vixMap.size}`);

    console.log('[divers] fetching OANDA FX pairs…');
    const FX_INSTRUMENTS = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'USD_CAD', 'USD_CHF', 'AUD_USD', 'NZD_USD', 'GBP_JPY', 'AUD_JPY', 'NZD_JPY'];
    const fxMaps = {};
    await Promise.allSettled(FX_INSTRUMENTS.map(inst =>
      fetchOandaD1Range(inst, FROM_DATE)
        .then(bars => {
          const m = new Map();
          for (const b of bars) m.set(b.date, b.close);
          fxMaps[inst] = m;
          console.log(`  [divers] ${inst}: ${m.size} bars`);
        })
        .catch(e => {
          console.warn(`  [divers] ${inst} failed: ${e.message}`);
          fxMaps[inst] = new Map();
        })
    ));

    // Master date index from SPY (equity trading calendar)
    const dateSet = new Set();
    for (const d of spyMap.keys()) dateSet.add(d);
    const dateIndex = [...dateSet].sort();

    // Helper: extract close prices from Yahoo OHLC map
    const closeMap = m => new Map([...m].map(([d, v]) => [d, v.close]));

    const data = {
      dateIndex,
      fred: {
        walcl:     alignSparse(dateIndex, walclMap),
        wtregen:   alignSparse(dateIndex, wtregenMap),
        rrpon:     alignSparse(dateIndex, rrponMap),
        curve:     alignSparse(dateIndex, curveMap),
        credit:    alignSparse(dateIndex, creditMap),
        realyield: alignSparse(dateIndex, realyieldMap),
        ism:       alignSparse(dateIndex, finalIsmMap),
        dxy:       alignSparse(dateIndex, dxyMap),
        coreCpi:   alignSparse(dateIndex, coreCpiMap),
      },
      prices: {
        spy: alignSparse(dateIndex, closeMap(spyMap)),
        tlt: alignSparse(dateIndex, closeMap(tltMap)),
        gld: alignSparse(dateIndex, closeMap(gldMap)),
        vix: alignSparse(dateIndex, vixMap),
      },
      fx: Object.fromEntries(
        FX_INSTRUMENTS.map(inst => [
          inst.replace('_', '').toLowerCase(),
          alignSparse(dateIndex, fxMaps[inst] ?? new Map()),
        ])
      ),
    };

    DIVERS_CACHE.data = data;
    DIVERS_CACHE.fetchedAt = Date.now();
    console.log(`[divers] data ready: ${dateIndex.length} trading days`);
    res.json({ ok: true, cached: false, ...data });
  } catch (e) {
    console.error('[divers] fetch error:', e.stack ?? e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Liquidity Pulse — daily TGA + ON RRP flows vs NQ ──────────────────────────
// Exploratory diagnostic: tests whether the genuinely-daily components of
// "Net Liquidity" (Treasury General Account drawdowns + overnight reverse
// repo usage) line up with NQ price moves, distinct from the slow weekly/
// monthly Fed balance sheet read already used in the Macro Equity Bot.
const LIQ_PULSE_CACHE   = { data: null, fetchedAt: null };
const LIQ_PULSE_TTL_MS  = 6 * 60 * 60 * 1000; // 6h — underlying data is daily at best
const LIQ_PULSE_FROM    = '2019-01-01';

function pearsonCorr(a, b) {
  const xs = [], ys = [];
  for (let i = 0; i < a.length; i++) if (isFinite(a[i]) && isFinite(b[i])) { xs.push(a[i]); ys.push(b[i]); }
  const m = xs.length;
  if (m < 5) return NaN;
  const mx = xs.reduce((s, v) => s + v, 0) / m;
  const my = ys.reduce((s, v) => s + v, 0) / m;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < m; i++) { cov += (xs[i] - mx) * (ys[i] - my); vx += (xs[i] - mx) ** 2; vy += (ys[i] - my) ** 2; }
  return (vx > 0 && vy > 0) ? cov / Math.sqrt(vx * vy) : NaN;
}
function signHitRate(a, b, mask) {
  let hit = 0, total = 0;
  for (let i = 0; i < a.length; i++) {
    if (mask && !mask[i]) continue;
    if (!isFinite(a[i]) || !isFinite(b[i]) || a[i] === 0) continue;
    total++;
    if (Math.sign(a[i]) === Math.sign(b[i])) hit++;
  }
  return total >= 5 ? hit / total : NaN;
}

app.get('/api/liquidity-pulse/data', async (req, res) => {
  const fredKey = process.env.FRED_KEY || process.env.FRED_API_KEY;
  if (!fredKey) return res.status(400).json({ ok: false, error: 'FRED_KEY not set' });
  if (!process.env.OANDA_KEY) return res.status(400).json({ ok: false, error: 'OANDA_KEY not set' });

  const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : LIQ_PULSE_FROM;
  const isDefaultRange = fromDate === LIQ_PULSE_FROM;

  const age = LIQ_PULSE_CACHE.fetchedAt ? Date.now() - LIQ_PULSE_CACHE.fetchedAt : Infinity;
  if (isDefaultRange && LIQ_PULSE_CACHE.data && age < LIQ_PULSE_TTL_MS) {
    return res.json({ ok: true, cached: true, ...LIQ_PULSE_CACHE.data });
  }

  try {
    console.log(`[liq-pulse] fetching RRP (FRED), TGA (Treasury DTS), NQ (OANDA) from ${fromDate}…`);
    const [rrpMap, tgaMap, nqBars] = await Promise.all([
      fetchFredSeries('RRPONTSYD', fromDate, fredKey),
      fetchDtsTgaBalance(fromDate),
      fetchOandaD1Range('NAS100_USD', fromDate),
    ]);
    console.log(`[liq-pulse] RRP ${rrpMap.size} obs | TGA ${tgaMap.size} obs | NQ ${nqBars.length} bars`);

    const dates   = nqBars.map(b => b.date);
    const nqClose = nqBars.map(b => b.close);
    const n       = dates.length;

    const rrp = forwardFillAlign(dates, rrpMap);
    const tga = forwardFillAlign(dates, tgaMap);

    const dTga = new Array(n).fill(NaN);
    const dRrp = new Array(n).fill(NaN);
    const liqPulse  = new Array(n).fill(NaN); // -(ΔTGA + ΔRRP): rising TGA/RRP drains reserves
    const nqRet     = new Array(n).fill(NaN); // same-day NQ return
    const nqRetFwd  = new Array(n).fill(NaN); // next-day NQ return (tests lead, not just coincidence)
    const isSettlementDay = new Array(n).fill(false);

    for (let i = 0; i < n; i++) {
      const dow = new Date(dates[i] + 'T00:00:00Z').getUTCDay(); // 0=Sun..6=Sat
      isSettlementDay[i] = dow === 2 || dow === 4; // Tue/Thu — typical T-bill settlement days
      if (i > 0) {
        if (isFinite(tga[i]) && isFinite(tga[i - 1])) dTga[i] = tga[i] - tga[i - 1];
        if (isFinite(rrp[i]) && isFinite(rrp[i - 1])) dRrp[i] = rrp[i] - rrp[i - 1];
        if (isFinite(dTga[i]) && isFinite(dRrp[i])) liqPulse[i] = -(dTga[i] + dRrp[i]);
        nqRet[i] = (nqClose[i] - nqClose[i - 1]) / nqClose[i - 1] * 100;
      }
      if (i < n - 1) nqRetFwd[i] = (nqClose[i + 1] - nqClose[i]) / nqClose[i] * 100;
    }

    const notSettlement = isSettlementDay.map(v => !v);
    const stats = {
      n,
      corrSameDay:          pearsonCorr(liqPulse, nqRet),
      corrNextDay:          pearsonCorr(liqPulse, nqRetFwd),
      hitRateNextDay:       signHitRate(liqPulse, nqRetFwd),
      hitRateSettlement:    signHitRate(liqPulse, nqRetFwd, isSettlementDay),
      hitRateNonSettlement: signHitRate(liqPulse, nqRetFwd, notSettlement),
      settlementDayCount:   isSettlementDay.filter(Boolean).length,
    };

    const payload = { dates, nqClose, tga, rrp, dTga, dRrp, liqPulse, nqRet, nqRetFwd, isSettlementDay, stats };
    if (isDefaultRange) { LIQ_PULSE_CACHE.data = payload; LIQ_PULSE_CACHE.fetchedAt = Date.now(); }
    console.log(`[liq-pulse] ready: ${n} days, corrNextDay=${stats.corrNextDay?.toFixed(3)}, hitRateNextDay=${stats.hitRateNextDay?.toFixed(3)}`);
    res.json({ ok: true, cached: false, ...payload });
  } catch (e) {
    console.error('[liq-pulse] fetch error:', e.stack ?? e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Liquidity Gate — 2-gate macro signal (Net Liquidity regime + cross-asset
// coherence) backtestable across 6 index futures. Standalone system; ports
// the z-score/lag math from MacroEquityBot/fred_signal.py into JS since no
// JS implementation of that formula existed yet outside the Python bot.
const LIQUIDITY_GATE_FRED_IDS = { walcl: 'WALCL', wtregen: 'WTREGEN', rrpon: 'RRPONTSYD', curve: 'T10Y2Y', credit: 'BAMLH0A0HYM2' };
const LIQ_GATE_PUB_LAG_WEEKLY = 5;   // trading days — WALCL/WTREGEN/RRPON publication lag
const LIQ_GATE_Z_WINDOW       = 252;
const LIQ_GATE_MIN_Z_WINDOW   = 30;
const LIQ_GATE_FROM_DEFAULT   = '2015-01-01';

const LIQUIDITY_GATE_INSTRUMENTS = new Set(['NAS100_USD', 'SPX500_USD', 'US30_USD', 'US2000_USD', 'DE30_USD', 'UK100_GBP']);

// DE30_USD is the canonical key shared with oi_store/BETA_PAIRS, but OANDA only
// quotes the DAX CFD as DE30_EUR — same quirk as the _h4OandaSym ov map above.
function _liqGateOandaSym(instrument) {
  return instrument === 'DE30_USD' ? 'DE30_EUR' : instrument;
}

const LIQ_GATE_FRED_CACHE = { data: null, fetchedAt: null };
const LIQ_GATE_FRED_TTL_MS = 6 * 60 * 60 * 1000; // 6h — same cadence as liquidity-pulse, underlying data is daily at best

async function _getLiquidityGateFred(fromDate, fredKey) {
  const isDefaultRange = fromDate === LIQ_GATE_FROM_DEFAULT;
  const age = LIQ_GATE_FRED_CACHE.fetchedAt ? Date.now() - LIQ_GATE_FRED_CACHE.fetchedAt : Infinity;
  if (isDefaultRange && LIQ_GATE_FRED_CACHE.data && age < LIQ_GATE_FRED_TTL_MS) {
    return LIQ_GATE_FRED_CACHE.data;
  }
  const entries = Object.entries(LIQUIDITY_GATE_FRED_IDS);
  const maps = await Promise.all(entries.map(([, sid]) => fetchFredSeries(sid, fromDate, fredKey)));
  const fredRaw = {};
  entries.forEach(([key], i) => { fredRaw[key] = maps[i]; });
  if (isDefaultRange) { LIQ_GATE_FRED_CACHE.data = fredRaw; LIQ_GATE_FRED_CACHE.fetchedAt = Date.now(); }
  return fredRaw;
}

function _liqGatePctChange(values) {
  const out = new Array(values.length).fill(NaN);
  for (let i = 1; i < values.length; i++) {
    const p = values[i - 1], c = values[i];
    if (isFinite(p) && isFinite(c) && p !== 0) out[i] = (c - p) / Math.abs(p);
  }
  return out;
}
function _liqGateApplyLag(values, lag) {
  if (lag <= 0) return values.slice();
  const n = values.length;
  if (lag >= n) return new Array(n).fill(NaN);
  return new Array(lag).fill(NaN).concat(values.slice(0, n - lag));
}
function _liqGateRollingZ(values, window = LIQ_GATE_Z_WINDOW, minWindow = LIQ_GATE_MIN_Z_WINDOW) {
  const out = new Array(values.length).fill(NaN);
  for (let i = 0; i < values.length; i++) {
    if (!isFinite(values[i])) continue;
    const slice = [];
    for (let j = Math.max(0, i - window); j < i; j++) if (isFinite(values[j])) slice.push(values[j]);
    if (slice.length < minWindow) continue;
    const mu = slice.reduce((s, v) => s + v, 0) / slice.length;
    const sd = Math.sqrt(slice.reduce((s, v) => s + (v - mu) ** 2, 0) / slice.length);
    out[i] = sd > 0 ? (values[i] - mu) / sd : 0;
  }
  return out;
}

// Net liquidity = WALCL - WTREGEN - RRPON, %-change, 5-day publication lag, 252d rolling z.
function computeNetLiqZ(fredRaw, dates) {
  const walcl   = forwardFillAlign(dates, fredRaw.walcl   ?? new Map());
  const wtregen = forwardFillAlign(dates, fredRaw.wtregen ?? new Map());
  const rrpon   = forwardFillAlign(dates, fredRaw.rrpon   ?? new Map());
  const netliqRaw = dates.map((_, i) =>
    (isFinite(walcl[i]) && isFinite(wtregen[i]) && isFinite(rrpon[i])) ? walcl[i] - wtregen[i] - rrpon[i] : NaN
  );
  const pctCh  = _liqGatePctChange(netliqRaw);
  const lagged = _liqGateApplyLag(pctCh, LIQ_GATE_PUB_LAG_WEEKLY);
  return _liqGateRollingZ(lagged);
}

// Curve (T10Y2Y) and credit (BAMLH0A0HYM2, negated — tighter spread = bullish)
// z-scores; 0 lag since both are genuinely-daily EOD prints, unlike WALCL/TGA/RRP.
function computeCoherenceZ(fredRaw, dates) {
  const curve  = forwardFillAlign(dates, fredRaw.curve  ?? new Map());
  const credit = forwardFillAlign(dates, fredRaw.credit ?? new Map());
  const curveZ  = _liqGateRollingZ(curve);
  const creditZ = _liqGateRollingZ(credit.map(v => isFinite(v) ? -v : NaN));
  return { curveZ, creditZ };
}

function _liqGateStats(trades, curve, equity) {
  const n    = trades.length;
  const wins = trades.filter(t => t.tradeReturn > 0).length;
  const rets = trades.map(t => t.tradeReturn / 100);
  const mu   = rets.reduce((s, r) => s + r, 0) / (rets.length || 1);
  const sig  = Math.sqrt(rets.reduce((s, r) => s + (r - mu) ** 2, 0) / (rets.length || 1));
  const years = curve.length >= 2
    ? (new Date(curve[curve.length - 1].date) - new Date(curve[0].date)) / (365.25 * 864e5) : 1;
  const tpy     = n / Math.max(years, 1);
  const sharpe  = sig > 0 ? (mu / sig) * Math.sqrt(tpy) : 0;
  const downDev = Math.sqrt(rets.reduce((s, r) => s + Math.min(r, 0) ** 2, 0) / (n || 1));
  const sortino = downDev > 0 ? (mu / downDev) * Math.sqrt(tpy) : 0;
  const cagr    = (Math.pow(equity, 1 / Math.max(years, 0.01)) - 1) * 100;
  let peak = 1, maxDD = 0;
  for (const { equity: eq } of curve) {
    if (eq > peak) peak = eq;
    const dd = (peak - eq) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  return { n, wins, winRate: n ? wins / n : 0, cagr: +cagr.toFixed(2),
           sharpe: +sharpe.toFixed(2), sortino: +sortino.toFixed(2),
           maxDD: +(maxDD * 100).toFixed(2),
           totalReturn: +((equity - 1) * 100).toFixed(2) };
}

// Walks daily bars aligned to the FRED date axis. Gate status for day i is
// decided from day i-1's z-scores (the lag math above already encodes FRED
// publication lag — this extra day-shift additionally prevents using day i's
// own close to decide day i's own entry), then the trade executes at day i's
// NY-open price (bars[].open — see _liqGateBarsFromH1).
function _computeLiquidityGate(bars, fredRaw, cfg = {}) {
  const {
    netliqThreshold = 0.25,
    stopPct         = 3.0,
    riskPct         = 1.0,
    requireBoth     = true,
  } = cfg;

  const dates = bars.map(b => b.date);
  const netliqZ = computeNetLiqZ(fredRaw, dates);
  const { curveZ, creditZ } = computeCoherenceZ(fredRaw, dates);

  const gate1Series = new Array(dates.length).fill('NEUTRAL');
  const gate2Series = new Array(dates.length).fill(false);
  for (let i = 0; i < dates.length; i++) {
    const z = netliqZ[i];
    gate1Series[i] = !isFinite(z) ? 'NEUTRAL' : z > netliqThreshold ? 'LONG' : z < -netliqThreshold ? 'SHORT' : 'NEUTRAL';
    if (gate1Series[i] !== 'NEUTRAL' && isFinite(curveZ[i]) && isFinite(creditZ[i])) {
      const want = gate1Series[i] === 'LONG' ? 1 : -1;
      // creditZ is already negated in computeCoherenceZ (tighter spread = bullish),
      // so both curveZ and creditZ share the same "positive = bullish" sign convention here.
      const curveAgree  = Math.sign(curveZ[i])  === want;
      const creditAgree = Math.sign(creditZ[i]) === want;
      gate2Series[i] = requireBoth ? (curveAgree && creditAgree) : (curveAgree || creditAgree);
    }
  }

  const trades = [];
  const curve  = [];
  let equity = 1.0;
  let pos = null; // { direction, entry, entryIdx, entryDate }

  for (let i = 1; i < dates.length; i++) {
    const prevGate1 = gate1Series[i - 1];
    const prevGate2 = gate2Series[i - 1];
    const today = bars[i];
    const aligned = prevGate1 !== 'NEUTRAL' && prevGate2;

    if (pos) {
      const movedPct = pos.direction === 'LONG'
        ? (today.close - pos.entry) / pos.entry * 100
        : (pos.entry - today.close) / pos.entry * 100;
      const stopHit = movedPct <= -stopPct;
      const gateBreak = prevGate1 !== pos.direction || !prevGate2;

      if (stopHit) {
        const exit = today.close;
        const movePct = pos.direction === 'LONG' ? (exit - pos.entry) / pos.entry * 100 : (pos.entry - exit) / pos.entry * 100;
        const leverage = riskPct / stopPct;
        const tradeReturn = movePct * leverage;
        equity *= (1 + tradeReturn / 100);
        trades.push({ date: pos.entryDate, exitDate: today.date, direction: pos.direction,
                      entry: pos.entry, exit, exitReason: 'STOP',
                      movePct: +movePct.toFixed(3), tradeReturn: +tradeReturn.toFixed(3),
                      equity: +equity.toFixed(6) });
        curve.push({ date: today.date, equity: +equity.toFixed(6) });
        pos = null;
      } else if (gateBreak) {
        const exit = today.open;
        const movePct = pos.direction === 'LONG' ? (exit - pos.entry) / pos.entry * 100 : (pos.entry - exit) / pos.entry * 100;
        const leverage = riskPct / stopPct;
        const tradeReturn = movePct * leverage;
        equity *= (1 + tradeReturn / 100);
        trades.push({ date: pos.entryDate, exitDate: today.date, direction: pos.direction,
                      entry: pos.entry, exit, exitReason: 'GATE_FLIP',
                      movePct: +movePct.toFixed(3), tradeReturn: +tradeReturn.toFixed(3),
                      equity: +equity.toFixed(6) });
        curve.push({ date: today.date, equity: +equity.toFixed(6) });
        pos = null;
      }
    }

    if (!pos && aligned) {
      pos = { direction: prevGate1, entry: today.open, entryIdx: i, entryDate: today.date };
    }
  }

  // Diagnostics: netliqZ vs next-day return, per the liquidity-pulse pattern.
  const nextDayRet = new Array(dates.length).fill(NaN);
  for (let i = 0; i < dates.length - 1; i++) {
    if (bars[i].close) nextDayRet[i] = (bars[i + 1].close - bars[i].close) / bars[i].close * 100;
  }
  // WALCL/WTREGEN/RRP only update weekly, so netliqZ is a step function that
  // barely moves day to day — a 1-day-forward correlation mostly measures
  // "no new information" days against daily noise. A 5-trading-day-forward
  // return matches the signal's actual update cadence.
  const FWD_WEEKLY = 5;
  const weeklyFwdRet = new Array(dates.length).fill(NaN);
  for (let i = 0; i < dates.length - FWD_WEEKLY; i++) {
    if (bars[i].close) weeklyFwdRet[i] = (bars[i + FWD_WEEKLY].close - bars[i].close) / bars[i].close * 100;
  }
  const diagnostics = {
    corrNextDay:    pearsonCorr(netliqZ, nextDayRet),
    hitRateNextDay: signHitRate(netliqZ, nextDayRet),
    corrWeekly:     pearsonCorr(netliqZ, weeklyFwdRet),
    hitRateWeekly:  signHitRate(netliqZ, weeklyFwdRet),
  };

  const stats = _liqGateStats(trades, curve, equity);
  return { trades, curve, stats, diagnostics, gate1Series, gate2Series, dates, netliqZ, curveZ, creditZ };
}

const liqGateBarCache = new Map(); // instrument → { bars, fetchedAt }
const LIQ_GATE_BAR_TTL_MS = 23 * 60 * 60 * 1000;

// Builds one {date, open, close} bar per trading day from H1 candles, anchoring
// "open" to the NY-open hour (13:00 UTC EDT / 14:00 UTC EST — same bar NQ-QMR
// uses for its 09:25 ET entry) rather than OANDA's default D1 candle, whose
// "open" is actually the prior evening's 5pm-NY FX-day-rollover price. "close"
// is anchored the same way to the 5pm-NY hour (21:00 UTC EDT / 22:00 UTC EST)
// so each bar still spans one NY trading day, matching the old D1 semantics.
function _liqGateBarsFromH1(h1) {
  const byDate = new Map();
  for (const b of h1) {
    const d = b.t.substring(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(b);
  }
  const bars = [];
  for (const d of [...byDate.keys()].sort()) {
    const dayBars = byDate.get(d);
    const openBar  = dayBars.find(b => b.t.substring(11, 13) === '13')
                  || dayBars.find(b => b.t.substring(11, 13) === '14');
    const closeBar = dayBars.find(b => b.t.substring(11, 13) === '21')
                  || dayBars.find(b => b.t.substring(11, 13) === '22');
    if (!openBar || !closeBar) continue; // holiday/thin-liquidity day — skip
    bars.push({ date: d, open: openBar.o, close: closeBar.c });
  }
  return bars;
}

async function _getLiquidityGateBars(instrument, fromDate) {
  const cacheKey = `${instrument}:${fromDate}`;
  const cached = liqGateBarCache.get(cacheKey);
  if (cached?.bars?.length && cached.fetchedAt && Date.now() - cached.fetchedAt < LIQ_GATE_BAR_TTL_MS) {
    return cached.bars;
  }
  const oandaSym = _liqGateOandaSym(instrument);
  console.log(`[liquidity-gate] fetching OANDA H1 ${oandaSym} (${instrument}) from ${fromDate}…`);
  const h1 = await fetchOandaH1Range(oandaSym, fromDate);
  const bars = _liqGateBarsFromH1(h1);
  // Need LIQ_GATE_MIN_Z_WINDOW+1 day-bars just to produce one non-NaN rolling Z-score —
  // fewer than that "succeeds" with bars.length > 0 but netliqZ is NaN everywhere, which
  // silently looks like a clean zero-trade result instead of the data problem it is.
  if (bars.length < LIQ_GATE_MIN_Z_WINDOW + 1) {
    throw new Error(`Only ${bars.length} NY-open/close day-bars built for ${oandaSym} (got ${h1.length} raw `
      + `H1 candles) — need at least ${LIQ_GATE_MIN_Z_WINDOW + 1} for a single rolling Z-score. `
      + `OANDA may not serve this instrument on this account, or it lacks candles at the 13:00/14:00 or `
      + `21:00/22:00 UTC anchor hours the day-bar builder requires`);
  }
  liqGateBarCache.set(cacheKey, { bars, fetchedAt: Date.now() });
  return bars;
}

app.get('/api/liquidity-gate/backtest', async (req, res) => {
  const fredKey = process.env.FRED_KEY || process.env.FRED_API_KEY;
  if (!fredKey) return res.status(503).json({ ok: false, error: 'FRED_KEY not set' });
  if (!process.env.OANDA_KEY) return res.status(503).json({ ok: false, error: 'OANDA_KEY not set' });

  const instrument = LIQUIDITY_GATE_INSTRUMENTS.has(req.query.instrument) ? req.query.instrument : 'NAS100_USD';
  const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : LIQ_GATE_FROM_DEFAULT;

  const cfg = {
    netliqThreshold: req.query.netliqThreshold != null ? parseFloat(req.query.netliqThreshold) : 0.25,
    stopPct:         req.query.stopPct         != null ? parseFloat(req.query.stopPct)         : 3.0,
    riskPct:         req.query.riskPct         != null ? parseFloat(req.query.riskPct)         : 1.0,
    requireBoth:     req.query.requireBoth != null ? req.query.requireBoth === 'true' : true,
  };

  try {
    const [bars, fredRaw] = await Promise.all([
      _getLiquidityGateBars(instrument, fromDate),
      _getLiquidityGateFred(fromDate, fredKey),
    ]);
    console.log(`[liquidity-gate] ${bars.length} D1 bars (${instrument}) — running backtest`);
    const result = _computeLiquidityGate(bars, fredRaw, cfg);
    res.json({ ok: true, instrument, ...result });
  } catch (err) {
    console.error('[liquidity-gate]', err.stack ?? err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/liquidity-gate/sweep', async (req, res) => {
  const fredKey = process.env.FRED_KEY || process.env.FRED_API_KEY;
  if (!fredKey) return res.status(503).json({ ok: false, error: 'FRED_KEY not set' });
  if (!process.env.OANDA_KEY) return res.status(503).json({ ok: false, error: 'OANDA_KEY not set' });

  const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : LIQ_GATE_FROM_DEFAULT;
  const cfg = {
    netliqThreshold: req.query.netliqThreshold != null ? parseFloat(req.query.netliqThreshold) : 0.25,
    stopPct:         req.query.stopPct         != null ? parseFloat(req.query.stopPct)         : 3.0,
    riskPct:         req.query.riskPct         != null ? parseFloat(req.query.riskPct)         : 1.0,
    requireBoth:     req.query.requireBoth != null ? req.query.requireBoth === 'true' : true,
  };

  try {
    const fredRaw = await _getLiquidityGateFred(fromDate, fredKey);
    const instruments = [...LIQUIDITY_GATE_INSTRUMENTS];
    const results = await Promise.all(instruments.map(async instrument => {
      try {
        const bars = await _getLiquidityGateBars(instrument, fromDate);
        const { stats, diagnostics, curve } = _computeLiquidityGate(bars, fredRaw, cfg);
        return { instrument, ok: true, stats, diagnostics,
                 period: curve.length ? `${curve[0].date} → ${curve[curve.length - 1].date}` : null };
      } catch (err) {
        return { instrument, ok: false, error: err.message };
      }
    }));
    res.json({ ok: true, results });
  } catch (err) {
    console.error('[liquidity-gate sweep]', err.stack ?? err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/liquidity-gate/live', async (req, res) => {
  const fredKey = process.env.FRED_KEY || process.env.FRED_API_KEY;
  if (!fredKey) return res.status(503).json({ ok: false, error: 'FRED_KEY not set' });

  const netliqThreshold = req.query.netliqThreshold != null ? parseFloat(req.query.netliqThreshold) : 0.25;
  const requireBoth     = req.query.requireBoth != null ? req.query.requireBoth === 'true' : true;

  try {
    const fredRaw = await _getLiquidityGateFred(LIQ_GATE_FROM_DEFAULT, fredKey);
    const allDates = new Set();
    for (const m of Object.values(fredRaw)) for (const d of m.keys()) allDates.add(d);
    const dates = [...allDates].sort();
    if (!dates.length) throw new Error('No FRED data returned');

    const netliqZ = computeNetLiqZ(fredRaw, dates);
    const { curveZ, creditZ } = computeCoherenceZ(fredRaw, dates);

    const lastIdx = dates.length - 1;
    const z = netliqZ[lastIdx];
    const gate1 = !isFinite(z) ? 'NEUTRAL' : z > netliqThreshold ? 'LONG' : z < -netliqThreshold ? 'SHORT' : 'NEUTRAL';
    let gate2Pass = false;
    if (gate1 !== 'NEUTRAL' && isFinite(curveZ[lastIdx]) && isFinite(creditZ[lastIdx])) {
      const want = gate1 === 'LONG' ? 1 : -1;
      const curveAgree  = Math.sign(curveZ[lastIdx])  === want;
      const creditAgree = Math.sign(creditZ[lastIdx]) === want;
      gate2Pass = requireBoth ? (curveAgree && creditAgree) : (curveAgree || creditAgree);
    }

    const shared = {
      asOf: dates[lastIdx],
      gate1, gate2Pass,
      netliqZ: isFinite(z) ? +z.toFixed(3) : null,
      curveZ:  isFinite(curveZ[lastIdx])  ? +curveZ[lastIdx].toFixed(3)  : null,
      creditZ: isFinite(creditZ[lastIdx]) ? +creditZ[lastIdx].toFixed(3) : null,
      composite: gate1 === 'NEUTRAL' ? 'BLOCKED' : gate2Pass ? 'ALIGNED' : 'MIXED',
    };

    const instruments = {};
    for (const inst of LIQUIDITY_GATE_INSTRUMENTS) instruments[inst] = shared;
    res.json({ ok: true, asOf: dates[lastIdx], instruments });
  } catch (err) {
    console.error('[liquidity-gate live]', err.stack ?? err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// SSE live price stream — must be handled before the generic /api/* catch-all
// because it returns an infinite ReadableStream, not a text body.
app.get('/api/oanda_stream', async (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const request  = new Request(`http://localhost${req.originalUrl}`, { method: 'GET' });
  const response = await worker.fetch(request, cfEnv, {});
  if (!response.ok || !response.body) { res.end(); return; }

  const reader  = response.body.getReader();
  const cleanup = () => reader.cancel().catch(() => {});
  req.on('close', cleanup);
  req.on('error', cleanup);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.writableEnded) res.write(value);
    }
  } catch {}
  res.end();
});

// ── Vol & Range Forecast endpoints ────────────────────────────────────────────

// Latest session forecast — primary endpoint for bots and the dashboard page.
// Response shape:
//   { ok, session_date, session_label, computed_at,
//     instruments: { GOLD, EURUSD, NQ }, meta }
app.get('/api/vol-forecast', (_req, res) => {
  if (!forecastState.latest) {
    return res.status(202).json({ ok: false, status: 'computing', message: 'Forecast not yet available — check back in 60s.' });
  }
  res.json(forecastState.latest);
});

// History — last 5 computed sessions, newest first.
app.get('/api/vol-forecast/history', (_req, res) => {
  res.json({ ok: true, forecasts: forecastState.history });
});

// Force re-compute (admin / manual trigger).
app.post('/api/vol-forecast/refresh', async (_req, res) => {
  res.json({ ok: true, status: 'running', message: 'Recompute triggered — poll /api/vol-forecast in ~30s' });
  runVolForecast().catch(e => console.error('[VOL-FORECAST] Manual refresh error:', e.message));
});

// ── Text-format export helpers ────────────────────────────────────────────────
// Mirrors the client-side buildExportText() / buildSessionText() in vol-forecast.html

function _fmtForecastText(data) {
  const LW  = 29;
  const div = n => { const p = `──── ${n} `; return p + '─'.repeat(Math.max(0, LW - p.length)); };
  const lines = ['**VOL & RANGE FORECAST**', `**For session: ${data.session_label}**`];
  const newsMult = data.meta?.news_mult ?? 1;
  if (newsMult > 1) {
    lines.push(`News: ${data.meta?.news_flag ?? 'Event'} ×${newsMult.toFixed(2)} applied`);
  }
  lines.push('');
  for (const [name, f] of Object.entries(data.instruments ?? {})) {
    lines.push(
      div(name),
      `Volatility (annualized) : ${f.vol_annual.toFixed(2)}%`,
      `High to Low range       : ${f.hl_median.toFixed(2)}% median · ${f.hl_75.toFixed(2)}% 75th Percentile`,
      `Open to Close move      : ${f.oc_median.toFixed(2)}% median · ${f.oc_75.toFixed(2)}% 75th Percentile`,
      '',
    );
  }
  return lines.join('\n');
}

function _fmtSessionText(data) {
  const LW  = 29;
  const div = n => { const p = `──── ${n} `; return p + '─'.repeat(Math.max(0, LW - p.length)); };
  const p2  = x => (typeof x === 'number' ? x.toFixed(2) : '—');
  const p3  = x => (typeof x === 'number' ? x.toFixed(3) : '—');
  const fmtT = iso => iso
    ? new Date(iso).toUTCString().replace(/.*(\d\d:\d\d):\d\d GMT$/, '$1 UTC')
    : null;
  const remTxt = (rem, actual, fc75, reachedAt) => {
    const t = fmtT(reachedAt);
    if (actual >= fc75) return `75th reached${t ? ' ' + t : ''}`;
    if (rem <= 0)       return `reached${t ? ' ' + t : ''}`;
    return `${p2(rem)}% remaining`;
  };

  const lines = [
    '**VOL & RANGE FORECAST — LIVE SESSION STATUS**',
    `**Session: ${data.session_label}**`,
    `Fetched: ${new Date(data.fetched_at).toUTCString().replace(/:\d\d GMT$/, ' UTC')}`,
    '',
  ];

  for (const [name, s] of Object.entries(data.instruments ?? {})) {
    if (s.error) { lines.push(div(name), `Error: ${s.error}`, ''); continue; }
    const fc     = s.forecast;
    const t      = new Date(s.bar_time).toUTCString().replace(/.*(\d\d:\d\d):\d\d GMT$/, '$1 UTC');
    const closed = s.complete ? ' (session closed)' : '';
    const vsM    = s.hl_vs_med >= 0 ? `+${p2(s.hl_vs_med)}` : p2(s.hl_vs_med);
    const vsP    = s.hl_vs_75  >= 0 ? `+${p2(s.hl_vs_75)}`  : p2(s.hl_vs_75);
    const ocSign = s.oc >= 0 ? '+' : '';

    lines.push(
      div(name),
      `${name} Status — ${t}${closed}`,
      '',
      `H-L:  ${p2(s.hl)}%  (med ${p2(fc.hl_median)}%  |  75th ${p2(fc.hl_75)}%)`,
      `  vs median  ${vsM}%  |  vs 75th  ${vsP}%`,
      '',
      `O-C:  ${ocSign}${p2(s.oc)}%  (med ${p2(fc.oc_median)}%  |  75th ${p2(fc.oc_75)}%)  — ${remTxt(s.oc_rem, Math.abs(s.oc), fc.oc_75, s.oc_reached_at)}`,
      `O-H:  ${p2(s.oh)}%  (med ${p2(fc.oc_median)}%  |  75th ${p2(fc.oc_75)}%)  — ${remTxt(s.oh_rem, s.oh, fc.oc_75, s.oh_reached_at)}`,
      `O-L:  ${p2(s.ol)}%  (med ${p2(fc.oc_median)}%  |  75th ${p2(fc.oc_75)}%)  — ${remTxt(s.ol_rem, s.ol, fc.oc_75, s.ol_reached_at)}`,
      '',
      `Bias:  ${s.bias} — ${s.bias_detail}`,
      `  O-H ${p3(s.oh)}% / ${p3(fc.oc_median)}% forecast (${Math.round(s.oh_ratio)}%)  |  O-L ${p3(s.ol)}% / ${p3(fc.oc_median)}% forecast (${Math.round(s.ol_ratio)}%)`,
      '',
      `Directionality:  ${p2(s.dir)}%  (expected ~${p2(data.expected_dir)}%)`,
      `Shape:  ${s.shape}`,
      '',
      `Outlook:  ${s.outlook}`,
      '',
    );
  }
  return lines.join('\n');
}

// Plain-text forecast export — same format as the ⬇ Export button on the dashboard.
app.get('/api/vol-forecast/export', (_req, res) => {
  if (!forecastState.latest) {
    return res.status(202).type('text/plain').send('Forecast not yet available — check back in 60s.');
  }
  res.type('text/plain').send(_fmtForecastText(forecastState.latest));
});

// Confluence zones export — multi-layer technical levels per instrument.
// Clusters Fibonacci retracements (3/5/10-day swings), previous daily opens/H/L,
// weekly pivots, vol forecast absolute levels, and round numbers. Returns zones
// with 2+ distinct level types. Format: CZ {price} : {count} {type1},{type2},...
app.get('/api/vol-forecast/zones', (_req, res) => {
  if (!forecastState.latest) {
    return res.status(202).type('text/plain').send('Forecast not yet available — check back in 60s.');
  }
  if (!forecastState.ohlcCache || !Object.keys(forecastState.ohlcCache).length) {
    return res.status(202).type('text/plain').send('OHLC cache not yet populated — check back in 60s.');
  }
  try {
    const text = buildConfluenceZoneText(forecastState.ohlcCache, forecastState.latest);
    res.type('text/plain').send(text);
  } catch (e) {
    res.status(500).type('text/plain').send(`Zone computation error: ${e.message}`);
  }
});

// Live session status — intraday tracking (actual OHLC vs forecast).
// Fetches today's current/latest daily bar from Oanda and computes consumed
// range, directional bias, shape, and outlook per instrument.
app.get('/api/vol-forecast/live', async (_req, res) => {
  try {
    const status = await getSessionStatus();
    res.json(status);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Session alias used by vol-forecast-v2.html — live today or historical from KV.
app.get('/api/vol-forecast/session', async (req, res) => {
  const date = String(req.query.date ?? '');
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ ok: false, error: 'date must be YYYY-MM-DD' });
    try {
      const raw = await kv.get(`vol_session_${date}`);
      if (!raw) return res.status(404).json({ ok: false, error: `No session data for ${date}` });
      return res.json({ ok: true, date, ...JSON.parse(raw) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }
  try {
    const status = await getSessionStatus();
    res.json(status);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Session-stats aliases used by vol-forecast-v2.html.
app.get('/api/vol-forecast/session-stats', (_req, res) => {
  if (isSessionStatsComputing()) {
    return res.status(202).json({ ok: false, status: 'computing', message: 'Session stats computation in progress — poll again in 60s.' });
  }
  const data = getSessionStats();
  if (!data) return res.status(202).json({ ok: false, message: 'Session stats not yet computed — POST /api/vol-forecast/session-stats/compute to start.' });
  res.json(data);
});

app.post('/api/vol-forecast/session-stats/compute', (_req, res) => {
  if (isSessionStatsComputing()) {
    return res.json({ ok: false, message: 'Already computing — poll /api/vol-forecast/session-stats for result.' });
  }
  const years = parseInt(_req.query.years) || 5;
  res.json({ ok: true, message: `Computing session stats (${years}yr H1) — poll /api/vol-forecast/session-stats in ~3–5 min.` });
  computeSessionStats(years)
    .then(data => kv.put('session_stats', JSON.stringify(data)))
    .catch(e => console.error('[SESSION-STATS] Error:', e.message));
});

// Plain-text live session export — same format as the ⬇ Session button on the dashboard.
app.get('/api/vol-forecast/live/export', async (_req, res) => {
  try {
    const status = await getSessionStatus();
    if (!status?.ok) {
      return res.status(202).type('text/plain').send(status?.message ?? 'Live session data not available.');
    }
    res.type('text/plain').send(_fmtSessionText(status));
  } catch (e) {
    res.status(500).type('text/plain').send(`Error: ${e.message}`);
  }
});

// Archive index — list of all stored daily forecasts (compact, one read from KV).
// GET /api/vol-forecast/archive
app.get('/api/vol-forecast/archive', async (_req, res) => {
  try {
    const raw = await kv.get('vol_forecast_index');
    if (!raw) return res.json({ ok: true, entries: [] });
    res.json({ ok: true, entries: JSON.parse(raw) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Archive — retrieve a stored daily forecast from KV by date (path param).
// GET /api/vol-forecast/archive/:date  (date = YYYY-MM-DD)
app.get('/api/vol-forecast/archive/:date', async (req, res) => {
  try {
    const date = req.params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ ok: false, error: 'date must be YYYY-MM-DD' });
    const raw = await kv.get(`vol_forecast_${date}`);
    if (!raw) return res.status(404).json({ ok: false, error: `No forecast found for ${date}` });
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Historical forecast by date — query param version used by vol-forecast.html nav.
// GET /api/vol-forecast/by-date?date=YYYY-MM-DD
app.get('/api/vol-forecast/by-date', async (req, res) => {
  const date = String(req.query.date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ ok: false, error: 'Provide ?date=YYYY-MM-DD' });
  }
  try {
    const raw = await kv.get(`vol_forecast_${date}`);
    if (!raw) return res.status(404).json({ ok: false, error: `No forecast stored for ${date}` });
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Archive plain-text export — same format as the ⬇ Export button but for a past date.
// GET /api/vol-forecast/archive/:date/export
app.get('/api/vol-forecast/archive/:date/export', async (req, res) => {
  try {
    const date = req.params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).type('text/plain').send('date must be YYYY-MM-DD');
    const raw = await kv.get(`vol_forecast_${date}`);
    if (!raw) return res.status(404).type('text/plain').send(`No forecast found for ${date}`);
    res.type('text/plain').send(_fmtForecastText(JSON.parse(raw)));
  } catch (e) {
    res.status(500).type('text/plain').send(`Error: ${e.message}`);
  }
});

// Bulk archive export — returns every stored forecast as plain text in one response.
// GET /api/vol-forecast/archive/bulk-export
app.get('/api/vol-forecast/archive/bulk-export', async (_req, res) => {
  try {
    const raw = await kv.get('vol_forecast_index');
    if (!raw) return res.type('text/plain').send('No archive index found.');
    const index = JSON.parse(raw);
    const parts = [];
    for (const entry of index) {
      const dr = await kv.get(`vol_forecast_${entry.date}`).catch(() => null);
      if (!dr) continue;
      parts.push(`${'═'.repeat(60)}\n  ${entry.date}\n${'═'.repeat(60)}`);
      parts.push(_fmtForecastText(JSON.parse(dr)));
    }
    res.type('text/plain').send(parts.join('\n\n'));
  } catch (e) {
    res.status(500).type('text/plain').send(`Error: ${e.message}`);
  }
});


// Reference data store — save/retrieve the external reference forecast for a date.
// POST /api/vol-forecast/reference/:date  body: { text: "...raw paste..." }
app.post('/api/vol-forecast/reference/:date', async (req, res) => {
  try {
    const date = req.params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ ok: false, error: 'date must be YYYY-MM-DD' });
    const text = String(req.body?.text ?? '').trim();
    if (!text) return res.status(400).json({ ok: false, error: 'body.text required' });
    await kv.put(`vol_reference_${date}`, JSON.stringify({ date, text, saved_at: new Date().toISOString() }));
    // Add to reference index
    const idxRaw = await kv.get('vol_reference_index').catch(() => null);
    const idx = idxRaw ? JSON.parse(idxRaw) : [];
    if (!idx.find(e => e.date === date)) { idx.unshift({ date }); if (idx.length > 120) idx.pop(); }
    await kv.put('vol_reference_index', JSON.stringify(idx));
    res.json({ ok: true, date });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/vol-forecast/reference/:date
app.get('/api/vol-forecast/reference/:date', async (req, res) => {
  try {
    const date = req.params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ ok: false, error: 'date must be YYYY-MM-DD' });
    const raw = await kv.get(`vol_reference_${date}`);
    if (!raw) return res.status(404).json({ ok: false, error: `No reference data for ${date}` });
    res.json({ ok: true, ...JSON.parse(raw) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Parse plain-text forecast export (our format or reference) into { instrumentName: {vol,hl_med,hl_75,oc_med,oc_75} }
function _parseExportText(text) {
  const result = {};
  let cur = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const hdr = line.match(/^────\s+(\S+)\s+─/);
    if (hdr) { cur = hdr[1]; result[cur] = {}; continue; }
    if (!cur) continue;
    const vol = line.match(/Volatility.*?:\s*([\d.]+)%/);
    if (vol) { result[cur].vol = parseFloat(vol[1]); continue; }
    const hl = line.match(/High to Low.*?:\s*([\d.]+)%.*?([\d.]+)%/);
    if (hl) { result[cur].hl_med = parseFloat(hl[1]); result[cur].hl_75 = parseFloat(hl[2]); continue; }
    const oc = line.match(/Open to Close.*?:\s*([\d.]+)%.*?([\d.]+)%/);
    if (oc) { result[cur].oc_med = parseFloat(oc[1]); result[cur].oc_75 = parseFloat(oc[2]); }
  }
  return result;
}

// GET /api/vol-forecast/compare/:date  — our archived forecast vs saved reference side-by-side
// Includes GARCH and Yang-Zhang shadow columns so both estimators can be compared to reference.
app.get('/api/vol-forecast/compare/:date', async (req, res) => {
  try {
    const date = req.params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ ok: false, error: 'date must be YYYY-MM-DD' });

    const [ourRaw, refRaw] = await Promise.all([
      kv.get(`vol_forecast_${date}`).catch(() => null),
      kv.get(`vol_reference_${date}`).catch(() => null),
    ]);

    if (!ourRaw && !refRaw) return res.status(404).json({ ok: false, error: `No data found for ${date}` });

    const ourFc   = ourRaw ? JSON.parse(ourRaw) : null;
    const refData = refRaw ? JSON.parse(refRaw) : null;
    const refInst = refData ? _parseExportText(refData.text) : {};

    // Compute shadow estimators from cached OHLC bars (populated by runVolForecast).
    // All three use BM percentile constants — no empirical correction.
    const BM_P50 = 1.572, HN_P50 = 0.6745, TD = 252;
    const r2 = x => Math.round(x * 100) / 100;
    function _fromCache(name, seriesFn) {
      const bars = forecastState.ohlcCache?.[name];
      if (!bars?.length) return null;
      const s = seriesFn(bars);
      const sig = s.at(-1);
      if (sig == null) return null;
      const pct = sig * 100;
      return { vol: r2(pct * Math.sqrt(TD)), hl: r2(BM_P50 * pct), oc: r2(HN_P50 * pct) };
    }

    // Build per-instrument comparison rows
    const rows = [];
    const ourInst = ourFc?.instruments ?? {};
    const allNames = new Set([...Object.keys(ourInst), ...Object.keys(refInst)]);

    for (const name of allNames) {
      const o   = ourInst[name];
      const r   = refInst[name];
      const gap = (ours, refs) => (ours && refs) ? Math.round((refs / ours - 1) * 1000) / 10 : null;
      // Prefer stored shadow fields; fall back to live compute from ohlcCache.
      const yzCache     = (o?.yz_vol_annual     != null) ? null : _fromCache(name, yangZhangVolSeries);
      const hvCache     = (o?.hv_vol_annual     != null) ? null : _fromCache(name, hv20Series);
      const ewmaCache   = (o?.ewma_vol_annual   != null) ? null : _fromCache(name, ewmaVolSeries);
      // legacy_vol_annual is stored by the scheduler on each run; no on-demand fallback
      // (rsEwmaVolSeries / garch11VolSeries are internal to volForecast.js, not exported).
      const legacyCache = null;
      const yzVol     = o?.yz_vol_annual     ?? yzCache?.vol     ?? null;
      const yzHl      = o?.yz_hl_median      ?? yzCache?.hl      ?? null;
      const yzOc      = o?.yz_oc_median      ?? yzCache?.oc      ?? null;
      const hvVol     = o?.hv_vol_annual     ?? hvCache?.vol     ?? null;
      const hvHl      = o?.hv_hl_median      ?? hvCache?.hl      ?? null;
      const hvOc      = o?.hv_oc_median      ?? hvCache?.oc      ?? null;
      const ewmaVol   = o?.ewma_vol_annual   ?? ewmaCache?.vol   ?? null;
      const ewmaHl    = o?.ewma_hl_median    ?? ewmaCache?.hl    ?? null;
      const ewmaOc    = o?.ewma_oc_median    ?? ewmaCache?.oc    ?? null;
      const legacyVol = o?.legacy_vol_annual ?? legacyCache?.vol ?? null;
      const legacyHl  = o?.legacy_hl_median  ?? legacyCache?.hl  ?? null;
      const legacyOc  = o?.legacy_oc_median  ?? legacyCache?.oc  ?? null;
      rows.push({
        name,
        our: o ? {
          vol: o.vol_annual, hl_med: o.hl_median, hl_75: o.hl_75, oc_med: o.oc_median, oc_75: o.oc_75,
          yz_vol: yzVol,     yz_hl: yzHl,     yz_oc: yzOc,
          hv_vol: hvVol,     hv_hl: hvHl,     hv_oc: hvOc,
          ewma_vol: ewmaVol, ewma_hl: ewmaHl, ewma_oc: ewmaOc,
          legacy_vol: legacyVol, legacy_hl: legacyHl, legacy_oc: legacyOc,
        } : null,
        ref:  r ?? null,
        gaps: (o && r) ? {
          vol:    gap(o.vol_annual, r.vol),
          hl_med: gap(o.hl_median,  r.hl_med),
          hl_75:  gap(o.hl_75,      r.hl_75),
          oc_med: gap(o.oc_median,  r.oc_med),
          oc_75:  gap(o.oc_75,      r.oc_75),
          yz_vol:     yzVol     != null ? gap(yzVol,     r.vol)    : null,
          yz_hl:      yzHl      != null ? gap(yzHl,      r.hl_med) : null,
          yz_oc:      yzOc      != null ? gap(yzOc,      r.oc_med) : null,
          hv_vol:     hvVol     != null ? gap(hvVol,     r.vol)    : null,
          hv_hl:      hvHl      != null ? gap(hvHl,      r.hl_med) : null,
          hv_oc:      hvOc      != null ? gap(hvOc,      r.oc_med) : null,
          ewma_vol:   ewmaVol   != null ? gap(ewmaVol,   r.vol)    : null,
          ewma_hl:    ewmaHl    != null ? gap(ewmaHl,    r.hl_med) : null,
          ewma_oc:    ewmaOc    != null ? gap(ewmaOc,    r.oc_med) : null,
          legacy_vol: legacyVol != null ? gap(legacyVol, r.vol)    : null,
          legacy_hl:  legacyHl  != null ? gap(legacyHl,  r.hl_med) : null,
          legacy_oc:  legacyOc  != null ? gap(legacyOc,  r.oc_med) : null,
        } : null,
      });
    }

    res.json({
      ok: true, date,
      our_label: ourFc?.session_label ?? date,
      ref_saved_at: refData?.saved_at ?? null,
      rows,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Session audit — retrieve a saved end-of-day session snapshot from KV.
// GET /api/vol-forecast/audit/:date  (date = YYYY-MM-DD, defaults to today)
app.get('/api/vol-forecast/audit/:date?', async (req, res) => {
  try {
    const date = req.params.date ?? new Date().toISOString().split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ ok: false, error: 'date must be YYYY-MM-DD' });
    const raw = await kv.get(`vol_session_${date}`);
    if (!raw) return res.status(404).json({ ok: false, error: `No session audit found for ${date}` });
    res.json({ ok: true, date, ...JSON.parse(raw) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

function _fmtExtendedText(data) {
  const LW  = 29;
  const div = n => { const p = `──── ${n} `; return p + '─'.repeat(Math.max(0, LW - p.length)); };
  const f2  = v => (v != null ? v.toFixed(2) : '—');
  const lines = ['**VOL & RANGE FORECAST — EXTENDED**', `**For session: ${data.session_label}**`, ''];
  for (const [name, f] of Object.entries(data.instruments ?? {})) {
    const pct = f.vol_pct != null ? `  [${f.vol_pct}th percentile]` : '';
    lines.push(
      div(name),
      `Volatility (annualized) : ${f.vol_annual.toFixed(2)}%${pct}`,
      '',
      `High to Low range       : ${f2(f.hl_median)}% median · ${f2(f.hl_75)}% 75th`,
      `Open to Close move      : ${f2(f.oc_median)}% median · ${f2(f.oc_75)}% 75th`,
      `Open to High (up leg)   : ${f2(f.oh_median)}% median · ${f2(f.oh_75)}% 75th`,
      `Open to Low  (down leg) : ${f2(f.ol_median)}% median · ${f2(f.ol_75)}% 75th`,
      `5-Day  H-L (week)       : ${f2(f.hl_5d)}% median`,
      `5-Day  O-C (week)       : ${f2(f.oc_5d)}% median`,
      `20-Day H-L (month)      : ${f2(f.hl_20d)}% median`,
      `20-Day O-C (month)      : ${f2(f.oc_20d)}% median`,
      '',
    );
  }
  return lines.join('\n');
}

// Extended forecast export — vol percentile, O-H/O-L legs, weekly and monthly ranges.
app.get('/api/vol-forecast/extended/export', (_req, res) => {
  if (!forecastState.latest) {
    return res.status(202).type('text/plain').send('Forecast not yet available — check back in 60s.');
  }
  res.type('text/plain').send(_fmtExtendedText(forecastState.latest));
});

// ── Weekly Range Tracker API ──────────────────────────────────────────────────
// Week-to-date range consumption vs 5-day forecast + directional bias from HMM.
// Mirrors the daily live session tracker but at the weekly timeframe.

const WEEKLY_INSTRUMENTS = [
  { name: 'GOLD',   sym: 'XAU_USD',    hmmKey: 'XAU/USD'  },
  { name: 'NQ',     sym: 'NAS100_USD', hmmKey: null        },
  { name: 'SPX500', sym: 'SPX500_USD', hmmKey: null        },
  { name: 'DE30',   sym: 'DE30_EUR',   hmmKey: null        },
  { name: 'UK100',  sym: 'UK100_GBP',  hmmKey: null        },
  { name: 'US30',   sym: 'US30_USD',   hmmKey: null        },
  { name: 'US2000', sym: 'US2000_USD', hmmKey: null        },
  { name: 'EURUSD', sym: 'EUR_USD',    hmmKey: 'EUR/USD'  },
  { name: 'GBPUSD', sym: 'GBP_USD',    hmmKey: 'GBP/USD'  },
  { name: 'USDJPY', sym: 'USD_JPY',    hmmKey: 'USD/JPY'  },
  { name: 'AUDUSD', sym: 'AUD_USD',    hmmKey: 'AUD/USD'  },
  { name: 'NZDUSD', sym: 'NZD_USD',    hmmKey: 'NZD/USD'  },
  { name: 'USDCAD', sym: 'USD_CAD',    hmmKey: 'USD/CAD'  },
  { name: 'USDCHF', sym: 'USD_CHF',    hmmKey: 'USD/CHF'  },
  { name: 'GBPJPY', sym: 'GBP_JPY',    hmmKey: 'GBP/JPY'  },
  { name: 'EURGBP', sym: 'EUR_GBP',    hmmKey: null        },
  { name: 'EURJPY', sym: 'EUR_JPY',    hmmKey: null        },
  { name: 'EURCHF', sym: 'EUR_CHF',    hmmKey: null        },
  { name: 'GBPCHF', sym: 'GBP_CHF',    hmmKey: null        },
  { name: 'AUDJPY', sym: 'AUD_JPY',    hmmKey: null        },
  { name: 'CADJPY', sym: 'CAD_JPY',    hmmKey: null        },
  { name: 'EURCAD', sym: 'EUR_CAD',    hmmKey: null        },
  { name: 'EURAUD', sym: 'EUR_AUD',    hmmKey: null        },
  { name: 'EURNZD', sym: 'EUR_NZD',    hmmKey: null        },
  { name: 'AUDNZD', sym: 'AUD_NZD',    hmmKey: null        },
  { name: 'AUDCAD', sym: 'AUD_CAD',    hmmKey: null        },
  { name: 'AUDCHF', sym: 'AUD_CHF',    hmmKey: null        },
  { name: 'GBPCAD', sym: 'GBP_CAD',    hmmKey: null        },
  { name: 'GBPAUD', sym: 'GBP_AUD',    hmmKey: null        },
  { name: 'GBPNZD', sym: 'GBP_NZD',    hmmKey: null        },
  { name: 'CHFJPY', sym: 'CHF_JPY',    hmmKey: null        },
  { name: 'NZDJPY', sym: 'NZD_JPY',    hmmKey: null        },
];

// Instruments that have HMM regime data (keyed by state.hmmRegimes format)
const BRIEF_HMM_KEYS = {
  GOLD:   'XAU/USD',  NQ: null,
  EURUSD: 'EUR/USD',  GBPUSD: 'GBP/USD',  USDJPY: 'USD/JPY',
  AUDUSD: 'AUD/USD',  NZDUSD: 'NZD/USD',  USDCAD: 'USD/CAD',
  USDCHF: 'USD/CHF',  GBPJPY: 'GBP/JPY',
};

function _oandaBaseW() {
  return (process.env.OANDA_ENV || 'live') === 'practice'
    ? 'https://api-fxpractice.oanda.com'
    : 'https://api-fxtrade.oanda.com';
}

async function _fetchWTDBar(oandaSymbol) {
  // Monday of the current week at 00:00 UTC
  const now = new Date();
  const dow = now.getUTCDay(); // 0=Sun
  const daysBack = dow === 0 ? 6 : dow - 1;
  const monday = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack,
  ));
  const url = `${_oandaBaseW()}/v3/instruments/${encodeURIComponent(oandaSymbol)}/candles`
            + `?granularity=D&from=${encodeURIComponent(monday.toISOString())}&price=M`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Oanda ${res.status}`);
  const candles = ((await res.json()).candles ?? []).filter(c => c.mid);
  if (!candles.length) throw new Error('No WTD bars');
  const open  = parseFloat(candles[0].mid.o);
  const high  = Math.max(...candles.map(c => parseFloat(c.mid.h)));
  const low   = Math.min(...candles.map(c => parseFloat(c.mid.l)));
  const close = parseFloat(candles.at(-1).mid.c);
  return { open, high, low, close, days: candles.length };
}

function _weeklyBias(wtdOCPct, hlConsumedPct, hmmData, hmm5mData) {
  const momentumDir = wtdOCPct > 0.05 ? 'Bullish' : wtdOCPct < -0.05 ? 'Bearish' : 'Flat';
  const hmmDir   = hmmData?.regime   === 'BULL' ? 'Bullish' : hmmData?.regime   === 'BEAR' ? 'Bearish' : null;
  const hmm5mDir = hmm5mData?.regime === 'BULL' ? 'Bullish' : hmm5mData?.regime === 'BEAR' ? 'Bearish' : null;
  const extended = hlConsumedPct != null && hlConsumedPct > 75;

  const signals  = [momentumDir, hmmDir, hmm5mDir].filter(Boolean);
  const bulls    = signals.filter(d => d === 'Bullish').length;
  const bears    = signals.filter(d => d === 'Bearish').length;

  let bias, confidence;
  if (bulls > bears)        { bias = 'Bullish'; confidence = bulls >= 2 ? 'High' : 'Low'; }
  else if (bears > bulls)   { bias = 'Bearish'; confidence = bears >= 2 ? 'High' : 'Low'; }
  else                      { bias = 'Neutral';  confidence = 'Low'; }

  const consumed = hlConsumedPct != null ? `${Math.round(hlConsumedPct)}% of weekly range consumed` : '';
  const extNote  = extended ? ' — extended, watch for mean reversion' : '';

  return {
    bias, confidence,
    note: `${consumed}${extNote}`,
    hmm_regime:   hmmData?.regime   ?? null,
    hmm5m_regime: hmm5mData?.regime ?? null,
    wtd_dir:      momentumDir,
    extended,
    signals: { wtd_momentum: momentumDir, hmm_daily: hmmDir, hmm_5m: hmm5mDir },
  };
}

let _weeklyCache   = null;
let _weeklyCacheAt = 0;
const WEEKLY_TTL_MS = 15 * 60 * 1000;

async function _getWeeklyStatus() {
  if (_weeklyCache && (Date.now() - _weeklyCacheAt) < WEEKLY_TTL_MS) return _weeklyCache;
  if (!forecastState.latest) return { ok: false, message: 'Forecast not yet computed' };
  if (!process.env.OANDA_KEY) return { ok: false, message: 'Oanda API key required' };

  const fc = forecastState.latest;
  const r2 = x => Math.round(x * 100) / 100;
  const instruments = {};

  // Detect weekend / post-Friday-close preview mode.
  // After the Friday 22:00 UTC forecast run the new week's forecast is ready but
  // markets haven't opened yet — show the upcoming Monday's ranges instead of the
  // completed week's consumption stats.
  const now = new Date();
  const dow = now.getUTCDay();
  const TARGET = parseInt(process.env.VOL_FORECAST_UTC ?? '22');
  const isPreWeek = dow === 6 || dow === 0 || (dow === 5 && now.getUTCHours() >= TARGET);

  // Fetch in batches of 5 to avoid Oanda rate-limiting
  const BATCH = 5;
  for (let i = 0; i < WEEKLY_INSTRUMENTS.length; i += BATCH) {
    await Promise.all(WEEKLY_INSTRUMENTS.slice(i, i + BATCH).map(async cfg => {
      try {
        const f = fc.instruments[cfg.name];
        if (!f) return;

        let wtdHLPct, wtdOCPct, wtdDays, hlConsumedPct, hlRemainingPct;

        if (isPreWeek) {
          // Week hasn't opened yet — no consumption data; bias from HMM only
          wtdHLPct = 0; wtdOCPct = 0; wtdDays = 0;
          hlConsumedPct = null; hlRemainingPct = null;
        } else {
          const wtd = await _fetchWTDBar(cfg.sym);
          wtdHLPct = r2((wtd.high - wtd.low) / wtd.open * 100);
          wtdOCPct = r2((wtd.close - wtd.open) / wtd.open * 100);
          wtdDays  = wtd.days;
          hlConsumedPct  = f.hl_5d > 0 ? Math.round(wtdHLPct / f.hl_5d * 100) : null;
          hlRemainingPct = f.hl_5d > 0 ? r2(Math.max(f.hl_5d - wtdHLPct, 0)) : null;
        }

        const hmmData   = cfg.hmmKey ? (state.hmmRegimes[cfg.hmmKey]   ?? null) : null;
        const hmm5mData = cfg.hmmKey ? (state.hmm5mRegimes[cfg.hmmKey] ?? null) : null;

        instruments[cfg.name] = {
          wtd_hl_pct:       wtdHLPct,
          wtd_oc_pct:       wtdOCPct,
          wtd_days:         wtdDays,
          hl_5d:            f.hl_5d,
          hl_5d_75:         f.hl_5d_75  ?? r2(f.hl_75  * Math.sqrt(5)),
          oc_5d:            f.oc_5d,
          oc_5d_75:         f.oc_5d_75  ?? r2(f.oc_75  * Math.sqrt(5)),
          hl_20d:           f.hl_20d,
          hl_20d_75:        f.hl_20d_75 ?? r2(f.hl_75  * Math.sqrt(20)),
          oc_20d:           f.oc_20d,
          oc_20d_75:        f.oc_20d_75 ?? r2(f.oc_75  * Math.sqrt(20)),
          hl_consumed_pct:  hlConsumedPct,
          hl_remaining_pct: hlRemainingPct,
          vol_annual:       f.vol_annual,
          vol_pct:          f.vol_pct,
          ...(_weeklyBias(wtdOCPct, hlConsumedPct, hmmData, hmm5mData)),
        };
      } catch (err) {
        instruments[cfg.name] = { error: err.message };
      }
    }));
    if (i + BATCH < WEEKLY_INSTRUMENTS.length) await new Promise(r => setTimeout(r, 120));
  }

  // Week label: upcoming Monday when pre-week, current week's Monday otherwise
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  let monday;
  if (isPreWeek) {
    monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    while (monday.getUTCDay() !== 1) monday.setUTCDate(monday.getUTCDate() + 1);
  } else {
    const daysBack = dow === 0 ? 6 : dow - 1;
    monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack));
  }
  const weekLabel = `Week of ${monthNames[monday.getUTCMonth()]} ${monday.getUTCDate()}, ${monday.getUTCFullYear()}`;

  const result = {
    ok: true,
    computed_at:   new Date().toISOString(),
    session_label: fc.session_label,
    week_label:    weekLabel,
    is_preview:    isPreWeek,
    instruments,
  };
  _weeklyCache   = result;
  _weeklyCacheAt = Date.now();
  return result;
}

function _fmtWeeklyText(data) {
  const LW  = 29;
  const div = n => { const p = `──── ${n} `; return p + '─'.repeat(Math.max(0, LW - p.length)); };
  const f2  = x => (x != null ? x.toFixed(2) : '—');
  const sign = x => (x != null ? (x >= 0 ? '+' : '') + x.toFixed(2) : '—');
  const rrow = (lbl, med, p75) =>
    `${lbl.padEnd(24)}: ${f2(med)}% median · ${f2(p75)}% 75th Percentile`;

  const lines = [
    '**VOL & RANGE FORECAST — WEEKLY**',
    data.is_preview ? `**${data.week_label}  — FORECAST PREVIEW**` : `**${data.week_label}**`,
    '',
  ];

  for (const [name, w] of Object.entries(data.instruments ?? {})) {
    lines.push(div(name));
    if (w.error) { lines.push(`Error: ${w.error}`, ''); continue; }

    lines.push(`Bias                : ${w.bias}  [${w.confidence} confidence]`);
    if (w.hmm_regime || w.hmm5m_regime) {
      const parts = [];
      if (w.hmm_regime)   parts.push(`${w.hmm_regime} (daily HMM)`);
      if (w.hmm5m_regime) parts.push(`${w.hmm5m_regime} (5m HMM)`);
      lines.push(`Regime signals      : ${parts.join(' · ')}`);
    }
    if (data.is_preview) {
      lines.push(`Status              : Forecast preview — week opens Monday`);
    } else {
      lines.push(`WTD momentum        : ${w.wtd_dir}  (${sign(w.wtd_oc_pct)}% open→close)`);
      if (w.hl_consumed_pct != null) {
        lines.push(`Range consumed      : ${w.hl_consumed_pct}%  (${f2(w.wtd_hl_pct)}% of ${f2(w.hl_5d)}% budget)`);
        lines.push(`Remaining budget    : ${f2(w.hl_remaining_pct)}%  (${w.wtd_days} day${w.wtd_days !== 1 ? 's' : ''} in)`);
      }
    }
    lines.push('');
    lines.push('── 5-Day (Weekly)');
    lines.push(rrow('High to Low range', w.hl_5d, w.hl_5d_75));
    lines.push(rrow('Open to Close move', w.oc_5d, w.oc_5d_75));
    lines.push('');
    lines.push('── 20-Day (Monthly)');
    lines.push(rrow('High to Low range', w.hl_20d, w.hl_20d_75));
    lines.push(rrow('Open to Close move', w.oc_20d, w.oc_20d_75));
    lines.push('');
    lines.push(`Volatility (ann)    : ${f2(w.vol_annual)}%  [${w.vol_pct ?? '—'}th pct]`);
    if (w.note) lines.push(`Note                : ${w.note}`);
    lines.push('');
  }
  return lines.join('\n');
}

app.get('/api/vol-forecast/weekly', async (_req, res) => {
  try {
    res.json(await _getWeeklyStatus());
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/vol-forecast/weekly/export', async (_req, res) => {
  try {
    const data = await _getWeeklyStatus();
    if (!data.ok) return res.status(202).type('text/plain').send(data.message ?? 'Not available');
    res.type('text/plain').send(_fmtWeeklyText(data));
  } catch (e) {
    res.status(500).type('text/plain').send(`Error: ${e.message}`);
  }
});

// ── Levels hit history ────────────────────────────────────────────────────────
// Reads stored session audits and computes per-instrument, per-level hit rates
// and median reach times. Used by the strategy model / levels history panel.
// GET /api/vol-forecast/levels-history?days=90
app.get('/api/vol-forecast/levels-history', async (req, res) => {
  try {
    const days   = Math.min(365, Math.max(7, parseInt(req.query.days ?? 90)));
    const idxRaw = await kv.get('vol_forecast_index');
    if (!idxRaw) return res.json({ ok: true, sessions: 0, instruments: {} });

    const idx    = JSON.parse(idxRaw).slice(0, days);
    const audits = await Promise.all(
      idx.map(e => kv.get(`vol_session_${e.date}`)
        .then(r => r ? { date: e.date, d: JSON.parse(r) } : null)
        .catch(() => null))
    );
    const valid = audits.filter(Boolean);

    const LEVELS = [
      { key: 'hl_med',  label: 'H-L Median',   hitKey: '_hl_med_hit',  timeKey: 'hl_med_reached_at' },
      { key: 'hl_75',   label: 'H-L 75th',     hitKey: '_hl_75_hit',   timeKey: 'hl_75_reached_at' },
      { key: 'oh_med',  label: 'O-H Median',   hitKey: '_oh_med_hit',  timeKey: 'oh_reached_at' },
      { key: 'oh_75',   label: 'O-H 75th',     hitKey: '_oh_75_hit',   timeKey: 'oh_75_reached_at' },
      { key: 'ol_med',  label: 'O-L Median',   hitKey: '_ol_med_hit',  timeKey: 'ol_reached_at' },
      { key: 'ol_75',   label: 'O-L 75th',     hitKey: '_ol_75_hit',   timeKey: 'ol_75_reached_at' },
      { key: 'oc_med',  label: 'O-C Median',   hitKey: '_oc_med_hit',  timeKey: 'oc_reached_at' },
      { key: 'oc_75',   label: 'O-C 75th',     hitKey: '_oc_75_hit',   timeKey: 'oc_75_reached_at' },
    ];

    const stats = {};

    for (const { date, d } of valid) {
      for (const [name, s] of Object.entries(d.instruments ?? {})) {
        if (!stats[name]) {
          stats[name] = {};
          for (const lv of LEVELS) stats[name][lv.key] = { hits: 0, times: [], total: 0 };
        }
        const fc = s.forecast ?? {};
        for (const lv of LEVELS) {
          stats[name][lv.key].total++;
          // Determine hit from available fields (old audits may lack timestamp but have vs fields)
          let hit = false, timeVal = s[lv.timeKey] ?? null;
          if      (lv.key === 'hl_med') hit = (s.hl_vs_med != null ? s.hl_vs_med >= 0 : !!timeVal);
          else if (lv.key === 'hl_75')  hit = (s.hl_vs_75  != null ? s.hl_vs_75  >= 0 : !!timeVal);
          else                          hit = !!timeVal;

          if (hit) {
            stats[name][lv.key].hits++;
            if (timeVal) {
              const hour = new Date(timeVal).getUTCHours() + new Date(timeVal).getUTCMinutes() / 60;
              stats[name][lv.key].times.push({ hour, time: timeVal });
            }
          }
        }
      }
    }

    // Summarise: hit_rate, median_hour, earliest_hour, latest_hour
    const result = {};
    for (const [name, lvMap] of Object.entries(stats)) {
      result[name] = {};
      for (const lv of LEVELS) {
        const d = lvMap[lv.key];
        const times = d.times.map(t => t.hour).sort((a, b) => a - b);
        const medHour = times.length
          ? times[Math.floor(times.length / 2)]
          : null;
        result[name][lv.key] = {
          label:        lv.label,
          hit_rate:     d.total > 0 ? Math.round(d.hits / d.total * 100) : 0,
          hits:         d.hits,
          total:        d.total,
          median_hour:  medHour != null ? Math.round(medHour * 10) / 10 : null,
          earliest_hour: times.length ? Math.round(times[0] * 10) / 10 : null,
          latest_hour:  times.length ? Math.round(times.at(-1) * 10) / 10 : null,
          sample_times: d.times.slice(-5).map(t => t.time),  // last 5 raw timestamps
        };
      }
    }

    res.json({ ok: true, sessions: valid.length, days_requested: days, instruments: result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Intraday vol profile ──────────────────────────────────────────────────────
// Extracts per-instrument hourly profile from the session-stats payload.
// Requires session stats to have been computed (includes hourly key from the
// updated _computeStats() in sessionStats.js).
app.get('/api/vol-forecast/intraday-profile', (_req, res) => {
  const ss = getSessionStats();
  if (!ss) return res.status(404).json({ ok: false, error: 'Session stats not yet computed — run ⟳ Session Stats first' });
  const profile = {};
  for (const [name, stats] of Object.entries(ss.instruments ?? {})) {
    if (stats?.hourly) profile[name] = stats.hourly;
  }
  if (!Object.keys(profile).length) return res.status(404).json({ ok: false, error: 'No hourly data — recompute session stats to generate hourly profile' });
  res.json({ ok: true, computed_at: ss.computed_at, instruments: profile });
});

// ── Event vol impact study ────────────────────────────────────────────────────
// Correlates historical session audits (KV: vol_session_YYYY-MM-DD) with the
// Finnhub economic calendar to compute per-event-type, per-instrument range
// expansion ratios.  Stores result in KV as event_vol_impact.
// GET  /api/vol-forecast/event-impact         — return stored study
// POST /api/vol-forecast/event-impact/refresh — trigger recompute (async)

const EVENT_PATTERNS = [
  { label: 'FOMC',  re: /fomc|federal\s+open|fed\s+rate|interest\s+rate.*fed/i },
  { label: 'NFP',   re: /non.?farm|nonfarm|payroll/i },
  { label: 'CPI',   re: /\bcpi\b|consumer\s+price\s+index/i },
  { label: 'PCE',   re: /\bpce\b|personal\s+consumption\s+expend/i },
  { label: 'GDP',   re: /\bgdp\b|gross\s+domestic/i },
  { label: 'PPI',   re: /\bppi\b|producer\s+price/i },
];

async function _computeEventImpact() {
  const key = process.env.FINNHUB_KEY;
  if (!key) throw new Error('FINNHUB_KEY not set');

  // Fetch Finnhub calendar for the past 18 months
  const to   = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 548 * 864e5).toISOString().slice(0, 10);
  const calUrl = `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${key}`;
  const calRes  = await fetch(calUrl);
  if (!calRes.ok) throw new Error(`Finnhub calendar ${calRes.status}`);
  const calData = await calRes.json();
  const events  = (calData.economicCalendar ?? []).filter(e =>
    e.country === 'US' && e.impact?.toLowerCase() === 'high'
  );

  // Build a map: date → [event_label, ...]
  const eventsByDate = new Map();
  for (const e of events) {
    const d = (e.time ?? e.date ?? '').slice(0, 10);
    if (!d) continue;
    for (const pat of EVENT_PATTERNS) {
      if (pat.re.test(e.event ?? '')) {
        if (!eventsByDate.has(d)) eventsByDate.set(d, new Set());
        eventsByDate.get(d).add(pat.label);
      }
    }
  }

  // Gather session audits from KV that overlap with event dates
  const eventDates = [...eventsByDate.keys()];
  const audits = await Promise.all(
    eventDates.map(d => kv.get(`vol_session_${d}`).then(r => r ? { date: d, data: JSON.parse(r) } : null).catch(() => null))
  );

  // Per event type, per instrument: collect expansion ratios
  // expansion = actual H-L / forecast hl_median
  const buckets = {};   // { 'FOMC': { 'EURUSD': [ratio, ...], ... }, ... }
  for (const audit of audits.filter(Boolean)) {
    const labels = [...(eventsByDate.get(audit.date) ?? [])];
    for (const label of labels) {
      if (!buckets[label]) buckets[label] = {};
      for (const [name, s] of Object.entries(audit.data.instruments ?? {})) {
        if (!s.hl || !s.forecast?.hl_median) continue;
        if (!buckets[label][name]) buckets[label][name] = [];
        buckets[label][name].push(s.hl / s.forecast.hl_median);
      }
    }
  }

  // Summarise: mean ratio and n per cell
  const summary = {};
  for (const [label, instMap] of Object.entries(buckets)) {
    summary[label] = {};
    for (const [name, ratios] of Object.entries(instMap)) {
      const mean = ratios.reduce((s, v) => s + v, 0) / ratios.length;
      summary[label][name] = { mean: Math.round(mean * 100) / 100, n: ratios.length };
    }
  }

  const result = { ok: true, from, to, computed_at: new Date().toISOString(), summary, event_dates_found: eventDates.length, audits_matched: audits.filter(Boolean).length };
  await kv.put('event_vol_impact', JSON.stringify(result));
  return result;
}

app.get('/api/vol-forecast/event-impact', async (_req, res) => {
  try {
    const raw = await kv.get('event_vol_impact');
    if (!raw) return res.json({ ok: false, error: 'Not yet computed — click Refresh in the Event Impact panel' });
    res.json(JSON.parse(raw));
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/vol-forecast/event-impact/refresh', async (_req, res) => {
  if (!process.env.FINNHUB_KEY) {
    return res.status(400).json({ ok: false, error: 'FINNHUB_KEY not set in environment variables — add it in Railway → Variables.' });
  }
  res.json({ ok: true, message: 'Computing event impact study — takes ~10–15s' });
  _computeEventImpact()
    .then(r => console.log(`[EVENT-IMPACT] Done — ${r.audits_matched} audits matched, ${r.event_dates_found} event dates found`))
    .catch(e => console.error('[EVENT-IMPACT] Error:', e.message));
});

// ── Price Level Hit Rates API ─────────────────────────────────────────────────
// Computes historically what % of days each forecast level is actually touched,
// and what UTC time it's typically first reached.
// GET  /api/vol-forecast/hit-rates               — return stored results
// POST /api/vol-forecast/hit-rates/compute?days= — trigger backfill (takes ~5-10 min)

app.get('/api/vol-forecast/hit-rates', async (_req, res) => {
  try {
    if (isHitRatesComputing()) return res.status(202).json({ ok: false, status: 'computing', message: 'Computation in progress — check back in a few minutes.' });
    const raw = await kv.get('vol_hit_rates');
    if (!raw) return res.status(404).json({ ok: false, error: 'Not yet computed — POST /api/vol-forecast/hit-rates/compute to start.' });
    res.json(JSON.parse(raw));
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// TXT export of per-day hit log — same ──── NAME ──── style as forecast exports
app.get('/api/vol-forecast/hit-rates/export.txt', async (_req, res) => {
  try {
    const raw = await kv.get('vol_hit_rates');
    if (!raw) return res.status(404).type('text/plain').send('Not yet computed — run ↻ Compute first.');
    const data = JSON.parse(raw);
    const LVLS = ['oh_med','oh_75','ol_med','ol_75','hl_med','hl_75'];
    const LBL  = { oh_med:'↑ Upper (med)', oh_75:'↑ Upper (75th)', ol_med:'↓ Lower (med)', ol_75:'↓ Lower (75th)', hl_med:'↔ Range  (med)', hl_75:'↔ Range  (75th)' };
    const LW   = 32;
    const div  = n => { const p = `──── ${n} `; return p + '─'.repeat(Math.max(0, LW - p.length)); };
    const lines = [
      '**FORECAST LEVEL HIT RATES — DAILY LOG**',
      `**Computed: ${data.computed_at?.slice(0,10) ?? '—'} | Lookback: ${data.lookback_days ?? '?'}d**`,
      '',
    ];
    for (const [inst, idata] of Object.entries(data.instruments ?? {})) {
      if (!idata) continue;
      lines.push(div(inst));
      // Aggregate summary
      for (const lvl of LVLS) {
        const s = idata.levels?.[lvl];
        if (!s) continue;
        lines.push(`${LBL[lvl].padEnd(18)}: ${String(s.hit_pct ?? '—').padStart(3)}% hit | med ${s.median_utc ?? '—'} | earliest ${s.earliest_utc ?? '—'} | latest ${s.latest_utc ?? '—'}`);
      }
      // Per-day log
      if (idata.daily?.length) {
        lines.push('', '  date        open        ↑Med   ↑75th  ↓Med   ↓75th  ↔Med   ↔75th');
        lines.push('  ' + '─'.repeat(70));
        for (const d of idata.daily) {
          const t = lvl => (d.hits[lvl] ?? '—').padEnd(6);
          lines.push(`  ${d.date}  ${String(d.open).padEnd(10)}  ${t('oh_med')} ${t('oh_75')} ${t('ol_med')} ${t('ol_75')} ${t('hl_med')} ${t('hl_75')}`);
        }
      }
      lines.push('');
    }
    const filename = `hit_rates_${data.computed_at?.slice(0,10) ?? 'export'}.txt`;
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(lines.join('\n'));
  } catch (e) { res.status(500).type('text/plain').send(e.message); }
});

app.post('/api/vol-forecast/hit-rates/compute', async (req, res) => {
  if (isHitRatesComputing()) return res.status(409).json({ ok: false, error: 'Already computing' });
  const days = Math.min(Math.max(parseInt(req.query.days ?? '90', 10), 14), 365);
  // Load existing data for incremental extension
  let existingData = null;
  try {
    const raw = await kv.get('vol_hit_rates');
    if (raw) existingData = JSON.parse(raw);
  } catch {}
  const mode = existingData ? 'incremental (extending existing data)' : 'full';
  res.json({ ok: true, message: `Computing hit rates over ${days} days — ${mode} — takes 5–10 min. GET /api/vol-forecast/hit-rates when done.` });
  computeHitRates(days, existingData)
    .then(result => {
      kv.put('vol_hit_rates', JSON.stringify(result));
      console.log(`[HIT-RATES] Done — stored to KV (${mode})`);
    })
    .catch(e => console.error('[HIT-RATES] Error:', e.message));
});

// ── Daily Brief API ───────────────────────────────────────────────────────────
// Joins vol forecast + hit rates + HMM regime + live prices into a single
// per-instrument response. All data sources are optional — missing ones are
// indicated in the response so the UI can prompt the user.
// GET /api/daily-brief

app.get('/api/daily-brief', async (_req, res) => {
  try {
  const forecast = forecastState.latest;
  if (!forecast?.instruments) {
    return res.json({ ok: false, error: 'No forecast available — click ↻ Refresh first.' });
  }

  // Hit rates from KV (optional)
  let hitRates = null;
  try {
    const raw = await kv.get('vol_hit_rates');
    if (raw) hitRates = JSON.parse(raw);
  } catch {}

  // Live prices from Oanda (optional)
  const prices = {};
  if (process.env.OANDA_KEY && process.env.OANDA_ACCOUNT_ID) {
    try {
      const syms = HR_INSTRUMENTS.map(i => i.sym).join(',');
      const oBase = (process.env.OANDA_ENV || 'live') === 'practice'
        ? 'https://api-fxpractice.oanda.com' : 'https://api-fxtrade.oanda.com';
      const r = await fetch(
        `${oBase}/v3/accounts/${process.env.OANDA_ACCOUNT_ID}/pricing?instruments=${encodeURIComponent(syms)}`,
        { headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` }, signal: AbortSignal.timeout(10_000) }
      );
      if (r.ok) {
        const d = await r.json();
        for (const p of (d.prices ?? [])) {
          if (p.asks?.[0] && p.bids?.[0]) {
            prices[p.instrument] = (parseFloat(p.asks[0].price) + parseFloat(p.bids[0].price)) / 2;
          }
        }
      }
    } catch {}
  }

  const instruments = {};
  for (const { name, sym, ac } of HR_INSTRUMENTS) {
    const fc = forecast.instruments[name];
    if (!fc) continue;

    const livePrice = prices[sym] ?? null;
    const hr        = hitRates?.instruments?.[name] ?? null;
    const hmmKey    = BRIEF_HMM_KEYS[name] ?? null;
    const regRaw    = hmmKey ? (state.hmmRegimes[hmmKey] ?? null) : null;
    const dp        = PRICE_DIGITS[sym] ?? PRICE_DIGITS[sym.replace('_', '/')] ?? 5;
    const pipSz     = PIP_SIZE[sym.replace('_', '/')] ?? 0.0001;
    const fmt       = p => p != null ? parseFloat(p.toFixed(dp)) : null;

    // Sizing suggestion from regime confidence
    let sizingMult = null, sizingLabel = null;
    if (regRaw) {
      const conf = Math.max(regRaw.rangeProb ?? 0, regRaw.trendProb ?? 0);
      if (!regRaw.reliable || conf < 0.55)  { sizingMult = 0.5;  sizingLabel = 'Low';      }
      else if (conf >= 0.75)                 { sizingMult = 1.0;  sizingLabel = 'Full';     }
      else                                   { sizingMult = 0.75; sizingLabel = 'Moderate'; }
    }

    // Build levels: merge % forecast + absolute price + hit rate data
    const lvls = {};
    for (const [key, pctField, dir] of [
      ['oh_med', 'oh_median', +1],
      ['oh_75',  'oh_75',     +1],
      ['ol_med', 'ol_median', -1],
      ['ol_75',  'ol_75',     -1],
    ]) {
      const pct = fc[pctField] ?? 0;
      lvls[key] = {
        pct,
        price:       livePrice ? fmt(livePrice * (1 + dir * pct / 100)) : null,
        hit_pct:     null, median_utc: null, earliest_utc: null, latest_utc: null,
        ...(hr?.levels?.[key] ?? {}),
      };
    }
    for (const [key, pctField] of [['hl_med', 'hl_median'], ['hl_75', 'hl_75']]) {
      const pct = fc[pctField] ?? 0;
      const rangePts = livePrice
        ? parseFloat((livePrice * pct / 100 / pipSz).toFixed(1))
        : null;
      lvls[key] = {
        pct,
        range_pts:   rangePts,
        hit_pct:     null, median_utc: null, earliest_utc: null, latest_utc: null,
        ...(hr?.levels?.[key] ?? {}),
      };
    }

    instruments[name] = {
      name, sym, ac, dp,
      current_price: livePrice,
      news_mult:     fc.news_mult  ?? 1,
      news_flag:     (fc.news_mult ?? 1) > 1 ? (forecast.meta?.news_flag ?? 'Event') : null,
      vol_annual:    fc.vol_annual,
      vol_pct:       fc.vol_pct,
      regime: regRaw ? {
        label:        regRaw.regime,
        trend_dir:    regRaw.trendDir ?? null,
        range_prob:   Math.round((regRaw.rangeProb ?? 0) * 100),
        trend_prob:   Math.round((regRaw.trendProb ?? 0) * 100),
        reliable:     regRaw.reliable,
        sizing_mult:  sizingMult,
        sizing_label: sizingLabel,
      } : null,
      levels: lvls,
    };
  }

  res.json({
    ok:            true,
    generated_at:  new Date().toISOString(),
    session_date:  forecast.session_date,
    news_flag:     forecast.meta?.news_flag ?? null,
    news_mult:     forecast.meta?.news_mult ?? 1,
    has_hit_rates: !!hitRates,
    hit_rates_age: hitRates?.computed_at ?? null,
    has_regime:    Object.keys(state.hmmRegimes).length > 0,
    instruments,
  });
  } catch (e) {
    console.error('[DAILY-BRIEF]', e.message);
    res.status(500).json({ ok: false, error: `Server error: ${e.message}` });
  }
});

// ── Session Stats API ─────────────────────────────────────────────────────────
// Serves pre-computed session consumption percentages (Asia/London % of daily range).
// Computation is pure JavaScript (js/sessionStats.js) — no Python required.
// Trigger once via POST /api/session-stats/refresh, then results are cached to disk.

app.get('/api/session-stats', (_req, res) => {
  if (isSessionStatsComputing()) {
    return res.status(202).json({ ok: false, status: 'computing', message: 'Session stats computation in progress — poll again in 60s.' });
  }
  const data = getSessionStats();
  if (!data) {
    return res.status(202).json({ ok: false, message: 'Session stats not yet computed — POST /api/session-stats/refresh to start.' });
  }
  res.json(data);
});

app.post('/api/session-stats/refresh', (_req, res) => {
  if (isSessionStatsComputing()) {
    return res.json({ ok: false, message: 'Already computing — poll /api/session-stats for result.' });
  }
  const years = parseInt(_req.query.years) || 5;
  res.json({ ok: true, message: `Computing session stats (${years}yr H1) — poll /api/session-stats in ~3–5 min.` });
  computeSessionStats(years)
    .then(data => kv.put('session_stats', JSON.stringify(data)))
    .catch(e => console.error('[SESSION-STATS] Error:', e.message));
});

// ── Vol Backtest API ──────────────────────────────────────────────────────────

const _execFileAsync   = promisify(execFile);
const BT_DATA_DIR      = path.join(__dirname, 'VolRangeForecaster', 'data');
const BT_PYTHON_SCRIPT = path.join(__dirname, 'VolRangeForecaster', 'vol_backtest.py');

// Resolve Python binary once at startup — tries env var, then common paths
function _resolvePython() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const candidates = [
    '/usr/local/bin/python3', '/usr/bin/python3',
    '/usr/local/bin/python',  '/usr/bin/python',
    'python3', 'python',
  ];
  for (const c of candidates) {
    try { execFile(c, ['--version'], (_e, _o, _err) => {}); return c; } catch {}
  }
  return 'python3';
}
const BT_PYTHON = _resolvePython();

// Prefer .json files (new format), fall back to legacy .csv
function _latestBacktestFile() {
  if (!fs.existsSync(BT_DATA_DIR)) return null;
  const all = fs.readdirSync(BT_DATA_DIR).filter(f => f.startsWith('backtest_'));
  const json = all.filter(f => f.endsWith('.json')).sort().reverse();
  if (json.length) return path.join(BT_DATA_DIR, json[0]);
  const csv  = all.filter(f => f.endsWith('.csv')).sort().reverse();
  return csv.length ? path.join(BT_DATA_DIR, csv[0]) : null;
}

// Load trades from JSON (new) or CSV (legacy).  Always returns a plain array.
function _loadBacktestTrades(filePath) {
  if (filePath.endsWith('.json')) {
    const d = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(d) ? d : (d.trades ?? []);
  }
  // Legacy CSV fallback
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
  const hdrs  = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(',');
    const o    = Object.fromEntries(hdrs.map((h, i) => [h, (vals[i] ?? '').trim()]));
    o.filled     = o.filled === 'True';
    o.pnl_pct    = parseFloat(o.pnl_pct)    || 0;
    o.dow        = parseInt(o.dow)           || 0;
    o.hl_75_pct  = parseFloat(o.hl_75_pct)  || 0;
    o.oc_med_pct = parseFloat(o.oc_med_pct) || 0;
    o.open       = parseFloat(o.open)        || 0;
    o.high       = parseFloat(o.high)        || 0;
    o.low        = parseFloat(o.low)         || 0;
    o.close      = parseFloat(o.close)       || 0;
    o.fill_time  = o.fill_time  || null;
    o.exit_time  = o.exit_time  || null;
    return o;
  });
}

// In-memory cache for the trades endpoint — invalidated when the backtest file changes.
// Eliminates repeated synchronous parsing of a multi-MB CSV on every page load.
const _btTradesCache = { filePath: null, mtimeMs: 0, trades: null };

function _btStats(trades) {
  const filled  = trades.filter(r => r.filled);
  const wins    = filled.filter(r => r.outcome === 'win');
  const losses  = filled.filter(r => r.outcome === 'loss');
  const openEod = filled.filter(r => r.outcome === 'open');
  const nDays   = trades.length;
  const nFilled = filled.length;
  if (nFilled === 0) return { nDays, nFilled, fillRate: 0, winRate: 0, totalPnl: 0 };

  const pnls   = filled.map(r => r.pnl_pct);
  const totalPnl = pnls.reduce((s, p) => s + p, 0);
  const avgPnl   = totalPnl / nFilled;

  // Build daily portfolio P&L from ALL trades (filled and unfilled).
  // Unfilled days have pnl_pct=0, so they don't change the sum but DO appear
  // in the std denominator — zero-return days must dilute the Sharpe.
  // Using only filled days inflates Sharpe by √(total_days / fill_days).
  const dailyMap = new Map();
  for (const r of trades) {
    dailyMap.set(r.date, (dailyMap.get(r.date) ?? 0) + r.pnl_pct);
  }
  const dailyPnls  = [...dailyMap.values()];
  const nDailyObs  = dailyPnls.length;
  const dailyMean  = dailyPnls.reduce((s, p) => s + p, 0) / nDailyObs;
  const dailyStd   = Math.sqrt(dailyPnls.reduce((s, p) => s + (p - dailyMean) ** 2, 0) / Math.max(1, nDailyObs - 1));
  const sharpe     = dailyStd > 0 ? dailyMean / dailyStd * Math.sqrt(252) : 0;

  const dailyNeg  = dailyPnls.filter(p => p < 0);
  const downStd   = dailyNeg.length > 0
    ? Math.sqrt(dailyNeg.reduce((s, p) => s + p ** 2, 0) / dailyNeg.length) : 0;
  const sortino   = downStd > 0 ? dailyMean / downStd * Math.sqrt(252) : 0;

  const negPnls = pnls.filter(p => p < 0);

  // Drawdown on the daily portfolio series (sorted by date) so multi-instrument
  // fills on the same day are treated as one portfolio move.
  const sortedDailyPnls = [...dailyMap.entries()]
    .sort(([a], [b]) => a < b ? -1 : 1)
    .map(([, p]) => p);
  let peak = 0, maxDd = 0, cum = 0;
  for (const p of sortedDailyPnls) {
    cum += p; if (cum > peak) peak = cum;
    const dd = cum - peak; if (dd < maxDd) maxDd = dd;
  }

  const dates  = trades.map(r => new Date(r.date)).filter(d => !isNaN(d)).sort((a, b) => a - b);
  const years  = dates.length > 1 ? (dates[dates.length - 1] - dates[0]) / (365.25 * 86400e3) : 1;
  const cagr   = years > 0 ? ((1 + totalPnl / 100) ** (1 / years) - 1) * 100 : 0;
  const annRet = years > 0 ? totalPnl / years : 0;
  const calmar = maxDd < 0 ? annRet / Math.abs(maxDd) : 0;

  const avgWin  = wins.length   ? wins.reduce((s, r)   => s + r.pnl_pct, 0) / wins.length   : 0;
  const avgLoss = losses.length ? losses.reduce((s, r) => s + r.pnl_pct, 0) / losses.length : 0;
  const rr      = avgLoss < 0 ? Math.abs(avgWin / avgLoss) : 0;
  const grossW  = wins.reduce((s, r) => s + r.pnl_pct, 0);
  const grossL  = Math.abs(losses.reduce((s, r) => s + r.pnl_pct, 0));
  const pf      = grossL > 0 ? grossW / grossL : Infinity;
  const expect  = wins.length / nFilled * avgWin + losses.length / nFilled * avgLoss;

  let maxCW = 0, maxCL = 0, cw = 0, cl = 0;
  for (const r of filled) {
    if (r.outcome === 'win')  { cw++; cl = 0; if (cw > maxCW) maxCW = cw; }
    else if (r.outcome === 'loss') { cl++; cw = 0; if (cl > maxCL) maxCL = cl; }
    else { cw = 0; cl = 0; }
  }

  // MFE on losing trades: how far did price move in our favour before reversing?
  // High average (>0.5R) = Chandelier/trailing stop could salvage these losses.
  const mfeLosses = losses.filter(r => typeof r.mfe_r === 'number');
  const avgMfeLoss = mfeLosses.length
    ? +(mfeLosses.reduce((s, r) => s + r.mfe_r, 0) / mfeLosses.length).toFixed(2)
    : null;

  return {
    nDays, nFilled, nWins: wins.length, nLosses: losses.length, nOpenEod: openEod.length,
    fillRate:  +(nFilled / nDays * 100).toFixed(1),
    winRate:   +(wins.length / nFilled * 100).toFixed(1),
    avgPnl:    +avgPnl.toFixed(4),
    totalPnl:  +totalPnl.toFixed(3),
    cagr:      +cagr.toFixed(2),
    sharpe:    +sharpe.toFixed(2),
    sortino:   +sortino.toFixed(2),
    calmar:    +calmar.toFixed(2),
    profitFactor: pf === Infinity ? 999 : +pf.toFixed(2),
    maxDd:     +maxDd.toFixed(3),
    rr:        +rr.toFixed(2),
    expectancy: +expect.toFixed(4),
    avgWin:    +avgWin.toFixed(4),
    avgLoss:   +avgLoss.toFixed(4),
    maxConsecWins: maxCW, maxConsecLosses: maxCL,
    years:     +years.toFixed(2),
    avgMfeLoss,
  };
}

// Latest cached backtest results
app.get('/api/vol-backtest', (req, res) => {
  const filePath = _latestBacktestFile();
  if (!filePath) return res.status(404).json({ ok: false, error: 'No backtest data. Run the backtester first.' });

  try {
    const trades = _loadBacktestTrades(filePath);
    if (!trades.length) return res.status(404).json({ ok: false, error: 'Empty backtest file.' });

    // Instrument list
    const instruments = [...new Set(trades.map(r => r.instrument))].sort();

    // Per-instrument stats
    const byInstrument = Object.fromEntries(
      instruments.map(inst => [inst, _btStats(trades.filter(r => r.instrument === inst))])
    );

    // Per-regime stats
    const regimes = ['BULL', 'BEAR', 'RANGE'];
    const byRegime = Object.fromEntries(
      regimes.map(rg => [rg, _btStats(trades.filter(r => r.regime === rg))])
    );

    // Regime distribution
    const regimeDist = Object.fromEntries(
      regimes.map(rg => [rg, +(trades.filter(r => r.regime === rg).length / trades.length * 100).toFixed(1)])
    );

    // Equity curve: daily cumulative P&L across all instruments
    const dailyPnl = {};
    for (const r of trades.filter(t => t.filled)) {
      const d = r.date.substring(0, 10);
      dailyPnl[d] = (dailyPnl[d] || 0) + r.pnl_pct;
    }
    const sortedDates = Object.keys(dailyPnl).sort();
    let cumPnl = 0;
    const equityCurve = sortedDates.map(d => {
      cumPnl += dailyPnl[d];
      return { date: d, pnl: +cumPnl.toFixed(3) };
    });

    // Per-instrument equity curves
    const instEquity = {};
    for (const inst of instruments) {
      const instTrades = trades.filter(r => r.instrument === inst && r.filled);
      const byDay = {};
      for (const r of instTrades) {
        const d = r.date.substring(0, 10);
        byDay[d] = (byDay[d] || 0) + r.pnl_pct;
      }
      let c = 0;
      instEquity[inst] = Object.keys(byDay).sort().map(d => {
        c += byDay[d]; return { date: d, pnl: +c.toFixed(3) };
      });
    }

    // Monthly P&L
    const monthly = {};
    for (const r of trades.filter(t => t.filled)) {
      const m = r.date.substring(0, 7);
      monthly[m] = (monthly[m] || 0) + r.pnl_pct;
    }
    const monthlyArr = Object.entries(monthly).sort().map(([month, pnl]) => ({ month, pnl: +pnl.toFixed(3) }));

    // Day-of-week stats — always derive from date string, never trust CSV dow column
    // (old CSVs lack the column; parseInt('') || 0 = 0 = Sunday which skips all trades)
    const DOW_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const byDow = {};
    for (const day of ['Mon','Tue','Wed','Thu','Fri']) byDow[day] = [];
    for (const r of trades) {
      const label = DOW_LABELS[new Date(r.date + 'T00:00:00Z').getUTCDay()];
      if (byDow[label]) byDow[label].push(r);
    }
    const byDowStats = Object.fromEntries(
      Object.entries(byDow).map(([day, ts]) => [day, _btStats(ts)])
    );

    // Session stats
    const SESSION_ORDER = ['Asia','London','Overlap','NY','N/A'];
    const bySession = {};
    for (const s of SESSION_ORDER) bySession[s] = [];
    for (const r of trades) {
      const sess = r.session || 'N/A';
      if (bySession[sess]) bySession[sess].push(r);
      else bySession['N/A'].push(r);
    }
    const bySessionStats = Object.fromEntries(
      SESSION_ORDER.filter(s => bySession[s].length > 0)
        .map(s => [s, _btStats(bySession[s])])
    );

    // Recent trades (last 200 by date, across all instruments)
    // CSV rows are ordered by instrument then date, so slice(-200) without
    // sorting would return only the last instrument processed (NQ).
    const recentTrades = trades
      .filter(t => t.filled)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(-200)
      .reverse()
      .map(r => ({
        date: r.date?.substring(0, 10),
        instrument: r.instrument,
        regime: r.regime,
        side: r.side,
        outcome: r.outcome,
        pnl_pct: r.pnl_pct,
        hl_75_pct: r.hl_75_pct,
        oc_med_pct: r.oc_med_pct,
        leg: r.leg,
        session: r.session,
        dow: DOW_LABELS[r.dow ?? new Date(r.date + 'T00:00:00Z').getUTCDay()],
        open: r.open,
        fill_time: r.fill_time || null,
      }));

    // All filled P&L values for Monte Carlo (client needs the full sequence)
    const allPnls = trades.filter(t => t.filled).map(r => r.pnl_pct);

    // Compact full trade list for client-side analysis (IS/OOS, year-by-year, walk-forward, spread sensitivity)
    const allTrades = trades.map(r => ({
      date:       r.date?.substring(0, 10),
      filled:     r.filled,
      pnl_pct:    r.pnl_pct,
      outcome:    r.outcome,
      regime:     r.regime,
      instrument: r.instrument,
    }));

    res.json({
      ok: true,
      file: path.basename(filePath),
      computedAt: fs.statSync(filePath).mtime.toISOString(),
      overall: _btStats(trades),
      byInstrument,
      byRegime,
      regimeDist,
      byDow: byDowStats,
      bySession: bySessionStats,
      equityCurve,
      instEquity,
      monthlyPnl: monthlyArr,
      recentTrades,
      allTrades,
      allPnls,
      totalTrades: trades.filter(t => t.filled).length,
      instruments,
    });
  } catch (e) {
    const msg = e?.message || String(e) || 'Stats error';
    console.error('[vol-backtest]', msg, e?.stack ?? '');
    res.status(500).json({ ok: false, error: msg });
  }
});

// ── All trades endpoint for the Backtest Viewer ───────────────────────────────
// Returns every filled trade (no 200-cap), sorted newest-first.
// Includes all fields including fill_time and exit_time for chart markers.
// ── Decision engine audit log ─────────────────────────────────────────────────
// Returns the rolling audit log written by the browser (alerts.js) to KV.
// Entries are proximity events where the decision engine gate was evaluated.

app.get('/api/decision-audit', async (req, res) => {
  try {
    const raw = await kv.get('decision_audit_log');
    if (!raw) return res.json({ ok: true, trades: [], total: 0 });
    let entries = JSON.parse(raw);
    if (!Array.isArray(entries)) return res.json({ ok: true, trades: [], total: 0 });
    // Optional date range filter
    const { from, to } = req.query;
    if (from) entries = entries.filter(e => e.date >= from);
    if (to)   entries = entries.filter(e => e.date <= to);
    // Map audit entries to the trade shape expected by backtest-viewer.html
    const trades = entries.map(e => ({
      instrument:            e.sym,
      date:                  e.date,
      side:                  e.direction === 'long' ? 'BUY' : 'SELL',
      outcome:               'open',
      pnl_pct:               0,
      fill_time:             e.fill_time,
      entry_price:           e.price,
      tp_price:              e.tp   ?? null,
      sl_price:              e.sl   ?? null,
      rrRatio:               e.rrRatio ?? null,
      grade:                 e.grade,
      verdict:               e.verdict,
      tags:                  e.tags ?? [],
      decisionMode:          e.decisionMode,
      decisionParticipation: e.decisionParticipation,
      decisionRiskMult:      e.decisionRiskMult,
      permitted:             e.permitted,
      suppressed:            e.suppressed,
      reasons:               e.reasons ?? [],
    }));
    res.json({ ok: true, trades, total: trades.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/vol-backtest/trades', (req, res) => {
  const filePath = _latestBacktestFile();
  if (!filePath) return res.status(404).json({ ok: false, error: 'No backtest data. Run the backtester first.' });

  try {
    // Return cached result when the file hasn't changed — avoids blocking the event
    // loop with synchronous CSV/JSON parsing on every page load.
    const mtimeMs = fs.statSync(filePath).mtimeMs;
    if (_btTradesCache.filePath === filePath && _btTradesCache.mtimeMs === mtimeMs && _btTradesCache.trades) {
      return res.json({ ok: true, trades: _btTradesCache.trades, total: _btTradesCache.trades.length, cached: true });
    }

    const DOW_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const trades = _loadBacktestTrades(filePath)
      .filter(t => t.filled)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .reverse()
      .map(r => ({
        date:       r.date?.substring(0, 10),
        instrument: r.instrument,
        regime:     r.regime,
        side:       r.side,
        outcome:    r.outcome,
        pnl_pct:    r.pnl_pct,
        hl_75_pct:  r.hl_75_pct,
        oc_med_pct: r.oc_med_pct,
        leg:        r.leg,
        session:    r.session,
        dow:        DOW_LABELS[r.dow != null ? r.dow : new Date((r.date?.substring(0,10) ?? '') + 'T00:00:00Z').getUTCDay()],
        open:       r.open,
        fill_time:  r.fill_time  || null,
        exit_time:  r.exit_time  || null,
      }));

    _btTradesCache.filePath = filePath;
    _btTradesCache.mtimeMs  = mtimeMs;
    _btTradesCache.trades   = trades;

    res.json({ ok: true, trades, total: trades.length });
  } catch (e) {
    const msg = e?.message || String(e) || 'Parse error';
    console.error('[vol-backtest/trades]', msg, e?.stack ?? '');
    res.status(500).json({ ok: false, error: msg });
  }
});

// Check how many M1 parquets are cached locally
function _m1CacheStatus() {
  if (!fs.existsSync(BT_M1_DIR)) return { cached: 0, pairs: [] };
  const files = fs.readdirSync(BT_M1_DIR).filter(f => f.endsWith('_m1.parquet'));
  return { cached: files.length, pairs: files.map(f => f.replace('_m1.parquet', '').toUpperCase()) };
}

// Trigger a fresh backtest run using pure-JS engine (no Python required)
// Uses M1 intraday simulation when parquets are cached, D1 otherwise.
// In-memory job store for async backtest runs — keyed by jobId
const btJobs = new Map();

function _purgeStaleBtJobs() {
  const cutoff = Date.now() - 60 * 60_000;
  for (const [id, job] of btJobs) if (job.startedAt < cutoff) btJobs.delete(id);
}

app.post('/api/vol-backtest/run', (req, res) => {
  if (!process.env.OANDA_KEY) {
    return res.status(500).json({ ok: false, error: 'OANDA_KEY not set — cannot fetch live D1 data' });
  }
  const {
    dateFrom = '', dateTo = '', pair = '',
    slMult = '1.5', strategy = 'reversal',
    momentumPullback = '0', momentumSlMult = '1.0',
    spreadPct = '0', dynHlCorr = '0', slopeThresh = '0.002',
    revHL50Mode = 'all',
    bearMult = '1.0', rangeMode = 'fade_both',
    daRegime = 'all', daDir = 'both', daEodMode = 'close',
    // exhaustion fade opts
    exAtrPeriod = '14', exAtrMult = '1.5', exTpMode = 'hybrid',
    exRrRatio = '3.0', exMfeRetrace = '0.40', exMaxRr = '4.0',
    exBlowThrough = 'true',
    exUseHL50 = 'true', exUseHL75 = 'true', exUseOCmed = 'false', exUseOC75 = 'false',
  } = req.body || {};
  const opts = {
    dateFrom, dateTo, minLookback: 50,
    slMult:           parseFloat(slMult)           || 1.5,
    strategy,
    momentumPullback: parseFloat(momentumPullback) || 0,
    momentumSlMult:   parseFloat(momentumSlMult)   || 1.0,
    slopeThresh:      parseFloat(slopeThresh)       || 0.002,
    spreadPct:        parseFloat(spreadPct)         || 0,
    dynHlCorr:        parseFloat(dynHlCorr)         || 0,
    revHL50Mode,
    bearMult:         parseFloat(bearMult)          || 1.0,
    rangeMode,
    daRegime, daDir, daEodMode,
    exAtrPeriod:   parseInt(exAtrPeriod)         || 14,
    exAtrMult:     parseFloat(exAtrMult)          || 1.5,
    exTpMode,
    exRrRatio:     parseFloat(exRrRatio)          || 3.0,
    exMfeRetrace:  parseFloat(exMfeRetrace)       || 0.40,
    exMaxRr:       parseFloat(exMaxRr)            || 4.0,
    exBlowThrough: exBlowThrough !== 'false',
    exUseHL50:     exUseHL50  !== 'false',
    exUseHL75:     exUseHL75  !== 'false',
    exUseOCmed:    exUseOCmed === 'true',
    exUseOC75:     exUseOC75  === 'true',
  };

  const instFilter  = pair ? BT_INSTRUMENTS.filter(i => i.name === pair.toUpperCase()) : undefined;
  const jobId       = `bt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt   = Date.now();

  _purgeStaleBtJobs();
  btJobs.set(jobId, { status: 'running', startedAt });

  // Fire-and-forget — response returns immediately with jobId
  (async () => {
    try {
      const m1Status    = _m1CacheStatus();
      const engineLabel = m1Status.cached > 0
        ? `M1 engine (${m1Status.cached} pairs cached)`
        : `D1 engine (Oanda API) · strategy: ${strategy}`;

      const { trades, log } = await runFullM1Backtest(opts, instFilter ?? BT_INSTRUMENTS);

      if (!trades.length) {
        btJobs.set(jobId, { status: 'error', error: 'No trades generated', log, startedAt });
        return;
      }

      if (!fs.existsSync(BT_DATA_DIR)) fs.mkdirSync(BT_DATA_DIR, { recursive: true });
      const ts      = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 15);
      const outFile = path.join(BT_DATA_DIR, `backtest_${ts}.json`);
      fs.writeFileSync(outFile, JSON.stringify(trades, null, 0) + '\n');

      btJobs.set(jobId, {
        status: 'done', startedAt,
        result: {
          ok:      true,
          message: `Backtest complete — ${trades.filter(t => t.filled).length} filled trades`,
          engine:  engineLabel,
          m1Pairs: m1Status.pairs,
          log,
          file:    path.basename(outFile),
        },
      });
    } catch (e) {
      const msg = e?.message || String(e) || 'Unknown engine error';
      console.error('[vol-backtest/run]', msg, e?.stack ?? '');
      btJobs.set(jobId, { status: 'error', error: msg, startedAt });
    }
  })();

  res.json({ ok: true, jobId });
});

app.get('/api/vol-backtest/status/:jobId', (req, res) => {
  const job = btJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, error: 'Job not found or expired' });
  if (job.status === 'running') {
    return res.json({ ok: true, status: 'running', elapsed: Math.round((Date.now() - job.startedAt) / 1000) });
  }
  if (job.status === 'done') return res.json({ ok: true, status: 'done', ...job.result });
  return res.status(500).json({ ok: false, status: 'error', error: job.error, log: job.log });
});

// Report M1 cache status and Drive IDs for download instructions
app.get('/api/vol-backtest/m1-status', (_req, res) => {
  const status = _m1CacheStatus();
  res.json({
    ...status,
    m1Dir:    BT_M1_DIR,
    driveIds: M1_DRIVE_IDS,
  });
});

app.get('/api/vol-backtest/diagnose', async (_req, res) => {
  const report = {};

  const R2_ENDPOINT_CFG   = process.env.R2_ENDPOINT    || 'https://3e867110ae519cd24afc877c72e5026e.r2.cloudflarestorage.com';
  const R2_BUCKET_CFG     = process.env.R2_BUCKET      || 'r2-storage';
  const R2_KEY_PREFIX_CFG = process.env.R2_KEY_PREFIX  || 'm1';

  // Env vars
  report.env = {
    OANDA_KEY:        !!process.env.OANDA_KEY,
    OANDA_ENV:        process.env.OANDA_ENV || '(unset — defaults to live)',
    OANDA_ACCOUNT_ID: process.env.OANDA_ACCOUNT_ID || '(unset)',
    R2_ACCESS_KEY:    !!process.env.R2_ACCESS_KEY,
    R2_SECRET_KEY:    !!process.env.R2_SECRET_KEY,
    R2_BUCKET:        R2_BUCKET_CFG,
    R2_ENDPOINT:      R2_ENDPOINT_CFG,
    R2_KEY_PREFIX:    R2_KEY_PREFIX_CFG,
    NODE_ENV:         process.env.NODE_ENV || '(unset)',
  };

  // R2 connectivity
  try {
    const { S3Client, HeadObjectCommand } = await import('@aws-sdk/client-s3');
    const r2 = new S3Client({
      endpoint:    R2_ENDPOINT_CFG,
      region:      'auto',
      requestHandler: { requestTimeout: 5000 },
      credentials: {
        accessKeyId:     process.env.R2_ACCESS_KEY,
        secretAccessKey: process.env.R2_SECRET_KEY,
      },
    });
    const cmd = new HeadObjectCommand({ Bucket: R2_BUCKET_CFG, Key: `${R2_KEY_PREFIX_CFG}/eurusd_m1.parquet` });
    const meta = await r2.send(cmd);
    report.r2 = { ok: true, eurusdBytes: meta.ContentLength };
  } catch (e) {
    report.r2 = { ok: false, error: e?.message ?? String(e) };
  }

  // OANDA connectivity
  try {
    const key = process.env.OANDA_KEY;
    if (!key) throw new Error('OANDA_KEY not set');
    const oandaBase = (process.env.OANDA_ENV || 'live') === 'practice'
      ? 'https://api-fxpractice.oanda.com'
      : 'https://api-fxtrade.oanda.com';
    const resp = await fetch(`${oandaBase}/v3/accounts`, {
      headers: { Authorization: `Bearer ${key}` },
      signal:  AbortSignal.timeout(5000),
    });
    report.oanda = { ok: resp.ok, status: resp.status, env: process.env.OANDA_ENV || 'live' };
  } catch (e) {
    report.oanda = { ok: false, error: e?.message ?? String(e) };
  }

  // M1 cache
  report.m1Cache = _m1CacheStatus();

  res.json(report);
});

app.get('/api/version', (_req, res) => res.json({ version: 'r2-m1-engine', deployedAt: new Date().toISOString(), r2: !!process.env.R2_ACCESS_KEY }));

// ── Weekly Vol Backtest API ───────────────────────────────────────────────────

const WBT_DATA_DIR = BT_DATA_DIR; // reuse same data directory, different filename prefix

function _latestWeeklyFile() {
  if (!fs.existsSync(WBT_DATA_DIR)) return null;
  const files = fs.readdirSync(WBT_DATA_DIR)
    .filter(f => f.startsWith('weekly_backtest_') && f.endsWith('.json'))
    .sort().reverse();
  return files.length ? path.join(WBT_DATA_DIR, files[0]) : null;
}

// Weekly stats — same logic as _btStats but uses √52 for Sharpe/Sortino annualisation.
// rfRate: annual risk-free rate as a decimal (e.g. 0.05 = 5%). Defaults to 0 (conventional
// for short-term FX strategies where Rf is already embedded in the swap).
function _wbtStats(trades, rfRate = 0) {
  const filled  = trades.filter(r => r.filled);
  const nDays   = trades.length; // = number of week-slots (opportunities)
  const nFilled = filled.length;
  if (nFilled === 0) return { nDays, nFilled, fillRate: 0, winRate: 0, totalPnl: 0 };

  const pnls     = filled.map(r => r.pnl_pct);
  const totalPnl = pnls.reduce((s, p) => s + p, 0);

  // Equal-weight per-instrument portfolio: for each Monday, average across all active
  // instruments rather than summing. Prevents 26-pair aggregation from inflating Sharpe
  // and CAGR by √N (uncorrelated diversification artefact, not tradeable alpha).
  const instrPerWeek = new Map(); // weekDate → Map(instrument → pnl)
  for (const r of trades) {
    const im = instrPerWeek.get(r.date) ?? new Map();
    instrPerWeek.set(r.date, im);
    im.set(r.instrument, (im.get(r.instrument) ?? 0) + r.pnl_pct);
  }
  const weekPnls = [...instrPerWeek.entries()]
    .sort(([a], [b]) => a < b ? -1 : 1)
    .map(([, im]) => {
      const vals = [...im.values()];
      return vals.reduce((s, p) => s + p, 0) / vals.length;
    });

  const nObs     = weekPnls.length;
  const rfWeekly = rfRate / 52;              // annual RF → weekly (in same % units as returns)
  const wMean    = weekPnls.reduce((s, p) => s + p, 0) / nObs;
  const wStd     = Math.sqrt(weekPnls.reduce((s, p) => s + (p - wMean) ** 2, 0) / Math.max(1, nObs - 1));
  const sharpe   = wStd > 0 ? (wMean - rfWeekly) / wStd * Math.sqrt(52) : 0;
  const downPnls = weekPnls.filter(p => p < 0);
  // Sortino: semi-deviation uses ALL observations in denominator (not just negative ones)
  const downStd  = nObs > 0 ? Math.sqrt(downPnls.reduce((s, p) => s + p ** 2, 0) / nObs) : 0;
  const sortino  = downStd > 0 ? (wMean - rfWeekly) / downStd * Math.sqrt(52) : 0;

  // Max drawdown on compounded equity curve (% of peak equity)
  let peakEq = 1.0, equity = 1.0, maxDd = 0;
  for (const p of weekPnls) {
    equity *= (1 + p / 100);
    if (equity > peakEq) peakEq = equity;
    const dd = (peakEq - equity) / peakEq * 100;
    if (dd > maxDd) maxDd = dd;
  }

  const wins      = pnls.filter(p => p > 0);
  const losses    = pnls.filter(p => p <= 0);
  const grossWin  = wins.reduce((s, p) => s + p, 0);
  const grossLoss = Math.abs(losses.reduce((s, p) => s + p, 0));
  const pf        = grossLoss > 0 ? grossWin / grossLoss : wins.length > 0 ? 999 : 0;
  const avgWin    = wins.length   > 0 ? grossWin   / wins.length   : 0;
  const avgLoss   = losses.length > 0 ? grossLoss  / losses.length : 0;

  const dates  = [...instrPerWeek.keys()].sort();
  const years  = dates.length > 1
    ? (new Date(dates.at(-1)) - new Date(dates[0])) / (365.25 * 24 * 3600 * 1000) : 1;
  const normPnl    = weekPnls.reduce((s, p) => s + p, 0); // equal-weight portfolio return
  // CAGR via geometric compounding of each weekly return (avoids arithmetic-sum approximation)
  const finalEquity = weekPnls.reduce((eq, p) => eq * (1 + p / 100), 1.0);
  const cagr        = years > 0 ? (Math.pow(finalEquity, 1 / years) - 1) * 100 : 0;
  const calmar      = maxDd > 0 ? Math.abs(cagr / maxDd) : 0;

  // Max consecutive wins/losses measured on weekly portfolio returns (not individual trades)
  let maxCW = 0, maxCL = 0, curCW = 0, curCL = 0;
  for (const p of weekPnls) {
    if (p > 0) { curCW++; curCL = 0; } else { curCL++; curCW = 0; }
    if (curCW > maxCW) maxCW = curCW;
    if (curCL > maxCL) maxCL = curCL;
  }

  // MFE/MAE trade-level stats
  const _wbtMed = arr => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = (s.length - 1) / 2;
    return (s[Math.floor(m)] + s[Math.ceil(m)]) / 2;
  };
  const mfeArr     = filled.filter(r => r.mfe_pct != null).map(r => r.mfe_pct);
  const maeArr     = filled.filter(r => r.mae_pct != null).map(r => r.mae_pct);
  const mfeMean    = mfeArr.length ? mfeArr.reduce((s, v) => s + v, 0) / mfeArr.length : 0;
  const mfeMed     = _wbtMed(mfeArr);
  const maeMean    = maeArr.length ? maeArr.reduce((s, v) => s + v, 0) / maeArr.length : 0;
  const maeMed     = _wbtMed(maeArr);
  const captureEff = mfeMean > 0 ? Math.max(0, (totalPnl / nFilled) / mfeMean * 100) : 0;

  // Pip-based stats (cross-pair: only meaningful if single-pair slice)
  const pipWinArr  = filled.filter(r => r.pnl_pips != null && r.pnl_pct > 0).map(r => r.pnl_pips);
  const pipLossArr = filled.filter(r => r.pnl_pips != null && r.pnl_pct <= 0).map(r => r.pnl_pips);
  const mfePipArr  = filled.filter(r => r.mfe_pips != null).map(r => r.mfe_pips);
  const maePipArr  = filled.filter(r => r.mae_pips != null).map(r => r.mae_pips);
  const avgPipWin  = pipWinArr.length  ? pipWinArr.reduce((s, v) => s + v, 0)  / pipWinArr.length  : 0;
  const avgPipLoss = pipLossArr.length ? pipLossArr.reduce((s, v) => s + v, 0) / pipLossArr.length : 0;
  const avgMfePips = mfePipArr.length  ? mfePipArr.reduce((s, v) => s + v, 0)  / mfePipArr.length  : 0;
  const avgMaePips = maePipArr.length  ? maePipArr.reduce((s, v) => s + v, 0)  / maePipArr.length  : 0;

  // Near-miss: losing trades where MFE > avgWin*0.5 — moved favorably but reversed
  const nearMissThresh = avgWin * 0.5;
  const nearMissCount  = filled.filter(r => r.outcome === 'loss' && (r.mfe_pct ?? 0) > nearMissThresh).length;
  const nearMissPct    = nFilled > 0 ? +(nearMissCount / nFilled * 100).toFixed(1) : 0;

  // Leave-on-table: for winning trades, how far price moved beyond TP (mfe_pct - pnl_pct)
  const winners  = filled.filter(r => r.outcome === 'win' && r.mfe_pct != null);
  const loserMfe = filled.filter(r => r.outcome === 'loss' && r.mfe_pct != null);
  const leaveArr = winners.map(r => Math.max(0, r.mfe_pct - r.pnl_pct));
  const leaveMean = leaveArr.length ? leaveArr.reduce((s, v) => s + v, 0) / leaveArr.length : 0;
  // Best possible exit for losers (avg MFE on losing trades)
  const loserBestExit = loserMfe.length ? loserMfe.reduce((s, r) => s + r.mfe_pct, 0) / loserMfe.length : 0;

  return {
    nDays, nFilled, nObs,
    fillRate:       +(nFilled / nDays * 100).toFixed(1),
    winRate:        +(wins.length / nFilled * 100).toFixed(1),
    totalPnl:       +totalPnl.toFixed(3),
    portReturn:     +normPnl.toFixed(3),   // equal-weight portfolio total return (basis for CAGR)
    annReturn:      +(normPnl / years).toFixed(2),
    cagr:           +cagr.toFixed(2),
    sharpe:         +sharpe.toFixed(2),
    sortino:        +sortino.toFixed(2),
    calmar:         +calmar.toFixed(2),
    profitFactor:   +Math.min(pf, 999).toFixed(2),
    maxDd:          +maxDd.toFixed(3),
    rr:             +(avgLoss > 0 ? avgWin / avgLoss : 0).toFixed(2),
    expectancy:     +(totalPnl / nFilled).toFixed(4),
    avgWin:         +avgWin.toFixed(4),
    avgLoss:        +(-avgLoss).toFixed(4),
    years:          +years.toFixed(2),
    winCount:       wins.length,
    lossCount:      losses.length,
    openCount:      filled.filter(r => r.outcome === 'open').length,
    maxConsecWins:  maxCW,
    maxConsecLosses: maxCL,
    mfeMean:        +mfeMean.toFixed(4),
    mfeMed:         +mfeMed.toFixed(4),
    maeMean:        +maeMean.toFixed(4),
    maeMed:         +maeMed.toFixed(4),
    captureEff:     +Math.min(captureEff, 999).toFixed(1),
    avgPipWin:      +avgPipWin.toFixed(1),
    avgPipLoss:     +avgPipLoss.toFixed(1),
    avgMfePips:     +avgMfePips.toFixed(1),
    avgMaePips:     +avgMaePips.toFixed(1),
    nearMissCount,
    nearMissPct,
    leaveMean:      +leaveMean.toFixed(4),
    loserBestExit:  +loserBestExit.toFixed(4),
  };
}

// Latest cached weekly backtest results
app.get('/api/weekly-vol-backtest', (req, res) => {
  const filePath = _latestWeeklyFile();
  if (!filePath) return res.status(404).json({ ok: false, error: 'No weekly backtest data. Click ▶ Run to generate.' });

  try {
    const rawData  = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const trades   = Array.isArray(rawData) ? rawData : (rawData.trades ?? []);
    if (!trades.length) return res.status(404).json({ ok: false, error: 'Empty backtest file.' });

    const instruments = [...new Set(trades.map(r => r.instrument))].sort();

    const byInstrument = Object.fromEntries(
      instruments.map(inst => [inst, _wbtStats(trades.filter(r => r.instrument === inst))])
    );

    const levels = ['HL50', 'HL75', 'OCMed', 'OC75'];
    const byLevel = Object.fromEntries(
      levels.map(lv => [lv, _wbtStats(trades.filter(r => r.level === lv))])
    );

    // Fill-day breakdown (which day of the week was the limit order triggered)
    const DOW_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const byFillDay = {};
    for (const r of trades) {
      if (!r.filled || !r.fill_date) continue;
      const d = DOW_LABELS[new Date(r.fill_date + 'T12:00:00Z').getUTCDay()];
      (byFillDay[d] = byFillDay[d] || []).push(r);
    }
    const byFillDayStats = Object.fromEntries(
      Object.entries(byFillDay).map(([d, ts]) => [d, _wbtStats(ts)])
    );

    // Weekly equity curve (cumulative P&L over Monday dates)
    const weekPnl = {};
    for (const r of trades.filter(t => t.filled)) {
      const d = r.date?.substring(0, 10);
      if (d) weekPnl[d] = (weekPnl[d] || 0) + r.pnl_pct;
    }
    let cum = 0;
    const equityCurve = Object.keys(weekPnl).sort().map(d => {
      cum += weekPnl[d];
      return { date: d, pnl: +cum.toFixed(3) };
    });

    // Per-instrument equity curves
    const instEquity = {};
    for (const inst of instruments) {
      const instTrades = trades.filter(r => r.instrument === inst && r.filled);
      const byWk = {};
      for (const r of instTrades) {
        const d = r.date?.substring(0, 10);
        if (d) byWk[d] = (byWk[d] || 0) + r.pnl_pct;
      }
      let c = 0;
      instEquity[inst] = Object.keys(byWk).sort().map(d => {
        c += byWk[d]; return { date: d, pnl: +c.toFixed(3) };
      });
    }

    // Monthly P&L (group week by month of Monday date)
    const monthly = {};
    for (const r of trades.filter(t => t.filled)) {
      const m = r.date?.substring(0, 7);
      if (m) monthly[m] = (monthly[m] || 0) + r.pnl_pct;
    }
    const monthlyPnl = Object.entries(monthly).sort().map(([month, pnl]) => ({ month, pnl: +pnl.toFixed(3) }));

    // Recent trades for log (last 200 filled, sorted newest-first)
    const recentTrades = trades
      .filter(t => t.filled)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(-200).reverse()
      .map(r => ({
        date:        r.date?.substring(0, 10),
        week:        r.week?.substring(0, 10),
        instrument:  r.instrument,
        level:       r.level,
        side:        r.side,
        outcome:     r.outcome,
        pnl_pct:     r.pnl_pct,
        hl50_pct:    r.hl50_pct,
        hl75_pct:    r.hl75_pct,
        oc_med_pct:  r.oc_med_pct,
        oc75_pct:    r.oc75_pct,
        monday_open: r.monday_open,
        fill_date:   r.fill_date,
        close_date:  r.close_date,
        entry:       r.entry,
        tp:          r.tp,
        sl:          r.sl,
        mfe_pct:     r.mfe_pct,
        mae_pct:     r.mae_pct,
        pnl_pips:    r.pnl_pips,
        mfe_pips:    r.mfe_pips,
        mae_pips:    r.mae_pips,
        carried:     r.carried ?? false,
      }));

    // Compact allTrades for client-side stats + chart modal
    const allTrades = trades.map(r => ({
      date:        r.date?.substring(0, 10),
      week:        r.week?.substring(0, 10),
      filled:      r.filled,
      pnl_pct:     r.pnl_pct,
      outcome:     r.outcome,
      level:       r.level,
      side:        r.side,
      instrument:  r.instrument,
      hl50_pct:    r.hl50_pct,
      hl75_pct:    r.hl75_pct,
      oc_med_pct:  r.oc_med_pct,
      oc75_pct:    r.oc75_pct,
      monday_open: r.monday_open,
      fill_date:   r.fill_date,
      close_date:  r.close_date,
      entry:       r.entry,
      tp:          r.tp,
      sl:          r.sl,
      mfe_pct:     r.mfe_pct,
      mae_pct:     r.mae_pct,
      pnl_pips:    r.pnl_pips,
      mfe_pips:    r.mfe_pips,
      mae_pips:    r.mae_pips,
      carried:     r.carried ?? false,
    }));

    const overall = _wbtStats(trades);

    // IS/OOS walk-forward split (70% in-sample, 30% out-of-sample by Monday date)
    const wfDates  = [...new Set(trades.map(r => r.date?.substring(0, 10)).filter(Boolean))].sort();
    const wfSplit  = Math.floor(wfDates.length * 0.7);
    const wfCutoff = wfDates[wfSplit] ?? '';
    const walkForward = {
      isStats:    _wbtStats(trades.filter(r => (r.date?.substring(0, 10) ?? '') <  wfCutoff)),
      oosStats:   _wbtStats(trades.filter(r => (r.date?.substring(0, 10) ?? '') >= wfCutoff)),
      cutoffDate: wfCutoff,
      dateFrom:   wfDates[0]     ?? '',
      dateTo:     wfDates.at(-1) ?? '',
    };

    // Rolling expanding-window walk-forward (5 OOS periods, IS grows from 50% to 90%)
    const nWfDates = wfDates.length;
    const wfWindows = [];
    for (let i = 0; i < 5; i++) {
      const isEndIdx  = Math.floor(nWfDates * (0.5 + i * 0.1));
      const oosEndIdx = Math.min(nWfDates, isEndIdx + Math.floor(nWfDates * 0.1));
      if (isEndIdx >= nWfDates || oosEndIdx <= isEndIdx) break;
      const isTo    = wfDates[isEndIdx - 1];
      const oosFrom = wfDates[isEndIdx];
      const oosTo   = wfDates[oosEndIdx - 1];
      const isTr    = trades.filter(r => { const d = r.date?.substring(0, 10) ?? ''; return d >= wfDates[0] && d <= isTo; });
      const oosTr   = trades.filter(r => { const d = r.date?.substring(0, 10) ?? ''; return d >= oosFrom && d <= oosTo; });
      wfWindows.push({
        label: `OOS ${i + 1}`,
        isFrom: wfDates[0], isTo, oosFrom, oosTo,
        isStats:  _wbtStats(isTr),
        oosStats: _wbtStats(oosTr),
      });
    }

    res.json({
      ok: true,
      file:        path.basename(filePath),
      computedAt:  fs.statSync(filePath).mtime.toISOString(),
      overall,
      byInstrument,
      byLevel,
      byFillDay:   byFillDayStats,
      equityCurve,
      instEquity,
      monthlyPnl,
      recentTrades,
      allTrades,
      walkForward,
      wfWindows,
      totalTrades: trades.filter(t => t.filled).length,
      instruments,
    });
  } catch (e) {
    const msg = e?.message || String(e);
    console.error('[weekly-vol-backtest]', msg);
    res.status(500).json({ ok: false, error: msg });
  }
});

// Async job queue for weekly backtest runs
const wbtJobs = new Map();

function _purgeStaleWbtJobs() {
  const cutoff = Date.now() - 60 * 60_000;
  for (const [id, job] of wbtJobs) if (job.startedAt < cutoff) wbtJobs.delete(id);
}

app.post('/api/weekly-vol-backtest/run', (req, res) => {
  if (!process.env.OANDA_KEY) {
    return res.status(500).json({ ok: false, error: 'OANDA_KEY not set — cannot fetch D1 data' });
  }
  const {
    dateFrom     = '', dateTo      = '', pair        = '',
    strategy     = 'revHL50',
    slMult       = '1.5',
    spreadPct    = '0',
    slMode       = 'level',
    tpMode       = 'open',
    atrPeriod    = '30',
    atrSlMult    = '1.5',
    atrTpMult    = '2.0',
    slPips       = '30',
    tpPips       = '50',
    maeCalibPct         = '85',
    maeCalibLookback    = '100',
    maeCalibMinSamples  = '20',
    carryMode    = 'false',
    maxOnePerPair = 'false',
    lvHL50, lvHL75, lvOCMed, lvOC75,
    zScoreFilter    = 'false', zScoreBuyThresh  = '-1.5', zScoreSellThresh = '1.5', zScoreLen = '20',
    smiFilter       = 'false', smiBuyThresh     = '-40',  smiSellThresh    = '40',  smiKLen   = '10',
  } = req.body || {};

  const opts = {
    dateFrom, dateTo,
    strategy,
    slMult:       parseFloat(slMult)    || 1.5,
    spreadPct:    parseFloat(spreadPct) || 0,
    slMode,
    tpMode,
    atrPeriod:    parseInt(atrPeriod)   || 30,
    atrSlMult:    parseFloat(atrSlMult) || 1.5,
    atrTpMult:    parseFloat(atrTpMult) || 2.0,
    slPips:       parseFloat(slPips)    || 30,
    tpPips:       parseFloat(tpPips)    || 50,
    maeCalibPct:        parseFloat(maeCalibPct)        || 85,
    maeCalibLookback:   parseInt(maeCalibLookback)      || 100,
    maeCalibMinSamples: parseInt(maeCalibMinSamples)    || 20,
    carryMode:    carryMode    === 'true',
    maxOnePerPair: maxOnePerPair === 'true',
    minLookback:  60,
    zScoreFilter:     zScoreFilter    === 'true',
    zScoreBuyThresh:  parseFloat(zScoreBuyThresh)  || -1.5,
    zScoreSellThresh: parseFloat(zScoreSellThresh) ||  1.5,
    zScoreLen:        parseInt(zScoreLen)           ||  20,
    smiFilter:        smiFilter       === 'true',
    smiBuyThresh:     parseFloat(smiBuyThresh)      || -40,
    smiSellThresh:    parseFloat(smiSellThresh)     ||  40,
    smiKLen:          parseInt(smiKLen)              ||  10,
  };
  if (lvHL50  !== undefined) opts.doHL50  = Boolean(lvHL50);
  if (lvHL75  !== undefined) opts.doHL75  = Boolean(lvHL75);
  if (lvOCMed !== undefined) opts.doOCMed = Boolean(lvOCMed);
  if (lvOC75  !== undefined) opts.doOC75  = Boolean(lvOC75);

  const instFilter = pair
    ? WBT_INSTRUMENTS.filter(i => i.name === pair.toUpperCase())
    : undefined;

  const jobId     = `wbt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  _purgeStaleWbtJobs();
  wbtJobs.set(jobId, { status: 'running', startedAt });

  (async () => {
    try {
      const { trades, log } = await runFullWeeklyBacktest(opts, instFilter ?? WBT_INSTRUMENTS);

      if (!trades.length) {
        wbtJobs.set(jobId, { status: 'error', error: 'No trades generated', log, startedAt });
        return;
      }

      if (!fs.existsSync(WBT_DATA_DIR)) fs.mkdirSync(WBT_DATA_DIR, { recursive: true });
      const ts      = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 15);
      const outFile = path.join(WBT_DATA_DIR, `weekly_backtest_${ts}.json`);
      fs.writeFileSync(outFile, JSON.stringify(trades, null, 0) + '\n');

      wbtJobs.set(jobId, {
        status: 'done', startedAt,
        result: {
          ok:      true,
          message: `Weekly backtest complete — ${trades.filter(t => t.filled).length} filled trades`,
          log,
          file:    path.basename(outFile),
        },
      });
    } catch (e) {
      const msg = e?.message || String(e);
      console.error('[weekly-vol-backtest/run]', msg);
      wbtJobs.set(jobId, { status: 'error', error: msg, startedAt });
    }
  })();

  res.json({ ok: true, jobId });
});

app.get('/api/weekly-vol-backtest/status/:jobId', (req, res) => {
  const job = wbtJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, error: 'Job not found or expired' });
  if (job.status === 'running') {
    return res.json({ ok: true, status: 'running', elapsed: Math.round((Date.now() - job.startedAt) / 1000) });
  }
  if (job.status === 'done') return res.json({ ok: true, status: 'done', ...job.result });
  return res.status(500).json({ ok: false, status: 'error', error: job.error, log: job.log });
});

// Weekly backtest D1 candle viewer — fetches D1 bars from OANDA for a date range.
// Used by the chart modal in weekly-vol-backtest.html (M1 parquets may not cover 2025+).
const _wbtInstrMap = Object.fromEntries(WBT_INSTRUMENTS.map(i => [i.name.toLowerCase(), i.oanda]));

app.get('/api/weekly-vol-backtest/d1/:pair', async (req, res) => {
  const name  = req.params.pair.toLowerCase().replace(/[^a-z]/g, '');
  const oanda = _wbtInstrMap[name];
  if (!oanda) return res.status(404).json({ ok: false, error: `Unknown pair: ${name}` });
  if (!process.env.OANDA_KEY) return res.status(500).json({ ok: false, error: 'OANDA_KEY not set' });

  const { from, to } = req.query;
  const base = _oandaBaseW();
  let url = `${base}/v3/instruments/${encodeURIComponent(oanda)}/candles?granularity=D&price=M`;
  if (from) url += `&from=${encodeURIComponent(from + 'T00:00:00Z')}`;
  if (to)   url += `&to=${encodeURIComponent(to + 'T23:59:59Z')}`;
  if (!from && !to) url += '&count=20';

  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return res.status(502).json({ ok: false, error: `OANDA HTTP ${r.status}` });
    const data = await r.json();
    const candles = (data.candles ?? [])
      .filter(c => c.complete !== false && c.mid)
      .map(c => {
        const t = new Date(c.time);
        if (t.getUTCHours() >= 20) t.setUTCDate(t.getUTCDate() + 1);
        const date = t.toISOString().substring(0, 10);
        return { date, time: date, open: +c.mid.o, high: +c.mid.h, low: +c.mid.l, close: +c.mid.c };
      });
    res.json({ ok: true, pair: name, n: candles.length, candles });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Weekly backtest M15 candle viewer — same as D1 but at M15 granularity.
app.get('/api/weekly-vol-backtest/m15/:pair', async (req, res) => {
  const name  = req.params.pair.toLowerCase().replace(/[^a-z]/g, '');
  const oanda = _wbtInstrMap[name];
  if (!oanda) return res.status(404).json({ ok: false, error: `Unknown pair: ${name}` });
  if (!process.env.OANDA_KEY) return res.status(500).json({ ok: false, error: 'OANDA_KEY not set' });

  const { from, to } = req.query;
  const base = _oandaBaseW();
  let url = `${base}/v3/instruments/${encodeURIComponent(oanda)}/candles?granularity=M15&price=M`;
  if (from) url += `&from=${encodeURIComponent(from + 'T00:00:00Z')}`;
  if (to)   url += `&to=${encodeURIComponent(to   + 'T23:59:59Z')}`;
  if (!from && !to) url += '&count=200';

  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return res.status(502).json({ ok: false, error: `OANDA HTTP ${r.status}` });
    const data = await r.json();
    const candles = (data.candles ?? [])
      .filter(c => c.complete !== false && c.mid)
      .map(c => {
        const ts = Math.floor(new Date(c.time).getTime() / 1000);
        return { time: ts, open: +c.mid.o, high: +c.mid.h, low: +c.mid.l, close: +c.mid.c };
      });
    res.json({ ok: true, pair: name, n: candles.length, candles });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Level hit analysis — async job queue (same pattern as vol-backtest/run)
const laJobs = new Map();

function _purgeStaleLaJobs() {
  const cutoff = Date.now() - 60 * 60_000;
  for (const [id, job] of laJobs) if (job.startedAt < cutoff) laJobs.delete(id);
}

app.post('/api/vol-backtest/level-analysis', (req, res) => {
  const { dateFrom, dateTo, pair } = req.body ?? {};
  const opts = {
    dateFrom:    dateFrom ?? '',
    dateTo:      dateTo   ?? '',
    minLookback: 50,
    slopeThresh: 0.002,
  };
  const instFilter = pair
    ? BT_INSTRUMENTS.filter(i => i.name === pair)
    : BT_INSTRUMENTS;

  const jobId     = `la_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  _purgeStaleLaJobs();
  laJobs.set(jobId, { status: 'running', startedAt });

  // Fire-and-forget — response returns immediately with jobId
  (async () => {
    try {
      const { records, agg, log } = await runFullLevelAnalysis(opts, instFilter, BT_M1_DIR,
        (pair) => {
          const job = laJobs.get(jobId);
          if (job) laJobs.set(jobId, { ...job, currentPair: pair });
        });
      const instruments = [...new Set(records.map(r => r.instrument))];
      const byInstrument = Object.fromEntries(
        instruments.map(inst => [inst, aggregateLevelHits(records.filter(r => r.instrument === inst))])
      );
      laJobs.set(jobId, {
        status: 'done', startedAt,
        result: { agg, byInstrument, log, n: records.length },
      });
    } catch (e) {
      console.error('[level-analysis]', e.message);
      laJobs.set(jobId, { status: 'error', error: e.message, startedAt });
    }
  })();

  res.json({ ok: true, jobId });
});

app.get('/api/vol-backtest/level-analysis/status/:jobId', (req, res) => {
  const job = laJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, error: 'Job not found or expired' });
  if (job.status === 'running') {
    return res.json({ ok: true, status: 'running', elapsed: Math.round((Date.now() - job.startedAt) / 1000), currentPair: job.currentPair ?? null });
  }
  if (job.status === 'done') return res.json({ ok: true, status: 'done', ...job.result });
  return res.status(500).json({ ok: false, status: 'error', error: job.error });
});

// ── Asia Range Fibonacci Confluence Backtest ──────────────────────────────────

const ASIA_BT_DATA_DIR = path.join(__dirname, 'VolRangeForecaster', 'data', 'asia');

function _latestAsiaBtFile() {
  if (!fs.existsSync(ASIA_BT_DATA_DIR)) return null;
  const files = fs.readdirSync(ASIA_BT_DATA_DIR)
    .filter(f => f.startsWith('asia_bt_') && f.endsWith('.json'))
    .sort().reverse();
  return files.length ? path.join(ASIA_BT_DATA_DIR, files[0]) : null;
}

const arJobs = new Map();

function _purgeStaleArJobs() {
  const cutoff = Date.now() - 60 * 60_000;
  for (const [id, job] of arJobs) if (job.startedAt < cutoff) arJobs.delete(id);
}

app.post('/api/asia-range-backtest/run', (req, res) => {
  const {
    dateFrom = '', dateTo = '', pair = '',
    confluencePips = '2.0', tightPct = '10',
    levelFilter = 'tight', levelSource = 'asia', tradeZone = 'outside',
    slMult = '0.5', tpMode = '0.5',
    tradeHourFrom = '6', tradeHourTo = '14',
    showMonday = 'true',
    // New: ATR-based SL/TP
    slMode = 'range_mult',
    atrSlMult = '1.5', atrTpMult = '2.0', atrPeriods = '14',
    // New: confluence modules
    zoneRadiusPips = '3',
    minConfluenceScore = '0',
    confluenceModules: confModsCfg = {},
    // Indicator OB/OS thresholds
    zScoreBuyThresh  = '-1.5', zScoreSellThresh = '1.5',  zScoreLength = '20',
    smiBuyThresh     = '-40',  smiSellThresh    = '40',   smiKLength   = '10',
    // Confluence Priority mode
    confluencePriorityMode = 'false', priorityTopN = '5',
    // WaveTrend at-touch confirmation
    wtConfirmMode    = 'false', wtDivergenceMode = 'false',
    wtBuyThresh      = '-40',   wtSellThresh     = '40',
    wtN1             = '10',    wtN2             = '21',    wtDivLookback = '30',
  } = req.body || {};

  // Build enabled module list from the registry
  const confluenceMods = CONFLUENCE_MODULES.filter(m => {
    const v = confModsCfg[m.id];
    return v === true || v === 'true';
  });

  const opts = {
    dateFrom, dateTo,
    confluenceThreshPips: parseFloat(confluencePips) || 2.0,
    tightPct:             parseFloat(tightPct)       || 10.0,
    levelFilter,
    levelSource,
    tradeZone,
    slMult:               parseFloat(slMult)         || 0.5,
    tpMode,
    tradeHourFrom:        parseInt(tradeHourFrom)    || 6,
    tradeHourTo:          parseInt(tradeHourTo)      || 14,
    showMonday:           showMonday !== 'false',
    slMode,
    atrSlMult:            parseFloat(atrSlMult)      || 1.5,
    atrTpMult:            parseFloat(atrTpMult)      || 2.0,
    atrPeriods:           parseInt(atrPeriods)        || 14,
    zoneRadiusPips:       parseFloat(zoneRadiusPips)  || 3,
    minConfluenceScore:   parseFloat(minConfluenceScore) || 0,
    confluenceMods,
    // Indicator OB/OS thresholds
    zScoreBuyThresh:   parseFloat(zScoreBuyThresh)  || -1.5,
    zScoreSellThresh:  parseFloat(zScoreSellThresh) ||  1.5,
    zScoreLength:      parseInt(zScoreLength)        ||  20,
    smiBuyThresh:      parseFloat(smiBuyThresh)      || -40,
    smiSellThresh:     parseFloat(smiSellThresh)     ||  40,
    smiKLength:        parseInt(smiKLength)           ||  10,
    // Confluence Priority mode
    confluencePriorityMode: confluencePriorityMode === 'true',
    priorityTopN:           parseInt(priorityTopN)   ||  5,
    // WaveTrend at-touch confirmation
    wtConfirmMode:    wtConfirmMode    === 'true',
    wtDivergenceMode: wtDivergenceMode === 'true',
    wtBuyThresh:      parseFloat(wtBuyThresh)  || -40,
    wtSellThresh:     parseFloat(wtSellThresh) ||  40,
    wtN1:             parseInt(wtN1)            ||  10,
    wtN2:             parseInt(wtN2)            ||  21,
    wtDivLookback:    parseInt(wtDivLookback)   ||  30,
  };

  const pairsToRun = pair
    ? [pair.toLowerCase()].filter(p => ASIA_INSTRUMENTS.includes(p))
    : ASIA_INSTRUMENTS;

  if (!pairsToRun.length) {
    return res.status(400).json({ ok: false, error: `Unknown pair: ${pair}` });
  }

  const jobId     = `ar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  _purgeStaleArJobs();
  arJobs.set(jobId, { status: 'running', startedAt });

  (async () => {
    try {
      let currentPair = null;
      const { trades, log } = await runFullAsiaRangeBacktest(
        {
          ...opts,
          onProgress: ({ pair: p, i, total }) => {
            currentPair = p;
            const job = arJobs.get(jobId);
            if (job) arJobs.set(jobId, { ...job, currentPair: p, pairsDone: i, pairsTotal: total });
          },
        },
        pairsToRun,
        BT_M1_DIR,
      );

      if (!trades.length) {
        arJobs.set(jobId, { status: 'error', error: 'No trades generated — check M1 data availability', log, startedAt });
        return;
      }

      if (!fs.existsSync(ASIA_BT_DATA_DIR)) fs.mkdirSync(ASIA_BT_DATA_DIR, { recursive: true });
      const ts      = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 15);
      const outFile = path.join(ASIA_BT_DATA_DIR, `asia_bt_${ts}.json`);
      fs.writeFileSync(outFile, JSON.stringify(trades, null, 0) + '\n');

      arJobs.set(jobId, {
        status: 'done', startedAt,
        result: {
          ok:      true,
          message: `Asia Range backtest complete — ${trades.filter(t => t.filled).length} filled trades`,
          log,
          file:    path.basename(outFile),
        },
      });
    } catch (e) {
      const msg = e?.message || String(e) || 'Unknown engine error';
      console.error('[asia-range-backtest/run]', msg, e?.stack ?? '');
      arJobs.set(jobId, { status: 'error', error: msg, startedAt });
    }
  })();

  res.json({ ok: true, jobId });
});

app.get('/api/asia-range-backtest/status/:jobId', (req, res) => {
  const job = arJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, error: 'Job not found or expired' });
  if (job.status === 'running') {
    return res.json({ ok: true, status: 'running',
      elapsed:     Math.round((Date.now() - job.startedAt) / 1000),
      currentPair: job.currentPair  ?? null,
      pairsDone:   job.pairsDone   ?? 0,
      pairsTotal:  job.pairsTotal  ?? null });
  }
  if (job.status === 'done') return res.json({ ok: true, status: 'done', ...job.result });
  return res.status(500).json({ ok: false, status: 'error', error: job.error, log: job.log });
});

app.get('/api/asia-range-backtest/trades', (_req, res) => {
  const file = _latestAsiaBtFile();
  if (!file) return res.json({ ok: false, error: 'No Asia Range backtest results found — run a backtest first' });
  try {
    const raw    = fs.readFileSync(file, 'utf8');
    const trades = JSON.parse(raw);
    res.json({ ok: true, trades, file: path.basename(file) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Range-Fib Backtest (STRIPPED) ─────────────────────────────────────────────
// The bare range-extension strategy — no confluence, no indicators, no modules.
// One pair, synchronous (M1 is cached after first load). Engine: js/rangeFibEngine.js
app.get('/api/range-fib/meta', (_req, res) => {
  res.json({ ok: true, instruments: RANGE_FIB_INSTRUMENTS, fibLevels: RANGE_FIB_LEVELS });
});

app.post('/api/range-fib/run', async (req, res) => {
  const b = req.body || {};
  const pair = String(b.pair || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!RANGE_FIB_INSTRUMENTS.includes(pair)) {
    return res.status(400).json({ ok: false, error: `Unknown pair: ${b.pair}` });
  }
  const opts = {
    dateFrom:      b.dateFrom || '',
    dateTo:        b.dateTo   || '',
    levelSource:   b.levelSource || 'asia',          // 'asia' | 'monday' | 'both'
    tradeZone:     b.tradeZone   || 'outside',       // 'outside' | 'both'
    enabledFibs:   Array.isArray(b.enabledFibs) ? b.enabledFibs.map(Number) : null,
    slMult:        b.slMult       != null ? parseFloat(b.slMult)       : 0.5,
    minSlPips:     b.minSlPips     != null ? parseFloat(b.minSlPips)     : 5,
    tpMode:        b.tpMode || 'structural',         // 'structural' | 'rr' | 'midpoint'
    tpR:           b.tpR          != null ? parseFloat(b.tpR)           : 2.0,
    tpBufPips:     b.tpBufPips     != null ? parseFloat(b.tpBufPips)     : 5,
    tradeHourFrom: b.tradeHourFrom != null ? parseInt(b.tradeHourFrom)  : 6,
    tradeHourTo:   b.tradeHourTo   != null ? parseInt(b.tradeHourTo)    : 22,
    spreadPips:    b.spreadPips    != null ? parseFloat(b.spreadPips)    : 0.8,
    slippagePips:  b.slippagePips  != null ? parseFloat(b.slippagePips)  : 0.5,
    // Confluence filter (mirrors indicator Display Mode)
    confluenceMode:       b.confluenceMode || 'all',          // 'all' | 'strong' | 'strongest'
    confluenceThreshPips: b.confluenceThreshPips != null ? parseFloat(b.confluenceThreshPips) : null,
    tightPct:             b.tightPct        != null ? parseFloat(b.tightPct)        : 10,
    confluencePrice:      b.confluencePrice || 'lowest',      // 'lowest' | 'highest' | 'midpoint'
    // Stop mode + session timezone + Monday timeframe (overlooked indicator features)
    slMode:        b.slMode || 'range',                       // 'range' | 'atr'
    atrPeriod:     b.atrPeriod  != null ? parseInt(b.atrPeriod)    : 14,
    atrMult:       b.atrMult    != null ? parseFloat(b.atrMult)    : 1.5,
    atrTfMin:      b.atrTfMin   != null ? parseInt(b.atrTfMin)     : 30,
    sessionTz:     b.sessionTz || 'london',                   // 'london' (faithful) | 'utc'
    mondayTfMin:   b.mondayTfMin != null ? parseInt(b.mondayTfMin) : 15,
  };
  try {
    const { trades, stats, params } = await runRangeFibBacktest(pair, opts, BT_M1_DIR);
    res.json({ ok: true, pair, trades, stats, params });
  } catch (e) {
    console.error('[range-fib/run]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Yield Spread Z-Score Backtest ─────────────────────────────────────────────
// USDJPY/EURUSD mean-reversion into the Asia range, triggered by a rolling
// yield-spread z-score overshoot. Engine: js/zscoreSpreadEngine.js

const ZS_BT_DATA_DIR = path.join(__dirname, 'VolRangeForecaster', 'data', 'zscore');

function _latestZsBtFile() {
  if (!fs.existsSync(ZS_BT_DATA_DIR)) return null;
  const files = fs.readdirSync(ZS_BT_DATA_DIR)
    .filter(f => f.startsWith('zscore_bt_') && f.endsWith('.json'))
    .sort().reverse();
  return files.length ? path.join(ZS_BT_DATA_DIR, files[0]) : null;
}

const zsJobs = new Map();

function _purgeStaleZsJobs() {
  const cutoff = Date.now() - 60 * 60_000;
  for (const [id, job] of zsJobs) if (job.startedAt < cutoff) zsJobs.delete(id);
}

app.post('/api/zscore-backtest/run', (req, res) => {
  if (!process.env.FRED_KEY) {
    return res.status(500).json({ ok: false, error: 'FRED_KEY not set — cannot fetch yield spread data' });
  }
  const {
    dateFrom = '', dateTo = '', pair = '',
    zWindow = '90', fibLevelMode = 'all', entryWindow = '6', zCeiling = '',
    thresholds = {}, invert = {},
  } = req.body || {};

  const opts = {
    dateFrom: dateFrom || undefined, dateTo: dateTo || undefined,
    zWindow:      parseInt(zWindow)      || 90,
    fibLevelMode,
    entryWindow:  parseInt(entryWindow)  || 6,
    zCeiling:     parseFloat(zCeiling)   || Infinity,
    thresholds: Object.fromEntries(Object.keys(ZSCORE_PAIRS).map(k =>
      [k, parseFloat(thresholds[k]) || ZSCORE_PAIRS[k].defaultThreshold])),
    invert: Object.fromEntries(Object.keys(ZSCORE_PAIRS).map(k =>
      [k, invert[k] === true || invert[k] === 'true'])),
  };

  const pairsToRun = pair
    ? [pair.toLowerCase()].filter(p => ZSCORE_PAIRS[p])
    : Object.keys(ZSCORE_PAIRS);

  if (!pairsToRun.length) {
    return res.status(400).json({ ok: false, error: `Unknown pair: ${pair}` });
  }

  const jobId     = `zs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  _purgeStaleZsJobs();
  zsJobs.set(jobId, { status: 'running', startedAt });

  (async () => {
    try {
      const { trades, perPair, combined, log } = await runFullZScoreBacktest(opts, pairsToRun);

      if (!trades.length) {
        zsJobs.set(jobId, { status: 'error', error: 'No trades generated — check date range, M1 data, and FRED_KEY', log, startedAt });
        return;
      }

      if (!fs.existsSync(ZS_BT_DATA_DIR)) fs.mkdirSync(ZS_BT_DATA_DIR, { recursive: true });
      const ts      = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 15);
      const outFile = path.join(ZS_BT_DATA_DIR, `zscore_bt_${ts}.json`);
      fs.writeFileSync(outFile, JSON.stringify({ trades, perPair, combined, opts }, null, 0) + '\n');

      zsJobs.set(jobId, {
        status: 'done', startedAt,
        result: {
          ok: true,
          message: `Z-Score backtest complete — ${trades.length} trades`,
          perPair, combined, log,
          file: path.basename(outFile),
        },
      });
    } catch (e) {
      const msg = e?.message || String(e) || 'Unknown engine error';
      console.error('[zscore-backtest/run]', msg, e?.stack ?? '');
      zsJobs.set(jobId, { status: 'error', error: msg, startedAt });
    }
  })();

  res.json({ ok: true, jobId });
});

app.get('/api/zscore-backtest/status/:jobId', (req, res) => {
  const job = zsJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, error: 'Job not found or expired' });
  if (job.status === 'running') {
    return res.json({ ok: true, status: 'running', elapsed: Math.round((Date.now() - job.startedAt) / 1000) });
  }
  if (job.status === 'done') return res.json({ ok: true, status: 'done', ...job.result });
  return res.status(500).json({ ok: false, status: 'error', error: job.error, log: job.log });
});

app.get('/api/zscore-backtest', (_req, res) => {
  const file = _latestZsBtFile();
  if (!file) return res.status(404).json({ ok: false, error: 'No Z-Score backtest results found — run a backtest first' });
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    res.json({ ok: true, perPair: data.perPair, combined: data.combined, opts: data.opts, file: path.basename(file) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/zscore-backtest/trades', (_req, res) => {
  const file = _latestZsBtFile();
  if (!file) return res.json({ ok: false, error: 'No Z-Score backtest results found — run a backtest first' });
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    res.json({ ok: true, trades: data.trades, file: path.basename(file) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/zscore-backtest/candles/:pair', async (req, res) => {
  const pair = req.params.pair.toLowerCase().replace(/[^a-z0-9]/g, '');
  const { from, to } = req.query;
  try {
    if (!m1CandleCache.has(pair)) {
      if (m1CandleCache.size >= M1_CACHE_MAX) {
        m1CandleCache.delete(m1CandleCache.keys().next().value);
      }
      const packed = await loadM1ForPair(pair);
      if (!packed) return res.status(404).json({ ok: false, error: `No M1 data for ${pair} — check R2 credentials or local parquet files` });
      m1CandleCache.set(pair, packed);
    }
    const packed = m1CandleCache.get(pair);
    const { n, times, opens, highs, lows, closes } = packed;

    const fromTs = from ? Math.floor(new Date(from + 'T00:00:00Z').getTime() / 1000) : 0;
    const toTs   = to   ? Math.floor(new Date(to   + 'T23:59:59Z').getTime() / 1000) : 2_000_000_000;
    const candles = [];
    for (let i = 0; i < n && candles.length < 20000; i++) {
      const t = times[i];
      if (t >= fromTs && t <= toTs) {
        candles.push({ time: new Date(t * 1000).toISOString().substring(0, 19), open: opens[i], high: highs[i], low: lows[i], close: closes[i] });
      }
    }
    res.json({ ok: true, pair, n: candles.length, candles });
  } catch (e) {
    console.error('[zscore-backtest/candles]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/zscore-backtest/diagnose', (_req, res) => {
  const m1 = _m1CacheStatus();
  res.json({
    ok: true,
    fredKey: !!process.env.FRED_KEY,
    r2:      !!(process.env.R2_ACCESS_KEY && process.env.R2_SECRET_KEY),
    m1Cached: Object.fromEntries(Object.keys(ZSCORE_PAIRS).map(k =>
      [k, m1.pairs.includes(ZSCORE_PAIRS[k].label)])),
  });
});

app.get('/api/zscore-backtest/pairs', (_req, res) => {
  res.json({
    ok: true,
    pairs: Object.fromEntries(Object.entries(ZSCORE_PAIRS).map(([k, v]) =>
      [k, { label: v.label, pairDisplay: v.pairDisplay, defaultThreshold: v.defaultThreshold }])),
  });
});

// ── NASDAQ Liquidity Continuation Framework ───────────────────────────────────
// Four-gate daily backtest (Liquidity → Trend → NY Confirmation → Dynamic
// Exit) built from scratch in js/nasdaq*.js — see those files' headers for
// the full design rationale. This route group is wiring only: it loads a
// dataset, runs the engine, attaches performance/robustness/research
// reports, and persists the result so the dashboard survives a page reload.

const NLC_BT_DATA_DIR = path.join(__dirname, 'VolRangeForecaster', 'data', 'nasdaq-liquidity');

// JSON.stringify silently turns Infinity/-Infinity into null, which is
// indistinguishable from "no data" (NaN also serializes to null). Several
// nasdaqPerformance.js stats (profitFactor, omega) are legitimately Infinity
// when a sample has zero losing trades, so cap them to a finite sentinel
// before persisting — same convention as the existing /api/.../stats route
// (see `pf === Infinity ? 999 : ...` above).
function _capInfinity(value) {
  if (typeof value === 'number') {
    if (value === Infinity) return 999;
    if (value === -Infinity) return -999;
    return value;
  }
  if (Array.isArray(value)) return value.map(_capInfinity);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = _capInfinity(v);
    return out;
  }
  return value;
}

function _latestNlcBtFile() {
  if (!fs.existsSync(NLC_BT_DATA_DIR)) return null;
  const files = fs.readdirSync(NLC_BT_DATA_DIR)
    .filter(f => f.startsWith('nlc_bt_') && f.endsWith('.json'))
    .sort().reverse();
  return files.length ? path.join(NLC_BT_DATA_DIR, files[0]) : null;
}

const nlcJobs = new Map();

function _purgeStaleNlcJobs() {
  const cutoff = Date.now() - 60 * 60_000;
  for (const [id, job] of nlcJobs) if (job.startedAt < cutoff) nlcJobs.delete(id);
}

app.post('/api/nasdaq-liquidity/run', express.json({ limit: '1mb' }), (req, res) => {
  const body = req.body || {};
  const synthetic = body.synthetic === true || body.synthetic === 'true';

  if (!synthetic && !process.env.FRED_KEY) {
    return res.status(400).json({ ok: false,
      error: 'FRED_KEY not set — add it to Railway env vars, or pass synthetic:true to exercise the pipeline on the built-in synthetic dataset' });
  }

  const start = body.start || NASDAQ_DATA_DEFAULTS.backtestStart;
  const end = body.end || undefined;

  const jobId = `nlc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  _purgeStaleNlcJobs();
  nlcJobs.set(jobId, { status: 'running', startedAt, phase: synthetic ? 'Generating synthetic dataset…' : 'Fetching FRED & Yahoo data…' });

  (async () => {
    try {
      const dataset = await loadNasdaqDataset({ start, end, synthetic });
      nlcJobs.get(jobId).phase = 'Running 4-gate backtest…';

      const result = runNasdaqBacktest(dataset);

      nlcJobs.get(jobId).phase = 'Computing performance & robustness reports…';
      const performance = computeNasdaqPerformanceReport({ dates: result.dates, equityCurve: result.equityCurve, trades: result.trades });
      const monteCarlo = nasdaqMonteCarloBootstrap(result.trades);
      const walkForward = nasdaqWalkForwardStability({ dates: result.dates, equityCurve: result.equityCurve, trades: result.trades });
      const outOfSample = nasdaqOutOfSampleSplit({ dates: result.dates, equityCurve: result.equityCurve, trades: result.trades });

      nlcJobs.get(jobId).phase = 'Running research suite…';
      const research = runNasdaqResearchSuite({ closes: dataset.ohlc.close, gate1: result.gate1, indicators: result.indicators });

      const payload = _capInfinity({
        runAt: new Date().toISOString(),
        synthetic: !!dataset.synthetic,
        dateRange: { start: result.dates[0] ?? null, end: result.dates[result.dates.length - 1] ?? null },
        gate1: result.gate1, gate2: result.gate2, trades: result.trades, eventLog: result.eventLog,
        equityCurve: result.dates.map((d, i) => ({ date: d, equity: result.equityCurve[i] })),
        secondaryExitComparison: result.secondaryExitComparison,
        gate1Diagnostic: result.gate1Diagnostic,
        performance, monteCarlo, walkForward, outOfSample, research,
      });

      if (!fs.existsSync(NLC_BT_DATA_DIR)) fs.mkdirSync(NLC_BT_DATA_DIR, { recursive: true });
      const ts = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 15);
      const outFile = path.join(NLC_BT_DATA_DIR, `nlc_bt_${ts}.json`);
      fs.writeFileSync(outFile, JSON.stringify(payload, null, 0) + '\n');

      nlcJobs.set(jobId, {
        status: 'done', startedAt,
        result: { ok: true, data: payload, file: path.basename(outFile) },
      });
      console.log(`[nasdaq-liquidity] job ${jobId} done (${Math.round((Date.now() - startedAt) / 1000)}s) — ${result.trades.length} trades`);
    } catch (e) {
      const msg = e?.message || String(e) || 'Unknown engine error';
      console.error('[nasdaq-liquidity/run]', msg, e?.stack ?? '');
      nlcJobs.set(jobId, { status: 'error', error: msg, startedAt });
    }
  })();

  res.json({ ok: true, jobId });
});

app.get('/api/nasdaq-liquidity/config', (_req, res) => {
  res.json({ ok: true, hasFredKey: !!process.env.FRED_KEY });
});

app.get('/api/nasdaq-liquidity/status/:jobId', (req, res) => {
  const job = nlcJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, error: 'Job not found or expired' });
  if (job.status === 'running') {
    return res.json({ ok: true, status: 'running',
      elapsed: Math.round((Date.now() - job.startedAt) / 1000),
      phase: job.phase ?? 'Running…' });
  }
  if (job.status === 'done') return res.json({ ok: true, status: 'done', ...job.result });
  return res.status(500).json({ ok: false, status: 'error', error: job.error });
});

app.get('/api/nasdaq-liquidity/results', (_req, res) => {
  const file = _latestNlcBtFile();
  if (!file) return res.json({ ok: false, error: 'No NASDAQ Liquidity Continuation backtest results found — run a backtest first' });
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    res.json({ ok: true, data, file: path.basename(file) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Nasdaq Macro Threshold Engine (COG-inspired 4-gate system) ────────────────
// Phase 2/3 wiring: /run defaults to real FRED/Yahoo data via fetchRealCogDataset
// (js/cogDataSources.js), with an explicit dataMode:'synthetic' opt-out for the
// Phase 1 self-test path. Same async job/status/results pattern as the NASDAQ
// Liquidity Continuation group above, persisted separately so the two systems'
// run histories never mix.

const COG_BT_DATA_DIR = path.join(__dirname, 'VolRangeForecaster', 'data', 'cog-threshold');

// Per-bar classification frequency for each gate, e.g. {BULLISH:0.41,
// BEARISH:0.33, NEUTRAL:0.26} — explains the Backtest Lab's "why so few
// trades" question (a trade needs Gate 1/2/3 to align on the same bar) without
// shipping the full per-bar gate detail (reasons/contributions/breakdown) over
// the wire, which would multiply payload size by ~3x for no UI benefit here.
function _frequency(arr, getKey) {
  const n = arr.length;
  const counts = {};
  for (const x of arr) {
    const k = getKey(x);
    counts[k] = (counts[k] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, n > 0 ? v / n : 0]));
}

function _gateHitRateSummary(gate1, gate2, gate3, gate4) {
  return {
    barCount: gate1.length,
    gate1: _frequency(gate1, g => g.state),
    gate2: _frequency(gate2, g => g.dataValid ? (g.valid ? 'VALID' : 'INVALID') : 'INVALID_DATA'),
    gate3: _frequency(gate3, g => g.state),
    gate4: _frequency(gate4, g => g.action),
  };
}

// Event-driven engine's gate hit-rate summary: gate2/gate3 are
// daily-resolution (one entry per tradingDay, see cogEventBacktestEngine.js).
// Threshold 1 (replaces the old Gate1A+Gate1B hard conjunction — see
// cogThreshold1Gate.js) is genuinely intraday — so its hit rate is reported
// at the single window-end bar each day actually decides off (the last bar
// in day.gate1bBars), not averaged across every intraday bar, which would
// overweight days with more bars in the window. There is no single "gate4"
// per-bar array in this engine (the decision is logged per trading day in
// events[] instead), so this intentionally has a different shape than
// _gateHitRateSummary above rather than forcing a fake gate4 series.
function _eventGateHitRateSummary(result) {
  const { threshold1, gate2, gate3, tradingDays } = result;
  const threshold1AtWindowEnd = tradingDays.map(day =>
    day.gate1bBars.length ? threshold1[day.gate1bBars[day.gate1bBars.length - 1]] : { state: 'INVALID' });
  return {
    dayCount: tradingDays.length,
    threshold1: _frequency(threshold1AtWindowEnd, g => g.state),
    gate2: _frequency(gate2, g => g.dataValid ? (g.valid ? 'VALID' : 'INVALID') : 'INVALID_DATA'),
    gate3: _frequency(gate3, g => g.state),
  };
}

// nasdaqPerformance.js's report functions assume `dates`/`equityCurve` are
// ONE ENTRY PER TRADING DAY (TRADING_DAYS=252 annualization, tradesPerWeek's
// /5 divisor, etc. — see cogConfig.js/nasdaqPerformance.js headers). The
// event engine's own equityCurve is intraday-bar-resolution instead, so
// feeding it straight in would silently corrupt every annualized stat by
// ~(bars/day)x — the exact same axis bug already fixed for Gate1A/2/3.
// This resamples to one value per trading day (that day's LAST bar, i.e.
// the day's closing equity) before any report function ever sees it.
function _dailyEquitySeriesFromEvent(result) {
  const dates = [], equity = [], equityDollars = [];
  for (const day of result.tradingDays) {
    if (!day.bars.length) continue;
    const lastBar = day.bars[day.bars.length - 1];
    dates.push(day.date);
    equity.push(result.equityCurve[lastBar]);
    equityDollars.push(result.equityCurveDollars[lastBar]);
  }
  return { dates, equity, equityDollars };
}

// walkForwardStability/outOfSampleSplit slice trades into calendar windows
// by comparing t.entryIndex against indices into the (here, day-resampled)
// dates/equityCurve array — but the event engine's trades carry an INTRADAY
// bar entryIndex, not a day index, so that comparison would silently
// misassign every trade. Returns shallow trade clones with entryIndex
// remapped to the day-ordinal position matching `dayIndexByDate` (built
// from the exact resampled `dates` array the report functions receive) —
// only for feeding those report functions; the Trade Journal UI keeps using
// the original intraday-resolution trades from the engine's own output.
function _tradesWithDayIndex(trades, dayIndexByDate) {
  return trades.map(t => ({ ...t, entryIndex: dayIndexByDate.get(t.entryDate) ?? t.entryIndex }));
}

function _latestCogBtFile() {
  if (!fs.existsSync(COG_BT_DATA_DIR)) return null;
  const files = fs.readdirSync(COG_BT_DATA_DIR)
    .filter(f => f.startsWith('cog_bt_') && f.endsWith('.json'))
    .sort().reverse();
  return files.length ? path.join(COG_BT_DATA_DIR, files[0]) : null;
}

const cogJobs = new Map();

function _purgeStaleCogJobs() {
  const cutoff = Date.now() - 60 * 60_000;
  for (const [id, job] of cogJobs) if (job.startedAt < cutoff) cogJobs.delete(id);
}

app.post('/api/cog-threshold/run', express.json({ limit: '1mb' }), (req, res) => {
  const body = req.body || {};
  const start = body.start || COG_DATA_DEFAULTS_CFG.backtestStart;
  const end = body.end || undefined;
  const seed = Number.isFinite(+body.seed) ? +body.seed : 42;
  const accountEquity = Number.isFinite(+body.accountEquity) ? +body.accountEquity : 100000;
  const instrumentKey = body.instrumentKey || undefined;
  const stopModelId = body.stopModelId || undefined;
  const requestedTier = body.requestedTier || undefined;
  // Event-driven intraday engine has no real-data loader yet (see
  // cogEventBacktestEngine.js header) — it's synthetic-only until one is
  // built, so dataMode is forced regardless of what the client sent.
  const engine = body.engine === 'event' ? 'event' : 'daily';
  const dataMode = engine === 'event' ? 'synthetic' : (body.dataMode === 'synthetic' ? 'synthetic' : 'real');

  const jobId = `cog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  _purgeStaleCogJobs();
  cogJobs.set(jobId, {
    status: 'running', startedAt,
    phase: engine === 'event' ? 'Generating synthetic intraday dataset…' : (dataMode === 'real' ? 'Fetching real FRED/Yahoo data…' : 'Generating synthetic dataset…'),
  });

  (async () => {
    try {
      let payload;
      if (engine === 'event') {
        const dataset = generateSyntheticIntradayCogDataset({ start, end, seed });
        cogJobs.get(jobId).phase = 'Running event-driven intraday backtest…';
        const result = runCogEventBacktest(dataset, { accountEquity, instrumentKey, stopModelId, requestedTier });

        cogJobs.get(jobId).phase = 'Computing performance & robustness reports…';
        const daily = _dailyEquitySeriesFromEvent(result);
        const dayIndexByDate = new Map(daily.dates.map((d, i) => [d, i]));
        const reportTrades = _tradesWithDayIndex(result.trades, dayIndexByDate);
        const performance = computeCogPerformanceReport({ dates: daily.dates, equityCurve: daily.equity, trades: reportTrades });
        const monteCarlo = cogMonteCarloBootstrap(reportTrades);
        const walkForward = cogWalkForwardStability({ dates: daily.dates, equityCurve: daily.equity, trades: reportTrades });
        const outOfSample = cogOutOfSampleSplit({ dates: daily.dates, equityCurve: daily.equity, trades: reportTrades });
        const gateHitRates = _eventGateHitRateSummary(result);

        payload = _capInfinity({
          runAt: new Date().toISOString(),
          synthetic: true,
          engine: 'event',
          dateRange: { start: result.dates[0] ?? null, end: result.dates[result.dates.length - 1] ?? null },
          options: { dataMode, seed, accountEquity, instrumentKey: instrumentKey || 'primary', stopModelId: stopModelId || COG_EXECUTION.defaultStopModel, requestedTier: requestedTier || COG_EXECUTION.defaultTier },
          trades: result.trades,
          equityCurve: daily.dates.map((d, i) => ({ date: d, equity: daily.equity[i], equityDollars: daily.equityDollars[i] })),
          events: result.events,
          intradayBarCount: result.dates.length,
          performance, monteCarlo, walkForward, outOfSample, gateHitRates,
        });
      } else {
        const dataset = dataMode === 'real'
          ? await fetchRealCogDataset({ start, end })
          : generateSyntheticCogDataset({ start, end, seed });
        cogJobs.get(jobId).phase = 'Running 4-gate backtest + Exit Engine…';

        const result = runCogBacktest(dataset, { accountEquity, instrumentKey, stopModelId, requestedTier });

        cogJobs.get(jobId).phase = 'Computing performance & robustness reports…';
        const performance = computeCogPerformanceReport({ dates: result.dates, equityCurve: result.equityCurve, trades: result.trades });
        const monteCarlo = cogMonteCarloBootstrap(result.trades);
        const walkForward = cogWalkForwardStability({ dates: result.dates, equityCurve: result.equityCurve, trades: result.trades });
        const outOfSample = cogOutOfSampleSplit({ dates: result.dates, equityCurve: result.equityCurve, trades: result.trades });
        const gateHitRates = _gateHitRateSummary(result.gate1, result.gate2, result.gate3, result.gate4);

        payload = _capInfinity({
          runAt: new Date().toISOString(),
          synthetic: dataset.synthetic,
          engine: 'daily',
          dateRange: { start: result.dates[0] ?? null, end: result.dates[result.dates.length - 1] ?? null },
          options: { dataMode, seed, accountEquity, instrumentKey: instrumentKey || 'primary', stopModelId: stopModelId || COG_EXECUTION.defaultStopModel, requestedTier: requestedTier || COG_EXECUTION.defaultTier },
          trades: result.trades,
          equityCurve: result.dates.map((d, i) => ({ date: d, equity: result.equityCurve[i], equityDollars: result.equityCurveDollars[i] })),
          performance, monteCarlo, walkForward, outOfSample, gateHitRates,
        });
      }

      if (!fs.existsSync(COG_BT_DATA_DIR)) fs.mkdirSync(COG_BT_DATA_DIR, { recursive: true });
      const ts = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 15);
      const outFile = path.join(COG_BT_DATA_DIR, `cog_bt_${ts}.json`);
      fs.writeFileSync(outFile, JSON.stringify(payload, null, 0) + '\n');

      cogJobs.set(jobId, {
        status: 'done', startedAt,
        result: { ok: true, data: payload, file: path.basename(outFile) },
      });
      console.log(`[cog-threshold] job ${jobId} done (${Math.round((Date.now() - startedAt) / 1000)}s, engine=${engine}) — ${payload.trades.length} trades`);
    } catch (e) {
      const msg = e?.message || String(e) || 'Unknown engine error';
      console.error('[cog-threshold/run]', msg, e?.stack ?? '');
      cogJobs.set(jobId, { status: 'error', error: msg, startedAt });
    }
  })();

  res.json({ ok: true, jobId });
});

app.get('/api/cog-threshold/status/:jobId', (req, res) => {
  const job = cogJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, error: 'Job not found or expired' });
  if (job.status === 'running') {
    return res.json({ ok: true, status: 'running',
      elapsed: Math.round((Date.now() - job.startedAt) / 1000),
      phase: job.phase ?? 'Running…' });
  }
  if (job.status === 'done') return res.json({ ok: true, status: 'done', ...job.result });
  return res.status(500).json({ ok: false, status: 'error', error: job.error });
});

app.get('/api/cog-threshold/results', (_req, res) => {
  const file = _latestCogBtFile();
  if (!file) return res.json({ ok: false, error: 'No Nasdaq Macro Threshold Engine backtest results found — run a backtest first' });
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    res.json({ ok: true, data, file: path.basename(file) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Exposes the gate/exit/execution config the UI renders threshold/weight
// breakdowns from, so the dashboard never hardcodes a second copy of numbers
// that already live in js/cogConfig.js ("no black boxes" applies to the UI
// too — every weight/threshold shown must trace back to this one source).
app.get('/api/cog-threshold/config', (_req, res) => {
  res.json({
    ok: true,
    liquidity: COG_LIQUIDITY_1A_SCORE,
    risk: COG_RISK_SCORE,
    direction: COG_DIRECTION_SCORE,
    exit: COG_EXIT_SCORE,
    riskTiers: COG_RISK_TIERS,
    stopModels: COG_STOP_MODELS,
    execution: COG_EXECUTION,
    dataDefaults: COG_DATA_DEFAULTS_CFG,
    intradaySchedule: COG_INTRADAY_SCHEDULE,
  });
});

// Builds a same-length-as-trades-but-windowed event log: gate-STATE-CHANGE
// events (not every bar — only transitions, so a 90-day window doesn't spam
// "still BULLISH" 90 times) interleaved with trade open/close events, sorted
// by date. Powers the Live Monitor's Event Timeline without the client
// needing the full per-bar gate series.
function _cogEventTimeline(dates, gate1, gate2, gate3, trades, lookbackBars) {
  const n = dates.length;
  const startIdx = Math.max(0, n - lookbackBars);
  const startDate = dates[startIdx];
  const events = [];
  let prevG1 = null, prevG3 = null, prevG2Valid = null;
  for (let i = startIdx; i < n; i++) {
    const g1 = gate1[i].state;
    const g3 = gate3[i].state;
    const g2v = gate2[i].dataValid ? (gate2[i].valid ? 'VALID' : 'INVALID') : 'INVALID_DATA';
    if (i > startIdx) {
      if (g1 !== prevG1) events.push({ date: dates[i], type: 'GATE1_STATE', detail: `Gate 1 (Liquidity) → ${g1}` });
      if (g3 !== prevG3) events.push({ date: dates[i], type: 'GATE3_STATE', detail: `Gate 3 (Direction) → ${g3}` });
      if (g2v !== prevG2Valid) events.push({ date: dates[i], type: 'GATE2_STATE', detail: `Gate 2 (Risk) → ${g2v}` });
    }
    prevG1 = g1; prevG3 = g3; prevG2Valid = g2v;
  }
  for (const t of trades) {
    if (t.entryDate >= startDate) {
      events.push({ date: t.entryDate, type: 'TRADE_OPEN', detail: `${t.direction} opened @ ${t.entryPrice.toFixed(2)} (${t.tier}/${t.stopModelId})`, tradeId: t.id });
    }
    if (t.exitDate && t.exitDate >= startDate && t.reason !== 'END_OF_HISTORY_OPEN') {
      events.push({ date: t.exitDate, type: 'TRADE_CLOSE', detail: `${t.direction} closed (${t.reason}) pnlR=${t.pnlR?.toFixed(2)}`, tradeId: t.id });
    }
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return events;
}

// Phase 1 "live" snapshot: generates a synthetic dataset through TODAY
// (generateSyntheticCogDataset defaults `end` to now) and reports the last
// bar's full gate detail plus whatever trade is open. A trade still open at
// the dataset's last bar always closes out the backtest loop with reason
// END_OF_HISTORY_OPEN (see cogBacktestEngine.js) — that forced "close" is
// exactly the synthetic stand-in for "still open as of now" in Phase 1, so
// we detect it and re-report it as the live open trade (with a freshly
// computed exit score, since the engine's forced close never bothers
// scoring an exit that didn't actually happen).
app.get('/api/cog-threshold/live', (req, res) => {
  try {
    const seed = Number.isFinite(+req.query.seed) ? +req.query.seed : 42;
    const accountEquity = Number.isFinite(+req.query.accountEquity) ? +req.query.accountEquity : 100000;
    const instrumentKey = req.query.instrumentKey || undefined;
    const stopModelId = req.query.stopModelId || undefined;
    const requestedTier = req.query.requestedTier || undefined;
    const lookbackBars = Number.isFinite(+req.query.lookbackBars) ? +req.query.lookbackBars : 90;
    const start = req.query.start || COG_DATA_DEFAULTS_CFG.backtestStart;

    const dataset = generateSyntheticCogDataset({ start, seed });
    const result = runCogBacktest(dataset, { accountEquity, instrumentKey, stopModelId, requestedTier });

    const lastIndex = result.dates.length - 1;
    const lastTrade = result.trades[result.trades.length - 1] || null;
    const isOpenNow = !!lastTrade && lastTrade.reason === 'END_OF_HISTORY_OPEN';
    const closedTrades = isOpenNow ? result.trades.slice(0, -1) : result.trades;

    let openTrade = null;
    if (isOpenNow) {
      const liveExit = computeExitScore(
        { gate1: result.gate1[lastTrade.entryIndex], gate2: result.gate2[lastTrade.entryIndex], gate3: result.gate3[lastTrade.entryIndex] },
        { gate1: result.gate1[lastIndex], gate2: result.gate2[lastIndex], gate3: result.gate3[lastIndex] },
        lastTrade.direction
      );
      openTrade = { ...lastTrade, liveExit };
    }

    const payload = _capInfinity({
      asOf: result.dates[lastIndex],
      synthetic: true,
      options: { seed, accountEquity, instrumentKey: instrumentKey || 'primary', stopModelId: stopModelId || COG_EXECUTION.defaultStopModel, requestedTier: requestedTier || COG_EXECUTION.defaultTier },
      gates: { gate1: result.gate1[lastIndex], gate2: result.gate2[lastIndex], gate3: result.gate3[lastIndex], gate4: result.gate4[lastIndex] },
      openTrade,
      recentTrades: closedTrades.slice(-20).reverse(),
      events: _cogEventTimeline(result.dates, result.gate1, result.gate2, result.gate3, result.trades, lookbackBars),
      equity: { multiple: result.equityCurve[lastIndex], dollars: result.equityCurveDollars[lastIndex] },
    });

    res.json({ ok: true, data: payload });
  } catch (e) {
    console.error('[cog-threshold/live]', e?.message ?? e, e?.stack ?? '');
    res.status(500).json({ ok: false, error: e?.message || 'Unknown engine error' });
  }
});

// ── COG V2 Engine (persistent async state machine) ─────────────────────────
// See js/cogV2Config.js / js/cogStateEngine.js headers for the full
// architectural rationale. This is a NEW, parallel set of routes — it never
// touches the V1 job map/data dir/handlers above. runV2Backtest()'s output
// already has the exact `{tradingDays, equityCurve, equityCurveDollars}`
// shape the V1 event-engine helpers (_dailyEquitySeriesFromEvent,
// _tradesWithDayIndex) expect, and V2 trades carry the same entryDate field,
// so those two helpers are reused as-is rather than re-implemented.

const COG_V2_DATA_DIR = path.join(__dirname, 'VolRangeForecaster', 'data', 'cog-v2');

// Per-bar frequency summary across the WHOLE backtest, in the same spirit as
// _eventGateHitRateSummary above but shaped around V2's three persistent
// gates instead of V1's fixed-window ones: setup/risk are "is it valid right
// now" frequencies, trigger is "armed which direction" (rare, by design —
// only inside the 14:20-14:35 window). Transition counts are included since
// "how often did a gate actually change state" is the more meaningful
// signal for a persistence-based system than a per-bar snapshot is.
function _v2GateHitRateSummary(result) {
  const { setupSnapshots, riskSnapshots, triggerSnapshots, setupState, riskState, triggerState } = result;
  return {
    barCount: setupSnapshots.length,
    setup: _frequency(setupSnapshots, s => s.valid ? (s.direction || 'VALID') : 'INVALID'),
    risk: _frequency(riskSnapshots, s => s.valid ? 'VALID' : 'INVALID'),
    trigger: _frequency(triggerSnapshots, s => s.armed ? `ARMED_${s.direction}` : 'NOT_ARMED'),
    transitions: { setup: setupState.transitions.length, risk: riskState.transitions.length, trigger: triggerState.transitions.length },
  };
}

const cogV2Jobs = new Map();

function _purgeStaleCogV2Jobs() {
  const cutoff = Date.now() - 60 * 60_000;
  for (const [id, job] of cogV2Jobs) if (job.startedAt < cutoff) cogV2Jobs.delete(id);
}

function _latestCogV2File() {
  if (!fs.existsSync(COG_V2_DATA_DIR)) return null;
  const files = fs.readdirSync(COG_V2_DATA_DIR)
    .filter(f => f.startsWith('cog_v2_') && f.endsWith('.json'))
    .sort().reverse();
  return files.length ? path.join(COG_V2_DATA_DIR, files[0]) : null;
}

app.post('/api/cog-v2/run', express.json({ limit: '1mb' }), (req, res) => {
  const body = req.body || {};
  const start = body.start || COG_DATA_DEFAULTS_CFG.backtestStart;
  const end = body.end || undefined;
  const seed = Number.isFinite(+body.seed) ? +body.seed : 42;
  const accountEquity = Number.isFinite(+body.accountEquity) ? +body.accountEquity : 100000;
  const instrumentKey = body.instrumentKey || undefined;
  const stopModelId = body.stopModelId || undefined;
  const requestedTier = body.requestedTier || undefined;

  const jobId = `cogv2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  _purgeStaleCogV2Jobs();
  cogV2Jobs.set(jobId, { status: 'running', startedAt, phase: 'Generating synthetic intraday dataset…' });

  (async () => {
    try {
      const dataset = generateSyntheticIntradayCogDataset({ start, end, seed });
      cogV2Jobs.get(jobId).phase = 'Running V2 persistent state engine…';
      const result = runV2Backtest(dataset, { accountEquity, instrumentKey, stopModelId, requestedTier });

      cogV2Jobs.get(jobId).phase = 'Computing performance & robustness reports…';
      const daily = _dailyEquitySeriesFromEvent(result);
      const dayIndexByDate = new Map(daily.dates.map((d, i) => [d, i]));
      const reportTrades = _tradesWithDayIndex(result.trades, dayIndexByDate);
      const performance = computeCogPerformanceReport({ dates: daily.dates, equityCurve: daily.equity, trades: reportTrades });
      const monteCarlo = cogMonteCarloBootstrap(reportTrades);
      const walkForward = cogWalkForwardStability({ dates: daily.dates, equityCurve: daily.equity, trades: reportTrades });
      const outOfSample = cogOutOfSampleSplit({ dates: daily.dates, equityCurve: daily.equity, trades: reportTrades });
      const gateHitRates = _v2GateHitRateSummary(result);

      const payload = _capInfinity({
        runAt: new Date().toISOString(),
        synthetic: true,
        engine: 'v2',
        dateRange: { start: result.dates[0] ?? null, end: result.dates[result.dates.length - 1] ?? null },
        options: { seed, accountEquity, instrumentKey: instrumentKey || 'primary', stopModelId: stopModelId || COG_EXECUTION.defaultStopModel, requestedTier: requestedTier || COG_EXECUTION.defaultTier },
        trades: result.trades,
        equityCurve: daily.dates.map((d, i) => ({ date: d, equity: daily.equity[i], equityDollars: daily.equityDollars[i] })),
        journal: result.journal,
        intradayBarCount: result.dates.length,
        performance, monteCarlo, walkForward, outOfSample, gateHitRates,
        dirAgreement: result.dirAgreement,
      });

      if (!fs.existsSync(COG_V2_DATA_DIR)) fs.mkdirSync(COG_V2_DATA_DIR, { recursive: true });
      const ts = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 15);
      const outFile = path.join(COG_V2_DATA_DIR, `cog_v2_${ts}.json`);
      fs.writeFileSync(outFile, JSON.stringify(payload, null, 0) + '\n');

      cogV2Jobs.set(jobId, { status: 'done', startedAt, result: { ok: true, data: payload, file: path.basename(outFile) } });
      console.log(`[cog-v2] job ${jobId} done (${Math.round((Date.now() - startedAt) / 1000)}s) — ${payload.trades.length} trades`);
    } catch (e) {
      const msg = e?.message || String(e) || 'Unknown engine error';
      console.error('[cog-v2/run]', msg, e?.stack ?? '');
      cogV2Jobs.set(jobId, { status: 'error', error: msg, startedAt });
    }
  })();

  res.json({ ok: true, jobId });
});

app.get('/api/cog-v2/status/:jobId', (req, res) => {
  const job = cogV2Jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, error: 'Job not found or expired' });
  if (job.status === 'running') {
    return res.json({ ok: true, status: 'running',
      elapsed: Math.round((Date.now() - job.startedAt) / 1000),
      phase: job.phase ?? 'Running…' });
  }
  if (job.status === 'done') return res.json({ ok: true, status: 'done', ...job.result });
  return res.status(500).json({ ok: false, status: 'error', error: job.error });
});

app.get('/api/cog-v2/results', (_req, res) => {
  const file = _latestCogV2File();
  if (!file) return res.json({ ok: false, error: 'No V2 Engine backtest results found — run a backtest first' });
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    res.json({ ok: true, data, file: path.basename(file) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Historical backtest helpers ───────────────────────────────────────────────

// Matches signal journal entries (type='ENTRY', has confScore) to trades by
// entryDate so confidence bucket performance can be computed without modifying
// cogTradeJournal.js. Signal fires at bar i; fill is at bar i+1 — typically
// the same UK calendar date (both within the 08:00-16:00 session).
function _matchConfToTrades(trades, journal) {
  const confByDate = new Map();
  for (const e of journal) {
    if (e.type === 'ENTRY' && e.confScore != null) confByDate.set(e.date, e.confScore);
  }
  return trades.map(t => ({ ...t, confScore: confByDate.get(t.entryDate) ?? null }));
}

// Confidence bucket performance: group trades by confScore at entry and report
// win rate + avg R per bucket. The bucket boundaries were calibrated against
// the post-normalization score distribution (minScore=35 → most entries cluster
// 35-60; see cogV2Config.js COG_V2_CONFIDENCE calibration note).
function _confBuckets(tradesWithConf) {
  const defs = [
    { label: '35-45', min: 35, max: 45 },
    { label: '45-55', min: 45, max: 55 },
    { label: '55-65', min: 55, max: 65 },
    { label: '65+',   min: 65, max: Infinity },
  ];
  return defs.map(b => {
    const bt = tradesWithConf.filter(t => t.confScore != null && t.confScore >= b.min && t.confScore < b.max && t.pnlR != null && Number.isFinite(t.pnlR));
    const wins = bt.filter(t => t.pnlR > 0).length;
    const totalR = bt.reduce((s, t) => s + t.pnlR, 0);
    return { label: b.label, count: bt.length, winRate: bt.length ? wins / bt.length : null, avgR: bt.length ? totalR / bt.length : null };
  });
}

// MAE/MFE (Maximum Adverse / Favorable Excursion) computed from the intraday
// bar range between entry fill and exit, measured in price points from the
// entry price. Skips trades with no exitIndex (end-of-history open).
function _computeMAEMFE(trades, ohlcBars) {
  const highs = ohlcBars.map(b => b.high);
  const lows  = ohlcBars.map(b => b.low);
  return trades.map(trade => {
    const { entryIndex, exitIndex, direction, entryPrice } = trade;
    if (!Number.isFinite(exitIndex) || !Number.isFinite(entryIndex)) return { mae: null, mfe: null };
    let mae = 0, mfe = 0;
    for (let i = entryIndex; i <= exitIndex; i++) {
      const h = highs[i], l = lows[i];
      if (!Number.isFinite(h) || !Number.isFinite(l)) continue;
      if (direction === 'LONG') {
        mae = Math.max(mae, entryPrice - l);
        mfe = Math.max(mfe, h - entryPrice);
      } else {
        mae = Math.max(mae, h - entryPrice);
        mfe = Math.max(mfe, entryPrice - l);
      }
    }
    return { mae, mfe };
  });
}

// ── /api/cog-v2/run-historical ────────────────────────────────────────────────
// Exactly the same async-job pattern as /api/cog-v2/run but uses
// loadHistoricalCogDataset (OANDA M5 + FRED/Yahoo macro) instead of
// generateSyntheticIntradayCogDataset. Reuses cogV2Jobs and the existing
// /api/cog-v2/status/:jobId poller — same jobId namespace, one map.
//
// Required env vars: OANDA_KEY (loaded from process.env — NEVER logged here).
// Optional: OANDA_ENV ('live' | 'practice', default 'live').
app.post('/api/cog-v2/run-historical', express.json({ limit: '1mb' }), (req, res) => {
  const oandaKey = process.env.OANDA_KEY;
  if (!oandaKey) {
    return res.status(400).json({ ok: false, error: 'OANDA_KEY not set — set it in server environment variables' });
  }

  const body = req.body || {};
  const start = body.start || COG_DATA_DEFAULTS_CFG.backtestStart;
  const end = body.end || undefined;
  const instrument = body.instrument || 'NAS100_USD';
  const oandaEnv = process.env.OANDA_ENV || 'live';
  const accountEquity = Number.isFinite(+body.accountEquity) ? +body.accountEquity : 100000;
  const instrumentKey = body.instrumentKey || undefined;
  const stopModelId = body.stopModelId || undefined;
  const requestedTier = body.requestedTier || undefined;

  const jobId = `cogv2hist_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  _purgeStaleCogV2Jobs();
  cogV2Jobs.set(jobId, { status: 'running', startedAt, phase: `Fetching OANDA M5 candles for ${instrument} [${start} → ${end || 'today'}]…` });

  (async () => {
    try {
      const dataset = await loadHistoricalCogDataset({
        start, end, instrument,
        oandaKey,      // from process.env — never logged
        oandaEnv,
        onProgress: p => {
          const job = cogV2Jobs.get(jobId);
          if (job) job.phase = p.phase || 'Loading historical data…';
        },
      });

      cogV2Jobs.get(jobId).phase = 'Running V2 persistent state engine on real data…';
      const result = runV2Backtest(dataset, { accountEquity, instrumentKey, stopModelId, requestedTier });

      cogV2Jobs.get(jobId).phase = 'Computing performance, MAE/MFE and confidence calibration…';
      const daily = _dailyEquitySeriesFromEvent(result);
      const dayIndexByDate = new Map(daily.dates.map((d, i) => [d, i]));
      const reportTrades = _tradesWithDayIndex(result.trades, dayIndexByDate);
      const performance = computeCogPerformanceReport({ dates: daily.dates, equityCurve: daily.equity, trades: reportTrades });
      const monteCarlo = cogMonteCarloBootstrap(reportTrades);
      const walkForward = cogWalkForwardStability({ dates: daily.dates, equityCurve: daily.equity, trades: reportTrades });
      const outOfSample = cogOutOfSampleSplit({ dates: daily.dates, equityCurve: daily.equity, trades: reportTrades });
      const gateHitRates = _v2GateHitRateSummary(result);

      // Extended historical-only metrics
      const tradesWithConf = _matchConfToTrades(result.trades, result.journal);
      const maeMfe = _computeMAEMFE(result.trades, dataset.ohlc);
      const tradesEnriched = result.trades.map((t, idx) => ({
        ...t,
        confScore: tradesWithConf[idx].confScore,
        mae: maeMfe[idx].mae,
        mfe: maeMfe[idx].mfe,
      }));

      const longCount  = result.trades.filter(t => t.direction === 'LONG').length;
      const shortCount = result.trades.filter(t => t.direction === 'SHORT').length;
      const completedTrades = result.trades.filter(t => Number.isFinite(t.pnlR));
      const winners = completedTrades.filter(t => t.pnlR > 0);
      const losers  = completedTrades.filter(t => t.pnlR <= 0);

      const payload = _capInfinity({
        runAt: new Date().toISOString(),
        synthetic: false,
        dataSource: 'historical_oanda',
        engine: 'v2',
        instrument,
        dateRange: dataset.dateRange,
        options: { accountEquity, instrumentKey: instrumentKey || 'primary', stopModelId: stopModelId || COG_EXECUTION.defaultStopModel, requestedTier: requestedTier || COG_EXECUTION.defaultTier },
        gate1bCoverage: dataset.gate1bCoverage,
        fetchSummary: dataset.fetchSummary,
        intradayBarCount: result.dates.length,
        tradingDayCount: dataset.daily.dates.length,
        trades: tradesEnriched,
        equityCurve: daily.dates.map((d, i) => ({ date: d, equity: daily.equity[i], equityDollars: daily.equityDollars[i] })),
        journal: result.journal,
        performance, monteCarlo, walkForward, outOfSample, gateHitRates,
        dirAgreement: result.dirAgreement,
        historicalMetrics: {
          tradeCount: result.trades.length,
          longCount, shortCount,
          completedCount: completedTrades.length,
          winnerCount: winners.length,
          loserCount:  losers.length,
          winRate:     completedTrades.length ? winners.length / completedTrades.length : null,
          avgWinR:     winners.length ? winners.reduce((s, t) => s + t.pnlR, 0) / winners.length : null,
          avgLossR:    losers.length  ? losers.reduce((s, t) => s + t.pnlR, 0)  / losers.length  : null,
          expectancy:  completedTrades.length ? completedTrades.reduce((s, t) => s + t.pnlR, 0) / completedTrades.length : null,
          avgMAE:      maeMfe.filter(m => m.mae != null).length ? maeMfe.filter(m => m.mae != null).reduce((s, m) => s + m.mae, 0) / maeMfe.filter(m => m.mae != null).length : null,
          avgMFE:      maeMfe.filter(m => m.mfe != null).length ? maeMfe.filter(m => m.mfe != null).reduce((s, m) => s + m.mfe, 0) / maeMfe.filter(m => m.mfe != null).length : null,
          confBuckets: _confBuckets(tradesWithConf),
        },
      });

      if (!fs.existsSync(COG_V2_DATA_DIR)) fs.mkdirSync(COG_V2_DATA_DIR, { recursive: true });
      const ts = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 15);
      const outFile = path.join(COG_V2_DATA_DIR, `cog_v2_hist_${ts}.json`);
      fs.writeFileSync(outFile, JSON.stringify(payload, null, 0) + '\n');

      cogV2Jobs.set(jobId, { status: 'done', startedAt, result: { ok: true, data: payload, file: path.basename(outFile) } });
      console.log(`[cog-v2/hist] job ${jobId} done (${Math.round((Date.now() - startedAt) / 1000)}s) — ${payload.trades.length} trades, ${payload.tradingDayCount} trading days`);
    } catch (e) {
      const msg = e?.message || String(e) || 'Unknown error in historical backtest';
      console.error('[cog-v2/run-historical]', msg, e?.stack ?? '');
      cogV2Jobs.set(jobId, { status: 'error', error: msg, startedAt });
    }
  })();

  res.json({ ok: true, jobId });
});

// Same "no black boxes" discipline as /api/cog-threshold/config: every
// threshold/weight the V2 UI renders must trace back to either V1's
// cogConfig.js (Setup/Risk gates reuse that math unmodified) or
// cogV2Config.js (the Trigger Gate's own new constants).
app.get('/api/cog-v2/config', (_req, res) => {
  res.json({
    ok: true,
    setup: { score: COG_THRESHOLD1_SCORE, hysteresis: COG_V2_SETUP_HYSTERESIS, slowSmooth: COG_V2_SLOW_SMOOTH, note: COG_V2_SETUP_NOTE },
    risk: { score: COG_RISK_SCORE, riskTiers: COG_RISK_TIERS, stopModels: COG_STOP_MODELS, note: COG_V2_RISK_NOTE },
    trigger: { score: COG_V2_TRIGGER_SCORE, window: COG_V2_TRIGGER_WINDOW, impulseParams: COG_V2_IMPULSE_PARAMS, nyOpenMinute: COG_V2_NY_OPEN_MINUTE, entryDeadlineMinute: COG_V2_ENTRY_DEADLINE_MINUTE },
    confidence: COG_V2_CONFIDENCE,
    minSetupPersistBars: COG_V2_MIN_SETUP_PERSIST_BARS,
    execution: COG_EXECUTION,
    dataDefaults: COG_DATA_DEFAULTS_CFG,
    intradaySchedule: COG_INTRADAY_SCHEDULE,
  });
});

// Live snapshot: same Phase-1 convention as /api/cog-threshold/live — a
// synthetic intraday dataset generated through TODAY (end defaults to now
// inside generateSyntheticIntradayCogDataset -> generateSyntheticCogDataset),
// reporting the last bar's already-client-shaped gate snapshots
// (setupSnapshots/riskSnapshots/triggerSnapshots — built once by
// cogStateEngine.js, never re-derived here) plus whatever trade is open.
// A trade still open at the dataset's last bar always closes the backtest
// loop with reason END_OF_HISTORY_OPEN (see cogStateEngine.js) — detected
// and re-reported as the live open trade exactly like the V1 endpoint does.
app.get('/api/cog-v2/live', (req, res) => {
  try {
    const seed = Number.isFinite(+req.query.seed) ? +req.query.seed : 42;
    const accountEquity = Number.isFinite(+req.query.accountEquity) ? +req.query.accountEquity : 100000;
    const instrumentKey = req.query.instrumentKey || undefined;
    const stopModelId = req.query.stopModelId || undefined;
    const requestedTier = req.query.requestedTier || undefined;
    const lookbackBars = Number.isFinite(+req.query.lookbackBars) ? +req.query.lookbackBars : 300;
    // Unlike /run (a real backtest, full history from COG_DATA_DEFAULTS_CFG.
    // backtestStart is the point), this route only needs enough bars to warm
    // up the longest rolling window any V2 gate uses — Risk's 252-trading-day
    // percentile/correlation lookbacks (cogConfig.js COG_RISK_SCORE) are the
    // longest. ~545 calendar days (~1.5y) clears that with margin while
    // keeping per-bar intraday generation fast enough for a live monitor that
    // re-hits this on every page load and 60s auto-refresh tick; full history
    // back to 2014 here would mean generating a decade+ of 5-minute bars on
    // every single poll.
    const defaultStart = new Date(Date.now() - 545 * 86_400_000).toISOString().slice(0, 10);
    const start = req.query.start || defaultStart;

    const dataset = generateSyntheticIntradayCogDataset({ start, seed });
    const result = runV2Backtest(dataset, { accountEquity, instrumentKey, stopModelId, requestedTier });

    const lastIndex = result.dates.length - 1;
    const lastTrade = result.trades[result.trades.length - 1] || null;
    const isOpenNow = !!lastTrade && lastTrade.reason === 'END_OF_HISTORY_OPEN';
    const closedTrades = isOpenNow ? result.trades.slice(0, -1) : result.trades;

    let openTrade = null;
    if (isOpenNow) {
      const entryDayIdx = lastTrade.entryDayIdx;
      const lastDayIdx = result.dayIndexForBar[lastIndex];
      const liveExit = computeExitScore(
        { gate1: result.threshold1Series[lastTrade.entryIndex], gate1B: result.threshold1Series[lastTrade.entryIndex], gate2: result.gate2Series[entryDayIdx], gate3: result.gate3Series[entryDayIdx] },
        { gate1: result.threshold1Series[lastIndex], gate1B: result.threshold1Series[lastIndex], gate2: result.gate2Series[lastDayIdx], gate3: result.gate3Series[lastDayIdx] },
        lastTrade.direction
      );
      openTrade = { ...lastTrade, liveExit };
    }

    const startIdx = Math.max(0, result.journal.length ? result.journal.findIndex(j => j.index >= lastIndex - lookbackBars) : -1);
    const recentJournal = startIdx === -1 ? [] : result.journal.slice(startIdx);

    const payload = _capInfinity({
      asOf: result.dates[lastIndex],
      asOfTime: result.minuteOfDay[lastIndex],
      synthetic: true,
      options: { seed, accountEquity, instrumentKey: instrumentKey || 'primary', stopModelId: stopModelId || COG_EXECUTION.defaultStopModel, requestedTier: requestedTier || COG_EXECUTION.defaultTier },
      setup: result.setupSnapshots[lastIndex],
      risk: result.riskSnapshots[lastIndex],
      trigger: result.triggerSnapshots[lastIndex],
      openTrade,
      recentTrades: closedTrades.slice(-20).reverse(),
      journal: recentJournal,
      equity: { multiple: result.equityCurve[lastIndex], dollars: result.equityCurveDollars[lastIndex] },
    });

    res.json({ ok: true, data: payload });
  } catch (e) {
    console.error('[cog-v2/live]', e?.message ?? e, e?.stack ?? '');
    res.status(500).json({ ok: false, error: e?.message || 'Unknown engine error' });
  }
});

// ── Dyn Anchor nightly forecast ────────────────────────────────────────────────
// Fetches full OHLC D1 candles from OANDA (includes open/high/low, unlike
// fetchDailyCandles which returns close-only).

async function fetchDailyOHLC(sym, count = 70) {
  const instrument = sym.replace('/', '_');
  const base = (process.env.OANDA_ENV || 'live') === 'practice'
    ? 'https://api-fxpractice.oanda.com'
    : 'https://api-fxtrade.oanda.com';
  try {
    const r = await fetch(
      `${base}/v3/instruments/${encodeURIComponent(instrument)}/candles?granularity=D&count=${count}&price=M`,
      { headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` }, signal: AbortSignal.timeout(10_000) }
    );
    if (!r.ok) return null;
    const d = await r.json();
    return d.candles?.filter(c => c.complete && c.mid).map(c => ({
      open:  parseFloat(c.mid.o),
      high:  parseFloat(c.mid.h),
      low:   parseFloat(c.mid.l),
      close: parseFloat(c.mid.c),
    })) ?? null;
  } catch { return null; }
}

// Per-asset-class parameters for the dashboard vol model (mirrors volForecast.js)
const _DA_ASSET_CLASS = {
  'XAU/USD':    'commodity',
  'NAS100_USD': 'index',
};
const _DA_DASHBOARD_PARAMS = {
  commodity: { hl50_corr: 1.023, hl75_corr: 0.940 },
  index:     { hl50_corr: 1.010, hl75_corr: 0.967 },
  fx:        { hl50_corr: 0.965, hl75_corr: 0.912 },
};

// GARCH(1,1) for fx/index or Rogers-Satchell EWMA for commodity — mirrors dashboard vol page.
function _dashboardSigmaD(candles, assetClass) {
  const ALPHA = 0.06, BETA = 0.91, LAMBDA = 0.94;
  const OMEGA = assetClass === 'index' ? 4.76e-6 : 3.60e-7;

  if (assetClass === 'commodity') {
    let rsVar = null;
    for (const { high: h, low: l, open: o, close: cl } of candles) {
      if (!h || !l || !o || !cl) continue;
      const rs = Math.log(h / cl) * Math.log(h / o) + Math.log(l / cl) * Math.log(l / o);
      rsVar = rsVar === null ? Math.max(rs, 1e-12) : LAMBDA * rsVar + (1 - LAMBDA) * Math.max(rs, 0);
    }
    return Math.sqrt(Math.max(rsVar ?? 1e-12, 1e-12));
  }

  const closes = candles.map(c => c.close);
  const rets   = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
  let sigma2   = OMEGA / (1 - ALPHA - BETA);
  for (const r of rets) sigma2 = OMEGA + ALPHA * r ** 2 + BETA * sigma2;
  return Math.sqrt(Math.max(sigma2, 1e-12));
}

function _computeDaForecast(candles, opts = {}) {
  const lambda       = opts.lambda       ?? 0.94;
  const emaPeriod    = opts.emaPeriod    ?? 20;
  const slopeThresh  = opts.slopeThresh  ?? 0.002;
  const slopeWindow  = opts.slopeWindow  ?? 5;   // must match backtest classifyRegime slopeWindow=5
  const volModel     = opts.volModel     ?? 'ewma';
  const assetClass   = opts.assetClass   ?? 'fx';

  const BM_P50 = 1.572, BM_P75 = 2.049;

  const closes = candles.map(c => c.close);
  if (closes.length < emaPeriod + 5) return null;

  let sigmaD, hl50_corr, hl75_corr;

  if (volModel === 'dashboard') {
    sigmaD = _dashboardSigmaD(candles, assetClass);
    const p = _DA_DASHBOARD_PARAMS[assetClass] ?? _DA_DASHBOARD_PARAMS.fx;
    hl50_corr = p.hl50_corr;
    hl75_corr = p.hl75_corr;
  } else {
    // EWMA close-to-close (default, backtest-validated)
    const rets = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
    let ewmaVar = rets[0] ** 2;
    for (const r of rets.slice(1)) ewmaVar = lambda * ewmaVar + (1 - lambda) * r ** 2;
    sigmaD    = Math.sqrt(Math.max(ewmaVar, 1e-12));
    hl50_corr = 0.921;
    hl75_corr = 0.894;
  }

  // EMA series for slope — 5-bar window matches backtest classifyRegime(slopeWindow=5)
  if (closes.length < emaPeriod + slopeWindow + 1) return null;
  const alpha = 2 / (emaPeriod + 1);
  const emaSeries = [closes[0]];
  for (let i = 1; i < closes.length; i++) emaSeries.push(alpha * closes[i] + (1 - alpha) * emaSeries[i - 1]);
  const emaNow  = emaSeries[emaSeries.length - 1];
  const emaPast = emaSeries[emaSeries.length - 1 - slopeWindow];
  const slope   = emaNow !== 0 ? (emaNow - emaPast) / emaNow : 0;
  const regime  = slope > slopeThresh ? 'BULL' : slope < -slopeThresh ? 'BEAR' : 'RANGE';

  return {
    regime,
    sigma_d:     sigmaD,
    hl50:        BM_P50 * hl50_corr * sigmaD,
    hl75:        BM_P75 * hl75_corr * sigmaD,
    ema_slope:   slope,
    prev_close:  closes[closes.length - 1],
    bars_used:   closes.length,
    vol_model:   volModel,
    asset_class: assetClass,
  };
}

// GET /api/dyn-anchor-forecast?pairs=EUR/USD,GBP/USD,...
// Computes next-session EWMA vol + regime for each requested pair (or the
// default 25-pair list) and stores the result to dyn_anchor_forecast KV.
app.get('/api/dyn-anchor-forecast', async (req, res) => {
  if (!process.env.OANDA_KEY) {
    return res.status(500).json({ ok: false, error: 'OANDA_KEY not set' });
  }

  const DEFAULT_DA_PAIRS = [
    'EUR/USD','GBP/USD','USD/JPY','AUD/USD','NZD/USD','USD/CAD','USD/CHF',
    'GBP/JPY','EUR/JPY','EUR/GBP','EUR/CHF','EUR/CAD','EUR/AUD','AUD/JPY',
    'AUD/CAD','GBP/AUD','GBP/CAD','CAD/JPY','CHF/JPY','NZD/JPY','AUD/NZD',
    'GBP/NZD','EUR/NZD','AUD/CHF','GBP/CHF',
  ];

  const pairsParam = req.query.pairs;
  const pairs = pairsParam
    ? pairsParam.split(',').map(p => p.trim()).filter(Boolean)
    : DEFAULT_DA_PAIRS;

  const lambda       = parseFloat(req.query.lambda)       || 0.94;
  const emaPeriod    = parseInt(req.query.emaPeriod)       || 20;
  const slopeThresh  = parseFloat(req.query.slopeThresh)   || 0.002;
  const slopeWindow  = parseInt(req.query.slopeWindow)     || 5;
  const barCount     = Math.min(parseInt(req.query.bars) || 70, 250);
  const volModel     = req.query.volModel ?? 'ewma';

  const forecast = {};
  const errors   = {};

  await Promise.all(pairs.map(async pair => {
    try {
      const candles = await fetchDailyOHLC(pair, barCount);
      if (!candles || candles.length < emaPeriod + slopeWindow + 1) {
        errors[pair] = `Only ${candles?.length ?? 0} bars (need ${emaPeriod + slopeWindow + 1})`;
        return;
      }
      const assetClass = _DA_ASSET_CLASS[pair] ?? 'fx';
      const f = _computeDaForecast(candles, { lambda, emaPeriod, slopeThresh, slopeWindow, volModel, assetClass });
      if (f) forecast[pair] = f;
      else   errors[pair] = 'computation failed';
    } catch (e) {
      errors[pair] = e.message;
    }
  }));

  const payload = {
    forecast,
    errors,
    computed_at: new Date().toISOString(),
    pairs_ok:    Object.keys(forecast).length,
    pairs_err:   Object.keys(errors).length,
    params:      { lambda, emaPeriod, slopeThresh, slopeWindow, barCount, volModel },
  };

  // Store to KV so bot can read it at session open
  try {
    await kv.put('dyn_anchor_forecast', JSON.stringify({ data: payload, timestamp: Date.now() }));
  } catch (e) {
    console.warn('[dyn-anchor-forecast] KV store failed:', e.message);
  }

  res.json({ ok: true, ...payload });
});

// M1 candlestick endpoint — returns filtered bars for chart rendering.
// Cache stores TypedArrays (~28 MB/pair) not objects (~350 MB/pair) to avoid OOM.
// LRU: max 3 pairs in memory at once.
const m1CandleCache = new Map();
const M1_CACHE_MAX  = 3;

app.get('/api/vol-backtest/candles/:pair', async (req, res) => {
  const pair = req.params.pair.toLowerCase().replace(/[^a-z0-9]/g, '');
  const { from, to } = req.query;
  try {
    if (!m1CandleCache.has(pair)) {
      if (m1CandleCache.size >= M1_CACHE_MAX) {
        m1CandleCache.delete(m1CandleCache.keys().next().value);
      }
      const packed = await loadM1ForPair(pair);
      if (!packed) return res.status(404).json({ ok: false, error: `No M1 data for ${pair} — check R2 credentials or local parquet files` });
      m1CandleCache.set(pair, packed);
    }
    const packed = m1CandleCache.get(pair);
    const { n, times, opens, highs, lows, closes } = packed;

    // Unpack only the requested date window — avoids allocating millions of objects
    const fromTs = from ? Math.floor(new Date(from + 'T00:00:00Z').getTime() / 1000) : 0;
    const toTs   = to   ? Math.floor(new Date(to   + 'T23:59:59Z').getTime() / 1000) : 2_000_000_000;
    const candles = [];
    for (let i = 0; i < n && candles.length < 20000; i++) {
      const t = times[i];
      if (t >= fromTs && t <= toTs) {
        candles.push({ time: new Date(t * 1000).toISOString().substring(0, 19), open: opens[i], high: highs[i], low: lows[i], close: closes[i] });
      }
    }
    res.json({ ok: true, pair, n: candles.length, candles });
  } catch (e) {
    console.error('[candles]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Beta history — reads bot/data/beta_history.jsonl for the correlation dashboard.
// Optional query params: limit (max records, default 3000), downsample (bool).
app.get('/api/beta-history', (req, res) => {
  const histPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'bot', 'data', 'beta_history.jsonl');
  try {
    const raw = fs.readFileSync(histPath, 'utf8');
    const lines = raw.split('\n').filter(l => l.trim());
    const limit = Math.max(100, parseInt(req.query.limit) || 3000);
    // Deterministic downsample: keep every Nth record to fit limit
    const step = Math.max(1, Math.floor(lines.length / limit));
    const records = [];
    for (let i = 0; i < lines.length; i += step) {
      try { records.push(JSON.parse(lines[i])); } catch { /* skip malformed */ }
    }
    // Always include the latest record
    if (lines.length > 0) {
      try {
        const last = JSON.parse(lines[lines.length - 1]);
        if (!records.length || records[records.length - 1].ts !== last.ts) records.push(last);
      } catch { /* ignore */ }
    }
    res.json({ records, total: lines.length, sampled: records.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List available OANDA instruments — useful for finding exact index/CFD names on this account.
app.get('/api/oanda-instruments', async (req, res) => {
  if (!process.env.OANDA_KEY) return res.status(400).json({ error: 'OANDA_KEY not set' });
  const base = (process.env.OANDA_ENV || 'live') === 'practice'
    ? 'https://api-fxpractice.oanda.com' : 'https://api-fxtrade.oanda.com';
  const accountId = process.env.OANDA_ACCOUNT_ID;
  if (!accountId) return res.status(400).json({ error: 'OANDA_ACCOUNT_ID not set' });
  try {
    const r = await fetch(`${base}/v3/accounts/${accountId}/instruments`, {
      headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    const data = await r.json();
    const filter = (req.query.q || '').toLowerCase();
    const instruments = (data.instruments || [])
      .filter(i => !filter || i.name.toLowerCase().includes(filter) || i.displayName.toLowerCase().includes(filter))
      .map(i => ({ name: i.name, displayName: i.displayName, type: i.type }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ count: instruments.length, instruments });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Manual beta rebuild trigger
app.post('/api/beta/rebuild', (_req, res) => {
  if (_betaRunning) return res.json({ ok: false, message: 'Already running' });
  if (!process.env.OANDA_KEY) return res.status(400).json({ ok: false, message: 'OANDA_KEY not configured' });
  buildBetaEstimates().catch(e => console.error('[BETA/rebuild]', e.message));
  res.json({ ok: true, message: 'Beta estimation started — takes ~30s. Refresh beta panel when done.' });
});

// Manual rebuild trigger — fires buildCorrHistoryJS() in background and returns immediately.
app.post('/api/corr-history/rebuild', (_req, res) => {
  if (corrRunning) return res.json({ ok: false, message: 'Build already in progress' });
  if (!process.env.OANDA_KEY) return res.status(400).json({ ok: false, message: 'OANDA_KEY not configured' });
  buildCorrHistoryJS().catch(e => console.error('[CORR/rebuild]', e.message));
  res.json({ ok: true, message: 'Correlation history build started — check server logs. Takes ~3 min.' });
});

// Build progress — polled every few seconds while corrRunning
app.get('/api/corr-history/progress', (_req, res) => {
  res.json({ running: corrRunning, ...corrProgress });
});

// Build status
app.get('/api/corr-history/status', (_req, res) => {
  let fileInfo = null;
  try {
    const stat = fs.statSync(CORR_HISTORY_PATH);
    const ageDays = (Date.now() - stat.mtimeMs) / 86400_000;
    fileInfo = { exists: true, sizeKb: Math.round(stat.size / 1024), ageDays: +ageDays.toFixed(1), stale: ageDays > 7 };
  } catch { fileInfo = { exists: false }; }
  res.json({ running: corrRunning, file: fileInfo, oandaKey: !!process.env.OANDA_KEY });
});

// Correlation history — serves bot/data/corr_history.json built by build_corr_history.py
// Optional ?lite=1 returns only avg_corr + regime_stats (strips the full records array)
app.get('/api/corr-history', (req, res) => {
  const p = CORR_HISTORY_PATH;
  if (!fs.existsSync(p)) return res.json({ records: [], built: false, message: 'No history yet — click Rebuild in the dashboard to generate 5 years of OANDA H4 data.' });
  try {
    const raw = fs.readFileSync(p, 'utf8');
    if (req.query.lite === '1') {
      const full = JSON.parse(raw);
      return res.json({
        generated: full.generated, years: full.years,
        window_bars: full.window_bars, pairs: full.pairs,
        regime_stats: full.regime_stats, avg_corr: full.avg_corr,
        record_count: full.records?.length ?? 0,
      });
    }
    // Stream the full file directly — avoids double-parse overhead for large files
    res.setHeader('Content-Type', 'application/json');
    res.send(raw);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Hedge alerts — compact summary for the dashboard beta panel.
// Returns avg_corr, corr_std (computed from records), last rolling corr, and last betas.
// Much smaller than the full corr-history response.
app.get('/api/hedge-alerts', async (req, res) => {
  const p = CORR_HISTORY_PATH;
  if (!fs.existsSync(p)) return res.json({ pairs: [], avg_corr: {}, corr_std: {}, last_corr: {}, last_betas: {} });
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const records = data.records || [];
    const sums = {}, sums2 = {}, cnts = {}, lastCorr = {};
    for (const r of records) {
      for (const [k, v] of Object.entries(r.corr || {})) {
        if (!sums[k]) { sums[k] = 0; sums2[k] = 0; cnts[k] = 0; }
        sums[k] += v; sums2[k] += v * v; cnts[k]++;
        lastCorr[k] = v;
      }
    }
    const corr_std = {};
    for (const k of Object.keys(sums)) {
      const n = cnts[k], mu = sums[k] / n;
      corr_std[k] = n > 1 ? +(Math.sqrt(Math.max(0, sums2[k] / n - mu * mu))).toFixed(5) : 0;
    }
    const lastRec = records[records.length - 1] || {};
    const result = {
      generated: data.generated,
      pairs: data.pairs || [],
      avg_corr: data.avg_corr || {},
      corr_std,
      last_corr: lastCorr,
      last_betas: lastRec.beta || {},
    };
    // Cache in KV so the Positions tab can read it from both Railway and CF Pages
    kv.put('hedge_alerts_cache', JSON.stringify(result), { expirationTtl: 86400 }).catch(() => {});
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Hedge Signal API ─────────────────────────────────────────────────────────

app.get('/api/hedge-signals', (_req, res) => {
  if (!fs.existsSync(HEDGE_SIGNALS_PATH)) return res.json({ signals: [], last_run: null });
  try { res.json(JSON.parse(fs.readFileSync(HEDGE_SIGNALS_PATH, 'utf8'))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/hedge-signals/config', async (_req, res) => {
  const raw = await kv.get(HEDGE_SIGNAL_CFG_KEY).catch(() => null);
  res.json(raw ? { ...DEFAULT_HEDGE_CFG, ...JSON.parse(raw) } : { ...DEFAULT_HEDGE_CFG });
});

app.put('/api/hedge-signals/config', async (req, res) => {
  const cfg = { ...DEFAULT_HEDGE_CFG, ...(req.body || {}) };
  await kv.put(HEDGE_SIGNAL_CFG_KEY, JSON.stringify(cfg));
  res.json({ ok: true, config: cfg });
});

app.post('/api/hedge-signals/check', async (_req, res) => {
  const result = await computeHedgeSignals(true).catch(e => ({ status: 'error', error: e.message }));
  res.json({ ok: true, ...result });
});

// ── Hedge Audit Log ──────────────────────────────────────────────────────────
// Advisory hedge suggestions logged when new positions open — used for forward-testing
// signal quality before building Option C (automated execution).

app.get('/api/hedge-audit', async (_req, res) => {
  try {
    const raw = await kv.get('hedge_audit_log');
    const entries = raw ? JSON.parse(raw) : [];
    res.json({ ok: true, entries });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST body: array of { ticket, symbol, direction, lots, open_price, bot, bot_key,
//   hedge_symbol, hedge_direction, hedge_corr, hedge_corr_std, hedge_beta, account_login }
app.post('/api/hedge-audit/entries', async (req, res) => {
  try {
    const newEntries = req.body;
    if (!Array.isArray(newEntries) || !newEntries.length) return res.json({ ok: true, added: 0 });
    const raw = await kv.get('hedge_audit_log');
    const existing = raw ? JSON.parse(raw) : [];
    const existingTickets = new Set(existing.map(e => e.ticket));
    const ts = new Date().toISOString();
    const toAdd = newEntries
      .filter(e => e.ticket && !existingTickets.has(e.ticket))
      .map(e => ({ ...e, logged_at: ts }));
    if (!toAdd.length) return res.json({ ok: true, added: 0 });
    const updated = [...toAdd, ...existing].slice(0, 500);
    await kv.put('hedge_audit_log', JSON.stringify(updated));
    res.json({ ok: true, added: toAdd.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// PATCH body: { hedge_close_price?, hedge_entry_price?, closed_at? }
// Records actual close data on an existing audit entry for forward-test P&L tracking.
app.patch('/api/hedge-audit/entries/:ticket', async (req, res) => {
  try {
    const ticket = String(req.params.ticket);
    const updates = req.body || {};
    const raw = await kv.get('hedge_audit_log');
    const entries = raw ? JSON.parse(raw) : [];
    const idx = entries.findIndex(e => String(e.ticket) === ticket);
    if (idx === -1) return res.json({ ok: true, updated: 0 });
    const allowed = ['hedge_close_price', 'hedge_entry_price', 'closed_at'];
    allowed.forEach(k => { if (k in updates) entries[idx][k] = updates[k]; });
    await kv.put('hedge_audit_log', JSON.stringify(entries));
    res.json({ ok: true, updated: 1 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// List R2 bucket contents under a prefix — useful to confirm which M1 parquets are uploaded
app.get('/api/r2/list', async (req, res) => {
  const prefix = (req.query.prefix ?? 'm1') + '/';
  try {
    if (!process.env.R2_ACCESS_KEY || !process.env.R2_SECRET_KEY) {
      return res.json({ ok: false, error: 'R2 credentials not configured (R2_ACCESS_KEY / R2_SECRET_KEY)' });
    }
    const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    const r2 = new S3Client({
      endpoint:    process.env.R2_ENDPOINT    || 'https://3e867110ae519cd24afc877c72e5026e.r2.cloudflarestorage.com',
      region:      'auto',
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY, secretAccessKey: process.env.R2_SECRET_KEY },
      requestHandler: { requestTimeout: 10_000 },
    });
    const bucket = process.env.R2_BUCKET || 'r2-storage';
    let files = [], token;
    do {
      const cmd  = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 1000, ContinuationToken: token });
      const resp = await r2.send(cmd);
      (resp.Contents || []).forEach(o => files.push({ key: o.Key, sizeMB: +(o.Size / 1e6).toFixed(2), lastModified: o.LastModified }));
      token = resp.IsTruncated ? resp.NextContinuationToken : null;
    } while (token);
    files.sort((a, b) => a.key.localeCompare(b.key));
    res.json({ ok: true, bucket, prefix, count: files.length, files });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post('/api/hedge-signals/ack', (req, res) => {
  if (!fs.existsSync(HEDGE_SIGNALS_PATH)) return res.json({ ok: false, error: 'No signals file' });
  try {
    const { id, status = 'DISMISSED' } = req.body || {};
    const data = JSON.parse(fs.readFileSync(HEDGE_SIGNALS_PATH, 'utf8'));
    const sig  = data.signals.find(s => s.id === id);
    if (!sig) return res.json({ ok: false, error: 'Signal not found' });
    sig.status   = status;
    sig.ack_time = new Date().toISOString();
    fs.writeFileSync(HEDGE_SIGNALS_PATH, JSON.stringify(data, null, 2));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/hedge-signals/tg-config', async (_req, res) => {
  const raw = await kv.get('hedge_signal_tg').catch(() => null);
  res.json(raw ? JSON.parse(raw) : { token: '', chatId: '' });
});

app.put('/api/hedge-signals/tg-config', async (req, res) => {
  const { token = '', chatId = '' } = req.body || {};
  await kv.put('hedge_signal_tg', JSON.stringify({ token, chatId }));
  res.json({ ok: true });
});

app.post('/api/hedge-signals/tg-test', async (_req, res) => {
  const raw = await kv.get('hedge_signal_tg').catch(() => null);
  const cfg = raw ? JSON.parse(raw) : null;
  if (!cfg?.token || !cfg?.chatId) return res.json({ ok: false, error: 'Telegram not configured for hedge signals' });
  const ok = await sendTelegram(cfg.token, cfg.chatId,
    '✅ <b>MacroFX Hedge Signals</b> — bot connected!\n<i>You will receive alerts when hedge pair correlations diverge.</i>');
  res.json({ ok, error: ok ? null : 'Telegram API returned error' });
});

// Live prices + vol forecast ATR estimates for hedge signal SL display
app.get('/api/hedge-signals/prices', (_req, res) => {
  const prices = {};
  for (const [sym, v] of Object.entries(state.prices)) {
    prices[sym] = {
      price:  v.price,
      digits: PRICE_DIGITS[sym] ?? 5,
      pip:    PIP_SIZE[sym] ?? 0.0001,
      ageS:   Math.round((Date.now() - v.at) / 1_000),
    };
  }
  const vol = {};
  const fc = forecastState.latest?.instruments;
  if (fc) {
    for (const [name, data] of Object.entries(fc)) {
      if (data?.hl_median) vol[name] = { hl_median: data.hl_median };
    }
  }
  res.json({ prices, vol });
});

// ── Regime log backfill (pure Node.js) ──────────────────────────────────────
// Native JS log parser — no Python subprocess required.
// Reads bot log files line-by-line with readline and writes directly to KV.

const _RG_V1_LOG = path.join(__dirname, 'bot',  'regime_bot.log');
const _RG_V2_LOG = path.join(__dirname, 'logs', 'regime_bot_v2.log');

// Regex patterns mirror parse_regime_logs.py
const _RG_PAT = {
  v1: {
    state: /^\[([^\]]+)\] \[INFO\] \[([^\]]+)\] regime=(\w+)\s+conf=(\d+)%\s+vol_z=([+-]?\d+\.?\d*)\s+rl=(\d+)\s+decay=([+-]?\d+\.?\d*)/,
    entry: /^\[([^\]]+)\] \[INFO\] \[([^\]]+)\] ENTRY (LONG|SHORT)/,
    trade: /^\[([^\]]+)\] \[INFO\] TRADE (\S+) (LONG|SHORT)\s+SL=/,
    close: /^\[([^\]]+)\] \[INFO\] CLOSE (\S+)\s+ticket=\S+\s+reason=(.+?)(?:\s+score=[\d.]+)?$/,
  },
  v2: {
    state: /^\[([^\]]+)\] \[RGV2\] \[INFO\] \[([^\]]+)\] reg=(\w+)\s+conf=(\d+)%\s+slope=([+-]?\d+\.?\d*)\s+vz=([+-]?\d+\.?\d*)\s+rl=(\d+)\s+bocpd=([+-]?\d+\.?\d*)%\s+exh=([+-]?\d+\.?\d*)\s+decay=([+-]?\d+\.?\d*)\s+score=(\d+)(?:\s+1h=(\w+))?/,
    gate:  /^\[([^\]]+)\] \[RGV2\] \[INFO\] \[([^\]]+)\] Gate: (.+)$/,
    trade: /^\[([^\]]+)\] \[RGV2\] \[INFO\] TRADE (\S+) (LONG|SHORT)\s+SL=/,
    close: /^\[([^\]]+)\] \[RGV2\] \[INFO\] CLOSE (\S+)\s+ticket=\S+\s+reason=(.+?)(?:\s+\[PAPER\])?$/,
  },
};

function _rgTs(s) { return Math.floor(new Date(s.replace(' ', 'T') + 'Z').getTime() / 1000); }

async function _parseRegimeLog(logPath, ver, recsByPair, evtsByPair, log) {
  if (!fs.existsSync(logPath)) { log(`[WARN] not found: ${logPath}`); return; }
  const P = _RG_PAT[ver];
  const rl = rlCreateInterface({ input: fs.createReadStream(logPath), crlfDelay: Infinity });
  let n = 0;
  for await (const line of rl) {
    n++;
    let m;
    if (ver === 'v1') {
      if ((m = P.state.exec(line))) {
        const [,ts,pair,regime,conf,vz,rl2,decay] = m;
        const t = _rgTs(ts);
        (recsByPair.get(pair) ?? (recsByPair.set(pair, new Map()), recsByPair.get(pair))).set(t, { ts:t, regime, conf:+conf, vz:+vz, rl:+rl2, decay:+decay });
      } else if ((m = P.entry.exec(line))) {
        const evts = evtsByPair.get(m[2]) ?? (evtsByPair.set(m[2],[]), evtsByPair.get(m[2]));
        evts.push({ ts:_rgTs(m[1]), type:'entry', pair:m[2], direction:m[3] });
      } else if ((m = P.trade.exec(line))) {
        const pair = m[2]; const evts = evtsByPair.get(pair) ?? (evtsByPair.set(pair,[]), evtsByPair.get(pair));
        evts.push({ ts:_rgTs(m[1]), type:'entry', pair, direction:m[3] });
      } else if ((m = P.close.exec(line))) {
        const pair = m[2]; const evts = evtsByPair.get(pair) ?? (evtsByPair.set(pair,[]), evtsByPair.get(pair));
        evts.push({ ts:_rgTs(m[1]), type:'close', pair, reason:m[3].trim() });
      }
    } else {
      if ((m = P.state.exec(line))) {
        const [,ts,pair,regime,conf,slope,vz,rl2,bocpd,exh,decay,score,h1] = m;
        const t = _rgTs(ts);
        (recsByPair.get(pair) ?? (recsByPair.set(pair, new Map()), recsByPair.get(pair))).set(t, { ts:t, regime, conf:+conf, slope:+slope, vz:+vz, rl:+rl2, bocpd:+bocpd, exh:+exh, decay:+decay, score:+score, h1 });
      } else if ((m = P.gate.exec(line))) {
        const pair = m[2]; const evts = evtsByPair.get(pair) ?? (evtsByPair.set(pair,[]), evtsByPair.get(pair));
        evts.push({ ts:_rgTs(m[1]), type:'gate', pair, reason:m[3] });
      } else if ((m = P.trade.exec(line))) {
        const pair = m[2].replace('_','/'); const evts = evtsByPair.get(pair) ?? (evtsByPair.set(pair,[]), evtsByPair.get(pair));
        evts.push({ ts:_rgTs(m[1]), type:'entry', pair, direction:m[3] });
      } else if ((m = P.close.exec(line))) {
        const pair = m[2].replace('_','/'); const evts = evtsByPair.get(pair) ?? (evtsByPair.set(pair,[]), evtsByPair.get(pair));
        evts.push({ ts:_rgTs(m[1]), type:'close', pair, reason:m[3].trim() });
      }
    }
  }
  log(`  ${path.basename(logPath)}: ${n.toLocaleString()} lines parsed`);
}

const _rgJobs = new Map();
function _purgeStaleRgJobs() {
  const now = Date.now();
  for (const [id, job] of _rgJobs) { if (now - job.startedAt > 30 * 60 * 1000) _rgJobs.delete(id); }
}

app.post('/api/regime-backfill-trigger', (req, res) => {
  _purgeStaleRgJobs();
  for (const job of _rgJobs.values()) {
    if (job.status === 'running') return res.json({ ok: true, jobId: job.jobId, alreadyRunning: true });
  }

  const jobId = `rg_${Date.now()}`;
  const lines = [];
  _rgJobs.set(jobId, { jobId, status: 'running', startedAt: Date.now(), lines });

  const log = msg => { lines.push(msg); if (lines.length > 400) lines.splice(0, lines.length - 400); console.log('[backfill]', msg); };

  (async () => {
    try {
      const v1r = new Map(), v1e = new Map(), v2r = new Map(), v2e = new Map();
      log('Parsing V1 log…');
      await _parseRegimeLog(_RG_V1_LOG, 'v1', v1r, v1e, log);
      log('Parsing V2 log…');
      await _parseRegimeLog(_RG_V2_LOG, 'v2', v2r, v2e, log);

      const allPairs = new Set([...v1r.keys(), ...v1e.keys(), ...v2r.keys(), ...v2e.keys()]);
      log(`Writing KV for ${allPairs.size} pairs…`);

      const pairSafe = p => p.replace('/','').replace('_','').toLowerCase();
      let written = 0;
      for (const pair of allPairs) {
        const safe = pairSafe(pair);
        for (const [ver, rMap, eMap] of [['v1', v1r, v1e], ['v2', v2r, v2e]]) {
          const records = [...(rMap.get(pair)?.values() ?? [])].sort((a,b) => a.ts - b.ts);
          const events  = (eMap.get(pair) ?? []).sort((a,b) => a.ts - b.ts);
          if (!records.length && !events.length) continue;
          await cfEnv.FX_SCORES.put(`rg${ver}_${safe}`, JSON.stringify({ records, events }));
          log(`  [OK] ${ver} ${pair}  ${records.length} records  ${events.length} events`);
          written++;
        }
      }
      log(`Done — ${written} KV keys written.`);
      const job = _rgJobs.get(jobId);
      if (job) { job.status = 'done'; job.finishedAt = Date.now(); }
    } catch (e) {
      lines.push(`[ERROR] ${e.message}`);
      console.error('[backfill]', e);
      const job = _rgJobs.get(jobId);
      if (job) { job.status = 'error'; job.finishedAt = Date.now(); }
    }
  })();

  res.json({ ok: true, jobId });
});

app.get('/api/regime-backfill-status/:jobId', (req, res) => {
  const job = _rgJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, error: 'Job not found or expired' });
  res.json({ ok: true, status: job.status, elapsed: Math.round((Date.now() - job.startedAt) / 1000), lines: job.lines.slice(-40), exitCode: job.exitCode ?? null });
});

// ── Regime history — R2 backfill + local KV ring buffer ──────────────────────
// Must sit BEFORE the catch-all so Railway doesn't forward this to callWorker
// (callWorker reads the local file-KV which is wiped on every redeploy).
// R2 provides durable history; local KV provides data from the current run.

app.get('/api/regime-history', async (req, res) => {
  const bot    = req.query.bot === 'v1' ? 'v1' : 'v2';
  const pair   = (req.query.pair || 'eurusd').toLowerCase().replace(/[^a-z0-9]/g, '');
  const fromTs = parseInt(req.query.from || '0');
  const toTs   = parseInt(req.query.to   || '9999999999');

  const recMap = new Map();
  const evMap  = new Map();

  // 1. R2 backfill (persistent across redeploys)
  try {
    const d = await loadRegimeHistoryFromR2(bot, pair);
    if (d) {
      for (const r of (d.records || [])) recMap.set(r.ts, r);
      for (const e of (d.events  || [])) evMap.set(`${e.ts}_${e.type}`, e);
    }
  } catch {}

  // 2. Local KV ring buffer (current Railway run — last 48-96h)
  try {
    const raw = await kv.get(`rg${bot}_${pair}`);
    if (raw) {
      const d = JSON.parse(raw);
      for (const r of (d.records || [])) recMap.set(r.ts, r);
      for (const e of (d.events  || [])) evMap.set(`${e.ts}_${e.type}`, e);
    }
  } catch {}

  const records = [...recMap.values()].filter(r => r.ts >= fromTs && r.ts <= toTs).sort((a, b) => a.ts - b.ts);
  const events  = [...evMap.values()].filter(e => e.ts >= fromTs && e.ts <= toTs).sort((a, b) => a.ts - b.ts);
  res.json({ bot, pair, records, events });
});

// Export local data/regime_history JSON files to R2 (run once to seed history).
// POST /api/regime-history-export  →  { uploaded: N, results: [...] }
app.post('/api/regime-history-export', async (req, res) => {
  const histDir = path.join(__dirname, 'data', 'regime_history');
  if (!fs.existsSync(histDir)) return res.json({ ok: false, error: 'data/regime_history not found — this endpoint must be called against your LOCAL server (localhost:3000), not Railway. Railway does not have these gitignored files.' });
  const results = [];
  for (const bot of ['v1', 'v2']) {
    const botDir = path.join(histDir, bot);
    if (!fs.existsSync(botDir)) continue;
    for (const file of fs.readdirSync(botDir).filter(f => f.endsWith('.json'))) {
      const pair    = file.replace('.json', '');
      const content = fs.readFileSync(path.join(botDir, file), 'utf8');
      try {
        const data = JSON.parse(content);
        await saveRegimeHistoryToR2(bot, pair, data);
        results.push({ ok: true, bot, pair, bytes: content.length });
      } catch (e) {
        results.push({ ok: false, bot, pair, error: e.message });
      }
    }
  }
  res.json({ ok: true, uploaded: results.filter(r => r.ok).length, results });
});

// All other /api/* routes — call _worker.js and return the JSON response.
app.all('/api/*', async (req, res) => {
  try {
    const response = await callWorker(req);
    res.status(response.status);
    response.headers.forEach((val, key) => {
      const k = key.toLowerCase();
      // Drop hop-by-hop headers that Express handles itself
      if (k !== 'content-encoding' && k !== 'transfer-encoding') res.setHeader(key, val);
    });
    res.send(await response.text());
  } catch (e) {
    console.error('[API]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Dashboard static assets — served from project root.
// journal.html and backtest.html are served as-is; index.html is the fallback.
app.use(express.static(__dirname, {
  index:      'index.html',
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

// SPA fallback — catches clean URLs not matched by express.static
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ── Boot ──────────────────────────────────────────────────────────────────────

// ── Level refresh loop ────────────────────────────────────────────────────────

async function runLevelsRefresh() {
  // Watchdog: if a previous refresh has been running for >5 min, force-release the lock
  if (state.levelsRefreshRunning && Date.now() - state.levelsRefreshStartedAt > 5 * 60_000) {
    console.warn('[LEVELS] Watchdog: releasing stuck refresh lock (hung >5 min)');
    state.levelsRefreshRunning = false;
  }
  if (state.levelsRefreshRunning || !process.env.OANDA_KEY) return;
  state.levelsRefreshRunning = true;
  state.levelsRefreshStartedAt = Date.now();
  try {
    const pairs = state.cfg?.pairs?.length ? state.cfg.pairs : DEFAULT_PAIRS;
    await refreshAllPairs(pairs);
    state.levelsRefreshAt = Date.now();
    await reloadLevels();

    // Compute HMM regime for each pair using last 200 daily closes (1 year)
    const hmmResults = [];
    for (const sym of pairs) {
      const closes = await fetchDailyCandles(sym, 201);
      if (closes && closes.length >= 20) {
        const returns = [];
        for (let i = 1; i < closes.length; i++) {
          returns.push(Math.log(closes[i] / closes[i - 1]));
        }
        const result = fitHMM(returns);
        if (result) {
          // Preserve intraday30m set by reloadLevels() — don't clobber it
          state.hmmRegimes[sym] = { ...result, intraday30m: state.hmmRegimes[sym]?.intraday30m };
          const reliableTag = result.reliable ? '' : '⚠ambiguous';
          hmmResults.push(`${sym}:${result.regime}${result.trendDir ? `(${result.trendDir})` : ''}@${Math.round(result.rangeProb * 100)}%range ratio=${result.sigmaRatio?.toFixed(2)}${reliableTag}`);
        }
      }
    }
    if (hmmResults.length) console.log('[HMM]', hmmResults.join(' | '));

  } catch (e) {
    console.error('[LEVELS] Refresh error:', e.message);
  } finally {
    state.levelsRefreshRunning = false;
  }
}

async function runHMM5mRefresh() {
  if (!process.env.OANDA_KEY) return;
  const pairs   = state.cfg?.pairs?.length ? state.cfg.pairs : DEFAULT_PAIRS;
  const results = [];

  for (const sym of pairs) {
    try {
      const bars = await fetchHMMBars(sym, 500);
      if (!bars || bars.length < 150) continue;
      state.hmm5mBars[sym] = bars; // cache M1 bars for polarity flip detection

      const result = computeHMM5m(bars, sym);
      if (!result) continue;

      const prev = state.hmm5mRegimes[sym];
      state.hmm5mRegimes[sym] = result;

      // Telegram alert on regime change, with cooldown
      if (prev && prev.regime !== result.regime && state.cfg?.enabled !== false && state.cfg?.regimeChangeAlerts !== false) {
        const lastAlert = state.hmm5mLastAlert[sym] ?? 0;
        const now       = Date.now();
        if (now - lastAlert >= HMM5M_ALERT_COOLDOWN_MS && state.tg?.token && state.tg?.chatId) {
          const timeStr = new Date(result.computedAt)
            .toISOString().replace('T', ' ').substring(0, 16) + ' UTC';
          const msg = [
            `🔄 <b>${sym} Regime Change</b>`,
            `${prev.regime} → <b>${result.regime}</b>`,
            `Bull: <b>${result.pBull}%</b>  ·  Bear: ${result.pBear}%  ·  Range: ${result.pRange}%`,
            `Confidence: <b>${result.confidence}%</b>`,
            `<i>${timeStr}</i>`,
          ].join('\n');
          const sent = await sendTelegram(state.tg.token, state.tg.chatId, msg);
          if (sent) state.hmm5mLastAlert[sym] = now;
        }
      }

      results.push(`${sym}:${result.regime}@${result.confidence}%`);
    } catch (e) {
      console.error(`[HMM5M] ${sym} error:`, e.message);
    }
  }

  if (results.length) console.log('[HMM5M]', results.join(' | '));
}

async function runHMM5mV2Refresh() {
  if (!process.env.OANDA_KEY) return;
  const pairs = state.cfg?.pairs?.length ? state.cfg.pairs : DEFAULT_PAIRS;
  for (const sym of pairs) {
    try {
      const bars = await fetchHMMBars(sym, 500);
      if (!bars || bars.length < 150) continue;
      const result = computeHMM5mV2(bars, sym, state.hmm5mTrainedParams, state.hmm5mMacroContext);
      if (!result) continue;
      state.hmm5mV2Regimes[sym] = result;
    } catch (e) {
      console.error(`[HMM5M-V2] ${sym} error:`, e.message);
    }
  }
}

async function runHMM1hV2Refresh() {
  if (!process.env.OANDA_KEY) return;
  const pairs = state.cfg?.pairs?.length ? state.cfg.pairs : DEFAULT_PAIRS;
  const base = (process.env.OANDA_ENV || 'live') === 'practice'
    ? 'https://api-fxpractice.oanda.com'
    : 'https://api-fxtrade.oanda.com';
  for (const sym of pairs) {
    try {
      const instrument = sym.replace('/', '_');
      const r = await fetch(
        `${base}/v3/instruments/${encodeURIComponent(instrument)}/candles?granularity=H1&count=200&price=M`,
        { headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` }, signal: AbortSignal.timeout(10_000) }
      );
      if (!r.ok) continue;
      const d = await r.json();
      const bars = (d.candles ?? [])
        .filter(c => c.complete !== false && c.mid)
        .map(c => ({ open: c.mid.o, high: c.mid.h, low: c.mid.l, close: c.mid.c }));
      if (bars.length < 100) continue;
      const result = computeHMM5mV2(bars, sym, state.hmm5mTrainedParams, state.hmm5mMacroContext);
      if (!result) continue;
      state.hmm1hV2Regimes[sym] = result;
    } catch (e) {
      console.error(`[HMM1H-V2] ${sym} error:`, e.message);
    }
  }
}

async function runHMM30mV2Refresh() {
  if (!process.env.OANDA_KEY) return;
  const pairs = state.cfg?.pairs?.length ? state.cfg.pairs : DEFAULT_PAIRS;
  const base = (process.env.OANDA_ENV || 'live') === 'practice'
    ? 'https://api-fxpractice.oanda.com'
    : 'https://api-fxtrade.oanda.com';
  for (const sym of pairs) {
    try {
      const instrument = sym.replace('/', '_');
      const r = await fetch(
        `${base}/v3/instruments/${encodeURIComponent(instrument)}/candles?granularity=M30&count=500&price=M`,
        { headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` }, signal: AbortSignal.timeout(10_000) }
      );
      if (!r.ok) continue;
      const d = await r.json();
      const bars = (d.candles ?? [])
        .filter(c => c.complete !== false && c.mid)
        .map(c => ({ open: c.mid.o, high: c.mid.h, low: c.mid.l, close: c.mid.c }));
      if (bars.length < 150) continue;
      const result = computeHMM5mV2(bars, sym, state.hmm5mTrainedParams, state.hmm5mMacroContext);
      if (!result) continue;
      state.hmm30mV2Regimes[sym] = result;
    } catch (e) {
      console.error(`[HMM30M-V2] ${sym} error:`, e.message);
    }
  }
}

async function runHMM2hV2Refresh() {
  if (!process.env.OANDA_KEY) return;
  const pairs = state.cfg?.pairs?.length ? state.cfg.pairs : DEFAULT_PAIRS;
  const base = (process.env.OANDA_ENV || 'live') === 'practice'
    ? 'https://api-fxpractice.oanda.com'
    : 'https://api-fxtrade.oanda.com';
  for (const sym of pairs) {
    try {
      const instrument = sym.replace('/', '_');
      const r = await fetch(
        `${base}/v3/instruments/${encodeURIComponent(instrument)}/candles?granularity=H2&count=200&price=M`,
        { headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` }, signal: AbortSignal.timeout(10_000) }
      );
      if (!r.ok) continue;
      const d = await r.json();
      const bars = (d.candles ?? [])
        .filter(c => c.complete !== false && c.mid)
        .map(c => ({ open: c.mid.o, high: c.mid.h, low: c.mid.l, close: c.mid.c }));
      if (bars.length < 100) continue;
      const result = computeHMM5mV2(bars, sym, state.hmm5mTrainedParams, state.hmm5mMacroContext);
      if (!result) continue;
      state.hmm2hV2Regimes[sym] = result;
    } catch (e) {
      console.error(`[HMM2H-V2] ${sym} error:`, e.message);
    }
  }
}

async function refreshMacroContext() {
  if (!process.env.FRED_KEY) return;
  try {
    const fredData = await fetchFredMacro(process.env.FRED_KEY);
    if (!fredData) return;
    const macroCtx = { ...computeMacroContext(fredData), updatedAt: new Date().toISOString() };
    state.hmm5mMacroContext = macroCtx;
    await kv.put('hmm5m_macro_context', JSON.stringify(macroCtx));
    console.log(`[MACRO] Refreshed — VIX=${macroCtx.vix}  HY=${macroCtx.hySpread}  curve=${macroCtx.curve}  label=${macroCtx.label}`);
  } catch (e) {
    console.error('[MACRO] refresh failed:', e.message);
  }
}

// ── Server-side FRED dashboard cache refresh ──────────────────────────────────
// Fetches all 31 FRED series sequentially (600ms gaps = ~100 req/min) and stores
// in fred_data_v3 KV. Runs at startup and every 6h so the /api/fred endpoint
// always serves from KV — no client-triggered concurrent FRED batches.
const _FRED_DASH_SERIES = {
  vix: 'VIXCLS', us2y: 'GS2', us5y: 'GS5', us10y: 'GS10',
  dxy: 'DTWEXBGS', hy: 'BAMLH0A0HYM2', nfci: 'NFCI',
  tips: 'DFII10', tips5: 'DFII5', bei: 'T10YIE',
  aud_usd: 'DEXUSAL', usd_jpy: 'DEXJPUS',
  de10y: 'IRLTLT01DEM156N', gb10y: 'IRLTLT01GBM156N',
  jp10y: 'IRLTLT01JPM156N', au10y: 'IRLTLT01AUM156N',
  ca10y: 'IRLTLT01CAM156N', ch10y: 'IRLTLT01CHM156N',
  de_short: 'IRSTCI01DEM156N', gb_short: 'IR3TIB01GBM156N',
  jp_short: 'IRSTCI01JPM156N', au_short: 'IR3TIB01AUM156N',
  ca_short: 'IRSTCI01CAM156N', ch_short: 'IRSTCI01CHM156N',
  wti: 'DCOILWTICO', walcl: 'WALCL', tga: 'WTREGEN', rrp: 'RRPONTSYD',
  nzd_usd: 'DEXUSNZ', hy_bb: 'BAMLH0A1HYBB', hy_ccc: 'BAMLH0A3HYC',
};
const _FRED_DASH_KV     = 'fred_data_v3';
const _FRED_DASH_CRIT   = ['vix', 'us10y', 'hy', 'nfci'];
let   _fredDashRunning  = false;

// fredhistory series — 90 daily/monthly obs per series, pre-populated at startup so
// /api/fredhistory assembles from KV instead of making concurrent FRED calls from every
// client compass load. Stored as fredhistory_series_<key> with 6h TTL.
const _FREDHISTORY_SERIES = {
  us2y: 'GS2', us5y: 'GS5', us10y: 'GS10', dxy: 'DTWEXBGS',
  tips: 'DFII10', tips5: 'DFII5', bei: 'T10YIE', vix: 'VIXCLS',
  hy: 'BAMLH0A0HYM2',
  de10y: 'IRLTLT01DEM156N', gb10y: 'IRLTLT01GBM156N',
  jp10y: 'IRLTLT01JPM156N', au10y: 'IRLTLT01AUM156N',
  ca10y: 'IRLTLT01CAM156N', ch10y: 'IRLTLT01CHM156N',
  de_short: 'IRSTCI01DEM156N', gb_short: 'IR3TIB01GBM156N',
  jp_short: 'IRSTCI01JPM156N', au_short: 'IR3TIB01AUM156N',
  ca_short: 'IRSTCI01CAM156N', ch_short: 'IRSTCI01CHM156N',
};
let _fredHistoryRunning = false;

async function refreshFredHistory(retry = 0) {
  if (!process.env.FRED_KEY) return;
  if (_fredHistoryRunning) return;
  _fredHistoryRunning = true;
  const entries = Object.entries(_FREDHISTORY_SERIES);
  let ok = 0, skipped = 0, fail = 0;
  try {
    for (const [key, id] of entries) {
      const kvKey = `fredhistory_series_${key}`;
      try {
        const existing = await kv.get(kvKey);
        if (existing) { skipped++; continue; }
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}` +
          `&api_key=${process.env.FRED_KEY}&file_type=json&sort_order=desc&limit=90`;
        const r = await fetch(url);
        if (!r.ok) { fail++; console.warn(`[FRED] fredhistory ${key}: HTTP ${r.status}`); }
        else {
          const d = await r.json();
          const pts = (d.observations || [])
            .filter(o => o.value && o.value !== '.')
            .map(o => ({ date: o.date, value: parseFloat(o.value) }))
            .reverse();
          if (pts.length > 0) {
            await kv.put(kvKey, JSON.stringify(pts), { expirationTtl: 6 * 60 * 60 });
            ok++;
          } else { fail++; }
        }
      } catch(e) {
        fail++;
        console.warn(`[FRED] fredhistory ${key}:`, e.message);
      }
      await new Promise(res => setTimeout(res, 600));
    }
    if (ok > 0 || skipped === entries.length)
      console.log(`[FRED] fredhistory series ready — ${ok} fetched, ${skipped} cached, ${fail} failed`);
    if (fail > 0 && retry < 2) {
      const waitMin = (retry + 1) * 2;
      console.warn(`[FRED] fredhistory ${fail} failures — retry in ${waitMin} min`);
      setTimeout(() => refreshFredHistory(retry + 1).catch(console.error), waitMin * 60 * 1000);
    }
  } finally {
    _fredHistoryRunning = false;
  }
}

async function refreshFredDashboard(retry = 0) {
  if (!process.env.FRED_KEY) {
    console.warn('[FRED] FRED_KEY not set — dashboard FRED data unavailable');
    return;
  }
  if (_fredDashRunning) return; // prevent overlapping runs

  // Skip if KV already has fresh valid data
  try {
    const existing = await kv.get(_FRED_DASH_KV);
    if (existing) {
      const { d, t } = JSON.parse(existing);
      if (_FRED_DASH_CRIT.every(k => d[k]?.value != null) &&
          Date.now() - (t || 0) < 5 * 60 * 60 * 1000) return;
    }
  } catch {}

  _fredDashRunning = true;
  console.log('[FRED] Sequential dashboard refresh starting (31 series, ~20s)...');
  const out = {};
  try {
    for (const [key, id] of Object.entries(_FRED_DASH_SERIES)) {
      try {
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}` +
          `&api_key=${process.env.FRED_KEY}&file_type=json&sort_order=desc&limit=5`;
        const r = await fetch(url);
        const d = await r.json();
        const valid = (d.observations || [])
          .filter(o => o.value && o.value !== '.')
          .map(o => parseFloat(o.value));
        out[key] = { value: valid[0] ?? null, prev: valid[1] ?? null };
      } catch {
        out[key] = { value: null, prev: null };
      }
      await new Promise(res => setTimeout(res, 600)); // 600ms gap ≈ 100 req/min
    }

    const critOk     = _FRED_DASH_CRIT.every(k => out[k]?.value != null);
    const validCount = Object.values(out).filter(v => v.value != null).length;
    if (critOk && validCount >= 10) {
      await kv.put(_FRED_DASH_KV, JSON.stringify({ d: out, t: Date.now() }), { expirationTtl: 86400 });
      console.log(`[FRED] Dashboard cache ready — ${validCount}/31 valid` +
        ` VIX=${out.vix?.value} HY=${out.hy?.value} US10Y=${out.us10y?.value} NFCI=${out.nfci?.value}`);
    } else {
      const missing = _FRED_DASH_CRIT.filter(k => out[k]?.value == null);
      if (retry < 2) {
        const waitMin = (retry + 1) * 2;
        console.warn(`[FRED] Refresh incomplete (attempt ${retry + 1}) — missing: ${missing.join(', ')} — retry in ${waitMin} min`);
        // Retry up to 2 times to recover from transient FRED rate-limiting at startup.
        // finally{} below clears _fredDashRunning so the retry can acquire the lock.
        setTimeout(() => refreshFredDashboard(retry + 1).catch(console.error), waitMin * 60 * 1000);
      } else {
        console.warn(`[FRED] Refresh failed after ${retry + 1} attempts — missing: ${missing.join(', ')} — next attempt at scheduled 6h interval`);
      }
    }
  } finally {
    _fredDashRunning = false;
  }
}

async function runHMM5mTraining(pairs) {
  const { results, status } = await trainHMM5mAll(
    pairs,
    process.env.OANDA_KEY,
    process.env.OANDA_ENV,
  );
  // Update training status with completion timestamps
  for (const [sym, st] of Object.entries(status)) {
    state.hmm5mTrainStatus[sym] = { ...st, completedAt: Date.now() };
  }
  // Reload learned params into state
  try {
    const { trainedParams, macroContext } = await loadTrainedParams();
    if (trainedParams) state.hmm5mTrainedParams = trainedParams;
    if (macroContext)  state.hmm5mMacroContext  = macroContext;
  } catch (e) {
    console.error('[HMM5M-TRAIN] reload error:', e.message);
  }
  const done  = Object.values(status).filter(s => s.status === 'done').length;
  const total = pairs.length;
  console.log(`[HMM5M-TRAIN] complete — ${done}/${total} pairs learned`);
}

await kv.load();
await reloadConfig();
await reloadLevels();

// Load any previously trained V2 params from KV on startup
try {
  const { trainedParams, macroContext } = await loadTrainedParams();
  if (trainedParams) state.hmm5mTrainedParams = trainedParams;
  if (macroContext)  state.hmm5mMacroContext  = macroContext;
  if (trainedParams) console.log('[HMM5M-V2] Loaded trained params from KV');
} catch (e) {
  console.error('[HMM5M-V2] Failed to load trained params:', e.message);
}

setInterval(monitorTick, MONITOR_MS);
monitorTick().catch(console.error);

// Run an initial level refresh on boot, then every REFRESH_LEVELS_MS (default 30 min)
setInterval(runLevelsRefresh, REFRESH_LEVELS_MS);
runLevelsRefresh().catch(console.error);

// Live 5m HMM — runs every minute, initial run after a short delay so levels load first
setTimeout(() => {
  runHMM5mRefresh().catch(console.error);
  setInterval(runHMM5mRefresh, HMM5M_REFRESH_MS);
}, 15_000);

// V2 shadow HMM — same cadence, 5s offset so it doesn't fire simultaneously with V1
setTimeout(() => {
  runHMM5mV2Refresh().catch(console.error);
  setInterval(runHMM5mV2Refresh, HMM5M_REFRESH_MS);
}, 20_000);

// V2 1h HTF HMM — refreshes every 5 min (H1 bars change slowly), 10s offset
setTimeout(() => {
  runHMM1hV2Refresh().catch(console.error);
  setInterval(runHMM1hV2Refresh, 5 * 60 * 1000);
}, 25_000);

// V2 30m MTF HMM — primary signal for regime_bot_v7.py, refreshes every 5 min
setTimeout(() => {
  runHMM30mV2Refresh().catch(console.error);
  setInterval(runHMM30mV2Refresh, 5 * 60 * 1000);
}, 30_000);

// V2 2h HTF HMM — optional 4x confirmation gate for regime_bot_v7.py, refreshes every 10 min
setTimeout(() => {
  runHMM2hV2Refresh().catch(console.error);
  setInterval(runHMM2hV2Refresh, 10 * 60 * 1000);
}, 35_000);

// Macro context (VIX, HY spread, yield curve via FRED) — refresh every 6h, run once at startup
refreshMacroContext().catch(console.error);
setInterval(refreshMacroContext, MACRO_REFRESH_MS);

// FRED dashboard cache — sequential fetch at startup + every 6h to pre-populate fred_data_v3
// so /api/fred always serves from KV without client-triggered concurrent FRED batches.
refreshFredDashboard().catch(console.error);
setInterval(refreshFredDashboard, MACRO_REFRESH_MS);

// fredhistory series cache — 21 series × 90 obs, starts 30s after dashboard refresh to avoid
// concurrent FRED requests, then every 6h.  Allows /api/fredhistory to serve entirely from KV.
setTimeout(() => {
  refreshFredHistory().catch(console.error);
  setInterval(refreshFredHistory, MACRO_REFRESH_MS);
}, 30_000);

// Correlation history — builds on startup if missing/stale, then every 6 hours.
// Fetches 5y of H4 OANDA bars for all pairs, computes rolling Pearson correlations + factor betas.
// ~3 min to build, ~500-900 KB output. Stored at bot/data/corr_history.json.
// 6-hour cadence keeps z-scores fresh: each H4 bar advances the rolling window by one step.
setTimeout(() => runCorrHistoryRefresh().catch(e => console.error('[CORR]', e.message)), 60_000);
setInterval(() => runCorrHistoryRefresh().catch(e => console.error('[CORR]', e.message)), 6 * 60 * 60 * 1000);

// Beta estimation — runs every 2 hours; first run 90s after startup (after corr fetch begins)
setTimeout(() => buildBetaEstimates().catch(e => console.error('[BETA]', e.message)), 90_000);
setInterval(() => buildBetaEstimates().catch(e => console.error('[BETA]', e.message)), BETA_INTERVAL_MS);

// Hedge signal scanner — first run 5 min after startup (corr history must exist), then every 15 min.
// Reduced from 30 min: exits now fire within 15 min of z-score reverting, not up to 30 min.
setTimeout(() => computeHedgeSignals().catch(e => console.error('[HEDGE-SIG]', e.message)), 5 * 60_000);
setInterval(() => computeHedgeSignals().catch(e => console.error('[HEDGE-SIG]', e.message)), 15 * 60_000);

// Vol & Range Forecast scheduler — runs daily at 22:00 UTC, computes on startup if stale
startVolForecastScheduler().catch(e => console.error('[VOL-FORECAST] Scheduler init failed:', e.message));

// Session stats KV restore — if the local file was lost on container restart, reload from KV.
// The local file is ephemeral (Railway wipes it); KV survives restarts.
(async () => {
  if (getSessionStats()) return; // file already present
  try {
    const raw = await kv.get('session_stats');
    if (!raw) return;
    const dir = path.join(__dirname, 'VolRangeForecaster', 'data');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'session_stats.json'), raw);
    console.log('[SESSION-STATS] Restored from KV after container restart');
  } catch (e) {
    console.error('[SESSION-STATS] KV restore failed:', e.message);
  }
})();

// ── Volatility data auto-warm ─────────────────────────────────────────────────
// Ensures hit rates, event impact, and session stats are always pre-computed
// so the volatility page never shows "click ↻ Compute" on first load.
// Each block is delayed to let the forecast scheduler and FRED fetches settle.

// Session stats — auto-compute once if still missing after KV restore (45s delay)
(async () => {
  await new Promise(r => setTimeout(r, 45_000));
  if (getSessionStats() || isSessionStatsComputing()) return;
  console.log('[SESSION-STATS] Not found in KV — auto-computing (5y H1 pull, ~3–5 min)…');
  try {
    const data = await computeSessionStats();
    await kv.put('session_stats', JSON.stringify(data));
    console.log('[SESSION-STATS] Auto-compute complete — stored to KV');
  } catch (e) { console.error('[SESSION-STATS] Auto-warm failed:', e.message); }
})();

// Event impact — auto-compute on startup if missing or older than 7 days (90s delay)
(async () => {
  if (!process.env.FINNHUB_KEY) return;
  await new Promise(r => setTimeout(r, 90_000));
  try {
    const raw = await kv.get('event_vol_impact');
    if (raw) {
      const age = Date.now() - new Date(JSON.parse(raw).computed_at ?? 0).getTime();
      if (age < 7 * 864e5) return; // < 7 days old — still current
    }
    console.log('[EVENT-IMPACT] Auto-warming on startup%s…', raw ? ' (stale)' : ' (missing)');
    await _computeEventImpact();
    console.log('[EVENT-IMPACT] Auto-warm complete');
  } catch (e) { console.error('[EVENT-IMPACT] Auto-warm failed:', e.message); }
})();

// Hit rates — auto-compute/extend on startup if missing or older than 1 day (3 min delay)
// Incremental: only fetches H1 data for days after the last stored date (~30–60s).
// Full run (first time): fetches 90 days × 22 instruments of H1 data (~5–10 min).
(async () => {
  await new Promise(r => setTimeout(r, 3 * 60_000));
  if (isHitRatesComputing()) return;
  try {
    const raw = await kv.get('vol_hit_rates');
    let existingData = null;
    if (raw) {
      existingData = JSON.parse(raw);
      const age = Date.now() - new Date(existingData.computed_at ?? 0).getTime();
      if (age < 86_400_000) return; // < 1 day old — already current
    }
    console.log('[HIT-RATES] Auto-warming%s…', existingData ? ' (incremental)' : ' (full 90d)');
    const result = await computeHitRates(90, existingData);
    await kv.put('vol_hit_rates', JSON.stringify(result));
    console.log('[HIT-RATES] Auto-warm complete — stored to KV');
  } catch (e) { console.error('[HIT-RATES] Auto-warm failed:', e.message); }
})();

// Daily auto-refresh at 22:30 UTC — fires after the daily vol forecast + session audit.
// Hit rates: incremental (only the new day's H1 data, ~30–60s).
// Event impact: re-matches all session audits against Finnhub calendar (~15s).
let _volDataDailyDate = null;
setInterval(async () => {
  const now = new Date();
  if (now.getUTCDay() === 0 || now.getUTCDay() === 6) return;
  const h = now.getUTCHours(), m = now.getUTCMinutes();
  if (h !== 22 || m < 30 || m >= 45) return; // window: 22:30–22:45 UTC
  const today = now.toISOString().slice(0, 10);
  if (_volDataDailyDate === today) return;
  _volDataDailyDate = today;

  if (!isHitRatesComputing()) {
    const raw = await kv.get('vol_hit_rates').catch(() => null);
    const existingData = raw ? JSON.parse(raw) : null;
    console.log('[HIT-RATES] Daily incremental refresh…');
    computeHitRates(90, existingData)
      .then(r => kv.put('vol_hit_rates', JSON.stringify(r)))
      .then(() => console.log('[HIT-RATES] Daily refresh stored to KV'))
      .catch(e => console.error('[HIT-RATES] Daily refresh failed:', e.message));
  }

  if (process.env.FINNHUB_KEY) {
    _computeEventImpact()
      .then(() => console.log('[EVENT-IMPACT] Daily refresh complete'))
      .catch(e => console.error('[EVENT-IMPACT] Daily refresh failed:', e.message));
  }
}, 5 * 60_000);

// ── NQ-QMR Live Signal Monitor ────────────────────────────────────────────────
// Runs on Railway alongside the main server. No separate process needed.
// Gate 1 ~ 09:05 UTC  (04:48 ET / 09:48 LDN — Asia session validated)
// Gate 2 ~ 12:05 UTC  (07:40 ET / 12:40 LDN — London confirmation)
// Entry  ~ 13:05 UTC  (09:25 ET — pre-open signal, signal-only for now)
// EOD    ~ 20:30 UTC  (end-of-day summary)

const NQ_MON_KV   = 'nq_qmr_status';
const NQ_AUDIT_KV = 'nq_qmr_audit';

const nqMon = {
  date: null, gate1: null, gate2: null, direction: null,
  newsBlocked: false, newsEvents: [],
  sentOpen: false, sentGate1: false, sentGate2: false, sentEntry: false,
  gate1Data: null, gate2Data: null,
};

// Fetch last N completed H1 bars for an OANDA instrument (no pagination needed)
async function fetchOandaRecentH1(instrument, count) {
  const base = _oandaBaseMe();
  const url  = `${base}/v3/instruments/${encodeURIComponent(instrument)}/candles`
             + `?granularity=H1&count=${count}&price=M`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` },
    signal:  AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`OANDA H1 ${instrument} ${r.status}`);
  const d = await r.json();
  return (d.candles ?? []).filter(c => c.mid).map(c => ({
    t: c.time.substring(0, 16),
    o: parseFloat(c.mid.o), h: parseFloat(c.mid.h),
    l: parseFloat(c.mid.l), c: parseFloat(c.mid.c),
    complete: c.complete !== false,
  }));
}

// Check Finnhub economic calendar for high-impact US events in the trade window
async function nqFetchNewsRisk(dateStr) {
  const key = process.env.FINNHUB_KEY;
  if (!key) return { blocked: false, events: [] };
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/calendar/economic?from=${dateStr}&to=${dateStr}&token=${key}`,
      { signal: AbortSignal.timeout(10_000) }
    );
    if (!r.ok) return { blocked: false, events: [] };
    const d = await r.json();
    const events = (d.economicCalendar ?? []).filter(e => {
      if (e.country !== 'US') return false;
      if ((e.impact ?? '').toLowerCase() !== 'high') return false;
      const timePart = (e.time ?? '').split(' ')[1] ?? '';
      const hour = parseInt(timePart.split(':')[0] ?? '0');
      return hour >= 8 && hour <= 11; // 08:00–11:00 ET risk window
    });
    return { blocked: events.length > 0, events };
  } catch { return { blocked: false, events: [] }; }
}

// Push gate state to KV so bot-config NQ-QMR tab shows live status
async function nqPushKv() {
  try {
    const raw = await kv.get(NQ_MON_KV).catch(() => null);
    const parsed = raw ? JSON.parse(raw) : {};
    // Handle both wrapped {data:{...},timestamp} and bare object formats
    const existing = parsed?.data ?? parsed ?? {};
    const g1state = nqMon.gate1 === 'LONG' || nqMon.gate1 === 'SHORT' ? 'PASS'
                  : nqMon.gate1 === 'FLAT' ? 'FAIL' : null;
    const g2state = nqMon.gate2 === 'CONFIRMED' ? 'PASS'
                  : nqMon.gate2 === 'REJECTED'  ? 'FAIL' : null;
    const payload = {
      ...existing,
      gates: {
        gate1: { state: g1state, ts: Date.now(), direction: nqMon.gate1, data: nqMon.gate1Data },
        gate2: { state: g2state, ts: Date.now(), data: nqMon.gate2Data },
      },
      today_direction: nqMon.direction,
      news_blocked:    nqMon.newsBlocked,
      news_events:     nqMon.newsEvents,
      pushed_at:       Math.floor(Date.now() / 1000),
      mt5_positions:        existing.mt5_positions        ?? [],
      today_closed_trades:  existing.today_closed_trades  ?? [],
    };
    await kv.put(NQ_MON_KV, JSON.stringify({ data: payload, timestamp: Date.now() }));
  } catch (e) { console.error('[nq-mon] KV write error:', e.message); }
}

// Upsert today's entry in the rolling audit log (last 90 days)
async function nqAuditUpdate(fields) {
  try {
    const today = nqMon.date || new Date().toISOString().substring(0, 10);
    const raw   = await kv.get(NQ_AUDIT_KV).catch(() => null);
    let log = [];
    try {
      const parsed = raw ? JSON.parse(raw) : [];
      // Handle both wrapped {data:[...],timestamp} and bare array formats
      log = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.data) ? parsed.data : []);
    } catch { log = []; }
    let idx = log.findIndex(e => e.date === today);
    if (idx === -1) { log.unshift({ date: today }); idx = 0; }
    Object.assign(log[idx], fields);
    if (log.length > 90) log = log.slice(0, 90);
    await kv.put(NQ_AUDIT_KV, JSON.stringify({ data: log, timestamp: Date.now() }));
  } catch (e) { console.error('[nq-audit] write error:', e.message); }
}

async function nqSendTg(msg) {
  // Check NQ-specific TG config first, fall back to shared state.tg
  try {
    const cfg    = await nqLoadMonCfg();
    const token  = cfg.tgToken  || state.tg?.token;
    const chatId = cfg.tgChatId || state.tg?.chatId;
    if (token && chatId) await sendTelegram(token, chatId, msg).catch(() => {});
  } catch {
    if (state.tg?.token && state.tg?.chatId)
      await sendTelegram(state.tg.token, state.tg.chatId, msg).catch(() => {});
  }
}

async function _iqrSendTg(mon, msg) {
  // Check instrument-specific TG config first, fall back to shared state.tg
  try {
    const cfg    = await _iqrLoadMonCfg(mon);
    const token  = cfg.tgToken  || state.tg?.token;
    const chatId = cfg.tgChatId || state.tg?.chatId;
    if (token && chatId) await sendTelegram(token, chatId, msg).catch(() => {});
  } catch {
    if (state.tg?.token && state.tg?.chatId)
      await sendTelegram(state.tg.token, state.tg.chatId, msg).catch(() => {});
  }
}

// ── Gate checks ───────────────────────────────────────────────────────────────

async function nqDailyOpen() {
  const today = new Date().toISOString().substring(0, 10);
  Object.assign(nqMon, {
    date: today, gate1: null, gate2: null, direction: null,
    newsBlocked: false, newsEvents: [],
    sentOpen: false, sentGate1: false, sentGate2: false, sentEntry: false,
    gate1Data: null, gate2Data: null,
  });

  const news = await nqFetchNewsRisk(today);
  nqMon.newsBlocked = news.blocked;
  nqMon.newsEvents  = news.events;

  let msg = `📅 <b>NQ-QMR | ${today}</b>\n\n`;
  msg += `Gate 1 signal:  04:48 ET  (09:05 UTC)\n`;
  msg += `Gate 2 signal:  07:40 ET  (12:05 UTC)\n`;
  msg += `Entry signal:   09:25 ET  (13:05 UTC)\n\n`;

  if (news.blocked) {
    msg += `⚠️ <b>HIGH-IMPACT US NEWS — trade suppressed</b>\n`;
    msg += news.events.map(e => `  • ${e.event} @ ${(e.time ?? '').split(' ')[1] ?? '?'} ET`).join('\n');
  } else {
    msg += `✓ No high-impact US data — monitor active`;
    if (process.env.FINNHUB_KEY) {} else {
      msg += `\n<i>(set FINNHUB_KEY to enable news filter)</i>`;
    }
  }

  await nqSendTg(msg);
  nqMon.sentOpen = true;
  await nqPushKv();
  await nqAuditUpdate({
    date:         today,
    news_blocked: news.blocked,
    news_events:  news.events.map(e => e.event ?? String(e)).filter(Boolean),
    gate1: null, gate2: null, signal: null, trade: null,
  });
  console.log(`[nq-mon] Day open ${today} news_blocked=${news.blocked}`);
}

async function nqLoadMonCfg() {
  try {
    const raw = await kv.get('nq_qmr_config');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Frontend writes via _kvSet which wraps in {data:{...},timestamp}
    return parsed?.data ?? parsed ?? {};
  } catch { return {}; }
}

async function nqGate1Check() {
  const cfg = await nqLoadMonCfg();
  if (cfg.enabled === false) { console.log('[nq-mon] Gate 1 skipped — monitor disabled in config'); return; }
  if (nqMon.newsBlocked && cfg.newsFilter !== false) { console.log('[nq-mon] Gate 1 skipped — news block'); return; }
  if (!process.env.OANDA_KEY) return;

  try {
    // Last 15 H1 bars covers back to prev-day ~18:00 UTC (overnight range)
    const [nas, xau, eur] = await Promise.all([
      fetchOandaRecentH1('NAS100_USD', 15),
      fetchOandaRecentH1('XAU_USD',    15).catch(() => []),
      fetchOandaRecentH1('EUR_USD',    15).catch(() => []),
    ]);

    // Overnight bars = completed bars covering Asia session
    const today = new Date().toISOString().substring(0, 10);
    const overnight = nas.filter(b => {
      const h = parseInt(b.t.substring(11, 13));
      const d = b.t.substring(0, 10);
      return b.complete && ((d < today && h >= 20) || (d === today && h <= 8));
    });
    if (overnight.length < 3) { console.log('[nq-mon] Gate 1: too few overnight bars'); return; }

    const asiaH   = Math.max(...overnight.map(b => b.h));
    const asiaL   = Math.min(...overnight.map(b => b.l));
    const range   = asiaH - asiaL;
    const mid     = (asiaH + asiaL) / 2;
    const rangePct = mid > 0 ? (range / mid * 100) : 0;

    // Price at Gate 1 time = close of most recent completed bar
    const g1bar = nas.filter(b => b.complete).slice(-1)[0];
    if (!g1bar) return;

    const pos      = range > 0 ? (g1bar.c - asiaL) / range : 0.5;
    const THRESH   = cfg.gate1Threshold  ?? 0.60;
    const MIN_RNG  = cfg.minRangePct     ?? 0.15;
    let gate1 = pos >= THRESH ? 'LONG' : pos <= (1 - THRESH) ? 'SHORT' : 'FLAT';

    // Low overnight range = low conviction — treat as FLAT
    if (rangePct < MIN_RNG) gate1 = 'FLAT';

    // Enrichment: gold and EUR direction during Asia
    const xauOld = xau.filter(b => b.complete).slice(-8, -4)[0];
    const xauNew = xau.filter(b => b.complete).slice(-1)[0];
    const goldDir = xauOld && xauNew
      ? (xauNew.c > xauOld.c ? '↑ rising (risk-off)' : '↓ falling (risk-on)') : 'N/A';

    const eurOld  = eur.filter(b => b.complete).slice(-8, -4)[0];
    const eurNew  = eur.filter(b => b.complete).slice(-1)[0];
    const eurDir  = eurOld && eurNew
      ? (eurNew.c > eurOld.c ? '↑ USD weaker (NQ +)' : '↓ USD stronger (NQ -)') : 'N/A';

    const stopMul    = cfg.stopMultiplier ?? 0.45;
    const stopPctDyn = stopMul > 0
      ? Math.max(+(rangePct * stopMul).toFixed(3), 0.10)
      : +(cfg.stopPct ?? 0.50);
    nqMon.gate1     = gate1;
    nqMon.gate1Data = { price: g1bar.c, asiaH, asiaL, range, rangePct, stopPct: stopPctDyn, pos, goldDir, eurDir };

    const icon     = gate1 === 'FLAT' ? '⚫' : '🟡';
    const dirEmoji = gate1 === 'LONG' ? '▲' : gate1 === 'SHORT' ? '▼' : '—';

    let msg = `${icon} <b>NQ-QMR | GATE 1</b>  ${gate1}\n`;
    msg += `${dirEmoji} Direction bias: <b>${gate1}</b>\n`;
    msg += `Time: ${g1bar.t.substring(11, 16)} UTC\n\n`;
    msg += `NAS100:  ${g1bar.c.toFixed(1)}\n`;
    msg += `Asia range: ${asiaL.toFixed(1)} — ${asiaH.toFixed(1)}  (${rangePct.toFixed(2)}%)\n`;
    msg += `Position in range: ${(pos * 100).toFixed(0)}%  (threshold: 60%)\n\n`;
    msg += `Gold overnight: ${goldDir}\n`;
    msg += `EUR/USD (DXY proxy): ${eurDir}\n`;

    if (gate1 === 'FLAT') {
      msg += `\nRange too ambiguous — <b>no trade today</b>`;
    } else {
      msg += `\nAwaiting Gate 2 @ 12:40 LDN (12:05 UTC)`;
    }

    await nqSendTg(msg);
    nqMon.sentGate1 = true;
    await nqPushKv();
    await nqAuditUpdate({ gate1: {
      state:    gate1 === 'LONG' || gate1 === 'SHORT' ? 'PASS' : 'FAIL',
      direction: gate1,
      ts:       Date.now(),
      price:    g1bar.c,
      asiaH, asiaL,
      rangePct: +rangePct.toFixed(3),
      stopPct:  stopPctDyn,
      pos:      +pos.toFixed(4),
      goldDir, eurDir,
    }});
    console.log(`[nq-mon] Gate 1 → ${gate1}  pos=${(pos*100).toFixed(0)}%  range=${rangePct.toFixed(2)}%`);
  } catch (e) { console.error('[nq-mon] Gate 1 error:', e.message); }
}

async function nqGate2Check() {
  const cfg = await nqLoadMonCfg();
  if (cfg.enabled === false) return;
  if (nqMon.newsBlocked && cfg.newsFilter !== false) return;
  if (!nqMon.gate1 || nqMon.gate1 === 'FLAT') return;
  if (!process.env.OANDA_KEY) return;

  try {
    const nas = await fetchOandaRecentH1('NAS100_USD', 7);

    // London open = bar at 07:00 UTC; check = most recent completed bar around 12:00 UTC
    const ldnOpen = nas.find(b => b.t.substring(11, 13) === '07' && b.complete);
    const check   = nas.filter(b => b.complete && parseInt(b.t.substring(11, 13)) <= 12).slice(-1)[0];
    if (!ldnOpen || !check) { console.log('[nq-mon] Gate 2: missing bars'); return; }

    const ldnMove = (check.c - ldnOpen.o) / ldnOpen.o * 100;
    const G2_MIN  = cfg.gate2MinMovePct ?? 0.10;

    let gate2 = 'REJECTED';
    if (ldnMove >  G2_MIN && nqMon.gate1 === 'LONG')  gate2 = 'CONFIRMED';
    if (ldnMove < -G2_MIN && nqMon.gate1 === 'SHORT') gate2 = 'CONFIRMED';

    nqMon.gate2     = gate2;
    nqMon.direction = gate2 === 'CONFIRMED' ? nqMon.gate1 : null;
    nqMon.gate2Data = { ldnMove, ldnOpen: ldnOpen.o, checkPrice: check.c };

    const icon     = gate2 === 'CONFIRMED' ? '🟢' : '🔴';
    const moveChar = ldnMove >= 0 ? '↑' : '↓';

    let msg = `${icon} <b>NQ-QMR | GATE 2</b>  ${gate2}\n`;
    if (gate2 === 'CONFIRMED') {
      const d = nqMon.direction;
      msg += `Direction: <b>${d === 'LONG' ? '▲ LONG' : '▼ SHORT'}</b>\n`;
      msg += `Time: ${check.t.substring(11, 16)} UTC\n\n`;
      msg += `London move: ${moveChar} ${Math.abs(ldnMove).toFixed(2)}%  (min: ${G2_MIN}%)\n`;
      msg += `London open: ${ldnOpen.o.toFixed(1)}  →  Now: ${check.c.toFixed(1)}\n\n`;
      msg += `⚡ <b>BOTH GATES CLEAR</b>\n`;
      msg += `Entry signal at 09:25 ET (13:05 UTC)\n`;
      const g2StopPct = nqMon.gate1Data?.stopPct ?? 0.50;
      msg += `Stop distance: ~${g2StopPct.toFixed(2)}%  •  Max risk: 1.0% account`;
    } else {
      msg += `Time: ${check.t.substring(11, 16)} UTC\n\n`;
      msg += `London move: ${moveChar} ${Math.abs(ldnMove).toFixed(2)}%\n`;
      msg += `Gate 1 was ${nqMon.gate1} but London moved ${ldnMove >= 0 ? 'UP' : 'DOWN'}\n`;
      msg += `Gates disagree — <b>no trade today</b>`;
    }

    await nqSendTg(msg);
    nqMon.sentGate2 = true;
    await nqPushKv();
    await nqAuditUpdate({ gate2: {
      state:      gate2 === 'CONFIRMED' ? 'PASS' : 'FAIL',
      ts:         Date.now(),
      ldnMove:    +ldnMove.toFixed(4),
      ldnOpen:    ldnOpen.o,
      checkPrice: check.c,
    }});
    console.log(`[nq-mon] Gate 2 → ${gate2}  ldnMove=${ldnMove.toFixed(2)}%`);
  } catch (e) { console.error('[nq-mon] Gate 2 error:', e.message); }
}

async function nqEntrySignal() {
  if (nqMon.gate2 !== 'CONFIRMED' || nqMon.newsBlocked) return;
  if (!process.env.OANDA_KEY) return;

  try {
    const cfg     = await nqLoadMonCfg();
    const bars    = await fetchOandaRecentH1('NAS100_USD', 2);
    const current = bars.slice(-1)[0];
    if (!current) return;

    const price   = current.o;
    const dir     = nqMon.direction;
    const stopPct = nqMon.gate1Data?.stopPct ?? cfg.stopPct ?? 0.50;
    const tpPct   = cfg.tpPct  ?? 1.50;
    const stop    = dir === 'LONG' ? price * (1 - stopPct / 100) : price * (1 + stopPct / 100);
    const tp      = dir === 'LONG' ? price * (1 + tpPct   / 100) : price * (1 - tpPct   / 100);
    const stopPts = Math.abs(price - stop);

    let msg = `🎯 <b>NQ-QMR | ENTRY SIGNAL</b>\n`;
    msg += `${dir === 'LONG' ? '▲' : '▼'} Direction: <b>${dir}</b>\n`;
    msg += `Time: ≈09:25 ET  (${current.t.substring(11, 16)} UTC)\n\n`;
    msg += `NAS100 price:  <b>${price.toFixed(1)}</b>\n`;
    msg += `Stop:          ${stop.toFixed(1)}  (${stopPts.toFixed(0)} pts / ${stopPct}%)\n`;
    msg += `TP target:     ${tp.toFixed(1)}  (${tpPct}%)\n`;
    msg += `Max risk:      1.0% of account\n\n`;
    msg += `Use <b>Bot Config → NQ-QMR → Position Sizer</b> for contract count\n`;
    msg += `<i>Signal only — no live orders placed</i>`;

    await nqSendTg(msg);
    nqMon.sentEntry = true;
    await nqPushKv();
    await nqAuditUpdate({ signal: {
      fired:     true,
      ts:        Date.now(),
      direction: dir,
      entry:     price,
      stop:      +stop.toFixed(2),
      tp:        +tp.toFixed(2),
    }});
    console.log(`[nq-mon] Entry signal → ${dir} @ ${price.toFixed(1)}`);
  } catch (e) { console.error('[nq-mon] Entry error:', e.message); }
}

async function nqEodSummary() {
  if (!nqMon.sentGate1 && !nqMon.sentOpen) return; // nothing ran today
  const dow = new Date().getUTCDay();
  if (dow === 0 || dow === 6) return;

  let msg = `📊 <b>NQ-QMR | EOD ${nqMon.date ?? ''}</b>\n\n`;
  msg += `Gate 1:   ${nqMon.gate1  ?? '—'}\n`;
  msg += `Gate 2:   ${nqMon.gate2  ?? '—'}\n`;
  msg += `Entry:    ${nqMon.sentEntry ? (nqMon.direction ?? 'fired') : 'no trade'}\n`;
  if (nqMon.newsBlocked) msg += `\n⚠️ Suppressed by high-impact news`;

  await nqSendTg(msg);
  await nqAuditUpdate({ eod_ts: Date.now() });
  // Reset for tomorrow
  Object.assign(nqMon, {
    gate1: null, gate2: null, direction: null,
    sentOpen: false, sentGate1: false, sentGate2: false, sentEntry: false,
    gate1Data: null, gate2Data: null,
  });
  await nqPushKv();
  console.log('[nq-mon] EOD reset');
}

// Scheduler — ticks every minute, fires gates at the right UTC times
// On startup, restore today's gate state from KV so Railway redeploys between
// gate checks don't lose in-memory nqMon state and silently skip gate2/entry Telegram.
async function nqRestoreFromKv() {
  try {
    const raw = await kv.get(NQ_MON_KV).catch(() => null);
    if (!raw) return;
    const parsed   = JSON.parse(raw);
    const existing = parsed?.data ?? parsed ?? {};
    if (!existing.pushed_at) return;
    const storedDate = new Date(existing.pushed_at * 1000).toISOString().substring(0, 10);
    const today      = new Date().toISOString().substring(0, 10);
    if (storedDate !== today) return;

    nqMon.date        = today;
    nqMon.newsBlocked = existing.news_blocked ?? false;
    nqMon.newsEvents  = existing.news_events  ?? [];
    nqMon.sentOpen    = true;

    // gate1 is pushed as a {state:null,...} placeholder by the daily-open write,
    // before it has actually run — only treat it as "already checked" once state
    // is set, otherwise a Railway redeploy between open and the 09:05 check
    // permanently marks gate1 (and everything downstream) as already-sent.
    const g1 = existing.gates?.gate1;
    if (g1?.state != null) {
      nqMon.gate1     = g1.direction ?? null;
      nqMon.gate1Data = g1.data      ?? null;
      nqMon.sentGate1 = true;
    }

    const g2 = existing.gates?.gate2;
    if (g2?.state != null) {
      nqMon.gate2     = g2.state === 'PASS' ? 'CONFIRMED' : 'REJECTED';
      nqMon.gate2Data = g2.data ?? null;
      nqMon.direction = nqMon.gate2 === 'CONFIRMED' ? nqMon.gate1 : null;
      nqMon.sentGate2 = true;
    }

    console.log(`[nq-mon] Restored from KV: date=${today} gate1=${nqMon.gate1 ?? 'pending'} gate2=${nqMon.gate2 ?? 'pending'}`);
  } catch (e) {
    console.error('[nq-mon] KV restore error:', e.message);
  }
}

(function scheduleNqQmrMonitor() {
  // Restore gate state from KV in case this is a mid-day Railway redeploy
  setTimeout(() => nqRestoreFromKv().catch(e => console.error('[nq-mon]', e.message)), 3_000);

  setInterval(async () => {
    const now = new Date();
    const dow = now.getUTCDay();
    if (dow === 0 || dow === 6) return; // skip weekends

    // Ensure TG config is loaded
    if (!state.tg) await reloadConfig().catch(() => {});

    const H = now.getUTCHours();
    const M = now.getUTCMinutes();

    if (H === 7  && M === 0  && !nqMon.sentOpen)  nqDailyOpen().catch(e   => console.error('[nq-mon]', e.message));
    if (H === 9  && M === 5  && !nqMon.sentGate1) nqGate1Check().catch(e  => console.error('[nq-mon]', e.message));
    if (H === 12 && M === 5  && !nqMon.sentGate2) nqGate2Check().catch(e  => console.error('[nq-mon]', e.message));
    if (H === 13 && M === 5  && !nqMon.sentEntry) nqEntrySignal().catch(e => console.error('[nq-mon]', e.message));
    if (H === 20 && M === 30)                      nqEodSummary().catch(e  => console.error('[nq-mon]', e.message));
  }, 60_000);

  console.log('[nq-mon] NQ-QMR signal monitor scheduled (Gates at 09:05 / 12:05 / 13:05 UTC)');
})();

// ── SPX / DOW / DAX QMR Signal Monitors ──────────────────────────────────────
// Same two-gate overnight-range + London-momentum logic as NQ-QMR, applied to
// additional index instruments.  All three share the generic helper functions
// below; the NQ monitor (above) remains independent so a bug here can't break it.

function _makeQmrMon(id, label, instrument, kvStatus, kvAudit, kvConfig) {
  return {
    id, label, instrument, kvStatus, kvAudit, kvConfig,
    date: null, gate1: null, gate2: null, direction: null,
    newsBlocked: false, newsEvents: [],
    sentOpen: false, sentGate1: false, sentGate2: false, sentEntry: false,
    gate1Data: null, gate2Data: null,
  };
}

const _iqrMons = {
  spx: _makeQmrMon('spx', 'SPX-QMR', 'SPX500_USD', 'spx_qmr_status', 'spx_qmr_audit', 'spx_qmr_config'),
  dow: _makeQmrMon('dow', 'DOW-QMR', 'US30_USD',   'dow_qmr_status', 'dow_qmr_audit', 'dow_qmr_config'),
  dax: _makeQmrMon('dax', 'DAX-QMR', 'DE30_EUR',   'dax_qmr_status', 'dax_qmr_audit', 'dax_qmr_config'),
};

async function _iqrLoadMonCfg(mon) {
  try {
    const raw = await kv.get(mon.kvConfig);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed?.data ?? parsed ?? {};
  } catch { return {}; }
}

async function _iqrPushKv(mon) {
  try {
    const raw      = await kv.get(mon.kvStatus).catch(() => null);
    const parsed   = raw ? JSON.parse(raw) : {};
    const existing = parsed?.data ?? parsed ?? {};
    const g1state  = mon.gate1 === 'LONG' || mon.gate1 === 'SHORT' ? 'PASS'
                   : mon.gate1 === 'FLAT' ? 'FAIL' : null;
    const g2state  = mon.gate2 === 'CONFIRMED' ? 'PASS'
                   : mon.gate2 === 'REJECTED'  ? 'FAIL' : null;
    const payload  = {
      ...existing,
      gates: {
        gate1: { state: g1state, ts: Date.now(), direction: mon.gate1, data: mon.gate1Data },
        gate2: { state: g2state, ts: Date.now(), data: mon.gate2Data },
      },
      today_direction:     mon.direction,
      news_blocked:        mon.newsBlocked,
      news_events:         mon.newsEvents,
      pushed_at:           Math.floor(Date.now() / 1000),
      mt5_positions:       existing.mt5_positions       ?? [],
      today_closed_trades: existing.today_closed_trades ?? [],
    };
    await kv.put(mon.kvStatus, JSON.stringify({ data: payload, timestamp: Date.now() }));
  } catch (e) { console.error(`[${mon.id}-mon] KV write error:`, e.message); }
}

async function _iqrAuditUpdate(mon, fields) {
  try {
    const today = mon.date || new Date().toISOString().substring(0, 10);
    const raw   = await kv.get(mon.kvAudit).catch(() => null);
    let log = [];
    try {
      const parsed = raw ? JSON.parse(raw) : [];
      log = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.data) ? parsed.data : []);
    } catch { log = []; }
    let idx = log.findIndex(e => e.date === today);
    if (idx === -1) { log.unshift({ date: today }); idx = 0; }
    Object.assign(log[idx], fields);
    if (log.length > 90) log = log.slice(0, 90);
    await kv.put(mon.kvAudit, JSON.stringify({ data: log, timestamp: Date.now() }));
  } catch (e) { console.error(`[${mon.id}-audit] write error:`, e.message); }
}

async function _iqrDailyOpen(mon) {
  const today = new Date().toISOString().substring(0, 10);
  Object.assign(mon, {
    date: today, gate1: null, gate2: null, direction: null,
    newsBlocked: false, newsEvents: [],
    sentOpen: false, sentGate1: false, sentGate2: false, sentEntry: false,
    gate1Data: null, gate2Data: null,
  });
  const news = await nqFetchNewsRisk(today);
  mon.newsBlocked = news.blocked;
  mon.newsEvents  = news.events;
  let msg = `📅 <b>${mon.label} | ${today}</b>\n\n`;
  msg += `Gate 1:  04:48 ET  (09:05 UTC)\n`;
  msg += `Gate 2:  07:40 ET  (12:05 UTC)\n`;
  msg += `Entry:   09:25 ET  (13:05 UTC)\n\n`;
  if (news.blocked) {
    msg += `⚠️ <b>HIGH-IMPACT US NEWS — trade suppressed</b>\n`;
    msg += news.events.map(e => `  • ${e.event} @ ${(e.time ?? '').split(' ')[1] ?? '?'} ET`).join('\n');
  } else {
    msg += `✓ No high-impact US data — monitor active`;
  }
  await _iqrSendTg(mon, msg);
  mon.sentOpen = true;
  await _iqrPushKv(mon);
  await _iqrAuditUpdate(mon, {
    date: today, news_blocked: news.blocked,
    news_events: news.events.map(e => e.event ?? String(e)).filter(Boolean),
    gate1: null, gate2: null, signal: null, trade: null,
  });
  console.log(`[${mon.id}-mon] Day open ${today}`);
}

async function _iqrGate1Check(mon) {
  const cfg = await _iqrLoadMonCfg(mon);
  if (cfg.enabled === false) { console.log(`[${mon.id}-mon] Gate 1 skipped — disabled`); return; }
  if (mon.newsBlocked && cfg.newsFilter !== false) { console.log(`[${mon.id}-mon] Gate 1 skipped — news block`); return; }
  if (!process.env.OANDA_KEY) return;
  try {
    const nas      = await fetchOandaRecentH1(mon.instrument, 15);
    const today    = new Date().toISOString().substring(0, 10);
    const overnight = nas.filter(b => {
      const h = parseInt(b.t.substring(11, 13));
      const d = b.t.substring(0, 10);
      return b.complete && ((d < today && h >= 20) || (d === today && h <= 8));
    });
    if (overnight.length < 3) { console.log(`[${mon.id}-mon] Gate 1: too few overnight bars`); return; }
    const asiaH    = Math.max(...overnight.map(b => b.h));
    const asiaL    = Math.min(...overnight.map(b => b.l));
    const range    = asiaH - asiaL;
    const mid      = (asiaH + asiaL) / 2;
    const rangePct = mid > 0 ? (range / mid * 100) : 0;
    const g1bar    = nas.filter(b => b.complete).slice(-1)[0];
    if (!g1bar) return;
    const pos      = range > 0 ? (g1bar.c - asiaL) / range : 0.5;
    const THRESH   = cfg.gate1Threshold ?? 0.60;
    const MIN_RNG  = cfg.minRangePct    ?? 0.15;
    let gate1 = pos >= THRESH ? 'LONG' : pos <= (1 - THRESH) ? 'SHORT' : 'FLAT';
    if (rangePct < MIN_RNG) gate1 = 'FLAT';
    const stopMul    = cfg.stopMultiplier ?? 0.45;
    const stopPctDyn = stopMul > 0
      ? Math.max(+(rangePct * stopMul).toFixed(3), 0.10)
      : +(cfg.stopPct ?? 0.50);
    mon.gate1     = gate1;
    mon.gate1Data = { price: g1bar.c, asiaH, asiaL, range, rangePct, stopPct: stopPctDyn, pos };
    const icon = gate1 === 'FLAT' ? '⚫' : '🟡';
    const de   = gate1 === 'LONG' ? '▲' : gate1 === 'SHORT' ? '▼' : '—';
    let msg = `${icon} <b>${mon.label} | GATE 1</b>  ${gate1}\n`;
    msg += `${de} Direction bias: <b>${gate1}</b>\n`;
    msg += `Time: ${g1bar.t.substring(11, 16)} UTC\n\n`;
    msg += `${mon.id.toUpperCase()}: ${g1bar.c.toFixed(1)}\n`;
    msg += `Asia range: ${asiaL.toFixed(1)} — ${asiaH.toFixed(1)}  (${rangePct.toFixed(2)}%)\n`;
    msg += `Position in range: ${(pos * 100).toFixed(0)}%\n`;
    if (gate1 === 'FLAT') msg += `\nRange ambiguous — <b>no trade today</b>`;
    else                  msg += `\nAwaiting Gate 2 @ 12:05 UTC`;
    await _iqrSendTg(mon, msg);
    mon.sentGate1 = true;
    await _iqrPushKv(mon);
    await _iqrAuditUpdate(mon, { gate1: {
      state:     gate1 === 'LONG' || gate1 === 'SHORT' ? 'PASS' : 'FAIL',
      direction: gate1, ts: Date.now(), price: g1bar.c,
      asiaH, asiaL, rangePct: +rangePct.toFixed(3), stopPct: stopPctDyn, pos: +pos.toFixed(4),
    }});
    console.log(`[${mon.id}-mon] Gate 1 → ${gate1}  pos=${(pos*100).toFixed(0)}%  range=${rangePct.toFixed(2)}%`);
  } catch (e) { console.error(`[${mon.id}-mon] Gate 1 error:`, e.message); }
}

async function _iqrGate2Check(mon) {
  const cfg = await _iqrLoadMonCfg(mon);
  if (cfg.enabled === false) return;
  if (mon.newsBlocked && cfg.newsFilter !== false) return;
  if (!mon.gate1 || mon.gate1 === 'FLAT') return;
  if (!process.env.OANDA_KEY) return;
  try {
    const nas     = await fetchOandaRecentH1(mon.instrument, 7);
    const ldnOpen = nas.find(b => b.t.substring(11, 13) === '07' && b.complete);
    const check   = nas.filter(b => b.complete && parseInt(b.t.substring(11, 13)) <= 12).slice(-1)[0];
    if (!ldnOpen || !check) { console.log(`[${mon.id}-mon] Gate 2: missing bars`); return; }
    const ldnMove = (check.c - ldnOpen.o) / ldnOpen.o * 100;
    const G2_MIN  = cfg.gate2MinMovePct ?? 0.10;
    let gate2 = 'REJECTED';
    if (ldnMove >  G2_MIN && mon.gate1 === 'LONG')  gate2 = 'CONFIRMED';
    if (ldnMove < -G2_MIN && mon.gate1 === 'SHORT') gate2 = 'CONFIRMED';
    mon.gate2     = gate2;
    mon.direction = gate2 === 'CONFIRMED' ? mon.gate1 : null;
    mon.gate2Data = { ldnMove, ldnOpen: ldnOpen.o, checkPrice: check.c };
    const icon = gate2 === 'CONFIRMED' ? '🟢' : '🔴';
    const mc   = ldnMove >= 0 ? '↑' : '↓';
    let msg = `${icon} <b>${mon.label} | GATE 2</b>  ${gate2}\n`;
    if (gate2 === 'CONFIRMED') {
      msg += `Direction: <b>${mon.direction === 'LONG' ? '▲ LONG' : '▼ SHORT'}</b>\n`;
      msg += `Time: ${check.t.substring(11, 16)} UTC\n\n`;
      msg += `London move: ${mc} ${Math.abs(ldnMove).toFixed(2)}%  (min: ${G2_MIN}%)\n`;
      msg += `London open: ${ldnOpen.o.toFixed(1)}  →  Now: ${check.c.toFixed(1)}\n\n`;
      msg += `⚡ <b>BOTH GATES CLEAR</b> — Entry at 09:25 ET (13:05 UTC)`;
    } else {
      msg += `Time: ${check.t.substring(11, 16)} UTC\n\n`;
      msg += `London move: ${mc} ${Math.abs(ldnMove).toFixed(2)}% — gates disagree — <b>no trade today</b>`;
    }
    await _iqrSendTg(mon, msg);
    mon.sentGate2 = true;
    await _iqrPushKv(mon);
    await _iqrAuditUpdate(mon, { gate2: {
      state:      gate2 === 'CONFIRMED' ? 'PASS' : 'FAIL',
      ts:         Date.now(), ldnMove: +ldnMove.toFixed(4),
      ldnOpen:    ldnOpen.o, checkPrice: check.c,
    }});
    console.log(`[${mon.id}-mon] Gate 2 → ${gate2}  ldnMove=${ldnMove.toFixed(2)}%`);
  } catch (e) { console.error(`[${mon.id}-mon] Gate 2 error:`, e.message); }
}

async function _iqrEntrySignal(mon) {
  if (mon.gate2 !== 'CONFIRMED' || mon.newsBlocked) return;
  if (!process.env.OANDA_KEY) return;
  try {
    const cfg     = await _iqrLoadMonCfg(mon);
    const bars    = await fetchOandaRecentH1(mon.instrument, 2);
    const current = bars.slice(-1)[0];
    if (!current) return;
    const price   = current.o;
    const dir     = mon.direction;
    const stopPct = mon.gate1Data?.stopPct ?? cfg.stopPct ?? 0.50;
    const tpPct   = cfg.tpPct ?? 1.50;
    const stop    = dir === 'LONG' ? price * (1 - stopPct / 100) : price * (1 + stopPct / 100);
    const tp      = dir === 'LONG' ? price * (1 + tpPct   / 100) : price * (1 - tpPct   / 100);
    let msg = `🎯 <b>${mon.label} | ENTRY SIGNAL</b>\n`;
    msg += `${dir === 'LONG' ? '▲' : '▼'} Direction: <b>${dir}</b>\n`;
    msg += `Time: ≈09:25 ET  (${current.t.substring(11, 16)} UTC)\n\n`;
    msg += `${mon.id.toUpperCase()} price: <b>${price.toFixed(1)}</b>\n`;
    msg += `Stop:  ${stop.toFixed(1)}  (${Math.abs(price - stop).toFixed(0)} pts / ${stopPct}%)\n`;
    msg += `TP:    ${tp.toFixed(1)}  (${tpPct}%)\n`;
    msg += `<i>Signal only — no live orders placed</i>`;
    await _iqrSendTg(mon, msg);
    mon.sentEntry = true;
    await _iqrPushKv(mon);
    await _iqrAuditUpdate(mon, { signal: {
      fired: true, ts: Date.now(), direction: dir,
      entry: price, stop: +stop.toFixed(2), tp: +tp.toFixed(2),
    }});
    console.log(`[${mon.id}-mon] Entry → ${dir} @ ${price.toFixed(1)}`);
  } catch (e) { console.error(`[${mon.id}-mon] Entry error:`, e.message); }
}

async function _iqrEodSummary(mon) {
  if (!mon.sentGate1 && !mon.sentOpen) return;
  const dow = new Date().getUTCDay();
  if (dow === 0 || dow === 6) return;
  let msg = `📊 <b>${mon.label} | EOD ${mon.date ?? ''}</b>\n\n`;
  msg += `Gate 1: ${mon.gate1  ?? '—'}\n`;
  msg += `Gate 2: ${mon.gate2  ?? '—'}\n`;
  msg += `Entry:  ${mon.sentEntry ? (mon.direction ?? 'fired') : 'no trade'}\n`;
  if (mon.newsBlocked) msg += `\n⚠️ Suppressed by high-impact news`;
  await _iqrSendTg(mon, msg);
  await _iqrAuditUpdate(mon, { eod_ts: Date.now() });
  Object.assign(mon, {
    gate1: null, gate2: null, direction: null,
    sentOpen: false, sentGate1: false, sentGate2: false, sentEntry: false,
    gate1Data: null, gate2Data: null,
  });
  await _iqrPushKv(mon);
  console.log(`[${mon.id}-mon] EOD reset`);
}

async function _iqrRestoreFromKv(mon) {
  try {
    const raw      = await kv.get(mon.kvStatus).catch(() => null);
    if (!raw) return;
    const parsed   = JSON.parse(raw);
    const existing = parsed?.data ?? parsed ?? {};
    if (!existing.pushed_at) return;
    const storedDate = new Date(existing.pushed_at * 1000).toISOString().substring(0, 10);
    const today      = new Date().toISOString().substring(0, 10);
    if (storedDate !== today) return;
    mon.date        = today;
    mon.newsBlocked = existing.news_blocked ?? false;
    mon.newsEvents  = existing.news_events  ?? [];
    mon.sentOpen    = true;

    // gate1 is pushed as a {state:null,...} placeholder by the daily-open write,
    // before it has actually run — only treat it as "already checked" once state
    // is set, otherwise a Railway redeploy between open and the 09:05 check
    // permanently marks gate1 (and everything downstream) as already-sent.
    const g1 = existing.gates?.gate1;
    if (g1?.state != null) {
      mon.gate1     = g1.direction ?? null;
      mon.gate1Data = g1.data      ?? null;
      mon.sentGate1 = true;
    }

    const g2 = existing.gates?.gate2;
    if (g2?.state != null) {
      mon.gate2     = g2.state === 'PASS' ? 'CONFIRMED' : 'REJECTED';
      mon.gate2Data = g2.data ?? null;
      mon.direction = mon.gate2 === 'CONFIRMED' ? mon.gate1 : null;
      mon.sentGate2 = true;
    }
    console.log(`[${mon.id}-mon] Restored: date=${today} gate1=${mon.gate1} gate2=${mon.gate2 ?? 'pending'}`);
  } catch (e) { console.error(`[${mon.id}-mon] KV restore error:`, e.message); }
}

(function scheduleIqrMonitors() {
  const mons = Object.values(_iqrMons);
  setTimeout(() => {
    mons.forEach(m => _iqrRestoreFromKv(m).catch(e => console.error(`[${m.id}-mon]`, e.message)));
  }, 3_500);
  setInterval(async () => {
    const now = new Date();
    const dow = now.getUTCDay();
    if (dow === 0 || dow === 6) return;
    if (!state.tg) await reloadConfig().catch(() => {});
    const H = now.getUTCHours();
    const M = now.getUTCMinutes();
    for (const m of mons) {
      if (H === 7  && M === 0  && !m.sentOpen)  _iqrDailyOpen(m).catch(e   => console.error(`[${m.id}-mon]`, e.message));
      if (H === 9  && M === 5  && !m.sentGate1) _iqrGate1Check(m).catch(e  => console.error(`[${m.id}-mon]`, e.message));
      if (H === 12 && M === 5  && !m.sentGate2) _iqrGate2Check(m).catch(e  => console.error(`[${m.id}-mon]`, e.message));
      if (H === 13 && M === 5  && !m.sentEntry) _iqrEntrySignal(m).catch(e => console.error(`[${m.id}-mon]`, e.message));
      if (H === 20 && M === 30)                  _iqrEodSummary(m).catch(e  => console.error(`[${m.id}-mon]`, e.message));
    }
  }, 60_000);
  console.log('[iqr-mon] SPX / DOW / DAX QMR monitors scheduled (Gates at 09:05 / 12:05 / 13:05 UTC)');
})();

// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  const oanda   = process.env.OANDA_KEY ? '✓' : '✗ missing';
  const fredKey = process.env.FRED_KEY   ? '✓' : '✗ missing — T1/T2/T4/T6 will show Data unavailable';
  const finnhub = process.env.FINNHUB_KEY ? '✓' : '✗ missing — news multiplier / event risk disabled';
  const cfKv    = process.env.CF_ACCOUNT_ID ? '✓ CF REST API' : '✗ file only (set CF_ACCOUNT_ID + CF_API_TOKEN)';
  const alerts  = state.cfg?.enabled ? 'ON' : 'OFF (enable in Alerts modal)';
  console.log(`MacroFX Server   http://localhost:${PORT}`);
  console.log(`Monitoring       every ${MONITOR_MS} ms | ${DEFAULT_PAIRS.length} pairs | alerts ${alerts}`);
  console.log(`Level refresh    every ${REFRESH_LEVELS_MS / 60_000} min`);
  console.log(`OANDA_KEY        ${oanda}`);
  console.log(`FRED_KEY         ${fredKey}`);
  console.log(`FINNHUB_KEY      ${finnhub}`);
  console.log(`KV persistence   ${cfKv}`);
  console.log(`Data dir         ${process.env.DATA_DIR || path.join(__dirname, 'data')}`);
});
