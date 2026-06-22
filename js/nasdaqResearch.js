// js/nasdaqResearch.js
//
// Lead-lag cross-correlation + feature importance research tools — answers
// the framework's core research questions (does RRP lead NASDAQ? does TGA?
// does the composite LiquidityScore predict forward returns? which Gate 2
// indicator carries the most signal?) using only simple, fully transparent
// rank-correlation statistics — never a black-box model, per the framework's
// "favor simple over complex" mandate.
//
// Operates on already-computed series (dates, closes, Gate 1 records, Gate 2
// indicator series) — no I/O, no gate logic of its own. "Composite Global
// Liquidity Index" in the research questions is Gate 1's own LiquidityScore
// (nasdaqLiquidityEngine.js) — reused as-is rather than built a second time,
// so there is exactly one liquidity composite in the whole framework, fully
// traceable to its components.
//
// Self-contained: does not import from, or share logic with, any other
// research/backtest system already in this repository.

import { RESEARCH } from './nasdaqConfig.js';
import { diff, pearsonCorr, spearmanCorr, corrTStat } from './nasdaqTransforms.js';

const corrFn = RESEARCH.correlationMethod === 'pearson' ? pearsonCorr : spearmanCorr;

export function forwardReturns(closes, horizonDays) {
  const out = new Array(closes.length).fill(NaN);
  for (let i = 0; i + horizonDays < closes.length; i++) {
    const c0 = closes[i], c1 = closes[i + horizonDays];
    if (Number.isFinite(c0) && c0 !== 0 && Number.isFinite(c1)) out[i] = (c1 - c0) / c0;
  }
  return out;
}

function alignedPairCount(x, y) {
  let n = 0;
  for (let i = 0; i < x.length; i++) if (Number.isFinite(x[i]) && Number.isFinite(y[i])) n++;
  return n;
}

// Tests whether driverSeries[i] correlates with targetSeries[i + lag] for
// every lag in [minLag, maxLag]. lag > 0 means the driver LEADS the target by
// `lag` days (today's driver value vs. the target `lag` days later) — the
// economically interesting direction for "does liquidity lead price".
// lag < 0 tests the reverse (does price lead the driver).
export function leadLagCorrelation(driverSeries, targetSeries, opts = {}) {
  const [minLag, maxLag] = opts.lagRange || RESEARCH.lagRangeDays;
  const n = driverSeries.length;
  const out = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    const x = [], y = [];
    for (let i = 0; i < n; i++) {
      const j = i + lag;
      if (j < 0 || j >= n) continue;
      x.push(driverSeries[i]);
      y.push(targetSeries[j]);
    }
    const r = corrFn(x, y);
    const validN = alignedPairCount(x, y);
    out.push({ lag, r: Number.isFinite(r) ? r : null, n: validN, tStat: Number.isFinite(r) ? corrTStat(r, validN) : null });
  }
  return out;
}

export function strongestLag(leadLagResults) {
  return leadLagResults.reduce((best, cur) => (Number.isFinite(cur.r) && (!best || Math.abs(cur.r) > Math.abs(best.r))) ? cur : best, null);
}

// One lead-lag table per forward-return horizon in RESEARCH.forwardReturnHorizonsDays.
export function leadLagStudy(driverSeries, closes, opts = {}) {
  const horizons = opts.horizons || RESEARCH.forwardReturnHorizonsDays;
  return horizons.map(horizonDays => {
    const target = forwardReturns(closes, horizonDays);
    const results = leadLagCorrelation(driverSeries, target, opts);
    return { horizonDays, results, strongest: strongestLag(results) };
  });
}

// Ranks each named feature series by its same-day (lag 0) rank correlation
// with one target series — a transparent, auditable substitute for a
// black-box feature-importance model.
export function featureImportanceRanking(featuresById, targetSeries) {
  const ranking = [];
  for (const [id, series] of Object.entries(featuresById)) {
    const r = corrFn(series, targetSeries);
    const n = alignedPairCount(series, targetSeries);
    ranking.push({ id, r: Number.isFinite(r) ? r : null, n, tStat: Number.isFinite(r) ? corrTStat(r, n) : null });
  }
  return ranking.sort((a, b) => Math.abs(b.r ?? 0) - Math.abs(a.r ?? 0));
}

// ── Full research suite ──────────────────────────────────────────────────────
//
// Pulls the named series the spec's research questions are actually about
// (ΔRRP, ΔTGA, the composite LiquidityScore, and a panel of Gate 2
// indicators) straight out of Gate 1's per-component breakdown and Gate 2's
// indicator series — nothing here is fetched or recomputed independently of
// the gates' own math, so a research finding can always be traced back to
// exactly the same numbers the live gates use.
//
// gate1: nasdaqLiquidityEngine.runLiquidityEngine output (one record/day).
// indicators: nasdaqTrendEngine.computeIndicatorSeries output.
export function runResearchSuite({ closes, gate1, indicators }) {
  const seriesFromGate1 = (inputId, field = 'rawValue') =>
    gate1.map(rec => {
      const comp = rec.components.find(c => c.id === inputId);
      return comp ? (comp[field] ?? NaN) : NaN;
    });

  const rrpLevel = seriesFromGate1('rrp');
  const tgaLevel = seriesFromGate1('tga');
  const rrpDelta = diff(rrpLevel, 1);
  const tgaDelta = diff(tgaLevel, 1);
  const liquidityScore = gate1.map(rec => Number.isFinite(rec.score) ? rec.score : NaN);

  const leadLag = {
    rrpDelta: leadLagStudy(rrpDelta, closes),
    tgaDelta: leadLagStudy(tgaDelta, closes),
    liquidityScore: leadLagStudy(liquidityScore, closes),
  };

  const importanceHorizonDays = RESEARCH.forwardReturnHorizonsDays[Math.floor(RESEARCH.forwardReturnHorizonsDays.length / 2)];
  const importanceTarget = forwardReturns(closes, importanceHorizonDays);

  const featuresById = {
    liquidityScore,
    rrpDelta, tgaDelta,
    walcl: seriesFromGate1('walcl'),
    dxy: seriesFromGate1('dxy'),
    credit: seriesFromGate1('credit'),
    vix: seriesFromGate1('vix'),
    adx: indicators.adx,
    hurst: indicators.hurst,
    atrPercentile: indicators.atrPercentile,
    momentum: indicators.momentum,
  };

  return {
    leadLag,
    importance: { horizonDays: importanceHorizonDays, ranking: featureImportanceRanking(featuresById, importanceTarget) },
  };
}
