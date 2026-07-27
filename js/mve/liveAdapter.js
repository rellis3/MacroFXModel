// mve/liveAdapter.js — hooks the Market Valuation Engine to REAL data (OANDA D1
// prices + FRED macro series). Split into a PURE builder (unit-testable, no
// network) and a thin fetch-and-run wrapper whose data sources are INJECTED, so
// the server passes in its existing fetchD1 / fetchFredSeries and nothing here
// hard-depends on server internals.
//
//   server.js:  runLiveMVE({ sym, fetchD1: _btFetchD1, fetchFred: fetchFredSeries,
//                            fredKey: process.env.FRED_KEY })
//
// Factor design (see MVE_RUN_GUIDE.md §6 and MARKET_VALUATION_ENGINE.md Part 4):
//   • Gold  → US 10y REAL yield (DFII10) + broad DXY (DTWEXBGS) — the proven
//             system-gold-macro model; both external daily drivers.
//   • FX    → US-vs-foreign RATE DIFFERENTIALS (10y + 2y/short) + US breakeven.
//             DXY is deliberately NOT a factor for FX: EUR is ~57% of DXY, so
//             regressing EUR/USD on DXY is near-tautological (circular fair value).
//   • NQ    → US 10y REAL yield (DFII10, discount-rate channel) + HY OAS
//             (BAMLH0A0HYM2, credit/risk-appetite channel) + VIX (VIXCLS, vol
//             risk-premium channel). Minimal-DOF first pass — DXY deliberately
//             left out (unlike gold): Nasdaq's earnings-translation channel from
//             a strong dollar is weaker/more debated than gold's, so it isn't
//             added just because gold's spec has it. Add it as a second config
//             later only if this 3-factor spec earns its keep OOS.

import { runMVE } from './index.js';

// ── Symbol maps ──────────────────────────────────────────────────────────────
export const OANDA_SYMBOL = {
  EURUSD: 'EUR_USD', GBPUSD: 'GBP_USD', USDJPY: 'USD_JPY', AUDUSD: 'AUD_USD', XAUUSD: 'XAU_USD',
  NQ: 'NAS100_USD',
};

// FRED series ids — same ids the live compass / fredhistory use (server.js
// _FREDHISTORY_SERIES). US legs use the DAILY DGS* series for resolution; foreign
// long yields are FRED's monthly IRLTLT01*M156N (forward-filled onto trading days).
export const FRED_ID = {
  us2y: 'DGS2', us10y: 'DGS10', tips: 'DFII10', bei: 'T10YIE', dxy: 'DTWEXBGS',
  de10y: 'IRLTLT01DEM156N', de_s: 'IRSTCI01DEM156N',
  gb10y: 'IRLTLT01GBM156N', gb_s: 'IR3TIB01GBM156N',
  jp10y: 'IRLTLT01JPM156N', jp_s: 'IRSTCI01JPM156N',
  au10y: 'IRLTLT01AUM156N', au_s: 'IR3TIB01AUM156N',
  vix: 'VIXCLS', hy: 'BAMLH0A0HYM2',   // same series ids as server.js's risk-flags/credit-gate — no second copy
};

// Per-symbol: which FRED keys to fetch, and how to assemble factors from the
// aligned arrays `f` (each `f[key]` is a number[] aligned to the price dates).
// OLS learns the sign, so differentials are passed raw (us − foreign).
const sub = (a, b) => a.map((v, i) => v - b[i]);
export const FACTOR_SPEC = {
  XAUUSD: { fred: ['tips', 'dxy'],
    factors: f => [{ name: 'real_yield', series: f.tips }, { name: 'dxy', series: f.dxy }] },
  EURUSD: { fred: ['us10y', 'de10y', 'us2y', 'de_s', 'bei'],
    factors: f => [{ name: 'rate_diff_10y', series: sub(f.us10y, f.de10y) }, { name: 'rate_diff_2y', series: sub(f.us2y, f.de_s) }, { name: 'breakeven', series: f.bei }] },
  GBPUSD: { fred: ['us10y', 'gb10y', 'us2y', 'gb_s', 'bei'],
    factors: f => [{ name: 'rate_diff_10y', series: sub(f.us10y, f.gb10y) }, { name: 'rate_diff_2y', series: sub(f.us2y, f.gb_s) }, { name: 'breakeven', series: f.bei }] },
  USDJPY: { fred: ['us10y', 'jp10y', 'us2y', 'jp_s', 'bei'],
    factors: f => [{ name: 'rate_diff_10y', series: sub(f.us10y, f.jp10y) }, { name: 'rate_diff_2y', series: sub(f.us2y, f.jp_s) }, { name: 'breakeven', series: f.bei }] },
  AUDUSD: { fred: ['us10y', 'au10y', 'us2y', 'au_s', 'bei'],
    factors: f => [{ name: 'rate_diff_10y', series: sub(f.us10y, f.au10y) }, { name: 'rate_diff_2y', series: sub(f.us2y, f.au_s) }, { name: 'breakeven', series: f.bei }] },
  NQ: { fred: ['tips', 'hy', 'vix'],
    factors: f => [{ name: 'real_yield', series: f.tips }, { name: 'hy_oas', series: f.hy }, { name: 'vix', series: f.vix }] },
};

