#!/usr/bin/env node
/**
 * Push backfilled OANDA position-book snapshots into the server's history store.
 *
 *   # 1. fetch, one snapshot per trading day at 07:00 UTC, near-spot buckets to NDJSON
 *   OANDA_KEY=... python scripts/fetch_oanda_books.py EUR_USD XAU_USD USD_JPY GBP_USD \
 *       --books position --from 2017-05 --daily 07:00 --ndjson backfill/books_daily.ndjson
 *
 *   # 2. summarise with the SAME metric the live route uses, and push
 *   KV_WRITE_SECRET=... node scripts/push_book_history.mjs backfill/books_daily.ndjson \
 *       --server https://macrofxmodel-production.up.railway.app
 *
 * WHY THIS SHAPE. The fetcher runs on a desk machine with the OANDA key; the server
 * keeps the store and runs the live 10-minute recorder. The backfill fills the DAILY
 * rows behind the live series; the recorder carries on from today. Aggregates are
 * computed here by js/positionBookMetrics.js -- the one implementation -- so a
 * backfilled day and a live day mean exactly the same thing.
 *
 * The server refuses a day the live recorder already has with more than one
 * snapshot behind it, so re-running this cannot overwrite recorded history.
 * Idempotent otherwise.
 */
import fs from 'fs';
import readline from 'readline';
import { summarisePositionBook } from '../js/positionBookMetrics.js';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const server = (args[args.indexOf('--server') + 1] || process.env.SERVER || 'https://macrofxmodel-production.up.railway.app').replace(/\/$/, '');
const secret = process.env.KV_WRITE_SECRET;
if (!file) { console.error('usage: node scripts/push_book_history.mjs <ndjson> [--server URL]'); process.exit(2); }
if (!secret) { console.error('KV_WRITE_SECRET is required (the server refuses unauthenticated writes)'); process.exit(2); }

const dayOf = iso => iso.slice(0, 10);
const byInst = {};   // instrument -> day -> [summaries]
let lines = 0, kept = 0;
const rl = readline.createInterface({ input: fs.createReadStream(file) });
for await (const line of rl) {
  if (!line.trim()) continue; lines++;
  let j; try { j = JSON.parse(line); } catch { continue; }
  if (j.book !== 'position') continue;
  const pb = { price: String(j.price), time: j.time, buckets: (j.buckets || []).map(([p, l, s]) => ({ price: String(p), longCountPercent: String(l), shortCountPercent: String(s) })) };
  const m = summarisePositionBook(pb);
  if (!m || m.longPct == null) continue;
  const d = dayOf(j.time);
  ((byInst[j.instrument] ||= {})[d] ||= []).push(m);
  kept++;
}
console.error(`${lines} lines, ${kept} usable snapshots, ${Object.keys(byInst).length} instruments`);

// Daily rows in the store's DCOLS order:
//   d, spot, longPct, staleShare, longsUW, shortsUW, meanLong, minLong, maxLong, n
const rowsByInst = {};
for (const [inst, days] of Object.entries(byInst)) {
  rowsByInst[inst] = Object.entries(days).sort().map(([d, ms]) => {
    const last = ms[ms.length - 1], longs = ms.map(x => x.longPct);
    const mean = +(longs.reduce((a, v) => a + v, 0) / longs.length).toFixed(1);
    return [d, last.spot, last.longPct, last.staleShare ?? null,
      last.pain?.longsUnderwaterPct ?? null, last.pain?.shortsUnderwaterPct ?? null,
      mean, Math.min(...longs), Math.max(...longs), ms.length];
  });
}

// Push in chunks per instrument so one request stays well under the body limit.
let pushed = 0, skipped = 0;
for (const [inst, rows] of Object.entries(rowsByInst)) {
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const r = await fetch(`${server}/api/oanda-book/history/import`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Auth-Token': secret },
      body: JSON.stringify({ instrument: inst, daily: chunk }),
    }).then(x => x.json()).catch(e => ({ ok: false, error: e.message }));
    if (!r.ok) { console.error(`  ${inst}: FAILED ${r.error}`); process.exit(1); }
    pushed += r.added; skipped += r.skipped;
    console.error(`  ${inst}: +${r.added} days (${r.skipped} already recorded live), store now ${r.days} days`);
  }
}
console.log(`done: ${pushed} days imported, ${skipped} left as recorded`);
