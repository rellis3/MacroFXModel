/**
 * Asset position for the Market State Engine (owner, 2026-11-01: "global position, country position, then asset /
 * stock position").
 *
 * Pure: reads the scan board's drill bundle the server already keeps (_drillBundle: {dates, series} on one date spine;
 * FRED rates/credit, Cboe internals, Yahoo sector ETFs and the 12 largest index weights, OANDA markets) and returns:
 *   sectors   11 SPDR sectors + semis + equal-weight, return and return relative to SPY over 20 / 60 sessions
 *   leaders   the 12 largest names, same measures plus distance from the 1-year high
 *   breadth   equal-weight vs cap-weight (RSP / SPY) and its percentile
 *   internals Cboe dispersion, 1M/3M implied correlation, single-name vol vs VIX, with percentiles over the bundle
 *   credit    IG / HY / CCC spreads, 20-session change in bp and percentile
 *   drivers   each sector's measured 60-session beta to the 10Y yield, oil and the dollar (daily changes) — how one
 *             thing moves another right now, measured, not assumed
 * Description only: sector rotation and breadth tilts are untested or null as forecasts here (breadth-tilt-semis).
 */

export const SECTORS = { xlk: 'Technology', xlc: 'Communication', xly: 'Consumer discretionary', xlf: 'Financials', xli: 'Industrials',
  xlb: 'Materials', xle: 'Energy', xlv: 'Health care', xlp: 'Consumer staples', xlu: 'Utilities', xlre: 'Real estate', smh: 'Semiconductors' };
export const LEADERS = { nvda: 'NVIDIA', aapl: 'Apple', msft: 'Microsoft', meta: 'Meta', amzn: 'Amazon', googl: 'Alphabet', tsla: 'Tesla', avgo: 'Broadcom',
  lly: 'Eli Lilly', jpm: 'JPMorgan', xom: 'Exxon', brk: 'Berkshire' };
const INTERNALS = { dspx: 'Dispersion (DSPX)', cor1m: '1M implied correlation', cor3m: '3M implied correlation', vixeq: 'Single-name vol (VIXEQ)' };

const fin = v => typeof v === 'number' && Number.isFinite(v);
const r1 = v => (fin(v) ? Math.round(v * 10) / 10 : null);
const r2 = v => (fin(v) ? Math.round(v * 100) / 100 : null);

/** Last finite index at or before i. */
function lastIdx(a, i = a.length - 1) { for (let k = i; k >= 0; k--) if (fin(a[k])) return k; return -1; }

/** % change over n sessions of the date spine, from the last finite value. */
export function retN(a, n) {
  const i = lastIdx(a); if (i < 0) return null;
  const j = lastIdx(a, i - n); if (j < 0) return null;
  return a[j] ? (a[i] / a[j] - 1) * 100 : null;
}

/** Percentile of the last value within the series' finite history (0-100). */
export function pctOf(a) {
  const v = a.filter(fin); if (v.length < 60) return null;
  const last = v[v.length - 1];
  return Math.round(100 * v.filter(x => x < last).length / v.length);
}

/** OLS beta of daily % change of y on daily change of x (x in its own units), last n paired sessions. */
export function beta(y, x, n = 60, xIsLevel = true) {
  const pairs = [];
  for (let i = y.length - 1; i > 0 && pairs.length < n; i--) {
    if (![y[i], y[i - 1], x[i], x[i - 1]].every(fin) || !y[i - 1]) continue;
    pairs.push([(y[i] / y[i - 1] - 1) * 100, xIsLevel ? x[i] - x[i - 1] : (x[i] / x[i - 1] - 1) * 100]);
  }
  if (pairs.length < n * 0.7) return null;
  const mx = pairs.reduce((s, p) => s + p[1], 0) / pairs.length, my = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [yy, xx] of pairs) { sxy += (xx - mx) * (yy - my); sxx += (xx - mx) ** 2; syy += (yy - my) ** 2; }
  return sxx > 0 ? { beta: sxy / sxx, r: sxy / Math.sqrt(sxx * syy), n: pairs.length } : null;
}

