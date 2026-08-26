#!/usr/bin/env node
/**
 * The RETURN-TO-VWAP conditional book — "price hits kσ in different volatility
 * sessions / times / momentum states and returns to VWAP: trend that via
 * levels of analysis" (the owner's actual question, GOLD_VWAP_FIXED_SIGMA_
 * FINDINGS.md §7).
 *
 *   node scripts/run_gold_vwap_return.mjs [--touches FILE] [--pair KEY]
 *
 * Reads the saved touches JSON when given (--touches), else walks the pair's
 * local parquet fresh. Prints:
 *   • per-band return-to-VWAP rate + median minutes, IS/OOS (read AGAINST the
 *     random-walk baseline from run_gold_vwap_sigma_controls.mjs — a random
 *     walk also "returns to VWAP" because the VWAP converges toward price)
 *   • the "levels of analysis" matrices: band × session, band × volRegime,
 *     band × wtState (full sample, first touches, n in brackets)
 *   • every OOS-held conditional finding for the return outcome
 */

import { readFileSync } from 'node:fs';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { fixedSigmaWalk } from '../js/vwapFixedSigmaEngine.js';
import { buildVwapReturnBook, extractHeldFindings, returnedWithin, returnEligible, RETURN_HORIZON_MINS } from '../js/vwapFixedSigmaReport.js';

const args = process.argv.slice(2);
const touchesFile = args.includes('--touches') ? args[args.indexOf('--touches') + 1] : null;
const pair = args.includes('--pair') ? args[args.indexOf('--pair') + 1] : 'gold';

let touches;
if (touchesFile) {
  ({ touches } = JSON.parse(readFileSync(touchesFile, 'utf8')));
} else {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.error(`No M1 for ${pair}`); process.exit(1); }
  ({ touches } = fixedSigmaWalk(packed, { instrument: pair, assetClass: pair === 'gold' ? 'commodity' : 'fx' }));
}
const firsts = touches.filter(t => t.ordinal === 1 && returnEligible(t));
console.log(`${firsts.length.toLocaleString()} first touches with ≥${RETURN_HORIZON_MINS}min of session left (the eligible pool)`);

const book = buildVwapReturnBook(touches, { firstTouchOnly: true });

console.log(`\n── Returned-to-VWAP within ${RETURN_HORIZON_MINS}min, by band (IS/OOS, split ${book.splitDate}) ──`);
for (const side of ['up', 'dn']) {
  for (let k = 1; k <= 7; k++) {
    const c = book.cells[`${side}|${k}`]; if (!c) continue;
    const i = c.base.is, o = c.base.oos;
    console.log(`  ${side === 'up' ? '+' : '−'}${k}σ  n=${String(c.n.is).padStart(4)}/${String(c.n.oos).padStart(4)}  returns ${String(i.outPct).padStart(5)}% / ${String(o?.outPct ?? '—').padStart(5)}%   med mins ${i.medMinsToVwap ?? '—'} / ${o?.medMinsToVwap ?? '—'}`);
  }
}

// "Levels of analysis" matrices — full sample, first touches, pooled sides.
function matrix(dim, buckets) {
  console.log(`\n── Returned within ${RETURN_HORIZON_MINS}min, % by band × ${dim} (n in brackets, first touches, both sides) ──`);
  for (let k = 1; k <= 7; k++) {
    const row = [];
    for (const b of buckets) {
      const g = firsts.filter(t => t.band === k && t[dim] === b);
      const hits = g.filter(t => returnedWithin(t)).length;
      row.push(`${String(b).padEnd(9)} ${g.length ? String((hits / g.length * 100).toFixed(0)).padStart(3) : '  —'}% (${g.length})`.padEnd(22));
    }
    console.log(`  ${k}σ  ` + row.join(' '));
  }
}
matrix('session', ['Asia', 'London', 'NY']);
matrix('volRegime', ['1·quiet', '2·normal', '3·heavy']);
matrix('wtState', [...new Set(firsts.map(t => t.wtState).filter(Boolean))].sort());

const held = extractHeldFindings(book, { limit: 10000 });
console.log(`\n── OOS-held conditional findings for the RETURN outcome (${held.length} total) ──`);
for (const h of held.slice(0, 40)) {
  console.log(`  ${h.cellKey.padEnd(6)} ${h.dimKey}=${h.bucket}  IS ${h.outPctIS}% (Δ${h.deltaOutIS > 0 ? '+' : ''}${h.deltaOutIS}, n=${h.n.is})  OOS ${h.outPctOOS}% (Δ${h.deltaOutOOS > 0 ? '+' : ''}${h.deltaOutOOS}, n=${h.n.oos})`);
}
