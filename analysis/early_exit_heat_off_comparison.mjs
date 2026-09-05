// Early-Exit isolation with heat cap OFF — 2026-08-31
//
// Follow-up to `analysis/heat_cap_full_stack_sensitivity.mjs` now that the
// user has turned the live heat cap fully off: with ccy_loss_gate still on
// (1%, OOS-validated) and heat cap off (0), does early_exit (fade-only
// stop-tightening, threshold 0.4) help or hurt on its own?
//
// SAME full-stack pipeline/order as heat_cap_full_stack_sensitivity.mjs
// (js/levelAtlasRoutes.js's live route order, reused not re-derived):
//   margin filter -> [earlyExit swap, toggled here] -> per-pair concurrency
//   cap (max=1) -> riskAdjustTrades (0.5%/trade) -> heat cap (OFF, 0) ->
//   currency loss gate (1%) -> daily series -> portfolioStats
//
// No M1 walk — early_exit's re-pricing reuses the already-built, cached
// {pair}-earlyexit-votetrades.json (threshold=0.4, the only threshold
// persisted/computed this session — see build_early_exit_votetrades.mjs).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries, applyCurrencyLossGate } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { sharpeStdError } from '../js/metricsCore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VOTE_TRADES_DIR = path.join(__dirname, 'output', 'level-atlas-vote-trades');

const MIN_MARGIN = 3, MAX_CONCURRENT = 1, RISK_PCT = 0.5, MAX_DAILY_LOSS_PCT = 1;
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

function loadPairTrades(pair, { earlyExit }) {
  const raw = JSON.parse(fs.readFileSync(path.join(VOTE_TRADES_DIR, `${pair}-votetrades.json`), 'utf8'));
  let filtered = raw.trades.filter(t => t.margin >= MIN_MARGIN).map(t => ({ ...t, pair: raw.instrument }));
  let repriced = 0, threshold = null;
  if (earlyExit) {
    const eeStored = JSON.parse(fs.readFileSync(path.join(VOTE_TRADES_DIR, `${pair}-earlyexit-votetrades.json`), 'utf8'));
    threshold = eeStored.threshold;
    const byTime = new Map(eeStored.trades.map(t => [t.time, t]));
    filtered = filtered.map(t => {
      const ee = byTime.get(t.time);
      if (!ee) return t;
      if (ee.pnlPct !== t.pnlPct) repriced++;
      return { ...ee, pair: raw.instrument };
    });
  }
  const capped = applyConcurrencyCap(filtered, { maxConcurrent: MAX_CONCURRENT }).kept;
  return { trades: riskAdjustTrades(capped, RISK_PCT), instrument: raw.instrument, repriced, threshold };
}

function statsFor(earlyExit) {
  const byPair = {};
  let totalRepriced = 0, threshold = null;
  for (const p of PAIRS) {
    const { trades, instrument, repriced, threshold: th } = loadPairTrades(p, { earlyExit });
    byPair[instrument] = trades;
    totalRepriced += repriced;
    if (th != null) threshold = th;
  }
  // heat cap OFF (0) -- the now-live setting -- so no applyPortfolioHeatCap
  // call at all, straight to the currency loss gate on the merged list, same
  // order the live route uses (heat cap then ccy gate; heat cap is simply a
  // no-op step here).
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
  return { trades: all.length, sharpe: ps.sharpe, sharpeCI95, maxDD: ps.maxDD, cagr: ps.cagr, profitFactor: ps.profitFactor, totalRepriced, threshold };
}

function main() {
  const off = statsFor(false);
  const on = statsFor(true);

  console.log(`ccy_loss_gate=1% (on), heat cap=0 (off, live setting). early_exit ON re-priced ${on.totalRepriced} fade trades at threshold=${on.threshold}.\n`);
  console.log('| early_exit | trades | Sharpe | maxDD | CAGR |');
  console.log('|---|---|---|---|---|');
  console.log(`| OFF (baseline) | ${off.trades} | ${off.sharpe} | ${off.maxDD}% | ${off.cagr}% |`);
  console.log(`| ON (threshold 0.4) | ${on.trades} | ${on.sharpe} | ${on.maxDD}% | ${on.cagr}% |`);

  fs.writeFileSync(path.join(__dirname, 'output', 'early_exit_heat_off_comparison.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), pairs: PAIRS, minMargin: MIN_MARGIN, maxConcurrent: MAX_CONCURRENT,
    riskPct: RISK_PCT, maxDailyLossPct: MAX_DAILY_LOSS_PCT, heatCap: 0, off, on,
  }, null, 2));
}

main();