export function summariseAssets(bundle) {
  const S = bundle?.series ?? {}, dates = bundle?.dates ?? [];
  if (!dates.length) return null;
  const spy = S.spy ?? [];
  const spy20 = retN(spy, 20), spy60 = retN(spy, 60);
  const row = (k, label) => {
    const a = S[k]; if (!a?.some(fin)) return null;
    const r20 = retN(a, 20), r60 = retN(a, 60);
    const i = lastIdx(a), yr = a.slice(Math.max(0, i - 251), i + 1).filter(fin);
    return { key: k, label, last: r2(a[i]), asOf: dates[i], ret20: r1(r20), ret60: r1(r60),
      rel20: r20 != null && spy20 != null ? r1(r20 - spy20) : null, rel60: r60 != null && spy60 != null ? r1(r60 - spy60) : null,
      offHigh: yr.length ? r1((a[i] / Math.max(...yr) - 1) * 100) : null };
  };
  const sectors = Object.entries(SECTORS).map(([k, l]) => row(k, l)).filter(Boolean).sort((a, b) => (b.rel20 ?? -99) - (a.rel20 ?? -99));
  const leaders = Object.entries(LEADERS).map(([k, l]) => row(k, l)).filter(Boolean).sort((a, b) => (b.rel20 ?? -99) - (a.rel20 ?? -99));

  // Breadth: equal weight vs cap weight.
  let breadth = null;
  if (S.rsp?.some(fin) && spy.some(fin)) {
    const ratio = dates.map((_, i) => (fin(S.rsp[i]) && fin(spy[i]) && spy[i] ? S.rsp[i] / spy[i] : null));
    breadth = { ratioChg20: r1(retN(ratio, 20)), ratioChg60: r1(retN(ratio, 60)), pct: pctOf(ratio), since: dates[ratio.findIndex(fin)] ?? null,
      read: retN(ratio, 20) == null ? null : retN(ratio, 20) < -1 ? 'narrowing: the cap-weighted index is leaning on its largest names' : retN(ratio, 20) > 1 ? 'broadening: the average stock is keeping up' : 'steady' };
  }

  const internals = Object.entries(INTERNALS).map(([k, label]) => {
    const a = S[k]; if (!a?.some(fin)) return null;
    const i = lastIdx(a);
    return { key: k, label, last: r2(a[i]), asOf: dates[i], chg20: r2(fin(a[lastIdx(a, i - 20)]) ? a[i] - a[lastIdx(a, i - 20)] : null), pct: pctOf(a), since: dates[a.findIndex(fin)] ?? null };
  }).filter(Boolean);
  if (S.vixeq && S.vix) {
    const gap = dates.map((_, i) => (fin(S.vixeq[i]) && fin(S.vix[i]) ? S.vixeq[i] - S.vix[i] : null));
    const i = lastIdx(gap);
    if (i >= 0) internals.push({ key: 'vixeq_vix', label: 'Single-name vol minus VIX', last: r2(gap[i]), asOf: dates[i], chg20: null, pct: pctOf(gap), since: dates[gap.findIndex(fin)] ?? null });
  }

  const credit = [['ig', 'Investment grade OAS'], ['hy', 'High yield OAS'], ['ccc', 'CCC OAS']].map(([k, label]) => {
    const a = S[k]; if (!a?.some(fin)) return null;
    const i = lastIdx(a), j = lastIdx(a, i - 20);
    return { key: k, label, last: r2(a[i]), asOf: dates[i], chg20bp: j >= 0 ? Math.round((a[i] - a[j]) * 100) : null, pct: pctOf(a) };
  }).filter(Boolean);

  // Drivers: sector sensitivity to 10Y yield (per 10bp), oil (per 1%), dollar (per 1%), last 60 sessions.
  const oil = S.wti ?? S.oil ?? S.wtico ?? null, usd = S.dxy ?? null, y10 = S.us10y ?? null;
  const drivers = Object.keys(SECTORS).filter(k => S[k]?.some(fin)).map(k => {
    const by = y10 ? beta(S[k], y10, 60, true) : null, bo = oil ? beta(S[k], oil, 60, false) : null, bd = usd ? beta(S[k], usd, 60, false) : null;
    return { key: k, label: SECTORS[k], y10per10bp: by ? r2(by.beta / 10) : null, y10r: by ? r2(by.r) : null, oilBeta: bo ? r2(bo.beta) : null, oilR: bo ? r2(bo.r) : null, usdBeta: bd ? r2(bd.beta) : null, usdR: bd ? r2(bd.r) : null };
  });

  return {
    asOf: dates[dates.length - 1], from: dates[0], spy: { ret20: r1(spy20), ret60: r1(spy60) },
    sectors, leaders, breadth, internals, credit, drivers,
    driverKeys: { oil: oil ? (S.wti ? 'wti' : S.oil ? 'oil' : 'wtico') : null, usd: usd ? 'dxy' : null, y10: y10 ? 'us10y' : null },
    note: 'Description of where money is sitting inside the equity market and how each sector is moving with yields, oil and the dollar right now (60-session betas). Sector rotation and breadth tilts are untested or null as forecasts here.',
  };
}
