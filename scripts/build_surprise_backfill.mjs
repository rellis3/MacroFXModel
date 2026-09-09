#!/usr/bin/env node
/**
 * Build the economic-surprise backfill from the local ForexFactory calendar archive.
 *
 * Why this exists as a build step rather than a server job: the source CSV
 * (data/calendar/ff_calendar_2007_2025.csv) is ~68MB and is NOT tracked by git, so it
 * does not exist on Railway. This runs locally, filters it down to the releases the
 * surprise engine can actually use, and writes a small committed JSON the server
 * merges into KV at boot.
 *
 * Source choice matters. There are two calendar archives in this repo:
 *
 *   data/calendar/ff_calendar_2007_2025.csv  — ForexFactory, 2007-01 -> 2025-04
 *   calendar_events.csv                      — a different vendor, 2014 -> 2026-07
 *
 * The FF archive is used because the LIVE feed is also ForexFactory, so its event
 * titles match exactly and backfilled history joins to newly-collected releases. The
 * other archive uses a different vocabulary entirely ("Weekly Jobless Claims" vs FF's
 * "Unemployment Claims") — only 16 of ~380 series titles overlap, so merging the two
 * would split most series into two half-samples that never join. Longer coverage is
 * not worth a fragmented key space.
 *
 *   node scripts/build_surprise_backfill.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data', 'calendar', 'ff_calendar_2007_2025.csv');
// NOT under data/ — that whole directory is gitignored, so a file written there would
// never reach Railway, which is the entire point of precomputing it.
const OUT = path.join(ROOT, 'backfill', 'surprise_backfill.json');

// Mirrors js/econCalendar.js CCY_TO_COUNTRY — the store is keyed on country codes.
const CCY_TO_COUNTRY = { USD: 'US', EUR: 'EU', GBP: 'GB', JPY: 'JP', AUD: 'AU', NZD: 'NZ', CAD: 'CA', CHF: 'CH' };
// The index scores high+medium only, so low-impact rows are dead weight in a file
// that has to be committed.
const IMPACT = { 'High Impact Expected': 'high', 'Medium Impact Expected': 'medium' };

/** Minimal RFC4180-ish parser — the Detail column contains commas and quoted newlines. */
function* rows(text) {
  let i = 0, field = '', row = [], inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); yield row; row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); yield row; }
}

if (!fs.existsSync(SRC)) {
  console.error(`Source not found: ${SRC}\nThis archive is untracked (~68MB). Nothing to build.`);
  process.exit(1);
}
const text = fs.readFileSync(SRC, 'utf8');
const it = rows(text);
const header = it.next().value.map(h => h.trim());
const col = Object.fromEntries(header.map((h, i) => [h, i]));

const out = [];
let seen = 0, skippedImpact = 0, skippedNoConsensus = 0, skippedCcy = 0;
for (const r of it) {
  seen++;
  const ccy = (r[col.Currency] ?? '').trim().toUpperCase();
  if (!CCY_TO_COUNTRY[ccy]) { skippedCcy++; continue; }
  const impact = IMPACT[(r[col.Impact] ?? '').trim()];
  if (!impact) { skippedImpact++; continue; }
  const actual = (r[col.Actual] ?? '').trim();
  const forecast = (r[col.Forecast] ?? '').trim();
  // No consensus means no surprise, by definition — the engine skips these anyway.
  if (!actual || !forecast) { skippedNoConsensus++; continue; }
  const ms = Date.parse((r[col.DateTime] ?? '').trim());
  if (!Number.isFinite(ms)) continue;
  out.push({
    country: CCY_TO_COUNTRY[ccy],
    event: (r[col.Event] ?? '').trim(),
    impact,
    time: new Date(ms).toISOString().slice(0, 19).replace('T', ' '),
    ms,
    estimate: forecast,
    prev: (r[col.Previous] ?? '').trim() || null,
    actual,
  });
}
out.sort((a, b) => a.ms - b.ms);

// Column-oriented rather than an array of objects: the same 7 keys repeated 26k times
// is most of the file. This is ~3x smaller, which matters for something that has to be
// committed. The server expands it back on load.
const COLS = ['country', 'event', 'impact', 'ms', 'estimate', 'prev', 'actual'];
const payload = {
  source: 'data/calendar/ff_calendar_2007_2025.csv (ForexFactory — same feed as live, so titles join)',
  builtAt: new Date().toISOString(),
  from: out[0]?.time ?? null,
  to: out[out.length - 1]?.time ?? null,
  count: out.length,
  cols: COLS,
  rows: out.map(r => COLS.map(c => r[c])),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload));
const mb = (fs.statSync(OUT).size / 1048576).toFixed(1);

const bySeries = new Map();
for (const r of out) bySeries.set(`${r.country}|${r.event.toLowerCase()}`, (bySeries.get(`${r.country}|${r.event.toLowerCase()}`) ?? 0) + 1);
const usable = [...bySeries.values()].filter(n => n >= 6).length;

console.log(`read ${seen} rows`);
console.log(`  skipped: ${skippedCcy} untracked currency, ${skippedImpact} low/non-economic impact, ${skippedNoConsensus} no consensus`);
console.log(`wrote ${out.length} releases -> ${path.relative(ROOT, OUT)} (${mb} MB)`);
console.log(`  ${payload.from} -> ${payload.to}`);
console.log(`  ${bySeries.size} distinct series, ${usable} with enough history to standardise (>=6)`);
