// Dynamic HL Level Study (Proj-High / Proj-Low ladder) — BASELINE touch/outcome — 2026-09-07
//
// Same rigor bar as the LIVE Level Atlas OH/OL vote portfolio (js/levelAtlasEngine.js's
// atlasWalk, js/levelAtlasReport.js's dimension book, js/levelAtlasVoteReview.js's
// voteDecision), applied to a DIFFERENT, related level family: the "dynamic HL"
// (Proj High/Proj Low) lines already built for the daily forecast overlay in
// js/forecastCore.js's computeBands()/dayTypeCore.js and measured (at p50/p75 only,
// single-fire, no rearm) by js/forecastAnalyser.js's analyseWindow. This script does
// NOT modify, import the touch logic of, or run through any of the live-trading files
// (levelAtlasEngine.js/levelAtlasReport.js/levelAtlasVoteReview.js/levelAtlasRoutes.js
// are read-only reference/label reuse here) — it is a new, standalone reference book.
//
// ── WHAT "DYNAMIC HL" MEANS, GEOMETRICALLY ──────────────────────────────────────────
// js/forecastCore.js's computeBands(open, sigma, assetClass) returns hl50/hl75 as
// FRACTIONS of price: hl50 = BM_P50 * hl_50_corr * sigma, hl75 = BM_P75 * hl_75_corr *
// sigma (BM_P50/BM_P75 = 1.572 / 2.049, the Feller/Brownian-motion RANGE-distribution
// constants — see the derivation block below). In the STATIC application (the OC/HL
// static overlay math also in computeBands) these fractions are applied off the OPEN.
// In the DYNAMIC application — js/forecastCore.js's walkDynamicHL/resolveDynOrder, and
// independently js/forecastAnalyser.js's analyseWindow — the SAME fractions instead
// trail the OPPOSITE running extreme:
//     proj HIGH (up side) = running LOW  so far × (1 + hlFrac)
//     proj LOW  (dn side) = running HIGH so far × (1 - hlFrac)
// This is genuinely dynamic (the anchor keeps moving until its own extreme stops
// updating for the rest of the session, at which point that side's line is
// effectively frozen) — a structurally different level family from the live-traded
// OH/OL rungs (which anchor to the OPEN, fixed for the day), even though the vote/
// rearm/race MECHANICS below are deliberately the same shape.
//
// ── HL90 DERIVATION (does not exist anywhere in this codebase before this file) ─────
// BM_P50=1.572 and BM_P75=2.049 (js/volBacktestEngine.js) are labelled "Feller/
// half-normal" constants for the STANDARDIZED RANGE of a driftless Brownian motion
// (Range = max−min over one session, Range/σ is scale-invariant by BM self-similarity,
// so this is a universal constant independent of the actual session length or σ).
// There is no BM_P90 anywhere to reuse or interpolate from a table, so it is derived
// here in three steps, arithmetic reproducible from this comment alone:
//
//   1. EXACT closed-form check. Feller (1951)'s density for the standardized range R
//      of a standard BM on [0,1] is f(x) = 8 * Σ_{k=1..∞} (-1)^(k+1) k² φ(k x), φ = the
//      standard normal pdf. Numerically integrating this (adaptive term-count per x to
//      dodge the well-documented near-zero cancellation blow-up, verified against the
//      CLOSED-FORM mean E[Range] = √(8/π) = 1.5958, which the numeric integral
//      reproduces to 4 decimal places — i.e. the integration is trustworthy) gives the
//      TRUE continuous-BM quantiles: p50=1.5146, p75=1.8599, p90=2.2412, p95=2.4977.
//   2. Reconciling with the codebase's own constants. BM_P50=1.572 and BM_P75=2.049
//      sit ABOVE these exact theoretical quantiles (+3.8% and +10.2% respectively) —
//      i.e. whatever the original vol_range_forecast.py fit actually did (that script
//      is not present in this repo; the comment in volBacktestEngine.js only says it
//      "mirrors" it), it was not the literal driftless-BM quantile. The DIRECTION is
//      sensible regardless: real session ranges run wider than pure driftless-BM
//      predicts (intraday drift, jumps, vol clustering), so an empirically-anchored
//      constant sitting above the idealized one is the expected shape, not an error to
//      "fix" — this file must extrapolate consistently with what's ALREADY adopted and
//      live, not silently replace it with the purer theoretical number.
//   3. Extrapolation. The inflation factor over the exact theoretical quantile GROWS
//      with percentile rank (1.038× at p50, 1.102× at p75) — the expected shape if the
//      true empirical anchoring has a fatter tail than driftless BM. Extending that
//      growth linearly in percentile rank to p90 (slope = (1.102-1.038)/25 per point):
//      factor90 ≈ 1.140 → BM_P90 ≈ 1.140 × 2.2412 ≈ 2.555. (A log-linear extrapolation
//      of the same two points gives 2.560 — matches to within rounding, so the estimate
//      is not sensitive to that modelling choice.)
//
//   PLAUSIBILITY CROSS-CHECK against a related-but-different, already-fitted quantity:
//   js/forecastLadderParams.js's LADDER_PARAMS.classDefaults.fx.width.hl = [1.4343,
//   1.8836, 2.4211] — the REAL, empirically-fitted (realized full-session range ÷ σ)
//   p50/p75/p90 multipliers for FX (a different quantity: fitted on live drift-and-all
//   price data, not a driftless-BM idealization, and it's the FULL "hl" width, not the
//   OH/OL one-sided quantity). Its p75/p50 ratio = 1.313 essentially matches BM_P75/
//   BM_P50 = 1.303 (already-adopted constants, 0.8% apart) — strong evidence the
//   Feller-shaped family already tracks real market behaviour well. Its p90/p75 ratio
//   = 1.285 vs this file's derived BM_P90/BM_P75 = 2.555/2.049 = 1.247 — same direction,
//   3% apart, idealized slightly UNDER the real fat-tailed ratio, exactly the pattern
//   you'd expect (the extrapolation is conservative, not inflated). This is the
//   plausibility check the task asked for; it is not proof BM_P90=2.555 is "the"
//   correct constant, just that it is not an arbitrary number and sits where the two
//   already-adopted anchors and a genuinely different fitted quantity all say it should.
//
//   No hl_90_corr is fitted anywhere in this codebase (only hl_50_corr/hl_75_corr
//   exist per asset class in js/volBacktestEngine.js's ASSET_PARAMS). Since hl_50_corr
//   and hl_75_corr sit within ~5% of each other for every asset class (fx 0.820/0.817,
//   commodity 0.898/0.914, index 1.010/0.967), the correction factor is treated as
//   roughly rung-invariant and hl_75_corr (the nearer, "wide-tail" analogue) is reused
//   for hl90 rather than inventing a new number. This file's OWN baseline touch-rate
//   results below (§ nominal-vs-realized) are the honest empirical check on that
//   assumption, exactly the role the OH/OL recalibration narrative in
//   volBacktestEngine.js already plays for hl_50_corr/hl_75_corr — a dynamic-anchor
//   rung's touch rate is NOT expected to equal the OH/OL RUNG_TARGET (10% for p90)
//   exactly (touching the running-extreme-anchored line is a structurally different,
//   generally MORE frequent event than a fixed-from-open threshold), so this is
//   reported as a descriptive fact, not scored against that target.
//
// ── REUSE, NOT A LOOKALIKE ───────────────────────────────────────────────────────────
// bucketM1IntoSessions(packed,'Europe/London'), forecastSigma, computeBands/ASSET_PARAMS
// (for hl50/hl75; hl90 added here per the derivation above), splitAt's IS/OOS
// convention, and REARM_FRAC=0.3 (DEFAULT_REARM, js/levelAtlasRoutes.js — literally the
// same constant, not a re-tuned one) are all IMPORTED, never re-implemented. The
// touch/rearm/race walk itself is copied and adapted (not imported) from
// js/levelAtlasEngine.js's atlasWalk — same reason analysis/daily_open_retest_study.mjs
// gives for its own purpose-built walk: atlasWalk's ladder assumes levels fixed off
// open, but here the anchor itself moves bar-to-bar, which atlasWalk's own indexing
// cannot express unmodified. What IS carried over byte-for-byte in spirit: the re-arm
// control flow (armed/rearmDist-from-close, the "continue on the (re)arming bar itself"
// guard), the "race the REAL neighbours, outer-checked-before-inner" outcome
// resolution, and the fadePips/runPips/pullbackFrac/innerDistPips/outerDistPips field
// definitions — verbatim from atlasWalk, so a touch here means the same thing a touch
// there means.
//
// ── THE ONE GENUINE DEVIATION FROM forecastAnalyser.js's OWN CONVENTION, AND WHY ────
// forecastAnalyser.js's analyseWindow computes its running extremes INCLUSIVE of the
// current bar (`runHigh[k]`/`runLow[k]` updated with bar k BEFORE bar k's own high/low
// is tested against the level built from them) — this project's own memory log flags
// that construction as a real, still-unfixed defect ("Forecast analyser phantom
// reversions" — dynamic HL lines can sit the wrong side of the open ~4-5% of the time
// by construction). Copying that convention into a brand-new ladder study would just
// import the same bug into new work. js/forecastCore.js's OWN walkDynamicHL uses the
// safe alternative instead — extremes of bars STRICTLY BEFORE bar k, seeded at the
// session open (its own comment: "Using bar k's own extreme to place the level that
// bar k is then fill-tested against is lookahead... Lagging one bar makes the level a
// resting order that existed at bar k's open") — and THAT is the convention this file
// uses (`anchorLag` below), not analyseWindow's. This is the single most important
// no-lookahead decision in this file, made explicitly rather than by default copying.
//
// Once a rung is TOUCHED, its inner/outer neighbours are FROZEN at the touch bar's
// levels for the outcome race — matching forecastAnalyser.js's own documented,
// accepted convention for this exact geometry ("an HL line is effectively fixed once
// its anchor extreme is set — so freezing neighbours at the touch bar is faithful, not
// an approximation").
//
// Sample-size floor MIN_SAMPLE=30 per reported cell, IS/OOS split 60/40 by date
// (splitAt, per pair) — same convention as every other study built this session.
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
import { computeBands, ASSET_PARAMS } from '../js/forecastCore.js';
import { splitAt } from '../js/levelAtlasReport.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { pipSize } from '../js/instrumentRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');

