// Trade-extension exit variants, re-validated on the FIXED trade population — 2026-09-11
//
// runExitVariantStudy (js/levelAtlasVoteReview.js) was last run 2026-08-27,
// real EURUSD only, margin>=3, BEFORE this session's two look-ahead bug fixes
// and the 10-year lookback bound -- that finding ("chand/ride roughly TIE the
// fixed rule at trailFrac 1.5-2.0, still not a proven improvement") is on the
// same kind of stale population the fade-stop re-validation was built to stop
// trusting. This reruns it fresh, on the honest-book/real-OOS trades `runOne`
// (production) now builds, across the full 17-pair "recommended" set, and
// combines results through the REAL portfolio pipeline (applyConcurrencyCap +
// buildPortfolioDailySeries + portfolioStats) per runExitVariantStudy's own
// docstring warning -- not a naive pooled summarizeTrades call, which would
// silently inflate Sharpe by ignoring that several pairs share calendar days.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook, splitAt } from '../js/levelAtlasReport.js';
import { buildBarrierTrades, runExitVariantStudy, applyConcurrencyCap, buildPortfolioDailySeries } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { boundPacked, LOOKBACK_DAYS, DEFAULT_REARM } from '../js/levelAtlasRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');
const MIN_MARGIN = 3;
const MAX_CONCURRENT = 3; // matches the shared live config
const TRAIL_FRACS = [1.0, 1.5, 2.0]; // 0.5 already known bad (2026-08-27 note) -- not re-tested

const PAIRS = process.env.LA_PAIRS ? process.env.LA_PAIRS.split(',') : ['eurusd', 'gbpusd', 'usdjpy', 'audusd',
  'usdchf', 'euraud', 'eurchf', 'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

// Per-pair: honest-book real-OOS trades, margin>=3, concurrency-capped --
// the SAME population level-atlas-vote-portfolio.html's default config uses.
const perPairCapped = {}, perPairPacked = {}, perPairCost = {};
for (const pair of PAIRS) {
  console.log(`${pair.toUpperCase()}: loading M1...`);
  const packed0 = await loadM1ForPair(pair);
  const packed = boundPacked(packed0, LOOKBACK_DAYS);
  const assetClass = assetClassFor(pair);
  const cost = costForPair(pair, assetClass);
  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM], pendingRearmFrac: DEFAULT_REARM });
  const atRearm = touches.filter(t => t.rearmFrac === DEFAULT_REARM);
  const { split: realSplit } = splitAt(atRearm);
  const isOnly = atRearm.filter(t => t.date < realSplit);
  const honestBook = buildAtlasBook(isOnly, { rearmFrac: DEFAULT_REARM });
  const trades = buildBarrierTrades(touches, honestBook, { rearmFrac: DEFAULT_REARM, cost, oosStartDate: realSplit })
    .filter(t => t.margin >= MIN_MARGIN);
  const capped = applyConcurrencyCap(trades, { maxConcurrent: MAX_CONCURRENT }).kept ?? [];
  console.log(`  ${trades.length} real-OOS margin>=3 trades -> ${capped.length} after concurrency cap`);
  perPairCapped[pair.toUpperCase()] = capped;
  perPairPacked[pair.toUpperCase()] = packed;
  perPairCost[pair.toUpperCase()] = cost;
}

function combinedStats(perPairTradesLike) {
  const weights = Object.fromEntries(Object.keys(perPairTradesLike).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(perPairTradesLike, { weights });
  return portfolioStats(combined.dailyReturns, { mc: false, targetVol: 10 });
}

// Baseline (fixed rung target/stop) -- combined once, same for every trailFrac.
const baselinePerPair = {};
for (const sym of Object.keys(perPairCapped)) {
  baselinePerPair[sym] = perPairCapped[sym].map(t => ({ pnlPct: t.pnlPct, date: t.date, pair: sym }));
}
const baselineStats = combinedStats(baselinePerPair);
console.log(`\nBASELINE (fixed rung, current live config): Sharpe ${baselineStats.sharpe?.toFixed(2)}  CAGR ${baselineStats.cagr?.toFixed(1)}%  maxDD ${baselineStats.maxDD?.toFixed(1)}%`);

for (const trailFrac of TRAIL_FRACS) {
  console.log(`\n${'='.repeat(80)}\ntrailFrac = ${trailFrac}\n${'='.repeat(80)}`);
  const chandPerPair = {}, ridePerPair = {}, beRidePerPair = {};
  let maxDiffAcrossPairs = 0, totalUnmatched = 0, totalN = 0;
  for (const sym of Object.keys(perPairCapped)) {
    const study = runExitVariantStudy(perPairCapped[sym], perPairPacked[sym], { trailFrac, beTrigger: 0.5, cost: perPairCost[sym] });
    if (!study) continue;
    maxDiffAcrossPairs = Math.max(maxDiffAcrossPairs, study.crossCheck.maxAbsDiffPct);
    totalUnmatched += study.unmatched; totalN += study.n;
    chandPerPair[sym] = study.rows.map(r => ({ pnlPct: r.chandPnl, date: r.date, pair: sym }));
    ridePerPair[sym] = study.rows.map(r => ({ pnlPct: r.ridePnl, date: r.date, pair: sym }));
    beRidePerPair[sym] = study.rows.map(r => ({ pnlPct: r.beRidePnl, date: r.date, pair: sym }));
  }
  console.log(`  matched ${totalN}, unmatched ${totalUnmatched} (${(totalUnmatched / (totalN + totalUnmatched) * 100).toFixed(1)}%), max cross-check diff ${maxDiffAcrossPairs.toFixed(4)}pp`);
  const chandStats = combinedStats(chandPerPair);
  const rideStats = combinedStats(ridePerPair);
  const beRideStats = combinedStats(beRidePerPair);
  console.log(`  CHAND (trail from bar 0, capped at TP): Sharpe ${chandStats.sharpe?.toFixed(2)}  CAGR ${chandStats.cagr?.toFixed(1)}%  maxDD ${chandStats.maxDD?.toFixed(1)}%`);
  console.log(`  RIDE  (trail from bar 0, no TP cap):     Sharpe ${rideStats.sharpe?.toFixed(2)}  CAGR ${rideStats.cagr?.toFixed(1)}%  maxDD ${rideStats.maxDD?.toFixed(1)}%`);
  console.log(`  BERIDE (fixed to TP, then BE+trail):     Sharpe ${beRideStats.sharpe?.toFixed(2)}  CAGR ${beRideStats.cagr?.toFixed(1)}%  maxDD ${beRideStats.maxDD?.toFixed(1)}%`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'vote_atlas_exit_variant_revalidate.json'), JSON.stringify({ baselineStats, trailFracsTested: TRAIL_FRACS }, null, 1));
console.log(`\nWrote ${OUT_DIR}/vote_atlas_exit_variant_revalidate.json`);
