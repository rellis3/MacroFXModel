/**
 * Exhaustion Ladder — the LAYERED exhaustion measurement.
 *
 * The vol forecast gives the day's RANGE (how far price travels: C×σ). `exhaustionForecastEngine`
 * gives ONE fade-back constant per instrument. Both collapse the day to a single number. But a
 * day has several turns, and they are not interchangeable: the first pivot of the session is a
 * different animal from the third, an up-turn on a trend-lean day is not the mirror of the
 * down-turn, and a turn at the London open is not a turn at the NY afternoon.
 *
 * This engine keeps the layers instead of averaging them away.
 *
 * ── The two distances (kept separate, because they answer different questions) ───────────────
 *
 *   extSig  = (turn price − open) / open / σ      "how far from the OPEN did the turn happen"
 *   runSig  = (turn price − prior opposite extreme) / open / σ
 *                                                 "how far did the LEG run before it turned"
 *
 * `exhaustionForecastEngine` measures runSig only. That is a distance from the running extreme,
 * so it cannot be drawn until an extreme exists — it is a trailing line, not a level.
 * **extSig is anchored to the session open, which is known at 00:00, so extSig × σ × open IS a
 * midnight-drawable price.** That is what makes this engine a level forecaster and the old one
 * a state estimator. Both are emitted; only extSig produces `levels`.
 *
 * ── The four layers ─────────────────────────────────────────────────────────────────────────
 *   1. MAGNITUDE — p25/p50/p75/p90 of extSig, not just the median. The "median and 75th
 *      exhaustion" the range bands were never measuring.
 *   2. ORDINAL   — turn 1, turn 2, turn 3+ each get their own ladder.
 *   3. SIDE      — up-turns and down-turns fitted separately (the old engine pools them).
 *   4. SESSION   — asia / london / ny bucket of the turn, by London wall-clock minute.
 *
 * ── The hazard curve (the intraday readout, not a level) ────────────────────────────────────
 * A ladder answers "where might the turn be" at 00:00. It cannot answer "is THIS the turn" at
 * 13:00, because by then you are mid-run and the ladder has no notion of elapsed state. So we
 * also fit a hazard: at a fresh running extreme extended x σ from the open, place barriers at
 * ±θσ and race them over the next H minutes. P(reversal hit first) is the hazard at x.
 *
 * This is deliberately the SAME two-barrier primitive as the Phase-0 study in
 * `volatilityExhaustion/measure_extremes.py` — the one measurement in that whole body of work
 * that replicated 6/6 FX majors out-of-sample. Its null is exact and known: for a driftless
 * walk, optional stopping puts P(reversal) at 0.50 at EVERY distance. So the read needs no
 * benchmark model — above 0.50 is exhaustion, below is momentum, flat is nothing.
 *
 * ── Honesty rules baked in ──────────────────────────────────────────────────────────────────
 *  · σ for day i is yz[i−1] (causal — never sees day i).
 *  · Every ladder and hazard is fitted on the IS half and REPORTED against the OOS half, so the
 *    output carries its own falsification. `oos` is never used to fit.
 *  · Quantiles are compared like-for-like: an IS p50 of extSig is checked against the OOS p50 of
 *    extSig — the SAME statistic on the SAME population. (`exhaustionForecastEngine` compares a
 *    pooled median against a per-day `Math.max(up, dn)`, which is a median-of-one vs max-of-two
 *    mismatch; it reads as a uniform ~1.4× "miss" on every instrument, which is the signature of
 *    an estimator mismatch rather than of market behaviour. Not repeated here.)
 *  · Overlapping hazard races are decorrelated by requiring a fresh extreme to exceed the last
 *    logged one by ≥θσ before it counts as a new observation.
 *
 * Pure — no network, no clock. Composes buildLondonDaily + yzVolSeries.
 */
import { buildLondonDaily } from './volEstimatorAB.js';
import { yzVolSeries } from './volBacktestEngine.js';

