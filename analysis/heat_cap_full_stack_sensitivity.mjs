// Heat-Cap Sensitivity, FULL STACK — 2026-08-31
//
// Follow-up to `analysis/heat_cap_sensitivity.mjs` (isolated: concurrency cap
// + heat cap + sizing only). That test omitted two levers that are actually
// live on volatility_bot_v2 right now: `ccy_loss_gate` (currency loss gate,
// on, 1% max_daily_loss_pct) and `early_exit` (fade-trade stop-tightening,
// on, threshold 0.4). This reruns the SAME heat-cap sweep with both stacked
// in, reproducing the LIVE route's exact composition order
// (js/levelAtlasRoutes.js's `/api/level-atlas/vote-portfolio`, read directly
// rather than guessed):
//   margin filter -> [earlyExit swap] -> per-pair concurrency cap (max=1) ->
//   riskAdjustTrades (0.5%/trade) -> [heat cap, swept here] ->
//   [currency loss gate, 1%] -> daily series -> portfolioStats
//
// Both extra levers reuse ALREADY-VALIDATED artifacts/parameters, nothing
// refit here:
//   - currency loss gate: `applyCurrencyLossGate` (js/levelAtlasVoteReview.js),
//     OOS-validated at 1% (scripts/oos_validate_currency_loss_gate.mjs:
//     IS-chosen 1% cap improved EVERY OOS metric — Sharpe +0.23, annVol
//     -8.7pp, maxDD +4.69pp, CVaR95 +2.08pp — per that script's own docstring
//     and js/levelAtlasRoutes.js's route comment).
//   - early exit: the ALREADY-BUILT `{pair}-earlyexit-votetrades.json` files
//     (scripts/build_early_exit_votetrades.mjs, threshold=0.4, the IS/OOS
//     empirical peak from analysis/early_exit_no_releverage_backtest.mjs) —
//     confirmed present for all 17 pairs. These contain every OOS FADE trade
//     (margin>=3), each either re-priced (adverse excursion crossed 40% of
//     the ORIGINAL, unchanged stop distance before normal resolution) or
//     left exactly as the baseline had it (never crossed) — follow trades
//     are untouched by construction (early exit is fade-only), matched into
//     the baseline list by each trade's unique `time`, exactly as the live
//     route does it (js/levelAtlasRoutes.js lines ~727-739).
//
// No M1 walk needed anywhere in this script — everything is cached JSON, so
// this runs in seconds like the isolated sweep did.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries, applyPortfolioHeatCap, applyCurrencyLossGate } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { sharpeStdError } from '../js/metricsCore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VOTE_TRADES_DIR = path.join(__dirname, 'output', 'level-atlas-vote-trades');

const MIN_MARGIN = 3, MAX_CONCURRENT = 1, RISK_PCT = 0.5;
const MAX_DAILY_LOSS_PCT = 1;   // ccy_loss_gate's live/validated setting
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const HEAT_LEVELS = [1.0, 1.5, 2.0, 3.0, 0];   // 0 = off, volatility_bot_v2.py's own convention

function loadFullStackCapped(pair) {
  const raw = JSON.parse(fs.readFileSync(path.join(VOTE_TRADES_DIR, `${pair}-votetrades.json`), 'utf8'));
  let filtered = raw.trades.filter(t => t.margin >= MIN_MARGIN).map(t => ({ ...t, pair: raw.instrument }));

  // early_exit swap-in — SAME matching logic as js/levelAtlasRoutes.js: only
  // fade trades exist in the earlyexit file, so a follow trade's `byTime.get`
  // simply misses and passes through unchanged, exactly like the live route.
  let eeInfo = { present: false, repriced: 0 };
  try {
    const eeStored = JSON.parse(fs.readFileSync(path.join(VOTE_TRADES_DIR, `${pair}-earlyexit-votetrades.json`), 'utf8'));
    if (eeStored?.trades?.length) {
      const byTime = new Map(eeStored.trades.map(t => [t.time, t]));
      let repriced = 0;
      filtered = filtered.map(t => {
        const ee = byTime.get(t.time);
        if (!ee) return t;
        if (ee.pnlPct !== t.pnlPct) repriced++;
        return { ...ee, pair: raw.instrument };
      });
      eeInfo = { present: true, repriced, threshold: eeStored.threshold };
    }
  } catch { /* no earlyexit file for this pair — leave filtered unchanged, flagged below */ }

  const capped = applyConcurrencyCap(filtered, { maxConcurrent: MAX_CONCURRENT }).kept;
  return { trades: capped, eeInfo };
}

