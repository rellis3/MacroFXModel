// Synthetic, no-network unit tests for the DAY-TYPE GATE study.
//
// Proves: (1) extractTouches buckets the window's ex-ante signedT into tU/rng/tD
// by threshold and drops null (na); (2) when up-line fades LOSE on tU (trend-up)
// days but WIN on rng days, the gated policy SKIPs/FLIPs the tU up-line fades so
// gated OOS expectancy > baseline and fadeIntoTrend.gatedNetPnl > baselineNetPnl;
// (3) with random signedT (no day-type edge), gated ≈ baseline — no false win,
// no crash, breadth reported.
//
//   node js/dayTypeGate.test.mjs

import { extractTouches, runDayTypeStudy } from './perLineStrategy.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };

// ── Helpers to build synthetic window records ────────────────────────────────
// A line with a triple-barrier geometry: inner = toward open (fade TP), outer =
// away (fade SL). Distances are equal (1% each) so a fade win/loss is ±1% gross.
// `reverted:true` ⇒ price came back to inner (fade wins / follow loses).
function mkLine(name, side, reverted, approachVel) {
  const level = 100;
  // up-line above open: inner below (toward open), outer above (away).
  const inner = side === 'up' ? 99 : 101;
  const outer = side === 'up' ? 101 : 99;
  return { name, side, outcome: reverted ? 'reverted' : 'continued',
           level, innerLvl: inner, outerLvl: outer, approachVel, decidedBy: 'barrier' };
}
function mkWindow(date, signedT, lines) {
  return { date, open: 100, signedT, dtLabel: null, lines };
}

// ── Test 1: signedT → tU/rng/tD bucketing + na drop ──────────────────────────
{
  const recs = [
    mkWindow('2020-01-01',  0.9,  [mkLine('OC50', 'up', true, 'fast')]),   // tU
    mkWindow('2020-01-02',  0.1,  [mkLine('OC50', 'up', true, 'fast')]),   // rng
    mkWindow('2020-01-03', -0.9,  [mkLine('OC50', 'up', true, 'fast')]),   // tD
    mkWindow('2020-01-04', null,  [mkLine('OC50', 'up', true, 'fast')]),   // na → dropped
    mkWindow('2020-01-05',  0.33, [mkLine('OC50', 'up', true, 'fast')]),   // exactly thr → tU
    mkWindow('2020-01-06', -0.33, [mkLine('OC50', 'up', true, 'fast')]),   // exactly -thr → tD
  ];
  const t = extractTouches(recs, { conditions: ['approachVel', 'dayType'], dtThresh: 0.33 });
  const buckets = t.map(x => x.dayType);
  ok('T1 buckets tU/rng/tD by threshold', JSON.stringify(buckets) === JSON.stringify(['tU', 'rng', 'tD', 'tU', 'tD']),
     `got ${JSON.stringify(buckets)}`);
  ok('T1 na signedT dropped (5 of 6 survive)', t.length === 5, `n=${t.length}`);
  ok('T1 dayType appears in cell key when conditioned', t[0].cell === 'OC50_up|fast|tU', t[0].cell);
  // Baseline conditions omit dayType → cell has no bucket, but touch still carries it.
  const tb = extractTouches(recs, { conditions: ['approachVel'], dtThresh: 0.33 });
  ok('T1 baseline cell excludes dayType, field retained', tb[0].cell === 'OC50_up|fast' && tb[0].dayType === 'tU', tb[0].cell);
}

