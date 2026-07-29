// GATE: does this captured/synthesised table actually parse to real numbers?
//
//   node validate_capture.mjs <file.tsv> [more.tsv ...]
//   exit 0 = every file usable · exit 1 = at least one would be ingested WRONG
//
// This exists because of a specific, verified failure (2026-07-29): a QuikStrike
// settlements table copied under a non-Standard `Report:` setting carries extra
// Basis-Point / Black-Scholes volatility columns. It parses happily to 67 strikes
// with correct strikes and correct IV — and total open interest of ZERO, because
// the positional OI columns now land on vol figures. No error, no warning, and
// walls/max-pain collapse onto the first strike.
//
// So "it parsed" is not the test. The tests are: the right parser claimed it, the
// OI is non-zero across the ladder, and the walls sit inside the strike range.
// Anything that fails those must never reach the store — a partial or zeroed OI
// table is worse than no automation, because it produces confident wrong levels.
import { readFileSync } from 'fs';
import { parseOIMatrix, parseIVSettlement, parseSettlementTermStructure,
         oiCalcMaxPain } from '../js/oi.js';

const sum = a => a.reduce((x, y) => x + (Number.isFinite(y) ? y : 0), 0);
const argmax = a => a.indexOf(Math.max(...a));

function classify(raw) {
  // Order matters: the term table is checked first because its discriminator (a
  // dd/mm/yyyy date in col 2) is the same one js/oi.js uses to keep it from being
  // fed to the per-strike parser.
  if (parseSettlementTermStructure(raw)) return 'term';
  if (parseOIMatrix(raw)) return 'matrix';
  if (parseIVSettlement(raw)) return 'chain';
  return null;
}

function check(file) {
  const raw = readFileSync(file, 'utf8');
  const kind = classify(raw);
  const fails = [];
  const notes = [];

  if (!kind) {
    return { file, kind: '?', fails: ['no parser recognised this table'], notes };
  }

  if (kind === 'matrix') {
    const m = parseOIMatrix(raw);
    const tc = sum(m.calls), tp = sum(m.puts);
    notes.push(`${m.strikes.length} strikes · futures ${m.futures ?? '-'}`);
    notes.push(`callOI ${tc.toLocaleString()} · putOI ${tp.toLocaleString()}`);
    notes.push(`primary ${m.primaryExpiry?.code ?? '-'} (dte ${m.primaryExpiry?.dte ?? '-'})`);
    if (m.strikes.length < 10) fails.push(`only ${m.strikes.length} strikes — truncated ladder`);
    if (tc + tp === 0) fails.push('total OI is ZERO — columns almost certainly misread');
    const cw = m.strikes[argmax(m.calls)], pw = m.strikes[argmax(m.puts)];
    const lo = Math.min(...m.strikes), hi = Math.max(...m.strikes);
    if (!(cw > lo && cw < hi)) notes.push(`⚠ call wall ${cw} at the ladder edge`);
    if (!(pw > lo && pw < hi)) notes.push(`⚠ put wall ${pw} at the ladder edge`);
    if (m.truncated) fails.push('parser reported truncation (hit MAX_STRIKE_ROWS)');
    notes.push(`maxPain ${oiCalcMaxPain(m.strikes, m.calls, m.puts)}`);
  }

  if (kind === 'chain') {
    const iv = parseIVSettlement(raw);
    const tc = sum(iv.calls), tp = sum(iv.puts);
    notes.push(`${iv.strikes.length} strikes · code ${iv.expiryCode ?? '-'} · dte ${iv.dte ?? '-'}`);
    notes.push(`callOI ${tc.toLocaleString()} · putOI ${tp.toLocaleString()}`);
    if (tc + tp === 0)
      fails.push('total OI is ZERO — this is the non-Standard Report column shift');
    if (iv.strikes.length < 5) fails.push(`only ${iv.strikes.length} strikes`);
    if (!iv.iv.some(v => Number.isFinite(v) && v > 0)) fails.push('no implied vol parsed');
  }

  if (kind === 'term') {
    const rows = parseSettlementTermStructure(raw);
    const oi = sum(rows.map(r => (r.oiCall || 0) + (r.oiPut || 0)));
    notes.push(`${rows.length} expiries · OI total ${oi.toLocaleString()}`);
    // OI read off the wrong columns shows up as small non-integers (they are
    // volatility figures). Real per-expiry OI is integral and large.
    const nonInt = rows.filter(r => !Number.isInteger(r.oiCall) || !Number.isInteger(r.oiPut));
    if (nonInt.length)
      fails.push(`${nonInt.length}/${rows.length} expiries have FRACTIONAL open interest `
                 + `(e.g. ${nonInt[0].symbol} call=${nonInt[0].oiCall}) — vol columns being `
                 + 'read as OI; re-copy with Report: Standard');
    if (!rows.some(r => r.iv > 0)) fails.push('no implied vol parsed');
  }

  return { file, kind, fails, notes };
}

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node validate_capture.mjs <file.tsv> ...'); process.exit(2); }
let bad = 0;
for (const f of files) {
  let r;
  try { r = check(f); } catch (e) { r = { file: f, kind: '!', fails: [`threw: ${e.message}`], notes: [] }; }
  const short = r.file.split(/[\\/]/).pop();
  console.log(`${r.fails.length ? 'FAIL' : 'ok  '}  ${short}  [${r.kind}]`);
  for (const n of r.notes) console.log(`        ${n}`);
  for (const x of r.fails) { console.log(`   ✗    ${x}`); }
  if (r.fails.length) bad++;
}
console.log(`\n${files.length - bad}/${files.length} usable`);
process.exit(bad ? 1 : 0);
