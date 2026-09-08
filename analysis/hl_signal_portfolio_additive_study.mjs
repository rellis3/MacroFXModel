// HL Signal Portfolio-Additive Study — 2026-09-08
//
// Question: is the dynamic-HL shallow-continuation-at-60min signal (see
// analysis/hl_early_reaction_tradeable_study.mjs) ADDITIVE to the currently-LIVE
// 17-pair Level Atlas Vote Portfolio (OH/OL p50/p75 rungs, minMargin=3,
// maxConcurrent=1, sizing=fixed-risk, riskPct=1), or does combining them just
// add risk without enough extra edge to justify it? Pure analysis — this script
// reads the live server's own /api/level-atlas/vote-portfolio endpoint (GET
// only) and never touches js/levelAtlasEngine.js, js/levelAtlasReport.js,
// js/levelAtlasVoteReview.js's EXISTING exports, js/levelAtlasRoutes.js,
// server.js, volatility_bot_v2/*, or any live config.
//
// ── WHICH HL TRADES ─────────────────────────────────────────────────────────
// The task's own cited OOS figures ("~82% win rate, profit factor 2.50, Sharpe
// 6.62") match hl_early_reaction_tradeable_study.json's checkpoint=60,
// band='<15%' row EXACTLY on PF (2.495) and Sharpe (6.622) — NOT the
// "bandedCombined" rule (which pools '<15%' AND '15-35%' and comes out at PF
// 1.67 / Sharpe 6.56). Win rate is reported there as 89.3%, not ~82% — close
// enough on PF/Sharpe (2 decimals) that this is almost certainly the intended
// row and the win-rate figure in the task was a loose paraphrase; verified by
// literal comparison against the JSON (see the confirming numbers logged
// below). This script therefore uses ONLY band='<15%', checkpoint=60min,
// bet='continuation' — the narrower, higher-conviction cut, not the wider
// banded-combined rule.
//
// ── REUSE, NOT A RE-WALK ─────────────────────────────────────────────────────
// hl_early_reaction_tradeable_study.json only PERSISTS aggregated stats
// (byCheckpoint[cp].bands[key] = {n, winRate, profitFactor, sharpe, ...}) — it
// never wrote out the individual priced trade rows the task assumed were
// sitting in the file. To get real per-trade rows (needed to build a daily
// return series and check concurrency) without re-deriving the walk/pricing
// logic a second, possibly-diverging way, hl_early_reaction_tradeable_study.mjs
// was made import-safe (2026-09-08, additive-only changes): `processPair`,
// `priceTrade`, `capPerPairThenPool`, `BANDS`/`bandOf`, `CHECKPOINTS_MIN`,
// `ALL_PAIRS`, `MIN_SAMPLE` are now exported, `priceTrade`'s returned trade
// object gained `entry`/`pip` fields (needed by `riskAdjustTrades` below,
// unused by that script's own main()), and `main()` is now guarded to only
// auto-run when that file is executed directly — importing it here does NOT
// re-trigger its own CLI run. This script calls those exact, already-tested
// functions; nothing about the touch/rearm/race walk or the checkpoint
// pricing is reimplemented here.
//
// ── SIZING CONVENTION ────────────────────────────────────────────────────────
// The existing book's trades (from /api/level-atlas/vote-portfolio?sizing=
// fixed-risk&riskPct=1) already carry `pnlPct` as a fixed-1%-of-account
// risk-adjusted return (see riskAdjustTrades, js/levelAtlasVoteReview.js). The
// HL trades come out of priceTrade() as a raw price-based % (gross move minus
// flat cost) — NOT risk-scaled. To combine the two streams honestly under "the
// same fixed-fractional risk_pct=1% sizing convention" (the task's own
// requirement), HL trades are run through the SAME `riskAdjustTrades` brick
// (riskPct=1) before anything else touches them — one sizing formula, reused,
// not two.
//
// ── CONCURRENCY: COMPETING FOR THE SAME PER-PAIR SLOT ────────────────────────
// Decision (per the task's own framing, argued for absent a reason not to):
// an HL trade and an existing OH/OL trade on the SAME pair at the SAME time
// compete for the SAME maxConcurrent=1 slot, not two independent budgets — a
// real MT5 account has one position limit per symbol regardless of which
// internal "strategy" generated the signal; two bots fighting over the same
// account's margin on the same pair are one book, not two. Implemented by
// merging each pair's existing-book kept trades (already capped alone,
// maxConcurrent=1, straight from the live API) with that pair's HL kept
// trades (already capped alone the same way) into one chronological list and
// re-running `applyConcurrencyCap({maxConcurrent:1})` on the union — a later
// signal (whichever source) that would exceed the per-pair slot is skipped,
// exactly the mechanic every other portfolio study this session already uses
// (js/levelAtlasVoteReview.js). This is done BEFORE restricting to the
// overlap window (below) so the slot-competition decision sees full
// chronological context, not an artificially truncated one.
//
// ── OOS WINDOW ────────────────────────────────────────────────────────────────
// /api/level-atlas/vote-portfolio does not itself split IS/OOS — but its
// underlying stored per-pair trade lists (`{pair}-votetrades.json`) are ALREADY
// OOS-only by construction (buildBarrierTrades filters `date >= book.splitDate`
// before ever being persisted — see js/levelAtlasRoutes.js's runOne). The HL
// study's own OOS split (SPLIT_FRAC=0.6, same fraction, independently computed
// per pair on its own touch walk) lands on a DIFFERENT splitDate per pair since
// the two walks count different populations of touches. Both streams'
// per-pair OOS windows are logged below; this script computes the actual
// overlapping [max(minDate), min(maxDate)] across BOTH streams (pooled, not
// per-pair — the task asked for one apples-to-apples window) and restricts
// BOTH trade sets to it before computing any comparison stat. That overlap
// window, and how much of each stream's own trade count it drops, is reported
// explicitly in the output JSON and console log — not hidden.
//
// Node's native fetch (GET only) against the live Railway server — read-only,
// same pattern analysis/fib_atlas_live_vs_backtest_reconcile.mjs already uses.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { processPair, priceTrade, bandOf, ALL_PAIRS as HL_PAIRS, CHECKPOINTS_MIN } from './hl_early_reaction_tradeable_study.mjs';
import { applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');

const API_BASE = 'https://macrofxmodel-production.up.railway.app';
const LIVE_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const CHECKPOINT_MIN = 60;
const HL_BAND_KEY = '<15%';

function minDate(arr) { return arr.reduce((a, b) => (b < a ? b : a)); }
function maxDate(arr) { return arr.reduce((a, b) => (b > a ? b : a)); }
function groupByPair(trades) {
  const out = {};
  for (const t of trades) (out[t.pair] ??= []).push(t);
  return out;
}

// ── Portfolio-wide (ALL pairs pooled) concurrency sweep ─────────────────────
// Peak and time-weighted-average number of SIMULTANEOUSLY open positions
// across the whole book (not per-pair) — the real margin-load number, since
// MT5 NO_MONEY rejections are a function of total open positions/margin
// across every symbol at once, not any one pair's own count.
function sweepConcurrency(trades) {
  if (!trades.length) return { peak: 0, timeWeightedAvg: 0, spanDays: 0, n: 0 };
  const events = [];
  for (const t of trades) { events.push([t.time, 1]); events.push([t.resolveTime, -1]); }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);   // closes before opens at an exact tie
  let count = 0, peak = 0, weightedSum = 0;
  let last = events[0][0];
  for (const [time, delta] of events) {
    weightedSum += count * (time - last);
    count += delta;
    if (count > peak) peak = count;
    last = time;
  }
  const span = events[events.length - 1][0] - events[0][0];
  return { peak, timeWeightedAvg: span > 0 ? +(weightedSum / span).toFixed(3) : 0, spanDays: +(span / 86400).toFixed(1), n: trades.length };
}

