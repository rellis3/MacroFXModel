// Neither-Population Full Comparison (COST-FIXED) — 2026-08-31
//
// Supersedes the cost handling in `neither_population_portfolio_impact.mjs`
// (let-run) and `neither_population_eod_close_impact.mjs` (EOD-close), which
// both priced their 'neither'-population trades GROSS (cost=0) — a real bug:
// baseline trades (loaded straight from `{pair}-votetrades.json`) already
// carry each pair's real modelled cost (`priceBarrierTrade`'s own `pnlPct -
// cost` convention, baked in at generation time via `runOne`'s
// `buildBarrierTrades(touches, voteBook, { cost })`), so comparing them
// against cost-FREE 'neither' trades understated the true cost drag on
// whichever scenario takes the most extra trades (EOD-close, which adds
// trades rather than blocking them the way let-run's multi-day-open
// positions do).
//
// Fix: every 'neither'-population trade (both let-run and EOD-close) now
// subtracts that SAME PER-PAIR `cost` (read from each pair's own cached
// votetrades.json `cost` field — confirmed to vary pair-to-pair, e.g.
// EURUSD 0.008 vs GOLD 0.02 — never hardcoded), using the identical
// `pnlPct - cost` subtraction `priceBarrierTrade` itself uses. One combined
// script (one M1 walk per pair, not two) computes BOTH the let-run
// (re-walked forward past session close, same mechanism as
// `neither_population_live_gap_study.mjs`'s Q2) and EOD-close (marked to the
// entry session's own last-bar close, same mechanism as
// `neither_population_eod_close_impact.mjs`) trade lists, so the walk cost
// is paid once, not twice.
//
// Same validated pipeline throughout (`analysis/drawdown_throttle_backtest.mjs`'s
// own: per-pair concurrency cap max=1 -> 0.5%/trade risk-adjust -> 1% heat
// cap -> daily series -> portfolioStats) — not reinvented.
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
const MAX_CONCURRENT = 1, RISK_PCT = 0.5, MAX_HEAT_PCT = 1;
const REWALK_MAX_BARS = 700000;

const PAIRS = process.env.LA_PAIRS
  ? process.env.LA_PAIRS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  : ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
     'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

function binarySearchStart(times, t) {
  let lo = 0, hi = times.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid] < t) lo = mid + 1; else hi = mid; }
  return lo;
}
function rewalkForward(packed, touch) {
  const { times, highs, lows } = packed;
  const isUp = touch.side === 'up';
  const sgn = isUp ? 1 : -1;
  const here = touch.level, pip = touch.pip;
  const innerDistPips = touch.innerDistPips, outerDistPips = touch.outerDistPips;
  if (innerDistPips == null) return null;
  const inner = here - sgn * innerDistPips * pip;
  const outer = outerDistPips != null ? here + sgn * outerDistPips * pip : null;
  const reach = (px, target) => (isUp ? px >= target : px <= target);
  const startIdx = binarySearchStart(times, touch.time);
  const cap = Math.min(times.length, startIdx + REWALK_MAX_BARS);
  for (let j = startIdx; j < cap; j++) {
    const fwd = isUp ? highs[j] : lows[j];
    const bwd = isUp ? lows[j] : highs[j];
    if (outer != null && reach(fwd, outer)) return { outcome: 'out', resolveTime: times[j] };
    if (isUp ? bwd <= inner : bwd >= inner) return { outcome: 'back', resolveTime: times[j] };
  }
  return { outcome: 'still_open', resolveTime: null };
}

function loadBaselineRaw(pair) {
  const raw = JSON.parse(fs.readFileSync(path.join(VOTE_TRADES_DIR, `${pair}-votetrades.json`), 'utf8'));
  const trades = raw.trades.filter(t => t.margin >= MIN_MARGIN).map(t => ({ ...t, pair: raw.instrument }));
  return { trades, instrument: raw.instrument, splitDate: raw.splitDate, cost: raw.cost };
}

