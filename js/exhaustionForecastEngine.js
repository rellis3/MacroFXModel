/**
 * Exhaustion Forecast — the honest expression of "where will price fade back from?"
 *
 * The vol forecast gives the RANGE (how far price travels = C×σ). This gives the
 * EXHAUSTION POINT: where, projected from the running extreme, price is predicted to
 * turn and fade back toward the open. They are separate: σ sets the scale, and a
 * volatility-NEUTRAL ratio k_fade sets the location (the mean-reversion-vs-momentum
 * axis — FX turns short of the range, indices overshoot it).
 *
 *   exhaustion distance = k_fade × σ,   k_fade = median(dominant-reversal-run ÷ σ)  [IS only]
 *
 * where the dominant reversal run is how far the day's largest swing ran from the
 * running extreme before it reversed — i.e. the realized fade-back point. So k_fade×σ
 * IS the fade-back line, estimated causally on the in-sample half.
 *
 * TWO deliverables, kept honest and separate:
 *   1. FORECAST accuracy (descriptive, the buildable goal): on the OOS half, does the
 *      day's actual dominant reversal land within tolerance of the predicted k_fade×σ
 *      line? Reported next to the median line (C×σ) so you can SEE the fade-back line
 *      sits inside the median for FX.
 *   2. GATED FADE (the trade, from the walkthrough's "range-budget" filter): fade the
 *      extended extreme back to the open ONLY once the day has consumed ≥ budgetFrac of
 *      the CALIBRATED range — costed, IS/OOS, vs an ungated baseline. Prior: still null,
 *      but it's the one specific walkthrough variant we hadn't cleanly isolated.
 *
 * Pure; composes buildLondonDaily + yzVolSeries + _zigzag. No new vol math.
 */
import { buildLondonDaily } from './volEstimatorAB.js';
import { yzVolSeries } from './volBacktestEngine.js';
import { _zigzag } from './reversalPointResearch.js';
import { summarizeTrades } from './metricsCore.js';
import { pipSize } from './instrumentRegistry.js';
import { pairType, COST_PIPS } from './crossPairResearch.js';

