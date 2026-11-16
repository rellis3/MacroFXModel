// js/terminal/spreadsDerived.js: the series the "Spreads & ratios" board builds on top of the daily market bundle (/api/drill-series), and the maths for a
// DIVERGENCE (two related lines, each measured against its own recent past, and the gap between them). Pure: no DOM, no fetch, no clock.
//
// Two kinds of addition, both from data we already hold (no vendor):
//   1. the eight FRED series of /api/spread-extras (3-month bill, fed funds, term premium, SOFR, the Fed's floor, reverse repo, balance sheet, Treasury cash)
//      lined up with the bundle's dates, and
//   2. series computed from the bundle itself: the NZD/JPY and CHF/JPY crosses, CAD in dollars, the S&P 500's realised vol and the VIX's premium over it,
//      the stock-bond correlation, and net liquidity (balance sheet minus the Treasury's cash minus reverse repo).
// Point-in-time rule: a weekly series is lagged by one extra day (a Wednesday balance sheet is published on the Thursday), a series is never filled
// beyond its own cadence, and every rolling measure here uses only closes up to its own date.
import { BY_KEY } from './insightSeries.js';

export const fin = v => typeof v === 'number' && Number.isFinite(v);
const row = (key, label, group, kind, unit, extras = true) => ({ key, label, group, kind, level: true, go: null, unit, derived: true, needsExtras: extras });

/** What each added series IS, in the same shape as insightSeries.js rows, so the picker and the library can read them. */
export const DERIVED = [
  row('dtb3', 'US 3-month Treasury bill', 'rates', 'rate', '%'), row('dff', 'Fed funds rate (effective)', 'rates', 'rate', '%'),
  row('tp10', 'US 10-year term premium', 'rates', 'rate', '%'), row('sofr', 'SOFR (secured overnight rate)', 'rates', 'rate', '%'), row('iorb', "Fed's floor (interest on reserves)", 'rates', 'rate', '%'),
  row('rrp', 'Reverse-repo balance ($bn)', 'rates', 'rate', '$bn'), row('netliq', 'Net liquidity ($bn)', 'rates', 'rate', '$bn'),
  row('nzdjpy', 'NZD/JPY', 'fx', 'ratio', '', false), row('chfjpy', 'CHF/JPY', 'fx', 'ratio', '', false), row('cadusd', 'CAD in US dollars (1 / USD/CAD)', 'fx', 'ratio', '', false),
  row('rv21', 'S&P 500 realised vol (21 sessions)', 'vol', 'ratio', '%', false), row('vrp', 'VIX minus realised vol (points)', 'vol', 'rate', 'pts', false),
  row('sbcorr', 'Stock-bond correlation (60 sessions)', 'other', 'rate', '', false),
];
export const DERIVED_BY_KEY = Object.fromEntries(DERIVED.map(d => [d.key, d]));
/** One lookup for a series key: the bundle's own table first, then the added ones. */
export const seriesMeta = key => BY_KEY[key] ?? DERIVED_BY_KEY[key] ?? null;

const dayN = iso => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 864e5);
/** An extra series laid on the bundle's dates: the latest value known at each date, never carried further than maxGap days. lag = days before a value counts as known. */
export function alignTo(dates, ex, maxGap, lag = 0) {
  const out = new Array(dates.length).fill(null); if (!ex?.dates?.length) return out;
  let j = 0, last = null, lastD = -1e9;
  for (let i = 0; i < dates.length; i++) {
    const di = dayN(dates[i]);
    while (j < ex.dates.length && dayN(ex.dates[j]) + lag <= di) { if (fin(ex.values[j])) { last = ex.values[j]; lastD = dayN(ex.dates[j]); } j++; }
    if (last != null && di - lastD <= maxGap) out[i] = last;
  }
  return out;
}
const WEEKLY = new Set(['walcl', 'tga']);

/** The bundle with the added series in `series` (a new object: the cached bundle is not touched). extras may be null/failed: those series are then absent. */
export function augmentBundle(bundle, extras) {
  if (!bundle?.series || !Array.isArray(bundle.dates)) return bundle;
  const D = bundle.dates, S = { ...bundle.series }, ok = !!(extras?.ok && extras.series);
  const ex = {};
  if (ok) for (const k of ['dtb3', 'dff', 'tp10', 'sofr', 'iorb', 'rrp', 'walcl', 'tga']) if (extras.series[k]) ex[k] = alignTo(D, extras.series[k], WEEKLY.has(k) ? 10 : 7, WEEKLY.has(k) ? 1 : 0);
  for (const k of ['dtb3', 'dff', 'tp10', 'sofr', 'iorb', 'rrp']) if (ex[k]) S[k] = ex[k];
  if (ex.walcl && ex.tga && ex.rrp) S.netliq = D.map((_, i) => (fin(ex.walcl[i]) && fin(ex.tga[i]) && fin(ex.rrp[i]) ? +(ex.walcl[i] - ex.tga[i] - ex.rrp[i]).toFixed(1) : null));
  const B = bundle.series, both = (a, b, f) => (B[a] && B[b] ? D.map((_, i) => (fin(B[a][i]) && fin(B[b][i]) ? f(B[a][i], B[b][i]) : null)) : null);
  const nj = both('nzdusd', 'usdjpy', (a, b) => +(a * b).toFixed(4)); if (nj) S.nzdjpy = nj;
  const cj = both('usdjpy', 'usdchf', (a, b) => (b > 0 ? +(a / b).toFixed(4) : null)); if (cj) S.chfjpy = cj;
  if (B.usdcad) S.cadusd = D.map((_, i) => (fin(B.usdcad[i]) && B.usdcad[i] > 0 ? +(1 / B.usdcad[i]).toFixed(5) : null));
  if (B.spx) {
    const rv = realisedVol(B.spx, 21); S.rv21 = rv;
    if (B.vix) S.vrp = D.map((_, i) => (fin(B.vix[i]) && fin(rv[i]) ? +(B.vix[i] - rv[i]).toFixed(2) : null));
    if (B.us10y) S.sbcorr = rollingMoveCorr(B.spx, B.us10y, 60);
  }
  return { ...bundle, series: S, extrasOk: ok, extrasMissing: ok ? (extras.missing ?? []).map(m => m.key) : null };
}