async function buildNeitherTradeLists(pair, splitDate, cost) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) return { extended: [], eod: [] };
  const assetClass = assetClassFor(pair);
  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [REARM], pendingRearmFrac: REARM });
  const book = buildAtlasBook(touches, { rearmFrac: REARM });
  if (!book) return { extended: [], eod: [] };
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const oosCandidates = touches.filter(t => t.rearmFrac === REARM && t.date >= splitDate && LIVE_RUNGS.has(t.rung));
  const neitherTouches = oosCandidates.filter(t => t.outcome === 'neither');

  const extended = [], eod = [];
  for (const t of neitherTouches) {
    const vd = voteDecision(book, t);
    if (!vd || vd.margin < MIN_MARGIN) continue;
    const targetPips = vd.decision === 'fade' ? t.innerDistPips : t.outerDistPips;
    const stopPips = vd.decision === 'fade' ? t.outerDistPips : t.innerDistPips;
    if (targetPips == null || stopPips == null) continue;
    const denom = t.open > 0 ? t.open : null;
    const base = { instrument: t.instrument, pair: t.instrument, date: t.date, time: t.time,
      side: t.side, rung: t.rung, session: t.session, entry: t.level, pip: t.pip,
      decision: vd.decision, margin: vd.margin, targetPips, stopPips };

    // ── let-run: re-walked forward past session close on the raw continuous
    // M1 series to its REAL extended resolution (same mechanism as
    // neither_population_live_gap_study.mjs's Q2).
    const rw = rewalkForward(packed, t);
    if (rw && rw.outcome !== 'still_open' && denom) {
      const win = (vd.decision === 'fade' && rw.outcome === 'back') || (vd.decision === 'follow' && rw.outcome === 'out');
      const pnlPips = win ? targetPips : -stopPips;
      const pnlPct = +((pnlPips * t.pip / denom * 100) - cost).toFixed(4);   // SAME priceBarrierTrade convention: pnlPct - cost
      extended.push({ ...base, resolveTime: rw.resolveTime, win, pnlPct });
    }

    // ── EOD-close: marked to the entry session's own last-bar close (same
    // mechanism as neither_population_eod_close_impact.mjs).
    const bars = sessions.get(t.date);
    if (bars?.length && denom) {
      const eodClose = bars[bars.length - 1].close;
      const eodTime = bars[bars.length - 1].time;
      const dir = betDirection({ decision: vd.decision, side: t.side }) === 'long' ? 1 : -1;
      const pnlPct = +(((eodClose - t.level) * dir / denom * 100) - cost).toFixed(4);
      eod.push({ ...base, resolveTime: eodTime, win: pnlPct > 0, pnlPct, eodClose });
    }
  }
  return { extended, eod };
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
  const baselinePerPair = {}, livePerPair = {}, eodPerPair = {};
  const perPairMeta = [];

  for (const pair of PAIRS) {
    console.log(`\n=== ${pair.toUpperCase()} ===`);
    let base;
    try { base = loadBaselineRaw(pair); } catch (e) { console.log(`  no cached votetrades: ${e.message}`); continue; }
    console.log(`  baseline (cached): ${base.trades.length} trades, cost=${base.cost}`);
    const t0 = Date.now();
    const { extended, eod } = await buildNeitherTradeLists(pair, base.splitDate, base.cost);
    console.log(`  let-run: ${extended.length} trades (cost=${base.cost} applied)   eod-close: ${eod.length} trades (cost=${base.cost} applied) — ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    baselinePerPair[base.instrument] = base.trades;
    livePerPair[base.instrument] = [...base.trades, ...extended];
    eodPerPair[base.instrument] = [...base.trades, ...eod];
    perPairMeta.push({ pair: base.instrument, cost: base.cost, baselineN: base.trades.length, extendedN: extended.length, eodN: eod.length });
  }

  const baselineStats = pipelineStats(baselinePerPair);
  const liveStats = pipelineStats(livePerPair);
  const eodStats = pipelineStats(eodPerPair);

  console.log(`\n\n================ COST-FIXED 3-SCENARIO COMPARISON (${Object.keys(baselinePerPair).length} of 17 pairs) ================`);
  function row(label, s) { return `| ${label} | ${s.trades} | ${s.sharpe} | ${s.maxDD}% | ${s.cagr}% | ${s.profitFactor} |`; }
  console.log('| scenario | trades | Sharpe | maxDD | CAGR | PF |');
  console.log('|---|---|---|---|---|---|');
  console.log(row('Baseline (validated)', baselineStats));
  console.log(row('EOD close (cost-fixed)', eodStats));
  console.log(row('Let-run (cost-fixed)', liveStats));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'neither_population_full_comparison.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), pairsCovered: Object.keys(baselinePerPair),
    config: { REARM, MIN_MARGIN, MAX_CONCURRENT, RISK_PCT, MAX_HEAT_PCT, REWALK_MAX_BARS },
    perPairMeta, baselineStats, liveStats, eodStats,
  }, null, 2));
  console.log(`\nWrote detail to ${OUT_DIR}/neither_population_full_comparison.json`);
}

main();