// Step function of running open-position count (ALL pairs pooled), for
// point-in-time / time-weighted queries below.
function buildSteps(trades) {
  const events = [];
  for (const t of trades) { events.push([t.time, 1]); events.push([t.resolveTime, -1]); }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const steps = []; let count = 0;
  for (const [time, delta] of events) { count += delta; steps.push([time, count]); }
  return steps;
}
function countAt(steps, t) {
  let lo = 0, hi = steps.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (steps[mid][0] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans >= 0 ? steps[ans][1] : 0;
}
// Fraction of wall-clock time within [t0,t1] that the step function's count
// is >= threshold — the "how often is the existing book already busy" base
// rate, time-weighted (not event-weighted, so a long-open trade counts for
// the time it's actually open, not as one instant).
function fractionTimeAtLeast(steps, t0, t1, threshold = 1) {
  if (!steps.length || t1 <= t0) return 0;
  let busy = 0, total = 0, last = t0, lastCount = countAt(steps, t0);
  for (const [time, count] of steps) {
    if (time <= t0) { lastCount = count; continue; }
    if (time > t1) break;
    const dt = time - last;
    if (lastCount >= threshold) busy += dt;
    total += dt;
    last = time; lastCount = count;
  }
  const dt = t1 - last;
  if (lastCount >= threshold) busy += dt;
  total += dt;
  return total > 0 ? busy / total : 0;
}

// Coarse UTC-hour session bucket — same 4-way split applied identically to
// BOTH trade streams so the comparison isn't skewed by one book's own
// `session` label taxonomy vs a different heuristic for the other.
function sessionBucket(epochSec) {
  const h = new Date(epochSec * 1000).getUTCHours();
  if (h < 7) return 'Asia (00-07 UTC)';
  if (h < 13) return 'London (07-13 UTC)';
  if (h < 21) return 'NY (13-21 UTC)';
  return 'Off (21-24 UTC)';
}
function histogram(trades, bucketFn) {
  const h = {};
  for (const t of trades) { const k = bucketFn(t.time); h[k] = (h[k] ?? 0) + 1; }
  const n = trades.length;
  return Object.fromEntries(Object.entries(h).map(([k, v]) => [k, +(v / n * 100).toFixed(1)]));
}
function histIntersection(hA, hB) {
  const keys = new Set([...Object.keys(hA), ...Object.keys(hB)]);
  let s = 0;
  for (const k of keys) s += Math.min(hA[k] ?? 0, hB[k] ?? 0);
  return +s.toFixed(1);
}

function statRow(dailyReturns) {
  const s = portfolioStats(dailyReturns, { mc: false, targetVol: 10 });
  return { days: s.days, sharpe: s.sharpe, cagr: s.cagr, maxDD: s.maxDD, annVol: s.annVol, calmar: s.calmar, winRate: s.winRate, profitFactor: s.profitFactor };
}

async function main() {
  console.log('HL Signal Portfolio-Additive Study\n');

  // ── 1. Existing live book ──────────────────────────────────────────────
  const url = `${API_BASE}/api/level-atlas/vote-portfolio?pairs=${LIVE_PAIRS.join(',')}&minMargin=3&maxConcurrent=1&sizing=fixed-risk&riskPct=1`;
  console.log(`Fetching existing live book: ${url}`);
  const res = await fetch(url);
  const j = await res.json();
  if (!j.ok) throw new Error(`vote-portfolio fetch failed: ${JSON.stringify(j)}`);
  const existingTrades = j.trades.map(t => ({ ...t, source: 'existing' }));
  const exMin = minDate(existingTrades.map(t => t.date)), exMax = maxDate(existingTrades.map(t => t.date));
  console.log(`Existing book: ${existingTrades.length} trades across ${Object.keys(j.perPair).length} pairs, own-reported OOS window ${exMin} -> ${exMax}, own stats sharpe=${j.stats.sharpe} cagr=${j.stats.cagr}% maxDD=${j.stats.maxDD}%`);

  // ── 2. HL candidate trades: band='<15%', checkpoint=60min, continuation, OOS
  console.log(`\nBuilding HL trades (checkpoint=${CHECKPOINT_MIN}min, band='${HL_BAND_KEY}', continuation) per pair via the reused, already-validated walk...`);
  const hlByPair = {};
  for (const pair of HL_PAIRS) {
    const r = await processPair(pair);
    if (!r) { console.log(`  ${pair.toUpperCase()}: no data, skipped`); continue; }
    const oos = r.records.filter(rec => rec.isOos === 'oos' && rec.checks[CHECKPOINT_MIN] !== undefined);
    const banded = oos.filter(rec => bandOf(rec.checks[CHECKPOINT_MIN].frac)?.key === HL_BAND_KEY);
    const priced = banded.map(rec => priceTrade(rec, CHECKPOINT_MIN, 'continuation')).filter(Boolean);
    const capped = applyConcurrencyCap(priced, { maxConcurrent: 1 });   // per-pair cap, HL alone (matches original script's own capPerPairThenPool)
    hlByPair[r.pair] = capped?.kept ?? [];
    console.log(`  ${r.pair}: ${oos.length} OOS eligible touches, ${banded.length} in band, ${priced.length} priced, ${hlByPair[r.pair].length} kept after per-pair cap (splitDate ${r.splitDate})`);
  }
  const hlTradesRaw = Object.values(hlByPair).flat();
  const hlTradesAdjusted = riskAdjustTrades(hlTradesRaw, 1).map(t => ({ ...t, pair: t.instrument, source: 'hl' }));
  const hlMin = minDate(hlTradesAdjusted.map(t => t.date)), hlMax = maxDate(hlTradesAdjusted.map(t => t.date));
  console.log(`\nHL book (alone, per-pair capped, all pairs pooled): ${hlTradesAdjusted.length} trades, own OOS window ${hlMin} -> ${hlMax}`);

  // Sanity check against the source JSON's own aggregate stats (band='<15%', cp=60)
  const srcJsonPath = path.join(OUT_DIR, 'hl_early_reaction_tradeable_study.json');
  if (fs.existsSync(srcJsonPath)) {
    const srcJson = JSON.parse(fs.readFileSync(srcJsonPath, 'utf8'));
    const srcBand = srcJson.byCheckpoint?.[String(CHECKPOINT_MIN)]?.bands?.[HL_BAND_KEY];
    console.log(`Cross-check vs hl_early_reaction_tradeable_study.json's own <15%/cp60 row: n=${srcBand?.n} winRate=${srcBand?.winRate}% PF=${srcBand?.profitFactor} sharpe=${srcBand?.sharpe} (this script's re-walk: n=${hlTradesAdjusted.length}, expect a similar count -- differences vs srcBand.n reflect that script's own per-pair capping applied over the FULL pair set in one pooled pass, same mechanic, so should track closely).`);
  }

  // ── 3. Overlap window (pooled, not per-pair, per the task's own instruction)
  const overlapStart = exMin > hlMin ? exMin : hlMin;
  const overlapEnd = exMax < hlMax ? exMax : hlMax;
  const oosWindowNote = `Existing-book OOS window ${exMin}->${exMax} vs HL-signal OOS window ${hlMin}->${hlMax} DIFFER (different per-pair splitDate, different underlying walk) -- restricted BOTH trade streams to the overlapping window ${overlapStart}->${overlapEnd} for every stat below, per the task's explicit instruction.`;
  console.log(`\n${oosWindowNote}`);
  const inWindow = d => d >= overlapStart && d <= overlapEnd;

  // ── 4. Combined book: HL and existing compete for the SAME per-pair slot —
  // merge each pair's OWN already-capped-alone lists and re-cap the union,
  // on the FULL (not yet windowed) chronology so the slot-competition
  // decision has full context, matching this script's header note above.
  const allPairs = new Set([...Object.keys(hlByPair), ...existingTrades.map(t => t.pair)]);
  const combinedByPair = {};
  for (const p of allPairs) {
    const ex = existingTrades.filter(t => t.pair === p);
    const hl = hlTradesAdjusted.filter(t => t.pair === p);
    const merged = [...ex, ...hl];
    const capped = applyConcurrencyCap(merged, { maxConcurrent: 1 });
    combinedByPair[p] = capped?.kept ?? [];
  }
  let hlLostToSlotCompetition = 0, exLostToSlotCompetition = 0;
  for (const p of allPairs) {
    const keptSources = new Set(combinedByPair[p].map(t => t.source));
    const exCount = existingTrades.filter(t => t.pair === p).length;
    const hlCount = (hlByPair[p] ?? []).length;
    const keptEx = combinedByPair[p].filter(t => t.source === 'existing').length;
    const keptHl = combinedByPair[p].filter(t => t.source === 'hl').length;
    exLostToSlotCompetition += exCount - keptEx;
    hlLostToSlotCompetition += hlCount - keptHl;
  }
  console.log(`\nCombined book (per-pair slot competition, maxConcurrent=1 shared): ${exLostToSlotCompetition} existing-book trades and ${hlLostToSlotCompetition} HL trades LOST their slot to the other signal firing first on the same pair at an overlapping time.`);

  // ── 5. Restrict all three streams to the overlap window ─────────────────
  const baselineTrades = existingTrades.filter(t => inWindow(t.date));
  const hlAloneTrades = hlTradesAdjusted.filter(t => inWindow(t.date));
  const combinedTrades = Object.values(combinedByPair).flat().filter(t => inWindow(t.date));
  console.log(`Windowed trade counts: baseline=${baselineTrades.length} (of ${existingTrades.length}), HL-alone=${hlAloneTrades.length} (of ${hlTradesAdjusted.length}), combined=${combinedTrades.length}`);

  // ── 6. Daily series + portfolioStats (fixed-risk -> weight=1 per pair, same
  // convention /api/level-atlas/vote-portfolio itself uses in sizing='fixed-risk' mode)
  const onesWeights = trades => Object.fromEntries([...new Set(trades.map(t => t.pair))].map(p => [p, 1]));
  const seriesBaseline = buildPortfolioDailySeries(groupByPair(baselineTrades), { weights: onesWeights(baselineTrades) });
  const seriesHl = buildPortfolioDailySeries(groupByPair(hlAloneTrades), { weights: onesWeights(hlAloneTrades) });
  const seriesCombined = buildPortfolioDailySeries(groupByPair(combinedTrades), { weights: onesWeights(combinedTrades) });

  const statsBaseline = statRow(seriesBaseline.dailyReturns);
  const statsHl = statRow(seriesHl.dailyReturns);
  const statsCombined = statRow(seriesCombined.dailyReturns);

  console.log('\n=== PORTFOLIO STATS (overlap-window OOS, fixed-risk 1%) ===');
  console.log('(a) Existing book alone:', JSON.stringify(statsBaseline));
  console.log('(b) HL signal alone:    ', JSON.stringify(statsHl));
  console.log('(c) Combined:           ', JSON.stringify(statsCombined));

  // ── 7. Concurrency / margin-load delta (portfolio-wide, all pairs pooled)
  const concBaseline = sweepConcurrency(baselineTrades);
  const concCombined = sweepConcurrency(combinedTrades);
  const concHl = sweepConcurrency(hlAloneTrades);
  console.log('\n=== PORTFOLIO-WIDE CONCURRENCY (all pairs pooled) ===');
  console.log('Baseline:', JSON.stringify(concBaseline));
  console.log('HL alone:', JSON.stringify(concHl));
  console.log('Combined:', JSON.stringify(concCombined));
  const peakDelta = concCombined.peak - concBaseline.peak;
  const avgDeltaPct = concBaseline.timeWeightedAvg > 0 ? +((concCombined.timeWeightedAvg - concBaseline.timeWeightedAvg) / concBaseline.timeWeightedAvg * 100).toFixed(1) : null;
  console.log(`Peak concurrent positions: baseline=${concBaseline.peak} -> combined=${concCombined.peak} (+${peakDelta}); time-weighted avg concurrent: baseline=${concBaseline.timeWeightedAvg} -> combined=${concCombined.timeWeightedAvg} (${avgDeltaPct}%)`);

  // ── 8. Session/hour-of-day clustering check ──────────────────────────────
  const histExisting = histogram(baselineTrades, sessionBucket);
  const histHl = histogram(hlAloneTrades, sessionBucket);
  const overlapPct = histIntersection(histExisting, histHl);
  console.log('\n=== SESSION/HOUR-OF-DAY DISTRIBUTION (overlap window) ===');
  console.log('Existing book:', JSON.stringify(histExisting));
  console.log('HL signal:    ', JSON.stringify(histHl));
  console.log(`Histogram intersection (0=fully disjoint timing, 100=identical timing mix): ${overlapPct}%`);

  const t0 = Date.parse(overlapStart + 'T00:00:00Z') / 1000;
  const t1 = Date.parse(overlapEnd + 'T00:00:00Z') / 1000 + 86400;
  const existingSteps = buildSteps(baselineTrades);
  const baseBusyRate = fractionTimeAtLeast(existingSteps, t0, t1, 1);
  let hlDuringBusy = 0;
  for (const t of hlAloneTrades) if (countAt(existingSteps, t.time) >= 1) hlDuringBusy++;
  const hlDuringBusyPct = hlAloneTrades.length ? +(hlDuringBusy / hlAloneTrades.length * 100).toFixed(1) : null;
  const baseBusyPct = +(baseBusyRate * 100).toFixed(1);
  console.log(`Existing book has >=1 position open ${baseBusyPct}% of the overlap window's wall-clock time (base rate). ${hlDuringBusyPct}% of HL entries land while the existing book ALREADY has >=1 position open somewhere in the portfolio.`);
  const clusteringVerdict = hlDuringBusyPct == null ? 'n/a' : (hlDuringBusyPct > baseBusyPct + 10 ? 'CLUSTERS on already-busy periods' : hlDuringBusyPct < baseBusyPct - 10 ? 'spreads into otherwise-quiet periods (genuine diversification in TIME)' : 'roughly tracks the base busy-rate (neither clusters nor avoids busy periods)');
  console.log(`Verdict: HL entry timing ${clusteringVerdict} (base rate ${baseBusyPct}% vs HL-conditional ${hlDuringBusyPct}%).`);

  // ── 9. Verdict ────────────────────────────────────────────────────────────
  const sharpeGain = statsCombined.sharpe != null && statsBaseline.sharpe != null ? +(statsCombined.sharpe - statsBaseline.sharpe).toFixed(2) : null;
  const ddChange = statsCombined.maxDD != null && statsBaseline.maxDD != null ? +(statsCombined.maxDD - statsBaseline.maxDD).toFixed(2) : null;
  console.log(`\n=== VERDICT INPUTS === sharpeGain(combined-baseline)=${sharpeGain}  maxDD change=${ddChange}pp  peak concurrency +${peakDelta}  avg concurrency ${avgDeltaPct}%`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = {
    generatedAt: new Date().toISOString(),
    method: {
      hlBandUsed: HL_BAND_KEY, checkpointMin: CHECKPOINT_MIN, bet: 'continuation',
      concurrencyPolicy: 'HL and existing-book trades compete for the SAME per-pair maxConcurrent=1 slot (one combined account/book), not independent budgets.',
      sizing: 'fixed-risk, riskPct=1, both streams run through js/levelAtlasVoteReview.js riskAdjustTrades',
    },
    oosWindows: { existing: { from: exMin, to: exMax }, hl: { from: hlMin, to: hlMax }, overlapUsedForComparison: { from: overlapStart, to: overlapEnd } },
    windowedTradeCounts: { baseline: baselineTrades.length, ofExisting: existingTrades.length, hlAlone: hlAloneTrades.length, ofHl: hlTradesAdjusted.length, combined: combinedTrades.length },
    slotCompetition: { existingTradesLostToHl: exLostToSlotCompetition, hlTradesLostToExisting: hlLostToSlotCompetition },
    portfolioStats: { baseline: statsBaseline, hlAlone: statsHl, combined: statsCombined },
    concurrency: { baseline: concBaseline, hlAlone: concHl, combined: concCombined, peakDelta, avgDeltaPct },
    sessionOverlap: { existingHist: histExisting, hlHist: histHl, histogramIntersectionPct: overlapPct, existingBusyRatePct: baseBusyPct, hlDuringExistingBusyPct: hlDuringBusyPct, verdict: clusteringVerdict },
    verdictInputs: { sharpeGain, maxDDChangePp: ddChange, peakConcurrencyDelta: peakDelta, avgConcurrencyDeltaPct: avgDeltaPct },
  };
  fs.writeFileSync(path.join(OUT_DIR, 'hl_signal_portfolio_additive_study.json'), JSON.stringify(out, null, 0));
  console.log(`\nWrote ${OUT_DIR}/hl_signal_portfolio_additive_study.json`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
