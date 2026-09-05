// Neither-Population 4-Scenario Comparison (adds BERIDE exit) — 2026-08-31
//
// 4th alternative alongside baseline/EOD-close/let-run
// (`neither_population_full_comparison.mjs`): a chandelier/giveback exit
// applied ONLY to the 'neither' population — let price run past the original
// fixed target like let-run does, but instead of holding to the original
// fixed SL forever, close once price gives back `trailFrac` x R from its best
// point reached (once TP is first touched). Before TP is ever reached, this
// is IDENTICAL to the fixed rule (same win/loss as let-run's own outcome
// for that leg) — only the excess past TP is put at risk on a trail instead
// of held uncapped.
//
// This is `js/forecastAnalyser.js`'s `simulateExitVariants` 'beride' rule,
// NOT reinvented here — its exact per-bar semantics (stop-first, then arm at
// TP, then ratchet-only trail, conservative intrabar ordering) are
// reproduced against the RAW CONTINUOUS multi-day M1 series (packed) instead
// of `simulateExitVariants`' own session-bounded `bars`/`forwardBars`
// signature, because a 'neither' touch's whole reason for existing is that
// it runs past its own session — same reasoning `rewalkForward` (let-run)
// already established in `neither_population_live_gap_study.mjs`.
//
// trailFrac=2 is NOT invented here — it's the exact IS-fit, OOS-frozen value
// `analysis/beride_exit_study.mjs` already validated (see its own
// `bestTrailFrac` output, `analysis/output/beride_exit_study.json`) on the
// whole margin>=3 population earlier this session. Reused verbatim.
//
// One M1 walk per pair produces THREE 'neither'-population trade lists
// (let-run, EOD-close, beride) plus the untouched baseline — not four walks.
// Cost: same per-pair `cost` read from each pair's own cached votetrades.json
// (confirmed to vary pair-to-pair), same `pnlPct - cost` subtraction
// `priceBarrierTrade` uses, applied to every 'neither'-population trade in
// every scenario (the bug found and fixed in the previous round).
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
// IS-fit, OOS-frozen value from analysis/beride_exit_study.mjs's own
// bestTrailFrac (analysis/output/beride_exit_study.json) — NOT refit here.
const BERIDE_TRAILFRAC = 2;

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

// Reproduces simulateExitVariants' 'beride' rule verbatim (js/forecastAnalyser.js),
// on the raw continuous multi-day M1 series instead of a session-bounded array.
// dir: +1 = buy (long), -1 = sell (short). S0 = original stop price, TP =
// original target price, R = |E-S0| (the declared stop distance).
function berideWalkForward(packed, touch, dir, S0, TP, trailFrac) {
  const { times, highs, lows, closes } = packed;
  const E = touch.level;
  const R = Math.abs(E - S0);
  const buy = dir > 0;
  let stop = S0, stopMoved = false, tpArmed = false;
  const startIdx = binarySearchStart(times, touch.time);
  const cap = Math.min(times.length, startIdx + REWALK_MAX_BARS);
  for (let k = startIdx; k < cap; k++) {
    const high = highs[k], low = lows[k];
    const adverse = buy ? low : high, favour = buy ? high : low;
    if (buy ? adverse <= stop : adverse >= stop) return { exitPrice: stop, why: stopMoved ? 'trail' : 'stop', exitTime: times[k] };
    if (!tpArmed) {
      if (buy ? favour >= TP : favour <= TP) {
        tpArmed = true;
        const be = buy ? Math.max(stop, E) : Math.min(stop, E);
        if (be !== stop) { stop = be; stopMoved = true; }
      }
    } else {
      const newStop = buy ? favour - trailFrac * R : favour + trailFrac * R;
      const upd = buy ? Math.max(stop, newStop) : Math.min(stop, newStop);
      if (upd !== stop) { stop = upd; stopMoved = true; }
    }
  }
  if (cap <= startIdx) return { exitPrice: E, why: 'close', exitTime: touch.time, stillOpen: true };
  return { exitPrice: closes[cap - 1], why: 'close', exitTime: times[cap - 1], stillOpen: true };
}

function loadBaselineRaw(pair) {
  const raw = JSON.parse(fs.readFileSync(path.join(VOTE_TRADES_DIR, `${pair}-votetrades.json`), 'utf8'));
  const trades = raw.trades.filter(t => t.margin >= MIN_MARGIN).map(t => ({ ...t, pair: raw.instrument }));
  return { trades, instrument: raw.instrument, splitDate: raw.splitDate, cost: raw.cost };
}

