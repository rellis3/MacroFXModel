#!/usr/bin/env node
/**
 * server.mjs — Fib Atlas's own copy of `local_decision_engine/server.mjs`.
 * Localhost-only, no auth. Fails CLOSED on stale local data (explicit
 * `stale:true`, no zones) — a bot that ignores staleness here and trades
 * anyway is a bot-side bug, not something this server should paper over.
 *
 * Different port from Vote Atlas's local engine (4500) so both can run on
 * the same trading machine at once without colliding — default 4501.
 */
import express from 'express';
import { readFile } from 'fs/promises';
import { computeZones } from './lib/zonePricer.mjs';
import { loadBook, loadM1, bookAge, m1Age } from './lib/localStore.mjs';

const PORT = Number(process.env.FIB_LOCAL_DECISION_PORT || 4501);
const MAX_BOOK_AGE_HOURS = Number(process.env.MAX_BOOK_AGE_HOURS || 36);
const MAX_M1_AGE_HOURS = Number(process.env.MAX_M1_AGE_HOURS || 2);

const cfg = JSON.parse(await readFile(new URL('./config.json', import.meta.url), 'utf8'));
const WATCHED_PAIRS = new Set(cfg.pairs);
// Which ladder(s) each watched pair trades — mirrors fib_atlas_bot.py's own
// `cfg.get("ladders")` gate; default both, same as that bot's own default.
const LADDERS = Array.isArray(cfg.ladders) && cfg.ladders.length ? cfg.ladders : ['asia', 'monday'];

const app = express();

// Warm cache, keyed by `${pair}|${ladder}` — same "recompute only when the
// underlying data actually changed" + "background refresh loop, HTTP
// handlers only ever read the cache" discipline as Vote Atlas's own copy;
// see that file's doc for the ~10s single-thread-blocking issue this avoids.
const cache = new Map();   // "pair|ladder" -> { lastBarTime, bookSavedAt, result }
const REFRESH_INTERVAL_MS = Number(process.env.REFRESH_INTERVAL_MS || 5000);

function cacheKey(pair, ladder) { return `${pair}|${ladder}`; }

async function refreshOne(pair, ladder) {
  const key = cacheKey(pair, ladder);
  const [bAge, mAge] = await Promise.all([bookAge(pair, ladder), m1Age(pair)]);
  if (bAge > MAX_BOOK_AGE_HOURS || mAge > MAX_M1_AGE_HOURS) return;
  const [{ book, savedAt }, packed] = await Promise.all([loadBook(pair, ladder), loadM1(pair)]);
  if (!book || !packed?.n) return;

  const lastBarTime = packed.times[packed.n - 1];
  const hit = cache.get(key);
  if (hit && hit.lastBarTime === lastBarTime && hit.bookSavedAt === savedAt) return;

  const result = computeZones(ladder, pair, { book, packed });
  cache.set(key, { lastBarTime, bookSavedAt: savedAt, result });
}

let refreshing = false;
async function refreshAll() {
  if (refreshing) return;
  refreshing = true;
  try {
    for (const pair of WATCHED_PAIRS) {
      for (const ladder of LADDERS) {
        try { await refreshOne(pair, ladder); }
        catch (e) { console.warn(`[fib-local-decision-engine] refresh failed for ${pair}|${ladder}: ${e.message}`); }
        // Yield between EVERY (pair,ladder), not just every pair — twice the
        // cache entries of Vote Atlas's single-strategy loop, same event-
        // loop-blocking risk that file's doc already documents.
        await new Promise(r => setImmediate(r));
      }
    }
  } finally { refreshing = false; }
}

async function pairLadderDecision(pair, ladder) {
  WATCHED_PAIRS.add(pair);
  const key = cacheKey(pair, ladder);
  const [bAge, mAge] = await Promise.all([bookAge(pair, ladder), m1Age(pair)]);
  if (bAge > MAX_BOOK_AGE_HOURS) return { stale: true, reason: `book is ${bAge.toFixed(1)}h old (max ${MAX_BOOK_AGE_HOURS}h) — run sync.mjs`, zones: [], zoneCount: 0 };
  if (mAge > MAX_M1_AGE_HOURS) return { stale: true, reason: `M1 tail is ${mAge.toFixed(1)}h old (max ${MAX_M1_AGE_HOURS}h) — run sync.mjs`, zones: [], zoneCount: 0 };

  const hit = cache.get(key);
  if (hit) return hit.result;
  await refreshOne(pair, ladder);
  const fresh = cache.get(key);
  return fresh ? fresh.result : { stale: true, reason: 'no local book/M1 cached yet — run sync.mjs first', zones: [], zoneCount: 0 };
}

setInterval(refreshAll, REFRESH_INTERVAL_MS);
refreshAll();

app.get('/decide', async (req, res) => {
  const pair = String(req.query.pair || '').toLowerCase();
  const ladder = String(req.query.ladder || '').toLowerCase();
  if (!pair) return res.status(400).json({ ok: false, error: 'pair query param required' });
  if (ladder !== 'asia' && ladder !== 'monday') return res.status(400).json({ ok: false, error: "ladder query param must be 'asia' or 'monday'" });
  try {
    const result = await pairLadderDecision(pair, ladder);
    res.json({ ok: true, pair, ladder, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, pair, ladder, error: e.message });
  }
});

// GET /plan?pairs=eurusd,gbpusd,...  ->  {instruments: {"eurusd|asia": {...},
// "eurusd|monday": {...}, ...}, skipped: {"eurusd|asia": reason, ...}}
//
// KEYED EXACTLY the way `fib_atlas_bot_plan` already is (server.js's
// `_refreshFibAtlasPlan`/`mergeIntoFibAtlasPlan`, `${pair}|${ladder}`) so
// the bot's existing `_pair_ladder`/`_enabled_keys` parsing
// (fib_atlas_bot.py) needs ZERO changes beyond swapping the plan source —
// same "swap only the entry-time call" principle Vote Atlas v3 used.
app.get('/plan', async (req, res) => {
  const pairs = String(req.query.pairs || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!pairs.length) return res.status(400).json({ ok: false, error: 'pairs query param required (comma-separated)' });

  const instruments = {};
  const skipped = {};
  for (const pair of pairs) {
    for (const ladder of LADDERS) {
      const key = `${pair}|${ladder}`;
      try {
        const result = await pairLadderDecision(pair, ladder);
        if (result.stale || result.skipped) { skipped[key] = result.reason || result.skipped; continue; }
        instruments[key] = { spot: result.spot, date: result.date, boundary: result.boundary, zones: result.zones, zoneCount: result.zoneCount };
      } catch (e) {
        skipped[key] = `error: ${e.message}`;
      }
    }
  }
  res.json({ ok: true, data: { strategy: 'fib-atlas-vote-local', generatedAt: new Date().toISOString(), instruments, skipped }, timestamp: Date.now() });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[fib-local-decision-engine] listening on http://127.0.0.1:${PORT}`);
});
