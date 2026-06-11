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
import { getSessionStats, computeSessionStats, isSessionStatsComputing } from './js/sessionStats.js';
import { runFullBacktest, INSTRUMENTS as BT_INSTRUMENTS }            from './js/volBacktestEngine.js';
import { runFullM1Backtest, runFullLevelAnalysis, aggregateLevelHits, loadM1ForPair, BT_M1_DIR, M1_DRIVE_IDS, loadRegimeHistoryFromR2, saveRegimeHistoryToR2 } from './js/volBacktestM1Engine.js';
import { runFullAsiaRangeBacktest, runAsiaRangeBacktest, ASIA_INSTRUMENTS } from './js/asiaRangeEngine.js';
import { CONFLUENCE_MODULES } from './js/confluenceModules.js';

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
  'NAS100_USD','SPX500_USD','DE30_USD','UK100_GBP',
  'US30_USD','US2000_USD',
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
  const lines = ['**VOL & RANGE FORECAST**', `**For session: ${data.session_label}**`, ''];
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
  { name: 'GOLD',   sym: 'XAU_USD',   hmmKey: 'XAU/USD'  },
  { name: 'NQ',     sym: 'NAS100_USD', hmmKey: null        },
  { name: 'EURUSD', sym: 'EUR_USD',   hmmKey: 'EUR/USD'  },
  { name: 'GBPUSD', sym: 'GBP_USD',   hmmKey: 'GBP/USD'  },
  { name: 'USDJPY', sym: 'USD_JPY',   hmmKey: 'USD/JPY'  },
  { name: 'AUDUSD', sym: 'AUD_USD',   hmmKey: 'AUD/USD'  },
  { name: 'NZDUSD', sym: 'NZD_USD',   hmmKey: 'NZD/USD'  },
  { name: 'USDCAD', sym: 'USD_CAD',   hmmKey: 'USD/CAD'  },
  { name: 'USDCHF', sym: 'USD_CHF',   hmmKey: 'USD/CHF'  },
  { name: 'GBPJPY', sym: 'GBP_JPY',   hmmKey: 'GBP/JPY'  },
  { name: 'EURGBP', sym: 'EUR_GBP',   hmmKey: null        },
  { name: 'EURJPY', sym: 'EUR_JPY',   hmmKey: null        },
  { name: 'EURCHF', sym: 'EUR_CHF',   hmmKey: null        },
  { name: 'GBPCHF', sym: 'GBP_CHF',   hmmKey: null        },
  { name: 'AUDJPY', sym: 'AUD_JPY',   hmmKey: null        },
  { name: 'CADJPY', sym: 'CAD_JPY',   hmmKey: null        },
  { name: 'EURCAD', sym: 'EUR_CAD',   hmmKey: null        },
  { name: 'EURAUD', sym: 'EUR_AUD',   hmmKey: null        },
  { name: 'EURNZD', sym: 'EUR_NZD',   hmmKey: null        },
  { name: 'AUDNZD', sym: 'AUD_NZD',   hmmKey: null        },
  { name: 'AUDCAD', sym: 'AUD_CAD',   hmmKey: null        },
  { name: 'AUDCHF', sym: 'AUD_CHF',   hmmKey: null        },
  { name: 'GBPCAD', sym: 'GBP_CAD',   hmmKey: null        },
  { name: 'GBPAUD', sym: 'GBP_AUD',   hmmKey: null        },
  { name: 'GBPNZD', sym: 'GBP_NZD',   hmmKey: null        },
  { name: 'CHFJPY', sym: 'CHF_JPY',   hmmKey: null        },
  { name: 'NZDJPY', sym: 'NZD_JPY',   hmmKey: null        },
];

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

  await Promise.all(WEEKLY_INSTRUMENTS.map(async cfg => {
    try {
      const f = fc.instruments[cfg.name];
      if (!f) return;
      const wtd = await _fetchWTDBar(cfg.sym);

      const wtdHLPct = r2((wtd.high - wtd.low) / wtd.open * 100);
      const wtdOCPct = r2((wtd.close - wtd.open) / wtd.open * 100);
      const hlConsumedPct = f.hl_5d > 0 ? Math.round(wtdHLPct / f.hl_5d * 100) : null;
      const hlRemainingPct = f.hl_5d > 0 ? r2(Math.max(f.hl_5d - wtdHLPct, 0)) : null;

      const hmmData   = cfg.hmmKey ? (state.hmmRegimes[cfg.hmmKey]   ?? null) : null;
      const hmm5mData = cfg.hmmKey ? (state.hmm5mRegimes[cfg.hmmKey] ?? null) : null;

      instruments[cfg.name] = {
        wtd_hl_pct:       wtdHLPct,
        wtd_oc_pct:       wtdOCPct,
        wtd_days:         wtd.days,
        hl_5d:            f.hl_5d,
        oc_5d:            f.oc_5d,
        hl_20d:           f.hl_20d,
        oc_20d:           f.oc_20d,
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

  // Find Monday of current week for the label
  const now = new Date();
  const dow = now.getUTCDay();
  const daysBack = dow === 0 ? 6 : dow - 1;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack));
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const weekLabel = `Week of ${monthNames[monday.getUTCMonth()]} ${monday.getUTCDate()}, ${monday.getUTCFullYear()}`;

  const result = {
    ok: true,
    computed_at:   new Date().toISOString(),
    session_label: fc.session_label,
    week_label:    weekLabel,
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

  const lines = [
    '**VOL & RANGE FORECAST — WEEKLY**',
    `**${data.week_label}**`,
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
    lines.push(`WTD momentum        : ${w.wtd_dir}  (${sign(w.wtd_oc_pct)}% open→close)`);
    if (w.hl_consumed_pct != null) {
      lines.push(`Range consumed      : ${w.hl_consumed_pct}%  (${f2(w.wtd_hl_pct)}% of ${f2(w.hl_5d)}% budget)`);
      lines.push(`Remaining budget    : ${f2(w.hl_remaining_pct)}%  (${w.wtd_days} day${w.wtd_days !== 1 ? 's' : ''} in)`);
    }
    lines.push('');
    lines.push(`5-day H-L forecast  : ${f2(w.hl_5d)}%  (week range budget)`);
    lines.push(`5-day O-C forecast  : ${f2(w.oc_5d)}%  (net weekly move expected)`);
    lines.push(`20-day H-L forecast : ${f2(w.hl_20d)}%  (monthly range budget)`);
    lines.push(`20-day O-C forecast : ${f2(w.oc_20d)}%  (net monthly move expected)`);
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
          onProgress: ({ pair: p }) => {
            currentPair = p;
            const job = arJobs.get(jobId);
            if (job) arJobs.set(jobId, { ...job, currentPair: p });
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
      elapsed: Math.round((Date.now() - job.startedAt) / 1000),
      currentPair: job.currentPair ?? null });
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

app.listen(PORT, () => {
  const oanda   = process.env.OANDA_KEY ? '✓' : '✗ missing';
  const fredKey = process.env.FRED_KEY   ? '✓' : '✗ missing — T1/T2/T4/T6 will show Data unavailable';
  const cfKv    = process.env.CF_ACCOUNT_ID ? '✓ CF REST API' : '✗ file only (set CF_ACCOUNT_ID + CF_API_TOKEN)';
  const alerts  = state.cfg?.enabled ? 'ON' : 'OFF (enable in Alerts modal)';
  console.log(`MacroFX Server   http://localhost:${PORT}`);
  console.log(`Monitoring       every ${MONITOR_MS} ms | ${DEFAULT_PAIRS.length} pairs | alerts ${alerts}`);
  console.log(`Level refresh    every ${REFRESH_LEVELS_MS / 60_000} min`);
  console.log(`OANDA_KEY        ${oanda}`);
  console.log(`FRED_KEY         ${fredKey}`);
  console.log(`KV persistence   ${cfKv}`);
  console.log(`Data dir         ${process.env.DATA_DIR || path.join(__dirname, 'data')}`);
});