// ── Small pure stats ────────────────────────────────────────────────────────────────────────
const _sortNum = a => [...a].sort((x, y) => x - y);
const _median = a => { if (!a.length) return null; const s = _sortNum(a); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const _mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const r3 = (x, d = 3) => (x == null || !isFinite(x)) ? null : +x.toFixed(d);

/** Linear-interpolated quantile of an unsorted array. q in [0,1]. */
function _quantile(arr, q) {
  if (!arr.length) return null;
  const s = _sortNum(arr);
  if (s.length === 1) return s[0];
  const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

const MIN_LADDER_N = 25;          // below this a quantile ladder is noise, not a fit
const SESSIONS = ['asia', 'london', 'ny'];

/** The ladder for one population of σ-scaled distances. */
function _ladder(vals) {
  if (vals.length < MIN_LADDER_N) return { n: vals.length, insufficient: true };
  return {
    n: vals.length,
    p25: r3(_quantile(vals, 0.25)), p50: r3(_quantile(vals, 0.50)),
    p75: r3(_quantile(vals, 0.75)), p90: r3(_quantile(vals, 0.90)),
    mean: r3(_mean(vals)),
  };
}

/** London wall-clock minute-of-day → session bucket. */
function _sessionOf(minOfDay) {
  if (minOfDay < 7 * 60) return 'asia';        // 00:00–07:00 London
  if (minOfDay < 13 * 60) return 'london';     // 07:00–13:00
  return 'ny';                                 // 13:00–24:00
}

/**
 * Every confirmed turn in one day, in chronological order.
 *
 * A "turn" is a zigzag pivot: the leg reversed by ≥ thr (price units) after making the extreme.
 * For each we record BOTH distances (see the header) plus its ordinal, side and session.
 *
 * Causality note: a pivot is only *knowable* thr later than the bar it sits on, so the turn's
 * own price/time is historical fact, not a live claim. This function measures history; the live
 * claim is the ladder projected onto tomorrow, and the hazard.
 */
export function dayTurns(bars, open, thr, sigPct, minOfDayFor = null) {
  const out = [];
  if (!(thr > 0) || !(sigPct > 0) || !(open > 0) || !bars?.length) return out;
  // `minOfDayFor` is optional: callers that only want the extSig ladder (e.g. a page doing a
  // calibration count) have no need for the session split and shouldn't have to synthesise a
  // clock. Session comes back null in that case rather than a wrong bucket.
  const sessFor = minOfDayFor ? (b => _sessionOf(minOfDayFor(b))) : (() => null);

  // Walk the zigzag, tracking the running opposite extreme so a leg length is well defined.
  let dir = 0, extPx = bars[0].close, extIdx = 0;
  let runLo = bars[0].low, runHi = bars[0].high, ptr = 0;
  let ord = 0;

  const push = (idx, price, kind) => {
    // advance the running high/low up to this pivot so `runSig` measures the leg that produced it
    while (ptr <= idx) {
      if (bars[ptr].low < runLo) runLo = bars[ptr].low;
      if (bars[ptr].high > runHi) runHi = bars[ptr].high;
      ptr++;
    }
    const legFrom = kind === 'high' ? runLo : runHi;
    const runPct = Math.abs(price - legFrom) / open * 100;
    const extPct = (price - open) / open * 100;                 // SIGNED
    ord += 1;
    out.push({
      ord,
      side: kind === 'high' ? 'up' : 'dn',
      extSig: Math.abs(extPct) / sigPct,                        // distance from OPEN, in σ
      extSigned: extPct / sigPct,
      runSig: runPct / sigPct,                                  // leg length, in σ
      session: sessFor(bars[idx]),
      idx,
    });
  };

  for (let i = 1; i < bars.length; i++) {
    const hi = bars[i].high, lo = bars[i].low;
    if (dir <= 0) {
      if (lo < extPx) { extPx = lo; extIdx = i; }
      if (hi - extPx >= thr) { push(extIdx, extPx, 'low'); dir = 1; extPx = hi; extIdx = i; }
    } else {
      if (hi > extPx) { extPx = hi; extIdx = i; }
      if (extPx - lo >= thr) { push(extIdx, extPx, 'high'); dir = -1; extPx = lo; extIdx = i; }
    }
  }
  return out;
}

/**
 * Hazard observations for one day: the two-barrier race at each fresh running extreme.
 *
 * Barriers are placed at REF ± θσ where REF is the current price (the bar close at the moment of
 * observation) — NOT at the extreme ± θσ. This matters and is easy to get wrong: price sits at or
 * below the running high when you observe it, so barriers hung off the extreme put the reversal
 * barrier nearer than the continuation barrier and manufacture exhaustion out of a fair coin.
 * Symmetric barriers around the current price are what make the 0.50 null exact under optional
 * stopping. The "fresh extreme" is the STATE we condition on, not the anchor we measure from.
 *
 * Racing them forward over `horizonBars`:
 *   reversal first (toward the open) → the extreme held (exhaustion)
 *   continuation first (away from the open) → the extreme broke (momentum)
 *   neither inside the horizon → discarded (an unresolved race is not evidence either way)
 *
 * Null: 0.50 at every distance, exactly, for a driftless walk.
 */
function _dayHazard(bars, open, sigPct, thetaSig, horizonBars, minOfDayFor) {
  const out = [];
  if (!(sigPct > 0) || !(open > 0) || !bars?.length) return out;
  const thetaPx = thetaSig * sigPct / 100 * open;               // θσ in price units
  if (!(thetaPx > 0)) return out;

  let runHi = bars[0].high, runLo = bars[0].low;
  let lastHi = -Infinity, lastLo = Infinity;                    // last LOGGED extreme per side

  for (let k = 0; k < bars.length - 1; k++) {
    if (bars[k].high > runHi) runHi = bars[k].high;
    if (bars[k].low < runLo) runLo = bars[k].low;

    for (const side of ['up', 'dn']) {
      const E = side === 'up' ? runHi : runLo;
      // Decorrelate: only log a race when this extreme has advanced ≥θσ past the last logged one.
      if (side === 'up' ? !(E >= lastHi + thetaPx) : !(E <= lastLo - thetaPx)) continue;

      // Symmetric around the CURRENT price — see the header note on why this cannot hang off E.
      const ref = bars[k].close;
      const revPx = side === 'up' ? ref - thetaPx : ref + thetaPx;
      const conPx = side === 'up' ? ref + thetaPx : ref - thetaPx;
      let label = null;
      const end = Math.min(bars.length, k + 1 + horizonBars);
      for (let j = k + 1; j < end; j++) {
        const hitRev = side === 'up' ? bars[j].low <= revPx : bars[j].high >= revPx;
        const hitCon = side === 'up' ? bars[j].high >= conPx : bars[j].low <= conPx;
        // A bar that spans both barriers is ambiguous at this granularity — drop it rather
        // than guess, so the hazard is never inflated by an assumed ordering.
        if (hitRev && hitCon) { label = null; break; }
        if (hitRev) { label = 1; break; }
        if (hitCon) { label = 0; break; }
      }
      if (label == null) continue;                              // unresolved or ambiguous
      if (side === 'up') lastHi = E; else lastLo = E;
      out.push({
        side,
        extSig: Math.abs(E - open) / open * 100 / sigPct,
        reversal: label,
        session: _sessionOf(minOfDayFor(bars[k])),
      });
    }
  }
  return out;
}

/** Bucket hazard observations by extension and report P(reversal) with a binomial SE. */
function _hazardCurve(obs, edges) {
  const rows = [];
  for (let b = 0; b < edges.length; b++) {
    const lo = edges[b], hi = edges[b + 1] ?? Infinity;
    const inB = obs.filter(o => o.extSig >= lo && o.extSig < hi);
    if (inB.length < MIN_LADDER_N) { rows.push({ lo, hi: isFinite(hi) ? hi : null, n: inB.length, insufficient: true }); continue; }
    const p = inB.reduce((s, o) => s + o.reversal, 0) / inB.length;
    rows.push({
      lo, hi: isFinite(hi) ? hi : null, n: inB.length,
      pReversal: r3(p),
      se: r3(Math.sqrt(p * (1 - p) / inB.length)),
      // z against the exact 0.50 driftless null — the only benchmark this measurement needs
      z: r3((p - 0.5) / Math.sqrt(0.25 / inB.length), 2),
    });
  }
  return rows;
}

/**
 * @param {Array} intraday  M1/M5 bars: { time, open, high, low, close }
 * @param {Object} opts
 *   pair, isFrac            IS/OOS split fraction (default 0.5)
 *   revFrac                 zigzag threshold as a fraction of the median daily range. This is a
 *                           REAL free parameter, not a detail: on real H1 majors it drives
 *                           turns/day 15 → 6.5 → 2.4 across 0.15 → 0.30 → 0.50, and every ladder
 *                           rung moves with it. Default 0.30 (~6-7 turns/day = swings big enough
 *                           to be worth a level) is PINNED, not tuned — if you change it, change
 *                           it once and disclose it, because sweeping it against an outcome is
 *                           how you fit noise. exhaustionForecastEngine's 0.25 is applied to a
 *                           different quantity (leg length, not extension) so the two are not
 *                           directly comparable.
 *   thetaSig, horizonMin    hazard race barrier (σ) and horizon (minutes)
 *   extEdges                hazard bucket edges in σ
 */
export function exhaustionLadder(intraday, opts = {}) {
  const {
    pair = 'EURUSD', isFrac = 0.5, revFrac = 0.30, minLookback = 40, minBarsPerDay = 6,
    thetaSig = 0.25, horizonMin = 60,
    extEdges = [0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5],
  } = opts;

  const lond = buildLondonDaily(intraday, { minBarsPerDay });
  if (lond.length < 120) return { insufficient: true, nDays: lond.length, reason: 'need ≥120 London days' };

  // bar spacing → how many bars make up the hazard horizon
  const spacingMin = (() => {
    const b = lond.find(d => d.bars?.length > 3)?.bars;
    if (!b) return 5;
    const d = _median(b.slice(1, 40).map((x, i) => (x._t - b[i]._t) / 60000).filter(v => v > 0));
    return d && d > 0 ? d : 5;
  })();
  const horizonBars = Math.max(1, Math.round(horizonMin / spacingMin));

  const yz = yzVolSeries(lond, 30);
  const splitIdx = Math.floor(lond.length * isFrac);
  const thr = revFrac * _median(lond.map(d => d.high - d.low).filter(x => x > 0));

  // London wall-clock minute-of-day for a bar. buildLondonDaily already grouped by London date,
  // so the day's first bar is minute 0 of that London day by construction; measuring offset from
  // it avoids re-deriving the BST rule here (and cannot drift from volEstimatorAB's calendar).
  const turnsBy = { is: [], oos: [] };
  const hazBy = { is: [], oos: [] };
  let daysUsed = 0, turnsTotal = 0;
  const perDayCount = [];

  for (let i = minLookback; i < lond.length; i++) {
    const d = lond[i], sig = yz[i - 1];
    if (!(sig > 0) || !d.bars || d.bars.length < minBarsPerDay || !(d.open > 0)) continue;
    const sigPct = sig * 100;
    const t0 = d.bars[0]._t;
    const minOfDayFor = bar => Math.max(0, Math.round((bar._t - t0) / 60000));
    const seg = i < splitIdx ? 'is' : 'oos';

    const turns = dayTurns(d.bars, d.open, thr, sigPct, minOfDayFor);
    for (const t of turns) { t.day = d.date; turnsBy[seg].push(t); }
    turnsTotal += turns.length; daysUsed++; perDayCount.push(turns.length);

    for (const h of _dayHazard(d.bars, d.open, sigPct, thetaSig, horizonBars, minOfDayFor)) hazBy[seg].push(h);
  }

  if (turnsBy.is.length < MIN_LADDER_N * 2) {
    return { insufficient: true, nDays: lond.length, reason: 'too few IS turns', nTurns: turnsBy.is.length };
  }

  // ── Layer the ladders. Fitted on IS, reported against OOS, same statistic both sides. ──
  const ordKey = t => (t.ord >= 3 ? '3+' : String(t.ord));
  const build = (rows, filt) => _ladder(rows.filter(filt).map(t => t.extSig));
  const buildRun = (rows, filt) => _ladder(rows.filter(filt).map(t => t.runSig));
  const pair2 = filt => ({ is: build(turnsBy.is, filt), oos: build(turnsBy.oos, filt) });

  const byOrdinal = {};
  for (const k of ['1', '2', '3+']) byOrdinal[k] = pair2(t => ordKey(t) === k);

  const bySide = { up: pair2(t => t.side === 'up'), dn: pair2(t => t.side === 'dn') };

  const bySession = {};
  for (const s of SESSIONS) bySession[s] = pair2(t => t.session === s);

  const all = pair2(() => true);
  const runAll = { is: buildRun(turnsBy.is, () => true), oos: buildRun(turnsBy.oos, () => true) };

  // The day's DOMINANT turn (largest extSig) — the like-for-like analogue of the old engine's
  // headline constant. The population here is one-per-day on BOTH halves, so the IS rung and
  // the OOS rung are the same statistic on the same kind of sample. That is the fix: the old
  // engine fits a median over a pooled two-per-day population and then scores it against a
  // per-day max, which inflates the "miss" by a constant factor on every instrument.
  const domExt = rows => {
    const byDay = new Map();
    for (const t of rows) {
      const cur = byDay.get(t.day);
      if (cur == null || t.extSig > cur) byDay.set(t.day, t.extSig);
    }
    return [...byDay.values()];
  };
  const dominant = { is: _ladder(domExt(turnsBy.is)), oos: _ladder(domExt(turnsBy.oos)) };

  // ── Hazard curves ──
  const hazard = {
    thetaSig, horizonMin, horizonBars, spacingMin: r3(spacingMin, 1),
    is: _hazardCurve(hazBy.is, extEdges),
    oos: _hazardCurve(hazBy.oos, extEdges),
    bySession: Object.fromEntries(SESSIONS.map(s => [s, {
      is: _hazardCurve(hazBy.is.filter(o => o.session === s), extEdges),
      oos: _hazardCurve(hazBy.oos.filter(o => o.session === s), extEdges),
    }])),
    nIs: hazBy.is.length, nOos: hazBy.oos.length,
  };

  // ── OOS stability: does an IS-fitted quantile still sit at that quantile OOS? ──
  // For each ladder rung, the honest check is coverage: the fraction of OOS turns at or below
  // the IS rung should equal the rung's own quantile. A p75 that only covers 55% OOS has drifted.
  const oosExt = turnsBy.oos.map(t => t.extSig);
  const coverage = {};
  for (const [q, key] of [[0.25, 'p25'], [0.50, 'p50'], [0.75, 'p75'], [0.90, 'p90']]) {
    const rung = all.is?.[key];
    if (rung == null || !oosExt.length) { coverage[key] = null; continue; }
    const cov = oosExt.filter(v => v <= rung).length / oosExt.length;
    coverage[key] = { rung, target: q, oosCoverage: r3(cov), drift: r3(cov - q) };
  }

  return {
    pair, nDays: lond.length, daysUsed, isFrac, revFrac, splitDate: lond[splitIdx]?.date,
    dateFrom: lond[0].date, dateTo: lond.at(-1).date,
    turnsTotal, turnsPerDay: r3(_mean(perDayCount), 2), medianTurnsPerDay: _median(perDayCount),
    nTurnsIs: turnsBy.is.length, nTurnsOos: turnsBy.oos.length,
    // ── LEVELS: extension-from-open ladders (σ units). Multiply by today's σ and the session
    //    open to get drawable prices — this is the midnight-forecastable object. ──
    ladder: { all, dominant, byOrdinal, bySide, bySession },
    // ── The trailing fade-back distance (σ from the running extreme) — comparable to
    //    exhaustionForecastEngine's kFade, kept so the two engines can be reconciled. ──
    runLadder: runAll,
    coverage,
    hazard,
  };
}

/**
 * Project an IS-fitted ladder onto one live day → drawable prices.
 * Pure arithmetic, no fitting: `open × (1 ± rung × σ)`.
 *
 * @param {Object} rungs      e.g. ladder.all.is  ({ p25, p50, p75, p90 })
 * @param {number} open       the session (London-midnight) open
 * @param {number} sigmaDaily daily σ as a FRACTION (0.0042 = 0.42%)
 * @returns {{up:Object, dn:Object}} prices per rung, per side
 */
export function projectLadder(rungs, open, sigmaDaily) {
  if (!rungs || !(open > 0) || !(sigmaDaily > 0)) return null;
  const out = { up: {}, dn: {} };
  for (const k of ['p25', 'p50', 'p75', 'p90']) {
    const v = rungs[k];
    if (v == null) { out.up[k] = null; out.dn[k] = null; continue; }
    out.up[k] = open * (1 + v * sigmaDaily);
    out.dn[k] = open * (1 - v * sigmaDaily);
  }
  return out;
}

/**
 * Read the hazard curve at a live extension. Returns the bucket covering `extSig`.
 * `curve` is hazard.oos (preferred — it was never fitted) or hazard.is.
 */
export function hazardAt(curve, extSig) {
  if (!Array.isArray(curve) || !(extSig >= 0)) return null;
  for (const row of curve) {
    if (row.insufficient) continue;
    if (extSig >= row.lo && (row.hi == null || extSig < row.hi)) return row;
  }
  return null;
}
