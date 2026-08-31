// beRide exit study -- portfolio-scale test of "protect at breakeven once the
// original TP is reached, then let a chandelier trail run for the excess"
// (js/forecastAnalyser.js's new 'beride' rule, added 2026-08-31), vs the
// live 'fixed' rule and the pre-existing 'chand'/'ride' variants, using the
// ALREADY-VALIDATED A/B harness (js/levelAtlasVoteReview.js's
// runExitVariantStudy) -- not a new simulation.
//
// Reuses the cached, real vote-margin trades already sitting in
// analysis/output/level-atlas-vote-trades/{pair}-votetrades.json (same data
// the live bot's decision logic is built on) -- no re-walk of atlasWalk
// needed for trade generation, only a fresh M1 load per pair for the exit
// re-simulation itself (runExitVariantStudy needs the real path past each
// trade's original resolution point).
//
// Filtered to margin>=3 (the live bot's own threshold -- LEGO_MODULES.md /
// VOLATILITY_V2_MIN_MARGIN), matching what's actually deployed.
//
// IS/OOS discipline: the cached trades are ALREADY the underlying
// vote-margin book's own OOS population ONLY (runExitVariantStudy's own doc:
// voteDecision is deliberately never evaluated on IS touches, to keep the
// margin/decision itself lookahead-free) -- checked directly (EURUSD: 0 of
// 1189 margin>=3 trades fall before book.splitDate). There is therefore no
// separate IS population to fit an exit-rule parameter on without a SECOND,
// later split carved out of this OOS-only data. trailFrac is fit on the
// EARLIER 70% of each pair's OOS trades ("exit-IS"), frozen, and applied to
// the LATER 30% ("exit-OOS") -- a fresh split for the exit-rule choice
// specifically, distinct from (and nested inside) the book's own IS/OOS
// boundary. beTrigger is not swept (not used by 'beride' at all -- see
// forecastAnalyser.js's walk(), the breakeven snap is keyed to the ORIGINAL
// TP, not a beTrigger fraction).
const EXIT_SPLIT_FRAC = 0.7;
//
// Reporting is per-pair PLUS a naive pooled summarizeTrades() across all
// pairs' rows -- the pooled number is NOT concurrency-adjusted (no
// applyConcurrencyCap/portfolio-heat combination here), so it's an
// illustrative combined magnitude only, not a real portfolio Sharpe. Flagged
// explicitly in the output, not just this comment.
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
const OUT = path.join(__dirname, 'output', 'beride_exit_study.json');
const TRAILFRAC_GRID = [1.0, 1.5, 2.0, 2.5];
const MIN_MARGIN = 3;
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

function fmt(x) { return x == null ? '—' : (+x).toFixed(4); }

async function main() {
  const perPair = {};   // pair -> { packed, isTrades, oosTrades, cost }

  for (const pair of PAIRS) {
    const file = path.join(DIR, `${pair}-votetrades.json`);
    if (!fs.existsSync(file)) { console.log(`  no cached trades for ${pair}, skipping`); continue; }
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    const trades = (d.trades || []).filter(t => t.margin >= MIN_MARGIN);
    if (!trades.length) { console.log(`  0 margin>=${MIN_MARGIN} trades for ${pair}, skipping`); continue; }
    // Fresh exit-rule split, nested inside the book's own OOS population
    // (see header) -- chronological EXIT_SPLIT_FRAC of THIS pair's own
    // margin>=3 trades, not the book's splitDate (which every one of these
    // trades already postdates).
    const sortedDates = trades.map(t => t.date).slice().sort();
    const exitSplitDate = sortedDates[Math.floor(sortedDates.length * EXIT_SPLIT_FRAC)];
    console.log(`Loading M1 for ${pair} (${trades.length} margin>=${MIN_MARGIN} trades, exit-split ${exitSplitDate})...`);
    let packed;
    try { packed = await loadM1ForPair(pair); } catch (e) { console.log(`  M1 load failed: ${e.message}`); continue; }
    if (!packed || !packed.n) { console.log(`  no M1, skipping`); continue; }
    const isTrades = trades.filter(t => t.date < exitSplitDate);
    const oosTrades = trades.filter(t => t.date >= exitSplitDate);
    perPair[pair] = { packed, isTrades, oosTrades, cost: costForPair(pair, assetClassFor(pair)) };
  }

  const pairs = Object.keys(perPair);
  if (!pairs.length) { console.log('No usable pairs. Stopping.'); return; }

  console.log(`\n==== FIT: trailFrac grid search on IS only (pooled across ${pairs.length} pairs) ====`);
  let best = null;
  const gridReport = [];
  for (const trailFrac of TRAILFRAC_GRID) {
    let pooledFixed = [], pooledBeRide = [], pooledDates = [], nTotal = 0, unmatchedTotal = 0;
    for (const pair of pairs) {
      const { packed, isTrades, cost } = perPair[pair];
      const res = runExitVariantStudy(isTrades, packed, { trailFrac, cost });
      if (!res) continue;
      nTotal += res.n; unmatchedTotal += res.unmatched;
      for (const r of res.rows) { pooledFixed.push(r.fixedPnl); pooledBeRide.push(r.beRidePnl); pooledDates.push(r.date); }
    }
    const fixedS = summarizeTrades(pooledFixed, pooledDates);
    const beRideS = summarizeTrades(pooledBeRide, pooledDates);
    const meanDelta = (beRideS.expectancy ?? 0) - (fixedS.expectancy ?? 0);
    console.log(`  trailFrac=${trailFrac}  n=${nTotal} (unmatched ${unmatchedTotal})  `
      + `fixed[mean=${fmt(fixedS.expectancy)} sharpe=${fmt(fixedS.sharpe)} winRate=${fmt(fixedS.winRate)}]  `
      + `beRide[mean=${fmt(beRideS.expectancy)} sharpe=${fmt(beRideS.sharpe)} winRate=${fmt(beRideS.winRate)}]  `
      + `meanDelta=${fmt(meanDelta)}`);
    gridReport.push({ trailFrac, n: nTotal, fixed: fixedS, beRide: beRideS, meanDelta });
    if (!best || meanDelta > best.meanDelta) best = { trailFrac, meanDelta };
  }
  console.log(`\nBest IS trailFrac = ${best.trailFrac} (mean pnl delta ${fmt(best.meanDelta)}) -- FREEZING and applying to OOS.`);

  console.log(`\n==== FROZEN trailFrac=${best.trailFrac} -- PER-PAIR (OOS) ====`);
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

  console.log(`\n==== POOLED OOS across ${pairs.length} pairs (NOT concurrency-adjusted -- illustrative magnitude only, see header) ====`);
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
