/**
 * Vote Atlas MAE calibration curve — CORRECTED noise-floor search, 2026-09-26.
 *
 * Supersedes the R-threshold "noise floor" attempt in
 * analysis/vote_atlas_mae_gate_deep_dive.mjs's item 1, which turned out to
 * be tautological: for a barrier trade, "eventually lost" structurally
 * means "touched the stop", so a loser's own FINAL maePips is always ~100%
 * of its stop distance. That means "final excursion never reached R" (for
 * any R<1) automatically implies "won" -- not because deep excursions
 * predict losses, but because a losing trade MUST pass through every
 * intermediate R level on its continuous path to touching the stop. That
 * is why the deep-dive's noise floor converged to the deepest R tested
 * (0.85) for every single pair/subset -- a different, more basic flaw
 * than the original grid's, producing the same "runs to the edge" symptom.
 *
 * This script redoes it the way analysis/vote_atlas_mae_checkpoint_discrimination.mjs
 * already did correctly: condition on trades STILL OPEN at a fixed elapsed
 * time (30/60 min) -- at that snapshot, BOTH eventual winners and eventual
 * losers can be sitting at any excursion level, so there is no tautology.
 * Instead of that script's AUC summary, this bins by excursion depth and
 * reports P(eventual loss | still open, worst-so-far in this bucket) per
 * bucket with n and a bootstrap CI -- a genuine calibration curve, from
 * which a decision-relevant trigger (first bucket where loss probability
 * is CONFIDENTLY above 50%, not just above baseline) can be read off.
 *
 * READ-ONLY, isolated -- no KV write, no route, cannot affect the live
 * page or bots.
 *
 * Usage: node vote_atlas_mae_calibration_curve.mjs [pairs...]
 */
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { pickFresher, loadLocalVoteTrades, PREFIX } from '../js/levelAtlasRoutes.js';
import { getJSON } from '../js/r2Store.js';
import { betDirection } from '../js/levelAtlasVoteReview.js';
import fs from 'node:fs';

const PAIRS = process.argv.slice(2).length ? process.argv.slice(2) : ['eurusd', 'gbpusd', 'usdjpy', 'audusd',
  'usdchf', 'euraud', 'eurchf', 'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const CHECKPOINTS_MIN = [30, 60];
const BUCKET_EDGES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.01];
const MIN_MARGIN = 3;
const MIN_N = 30;
const BOOTSTRAP_N = 500;

function bsearch(times, t) {
  let lo = 0, hi = times.length;
  while (lo < hi) { const m = (lo + hi) >>> 1; if (times[m] < t) lo = m + 1; else hi = m; }
  return lo;
}

function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; }

function bootstrapCI(flags, n = BOOTSTRAP_N) {
  if (flags.length < MIN_N) return null;
  const rates = [];
  for (let i = 0; i < n; i++) {
    const s = []; for (let j = 0; j < flags.length; j++) s.push(flags[Math.floor(Math.random() * flags.length)]);
    rates.push(mean(s));
  }
  rates.sort((a, b) => a - b);
  return { lo: rates[Math.floor(n * 0.025)], hi: rates[Math.floor(n * 0.975)] };
}

async function loadStoredVoteTrades(pair) {
  const stored = pickFresher(await getJSON(`${PREFIX}/${pair}-votetrades.json`), loadLocalVoteTrades(pair));
  return stored?.trades || [];
}

const allResults = {};

