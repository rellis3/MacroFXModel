// Neither-Population EOD-CLOSE Impact — 2026-08-31
//
// Third scenario alongside `analysis/neither_population_live_gap_study.mjs`
// (per-trade re-walk) and `analysis/neither_population_portfolio_impact.mjs`
// (baseline vs let-run portfolio comparison): what if, instead of (a)
// dropping a 'neither' touch [baseline, shipped] or (b) letting it ride to
// its real extended resolution [live-realistic, no EOD close — what the live
// bot actually does], a bot with a real session-close flatten had marked it
// to market at that SAME entry session's last bar close?
//
// Priced the same way `priceBarrierTrade` prices everything else in this
// project (gross, cost=0, same %-of-entry-price convention), direction via
// the SAME `betDirection` convention (`decision`+`side` -> long/short) every
// other Level Atlas vote-review function already uses — not a new sign rule.
// `resolveTime` for this scenario is the session's own last bar time (the
// position only ever exists within its entry day, same duration profile as
// a same-day-resolved baseline trade) — NOT the multi-day resolution time
// the let-run scenario uses.
//
// Reuses the cached baseline trade list verbatim (never recomputed) and the
// SAME portfolio pipeline `analysis/drawdown_throttle_backtest.mjs` /
// `analysis/neither_population_portfolio_impact.mjs` already validate
// (per-pair concurrency cap max=1 -> 0.5%/trade risk-adjust -> 1% heat cap ->
// daily series -> portfolioStats). Only the M1 walk (to find each 'neither'
// touch's entry-session last-bar close) is new work — the baseline and
// let-run numbers are NOT recomputed here, they're carried over from the
// already-completed `neither_population_portfolio_impact.mjs` run for the
// final side-by-side table.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook } from '../js/levelAtlasReport.js';
import { bucketM1IntoSessions } from '../js/forecastAnalyser.js';
import { voteDecision, betDirection, applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries, applyPortfolioHeatCap } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { sharpeStdError } from '../js/metricsCore.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VOTE_TRADES_DIR = path.join(__dirname, 'output', 'level-atlas-vote-trades');
const OUT_DIR = path.join(__dirname, 'output');

const REARM = 0.3;
const MIN_MARGIN = 3;
const LIVE_RUNGS = new Set(['p50', 'p75']);
const MAX_CONCURRENT = 1, RISK_PCT = 0.5, MAX_HEAT_PCT = 1;   // SAME as drawdown_throttle_backtest.mjs / neither_population_portfolio_impact.mjs

const PAIRS = process.env.LA_PAIRS
  ? process.env.LA_PAIRS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  : ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
     'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

function loadBaselineRaw(pair) {
  const raw = JSON.parse(fs.readFileSync(path.join(VOTE_TRADES_DIR, `${pair}-votetrades.json`), 'utf8'));
  const trades = raw.trades.filter(t => t.margin >= MIN_MARGIN).map(t => ({ ...t, pair: raw.instrument }));
  return { trades, instrument: raw.instrument, splitDate: raw.splitDate };
}

async function buildEodCloseTrades(pair, splitDate) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) return [];
  const assetClass = assetClassFor(pair);
  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [REARM], pendingRearmFrac: REARM });
  const book = buildAtlasBook(touches, { rearmFrac: REARM });
  if (!book) return [];
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');   // SAME bucketing atlasWalk itself uses internally
  const oosCandidates = touches.filter(t => t.rearmFrac === REARM && t.date >= splitDate && LIVE_RUNGS.has(t.rung));
  const neitherTouches = oosCandidates.filter(t => t.outcome === 'neither');
  const eodTrades = [];
  for (const t of neitherTouches) {
    const vd = voteDecision(book, t);
    if (!vd || vd.margin < MIN_MARGIN) continue;
    const targetPips = vd.decision === 'fade' ? t.innerDistPips : t.outerDistPips;
    const stopPips = vd.decision === 'fade' ? t.outerDistPips : t.innerDistPips;
    if (targetPips == null || stopPips == null) continue;   // structurally unpriceable (matches baseline/let-run exclusion)
    const bars = sessions.get(t.date);
    if (!bars?.length) continue;
    const eodClose = bars[bars.length - 1].close;
    const eodTime = bars[bars.length - 1].time;
    const dir = betDirection({ decision: vd.decision, side: t.side }) === 'long' ? 1 : -1;
    const denom = t.open > 0 ? t.open : null;
    const pnlPct = denom ? +((eodClose - t.level) * dir / denom * 100).toFixed(4) : 0;
    eodTrades.push({
      instrument: t.instrument, pair: t.instrument, date: t.date, time: t.time, resolveTime: eodTime,
      side: t.side, rung: t.rung, session: t.session, entry: t.level, pip: t.pip,
      decision: vd.decision, margin: vd.margin, targetPips, stopPips,
      win: pnlPct > 0, pnlPct, eodClose,
    });
  }
  return eodTrades;
}

