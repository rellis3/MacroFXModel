// MAE-timing study: does an eventual LOSER's adverse excursion diverge from
// an eventual WINNER's early enough, and by enough, to justify an early-kill
// rule tighter than the fixed bracket stop? Pure offline analysis against the
// already-OOS-validated votetrades cache (analysis/output/level-atlas-vote-trades/,
// the exact dataset oos_validate_currency_loss_gate.mjs uses) -- does NOT
// touch volatility_bot_v2 or any live config. Answers the user's question
// ("is there anything we can do to understand better when a loss is a loss
// and kill it") with real numbers before anything gets proposed as a v2.1
// bot change.
//
// Method: for every trade, re-walk the real M1 path from touch time to
// resolveTime (the SAME window the fixed bracket actually traded), tracking
// the running-max adverse excursion as a FRACTION of that trade's own
// stopPips. At fixed elapsed-time checkpoints, snapshot whether that
// fraction has already crossed a threshold (25/50/75%), for every trade
// still open at that checkpoint (a trade that already resolved by then
// can't be "checked" at that checkpoint -- excluded, not counted as 0%).
// Then split by the trade's EVENTUAL outcome (win/loss) and compare crossing
// rates -- if losers cross much earlier/more often than winners at the same
// elapsed time, that is an actionable, non-lookahead early-kill signal.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { bisect } from '../js/barUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, 'output', 'level-atlas-vote-trades');
const OUT = path.join(__dirname, 'output', 'mae_timing_study.csv');

const MIN_MARGIN = 3; // matches the live bot's default minMargin gate
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

const CHECKPOINTS_MIN = [10, 20, 30, 45, 60, 90, 120, 180, 240, 360];
const THRESHOLDS = [0.25, 0.5, 0.75];

function loadTrades(pair) {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, `${pair}-votetrades.json`), 'utf8'));
  return raw.trades.filter(t => t.margin >= MIN_MARGIN).map(t => ({ ...t, pair }));
}

// For one trade + its packed M1 bars, returns a Map<checkpointMin, fractionOfStopSoFar>
// for every checkpoint the trade was STILL OPEN at (skips checkpoints reached
// after resolveTime -- nothing to snapshot, the trade was already closed).
function walkTrade(trade, packed) {
  const startIdx = bisect(packed.times, trade.time);
  const endIdx = bisect(packed.times, trade.resolveTime);
  if (startIdx >= packed.n || endIdx <= startIdx) return null;

  // Direction of the stop relative to entry: fade bets stop is on the
  // continuation side (away from the touch level, same direction as the
  // approach), follow's stop is on the retracement side -- same sign algebra
  // `runExitVariantStudy`/priceBarrierTrade's callers already use.
  const isUp = trade.side === 'up';
  const sgn = isUp ? 1 : -1;
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
  const m1Cache = new Map();
  const byDecision = { fade: [], follow: [] };

  for (const pair of PAIRS) {
    const trades = loadTrades(pair);
    if (!trades.length) continue;
    console.log(`Loading M1 for ${pair} (${trades.length} trades, margin>=${MIN_MARGIN})...`);
    const packed = await loadM1ForPair(pair);
    if (!packed) { console.log(`  no M1 available for ${pair}, skipping`); continue; }
    m1Cache.set(pair, packed);

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
      if (alive.length < 20) continue; // not enough sample this far out
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

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const header = Object.keys(rows[0]);
  const csv = [header.join(','), ...rows.map(r => header.map(h => r[h] ?? '').join(','))].join('\n');
  fs.writeFileSync(OUT, csv);
  console.log(`\nWrote ${rows.length} rows to ${OUT}`);
}

main();
