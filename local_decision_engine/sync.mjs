#!/usr/bin/env node
/**
 * sync.mjs — the local decision engine's daily sync job.
 *
 * Pulls two small things per configured pair from Railway/OANDA so the
 * local engine can compute decisions without a network round-trip per tick:
 *   1. The book (GET /api/level-atlas/book/:pair — existing, public,
 *      unchanged route). Measured real size: ~325KB/pair.
 *   2. A short (~LOCAL_WINDOW_DAYS) local M1 tail, kept current via
 *      js/m1GapFill.js's gapFillPacked (the same, already-tested module the
 *      server itself uses) — not a reimplementation.
 *
 * Run once/day (cron, Task Scheduler, or `node sync.mjs --loop` for a
 * simple built-in daily loop). See MD files/LOCAL_DECISION_ENGINE_ARCHITECTURE.md.
 */
import { gapFillPacked } from '../js/m1GapFill.js';
import { oandaSymbol } from '../js/instrumentRegistry.js';
import { fetchM1Range } from './lib/fetchM1Range.mjs';
import { saveBook, saveM1 } from './lib/localStore.mjs';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';
const LOCAL_WINDOW_DAYS = Number(process.env.LOCAL_WINDOW_DAYS || 14);

async function loadConfig() {
  const raw = await readFile(path.join(__dirname, 'config.json'), 'utf8');
  return JSON.parse(raw);
}

// Trim to the last `days` — identical logic to js/levelAtlasRoutes.js's own
// boundPacked (js/levelAtlasRoutes.js:296-308), copied rather than imported
// since that file pulls in the full route-mounting/R2 dependency graph for
// one small pure function.
function boundPacked(packed, days) {
  if (!packed?.n) return packed;
  const cutSec = packed.times[packed.n - 1] - days * 86400;
  let cutIdx = 0;
  for (let i = 0; i < packed.n; i++) { if (packed.times[i] >= cutSec) { cutIdx = i; break; } }
  if (cutIdx <= 0) return packed;
  return {
    n: packed.n - cutIdx,
    times: packed.times.slice(cutIdx), opens: packed.opens.slice(cutIdx),
    highs: packed.highs.slice(cutIdx), lows: packed.lows.slice(cutIdx),
    closes: packed.closes.slice(cutIdx), volumes: packed.volumes.slice(cutIdx),
  };
}

async function syncBook(pair) {
  const r = await fetch(`${DASHBOARD_URL}/api/level-atlas/book/${pair}?rearm=0.3`);
  const j = await r.json();
  if (!j.ok || !j.book) throw new Error(`book fetch failed for ${pair}: ${j.error || 'unknown'}`);
  await saveBook(pair, j.book);
  return j.generatedAt;
}

// Seeds/refreshes the local M1 base from the SAME already-correct archive
// the server itself uses (GET /api/level-atlas/m1-tail/:pair — a trimmed
// slice of LIVE_SNAPSHOT_PREFIX), then gap-fills only the tiny live delta
// since that snapshot was saved directly from OANDA. Found by direct
// testing (parity_test.mjs, 2026-09-18): re-deriving the ENTIRE local
// window from a fresh OANDA query, instead of syncing the archive's own
// data, does NOT reproduce the official vote/margin for the identical
// touch — a data-provenance mismatch, not a staleness or window-length
// issue (both were ruled out first). This mirrors exactly what
// loadM1ForPair + gapFillPacked already do server-side: a known-good
// stored base, topped up with a small live delta — never re-derive the
// base itself from a live feed.
async function syncM1(pair) {
  const oandaSym = oandaSymbol(pair);
  const nowSec = Math.floor(Date.now() / 1000);

  const r = await fetch(`${DASHBOARD_URL}/api/level-atlas/m1-tail/${pair}?days=${LOCAL_WINDOW_DAYS}`);
  const j = await r.json();
  if (!j.ok || !j.n) throw new Error(`m1-tail fetch failed for ${pair}: ${j.error || 'unknown'}`);
  let packed = { n: j.n, times: j.times, opens: j.opens, highs: j.highs, lows: j.lows, closes: j.closes, volumes: j.volumes };
  console.log(`[sync] ${pair}: base ${packed.n.toLocaleString()} bars from server archive (snapshot saved ${j.savedAt})`);

  packed = await gapFillPacked(packed, oandaSym, fetchM1Range, {
    nowSec, minGapSec: 300, onLog: m => console.log(`[sync] ${pair}: ${m}`),
  });

  packed = boundPacked(packed, LOCAL_WINDOW_DAYS);
  await saveM1(pair, packed);
  return packed.n;
}

async function syncPair(pair) {
  try {
    const generatedAt = await syncBook(pair);
    const n = await syncM1(pair);
    console.log(`[sync] ${pair}: book ${generatedAt}, M1 tail ${n.toLocaleString()} bars`);
  } catch (e) {
    console.error(`[sync] ${pair} FAILED: ${e.message}`);
  }
}

async function runOnce() {
  const cfg = await loadConfig();
  for (const pair of cfg.pairs) {
    await syncPair(pair);   // sequential — same "one pair fully before the next" discipline the server-side jobs use, avoids hammering OANDA/Railway concurrently
  }
}

async function main() {
  if (process.argv.includes('--loop')) {
    console.log('[sync] running once now, then every 24h');
    for (;;) {
      await runOnce();
      await new Promise(r => setTimeout(r, 24 * 3600_000));
    }
  } else {
    await runOnce();
  }
}

main().catch(e => { console.error('[sync] fatal:', e); process.exit(1); });