// BM_P90 — derived above. Kept as a named, documented constant (not inlined) so
// analysis/dynamic_hl_level_confluence_study.mjs (Stage 2) can reuse the identical
// number without re-deriving it a second, possibly-drifting way.
export const BM_P90 = 2.555;
const HL_RUNGS = ['p50', 'p75', 'p90'];
const REARM_FRAC = 0.3;     // DEFAULT_REARM (js/levelAtlasRoutes.js) — direct reuse, not an adapted value
const MIN_LOOKBACK = 60;
const MIN_SAMPLE = 30;
const SPLIT_FRAC = 0.6;

const ALL_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const PAIRS = process.env.LA_PAIRS
  ? process.env.LA_PAIRS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  : ALL_PAIRS;

function dowOf(dateStr) { return new Date(dateStr + 'T00:00:00Z').getUTCDay(); }
function sessionOf(hourUtc) {
  if (hourUtc >= 22 || hourUtc < 7) return 'Asia';
  if (hourUtc < 13) return 'London';
  return 'NY';
}
function pct(n, d) { return d > 0 ? +(n / d * 100).toFixed(1) : null; }
function propCI(k, n) {
  if (!(n > 0)) return null;
  const p = k / n, se = Math.sqrt(p * (1 - p) / n);
  return { p: +(p * 100).toFixed(1), lo: +Math.max(0, (p - 1.96 * se) * 100).toFixed(1), hi: +Math.min(100, (p + 1.96 * se) * 100).toFixed(1), n };
}

