// Chandelier-on-continuation study -- does a chandelier trail help
// specifically on FOLLOW (continuation) decisions, where the trade's own
// thesis is momentum, not on FADE (reversion) decisions where the earlier
// pooled fade+follow test (analysis/beride_exit_study.mjs) found the exit
// variants (chand/ride/beride) all underperformed the fixed rule?
//
// Same validated harness (js/levelAtlasVoteReview.js's runExitVariantStudy,
// js/forecastAnalyser.js's simulateExitVariants), same cached real trades,
// same IS/OOS discipline as beride_exit_study.mjs -- filtered to
// decision==='follow' only. Fit criterion is `ride` (the classic uncapped
// chandelier trail) as the primary hypothesis under test here; chand/beRide
// are reported alongside for context, no extra compute cost (all three come
// out of the same runExitVariantStudy call).
//
// IS/OOS: same nested-split reasoning as beride_exit_study.mjs -- the cached
// trades are already the underlying vote-margin book's OWN OOS population
// (voteDecision is never evaluated on IS touches), so trailFrac is fit on
// the earlier 70% of each pair's FOLLOW-only trades and applied to the
// later 30%, unchanged.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { runExitVariantStudy } from '../js/levelAtlasVoteReview.js';
import { summarizeTrades } from '../js/metricsCore.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, 'output', 'level-atlas-vote-trades');
const OUT = path.join(__dirname, 'output', 'chandelier_follow_study.json');
const TRAILFRAC_GRID = [0.75, 1.0, 1.5, 2.0, 2.5];
const MIN_MARGIN = 3;
const EXIT_SPLIT_FRAC = 0.7;
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

function fmt(x) { return x == null ? '—' : (+x).toFixed(4); }

