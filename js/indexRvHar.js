/**
 * Index RV-HAR σ — the VALIDATED realized-vol HAR, done right.
 *
 * The earlier index HAR (the f.har shadow) built HAR on Garman-Klass daily-RANGE
 * realised variance, whose proxy literally "assumes no gap" (volForecastBench) — so
 * for equity indices it misses overnight gaps AND the intraday path, understating σ
 * by ~half (SPX 9.5% vs a true ~19%). This computes realised variance the honest way
 * — from the intraday (5-min) PATH, √Σ of intraday returns per day — then runs the
 * SAME forward-HAR machinery (`sigmaSeriesForExport('harRV')`) the shadow used, just
 * fed a real realised-variance series. This is the estimator the horse race / σ A/B
 * actually validated.
 *
 * Pure: intraday bars in → forward σ out. The server injects the loader + gap-fill.
 */
import { buildLondonDaily, realizedSigmaSeries } from './volEstimatorAB.js';
import { sigmaSeriesForExport } from './volForecastBench.js';

/**
 * @param intraday  ascending intraday bars {time,open,high,low,close} (5-min preferred)
 * @returns { sigmaFwd, volAnnual, nDays, lastDate } or { insufficient, nDays }
 */
export function rvHarSigma(intraday, { minDays = 80 } = {}) {
  if (!Array.isArray(intraday) || intraday.length < 500) return { insufficient: true, nDays: 0 };
  const daily = buildLondonDaily(intraday);
  if (daily.length < minDays) return { insufficient: true, nDays: daily.length };
  const sigRV = realizedSigmaSeries(daily);                        // per-day realised σ from the intraday path
  const rv = sigRV.map(s => (s > 0 ? s * s : 1e-12));             // → realised VARIANCE series (aligned to daily)
  const ohlc = daily.map(d => ({ open: d.open, high: d.high, low: d.low, close: d.close }));
  const { series, sigmaFwd } = sigmaSeriesForExport(ohlc, 'harRV', { rv });   // same forward-HAR path, real RV
  if (!Number.isFinite(sigmaFwd) || sigmaFwd <= 0 || (series?.length ?? 0) < 60)
    return { insufficient: true, nDays: daily.length };
  return {
    sigmaFwd,
    volAnnual: +(sigmaFwd * Math.sqrt(252) * 100).toFixed(2),      // annualised %, matches the export's vol line
    nDays: daily.length,
    lastDate: daily[daily.length - 1]?.date ?? null,
  };
}
