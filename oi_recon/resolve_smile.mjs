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
import { resolveSmileExpiry, parseOIMatrix } from '../js/oi.js';

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