async function buildNeitherTradeLists(pair, splitDate, cost) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) return { extended: [], eod: [], beride: [] };
  const assetClass = assetClassFor(pair);
  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [REARM], pendingRearmFrac: REARM });
  const book = buildAtlasBook(touches, { rearmFrac: REARM });
  if (!book) return { extended: [], eod: [], beride: [] };
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const oosCandidates = touches.filter(t => t.rearmFrac === REARM && t.date >= splitDate && LIVE_RUNGS.has(t.rung));
  const neitherTouches = oosCandidates.filter(t => t.outcome === 'neither');

  const extended = [], eod = [], beride = [];
  for (const t of neitherTouches) {
    const vd = voteDecision(book, t);
    if (!vd || vd.margin < MIN_MARGIN) continue;
    const targetPips = vd.decision === 'fade' ? t.innerDistPips : t.outerDistPips;
    const stopPips = vd.decision === 'fade' ? t.outerDistPips : t.innerDistPips;
    if (targetPips == null || stopPips == null) continue;
    const denom = t.open > 0 ? t.open : null;
    if (!denom) continue;
    const base = { instrument: t.instrument, pair: t.instrument, date: t.date, time: t.time,
      side: t.side, rung: t.rung, session: t.session, entry: t.level, pip: t.pip,
      decision: vd.decision, margin: vd.margin, targetPips, stopPips };

    // ── let-run (reused as-is) ──
    const rw = rewalkForward(packed, t);
    if (rw && rw.outcome !== 'still_open') {
      const win = (vd.decision === 'fade' && rw.outcome === 'back') || (vd.decision === 'follow' && rw.outcome === 'out');
      const pnlPips = win ? targetPips : -stopPips;
      const pnlPct = +((pnlPips * t.pip / denom * 100) - cost).toFixed(4);
      extended.push({ ...base, resolveTime: rw.resolveTime, win, pnlPct });
    }

    // ── EOD-close (reused as-is) ──
    const bars = sessions.get(t.date);
    if (bars?.length) {
      const eodClose = bars[bars.length - 1].close;
      const eodTime = bars[bars.length - 1].time;
      const dir0 = betDirection({ decision: vd.decision, side: t.side }) === 'long' ? 1 : -1;
      const pnlPct = +(((eodClose - t.level) * dir0 / denom * 100) - cost).toFixed(4);
      eod.push({ ...base, resolveTime: eodTime, win: pnlPct > 0, pnlPct, eodClose });
    }

    // ── beride (new): S0/TP prices from the SAME inner/outer geometry
    // rewalkForward already reconstructs — fade: TP=inner,S0=outer;
    // follow: TP=outer,S0=inner (matches simulateExitVariants' own convention).
    const isUp = t.side === 'up';
    const sgn = isUp ? 1 : -1;
    const inner = t.level - sgn * t.innerDistPips * t.pip;
    const outer = t.outerDistPips != null ? t.level + sgn * t.outerDistPips * t.pip : null;
    if (outer == null) continue;   // structurally unpriceable (p90-style, shouldn't occur — p90 excluded)
    const dir = betDirection({ decision: vd.decision, side: t.side }) === 'long' ? 1 : -1;
    const TP = vd.decision === 'fade' ? inner : outer;
    const S0 = vd.decision === 'fade' ? outer : inner;
    const br = berideWalkForward(packed, t, dir, S0, TP, BERIDE_TRAILFRAC);
    if (br && !br.stillOpen) {
      const pnlPct = +((dir * (br.exitPrice - t.level) / denom * 100) - cost).toFixed(4);
      beride.push({ ...base, resolveTime: br.exitTime, win: pnlPct > 0, pnlPct, exitWhy: br.why });
    }
  }
  return { extended, eod, beride };
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
  const baselinePerPair = {}, livePerPair = {}, eodPerPair = {}, beridePerPair = {};
  const perPairMeta = [];

  for (const pair of PAIRS) {
    console.log(`\n=== ${pair.toUpperCase()} ===`);
    let base;
    try { base = loadBaselineRaw(pair); } catch (e) { console.log(`  no cached votetrades: ${e.message}`); continue; }
    const t0 = Date.now();
    const { extended, eod, beride } = await buildNeitherTradeLists(pair, base.splitDate, base.cost);
    console.log(`  baseline=${base.trades.length} (cost=${base.cost})  let-run=${extended.length}  eod=${eod.length}  beride=${beride.length} — ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    baselinePerPair[base.instrument] = base.trades;
    livePerPair[base.instrument] = [...base.trades, ...extended];
    eodPerPair[base.instrument] = [...base.trades, ...eod];
    beridePerPair[base.instrument] = [...base.trades, ...beride];
    perPairMeta.push({ pair: base.instrument, cost: base.cost, baselineN: base.trades.length, extendedN: extended.length, eodN: eod.length, berideN: beride.length });
  }

  const baselineStats = pipelineStats(baselinePerPair);
  const liveStats = pipelineStats(livePerPair);
  const eodStats = pipelineStats(eodPerPair);
  const berideStats = pipelineStats(beridePerPair);

  console.log(`\n\n================ 4-SCENARIO COMPARISON (${Object.keys(baselinePerPair).length} of 17 pairs, beride trailFrac=${BERIDE_TRAILFRAC}) ================`);
  function row(label, s) { return `| ${label} | ${s.trades} | ${s.sharpe} | ${s.maxDD}% | ${s.cagr}% | ${s.profitFactor} |`; }
  console.log('| scenario | trades | Sharpe | maxDD | CAGR | PF |');
  console.log('|---|---|---|---|---|---|');
  console.log(row('Baseline', baselineStats));
  console.log(row('EOD close (cost-fixed)', eodStats));
  console.log(row('Let-run (cost-fixed)', liveStats));
  console.log(row(`Beride/chandelier (cost-fixed, trailFrac=${BERIDE_TRAILFRAC})`, berideStats));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'neither_population_beride_comparison.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), pairsCovered: Object.keys(baselinePerPair), berideTrailFrac: BERIDE_TRAILFRAC,
    config: { REARM, MIN_MARGIN, MAX_CONCURRENT, RISK_PCT, MAX_HEAT_PCT, REWALK_MAX_BARS },
    perPairMeta, baselineStats, liveStats, eodStats, berideStats,
  }, null, 2));
  console.log(`\nWrote detail to ${OUT_DIR}/neither_population_beride_comparison.json`);
}

main();
