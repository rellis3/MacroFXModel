#!/usr/bin/env node
/**
 * server.mjs — the local decision engine's HTTP surface. Localhost-only,
 * no auth (never exposed off the machine) — a Python bot on the same box
 * calls this at tick time instead of polling a 45-second-old remote plan
 * snapshot. See MD files/LOCAL_DECISION_ENGINE_ARCHITECTURE.md.
 *
 * Fails CLOSED on stale local data (explicit `stale:true`, no zones),
 * mirroring volatility_bot_v2's own plan_max_age_hours contract — a bot
 * that ignores staleness here and trades anyway is a bot-side bug, not
 * something this server should paper over by guessing.
 */
import express from 'express';
import { readFile } from 'fs/promises';
import { computeZones } from './lib/zonePricer.mjs';
import { loadBook, loadM1, bookAge, m1Age } from './lib/localStore.mjs';

const PORT = Number(process.env.LOCAL_DECISION_PORT || 4500);
const MAX_BOOK_AGE_HOURS = Number(process.env.MAX_BOOK_AGE_HOURS || 36);   // book only changes ~daily; generous but not infinite
const MAX_M1_AGE_HOURS = Number(process.env.MAX_M1_AGE_HOURS || 2);        // M1 tail should be minutes old under normal sync

// The pairs the background refresh loop keeps warm — same config.json
// sync.mjs reads, plus anything a caller asks about that wasn't in it (so
// an ad-hoc /decide?pair=X for an unconfigured pair still eventually warms
// on subsequent calls, just not proactively before the first one).
const WATCHED_PAIRS = new Set(JSON.parse(await readFile(new URL('./config.json', import.meta.url), 'utf8')).pairs);

const app = express();

// Warm cache, keyed by pair — recompute atlasWalk only when the underlying
// data actually changed, not on every poll. Same reasoning as the server's
// own getFastLive (js/levelAtlasRoutes.js): M1 only advances once a minute,
// so recomputing on every 3s tick is pure waste.
//
// Found live (2026-09-18): computeZones alone costs ~500-800ms/pair at the
// 100-day local window (needed to clear atlasWalk's own minLookback gate —
// see sync.mjs's own doc) — 17 pairs sequentially is ~14-19s. A cache keyed
// only "recompute on request if stale" still means EVERY request lands in
// that ~19s window once a minute (whenever the M1 tail's last bar
// advances), which is exactly what timed out the bot's own 5s client on
// the first real end-to-end run. Fix: a background loop refreshes the
// cache on its own schedule; HTTP handlers ONLY ever read whatever's
// already cached (near-instant) or report {warming:true} on a pair that's
// never been computed yet — they never trigger a synchronous recompute
// themselves.
const cache = new Map();   // pair -> { lastBarTime, bookSavedAt, result }
const REFRESH_INTERVAL_MS = Number(process.env.REFRESH_INTERVAL_MS || 5000);
const DEFAULT_OPTS = { earlyExit: false, earlyExitThreshold: 0.4 };

async function refreshOne(pair, opts = DEFAULT_OPTS) {
  const [bAge, mAge] = await Promise.all([bookAge(pair), m1Age(pair)]);
  if (bAge > MAX_BOOK_AGE_HOURS || mAge > MAX_M1_AGE_HOURS) return;   // let staleness show through to callers via pairDecision's own checks, not a cached stale result
  const [{ book, savedAt }, packed] = await Promise.all([loadBook(pair), loadM1(pair)]);
  if (!book || !packed?.n) return;

  const lastBarTime = packed.times[packed.n - 1];
  const hit = cache.get(pair);
  if (hit && hit.lastBarTime === lastBarTime && hit.bookSavedAt === savedAt) return;   // nothing new — leave the cache as-is

  const result = computeZones(pair, { book, packed, earlyExit: opts.earlyExit, earlyExitThreshold: opts.earlyExitThreshold });
  cache.set(pair, { lastBarTime, bookSavedAt: savedAt, result });
}

