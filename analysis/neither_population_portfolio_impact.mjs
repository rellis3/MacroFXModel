// Neither-Population PORTFOLIO Impact — 2026-08-31
//
// Follow-up to `analysis/neither_population_live_gap_study.mjs` (which showed
// how big the 'neither' — same-day-unresolved — population is, and what its
// own per-trade pnl looks like when let to ride to a real resolution). This
// script answers the harder question: does adding that population back in
// (the REALISTIC live scenario — volatility_bot_v2 has no EOD close, ever)
// change the shipped headline PORTFOLIO numbers — total profit/CAGR and,
// specifically, MAX DRAWDOWN — not just the per-trade averages?
//
// Two trade lists per pair, both margin>=3, p50/p75 (fade+follow):
//   BASELINE      — the EXISTING validated trade list, loaded directly from
//                    analysis/output/level-atlas-vote-trades/{pair}-votetrades.json
//                    (never recomputed — those are the shipped numbers).
//   LIVE-REALISTIC — baseline trades UNCHANGED, PLUS every qualifying
//                    'neither' touch's trade, re-priced off its REAL
//                    extended-resolution outcome (same fixed target/stop,
//                    walked forward on the raw continuous M1 series past
//                    session close — identical mechanism/code to the Q2 study).
//                    A strict superset of baseline at the per-pair candidate
//                    level.
//
// Both lists go through the SAME real portfolio pipeline
// `analysis/drawdown_throttle_backtest.mjs` already uses and validates
// (per-pair concurrency cap -> fixed-fractional risk-adjust -> portfolio-wide
// heat cap -> buildPortfolioDailySeries -> portfolioStats) — not reinvented.
// The concurrency cap is DELIBERATELY re-run on the (bigger) live-realistic
// list, not skipped: a 'neither' trade that stays open for days is a REAL
// occupied slot a live single-concurrent-position bot could not also use for
// a fresh signal, so re-running the cap on the union is the honest
// representation of what live trading would actually do, not an artifact.
//
// Clustering check: builds baseline's own daily drawdown-state series, then
// asks whether the EXTENDED-TRADES-ONLY daily pnl (its own concurrency+risk+
// heat-cap pipeline, run in isolation so its timing is visible on its own)
// tends to land on dates where baseline was ALREADY in a real drawdown, vs
// scattered elsewhere — the mechanism by which a thin-but-positive per-trade
// edge (Q2's finding) could still hurt portfolio maxDD.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook } from '../js/levelAtlasReport.js';
import { voteDecision, applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries, applyPortfolioHeatCap } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { sharpeStdError } from '../js/metricsCore.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VOTE_TRADES_DIR = path.join(__dirname, 'output', 'level-atlas-vote-trades');
const OUT_DIR = path.join(__dirname, 'output');

const REARM = 0.3;
const MIN_MARGIN = 3;
const LIVE_RUNGS = new Set(['p50', 'p75']);
// SAME pipeline config as analysis/drawdown_throttle_backtest.mjs's validated,
// already-shipped baseline (no throttle) — reused verbatim, not reinvented.
const MAX_CONCURRENT = 1, RISK_PCT = 0.5, MAX_HEAT_PCT = 1;
const REWALK_MAX_BARS = 700000;

const PAIRS = process.env.LA_PAIRS
  ? process.env.LA_PAIRS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  : ['eurusd', 'gbpusd', 'usdjpy', 'audusd'];

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
  return { trades, instrument: raw.instrument, splitDate: raw.splitDate, cost: raw.cost, generatedAt: raw.generatedAt };
}

async function buildExtendedNeitherTrades(pair, splitDate) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) return { extended: [], stillOpenCount: 0, neitherCount: 0 };
  const assetClass = assetClassFor(pair);
  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [REARM], pendingRearmFrac: REARM });
  const book = buildAtlasBook(touches, { rearmFrac: REARM });
  if (!book) return { extended: [], stillOpenCount: 0, neitherCount: 0 };
  // Use the CACHED baseline's own splitDate (not a freshly recomputed one) so
  // both trade lists share the identical IS/OOS boundary — a fresh atlasWalk
  // run here (gap-filled to today) covers slightly more calendar days than
  // whenever the cached votetrades.json was generated, which could shift a
  // freshly-derived splitDate by a session or two otherwise.
  const oosCandidates = touches.filter(t => t.rearmFrac === REARM && t.date >= splitDate && LIVE_RUNGS.has(t.rung));
  const neitherTouches = oosCandidates.filter(t => t.outcome === 'neither');
  const extended = [];
  let stillOpenCount = 0;
  for (const t of neitherTouches) {
    const vd = voteDecision(book, t);
    if (!vd || vd.margin < MIN_MARGIN) continue;
    const targetPips = vd.decision === 'fade' ? t.innerDistPips : t.outerDistPips;
    const stopPips = vd.decision === 'fade' ? t.outerDistPips : t.innerDistPips;
    if (targetPips == null || stopPips == null) continue;
    const rw = rewalkForward(packed, t);
    if (!rw || rw.outcome === 'still_open') { stillOpenCount++; continue; }   // can't price an open position — excluded, counted separately
    const win = (vd.decision === 'fade' && rw.outcome === 'back') || (vd.decision === 'follow' && rw.outcome === 'out');
    const pnlPips = win ? targetPips : -stopPips;
    const denom = t.open > 0 ? t.open : null;
    const pnlPct = denom ? +(pnlPips * t.pip / denom * 100).toFixed(4) : 0;
    extended.push({
      instrument: t.instrument, pair: t.instrument, date: t.date, time: t.time, resolveTime: rw.resolveTime,
      side: t.side, rung: t.rung, session: t.session, entry: t.level, pip: t.pip,
      decision: vd.decision, margin: vd.margin, targetPips, stopPips, win, pnlPct, extended: true,
    });
  }
  return { extended, stillOpenCount, neitherCount: neitherTouches.length };
}

