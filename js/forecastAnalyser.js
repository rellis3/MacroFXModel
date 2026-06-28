/**
 * Forecast Level Analyser — measurement engine (Phase 1).
 *
 * Measures, never trades. For each window it builds the ladder of forecast
 * lines (open + Close med/75p + Proj H/L med/75p, both sides), then records what
 * price actually did relative to EACH line — hit, reversion vs continuation
 * (ladder rule), retracement depth, extension, time-to-touch, close location.
 * No entries, stops, fills or costs.
 *
 * Spec: FORECAST_LEVEL_ANALYSER_SPEC.md. Reuses the lego core (computeBands,
 * volSigmaSeries, classifyRegime) — no vol math copied, no trade primitive.
 */

import { computeBands, volSigmaSeries, classifyRegime, selectStrategy, HORIZONS, ASSET_PARAMS } from './forecastCore.js';
import { classifyDayType, labelOutcome } from './dayTypeCore.js';   // the reversion/continuation classifier + realized-outcome labeler (lego bricks, imported never copied)
import { createTouchFeatures } from './touchFeatures.js';           // at-the-moment intraday approach features (configurable lego brick)

// ── 1) Build the ladder of lines, sorted by distance from open ───────────────
// Returns up[] and dn[], each ordered inner→outer, plus the band fractions.
// Each line: { name, side, level(price), dist(frac) }.
export function buildLadder(open, sigma, assetClass) {
  const b = computeBands(open, sigma, assetClass);
  // Only the forecast fractions are needed: analyseWindow builds the line levels
  // itself — OC static off open, HL dynamic off the running opposite extreme.
  return { open, frac: { hl50: b.hl50, hl75: b.hl75, ocMed: b.ocMed, oc75: b.oc75 } };
}

// Session of a touch from its timestamp (epoch seconds / ms / ISO), UTC hours.
function classifySession(t) {
  if (t == null) return null;
  const d = typeof t === 'number' ? new Date(t < 1e12 ? t * 1000 : t) : new Date(t);
  const h = d.getUTCHours();
  if (h >= 22 || h < 7) return 'Asia';
  if (h < 13) return 'London';
  return 'NY';
}

