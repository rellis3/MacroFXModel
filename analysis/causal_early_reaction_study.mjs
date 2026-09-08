// Causal Early-Reaction Study — 2026-09-07
//
// Follows up analysis/daily_open_retest_study.mjs and analysis/dynamic_hl_level_study.mjs
// (read those files' headers first — this script reuses their exact touch/rearm/race
// walks, duplicated rather than imported, same self-containment convention every
// confluence sibling script in this directory already uses).
//
// Both of those studies found the UNCONDITIONAL continuation/reversal split at a touch
// is close to a coin flip. But dynamic_hl_level_study.mjs's own `pullbackFrac` field —
// computed over the FULL path to resolution — showed touches very commonly show a large
// reaction (pullback) before finally resolving. That field is NOT a usable real-time
// signal: it is measured using bars AFTER the touch all the way to resolution, so a
// touch that resolves with almost no pullback is, near-tautologically, a touch that
// "continued" (there was no time left for a large reaction before the race ended). Using
// it to predict the very outcome it's partly built from is circular.
//
// ── THE ACTUAL NEW QUESTION ─────────────────────────────────────────────────────────
// Is there a CAUSAL, point-in-time version of "how strong is the reaction so far" —
// knowable using ONLY bars up to some FIXED early checkpoint after the touch, with NO
// lookahead past that checkpoint — that predicts the EVENTUAL final outcome? This is
// genuinely different from "does the level have an unconditional/context-conditioned
// bias" (already tested, twice): this asks "once a reaction is ALREADY VISIBLY UNDERWAY
// by some fixed early point, does its measured depth-so-far forecast where it ends up."
//
// ── DEFINITION: earlyPullbackFrac ────────────────────────────────────────────────────
// For every touch with a KNOWN final outcome (continuation or reversal — 'neither' is
// excluded, there is nothing to predict), at each fixed checkpoint c ∈ {5,15,30,60}
// minutes after the touch bar: using ONLY bars from the touch bar up to and including
// the last bar timestamped <= touchTime + c*60 (strictly no bar after that), measure how
// far price has moved from the touch level TOWARD the reversal side, as a fraction of
// that touch's own reversal-target distance (the SAME distance the baseline studies
// already compute as the reversal race target — revDistPips for daily-open touches,
// innerDistPips for HL touches). This reuses the exact reversal TARGET each baseline
// walk already computes; nothing new is invented about what "the reversal side" means.
//
// CRITICAL GUARD (this is what the whole study is about): a checkpoint value is only
// included when `minsToResolve` — the touch's REAL resolution time, already computed by
// the reused race loop — is STRICTLY GREATER than the checkpoint. If the touch already
// resolved by or before the checkpoint, that checkpoint's "so far" measurement would
// have been taken AFTER the answer was already known (lookahead), so it is EXCLUDED
// entirely, never clamped or truncated to fake a valid value. A direct consequence,
// verified in code below, not just asserted: since neither race target had been hit by
// the checkpoint (that is exactly what minsToResolve>checkpoint means), the entire bar
// range from the touch bar through the checkpoint bar lies strictly between the two
// targets — so both remaining-distance quantities used below (empirical AND theoretical)
// are always strictly positive, never a divide-by-zero, and earlyPullbackFrac is
// mathematically guaranteed <1 for every included row — a built-in self-check that the
// window truly contains no post-resolution bars.
//
// ── THE GAMBLER'S-RUIN BENCHMARK (added after first review) ─────────────────────────
// A touch sits between two absorbing targets (continuation on one side, reversal on the
// other) — a two-barrier race. For a driftless Brownian martingale, the standard
// optional-stopping result is that the fair, purely-geometric probability of hitting one
// barrier first is proportional to the REMAINING distance to the OTHER (opposite)
// barrier: P_theory(reversal) = remainingDistToContinuation / (remainingDistToContinuation
// + remainingDistToReversal), evaluated at the checkpoint's own last known price (the
// checkpoint bar's close — never a later bar, same no-lookahead discipline as
// earlyPullbackFrac itself). This means "closer to a wall → more likely to hit it first"
// is EXPECTED under a pure zero-drift random walk with zero real edge — the earlier
// observed pattern (deeper pullback -> more reversals) could be entirely this mechanical
// fact re-expressed, not genuine informational content. The real test is whether the
// OBSERVED reversal rate in each bucket exceeds, matches, or falls short of this
// theoretical fair-race rate. Computed here in the SAME pass over the SAME touches at
// the SAME checkpoints — no re-walk of touch/rearm/race detection, purely an additional
// measurement bolted onto the existing per-touch loop.
//
// ── LEVEL FAMILY 1: DAILY OPEN (breakaway → rearm → retest → race) ──────────────────
// Touch level = the day's open. side = the day's fixed breakaway direction. Reversal
// target = the p50 rung on the OTHER side from breakaway (punching through open) — same
// revTarget the baseline race already uses. Continuation target = the p50 rung on the
// breakaway side. Reversal direction (the physical direction counted as "toward
// reversal"): side='up' -> down; side='down' -> up. Duplicated here: loadM1ForPair,
// bucketM1IntoSessions, forecastSigma/buildLadder/rungLevelsForLadder, REARM_FRAC=0.3
// (DEFAULT_REARM, js/levelAtlasRoutes.js), splitAt — all imported unchanged, never
// re-derived; only the breakaway/rearm/retest/race CONTROL FLOW itself is copied (same
// reason the original study gives for not calling atlasWalk directly).
//
// ── LEVEL FAMILY 2: DYNAMIC HL (Proj-High/Proj-Low ladder) ───────────────────────────
// Touch level = the touched rung ("here"). Reversal target = the INNER neighbour (the
// rung nearer the moving anchor) — reverting to it is what dynamic_hl_level_study.mjs's
// own walkSide calls 'back'; breaking the OUTER neighbour ('out') is the continuation
// target. This study maps out->'continuation', back->'reversal' (extending the ladder
// further IS the continuation of the move that created the touch; reverting to the inner
// rung IS a reversal of that immediate extension — the same semantic pairing
// pullbackFrac's own header already uses, since pullbackFrac tracks the 'back'/reversal
// direction). p90 is EXCLUDED: it has no outer rung, so 'continuation' is structurally
// impossible there (0% by construction, not a finding) — same exclusion
// js/levelAtlasVoteReview.js's reviewVoteBacktest applies by default, reused here for
// the identical reason. Only p50/p75 rungs are walked. computeHlFractions/BM_P90/
// anchorLag (the no-lookahead lagged-anchor convention, NOT forecastAnalyser.js's
// inclusive one — see that file's header for why) are duplicated unchanged from
// dynamic_hl_level_study.mjs.
//
// ── BUCKETS AND REPORTING ─────────────────────────────────────────────────────────────
// Fixed bands (not quantiles — fixed thresholds are comparable across checkpoints and
// families, quantiles would shift under you): <15%, 15-35%, 35-60%, >60%. Per checkpoint
// per band per family, OOS only: n, observed P(reversal), mean theoretical fair-race
// P(reversal) (the gambler's-ruin benchmark above), the difference (observed - theory,
// in percentage points) with a normal-approximation 95% CI on that mean difference
// (computed from the per-touch difference d_i = outcomeIndicator_i - pTheory_i, which is
// a well-defined per-observation quantity, so mean(d)±1.96*se(d) is a standard CI on a
// sample mean — simple, not fancy, per the request), and an n<30 THIN flag. IS numbers
// are also computed and stored (not the headline) purely as a same-sign sanity check.
//
// Sample-size floor MIN_SAMPLE=30, IS/OOS split 60/40 by date (splitAt, per pair, per
// family) — same convention as every other study this session.
//
// Pure historical re-walk of real M1 — no synthetic data, no lookahead.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { bucketM1IntoSessions } from '../js/forecastAnalyser.js';
import { forecastSigma } from '../js/forecastSigma.js';
import { buildLadder } from '../js/forecastLadder.js';
import { LADDER_PARAMS } from '../js/forecastLadderParams.js';
import { rungLevelsForLadder } from '../js/levelAtlasEngine.js';
import { computeBands, ASSET_PARAMS } from '../js/forecastCore.js';
import { splitAt } from '../js/levelAtlasReport.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { pipSize } from '../js/instrumentRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');