function statsAtHeatCap(riskAdjByPair, heatCapPct) {
  let final = riskAdjByPair;
  if (heatCapPct > 0) {
    const heatResult = applyPortfolioHeatCap(riskAdjByPair, { maxHeatPct: heatCapPct });
    if (heatResult) {
      final = {};
      for (const t of heatResult.kept) (final[t.pair] ??= []).push(t);
    }
  }
  // ccy loss gate — AFTER heat cap, cross-pair, matching js/levelAtlasRoutes.js's
  // own order exactly (heat cap and ccy gate both operate on the merged,
  // globally-chronological trade list; ccy gate is layered on top).
  const merged = Object.values(final).flat();
  const gated = applyCurrencyLossGate(merged, { maxDailyLossPct: MAX_DAILY_LOSS_PCT });
  const byPair = {};
  for (const t of gated.kept) (byPair[t.pair] ??= []).push(t);

  const weights = Object.fromEntries(Object.keys(byPair).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(byPair, { weights });
  const ps = portfolioStats(combined.dailyReturns, { mc: false });
  const se = ps.days > 1 ? sharpeStdError(ps.sharpe, ps.days, 252) : Infinity;
  const sharpeCI95 = isFinite(se) ? [+(ps.sharpe - 1.96 * se).toFixed(2), +(ps.sharpe + 1.96 * se).toFixed(2)] : null;
  const all = Object.values(byPair).flat();
  return { trades: all.length, sharpe: ps.sharpe, sharpeCI95, maxDD: ps.maxDD, cagr: ps.cagr, profitFactor: ps.profitFactor };
}

function main() {
  const riskAdjByPair = {};
  let missingEarlyExit = [];
  let totalRepriced = 0, totalFadeCandidates = 0;
  for (const p of PAIRS) {
    const { trades, eeInfo } = loadFullStackCapped(p);
    riskAdjByPair[trades[0]?.pair ?? p.toUpperCase()] = riskAdjustTrades(trades, RISK_PCT);
    if (!eeInfo.present) missingEarlyExit.push(p);
    else totalRepriced += eeInfo.repriced;
  }
  const total = Object.values(riskAdjByPair).flat().length;
  console.log(`Loaded ${total} trades (margin>=3, per-pair concurrency-capped, early_exit applied) across ${PAIRS.length} pairs.`);
  console.log(`early_exit coverage: ${PAIRS.length - missingEarlyExit.length}/${PAIRS.length} pairs${missingEarlyExit.length ? ` (MISSING: ${missingEarlyExit.join(',')})` : ''}. Total fade trades re-priced by early_exit: ${totalRepriced}.\n`);

  console.log('| heat cap | trades | Sharpe | maxDD | CAGR |');
  console.log('|---|---|---|---|---|');
  const rows = [];
  for (const h of HEAT_LEVELS) {
    const s = statsAtHeatCap(riskAdjByPair, h);
    const label = h === 0 ? 'off (0)' : `${h}%${h === 1.0 ? ' (current)' : ''}`;
    console.log(`| ${label} | ${s.trades} | ${s.sharpe} | ${s.maxDD}% | ${s.cagr}% |`);
    rows.push({ heatCap: h, ...s });
  }

  fs.writeFileSync(path.join(__dirname, 'output', 'heat_cap_full_stack_sensitivity.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), pairs: PAIRS, minMargin: MIN_MARGIN, maxConcurrent: MAX_CONCURRENT,
    riskPct: RISK_PCT, maxDailyLossPct: MAX_DAILY_LOSS_PCT, missingEarlyExit, totalRepriced, rows,
  }, null, 2));
}

main();
