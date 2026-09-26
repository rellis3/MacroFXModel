/**
 * Vote Atlas MAE-checkpoint discrimination test — 2026-09-26.
 *
 * Operationalizes COG's actual prescribed method (see the owner's Discord
 * screenshot, this session): don't pick a stop distance from a static MAE
 * percentile (mean/median/P75/P90) -- instead test whether a given MAE
 * reading actually has PREDICTIVE POWER (discriminates eventual winners
 * from losers), find the point below which that power disappears (the
 * "noise floor"), and do this separately per time horizon, since the noise
 * floor is itself horizon-dependent.
 *
 * This is a DIFFERENT test from education/jordan_impulse_range_backtest/
 * MAE_DYNAMIC_STOP.md, which grid-searched a fixed "tight-then-revert" stop
 * rule for the best AGGREGATE Sharpe (found null/harmful there, on a
 * different engine). That test's own correction note flagged that the
 * ACTUAL COG/Jordan method wasn't tested -- this is that method, applied to
 * Vote Atlas.
 *
 * "Horizon" here means time-since-entry checkpoints (Vote Atlas trades are
 * same-session barrier trades, not multi-week holds -- the calendar-month
 * buckets in COG's own example don't apply; the closest faithful analog is
 * checkpoints within a trade's life).
 *
 * READ-ONLY, ISOLATED: reads M1 + stored votetrades.json via the same
 * functions the live reconciliation already uses; touches NO KV write, NO
 * HTTP route, NO live bot or backtest-page code. Run via `railway ssh`, a
 * separate process from server.js -- cannot affect the live page or bots.
 *
 * Method:
 *  1. Load each pair's stored, margin>=3 trades (the SAME population the
 *     live bots actually consider -- js/voteAtlasDriftAudit.js's own
 *     source of truth).
 *  2. Re-walk the REAL M1 path from each trade's own entry to its own
 *     already-known resolveTime (bounded, same discipline as the existing,
 *     bug-fixed education/.../mae_dynamic_stop.mjs), tracking running worst
 *     adverse excursion (in R, i.e. adverse-price / stop-distance).
 *  3. At each checkpoint (5/15/30/60/120 min since entry), record the
 *     worst-so-far R for every trade that was STILL OPEN at that checkpoint
 *     (a trade already resolved by then can't be conditioned on -- that
 *     would be circular, using the outcome to "predict" itself).
 *  4. Per checkpoint: AUC of (checkpoint R) predicting (eventual loss),
 *     with a bootstrap 95% CI. AUC's CI excluding 0.5 = real discrimination
 *     (a genuine noise floor exists there). CI straddling 0.5 = noise --
 *     matching what the last analysis session's phase-1 finding usually
 *     produces (shared early-dip shape between winners and losers).
 *
 * Usage: node vote_atlas_mae_checkpoint_discrimination.mjs [pairs...]
 *   default pairs: eurusd usdjpy gold nq (FX + metal + index mix, echoing
 *   COG's own example instrument spread)
 */
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { pickFresher, loadLocalVoteTrades, PREFIX } from '../js/levelAtlasRoutes.js';
import { getJSON } from '../js/r2Store.js';
import { betDirection } from '../js/levelAtlasVoteReview.js';
import fs from 'node:fs';

const pairs = process.argv.slice(2).length ? process.argv.slice(2) : ['eurusd', 'usdjpy', 'gold', 'nq'];
const CHECKPOINTS_MIN = [5, 15, 30, 60, 120];
const MIN_MARGIN = 3;
const BOOTSTRAP_N = 1000;

function bsearch(times, t) {
  let lo = 0, hi = times.length;
  while (lo < hi) { const m = (lo + hi) >>> 1; if (times[m] < t) lo = m + 1; else hi = m; }
  return lo;
}

// Mann-Whitney U -> AUC, ties handled by average rank (same algorithm
// js/forecastAnalyserStore.js's own private aucOf uses for a different
// feature -- not exported there, so re-implemented here rather than
// reaching into that file's internals).
function aucOf(rows) {
  const pos = rows.filter(r => r.isLoss).length, neg = rows.length - pos;
  if (!pos || !neg) return null;
  const sorted = [...rows].sort((a, b) => a.r - b.r);
  let i = 0, rankSumPos = 0;
  while (i < sorted.length) {
    let j = i; while (j < sorted.length && sorted[j].r === sorted[i].r) j++;
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) if (sorted[k].isLoss) rankSumPos += avgRank;
    i = j;
  }
  return (rankSumPos - pos * (pos + 1) / 2) / (pos * neg);
}

