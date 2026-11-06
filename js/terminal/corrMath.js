/**
 * The maths behind the Desk Terminal's Correlations & hedges tab (js/terminal/corrView.js, hedgeView.js), on the
 * daily-close panel /api/corr-terminal serves (js/corrHistoryCompute.js buildPanel).
 *
 * Everything is DESCRIPTIVE: correlations of daily log returns over trailing windows, ending on a given day, using
 * only that day and the days before it. Nothing here forecasts a return or claims a hedge will hold.
 *
 *   series(panel)                 the panel as daily log returns keyed by terminal id (GOLD, NQ, WTI ...)
 *   retOf(S, id)                  an instrument's returns; FX crosses of the eight currencies are built from their USD
 *                                 legs, "USD*" etc. are currency baskets (the currency against the other seven)
 *   corrAt / matrix / changes     window correlations, the matrix, and what changed most against the 120-day
 *   rolling / stability           a pair's rolling correlation, and how often its sign held over the last year
 *   rankHedges / bookHedges       hedge candidates ranked by |corr| x sign stability, with the min-variance ratio
 *   factors / factorBoard         rolling betas to DXY, the rates proxy, risk (S&P 500) and oil; which factor dominates
 *   volRegime / trendRegime / condCorr   regimes (point-in-time) and correlations conditional on them
 *
 * Pure: no DOM, no fetch. Tested by js/terminal/corrMath.test.mjs.
 */

export const CCY8 = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
export const WINDOWS = [20, 60, 120];
// the correlation build's OANDA names -> the terminal's market ids
const SYM_TO_ID = { XAUUSD: 'GOLD', XAGUSD: 'SILVER', XPTUSD: 'PLATINUM', XCUUSD: 'COPPER', WTICO_USD: 'WTI', BCO_USD: 'BRENT', NAS100_USD: 'NQ', SPX500_USD: 'SPX500', US30_USD: 'US30', US2000_USD: 'US2000' };
export const idOf = sym => SYM_TO_ID[sym] ?? String(sym ?? '').replace(/_/g, '');
export const LABEL = { GOLD: 'Gold', SILVER: 'Silver', PLATINUM: 'Platinum', COPPER: 'Copper', WTI: 'WTI', BRENT: 'Brent', NQ: 'Nasdaq 100', SPX500: 'S&P 500', US30: 'Dow', US2000: 'Russell 2000' };
export const labelOf = id => (LABEL[id] ?? (/^[A-Z]{3}\*$/.test(id) ? `${id.slice(0, 3)} basket` : /^[A-Z]{6}$/.test(id) ? `${id.slice(0, 3)}/${id.slice(3)}` : id));
// each currency's USD leg and the sign that turns it into "the currency's value in dollars"
const LEG = { EUR: ['EURUSD', 1], GBP: ['GBPUSD', 1], AUD: ['AUDUSD', 1], NZD: ['NZDUSD', 1], JPY: ['USDJPY', -1], CAD: ['USDCAD', -1], CHF: ['USDCHF', -1] };
// the ICE dollar index weights (SEK has no leg in the build, so the rest are renormalised)
export const DXY_W = { EUR: 0.576, JPY: 0.136, GBP: 0.119, CAD: 0.091, CHF: 0.036 };
export const SETS = {
  ccy: CCY8.map(c => `${c}*`),
  key: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'GOLD', 'SILVER', 'COPPER', 'WTI', 'NQ', 'SPX500', 'USDCNH'],
};

const fin = v => v != null && Number.isFinite(v);

/** Daily log returns from closes; null where either close is missing. Same length as closes (first is null). */
export function toReturns(closes = []) {
  const out = new Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i++) { const a = closes[i - 1], b = closes[i]; if (a > 0 && b > 0) out[i] = Math.log(b / a); }
  return out;
}

/** The panel as { dates, ids, ret: {id: returns[]}, trend, n, cache }. */
export function series(panel) {
  const dates = panel?.dates ?? [];
  const ret = {}, ids = [];
  for (const sym of panel?.syms ?? []) { const id = idOf(sym); ids.push(id); ret[id] = toReturns(panel.closes?.[sym] ?? []); }
  return { dates, ids, ret, trend: panel?.trend ?? dates.map(() => null), n: dates.length, cache: new Map() };
}

