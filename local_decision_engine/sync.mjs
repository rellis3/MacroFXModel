#!/usr/bin/env node
/**
 * sync.mjs — the local decision engine's sync job. A PURE PULL from
 * Railway — no OANDA credential, no gap-fill logic, on the local machine
 * at all (owner's explicit constraint, 2026-09-18: OANDA_KEY and all
 * top-up logic stay server-side; local is "the bot + a pull").
 *
 * Pulls two things, on two different schedules matched to how often each
 * actually changes:
 *   1. The book (GET /api/level-atlas/book/:pair) — once/day. Base rates
 *      per dimension bucket; genuinely stable within a day. Measured real
 *      size: ~325KB/pair.
 *   2. The M1 tail (GET /api/level-atlas/m1-tail/:pair) — every
 *      M1_SYNC_INTERVAL_MINUTES (default 15). This route now calls the
 *      server's own getFastLive first (guaranteed fresh, OANDA-backed,
 *      server-side only) rather than serving a possibly-stale saved
 *      snapshot — see js/levelAtlasRoutes.js's own doc on that route.
 *      Needs to run often enough to comfortably clear server.mjs's
 *      MAX_M1_AGE_HOURS fail-closed gate (default 2h); 15 min leaves a
 *      wide margin even if one sync attempt fails. Measured real cost:
 *      ~732KB/pair/call — at 15-min cadence across 17 pairs that's
 *      ~1.2GB/day, ~$1.78/month at Railway's $0.05/GB egress rate (checked
 *      directly via /api/egress-audit, not estimated) — deliberately
 *      chosen, not left to default to something wasteful; tune
 *      M1_SYNC_INTERVAL_MINUTES up if that's not tight enough, or down if
 *      cost matters more than freshness.
 *
 * Run as `node sync.mjs --loop` and leave it running (or under a process
 * manager) — it owns its own scheduling now that there's no OANDA rate
 * limit to respect locally. See MD files/LOCAL_DECISION_ENGINE_ARCHITECTURE.md.
 */
import { saveBook, saveM1 } from './lib/localStore.mjs';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';
// 2026-09-18: was 14 — too short. atlasWalk's own minLookback gate (default
// 60 TRADING days) needs the window to clear ~60 trading days just to
// produce ANY output at all. 100 calendar days comfortably clears that
// with margin for holidays/index-specific calendars.
const LOCAL_WINDOW_DAYS = Number(process.env.LOCAL_WINDOW_DAYS || 100);
const M1_SYNC_INTERVAL_MINUTES = Number(process.env.M1_SYNC_INTERVAL_MINUTES || 15);
const BOOK_SYNC_INTERVAL_HOURS = Number(process.env.BOOK_SYNC_INTERVAL_HOURS || 24);

async function loadConfig() {
  const raw = await readFile(path.join(__dirname, 'config.json'), 'utf8');
  return JSON.parse(raw);
}

async function syncBook(pair) {
  const r = await fetch(`${DASHBOARD_URL}/api/level-atlas/book/${pair}?rearm=0.3`);
  const j = await r.json();
  if (!j.ok || !j.book) throw new Error(`book fetch failed for ${pair}: ${j.error || 'unknown'}`);
  await saveBook(pair, j.book);
  return j.generatedAt;
}

async function syncM1(pair) {
  const r = await fetch(`${DASHBOARD_URL}/api/level-atlas/m1-tail/${pair}?days=${LOCAL_WINDOW_DAYS}`);
  const j = await r.json();
  if (r.status === 202 && j.warming) { console.log(`[sync] ${pair}: server still warming — will retry next cycle`); return null; }
  if (!j.ok || !j.n) throw new Error(`m1-tail fetch failed for ${pair}: ${j.error || 'unknown'}`);
  const packed = { n: j.n, times: j.times, opens: j.opens, highs: j.highs, lows: j.lows, closes: j.closes, volumes: j.volumes };
  await saveM1(pair, packed);
  return packed.n;
}

async function syncAllBooks(pairs) {
  for (const pair of pairs) {
    try { const g = await syncBook(pair); console.log(`[sync] ${pair}: book ${g}`); }
    catch (e) { console.error(`[sync] ${pair} book FAILED: ${e.message}`); }
  }
}

async function syncAllM1(pairs) {
  for (const pair of pairs) {
    try { const n = await syncM1(pair); if (n != null) console.log(`[sync] ${pair}: M1 tail ${n.toLocaleString()} bars`); }
    catch (e) { console.error(`[sync] ${pair} M1 FAILED: ${e.message}`); }
  }
}

async function main() {
  const cfg = await loadConfig();
  const loop = process.argv.includes('--loop');

  await syncAllBooks(cfg.pairs);
  await syncAllM1(cfg.pairs);

  if (!loop) return;

  console.log(`[sync] looping: book every ${BOOK_SYNC_INTERVAL_HOURS}h, M1 tail every ${M1_SYNC_INTERVAL_MINUTES}min`);
  setInterval(() => syncAllBooks(cfg.pairs), BOOK_SYNC_INTERVAL_HOURS * 3600_000);
  setInterval(() => syncAllM1(cfg.pairs), M1_SYNC_INTERVAL_MINUTES * 60_000);
}

main().catch(e => { console.error('[sync] fatal:', e); process.exit(1); });
