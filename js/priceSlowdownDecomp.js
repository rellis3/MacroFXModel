/**
 * Price-Slowdown Decomposition — the "two budgets" diagnostic.
 *
 * The question this answers (see REVERSION_CONTINUATION_CONCEPT.md §3): a trading
 * day spends TWO different, non-interchangeable "volatility budgets", and
 * distinguishing them is how you tell an exhaustion/fade day from a trend day:
 *
 *   • RANGE budget      = total path traversed, (runHigh − runLow)/open.
 *                         Every move — out AND back — spends it. This is the
 *                         quantity the Feller HL bands (BM_P50/75·σ) model.
 *   • DISPLACEMENT budget = how far price IS from the open right now,
 *                         (price − open)/open. The reach-back GIVES IT BACK.
 *                         This is what the close bands (HN_P50/75·σ) model.
 *
 * A day that pokes out to HL75 and returns to the open has spent almost its whole
 * RANGE budget but returned its DISPLACEMENT budget to ~0. The GAP between the two
 * is the fade. When they move together, it's a trend day.
 *
 * This module is a pure diagnostic brick: given intraday bars it decomposes every
 * session into the two budget curves, finds the first tag of the exhaustion (HL)
 * lines, measures the APPROACH VELOCITY into that tag (the feature that actually
 * predicted fades OOS — ENTRY_ZONE_CONFIDENCE.md), and labels whether price faded
 * back to the open. It IMPORTS the shared bricks — vol σ, band math, the outcome
 * labeler, the touch-velocity feature — so it can never disagree with the
 * forecaster or the analyser.
 *
 * No lookahead: σ for session i uses data < i (volSigmaSeries is causal); bands
 * use only the session's open; approach velocity uses only bars up to the tag.
 * The fade-back label reads the session CLOSE — it is the OUTCOME being measured,
 * not a feature.
 */

import { computeBands, volSigmaSeries } from './forecastCore.js';
import { labelOutcome } from './dayTypeCore.js';
import { createTouchFeatures } from './touchFeatures.js';

const DAY_MS = 86400e3;

// Group time-ordered intraday bars into sessions anchored at `sessionHourUTC`
// (FX day boundary = 22:00 UTC by default, matching the analyser). A session
// labelled 'YYYY-MM-DD' spans [sessionHour on that date, sessionHour next date).
// Returns [{ date, bars }] in chronological order.
export function groupSessions(bars, sessionHourUTC = 22) {
  const shiftSec = sessionHourUTC * 3600;
  const byKey = new Map();
  for (const b of bars) {
    // Shift so the session boundary lands at UTC midnight, then take the date.
    const key = new Date((b.time - shiftSec) * 1000).toISOString().slice(0, 10);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(b);
  }
  return [...byKey.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, bs]) => ({ date, bars: bs }));
}

// Daily OHLC bar for one session (first open, max high, min low, last close).
function sessionD1(sess) {
  const bs = sess.bars;
  let high = -Infinity, low = Infinity;
  for (const b of bs) { if (b.high > high) high = b.high; if (b.low < low) low = b.low; }
  return { time: bs[0].time, open: bs[0].open, high, low, close: bs[bs.length - 1].close };
}

/**
 * Decompose every session into the two budget curves + tag/velocity/outcome.
 *
 * opts:
 *   assetClass      'fx' | 'index' | 'commodity'   (default 'fx')
 *   sessionHourUTC  day boundary (default 22)
 *   tagBand         'hl50' | 'hl75'  — which exhaustion line defines "the tag"
 *                   (default 'hl50', the median proj H/L, high-traffic node)
 *   warmup          skip the first N sessions (σ needs history; default 40)
 *   pathStride      keep every Nth bar in the exported path (default 3 → ~15min)
 *   touchCfg        overrides for createTouchFeatures (approach velocity window…)
 *
 * Returns { records[], sessionsAnalysed, params }.
 * Each record:
 *   { date, open, close, sigma,          // σ = daily fractional vol used for bands
 *     hl50, hl75, ocMed,                 // band distances as fraction of open
 *     tagged, tagSide, tagTimeFrac,      // was the HL line hit, which side, when (0..1 of session)
 *     rangeAtTag, dispAtTag,             // budgets AT the tag, in σ units
 *     budgetAtTag,                       // range consumed ÷ forecast range (0..~1) at the tag
 *     approachVel, velBucket,            // speed into the tag (σ units) + grind/med/spike
 *     rangeMax, dispClose,               // full-day range & closing displacement, σ units
 *     outcome,                           // 'REVERSION' (faded back) | 'CONTINUATION'
 *     path? }                            // [{f,disp,range}] σ-unit curves (only if keepPath)
 */