/** A currency's log value in dollars, day by day (USD = 0). null when the leg is missing. */
function xOf(S, c) {
  if (c === 'USD') return new Array(S.n).fill(0);
  const L = LEG[c]; const r = L && S.ret[L[0]]; if (!r) return null;
  return r.map(v => (fin(v) ? v * L[1] : null));
}

/** Returns of any id: a panel instrument, an FX cross of the eight built from its USD legs, a "CCY*" basket, "DXY". */
export function retOf(S, id) {
  if (!S || !id) return null;
  if (S.ret[id]) return S.ret[id];
  if (S.cache.has(id)) return S.cache.get(id);
  let out = null;
  if (/^[A-Z]{3}\*$/.test(id)) {
    const c = id.slice(0, 3); if (!CCY8.includes(c)) return null;
    const xs = CCY8.map(d => xOf(S, d)); if (xs.some(x => !x)) return null;
    const k = CCY8.indexOf(c);
    out = S.dates.map((_, i) => { const v = xs.map(x => x[i]); if (v.some(x => !fin(x))) return null; const others = v.filter((_, j) => j !== k); return v[k] - others.reduce((s, x) => s + x, 0) / others.length; });
  } else if (id === 'DXY') {
    const cs = Object.keys(DXY_W), xs = cs.map(c => xOf(S, c)); if (xs.some(x => !x)) return null;
    const W = cs.reduce((s, c) => s + DXY_W[c], 0);
    out = S.dates.map((_, i) => { let s = 0; for (let j = 0; j < cs.length; j++) { const v = xs[j][i]; if (!fin(v)) return null; s += DXY_W[cs[j]] * v; } return -s / W; });
  } else if (/^[A-Z]{6}$/.test(id)) {
    const b = id.slice(0, 3), q = id.slice(3);
    if (!CCY8.includes(b) || !CCY8.includes(q) || b === q) return null;
    const xb = xOf(S, b), xq = xOf(S, q); if (!xb || !xq) return null;
    out = xb.map((v, i) => (fin(v) && fin(xq[i]) ? v - xq[i] : null));
  }
  if (out) S.cache.set(id, out);
  return out;
}
export const has = (S, id) => !!retOf(S, id);

/** Pearson over the pairwise-complete days in (end - w, end]; null when fewer than minN days. */
export function corrWin(x, y, end, w, minN = Math.max(8, Math.ceil(w * 0.7))) {
  if (!x || !y || end < 0) return null;
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = Math.max(0, end - w + 1); i <= end; i++) {
    const a = x[i], b = y[i]; if (!fin(a) || !fin(b)) continue;
    n++; sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b;
  }
  if (n < minN) return null;
  const cov = sxy - sx * sy / n, va = sxx - sx * sx / n, vb = syy - sy * sy / n;
  if (va <= 1e-18 || vb <= 1e-18) return null;
  return Math.max(-1, Math.min(1, cov / Math.sqrt(va * vb)));
}
/** Standard deviation of the finite values in (end - w, end]. */
export function sdWin(x, end, w) {
  let n = 0, s = 0, ss = 0;
  for (let i = Math.max(0, end - w + 1); i <= end; i++) { const v = x?.[i]; if (!fin(v)) continue; n++; s += v; ss += v * v; }
  return n > 2 ? Math.sqrt(Math.max(0, (ss - s * s / n) / (n - 1))) : null;
}
export const corrAt = (S, a, b, w, end = S.n - 1) => corrWin(retOf(S, a), retOf(S, b), end, w);

/** The correlation matrix of `ids` over window w ending at `end`: { ids, m } with m[i][j] (null where not enough data). */
export function matrix(S, ids, w, end = S.n - 1) {
  const R = ids.map(id => retOf(S, id));
  const m = ids.map(() => ids.map(() => null));
  for (let i = 0; i < ids.length; i++) {
    m[i][i] = R[i] ? 1 : null;
    for (let j = i + 1; j < ids.length; j++) { const c = corrWin(R[i], R[j], end, w); m[i][j] = c; m[j][i] = c; }
  }
  return { ids, m, w, end };
}

