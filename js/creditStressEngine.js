// creditStressEngine.js — I/O for the credit-stress (CSI) overlay test.
//
// Owns the FRED series ids + publication lags; the index math and the frozen
// gate/verdict live in creditStressCore (pure). Prices for the target books come
// from the caller (server.js — same TREND_UNIVERSE D1 fetch as /api/trend-basket).
//
// Lags (frozen in CREDIT_STRESS_TEST.md): BAML OAS series post next business
// day → +2 calendar days; VIX closes same evening → +1. The gate then applies
// as-of ≤ t−1 on top (core), so day t is sized by an index it could really have had.

import { fetchFredObservations } from './zscoreSpreadEngine.js';
import { toLaggedSeries } from './econTrendEngine.js';

// 2026-07-18 amendment (CREDIT_STRESS_TEST.md): the ICE BofA OAS series
// (BAMLC0A1CAAA/BAMLC0A4CBBB/BAMLH0A0HYM2) are now served by FRED with only a
// trailing ~3y window (observed live: 787 obs from 2023-07-20), which left the
// CSI non-existent before mid-2024 and invalidated run 1. Credit legs moved to
// the Moody's series — daily, unrestricted, history since 1986. Do not switch
// back without re-verifying the ICE history is unrestricted again.
export const CSI_SERIES = {
  aaa10y: { id: 'AAA10Y', lagDays: 2 },   // Moody's Aaa yield − 10Y Treasury
  baa10y: { id: 'BAA10Y', lagDays: 2 },   // Moody's Baa yield − 10Y Treasury (credit spread)
  vix:    { id: 'VIXCLS', lagDays: 1 },
};

// Fetch the series and assemble the CSI component set:
//   quality = Baa − Aaa (quality slope, computed on common dates),
//   credit  = Baa − 10Y (BAA10Y as-is), vix.
// vix is also returned standalone for the VIX-only baseline gate.
// Fail-soft per series with an availability table; throws only if a component
// needed for the composite is entirely missing (the test can't run without it).
export async function buildCsiInputs(fredKey, fromDate = '2004-01-01') {
  const raw = {}, availability = [];
  await Promise.all(Object.entries(CSI_SERIES).map(async ([key, cfg]) => {
    try {
      const obs = await fetchFredObservations(cfg.id, fromDate, fredKey);
      const s = toLaggedSeries(obs, cfg.lagDays);
      raw[key] = s;
      availability.push({ component: key, series: cfg.id, n: s.length, first: s[0]?.d ?? null, last: s[s.length - 1]?.d ?? null });
    } catch (e) {
      availability.push({ component: key, series: cfg.id, n: 0, error: e.message });
    }
  }));

  for (const key of Object.keys(CSI_SERIES)) {
    if (!raw[key]?.length) throw new Error(`CSI component ${key} (${CSI_SERIES[key].id}) unavailable — cannot run the composite`);
  }

  // quality slope = (Baa−10Y) − (Aaa−10Y) = Baa − Aaa, on common lag-shifted dates
  const aaa = new Map(raw.aaa10y.map(p => [p.d, p.v]));
  const quality = raw.baa10y
    .filter(p => Number.isFinite(aaa.get(p.d)))
    .map(p => ({ d: p.d, v: p.v - aaa.get(p.d) }));

  return {
    components: { quality, credit: raw.baa10y, vix: raw.vix },
    vixSeries: raw.vix,
    availability,
  };
}
