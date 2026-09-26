/**
 * Vote Atlas dynamic-stop P&L test — 2026-09-26, Phase 2 of the MAE-
 * checkpoint discrimination work (analysis/vote_atlas_mae_checkpoint_
 * discrimination.mjs found real, statistically significant signal: AUC CIs
 * excluding 0.5 at every checkpoint tested, strengthening with time
 * elapsed). This phase asks the question that discrimination power alone
 * can't answer: does ACTING on that signal (tightening the stop once
 * adverse-R-so-far crosses a threshold) actually improve real P&L, or does
 * it just cut winners short for a wash -- the same honest question
 * education/jordan_impulse_range_backtest/MAE_DYNAMIC_STOP.md asked for a
 * different (fixed-window) rule and found null/harmful.
 *
 * Rule under test: once a trade has been open past `checkpointMin` AND its
 * worst-adverse-R-so-far has crossed `triggerR`, the stop tightens to
 * `newStopR` × the ORIGINAL stop distance (measured from entry, same
 * convention as the original stop) for the remainder of the trade. Applied
 * per-bar with the SAME bounded M1 walk (entry -> known resolveTime) the
 * discrimination script already validated.
 *
 * Honesty discipline (this repo's own established rule after the 2026-09
 * look-ahead incidents): the rule's parameters are CHOSEN on an in-sample
 * slice only (first 70% of each pair's trades by date) and then reported,
 * unchanged, against the untouched out-of-sample slice (last 30%) -- a
 * good-looking IS cell means nothing on its own, only the OOS number does.
 *
 * Full accounting, not just Sharpe: winnersCutShort (an original win that
 * became a loss under the new rule) vs losersSaved (an original loss whose
 * R-multiple improved) are reported alongside win rate/Sharpe/PF/total R,
 * since a big "losers saved" count can still net worse once weighed against
 * winners given up (exactly what the earlier fixed-window test found).
 *
 * READ-ONLY, ISOLATED: same data sources as the discrimination script, no
 * KV write, no HTTP route, not reachable from server.js. Run via
 * `railway ssh`.
 *
 * Usage: node vote_atlas_dynamic_stop_test.mjs [pairs...]
 */
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { pickFresher, loadLocalVoteTrades, PREFIX } from '../js/levelAtlasRoutes.js';
import { getJSON } from '../js/r2Store.js';
import { betDirection } from '../js/levelAtlasVoteReview.js';
import { summarizeTrades } from '../js/metricsCore.js';
import fs from 'node:fs';

const pairs = process.argv.slice(2).length ? process.argv.slice(2) : ['eurusd', 'usdjpy', 'gold', 'nq'];
const MIN_MARGIN = 3;

// Informed by the discrimination results: AUC was weak at 5/15min, real and
// strengthening from 30min on -- grid scoped to where signal actually is.
const CHECKPOINTS_MIN = [30, 60, 120];
const TRIGGER_R = [0.3, 0.5, 0.7];
const NEW_STOP_R = [0.3, 0.5, 0.7]; // fraction of the ORIGINAL stop distance

function bsearch(times, t) {
  let lo = 0, hi = times.length;
  while (lo < hi) { const m = (lo + hi) >>> 1; if (times[m] < t) lo = m + 1; else hi = m; }
  return lo;
}

async function loadStoredVoteTrades(pair) {
  const stored = pickFresher(await getJSON(`${PREFIX}/${pair}-votetrades.json`), loadLocalVoteTrades(pair));
  return { trades: stored?.trades || [], cost: stored?.cost || 0 };
}

