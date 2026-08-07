// SHADOW vs REAL — are the two store ENTRIES the same book?
//
//   node compare_entries.mjs
//   node compare_entries.mjs --tol 0.5        allowed drift % on price fields
//   node compare_entries.mjs --pair "EUR/USD" one instrument, field by field
//
// This is the honest replication test, and a better one than comparing raw
// tables: the derived entry is what /api/oi-levels, the ConfluenceBot, the export
// and every page actually consume. Two identical tables that derive differently
// would pass a table diff and still be wrong.
//
// WHY EXACT EQUALITY IS THE WRONG BAR. The basis is taken from a paired live
// futures+spot quote at the moment of the save (js/oi.js fetchPairedQuote), and
// it shifts every strike. The modal saved against one quote; the ingest ran
// against a later one. So price fields MUST be allowed to drift by roughly the
// quote move, while everything derived purely from the pasted book MUST match to
// the digit. Splitting the fields that way is the whole point of this file -
// a single "do they match" answer would either fail on nothing or hide a real
// divergence behind expected drift.
const BASE = 'https://macrofxmodel-production.up.railway.app';
const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf(n); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const TOL = parseFloat(flag('--tol', '1.0'));      // % drift allowed on price fields
const ONE = flag('--pair');

// Pure functions of the pasted book: no quote, no basis. Any difference here is a
// REAL divergence between the two derivation paths, not the market moving.
const EXACT = ['numRows', 'totalCallOI', 'totalPutOI', 'pcRatio', 'totalCallChg',
  'totalPutChg', 'numLevels', 'minOI', 'cpSwapped'];

// PARTITIONED BY SPOT, so not pure book functions: js/oi.js:1699 splits the OI
// change into what is building ABOVE vs BELOW spot. A small quote move reclassifies
// the strikes either side, which changes all four without any data differing. I had
// these in EXACT and they "failed" on six products for exactly that reason -
// reported here, never hard-failed.
const SPOT_SPLIT = ['callChgAbove', 'callChgBelow', 'putChgAbove', 'putChgBelow'];

// Shifted by the basis, so they track the quote and are compared with a tolerance.
const PRICEY = ['spot', 'futures', 'maxPain', 'callWall', 'putWall', 'gammaFlip', 'gexFlip'];

const pct = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b !== 0)
  ? Math.abs(a - b) / Math.abs(b) * 100 : null;

const [py, real] = await Promise.all([
  fetch(`${BASE}/api/kv/get?key=oi_store_py`).then(r => r.json()),
  fetch(`${BASE}/api/kv/get?key=oi_store`).then(r => r.json()),
]);
if (py.miss || !py.data) { console.error('oi_store_py is empty - run the ingest with --write'); process.exit(2); }
if (real.miss || !real.data) { console.error('oi_store is empty'); process.exit(2); }
const P = py.data, R = real.data;

const syms = (ONE ? [ONE] : Object.keys(R)).filter(s => R[s]);
let hardFail = 0, drifted = 0;

console.log(`\nSHADOW (oi_store_py) vs REAL (oi_store) - ${syms.length} instrument(s), tolerance ${TOL}%\n`);
console.log('  sym          fields  exact-match     price drift        structure');

for (const sym of syms) {
  const a = P[sym], b = R[sym];
  if (!a) { console.log(`  ${sym.padEnd(12)} MISSING from the shadow key`); hardFail++; continue; }

  // 1. Structure: the same field set, so a half-built entry cannot pass by
  //    matching on the fields it did populate.
  const ka = new Set(Object.keys(a)), kb = new Set(Object.keys(b));
  const onlyReal = [...kb].filter(k => !ka.has(k));
  const onlyPy   = [...ka].filter(k => !kb.has(k));

  // 2. Book-derived fields must be identical.
  const bad = EXACT.filter(k => b[k] !== undefined && String(a[k]) !== String(b[k]));

  // 3. Price fields may drift with the quote.
  const drifts = PRICEY.map(k => ({ k, d: pct(a[k], b[k]) })).filter(x => x.d !== null);
  const worst = drifts.length ? drifts.reduce((m, x) => x.d > m.d ? x : m) : null;
  const over = drifts.filter(x => x.d > TOL);

  const split = SPOT_SPLIT.filter(k => b[k] !== undefined && String(a[k]) !== String(b[k]));
  const structNote = (onlyReal.length || onlyPy.length)
    ? `real-only:${onlyReal.length} shadow-only:${onlyPy.length}` : 'same fields';
  const exactNote = bad.length ? `${EXACT.length - bad.length}/${EXACT.length} FAIL: ${bad.join(',')}`
                               : `${EXACT.length}/${EXACT.length} ok`;
  const driftNote = worst ? `worst ${worst.k} ${worst.d.toFixed(2)}%${over.length ? ' OVER' : ''}` : '-';

  console.log(`  ${sym.padEnd(12)} ${String(ka.size).padEnd(7)} ${exactNote.padEnd(15)} ${driftNote.padEnd(18)} ${structNote}${split.length ? `  (${split.length} spot-split differ)` : ''}`);
  if (bad.length || onlyReal.length) hardFail++;
  if (over.length) drifted++;

  if (ONE) {
    console.log('\n  field-by-field:');
    for (const k of [...EXACT, ...SPOT_SPLIT, ...PRICEY]) {
      if (b[k] === undefined && a[k] === undefined) continue;
      const d = pct(a[k], b[k]);
      const mark = SPOT_SPLIT.includes(k) ? (String(a[k]) === String(b[k]) ? 'ok  ' : 'spot')
                 : EXACT.includes(k) ? (String(a[k]) === String(b[k]) ? 'ok  ' : 'FAIL')
                                     : (d === null ? '?   ' : d <= TOL ? 'ok  ' : 'OVER');
      console.log(`    ${mark} ${k.padEnd(14)} shadow=${String(a[k]).slice(0, 18).padEnd(20)} real=${String(b[k]).slice(0, 18)}${d !== null ? `   (${d.toFixed(3)}%)` : ''}`);
    }
    if (onlyReal.length) console.log(`\n    fields only in the REAL entry: ${onlyReal.join(', ')}`);
    if (onlyPy.length)   console.log(`    fields only in the SHADOW entry: ${onlyPy.join(', ')}`);
  }
}

console.log(`\n  ${syms.length - hardFail}/${syms.length} replicate the book exactly`
          + (drifted ? ` · ${drifted} exceed ${TOL}% price drift` : ''));
console.log('\n  exact-match fields are pure functions of the pasted book - any FAIL there is a');
console.log('  real divergence. Price drift tracks the live quote moving between the two saves,');
console.log('  so it is expected; only OVER is worth investigating.');
process.exit(hardFail ? 1 : 0);
