// p90 fade study -- is the outermost rung of the Level Atlas ladder
// (currently EXCLUDED everywhere by the `excludeRungs: ['p90']` default,
// js/levelAtlasVoteReview.js:87-90) actually tradeable? p90 has always been
// unpriceable as a real bracket trade because a FADE there needs a stop
// beyond p90 and none exists in the 3-rung ladder (RUNGS = ['p50','p75','p90'],
// js/levelAtlasEngine.js:47) -- not because the touches don't exist or the
// vote can't be computed (buildAtlasBook already aggregates p90 same as
// every other rung, js/levelAtlasReport.js:177).
//
// Fix used here: synthesize the missing outer boundary by projecting the
// SAME p75->p90 gap width one more increment past p90 (symmetric with the
// inner distance) -- the same spacing logic the existing p50/p75 rungs
// already lean on, not a new assumption. Then price p90 touches with the
// EXACT SAME barrier pricing already validated for p50/p75
// (js/levelAtlasVoteReview.js's priceBarrierTrade), and combine into a
// portfolio the same way analysis/sl_tightening_backtest.mjs does, so
// results are directly comparable to what's already deployed.
//
// IMPORTANT deviation from the p50/p75 methodology, found while building
// this: the margin-conditioned VOTE (voteDecision) cannot fire for p90 at
// all -- checked directly against real data (EURUSD: 0 of 489 OOS p90
// touches got a vote). p90's sample is much thinner than p50/p75 (~1,270
// touches vs many more), so no dimension bucket clears the book's own
// "holds out-of-sample" bar `annotateHolds` requires, and voteDecision
// returns null whenever zero dimensions match. So this tests the simpler,
// more honest question the sample size actually supports: does p90's OWN
// base-rate lean (retrace back to p75 vs continue) hold up OOS, traded
// UNCONDITIONALLY (no margin gate) -- closer to what a trader watching the
// chart actually reacts to than a dimension-conditioned vote would be.
//
// Re-deriving the synthetic-outer outcome needs NO second M1 walk: atlasWalk's
// own resolve loop (js/levelAtlasEngine.js:432-439) tracks `extreme` as a
// RUNNING max continuation distance, updated every bar up to (and including)
// the bar where it finally breaks on an inner hit (or reaches the end of all
// M1 data for a 'neither' touch, since outer=null for p90 means the loop
// only ever breaks on inner or end-of-data). So `runPips` (the touch's own,
// already-computed final `extreme` distance) already tells us whether the
// synthetic outer was EVER reached before the original resolution point:
// runPips >= syntheticOuterDist => outer was hit at or before the original
// break bar => resolves 'out' under the synthetic rule (ties broken toward
// 'out', matching atlasWalk's own check-outer-before-inner order). Otherwise
// the original outcome ('back' or 'neither') stands unchanged. Pure algebra
// on existing fields -- no M1 re-walk, no lookahead beyond what atlasWalk
// itself already computed causally.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook } from '../js/levelAtlasReport.js';
import { applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries, reorientExcursion } from '../js/levelAtlasVoteReview.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { portfolioStats } from '../js/backtestStats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output', 'p90_fade_study.csv');

const MAX_CONCURRENT = 1, RISK_PCT = 0.5, REARM_FRAC = 0.3, COST = 0;
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

function priceP90(t, decision, splitOuterDist) {
  const target = decision === 'fade' ? t.innerDistPips : splitOuterDist;
  const stop = decision === 'fade' ? splitOuterDist : t.innerDistPips;
  const denom = t.open > 0 ? t.open : null;
  if (denom == null) return null;
  // The synthetic-outer re-derivation, per this file's header comment:
  // runPips already captures the full running-max continuation distance up
  // to the original break point (inner-hit or end-of-data), so comparing it
  // to the synthetic outer's distance tells us, with no second M1 walk,
  // whether that wider barrier was reached first.
  const outerHit = t.runPips >= splitOuterDist;
  const outcome = outerHit ? 'out' : t.outcome; // t.outcome is 'back' or 'neither' here (never 'out' -- original outer was null)
  if (outcome === 'neither') return null; // genuinely unresolved -- excluded, same as every other rung's backtest
  const win = (decision === 'fade' && outcome === 'back') || (decision === 'follow' && outcome === 'out');
  const pnlPips = win ? target : -stop;
  const pnlPct = +((pnlPips * t.pip / denom * 100) - COST).toFixed(4);
  return { win, pnlPct, outcome, targetPips: target, stopPips: stop };
}