const _sort = a => [...a].sort((x, y) => x - y);
const _median = a => { if (!a.length) return 0; const s = _sort(a); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const _mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const r3 = (x, d = 3) => x == null || !isFinite(x) ? null : +x.toFixed(d);

// The day's dominant reversal run (%), from the running extreme — the realized fade-back
// distance. Returns { up, dn } (largest high-run and low-run), % of open. thr in price units.
function _dominantRuns(bars, open, thr) {
  let rl = bars[0].low, rh = bars[0].high, ptr = 0, domHi = 0, domLo = 0;
  for (const p of _zigzag(bars, thr).slice(1)) {
    while (ptr <= p.idx) { if (bars[ptr].low < rl) rl = bars[ptr].low; if (bars[ptr].high > rh) rh = bars[ptr].high; ptr++; }
    const re = p.kind === 'high' ? (p.price - rl) / open * 100 : (rh - p.price) / open * 100;
    if (re > 0) { if (p.kind === 'high') { if (re > domHi) domHi = re; } else { if (re > domLo) domLo = re; } }
  }
  return { up: domHi, dn: domLo };
}

// One day's range-budget-gated fade: once the running range consumes ≥ budgetFrac of the
// calibrated range, fade the extended extreme back to the OPEN; stop beyond the extreme.
// Returns net pips (after cost) or null if no gate fired / no bars after entry.
function _gatedFadeDay(bars, open, calRangeFrac, budgetFrac, pip, cost, buffer = 2) {
  const gateRange = budgetFrac * calRangeFrac * open;   // price-units the H-L must span
  let runHi = bars[0].high, runLo = bars[0].low, gateIdx = -1;
  for (let k = 0; k < bars.length; k++) {
    if (bars[k].high > runHi) runHi = bars[k].high;
    if (bars[k].low < runLo) runLo = bars[k].low;
    if ((runHi - runLo) >= gateRange) { gateIdx = k; break; }
  }
  if (gateIdx < 0 || gateIdx >= bars.length - 1) return null;   // never gated, or no room to trade
  const upExt = (runHi - open) >= (open - runLo);               // which extreme did the budget reach?
  const entry = bars[gateIdx].close;
  const stopPx = upExt ? runHi + buffer * pip : runLo - buffer * pip;
  const stopPips = Math.abs(entry - stopPx) / pip;
  for (let k = gateIdx + 1; k < bars.length; k++) {
    const hitStop = upExt ? bars[k].high >= stopPx : bars[k].low <= stopPx;
    const hitTgt = upExt ? bars[k].low <= open : bars[k].high >= open;   // target = the open
    if (hitStop) return -stopPips - cost;                        // conservative: stop first on a tie
    if (hitTgt) return Math.abs(entry - open) / pip - cost;
  }
  const last = bars.at(-1).close;                                // unresolved → mark to close
  return (upExt ? entry - last : last - entry) / pip - cost;
}

export function exhaustionForecast(intraday, opts = {}) {
  const { pair = 'EURUSD', isFrac = 0.5, budgetFrac = 0.8, tolPct = 0.20, minLookback = 40, minBarsPerDay = 6, revFrac = 0.25 } = opts;
  const lond = buildLondonDaily(intraday);
  if (lond.length < 120) return { insufficient: true, nDays: lond.length };
  const type = pairType(pair), pip = pipSize(pair), cost = COST_PIPS[type] ?? 2.5;
  const yz = yzVolSeries(lond, 30);
  const splitIdx = Math.floor(lond.length * isFrac);
  const dayRangePrice = lond.map(d => d.high - d.low).filter(x => x > 0);
  const thr = revFrac * _median(dayRangePrice);

  // ── IS: estimate k_fade (fade-back ÷ σ) and C_cal (calibrated median ÷ σ) ──
  const fadeOverSig = [], hlOverSig = [];
  for (let i = minLookback; i < splitIdx; i++) {
    const d = lond[i]; const sig = yz[i - 1];
    if (!(sig > 0) || !d.bars || d.bars.length < minBarsPerDay || !(d.open > 0)) continue;
    const sp = sig * 100;
    const { up, dn } = _dominantRuns(d.bars, d.open, thr);
    if (up > 0) fadeOverSig.push(up / sp);
    if (dn > 0) fadeOverSig.push(dn / sp);
    hlOverSig.push((d.high - d.low) / d.open * 100 / sp);
  }
  if (fadeOverSig.length < 30) return { insufficient: true, reason: 'too few IS dominant reversals', nDays: lond.length };
  const kFade = _median(fadeOverSig);        // exhaustion constant: fade-back distance ÷ σ
  const cCal = _median(hlOverSig);           // calibrated median constant: realized range ÷ σ

  // ── OOS panel 1: exhaustion-line forecast accuracy ──
  const predicted = [], actual = []; let hit = 0, n1 = 0;
  // ── Gated fade (both segments) ──
  const fade = { is: { pnls: [], dates: [] }, oos: { pnls: [], dates: [] } };
  const fadeUngated = { is: { pnls: [], dates: [] }, oos: { pnls: [], dates: [] } };
  for (let i = minLookback; i < lond.length; i++) {
    const d = lond[i]; const sig = yz[i - 1];
    if (!(sig > 0) || !d.bars || d.bars.length < minBarsPerDay || !(d.open > 0)) continue;
    const sp = sig * 100;
    const seg = i < splitIdx ? 'is' : 'oos';
    const exhDist = kFade * sp;               // predicted fade-back distance, %
    const calRangeFrac = cCal * sig;          // calibrated median range, fraction

    if (seg === 'oos') {
      const { up, dn } = _dominantRuns(d.bars, d.open, thr);
      const act = Math.max(up, dn);           // the day's dominant fade-back (the larger swing)
      if (act > 0 && exhDist > 0) {
        n1++; predicted.push(exhDist); actual.push(act);
        if (Math.abs(act - exhDist) / exhDist <= tolPct) hit++;
      }
    }
    // gated fade (budget on calibrated range) + ungated baseline (fade first extreme to open)
    const g = _gatedFadeDay(d.bars, d.open, calRangeFrac, budgetFrac, pip, cost);
    if (g != null) { fade[seg].pnls.push(g); fade[seg].dates.push(d.date); }
    const u = _gatedFadeDay(d.bars, d.open, calRangeFrac, 0, pip, cost);   // budgetFrac 0 ⇒ gate on bar 0 = ungated
    if (u != null) { fadeUngated[seg].pnls.push(u); fadeUngated[seg].dates.push(d.date); }
  }

  const summ = s => summarizeTrades(s.pnls, s.dates);
  return {
    pair, type, pip, cost, isFrac, budgetFrac, tolPct,
    nDays: lond.length, dateFrom: lond[0].date, dateTo: lond.at(-1).date, splitDate: lond[splitIdx]?.date,
    // The constants: exhaustion (fade-back) vs the calibrated median. kFade < cCal ⇒ price
    // fades back BEFORE the median line (FX); kFade > cCal ⇒ overshoots (indices/gold).
    kFade: r3(kFade), cCal: r3(cCal), fadeVsMedian: r3(cCal > 0 ? kFade / cCal : null),
    // Panel 1 — is the exhaustion LINE an accurate forecast of the turn (descriptive)?
    forecast: {
      nDays: n1,
      predictedPct: r3(_mean(predicted), 4), actualPct: r3(_mean(actual), 4),
      hitRatePct: n1 ? r3(hit / n1 * 100, 1) : null,
      actualOverPredicted: r3(_mean(predicted) > 0 ? _mean(actual) / _mean(predicted) : null),
    },
    // Panel 2 — the gated fade trade (the walkthrough's range-budget filter), costed.
    gatedFade: { is: summ(fade.is), oos: summ(fade.oos) },
    ungatedFade: { is: summ(fadeUngated.is), oos: summ(fadeUngated.oos) },
  };
}