// ── 2) Analyse one window against the ladder ─────────────────────────────────
// session = { open, bars:[{time,open,high,low,close}] } (M1). Returns a per-line
// record array for both sides.
//
// Line geometry MATCHES the live chart / Pine overlay ("C.og - Volatility
// Overlay"):
//   • OC (Close) lines are STATIC off the day open:   open × (1 ± ocDist)
//   • HL (Proj H/L) lines are DYNAMIC — each trails the OPPOSITE running extreme,
//     exactly like the indicator:
//         proj HIGH (up side) = runLow  × (1 + hlDist)
//         proj LOW  (dn side) = runHigh × (1 − hlDist)
//     so tagging an HL line == the forecast high-low RANGE completing. Because
//     the up lines anchor on the running LOW (which only drops on a new low) and
//     vice-versa, an HL line is effectively fixed once its anchor extreme is set
//     — so freezing neighbours at the touch bar is faithful, not an approximation.
export function analyseWindow(session, ladder, ctx = {}) {
  const { open, bars } = session;
  const { sigma = 0, tf = null, pip = 0 } = ctx;   // daily-σ frac + configured touch-feature computer + pip size
  const n = bars.length;
  const last = bars[n - 1];
  const closePx = last?.close ?? open;
  // Revert/continue needs an ordered intraday path. A single bar (daily D1
  // fallback) contains the high AND low with no time order → outcome unknowable.
  const hasPath = n >= 2;
  const fr = ladder.frac;                          // { hl50, hl75, ocMed, oc75 } fractions
  const outRows = [];
  // WaveTrend computed ONCE per window (causal EMA → indexing at a touch bar is
  // lookahead-free). null when no touch-feature computer is wired.
  const wt1 = tf ? tf.wtSeries(bars) : null;
  const FEAT_KEYS = ['approachER', 'approachVel', 'wtState', 'volClimax', 'candleReject', 'roundNum'];
  const NO_FEATS = Object.fromEntries(FEAT_KEYS.map(k => [k, null]));
  const featBuckets = (touchIdx, side, level) => {
    if (!tf || touchIdx < 0) return NO_FEATS;
    const f = tf.compute({ bars, touchIdx, open, sigma, side, wt1, level, pip });
    return Object.fromEntries(FEAT_KEYS.map(k => [k, f[k]?.bucket ?? null]));
  };

  // Running extremes inclusive of bar k (drives the dynamic HL line levels).
  const runHigh = new Array(n), runLow = new Array(n);
  { let rh = -Infinity, rl = Infinity;
    for (let k = 0; k < n; k++) {
      if (bars[k].high > rh) rh = bars[k].high;
      if (bars[k].low  < rl) rl = bars[k].low;
      runHigh[k] = rh; runLow[k] = rl;
    } }

  const NAMES   = ['OC50', 'OC75', 'HL50', 'HL75'];
  const isHL    = nm => nm === 'HL50' || nm === 'HL75';
  const hlD     = nm => (nm === 'HL75' ? fr.hl75 : fr.hl50);
  const ocD     = nm => (nm === 'OC75' ? fr.oc75 : fr.ocMed);
  const nomDist = nm => (isHL(nm) ? hlD(nm) : ocD(nm));   // nominal forecast fraction (the chart's "x%")
  // Level of line (nm, side) at bar k. OC static off open; HL dynamic off the
  // opposite running extreme (Pine construction).
  const levelAt = (nm, side, k) => {
    const up = side === 'up';
    if (isHL(nm)) return up ? runLow[k] * (1 + hlD(nm)) : runHigh[k] * (1 - hlD(nm));
    return up ? open * (1 + ocD(nm)) : open * (1 - ocD(nm));
  };

  for (const side of ['up', 'dn']) {
    const isUp = side === 'up';
    for (const nm of NAMES) {
      const distPct = +(nomDist(nm) * 100).toFixed(4);

      // First touch (intrabar reach), testing the line's level AT each bar.
      let touchIdx = -1, firstTouchTime = null;
      for (let k = 0; k < n; k++) {
        const lvl = levelAt(nm, side, k);
        const hit = isUp ? bars[k].high >= lvl : bars[k].low <= lvl;
        if (hit) { touchIdx = k; firstTouchTime = bars[k].time ?? null; break; }
      }
      if (touchIdx < 0) {
        const fin = levelAt(nm, side, n - 1);
        outRows.push({ name: nm, side, level: +fin.toFixed(6), distPct,
          hit: false, outcome: 'no_touch', firstTouchTime: null, session: null, budgetBucket: null,
          retraceTo: null, retracePct: 0, extTo: null, extPct: 0,
          closeBeyond: isUp ? closePx > fin : closePx < fin, mfePct: 0, ...NO_FEATS });
        continue;
      }
      const touchLvl = levelAt(nm, side, touchIdx);
      // At-the-moment intraday approach + structural features (null when insufficient data).
      const fb = featBuckets(touchIdx, side, touchLvl);
      // Range-budget at touch: realized H-L so far ÷ expected median daily range
      // (= HL50, the BM_P50 range constant — NOT 2×). Low = price hit the line
      // early in the day's range (continuation pressure); high = range spent.
      const expRange = open * fr.hl50;
      const budget   = expRange > 0 ? (runHigh[touchIdx] - runLow[touchIdx]) / expRange : 0;
      const budgetBucket = budget < 0.4 ? '1·early' : budget < 0.75 ? '2·mid' : '3·exhausted';
      const sess = classifySession(firstTouchTime);
      if (!hasPath) {
        outRows.push({ name: nm, side, level: +touchLvl.toFixed(6), distPct,
          hit: true, outcome: 'no_intraday', firstTouchTime, session: sess, budgetBucket,
          retraceTo: null, retracePct: 0, extTo: null, extPct: 0,
          closeBeyond: isUp ? closePx > touchLvl : closePx < touchLvl, mfePct: 0, ...fb });
        continue;
      }

      // Neighbours FROZEN at the touch bar: nearest line toward open (inner) and
      // away from open (outer), among all four lines evaluated at touchIdx.
      // Up side: toward open = lower price; dn side: toward open = higher price.
      let inner = open, outer;
      if (isUp) {
        let bestIn = open, bestOut = Infinity;
        for (const x of NAMES) { const lv = levelAt(x, side, touchIdx);
          if (lv < touchLvl - 1e-12 && lv > bestIn)  bestIn  = lv;
          if (lv > touchLvl + 1e-12 && lv < bestOut) bestOut = lv; }
        inner = bestIn;
        outer = bestOut === Infinity ? touchLvl + open * (fr.hl75 - fr.hl50) : bestOut;
      } else {
        let bestIn = open, bestOut = -Infinity;
        for (const x of NAMES) { const lv = levelAt(x, side, touchIdx);
          if (lv > touchLvl + 1e-12 && lv < bestIn)  bestIn  = lv;
          if (lv < touchLvl - 1e-12 && lv > bestOut) bestOut = lv; }
        inner = bestIn;
        outer = bestOut === -Infinity ? touchLvl - open * (fr.hl75 - fr.hl50) : bestOut;
      }

      // Walk forward from touch: which neighbour is reached first?
      let outcome = 'undecided', retraceTo = null, extTo = null;
      let extremeBack = touchLvl, extremeFwd = touchLvl;
      for (let k = touchIdx; k < n; k++) {
        const bar = bars[k];
        if (isUp) {
          extremeBack = Math.min(extremeBack, bar.low);
          extremeFwd  = Math.max(extremeFwd,  bar.high);
          if (bar.low  <= inner) { outcome = 'reverted';  retraceTo = inner; break; }  // tie → conservative: reverted
          if (bar.high >= outer) { outcome = 'continued'; extTo     = outer; break; }
        } else {
          extremeBack = Math.max(extremeBack, bar.high);
          extremeFwd  = Math.min(extremeFwd,  bar.low);
          if (bar.high >= inner) { outcome = 'reverted';  retraceTo = inner; break; }
          if (bar.low  <= outer) { outcome = 'continued'; extTo     = outer; break; }
        }
      }
      if (outcome === 'undecided') {
        outcome = isUp ? (closePx > touchLvl ? 'continued' : 'reverted')
                       : (closePx < touchLvl ? 'continued' : 'reverted');
      }

      const retracePct = isUp ? (touchLvl - extremeBack) / open * 100
                              : (extremeBack - touchLvl) / open * 100;
      const extPct     = isUp ? (extremeFwd - touchLvl) / open * 100
                              : (touchLvl - extremeFwd) / open * 100;

      outRows.push({
        name: nm, side, level: +touchLvl.toFixed(6), distPct,
        hit: true, outcome, firstTouchTime, session: sess, budgetBucket,
        retraceTo: retraceTo ? +retraceTo.toFixed(6) : null, retracePct: +retracePct.toFixed(4),
        extTo: extTo ? +extTo.toFixed(6) : null, extPct: +extPct.toFixed(4),
        // The frozen triple-barrier levels (TP=inner toward open, SL=outer away),
        // stored on EVERY decided touch so a strategy can price the trade
        // regardless of which barrier hit.
        innerLvl: +inner.toFixed(6), outerLvl: +outer.toFixed(6),
        closeBeyond: isUp ? closePx > touchLvl : closePx < touchLvl,
        mfePct: +retracePct.toFixed(4),   // favourable excursion for a fade = reversion depth
        ...fb,
      });
    }
  }
  return outRows;
}

