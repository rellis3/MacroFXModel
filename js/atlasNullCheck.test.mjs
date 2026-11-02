// Random-walk guard for the Vote Atlas and Fib Atlas backtests (2026-11-01).
// On driftless random prices there is no edge, so every production path must
// report about zero mean R. Thresholds were fixed before these seeds were run:
// pooled mean R below +0.08 on every path, and the same-day "previous outcome"
// input agreeing with the current outcome within 10 points of chance. The old
// leaks gave +0.15 to +0.5R and +28 points, so they would fail here.
//
// The canary checks that this guard can actually see a leak: a book built on the
// full sample (which has seen the scored period) must breach the threshold.
import { randomWalkPacked, voteAtlasNull, fibAtlasNull, summarizeR, prevOutcomeAgreement } from './atlasNullCheck.js';
import { atlasWalk } from './levelAtlasEngine.js';
import { buildAtlasBook, splitAt } from './levelAtlasReport.js';
import { buildBarrierTrades } from './levelAtlasVoteReview.js';

const SEEDS = [11, 12, 13], YEARS = 3, MAX_MEAN_R = 0.08, MAX_AGREE_EXCESS = 0.10;
// The Monday ladder trades about 220 times per 3 random years, too few for a stable
// read on three seeds (first run: chandelier +0.079, standard error about 0.04). It
// gets six more seeds of its own. Added after that first run; the bar is unchanged.
const MONDAY_EXTRA_SEEDS = [14, 15, 16, 17, 18, 19];
let failures = 0;
const ok = (name, cond, detail = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${detail ? '  ' + detail : ''}`); if (!cond) failures++; };

const pooled = { vote: {}, asia: {}, monday: {} };
const agreeRows = { vote: [], asia: [], monday: [] };
const add = (sys, path, trades) => { (pooled[sys][path] ??= []).push(...trades); };
const leaky = [];

for (const seed of SEEDS) {
  const packed = randomWalkPacked({ seed, years: YEARS });
  const v = voteAtlasNull(packed);
  add('vote', 'default (margin>=1)', v.base);
  add('vote', 'default (margin>=3)', v.base.filter(t => t.margin >= 3));
  add('vote', 'MAE stop gate 0.8/0.5', v.maeGate);
  add('vote', 'chandelier exit', v.chandelier);
  agreeRows.vote.push(...v.touches);

  for (const ladder of ['asia', 'monday']) {
    const f = fibAtlasNull(packed, { ladder });
    add(ladder, 'default (margin>=1)', f.base);
    add(ladder, 'default (margin>=2)', f.base.filter(t => t.margin >= 2));
    add(ladder, 'clearance >= 1 pip', f.clearance);
    add(ladder, 'chandelier exit', f.chandelier);
    agreeRows[ladder].push(...f.touches);
  }

  // Canary: the pre-2026-09-11 Vote Atlas scoring (book built on ALL touches).
  const { touches } = atlasWalk(packed, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const fullBook = buildAtlasBook(touches, { rearmFrac: 0.3 });
  const { split } = splitAt(touches.filter(t => t.rearmFrac === 0.3));
  leaky.push(...buildBarrierTrades(touches, fullBook, { rearmFrac: 0.3, cost: 0, oosStartDate: split }).filter(t => t.margin >= 3));
}

for (const seed of MONDAY_EXTRA_SEEDS) {
  const packed = randomWalkPacked({ seed, years: YEARS });
  const f = fibAtlasNull(packed, { ladder: 'monday' });
  add('monday', 'default (margin>=1)', f.base);
  add('monday', 'default (margin>=2)', f.base.filter(t => t.margin >= 2));
  add('monday', 'clearance >= 1 pip', f.clearance);
  add('monday', 'chandelier exit', f.chandelier);
  agreeRows.monday.push(...f.touches);
}

console.log(`Random-walk null, seeds ${SEEDS.join(',')} x ${YEARS}y (true edge = 0)`);
for (const [sys, paths] of Object.entries(pooled)) {
  for (const [path, trades] of Object.entries(paths)) {
    const s = summarizeR(trades);
    const detail = `n=${s.n} meanR=${s.meanR?.toFixed(3)} win=${s.winPct?.toFixed(1)}%`;
    if (s.n < 100) { console.log(`  · ${sys} ${path}: too few trades to judge (${detail})`); continue; }
    ok(`${sys} ${path}: no edge on random prices`, s.meanR < MAX_MEAN_R, detail);
  }
  const a = prevOutcomeAgreement(agreeRows[sys]);
  ok(`${sys}: prevOutcomeSameDay is not reading the current outcome`, a.n > 100 && a.agree - a.chance < MAX_AGREE_EXCESS,
    `n=${a.n} agree=${a.agree?.toFixed(3)} chance=${a.chance?.toFixed(3)}`);
}
const c = summarizeR(leaky);
ok('canary: a full-sample (leaky) book DOES show a fake edge, so this guard can see one', c.n >= 100 && c.meanR > MAX_MEAN_R,
  `n=${c.n} meanR=${c.meanR?.toFixed(3)} win=${c.winPct?.toFixed(1)}%`);

if (failures) { console.log(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nALL PASSED');
