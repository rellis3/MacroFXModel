#!/usr/bin/env node
/**
 * Honesty controls for the VWAP Fixed-Sigma Band Atlas — the two checks that
 * decide how the gold book may be READ (GOLD_VWAP_FIXED_SIGMA_FINDINGS.md):
 *
 *   1. RANDOM-WALK CONTROL — run the identical engine on a seeded,
 *      driftless pseudo-random walk (no mean reversion by construction) and
 *      tabulate the same base rates + context-dimension deltas. Any effect the
 *      control reproduces is a property of the deviation-from-converging-VWAP
 *      COORDINATE SYSTEM, not of gold — reading it as a market finding would
 *      be the playbook's §6.4 definitional tautology.
 *
 *   2. PERMUTATION CHANCE-BASELINE — shuffle outcome tuples WITHIN each
 *      (side,band) cell (preserving every cell's base rate, breaking every
 *      context→outcome link), rebuild the OOS-gated book, count survivors.
 *      Repeated N times, this is the "how many held findings does pure noise
 *      produce" number the house rules require before quoting a survivor list.
 *
 * Usage: node scripts/run_gold_vwap_sigma_controls.mjs [--touches FILE] [--perms N]
 *   --touches: touches JSON from run_gold_vwap_sigma.mjs (default logs/gold_vwap_sigma_touches.json)
 *
 * Deterministic: seeded mulberry32, no Math.random/Date.
 */

import { readFileSync } from 'node:fs';
import { fixedSigmaWalk } from '../js/vwapFixedSigmaEngine.js';
import { buildFixedSigmaBook, buildVwapReturnBook, buildBandWalkBook, extractHeldFindings, returnedWithin, returnEligible, walkedEnough, WALK_THRESHOLD_BARS, RETURN_HORIZON_MINS } from '../js/vwapFixedSigmaReport.js';

const args = process.argv.slice(2);
const touchesFile = args.includes('--touches') ? args[args.indexOf('--touches') + 1] : 'logs/gold_vwap_sigma_touches.json';
const nPerms = args.includes('--perms') ? +args[args.indexOf('--perms') + 1] : 20;

import { mulberry32, syntheticRandomWalkPacked } from '../js/syntheticWalk.js';