/** What a change from `base` to `now` means: flipped sign, strengthening, weakening or steady. */
export function changeLabel(now, base, { big = 0.15, flip = 0.2 } = {}) {
  if (!fin(now) || !fin(base)) return 'n/a';
  if (Math.sign(now) !== Math.sign(base) && Math.abs(now) >= flip && Math.abs(base) >= flip) return 'flipped';
  const d = Math.abs(now) - Math.abs(base);
  return d >= big ? 'strengthening' : d <= -big ? 'weakening' : 'steady';
}
/** Every pair of `ids`: the window-w correlation now against the 120-day, ranked by the size of the change. */
export function changes(S, ids, { w = 20, base = 120, end = S.n - 1, top = 12 } = {}) {
  const out = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const now = corrAt(S, ids[i], ids[j], w, end), was = corrAt(S, ids[i], ids[j], base, end);
    if (!fin(now) || !fin(was)) continue;
    out.push({ a: ids[i], b: ids[j], now, base: was, delta: now - was, strength: Math.abs(now) - Math.abs(was), label: changeLabel(now, was) });
  }
  return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, top);
}

/** A pair's rolling window-w correlation from `from` to the last day: [{ i, date, v }] (v null where thin). */
export function rolling(S, a, b, w, { from = 0, step = 1 } = {}) {
  const x = retOf(S, a), y = retOf(S, b); if (!x || !y) return [];
  const out = [];
  for (let e = Math.max(from, w - 1); e < S.n; e += step) out.push({ i: e, date: S.dates[e], v: corrWin(x, y, e, w) });
  return out;
}

const quantile = (sorted, q) => { if (!sorted.length) return null; const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo); };

/**
 * How steady a relationship has been: the window-w correlation sampled every `step` days over the last `lookback`
 * days. share = how often its sign matched today's sign (1 = always), with the p10-p90 band of those correlations.
 */
export function stabilityOf(x, y, w, { end, lookback = 250, step = 5 } = {}) {
  const now = corrWin(x, y, end, w);
  const vals = [];
  for (let e = end; e >= Math.max(w - 1, end - lookback); e -= step) { const v = corrWin(x, y, e, w); if (fin(v)) vals.push(v); }
  if (!fin(now) || vals.length < 5) return { now, share: null, p10: null, p90: null, n: vals.length };
  const s = [...vals].sort((a, b) => a - b);
  return { now, share: vals.filter(v => Math.sign(v) === Math.sign(now)).length / vals.length, p10: quantile(s, 0.1), p90: quantile(s, 0.9), n: vals.length };
}
export const stability = (S, a, b, w, opts = {}) => stabilityOf(retOf(S, a), retOf(S, b), w, { end: S.n - 1, ...opts });

/** The ranking score: |corr| weighted by how often its sign held. 0 when either is missing. */
export const hedgeScore = (rho, share) => (fin(rho) && fin(share) ? Math.abs(rho) * share : 0);

/**
 * Hedge candidates for being LONG `target` (flip `side` for a short): every candidate's correlation over window w,
 * the side that offsets (short a positively correlated one, long a negatively correlated one), the min-variance
 * ratio (units of candidate return per unit of target return, beta = rho * sd_target / sd_cand), the share of the
 * target's variance that ratio would have removed in-window (rho^2), and the sign stability. Sorted by hedgeScore.
 * inverseOnly keeps the negatively correlated ones (hedges you hold long alongside the target).
 */
export function rankCandidates(S, tx, cands, { w = 60, end = S.n - 1, inverseOnly = false, minAbs = 0.1, lookback = 250 } = {}) {
  const rows = [];
  for (const id of cands) {
    const cx = retOf(S, id); if (!cx || cx === tx) continue;
    const st = stabilityOf(tx, cx, w, { end, lookback });
    const rho = st.now; if (!fin(rho) || Math.abs(rho) < minAbs) continue;
    if (inverseOnly && rho >= 0) continue;
    const sdT = sdWin(tx, end, w), sdC = sdWin(cx, end, w);
    rows.push({ id, rho, side: rho > 0 ? 'short' : 'long', share: st.share, p10: st.p10, p90: st.p90, n: st.n,
      ratio: fin(sdT) && fin(sdC) && sdC > 0 ? Math.abs(rho) * sdT / sdC : null, varCut: rho * rho, score: hedgeScore(rho, st.share) });
  }
  return rows.sort((a, b) => b.score - a.score || Math.abs(b.rho) - Math.abs(a.rho));
}
export const rankHedges = (S, target, cands, opts = {}) => rankCandidates(S, retOf(S, target), cands.filter(c => c !== target), opts);

