/**
 * Level Atlas — the comprehensive per-touch REFERENCE engine for the fitted
 * forecast ladder (the SAME p50/75/90 O-H/O-L lines `buildLadder` draws on
 * vol-forecast-v2 — never a second copy of that math).
 *
 * ── WHAT THIS IS, AND ISN'T ───────────────────────────────────────────────────
 * This is NOT a signal search. It does not screen conditions for a p<0.05 edge,
 * does not gate on after-cost expectancy, and does not drop a finding for being
 * "not tradeable". It is a QUANT REFERENCE BOOK: for every touch of every rung,
 * on every instrument, record everything that was true at that instant and
 * everything that happened next — so that when a specific situation arises live,
 * there is a real historical base rate to check it against, not a guess. A cell
 * that fires 38% of the time is a complete, useful entry here even if it would
 * never clear a trading gate.
 *
 * Each `atlasTouch()` call returns ONE record: the full context at a touch (time,
 * session, day/session volatility, approach speed, VWAP, VuManChu single-TF and
 * MTF, structural confluence, touch ordinal) plus everything that happened next
 * (which neighbour was reached, in pips/points AND %, how deep the pullback went,
 * how long it took, and — the repeatability check — whether the SAME conditioning
 * reading recurred on this rung's last visit).
 *
 * ── COMPOSES, COPIES NOTHING ─────────────────────────────────────────────────
 *   `forecastLadder`/`forecastLadderParams`/`forecastSigma` — the fitted ladder
 *   `confluenceFeatures`     — VuManChu MTF/1h/4h, VWAP side, structural confluence, ADX
 *   `touchFeatures` (via confluenceFeatures) — approach speed/efficiency, candle reject, round number
 *   `forecastAnalyser.classifySession`       — Asia/London/NY, the SAME session labels used everywhere else
 *   `instrumentRegistry`     — pip size, for the pip/point-denominated outputs
 *
 * ── NO-LOOKAHEAD CONTRACT ─────────────────────────────────────────────────────
 * Sigma is fit on days strictly before today (`forecastSigma(d1.slice(0, i))`).
 * Session-volatility trailing medians use PRIOR sessions of the SAME type only.
 * VuManChu/VWAP/confluence reads are already causal (confluenceFeatures.js).
 * The "same reading recurred last visit" check compares to a PRIOR touch only.
 *
 * Pure: no network, no I/O. Callers supply packed M1 + sessions.
 */

import { bucketM1IntoSessions } from './forecastAnalyser.js';
import { buildLadder } from './forecastLadder.js';
import { LADDER_PARAMS } from './forecastLadderParams.js';
import { forecastSigma } from './forecastSigma.js';
import { createHtfContext, createConfluenceFeatures } from './confluenceFeatures.js';
import { sessionConfluenceLevels, DAILY_CONFLUENCE_SOURCES } from './rangeLineAnalyser.js';
import { pipSize } from './instrumentRegistry.js';

export const RUNGS = ['p50', 'p75', 'p90'];
export const SIDES = ['up', 'down'];   // up = O-H rungs, down = O-L rungs

// ── Session classification — SAME boundaries as forecastAnalyser.classifySession,
// re-derived here (not imported — it's private there) so this module can also
// build a per-session REALIZED-RANGE series, which that function doesn't do.
export const SESSION_BOUNDS = { Asia: [22, 7], London: [7, 13], NY: [13, 22] };
function sessionOf(hourUtc) {
  if (hourUtc >= 22 || hourUtc < 7) return 'Asia';
  if (hourUtc < 13) return 'London';
  return 'NY';
}
function dowOf(dateStr) { return new Date(dateStr + 'T00:00:00Z').getUTCDay(); }

// ── Session-level realized range series (NEW — not in any existing engine) ───
// For each session-date, the high-low range of EACH of the three sessions
// (Asia/London/NY), keyed as `${date}|${sessionName}`. Built once per pair from
// the packed M1, independent of which rung/touch is being analysed.
export function sessionRangeSeries(packed) {
  const { n, times, highs, lows } = packed;
  const out = new Map();   // key -> { hi, lo, range, t0 }
  for (let i = 0; i < n; i++) {
    const t = times[i], d = new Date(t * 1000);
    const h = d.getUTCHours();
    const sess = sessionOf(h);
    // Session date: Asia (22:00-07:00) is keyed to the date it STARTS on, so it
    // groups with the London/NY of the SAME trading day that follows it —
    // matching bucketM1IntoSessions' own day convention.
    const dayD = new Date(t * 1000);
    if (sess === 'Asia' && h < 7) dayD.setUTCDate(dayD.getUTCDate() - 1);
    const date = dayD.toISOString().slice(0, 10);
    const key = `${date}|${sess}`;
    const cur = out.get(key);
    if (!cur) out.set(key, { hi: highs[i], lo: lows[i], range: 0, t0: t });
    else { if (highs[i] > cur.hi) cur.hi = highs[i]; if (lows[i] < cur.lo) cur.lo = lows[i]; }
  }
  for (const v of out.values()) v.range = v.hi - v.lo;
  return out;
}