// ── 3a) Bucket raw M1 into broker-day SESSIONS (22:00 UTC boundary) ───────────
// M1-ONLY: the analyser derives everything from the R2 M1 parquet — no D1 bars,
// no fallback (single-bar daily windows can't order high vs low → biased).
// `packed` = { n, times, opens, highs, lows, closes } (from loadM1ForPair).
// Returns Map(sessionDate → ordered bars[]). Boundary matches fetchD1 so the
// analyser's "day"/open align with the live forecaster.
export function bucketM1IntoSessions(packed, boundaryHour = 22) {
  const map = new Map();
  if (!packed || !packed.n) return map;
  const { n, times, opens, highs, lows, closes, volumes } = packed;
  for (let i = 0; i < n; i++) {
    const t  = times[i];
    // times may be epoch SECONDS (Int32, from loadM1ForPair), epoch ms, or ISO.
    const dt = typeof t === 'number' ? new Date(t < 1e12 ? t * 1000 : t) : new Date(t);
    const d  = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
    if (dt.getUTCHours() >= boundaryHour) d.setUTCDate(d.getUTCDate() + 1);  // belongs to next session
    const key = d.toISOString().slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ time: t, open: opens[i], high: highs[i], low: lows[i], close: closes[i], volume: volumes ? volumes[i] : 0 });
  }
  for (const arr of map.values()) arr.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
  return map;
}

