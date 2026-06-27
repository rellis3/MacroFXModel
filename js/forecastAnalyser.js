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

import { computeBands, volSigmaSeries, classifyRegime, HORIZONS, ASSET_PARAMS } from './forecastCore.js';

// ── 1) Build the ladder of lines, sorted by distance from open ───────────────
// Returns up[] and dn[], each ordered inner→outer, plus the band fractions.
// Each line: { name, side, level(price), dist(frac) }.
export function buildLadder(open, sigma, assetClass) {
  const b = computeBands(open, sigma, assetClass);
  const defs = [
    { name: 'OC50', dist: b.ocMed },   // Close med
    { name: 'OC75', dist: b.oc75 },    // Close 75p
    { name: 'HL50', dist: b.hl50 },    // Proj H/L med
    { name: 'HL75', dist: b.hl75 },    // Proj H/L 75p
  ].sort((x, y) => x.dist - y.dist);   // inner → outer (fixed per asset class)

  const up = defs.map(d => ({ name: d.name, side: 'up', dist: d.dist, level: open * (1 + d.dist) }));
  const dn = defs.map(d => ({ name: d.name, side: 'dn', dist: d.dist, level: open * (1 - d.dist) }));
  return { open, up, dn, frac: { hl50: b.hl50, hl75: b.hl75, ocMed: b.ocMed, oc75: b.oc75 } };
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
// session = { open, bars:[{time,open,high,low,close}] } (M1 for daily, D1 for
// weekly/monthly). Returns a per-line record array for both sides.
export function analyseWindow(session, ladder) {
  const { open, bars } = session;
  const last = bars[bars.length - 1];
  const closePx = last?.close ?? open;
  // Revert/continue needs an ordered intraday path. A single bar (daily D1
  // fallback) contains the high AND low with no time order → outcome unknowable.
  const hasPath = bars.length >= 2;
  const outRows = [];

  for (const side of ['up', 'dn']) {
    const lines = ladder[side];
    const isUp  = side === 'up';
    for (let i = 0; i < lines.length; i++) {
      const line  = lines[i];
      const inner = i > 0 ? lines[i - 1].level : open;            // toward open
      const outer = i < lines.length - 1 ? lines[i + 1].level
                   : (isUp ? line.level + open * (ladder.frac.hl75 - ladder.frac.hl50)
                           : line.level - open * (ladder.frac.hl75 - ladder.frac.hl50));

      // First touch — track running range to that point for the range-budget.
      let touchIdx = -1, firstTouchTime = null, rHi = -Infinity, rLo = Infinity;
      for (let k = 0; k < bars.length; k++) {
        if (bars[k].high > rHi) rHi = bars[k].high;
        if (bars[k].low  < rLo) rLo = bars[k].low;
        const hit = isUp ? bars[k].high >= line.level : bars[k].low <= line.level;
        if (hit) { touchIdx = k; firstTouchTime = bars[k].time ?? null; break; }
      }
      if (touchIdx < 0) {
        outRows.push({ name: line.name, side, level: +line.level.toFixed(6), distPct: +(line.dist * 100).toFixed(4),
          hit: false, outcome: 'no_touch', firstTouchTime: null, session: null, budgetBucket: null,
          retraceTo: null, retracePct: 0, extTo: null, extPct: 0,
          closeBeyond: isUp ? closePx > line.level : closePx < line.level, mfePct: 0 });
        continue;
      }
      // Range-budget at touch: realized H-L so far ÷ expected median daily range
      // (2×HL50). Low = price hit the line early in the day's range (continuation
      // pressure); high = range already spent (exhaustion).
      const expRange = 2 * open * ladder.frac.hl50;
      const budget   = expRange > 0 ? (rHi - rLo) / expRange : 0;
      const budgetBucket = budget < 0.4 ? '1·early' : budget < 0.75 ? '2·mid' : '3·exhausted';
      const session = classifySession(firstTouchTime);
      if (!hasPath) {
        // Touched, but no intraday path to judge revert vs continue.
        outRows.push({ name: line.name, side, level: +line.level.toFixed(6), distPct: +(line.dist * 100).toFixed(4),
          hit: true, outcome: 'no_intraday', firstTouchTime, session, budgetBucket,
          retraceTo: null, retracePct: 0, extTo: null, extPct: 0,
          closeBeyond: isUp ? closePx > line.level : closePx < line.level, mfePct: 0 });
        continue;
      }

      // Walk forward from touch: which neighbour is reached first?
      let outcome = 'undecided', retraceTo = null, extTo = null;
      let extremeBack = isUp ? line.level : line.level;   // most-reverted price toward open
      let extremeFwd  = isUp ? line.level : line.level;   // most-extended price away
      for (let k = touchIdx; k < bars.length; k++) {
        const bar = bars[k];
        if (isUp) {
          extremeBack = Math.min(extremeBack, bar.low);
          extremeFwd  = Math.max(extremeFwd,  bar.high);
          const revHit = bar.low  <= inner;
          const conHit = bar.high >= outer;
          if (revHit && conHit) { outcome = 'reverted'; retraceTo = inner; break; }   // tie → conservative: reverted
          if (revHit) { outcome = 'reverted';  retraceTo = inner; break; }
          if (conHit) { outcome = 'continued'; extTo = outer;     break; }
        } else {
          extremeBack = Math.max(extremeBack, bar.high);
          extremeFwd  = Math.min(extremeFwd,  bar.low);
          const revHit = bar.high >= inner;
          const conHit = bar.low  <= outer;
          if (revHit && conHit) { outcome = 'reverted'; retraceTo = inner; break; }
          if (revHit) { outcome = 'reverted';  retraceTo = inner; break; }
          if (conHit) { outcome = 'continued'; extTo = outer;     break; }
        }
      }
      if (outcome === 'undecided') {
        // classify by close
        outcome = isUp ? (closePx > line.level ? 'continued' : 'reverted')
                       : (closePx < line.level ? 'continued' : 'reverted');
      }

      const retracePct = isUp ? (line.level - extremeBack) / open * 100
                              : (extremeBack - line.level) / open * 100;
      const extPct     = isUp ? (extremeFwd - line.level) / open * 100
                              : (line.level - extremeFwd) / open * 100;
      const mfePct     = retracePct;  // favourable excursion for a fade = reversion depth

      outRows.push({
        name: line.name, side, level: +line.level.toFixed(6), distPct: +(line.dist * 100).toFixed(4),
        hit: true, outcome, firstTouchTime, session, budgetBucket,
        retraceTo: retraceTo ? +retraceTo.toFixed(6) : null, retracePct: +retracePct.toFixed(4),
        extTo: extTo ? +extTo.toFixed(6) : null, extPct: +extPct.toFixed(4),
        closeBeyond: isUp ? closePx > line.level : closePx < line.level,
        mfePct: +mfePct.toFixed(4),
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
  const { n, times, opens, highs, lows, closes } = packed;
  for (let i = 0; i < n; i++) {
    const t  = times[i];
    // times may be epoch SECONDS (Int32, from loadM1ForPair), epoch ms, or ISO.
    const dt = typeof t === 'number' ? new Date(t < 1e12 ? t * 1000 : t) : new Date(t);
    const d  = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
    if (dt.getUTCHours() >= boundaryHour) d.setUTCDate(d.getUTCDate() + 1);  // belongs to next session
    const key = d.toISOString().slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ time: t, open: opens[i], high: highs[i], low: lows[i], close: closes[i] });
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
    const lines  = analyseWindow({ open, bars }, ladder);

    let hi = -Infinity, lo = Infinity;
    for (const b of bars) { if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
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
