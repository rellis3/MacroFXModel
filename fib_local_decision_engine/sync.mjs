#!/usr/bin/env node
/**
 * sync.mjs — Fib Atlas's own copy of `local_decision_engine/sync.mjs`. Same
 * "PURE PULL from Railway, no OANDA credential locally" constraint (see that
 * file's header). Two books per pair now (Asia's + Monday's — genuinely
 * different OOS-fit data), one shared M1 tail per pair.
 *
 * The M1-tail route reused here (`GET /api/level-atlas/m1-tail/:pair`) is
 * NOT Fib-Atlas-specific — it serves raw OANDA M1 bars off Level Atlas's own
 * warm cache, but the underlying price series for a given pair is identical
 * regardless of which engine's cache warmed it, so it's directly reusable
 * with zero new server route needed. Confirmed generic and already
 * incremental (`?since=`) as of the 2026-09-18 Vote Atlas v3 build.
 */
import { saveBook, saveM1, loadM1 } from './lib/localStore.mjs';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';
// Both ladders' own live caches use 180 calendar days server-side
// (asiaFibAtlasRoutes.js / mondayFibAtlasRoutes.js LIVE_WINDOW_DAYS) —
// "comfortably over this engine's own widest lookback (hurstBucket's 80
// trailing daily closes)". Reuse that SAME proven value locally rather than
// guessing a shorter window and rediscovering the "silently returns zero
// output" failure mode Vote Atlas's build hit with too-short a window.
const LOCAL_WINDOW_DAYS = Number(process.env.LOCAL_WINDOW_DAYS || 180);
const M1_SYNC_INTERVAL_MINUTES = Number(process.env.M1_SYNC_INTERVAL_MINUTES || 15);
const BOOK_SYNC_INTERVAL_HOURS = Number(process.env.BOOK_SYNC_INTERVAL_HOURS || 24);

async function loadConfig() {
  const raw = await readFile(path.join(__dirname, 'config.json'), 'utf8');
  return JSON.parse(raw);
}

const BOOK_ROUTE = { asia: 'asia-fib-atlas', monday: 'monday-fib-atlas' };

async function syncBook(pair, ladder) {
  const r = await fetch(`${DASHBOARD_URL}/api/${BOOK_ROUTE[ladder]}/book/${pair}`);
  const j = await r.json();
  if (!j.ok || !j.book) throw new Error(`book fetch failed for ${pair}|${ladder}: ${j.error || 'unknown'}`);
  await saveBook(pair, ladder, j.book);
  return j.generatedAt;
}

// Identical to local_decision_engine/sync.mjs's own mergePacked — see that
// file's doc for why (incremental ?since= pulls, front-trimmed to window).
function mergePacked(existing, fresh, windowDays) {
  if (!existing?.n) return fresh;
  if (!fresh?.n) return existing;
  const times = [...existing.times, ...fresh.times];
  const opens = [...existing.opens, ...fresh.opens];
  const highs = [...existing.highs, ...fresh.highs];
  const lows = [...existing.lows, ...fresh.lows];
  const closes = [...existing.closes, ...fresh.closes];
  const volumes = [...existing.volumes, ...fresh.volumes];
  const n = times.length;
  const cutSec = times[n - 1] - windowDays * 86400;
  let cutIdx = 0;
  for (let i = 0; i < n; i++) { if (times[i] >= cutSec) { cutIdx = i; break; } }
  if (cutIdx <= 0) return { n, times, opens, highs, lows, closes, volumes };
  return {
    n: n - cutIdx, times: times.slice(cutIdx), opens: opens.slice(cutIdx),
    highs: highs.slice(cutIdx), lows: lows.slice(cutIdx),
    closes: closes.slice(cutIdx), volumes: volumes.slice(cutIdx),
  };
}

// Shared across both ladders for one pair — see localStore.mjs's own doc.
async function syncM1(pair) {
  const existing = await loadM1(pair);
  const since = existing?.n ? existing.times[existing.n - 1] : null;
  const url = since != null
    ? `${DASHBOARD_URL}/api/level-atlas/m1-tail/${pair}?days=${LOCAL_WINDOW_DAYS}&since=${since}`
    : `${DASHBOARD_URL}/api/level-atlas/m1-tail/${pair}?days=${LOCAL_WINDOW_DAYS}`;
  const r = await fetch(url);
  const j = await r.json();
  if (r.status === 202 && j.warming) { console.log(`[sync] ${pair}: server still warming — will retry next cycle`); return null; }
  if (!j.ok) throw new Error(`m1-tail fetch failed for ${pair}: ${j.error || 'unknown'}`);
  if (!j.n) {
    if (since != null) return existing.n;
    throw new Error(`m1-tail fetch failed for ${pair}: empty response`);
  }
  const fetched = { n: j.n, times: j.times, opens: j.opens, highs: j.highs, lows: j.lows, closes: j.closes, volumes: j.volumes };
  const merged = since != null ? mergePacked(existing, fetched, LOCAL_WINDOW_DAYS) : fetched;
  await saveM1(pair, merged);
  return merged.n;
}

async function syncAllBooks(pairs, ladders) {
  for (const pair of pairs) {
    for (const ladder of ladders) {
      try { const g = await syncBook(pair, ladder); console.log(`[sync] ${pair}|${ladder}: book ${g}`); }
      catch (e) { console.error(`[sync] ${pair}|${ladder} book FAILED: ${e.message}`); }
    }
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
  const ladders = Array.isArray(cfg.ladders) && cfg.ladders.length ? cfg.ladders : ['asia', 'monday'];
  const loop = process.argv.includes('--loop');

  await syncAllBooks(cfg.pairs, ladders);
  await syncAllM1(cfg.pairs);

  if (!loop) return;

  console.log(`[sync] looping: book every ${BOOK_SYNC_INTERVAL_HOURS}h, M1 tail every ${M1_SYNC_INTERVAL_MINUTES}min (ladders: ${ladders.join(', ')})`);
  setInterval(() => syncAllBooks(cfg.pairs, ladders), BOOK_SYNC_INTERVAL_HOURS * 3600_000);
  setInterval(() => syncAllM1(cfg.pairs), M1_SYNC_INTERVAL_MINUTES * 60_000);
}

main().catch(e => { console.error('[sync] fatal:', e); process.exit(1); });
