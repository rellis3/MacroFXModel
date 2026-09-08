// HL Early-Reaction Tradeable Study — 2026-09-08
//
// Direct follow-up to analysis/causal_early_reaction_study.mjs, which found a real,
// OOS, geometry-adjusted deviation for the DYNAMIC-HL family only: shallow early
// reaction (<15%, 15-35% of the way to the reversal target) at a fixed checkpoint
// continues MORE than fair two-barrier-race odds say; deep reaction (>60%) reverses
// MORE than fair odds say. That result is a statistical deviation from a THEORETICAL
// gambler's-ruin baseline, not a P&L. This script answers the actual next question:
// does entering AT THE CHECKPOINT and betting the band's signal turn into a real,
// cost-adjusted edge — win rate / profit factor / per-trade Sharpe — beyond what the
// same checkpoint-entry MECHANIC alone would produce with no signal at all?
//
// Daily-open family is NOT touched here (causal study found pure geometry there,
// nothing to test) — dynamic-HL (p50/p75 rungs) only, per the task.
//
// ── REUSE, NOT A REBUILD ─────────────────────────────────────────────────────────
// The touch/rearm/race walk (walkSideTradeable below) and the checkpoint measurement
// (checkpointSnapshot below) are copied from analysis/dynamic_hl_level_study.mjs and
// analysis/causal_early_reaction_study.mjs's own dynamic-HL pass (walkSideCausal /
// earlyCheckpointMeasurements) — same self-containment convention every sibling
// script in this directory uses (a purpose-built walk, not an import, because the
// anchor moves bar-to-bar in a way atlasWalk's own indexing can't express). The ONLY
// change from the causal study's version: instead of returning `pTheory` (the
// gambler's-ruin benchmark, not needed for a P&L), checkpointSnapshot returns the
// checkpoint bar's own price and time — the exact entry point + entry moment a real
// order would have used, still governed by the identical no-lookahead causality gate
// (`minsToResolve > checkpoint`, STRICT — see causal_early_reaction_study.mjs's header
// for the full proof this guarantees the checkpoint window contains no post-resolution
// bar, hence never a divide-by-zero and never a look-ahead).
//
// costForPair (js/perLineStrategy.js — the same per-pair round-trip cost constant
// every backtest this session uses), applyConcurrencyCap (js/levelAtlasVoteReview.js,
// maxConcurrent=1 per pair, applied per-pair before pooling — same as every portfolio
// backtest this session) and backtestStats (js/backtestStats.js — the standard
// per-trade battery) are all imported, never reimplemented.
//
// ── TRADE CONSTRUCTION ───────────────────────────────────────────────────────────
// For every eligible touch at checkpoint cp (minsToResolve>cp, outcome != 'neither'):
//   entry price  = the checkpoint bar's own close (bars[ck].close, never a later bar)
//   entry time   = the checkpoint bar's own timestamp
//   contTarget   = the touch's OUTER neighbour (continuation — same target the
//                  underlying race already defined at touch time)
//   revTarget    = the touch's INNER neighbour (reversal)
// BANDED rule: band=<15% or 15-35% -> bet 'continuation' (target=contTarget,
//   stop=revTarget); band=>60% -> bet 'reversal' (target=revTarget, stop=contTarget);
//   band=35-60% (middle) -> SKIP, not traded (causal study found no edge there).
// UNCONDITIONAL control: every eligible touch, EVERY band including the middle,
//   always betting 'continuation' — isolates "does entering at the checkpoint at all
//   help" (the structural entry-timing effect) from "does the earlyPullbackFrac band
//   itself carry information" (the actual signal). The gap between the two is the
//   only honest measure of the SIGNAL's value.
// pnlPct = (win ? +|targetPrice-entryPrice| : -|stopPrice-entryPrice|) / entryPrice
//          * 100 - cost — the identical gross-minus-flat-cost convention
//          priceBarrierTrade (js/levelAtlasVoteReview.js) already uses, just priced
//          from the checkpoint entry instead of the touch entry.
//
// Concurrency: applyConcurrencyCap(trades, {maxConcurrent:1}) run PER PAIR (a p50 and
// p75 touch on the same pair can overlap in time), then pooled across pairs for the
// headline stats — same shape analysis/fib_atlas_cost_ratio_pooled_oos.mjs uses.
//
// Sample floor MIN_SAMPLE=30 (flagged, not hidden), OOS only per the task's ask — IS
// is computed nowhere here, this is a P&L question, not a sanity check on sign.
//
// Pure historical re-walk of real M1 — no synthetic data, no lookahead.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { bucketM1IntoSessions } from '../js/forecastAnalyser.js';
import { forecastSigma } from '../js/forecastSigma.js';
import { LADDER_PARAMS } from '../js/forecastLadderParams.js';
import { computeBands, ASSET_PARAMS } from '../js/forecastCore.js';
import { splitAt } from '../js/levelAtlasReport.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { pipSize } from '../js/instrumentRegistry.js';
import { costForPair } from '../js/perLineStrategy.js';
import { applyConcurrencyCap } from '../js/levelAtlasVoteReview.js';
import { backtestStats } from '../js/backtestStats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = path.join(__dirname, 'output');