// ── HL50/75/90 as fractions of price, off the daily-fit sigma ──────────────────────
// hl50/hl75 reuse computeBands (forecastCore.js) unchanged — never re-derived. hl90 is
// this file's own addition (see header derivation): same functional FORM
// (BM_P90 * corr * sigma), correction factor extrapolated from hl_75_corr (see header
// for why), exported so Stage 2 can import it verbatim instead of recomputing.
export function computeHlFractions(sigma, assetClass) {
  const b = computeBands(1, sigma, assetClass);   // open=1 dummy — .hl50/.hl75 are pure fractions, independent of open
  const p = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;
  const hl90 = BM_P90 * p.hl_75_corr * sigma;
  return { hl50: b.hl50, hl75: b.hl75, hl90 };
}

// ── The dynamic ladder walk for ONE side (up=proj-high / down=proj-low), ONE day ───
// Returns raw touch events (context-free — the day-level caller in processPair adds
// session/dow/dayVol before pushing to `records`).
function walkSide(bars, open, hl, isUp, rearmFrac, pip) {
  const n = bars.length;
  if (n < 2) return [];
  // Lagged anchor — extremes of bars STRICTLY BEFORE bar k, seeded at the session
  // open (see header's no-lookahead section for why this, not forecastAnalyser's
  // inclusive convention).
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
  for (let ri = 0; ri < 3; ri++) {
    let armed = true, ordinal = 0;
    for (let k = 0; k < n; k++) {
      const bar = bars[k];
      const L = lv(k);
      const here = L[ri + 1], inner = L[ri], outer = L[ri + 2] ?? null;
      const rungSpan = Math.abs(here - inner);
      const rearmDist = rearmFrac * rungSpan;
      if (!armed) {
        const away = isUp ? (here - bar.close) : (bar.close - here);
        if (away >= rearmDist) armed = true;
        continue;   // the (re)arming bar itself never also counts as a touch — same guard atlasWalk uses
      }
      const px = isUp ? bar.high : bar.low;
      const reach = isUp ? px >= here : px <= here;
      if (!reach) continue;
      ordinal++;
      armed = false;

      // Race the REAL frozen neighbours — outer checked before inner (same
      // same-bar tie-break atlasWalk's own race uses).
      let outcome = 'neither', resolveTime = null, deepest = here, extreme = here;
      for (let j = k; j < n; j++) {
        const b2 = bars[j];
        const fwd = isUp ? b2.high : b2.low, bwd = isUp ? b2.low : b2.high;
        if (isUp ? bwd < deepest : bwd > deepest) deepest = bwd;
        if (isUp ? fwd > extreme : fwd < extreme) extreme = fwd;
        if (outer != null && (isUp ? fwd >= outer : fwd <= outer)) { outcome = 'out'; resolveTime = b2.time; break; }
        if (isUp ? bwd <= inner : bwd >= inner) { outcome = 'back'; resolveTime = b2.time; break; }
      }
      const sgn = isUp ? 1 : -1;
      const fadePips = (here - deepest) / pip * sgn;
      const runPips = (extreme - here) / pip * sgn;
      const pullbackFrac = rungSpan > 0 ? Math.min(1, Math.abs(here - deepest) / rungSpan) : null;
      const minsToResolve = resolveTime != null ? (resolveTime - bar.time) / 60 : null;

      out.push({
        rung: HL_RUNGS[ri], ordinal, touchTime: bar.time, outcome, resolveTime,
        minsToResolve: minsToResolve != null ? +minsToResolve.toFixed(0) : null,
        innerDistPips: +(rungSpan / pip).toFixed(1),
        outerDistPips: outer != null ? +(Math.abs(outer - here) / pip).toFixed(1) : null,
        fadePips: +fadePips.toFixed(1), runPips: +runPips.toFixed(1),
        pullbackFrac: pullbackFrac != null ? +pullbackFrac.toFixed(3) : null,
      });
    }
  }
  return out;
}

