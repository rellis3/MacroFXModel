// Fib Atlas MAE-timing study -- the Asia/Monday sibling of
// analysis/mae_timing_study.mjs (Level Atlas's own study, which found: a
// fade trade that's already given back ~75% of its stop distance goes on to
// lose ~2x more often than one that hasn't, at every horizon checked --
// motivating the live SL-tightening feature). SAME method and SAME geometry
// algebra (Fib Atlas's `side: 'above'/'below'` plays the identical structural
// role as Level Atlas's `side: 'up'/'down'`, and both share `reorientExcursion`
// from levelAtlasVoteReview.js unchanged -- see asiaFibAtlasVoteReview.js's own
// header for why that reuse is safe), applied to the Fib Atlas ladders' own
// trades instead of copying a new stop-timing concept.
//
// Method: for every trade, re-walk the real M1 path from touch time to
// resolveTime (the SAME window the fixed bracket actually traded), tracking
// running-max adverse excursion as a FRACTION of that trade's own stopPips.
// At fixed elapsed-time checkpoints, snapshot whether that fraction has
// crossed a threshold (25/50/75%), for trades still open at that checkpoint.
// Split by eventual outcome (win/loss), compare crossing rates.
//
// Checkpoints are SHORTER than Level Atlas's own (2..120min vs 10..360min) --
// Fib Atlas trades resolve much faster (median ~13min, mean ~28min for
// EURUSD Asia margin>=2, vs Level Atlas's much longer holds), so Level
// Atlas's own checkpoint grid would mostly find trades already closed.
//
//   LADDER=asia    node analysis/fib_atlas_mae_timing_study.mjs
//   LADDER=monday  node analysis/fib_atlas_mae_timing_study.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getJSON } from '../js/r2Store.js';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { bisect } from '../js/barUtils.js';
import { RANGE_FIB_INSTRUMENTS } from '../js/rangeFibEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output', 'fib_atlas_mae_timing_study.csv');

const LADDER = (process.env.LADDER || 'asia').toLowerCase();
const LADDER_PREFIX = { asia: 'asia-fib-atlas', monday: 'monday-fib-atlas' };
const MIN_MARGIN = Number(process.env.MIN_MARGIN || 2); // matches this system's own vote-portfolio default
const PAIRS = RANGE_FIB_INSTRUMENTS;

const CHECKPOINTS_MIN = [2, 5, 10, 15, 20, 30, 45, 60, 90, 120];
const THRESHOLDS = [0.25, 0.5, 0.75];

async function loadTrades(pair) {
  const prefix = LADDER_PREFIX[LADDER];
  if (!prefix) throw new Error(`LADDER must be asia|monday, got "${LADDER}"`);
  const stored = await getJSON(`${prefix}/${pair}-votetrades.json`);
  if (!stored) return [];
  return stored.trades.filter(t => t.margin >= MIN_MARGIN).map(t => ({ ...t, pair }));
}

// Same geometry as Level Atlas's own walkTrade -- `side:'above'` plays the
// identical role as Level Atlas's `side:'up'` (touch approached with price
// RISING into it, sgn=+1); 'fade' bets on reversion so its stop sits on the
// CONTINUATION side (same sign as sgn), 'follow' bets on continuation so its
// stop sits on the REVERSAL side (opposite sgn) -- exactly Level Atlas's own
// stopSign convention, verified against asiaFibAtlasEngine.js's own
// fadePips/runPips/outcome geometry before writing this.
function walkTrade(trade, packed) {
  const startIdx = bisect(packed.times, trade.time);
  const endIdx = bisect(packed.times, trade.resolveTime);
  if (startIdx >= packed.n || endIdx <= startIdx) return null;

  const isAbove = trade.side === 'above';
  const sgn = isAbove ? 1 : -1;
  const stopSign = trade.decision === 'fade' ? 1 : -1;
  const stopPrice = trade.entry + stopSign * sgn * trade.stopPips * trade.pip;
  const stopDir = Math.sign(stopPrice - trade.entry) || 1;
  const stopDist = trade.stopPips * trade.pip;
  if (!(stopDist > 0)) return null;

  const snaps = new Map();
  let cpIdx = 0;
  let runningMaxAdverse = 0;
  for (let j = startIdx; j < endIdx && j < packed.n; j++) {
    const elapsedMin = (packed.times[j] - trade.time) / 60;
    const adverse = stopDir > 0 ? (packed.highs[j] - trade.entry) : (trade.entry - packed.lows[j]);
    if (adverse > runningMaxAdverse) runningMaxAdverse = adverse;
    while (cpIdx < CHECKPOINTS_MIN.length && CHECKPOINTS_MIN[cpIdx] <= elapsedMin) {
      snaps.set(CHECKPOINTS_MIN[cpIdx], Math.min(1.2, runningMaxAdverse / stopDist));
      cpIdx++;
    }
  }
  return snaps;
}