// ── 1. Random-walk control ───────────────────────────────────────────────────
console.log('── Control 1: driftless random walk through the identical engine ──');
{
  const packed = syntheticRandomWalkPacked({ seed: 7, days: 800 });
  const { touches } = fixedSigmaWalk(packed, { instrument: 'TEST', minHistory: 10 });
  const firsts = touches.filter(t => t.ordinal === 1);
  console.log(`  ${firsts.length} first touches over 800 synthetic days`);
  for (const k of [1, 2, 3, 4, 5, 6, 7]) {
    const g = firsts.filter(t => t.band === k);
    if (g.length < 20) continue;
    const out = g.filter(t => t.outcome === 'out').length, back = g.filter(t => t.outcome === 'back').length;
    const mfe = g.reduce((s, t) => s + t.mfeSigma, 0) / g.length, mae = g.reduce((s, t) => s + t.maeSigma, 0) / g.length;
    const el = g.filter(t => returnEligible(t));
    const vw = el.filter(t => returnedWithin(t)).length;
    console.log(`  ±${k}σ n=${g.length}  out ${(out / g.length * 100).toFixed(1)}% / back ${(back / g.length * 100).toFixed(1)}%  MFE ${mfe.toFixed(2)}σ MAE ${mae.toFixed(2)}σ  ret≤${RETURN_HORIZON_MINS}m ${(el.length ? vw / el.length * 100 : 0).toFixed(1)}% (of ${el.length})`);
  }
  // RETURN-outcome context deltas at the ±2σ/±3σ bands pooled — the check that
  // decides whether gold's WT-neutral-returns / heavy-vol-returns conditioning
  // is a market fact or a property of the coordinate system.
  const deep = firsts.filter(t => (t.band === 2 || t.band === 3) && returnEligible(t));
  const dBase = deep.filter(t => returnedWithin(t)).length / deep.length * 100;
  console.log(`  ±2-3σ RETURN-outcome deltas on the control (base ${dBase.toFixed(1)}%):`);
  for (const dim of ['wtState', 'volRegime', 'approachVel', 'churn', 'candleReject', 'wtMtf', 'vwapSlope', 'rangeConsumed', 'momRangeMatrix', 'bandSlope', 'regimeState']) {
    const groups = {};
    for (const t of deep) { const b = t[dim]; if (b == null) continue; const g = (groups[b] ??= { n: 0, hit: 0 }); g.n++; if (returnedWithin(t)) g.hit++; }
    console.log(`    ${dim.padEnd(17)} ` + Object.entries(groups).sort()
      .map(([b, g]) => `${b} n=${g.n} Δ${(g.hit / g.n * 100 - dBase).toFixed(1)}`).join('  '));
  }
  const b1 = firsts.filter(t => t.band === 1);
  const base = b1.filter(t => t.outcome === 'out').length / b1.length * 100;
  console.log(`  ±1σ context deltas on the control (any match to gold ⇒ mechanical, not market):`);
  for (const dim of ['vwapDrift', 'churn', 'approachVel', 'otherSideMaxBand', 'sessionPos', 'candleReject', 'vwapSlope', 'rangeConsumed', 'momRangeMatrix', 'bandSlope', 'regimeState']) {
    const groups = {};
    for (const t of b1) { const b = t[dim]; if (b == null) continue; const g = (groups[b] ??= { n: 0, out: 0 }); g.n++; if (t.outcome === 'out') g.out++; }
    console.log(`    ${dim.padEnd(17)} ` + Object.entries(groups).sort()
      .map(([b, g]) => `${b} n=${g.n} Δ${(g.out / g.n * 100 - base).toFixed(1)}`).join('  '));
  }
  // ±2-3σ RACE-outcome ('out') deltas — the gold held-findings run showed
  // rangeConsumed/momRangeMatrix/vwapSlope surviving specifically at these
  // deeper bands (dn|2, up|1, up|3), not just ±1σ, so check there directly.
  const b23 = firsts.filter(t => t.band === 2 || t.band === 3);
  const base23 = b23.filter(t => t.outcome === 'out').length / b23.length * 100;
  console.log(`  ±2-3σ RACE-outcome ('out') deltas on the control (base ${base23.toFixed(1)}%):`);
  for (const dim of ['vwapSlope', 'rangeConsumed', 'momRangeMatrix', 'bandSlope', 'regimeState', 'wtRegimeState']) {
    const groups = {};
    for (const t of b23) { const b = t[dim]; if (b == null) continue; const g = (groups[b] ??= { n: 0, out: 0 }); g.n++; if (t.outcome === 'out') g.out++; }
    console.log(`    ${dim.padEnd(17)} ` + Object.entries(groups).sort()
      .map(([b, g]) => `${b} n=${g.n} Δ${(g.out / g.n * 100 - base23).toFixed(1)}`).join('  '));
  }

  // Band-walk outcome on the control — a random walk has no real "acceptance"
  // vs "rejection" either, so any context-dim delta the control reproduces on
  // the walk outcome is mechanical the same way as above.
  const elAll = firsts.filter(t => t.walkBarsBeyond != null);
  const walkBase = elAll.filter(t => walkedEnough(t)).length / elAll.length * 100;
  console.log(`  band-walk (>=${WALK_THRESHOLD_BARS} bars) deltas on the control (base ${walkBase.toFixed(1)}%):`);
  for (const dim of ['bandSlope', 'regimeState', 'momAdx', 'wtState', 'candleReject']) {
    const groups = {};
    for (const t of elAll) { const b = t[dim]; if (b == null) continue; const g = (groups[b] ??= { n: 0, hit: 0 }); g.n++; if (walkedEnough(t)) g.hit++; }
    console.log(`    ${dim.padEnd(17)} ` + Object.entries(groups).sort()
      .map(([b, g]) => `${b} n=${g.n} Δ${(g.hit / g.n * 100 - walkBase).toFixed(1)}`).join('  '));
  }
}