// ── Test 2: day-type carries edge → gate cuts the fade-into-trend losers ──────
// Construct many touches: on tU days an up-line fade LOSES (continued); on rng
// days an up-line fade WINS (reverted). One cell (OC50_up|fast). Baseline pools
// tU+rng → mixed; gated splits them → SKIP/FLIP the tU cell, keep the rng cell.
{
  const recs = [];
  let d = 0;
  const nextDate = () => { d++; return `2020-${String(1 + Math.floor(d / 28)).padStart(2, '0')}-${String(1 + (d % 28)).padStart(2, '0')}`; };
  // Enough per cell to clear minN in BOTH IS and OOS (splitFrac 0.6). 3 rng-wins
  // per 1 tU-lose so the POOLED (baseline) cell is a net-positive FADE (so baseline
  // fades-into-trend on tU days) while the tU-only cell is a net LOSER — exactly the
  // "selling into a rally" case the gate must skip/flip. Interleave so both IS and
  // OOS see both regimes.
  for (let i = 0; i < 100; i++) {
    recs.push(mkWindow(nextDate(), 0.1, [mkLine('OC50', 'up', true, 'fast')]));   // rng: up-line fade WINS
    recs.push(mkWindow(nextDate(), 0.1, [mkLine('OC50', 'up', true, 'fast')]));   // rng: up-line fade WINS
    recs.push(mkWindow(nextDate(), 0.1, [mkLine('OC50', 'up', true, 'fast')]));   // rng: up-line fade WINS
    recs.push(mkWindow(nextDate(), 0.9, [mkLine('OC50', 'up', false, 'fast')]));  // tU: up-line fade LOSES
  }
  const touches = extractTouches(recs, { conditions: ['approachVel'], dtThresh: 0.33 });
  const study = runDayTypeStudy({ SYN: touches }, { splitFrac: 0.6, minN: 30, marginPct: 0.0,
                                                    dtThresh: 0.33, costByPair: { SYN: 0.001 }, slipByPair: { SYN: 0.0 } });
  ok('T2 study returns a result', !!study, study ? '' : 'null');
  if (study) {
    ok('T2 gated OOS expectancy > baseline', study.gated.expectancy > study.baseline.expectancy,
       `base ${study.baseline.expectancy} gated ${study.gated.expectancy}`);
    ok('T2 fadeIntoTrend has losers to cut', study.fadeIntoTrend.n > 0, `n=${study.fadeIntoTrend.n}`);
    ok('T2 gated net PnL on those > baseline net PnL', study.fadeIntoTrend.gatedNetPnl > study.fadeIntoTrend.baselineNetPnl,
       `base ${study.fadeIntoTrend.baselineNetPnl} gated ${study.fadeIntoTrend.gatedNetPnl}`);
    ok('T2 gate skips or flips the tU up-line fades',
       (study.fadeIntoTrend.gatedAction.skip + study.fadeIntoTrend.gatedAction.flip) > 0,
       JSON.stringify(study.fadeIntoTrend.gatedAction));
    ok('T2 baseline net PnL on fade-into-trend is negative (the losers)', study.fadeIntoTrend.baselineNetPnl < 0,
       `${study.fadeIntoTrend.baselineNetPnl}`);
  }
}

// ── Test 3: no day-type edge → gated ≈ baseline (no false win, no crash) ──────
{
  // Deterministic pseudo-random signedT uncorrelated with outcome; outcome from a
  // separate pseudo-random stream so day-type carries no information.
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const recs = [];
  let d = 0;
  const nextDate = () => { d++; return `2020-${String(1 + Math.floor(d / 28)).padStart(2, '0')}-${String(1 + (d % 28)).padStart(2, '0')}`; };
  for (let i = 0; i < 400; i++) {
    const signedT = rnd() * 2 - 1;           // uniform [-1,1], independent of outcome
    const reverted = rnd() < 0.6;            // ~60% revert regardless of day-type
    recs.push(mkWindow(nextDate(), signedT, [mkLine('OC50', 'up', reverted, 'fast')]));
  }
  const touches = extractTouches(recs, { conditions: ['approachVel'], dtThresh: 0.33 });
  let study = null, threw = false;
  try {
    study = runDayTypeStudy({ SYN: touches }, { splitFrac: 0.6, minN: 30, marginPct: 0.0,
                                                dtThresh: 0.33, costByPair: { SYN: 0.001 }, slipByPair: { SYN: 0.0 } });
  } catch (e) { threw = true; console.log('    threw:', e.message); }
  ok('T3 no crash on random day-type', !threw && !!study);
  if (study) {
    ok('T3 breadth reported for both books',
       study.baseline.cells && study.gated.cells &&
       Number.isFinite(study.baseline.cells.fade) && Number.isFinite(study.gated.cells.skip),
       JSON.stringify({ base: study.baseline.cells, gated: study.gated.cells }));
    // No false win: with no edge, gated should NOT materially beat baseline.
    ok('T3 gated does not falsely beat baseline by a wide margin', study.delta.sharpe <= 0.5,
       `ΔSharpe ${study.delta.sharpe}`);
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll day-type gate tests passed.');
process.exit(failures ? 1 : 0);
