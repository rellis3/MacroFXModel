// Synthetic, no-network unit tests for the prevSessionVol cross-reference
// wiring (analyseWindow's new ctx params) + the OOS A/B study
// (runPrevSessionVolStudy) — same structure as js/dayTypeGate.test.mjs.
//
// Proves: (1) analyseWindow calls the prevSessionVolFor callback with the
// window's own (date, session) and threads the result onto every emitted
// row, defaulting to null with no callback wired (old behaviour preserved);
// (2) extractTouches carries prevSessionVol as a standalone field regardless
// of whether it's an active condition, and folds it into the cell key when
// it is; (3) runPrevSessionVolStudy runs end-to-end on synthetic touches
// shaped to carry a real edge (gated beats baseline) and on random data (no
// false win) — mirroring dayTypeGate's own Test 2/3 pattern exactly.
//
//   node js/prevSessionVolGate.test.mjs

import assert from 'node:assert/strict';
import { analyseWindow } from './forecastAnalyser.js';
import { extractTouches, runPrevSessionVolStudy } from './perLineStrategy.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };

console.log('prevSessionVolGate');

// ── Test 1: analyseWindow threads the callback's result onto every row ──────
{
  // Flat bars that touch every line (small σ so OC/HL lines sit close to open).
  const n = 200;
  const bars = Array.from({ length: n }, (_, k) => ({ time: 1700000000 + k * 60, open: 101, high: 101.6, low: 99.4, close: 101 }));
  const ladder = { open: 100, frac: { hl50: 0.005, hl75: 0.008, ocMed: 0.004, oc75: 0.006 } };
  const calls = [];
  const prevSessionVolFor = (date, sess) => { calls.push([date, sess]); return '3·wild'; };
  const rows = analyseWindow({ open: 100, bars }, ladder, { date: '2024-03-04', prevSessionVolFor });
  const hitRows = rows.filter(r => r.hit);
  ok('T1 at least one line touched (fixture sanity)', hitRows.length > 0, `hit=${hitRows.length}/${rows.length}`);
  ok('T1 every hit row carries the callback result', hitRows.every(r => r.prevSessionVol === '3·wild'));
  ok('T1 callback invoked with the window\'s own date', calls.every(([d]) => d === '2024-03-04'));
  ok('T1 callback invoked with a real session name', calls.every(([, s]) => ['Asia', 'London', 'NY'].includes(s)), JSON.stringify(calls[0]));

  const rowsNoCb = analyseWindow({ open: 100, bars }, ladder, { date: '2024-03-04' });
  ok('T1 no callback wired -> prevSessionVol stays null (old behaviour preserved)', rowsNoCb.filter(r => r.hit).every(r => r.prevSessionVol == null));
}

// ── Helpers (same shape as dayTypeGate.test.mjs) ─────────────────────────────
function mkLine(name, side, reverted, approachVel, prevSessionVol) {
  const inner = side === 'up' ? 99 : 101;
  const outer = side === 'up' ? 101 : 99;
  return { name, side, outcome: reverted ? 'reverted' : 'continued',
           level: 100, innerLvl: inner, outerLvl: outer, approachVel, prevSessionVol, decidedBy: 'barrier' };
}
function mkWindow(date, lines) { return { date, open: 100, signedT: null, dtLabel: null, lines }; }

// ── Test 2: extractTouches carries the field + conditions on it ─────────────
{
  const recs = [
    mkWindow('2020-01-01', [mkLine('OC50', 'up', true, 'fast', '3·wild')]),
    mkWindow('2020-01-02', [mkLine('OC50', 'up', true, 'fast', '1·quiet')]),
    mkWindow('2020-01-03', [mkLine('OC50', 'up', true, 'fast', null)]),
  ];
  const tBase = extractTouches(recs, { conditions: ['approachVel'] });
  ok('T2 baseline cell excludes prevSessionVol, field retained on all 3', tBase.length === 3 && tBase[0].cell === 'OC50_up|fast' && tBase[0].prevSessionVol === '3·wild' && tBase[2].prevSessionVol === null);
  const tGated = extractTouches(recs, { conditions: ['approachVel', 'prevSessionVol'] });
  ok('T2 gated conditions fold prevSessionVol into the cell key', tGated.some(t => t.cell === 'OC50_up|fast|3·wild'), JSON.stringify(tGated.map(t => t.cell)));
  ok('T2 a null prevSessionVol drops the touch when it IS the active condition (na-guard)', tGated.length === 2, `n=${tGated.length}`);
}

// ── Test 3: prevSessionVol carries a real edge -> gated beats baseline OOS ───
// wild-closing days: up-line fade LOSES (continued); quiet-closing days: WINS
// (reverted). Baseline pools both -> mixed cell; gated splits them and should
// skip/avoid the losing wild-day cell, netting a better OOS book.
{
  const recs = [];
  let d = 0;
  const nextDate = () => { d++; return `2020-${String(1 + Math.floor(d / 28)).padStart(2, '0')}-${String(1 + (d % 28)).padStart(2, '0')}`; };
  for (let i = 0; i < 100; i++) {
    recs.push(mkWindow(nextDate(), [mkLine('OC50', 'up', true, 'fast', '1·quiet')]));   // quiet: fade WINS
    recs.push(mkWindow(nextDate(), [mkLine('OC50', 'up', true, 'fast', '1·quiet')]));
    recs.push(mkWindow(nextDate(), [mkLine('OC50', 'up', true, 'fast', '1·quiet')]));
    recs.push(mkWindow(nextDate(), [mkLine('OC50', 'up', false, 'fast', '3·wild')]));   // wild: fade LOSES
  }
  const touches = extractTouches(recs, { conditions: ['approachVel'] });
  const study = runPrevSessionVolStudy({ SYN: touches }, { minN: 20, marginPct: 0 });
  ok('T3 study runs end-to-end without throwing', !!study);
  ok('T3 coverage reports full (every touch has a reading)', study.coverage.coveragePct === 100, JSON.stringify(study.coverage));
  ok('T3 gated books a BETTER (or equal) OOS expectancy than pooling the two regimes together',
     study.gated.expectancy >= study.baseline.expectancy, JSON.stringify({ base: study.baseline.expectancy, gated: study.gated.expectancy }));
}

// ── Test 4: no real prevSessionVol edge (random) -> no false win, no crash ──
{
  const recs = [];
  let d = 0;
  const nextDate = () => { d++; return `2021-${String(1 + Math.floor(d / 28)).padStart(2, '0')}-${String(1 + (d % 28)).padStart(2, '0')}`; };
  for (let i = 0; i < 300; i++) {
    const bucket = ['1·quiet', '2·normal', '3·wild'][i % 3];
    const reverted = (i * 2654435761 % 100) < 50;   // ~coin flip, independent of bucket
    recs.push(mkWindow(nextDate(), [mkLine('OC50', 'up', reverted, 'fast', bucket)]));
  }
  const touches = extractTouches(recs, { conditions: ['approachVel'] });
  const study = runPrevSessionVolStudy({ SYN: touches }, { minN: 20, marginPct: 0 });
  ok('T4 runs without throwing on noise data', !!study);
  ok('T4 does not fabricate a large false win on pure noise', Math.abs(study.delta.sharpe) < 3, JSON.stringify(study.delta));
}

console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILURE(S)'}`);
process.exit(failures === 0 ? 0 : 1);
