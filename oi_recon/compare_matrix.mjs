// PASTE vs FETCH — do they describe the same book?
//
//   node compare_matrix.mjs --kv "EUR/USD" out/2026-07-30/fetch/EUR_USD_oi_matrix.tsv
//   node compare_matrix.mjs pasted.tsv fetched.tsv
//   --base http://localhost:3000     dashboard to read oi_store from (default this)
//
// The pasted table is read straight out of KV (`oi_store[pair].rawOI`), so you just
// paste as normal in the morning and this pulls what you pasted. No second copy.
//
// WHY NOT A NAIVE DIFF. A paste carries EVERY expiry; the fetch carries the nearest
// N. Aggregate totals therefore cannot match, and comparing them would manufacture
// a failure. The honest comparison is per-strike open interest on the SAME expiry
// code — that is the column that actually produces the walls and max pain.
//
// Both sides go through the real js/oi.js parser, never a reimplementation, so this
// compares the numbers the dashboard would actually use.
import { readFileSync } from 'fs';
import { parseOIMatrix, oiMatrixTermStructure, oiCalcMaxPain } from '../js/oi.js';

const argv = process.argv.slice(2);
const flag = (name, dflt = null) => {
  const i = argv.indexOf(name);
  if (i < 0) return dflt;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const base = flag('--base', 'http://localhost:3000');
const kvPair = flag('--kv');
const files = argv.filter(a => !a.startsWith('--'));

async function pastedRaw() {
  if (!kvPair) {
    if (files.length < 2) die('need <pasted.tsv> <fetched.tsv>, or --kv "EUR/USD" <fetched.tsv>');
    return { raw: readFileSync(files[0], 'utf8'), from: files[0] };
  }
  const r = await fetch(`${base}/api/kv/get?key=oi_store`);
  if (!r.ok) die(`KV read failed: HTTP ${r.status} from ${base}`);
  const j = await r.json();
  if (j.miss) die('oi_store is empty in KV — paste in the dashboard first');
  const e = j.data?.[kvPair] ?? j.data?.[kvPair.replace('/', '_')];
  if (!e) die(`no entry for ${kvPair}. Present: ${Object.keys(j.data || {}).join(', ') || '(none)'}`);
  if (!e.rawOI) die(`${kvPair} has no rawOI stored (localStorage may have trimmed it)`);
  return { raw: e.rawOI, from: `KV oi_store[${kvPair}] savedAt ${e.savedAt ?? '?'}` };
}

function die(msg) { console.error('compare: ' + msg); process.exit(2); }

const fmt = n => (Number.isFinite(n) ? n.toLocaleString() : '-');

const { raw: pRaw, from } = await pastedRaw();
const fRaw = readFileSync(files[files.length - 1], 'utf8');

const P = parseOIMatrix(pRaw), F = parseOIMatrix(fRaw);
if (!P) die(`pasted table did not parse (${from})`);
if (!F) die('fetched table did not parse');

console.log(`PASTED : ${from}`);
console.log(`FETCHED: ${files[files.length - 1]}\n`);

const line = (label, a, b) => {
  const same = String(a) === String(b);
  console.log(`  ${same ? 'ok  ' : 'DIFF'}  ${label.padEnd(22)} paste=${String(a).padEnd(14)} fetch=${b}`);
  return same;
};

let bad = 0;
const pCode = P.primaryExpiry?.code ?? '-', fCode = F.primaryExpiry?.code ?? '-';
if (!line('primary expiry', pCode, fCode)) {
  console.log('        ^ different primary expiry. Per-strike numbers below are NOT');
  console.log('          comparable; raise --expiries on the fetch so the paste\'s');
  console.log('          primary column is included, then re-run.');
  bad++;
}

const wall = m => arr => m.strikes[arr.indexOf(Math.max(...arr))];
// Strike count is informational: the two sides legitimately trim empty tails
// differently, so a difference here is not a disagreement about the book.
console.log(`  info  ${'strike count'.padEnd(22)} paste=${String(P.strikes.length).padEnd(14)} fetch=${F.strikes.length}`);
if (!line('call wall', wall(P)(P.calls), wall(F)(F.calls))) bad++;
if (!line('put wall', wall(P)(P.puts), wall(F)(F.puts))) bad++;
if (!line('max pain', oiCalcMaxPain(P.strikes, P.calls, P.puts),
                      oiCalcMaxPain(F.strikes, F.calls, F.puts))) bad++;
// Futures anchor is NOT counted: the paste carries QuikStrike's live/settle price
// and the fetch has none unless supplied, so a difference is expected by design.
console.log(`  info  ${'futures anchor'.padEnd(22)} paste=${String(P.futures ?? '-').padEnd(14)} fetch=${F.futures ?? '-'}`);

// ── Per-strike OI on the primary column ─────────────────────────────────────
if (pCode === fCode) {
  const pm = new Map(P.strikes.map((k, i) => [k, [P.calls[i], P.puts[i]]]));
  const fm = new Map(F.strikes.map((k, i) => [k, [F.calls[i], F.puts[i]]]));
  const all = [...new Set([...pm.keys(), ...fm.keys()])].sort((a, b) => a - b);
  const onlyP = all.filter(k => pm.has(k) && !fm.has(k));
  const onlyF = all.filter(k => fm.has(k) && !pm.has(k));
  const shared = all.filter(k => pm.has(k) && fm.has(k));
  const diffs = shared.filter(k => pm.get(k)[0] !== fm.get(k)[0] || pm.get(k)[1] !== fm.get(k)[1]);

  console.log(`\n  per-strike on ${pCode}: ${shared.length} shared · `
            + `${onlyP.length} paste-only · ${onlyF.length} fetch-only`);
  console.log(`  ${diffs.length ? 'DIFF' : 'ok  '}  ${diffs.length}/${shared.length} shared strikes disagree`);
  for (const k of diffs.slice(0, 12)) {
    const [pc, pp] = pm.get(k), [fc, fp] = fm.get(k);
    console.log(`          ${k}   C ${fmt(pc)} vs ${fmt(fc)}   P ${fmt(pp)} vs ${fmt(fp)}`);
  }
  if (diffs.length > 12) console.log(`          ... and ${diffs.length - 12} more`);
  if (diffs.length) bad++;
  // Strikes present in one only are usually the zero-OI tails one side trims —
  // worth showing, not worth failing on.
  if (onlyP.length || onlyF.length)
    console.log(`  info  strike-set differences are typically empty tails: `
              + `paste-only ${onlyP.slice(0, 4).join(', ')}${onlyP.length > 4 ? '…' : ''} | `
              + `fetch-only ${onlyF.slice(0, 4).join(', ')}${onlyF.length > 4 ? '…' : ''}`);
}

// ── Term structure, for context ─────────────────────────────────────────────
const pt = oiMatrixTermStructure(pRaw) || [], ft = oiMatrixTermStructure(fRaw) || [];
console.log(`\n  term structure: paste has ${pt.length} live expiries, fetch has ${ft.length}`);
console.log('        dte     paste(maxPain/totalOI)          fetch(maxPain/totalOI)');
for (let i = 0; i < Math.max(pt.length, ft.length) && i < 10; i++) {
  const a = pt[i], b = ft[i];
  const s = x => x ? `${String(x.maxPain).padEnd(10)} ${fmt(x.totalOI).padEnd(12)}` : '-'.padEnd(23);
  console.log(`        ${String(a?.dte ?? b?.dte ?? '-').padEnd(6)}  ${s(a)}   ${s(b)}`);
}

console.log(bad ? `\n${bad} disagreement(s) — do not switch the source over yet.`
                : '\nAgreement on every compared field.');
process.exit(bad ? 1 : 0);