// First touch time of each rung on one side — a single pass, independent of any
// re-arm definition (the FIRST touch of a rung happens at the same bar no matter
// how re-arming is later defined). Powers `otherSideTouchedBefore` without a
// second ordinal-tracking walk.
function firstTouchTimes(bars, lv, isUp) {
  const out = { p50: null, p75: null, p90: null };
  for (let ri = 0; ri < RUNGS.length; ri++) {
    const target = lv[ri + 1];
    for (const bar of bars) {
      const px = isUp ? bar.high : bar.low;
      if (isUp ? px >= target : px <= target) { out[RUNGS[ri]] = bar.time; break; }
    }
  }
  return out;
}

// Causal trailing median of a session's OWN range history (same session type
// only — Asia vs Asia, never Asia vs London), `lookback` prior occurrences.
export function sessionVolBucket(rangeMap, date, sessName, priorDates, lookback = 20) {
  const hist = [];
  for (let k = priorDates.length - 1; k >= 0 && hist.length < lookback; k--) {
    const v = rangeMap.get(`${priorDates[k]}|${sessName}`);
    if (v && v.range > 0) hist.push(v.range);
  }
  if (hist.length < 8) return null;
  const sorted = [...hist].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const today = rangeMap.get(`${date}|${sessName}`);
  if (!today || !(med > 0)) return null;
  const r = today.range / med;
  return { bucket: r < 0.7 ? '1·quiet' : r > 1.4 ? '3·wild' : '2·normal', ratio: +r.toFixed(2), range: today.range };
}

// ── Ordinal test tracking, swept at multiple re-arm distances ────────────────
// "1st test / 2nd test / 3rd+" needs a definition of when a touch counts as a
// NEW test rather than the same wobble re-counted. `rearmFracs` sweeps that
// choice (as a fraction of the rung's own distance from its inner neighbour)
// instead of hard-coding one guess.
export const REARM_FRACS = [0.15, 0.30, 0.50];

/**
 * Walk one instrument's full history and emit one record per touch of every
 * rung, on every side, at every re-arm definition.
 *
 *   atlasWalk(packed, { instrument, assetClass })
 *     -> { touches: [...], sessionMeta: { pair, coverage } }
 *
 * A "touch" record's outward/backward outcome is a genuine race between the
 * REAL neighbouring lines (open for p50, the previous rung for p75/p90; the
 * next rung out, or session-close for p90) — see the module docstring for why
 * this is NOT subject to the "unequal rung spacing" caveat that applies to
 * comparing raw revert-RATES across rungs: this walks the actual distances.
 */