async function main() {
  const perPair = {};

  for (const pair of PAIRS) {
    const file = path.join(DIR, `${pair}-votetrades.json`);
    if (!fs.existsSync(file)) { console.log(`  no cached trades for ${pair}, skipping`); continue; }
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    const trades = (d.trades || []).filter(t => t.margin >= MIN_MARGIN && t.decision === 'follow');
    if (!trades.length) { console.log(`  0 margin>=${MIN_MARGIN} follow trades for ${pair}, skipping`); continue; }
    const sortedDates = trades.map(t => t.date).slice().sort();
    const exitSplitDate = sortedDates[Math.floor(sortedDates.length * EXIT_SPLIT_FRAC)];
    console.log(`Loading M1 for ${pair} (${trades.length} margin>=${MIN_MARGIN} FOLLOW trades, exit-split ${exitSplitDate})...`);
    let packed;
    try { packed = await loadM1ForPair(pair); } catch (e) { console.log(`  M1 load failed: ${e.message}`); continue; }
    if (!packed || !packed.n) { console.log(`  no M1, skipping`); continue; }
    const isTrades = trades.filter(t => t.date < exitSplitDate);
    const oosTrades = trades.filter(t => t.date >= exitSplitDate);
    perPair[pair] = { packed, isTrades, oosTrades, cost: costForPair(pair, assetClassFor(pair)) };
  }

  const pairs = Object.keys(perPair);
  if (!pairs.length) { console.log('No usable pairs. Stopping.'); return; }

  console.log(`\n==== FIT: trailFrac grid search on IS only (pooled across ${pairs.length} pairs, FOLLOW-only) ====`);
  let best = null;
  const gridReport = [];
  for (const trailFrac of TRAILFRAC_GRID) {
    let pooledFixed = [], pooledRide = [], pooledDates = [], nTotal = 0, unmatchedTotal = 0;
    for (const pair of pairs) {
      const { packed, isTrades, cost } = perPair[pair];
      const res = runExitVariantStudy(isTrades, packed, { trailFrac, cost });
      if (!res) continue;
      nTotal += res.n; unmatchedTotal += res.unmatched;
      for (const r of res.rows) { pooledFixed.push(r.fixedPnl); pooledRide.push(r.ridePnl); pooledDates.push(r.date); }
    }
    const fixedS = summarizeTrades(pooledFixed, pooledDates);
    const rideS = summarizeTrades(pooledRide, pooledDates);
    const meanDelta = (rideS.expectancy ?? 0) - (fixedS.expectancy ?? 0);
    console.log(`  trailFrac=${trailFrac}  n=${nTotal} (unmatched ${unmatchedTotal})  `
      + `fixed[mean=${fmt(fixedS.expectancy)} sharpe=${fmt(fixedS.sharpe)} winRate=${fmt(fixedS.winRate)}]  `
      + `ride[mean=${fmt(rideS.expectancy)} sharpe=${fmt(rideS.sharpe)} winRate=${fmt(rideS.winRate)}]  `
      + `meanDelta=${fmt(meanDelta)}`);
    gridReport.push({ trailFrac, n: nTotal, fixed: fixedS, ride: rideS, meanDelta });
    if (!best || meanDelta > best.meanDelta) best = { trailFrac, meanDelta };
  }
  console.log(`\nBest IS trailFrac = ${best.trailFrac} (mean pnl delta ${fmt(best.meanDelta)}) -- FREEZING and applying to OOS.`);

  console.log(`\n==== FROZEN trailFrac=${best.trailFrac} -- PER-PAIR (OOS, FOLLOW-only) ====`);
  const perPairResults = {};
  let pooledOosFixed = [], pooledOosChand = [], pooledOosRide = [], pooledOosBeRide = [], pooledOosDates = [];
  for (const pair of pairs) {
    const { packed, oosTrades, cost } = perPair[pair];
    const res = runExitVariantStudy(oosTrades, packed, { trailFrac: best.trailFrac, cost });
    if (!res) { console.log(`  ${pair}: no OOS result`); continue; }
    perPairResults[pair] = res;
    console.log(`  ${pair}: n=${res.n} unmatched=${res.unmatched} crossCheck.maxAbsDiffPct=${res.crossCheck.maxAbsDiffPct}`);
    console.log(`    fixed  total=${fmt(res.fixed.totalPnl)}  mean=${fmt(res.fixed.expectancy)}  winRate=${fmt(res.fixed.winRate)}  sharpe=${fmt(res.fixed.sharpe)}`);
    console.log(`    chand  total=${fmt(res.chand.totalPnl)}  mean=${fmt(res.chand.expectancy)}  winRate=${fmt(res.chand.winRate)}  sharpe=${fmt(res.chand.sharpe)}`);
    console.log(`    ride   total=${fmt(res.ride.totalPnl)}  mean=${fmt(res.ride.expectancy)}  winRate=${fmt(res.ride.winRate)}  sharpe=${fmt(res.ride.sharpe)}`);
    console.log(`    beRide total=${fmt(res.beRide.totalPnl)}  mean=${fmt(res.beRide.expectancy)}  winRate=${fmt(res.beRide.winRate)}  sharpe=${fmt(res.beRide.sharpe)}`);
    for (const r of res.rows) {
      pooledOosFixed.push(r.fixedPnl); pooledOosChand.push(r.chandPnl); pooledOosRide.push(r.ridePnl); pooledOosBeRide.push(r.beRidePnl);
      pooledOosDates.push(r.date);
    }
  }

  console.log(`\n==== POOLED OOS across ${pairs.length} pairs, FOLLOW-only (NOT concurrency-adjusted -- illustrative magnitude only) ====`);
  const pFixed = summarizeTrades(pooledOosFixed, pooledOosDates);
  const pChand = summarizeTrades(pooledOosChand, pooledOosDates);
  const pRide = summarizeTrades(pooledOosRide, pooledOosDates);
  const pBeRide = summarizeTrades(pooledOosBeRide, pooledOosDates);
  console.log(`  n=${pooledOosFixed.length}`);
  console.log(`  fixed  total=${fmt(pFixed.totalPnl)}  mean=${fmt(pFixed.expectancy)}  winRate=${fmt(pFixed.winRate)}  sharpe=${fmt(pFixed.sharpe)}  maxDD=${fmt(pFixed.maxDD)}`);
  console.log(`  chand  total=${fmt(pChand.totalPnl)}  mean=${fmt(pChand.expectancy)}  winRate=${fmt(pChand.winRate)}  sharpe=${fmt(pChand.sharpe)}  maxDD=${fmt(pChand.maxDD)}`);
  console.log(`  ride   total=${fmt(pRide.totalPnl)}  mean=${fmt(pRide.expectancy)}  winRate=${fmt(pRide.winRate)}  sharpe=${fmt(pRide.sharpe)}  maxDD=${fmt(pRide.maxDD)}`);
  console.log(`  beRide total=${fmt(pBeRide.totalPnl)}  mean=${fmt(pBeRide.expectancy)}  winRate=${fmt(pBeRide.winRate)}  sharpe=${fmt(pBeRide.sharpe)}  maxDD=${fmt(pBeRide.maxDD)}`);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ grid: gridReport, bestTrailFrac: best.trailFrac, perPair: perPairResults,
    pooledOos: { fixed: pFixed, chand: pChand, ride: pRide, beRide: pBeRide } }, null, 2));
  console.log(`\nWrote full results to ${OUT}`);
}

main();
