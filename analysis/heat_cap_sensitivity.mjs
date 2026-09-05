// Heat-Cap Sensitivity — 2026-08-31
//
// Separate question from the 'neither'-population work: is volatility_bot_v2's
// portfolio heat cap (`max_open_risk_pct`, live config default 1.0 —
// `volatility_bot_v2/volatility_bot_v2.py` line 103, "0 = off") actually
// earning its keep, or is it mostly opportunity cost? Real decision-log
// entries show most skips are `risk_budget: open ~0.5-0.6% + candidate 0.50%
// > cap 1.0%` — with each candidate needing ~0.5% risk, a 1.0% cap limits the
// bot to ~2 concurrent positions even with 17 pairs enabled.
//
// ONLY the already-validated BASELINE trade list (same-day-resolved,
// margin>=3, p50/p75 — the shipped `{pair}-votetrades.json` trades, loaded
// verbatim, never recomputed) — the 'neither'-population scenarios from the
// separate investigation are NOT part of this question. No M1 walk needed
// (baseline trades are fully cached), so this runs in seconds, not minutes.
//
// SAME validated pipeline as everywhere else this session
// (analysis/drawdown_throttle_backtest.mjs's own): per-pair concurrency cap
// max=1 -> 0.5%/trade fixed-fractional risk-adjust -> portfolio heat cap
// (swept here) -> daily series -> portfolioStats. Only the heat-cap step is
// varied; nothing else in the pipeline changes.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries, applyPortfolioHeatCap } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { sharpeStdError } from '../js/metricsCore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VOTE_TRADES_DIR = path.join(__dirname, 'output', 'level-atlas-vote-trades');

const MIN_MARGIN = 3, MAX_CONCURRENT = 1, RISK_PCT = 0.5;
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
// 0 = off, matching volatility_bot_v2.py's own convention (`cfg.get("max_open_risk_pct", 0) or 0`).
const HEAT_LEVELS = [1.0, 1.5, 2.0, 3.0, 0];

function loadBaselineCapped(pair) {
  const raw = JSON.parse(fs.readFileSync(path.join(VOTE_TRADES_DIR, `${pair}-votetrades.json`), 'utf8'));
  const filtered = raw.trades.filter(t => t.margin >= MIN_MARGIN).map(t => ({ ...t, pair: raw.instrument }));
  return applyConcurrencyCap(filtered, { maxConcurrent: MAX_CONCURRENT }).kept;   // per-pair concurrency cap, SAME as drawdown_throttle_backtest.mjs's loadTrades
}

function statsAtHeatCap(byPair, heatCapPct) {
  const riskAdj = {};
  for (const p of Object.keys(byPair)) riskAdj[p] = riskAdjustTrades(byPair[p], RISK_PCT);
  let final = riskAdj;
  if (heatCapPct > 0) {
    const heatResult = applyPortfolioHeatCap(riskAdj, { maxHeatPct: heatCapPct });
    if (heatResult) {
      final = {};
      for (const t of heatResult.kept) (final[t.pair] ??= []).push(t);
    }
  }
  // heatCapPct <= 0 ("off"): skip applyPortfolioHeatCap entirely -- passing 0
  // straight into maxConcurrent would reject every trade (0.5% heat never
  // fits a 0 budget), which is the OPPOSITE of "off". Matches
  // volatility_bot_v2.py's own gate, which only checks the heat budget at all
  // when `max_open_risk_pct` is truthy/nonzero.
  const weights = Object.fromEntries(Object.keys(final).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(final, { weights });
  const ps = portfolioStats(combined.dailyReturns, { mc: false });
  const se = ps.days > 1 ? sharpeStdError(ps.sharpe, ps.days, 252) : Infinity;
  const sharpeCI95 = isFinite(se) ? [+(ps.sharpe - 1.96 * se).toFixed(2), +(ps.sharpe + 1.96 * se).toFixed(2)] : null;
  const all = Object.values(final).flat();
  return { trades: all.length, sharpe: ps.sharpe, sharpeCI95, maxDD: ps.maxDD, cagr: ps.cagr, profitFactor: ps.profitFactor };
}

function main() {
  const byPair = {};
  for (const p of PAIRS) byPair[p] = loadBaselineCapped(p);
  const total = Object.values(byPair).flat().length;
  console.log(`Loaded ${total} baseline trades (margin>=3, p50/p75, per-pair concurrency-capped) across ${PAIRS.length} pairs.\n`);

  console.log('| heat cap | trades | Sharpe | maxDD | CAGR |');
  console.log('|---|---|---|---|---|');
  const rows = [];
  for (const h of HEAT_LEVELS) {
    const s = statsAtHeatCap(byPair, h);
    const label = h === 0 ? 'off (0)' : `${h}%${h === 1.0 ? ' (current)' : ''}`;
    console.log(`| ${label} | ${s.trades} | ${s.sharpe} | ${s.maxDD}% | ${s.cagr}% |`);
    rows.push({ heatCap: h, ...s });
  }

  fs.writeFileSync(path.join(__dirname, 'output', 'heat_cap_sensitivity.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), pairs: PAIRS, minMargin: MIN_MARGIN, maxConcurrent: MAX_CONCURRENT, riskPct: RISK_PCT,
    rows,
  }, null, 2));
}

main();