const REARM_FRAC = 0.3;
const MIN_LOOKBACK = 60;
const MIN_SAMPLE = 30;
const SPLIT_FRAC = 0.6;
const CHECKPOINTS_MIN = [5, 15, 30, 60];
// BM_P90 — see analysis/dynamic_hl_level_study.mjs's header for the full derivation.
// Duplicated as a plain constant (not imported) — same self-containment convention
// every sibling script in this directory already uses. Unused for touch DETECTION here
// (p90 is excluded — see header) but still needed to build the p75 rung's OUTER
// neighbour correctly, exactly as the baseline script's own ladder does.
const BM_P90 = 2.555;
const HL_RUNGS = ['p50', 'p75', 'p90'];

const BANDS = [
  { key: '<15%', test: f => f < 0.15 },
  { key: '15-35%', test: f => f >= 0.15 && f < 0.35 },
  { key: '35-60%', test: f => f >= 0.35 && f < 0.6 },
  { key: '>60%', test: f => f >= 0.6 },
];

const ALL_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const PAIRS = process.env.LA_PAIRS
  ? process.env.LA_PAIRS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  : ALL_PAIRS;

function pct(n, d) { return d > 0 ? +(n / d * 100).toFixed(1) : null; }
function propCI(k, n) {
  if (!(n > 0)) return null;
  const p = k / n, se = Math.sqrt(p * (1 - p) / n);
  return { p: +(p * 100).toFixed(1), lo: +Math.max(0, (p - 1.96 * se) * 100).toFixed(1), hi: +Math.min(100, (p + 1.96 * se) * 100).toFixed(1), n };
}
// Normal-approximation 95% CI on a sample MEAN (not a proportion) — used for the
// observed-minus-theoretical difference, per the request ("simple ... doesn't need to
// be fancy"). vals is an array of per-touch differences d_i.
function meanCI(vals) {
  const n = vals.length;
  if (!(n > 0)) return null;
  const mean = vals.reduce((s, v) => s + v, 0) / n;
  const variance = n > 1 ? vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
  const se = Math.sqrt(variance / n);
  return { mean: +mean.toFixed(2), lo: +(mean - 1.96 * se).toFixed(2), hi: +(mean + 1.96 * se).toFixed(2), n };
}

