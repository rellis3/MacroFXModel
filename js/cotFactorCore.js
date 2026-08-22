// js/cotFactorCore.js — the COT positioning factor, DF-01's six-step method as a
// pure brick. Spec + pass bars: `MD files/COT_POSITIONING_FACTOR_TEST.md`.
//
// Why this exists when `_worker.js` already ranks COT: the worker's ranking is
// DISPLAY-grade — 156 weeks hard-capped, 7-day cache, no publication-lag shift,
// current-week rank only. A factor test needs the full history, a release-date
// alignment that cannot look ahead, and the whole series (not just the latest
// point). This brick owns exactly that, and owns NO fetching — history is passed
// in, so it is unit-testable on synthetic data with no network.
//
// It does NOT re-implement z-scores or percentiles: `statsCore` owns those. The
// repo already carries two verbatim copies of `pctRank`/`zScore` (`_worker.js`
// and `cot-extremes.html`); this is deliberately not a third.

import { rollingZScore, rollingPercentile } from './statsCore.js';

export const COT_WINDOW_WEEKS = 156;   // DF-01's "3-year percentile" — inherited, not tuned
export const MIN_WEEKS_QUALIFY = 260;  // 5y after lag; below this an instrument is excluded

// CFTC futures that quote the FOREIGN currency: a long JPY future is short
// USD/JPY, so the net must be flipped into pair terms. Net, share, z and
// percentile all flip together — flipping some and not others is the documented
// `grossRatio` bug (see LEGO_MODULES.md), never repeat it.
export const FLIP_SYMS = new Set(['JPY', 'CAD', 'CHF']);

// ── The factor-test universe ─────────────────────────────────────────────────
// The 8 CFTC contracts that map to an instrument with local M1 price history.
// Deliberately NARROWER than `_worker.js`'s 35-market display universe: index
// futures are omitted (no local index bars) and crosses are omitted entirely
// (their "positioning" is derived from two legs — a construction, not data).
//
// This is a fifth symbol table in a repo that already has four, which is a real
// cost — it earns its place by being a different universe for a different
// purpose (test, not display) and by carrying the price mapping the others
// don't. `dataset` pins provenance: mixing futures-only with the legacy
// options-and-futures-combined feed would silently change both the position
// universe and the OI denominator.
export const COT_FACTOR_UNIVERSE = [
  { sym: 'EUR',  name: 'EURO FX - CHICAGO MERCANTILE EXCHANGE',           dataset: 'tff',    flip: false, pair: 'eurusd' , oanda: 'EUR_USD' },
  { sym: 'GBP',  name: 'BRITISH POUND - CHICAGO MERCANTILE EXCHANGE',
    alt: ['BRITISH POUND STERLING - CHICAGO MERCANTILE EXCHANGE'],        dataset: 'tff',    flip: false, pair: 'gbpusd' , oanda: 'GBP_USD' },
  { sym: 'JPY',  name: 'JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE',      dataset: 'tff',    flip: true,  pair: 'usdjpy' , oanda: 'USD_JPY' },
  { sym: 'AUD',  name: 'AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE', dataset: 'tff',    flip: false, pair: 'audusd' , oanda: 'AUD_USD' },
  { sym: 'CAD',  name: 'CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE',   dataset: 'tff',    flip: true,  pair: 'usdcad' , oanda: 'USD_CAD' },
  { sym: 'CHF',  name: 'SWISS FRANC - CHICAGO MERCANTILE EXCHANGE',       dataset: 'tff',    flip: true,  pair: 'usdchf' , oanda: 'USD_CHF' },
  { sym: 'NZD',  name: 'NZ DOLLAR - CHICAGO MERCANTILE EXCHANGE',
    alt: ['NEW ZEALAND DOLLAR - CHICAGO MERCANTILE EXCHANGE'],            dataset: 'tff',    flip: false, pair: 'nzdusd' , oanda: 'NZD_USD' },
  { sym: 'GOLD', name: 'GOLD - COMMODITY EXCHANGE INC.',                  dataset: 'disagg', flip: false, pair: 'gold'   , oanda: 'XAU_USD' },
];

