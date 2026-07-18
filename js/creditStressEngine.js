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

export const CSI_SERIES = {
  aaaOas: { id: 'BAMLC0A1CAAA', lagDays: 2 },   // ICE BofA AAA OAS
  bbbOas: { id: 'BAMLC0A4CBBB', lagDays: 2 },   // ICE BofA BBB OAS
  hyOas:  { id: 'BAMLH0A0HYM2', lagDays: 2 },   // ICE BofA High Yield OAS
  vix:    { id: 'VIXCLS',       lagDays: 1 },
};

// Fetch the four series and assemble the CSI component set:
//   quality = BBB − AAA (computed on common dates), hyOas, vix.
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

  // quality spread = BBB − AAA on common (already lag-shifted, identical-lag) dates
  const aaa = new Map(raw.aaaOas.map(p => [p.d, p.v]));
  const quality = raw.bbbOas
    .filter(p => Number.isFinite(aaa.get(p.d)))
    .map(p => ({ d: p.d, v: p.v - aaa.get(p.d) }));

  return {
    components: { quality, hyOas: raw.hyOas, vix: raw.vix },
    vixSeries: raw.vix,
    availability,
  };
}
