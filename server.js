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

import express           from 'express';
import path              from 'path';
import { fileURLToPath } from 'url';
import * as kv           from './kv.js';
import worker            from './_worker.js';
import { refreshAllPairs } from './levels.js';

const __dirname         = path.dirname(fileURLToPath(import.meta.url));
const PORT              = parseInt(process.env.PORT              || '3000');
const MONITOR_MS        = parseInt(process.env.MONITOR_MS        || '3000');
const REFRESH_LEVELS_MS = parseInt(process.env.REFRESH_LEVELS_MS || String(30 * 60 * 1000));

// ── Cloudflare env-compatible object ─────────────────────────────────────────
// Exposes process.env vars and wraps kv.js so _worker.js runs unchanged.

const cfEnv = {
  FRED_KEY:         process.env.FRED_KEY,
  TWELVE_KEY:       process.env.TWELVE_KEY,
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
  'NZD/USD', 'USD/CAD', 'USD/CHF', 'XAU/USD', 'NAS100_USD',
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

const DEFAULT_CFG = {
  enabled:     false,
  minStars:    4,
  pairs:       [],
  proxPips:    { default: 5, 'XAU/USD': 8, 'NAS100_USD': 30 },
  cooldownMin: 60,
  onlyAligned: false,
};

// ── In-memory monitoring state ────────────────────────────────────────────────

const state = {
  levels:              {},   // { 'EUR/USD': { data: [...], timestamp: ms } }
  cooldowns:           {},   // { 'EURUSD_1.0847_long': lastSentMs }
  prices:              {},   // { 'EUR/USD': { price: n, at: ms } }
  cfg:                 null,
  tg:                  null,
  lastRun:             null,
  lastAlert:           null,
  alertCount:          0,
  errors:              [],
  running:             false,
  cfgLoadedAt:         0,
  levelsLoadedAt:      0,
  levelsRefreshAt:     0,    // last time refreshAllPairs() completed
  levelsRefreshRunning: false,
  lastSummaryAt:       0,    // last time per-pair monitor summary was logged
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
      try { state.levels[sym] = JSON.parse(raw); } catch {}
    }
  }
  state.levelsLoadedAt = Date.now();
}

async function fetchPrice(sym) {
  // Per-pair price cache — avoids hammering OANDA on every 3-second tick
  const cached = state.prices[sym];
  if (cached && Date.now() - cached.at < 30_000) return cached.price;

  const instrument = sym.replace('/', '_');
  const base = (process.env.OANDA_ENV || 'live') === 'practice'
    ? 'https://api-fxpractice.oanda.com'
    : 'https://api-fxtrade.oanda.com';
  const auth = { Authorization: `Bearer ${process.env.OANDA_KEY}` };

  // Preferred: real-time bid/ask via account pricing endpoint
  if (process.env.OANDA_ACCOUNT_ID) {
    try {
      const r = await fetch(
        `${base}/v3/accounts/${process.env.OANDA_ACCOUNT_ID}/pricing?instruments=${encodeURIComponent(instrument)}`,
        { headers: auth }
      );
      if (r.ok) {
        const d = await r.json();
        const p = d.prices?.[0];
        if (p?.bids?.[0] && p?.asks?.[0]) {
          const price = (parseFloat(p.bids[0].price) + parseFloat(p.asks[0].price)) / 2;
          state.prices[sym] = { price, at: Date.now() };
          return price;
        }
      }
    } catch {}
  }

  // Fallback: last completed M1 candle
  try {
    const r = await fetch(
      `${base}/v3/instruments/${encodeURIComponent(instrument)}/candles?count=2&granularity=M1&price=M`,
      { headers: auth }
    );
    if (!r.ok) return null;
    const d     = await r.json();
    const last  = d.candles?.slice(-1)[0];
    const price = last?.mid?.c ? parseFloat(last.mid.c) : null;
    if (price != null) state.prices[sym] = { price, at: Date.now() };
    return price;
  } catch {
    return null;
  }
}

async function sendTelegram(token, chatId, text) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    return (await r.json()).ok === true;
  } catch { return false; }
}

function formatAlert(sym, entry, price, distPips) {
  const digits = PRICE_DIGITS[sym] ?? 5;
  const unit   = sym === 'NAS100_USD' ? 'pts' : 'p';
  const dir    = entry.direction === 'long' ? '↑ BUY' : '↓ SELL';
  const stars  = '⭐'.repeat(Math.min(entry.totalStars ?? 0, 7));
  const at     = distPips <= 0 ? 'AT LEVEL' : `${distPips}${unit} away`;

  const parts = [
    `🎯 <b>${sym} ${dir}</b> ${stars}`,
    `Price: <b>${entry.price.toFixed(digits)}</b> · ${at}`,
    `Current: ${price.toFixed(digits)}`,
  ];

  if (entry.tags?.length) parts.push(`Tags: ${entry.tags.slice(0, 4).join(' · ')}`);

  const sltp = [
    entry.sl != null ? `SL ${entry.sl.toFixed(digits)}`                                               : null,
    entry.tp != null ? `TP ${entry.tp.toFixed(digits)}${entry.tpNote ? ` (${entry.tpNote})` : ''}` : null,
  ].filter(Boolean).join(' · ');
  if (sltp) parts.push(sltp);

  if (entry.rrRatio) parts.push(`R:R 1:${entry.rrRatio}`);
  if (entry.rangeBias) {
    parts.push(`Range Bias: ${entry.rangeBias.confirmCount}✓ ${entry.rangeBias.conflictCount}✗`);
  }
  parts.push('<i>🤖 MacroFX Server</i>');

  return parts.join('\n');
}