// ── The shared causal measurement — identical logic for both families ───────────────
// bars: this session's bar array (chronological, ascending time). k: touch bar index.
// level: the touched price. contTarget/revTarget: the two race targets (continuation and
// reversal respectively — the SAME two prices the reused race loop already races toward).
// revDir: 'down' or 'up' — the physical direction of movement counted as "toward
// reversal". minsToResolve/outcome: from the SAME race loop the baseline study already
// runs; used ONLY to gate which checkpoints are even eligible (see header CRITICAL
// GUARD). Returns { [checkpointMin]: { frac, pTheory } } — only for checkpoints strictly
// before the touch's real resolution time.
function earlyCheckpointMeasurements(bars, k, level, contTarget, revTarget, revDir, minsToResolve, outcome) {
  const out = {};
  if (outcome === 'neither' || minsToResolve == null) return out;   // no known final outcome to predict
  const revSpan = Math.abs(level - revTarget);
  if (!(revSpan > 0)) return out;
  const touchTime = bars[k].time;
  for (const cp of CHECKPOINTS_MIN) {
    if (!(minsToResolve > cp)) continue;   // STRICT — excludes any checkpoint the touch had already resolved by (see header)
    const targetTime = touchTime + cp * 60;
    let ck = k;
    for (let j = k + 1; j < bars.length; j++) {
      if (bars[j].time <= targetTime) ck = j; else break;   // never advance past a bar timestamped after the checkpoint
    }
    let extreme = revDir === 'down' ? Infinity : -Infinity;
    for (let j = k; j <= ck; j++) {
      const b = bars[j];
      if (revDir === 'down') { if (b.low < extreme) extreme = b.low; }
      else { if (b.high > extreme) extreme = b.high; }
    }
    const moved = revDir === 'down' ? (level - extreme) : (extreme - level);
    // Clamp only defensively (float edge cases) — see header for why this is
    // mathematically guaranteed <1 by the minsToResolve>cp gate itself, not by this clamp.
    const frac = Math.min(1, Math.max(0, moved) / revSpan);

    // ── Gambler's-ruin fair-race benchmark, evaluated at the checkpoint's own last
    // known price (bars[ck].close — never a later bar). Guaranteed remDistCont>0 and
    // remDistRev>0 (see header: neither target was hit by ck, by construction of the
    // minsToResolve>cp gate), so this is never a divide-by-zero.
    const ckPrice = bars[ck].close;
    const remDistCont = Math.abs(contTarget - ckPrice);
    const remDistRev = Math.abs(revTarget - ckPrice);
    const denom = remDistCont + remDistRev;
    const pTheory = denom > 0 ? remDistCont / denom : null;

    out[cp] = { frac: +frac.toFixed(4), pTheory: pTheory != null ? +pTheory.toFixed(4) : null };
  }
  return out;
}

