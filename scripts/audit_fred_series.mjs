#!/usr/bin/env node
/**
 * Audit every FRED series the macro engines use, and report which are DEAD.
 *
 *     node scripts/audit_fred_series.mjs            # table to stdout
 *     node scripts/audit_fred_series.mjs out.json   # also write JSON
 *
 * Needs NO FRED_KEY. It reads `fredgraph.csv`, a public keyless endpoint, which is
 * why this can run anywhere -- including from a sandbox that has no credentials.
 *
 * WHY THIS EXISTS. A discontinued FRED series does not error. It returns its full
 * history with a `n=303, no error` response and simply stops advancing, so the
 * engine scores off the last print forever and every health check stays green. That
 * is how JPY CPI went on publishing a June-2021 reading for four years, and how the
 * CHF short rate kept scoring a March-2024 print for eighteen months after the same
 * discontinuation had already been found and fixed in one other file.
 *
 * The only reliable signal is the NEWEST OBSERVATION DATE, which is what this
 * checks. Run it whenever a macro dimension looks odd, and periodically regardless.
 *
 * READING THE OUTPUT -- the age thresholds are deliberately loose, because "old" and
 * "dead" are different claims:
 *   • A QUARTERLY series is legitimately 250+ days old late in the following
 *     quarter. Do not treat that as dead. Check the observation spacing first.
 *   • A dead series is usually YEARS behind, and its whole family tends to stop on
 *     the same date -- that clustering is the giveaway.
 *
 * TWO TRAPS, both hit while writing this:
 *   1. fredgraph SILENTLY FALLS BACK to the base series when handed an unknown ID
 *      with a suffix: `CP0000EZ19M086NEST_XFE` returns the headline series and looks
 *      like a valid core-CPI ID. A "working" ID is not proof the ID exists --
 *      compare the values against the series you think it should differ from.
 *   2. A live ID in the right-looking family can be the WRONG MEASURE.
 *      `CANSLRTCR03GPSAM` is current and looks like Canadian retail sales; it is
 *      passenger car registrations. Always read the series title before adopting it.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ENGINES = ['cpi', 'gdp', 'ism', 'laborMarket', 'retailSales', 'tradeBalance',
                 'realYield', 'yieldCurve', 'consumerConfidence', 'ppi', 'rateDiff',
                 'econTrend', 'gpr'];
// FRED throttles bursts with HTTP 403 (not 429), and a throttled response is an
// HTML error page -- which is byte-identical in shape to the HTML you get for a
// series that does not exist. Reading one as the other makes this tool confidently
// report LIVE series as dead: at concurrency 6 it declared all seven trade-balance
// series NOT_FOUND when every one of them was current to 2026-06. Hence low
// concurrency, and a status check before any conclusion.
const CONCURRENCY = 3;
const RETRIES = 4;
const DEAD_DAYS = 400;              // beyond any honest quarterly lag
const WATCH_DAYS = 200;

// fileURLToPath, not URL.pathname — the latter yields "/C:/..." on Windows.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function collectIds() {
  const ids = new Map();
  for (const name of ENGINES) {
    const p = path.join(root, 'js', `${name}Engine.js`);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    for (const m of src.matchAll(/'([A-Z][A-Z0-9]{4,21})'/g)) {
      const id = m[1];
      if (/^(USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD|USA|DEU|GBR)$/.test(id)) continue;
      if (!ids.has(id)) ids.set(id, new Set());
      ids.get(id).add(name);
    }
  }
  return ids;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function check(id, attempt = 0) {
  try {
    const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`,
      { signal: AbortSignal.timeout(30_000) });
    // 403 = throttled, NOT missing. Back off and try again; only give up after
    // RETRIES, and then say THROTTLED rather than claiming the series is gone.
    if (r.status === 403 || r.status === 429) {
      if (attempt < RETRIES) { await sleep(1500 * (attempt + 1)); return check(id, attempt + 1); }
      return { err: 'THROTTLED' };
    }
    if (r.status === 404) return { err: 'NOT_FOUND' };
    if (!r.ok) return { err: `HTTP_${r.status}` };
    const t = await r.text();
    if (t.startsWith('<')) return { err: 'NOT_FOUND' };          // 200 + HTML = no such series
    const rows = t.trim().split('\n').slice(1)
      .map(l => l.split(','))
      .filter(a => a[1] && a[1] !== '.' && a[1].trim() !== '');
    const last = rows.at(-1)?.[0];
    if (!last) return { err: 'EMPTY' };
    // Spacing of the final two observations, so a quarterly series is not mistaken
    // for a lagging monthly one.
    let spacingDays = null;
    if (rows.length >= 2) {
      spacingDays = Math.round((Date.parse(rows.at(-1)[0]) - Date.parse(rows.at(-2)[0])) / 864e5);
    }
    return { last, spacingDays, n: rows.length };
  } catch {
    if (attempt < RETRIES) { await sleep(1500 * (attempt + 1)); return check(id, attempt + 1); }
    return { err: 'FETCH_FAIL' };
  }
}

const ids = collectIds();
const all = [...ids.keys()].sort();
process.stderr.write(`checking ${all.length} series across ${ENGINES.length} engines…\n`);

const results = [];
let cursor = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (cursor < all.length) {
    const id = all[cursor++];
    const r = await check(id);
    const ageDays = r.last ? Math.round((Date.now() - Date.parse(r.last)) / 864e5) : null;
    results.push({ id, ...r, ageDays, engines: [...ids.get(id)].sort().join(',') });
  }
}));

const cadence = s => (s == null ? '?' : s > 200 ? 'annual' : s > 45 ? 'quarterly' : s > 10 ? 'monthly' : 'daily/weekly');
const inconclusive = results.filter(r => r.err === 'THROTTLED' || r.err === 'FETCH_FAIL');
const dead  = results.filter(r => (r.err && r.err !== 'THROTTLED' && r.err !== 'FETCH_FAIL') || r.ageDays > DEAD_DAYS).sort((a, b) => (b.ageDays ?? 1e9) - (a.ageDays ?? 1e9));
const watch = results.filter(r => !r.err && r.ageDays > WATCH_DAYS && r.ageDays <= DEAD_DAYS).sort((a, b) => b.ageDays - a.ageDays);

const mo = d => (d / 30.44).toFixed(0) + 'mo';
// Healthy is counted POSITIVELY, from series that actually returned an observation
// date -- never as "everything minus the problems". The subtractive version shipped
// briefly and reported "103 healthy, 0 DEAD" on a run where all 103 were throttled
// and nothing had been learned about any of them. An audit that cannot reach its
// source must say so, not report a clean bill of health.
const healthy = results.filter(r => !r.err && r.ageDays <= WATCH_DAYS);
console.log(`\n${results.length} series - ${healthy.length} healthy, ${watch.length} to watch, ${dead.length} DEAD, ${inconclusive.length} inconclusive\n`);
if (inconclusive.length === results.length) {
  console.log('EVERY series was unreachable - FRED is throttling this IP. This run proves');
  console.log('NOTHING about series health. Wait a few minutes and re-run.\n');
}
if (dead.length) {
  console.log('DEAD or missing — these score a frozen print forever and never error:');
  for (const r of dead) {
    console.log(`  ${r.id.padEnd(22)} ${(r.err ?? `${mo(r.ageDays)}  last ${r.last}`).padEnd(26)} ${r.engines}`);
  }
  console.log('');
}
if (watch.length) {
  console.log(`Older than ${WATCH_DAYS}d — check the cadence column before assuming anything is wrong:`);
  for (const r of watch) {
    console.log(`  ${r.id.padEnd(22)} ${`${mo(r.ageDays)}  last ${r.last}`.padEnd(26)} ${cadence(r.spacingDays).padEnd(12)} ${r.engines}`);
  }
  console.log('');
}
if (process.argv[2]) {
  fs.writeFileSync(process.argv[2], JSON.stringify(results, null, 1));
  console.log(`wrote ${process.argv[2]}`);
}
// Non-zero when something is dead OR when the run could not establish health, so a
// throttled run fails loudly in CI instead of passing as "nothing found".
process.exit((dead.length || inconclusive.length) ? 1 : 0);