export function atlasWalk(packed, { instrument, assetClass = 'fx', rearmFracs = REARM_FRACS,
                                     minLookback = 60, htfMinBars, structural = true, confLookback = 5,
                                     ivByDate = null, pendingRearmFrac = null, liveWindowDays = null } = {}) {
  const sym = String(instrument).toUpperCase();
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const dates = [...sessions.keys()].sort().filter(d => (sessions.get(d)?.length ?? 0) >= 200);
  if (dates.length <= minLookback) return { touches: [], coverage: null };
  // `liveWindowDays` — everything in the per-day context block (sigma,
  // dayVol, ivRegime, confLevels, htf features) only ever reads a BOUNDED
  // trailing window regardless of how much MORE history precedes it —
  // forecastSigma/sessionConfluenceLevels are rolling-window functions that
  // read the tail of whatever's handed to them, never the full series (the
  // widest lookback anywhere in the stack is swing_fib's 60 trading days).
  // So replaying only the last N days (default 90 — comfortable margin over
  // that 60) instead of the FULL history reproduces IDENTICAL context for
  // those N days, at a fraction of the cost: the 40-80s/instrument the full
  // book-rebuild costs is spent almost entirely on redoing this same per-day
  // work ~2700 times, not on any single day being expensive. This is what
  // makes a live, pollable-every-few-seconds context check possible without
  // a second implementation of any of the math.
  // ONE real, bounded, DOCUMENTED approximation: `lastVisit`-derived fields
  // (`prevOutcomeCrossDay`, `rollingRate`, `wtStateRepeated`) reference the
  // last ≤5 visits to a rung/side, found by replay — if a rung's last visit
  // was further back than the window, those fields read null/thin here where
  // a full walk would find it. Acceptable: `prevOutcomeCrossDay` was already
  // found to hold no OOS effect on its own (see the field's own comment) —
  // it never survives into a book finding regardless — and same-day fields
  // (the ones that DO hold) are always fully correct since "today" itself is
  // always inside the window.
  const startIdx = liveWindowDays != null ? Math.max(minLookback, dates.length - liveWindowDays) : minLookback;

  const d1 = dates.map(d => {
    const b = sessions.get(d); let hi = -Infinity, lo = Infinity;
    for (const x of b) { if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low; }
    return { date: d, open: b[0].open, high: hi, low: lo, close: b[b.length - 1].close };
  });
  const est = LADDER_PARAMS.pairs?.[sym]?.estimator ?? LADDER_PARAMS.classDefaults?.[assetClass]?.estimator ?? 'yz_30';

  let pip = 1; try { pip = pipSize(instrument) || 1; } catch { /* unknown symbol → raw price units */ }

  const rangeMap = sessionRangeSeries(packed);
  const htf = createHtfContext(packed, htfMinBars ? { minHtfBars: htfMinBars } : {});
  const tf = createConfluenceFeatures({ htf });
  const wt1Cache = new Map();   // date -> session M1 WaveTrend series (causal EMA, computed once)

  // Rolling "last N visits to this exact rung/side" outcome + conditioning
  // reading — powers BOTH the empirical repeat-rate and the VuManChu
  // repeatability check. Keyed by `${side}|${rung}`.
  const lastVisit = {};

  const touches = [];
  const pending = [];
  for (let i = startIdx; i < dates.length; i++) {
    const date = dates[i];
    const bars = sessions.get(date);
    const open = bars[0].open;
    let sigma = 0;
    try { sigma = forecastSigma(d1.slice(0, i), est); } catch { continue; }
    if (!(sigma > 0)) continue;
    const lad = buildLadder(sigma, { instrument: sym, assetClass, horizon: 'daily', eventTag: 'none' });
    if (!lad?.oh?.p90 || !lad?.ol?.p90) continue;

    // Yesterday's CLOSE location relative to ITS OWN forecast bands — an
    // "exhaustion carried over" read. Zero lookahead risk: yesterday is fully
    // complete before today opens, unlike every other same-day feature here.
    // Distinct from `gapBucket` (which reads the OPEN gap, i.e. where price
    // jumped to) — this reads where yesterday actually FINISHED relative to
    // what was forecast for it.
    const prevCloseLoc = (() => {
      if (i < 1) return null;
      let ySigma; try { ySigma = forecastSigma(d1.slice(0, i - 1), est); } catch { return null; }
      if (!(ySigma > 0)) return null;
      const yLad = buildLadder(ySigma, { instrument: sym, assetClass, horizon: 'daily', eventTag: 'none' });
      if (!yLad?.oh?.p75 || !yLad?.ol?.p75) return null;
      const yOpen = d1[i - 1].open, yClose = d1[i - 1].close;
      if (!(yOpen > 0)) return null;
      const moveFrac = (yClose - yOpen) / yOpen * 100;   // signed, % of price
      if (moveFrac >= 0) {
        return moveFrac >= yLad.oh.p75 ? '3·beyond-p75-up' : moveFrac >= yLad.oh.p50 ? '2·beyond-p50-up' : '1·inside';
      }
      return -moveFrac >= yLad.ol.p75 ? '3·beyond-p75-dn' : -moveFrac >= yLad.ol.p50 ? '2·beyond-p50-dn' : '1·inside';
    })();

    const dow = dowOf(date);
    const priorDates = dates.slice(0, i);
    // dayVol is the FORECAST vol regime — today's fitted σ (already fit on data
    // strictly before today) vs σ's own trailing history. Deliberately NOT the
    // day's realized high-low range: that isn't known until the session ends, so
    // labelling a 09:00 touch with the WHOLE day's eventual range would tag the
    // present with the future — a quiet-looking day almost tautologically didn't
    // extend far AFTER an early touch, which is circularity, not a finding.
    const dayVol = (() => {
      const hist = []; for (let k = Math.max(0, i - 20); k < i; k++) { try { const s = forecastSigma(d1.slice(0, k), est); if (s > 0) hist.push(s); } catch {} }
      if (hist.length < 8) return null;
      const sorted = [...hist].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
      if (!(med > 0)) return null;
      const r = sigma / med;
      return r < 0.85 ? '1·quiet' : r > 1.25 ? '3·heavy' : '2·normal';
    })();
    // asiaVol/londonVol are likewise ONLY valid as context for a touch that
    // happens AFTER that session has fully closed — a touch occurring INSIDE
    // Asia cannot be labelled by Asia's own (not-yet-complete) range without the
    // same lookahead. Computed once per day; nulled per-touch below by session.
    const asiaVolCandidate   = sessionVolBucket(rangeMap, date, 'Asia',   priorDates);
    const londonVolCandidate = sessionVolBucket(rangeMap, date, 'London', priorDates);

    let wt1 = wt1Cache.get(date);
    if (!wt1) { wt1 = tf.wtSeries(bars); wt1Cache.set(date, wt1); }

    // Structural confluence for THIS session: daily sources only (pivots, prior
    // hilo, volume profile, swing S&R, round number), from completed prior days
    // — the SAME builder + tolerance the range-line book was validated on
    // (rangeLineAnalyser.sessionConfluenceLevels), never a second copy. Intraday
    // fib/VWAP sources are added at the touch itself inside confluenceFeatures.
    let confLevels = null;
    if (structural) {
      let intraday = [];
      for (let j = Math.max(0, i - confLookback); j < i; j++) { const pb = sessions.get(dates[j]); if (pb) intraday = intraday.concat(pb); }
      confLevels = sessionConfluenceLevels({ dailyBars: d1.slice(0, i), intraday, pip, price: open,
        sources: DAILY_CONFLUENCE_SOURCES, fib15: false });
    }

    // Session length (for the "time remaining" control) and gap-from-prior-close
    // in σ units — same convention as forecastAnalyser's own gapBucket, so the
    // two engines can't silently disagree about what "gap-up" means.
    //
    // FIXED at 1440 (a calendar day), NOT derived from `bars[bars.length-1].time
    // - bars[0].time`. That was a real bug: on a COMPLETE historical day the two
    // happen to coincide, but it silently depends on however much data happens
    // to be loaded — wrong on any early-closed session (a holiday-shortened
    // Friday) and, critically, wrong on a LIVE/in-progress day (atlasLiveToday),
    // where "how many bars we have so far" has nothing to do with the session's
    // actual length. sessionPos only needs a coarse tercile, so the ~2
    // DST-transition days/year (session ±60min) are an acceptable, documented
    // approximation — the alternative is duplicating forecastAnalyser.js's
    // private DST-boundary helpers for a rounding-level gain.
    const sessionSpanMins = 1440;
    const prevClose = i > 0 ? d1[i - 1].close : open;
    const gapSig = (sigma > 0 && prevClose > 0) ? (open - prevClose) / prevClose / sigma : 0;
    const gapBucket = Math.abs(gapSig) < 0.25 ? 'flat' : gapSig > 0 ? 'gap-up' : 'gap-down';

    // ── CVOL (CME's implied-vol settle) — the one FORWARD-LOOKING signal here,
    // everything else in this engine is realized. `ivByDate` is keyed by date
    // and is an EOD settle, so the causally correct read for a touch on day i
    // is YESTERDAY's settle (dates[i-1]) — the settle for TODAY isn't published
    // until today's own close, same one-day lag discipline as `dayVol`/
    // `prevCloseLoc`. `ivByDate` may be null (no CVOL coverage for this
    // instrument) — every downstream field then stays null, never thrown.
    const ivYesterday = (ivByDate && i > 0) ? ivByDate.get(dates[i - 1]) : null;
    const ivRegime = (() => {
      if (!ivByDate || !ivYesterday) return null;
      const hist = [];
      for (let k = Math.max(0, i - 21); k < i; k++) { const v = ivByDate.get(dates[k])?.cvol; if (v > 0) hist.push(v); }
      if (hist.length < 8) return null;
      const sorted = [...hist].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
      if (!(med > 0)) return null;
      const r = ivYesterday.cvol / med;
      return r < 0.85 ? '1·iv-low' : r > 1.25 ? '3·iv-high' : '2·iv-normal';
    })();
    // Variance risk premium proxy: implied (cvol, already annualized-%) vs the
    // SAME day's own realized-vol forecast (sigma, annualized the same way the
    // live forecaster does — sigma*sqrt(252)*100). >1 = market pricing MORE
    // movement than has actually been realized recently (IV rich); <1 = cheap.
    const vrp = (() => {
      if (!ivYesterday || !(sigma > 0)) return null;
      const realizedAnnualPct = sigma * Math.sqrt(252) * 100;
      if (!(realizedAnnualPct > 0)) return null;
      const r = ivYesterday.cvol / realizedAnnualPct;
      return r < 0.9 ? '1·iv-cheap' : r > 1.3 ? '3·iv-rich' : '2·fair';
    })();

    // Ladder levels + first-touch times for BOTH sides, computed once per day
    // (rung-first-touch is re-arm-independent) — powers `otherSideTouchedBefore`
    // without a second ordinal-tracking walk, and lets the main loop below just
    // read `lvBySide[side]` instead of recomputing it per re-arm iteration.
    const lvBySide = {}, firstTouchBySide = {};
    for (const s of SIDES) {
      const isU = s === 'up';
      const q2 = isU ? lad.oh : lad.ol;
      if (!(q2.p50 && q2.p75 && q2.p90)) continue;
      const sg = isU ? 1 : -1;
      lvBySide[s] = [open, ...RUNGS.map(r => open * (1 + sg * q2[r] / 100))];
      firstTouchBySide[s] = firstTouchTimes(bars, lvBySide[s], isU);
    }

    for (const side of SIDES) {
      const isUp = side === 'up';
      const lv = lvBySide[side]; if (!lv) continue;
      const sgn = isUp ? 1 : -1;
      const reach = (px, target) => (isUp ? px >= target : px <= target);
      const otherSide = isUp ? 'down' : 'up';

      for (const rearmFrac of rearmFracs) {
        for (let ri = 0; ri < RUNGS.length; ri++) {
          const rung = RUNGS[ri];
          const here = lv[ri + 1], inner = lv[ri], outer = lv[ri + 2] ?? null;
          const rungSpan = Math.abs(here - inner);
          const rearmDist = rearmFrac * rungSpan;

          // Walk the session tracking re-arm state, so every genuinely distinct
          // test of THIS rung at THIS re-arm definition gets its own record.
          // runHi/runLo track the RUNNING range up to and including bar k — O(1)
          // per bar, incremental — feeding the churn read below (was previously
          // only in a throwaway probe script; promoted here because it produced
          // the single largest effect measured this session: one-sided travel to
          // a level ran 1.2-1.8x a speed-matched base, two-sided travel to the
          // SAME distance ran 0.16-0.43x — opposite signs, same speed).
          let armed = true, ordinal = 0, runHi = bars[0].high, runLo = bars[0].low;
          for (let k = 0; k < bars.length; k++) {
            const bar = bars[k];
            if (bar.high > runHi) runHi = bar.high;
            if (bar.low  < runLo) runLo = bar.low;
            const px = isUp ? bar.high : bar.low;
            if (!armed) {
              const away = isUp ? (here - bar.close) : (bar.close - here);
              if (away >= rearmDist) armed = true;
              continue;
            }
            if (!reach(px, here)) continue;
            ordinal++;
            armed = false;

            // ── Outcome: race the two REAL neighbours from this touch ────────
            let outcome = 'neither', deepest = here, resolveTime = null, resolveIdx = null, extreme = here;
            for (let j = k; j < bars.length; j++) {
              const b2 = bars[j];
              const fwd = isUp ? b2.high : b2.low, bwd = isUp ? b2.low : b2.high;
              if (isUp ? bwd < deepest : bwd > deepest) deepest = bwd;
              if (isUp ? fwd > extreme : fwd < extreme) extreme = fwd;
              if (outer != null && reach(fwd, outer)) { outcome = 'out'; resolveTime = b2.time; resolveIdx = j; break; }
              if (isUp ? bwd <= inner : bwd >= inner) { outcome = 'back'; resolveTime = b2.time; resolveIdx = j; break; }
            }
            const pullbackFrac = rungSpan > 0 ? Math.min(1, Math.abs(here - deepest) / rungSpan) : null;
            const fadePips = (here - deepest) / pip * sgn * -1;   // +ve = gave back distance from the touch
            const runPips  = (extreme - here) / pip * sgn;        // +ve = extended further past the touch
            const minsToResolve = resolveTime != null ? (resolveTime - bar.time) / 60 : null;
            const minsIntoSession = (bar.time - bars[0].time) / 60;
            // Same fix as sessionSpanMins above, same bug shape: must be
            // relative to the CALENDAR session end, not `bars[bars.length-1]`
            // (which is "now" on a live/truncated day, not the real close).
            const minsRemaining = sessionSpanMins - (bar.time - bars[0].time) / 60;
            const sessionFrac = sessionSpanMins > 0 ? minsIntoSession / sessionSpanMins : null;
            const sessionPos = sessionFrac == null ? null : sessionFrac < 0.33 ? '1·early' : sessionFrac < 0.67 ? '2·mid' : '3·late';

            // Churn at the moment of touch: how much of the running range up to
            // NOW was covered one-sidedly (toward this touch) vs both ways.
            // Causal by construction — runHi/runLo include bar k, nothing later.
            const totalTravel = runHi - runLo;
            const dirTravel = isUp ? (runHi - open) : (open - runLo);
            const churnRatio = totalTravel > 0 ? Math.min(1, Math.max(0, dirTravel / totalTravel)) : null;
            const churn = churnRatio == null ? null : churnRatio >= 0.80 ? '3·driven' : churnRatio >= 0.55 ? '2·mixed' : '1·churned';

            // Options-market directional lean (CVOL skew), oriented to the
            // touch: positive skew = upside implied vol priced richer than
            // downside (the market hedging/pricing MORE upside movement), so
            // for an UP touch that is "with"; for a DOWN touch it's "against".
            // Same 1-day settle lag as ivRegime/vrp above.
            const ivSkewDir = (() => {
              if (!ivYesterday || !Number.isFinite(ivYesterday.skew)) return null;
              const oriented = isUp ? ivYesterday.skew : -ivYesterday.skew;
              return Math.abs(oriented) < 0.15 ? '2·neutral' : oriented > 0 ? '3·with' : '1·against';
            })();

            // ── At-the-moment conditioning (reuses touchFeatures via confluenceFeatures) ──
            const feats = tf.compute({ bars, touchIdx: k, open, sigma, side: isUp ? 'up' : 'dn', wt1, level: here, pip, confLevels });

            const key = `${side}|${rung}|${rearmFrac}`;
            const hist = lastVisit[key] ?? [];
            const prev = hist.at(-1) ?? null;
            const daysSincePrevN = prev ? (i - prev.dayIdx) : null;
            const touchSession = sessionOf(new Date(bar.time * 1000).getUTCHours());
            // Only expose a session's volatility bucket to a touch that happens
            // AFTER that session closed — Asia is closed by London/NY, London by
            // NY only; a touch inside a session can't see that session's own
            // (still-incomplete) range.
            const asiaVolSafe   = (touchSession === 'London' || touchSession === 'NY') ? asiaVolCandidate?.bucket ?? null : null;
            const londonVolSafe = (touchSession === 'NY') ? londonVolCandidate?.bucket ?? null : null;
            // Has the OPPOSITE side of this SAME rung already been tagged today,
            // strictly before this bar? (re-arm-independent first-touch times,
            // precomputed once per day above — a genuine two-way-day flag).
            const otherFirst = firstTouchBySide[otherSide]?.[rung] ?? null;
            const otherSideTouchedBefore = otherFirst != null ? (otherFirst < bar.time) : false;
            // Rolling empirical base rate over the last ≤5 PRIOR visits to this
            // exact (side, rung, re-arm) — the "have we seen this before, and how
            // often did it go this way" read, distinct from the single-prior-visit
            // repeatability check below. Requires ≥3 prior visits to report.
            const rollOut = hist.filter(h => h.outcome === 'out').length;
            const rollBack = hist.filter(h => h.outcome === 'back').length;
            const rollingRate = hist.length >= 3
              ? { n: hist.length, outPct: +(rollOut / hist.length * 100).toFixed(0), backPct: +(rollBack / hist.length * 100).toFixed(0) }
              : null;
            const record = {
              instrument: sym, assetClass, date, side, rung, rearmFrac, ordinal,
              hourUtc: new Date(bar.time * 1000).getUTCHours(),
              minute: new Date(bar.time * 1000).getUTCMinutes(),
              minsIntoSession: +minsIntoSession.toFixed(0),
              minsRemaining: +minsRemaining.toFixed(0),
              sessionPos,
              session: touchSession,
              dowSession: `${dow}|${touchSession}`,
              dow,
              gapBucket, gapSig: +gapSig.toFixed(3),
              dayVol, asiaVol: asiaVolSafe, londonVol: londonVolSafe,
              churn, churnRatio: churnRatio != null ? +churnRatio.toFixed(3) : null,
              otherSideTouchedBefore,
              level: +here.toFixed(6), pip,
              outcome, resolveIdx,
              minsToResolve: minsToResolve != null ? +minsToResolve.toFixed(0) : null,
              pullbackFrac: pullbackFrac != null ? +pullbackFrac.toFixed(3) : null,
              fadePips: +fadePips.toFixed(1), runPips: +runPips.toFixed(1),
              approachVel: feats.approachVel?.bucket ?? null,
              approachER: feats.approachER?.bucket ?? null,
              wtState: feats.wtState?.bucket ?? null,
              wtMtf: feats.wtMtf?.bucket ?? null,
              wtSlow: feats.wtSlow?.bucket ?? null,
              vwapSide: feats.vwapSide?.bucket ?? null,
              momAdx: feats.momAdx?.bucket ?? null,
              confluence: feats.confluence?.bucket ?? null,
              candleReject: feats.candleReject?.bucket ?? null,
              // 4h EMA slope vs the touch direction — already built in
              // confluenceFeatures.js, never wired into a touch record before.
              // NOT the same as the daily EMA-slope `classifyRegime` used
              // elsewhere on the site (tested null on this book) — this reads
              // a faster, intraday-updating timeframe, closer to what a trader
              // means by "HTF bias right now" than a once-daily label.
              htfTrend: feats.htfTrend?.bucket ?? null,
              // Two of touchFeatures' original six were computed by `feats`
              // above the whole time but never read into the record — a
              // straight oversight, fixed here. volClimax: touch-bar tick
              // volume vs its own trailing average (a spike = exhaustion
              // signature). roundNum: distance of the LEVEL ITSELF to the
              // nearest round number (Osler 2000/2003 — reversals cluster at
              // round numbers because resting orders cluster there).
              volClimax: feats.volClimax?.bucket ?? null,
              roundNum: feats.roundNum?.bucket ?? null,
              prevCloseLoc,
              ivRegime, vrp, ivSkewDir,
              // London/NY overlap (12:00-16:00 UTC) is the deepest-liquidity
              // window in FX and has a distinct character from either session
              // alone — a genuinely different cut than the 3-way Asia/London/NY
              // split, cheap to add since hourUtc was already computed.
              overlapWindow: (new Date(bar.time * 1000).getUTCHours() >= 12 && new Date(bar.time * 1000).getUTCHours() < 16),
              // ── Repeatability: how does THIS visit compare to the LAST visit
              // to this exact rung/side/re-arm? (prior touch only — no lookahead)
              prevOutcome: prev?.outcome ?? null,
              prevWtState: prev?.wtState ?? null,
              wtStateRepeated: (prev?.wtState != null && feats.wtState?.bucket != null) ? (prev.wtState === feats.wtState.bucket) : null,
              outcomeRepeated: (prev?.outcome != null) ? (prev.outcome === outcome) : null,
              daysSincePrev: daysSincePrevN,
              // `prevOutcome` alone conflates two very different mechanisms and
              // was found (2026-08) to be actively misleading if reported as one
              // dimension: a SAME-DAY re-arm repeat and a CROSS-DAY visit weeks
              // apart are not comparable, and the same-day 'neither' bucket is
              // not even a real pattern — if the earlier touch's own forward
              // scan already ran to session-end without hitting either barrier,
              // a LATER same-day touch has strictly less remaining time and by
              // definition also cannot have hit the outer barrier; reporting
              // "same-day prevOutcome=neither ⇒ 0% continues" is close to a
              // mathematical certainty of the outcome definition, not a finding.
              // Split here so the report layer can never re-conflate them:
              //   prevOutcomeSameDay  — same-session re-arm repeat, 'neither'
              //                         excluded. Found to be the single
              //                         cleanest effect in the book: a session's
              //                         trending-vs-stuck character persists
              //                         through a same-day retest (holds OOS on
              //                         every rung/side, EURUSD 2026-08).
              //   prevOutcomeCrossDay — a genuinely separate day's prior visit.
              //                         Found to carry ~nothing (EURUSD 2026-08)
              //                         — no cross-day "level memory" detected.
              prevOutcomeSameDay: (daysSincePrevN === 0 && prev.outcome !== 'neither') ? prev.outcome : null,
              prevOutcomeCrossDay: (daysSincePrevN > 0) ? prev.outcome : null,
              rollingRate,
            };
            touches.push(record);
            lastVisit[key] = [...hist, { outcome, wtState: feats.wtState?.bucket ?? null, dayIdx: i }].slice(-5);
          }
        }
      }
    }

    // ── "Pending" snapshot — rungs NOT YET touched today, so a live view can
    // show "if price reaches here next, history says X" BEFORE it happens, not
    // just after. Deliberately reuses every context input already computed
    // above for this day (sigma, dayVol, ivRegime, confLevels, lvBySide,
    // firstTouchBySide) rather than recomputing anything a second way — the
    // whole point is these are the SAME numbers the book itself was built
    // from, or matchLiveContext would be comparing apples to oranges. Only
    // meaningful — and only computed — on the LAST day of whatever history was
    // supplied (the live/in-progress day); every earlier day is fully resolved
    // by definition, so "pending" wouldn't mean anything there.
    if (pendingRearmFrac != null && i === dates.length - 1) {
      const bar = bars[bars.length - 1];
      for (const side of SIDES) {
        const isUp = side === 'up';
        const lv = lvBySide[side]; if (!lv) continue;
        const otherSide = isUp ? 'down' : 'up';
        for (let ri = 0; ri < RUNGS.length; ri++) {
          const rung = RUNGS[ri];
          // Rearm-independent: a rung already touched at least once today
          // (even if since resolved and re-armed) already has a real record
          // — showing a synthetic "pending" alongside it would just be
          // confusing, so pending is only for a rung untouched all day.
          if (firstTouchBySide[side]?.[rung] != null) continue;
          const here = lv[ri + 1];

          const totalTravel = d1[i].high - d1[i].low;
          const dirTravel = isUp ? (d1[i].high - open) : (open - d1[i].low);
          const churnRatio = totalTravel > 0 ? Math.min(1, Math.max(0, dirTravel / totalTravel)) : null;
          const churn = churnRatio == null ? null : churnRatio >= 0.80 ? '3·driven' : churnRatio >= 0.55 ? '2·mixed' : '1·churned';
          const feats = tf.compute({ bars, touchIdx: bars.length - 1, open, sigma, side: isUp ? 'up' : 'dn', wt1, level: here, pip, confLevels });
          const minsIntoSession = (bar.time - bars[0].time) / 60;
          const minsRemaining = sessionSpanMins - minsIntoSession;
          const sessionFrac = sessionSpanMins > 0 ? minsIntoSession / sessionSpanMins : null;
          const sessionPos = sessionFrac == null ? null : sessionFrac < 0.33 ? '1·early' : sessionFrac < 0.67 ? '2·mid' : '3·late';
          const touchSession = sessionOf(new Date(bar.time * 1000).getUTCHours());
          const asiaVolSafe   = (touchSession === 'London' || touchSession === 'NY') ? asiaVolCandidate?.bucket ?? null : null;
          const londonVolSafe = (touchSession === 'NY') ? londonVolCandidate?.bucket ?? null : null;
          const otherFirst = firstTouchBySide[otherSide]?.[rung] ?? null;
          const otherSideTouchedBefore = otherFirst != null ? (otherFirst < bar.time) : false;
          const ivSkewDir = (() => {
            if (!ivYesterday || !Number.isFinite(ivYesterday.skew)) return null;
            const oriented = isUp ? ivYesterday.skew : -ivYesterday.skew;
            return Math.abs(oriented) < 0.15 ? '2·neutral' : oriented > 0 ? '3·with' : '1·against';
          })();
          const key = `${side}|${rung}|${pendingRearmFrac}`;
          const hist = lastVisit[key] ?? [];
          const prev = hist.at(-1) ?? null;
          const daysSincePrevN = prev ? (i - prev.dayIdx) : null;
          const rollOut = hist.filter(h => h.outcome === 'out').length;
          const rollBack = hist.filter(h => h.outcome === 'back').length;
          const rollingRate = hist.length >= 3
            ? { n: hist.length, outPct: +(rollOut / hist.length * 100).toFixed(0), backPct: +(rollBack / hist.length * 100).toFixed(0) }
            : null;
          const dist = Math.abs(bar.close - here);

          pending.push({
            instrument: sym, assetClass, date, side, rung, rearmFrac: pendingRearmFrac,
            pending: true, ordinal: 1,
            hourUtc: new Date(bar.time * 1000).getUTCHours(),
            minute: new Date(bar.time * 1000).getUTCMinutes(),
            minsIntoSession: +minsIntoSession.toFixed(0),
            minsRemaining: +minsRemaining.toFixed(0),
            sessionPos, session: touchSession,
            dowSession: `${dow}|${touchSession}`, dow,
            gapBucket, gapSig: +gapSig.toFixed(3),
            dayVol, asiaVol: asiaVolSafe, londonVol: londonVolSafe,
            churn, churnRatio: churnRatio != null ? +churnRatio.toFixed(3) : null,
            otherSideTouchedBefore,
            level: +here.toFixed(6), pip,
            distance: +dist.toFixed(6), distancePips: +(dist / pip).toFixed(1),
            distancePct: bar.close > 0 ? +(dist / bar.close * 100).toFixed(3) : null,
            currentPrice: +bar.close.toFixed(6),
            approachVel: feats.approachVel?.bucket ?? null,
            approachER: feats.approachER?.bucket ?? null,
            wtState: feats.wtState?.bucket ?? null,
            wtMtf: feats.wtMtf?.bucket ?? null,
            wtSlow: feats.wtSlow?.bucket ?? null,
            vwapSide: feats.vwapSide?.bucket ?? null,
            momAdx: feats.momAdx?.bucket ?? null,
            confluence: feats.confluence?.bucket ?? null,
            candleReject: feats.candleReject?.bucket ?? null,
            htfTrend: feats.htfTrend?.bucket ?? null,
            volClimax: feats.volClimax?.bucket ?? null,
            roundNum: feats.roundNum?.bucket ?? null,
            prevCloseLoc, ivRegime, vrp, ivSkewDir,
            overlapWindow: (new Date(bar.time * 1000).getUTCHours() >= 12 && new Date(bar.time * 1000).getUTCHours() < 16),
            prevOutcome: prev?.outcome ?? null,
            prevOutcomeSameDay: (daysSincePrevN === 0 && prev?.outcome !== 'neither') ? prev.outcome : null,
            prevOutcomeCrossDay: (daysSincePrevN > 0) ? prev.outcome : null,
            rollingRate,
          });
        }
      }
    }
  }
  return { touches, pending, coverage: { from: dates[minLookback], to: dates.at(-1), sessions: dates.length, estimator: est } };
}