const REARM_FRAC = 0.3;
const MIN_LOOKBACK = 60;
export const MIN_SAMPLE = 30;
const SPLIT_FRAC = 0.6;
export const CHECKPOINTS_MIN = [5, 15, 30, 60];
// BM_P90 — see analysis/dynamic_hl_level_study.mjs's header for the full derivation.
// Duplicated as a plain constant, unused for touch detection (p90 excluded, no outer
// rung — see that header) but needed to build p75's OUTER neighbour correctly.
const BM_P90 = 2.555;

// Banded rule per the task: shallow (<15%, 15-35%) bets CONTINUATION, deep (>60%)
// bets REVERSAL, middle (35-60%) is skipped entirely (no edge found there).
export const BANDS = [
  { key: '<15%', test: f => f < 0.15, bet: 'continuation' },
  { key: '15-35%', test: f => f >= 0.15 && f < 0.35, bet: 'continuation' },
  { key: '35-60%', test: f => f >= 0.35 && f < 0.6, bet: null },   // skip — no edge
  { key: '>60%', test: f => f >= 0.6, bet: 'reversal' },
];
export function bandOf(frac) { for (const b of BANDS) if (b.test(frac)) return b; return null; }

export const ALL_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const PAIRS = process.env.LA_PAIRS
  ? process.env.LA_PAIRS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  : ALL_PAIRS;

function pct(n, d) { return d > 0 ? +(n / d * 100).toFixed(1) : null; }

// ── Checkpoint snapshot — same causality gate as causal_early_reaction_study.mjs's
// earlyCheckpointMeasurements, but returns the checkpoint bar's own price/time (the
// real entry a bracket order would have used) instead of the gambler's-ruin pTheory
// (not needed here — this is a P&L study, not a geometry-deviation study).
function checkpointSnapshot(bars, k, level, revDir, minsToResolve, outcome, revSpan) {
  const out = {};
  if (outcome === 'neither' || minsToResolve == null || !(revSpan > 0)) return out;
  const touchTime = bars[k].time;
  for (const cp of CHECKPOINTS_MIN) {
    if (!(minsToResolve > cp)) continue;   // STRICT — no checkpoint past the touch's real resolution (no lookahead)
    const targetTime = touchTime + cp * 60;
    let ck = k;
    for (let j = k + 1; j < bars.length; j++) {
      if (bars[j].time <= targetTime) ck = j; else break;
    }
    let extreme = revDir === 'down' ? Infinity : -Infinity;
    for (let j = k; j <= ck; j++) {
      const b = bars[j];
      if (revDir === 'down') { if (b.low < extreme) extreme = b.low; }
      else { if (b.high > extreme) extreme = b.high; }
    }
    const moved = revDir === 'down' ? (level - extreme) : (extreme - level);
    const frac = Math.min(1, Math.max(0, moved) / revSpan);
    out[cp] = { frac: +frac.toFixed(4), ckTime: bars[ck].time, ckPrice: bars[ck].close };
  }
  return out;
}

