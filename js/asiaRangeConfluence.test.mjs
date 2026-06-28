// Verifies the Asia-range backtest now detects confluence the SAME way the live
// engine does (confluence-core.detectConfluencesCore) — the session-range
// distance cap + cluster density that the old local detectConfluence lacked.
// asiaRangeEngine itself can't be imported headless (loadM1ForPair → hyparquet),
// so this tests the adapter logic against confluence-core directly. The
// `markConfluence` body below is copied verbatim from asiaRangeEngine.js.
//   node js/asiaRangeConfluence.test.mjs

import { detectConfluencesCore } from './confluence-core.js';
import { calcFibs } from './fibProjection.js';
import { computeStars, computeStructScore, momScoreFrom, rbScoreFrom, computeSignalScore } from './entryGradeCore.js';
import { computeRangeBiasServer } from './rangeBiasCore.js';
import { gradeEntry } from './trade-grade.js';
import { fitHMM, hmmSignalScore } from '../hmm.js';

// ── verbatim copy of asiaRangeEngine.markConfluence ──────────────────────────
function markConfluence(currFibs, prevFibs, { pipSize, normalDistance, tightDistance, mergeDistance, sessionRange }) {
  const today = currFibs.map(f => ({ price: f.price, fib: f.level }));
  const prev  = prevFibs.map(f => ({ price: f.price, fib: f.level }));
  const clusters = detectConfluencesCore(today, prev, {
    pipSize, normalDistance, tightDistance, mergeDistance,
    priceMode: 'midpoint', clusterMerge: true, sessionRange,
  });
  return currFibs.map(f => {
    const cl = clusters.find(c => (c.todayFibs ?? [c.todayFib]).includes(f.level));
    return cl
      ? { ...f, hasConfluence: true, isTight: cl.isTight, density: cl.density, confPrice: cl.price }
      : { ...f, hasConfluence: false, isTight: false, density: 0 };
  });
}

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };

const pip = 0.0001;
const normalDistance = 2 * pip;            // confluenceThreshPips 2
const tightDistance  = normalDistance * 0.10;
const mergeDistance  = normalDistance * 0.30;

console.log('[basic confluence + shape]');
// Asia today range; prior range shifted so a couple of fibs line up.
const today = calcFibs(1.1000, 0.0100);                 // low 1.1000, range 100p
const prev  = calcFibs(1.10005, 0.0100);                // shifted +0.5p → many fibs ~0.5p apart
const big   = { pipSize: pip, normalDistance, tightDistance, mergeDistance, sessionRange: null };
const marked = markConfluence(today, prev, big);
ok('output preserves per-fib shape', marked.every(f => 'level' in f && 'price' in f && 'isKey' in f && 'hasConfluence' in f && 'density' in f));
ok('aligned fibs flagged hasConfluence', marked.some(f => f.hasConfluence), `${marked.filter(f => f.hasConfluence).length} flagged`);
ok('a 0.5p match is tight (≤0.2p? no) — within normal not tight', (() => { const f = marked.find(x => x.hasConfluence); return f && f.density >= 1; })());

console.log('[session-range distance cap changes the result — the live behaviour]');
// Controlled single-fib inputs (avoid dense-grid cross-level matches): one
// today fib, one prior fib exactly 1.0p apart. Uncapped (normalDistance 2p) →
// matches. With a 4p session range the cap = range×0.25×0.5 = 0.5p < 1.0p → no
// match. This is precisely the live distance-cap behaviour the backtest lacked.
const tOne = [{ level: 0, price: 1.5000,  isKey: true }];
const pOne = [{ level: 0, price: 1.50010, isKey: true }];   // 1.0p apart
const uncapped = markConfluence(tOne, pOne, { ...big, sessionRange: null }).filter(f => f.hasConfluence).length;
const capped   = markConfluence(tOne, pOne, { ...big, sessionRange: 0.0004 }).filter(f => f.hasConfluence).length;
ok('uncapped: 1.0p gap within 2p threshold → confluence', uncapped === 1);
ok('capped by 4p range (cap 0.5p < 1.0p) → no confluence', capped === 0, `capped=${capped}`);

console.log('[cluster density — stacked prior fibs = dense zone]');
// Two prior fibs both near one current fib → density ≥ 2 at that level.
const t1 = [{ level: 0, price: 1.5000, isKey: true }];
const p1 = [{ level: 0.25, price: 1.50008, isKey: false }, { level: 0.5, price: 1.50016, isKey: false }];
const dense = markConfluence(t1, p1, { pipSize: pip, normalDistance: 3 * pip, tightDistance: 0.3 * pip, mergeDistance: 3 * pip, sessionRange: null });
ok('stacked prior fibs register density ≥ 2', dense[0].hasConfluence && dense[0].density >= 2, `density=${dense[0].density}`);

console.log('[no prior fibs → no confluence]');
const none = markConfluence(today, [], big);
ok('empty prev → all hasConfluence false, density 0', none.every(f => f.hasConfluence === false && f.density === 0));

