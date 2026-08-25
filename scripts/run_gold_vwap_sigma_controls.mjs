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
import { buildFixedSigmaBook, extractHeldFindings } from '../js/vwapFixedSigmaReport.js';

const args = process.argv.slice(2);
const touchesFile = args.includes('--touches') ? args[args.indexOf('--touches') + 1] : 'logs/gold_vwap_sigma_touches.json';
const nPerms = args.includes('--perms') ? +args[args.indexOf('--perms') + 1] : 20;

function mulberry32(a) {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 1. Random-walk control ───────────────────────────────────────────────────
console.log('── Control 1: driftless random walk through the identical engine ──');
{
  const rnd = mulberry32(7);
  const gauss = () => { const u = Math.max(rnd(), 1e-12), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const DAY = 86400, BASE = Date.UTC(2018, 0, 1) / 1000;
  const times = [], opens = [], highs = [], lows = [], closes = [], volumes = [];
  let px = 2000;
  for (let d = 0; d < 800; d++) {
    for (let m = 0; m < 1440; m++) {
      const o = px; px += gauss() * 0.8; const c = px;
      times.push(BASE + d * DAY + m * 60); opens.push(o);
      highs.push(Math.max(o, c) + Math.abs(gauss()) * 0.2);
      lows.push(Math.min(o, c) - Math.abs(gauss()) * 0.2);
      closes.push(c); volumes.push(1 + Math.abs(gauss()));
    }
  }
  const packed = { n: times.length, times: Int32Array.from(times), opens: Float32Array.from(opens),
                   highs: Float32Array.from(highs), lows: Float32Array.from(lows),
                   closes: Float32Array.from(closes), volumes: Float32Array.from(volumes) };
  const { touches } = fixedSigmaWalk(packed, { instrument: 'TEST', minHistory: 10 });
  const firsts = touches.filter(t => t.ordinal === 1);
  console.log(`  ${firsts.length} first touches over 800 synthetic days`);
  for (const k of [1, 2, 3, 4]) {
    const g = firsts.filter(t => t.band === k);
    if (g.length < 20) continue;
    const out = g.filter(t => t.outcome === 'out').length, back = g.filter(t => t.outcome === 'back').length;
    const mfe = g.reduce((s, t) => s + t.mfeSigma, 0) / g.length, mae = g.reduce((s, t) => s + t.maeSigma, 0) / g.length;
    console.log(`  ±${k}σ n=${g.length}  out ${(out / g.length * 100).toFixed(1)}% / back ${(back / g.length * 100).toFixed(1)}%  MFE ${mfe.toFixed(2)}σ MAE ${mae.toFixed(2)}σ`);
  }
  const b1 = firsts.filter(t => t.band === 1);
  const base = b1.filter(t => t.outcome === 'out').length / b1.length * 100;
  console.log(`  ±1σ context deltas on the control (any match to gold ⇒ mechanical, not market):`);
  for (const dim of ['vwapDrift', 'churn', 'approachVel', 'otherSideMaxBand', 'sessionPos', 'candleReject']) {
    const groups = {};
    for (const t of b1) { const b = t[dim]; if (b == null) continue; const g = (groups[b] ??= { n: 0, out: 0 }); g.n++; if (t.outcome === 'out') g.out++; }
    console.log(`    ${dim.padEnd(17)} ` + Object.entries(groups).sort()
      .map(([b, g]) => `${b} n=${g.n} Δ${(g.out / g.n * 100 - base).toFixed(1)}`).join('  '));
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
}
