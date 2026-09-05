// p90 inclusion at the CURRENT LIVE volatility_bot_v2 settings — 2026-09-01
//
// Reuses the exact full-stack pipeline already built and used today
// (analysis/heat_cap_full_stack_sensitivity.mjs, analysis/early_exit_heat_off_comparison.mjs,
// js/levelAtlasRoutes.js's /api/level-atlas/vote-portfolio route, read directly):
//   margin filter (>=3) -> [p90 merge, toggled here, concat AFTER the margin
//   filter since p90 trades carry margin:null by construction] -> per-pair
//   concurrency cap (max=1) -> riskAdjustTrades (1%/trade, the CURRENT live
//   risk_pct) -> [heat cap: OFF, live setting] -> currency loss gate (1%) ->
//   daily series -> portfolioStats
//
// early_exit and fade_stop_tighten are BOTH off live right now, and the
// baseline {pair}-votetrades.json files are already the untightened/
// unswapped baseline (same as the "off" arm of early_exit_heat_off_comparison.mjs),
// so no swap-in step is needed for either lever here.
//
// p90 inclusion uses the ALREADY-VALIDATED {pair}-p90votetrades.json artifact
// (scripts/build_p90_votetrades.mjs, 2026-08-29 commit 926f32c) rather than
// re-deriving p90 trades through the normal buildBarrierTrades/voteDecision
// path — that prior research found voteDecision literally cannot fire for
// p90 (sample too thin for any dimension to clear the OOS-holding bar, 0
// votes across hundreds of OOS touches), which is WHY p90 is excluded
// everywhere else (excludeRungs: ['p90']) and why a separate unconditional-
// fade artifact exists instead of a normal vote-trade list for that rung.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries, applyCurrencyLossGate } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { sharpeStdError } from '../js/metricsCore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VOTE_TRADES_DIR = path.join(__dirname, 'output', 'level-atlas-vote-trades');

const MIN_MARGIN = 3, MAX_CONCURRENT = 1;
const RISK_PCT = 1.0;             // CURRENT live risk_pct (changed from the 0.5% validated default)
const MAX_DAILY_LOSS_PCT = 1.0;   // ccy_loss_gate, live/OOS-validated, unchanged
// heat cap: OFF (max_open_risk_pct=0 live) -- no applyPortfolioHeatCap call at all
// early_exit: OFF live -- no earlyexit-votetrades swap
// fade_stop_tighten: OFF live -- baseline votetrades.json is already untightened

const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

function loadPairTrades(pair, { includeP90 }) {
  const raw = JSON.parse(fs.readFileSync(path.join(VOTE_TRADES_DIR, `${pair}-votetrades.json`), 'utf8'));
  let filtered = raw.trades.filter(t => t.margin >= MIN_MARGIN).map(t => ({ ...t, pair: raw.instrument }));

  let p90Added = 0;
  if (includeP90) {
    const p90Path = path.join(VOTE_TRADES_DIR, `${pair}-p90votetrades.json`);
    if (fs.existsSync(p90Path)) {
      const p90Stored = JSON.parse(fs.readFileSync(p90Path, 'utf8'));
      if (p90Stored?.trades?.length) {
        // Concat AFTER the margin filter, same as js/levelAtlasRoutes.js —
        // p90 trades carry margin:null (unconditional fade, not a vote), so
        // they're never subject to the margin>=3 gate the p50/p75 trades are.
        filtered = filtered.concat(p90Stored.trades.map(t => ({ ...t, pair: raw.instrument })));
        p90Added = p90Stored.trades.length;
      }
    }
  }

  const capped = applyConcurrencyCap(filtered, { maxConcurrent: MAX_CONCURRENT }).kept;
  return { trades: riskAdjustTrades(capped, RISK_PCT), instrument: raw.instrument, p90Added };
}

function statsFor(includeP90) {
  const byPair = {};
  let totalP90Added = 0;
  const missingP90 = [];
  for (const p of PAIRS) {
    const { trades, instrument, p90Added } = loadPairTrades(p, { includeP90 });
    byPair[instrument] = trades;
    totalP90Added += p90Added;
    if (includeP90 && p90Added === 0) missingP90.push(p);
  }
  // heat cap OFF (live setting) -- no applyPortfolioHeatCap call, straight to
  // the currency loss gate on the merged list, same order the live route uses.
  const merged = Object.values(byPair).flat();
  const gated = applyCurrencyLossGate(merged, { maxDailyLossPct: MAX_DAILY_LOSS_PCT });
  const finalByPair = {};
  for (const t of gated.kept) (finalByPair[t.pair] ??= []).push(t);

  const weights = Object.fromEntries(Object.keys(finalByPair).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(finalByPair, { weights });
  const ps = portfolioStats(combined.dailyReturns, { mc: false });
  const se = ps.days > 1 ? sharpeStdError(ps.sharpe, ps.days, 252) : Infinity;
  const sharpeCI95 = isFinite(se) ? [+(ps.sharpe - 1.96 * se).toFixed(2), +(ps.sharpe + 1.96 * se).toFixed(2)] : null;
  const all = Object.values(finalByPair).flat();
  return {
    trades: all.length, sharpe: ps.sharpe, sharpeCI95, maxDD: ps.maxDD, cagr: ps.cagr,
    profitFactor: ps.profitFactor, days: ps.days, totalP90Added, missingP90,
  };
}

function main() {
  const noP90 = statsFor(false);
  const withP90 = statsFor(true);

  console.log(`Live-matching config: risk_pct=${RISK_PCT}%, heat cap=OFF, max_concurrent_per_pair=${MAX_CONCURRENT}, ccy_loss_gate=ON (${MAX_DAILY_LOSS_PCT}%), early_exit=OFF, fade_stop_tighten=OFF, margin>=${MIN_MARGIN}, ${PAIRS.length} pairs.`);
  console.log(`p90 merge added ${withP90.totalP90Added} unconditional-fade trades across ${PAIRS.length} pairs.${withP90.missingP90.length ? ` MISSING p90 file for: ${withP90.missingP90.join(',')}` : ''}\n`);

  console.log('| config | trades | Sharpe | SharpeCI95 | maxDD | CAGR | PF | days |');
  console.log('|---|---|---|---|---|---|---|---|');
  console.log(`| No p90 (current live) | ${noP90.trades} | ${noP90.sharpe} | ${JSON.stringify(noP90.sharpeCI95)} | ${noP90.maxDD}% | ${noP90.cagr}% | ${noP90.profitFactor} | ${noP90.days} |`);
  console.log(`| With p90 | ${withP90.trades} | ${withP90.sharpe} | ${JSON.stringify(withP90.sharpeCI95)} | ${withP90.maxDD}% | ${withP90.cagr}% | ${withP90.profitFactor} | ${withP90.days} |`);

  fs.writeFileSync(path.join(__dirname, 'output', 'p90_live_config_comparison.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), pairs: PAIRS, minMargin: MIN_MARGIN, maxConcurrent: MAX_CONCURRENT,
    riskPct: RISK_PCT, maxDailyLossPct: MAX_DAILY_LOSS_PCT, heatCap: 0, earlyExit: false, fadeStopTighten: false,
    noP90, withP90,
  }, null, 2));
}

main();
