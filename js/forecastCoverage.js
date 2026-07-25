/**
 * Forecast Coverage — the interval-coverage card for the vol forecaster
 * (engine #13 of the analytics map, `ANALYTICS_ENGINE_DESIGN.md`).
 *
 * The bands promise specific frequencies, so score them as frequencies:
 *   • hl50 / hl75 are the 50th / 75th percentiles of the daily RANGE
 *     (high − low) — Feller range distribution × per-class correction.
 *   • ocMed / oc75 are the 50th / 75th percentiles of |close − open|
 *     (half-normal × correction).
 * Honest calibration ⇒ realized range ≤ hl50 on ~50% of days, ≤ hl75 on ~75%,
 * same for open-close. This brick measures exactly that, no-lookahead
 * (σ for day i comes from `volSigmaSeries`, which only reads bars < i), and
 * reports the deviation in binomial standard errors so "off" has a size.
 *
 * Measurement brick: it grades the ruler, it doesn't trade. Imports the band
 * math from `forecastCore` — never copies it (Lego Principle 1), so what this
 * card scores is byte-identical to what the forecaster and every backtest use.
 */

import { computeBands, volSigmaSeries } from './forecastCore.js';
import { fitGPD, quantileSorted } from './extremesCore.js';

// Binomial coverage read: k hits of n vs the band's nominal frequency.
// z = (observed − nominal)/SE(nominal) — |z| > 2 is a real miscalibration,
// not noise. Sample size travels with every number (house rule).
export function coverageStats(k, n, nominal) {
  if (!n) return { n: 0, cov: NaN, se: NaN, z: NaN, nominal };
  const cov = k / n;
  const se = Math.sqrt(nominal * (1 - nominal) / n);
  return { n, cov, se, z: (cov - nominal) / se, nominal };
}

const BAND_DEFS = [
  { key: 'hl50',  real: 'rangeFrac', nominal: 0.50 },
  { key: 'hl75',  real: 'rangeFrac', nominal: 0.75 },
  { key: 'ocMed', real: 'ocFrac',    nominal: 0.50 },
  { key: 'oc75',  real: 'ocFrac',    nominal: 0.75 },
];

// bars: D1 [{date, open, high, low, close}]. seriesFn injectable like
// forecastCore.nextSigma so tests can pin σ without faking the vol math.
export function coverageFromBars(bars, assetClass, {
  warmup = 60, rollWindow = 250, seriesFn = volSigmaSeries,
} = {}) {
  const sig = seriesFn(bars, assetClass);
  const days = [];
  for (let i = warmup; i < bars.length; i++) {
    const b = bars[i], s = sig[i];
    if (!s || s < 1e-8 || !b || !(b.open > 0)) continue;
    const f = computeBands(b.open, s, assetClass);
    days.push({
      date: b.date,
      rangeFrac: (b.high - b.low) / b.open,
      ocFrac: Math.abs(b.close - b.open) / b.open,
      hl50: f.hl50, hl75: f.hl75, ocMed: f.ocMed, oc75: f.oc75,
    });
  }

  // Overall coverage per band.
  const bands = {};
  for (const { key, real, nominal } of BAND_DEFS) {
    const k = days.reduce((s2, d) => s2 + (d[real] <= d[key] ? 1 : 0), 0);
    bands[key] = coverageStats(k, days.length, nominal);
  }

  // Per-year hl75/oc75 coverage — the concentration check: a healthy
  // full-sample 75% that is 85% pre-2020 and 60% after is a drifted ruler.
  const perYear = {};
  for (const d of days) {
    const y = String(d.date).slice(0, 4);
    const r = (perYear[y] ??= { n: 0, hl75: 0, oc75: 0 });
    r.n++;
    if (d.rangeFrac <= d.hl75) r.hl75++;
    if (d.ocFrac <= d.oc75) r.oc75++;
  }
  const perYearOut = Object.entries(perYear).map(([year, r]) => ({
    year, n: r.n,
    hl75: coverageStats(r.hl75, r.n, 0.75),
    oc75: coverageStats(r.oc75, r.n, 0.75),
  }));

  // Rolling hl75 coverage (trailing rollWindow days) — the drift trace.
  const rolling = [];
  let win = 0;
  for (let i = 0; i < days.length; i++) {
    if (days[i].rangeFrac <= days[i].hl75) win++;
    if (i >= rollWindow && days[i - rollWindow].rangeFrac <= days[i - rollWindow].hl75) win--;
    if (i >= rollWindow - 1) rolling.push({ date: days[i].date, cov: win / rollWindow });
  }

  // Ratio medians: median(range/hl50) should be ≈ 1.0 and median(range/hl75)
  // < 1 if the ruler is calibrated — a PIT-style location check that catches
  // a bias the hit-rates alone can under-report.
  const r50 = days.map(d => d.rangeFrac / d.hl50).sort((a, b) => a - b);
  const r75 = days.map(d => d.rangeFrac / d.hl75).sort((a, b) => a - b);

  // Tail severity: WHEN hl75 breaks, by how much? Mean excess ratio plus a
  // GPD shape on the excesses (extremesCore) — ξ > 0 says band breaks come
  // fat-tailed, so "just past the band" understates the real break risk.
  const exc = days.filter(d => d.rangeFrac > d.hl75).map(d => d.rangeFrac / d.hl75 - 1);
  const tail75 = {
    nExc: exc.length,
    excFrac: days.length ? exc.length / days.length : NaN,
    meanExcess: exc.length ? exc.reduce((s2, x) => s2 + x, 0) / exc.length : NaN,
    gpd: exc.length >= 30 ? fitGPD(exc) : null,
  };

  return {
    n: days.length,
    firstDate: days[0]?.date ?? null,
    lastDate: days[days.length - 1]?.date ?? null,
    bands,
    perYear: perYearOut,
    rolling,
    ratioMedian50: r50.length ? quantileSorted(r50, 0.5) : NaN,
    ratioMedian75: r75.length ? quantileSorted(r75, 0.5) : NaN,
    tail75,
  };
}
