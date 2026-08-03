// INGEST — sweep TSVs -> buildOIEntry -> KV.
//
//   node ingest.mjs --dir out/2026-07-31/quikstrike            (dry run, writes nothing)
//   node ingest.mjs --dir out/2026-07-31/quikstrike --write    -> oi_store_py (shadow)
//   node ingest.mjs --dir … --write --key oi_store             -> the REAL key
//
// WHY IT IMPORTS js/oi.js. The derived entry is ~45 fields of option maths -
// max pain, walls, GEX profile, gamma/gex flips, charm/vanna, refMove, the
// full-book DTE-weighted GEX. Reimplementing any of that here would be a second
// copy free to drift from the one the dashboard uses, which is the failure
// TRADABILITY_REVIEW.md documents. So this calls buildOIEntry, the same function
// the modal calls, and the vendor-oracle test keeps guarding both.
//
// DEFAULTS TO THE SHADOW KEY, and to a dry run. oi_store is what the bots read;
// nothing should reach it until the shadow has been compared for a few sessions.
//
// COMPLETENESS IS THE RISK, not malformed data. A half-built entry does not
// error - oiStoreToLevels simply returns nothing and the bots see a pair with no
// OI levels. So every entry is checked for the fields that actually drive levels
// before it is allowed into the payload.
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { buildOIEntry } from '../js/oi.js';

const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf(n); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const has = n => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };

const dir   = flag('--dir');
const base  = flag('--base', 'https://macrofxmodel-production.up.railway.app');
const keyArg = flag('--key', null);          // explicit override; else ask the server
const write = has('--write');
if (!dir || !existsSync(dir)) { console.error('usage: node ingest.mjs --dir <sweep dir> [--write] [--key oi_store_py]'); process.exit(2); }

// WHERE TO PUBLISH is a server-side setting (`oi_auto_target`, toggled in the OI
// modal), not a flag baked into the scheduled task. The scraper runs on a machine
// that may be unattended for weeks; handing the feed back to manual pasting has to
// be possible from a phone, without editing the command line the scheduler runs.
//
// An explicit --key still wins, for one-off manual runs.
//
// UNREACHABLE MEANS SHADOW. If the setting cannot be read we must not fall through
// to the live key: "the server was down so we wrote to the bots' input anyway" is
// the exact failure this switch exists to make impossible. Refusing is not an
// option either — that would drop a capture that CME will not serve again — so it
// degrades to the shadow and says so loudly.
async function resolveKey() {
  if (keyArg) return { key: keyArg, why: 'explicit --key' };
  try {
    const r = await fetch(`${base}/api/oi/auto-target`);
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return { key: j.live ? 'oi_store' : 'oi_store_py',
             why: j.live ? 'oi_auto_target = LIVE' : 'oi_auto_target = shadow' };
  } catch (e) {
    return { key: 'oi_store_py', why: `setting unreadable (${e.message}) - DEFAULTED TO SHADOW`, degraded: true };
  }
}

const target = await resolveKey();
const key = target.key;

// Fields without which the entry is useless downstream. Checked explicitly
// because their absence is silent: oiStoreToLevels just yields no levels.
const REQUIRED = ['maxPain', 'callWall', 'putWall', 'exposures', 'gexProfile', 'topLevels', 'spot'];

// filename stem -> dashboard symbol. safe_name() is not reversible ('EUR/USD' and
// 'EUR_USD' both flatten to 'EUR_USD'), so map explicitly rather than guess.
const SYMS = {
  EUR_USD: 'EUR/USD', GBP_USD: 'GBP/USD', USD_JPY: 'USD/JPY', AUD_USD: 'AUD/USD',
  USD_CAD: 'USD/CAD', USD_CHF: 'USD/CHF', XAU_USD: 'XAU/USD',
  NAS100_USD: 'NAS100_USD', SPX500_USD: 'SPX500_USD', US30_USD: 'US30_USD',
  US2000_USD: 'US2000_USD', DE30_USD: 'DE30_USD',
};

const stems = [...new Set(readdirSync(dir)
  .filter(f => /_(rawOI|rawChg|rawVol|rawIVTerm|rawIV)\.tsv$/.test(f))
  .map(f => f.replace(/_(rawOI|rawChg|rawVol|rawIVTerm|rawIV)\.tsv$/, '')))];

const rd = (stem, box) => { try { return readFileSync(join(dir, `${stem}_${box}.tsv`), 'utf8'); } catch { return ''; } };

// INHERIT THE PER-PAIR SETTINGS. numLevels and minOI are tuned per instrument in
// the modal and stored with the entry; defaulting them here silently changes the
// output. US30 proved it: its whole book is ~50 lots, so the default minOI of 20
// rejected every strike and the walls came out 0/0 while the real entry had them.
// Read the live oi_store once and carry each pair's own settings across.
let liveStore = {};
try {
  const j = await (await fetch(`${base}/api/kv/get?key=oi_store`)).json();
  if (!j.miss && j.data) liveStore = j.data;
  console.log(`  (inherited per-pair numLevels/minOI from oi_store for ${Object.keys(liveStore).length} pair(s))\n`);
} catch {
  console.log('  (could not read oi_store - falling back to module defaults)\n');
}