// Re-walks one trade's real M1 path with the dynamic-stop rule active.
// Returns null if entry/resolve falls outside the loaded M1 range.
function simulateDynamicStop(packed, t, checkpointMin, triggerR, newStopR, cost) {
  const { times, highs, lows, closes } = packed;
  const isBuy = betDirection({ decision: t.decision, side: t.side }) === 'long';
  const stopDist = t.stopPips * t.pip;
  const targetDist = t.targetPips * t.pip;
  if (!(stopDist > 0) || !(targetDist > 0)) return null;
  const startIdx = bsearch(times, t.time);
  const endIdx = bsearch(times, t.resolveTime);
  if (startIdx >= times.length || endIdx <= startIdx) return null;

  const tp = isBuy ? t.entry + targetDist : t.entry - targetDist;
  const originalSl = isBuy ? t.entry - stopDist : t.entry + stopDist;
  const tightSl = isBuy ? t.entry - newStopR * stopDist : t.entry + newStopR * stopDist;
  const triggerSec = checkpointMin * 60;

  let worst = 0, tightened = false, activeSl = originalSl;
  for (let i = startIdx; i < endIdx; i++) {
    const adverse = isBuy ? (t.entry - lows[i]) : (highs[i] - t.entry);
    if (adverse > worst) worst = adverse;
    if (!tightened && (times[i] - t.time) >= triggerSec && (worst / stopDist) >= triggerR) {
      tightened = true;
      activeSl = tightSl;
    }
    if (isBuy) {
      if (lows[i] <= activeSl) return finish(activeSl);
      if (highs[i] >= tp) return finish(tp);
    } else {
      if (highs[i] >= activeSl) return finish(activeSl);
      if (lows[i] <= tp) return finish(tp);
    }
  }
  // Never resolved within the known window (shouldn't happen -- resolveTime
  // is the trade's own already-known resolution point) -- fall back to the
  // last bar's close, same discipline as the discrimination script's bound.
  return finish(closes[endIdx - 1]);

  function finish(exitPrice) {
    const grossPct = isBuy ? (exitPrice - t.entry) / t.entry * 100 : (t.entry - exitPrice) / t.entry * 100;
    const netPct = grossPct - cost;
    const riskPctPrice = stopDist / t.entry * 100;
    const rMult = netPct / riskPctPrice;
    return { netPct: +netPct.toFixed(4), rMult: +rMult.toFixed(3), win: netPct > 0 };
  }
}

function gridCell(packed, trades, checkpointMin, triggerR, newStopR, cost) {
  const sims = [];
  for (const t of trades) {
    const s = simulateDynamicStop(packed, t, checkpointMin, triggerR, newStopR, cost);
    if (s) sims.push({ t, s });
  }
  if (!sims.length) return null;
  const summary = summarizeTrades(sims.map(x => x.s.netPct), sims.map(x => x.t.date));
  const totalR = sims.reduce((a, x) => a + x.s.rMult, 0);
  const winnersCutShort = sims.filter(x => x.t.win && !x.s.win).length;
  const losersSaved = sims.filter(x => !x.t.win && x.s.win).length;
  return { n: sims.length, winRate: summary.winRate, sharpe: summary.sharpe, profitFactor: summary.profitFactor, totalR: +totalR.toFixed(2), winnersCutShort, losersSaved };
}

const allResults = {};