export function decomposeSessions(bars, opts = {}) {
  const {
    assetClass = 'fx', sessionHourUTC = 22, tagBand = 'hl50',
    warmup = 40, pathStride = 3, keepPathFor = null, touchCfg = {},
  } = opts;

  const sessions = groupSessions(bars, sessionHourUTC).filter(s => s.bars.length >= 5);
  const d1 = sessions.map(sessionD1);
  const sigma = volSigmaSeries(d1, assetClass);   // causal: sigma[i] predicts session i
  const tf = createTouchFeatures(touchCfg);

  const records = [];
  for (let i = warmup; i < sessions.length; i++) {
    const s = sessions[i];
    const open = s.bars[0].open;
    const sig = sigma[i];
    if (!(open > 0) || !(sig > 1e-9)) continue;

    const b = computeBands(open, sig, assetClass);
    const upTag = tagBand === 'hl75' ? b.up75 : b.up50;
    const dnTag = tagBand === 'hl75' ? b.dn75 : b.dn50;
    const forecastRangeFrac = 2 * (tagBand === 'hl75' ? b.hl75 : b.hl50); // full proj H-L

    let runHigh = -Infinity, runLow = Infinity;
    let tagIdx = -1, tagSide = null;
    const path = [];
    const n = s.bars.length;
    for (let j = 0; j < n; j++) {
      const bar = s.bars[j];
      if (bar.high > runHigh) runHigh = bar.high;
      if (bar.low < runLow) runLow = bar.low;
      if (tagIdx < 0) {
        if (bar.high >= upTag) { tagIdx = j; tagSide = 'up'; }
        else if (bar.low <= dnTag) { tagIdx = j; tagSide = 'dn'; }
      }
      if (keepPathFor && (j % pathStride === 0 || j === n - 1)) {
        path.push({
          f: +(j / (n - 1)).toFixed(4),
          disp: +(((bar.close - open) / open) / sig).toFixed(4),      // signed, σ units
          range: +(((runHigh - runLow) / open) / sig).toFixed(4),     // σ units
        });
      }
    }

    const dispClose = ((s.bars[n - 1].close - open) / open) / sig;
    const rangeMax = ((runHigh - runLow) / open) / sig;
    const outcome = labelOutcome({ open, close: s.bars[n - 1].close, ocMedFrac: b.ocMed }, 'closeVsOcMed');

    let approachVel = null, velBucket = null, rangeAtTag = null, dispAtTag = null, budgetAtTag = null, tagTimeFrac = null;
    // Post-tag retrace: how far back toward the open did price come AFTER tagging
    // the HL line? Normalised as a fraction of the HL distance — 0 = stayed at the
    // line, 1 = returned all the way to the open, >1 = pushed through the open.
    // This separates the COMMON small fade (retrace to the OC-median line = the
    // tradeable target) from the RARE full fade back to the open.
    let retraceFrac = null, retraceToOcMed = null, retraceToOpen = null;
    if (tagIdx >= 0) {
      tagTimeFrac = +(tagIdx / (n - 1)).toFixed(4);
      const barsToTag = s.bars.slice(0, tagIdx + 1);
      let hi = -Infinity, lo = Infinity;
      for (const x of barsToTag) { if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low; }
      rangeAtTag = +(((hi - lo) / open) / sig).toFixed(4);
      dispAtTag = +(((barsToTag[barsToTag.length - 1].close - open) / open) / sig).toFixed(4);
      budgetAtTag = forecastRangeFrac > 1e-12 ? +(((hi - lo) / open) / forecastRangeFrac).toFixed(4) : null;
      const f = tf.compute({ bars: s.bars, touchIdx: tagIdx, open, sigma: sig, side: tagSide });
      approachVel = f.approachVel.value;
      velBucket = f.approachVel.bucket;

      const hlSig = (tagBand === 'hl75' ? b.hl75 : b.hl50) / sig;  // line distance, σ units
      const ocSig = b.ocMed / sig;
      // deepest pull-back displacement (σ units) after the tag, toward the open
      let deepest;
      if (tagSide === 'up') {
        deepest = Infinity;
        for (let j = tagIdx; j < n; j++) deepest = Math.min(deepest, ((s.bars[j].low - open) / open) / sig);
      } else {
        deepest = -Infinity;
        for (let j = tagIdx; j < n; j++) deepest = Math.max(deepest, ((s.bars[j].high - open) / open) / sig);
        deepest = -deepest;   // flip so "toward open" is measured the same way as the up side
      }
      retraceFrac = hlSig > 1e-9 ? +((hlSig - deepest) / hlSig).toFixed(4) : null;
      retraceToOcMed = deepest <= ocSig;   // reached the OC-median line = the tradeable fade
      retraceToOpen = deepest <= 0;        // came all the way back to the open
    }

    records.push({
      date: s.date, open, close: s.bars[n - 1].close, sigma: +sig.toFixed(6),
      hl50: +b.hl50.toFixed(6), hl75: +b.hl75.toFixed(6), ocMed: +b.ocMed.toFixed(6),
      tagged: tagIdx >= 0, tagSide, tagTimeFrac,
      rangeAtTag, dispAtTag, budgetAtTag, approachVel, velBucket,
      retraceFrac, retraceToOcMed, retraceToOpen,
      rangeMax: +rangeMax.toFixed(4), dispClose: +dispClose.toFixed(4), outcome,
      ...(keepPathFor ? { path } : {}),
    });
  }
  return { records, sessionsAnalysed: records.length, params: { assetClass, sessionHourUTC, tagBand, warmup } };
}