/**
 * Live snapshot — today's touches-so-far, with full context, no resolution.
 *
 * ── THE KEY INSIGHT: A LIVE TOUCH IS JUST outcome:'neither' WITH MORE BARS TO
 * COME ─────────────────────────────────────────────────────────────────────
 * `atlasWalk`'s outcome-resolution loop (`for j = k; j < bars.length; j++`)
 * already produces the CORRECT answer for an in-progress session: if `bars`
 * for today ends at "now" instead of end-of-day, the loop simply runs out of
 * bars before finding either barrier and returns `outcome: 'neither',
 * resolveIdx: null` — which is EXACTLY the right state for "hasn't resolved
 * YET". So this function does NOT re-implement touch detection, context
 * computation, or the ordinal/re-arm walk — it calls `atlasWalk` on the SAME
 * packed M1 (the caller is responsible for ensuring it ends at "now", not at
 * a stale end-of-day) and returns only today's touches. One second-order
 * consequence, not a bug: if today already had an earlier touch of the SAME
 * rung that genuinely hasn't resolved yet (because the session just hasn't
 * finished, not because it definitely won't), a LATER touch that same day
 * will see `prevOutcome: 'neither'` from it — indistinguishable from a truly
 * unresolved historical day. That ambiguity is inherent to live analysis
 * (the honest state really is "don't know yet"), not something a bespoke
 * live-only implementation would avoid either.
 *
 * ── COST NOTE — this is NOT a fast per-page-load path ────────────────────────
 * Reusing `atlasWalk` means this walks the FULL supplied history (however
 * many years of M1 the caller passed in), same cost as a historical run just
 * with `rearmFracs` narrowed to one definition. Callers should run this
 * periodically (a scheduled job, same async-job pattern as the historical
 * `/run` route) and cache the result — never call it synchronously per page
 * view. See `js/levelAtlasRoutes.js`.
 *
 *   atlasLiveToday(packed, { instrument, assetClass, ivByDate })
 *     -> { touches: [...today's in-progress touches, rearmFrac 0.3 only],
 *          date, coverage }
 */
export function atlasLiveToday(packed, opts = {}) {
  const { touches, pending, coverage } = atlasWalk(packed, { ...opts, rearmFracs: [opts.rearmFrac ?? 0.3] });
  const lastDate = coverage?.to ?? null;
  const today = lastDate ? touches.filter(t => t.date === lastDate) : [];
  return { touches: today, pending: pending ?? [], date: lastDate, coverage };
}