// ── HL fractions off daily-fit sigma — identical to dynamic_hl_level_study.mjs ────
function computeHlFractions(sigma, assetClass) {
  const b = computeBands(1, sigma, assetClass);
  const p = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;
  const hl90 = BM_P90 * p.hl_75_corr * sigma;
  return { hl50: b.hl50, hl75: b.hl75, hl90 };
}

// ── The dynamic-HL touch/rearm/race walk for ONE side, ONE day — p50/p75 only ────
// (p90 excluded: no outer rung to break through, 'continuation' structurally
// impossible there, same exclusion the causal study and reviewVoteBacktest apply.)
// Returns raw eligible touches carrying contTarget(=outer)/revTarget(=inner)/pip and
// per-checkpoint entry snapshots.
function walkSideTradeable(bars, open, hl, isUp, rearmFrac, pip) {
  const n = bars.length;
  if (n < 2) return [];
  const anchorLag = new Array(n);
  { let ext = open;
    for (let k = 0; k < n; k++) {
      anchorLag[k] = ext;
      if (isUp) { if (bars[k].low < ext) ext = bars[k].low; }
      else { if (bars[k].high > ext) ext = bars[k].high; }
    }
  }
  const lv = k => {
    const a = anchorLag[k];
    return isUp
      ? [a, a * (1 + hl.hl50), a * (1 + hl.hl75), a * (1 + hl.hl90)]
      : [a, a * (1 - hl.hl50), a * (1 - hl.hl75), a * (1 - hl.hl90)];
  };

  const out = [];
  for (let ri = 0; ri < 2; ri++) {   // p50 (ri=0), p75 (ri=1) only
    let armed = true;
    for (let k = 0; k < n; k++) {
      const bar = bars[k];
      const L = lv(k);
      const here = L[ri + 1], inner = L[ri], outer = L[ri + 2] ?? null;
      const rungSpan = Math.abs(here - inner);
      const rearmDist = rearmFrac * rungSpan;
      if (!armed) {
        const away = isUp ? (here - bar.close) : (bar.close - here);
        if (away >= rearmDist) armed = true;
        continue;
      }
      const px = isUp ? bar.high : bar.low;
      const reach = isUp ? px >= here : px <= here;
      if (!reach) continue;
      armed = false;

      let outcome = 'neither', resolveTime = null;
      for (let j = k; j < n; j++) {
        const b2 = bars[j];
        const fwd = isUp ? b2.high : b2.low, bwd = isUp ? b2.low : b2.high;
        if (outer != null && (isUp ? fwd >= outer : fwd <= outer)) { outcome = 'out'; resolveTime = b2.time; break; }
        if (isUp ? bwd <= inner : bwd >= inner) { outcome = 'back'; resolveTime = b2.time; break; }
      }
      const minsToResolve = resolveTime != null ? +((resolveTime - bar.time) / 60).toFixed(0) : null;
      const displayOutcome = outcome === 'out' ? 'continuation' : outcome === 'back' ? 'reversal' : 'neither';
      if (outer == null) continue;   // p90-shaped rung with no outer — structurally excluded (shouldn't occur for ri<2, defensive)
      const revDir = isUp ? 'down' : 'up';
      const revSpan = Math.abs(here - inner);
      const checks = checkpointSnapshot(bars, k, here, revDir, minsToResolve, displayOutcome, revSpan);

      if (Object.keys(checks).length) {
        out.push({
          rung: ri === 0 ? 'p50' : 'p75', touchTime: bar.time, outcome: displayOutcome,
          minsToResolve, resolveTime, contTarget: outer, revTarget: inner, pip, checks,
        });
      }
    }
  }
  return out;
}