// PRIOR ENTRY IS A DIFFERENT QUESTION FROM SETTINGS, and must come from whichever
// key this run is actually writing. `priorEntry` carries the per-expiry history that
// makes day-over-day OI change meaningful, so it has to chain against yesterday's
// entry in the SAME series. Taking it from oi_store while writing the shadow would
// compare every day against a manual paste that stops moving the moment the pastes
// stop - which is precisely what happens during an unattended run, and it would
// show up as plausible-looking but fabricated OI deltas rather than as an error.
let priorStore = liveStore;
if (key !== 'oi_store') {
  try {
    const j = await (await fetch(`${base}/api/kv/get?key=${key}`)).json();
    priorStore = (!j.miss && j.data) ? j.data : {};
    console.log(`  (chaining day-over-day history against ${key}: ${Object.keys(priorStore).length} prior entry/entries)\n`);
  } catch {
    priorStore = {};
    console.log(`  (could not read ${key} - no prior entries, day-over-day deltas start fresh)\n`);
  }
}

console.log(`\nINGEST  ${dir}  ->  ${write ? `KV '${key}' at ${base}` : 'DRY RUN (nothing written)'}\n`);
console.log('  sym          strikes  maxPain      callWall     putWall      complete');

const payload = {};
let bad = 0;
for (const stem of stems.sort()) {
  const sym = SYMS[stem];
  if (!sym) { console.log(`  ${stem.padEnd(12)} no symbol mapping - skipped`); bad++; continue; }
  const rawOI = rd(stem, 'rawOI');
  if (!rawOI.trim()) { console.log(`  ${sym.padEnd(12)} no rawOI - skipped`); bad++; continue; }

  let r;
  try {
    const settings = liveStore[sym] || null;      // human-tuned, always from oi_store
    const prior = priorStore[sym] || null;        // yesterday in the SAME series (see above)
    r = await buildOIEntry({
      pair: sym, rawOI, rawChg: rd(stem, 'rawChg'), rawVol: rd(stem, 'rawVol'),
      rawIV: rd(stem, 'rawIV'), rawIVTerm: rd(stem, 'rawIVTerm'), baseUrl: base,
      numLevels: settings?.numLevels, minOI: settings?.minOI,
      swapCP: !!settings?.cpSwapped,   // the inverted-pair call/put flip is a per-pair choice
      priorEntry: prior,               // carries the per-expiry history forward
    });
  } catch (e) { console.log(`  ${sym.padEnd(12)} threw: ${e.message}`); bad++; continue; }
  if (r.error) { console.log(`  ${sym.padEnd(12)} ${r.error}`); bad++; continue; }

  const missing = REQUIRED.filter(k => r.inst[k] === undefined || r.inst[k] === null);
  const ok = missing.length === 0;
  console.log(`  ${sym.padEnd(12)} ${String(r.parsed.strikes.length).padEnd(8)} `
    + `${String(r.inst.maxPain).padEnd(12)} ${String(r.inst.callWall).padEnd(12)} `
    + `${String(r.inst.putWall).padEnd(12)} ${ok ? 'yes' : 'NO: ' + missing.join(',')}`);
  if (!ok) { bad++; continue; }          // never ship a partial entry
  payload[sym] = r.inst;
}

console.log(`\n  ${Object.keys(payload).length} complete · ${bad} skipped`);
// Say where this is going BEFORE the write, and say it whether or not --write is
// set, so a dry run still reveals which key a real run would have touched.
console.log(`  target: ${key}${key === 'oi_store' ? '  ** LIVE - the bots read this **' : '  (shadow)'}  [${target.why}]`);
if (target.degraded) console.log('  NOTE: could not confirm the live/shadow setting; wrote the shadow to be safe.');
if (!write) { console.log('\n  Dry run. Re-run with --write to publish.'); process.exit(bad ? 1 : 0); }
if (!Object.keys(payload).length) { console.error('\n  nothing complete to write'); process.exit(1); }

// UNION-MERGE, mirroring oiSaveStore: a pair this run did not produce must not be
// deleted by omission. Same reason the modal merges rather than overwrites.
let existing = {};
try {
  const j = await (await fetch(`${base}/api/kv/get?key=${key}`)).json();
  if (!j.miss && j.data) existing = j.data;
} catch { /* first write */ }
const merged = { ...existing, ...payload };

const res = await fetch(`${base}/api/kv/set`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key, data: merged, timestamp: Date.now() }),
});
const out = await res.json().catch(() => ({}));
console.log(`\n  POST /api/kv/set ${key} -> HTTP ${res.status} ${JSON.stringify(out)}`);
if (!res.ok || out.ok === false) { console.error('  WRITE FAILED'); process.exit(1); }
console.log(`  wrote ${Object.keys(merged).length} pair(s) (${Object.keys(payload).length} refreshed this run)`);