// Socrata dataset ids + the participant fields each one exposes. FX uses
// Leveraged Funds (TFF), gold uses Managed Money (Disaggregated) — neither is
// the legacy report's "Non-commercial" that DF-01's prose describes; the
// pre-registration states this explicitly rather than letting it pass as
// equivalent.
// Column names are NOT consistent between the two datasets — verified against the
// live schema via /api/cot-backfill/probe on 2026-08-22, not assumed:
//   TFF    → `lev_money_positions_long`      (NO `_all` suffix)
//   Disagg → `m_money_positions_long_all`    (WITH `_all`)
// The first backfill hard-coded the `_all` form for both, so every FX contract
// mapped to NaN while gold worked. Fallback chains mirror `_worker.js:1981-1982`,
// which is why the live dashboard was unaffected by the same trap.
export const COT_DATASETS = {
  tff: {
    id: 'gpe5-46if',
    long:  'lev_money_positions_long',
    short: 'lev_money_positions_short',
    longAlt:  ['lev_money_positions_long_all',  'leveraged_funds_long_all',  'lev_long'],
    shortAlt: ['lev_money_positions_short_all', 'leveraged_funds_short_all', 'lev_short'],
  },
  disagg: {
    id: '72hh-3qpy',
    long:  'm_money_positions_long_all',
    short: 'm_money_positions_short_all',
    // deliberately NOT `_old`/`_other` — those are separate contract-vintage
    // splits, not fallbacks for the combined figure
    longAlt:  ['m_money_positions_long'],
    shortAlt: ['m_money_positions_short'],
  },
};

// ── Publication lag ──────────────────────────────────────────────────────────
// COT is a TUESDAY snapshot released FRIDAY 15:30 ET. Frozen rule: a report
// dated T becomes tradable at the open of the FOLLOWING MONDAY (T + 6 days).
// One step more conservative than the earliest legal moment, which buys us out
// of the thin Friday-late session and the ET/London boundary for the cost of two
// days on a multi-week signal. No "optimal lag" is searched, now or ever.
//
// Takes and returns 'YYYY-MM-DD' (UTC-safe — Date.UTC, never local parsing).
export function tradableFrom(reportDate) {
  if (typeof reportDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return null;
  const [y, m, d] = reportDate.split('-').map(Number);
  // Derived from the actual rule, not a per-weekday table, so an off-cycle CFTC
  // date can never resolve to before its own release:
  //   release  = report + 3 days   (Tuesday snapshot → Friday 15:30 ET)
  //   tradable = first Monday STRICTLY after that release
  // For the normal Tuesday report this is report + 6 days.
  const release = Date.UTC(y, m - 1, d) + 3 * 86400000;
  const rdow = new Date(release).getUTCDay();    // 0=Sun … 5=Fri
  const toMonday = ((8 - rdow) % 7) || 7;        // strictly-future Monday
  return new Date(release + toMonday * 86400000).toISOString().slice(0, 10);
}

// ── The factor series ────────────────────────────────────────────────────────
// rows: [{ date:'YYYY-MM-DD', specLong, specShort, openInterest }] ascending.
// Returns one record per week:
//   { date, tradableFrom, specNet, share, z, pct }
// `share` is the OI-normalised net (DF-01 step 2) — the quantity that gets
// ranked. Ranking the RAW contract count instead conflates "more crowded" with
// "bigger market", which is the defect this whole exercise started from.
export function cotFactorSeries(rows, { flip = false, window = COT_WINDOW_WEEKS } = {}) {
  const seen = new Set();
  const clean = (Array.isArray(rows) ? rows : [])
    .filter(r => r && typeof r.date === 'string')
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    // De-duplicate by report date. Contract renames are real in this data (the
    // probe found BOTH "BRITISH POUND" and "BRITISH POUND STERLING" live), so
    // history is merged across names and the same week can arrive twice; a
    // duplicated week would corrupt every rolling window downstream.
    .filter(r => (seen.has(r.date) ? false : seen.add(r.date)));

  const share = clean.map(r => {
    const oi = Number(r.openInterest);
    const net = Number(r.specLong) - Number(r.specShort);
    if (!Number.isFinite(oi) || oi <= 0 || !Number.isFinite(net)) return NaN;
    return (flip ? -net : net) / oi;
  });

  const z   = rollingZScore(share, window);
  const pct = rollingPercentile(share, window);

  return clean.map((r, i) => {
    const net = Number(r.specLong) - Number(r.specShort);
    return {
      date: r.date,
      tradableFrom: tradableFrom(r.date),
      specNet: Number.isFinite(net) ? (flip ? -net : net) : null,
      share: Number.isFinite(share[i]) ? share[i] : null,
      z: Number.isFinite(z[i]) ? z[i] : null,
      pct: Number.isFinite(pct[i]) ? pct[i] : null,
    };
  });
}

// Does an instrument have enough post-lag history to enter the confirmatory
// cell? Contract renames truncate Socrata history silently, so this counts
// SCORED weeks (z present), not raw rows.
export function qualifies(series, minWeeks = MIN_WEEKS_QUALIFY) {
  return series.filter(s => s.z != null).length >= minWeeks;
}
