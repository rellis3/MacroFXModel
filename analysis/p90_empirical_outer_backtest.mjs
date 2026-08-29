// Does an EMPIRICAL outer boundary beat the symmetric-gap assumption
// analysis/p90_fade_study.mjs used? That first pass invented a stop distance
// (same width as the p75->p90 gap, projected one increment out) and found no
// real edge (Sharpe 0.36, PF 1.03 -- basically a coin flip with a 1:1
// payoff). The user's question: instead of making that distance up, use the
// REAL distribution of how far price actually travels once it clears p90 --
// `runPips` on every cached p90 touch already IS that distance (the
// continuation past p90 before it eventually retraces to p75 or runs out of
// data), so this grids PERCENTILES of that real distribution as candidate
// stop widths, per pair (never pooling raw pips across pairs -- pip size
// varies 100x+, same discipline runStopStudy already established).
//
// Same rigor as every other script this session: percentile fit on IS ONLY,
// frozen, applied unchanged to OOS -- not picked by eyeballing the OOS
// number that looks best.
//
// Reads the touch cache analysis/p90_fade_study.mjs writes
// (analysis/output/level-atlas-vote-trades/{pair}-p90touches.json) -- run
// that script first if the cache doesn't exist yet.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries, applyPortfolioHeatCap } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { summarizeTrades } from '../js/metricsCore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, 'output', 'level-atlas-vote-trades');
const RISK_PCT = 0.5, MAX_CONCURRENT = 1;
// Verification pass (user flagged the numbers looked too good): the first
// grid ran at COST=0 -- unrealistic, no spread/slippage at all -- and pooled
// all 17 pairs at weight=1 each with NO cross-pair heat cap, the same
// unlimited-margin convention every script this session has used (real, but
// a known source of inflated combined Sharpe -- flagged when this same
// convention produced quadruple-digit CAGRs in sl_tightening_backtest.mjs).
// Both are tested for real here instead of assumed away.
const MAX_HEAT_PCT = 2; // cross-pair exposure cap for the "with heat cap" comparison row
const PERCENTILES = [25, 40, 50, 60, 70, 75, 80, 90, 95, 97, 99, 99.5];
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

function pctileOf(sortedArr, p) {
  if (!sortedArr.length) return null;
  return sortedArr[Math.min(sortedArr.length - 1, Math.floor(p / 100 * sortedArr.length))];
}

function price(t, stopDist, cost) {
  const denom = t.open > 0 ? t.open : null;
  if (denom == null || t.innerDistPips == null) return null;
  const outerHit = t.runPips >= stopDist;
  const outcome = outerHit ? 'out' : t.outcome;
  if (outcome === 'neither') return null;
  const win = outcome === 'back'; // always fade
  const pnlPips = win ? t.innerDistPips : -stopDist;
  const pnlPct = +((pnlPips * t.pip / denom * 100) - cost).toFixed(4);
  return { win, pnlPct };
}

function toTrades(list, stopDist, pair, cost) {
  const out = [];
  for (const t of list) {
    const priced = price(t, stopDist, cost);
    if (!priced) continue;
    out.push({
      instrument: pair, date: t.date, time: t.time, pair,
      win: priced.win, pnlPct: priced.pnlPct,
      stopPips: stopDist, targetPips: t.innerDistPips,
      pip: t.pip, entry: t.level, // riskAdjustTrades needs both -- without them stopRiskPct is NaN and every trade silently zeroes out
      resolveTime: t.resolveTime ?? (t.time + 86400),
    });
  }
  return out;
}

