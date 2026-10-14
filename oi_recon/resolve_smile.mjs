// Which per-strike IV chain does the module actually want?
//
//   node resolve_smile.mjs <rawOI.tsv> <rawIVTerm.tsv>
//
// This is the piece that makes the IV capture a two-pass job instead of a
// blanket "grab every DTE": pass 1 captures OI + term structure, this resolves
// WHICH expiry the walls came from and what QuikStrike calls it, pass 2 captures
// just that one chain.
//
// It IMPORTS js/oi.js rather than reimplementing the choice. That matters: the
// expiry decision is exactly the thing that was silently wrong before
// oiPasteContract.test.mjs existed (correct math, wrong expiry, plausible
// output). A second copy of that logic in Python would be free to drift from the
// one the dashboard uses, and the two would disagree about which chain is right.
import { readFileSync } from 'fs';
import { resolveSmileExpiry, parseOIMatrix, parseSettlementTermStructure } from '../js/oi.js';

const [oiPath, termPath] = process.argv.slice(2);
if (!oiPath) {
  console.error('usage: node resolve_smile.mjs <rawOI.tsv> [rawIVTerm.tsv]');
  process.exit(2);
}
const rawOI = readFileSync(oiPath, 'utf8');
const rawIVTerm = termPath ? readFileSync(termPath, 'utf8') : '';

const primary = parseOIMatrix(rawOI)?.primaryExpiry ?? null;
const hint = resolveSmileExpiry(rawOI, rawIVTerm, { haveSmile: false });

console.log('primaryExpiry (from OI matrix):', primary
  ? `${primary.dte} DTE · ${primary.nearOI?.toLocaleString?.() ?? primary.nearOI} near-money OI`
  : '(none — matrix did not yield one)');
console.log('smile expiry to capture     :', hint?.code || '(code unresolved)');
console.log('  expiry date               :', hint?.date || '-');
console.log('  dte / matchedDte          :', `${hint?.dte ?? '-'} / ${hint?.matchedDte ?? '-'}`);
// 'code' = absolute match, immune to the two tables being copied on different
// days. 'dte' = nearest-DTE fallback, which IS sensitive to that; 'front' = no
// DTE known at all. Worth printing: it says how much to trust the answer.
console.log('  matched on                :', hint?.matchedOn || '-');
if (hint?.tableAsOf) {
  console.log('  term table as-of          :', hint.tableAsOf,
    hint.tableStaleDays ? `(${hint.tableStaleDays} days stale)` : '(current)');
}
// Machine-readable line for a fetcher to consume.
console.log('\nRESOLVED_CODE=' + (hint?.code || ''));

// EXTRA near-expiry smiles. The dashboard draws the nearest expiries' IV curves (the 0/1/2 DTE
// lines on COG's GEX-by-strike charts); the primary smile above is usually the far monthly and
// reads nearly flat. Names the (up to) 3 shortest-DTE expiries that actually carry open
// interest, other than the primary, from the Settlements term table. Absent table → none.
let near = [];
try {
  const rows = parseSettlementTermStructure(rawIVTerm) || [];
  near = rows.filter(r => r.symbol && r.iv > 0 && ((r.oiCall || 0) + (r.oiPut || 0)) > 0 && r.dte >= 0 && r.symbol !== hint?.code)
    .sort((a, b) => a.dte - b.dte).slice(0, 3).map(r => r.symbol);
} catch { /* optional */ }
console.log('NEAR_CODES=' + near.join(','));
