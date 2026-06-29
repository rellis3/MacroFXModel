// Synthetic test for the gate-comparison brick.  node js/gateAnalysis.test.mjs
import { compareGates, bestGate, GATES } from './gateAnalysis.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

// Build synthetic trades where a HIGH vol_pos genuinely predicts a better pnl,
// the grade is noise, and day_type is mildly helpful — across IS and OOS.
const trades = [];
let d = Date.UTC(2021, 0, 4);
for (let i = 0; i < 600; i++) {
  const volPos = (i % 5) * 0.45;                       // 0 .. 1.8
  const edge   = volPos >= 1.0 ? 0.08 : -0.05;         // stretched levels win, others lose
  const wobble = Math.sin(i) * 0.3;
  trades.push({
    filled: true,
    date: new Date(d).toISOString().slice(0, 10),
    pnl_pct: +(edge + wobble).toFixed(4),
    live_grade: ['A+', 'A', 'B', 'C', 'D'][i % 5],      // uncorrelated with edge (noise)
    vol_pos: volPos,
    day_type_T: (i % 7) / 7 * 0.7,                       // 0 .. 0.6
    approach_vel: (i % 4) * 0.30,                        // 0 .. 0.9 (spike bucket at ≥0.60)
  });
  d += (i % 3 + 1) * 2 * 864e5;
}

console.log('[structure]');
const cmp = compareGates(trades, { oosFrac: 0.4, minOosTrades: 20 });
ok('returns the 4 gates', Object.keys(cmp.gates).length === 4 && cmp.gates.grade && cmp.gates.volPos && cmp.gates.dayType && cmp.gates.approachVel);
ok('splitDate set', !!cmp.splitDate);
ok('each gate row has IS + OOS metrics', cmp.gates.volPos.rows.every(r => r.is && r.oos && 'trades' in r.oos));
ok('every gate ends with an "all" bucket', Object.values(cmp.gates).every(g => g.rows.at(-1).label === 'all'));
ok('coverage counted', cmp.gates.volPos.coverage === 600);

console.log('[the gate that truly carries edge is detected on OOS]');
const volStrict = cmp.gates.volPos.rows.find(r => r.label === '≥ 1.00× HL75');
const volAll    = cmp.gates.volPos.rows.find(r => r.label === 'all');
ok('vol stretch ≥1.0 beats "all" OOS expectancy', volStrict.oos.expectancy > volAll.oos.expectancy,
   `strict=${volStrict.oos.expectancy} all=${volAll.oos.expectancy}`);
ok('vol stretch flagged as positive edge-vs-all', volStrict.oosExpectancyVsAll > 0);

console.log('[grade is noise → no spurious edge]');
const gradeStrict = cmp.gates.grade.rows.find(r => r.label === 'A+ only');
ok('A+ does NOT meaningfully beat all (noise gate)', gradeStrict.oosExpectancyVsAll <= volStrict.oosExpectancyVsAll);

console.log('[bestGate picks the real one]');
const best = bestGate(cmp);
ok('bestGate returns the vol stretch gate', best && best.gate === 'volPos', best ? `${best.gate}/${best.bucket}` : 'null');

console.log('[thin OOS flagged]');
const cmpThin = compareGates(trades.slice(0, 40), { oosFrac: 0.4, minOosTrades: 30 });
ok('small sample → thin flag set on strict buckets', cmpThin.gates.grade.rows.some(r => r.thin));

console.log('[no qualifying gate → bestGate null]');
const flat = trades.map(t => ({ ...t, pnl_pct: 0.01 }));  // identical pnl → no gate adds edge
ok('flat pnl → bestGate null (honest "no edge")', bestGate(compareGates(flat, { minOosTrades: 20 })) === null);

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