function pipelineStats(perPairTrades) {
  const capped = {};
  for (const [p, trades] of Object.entries(perPairTrades)) {
    capped[p] = applyConcurrencyCap(trades, { maxConcurrent: MAX_CONCURRENT }).kept;
  }
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
  return {
    trades: all.length, sharpe: ps.sharpe, sharpeCI95, maxDD: ps.maxDD, cagr: ps.cagr,
    annVol: ps.annVol, profitFactor: ps.profitFactor, days: ps.days,
    dates: combined.dates, dailyReturns: combined.dailyReturns,
  };
}

function buildDDSeries(dates, dailyReturns) {
  let equity = 1, peak = 1; const out = [];
  for (let i = 0; i < dates.length; i++) {
    equity *= (1 + dailyReturns[i] / 100);
    if (equity > peak) peak = equity;
    out.push({ date: dates[i], dd: (equity - peak) / peak * 100 });
  }
  return out;   // buildPortfolioDailySeries already returns dates sorted ascending
}
function ddAsOf(ddSeries, queryDate) {
  let lo = 0, hi = ddSeries.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (ddSeries[mid].date <= queryDate) lo = mid + 1; else hi = mid; }
  return lo > 0 ? ddSeries[lo - 1].dd : 0;
}

async function main() {
  const baselinePerPair = {}, livePerPair = {}, extendedOnlyPerPair = {};
  const perPairMeta = [];

  for (const pair of PAIRS) {
    console.log(`\n=== ${pair.toUpperCase()} ===`);
    let base;
    try { base = loadBaselineRaw(pair); } catch (e) { console.log(`  no cached votetrades: ${e.message}`); continue; }
    console.log(`  baseline (cached): ${base.trades.length} trades (margin>=${MIN_MARGIN}, p50/p75, OOS from ${base.splitDate})`);
    const t0 = Date.now();
    const { extended, stillOpenCount, neitherCount } = await buildExtendedNeitherTrades(pair, base.splitDate);
    console.log(`  extended-'neither' trades: ${extended.length} priced (${stillOpenCount} still-open-at-horizon excluded, of ${neitherCount} total 'neither') — ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    baselinePerPair[base.instrument] = base.trades;
    livePerPair[base.instrument] = [...base.trades, ...extended];
    extendedOnlyPerPair[base.instrument] = extended;
    perPairMeta.push({ pair: base.instrument, baselineN: base.trades.length, extendedN: extended.length, stillOpenCount, neitherCount, splitDate: base.splitDate });
  }

  console.log(`\n\n================ PORTFOLIO COMPARISON (${Object.keys(baselinePerPair).length} of 17 pairs) ================`);
  console.log('Pairs covered: ' + Object.keys(baselinePerPair).join(', '));
  console.log('Pipeline: per-pair concurrency cap (max=1) -> fixed-fractional risk-adjust (0.5%/trade) -> portfolio heat cap (1% max) -> daily series -> portfolioStats');
  console.log('(same pipeline analysis/drawdown_throttle_backtest.mjs uses for the shipped baseline-no-throttle numbers)\n');

  const baselineStats = pipelineStats(baselinePerPair);
  const liveStats = pipelineStats(livePerPair);
  const extendedOnlyStats = pipelineStats(extendedOnlyPerPair);

  function ciStr(s) { return s.sharpeCI95 ? `[${s.sharpeCI95[0]}, ${s.sharpeCI95[1]}]` : '—'; }
  function printRow(label, s) {
    console.log([label.padEnd(22), String(s.trades).padStart(6), String(s.sharpe).padStart(7),
      ciStr(s).padStart(14), (s.maxDD + '%').padStart(9), (s.cagr + '%').padStart(9), String(s.profitFactor).padStart(6), String(s.days).padStart(6)].join('  '));
  }
  console.log(['config'.padEnd(22), 'trades'.padStart(6), 'sharpe'.padStart(7), 'sharpeCI95'.padStart(14),
    'maxDD'.padStart(9), 'CAGR'.padStart(9), 'PF'.padStart(6), 'days'.padStart(6)].join('  '));
  printRow('BASELINE (shipped)', baselineStats);
  printRow('LIVE-REALISTIC', liveStats);
  printRow('extended-only (diag)', extendedOnlyStats);

  console.log(`\nDelta: maxDD ${baselineStats.maxDD}% -> ${liveStats.maxDD}% (Δ ${+(liveStats.maxDD - baselineStats.maxDD).toFixed(2)}pp)`);
  console.log(`Delta: CAGR ${baselineStats.cagr}% -> ${liveStats.cagr}% (Δ ${+(liveStats.cagr - baselineStats.cagr).toFixed(2)}pp)`);
  console.log(`Delta: Sharpe ${baselineStats.sharpe} -> ${liveStats.sharpe}`);

  // ── Clustering check: does the extended-only daily pnl land on dates
  // baseline was ALREADY in a real drawdown, or scattered elsewhere?
  console.log(`\n\n================ CLUSTERING CHECK ================`);
  const baseDD = buildDDSeries(baselineStats.dates, baselineStats.dailyReturns);
  const buckets = { shallow: { n: 0, sum: 0 }, dd3: { n: 0, sum: 0 }, dd5: { n: 0, sum: 0 }, dd8: { n: 0, sum: 0 } };
  for (let i = 0; i < extendedOnlyStats.dates.length; i++) {
    const date = extendedOnlyStats.dates[i], pnl = extendedOnlyStats.dailyReturns[i];
    const ddState = ddAsOf(baseDD, date);
    const key = ddState <= -8 ? 'dd8' : ddState <= -5 ? 'dd5' : ddState <= -3 ? 'dd3' : 'shallow';
    buckets[key].n++; buckets[key].sum += pnl;
  }
  console.log('baseline-DD-state-that-day   n(extended-trade-days)   sum(extended pnl%)   mean(extended pnl%)');
  for (const [k, label] of [['shallow', '> -3% (normal)'], ['dd3', '-3% to -5%'], ['dd5', '-5% to -8%'], ['dd8', '<= -8% (deep)']]) {
    const b = buckets[k];
    console.log(`  ${label.padEnd(26)} ${String(b.n).padStart(6)}                  ${b.sum.toFixed(3).padStart(10)}              ${(b.n ? b.sum / b.n : 0).toFixed(4).padStart(8)}`);
  }
  // Baseline's own worst drawdown dates — what did the extended trades do on/near those exact dates?
  const worstBaselineDD = [...baseDD].sort((a, b) => a.dd - b.dd).slice(0, 10);
  console.log(`\nBaseline's 10 worst drawdown dates, and extended-only pnl on that SAME date (0 = no extended trade resolved that day):`);
  const extendedByDate = new Map(extendedOnlyStats.dates.map((d, i) => [d, extendedOnlyStats.dailyReturns[i]]));
  for (const d of worstBaselineDD) {
    console.log(`  ${d.date}  baselineDD=${d.dd.toFixed(2)}%   extendedPnlThatDay=${(extendedByDate.get(d.date) ?? 0).toFixed(3)}%`);
  }

  console.log(`\n\nPer-pair coverage:`);
  for (const m of perPairMeta) console.log(`  ${m.pair.padEnd(8)} baseline=${m.baselineN}  extended=${m.extendedN}  stillOpenExcluded=${m.stillOpenCount}  totalNeither=${m.neitherCount}  splitDate=${m.splitDate}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'neither_population_portfolio_impact.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), pairsCovered: Object.keys(baselinePerPair),
    config: { REARM, MIN_MARGIN, MAX_CONCURRENT, RISK_PCT, MAX_HEAT_PCT, REWALK_MAX_BARS },
    perPairMeta,
    baselineStats: { ...baselineStats, dates: undefined, dailyReturns: undefined },
    liveStats: { ...liveStats, dates: undefined, dailyReturns: undefined },
    extendedOnlyStats: { ...extendedOnlyStats, dates: undefined, dailyReturns: undefined },
    baselineDailySeries: { dates: baselineStats.dates, dailyReturns: baselineStats.dailyReturns },
    liveDailySeries: { dates: liveStats.dates, dailyReturns: liveStats.dailyReturns },
    extendedOnlyDailySeries: { dates: extendedOnlyStats.dates, dailyReturns: extendedOnlyStats.dailyReturns },
  }, null, 0));
  console.log(`\nWrote full detail to ${OUT_DIR}/neither_population_portfolio_impact.json`);
}

main();
