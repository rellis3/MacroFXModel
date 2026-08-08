// econTrendEngine.js — I/O for the economic-trend cross-sectional test.
//
// Owns the FRED series registry per currency and the PUBLICATION-LAG shift —
// the math lives in econTrendCore (pure), the portfolio machinery in
// trendBasketEngine (reused via directionAt), and prices come from the caller
// (server.js fetches OANDA D1, same universe as /api/trend-basket).
//
// Lags (frozen in ECON_TREND_TEST.md): FRED monthly observations are dated at
// month START; a month's value becomes usable only from obs-date + lag —
// US +35d (≈5 days after month end), foreign +75d (≈45 days after month end).
// Conservative on purpose; do not shorten to "get more signal".

import { fetchFredObservations, _shiftDate } from './zscoreSpreadEngine.js';

export const ECON_LAG_US = 35, ECON_LAG_FOREIGN = 75;

// Short-rate series reuse the ZSCORE_PAIRS/yield-spread family; y10/unemp are the
// OECD monthly harmonized series. A missing/renamed series degrades gracefully:
// the fetch error is reported and the currency scores on its remaining factors
// (econTrendCore requires ≥2 of the 3).
export const ECON_UNIVERSE = {
  USD: { lagDays: ECON_LAG_US, rate: 'GS2', y10: 'GS10', unemp: 'UNRATE' },
  EUR: { lagDays: ECON_LAG_FOREIGN, rate: 'IRSTCI01DEM156N', y10: 'IRLTLT01DEM156N', unemp: 'LRHUTTTTDEM156S' },
  GBP: { lagDays: ECON_LAG_FOREIGN, rate: 'IR3TIB01GBM156N', y10: 'IRLTLT01GBM156N', unemp: 'LRHUTTTTGBM156S' },
  JPY: { lagDays: ECON_LAG_FOREIGN, rate: 'IRSTCI01JPM156N', y10: 'IRLTLT01JPM156N', unemp: 'LRHUTTTTJPM156S' },
  AUD: { lagDays: ECON_LAG_FOREIGN, rate: 'IR3TIB01AUM156N', y10: 'IRLTLT01AUM156N', unemp: 'LRHUTTTTAUM156S' },
  CAD: { lagDays: ECON_LAG_FOREIGN, rate: 'IRSTCI01CAM156N', y10: 'IRLTLT01CAM156N', unemp: 'LRHUTTTTCAM156S' },
  CHF: { lagDays: ECON_LAG_FOREIGN, rate: 'IRSTCI01CHM156N', y10: 'IRLTLT01CHM156N', unemp: 'LRHUTTTTCHM156S' },
  // unemp corrected 2026-08-08: LRHUTTTTNZM156S (the nominally-monthly "M"
  // variant) could not be confirmed to exist via web search across repeated
  // targeted queries — New Zealand's Household Labour Force Survey is
  // genuinely quarterly at the source (Stats NZ), and the series that DOES
  // exist and was confirmed live is LRHUTTTTNZQ156S (Q4 2025 = 5.4%,
  // matching Stats NZ's own published release for that quarter exactly).
  // buildFundamentals() below has no cadence assumption (just fetches +
  // lag-shifts by a fixed day count), so this is a safe drop-in fix.
  NZD: { lagDays: ECON_LAG_FOREIGN, rate: 'IR3TIB01NZM156N', y10: 'IRLTLT01NZM156N', unemp: 'LRHUTTTTNZQ156S' },
};

const FACTORS = ['rate', 'y10', 'unemp'];

// Map(date→value) → publication-lag-shifted, sorted [{d,v}] (econTrendCore format).
export function toLaggedSeries(obs, lagDays) {
  const out = [];
  for (const [d, v] of obs) {
    if (Number.isFinite(v)) out.push({ d: _shiftDate(d, lagDays), v });
  }
  return out.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
}

// Fetch every (ccy, factor) series, shift by its publication lag, and report
// per-series availability. Never throws on a single bad series — the run
// proceeds on what loaded, and the availability table says what didn't.
export async function buildFundamentals(fredKey, fromDate = '2004-01-01') {
  const fundamentals = {}, availability = [];
  await Promise.all(Object.entries(ECON_UNIVERSE).map(async ([ccy, cfg]) => {
    fundamentals[ccy] = {};
    await Promise.all(FACTORS.map(async factor => {
      const seriesId = cfg[factor];
      try {
        const obs = await fetchFredObservations(seriesId, fromDate, fredKey);
        const s = toLaggedSeries(obs, cfg.lagDays);
        if (s.length) fundamentals[ccy][factor] = s;
        availability.push({
          ccy, factor, series: seriesId, n: s.length,
          first: s[0]?.d ?? null, last: s[s.length - 1]?.d ?? null,
        });
      } catch (e) {
        availability.push({ ccy, factor, series: seriesId, n: 0, error: e.message });
      }
    }));
  }));
  return { fundamentals, availability };
}
