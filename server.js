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
import { fitHMM, hmmSignalScore } from './hmm.js';

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
  hmmRegimes:          {},   // { 'EUR/USD': { regime, trendDir, rangeProb, ... } }
  dailyWatchlist:      {},   // { 'EUR/USD': [{...entry, phase1Score}] } — top 6 per pair, set at 06:05 London
  watchlistDate:       null, // 'YYYY-MM-DD' London date of last watchlist run
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

  if (hmmData?.regime) {
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
  const stars  = '⭐'.repeat(Math.min(entry.totalStars ?? 0, 9));
  const at     = distPips <= 0 ? 'AT LEVEL' : `${distPips}${unit} away`;

  const hmm   = state.hmmRegimes[sym];
  const swing = hmm?.intraday30m ?? null;
  const g     = computeGrade(entry, hmm, swing);
  const vi    = g.verdict === 'TAKE' ? '✅' : g.verdict === 'WATCH' ? '👁' : g.verdict === 'CAUTION' ? '⚠️' : '🚫';

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
    entry.tp != null ? `TP ${entry.tp.toFixed(digits)}${entry.tpNote ? ` (${entry.tpNote})` : ''}` : null,
  ].filter(Boolean).join(' · ');
  if (sltp) parts.push(sltp);
  if (entry.rrRatio) parts.push(`R:R 1:${entry.rrRatio}`);

  const scorePart = entry.signalScore != null ? `Signal ${entry.signalScore}%` : null;
  const hmmPart   = hmm
    ? (hmm.regime === 'RANGE' ? `HMM Range ${Math.round(hmm.rangeProb * 100)}%` : `HMM Trend ${hmm.trendDir ?? ''} ${Math.round(hmm.trendProb * 100)}%`)
    : null;
  const swingPart = swing
    ? (swing.regime === 'TREND' ? `30m BOS ${swing.dir ?? ''}` : `30m CHoCH`)
    : null;
  const rbPart = entry.rangeBias ? `RB ${entry.rangeBias.confirmCount}✓ ${entry.rangeBias.conflictCount}✗` : null;
  const infoLine = [scorePart, hmmPart, swingPart, rbPart].filter(Boolean).join(' · ');
  if (infoLine) parts.push(infoLine);

  parts.push('<i>🚂 MacroFX Railway</i>');

  return parts.filter(p => p !== undefined).join('\n');
}

// ── Daily watchlist — star-based level selection ──────────────────────────────
// Picks the top-starred levels per pair (≥4★ = strong, ≥5★ = prime).
// No separate scoring layer — the star count IS the quality signal.

function computeDailyWatchlist(pairs, cfg) {
  const result   = {};
  const minStars = cfg?.watchlist?.minStars ?? 4;
  const topN     = cfg?.watchlist?.topN     ?? 6;

  for (const sym of pairs) {
    const bucket = state.levels[sym];
    if (!bucket?.data?.length) continue;

    const top = bucket.data
      .filter(e => (e.totalStars ?? 0) >= minStars && e.direction)
      .sort((a, b) =>
        (b.totalStars ?? 0) - (a.totalStars ?? 0) ||
        (b.signalScore ?? 0) - (a.signalScore ?? 0)
      )
      .slice(0, topN);

    if (top.length) result[sym] = top;
  }
  return result;
}

