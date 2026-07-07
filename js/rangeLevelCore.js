// Range-Level edge test — pure core (no I/O, no network).
//
// THE QUESTION: does a 5m range level (Asia session edges + today-vs-yesterday fib
// confluence) have ANY standalone edge — does price "respect" it more than a random
// price — BEFORE we bolt on macro/z/confidence? S/R levels are practitioner folklore
// (CLAUDE.md is explicit), so the ONLY honest test is against a PLACEBO CONTROL: the
// same level shifted to the wrong price. If real levels don't bounce more than the
// shifted placebos, the edge is imaginary and the whole levels-time-the-entry premise
// is dead — cheaply, here.
//
// Mechanic (minimal degrees of freedom): at the FIRST touch of a level, place a
// SYMMETRIC ±D barrier and race them — reversion barrier (a "bounce") vs continuation
// barrier (a "break"). bounceRate > 0.5 (after cost) = fade edge. The barrier is
// symmetric so there's no R:R asymmetry to game (the v2 lesson). Same D, same paths,
// for real levels and their placebos.

import { splitByDate } from './macroDirectionCore.js';
export { splitByDate };

// Half-integer fib ladder off a session range (matches the range-line bot grid).
// f=0 → range low, f=1 → range high; extensions/retracements either side.
export const FIB_LADDER = [-1, -0.5, 0, 0.5, 1, 1.5, 2];

export const RANGE_LEVEL_DEFAULTS = {
  confluenceTolPips: 2,   // today∩yesterday ladder match tolerance (FX)
  barrierFrac:       0.25, // barrier distance D = this × Asia range (adaptive, symmetric)
  maxHoldBars:       48,   // 5m bars to resolve the race (~4h)
  spreadPips:        1.0,  // round-trip cost charged against every resolved race
  splitFrac:         0.6,
  placeboMinPips:    8,    // placebo shift: uniform ±[min,max] pips off the real level
  placeboMaxPips:    30,
};

export function buildLadder(lo, range) {
  if (!(range > 0)) return [];
  return FIB_LADDER.map(f => ({ f, price: lo + range * f }));
}

// today∩yesterday confluence: ladder prices within tol → a confluence level (mean price).
export function findConfluence(ladderToday, ladderYest, tolPrice) {
  const out = [];
  for (const a of ladderToday) for (const b of ladderYest) {
    if (Math.abs(a.price - b.price) <= tolPrice) out.push({ price: (a.price + b.price) / 2, fToday: a.f, fYest: b.f });
  }
  return out;
}

// Deterministic PRNG (mulberry32) — reproducible placebo shifts, no Math.random.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Race a symmetric ±D barrier from the first-touch bar. reversionUp = price approached
// from above (fell to the level) so a bounce reverts UP. Returns 'bounce' | 'break' |
// 'none'. Same-bar hit of both barriers → 'break' (conservative against the fade thesis).
export function barrierRace(highs, lows, startIdx, endIdx, level, reversionUp, D) {
  const bounceB = reversionUp ? level + D : level - D;
  const breakB  = reversionUp ? level - D : level + D;
  for (let k = startIdx; k <= endIdx; k++) {
    const hitBounce = reversionUp ? highs[k] >= bounceB : lows[k] <= bounceB;
    const hitBreak  = reversionUp ? lows[k]  <= breakB  : highs[k] >= breakB;
    if (hitBounce && hitBreak) return 'break';
    if (hitBounce) return 'bounce';
    if (hitBreak)  return 'break';
  }
  return 'none';
}

// records: [{ date, type, outcome, Dpips }]. Reports the bounce rate and after-cost
// expectancy over RESOLVED races (bounce/break); 'none' counts only toward touches.
export function summarizeRace(records, { spreadPips = 1.0 } = {}) {
  const resolved = records.filter(r => r.outcome === 'bounce' || r.outcome === 'break');
  const n = resolved.length;
  if (!n) return { touches: records.length, n: 0, resolvedPct: 0, bounceRate: 0, expectancyPips: 0 };
  const bounces = resolved.filter(r => r.outcome === 'bounce').length;
  let exp = 0;
  for (const r of resolved) exp += (r.outcome === 'bounce' ? r.Dpips : -r.Dpips) - spreadPips;
  return {
    touches: records.length,
    n,
    resolvedPct: +(n / records.length * 100).toFixed(1),
    bounceRate: +(bounces / n * 100).toFixed(1),
    expectancyPips: +(exp / n).toFixed(2),
  };
}

// The headline comparison: real vs placebo. Edge exists only if real bounces MORE than
// the shifted placebo by a margin, IS-consistently.
export function edgeVsPlacebo(realStats, placeboStats) {
  const delta = (realStats.bounceRate ?? 0) - (placeboStats.bounceRate ?? 0);
  return { bounceRateDelta: +delta.toFixed(1), realBounce: realStats.bounceRate, placeboBounce: placeboStats.bounceRate };
}