// Build a daily OHLC series FROM the M1 sessions (open=first M1, close=last M1).
function sessionsToD1(sessions, dates) {
  return dates.map(date => {
    const bars = sessions.get(date);
    let hi = -Infinity, lo = Infinity;
    for (const b of bars) { if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
    return { date, open: bars[0].open, high: hi, low: lo, close: bars[bars.length - 1].close };
  });
}

// ── 3b) Walk-forward over windows — M1 sessions only ─────────────────────────
// sessions = Map(sessionDate → ordered M1 bars[]) from bucketM1IntoSessions.
// Daily window = that session's M1. Weekly/monthly = concatenated M1 across the
// block of sessions (ordered intraday path, no D1). σ/regime from the M1-derived
// daily closes (no lookahead).
export function runAnalyser(sessions, assetClass, opts = {}) {
  const { horizon = 'daily', minLookback = 50, dateFrom = '', dateTo = '', minBarsPerSession = 30 } = opts;
  const H = HORIZONS[horizon] ?? HORIZONS.daily;
  const tf = createTouchFeatures(opts.touchCfg);   // at-the-moment approach features (configured here)

  // Drop thin sessions (holidays / partial days) so a session is a real path.
  const dates = [...sessions.keys()].sort()
    .filter(d => (sessions.get(d)?.length ?? 0) >= minBarsPerSession);
  if (dates.length <= minLookback) return [];

  const d1Bars = sessionsToD1(sessions, dates);
  const closes = d1Bars.map(b => b.close);
  const sigD   = volSigmaSeries(d1Bars, assetClass);
  const records = [];
  const step = horizon === 'daily' ? 1 : H.windowDays;

  for (let i = minLookback; i < dates.length; i += step) {
    const date = dates[i];
    if (dateFrom && date < dateFrom) continue;
    if (dateTo   && date > dateTo)   continue;
    const sigma = sigD[i] * H.sigmaScale;
    if (!sigma || sigma < 1e-8) continue;

    // Window bars = M1 across this session (daily) or this block of sessions.
    let bars, open;
    if (horizon === 'daily') {
      bars = sessions.get(date);
    } else {
      bars = [];
      for (let k = i; k < Math.min(i + H.windowDays, dates.length); k++) bars.push(...sessions.get(dates[k]));
    }
    if (!bars || bars.length < 2) continue;   // need an ordered path
    open = bars[0].open;

    const ladder = buildLadder(open, sigma, assetClass);
    const regime = classifyRegime(closes, i, 20, 5, opts.slopeThresh ?? 0.002, 1.0);
    const dow    = new Date(date + 'T00:00:00Z').getUTCDay();
    const lines  = analyseWindow({ open, bars }, ladder, { sigma, tf, pip: opts.pip ?? 0 });

    // Day-type score (no lookahead: reads closes[< i] only) + the selector's
    // directional choice + the realized continuation/reversion label, for the
    // day-type analysis (DAYTYPE_ANALYSIS_BRIEF.md).
    const dt = classifyDayType({ closes, idx: i, win: 14 });
    const dirAction = selectStrategy(dt.T, regime).action;        // 'fade' | 'follow'
    const closePx = bars[bars.length - 1].close;
    let hi = -Infinity, lo = Infinity;
    for (const b of bars) { if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
    // Realized outcome label (the ground truth the score is graded against) — the
    // shared brick, default = balanced close-vs-median (~50/50), NOT the old hl50
    // rule that fired ~12% and starved the day-type test.
    const realizedDir = labelOutcome({ open, close: closePx, high: hi, low: lo,
      ocMedFrac: ladder.frac.ocMed, hl50Frac: ladder.frac.hl50 });
    // Gap from the prior session close, in σ units → bucket.
    const prevClose = i > 0 ? d1Bars[i - 1].close : open;
    const gapSig = (sigma > 0 && prevClose > 0) ? (open - prevClose) / prevClose / sigma : 0;
    const gapBucket = Math.abs(gapSig) < 0.25 ? 'flat' : gapSig > 0 ? 'gap-up' : 'gap-down';
    // Deterministic calendar tags (no external data): US NFP = first Friday of the
    // month; month phase = early/mid/late. Event days tend to break levels.
    const [yy, mm, dd] = date.split('-').map(Number);
    const dow1 = new Date(Date.UTC(yy, mm - 1, 1)).getUTCDay();
    const firstFri = 1 + ((5 - dow1 + 7) % 7);
    const eventBucket = (dd === firstFri) ? 'NFP' : 'normal';
    const monthPhase  = dd <= 10 ? '1·early' : dd <= 20 ? '2·mid' : '3·late';
    records.push({
      date, horizon, regime, dow, sigma: +(sigma * 100).toFixed(4),  // σ as % of price
      gapBucket, gapSig: +gapSig.toFixed(3), eventBucket, monthPhase,
      dtT: dt.T, signedT: dt.signedT, dtLabel: dt.label, dirAction, realizedDir,
      open: +open.toFixed(6),
      realized: { high: +hi.toFixed(6), low: +lo.toFixed(6), close: +bars[bars.length - 1].close.toFixed(6) },
      lines,
    });
  }
  return records;
}

// ── 4) Aggregate per line, optionally grouped by a slice key ─────────────────
// sliceFn(record) → group key (e.g. r => r.regime). Returns
// { group: { lineName: { side: stats } } }.
// sliceFn receives (record, line). Window-level slices ignore `line`; per-touch
// slices (session / range-budget) key off the line — a null key skips that line
// (e.g. untouched lines have no session).
export function aggregate(records, sliceFn = () => 'all') {
  const groups = {};
  for (const rec of records) {
    for (const ln of rec.lines) {
      const g = sliceFn(rec, ln);
      if (g == null) continue;
      groups[g] ??= {};
      const key = `${ln.name}_${ln.side}`;
      const a = (groups[g][key] ??= { line: ln.name, side: ln.side, windows: 0, hits: 0, decided: 0, noIntraday: 0, reverted: 0, continued: 0, closeBeyond: 0, retraceSum: 0, extSum: 0, inSum: 0, outSum: 0, inNorm: 0, outNorm: 0 });
      a.windows++;
      if (ln.closeBeyond) a.closeBeyond++;     // for calibration (% of windows closing beyond the line)
      if (!ln.hit) continue;
      a.hits++;
      if (ln.outcome === 'no_intraday') { a.noIntraday++; continue; }
      a.decided++;
      // MAE/MFE excursions from the touch (every decided touch, regardless of outcome).
      // excIn = max move toward open (favourable for a fade); excOut = max move away
      // (favourable for a follow). Normalize by the day's σ for a vol-fair E-ratio.
      a.inSum  += ln.retracePct; a.outSum += ln.extPct;
      const sg = rec.sigma > 0 ? rec.sigma : 0;
      if (sg) { a.inNorm += ln.retracePct / sg; a.outNorm += ln.extPct / sg; }
      if (ln.outcome === 'reverted')  { a.reverted++;  a.retraceSum += ln.retracePct; }
      if (ln.outcome === 'continued') { a.continued++; a.extSum     += ln.extPct; }
    }
  }
  // finalize rates — revert/continue measured over DECIDED touches (path known).
  for (const g of Object.values(groups)) {
    for (const a of Object.values(g)) {
      a.hitRate         = a.windows ? +(a.hits / a.windows * 100).toFixed(1) : 0;
      a.revRate         = a.decided ? +(a.reverted / a.decided * 100).toFixed(1) : 0;
      a.contRate        = a.decided ? +(a.continued / a.decided * 100).toFixed(1) : 0;
      a.avgRetrace      = a.reverted ? +(a.retraceSum / a.reverted).toFixed(4) : 0;
      a.avgExt          = a.continued ? +(a.extSum / a.continued).toFixed(4) : 0;
      a.closeBeyondRate = a.windows ? +(a.closeBeyond / a.windows * 100).toFixed(1) : 0;
      // MAE/MFE: avg excursion toward open (mfe-fade) vs away (mae-fade) over all
      // decided touches, plus the vol-normalized E-ratio (>1 = reversion-favoured).
      a.avgMfe          = a.decided ? +(a.inSum  / a.decided).toFixed(4) : 0;   // toward open
      a.avgMae          = a.decided ? +(a.outSum / a.decided).toFixed(4) : 0;   // away from open
      a.eRatio          = a.outNorm > 1e-9 ? +(a.inNorm / a.outNorm).toFixed(3) : (a.inNorm > 0 ? 9 : 0);
      a.lowN            = a.decided < 30;
      delete a.retraceSum; delete a.extSum; delete a.inSum; delete a.outSum; delete a.inNorm; delete a.outNorm;
    }
  }
  return groups;
}

export { ASSET_PARAMS };