export function normalizeSym(sym) {
  return String(sym || '').toUpperCase().replace(/[^A-Z]/g, '');   // 'EUR/USD' → 'EURUSD'
}

// Forward-fill a sorted [{date,value}] (or Map) onto a master date array — carries
// the last known value over weekends/holidays/reporting gaps.
export function ffAlign(dateIndex, series) {
  const pts = series instanceof Map
    ? [...series.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date < b.date ? -1 : 1)
    : [...series].sort((a, b) => a.date < b.date ? -1 : 1);
  let ptr = -1, last = NaN;
  return dateIndex.map(d => {
    while (ptr + 1 < pts.length && pts[ptr + 1].date <= d) { ptr++; last = pts[ptr].value; }
    return last;
  });
}

// ── PURE builder: (bars, fred) → runMVE context ─────────────────────────────
// bars: [{ date:'YYYY-MM-DD', close }] oldest-first (OANDA fetchD1 shape).
// fred: { <fredKey>: Map|[{date,value}] } for every key in the symbol's spec.
// Returns a ctx for runMVE, warmup-trimmed so no factor row is NaN.
export function buildContext(sym, bars, fred, opts = {}) {
  const key = normalizeSym(sym);
  const spec = FACTOR_SPEC[key];
  if (!spec) throw new Error(`MVE: no factor spec for ${sym}`);
  if (!bars || bars.length < 60) throw new Error(`MVE: need ≥60 bars for ${sym}, got ${bars?.length ?? 0}`);

  const dateIndex = bars.map(b => b.date);
  const closes = bars.map(b => b.close);

  const aligned = {};
  for (const fk of spec.fred) {
    if (!fred[fk]) throw new Error(`MVE: missing FRED series ${fk} (${FRED_ID[fk]}) for ${sym}`);
    aligned[fk] = ffAlign(dateIndex, fred[fk]);
  }
  const factors = spec.factors(aligned);

  // Trim leading rows where price or any factor is not finite (warmup before the
  // slowest series' first observation).
  let start = 0;
  const finiteAt = i => Number.isFinite(closes[i]) && factors.every(f => Number.isFinite(f.series[i]));
  while (start < closes.length && !finiteAt(start)) start++;
  const price = closes.slice(start);
  const trimmedFactors = factors.map(f => ({ name: f.name, series: f.series.slice(start) }));
  if (price.length < 60) throw new Error(`MVE: only ${price.length} usable rows for ${sym} after warmup trim`);

  const returns = price.slice(1).map((p, i) => p - price[i]);
  return {
    instrument: sym,
    price,
    factors: trimmedFactors,
    returns,
    marketPrice: price[price.length - 1],
    window: opts.window ?? 150,
    horizon: opts.horizon ?? 10,
    regime: opts.regime ?? 'NEUTRAL',
    crowdPct: opts.crowdPct ?? null,
    useSSM: opts.useSSM ?? false,
    asOf: dateIndex[dateIndex.length - 1],
    meta: { warmupTrimmed: start, factorNames: trimmedFactors.map(f => f.name), fredKeys: spec.fred },
  };
}

// ── Fetch + build the ctx (network via INJECTED fetchers) ───────────────────
// deps: { fetchD1(oandaSym,count)->bars, fetchFred(seriesId,fromDate,key)->Map, fredKey }
// Returns { ok, ctx, dataSource } or { ok:false, error }. Shared by runLiveMVE
// (valuation) and the OOS validation route.
export async function fetchContext({ sym, deps, count = 1500, fromDate = '2015-01-01', ...opts }) {
  const key = normalizeSym(sym);
  const oanda = OANDA_SYMBOL[key];
  const spec = FACTOR_SPEC[key];
  if (!oanda || !spec) return { ok: false, instrument: sym, error: `unsupported symbol ${sym}` };
  if (!deps?.fetchD1 || !deps?.fetchFred) return { ok: false, error: 'missing fetchers' };
  if (!deps.fredKey) return { ok: false, error: 'FRED_KEY not configured' };

  let bars;
  try { bars = await deps.fetchD1(oanda, count); }
  catch (e) { return { ok: false, instrument: sym, error: `OANDA ${oanda}: ${e.message}` }; }

  const fred = {};
  for (const fk of spec.fred) {
    try { fred[fk] = await deps.fetchFred(FRED_ID[fk], fromDate, deps.fredKey); }
    catch (e) { return { ok: false, instrument: sym, error: `FRED ${FRED_ID[fk]}: ${e.message}` }; }
  }

  let ctx;
  try { ctx = buildContext(sym, bars, fred, opts); }
  catch (e) { return { ok: false, instrument: sym, error: e.message }; }

  return { ok: true, ctx, dataSource: { oanda, fredKeys: spec.fred, bars: bars.length, usableRows: ctx.price.length, asOf: ctx.asOf } };
}

// Fetch-and-run: real data → valuation.
export async function runLiveMVE({ sym, deps, count = 800, fromDate = '2018-01-01', ...opts }) {
  const built = await fetchContext({ sym, deps, count, fromDate, ...opts });
  if (!built.ok) return built;
  const v = runMVE(built.ctx);
  v.dataSource = built.dataSource;
  return v;
}

export const SUPPORTED = Object.keys(FACTOR_SPEC);