function bandOf(frac) {
  for (const b of BANDS) if (b.test(frac)) return b.key;
  return null;
}

// ── FAMILY 1: DAILY OPEN — walk duplicated from analysis/daily_open_retest_study.mjs ─
async function processDailyOpenPair(pair) {
  const sym = pair.toUpperCase();
  let packed;
  try { packed = await loadM1ForPair(pair); } catch (e) { console.log(`  [daily-open] M1 load failed: ${e.message}`); return null; }
  if (!packed?.n) { console.log('  [daily-open] no M1 data, skipping'); return null; }
  const assetClass = assetClassFor(pair);
  let pip = 1; try { pip = pipSize(pair) || 1; } catch { /* raw units */ }

  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const dates = [...sessions.keys()].sort().filter(d => (sessions.get(d)?.length ?? 0) >= 200);
  if (dates.length <= MIN_LOOKBACK) { console.log('  [daily-open] too little history, skipping'); return null; }

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
    const lad = buildLadder(sigma, { instrument: sym, assetClass, horizon: 'daily', eventTag: 'none' });
    if (!lad?.oh?.p50 || !lad?.ol?.p50) continue;

    const lvBySide = rungLevelsForLadder(lad, open);
    const pUp = lvBySide.up?.[1], pDown = lvBySide.down?.[1];
    if (!(pUp > open) || !(pDown < open) || !(pDown > 0)) continue;
    const rungSpanUp = pUp - open, rungSpanDown = open - pDown;
    const rearmUp = REARM_FRAC * rungSpanUp, rearmDown = REARM_FRAC * rungSpanDown;

    let hasBrokenAway = false, side = null, armed = false;

    for (let k = 0; k < bars.length; k++) {
      const bar = bars[k];
      const upAway = bar.high - open, downAway = open - bar.low;

      if (!hasBrokenAway) {
        if (upAway >= rearmUp) { hasBrokenAway = true; side = 'up'; armed = true; }
        else if (downAway >= rearmDown) { hasBrokenAway = true; side = 'down'; armed = true; }
        continue;
      }
      if (!armed) {
        if (upAway >= rearmUp || downAway >= rearmDown) armed = true;
        continue;
      }
      if (!(bar.low <= open && bar.high >= open)) continue;
      armed = false;

      const contTarget = side === 'up' ? pUp : pDown;
      const revTarget = side === 'up' ? pDown : pUp;
      let outcome = 'neither', resolveTime = null;
      for (let j = k; j < bars.length; j++) {
        const b2 = bars[j];
        const contHit = side === 'up' ? b2.high >= contTarget : b2.low <= contTarget;
        const revHit = side === 'up' ? b2.low <= revTarget : b2.high >= revTarget;
        if (contHit) { outcome = 'continuation'; resolveTime = b2.time; break; }
        if (revHit) { outcome = 'reversal'; resolveTime = b2.time; break; }
      }
      const minsToResolve = resolveTime != null ? +((resolveTime - bar.time) / 60).toFixed(0) : null;
      const revDir = side === 'up' ? 'down' : 'up';   // reversal = punching through open to the OTHER side
      const checks = earlyCheckpointMeasurements(bars, k, open, contTarget, revTarget, revDir, minsToResolve, outcome);

      if (Object.keys(checks).length) {
        records.push({ instrument: sym, assetClass, date, side, outcome, minsToResolve, checks });
      }
    }
  }

  if (!records.length) { console.log('  [daily-open] no eligible touches, skipping'); return null; }
  const { split } = splitAt(records, SPLIT_FRAC);
  for (const r of records) r.isOos = r.date >= split ? 'oos' : 'is';
  console.log(`  [daily-open] ${dates.length} sessions, ${records.length} eligible retests (>=1 checkpoint), split ${split}`);
  return { pair: sym, coverage: { from: dates[MIN_LOOKBACK], to: dates.at(-1), sessions: dates.length }, splitDate: split, records };
}

// ── FAMILY 2: DYNAMIC HL — walk duplicated from analysis/dynamic_hl_level_study.mjs ──
function computeHlFractions(sigma, assetClass) {
  const b = computeBands(1, sigma, assetClass);
  const p = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;
  const hl90 = BM_P90 * p.hl_75_corr * sigma;
  return { hl50: b.hl50, hl75: b.hl75, hl90 };
}