for (const pair of PAIRS) {
  console.error(`\n=== ${pair} ===`);
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.error(`${pair}: no M1 data, skipped`); continue; }
  const { times, highs, lows } = packed;

  const stored = await loadStoredVoteTrades(pair);
  const trades = stored.filter(t => t.margin >= MIN_MARGIN && t.stopPips > 0 && !t.timedOut);
  console.error(`${pair}: ${trades.length} candidate trades`);

  const SUBSETS = ['all', 'fade', 'follow'];
  const byCheckpoint = {};
  for (const cp of CHECKPOINTS_MIN) { byCheckpoint[cp] = {}; for (const s of SUBSETS) byCheckpoint[cp][s] = []; }

  for (const t of trades) {
    const isBuy = betDirection({ decision: t.decision, side: t.side }) === 'long';
    const stopDist = t.stopPips * t.pip;
    if (!(stopDist > 0)) continue;
    const startIdx = bsearch(times, t.time);
    const endIdx = bsearch(times, t.resolveTime); // exclusive -- deliberately excludes the resolving bar's own move, same as the original discrimination script
    if (startIdx >= times.length || endIdx <= startIdx) continue;

    let worst = 0, cpPtr = 0;
    for (let i = startIdx; i < endIdx; i++) {
      const adverse = isBuy ? (t.entry - lows[i]) : (highs[i] - t.entry);
      if (adverse > worst) worst = adverse;
      const elapsedSec = times[i] - t.time;
      while (cpPtr < CHECKPOINTS_MIN.length && elapsedSec >= CHECKPOINTS_MIN[cpPtr] * 60) {
        const row = { r: worst / stopDist, isLoss: !t.win };
        byCheckpoint[CHECKPOINTS_MIN[cpPtr]].all.push(row);
        byCheckpoint[CHECKPOINTS_MIN[cpPtr]][t.decision === 'fade' ? 'fade' : 'follow'].push(row);
        cpPtr++;
      }
    }
  }

  function analyzeBuckets(rows, label) {
    if (rows.length < MIN_N) { console.error(`  [${label}] too few still-open trades (${rows.length}) -- skipped`); return null; }
    const baseRate = mean(rows.map(r => r.isLoss ? 1 : 0));
    console.error(`\n  [${label}]: ${rows.length} still-open trades, base loss rate=${baseRate.toFixed(3)}`);
    console.error('  bucket        n     P(loss)   95% CI          vs base');
    const buckets = [];
    let noiseFloorTrigger = null, majorityTrigger = null;
    for (let b = 0; b < BUCKET_EDGES.length - 1; b++) {
      const lo = BUCKET_EDGES[b], hi = BUCKET_EDGES[b + 1];
      const inBucket = rows.filter(r => r.r >= lo && r.r < hi);
      if (inBucket.length < MIN_N) { console.error(`  [${lo.toFixed(1)},${hi.toFixed(1)})  n=${inBucket.length} too thin -- skipped`); continue; }
      const flags = inBucket.map(r => r.isLoss ? 1 : 0);
      const pLoss = mean(flags);
      const ci = bootstrapCI(flags);
      const aboveBase = ci ? ci.lo > baseRate : null;
      buckets.push({ lo, hi, n: inBucket.length, pLoss: +pLoss.toFixed(3), ci: ci ? [+ci.lo.toFixed(3), +ci.hi.toFixed(3)] : null, aboveBase });
      console.error(`  [${lo.toFixed(1)},${hi.toFixed(1)})  n=${String(inBucket.length).padEnd(5)} ${pLoss.toFixed(3)}    [${ci?.lo.toFixed(3)},${ci?.hi.toFixed(3)}]   ${aboveBase ? 'ABOVE base' : 'not clearly above base'}`);
      // Two thresholds, deliberately kept separate: "noise floor" (first
      // bucket genuinely, CI-confirmed, above this trade's OWN baseline --
      // COG's actual concept) vs the stricter, decision-oriented "majority"
      // bar (first bucket confidently >50% loss probability outright).
      if (noiseFloorTrigger == null && aboveBase) noiseFloorTrigger = lo;
      if (majorityTrigger == null && ci && ci.lo > 0.5) majorityTrigger = lo;
    }
    console.error(`  -> [${label}] noise floor: ${noiseFloorTrigger ?? 'none found'}  |  majority trigger: ${majorityTrigger ?? 'none found'}`);
    return { baseRate: +baseRate.toFixed(3), buckets, noiseFloorTrigger, majorityTrigger };
  }

  const pairOut = {};
  for (const cp of CHECKPOINTS_MIN) {
    console.error(`\n--- checkpoint=${cp}min ---`);
    pairOut[cp] = {};
    for (const s of SUBSETS) {
      const r = analyzeBuckets(byCheckpoint[cp][s], `${s}, ${cp}min`);
      if (r) pairOut[cp][s] = r;
    }
  }
  allResults[pair] = pairOut;
}

fs.mkdirSync('analysis/output', { recursive: true });
fs.writeFileSync('analysis/output/vote_atlas_mae_calibration_curve.json', JSON.stringify(allResults, null, 2));

console.error(`\n\n=== POOLED SUMMARY ===`);
const SUBSETS = ['all', 'fade', 'follow'];
for (const cp of CHECKPOINTS_MIN) {
  for (const s of SUBSETS) {
    const withFloor = Object.entries(allResults).filter(([, v]) => v[cp]?.[s]?.noiseFloorTrigger != null);
    const withMajority = Object.entries(allResults).filter(([, v]) => v[cp]?.[s]?.majorityTrigger != null);
    const total = Object.entries(allResults).filter(([, v]) => v[cp]?.[s]).length;
    console.error(`checkpoint=${cp}min [${s}]: ${withFloor.length}/${total} pairs have a noise floor: ${withFloor.map(([p, v]) => `${p}=${v[cp][s].noiseFloorTrigger}`).join(', ')}`);
    console.error(`checkpoint=${cp}min [${s}]: ${withMajority.length}/${total} pairs clear the stricter >50% majority bar: ${withMajority.map(([p, v]) => `${p}=${v[cp][s].majorityTrigger}`).join(', ')}`);
  }
}
console.error(`\nwrote analysis/output/vote_atlas_mae_calibration_curve.json`);