/** Annualised realised vol (percent) of a price series over its last `win` returns, on the dates where it has a close. */
export function realisedVol(prices, win = 21) {
  const idx = []; prices.forEach((p, i) => { if (fin(p) && p > 0) idx.push(i); });
  const out = new Array(prices.length).fill(null);
  for (let k = win; k < idx.length; k++) {
    let m = 0; const r = []; for (let q = k - win + 1; q <= k; q++) { const v = Math.log(prices[idx[q]] / prices[idx[q - 1]]); r.push(v); m += v; }
    m /= win; let s2 = 0; for (const v of r) s2 += (v - m) ** 2;
    out[idx[k]] = +(Math.sqrt(s2 / (win - 1)) * Math.sqrt(252) * 100).toFixed(2);
  }
  return out;
}
/** Rolling correlation of the daily moves of a price (log change) and a yield (change in percentage points), over the last `win` paired moves. */
export function rollingMoveCorr(price, rate, win = 60) {
  const idx = []; price.forEach((p, i) => { if (fin(p) && p > 0 && fin(rate[i])) idx.push(i); });
  const out = new Array(price.length).fill(null), cx = [], cy = [];
  for (let k = 1; k < idx.length; k++) { cx.push(Math.log(price[idx[k]] / price[idx[k - 1]])); cy.push(rate[idx[k]] - rate[idx[k - 1]]); }
  for (let k = win; k <= cx.length; k++) {
    let mx = 0, my = 0; for (let q = k - win; q < k; q++) { mx += cx[q]; my += cy[q]; } mx /= win; my /= win;
    let sxy = 0, sxx = 0, syy = 0; for (let q = k - win; q < k; q++) { sxy += (cx[q] - mx) * (cy[q] - my); sxx += (cx[q] - mx) ** 2; syy += (cy[q] - my) ** 2; }
    out[idx[k]] = sxx > 0 && syy > 0 ? +(sxy / Math.sqrt(sxx * syy)).toFixed(3) : null;
  }
  return out;
}

// ── divergences ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const Z_WINDOW = 504;   // each line is measured against its own last two years of closes
/** A line in z-score units: a price or a volatility index in logs (it moves in proportion), a yield or a spread as it is. */
const transform = (key, v) => (seriesMeta(key)?.kind === 'ratio' ? (v > 0 ? Math.log(v) : NaN) : v);

/**
 * Two related lines, each as a z-score against ITS OWN trailing `win` closes (so nothing after a date is used on that date), and the gap between them:
 * gap = zx - sign * zy. sign +1 means "they usually rise together" (0 is in line); sign -1 means "they usually move opposite" (0 is in line).
 * Returns { dates, vals: gap, xz, yz, win } on the dates where both lines have a close, from the first date with a full window. null when a leg is missing.
 */
export function zgapSeries(bundle, def, win = Z_WINDOW) {
  const S = bundle?.series, dates = bundle?.dates; if (!S || !Array.isArray(dates)) return null;
  const X = S[def.x], Y = S[def.y]; if (!X || !Y) return null;
  const d = [], a = [], b = [];
  for (let i = 0; i < dates.length; i++) { const p = fin(X[i]) ? transform(def.x, X[i]) : NaN, q = fin(Y[i]) ? transform(def.y, Y[i]) : NaN; if (fin(p) && fin(q)) { d.push(dates[i]); a.push(p); b.push(q); } }
  if (d.length < win + 30) return null;
  const sign = def.sign === -1 ? -1 : 1, z = arr => { const out = new Array(arr.length).fill(null); let s = 0, s2 = 0;
    for (let i = 0; i < arr.length; i++) { s += arr[i]; s2 += arr[i] * arr[i]; if (i >= win) { s -= arr[i - win]; s2 -= arr[i - win] * arr[i - win]; } if (i >= win - 1) { const m = s / win, v = Math.max(0, s2 / win - m * m) * win / (win - 1), sd = Math.sqrt(v); out[i] = sd > 0 ? (arr[i] - m) / sd : null; } }
    return out; };
  const zx = z(a), zy = z(b), dd = [], vals = [], xz = [], yz = [];
  for (let i = 0; i < d.length; i++) if (fin(zx[i]) && fin(zy[i])) { dd.push(d[i]); xz.push(+zx[i].toFixed(3)); yz.push(+zy[i].toFixed(3)); vals.push(+(zx[i] - sign * zy[i]).toFixed(3)); }
  return dd.length >= 30 ? { dates: dd, vals, xz, yz, win, sign } : null;
}
