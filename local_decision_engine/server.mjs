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
import { computeZones } from './lib/zonePricer.mjs';
import { loadBook, loadM1, bookAge, m1Age } from './lib/localStore.mjs';

const PORT = Number(process.env.LOCAL_DECISION_PORT || 4500);
const MAX_BOOK_AGE_HOURS = Number(process.env.MAX_BOOK_AGE_HOURS || 36);   // book only changes ~daily; generous but not infinite
const MAX_M1_AGE_HOURS = Number(process.env.MAX_M1_AGE_HOURS || 2);        // M1 tail should be minutes old under normal sync

const app = express();

async function pairDecision(pair, opts) {
  const [bAge, mAge] = await Promise.all([bookAge(pair), m1Age(pair)]);
  if (bAge > MAX_BOOK_AGE_HOURS) return { stale: true, reason: `book is ${bAge.toFixed(1)}h old (max ${MAX_BOOK_AGE_HOURS}h) — run sync.mjs`, zones: [], zoneCount: 0 };
  if (mAge > MAX_M1_AGE_HOURS) return { stale: true, reason: `M1 tail is ${mAge.toFixed(1)}h old (max ${MAX_M1_AGE_HOURS}h) — run sync.mjs`, zones: [], zoneCount: 0 };

  const [{ book }, packed] = await Promise.all([loadBook(pair), loadM1(pair)]);
  if (!book) return { stale: true, reason: 'no local book cached — run sync.mjs first', zones: [], zoneCount: 0 };
  if (!packed?.n) return { stale: true, reason: 'no local M1 tail cached — run sync.mjs first', zones: [], zoneCount: 0 };

  return computeZones(pair, { book, packed, earlyExit: opts.earlyExit, earlyExitThreshold: opts.earlyExitThreshold });
}

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