function bootstrapCI(rows, n = BOOTSTRAP_N) {
  if (rows.length < 10) return null;
  const aucs = [];
  for (let b = 0; b < n; b++) {
    const sample = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) sample[i] = rows[Math.floor(Math.random() * rows.length)];
    const a = aucOf(sample);
    if (a != null) aucs.push(a);
  }
  aucs.sort((a, b) => a - b);
  const lo = aucs[Math.floor(aucs.length * 0.025)];
  const hi = aucs[Math.floor(aucs.length * 0.975)];
  return { lo: +lo.toFixed(3), hi: +hi.toFixed(3) };
}

async function loadStoredVoteTrades(pair) {
  const stored = pickFresher(await getJSON(`${PREFIX}/${pair}-votetrades.json`), loadLocalVoteTrades(pair));
  return stored?.trades || [];
}

const allResults = {};

for (const pair of pairs) {
  console.error(`\n=== ${pair} ===`);
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.error(`${pair}: no M1 data`); continue; }
  const { times, highs, lows } = packed;

  const stored = await loadStoredVoteTrades(pair);
  const trades = stored.filter(t => t.margin >= MIN_MARGIN && t.stopPips > 0 && !t.timedOut);
  console.error(`${pair}: ${trades.length} margin>=${MIN_MARGIN}, resolved trades loaded`);

  // byCheckpoint[checkpointMin] = [{r, isLoss}, ...]
  const byCheckpoint = {};
  for (const cp of CHECKPOINTS_MIN) byCheckpoint[cp] = [];

  let skippedNoM1 = 0;
  for (const t of trades) {
    const isBuy = betDirection({ decision: t.decision, side: t.side }) === 'long';
    const stopDist = t.stopPips * t.pip;
    if (!(stopDist > 0)) continue;
    const startIdx = bsearch(times, t.time);
    const endIdx = bsearch(times, t.resolveTime); // exclusive bound -- first bar at/after resolution
    if (startIdx >= times.length || endIdx <= startIdx) { skippedNoM1++; continue; }

    let worst = 0;
    let cpPtr = 0; // next checkpoint not yet recorded
    for (let i = startIdx; i < endIdx; i++) {
      const adverse = isBuy ? (t.entry - lows[i]) : (highs[i] - t.entry);
      if (adverse > worst) worst = adverse;
      const elapsedSec = times[i] - t.time;
      while (cpPtr < CHECKPOINTS_MIN.length && elapsedSec >= CHECKPOINTS_MIN[cpPtr] * 60) {
        // Trade is confirmed still open at this checkpoint (endIdx not yet
        // reached) -- record worst-so-far. If the trade resolves in the
        // SAME bar as a checkpoint boundary, it's still "open" up to that
        // bar's own adverse reading, consistent with the walk above.
        byCheckpoint[CHECKPOINTS_MIN[cpPtr]].push({ r: worst / stopDist, isLoss: !t.win });
        cpPtr++;
      }
    }
    // Any remaining checkpoints the trade never reached (resolved before
    // that much time elapsed) are correctly left out -- can't condition on
    // a checkpoint the trade never lived to see.
  }
  if (skippedNoM1) console.error(`${pair}: ${skippedNoM1} trades skipped (entry/resolve time outside loaded M1 range)`);

  const pairResult = {};
  console.error(`${pair} — checkpoint discrimination (AUC of adverse-R-so-far predicting eventual loss; 0.5=noise, CI excluding 0.5=real signal)`);
  console.error('checkpoint(min)  n(still-open)  n(loss)  AUC    95% CI');
  for (const cp of CHECKPOINTS_MIN) {
    const rows = byCheckpoint[cp];
    const auc = aucOf(rows);
    const ci = auc != null ? bootstrapCI(rows) : null;
    const nLoss = rows.filter(r => r.isLoss).length;
    pairResult[cp] = { n: rows.length, nLoss, auc: auc != null ? +auc.toFixed(3) : null, ci };
    console.error(`${String(cp).padEnd(15)}  ${String(rows.length).padEnd(13)}  ${String(nLoss).padEnd(7)}  ${auc != null ? auc.toFixed(3) : 'n/a'}  ${ci ? `[${ci.lo}, ${ci.hi}]` : 'n/a'}`);
  }
  allResults[pair] = pairResult;
}

fs.mkdirSync('analysis/output', { recursive: true });
fs.writeFileSync('analysis/output/vote_atlas_mae_checkpoint_discrimination.json', JSON.stringify(allResults, null, 2));
console.error('\nwrote analysis/output/vote_atlas_mae_checkpoint_discrimination.json');