export async function processPair(pair) {
  const sym = pair.toUpperCase();
  let packed;
  try { packed = await loadM1ForPair(pair); } catch (e) { console.log(`  M1 load failed: ${e.message}`); return null; }
  if (!packed?.n) { console.log('  no M1 data, skipping'); return null; }
  const assetClass = assetClassFor(pair);
  let pip = 1; try { pip = pipSize(pair) || 1; } catch { /* raw units */ }

  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const dates = [...sessions.keys()].sort().filter(d => (sessions.get(d)?.length ?? 0) >= 200);
  if (dates.length <= MIN_LOOKBACK) { console.log('  too little history, skipping'); return null; }

  const d1 = dates.map(d => {
    const b = sessions.get(d); let hi = -Infinity, lo = Infinity;
    for (const x of b) { if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low; }
    return { date: d, open: b[0].open, high: hi, low: lo, close: b[b.length - 1].close };
  });
  const est = LADDER_PARAMS.pairs?.[sym]?.estimator ?? LADDER_PARAMS.classDefaults?.[assetClass]?.estimator ?? 'yz_30';

  const records = [];
  for (let i = MIN_LOOKBACK; i < dates.length; i++) {
    const date = dates[i];
    const bars = sessions.get(date);
    const open = bars[0].open;
    let sigma = 0;
    try { sigma = forecastSigma(d1.slice(0, i), est); } catch { continue; }
    if (!(sigma > 0)) continue;
    const hl = computeHlFractions(sigma, assetClass);
    if (!(hl.hl50 > 0 && hl.hl75 > hl.hl50 && hl.hl90 > hl.hl75)) continue;

    for (const side of ['up', 'down']) {
      const isUp = side === 'up';
      const touches = walkSideTradeable(bars, open, hl, isUp, REARM_FRAC, pip);
      for (const t of touches) records.push({ instrument: sym, pair, assetClass, date, side, ...t });
    }
  }

  if (!records.length) { console.log('  no eligible touches, skipping'); return null; }
  const { split } = splitAt(records, SPLIT_FRAC);
  for (const r of records) r.isOos = r.date >= split ? 'oos' : 'is';
  console.log(`  ${dates.length} sessions, ${records.length} eligible touches (p50/p75, >=1 checkpoint), split ${split}`);
  return { pair: sym, coverage: { from: dates[MIN_LOOKBACK], to: dates.at(-1), sessions: dates.length }, splitDate: split, records };
}

// ── Price ONE candidate trade at a given checkpoint under a given bet ───────────
export function priceTrade(touch, cp, bet) {
  const snap = touch.checks[cp];
  if (!snap) return null;
  const entryPrice = snap.ckPrice;
  const targetPrice = bet === 'continuation' ? touch.contTarget : touch.revTarget;
  const stopPrice = bet === 'continuation' ? touch.revTarget : touch.contTarget;
  const win = (bet === 'continuation' && touch.outcome === 'continuation') || (bet === 'reversal' && touch.outcome === 'reversal');
  const distToTarget = Math.abs(targetPrice - entryPrice);
  const distToStop = Math.abs(stopPrice - entryPrice);
  if (!(entryPrice > 0) || !(distToTarget > 0) || !(distToStop > 0)) return null;
  const cost = costForPair(touch.pair, touch.assetClass);
  const pnlPct = +(((win ? distToTarget : -distToStop) / entryPrice * 100) - cost).toFixed(4);
  return {
    instrument: touch.instrument, assetClass: touch.assetClass, date: touch.date, side: touch.side, rung: touch.rung,
    time: snap.ckTime, resolveTime: touch.resolveTime, frac: snap.frac, bet, win, pnlPct,
    // entry/pip (2026-09-08, additive — no existing consumer reads these off
    // this function's return value) let a downstream caller (e.g. the
    // portfolio-additive study) run this trade through the SAME
    // `riskAdjustTrades` brick levelAtlasVoteReview.js's own trades already
    // go through, instead of re-deriving an R-multiple by hand.
    entry: entryPrice, pip: touch.pip,
    targetPips: +(distToTarget / touch.pip).toFixed(1), stopPips: +(distToStop / touch.pip).toFixed(1),
  };
}