let refreshing = false;
async function refreshAll() {
  if (refreshing) return;   // don't overlap a slow pass with the next tick
  refreshing = true;
  try {
    for (const pair of WATCHED_PAIRS) {
      try { await refreshOne(pair); }
      catch (e) { console.warn(`[local-decision-engine] refresh failed for ${pair}: ${e.message}`); }
      // Yield to the event loop between pairs. computeZones is synchronous
      // CPU work (~500-800ms/pair) -- found live 2026-09-18: when sync.mjs's
      // M1 resync lands and invalidates every watched pair's cache at
      // roughly the same moment, this loop used to grind through all of
      // them back-to-back with nothing else able to run in between, which
      // blocked Node's single thread for ~10+ seconds straight and timed
      // out the bot's own 5s HTTP client mid-batch ("Read timed out"). A
      // setImmediate between pairs lets a pending /plan or /decide request
      // get served (from whatever's already cached) instead of queuing
      // behind the whole batch.
      await new Promise(r => setImmediate(r));
    }
  } finally { refreshing = false; }
}

async function pairDecision(pair, opts) {
  WATCHED_PAIRS.add(pair);
  const [bAge, mAge] = await Promise.all([bookAge(pair), m1Age(pair)]);
  if (bAge > MAX_BOOK_AGE_HOURS) return { stale: true, reason: `book is ${bAge.toFixed(1)}h old (max ${MAX_BOOK_AGE_HOURS}h) — run sync.mjs`, zones: [], zoneCount: 0 };
  if (mAge > MAX_M1_AGE_HOURS) return { stale: true, reason: `M1 tail is ${mAge.toFixed(1)}h old (max ${MAX_M1_AGE_HOURS}h) — run sync.mjs`, zones: [], zoneCount: 0 };

  const hit = cache.get(pair);
  if (hit) return hit.result;
  // Not warmed yet (first-ever request for this pair, or the background
  // loop hasn't reached it this pass) — compute it once, synchronously,
  // rather than make the caller wait for the next refresh cycle.
  await refreshOne(pair, opts);
  const fresh = cache.get(pair);
  return fresh ? fresh.result : { stale: true, reason: 'no local book/M1 cached yet — run sync.mjs first', zones: [], zoneCount: 0 };
}

setInterval(refreshAll, REFRESH_INTERVAL_MS);
refreshAll();   // pre-warm on startup rather than waiting for the first tick

app.get('/decide', async (req, res) => {
  const pair = String(req.query.pair || '').toLowerCase();
  if (!pair) return res.status(400).json({ ok: false, error: 'pair query param required' });
  try {
    const earlyExit = req.query.earlyExit === 'true';
    const earlyExitThreshold = req.query.earlyExitThreshold ? Number(req.query.earlyExitThreshold) : 0.4;
    const result = await pairDecision(pair, { earlyExit, earlyExitThreshold });
    res.json({ ok: true, pair, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, pair, error: e.message });
  }
});

// GET /plan?pairs=eurusd,gbpusd,...&earlyExit=false — same
// {instruments: {pair: {spot, zones, zoneCount}}, skipped: {pair: reason}}
// shape _refreshVolatilityV2Plan currently writes to volatility_bot_v2_plan,
// so volatility_bot_v3's _sync_sessions consumes this with zero format
// changes — only the source (this local call, not a KV read) differs.
app.get('/plan', async (req, res) => {
  const pairs = String(req.query.pairs || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!pairs.length) return res.status(400).json({ ok: false, error: 'pairs query param required (comma-separated)' });
  const earlyExit = req.query.earlyExit === 'true';
  const earlyExitThreshold = req.query.earlyExitThreshold ? Number(req.query.earlyExitThreshold) : 0.4;

  const instruments = {};
  const skipped = {};
  for (const pair of pairs) {
    try {
      const result = await pairDecision(pair, { earlyExit, earlyExitThreshold });
      if (result.stale || result.skipped) { skipped[pair] = result.reason || result.skipped; continue; }
      instruments[pair] = { spot: result.spot, zones: result.zones, zoneCount: result.zoneCount };
    } catch (e) {
      skipped[pair] = `error: ${e.message}`;
    }
  }
  res.json({ ok: true, data: { strategy: 'level-atlas-vote-local', generatedAt: new Date().toISOString(), instruments, skipped }, timestamp: Date.now() });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[local-decision-engine] listening on http://127.0.0.1:${PORT}`);
});