// Walks ONE side, rungs p50+p75 only (p90 excluded — see header). Reversal target for a
// touched rung = its INNER neighbour; continuation target = its OUTER neighbour.
// outcome 'out'(breaks outer)->'continuation', 'back'(reverts to inner)->'reversal'.
// Returns raw eligible records (context-free).
function walkSideCausal(bars, open, hl, isUp, rearmFrac, pip) {
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
  for (let ri = 0; ri < 2; ri++) {   // p50 (ri=0), p75 (ri=1) only — p90 (ri=2) excluded, see header
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
      const revDir = isUp ? 'down' : 'up';   // reverting to inner is always toward the anchor
      const checks = earlyCheckpointMeasurements(bars, k, here, outer, inner, revDir, minsToResolve, displayOutcome);

      if (Object.keys(checks).length) {
        out.push({ rung: HL_RUNGS[ri], touchTime: bar.time, outcome: displayOutcome, minsToResolve, checks });
      }
    }
  }
  return out;
}

async function processDynamicHlPair(pair) {
  const sym = pair.toUpperCase();
  let packed;
  try { packed = await loadM1ForPair(pair); } catch (e) { console.log(`  [dyn-hl] M1 load failed: ${e.message}`); return null; }
  if (!packed?.n) { console.log('  [dyn-hl] no M1 data, skipping'); return null; }
  const assetClass = assetClassFor(pair);
  let pip = 1; try { pip = pipSize(pair) || 1; } catch { /* raw units */ }

  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const dates = [...sessions.keys()].sort().filter(d => (sessions.get(d)?.length ?? 0) >= 200);
  if (dates.length <= MIN_LOOKBACK) { console.log('  [dyn-hl] too little history, skipping'); return null; }

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
      const touches = walkSideCausal(bars, open, hl, isUp, REARM_FRAC, pip);
      for (const t of touches) records.push({ instrument: sym, assetClass, date, side, ...t });
    }
  }

  if (!records.length) { console.log('  [dyn-hl] no eligible touches, skipping'); return null; }
  const { split } = splitAt(records, SPLIT_FRAC);
  for (const r of records) r.isOos = r.date >= split ? 'oos' : 'is';
  console.log(`  [dyn-hl] ${dates.length} sessions, ${records.length} eligible touches (p50/p75, >=1 checkpoint), split ${split}`);
  return { pair: sym, coverage: { from: dates[MIN_LOOKBACK], to: dates.at(-1), sessions: dates.length }, splitDate: split, records };
}

// ── Bucketing / reporting — identical shape for both families ───────────────────────
// rows here are already filtered to one checkpoint, each carrying .frac/.pTheory/.outcome.
function summarizeBand(rows) {
  const n = rows.length;
  const cont = rows.filter(r => r.outcome === 'continuation').length;
  const rev = rows.filter(r => r.outcome === 'reversal').length;
  const resolved = cont + rev;   // always === n here, 'neither' already excluded upstream
  const revOfResolvedCI = propCI(rev, resolved);
  const meanTheory = n ? +(rows.reduce((s, r) => s + r.pTheory * 100, 0) / n).toFixed(1) : null;
  // Per-touch difference d_i = outcomeIndicator_i - pTheory_i (both on the SAME row,
  // in percentage points) — mean(d)±1.96*se(d) is a standard CI on a sample mean, not a
  // proportion CI, since pTheory varies continuously per row (see header).
  const diffs = rows.map(r => (r.outcome === 'reversal' ? 100 : 0) - r.pTheory * 100);
  const diffCI = meanCI(diffs);
  return {
    n, cont, rev, contPct: pct(cont, n), revPct: pct(rev, n),
    revOfResolvedCI, meanTheoryPct: meanTheory, diffCI,
    thin: n < MIN_SAMPLE,
  };
}

function buildCheckpointTable(records, cp) {
  const withFrac = records.filter(r => r.checks[cp] !== undefined)
    .map(r => ({ ...r, frac: r.checks[cp].frac, pTheory: r.checks[cp].pTheory }));
  const oos = withFrac.filter(r => r.isOos === 'oos');
  const is = withFrac.filter(r => r.isOos === 'is');
  const byBandOos = {}, byBandIs = {};
  for (const b of BANDS) {
    byBandOos[b.key] = summarizeBand(oos.filter(r => bandOf(r.frac) === b.key));
    byBandIs[b.key] = summarizeBand(is.filter(r => bandOf(r.frac) === b.key));
  }
  return { nOos: oos.length, nIs: is.length, oos: byBandOos, is: byBandIs };
}