/** The currencies an instrument id contains (FX pairs and baskets); [] for the rest. */
export function legsOf(id) {
  if (/^[A-Z]{3}\*$/.test(id)) return [id.slice(0, 3)];
  if (/^[A-Z]{6}$/.test(id)) return [id.slice(0, 3), id.slice(3)];
  if (['GOLD', 'SILVER', 'PLATINUM', 'COPPER', 'WTI', 'BRENT', 'NQ', 'SPX500', 'US30', 'US2000'].includes(id)) return ['USD'];   // priced in dollars
  return [];
}

/** The book's biggest net currency exposure among the eight: { ccy, net } (the after-cap figure), or null. */
export function biggestExposure(exposure) {
  const after = exposure?.after ?? exposure ?? {};
  let best = null;
  for (const c of CCY8) { const v = after[c]; if (fin(v) && v !== 0 && (!best || Math.abs(v) > Math.abs(best.net))) best = { ccy: c, net: v }; }
  return best;
}

/**
 * Hedges for the book's biggest net currency exposure: the exposure is read as the currency's basket (long or short),
 * and the candidates exclude every instrument that contains that currency as an FX leg (trading those is cutting the
 * exposure, not hedging it). Dollar-priced commodities and indices stay in for USD.
 */
export function bookHedges(S, exposure, cands, opts = {}) {
  const big = biggestExposure(exposure); if (!big) return null;
  const bx = retOf(S, `${big.ccy}*`); if (!bx) return { ...big, rows: [] };
  const sgn = Math.sign(big.net), tx = bx.map(v => (fin(v) ? v * sgn : null));
  const fx = id => /^[A-Z]{6}$/.test(id);
  const pool = cands.filter(id => !(fx(id) && legsOf(id).includes(big.ccy)) && !/\*$/.test(id));
  return { ...big, rows: rankCandidates(S, tx, pool, opts) };
}

// ── factors ──
export const FACTORS = [
  { k: 'DXY', label: 'Dollar (DXY)', note: 'the ICE dollar index rebuilt from its legs (SEK left out, weights renormalised)' },
  { k: 'RATES', label: 'Rates proxy', id: 'USDJPY', note: 'USD/JPY, the old page\'s rates proxy: no yield series in this build' },
  { k: 'RISK', label: 'Risk (S&P 500)', id: 'SPX500', note: 'S&P 500 daily return' },
  { k: 'OIL', label: 'Oil (WTI)', id: 'WTI', note: 'WTI crude daily return' },
];
export const factorRet = (S, f) => retOf(S, f.k === 'DXY' ? 'DXY' : f.id);

/** OLS beta and correlation of y on x over the window. */
export function betaWin(y, x, end, w) {
  const r = corrWin(y, x, end, w); if (!fin(r)) return { beta: null, r: null };
  const sy = sdWin(y, end, w), sx = sdWin(x, end, w);
  return { beta: fin(sy) && fin(sx) && sx > 0 ? r * sy / sx : null, r };
}

/** Per instrument: each factor's beta and correlation, the dominant factor (largest r^2) and every factor's r^2 share. */
export function factorBoard(S, ids, { w = 60, end = S.n - 1 } = {}) {
  const fr = FACTORS.map(f => factorRet(S, f));
  return ids.map(id => {
    const y = retOf(S, id); if (!y) return { id, f: {}, dom: null, shares: {} };
    const f = {}; let tot = 0;
    FACTORS.forEach((F, i) => { const isSelf = F.id === id || (F.k === 'DXY' && id === 'DXY'); const b = isSelf ? { beta: 1, r: 1, self: true } : betaWin(y, fr[i], end, w); f[F.k] = b; if (!b.self && fin(b.r)) tot += b.r * b.r; });
    const shares = {}; let dom = null;
    for (const F of FACTORS) { const b = f[F.k]; if (b.self || !fin(b.r) || tot <= 0) continue; shares[F.k] = b.r * b.r / tot; if (!dom || shares[F.k] > shares[dom]) dom = F.k; }
    return { id, f, dom, shares };
  });
}
/** A rolling beta series of id on a factor (every `step` days from `from`). */
export function betaSeries(S, id, F, w, { from = 0, step = 5 } = {}) {
  const y = retOf(S, id), x = factorRet(S, F); if (!y || !x) return [];
  const out = [];
  for (let e = Math.max(from, w - 1); e < S.n; e += step) out.push({ i: e, date: S.dates[e], v: betaWin(y, x, e, w).beta });
  if (out.length && out.at(-1).i !== S.n - 1) out.push({ i: S.n - 1, date: S.dates[S.n - 1], v: betaWin(y, x, S.n - 1, w).beta });
  return out;
}

