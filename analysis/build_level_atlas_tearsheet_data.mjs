// Level Atlas Vote Portfolio — tearsheet data export — 2026-08-31
//
// Data-generation only (no HTML/chart code here) for a tearsheet-style report
// the user is building separately. Writes ONE JSON file
// (analysis/output/level_atlas_tearsheet_data.json) with the full daily
// series, a summary KPI block, and monthly returns, at the CURRENT
// best-known live-equivalent full-stack config:
//   margin>=3, p50/p75, per-pair concurrency cap=1, 0.5%/trade risk-adjust,
//   early_exit ON (threshold 0.4, cached {pair}-earlyexit-votetrades.json),
//   ccy_loss_gate ON (1%, OOS-validated), portfolio heat cap OFF (0 — the
//   user just turned this off live).
//
// SAME pipeline/order as every other script this session
// (js/levelAtlasRoutes.js's live route, reused not re-derived):
//   margin filter -> earlyExit swap -> per-pair concurrency cap ->
//   riskAdjustTrades -> heat cap (off, no-op) -> currency loss gate ->
//   daily series -> portfolioStats
//
// Metric provenance (per the user's own request — say exactly what's reused
// vs newly written):
//   - sharpe, sortino, calmar, cagr (=cagrPct), maxDD (=maxDrawdownPct),
//     annVol (=annVolPct) — ALL taken directly from js/backtestStats.js's
//     `portfolioStats()` (the SAME "one honest daily-series summary" every
//     other headline number today came from) — sortino/calmar are already
//     computed there via metricsCore.js's `sortinoRatio`/inline
//     cagr/|maxDD| — NOT reimplemented here.
//   - winRatePct, profitFactor — TRADE-level (not day-pooled), matching the
//     project's own established distinction (level-atlas-vote-portfolio.html's
//     Performance Summary report, which deliberately computes these from the
//     raw trade list rather than portfolioStats' day-pooled winRate/PF,
//     "several trades can net to one positive day"). Uses metricsCore.js's
//     existing `winRate`/`profitFactor` functions directly on the final
//     trade list's pnlPct array — not reimplemented, just applied at the
//     trade level instead of the day level.
//   - timeInDrawdownPct — NOT found as an existing function anywhere in the
//     codebase (checked js/metricsCore.js, js/backtestStats.js, and grepped
//     the whole repo for "timeInDrawdown"/"underwater %"). NEW, simple math
//     written here: % of trading days where the compounded equity curve
//     (built from the SAME daily series everything else uses) sits below its
//     own running peak-to-date. Flagged explicitly so it can be reviewed
//     before being trusted alongside the reused numbers.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries, applyCurrencyLossGate } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { winRate as tradeWinRate, profitFactor as tradeProfitFactor } from '../js/metricsCore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VOTE_TRADES_DIR = path.join(__dirname, 'output', 'level-atlas-vote-trades');
const OUT = path.join(__dirname, 'output', 'level_atlas_tearsheet_data.json');

const MIN_MARGIN = 3, MAX_CONCURRENT = 1, RISK_PCT = 0.5, MAX_DAILY_LOSS_PCT = 1;
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

function loadPairTrades(pair) {
  const raw = JSON.parse(fs.readFileSync(path.join(VOTE_TRADES_DIR, `${pair}-votetrades.json`), 'utf8'));
  let filtered = raw.trades.filter(t => t.margin >= MIN_MARGIN).map(t => ({ ...t, pair: raw.instrument }));

  // early_exit swap — same matching as js/levelAtlasRoutes.js's live route:
  // fade trades only exist in the earlyexit file, follow trades pass through.
  const eeStored = JSON.parse(fs.readFileSync(path.join(VOTE_TRADES_DIR, `${pair}-earlyexit-votetrades.json`), 'utf8'));
  const byTime = new Map(eeStored.trades.map(t => [t.time, t]));
  filtered = filtered.map(t => {
    const ee = byTime.get(t.time);
    return ee ? { ...ee, pair: raw.instrument } : t;
  });

  const capped = applyConcurrencyCap(filtered, { maxConcurrent: MAX_CONCURRENT }).kept;
  return { trades: riskAdjustTrades(capped, RISK_PCT), instrument: raw.instrument };
}