async function main() {
  const perPairTrades = {};
  const summaryRows = [];

  for (const pair of PAIRS) {
    console.log(`Loading M1 + walking ladder for ${pair}...`);
    const packed = await loadM1ForPair(pair);
    if (!packed) { console.log(`  no M1 for ${pair}, skipping`); continue; }
    const assetClass = assetClassFor(pair);
    const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [REARM_FRAC], pendingRearmFrac: REARM_FRAC });
    if (!touches.length) { console.log(`  no touches for ${pair}, skipping`); continue; }
    const book = buildAtlasBook(touches, { rearmFrac: REARM_FRAC });
    if (!book) { console.log(`  no book for ${pair}, skipping`); continue; }

    // Unconditional fade (no vote gate -- see header comment for why): every
    // p90 touch bets on retracement back to p75. Priced identically IS and
    // OOS so the two can be compared honestly -- IS isn't "the model," it's
    // just a consistency check (does the edge look similar before/after the
    // split, or is OOS a totally different animal).
    const priceAll = (list) => {
      const trades = [];
      let unresolved = 0;
      for (const t of list) {
        const priced = priceP90(t, 'fade', t.innerDistPips);
        if (!priced) { unresolved++; continue; }
        const { mfePips, maePips } = reorientExcursion(t, 'fade');
        trades.push({
          instrument: pair.toUpperCase(), date: t.date, time: t.time,
          side: t.side, rung: 'p90', entry: t.level, pip: t.pip,
          decision: 'fade', margin: null,
          targetPips: priced.targetPips, stopPips: priced.stopPips,
          mfePips: +mfePips.toFixed(1), maePips: +Math.abs(maePips).toFixed(1),
          win: priced.win, pnlPct: priced.pnlPct,
          // resolveTime approximation for concurrency-cap purposes only (see
          // header comment -- we don't know the exact synthetic-outer-hit bar,
          // only that it happened at or before the original break point).
          resolveTime: t.resolveTime ?? (t.time + 86400),
          pair: pair.toUpperCase(),
        });
      }
      return { trades, unresolved };
    };

    const p90All = touches.filter(t => t.rung === 'p90' && t.rearmFrac === REARM_FRAC);

    // Cache the raw p90 touches (minimal fields) so a follow-up script can
    // test DIFFERENT outer-boundary choices (e.g. an empirical percentile of
    // runPips instead of this file's symmetric assumption) without re-paying
    // atlasWalk's cost -- that's the expensive step (M1 load + full ladder
    // walk per pair), not the pricing/backtest, which is cheap and worth
    // iterating on separately.
    const cacheDir = path.join(__dirname, 'output', 'level-atlas-vote-trades');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, `${pair}-p90touches.json`),
      JSON.stringify({
        instrument: pair.toUpperCase(), splitDate: book.splitDate,
        touches: p90All.map(t => ({
          date: t.date, time: t.time, side: t.side, level: t.level, pip: t.pip, open: t.open,
          innerDistPips: t.innerDistPips, runPips: t.runPips, fadePips: t.fadePips,
          outcome: t.outcome, resolveTime: t.resolveTime,
        })),
      })
    );

    const isP90 = p90All.filter(t => t.date < book.splitDate);
    const oosP90 = p90All.filter(t => t.date >= book.splitDate);
    const isResult = priceAll(isP90);
    const oosResult = priceAll(oosP90);

    perPairTrades[pair.toUpperCase()] = oosResult.trades;
    const isWinRate = isResult.trades.length ? isResult.trades.filter(t => t.win).length / isResult.trades.length * 100 : null;
    const oosWinRate = oosResult.trades.length ? oosResult.trades.filter(t => t.win).length / oosResult.trades.length * 100 : null;
    console.log(`  ${pair}: IS ${isP90.length} touches / ${isResult.trades.length} priced, win rate ${isWinRate?.toFixed(1) ?? '—'}%  |  OOS ${oosP90.length} touches / ${oosResult.trades.length} priced, win rate ${oosWinRate?.toFixed(1) ?? '—'}%`);
    summaryRows.push({
      pair: pair.toUpperCase(),
      isTouches: isP90.length, isTraded: isResult.trades.length, isWinRatePct: isWinRate != null ? +isWinRate.toFixed(1) : null,
      oosTouches: oosP90.length, oosTraded: oosResult.trades.length, oosWinRatePct: oosWinRate != null ? +oosWinRate.toFixed(1) : null,
    });
  }

  const allTrades = Object.values(perPairTrades).flat();
  console.log(`\nTotal OOS p90 unconditional-fade trades across ${PAIRS.length} pairs: ${allTrades.length}`);
  if (!allTrades.length) { console.log('Nothing to backtest.'); return; }

  // Portfolio backtest -- same concurrency-cap + fixed-risk + combine
  // methodology as analysis/sl_tightening_backtest.mjs, so this is directly
  // comparable to what's already validated (and deployed) for p50/p75.
  const cappedByPair = {};
  for (const pair of Object.keys(perPairTrades)) {
    const capped = applyConcurrencyCap(perPairTrades[pair], { maxConcurrent: MAX_CONCURRENT });
    cappedByPair[pair] = riskAdjustTrades(capped?.kept ?? [], RISK_PCT).map(t => ({ ...t, pair }));
  }
  const weights = Object.fromEntries(Object.keys(cappedByPair).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(cappedByPair, { weights });
  if (!combined || !combined.dailyReturns.length) { console.log('No combinable daily series (too few trades).'); return; }
  const ps = portfolioStats(combined.dailyReturns, { mc: false });
  const riskAdjAll = Object.values(cappedByPair).flat();
  const losers = riskAdjAll.filter(t => !t.win);
  const avgLossRiskAdjPct = losers.length ? losers.reduce((a, t) => a + t.pnlPct, 0) / losers.length : null;
  const gp = riskAdjAll.filter(t => t.win).reduce((a, t) => a + t.pnlPct, 0);
  const gl = -losers.reduce((a, t) => a + t.pnlPct, 0);
  const pf = gl > 1e-9 ? gp / gl : null;

  console.log(`\n──── PORTFOLIO (p90 unconditional fade, OOS, ${RISK_PCT}% risk/trade) ────`);
  console.log(`trades=${riskAdjAll.length}  winRate=${(riskAdjAll.filter(t => t.win).length / riskAdjAll.length * 100).toFixed(1)}%  sharpe=${ps.sharpe}  maxDD=${ps.maxDD}%  CAGR=${ps.cagr}%  annVol=${ps.annVol}%  PF=${pf?.toFixed(2)}  avgLoss(riskAdj)=${avgLossRiskAdjPct?.toFixed(3)}%  tradingDays=${combined.dailyReturns.length}`);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const header = Object.keys(summaryRows[0]);
  const csv = [header.join(','), ...summaryRows.map(r => header.map(h => r[h] ?? '').join(','))].join('\n');
  fs.writeFileSync(OUT, csv);
  console.log(`\nWrote per-pair summary to ${OUT}`);
}

main();
