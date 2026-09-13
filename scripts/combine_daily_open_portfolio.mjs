// Standard tearsheet for the Daily-Open votetrades (scripts/build_daily_open_votetrades.mjs)
// — the same brick every other book in this repo uses for this step
// (js/backtestStats.js's portfolioStats fed by js/levelAtlasVoteReview.js's
// buildPortfolioDailySeries/riskAdjustTrades/applyConcurrencyCap), mirroring
// scripts/combine_26_pair_portfolio.mjs's own structure. Each rung (fib618 /
// fib786) is reported as its own strategy variant — a trader picks ONE rung
// per leg, they are not stacked — with per-pair solo Sharpe next to the
// equal-weight combined book, same "naive avg vs combined" comparison the
// 26-pair script already makes.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyConcurrencyCap, buildPortfolioDailySeries, riskAdjustTrades } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_SUFFIX = process.env.DO_OUT_SUFFIX ? `-${process.env.DO_OUT_SUFFIX}` : '';
const DIR = path.join(__dirname, '..', 'analysis', 'output', `daily-open-vote-trades${OUT_SUFFIX}`);
const PAIRS = process.env.DO_PAIRS ? process.env.DO_PAIRS.split(',') : ['gold', 'nq', 'eurusd'];
const RUNGS = ['fib618', 'fib786'];
const MAX_CONCURRENT = 1, RISK_PCT = 1;

function loadPair(pair) {
  const p = path.join(DIR, `${pair}-votetrades.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function tearsheetLine(label, stats, n) {
  return `  ${label.padEnd(24)} n=${String(n).padEnd(6)} Sharpe ${String(stats.sharpe ?? '—').padEnd(7)} CAGR ${String(stats.cagr).padEnd(8)}%  maxDD ${String(stats.maxDD).padEnd(8)}%  Calmar ${String(stats.calmar).padEnd(7)}  annVol ${stats.annVol}%`;
}

const report = { generatedAt: new Date().toISOString(), rungs: {} };

for (const rung of RUNGS) {
  console.log(`\n=== rung: ${rung} (stop at leg origin, target 1.618 extension, riskPct=${RISK_PCT}%, maxConcurrent=${MAX_CONCURRENT}) ===`);
  const perPairTrades = {}; const solo = {};
  for (const pair of PAIRS) {
    const raw = loadPair(pair);
    if (!raw) { console.log(`  ${pair}: no votetrades file — run build_daily_open_votetrades.mjs first`); continue; }
    const rungTrades = raw.trades.filter(t => t.rung === rung);
    const capped = applyConcurrencyCap(rungTrades, { maxConcurrent: MAX_CONCURRENT });
    const adjusted = riskAdjustTrades(capped?.kept ?? [], RISK_PCT).map(t => ({ ...t, pair: raw.instrument }));
    perPairTrades[raw.instrument] = adjusted;
    const soloSeries = buildPortfolioDailySeries({ [raw.instrument]: adjusted });
    const soloStats = soloSeries ? portfolioStats(soloSeries.dailyReturns, { mc: false }) : { days: 0 };
    solo[pair] = { stats: soloStats, n: adjusted.length };
    console.log(tearsheetLine(pair, soloStats, adjusted.length));
  }
  const pairsWithTrades = Object.keys(perPairTrades).filter(p => perPairTrades[p].length);
  if (!pairsWithTrades.length) { report.rungs[rung] = { error: 'no trades' }; continue; }
  const weights = Object.fromEntries(pairsWithTrades.map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(perPairTrades, { weights });
  const combinedStats = portfolioStats(combined.dailyReturns, { mc: false });
  const totalTrades = pairsWithTrades.reduce((a, p) => a + perPairTrades[p].length, 0);
  console.log(tearsheetLine('COMBINED (equal wt)', combinedStats, totalTrades));
  const naiveAvgSharpe = +(pairsWithTrades.reduce((a, p) => a + (solo[p].stats.sharpe ?? 0), 0) / pairsWithTrades.length).toFixed(3);
  console.log(`  naive avg solo Sharpe: ${naiveAvgSharpe}  ->  combined Sharpe: ${combinedStats.sharpe}  (diversification ${combinedStats.sharpe > naiveAvgSharpe ? 'HELPS' : 'does not help'})`);
  report.rungs[rung] = { perPair: solo, combined: { stats: combinedStats, n: totalTrades, days: combined.dates.length }, naiveAvgSharpe };
}

fs.writeFileSync(path.join(DIR, 'results.json'), JSON.stringify(report, null, 1));
console.log(`\nWrote tearsheet to ${path.join(DIR, 'results.json')}`);
