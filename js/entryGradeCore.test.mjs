// Golden test: entryGradeCore must reproduce the live levels.js star/signalScore
// formulas bit-for-bit.  node js/entryGradeCore.test.mjs
import { computeStars, computeStructScore, momScoreFrom, rbScoreFrom, computeSignalScore } from './entryGradeCore.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

// ── verbatim references from levels.js ───────────────────────────────────────
function refStars(c, pivotMatch) {
  let stars = 1;
  if (c.isTight)             stars++;
  if ((c.density || 1) >= 2) stars++;
  if ((c.density || 1) >= 3) stars++;
  if (c.crossSessionMatch)   stars++;
  if (pivotMatch)            stars++;
  return stars;
}
const refStruct = (stars, c, pivotMatch) => Math.min(1,
  Math.min(stars, 5) / 5 * 0.5 + (c.isTight ? 0.2 : 0) + (c.crossSessionMatch ? 0.2 : 0) + (pivotMatch ? 0.1 : 0));
function refSignal(hmmScore, momScore, rbScore, structScore, macroScore) {
  if (macroScore != null) return Math.round((hmmScore*0.25 + macroScore*0.25 + rbScore*0.20 + momScore*0.20 + structScore*0.10) * 100);
  return Math.round((hmmScore*0.38 + momScore*0.25 + rbScore*0.25 + structScore*0.12) * 100);
}

console.log('[stars + structScore golden]');
const cases = [
  { isTight: false, density: 1, crossSessionMatch: false },
  { isTight: true,  density: 2, crossSessionMatch: false },
  { isTight: true,  density: 3, crossSessionMatch: true  },
  { isTight: false, density: 4, crossSessionMatch: true  },
];
for (const c of cases) for (const pivotMatch of [false, true]) {
  const got = computeStars({ ...c, pivotMatch });
  const exp = refStars(c, pivotMatch);
  ok(`stars ${JSON.stringify(c)} pivot=${pivotMatch} = ${exp}`, got === exp);
  ok('structScore matches', computeStructScore({ stars: got, ...c, pivotMatch }) === refStruct(got, c, pivotMatch));
}

console.log('[momScore / rbScore golden]');
ok('mom confirm = 0.78', momScoreFrom('long', 'long') === 0.78);
ok('mom conflict = 0.22', momScoreFrom('short', 'long') === 0.22);
ok('mom neutral = 0.50', momScoreFrom(null, 'long') === 0.50);
ok('rbScore maps [-1,1]→[0,1]', rbScoreFrom(-1) === 0 && rbScoreFrom(1) === 1 && rbScoreFrom(0) === 0.5);

console.log('[signalScore golden — both blends]');
let sigFail = 0;
for (const hmm of [0.25, 0.5, 0.9]) for (const mom of [0.22, 0.78]) for (const rb of [0, 0.5, 1]) for (const st of [0, 0.6, 1]) {
  if (computeSignalScore({ hmmScore: hmm, momScore: mom, rbScore: rb, structScore: st }) !== refSignal(hmm, mom, rb, st, null)) sigFail++;
  if (computeSignalScore({ hmmScore: hmm, momScore: mom, rbScore: rb, structScore: st, macroScore: 0.7 }) !== refSignal(hmm, mom, rb, st, 0.7)) sigFail++;
}
ok('signalScore == ref across 108 combos (no-FRED + FRED)', sigFail === 0, `${sigFail} mismatches`);

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