// Cap concurrency per pair (maxConcurrent=1), then pool — same shape every
// portfolio backtest this session uses.
export function capPerPairThenPool(trades) {
  const byPair = new Map();
  for (const t of trades) { if (!byPair.has(t.instrument)) byPair.set(t.instrument, []); byPair.get(t.instrument).push(t); }
  const kept = [];
  for (const [, list] of byPair) {
    const capped = applyConcurrencyCap(list, { maxConcurrent: 1 });
    if (capped?.kept?.length) kept.push(...capped.kept);
  }
  return kept;
}

function statsFor(trades) {
  if (!trades.length) return { n: 0, thin: true };
  const bs = backtestStats(trades.map(t => t.pnlPct), trades.map(t => t.date));
  return {
    n: bs.trades, winRate: +(bs.winRate * 100).toFixed(1), profitFactor: bs.profitFactor,
    sharpe: bs.sharpe, expectancyPct: bs.expectancy, cagr: bs.cagr, maxDD: bs.maxDD,
    thin: bs.trades < MIN_SAMPLE,
  };
}

function byAssetClassStats(trades) {
  const out = {};
  for (const ac of ['fx', 'commodity', 'index']) {
    const rows = trades.filter(t => t.assetClass === ac);
    if (!rows.length) continue;
    out[ac] = statsFor(rows);
  }
  return out;
}