function portfolioStatsFor(byPairTrades, { heatCap = false } = {}) {
  const capped = {};
  for (const pair of Object.keys(byPairTrades)) {
    const c = applyConcurrencyCap(byPairTrades[pair], { maxConcurrent: MAX_CONCURRENT });
    capped[pair] = riskAdjustTrades(c?.kept ?? [], RISK_PCT).map(t => ({ ...t, pair }));
  }
  let final = capped;
  if (heatCap) {
    const heatResult = applyPortfolioHeatCap(capped, { maxHeatPct: MAX_HEAT_PCT });
    if (heatResult) {
      final = {};
      for (const t of heatResult.kept) (final[t.pair] ??= []).push(t);
    }
  }
  const weights = Object.fromEntries(Object.keys(final).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(final, { weights });
  if (!combined || !combined.dailyReturns.length) return null;
  const ps = portfolioStats(combined.dailyReturns, { mc: false });
  const all = Object.values(final).flat();
  const losers = all.filter(t => !t.win);
  const gp = all.filter(t => t.win).reduce((a, t) => a + t.pnlPct, 0);
  const gl = -losers.reduce((a, t) => a + t.pnlPct, 0);
  return {
    trades: all.length,
    winRate: +(all.filter(t => t.win).length / all.length * 100).toFixed(1),
    sharpe: ps.sharpe, maxDD: ps.maxDD, cagr: ps.cagr, annVol: ps.annVol,
    pf: gl > 1e-9 ? +(gp / gl).toFixed(2) : null,
    // Tail-risk-aware fields, added on the 2nd pass after the raw-Sharpe grid
    // showed a monotonically-improving curve with no peak -- a known signature
    // of "collect small wins, rare catastrophic loss," which a short OOS
    // sample structurally can't validate on Sharpe/PF alone. psr (probabilistic
    // Sharpe ratio) is EXPLICITLY penalized for negative skew/fat tails/short
    // samples -- the right tool here, not invented for this script (backtestStats.js).
    psr: ps.psr, skew: ps.skew, cvar95: ps.cvar95, sortino: ps.sortino,
  };
}

function main() {
  const byPairCache = {};
  for (const pair of PAIRS) {
    const file = path.join(DIR, `${pair}-p90touches.json`);
    if (!fs.existsSync(file)) { console.log(`no cache for ${pair}, skipping (run p90_fade_study.mjs first)`); continue; }
    byPairCache[pair.toUpperCase()] = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  const pairs = Object.keys(byPairCache);
  console.log(`Loaded p90 touch cache for ${pairs.length} pairs.\n`);
  const costFor = Object.fromEntries(pairs.map(p => [p, costForPair(p.toLowerCase(), assetClassFor(p.toLowerCase()))]));

  // Per-pair: IS runPips distribution (sorted, for percentile lookup) + the
  // IS/OOS touch split. Real distribution characterization first, so we can
  // SEE what "how far does it actually go" looks like before trading it.
  const perPair = {};
  for (const pair of pairs) {
    const { touches, splitDate } = byPairCache[pair];
    const isT = touches.filter(t => t.date < splitDate);
    const oosT = touches.filter(t => t.date >= splitDate);
    const isRunPips = isT.map(t => t.runPips).sort((a, b) => a - b);
    perPair[pair] = { isT, oosT, isRunPips, splitDate };
    const p50 = pctileOf(isRunPips, 50), p75 = pctileOf(isRunPips, 75);
    console.log(`${pair}: IS runPips median=${p50?.toFixed(1)} p75=${p75?.toFixed(1)} (vs the OLD symmetric assumption, which used innerDistPips itself as the stop -- typically much smaller than these real continuation distances)`);
  }

  const header = () => console.log(
    'pctile'.padEnd(7), 'avgStop'.padStart(8), 'trades'.padStart(7), 'winRate'.padStart(8),
    'sharpe'.padStart(7), 'psr'.padStart(6), 'sortino'.padStart(8), 'skew'.padStart(7), 'cvar95'.padStart(8), 'maxDD'.padStart(8), 'PF'.padStart(6)
  );
  const printRow = (p, s, avgStop, marker = '') => console.log(
    String(p).padEnd(7), (avgStop != null ? avgStop.toFixed(1) : '—').padStart(8),
    String(s.trades).padStart(7), (s.winRate + '%').padStart(8),
    String(s.sharpe).padStart(7), String(s.psr).padStart(6), String(s.sortino).padStart(8),
    String(s.skew).padStart(7), (s.cvar95 + '%').padStart(8), (s.maxDD + '%').padStart(8), String(s.pf).padStart(6) + marker
  );

  // NOT selecting by raw Sharpe this time -- that's exactly what produced a
  // curve with no peak (walks to whichever candidate almost never triggers
  // its stop). psr (probabilistic Sharpe) is explicitly discounted for
  // negative skew and fat tails, which is the actual failure mode here.
  console.log('\n──── IS grid (fit) ────');
  header();
  const isRows = [];
  for (const p of PERCENTILES) {
    const byPairTrades = {};
    let stopSum = 0, stopN = 0;
    for (const pair of pairs) {
      const stopDist = pctileOf(perPair[pair].isRunPips, p);
      if (stopDist == null) continue;
      stopSum += stopDist; stopN++;
      byPairTrades[pair] = toTrades(perPair[pair].isT, stopDist, pair, costFor[pair]);
    }
    const s = portfolioStatsFor(byPairTrades);
    if (!s) continue;
    isRows.push({ p, s });
    printRow(p, s, stopSum / stopN);
  }

  const best = isRows.reduce((a, b) => (b.s.psr > a.s.psr ? b : a), isRows[0]);
  console.log(`\nChosen (pre-stated rule: best IS psr, NOT raw Sharpe -- see header comment): percentile=${best.p}\n`);

  console.log(`──── OOS (percentile frozen from IS, applied unchanged, REAL per-pair spread cost) ────`);
  header();
  const oosByPercentile = {};
  for (const p of PERCENTILES) {
    const byPairTrades = {};
    for (const pair of pairs) {
      const stopDist = pctileOf(perPair[pair].isRunPips, p); // still fit on IS, applied to OOS touches
      if (stopDist == null) continue;
      byPairTrades[pair] = toTrades(perPair[pair].oosT, stopDist, pair, costFor[pair]);
    }
    oosByPercentile[p] = byPairTrades;
    const s = portfolioStatsFor(byPairTrades);
    if (!s) continue;
    printRow(p, s, null, p === best.p ? '  <- chosen' : '');
  }

  // ── Verification pass: is the portfolio Sharpe real, or an artifact of
  // uncapped cross-pair stacking + daily-return smoothing across many trades?
  console.log(`\n──── Verification: cross-pair heat cap (max ${MAX_HEAT_PCT}% simultaneous exposure) vs uncapped, OOS ────`);
  console.log('pctile'.padEnd(7), 'uncapped-sharpe'.padStart(16), 'heatCapped-sharpe'.padStart(18), 'uncapped-maxDD'.padStart(16), 'heatCapped-maxDD'.padStart(18));
  for (const p of [75, 80, 90]) {
    const byPairTrades = oosByPercentile[p];
    if (!byPairTrades) continue;
    const uncapped = portfolioStatsFor(byPairTrades, { heatCap: false });
    const capped = portfolioStatsFor(byPairTrades, { heatCap: true });
    console.log(String(p).padEnd(7), String(uncapped?.sharpe).padStart(16), String(capped?.sharpe).padStart(18), (uncapped?.maxDD + '%').padStart(16), (capped?.maxDD + '%').padStart(18));
  }

  // ── Per-trade Sharpe cross-check (summarizeTrades, the SAME per-trade
  // metric this whole project's individual-pair pages use) -- if this is
  // wildly out of line with the portfolio's daily-return Sharpe above, that
  // gap IS the "many small trades smoothing daily noise" effect, not extra
  // real edge.
  console.log(`\n──── Verification: per-trade Sharpe (summarizeTrades, single combined trade list, no daily-return smoothing) ────`);
  for (const p of [75, 80, 90]) {
    const byPairTrades = oosByPercentile[p];
    if (!byPairTrades) continue;
    const all = Object.values(byPairTrades).flat().sort((a, b) => a.time - b.time);
    const st = summarizeTrades(all.map(t => t.pnlPct), all.map(t => t.date));
    console.log(`pctile=${p}: perTradeSharpe=${st.sharpe} (±${st.sharpeSE}) minTrackYears=${st.minTrackYears} winRate=${st.winRate}% PF=${st.profitFactor} n=${st.trades}`);
  }
}

main();
