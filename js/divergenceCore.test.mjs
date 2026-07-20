// Synthetic, offline tests for divergenceCore. No network.
//   node js/divergenceCore.test.mjs
import { pivotHighs, pivotLows, findDivergences, reversalDecision } from './divergenceCore.js';

let failures = 0;
const ok = (name, cond) => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}`); if (!cond) failures++; };

// ── pivots ───────────────────────────────────────────────────────────────────
console.log('[pivots]');
ok('pivotHighs finds a strict top', JSON.stringify(pivotHighs([1, 2, 9, 2, 1], 2)) === JSON.stringify([2]));
ok('pivotLows finds a strict bot', JSON.stringify(pivotLows([9, 8, 1, 8, 9], 2)) === JSON.stringify([2]));
ok('pivots ignore ties (no strict extremum)', pivotLows([5, 0, 3, 0, 5], 2).length === 0);

// ── regular bear: price HIGHER high, osc LOWER high (reversal down) ───────────
console.log('[regular bear]');
// two osc tops: idx 2 (osc 8) then idx 7 (osc 5, lower). Price higher high at 7.
const oscRB   = [0, 4, 8, 4, 1, 3, 6, 5, 2, 0];
const priceHi = [10, 11, 12, 11, 10, 11, 13, 14, 12, 10];   // high at 7 (14) > high at 2 (12)
const priceLo = priceHi.map(x => x - 1);
let divs = findDivergences(priceHi, priceLo, oscRB, { reach: 2 });
const rb = divs.find(d => d.kind === 'regular' && d.bias === 'bear');
ok('detects a regular bear', !!rb);
ok('  pairs osc tops 2 → 6', rb && rb.iPrev === 2 && rb.iRec === 6);

// ── hidden bull: price HIGHER low, osc LOWER low (continuation up) ────────────
console.log('[hidden bull]');
// osc bots idx 2 (−5) then idx 6 (−8, LOWER); price low 7 then 9 (HIGHER low).
const oscHB = [0, -3, -5, -3, -1, -4, -8, -4, -1, 0];
const pLoHB = [10, 9, 7, 9, 11, 10, 9, 10, 12, 13];
const pHiHB = pLoHB.map(x => x + 1);
divs = findDivergences(pHiHB, pLoHB, oscHB, { reach: 2 });
const hb = divs.find(d => d.kind === 'hidden' && d.bias === 'bull');
ok('detects a hidden bull', !!hb && hb.iPrev === 2 && hb.iRec === 6);

// ── OB/OS gate: regular divergences gated, hidden ungated ────────────────────
console.log('[OB/OS gate]');
// regular-bear fixture: osc tops are 8 and 6. Gate obLevel=7 keeps only the top
// at 8, so the pair (8,6) can't form → no regular bear once gated.
ok('regular bear present ungated', findDivergences(priceHi, priceLo, oscRB, { reach: 2 }).some(d => d.kind === 'regular' && d.bias === 'bear'));
ok('regular bear GONE when gate excludes a pivot', !findDivergences(priceHi, priceLo, oscRB, { reach: 2, obLevel: 7 }).some(d => d.kind === 'regular'));
// hidden divergences ignore the gate entirely.
ok('hidden bull still found with a (bull) gate set', findDivergences(pHiHB, pLoHB, oscHB, { reach: 2, osLevel: -100 }).some(d => d.kind === 'hidden' && d.bias === 'bull'));

// ── reversalDecision: fade at an up-touch with a regular bear ─────────────────
console.log('[reversalDecision]');
// Use the regular-bear fixture; touch at the last bar, up-side.
ok('up-touch + regular bear → fade', reversalDecision(priceHi, priceLo, oscRB, oscRB.length - 1, +1, { reach: 2, window: 5 }) === 'fade');
// No divergence (monotone osc + price) → follow.
const mono = Array.from({ length: 12 }, (_, i) => i);
ok('no divergence → follow', reversalDecision(mono.map(x => 20 + x), mono.map(x => 19 + x), mono, mono.length - 1, +1) === 'follow');
// Wrong-side bias: a bear divergence should NOT trigger a fade on a DOWN touch.
ok('down-touch ignores a bear divergence', reversalDecision(priceHi, priceLo, oscRB, oscRB.length - 1, -1, { reach: 2, window: 5 }) === 'follow');
// Too-early touch (no confirmable pivot yet) → follow, no crash.
ok('early touch → follow', reversalDecision(priceHi, priceLo, oscRB, 1, +1) === 'follow');

console.log(failures ? `\n${failures} FAILED` : '\nAll divergenceCore tests passed');
process.exit(failures ? 1 : 0);