async function main() {
  console.log('HL Early-Reaction Tradeable Study — checkpoint-entry backtest, real per-pair cost + concurrency cap\n');
  const allRecords = [];
  const perPairMeta = [];
  for (const pair of PAIRS) {
    console.log(`=== ${pair.toUpperCase()} ===`);
    const r = await processPair(pair);
    if (!r) continue;
    allRecords.push(...r.records);
    perPairMeta.push({ pair: r.pair, coverage: r.coverage, splitDate: r.splitDate, nRecords: r.records.length });
  }
  const oosRecords = allRecords.filter(r => r.isOos === 'oos');
  console.log(`\nPooled: ${perPairMeta.length} pairs, ${allRecords.length} eligible touches total (${oosRecords.length} OOS).`);

  const byCheckpoint = {};
  for (const cp of CHECKPOINTS_MIN) {
    console.log(`\n\n================ CHECKPOINT = ${cp}min ================`);
    const eligible = oosRecords.filter(r => r.checks[cp] !== undefined);

    // ── Per-band trades (banded rule) ──────────────────────────────────────────
    const bandResults = {};
    const bandedTradesForCombine = [];
    for (const b of BANDS) {
      const rows = eligible.filter(r => bandOf(r.checks[cp].frac)?.key === b.key);
      if (b.bet == null) {
        bandResults[b.key] = { n: rows.length, note: 'not traded — middle band, no edge per causal study', excluded: true };
        continue;
      }
      const priced = rows.map(r => priceTrade(r, cp, b.bet)).filter(Boolean);
      const capped = capPerPairThenPool(priced);
      bandedTradesForCombine.push(...capped);
      const s = statsFor(capped);
      bandResults[b.key] = { ...s, byAssetClass: byAssetClassStats(capped) };
      console.log(`  band ${b.key.padEnd(8)} bet=${b.bet.padEnd(12)} n=${String(s.n).padStart(5)}  winRate=${String(s.winRate).padStart(5)}%  PF=${String(s.profitFactor).padStart(5)}  sharpe=${String(s.sharpe).padStart(6)}${s.thin ? '  [THIN n<' + MIN_SAMPLE + ']' : ''}`);
    }
    console.log(`  band 35-60%      SKIPPED (not traded) — n=${bandResults['35-60%'].n} touches would have been eligible`);

    // ── Banded rule combined (what you'd actually trade) ───────────────────────
    const bandedCombined = statsFor(bandedTradesForCombine);
    bandedCombined.byAssetClass = byAssetClassStats(bandedTradesForCombine);
    console.log(`  BANDED RULE (combined, excl. middle) n=${String(bandedCombined.n).padStart(5)}  winRate=${String(bandedCombined.winRate).padStart(5)}%  PF=${String(bandedCombined.profitFactor).padStart(5)}  sharpe=${String(bandedCombined.sharpe).padStart(6)}${bandedCombined.thin ? '  [THIN]' : ''}`);

    // ── Unconditional control: every eligible touch, always bet continuation ──
    const uncondPriced = eligible.map(r => priceTrade(r, cp, 'continuation')).filter(Boolean);
    const uncondCapped = capPerPairThenPool(uncondPriced);
    const unconditional = statsFor(uncondCapped);
    unconditional.byAssetClass = byAssetClassStats(uncondCapped);
    console.log(`  UNCONDITIONAL (all bands, always continuation) n=${String(unconditional.n).padStart(5)}  winRate=${String(unconditional.winRate).padStart(5)}%  PF=${String(unconditional.profitFactor).padStart(5)}  sharpe=${String(unconditional.sharpe).padStart(6)}${unconditional.thin ? '  [THIN]' : ''}`);

    const sharpeMargin = (bandedCombined.sharpe != null && unconditional.sharpe != null) ? +(bandedCombined.sharpe - unconditional.sharpe).toFixed(3) : null;
    const pfMargin = (bandedCombined.profitFactor != null && unconditional.profitFactor != null) ? +(bandedCombined.profitFactor - unconditional.profitFactor).toFixed(3) : null;
    console.log(`  MARGIN (banded − unconditional): sharpe=${sharpeMargin}  PF=${pfMargin}`);

    byCheckpoint[cp] = { nEligibleOos: eligible.length, bands: bandResults, bandedCombined, unconditional, sharpeMarginOverUnconditional: sharpeMargin, pfMarginOverUnconditional: pfMargin };
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'hl_early_reaction_tradeable_study.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    pairs: PAIRS, checkpointsMin: CHECKPOINTS_MIN, bands: BANDS.map(b => ({ key: b.key, bet: b.bet })),
    rearmFrac: REARM_FRAC, splitFrac: SPLIT_FRAC, minSample: MIN_SAMPLE,
    perPairMeta, totalEligibleOos: oosRecords.length,
    byCheckpoint,
    note: 'Reference only, not rerun: the original vote-margin-null baseline (js/levelAtlasVoteReview.js reviewVoteBacktest) that this whole line of research started from found unconditional touch outcome ~coin-flip / no edge before this checkpoint-entry mechanic was tested.',
  }, null, 0));
  console.log(`\nWrote full detail to ${OUT_DIR}/hl_early_reaction_tradeable_study.json`);
}

// Guarded (2026-09-08, additive): this module is now also imported for its
// exported bricks (processPair/priceTrade/capPerPairThenPool/BANDS/etc) by
// analysis/hl_signal_portfolio_additive_study.mjs, which needs the exact
// same, already-validated walk/pricing logic rather than a re-derived copy —
// importing it must NOT also kick off this file's own expensive 17-pair CLI
// run as a side effect. Only runs main() when this file is the one actually
// executed (`node analysis/hl_early_reaction_tradeable_study.mjs`).
if (path.resolve(process.argv[1] ?? '') === __filename) main();