async function processPair(pair) {
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

  const t0 = Date.now();
  const records = [];
  let nominalTouches90 = 0, nominalDays = 0;

  for (let i = MIN_LOOKBACK; i < dates.length; i++) {
    const date = dates[i];
    const bars = sessions.get(date);
    const open = bars[0].open;
    let sigma = 0;
    try { sigma = forecastSigma(d1.slice(0, i), est); } catch { continue; }
    if (!(sigma > 0)) continue;

    const hl = computeHlFractions(sigma, assetClass);
    if (!(hl.hl50 > 0 && hl.hl75 > hl.hl50 && hl.hl90 > hl.hl75)) continue;   // ladder must be strictly widening

    const dayVol = (() => {
      const hist = [];
      for (let k = Math.max(0, i - 20); k < i; k++) { try { const s = forecastSigma(d1.slice(0, k), est); if (s > 0) hist.push(s); } catch {} }
      if (hist.length < 8) return null;
      const sorted = [...hist].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
      if (!(med > 0)) return null;
      const r = sigma / med;
      return r < 0.85 ? '1·quiet' : r > 1.25 ? '3·heavy' : '2·normal';
    })();
    const dow = dowOf(date);

    nominalDays++;
    let touchedP90Today = false;
    for (const side of ['up', 'down']) {
      const isUp = side === 'up';
      const touches = walkSide(bars, open, hl, isUp, REARM_FRAC, pip);
      for (const t of touches) {
        if (t.rung === 'p90') touchedP90Today = true;
        const hourUtc = new Date(t.touchTime * 1000).getUTCHours();
        records.push({
          instrument: sym, assetClass, date, dow, side, rearmFrac: REARM_FRAC,
          dayVol, session: sessionOf(hourUtc), hourUtc,
          minsIntoSession: +((t.touchTime - bars[0].time) / 60).toFixed(0),
          pip, ...t,
        });
      }
    }
    if (touchedP90Today) nominalTouches90++;
  }

  if (!records.length) { console.log('  no touches found, skipping'); return null; }
  const { split } = splitAt(records, SPLIT_FRAC);
  for (const r of records) r.isOos = r.date >= split ? 'oos' : 'is';

  const p90DayRate = pct(nominalTouches90, nominalDays);
  console.log(`  ${dates.length} sessions (${dates[MIN_LOOKBACK]}→${dates.at(-1)}), ${records.length} touches total, ` +
    `p90 touched on ${p90DayRate}% of days, split ${split} — ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  return { pair: sym, assetClass, coverage: { from: dates[MIN_LOOKBACK], to: dates.at(-1), sessions: dates.length }, splitDate: split, records, p90DayRate };
}

function summarizeGroup(rows) {
  const n = rows.length;
  const out = rows.filter(r => r.outcome === 'out').length;
  const back = rows.filter(r => r.outcome === 'back').length;
  const neither = n - out - back;
  const resolved = out + back;
  return {
    n, out, back, neither,
    outPct: pct(out, n), backPct: pct(back, n), neitherPct: pct(neither, n),
    resolved, outOfResolvedCI: propCI(out, resolved),
    avgFadePips: n ? +(rows.reduce((s, r) => s + r.fadePips, 0) / n).toFixed(1) : null,
    avgRunPips: n ? +(rows.reduce((s, r) => s + r.runPips, 0) / n).toFixed(1) : null,
    thin: n < MIN_SAMPLE || resolved < MIN_SAMPLE,
  };
}

function printGroup(label, rows) {
  const s = summarizeGroup(rows);
  const ci = s.outOfResolvedCI;
  const ciTxt = ci ? `${ci.p}% [${ci.lo}-${ci.hi}%]` : 'n/a';
  console.log(`  ${label.padEnd(28)} n=${String(s.n).padStart(6)}  out=${String(s.outPct).padStart(5)}%  back=${String(s.backPct).padStart(5)}%  neither=${String(s.neitherPct).padStart(5)}%   P(out|resolved)=${ciTxt}${s.thin ? '  [THIN — below n=' + MIN_SAMPLE + ' floor]' : ''}`);
  return s;
}

async function main() {
  const allRecords = [];
  const perPairMeta = [];

  for (const pair of PAIRS) {
    console.log(`\n=== ${pair.toUpperCase()} ===`);
    const r = await processPair(pair);
    if (!r) continue;
    allRecords.push(...r.records);
    perPairMeta.push({ pair: r.pair, assetClass: r.assetClass, coverage: r.coverage, splitDate: r.splitDate, nTouches: r.records.length, p90DayRate: r.p90DayRate });
  }

  const oos = allRecords.filter(r => r.isOos === 'oos');
  const is = allRecords.filter(r => r.isOos === 'is');

  console.log(`\n\n================ COVERAGE ================`);
  console.log('pair       nTouches  p90DayRate  splitDate    coverage');
  for (const m of perPairMeta) console.log(`${m.pair.padEnd(10)} ${String(m.nTouches).padStart(8)}  ${String(m.p90DayRate).padStart(9)}%  ${m.splitDate}  ${m.coverage.from}→${m.coverage.to}`);
  console.log(`\nPooled: ${perPairMeta.length} pairs, ${allRecords.length} total touches (${is.length} IS, ${oos.length} OOS).`);
  console.log(`BM_P90 used = ${BM_P90} (see file header for derivation).`);

  console.log(`\n\n================ HEADLINE — OOS ONLY, ALL PAIRS POOLED ================`);
  const headline = printGroup('ALL touches (OOS)', oos);

  console.log(`\n================ BY RUNG (OOS) ================`);
  const rungStats = {};
  for (const rung of HL_RUNGS) rungStats[rung] = printGroup(`rung=${rung}`, oos.filter(r => r.rung === rung));
  console.log('  Note: p90 has no outer rung to break through by construction — "out" is structurally 0% for it (a ceiling artifact, not a finding), same as the live OH/OL p90 rung.');

  console.log(`\n================ BY SIDE (OOS) ================`);
  const sideStats = {};
  for (const side of ['up', 'down']) sideStats[side] = printGroup(`side=${side}`, oos.filter(r => r.side === side));

  console.log(`\n================ BY SESSION OF TOUCH (OOS) ================`);
  const sessionStats = {};
  for (const s of ['Asia', 'London', 'NY']) sessionStats[s] = printGroup(`session=${s}`, oos.filter(r => r.session === s));

  console.log(`\n================ BY ORDINAL (OOS) ================`);
  const ordinalStats = {};
  for (const ord of [1, 2, 3]) {
    const rows = ord < 3 ? oos.filter(r => r.ordinal === ord) : oos.filter(r => r.ordinal >= 3);
    ordinalStats[ord < 3 ? String(ord) : '3+'] = printGroup(`ordinal=${ord < 3 ? ord : '3+'}`, rows);
  }

  console.log(`\n================ BY DAYVOL REGIME (OOS) ================`);
  const dayVolStats = {};
  for (const v of ['1·quiet', '2·normal', '3·heavy']) dayVolStats[v] = printGroup(`dayVol=${v}`, oos.filter(r => r.dayVol === v));

  console.log(`\n================ BY PAIR (OOS) ================`);
  const perPairStats = {};
  for (const m of perPairMeta) perPairStats[m.pair] = printGroup(m.pair, oos.filter(r => r.instrument === m.pair));

  console.log(`\n================ BY ASSET CLASS (OOS) ================`);
  const assetClassStats = {};
  for (const ac of ['fx', 'commodity', 'index']) {
    const rows = oos.filter(r => r.assetClass === ac);
    if (!rows.length) continue;
    assetClassStats[ac] = printGroup(`assetClass=${ac}`, rows);
  }

  console.log(`\n\n================ RUNG x SIDE (OOS) ================`);
  const byRungSide = {};
  for (const rung of HL_RUNGS) for (const side of ['up', 'down']) {
    const key = `${side}|${rung}`;
    byRungSide[key] = printGroup(key, oos.filter(r => r.rung === rung && r.side === side));
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'dynamic_hl_level_study.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), pairs: PAIRS, bmP90: BM_P90, rearmFrac: REARM_FRAC, splitFrac: SPLIT_FRAC, minSample: MIN_SAMPLE,
    perPairMeta,
    headline: { oos: headline, is: summarizeGroup(is) },
    byRung: rungStats, bySide: sideStats, bySession: sessionStats, byOrdinal: ordinalStats,
    byDayVol: dayVolStats, byPair: perPairStats, byAssetClass: assetClassStats, byRungSide,
    records: allRecords,
  }));
  console.log(`\nWrote full detail to ${OUT_DIR}/dynamic_hl_level_study.json`);
}

main();
