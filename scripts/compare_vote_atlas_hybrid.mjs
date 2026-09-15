#!/usr/bin/env node
/**
 * Vote Atlas hybrid test — per-pair "use whichever calc wins" — done the
 * honest way, not by picking winners off the OOS table already reported to
 * the user (that would be pure p-hacking: a hybrid built by cherry-picking
 * after seeing the results always looks better than either pure strategy,
 * on noise alone, regardless of whether either estimator carries a real edge).
 *
 * The stored vote-trades files only ever persist OOS trades (IS trades are
 * dropped at build time — verified: 0 trades with date < splitDate in the
 * files this script reads), so there is no separately-computed IS sample to
 * select on without a fresh backtest run. Instead this carves the ALREADY-
 * OOS window into two genuinely disjoint halves using ONE global cutoff date
 * (never a per-pair one — a per-pair cutoff would itself be a knob to
 * overfit):
 *   SELECT half (earlier) -> pick each pair's better estimator by Sharpe here
 *   TEST half (later, untouched until scoring) -> freeze the picks, then
 *     score pure-v1, pure-v2, AND the hybrid on this SAME window, so the
 *     three-way comparison is apples-to-apples (not hybrid-on-test vs
 *     pure-on-the-whole-period).
 *
 * Reuses applyConcurrencyCap/buildPortfolioDailySeries/portfolioStats
 * directly — the same bricks js/levelAtlasRoutes.js's real /vote-portfolio
 * route uses — rather than re-deriving portfolio combination logic a second
 * way.
 *
 *   node scripts/compare_vote_atlas_hybrid.mjs
 */
import fs from 'fs';
import path from 'path';
import { applyConcurrencyCap, buildPortfolioDailySeries } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';

const V1_DIR = path.join('analysis', 'output', 'level-atlas-vote-trades');
const V2_DIR = path.join('analysis', 'output', 'level-atlas-vote-trades-v2');
const MIN_MARGIN = 3;
const MAX_CONCURRENT = 1;

const ALL_26_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurjpy', 'eurgbp', 'euraud', 'eurcad', 'eurchf', 'eurnzd', 'gbpjpy', 'gbpaud', 'gbpcad',
  'gbpchf', 'gbpnzd', 'audjpy', 'audnzd', 'audcad', 'audchf', 'cadjpy', 'chfjpy', 'nzdjpy', 'gold'];

function load(dir, pair) {
  const p = path.join(dir, `${pair}-votetrades.json`);
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  return d.trades.filter(t => t.margin >= MIN_MARGIN);
}

function sharpeOf(trades) {
  if (!trades.length) return -Infinity;
  const s = portfolioStatsFromTrades(trades);
  return s.sharpe;
}

// Trades -> a daily pnl series -> portfolioStats, for ONE pair's own trades
// (no cross-pair combination) — same convention buildPortfolioDailySeries
// uses internally (dailySeriesFor), applied to a single pair.
function portfolioStatsFromTrades(trades) {
  const capped = applyConcurrencyCap(trades, { maxConcurrent: MAX_CONCURRENT });
  const series = buildPortfolioDailySeries({ SOLO: capped?.kept ?? [] });
  if (!series || !series.dailyReturns.length) return { sharpe: -Infinity, days: 0 };
  return portfolioStats(series.dailyReturns, { mc: false });
}

// Determine ONE global cutoff: the date at the 60th percentile of the pooled
// (v1 union v2, all pairs) trade-date distribution. 60/40 select/test split
// -- favours a large enough SELECT sample for the per-pair pick not to be
// itself noise, while leaving a real multi-year TEST window.
function globalCutoff(pct = 0.6) {
  const allDates = [];
  for (const pair of ALL_26_PAIRS) {
    for (const dir of [V1_DIR, V2_DIR]) {
      try { for (const t of load(dir, pair)) allDates.push(t.date); } catch { /* missing pair, skip */ }
    }
  }
  allDates.sort();
  return allDates[Math.floor(allDates.length * pct)];
}

function main() {
  const pct = process.argv[2] ? Number(process.argv[2]) : 0.6;
  const cutoff = globalCutoff(pct);
  console.log(`Global SELECT/TEST cutoff (pct=${pct}): ${cutoff}\n`);

  const picks = {};       // pair -> 'v1' | 'v2'
  const v1TestByPair = {}, v2TestByPair = {}, hybridTestByPair = {};

  for (const pair of ALL_26_PAIRS) {
    let v1all, v2all;
    try { v1all = load(V1_DIR, pair); v2all = load(V2_DIR, pair); }
    catch (e) { console.log(`${pair.toUpperCase()}: SKIPPED (${e.message})`); continue; }

    const v1select = v1all.filter(t => t.date < cutoff);
    const v2select = v2all.filter(t => t.date < cutoff);
    const v1test = v1all.filter(t => t.date >= cutoff);
    const v2test = v2all.filter(t => t.date >= cutoff);

    const v1SelSharpe = sharpeOf(v1select), v2SelSharpe = sharpeOf(v2select);
    const winner = v2SelSharpe > v1SelSharpe ? 'v2' : 'v1';
    picks[pair] = winner;

    v1TestByPair[pair.toUpperCase()] = v1test;
    v2TestByPair[pair.toUpperCase()] = v2test;
    hybridTestByPair[pair.toUpperCase()] = winner === 'v2' ? v2test : v1test;

    console.log(`${pair.toUpperCase().padEnd(8)} select: v1=${v1SelSharpe.toFixed(2)} v2=${v2SelSharpe.toFixed(2)} -> picked ${winner}  ` +
                `| test n: v1=${v1test.length} v2=${v2test.length}`);
  }

  function scorePortfolio(perPairTrades) {
    const capped = {};
    for (const [pair, trades] of Object.entries(perPairTrades)) {
      const c = applyConcurrencyCap(trades, { maxConcurrent: MAX_CONCURRENT });
      capped[pair] = c?.kept ?? [];
    }
    const series = buildPortfolioDailySeries(capped);
    if (!series) return null;
    return portfolioStats(series.dailyReturns, { mc: false });
  }

  const v1TestStats = scorePortfolio(v1TestByPair);
  const v2TestStats = scorePortfolio(v2TestByPair);
  const hybridStats = scorePortfolio(hybridTestByPair);

  const v2Picks = Object.values(picks).filter(p => p === 'v2').length;
  console.log(`\nPer-pair picks on SELECT half: v1=${26 - v2Picks}, v2=${v2Picks}\n`);

  console.log('-- TEST-window-only comparison (never touched during selection) --');
  console.log(`${'metric'.padEnd(12)} ${'pure v1'.padStart(10)} ${'pure v2'.padStart(10)} ${'hybrid'.padStart(10)}`);
  for (const k of ['sharpe', 'cagr', 'maxDD', 'calmar', 'sortino', 'winRate', 'days']) {
    const fmt = v => typeof v === 'number' ? v.toFixed(3) : String(v);
    console.log(`${k.padEnd(12)} ${fmt(v1TestStats?.[k]).padStart(10)} ${fmt(v2TestStats?.[k]).padStart(10)} ${fmt(hybridStats?.[k]).padStart(10)}`);
  }
}

main();