// ── Aggregation helpers (the honest evidence) ────────────────────────────────
// Fade-back rate = P(REVERSION) = fraction of tagged sessions that closed back
// within the median close displacement of the open. Bucketed by a chosen key so
// we can read "does a faster approach / more range spent ⇒ more fade-back?".

const rate = arr => (arr.length ? arr.filter(r => r.outcome === 'REVERSION').length / arr.length : null);

export function fadeRateBy(records, keyFn) {
  const tagged = records.filter(r => r.tagged && r.outcome);
  const groups = new Map();
  for (const r of tagged) {
    const k = keyFn(r);
    if (k == null) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const out = {};
  for (const [k, arr] of groups) {
    out[k] = { n: arr.length, fadeBackRate: +rate(arr).toFixed(4), meanCloseDisp: +mean(arr.map(r => Math.abs(r.dispClose))).toFixed(4) };
  }
  return out;
}

// Bucket a numeric field into quantile bins and report fade-back rate per bin —
// a monotone gradient across bins is the signal (not one lucky bin).
export function fadeRateByQuantile(records, field, bins = 5) {
  const tagged = records.filter(r => r.tagged && r.outcome && r[field] != null);
  const vals = tagged.map(r => r[field]).sort((a, b) => a - b);
  if (vals.length < bins) return {};
  const edges = [];
  for (let q = 1; q < bins; q++) edges.push(vals[Math.floor((q / bins) * vals.length)]);
  const binOf = v => { let k = 0; while (k < edges.length && v > edges[k]) k++; return k; };
  const out = {};
  for (let k = 0; k < bins; k++) {
    const arr = tagged.filter(r => binOf(r[field]) === k);
    const lo = k === 0 ? vals[0] : edges[k - 1];
    const hi = k === edges.length ? vals[vals.length - 1] : edges[k];
    out[`q${k + 1}`] = {
      range: [+lo.toFixed(3), +hi.toFixed(3)], n: arr.length,
      fadeBackRate: arr.length ? +rate(arr).toFixed(4) : null,
    };
  }
  return out;
}

// Generic P(predicate) grouped by a key — for boolean outcomes (retraceToOcMed,
// retraceToOpen) so the same "does a faster approach mean more fade?" question
// can be asked of the tradeable target and the full-fade target alike.
export function hitRateBy(records, keyFn, predFn) {
  const rows = records.filter(r => r.tagged);
  const groups = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (k == null) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const out = {};
  for (const [k, arr] of groups) out[k] = { n: arr.length, rate: +(arr.filter(predFn).length / arr.length).toFixed(4) };
  return out;
}

function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