// ── 2. Permutation chance-baseline ───────────────────────────────────────────
console.log(`\n── Control 2: permutation baseline (${nPerms} shuffles of ${touchesFile}) ──`);
{
  const { touches } = JSON.parse(readFileSync(touchesFile, 'utf8'));
  const real = extractHeldFindings(buildFixedSigmaBook(touches, { firstTouchOnly: true }), { limit: 10000 }).length;
  console.log(`  real held findings: ${real}`);
  const firsts = touches.filter(t => t.ordinal === 1);
  const counts = [];
  for (let p = 0; p < nPerms; p++) {
    const rnd = mulberry32(1000 + p);
    const byCell = new Map();
    for (const t of firsts) { const k = `${t.side}|${t.band}`; (byCell.get(k) ?? byCell.set(k, []).get(k)).push(t); }
    const shuffled = [];
    for (const arr of byCell.values()) {
      const outs = arr.map(t => ({ outcome: t.outcome, mfeSigma: t.mfeSigma, maeSigma: t.maeSigma,
                                   reachedVwap: t.reachedVwap, reentered: t.reentered, minsToResolve: t.minsToResolve }));
      for (let i = outs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [outs[i], outs[j]] = [outs[j], outs[i]]; }
      arr.forEach((t, i) => shuffled.push({ ...t, ...outs[i] }));
    }
    counts.push(extractHeldFindings(buildFixedSigmaBook(shuffled, { firstTouchOnly: true }), { limit: 10000 }).length);
  }
  counts.sort((a, b) => a - b);
  const mean = counts.reduce((s, v) => s + v, 0) / counts.length;
  console.log(`  permutation survivors: mean ${mean.toFixed(1)}, range ${counts[0]}–${counts[counts.length - 1]}`);
  console.log(`  → an individual survivor is ~${Math.min(99, Math.round(mean / real * 100))}% likely to be noise; only THEMES repeated across cells/sides count.`);

  // ── 3. Same permutation baseline for the RETURN book ──────────────────────
  // Shuffle minsToVwap within each (side,band) cell among ELIGIBLE rows only —
  // eligibility (minsIntoSession) is a property of the touch's context and
  // stays with its row; only the outcome column moves.
  const realRet = extractHeldFindings(buildVwapReturnBook(touches), { limit: 10000 }).length;
  console.log(`\n  return-book real held findings: ${realRet}`);
  const retCounts = [];
  for (let p = 0; p < nPerms; p++) {
    const rnd = mulberry32(5000 + p);
    const byCell = new Map();
    for (const t of firsts) {
      if (!returnEligible(t)) continue;
      const k = `${t.side}|${t.band}`;
      (byCell.get(k) ?? byCell.set(k, []).get(k)).push(t);
    }
    const shuffled = [];
    for (const arr of byCell.values()) {
      const outs = arr.map(t => t.minsToVwap);
      for (let i = outs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [outs[i], outs[j]] = [outs[j], outs[i]]; }
      arr.forEach((t, i) => shuffled.push({ ...t, minsToVwap: outs[i] }));
    }
    retCounts.push(extractHeldFindings(buildVwapReturnBook(shuffled), { limit: 10000 }).length);
  }
  retCounts.sort((a, b) => a - b);
  const retMean = retCounts.reduce((s, v) => s + v, 0) / retCounts.length;
  console.log(`  return-book permutation survivors: mean ${retMean.toFixed(1)}, range ${retCounts[0]}–${retCounts[retCounts.length - 1]}`);

  // ── 4. Same permutation baseline for the BAND-WALK book ───────────────────
  // Shuffle walkBarsBeyond within each (side,band) cell.
  const realWalk = extractHeldFindings(buildBandWalkBook(touches), { limit: 10000 }).length;
  console.log(`\n  band-walk book real held findings: ${realWalk}`);
  const walkCounts = [];
  for (let p = 0; p < nPerms; p++) {
    const rnd = mulberry32(9000 + p);
    const byCell = new Map();
    for (const t of firsts) {
      if (t.walkBarsBeyond == null) continue;
      const k = `${t.side}|${t.band}`;
      (byCell.get(k) ?? byCell.set(k, []).get(k)).push(t);
    }
    const shuffled = [];
    for (const arr of byCell.values()) {
      const outs = arr.map(t => t.walkBarsBeyond);
      for (let i = outs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [outs[i], outs[j]] = [outs[j], outs[i]]; }
      arr.forEach((t, i) => shuffled.push({ ...t, walkBarsBeyond: outs[i] }));
    }
    walkCounts.push(extractHeldFindings(buildBandWalkBook(shuffled), { limit: 10000 }).length);
  }
  walkCounts.sort((a, b) => a - b);
  const walkMean = walkCounts.reduce((s, v) => s + v, 0) / walkCounts.length;
  console.log(`  band-walk book permutation survivors: mean ${walkMean.toFixed(1)}, range ${walkCounts[0]}–${walkCounts[walkCounts.length - 1]}`);
}