// ── regimes ──
/**
 * Volatility regime of `ref` (default S&P 500), point-in-time: its 20-day realised vol on each day against the
 * terciles of the same measure over the previous `look` days (nothing after the day is used). HIGH / MID / LOW, null
 * until enough history.
 */
export function volRegime(S, { ref = 'SPX500', w = 20, look = 250, minLook = 120 } = {}) {
  const x = retOf(S, ref); if (!x) return S.dates.map(() => null);
  const vol = S.dates.map((_, i) => (i >= w - 1 ? sdWin(x, i, w) : null));
  return vol.map((v, i) => {
    if (!fin(v)) return null;
    const past = vol.slice(Math.max(0, i - look), i).filter(fin);
    if (past.length < minLook) return null;
    const s = past.sort((a, b) => a - b), lo = quantile(s, 1 / 3), hi = quantile(s, 2 / 3);
    return v > hi ? 'HIGH' : v < lo ? 'LOW' : 'MID';
  });
}
export const REGIMES = {
  vol: { labels: ['LOW', 'MID', 'HIGH'], name: 'S&P 500 volatility', note: 'the S&P 500\'s 20-day realised vol against the terciles of its own previous year (point-in-time)' },
  trend: { labels: ['BULL', 'RANGE', 'BEAR'], name: 'EUR/USD trend', note: 'the old page\'s regime: EUR/USD 20/50 EMA spread and slope on H4 bars. A trend state of one pair, not a market regime' },
};
export const regimeOf = (S, kind) => (kind === 'trend' ? S.trend : (S._vol ??= volRegime(S)));

/** Correlation of a and b pooled over the days in each regime label (daily returns, not rolling windows). */
export function condCorr(S, a, b, regimes, labels, { from = 0 } = {}) {
  const x = retOf(S, a), y = retOf(S, b), out = {};
  for (const L of labels) {
    const xs = [], ys = [];
    if (x && y) for (let i = from; i < S.n; i++) if (regimes[i] === L && fin(x[i]) && fin(y[i])) { xs.push(x[i]); ys.push(y[i]); }
    out[L] = { r: xs.length >= 20 ? corrWin(xs, ys, xs.length - 1, xs.length, 20) : null, n: xs.length };
  }
  return out;
}
/** For a set of pairs: the regime-conditional correlations and the spread between the highest and lowest. */
export function regimeTable(S, pairs, regimes, labels) {
  return pairs.map(([a, b]) => {
    const c = condCorr(S, a, b, regimes, labels);
    const rs = labels.map(L => c[L].r).filter(fin);
    return { a, b, c, spread: rs.length >= 2 ? Math.max(...rs) - Math.min(...rs) : null };
  }).sort((p, q) => (q.spread ?? -1) - (p.spread ?? -1));
}
/** Contiguous runs of the same regime label: [{ from, to, label }] (index range, inclusive). */
export function regimeRuns(regimes, from = 0) {
  const out = []; let cur = null;
  for (let i = from; i < regimes.length; i++) {
    const L = regimes[i];
    if (cur && cur.label === L) cur.to = i;
    else { if (cur) out.push(cur); cur = L ? { from: i, to: i, label: L } : null; }
  }
  if (cur) out.push(cur);
  return out;
}

/** The last index whose date is on or before `date` (for "as of" reads). */
export const indexOn = (S, date) => { for (let i = S.n - 1; i >= 0; i--) if (S.dates[i] <= date) return i; return -1; };