console.log('[Monday is an independent strategy: vs prior Monday, not vs Asia]');
// Monday this week vs Monday last week — its own confluence, exactly like Asia.
const monThis = calcFibs(1.4000, 0.0100);
const monPrev = calcFibs(1.40005, 0.0100);
const monMarked = markConfluence(monThis, monPrev, big);
ok('Monday fibs score confluence vs PRIOR Monday', monMarked.some(f => f.hasConfluence));
// With no prior Monday, Monday has no confluence (independent of Asia entirely).
ok('no prior Monday → Monday has no confluence (not borrowed from Asia)',
   markConfluence(monThis, [], big).every(f => !f.hasConfluence));

console.log('[cross-session overlay = optional zone-strength layer]');
// Replicates asiaRangeEngine's overlay: crossAligned only when ON, by mergeDistance.
function applyCrossOverlay(asiaFibs, monFibs, mergeDist, on) {
  const a = asiaFibs.map(f => ({ ...f, crossAligned: false }));
  const m = monFibs.map(f => ({ ...f, crossAligned: false }));
  if (on) {
    for (const af of a) af.crossAligned = m.some(mf => Math.abs(af.price - mf.price) <= mergeDist);
    for (const mf of m) mf.crossAligned = a.some(af => Math.abs(af.price - mf.price) <= mergeDist);
  }
  return { a, m };
}
const aF = [{ level: 0, price: 1.5000, isKey: true }];
const mF = [{ level: 1, price: 1.50003, isKey: true }];   // 0.3p from the Asia fib
const off = applyCrossOverlay(aF, mF, mergeDistance, false);
const on  = applyCrossOverlay(aF, mF, mergeDistance, true);
ok('overlay OFF → strategies independent (no crossAligned)', off.a.every(f => !f.crossAligned) && off.m.every(f => !f.crossAligned));
ok('overlay ON → coinciding Asia/Monday fibs flagged crossAligned', on.a[0].crossAligned && on.m[0].crossAligned);

console.log('[live grade chain — the exact block asiaRangeEngine runs per trade]');
// Synthetic day inputs (oldest-first, string fields like the engine's resampled bars).
const mkBars = (n, base, amp, per) => Array.from({ length: n }, (_, i) => {
  const c = base + amp * Math.sin(i / per), o = base + amp * Math.sin((i - 1) / per);
  return { high: String(Math.max(o, c) + 0.4), low: String(Math.min(o, c) - 0.4), close: String(c), open: String(o), time: i * 60 };
});
const dBars = mkBars(90, 100, 6, 14).map((b, i) => ({ epoch: i * 86400, open: +b.open, high: +b.high, low: +b.low, close: +b.close }));
const rets = []; for (let i = 1; i < dBars.length; i++) rets.push(Math.log(dBars[i].close / dBars[i - 1].close));
const hmmData = fitHMM(rets);
const rbias = computeRangeBiasServer('', 'long', mkBars(60, 100, 2, 9), mkBars(220, 100, 4, 12), dBars);

function gradeChain(side, fib, hmmData, rbias) {           // mirrors the engine's inline block
  const dir = side === 'BUY' ? 'long' : 'short';
  const emaRsi = rbias.features.find(f => f.key === 'ema') ?? { signal: null };
  const flags = { isTight: fib.isTight, density: fib.density, crossSessionMatch: fib.crossAligned, pivotMatch: false };
  const rawStars = computeStars(flags);
  const structScore = computeStructScore({ stars: rawStars, ...flags });
  const hmmScore = hmmSignalScore(dir, hmmData) ?? 0.5;
  const signalScore = computeSignalScore({ hmmScore, momScore: momScoreFrom(emaRsi.signal, dir), rbScore: rbScoreFrom(rbias.conviction), structScore });
  const g = gradeEntry({ direction: dir, signalScore, rangeBias: { confirmCount: rbias.confirmCount, conflictCount: rbias.conflictCount }, tags: [], totalStars: Math.min(5, rawStars) }, hmmData, null);
  return { stars: Math.min(5, rawStars), signalScore, grade: g?.grade, verdict: g?.verdict };
}
const weak   = gradeChain('BUY', { isTight: false, density: 1, crossAligned: false }, hmmData, rbias);
const strong = gradeChain('BUY', { isTight: true,  density: 3, crossAligned: true  }, hmmData, rbias);
ok('grade chain yields a valid signalScore 0–100', weak.signalScore >= 0 && weak.signalScore <= 100);
ok('grade label is one of A+/A/B/C/D/SKIP', ['A+','A','B','C','D','SKIP'].includes(strong.grade), `grade=${strong.grade}`);
ok('stronger structure → ≥ stars and ≥ signalScore', strong.stars >= weak.stars && strong.signalScore >= weak.signalScore,
   `weak ${weak.stars}★/${weak.signalScore} vs strong ${strong.stars}★/${strong.signalScore}`);
ok('verdict present', typeof strong.verdict === 'string' && strong.verdict.length > 0);

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
