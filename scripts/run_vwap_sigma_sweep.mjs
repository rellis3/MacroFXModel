#!/usr/bin/env node
/**
 * Cross-instrument replication sweep for the VWAP Fixed-Sigma books — are the
 * gold themes gold facts or general facts?
 *
 *   node scripts/run_vwap_sigma_sweep.mjs [pairs...]   (default: eurusd gbpusd usdjpy)
 *
 * Per pair, walks the local M1 parquet and prints the small set of
 * PRE-NAMED theme checks (chosen from the gold books BEFORE this sweep ran —
 * a replication, not a new fishing pass):
 *   R1  deep-band (2-3σ) return-to-VWAP≤240m rate — vs gold ~34% and the
 *       random-walk control ~16%
 *   R2  session grading of R1: Asia vs NY (gold: Asia ≫ NY)
 *   R3  WaveTrend at touch: neutral vs extended on R1 (gold: neutral ≫ extended)
 *   T1  race outcome, Asia vs NY out-rate at ±1σ (gold: Asia −, NY +)
 *   T2  race outcome, grind vs spike approach at ±1σ (gold: grind −)
 *   T3  race outcome, touch-bar reject vs accept at ±2σ (gold: reject −)
 *   T4  race outcome ±2-3σ: rangeConsumed high vs low (gold: high + — continuation,
 *       counter to the naive "exhaustion → reversion" read, §11)
 *   T5  race outcome ±2-3σ: regimeState 3·trend×3·expanding vs base (gold: + —
 *       the one cell that matched the owner's own screenshot hypothesis, §12)
 *   R4  return outcome ±2-3σ: bandSlope expanding vs stable/contracting (gold:
 *       expanding + — real but counter-intuitive, §12)
 * plus the held-findings counts of all three books (race, return, band-walk).
 */

import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { fixedSigmaWalk } from '../js/vwapFixedSigmaEngine.js';
import { buildFixedSigmaBook, buildVwapReturnBook, buildBandWalkBook, extractHeldFindings,
         returnedWithin, returnEligible } from '../js/vwapFixedSigmaReport.js';

const pairs = process.argv.slice(2).filter(a => !a.startsWith('-'));
const list = pairs.length ? pairs : ['eurusd', 'gbpusd', 'usdjpy'];

const pct = (hit, n) => n ? +(hit / n * 100).toFixed(1) : null;
function rate(pool, pred) { const g = pool.filter(pred); return { n: g.length, pct: pct(g.filter(returnedWithin).length, g.length) }; }
function outRate(pool, pred) { const g = pool.filter(pred); return { n: g.length, pct: pct(g.filter(t => t.outcome === 'out').length, g.length) }; }
const fmt = r => r.n ? `${r.pct}% (n=${r.n})` : '—';

for (const pair of list) {
  const t0 = Date.now();
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.log(`\n=== ${pair}: no M1 data ===`); continue; }
  const { touches, coverage } = fixedSigmaWalk(packed, { instrument: pair, assetClass: 'fx' });
  console.log(`\n=== ${pair.toUpperCase()} — ${coverage.daysWalked} sessions, ${touches.length.toLocaleString()} touches (${((Date.now() - t0) / 1000).toFixed(0)}s) ===`);

  const firsts = touches.filter(t => t.ordinal === 1);
  const deepEl = firsts.filter(t => (t.band === 2 || t.band === 3) && returnEligible(t));
  const deep23 = firsts.filter(t => t.band === 2 || t.band === 3);
  const b1 = firsts.filter(t => t.band === 1);
  const b2 = firsts.filter(t => t.band === 2);

  console.log(`  R1 deep-band return≤240m:        ${fmt(rate(deepEl, () => true))}   [gold 34%, control 16%]`);
  console.log(`  R2 …by session:  Asia ${fmt(rate(deepEl, t => t.session === 'Asia'))}  London ${fmt(rate(deepEl, t => t.session === 'London'))}  NY ${fmt(rate(deepEl, t => t.session === 'NY'))}   [gold: Asia≫NY]`);
  console.log(`  R3 …by WT state: neutral ${fmt(rate(deepEl, t => t.wtState === '2·neutral'))}  extended ${fmt(rate(deepEl, t => t.wtState === '3·extended'))}   [gold: neutral≫extended; control flat]`);
  console.log(`  T1 ±1σ race out%: Asia ${fmt(outRate(b1, t => t.session === 'Asia'))}  NY ${fmt(outRate(b1, t => t.session === 'NY'))}   [gold: Asia<NY]`);
  console.log(`  T2 ±1σ race out%: grind ${fmt(outRate(b1, t => t.approachVel === '1·grind'))}  spike ${fmt(outRate(b1, t => t.approachVel === '3·spike'))}   [gold: grind<spike; control opposite]`);
  console.log(`  T3 ±2σ race out%: reject ${fmt(outRate(b2, t => t.candleReject === '3·reject'))}  accept ${fmt(outRate(b2, t => t.candleReject === '1·accept'))}   [gold: reject<accept]`);
  console.log(`  T4 ±2-3σ race out%: rangeConsumed high ${fmt(outRate(deep23, t => t.rangeConsumed === '3·high'))}  low ${fmt(outRate(deep23, t => t.rangeConsumed === '1·low'))}   [gold: high>low, §11]`);
  console.log(`  T5 ±2-3σ race out%: regimeState 3·trend×3·expanding ${fmt(outRate(deep23, t => t.regimeState === '3·trend×3·expanding'))}  vs all ${fmt(outRate(deep23, () => true))}   [gold: cell>base, §12]`);
  console.log(`  R4 ±2-3σ return≤240m: bandSlope expanding ${fmt(rate(deepEl, t => t.bandSlope === '3·expanding'))}  stable/contracting ${fmt(rate(deepEl, t => t.bandSlope !== '3·expanding' && t.bandSlope != null))}   [gold: expanding>stable/contracting, §12]`);

  const race = extractHeldFindings(buildFixedSigmaBook(touches, { firstTouchOnly: true }), { limit: 10000 });
  const ret = extractHeldFindings(buildVwapReturnBook(touches), { limit: 10000 });
  const walk = extractHeldFindings(buildBandWalkBook(touches), { limit: 10000 });
  console.log(`  held findings: race book ${race.length}, return book ${ret.length}, band-walk book ${walk.length}`);
}