async function runDailyWatchlist() {
  const pairs = state.cfg?.pairs?.length ? state.cfg.pairs : DEFAULT_PAIRS;
  const watchlist = computeDailyWatchlist(pairs, state.cfg);
  const dateStr   = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); // YYYY-MM-DD

  state.dailyWatchlist = watchlist;
  state.watchlistDate  = dateStr;

  await kv.put('daily_watchlist', JSON.stringify({ date: dateStr, watchlist }));

  const totalLevels = Object.values(watchlist).reduce((s, a) => s + a.length, 0);
  console.log(`[WATCHLIST] Phase 1 computed for ${dateStr} — ${Object.keys(watchlist).length} pairs, ${totalLevels} levels`);
  for (const [sym, levels] of Object.entries(watchlist)) {
    console.log(`  ${sym}: ${levels.map(l => `${l.price}(${l.phase1Score}pt)`).join(', ')}`);
  }
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

    // Daily watchlist Phase 1 — runs once at 06:05 London (Asia close + 5 min buffer)
    {
      const ldn = new Date().toLocaleString('en-US', { timeZone: 'Europe/London', hour12: false, hour: '2-digit', minute: '2-digit' });
      const [lh, lm] = ldn.split(':').map(Number);
      const todayLdn = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
      if (lh === 6 && lm >= 5 && lm <= 9 && state.watchlistDate !== todayLdn) {
        runDailyWatchlist().catch(e => console.error('[WATCHLIST] Error:', e.message));
      }
    }

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

      let skipStars = 0, skipDir = 0, skipProx = 0, skipCooldown = 0, skipScore = 0, skipAligned = 0;

      // Sort entries by signalScore desc so highest quality alerts fire first
      const sortedEntries = [...bucket.data].sort((a, b) => (b.signalScore ?? -1) - (a.signalScore ?? -1));

      for (const entry of sortedEntries) {
        if ((entry.totalStars ?? 0) < (state.cfg.minStars ?? 4))                               { skipStars++;   continue; }
        if (!entry.direction)                                                                    { skipDir++;     continue; }
        // onlyAligned: only filter when signalAligned is explicitly false (browser-evaluated).
        // Server-side entries omit the field entirely — treat as "unknown", let through.
        if (state.cfg.onlyAligned && entry.signalAligned === false)                            { skipAligned++; continue; }
        if (state.cfg.minSignalScore && (entry.signalScore ?? 0) < state.cfg.minSignalScore)   { skipScore++;   continue; }
        // Skip counter-trend fades when HMM shows strong trend opposing direction
        const _hmm = state.hmmRegimes[sym];
        if (_hmm?.regime === 'TREND' && _hmm.trendProb > 0.75) {
          const isLong = entry.direction === 'long';
          const withTrend = (isLong && _hmm.trendDir === 'BULL') || (!isLong && _hmm.trendDir === 'BEAR');
          if (!withTrend) { skipScore++; continue; }
        }

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

      state.skipCounts[sym] = { stars: skipStars, score: skipScore, dir: skipDir, aligned: skipAligned, prox: skipProx, cooldown: skipCooldown };

      if (doSummary && bucket.data.length > 0) {
        const maxStars = Math.max(...bucket.data.map(e => e.totalStars ?? 0));
        const maxScore = Math.max(...bucket.data.map(e => e.signalScore ?? 0));
        summaryLines.push(`${sym}: ${bucket.data.length} entries max=${maxStars}★ score=${maxScore}% skip=${skipStars}⭐/${skipScore}score/${skipDir}dir/${skipAligned}align/${skipProx}prox/${skipCooldown}cd`);
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

// Daily watchlist — top-starred levels selected at London open
app.get('/api/daily/watchlist', (_req, res) => {
  res.json({ date: state.watchlistDate, watchlist: state.dailyWatchlist });
});

// Manually trigger a watchlist recompute (ignores date guard)
app.post('/api/daily/watchlist/run', async (_req, res) => {
  try {
    await runDailyWatchlist();
    res.json({ ok: true, date: state.watchlistDate, watchlist: state.dailyWatchlist });
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
    await reloadLevels();

    // Compute HMM regime for each pair using last 60 daily closes
    const hmmResults = [];
    for (const sym of pairs) {
      const closes = await fetchDailyCandles(sym, 61);
      if (closes && closes.length >= 20) {
        const returns = [];
        for (let i = 1; i < closes.length; i++) {
          returns.push(Math.log(closes[i] / closes[i - 1]));
        }
        const result = fitHMM(returns);
        if (result) {
          // Preserve intraday30m set by reloadLevels() — don't clobber it
          state.hmmRegimes[sym] = { ...result, intraday30m: state.hmmRegimes[sym]?.intraday30m };
          hmmResults.push(`${sym}:${result.regime}${result.trendDir ? `(${result.trendDir})` : ''}@${Math.round(result.rangeProb * 100)}%range`);
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

await kv.load();
await reloadConfig();
await reloadLevels();

// Restore daily watchlist from KV so a Railway restart doesn't clear the day's levels
{
  const saved = await kv.get('daily_watchlist');
  if (saved) {
    try {
      const { date, watchlist } = JSON.parse(saved);
      state.dailyWatchlist = watchlist ?? {};
      state.watchlistDate  = date ?? null;
      if (date) console.log(`[WATCHLIST] Restored from KV — ${date}, ${Object.keys(watchlist ?? {}).length} pairs`);
    } catch { /* ignore corrupt data */ }
  }
}

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
