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
import { execFile }        from 'child_process';
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
import { startVolForecastScheduler, forecastState, runVolForecast } from './js/volForecastScheduler.js';
import { runFullBacktest, INSTRUMENTS as BT_INSTRUMENTS }            from './js/volBacktestEngine.js';
import { runFullM1Backtest, BT_M1_DIR, M1_DRIVE_IDS }               from './js/volBacktestM1Engine.js';

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
];

const PIP_SIZE = {
  'EUR/USD': 0.0001, 'GBP/USD': 0.0001, 'AUD/USD': 0.0001,
  'NZD/USD': 0.0001, 'USD/CAD': 0.0001, 'USD/CHF': 0.0001,
  'GBP/JPY': 0.01,   'USD/JPY': 0.01,
  'XAU/USD': 1.0,    'NAS100_USD': 1.0,
};

const PRICE_DIGITS = {
  'USD/JPY': 3, 'GBP/JPY': 3, 'XAU/USD': 2, 'NAS100_USD': 1,
};

// Typical OANDA spread in pips per pair — used as baseline for spread quality gate
const TYPICAL_SPREAD_PIPS = {
  'EUR/USD': 0.6, 'GBP/USD': 0.9, 'USD/JPY': 0.7,
  'AUD/USD': 0.9, 'NZD/USD': 1.1, 'USD/CAD': 1.1,
  'USD/CHF': 1.0, 'GBP/JPY': 2.0,
  'XAU/USD': 0.3, 'NAS100_USD': 1.0,
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
    const raw = await kv.get(`ai_entries_${sym.replace('/', '')}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        // Normalize: server writes { data: entries[] }, browser writes { data: { entries, meta } }
        if (!Array.isArray(parsed.data) && Array.isArray(parsed.data?.entries)) {
          parsed.data = parsed.data.entries;
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
  ? Object.entries(s.surpriseIndex).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([c, v]) => `${c}: ${v >= 0 ? '+' : ''}${v.toFixed(2)}`).join('  |  ') +
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
app.use(express.json({ limit: '5mb' }));

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

function _latestBacktestCsv() {
  if (!fs.existsSync(BT_DATA_DIR)) return null;
  const files = fs.readdirSync(BT_DATA_DIR)
    .filter(f => f.startsWith('backtest_') && f.endsWith('.csv'))
    .sort().reverse();
  return files.length ? path.join(BT_DATA_DIR, files[0]) : null;
}

function _parseBtCsv(csvPath) {
  const lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
  const hdrs  = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(',');
    const o    = Object.fromEntries(hdrs.map((h, i) => [h, (vals[i] ?? '').trim()]));
    o.filled   = o.filled === 'True';
    o.pnl_pct  = parseFloat(o.pnl_pct)  || 0;
    o.dow      = parseInt(o.dow) || 0;
    o.hl_75_pct = parseFloat(o.hl_75_pct) || 0;
    o.oc_med_pct = parseFloat(o.oc_med_pct) || 0;
    o.open     = parseFloat(o.open)  || 0;
    o.high     = parseFloat(o.high)  || 0;
    o.low      = parseFloat(o.low)   || 0;
    o.close    = parseFloat(o.close) || 0;
    return o;
  });
}

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
  };
}

// Latest cached backtest results
app.get('/api/vol-backtest', (req, res) => {
  const csvPath = _latestBacktestCsv();
  if (!csvPath) return res.status(404).json({ ok: false, error: 'No backtest data. Run the backtester first.' });

  try {
    const trades = _parseBtCsv(csvPath);
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
      }));

    // All filled P&L values for Monte Carlo (client needs the full sequence)
    const allPnls = trades.filter(t => t.filled).map(r => r.pnl_pct);

    res.json({
      ok: true,
      file: path.basename(csvPath),
      computedAt: fs.statSync(csvPath).mtime.toISOString(),
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

// Check how many M1 parquets are cached locally
function _m1CacheStatus() {
  if (!fs.existsSync(BT_M1_DIR)) return { cached: 0, pairs: [] };
  const files = fs.readdirSync(BT_M1_DIR).filter(f => f.endsWith('_m1.parquet'));
  return { cached: files.length, pairs: files.map(f => f.replace('_m1.parquet', '').toUpperCase()) };
}

// Trigger a fresh backtest run using pure-JS engine (no Python required)
// Uses M1 intraday simulation when parquets are cached, D1 otherwise.
app.post('/api/vol-backtest/run', async (req, res) => {
  if (!process.env.OANDA_KEY) {
    return res.status(500).json({ ok: false, error: 'OANDA_KEY not set — cannot fetch live D1 data' });
  }
  const {
    dateFrom = '', dateTo = '', pair = '',
    slMult = '1.5', strategy = 'reversal',
    momentumPullback = '0', momentumSlMult = '1.0',
    spreadPct = '0',
  } = req.body || {};
  const opts = {
    dateFrom, dateTo, minLookback: 50,
    slMult:           parseFloat(slMult)           || 1.5,
    strategy,
    momentumPullback: parseFloat(momentumPullback) || 0,
    momentumSlMult:   parseFloat(momentumSlMult)   || 1.0,
    spreadPct:        parseFloat(spreadPct)         || 0,
  };

  const instFilter   = pair ? BT_INSTRUMENTS.filter(i => i.name === pair.toUpperCase()) : undefined;
  const m1Status     = _m1CacheStatus();
  const engineLabel  = m1Status.cached > 0
    ? `M1 engine (${m1Status.cached} pairs cached)`
    : `D1 engine (Oanda API) · strategy: ${strategy}`;

  try {
    // Always use runFullM1Backtest — it handles the strategy param and D1 fallback
    // when M1 parquets are not cached. runFullBacktest ignores strategy entirely.
    const { trades, log } = await runFullM1Backtest(opts, instFilter ?? BT_INSTRUMENTS);

    if (!trades.length) {
      return res.status(500).json({ ok: false, error: 'No trades generated', log });
    }

    if (!fs.existsSync(BT_DATA_DIR)) fs.mkdirSync(BT_DATA_DIR, { recursive: true });
    const ts      = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 15);
    const outFile = path.join(BT_DATA_DIR, `backtest_${ts}.csv`);
    const hdrs    = ['instrument','date','regime','hl_75_pct','oc_med_pct','side','filled','outcome','pnl_pct','leg','session','dow','open','high','low','close'];
    const rows    = trades.map(r => hdrs.map(h => h === 'filled' ? (r[h] ? 'True' : 'False') : (r[h] ?? '')).join(','));
    fs.writeFileSync(outFile, [hdrs.join(','), ...rows].join('\n') + '\n');

    res.json({
      ok: true,
      message:    `Backtest complete — ${trades.filter(t => t.filled).length} filled trades`,
      engine:     engineLabel,
      m1Pairs:    m1Status.pairs,
      log,
      file:       path.basename(outFile),
    });
  } catch (e) {
    const msg = e?.message || String(e) || 'Unknown engine error';
    console.error('[vol-backtest/run]', msg, e?.stack ?? '');
    res.status(500).json({ ok: false, error: msg });
  }
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

  // Env vars
  report.env = {
    OANDA_KEY:        !!process.env.OANDA_KEY,
    OANDA_ENV:        process.env.OANDA_ENV || '(unset — defaults to live)',
    OANDA_ACCOUNT_ID: process.env.OANDA_ACCOUNT_ID || '(unset)',
    R2_ACCESS_KEY:    !!process.env.R2_ACCESS_KEY,
    R2_SECRET_KEY:    !!process.env.R2_SECRET_KEY,
    NODE_ENV:         process.env.NODE_ENV || '(unset)',
  };

  // R2 connectivity
  try {
    const { S3Client, HeadObjectCommand } = await import('@aws-sdk/client-s3');
    const r2 = new S3Client({
      endpoint:    'https://3e867110ae519cd24afc877c72e5026e.r2.cloudflarestorage.com',
      region:      'auto',
      requestHandler: { requestTimeout: 5000 },
      credentials: {
        accessKeyId:     process.env.R2_ACCESS_KEY,
        secretAccessKey: process.env.R2_SECRET_KEY,
      },
    });
    const cmd = new HeadObjectCommand({ Bucket: 'r2-storage', Key: 'm1/eurusd_m1.parquet' });
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
      const bars = await fetchHMMBars(sym, 300);
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
      const bars = await fetchHMMBars(sym, 300);
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

// Vol & Range Forecast scheduler — runs daily at 22:00 UTC, computes on startup if stale
startVolForecastScheduler().catch(e => console.error('[VOL-FORECAST] Scheduler init failed:', e.message));

app.listen(PORT, () => {
  const oanda   = process.env.OANDA_KEY ? '✓' : '✗ missing';
  const cfKv    = process.env.CF_ACCOUNT_ID ? '✓ CF REST API' : '✗ file only (set CF_ACCOUNT_ID + CF_API_TOKEN)';
  const alerts  = state.cfg?.enabled ? 'ON' : 'OFF (enable in Alerts modal)';
  console.log(`MacroFX Server   http://localhost:${PORT}`);
  console.log(`Monitoring       every ${MONITOR_MS} ms | ${DEFAULT_PAIRS.length} pairs | alerts ${alerts}`);
  console.log(`Level refresh    every ${REFRESH_LEVELS_MS / 60_000} min`);
  console.log(`OANDA_KEY        ${oanda}`);
  console.log(`KV persistence   ${cfKv}`);
  console.log(`Data dir         ${process.env.DATA_DIR || path.join(__dirname, 'data')}`);
});