function main() {
  const byPair = {};
  for (const p of PAIRS) {
    const { trades, instrument } = loadPairTrades(p);
    byPair[instrument] = trades;
  }
  // heat cap OFF (0, live setting) — no applyPortfolioHeatCap call, straight
  // to the currency loss gate on the merged, globally-chronological list.
  const merged = Object.values(byPair).flat();
  const gated = applyCurrencyLossGate(merged, { maxDailyLossPct: MAX_DAILY_LOSS_PCT });
  const finalByPair = {};
  for (const t of gated.kept) (finalByPair[t.pair] ??= []).push(t);

  const weights = Object.fromEntries(Object.keys(finalByPair).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(finalByPair, { weights });
  const { dates, dailyReturns } = combined;
  const ps = portfolioStats(dailyReturns, { mc: false });

  // ── dailySeries: compounded cumulative equity, SAME convention
  // portfolioStats' own cagrOf uses internally (eq *= 1+r/100, starting at 1
  // i.e. 0% return) — not a new compounding rule.
  let eq = 1;
  const dailySeries = dates.map((date, i) => {
    const r = dailyReturns[i];
    eq *= (1 + r / 100);
    return { date, dailyReturnPct: +r.toFixed(4), cumEquityPct: +((eq - 1) * 100).toFixed(4) };
  });

  // ── timeInDrawdownPct — NEW math (see header): % of days the compounded
  // equity curve sits below its own running peak-to-date.
  let peak = -Infinity, underwaterDays = 0;
  for (const row of dailySeries) {
    const e = 1 + row.cumEquityPct / 100;
    if (e > peak) peak = e;
    if (e < peak) underwaterDays++;
  }
  const timeInDrawdownPct = dailySeries.length ? +(underwaterDays / dailySeries.length * 100).toFixed(2) : null;

  // ── trade-level winRate/profitFactor (metricsCore.js's existing functions,
  // applied to the FINAL kept trade list's pnlPct — not day-pooled).
  const allTrades = Object.values(finalByPair).flat();
  const tradePnls = allTrades.map(t => t.pnlPct);
  const winRatePct = +(tradeWinRate(tradePnls) * 100).toFixed(2);
  const profitFactorVal = +tradeProfitFactor(tradePnls).toFixed(3);

  const summary = {
    totalReturnPct: dailySeries.length ? dailySeries[dailySeries.length - 1].cumEquityPct : 0,
    cagrPct: ps.cagr, sharpe: ps.sharpe, sortino: ps.sortino, calmar: ps.calmar,
    maxDrawdownPct: ps.maxDD, annVolPct: ps.annVol, timeInDrawdownPct,
    winRatePct, profitFactor: profitFactorVal, trades: allTrades.length,
    startDate: dates[0] ?? null, endDate: dates[dates.length - 1] ?? null,
  };

  // ── monthlyReturns — compounded within each calendar month, from the SAME
  // dailySeries (same compounding rule, not a second convention).
  const byMonth = new Map();
  for (const row of dailySeries) {
    const [y, m] = row.date.split('-');
    const key = `${y}-${m}`;
    if (!byMonth.has(key)) byMonth.set(key, { year: +y, month: +m, eq: 1 });
    const rec = byMonth.get(key);
    rec.eq *= (1 + row.dailyReturnPct / 100);
  }
  const monthlyReturns = [...byMonth.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, rec]) => ({ year: rec.year, month: rec.month, returnPct: +((rec.eq - 1) * 100).toFixed(4) }));

  const out = { generatedAt: new Date().toISOString(),
    config: { minMargin: MIN_MARGIN, rungs: ['p50', 'p75'], maxConcurrent: MAX_CONCURRENT, riskPct: RISK_PCT,
      earlyExit: { on: true, threshold: 0.4 }, ccyLossGate: { on: true, maxDailyLossPct: MAX_DAILY_LOSS_PCT },
      heatCap: { on: false, maxHeatPct: 0 }, pairs: PAIRS },
    dailySeries, summary, monthlyReturns };
  fs.writeFileSync(OUT, JSON.stringify(out));

  console.log('Wrote', OUT);
  console.log('dailySeries rows:', dailySeries.length, ' monthlyReturns rows:', monthlyReturns.length);
  console.log('Date range:', summary.startDate, '->', summary.endDate);
  console.log('summary:', JSON.stringify(summary, null, 2));
}

main();
