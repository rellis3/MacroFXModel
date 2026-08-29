// Persists the ONE validated p90 finding (analysis/p90_empirical_outer_backtest.mjs,
// 2026-08-29) as a real, servable trade list -- the 90th percentile of each
// pair's own IS runPips distribution as the fade stop, unconditional (no vote
// margin -- p90's sample is too thin for voteDecision to ever fire, checked
// directly against real data), priced OOS only. NOT the whole p75-p90 "band"
// loosely described earlier -- verification with real per-pair spread costs
// killed p75 outright (OOS Sharpe went negative, per-trade Sharpe ~0) and left
// p80 marginal at best; only p90 held up across portfolio Sharpe, per-trade
// Sharpe, and a cross-pair heat-cap sensitivity check.
//
// Reads the touch cache analysis/p90_fade_study.mjs writes
// ({pair}-p90touches.json) -- run that first if it doesn't exist. Writes
// {pair}-p90votetrades.json in the SAME directory and SAME trade shape as
// buildBarrierTrades' output, so it merges into the existing vote-portfolio
// pipeline (js/levelAtlasRoutes.js) with no new trade-shape handling needed.
// Same "OOS trades only" convention the existing {pair}-votetrades.json files
// already use (buildBarrierTrades filters to t.date >= book.splitDate before
// persisting) -- not a new lookahead-prone convention.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { reorientExcursion } from '../js/levelAtlasVoteReview.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'analysis', 'output', 'level-atlas-vote-trades');
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const PERCENTILE = 90;

function pctileOf(sortedArr, p) {
  if (!sortedArr.length) return null;
  return sortedArr[Math.min(sortedArr.length - 1, Math.floor(p / 100 * sortedArr.length))];
}

function priceP90(t, stopDist, cost) {
  const denom = t.open > 0 ? t.open : null;
  if (denom == null || t.innerDistPips == null) return null;
  const outerHit = t.runPips >= stopDist;
  const outcome = outerHit ? 'out' : t.outcome;
  if (outcome === 'neither') return null;
  const win = outcome === 'back'; // always fade
  const pnlPips = win ? t.innerDistPips : -stopDist;
  const pnlPct = +((pnlPips * t.pip / denom * 100) - cost).toFixed(4);
  return { win, pnlPct, targetPips: t.innerDistPips, stopPips: stopDist };
}

let builtCount = 0;
for (const pair of PAIRS) {
  const file = path.join(DIR, `${pair}-p90touches.json`);
  if (!fs.existsSync(file)) { console.log(`${pair}: no touch cache, skipping (run analysis/p90_fade_study.mjs first)`); continue; }
  const { instrument, splitDate, touches } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const isTouches = touches.filter(t => t.date < splitDate);
  const oosTouches = touches.filter(t => t.date >= splitDate);
  const isRunPips = isTouches.map(t => t.runPips).sort((a, b) => a - b);
  const stopDist = pctileOf(isRunPips, PERCENTILE);
  if (stopDist == null) { console.log(`${pair}: not enough IS touches to fit a stop, skipping`); continue; }

  const cost = costForPair(pair, assetClassFor(pair));
  const trades = [];
  for (const t of oosTouches) {
    const priced = priceP90(t, stopDist, cost);
    if (!priced) continue;
    const { mfePips, maePips } = reorientExcursion(t, 'fade');
    trades.push({
      instrument, date: t.date, time: t.time, resolveTime: t.resolveTime ?? (t.time + 86400),
      side: t.side, rung: 'p90', session: t.session ?? null, entry: t.level, pip: t.pip,
      decision: 'fade', margin: null, // no vote -- see header comment
      targetPips: priced.targetPips, stopPips: priced.stopPips,
      mfePips: +mfePips.toFixed(1), maePips: +Math.abs(maePips).toFixed(1),
      win: priced.win, pnlPct: priced.pnlPct,
    });
  }
  const wins = trades.filter(t => t.win).length;
  const out = { instrument, splitDate, percentile: PERCENTILE, stopPipsByPair: +stopDist.toFixed(1), cost, generatedAt: new Date().toISOString(), trades };
  fs.writeFileSync(path.join(DIR, `${pair}-p90votetrades.json`), JSON.stringify(out));
  console.log(`${pair}: stop=${stopDist.toFixed(1)}pips (p${PERCENTILE} of IS runPips), ${trades.length} OOS trades, win rate ${trades.length ? (wins / trades.length * 100).toFixed(1) : '—'}%`);
  builtCount++;
}
console.log(`\nBuilt ${builtCount}/${PAIRS.length} pairs' p90 votetrades files.`);