for (const pair of pairs) {
  console.error(`\n=== ${pair} ===`);
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.error(`${pair}: no M1 data`); continue; }

  const { trades: stored, cost } = await loadStoredVoteTrades(pair);
  const trades = stored
    .filter(t => t.margin >= MIN_MARGIN && t.stopPips > 0 && t.targetPips > 0 && !t.timedOut)
    .sort((a, b) => a.time - b.time);
  const splitIdx = Math.floor(trades.length * 0.7);
  const isTrades = trades.slice(0, splitIdx);
  const oosTrades = trades.slice(splitIdx);
  console.error(`${pair}: ${trades.length} trades total -- IS ${isTrades.length} (${isTrades[0]?.date} to ${isTrades.at(-1)?.date}), OOS ${oosTrades.length} (${oosTrades[0]?.date} to ${oosTrades.at(-1)?.date})`);

  // Validation FIRST (this repo's own "assume code failure first" discipline
  // -- the earlier education/.../mae_dynamic_stop.mjs found a real
  // same-day-boundary bug this exact way): re-walk every trade with
  // triggerR=Infinity (tightening never fires) and confirm it reproduces
  // the ALREADY-KNOWN stored outcome exactly. A mismatch means the re-walk
  // itself is wrong, and nothing downstream can be trusted until it's fixed.
  let mismatches = 0;
  for (const t of trades) {
    const s = simulateDynamicStop(packed, t, 0, Infinity, 1, cost);
    if (s && s.win !== t.win) mismatches++;
  }
  console.error(`validation: ${mismatches} of ${trades.length} control re-walks disagree with the stored outcome`);
  if (mismatches > trades.length * 0.02) {
    console.error(`${pair}: ABORTING -- re-walk mismatch rate too high to trust (>2%), not running the grid`);
    allResults[pair] = { error: `validation failed: ${mismatches}/${trades.length} mismatches` };
    continue;
  }

  // Control (no tightening) on both slices, for direct comparison.
  const isControl = gridCell(packed, isTrades, 0, Infinity, 1, cost); // triggerR=Infinity never fires
  const oosControl = gridCell(packed, oosTrades, 0, Infinity, 1, cost);
  console.error(`control -- IS: sharpe=${isControl?.sharpe} winRate=${isControl?.winRate}% totalR=${isControl?.totalR}  |  OOS: sharpe=${oosControl?.sharpe} winRate=${oosControl?.winRate}% totalR=${oosControl?.totalR}`);

  // Grid search on IS ONLY -- pick the best cell by Sharpe.
  let best = null;
  const isGrid = [];
  for (const cp of CHECKPOINTS_MIN) for (const tr of TRIGGER_R) for (const ns of NEW_STOP_R) {
    const cell = gridCell(packed, isTrades, cp, tr, ns, cost);
    if (!cell) continue;
    isGrid.push({ checkpointMin: cp, triggerR: tr, newStopR: ns, ...cell });
    if (!best || cell.sharpe > best.sharpe) best = { checkpointMin: cp, triggerR: tr, newStopR: ns, ...cell };
  }
  isGrid.sort((a, b) => b.sharpe - a.sharpe);
  console.error(`\nIS grid top 5 (chosen by Sharpe, ${isGrid.length} cells tested):`);
  console.error('checkpoint  triggerR  newStopR  sharpe   winRate  PF     totalR   cutShort  saved');
  for (const g of isGrid.slice(0, 5)) {
    console.error(`${String(g.checkpointMin).padEnd(10)}  ${String(g.triggerR).padEnd(8)}  ${String(g.newStopR).padEnd(8)}  ${String(g.sharpe).padEnd(7)}  ${String(g.winRate).padEnd(7)}  ${String(g.profitFactor).padEnd(5)}  ${String(g.totalR).padEnd(7)}  ${String(g.winnersCutShort).padEnd(8)}  ${g.losersSaved}`);
  }

  // Apply the IS-chosen best cell to OOS, UNCHANGED -- the only number that matters.
  const oosResult = best ? gridCell(packed, oosTrades, best.checkpointMin, best.triggerR, best.newStopR, cost) : null;
  console.error(`\nIS-chosen best (checkpoint=${best?.checkpointMin}min, triggerR=${best?.triggerR}, newStopR=${best?.newStopR}) applied to OOS, unchanged:`);
  console.error(`  OOS with rule:    sharpe=${oosResult?.sharpe} winRate=${oosResult?.winRate}% PF=${oosResult?.profitFactor} totalR=${oosResult?.totalR}  cutShort=${oosResult?.winnersCutShort} saved=${oosResult?.losersSaved}`);
  console.error(`  OOS control:      sharpe=${oosControl?.sharpe} winRate=${oosControl?.winRate}% PF=${oosControl?.profitFactor} totalR=${oosControl?.totalR}`);
  console.error(`  Verdict: ${oosResult && oosControl && oosResult.sharpe > oosControl.sharpe ? 'IMPROVED on OOS' : 'did NOT improve on OOS (or worse)'}`);

  allResults[pair] = { isControl, oosControl, isGridTop5: isGrid.slice(0, 5), isChosen: best, oosResult };
}

fs.mkdirSync('analysis/output', { recursive: true });
fs.writeFileSync('analysis/output/vote_atlas_dynamic_stop_test.json', JSON.stringify(allResults, null, 2));
console.error('\nwrote analysis/output/vote_atlas_dynamic_stop_test.json');
