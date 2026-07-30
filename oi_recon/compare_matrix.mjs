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
import { parseOIMatrix, oiMatrixTermStructure, oiCalcMaxPain,
         oiParseVolume } from '../js/oi.js';

const argv = process.argv.slice(2);
const flag = (name, dflt = null) => {
  const i = argv.indexOf(name);
  if (i < 0) return dflt;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
// Defaults to the deployed dashboard, because that is where the morning paste
// actually lands. Pass --base http://localhost:3000 when running a local server.
const base = flag('--base', 'https://macrofxmodel-production.up.railway.app');
const kvPair = flag('--kv');
const files = argv.filter(a => !a.startsWith('--'));

const allDir = flag('--all');

async function kvStore() {
  let r;
  try {
    r = await fetch(`${base}/api/kv/get?key=oi_store`);
  } catch (e) {
    die(`cannot reach ${base} (${e.cause?.code || e.message}).\n`
      + '        Start the dashboard locally and pass --base http://localhost:3000,\n'
      + '        or pass the pasted table as a file instead.');
  }
  if (!r.ok) die(`KV read failed: HTTP ${r.status} from ${base}`);
  const j = await r.json();
  if (j.miss || !j.data) die('oi_store is empty in KV');
  return j.data;
}

// ── --all: every fetched instrument against its paste, one summary table ─────
if (allDir) {
  const { readdirSync, existsSync } = await import('fs');
  const { join } = await import('path');
  if (!existsSync(allDir)) die(`no such directory: ${allDir}`);
  const store = await kvStore();
  // Prefer the manifest's symbol: safe_name() is not reversible ('EUR/USD' and
  // 'EUR_USD' both flatten the same way), so guessing it back from the filename
  // would silently mis-pair instruments.
  // BOTH automated boxes get compared. Checking only the OI matrix would leave
  // the volume matrix asserted-but-unverified, which is the kind of half-claim
  // this whole exercise exists to avoid.
  const FIELD = { oi: 'rawOI', vol: 'rawVol' };
  let entries = [];
  const mf = join(allDir, 'fetch_manifest.json');
  if (existsSync(mf)) {
    const m = JSON.parse(readFileSync(mf, 'utf8'));
    entries = (m.files || []).filter(f => FIELD[f.kind] && f.sym)
                             .map(f => ({ file: join(allDir, f.file), sym: f.sym, kind: f.kind }));
  }
  if (!entries.length) {                       // older manifest, or none: fall back
    for (const f of readdirSync(allDir).filter(x => /_(oi|vol)_matrix\.tsv$/.test(x))) {
      const kind = f.includes('_vol_matrix') ? 'vol' : 'oi';
      const stem = f.replace(/_(oi|vol)_matrix\.tsv$/, '');
      const sym = store[stem] ? stem
                : store[stem.replace('_', '/')] ? stem.replace('_', '/') : null;
      if (sym) entries.push({ file: join(allDir, f), sym, kind });
      else console.log(`  (skip ${f} — no matching oi_store entry)`);
    }
  }
  entries.sort((a, b) => a.sym.localeCompare(b.sym) || a.kind.localeCompare(b.kind));
  if (!entries.length) die('nothing to compare — no fetched *_oi_matrix.tsv matched a paste');

  console.log(`\nPASTE vs FETCH — ${entries.length} table(s), KV at ${base}\n`);
  console.log('  sym          box  primary(paste/fetch)   maxPain        callWall       putWall        per-strike');
  let anyBad = 0;
  for (const { file, sym, kind } of entries) {
    const e = store[sym];
    const raw = e?.[FIELD[kind]];
    if (!raw) { console.log(`  ${sym.padEnd(12)} ${kind.padEnd(4)} no ${FIELD[kind]} in KV — skipped`); continue; }
    const fetched = readFileSync(file, 'utf8');

    // VOLUME is stored differently and must be compared differently. oiAnalyse
    // writes `rawVol` as a COMPACTED 'strike<TAB>volume' list (js/oi.js:1676),
    // not the pasted heatmap — so parseOIMatrix can never read it. Both sides go
    // through oiParseVolume instead, which aggregates call+put across expiries;
    // that is the same brick the dashboard uses, so this compares its numbers.
    if (kind === 'vol') {
      const pv = oiParseVolume(raw), fv = oiParseVolume(fetched);
      if (!pv.length || !fv.length) {
        console.log(`  ${sym.padEnd(12)} vol  ${!pv.length ? 'PASTE' : 'FETCH'} yielded no volume rows`);
        anyBad++; continue;
      }
      const pm = new Map(pv.map(v => [v.strike, v.volume]));
      const fm = new Map(fv.map(v => [v.strike, v.volume]));
      const shared = [...pm.keys()].filter(k => fm.has(k));
      const same = shared.filter(k => pm.get(k) === fm.get(k)).length;
      const tot = a => a.reduce((s, v) => s + v.volume, 0);
      const note = shared.length ? `${same}/${shared.length} match` : 'no shared strikes';
      const bad = shared.length === 0 || same < shared.length;
      console.log(`  ${sym.padEnd(12)} vol  top ${String(pv[0].strike)}/${String(fv[0].strike)}`.padEnd(40)
        + ` total ${tot(pv).toLocaleString()}/${tot(fv).toLocaleString()}`.padEnd(30) + ` ${note}`);
      if (bad) anyBad++;
      continue;
    }

    const P = parseOIMatrix(raw), F = parseOIMatrix(fetched);
    if (!P || !F) {
      console.log(`  ${sym.padEnd(12)} ${kind.padEnd(4)} ${!P ? 'PASTE' : 'FETCH'} did not parse`);
      anyBad++; continue;
    }
    const w = m => a => m.strikes[a.indexOf(Math.max(...a))];
    const pc = P.primaryExpiry?.code ?? '-', fc = F.primaryExpiry?.code ?? '-';
    const mpP = oiCalcMaxPain(P.strikes, P.calls, P.puts);
    const mpF = oiCalcMaxPain(F.strikes, F.calls, F.puts);
    let strikeNote = 'n/a (diff expiry)';
    if (pc === fc && pc !== '-') {
      const pm = new Map(P.strikes.map((k, i) => [k, [P.calls[i], P.puts[i]]]));
      const fm = new Map(F.strikes.map((k, i) => [k, [F.calls[i], F.puts[i]]]));
      const shared = [...pm.keys()].filter(k => fm.has(k));
      const diff = shared.filter(k => pm.get(k)[0] !== fm.get(k)[0] || pm.get(k)[1] !== fm.get(k)[1]);
      strikeNote = `${shared.length - diff.length}/${shared.length} match`;
      if (diff.length) anyBad++;
    }
    const cell = (a, b) => `${String(a)}/${String(b)}`.padEnd(14);
    const flagIf = (a, b) => (String(a) === String(b) ? ' ' : '*');
    console.log(`  ${sym.padEnd(12)} ${kind.padEnd(4)} ${cell(pc, fc)}${flagIf(pc, fc)} `
      + `${cell(mpP, mpF)}${flagIf(mpP, mpF)} `
      + `${cell(w(P)(P.calls), w(F)(F.calls))}${flagIf(w(P)(P.calls), w(F)(F.calls))} `
      + `${cell(w(P)(P.puts), w(F)(F.puts))}${flagIf(w(P)(P.puts), w(F)(F.puts))} ${strikeNote}`);
    if (mpP !== mpF) anyBad++;
  }
  console.log('\n  * = differs. Per-strike is only compared when both sides chose the');
  console.log('    SAME primary expiry; otherwise the columns are not comparable and');
  console.log('    you should raise --expiries on the fetch, not read a mismatch into it.');
  console.log(anyBad ? `\n${anyBad} disagreement(s) — inspect with a single-pair run.`
                     : '\nEvery compared instrument agrees.');
  process.exit(anyBad ? 1 : 0);
}

async function pastedRaw() {
  if (!kvPair) {
    if (files.length < 2) die('need <pasted.tsv> <fetched.tsv>, or --kv "EUR/USD" <fetched.tsv>');
    return { raw: readFileSync(files[0], 'utf8'), from: files[0] };
  }
  // A refused connection here used to surface as an unhandled TypeError and a node
  // stack trace, which reads like a broken script rather than "nothing is serving
  // that port". Say what happened and what to do instead.
  let r;
  try {
    r = await fetch(`${base}/api/kv/get?key=oi_store`);
  } catch (e) {
    die(`cannot reach ${base} (${e.cause?.code || e.message}).\n`
      + '        Either start the dashboard locally, or point at the deployed one:\n'
      + '          --base https://macrofxmodel-production.up.railway.app\n'
      + '        Or skip KV entirely and pass the pasted table as a file:\n'
      + '          node compare_matrix.mjs pasted.tsv fetched.tsv');
  }
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
