// LOG WHAT THE LABELS CLAIMED — one row per level, per session.
//
//   node log_expectations.mjs                 dry run, prints what it would record
//   node log_expectations.mjs --write         append today's levels to oi_expect_log
//   node log_expectations.mjs --key oi_store_py --write     log the shadow instead
//
// Without this the expectations on the chart are folklore: "a call wall in a calm
// band rejects" is the textbook reading and nobody has ever counted whether it does.
// This records the CLAIM at the moment it was made - level, type, tag, spot, and the
// distance scale - so `score_expectations.mjs` can later ask what price actually did.
//
// WHY A SEPARATE KEY. range_line_oi already dates OI levels, but it belongs to the
// range-line forward test and is consumed by it; adding a second purpose to it would
// couple two experiments that should be able to fail independently.
//
// APPEND-ONLY, ONE ROW PER (date, pair, type, price). Re-running the same day
// overwrites that day's rows rather than duplicating them, so a repeated sweep does
// not inflate the sample - the thing that would quietly flatter every hit rate.
import { oiStoreToLevels } from '../js/oiConfluence.js';
import { levelExpectation } from '../js/levelExpectation.js';

const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf(n); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const has = n => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };

const BASE = flag('--base', 'https://macrofxmodel-production.up.railway.app');
const SRC  = flag('--key', 'oi_store');
const LOG  = flag('--log', 'oi_expect_log');
const write = has('--write');

const day = new Date().toISOString().slice(0, 10);

const src = await (await fetch(`${BASE}/api/kv/get?key=${SRC}`)).json();
if (src.miss || !src.data) { console.error(`${SRC} is empty`); process.exit(2); }

const rows = [];
for (const [pair, inst] of Object.entries(src.data)) {
  if (!inst || typeof inst !== 'object' || !Number.isFinite(inst.spot)) continue;
  const ctx = { spot: inst.spot, gexFlips: inst.gexFlips,
                gammaFlip: inst.gammaFlip, refMove: inst.refMove?.move };
  for (const lv of oiStoreToLevels(inst)) {
    const ex = levelExpectation(lv, ctx);
    if (!ex) continue;
    rows.push({
      date: day, pair, price: lv.price, type: lv.type, tier: lv.tier ?? null,
      tag: ex.tag, expect: ex.short.replace('·far', ''), band: ex.band,
      // Recorded so scoring never has to guess the scale AFTER the fact - picking
      // a tolerance later, once you can see the outcomes, is how a flattering
      // result gets manufactured.
      spotAtLog: inst.spot, refMove: inst.refMove?.move ?? null,
      savedAt: inst.savedAt ?? null,
    });
  }
}

console.log(`\n${rows.length} level(s) across ${new Set(rows.map(r => r.pair)).size} pair(s) for ${day}\n`);
const byTag = {};
for (const r of rows) byTag[r.tag] = (byTag[r.tag] || 0) + 1;
for (const [t, n] of Object.entries(byTag).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${t}`);
}

if (!write) { console.log('\n  Dry run - nothing written. Add --write to record.'); process.exit(0); }

const cur = await (await fetch(`${BASE}/api/kv/get?key=${LOG}`)).json();
const log = (!cur.miss && cur.data) ? cur.data : {};
log[day] = rows;                                   // idempotent per day, see header
const r = await fetch(`${BASE}/api/kv/set`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: LOG, data: log, timestamp: Date.now() }),
});
const out = await r.json().catch(() => ({}));
console.log(`\n  POST ${LOG} -> HTTP ${r.status} ${JSON.stringify(out)}`);
if (!r.ok || out.ok === false) { console.error('  WRITE FAILED'); process.exit(1); }
console.log(`  log now holds ${Object.keys(log).length} session(s)`);