function pipelineStats(perPairTrades) {
  const capped = {};
  for (const [p, trades] of Object.entries(perPairTrades)) capped[p] = applyConcurrencyCap(trades, { maxConcurrent: MAX_CONCURRENT }).kept;
  const riskAdj = {};
  for (const [p, trades] of Object.entries(capped)) riskAdj[p] = riskAdjustTrades(trades, RISK_PCT);
  const heatResult = applyPortfolioHeatCap(riskAdj, { maxHeatPct: MAX_HEAT_PCT });
  const final = {};
  if (heatResult) for (const t of heatResult.kept) (final[t.pair] ??= []).push(t);
  const weights = Object.fromEntries(Object.keys(final).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(final, { weights });
  const ps = portfolioStats(combined.dailyReturns, { mc: false });
  const se = ps.days > 1 ? sharpeStdError(ps.sharpe, ps.days, 252) : Infinity;
  const sharpeCI95 = isFinite(se) ? [+(ps.sharpe - 1.96 * se).toFixed(2), +(ps.sharpe + 1.96 * se).toFixed(2)] : null;
  const all = Object.values(final).flat();
  return { trades: all.length, sharpe: ps.sharpe, sharpeCI95, maxDD: ps.maxDD, cagr: ps.cagr, annVol: ps.annVol, profitFactor: ps.profitFactor, days: ps.days };
}

async function main() {
  const baselinePerPair = {}, eodPerPair = {};
  const perPairMeta = [];

  for (const pair of PAIRS) {
    console.log(`\n=== ${pair.toUpperCase()} ===`);
    let base;
    try { base = loadBaselineRaw(pair); } catch (e) { console.log(`  no cached votetrades: ${e.message}`); continue; }
    const t0 = Date.now();
    const eodTrades = await buildEodCloseTrades(pair, base.splitDate);
    console.log(`  baseline (cached): ${base.trades.length}  eod-close 'neither' trades: ${eodTrades.length} — ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    baselinePerPair[base.instrument] = base.trades;
    eodPerPair[base.instrument] = [...base.trades, ...eodTrades];
    perPairMeta.push({ pair: base.instrument, baselineN: base.trades.length, eodN: eodTrades.length });
  }

  const baselineCheck = pipelineStats(baselinePerPair);   // consistency check vs the already-completed portfolio-impact run
  const eodStats = pipelineStats(eodPerPair);

  console.log(`\n\n================ EOD-CLOSE SCENARIO (${Object.keys(baselinePerPair).length} of 17 pairs) ================`);
  console.log('Baseline consistency check (should match neither_population_portfolio_impact.mjs baseline exactly):');
  console.log(`  trades=${baselineCheck.trades} sharpe=${baselineCheck.sharpe} maxDD=${baselineCheck.maxDD}% cagr=${baselineCheck.cagr}% pf=${baselineCheck.profitFactor}`);
  console.log('\nEOD-CLOSE:');
  console.log(`  trades=${eodStats.trades} sharpe=${eodStats.sharpe} sharpeCI95=[${eodStats.sharpeCI95}] maxDD=${eodStats.maxDD}% cagr=${eodStats.cagr}% pf=${eodStats.profitFactor}`);

  console.log(`\nPer-pair:`);
  for (const m of perPairMeta) console.log(`  ${m.pair.padEnd(8)} baseline=${m.baselineN}  eodClose=${m.eodN}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'neither_population_eod_close_impact.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), pairsCovered: Object.keys(baselinePerPair),
    config: { REARM, MIN_MARGIN, MAX_CONCURRENT, RISK_PCT, MAX_HEAT_PCT },
    perPairMeta, baselineCheck, eodStats,
  }, null, 2));
  console.log(`\nWrote detail to ${OUT_DIR}/neither_population_eod_close_impact.json`);
}

main();
