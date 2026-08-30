// Persists the ONE validated early-exit finding (analysis/early_exit_no_releverage_backtest.mjs,
// 2026-08-29): threshold=0.4 was the empirical peak, consistent in BOTH IS
// and OOS (unlike everything else tested this session, this curve has a
// real peak and reverses on both sides instead of running to the edge of
// the grid) -- position sizing stays anchored to each trade's ORIGINAL,
// unchanged stopPips (so a winner's risk-adjusted pnlPct is mathematically
// identical whether this is on or off), and only the exit trigger changes:
// if the real M1 path shows adverse excursion crossing 40% of the original
// stop distance before the trade would normally resolve, exit there instead
// -- a genuinely smaller realized loss, not a re-levered win.
//
// IMPORTANT, stated plainly: the backtested Sharpe for this (7.65 at a
// realistic 1% heat cap, OOS) is almost certainly still too high to expect
// live -- its own honest 95% CI is [5.79, 9.51], entirely above any
// believable range for a real strategy. Trust the SHAPE of the finding
// (avg win unchanged, avg loss and drawdown genuinely reduced), not the
// Sharpe number. This is disclosed on the portfolio page UI itself, not
// just here.
//
// Reads the existing {pair}-votetrades.json files directly (no new touch
// cache needed -- unlike p90, this doesn't need atlasWalk, just the already-
// built vote trades + a fresh M1 load to walk each trade's real path once).
// Writes {pair}-earlyexit-votetrades.json in the SAME trade shape, OOS only
// (matching every other persisted file's convention), so it merges into the
// existing vote-portfolio pipeline with no new trade-shape handling.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { bisect } from '../js/barUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'analysis', 'output', 'level-atlas-vote-trades');
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const MIN_MARGIN = 3;
const THRESHOLD = 0.4;

// Same path-walk as early_exit_no_releverage_backtest.mjs's findEarlyExitBar,
// specialized to one threshold and returning the crossing time directly.
function findEarlyExitTime(trade, packed) {
  const startIdx = bisect(packed.times, trade.time);
  const endIdx = bisect(packed.times, trade.resolveTime);
  if (startIdx >= packed.n || endIdx <= startIdx) return null;
  const isUp = trade.side === 'up';
  const sgn = isUp ? 1 : -1;
  const stopPrice = trade.entry + sgn * trade.stopPips * trade.pip; // fade only -- stopSign=1
  const stopDir = Math.sign(stopPrice - trade.entry) || 1;
  const stopDist = trade.stopPips * trade.pip;
  if (!(stopDist > 0)) return null;
  let runningMaxAdverse = 0;
  for (let j = startIdx; j < endIdx && j < packed.n; j++) {
    const adverse = stopDir > 0 ? (packed.highs[j] - trade.entry) : (trade.entry - packed.lows[j]);
    if (adverse > runningMaxAdverse) runningMaxAdverse = adverse;
    if (runningMaxAdverse / stopDist >= THRESHOLD) return packed.times[j];
  }
  return null;
}

let builtCount = 0;
for (const pair of PAIRS) {
  console.log(`Loading M1 + trades for ${pair}...`);
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, `${pair}-votetrades.json`), 'utf8'));
  const oosTrades = raw.trades.filter(t => t.margin >= MIN_MARGIN && t.decision === 'fade' && t.date >= raw.splitDate);
  const packed = await loadM1ForPair(pair);
  if (!packed) { console.log(`  no M1 for ${pair}, skipping`); continue; }

  const cost = raw.cost ?? 0;
  const trades = oosTrades.map(t => {
    const crossTime = findEarlyExitTime(t, packed);
    if (crossTime == null) return t; // never crossed -- unchanged, including all winners not caught
    const denom = t.entry > 0 ? t.entry : null;
    if (denom == null) return t;
    const pnlPips = -THRESHOLD * t.stopPips;
    const pnlPct = +((pnlPips * t.pip / denom * 100) - cost).toFixed(4);
    // stopPips UNCHANGED -- the whole point: riskAdjustTrades sizes off the
    // ORIGINAL stop distance, so this comes out as a genuine fraction of the
    // original risk, not a re-levered one.
    return { ...t, win: false, pnlPct, resolveTime: crossTime };
  });

  const changed = trades.filter((t, i) => t.pnlPct !== oosTrades[i].pnlPct).length;
  const out = { instrument: raw.instrument, splitDate: raw.splitDate, threshold: THRESHOLD, cost, generatedAt: new Date().toISOString(), trades };
  fs.writeFileSync(path.join(DIR, `${pair}-earlyexit-votetrades.json`), JSON.stringify(out));
  console.log(`${pair}: ${trades.length} OOS fade trades, ${changed} re-priced by the early-exit rule (threshold=${THRESHOLD})`);
  builtCount++;
}
console.log(`\nBuilt ${builtCount}/${PAIRS.length} pairs' early-exit votetrades files.`);