// ── Main monitoring tick ──────────────────────────────────────────────────────

async function monitorTick() {
  if (state.running || !process.env.OANDA_KEY) return;
  state.running = true;
  state.lastRun = new Date().toISOString();

  try {
    const now = Date.now();

    // Reload Telegram + alert config from KV every 60 s
    if (now - state.cfgLoadedAt > 60_000) await reloadConfig();

    // Reload entry levels from KV every 5 min
    if (now - state.levelsLoadedAt > 300_000) await reloadLevels();

    if (!state.cfg?.enabled || !state.tg?.token || !state.tg?.chatId) return;

    const pairs       = state.cfg.pairs?.length ? state.cfg.pairs : DEFAULT_PAIRS;
    const doSummary   = now - (state.lastSummaryAt ?? 0) > 60_000; // throttle to once/min
    let   cdDirty     = false;
    const summaryLines = [];

    for (const sym of pairs) {
      const bucket = state.levels[sym];
      if (!bucket?.data?.length) continue;

      const price = await fetchPrice(sym);
      if (price == null) {
        if (doSummary) summaryLines.push(`${sym}: no price (market closed?)`);
        continue;
      }

      const pipSz    = PIP_SIZE[sym]     ?? 0.0001;
      const digits   = PRICE_DIGITS[sym] ?? 5;
      const proxPips = state.cfg.proxPips?.[sym] ?? state.cfg.proxPips?.default ?? 5;
      const proxDist = proxPips * pipSz;

      let skipStars = 0, skipDir = 0, skipProx = 0, skipCooldown = 0;

      for (const entry of bucket.data) {
        if ((entry.totalStars ?? 0) < (state.cfg.minStars ?? 4)) { skipStars++;    continue; }
        if (!entry.direction)                                      { skipDir++;      continue; }
        if (state.cfg.onlyAligned && !entry.signalAligned)        { skipDir++;      continue; }

        const dist = Math.abs(entry.price - price);
        if (dist > proxDist)                                       { skipProx++;     continue; }

        const ck       = `${sym.replace('/', '')}_${entry.price.toFixed(digits)}_${entry.direction}`;
        const lastSent = state.cooldowns[ck] ?? 0;
        if (now - lastSent < (state.cfg.cooldownMin ?? 60) * 60_000) { skipCooldown++; continue; }

        state.cooldowns[ck] = now;
        cdDirty = true;

        const distPips = Math.round(dist / pipSz);
        const msg      = formatAlert(sym, entry, price, distPips);
        const sent     = await sendTelegram(state.tg.token, state.tg.chatId, msg);

        if (sent) { state.lastAlert = new Date().toISOString(); state.alertCount++; }

        console.log(`[MONITOR] ${sym} ${entry.direction} @ ${entry.price.toFixed(digits)} (${distPips}p) — Telegram ${sent ? 'OK' : 'FAILED'}`);
      }

      if (doSummary && bucket.data.length > 0) {
        const maxStars = Math.max(...bucket.data.map(e => e.totalStars ?? 0));
        summaryLines.push(`${sym}: ${bucket.data.length} entries max=${maxStars}★ skip=${skipStars}⭐/${skipDir}dir/${skipProx}prox/${skipCooldown}cd`);
      }
    }

    if (doSummary && summaryLines.length) {
      console.log('[MONITOR]', summaryLines.join(' | '));
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
    telegramOK:          !!(state.tg?.token && state.tg?.chatId),
    levelsRefreshAt:     state.levelsRefreshAt ? new Date(state.levelsRefreshAt).toISOString() : null,
    levelsRefreshRunning:state.levelsRefreshRunning,
    levelCounts:         Object.fromEntries(DEFAULT_PAIRS.map(p => [p, state.levels[p]?.data?.length ?? 0])),
    lastPrices:          Object.fromEntries(
      Object.entries(state.prices).map(([p, v]) => [p, {
        price: v.price,
        ageS:  Math.round((Date.now() - v.at) / 1_000),
      }])
    ),
    recentErrors:        state.errors.slice(-5),
  });
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
  if (state.levelsRefreshRunning || !process.env.OANDA_KEY) return;
  state.levelsRefreshRunning = true;
  try {
    const pairs = state.cfg?.pairs?.length ? state.cfg.pairs : DEFAULT_PAIRS;
    await refreshAllPairs(pairs);
    state.levelsRefreshAt = Date.now();
    // Reload in-memory levels so the monitor tick picks up the new entries immediately
    await reloadLevels();
  } catch (e) {
    console.error('[LEVELS] Refresh error:', e.message);
  } finally {
    state.levelsRefreshRunning = false;
  }
}

await kv.load();
await reloadConfig();
await reloadLevels();

setInterval(monitorTick, MONITOR_MS);
monitorTick().catch(console.error);

// Run an initial level refresh on boot, then every REFRESH_LEVELS_MS (default 30 min)
setInterval(runLevelsRefresh, REFRESH_LEVELS_MS);
runLevelsRefresh().catch(console.error);

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