function printCheckpointTable(label, table) {
  console.log(`\n  -- ${label} -- (OOS n=${table.nOos}, IS n=${table.nIs})`);
  for (const b of BANDS) {
    const o = table.oos[b.key];
    const ci = o.diffCI;
    const diffTxt = ci ? `${ci.mean >= 0 ? '+' : ''}${ci.mean}pp [${ci.lo}, ${ci.hi}]` : 'n/a';
    console.log(`    band ${b.key.padEnd(8)} n=${String(o.n).padStart(5)}  observedRev=${String(o.revPct).padStart(5)}%  theoryRev=${String(o.meanTheoryPct).padStart(5)}%  diff=${diffTxt}${o.thin ? '  [THIN n<' + MIN_SAMPLE + ']' : ''}`);
  }
}

async function runFamily(name, pairFn) {
  console.log(`\n\n================ FAMILY: ${name} ================`);
  const allRecords = [];
  const perPairMeta = [];
  for (const pair of PAIRS) {
    console.log(`=== ${pair.toUpperCase()} ===`);
    const r = await pairFn(pair);
    if (!r) continue;
    allRecords.push(...r.records);
    perPairMeta.push({ pair: r.pair, coverage: r.coverage, splitDate: r.splitDate, nRecords: r.records.length });
  }
  console.log(`\nPooled ${name}: ${perPairMeta.length} pairs, ${allRecords.length} eligible touches (>=1 checkpoint each).`);

  const byCheckpoint = {};
  for (const cp of CHECKPOINTS_MIN) {
    const table = buildCheckpointTable(allRecords, cp);
    byCheckpoint[cp] = table;
    printCheckpointTable(`checkpoint=${cp}min`, table);
  }
  return { perPairMeta, totalEligible: allRecords.length, byCheckpoint };
}

// Weighted (by n) average of the observed-minus-theory diff across all bands at a
// checkpoint, and across all checkpoints for the family — purely descriptive rollups on
// top of the per-bucket numbers already reported, not a new statistic.
function weightedDiffSummary(byCheckpoint) {
  const perCp = {};
  let totalW = 0, totalWD = 0;
  for (const [cp, table] of Object.entries(byCheckpoint)) {
    let w = 0, wd = 0;
    for (const b of BANDS) {
      const g = table.oos[b.key];
      if (!g.n || g.diffCI == null) continue;
      w += g.n; wd += g.n * g.diffCI.mean;
    }
    perCp[cp] = w > 0 ? +(wd / w).toFixed(2) : null;
    totalW += w; totalWD += wd;
  }
  return { perCheckpointWeightedDiffPp: perCp, overallWeightedDiffPp: totalW > 0 ? +(totalWD / totalW).toFixed(2) : null };
}

async function main() {
  const dailyOpen = await runFamily('DAILY OPEN (breakaway/retest)', processDailyOpenPair);
  const dynamicHl = await runFamily('DYNAMIC HL (p50/p75 rungs)', processDynamicHlPair);

  const verdict = {
    dailyOpen: weightedDiffSummary(dailyOpen.byCheckpoint),
    dynamicHl: weightedDiffSummary(dynamicHl.byCheckpoint),
  };

  console.log(`\n\n================ VERDICT: observed minus gambler's-ruin fair-race theory (pp) ================`);
  for (const [fam, v] of Object.entries(verdict)) {
    console.log(`  ${fam}: overall weighted diff = ${v.overallWeightedDiffPp}pp`);
    for (const [cp, d] of Object.entries(v.perCheckpointWeightedDiffPp)) console.log(`    checkpoint=${cp}min: ${d}pp`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'causal_early_reaction_study.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    pairs: PAIRS, checkpointsMin: CHECKPOINTS_MIN, bands: BANDS.map(b => b.key),
    rearmFrac: REARM_FRAC, splitFrac: SPLIT_FRAC, minSample: MIN_SAMPLE,
    dailyOpen: { perPairMeta: dailyOpen.perPairMeta, totalEligible: dailyOpen.totalEligible, byCheckpoint: dailyOpen.byCheckpoint },
    dynamicHl: { perPairMeta: dynamicHl.perPairMeta, totalEligible: dynamicHl.totalEligible, byCheckpoint: dynamicHl.byCheckpoint },
    verdict,
  }, null, 0));
  console.log(`\nWrote full detail to ${OUT_DIR}/causal_early_reaction_study.json`);
}

main();