async function main() {
  console.log(`Fib Atlas MAE-timing study — ladder=${LADDER}  minMargin=${MIN_MARGIN}\n`);
  const byDecision = { fade: [], follow: [] };

  for (const pair of PAIRS) {
    const trades = await loadTrades(pair);
    if (!trades.length) continue;
    console.log(`Loading M1 for ${pair} (${trades.length} trades, margin>=${MIN_MARGIN})...`);
    const packed = await loadM1ForPair(pair);
    if (!packed) { console.log(`  no M1 available for ${pair}, skipping`); continue; }

    for (const t of trades) {
      const snaps = walkTrade(t, packed);
      if (!snaps) continue;
      const bucket = byDecision[t.decision];
      if (!bucket) continue;
      bucket.push({ ...t, snaps });
    }
  }

  const rows = [];
  for (const decision of ['fade', 'follow']) {
    const trades = byDecision[decision];
    if (!trades.length) continue;
    const wins = trades.filter(t => t.win).length;
    console.log(`\n──── ${decision.toUpperCase()} ──── ${trades.length} trades, base loss rate ${((1 - wins / trades.length) * 100).toFixed(1)}%\n`);
    console.log('checkpoint(min)  thresh  n-alive-W  n-alive-L  crossed%-W  crossed%-L  lossRate|crossed  lossRate|not-crossed  lift');

    for (const cp of CHECKPOINTS_MIN) {
      const alive = trades.filter(t => t.snaps.has(cp));
      if (alive.length < 20) continue;
      for (const th of THRESHOLDS) {
        const aliveW = alive.filter(t => t.win);
        const aliveL = alive.filter(t => !t.win);
        const crossedW = aliveW.filter(t => t.snaps.get(cp) >= th).length;
        const crossedL = aliveL.filter(t => t.snaps.get(cp) >= th).length;
        const crossedAll = alive.filter(t => t.snaps.get(cp) >= th);
        const notCrossedAll = alive.filter(t => t.snaps.get(cp) < th);
        const lossRateCrossed = crossedAll.length ? (crossedAll.filter(t => !t.win).length / crossedAll.length * 100) : null;
        const lossRateNotCrossed = notCrossedAll.length ? (notCrossedAll.filter(t => !t.win).length / notCrossedAll.length * 100) : null;
        const baseLossRate = alive.filter(t => !t.win).length / alive.length * 100;
        const lift = (lossRateCrossed != null && baseLossRate > 0) ? (lossRateCrossed / baseLossRate) : null;
        console.log([
          String(cp).padStart(6), (th * 100 + '%').padStart(6),
          String(aliveW.length).padStart(9), String(aliveL.length).padStart(9),
          aliveW.length ? (crossedW / aliveW.length * 100).toFixed(1).padStart(10) : '—'.padStart(10),
          aliveL.length ? (crossedL / aliveL.length * 100).toFixed(1).padStart(10) : '—'.padStart(10),
          lossRateCrossed != null ? lossRateCrossed.toFixed(1).padStart(16) : '—'.padStart(16),
          lossRateNotCrossed != null ? lossRateNotCrossed.toFixed(1).padStart(20) : '—'.padStart(20),
          lift != null ? ('x' + lift.toFixed(2)).padStart(6) : '—'.padStart(6),
        ].join('  '));
        rows.push({
          decision, checkpointMin: cp, threshold: th,
          nAliveWin: aliveW.length, nAliveLoss: aliveL.length,
          crossedPctWin: aliveW.length ? +(crossedW / aliveW.length * 100).toFixed(1) : null,
          crossedPctLoss: aliveL.length ? +(crossedL / aliveL.length * 100).toFixed(1) : null,
          lossRateIfCrossed: lossRateCrossed != null ? +lossRateCrossed.toFixed(1) : null,
          lossRateIfNotCrossed: lossRateNotCrossed != null ? +lossRateNotCrossed.toFixed(1) : null,
          baseLossRatePct: +baseLossRate.toFixed(1),
          lift: lift != null ? +lift.toFixed(2) : null,
        });
      }
    }
  }

  if (!rows.length) { console.log('\nNo rows produced — nothing to write.'); return; }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const header = Object.keys(rows[0]);
  const csv = [header.join(','), ...rows.map(r => header.map(h => r[h] ?? '').join(','))].join('\n');
  fs.writeFileSync(OUT, csv);
  console.log(`\nWrote ${rows.length} rows to ${OUT}`);
}

main();
