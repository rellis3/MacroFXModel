/**
 * Currency strength (σ), price-based and live: the pure maths. No fetch, no DOM, no clock except `now` passed in.
 *
 *   buildStrength({ bars, now })        what /api/ccy-strength serves: for each horizon (1H, 4H, 1D, 1W) eight currency scores in σ
 *   fitStrength(obs)                    the cross-sectional fit (weighted least squares on the currency graph), the same method today.html
 *                                       uses for its "measured" strength: each pair's move = strength(base) − strength(quote), scores sum to zero
 *   describeStrength(payload, hz)       the rule-built footer sentence
 *
 * Unit. σ here is "a typical currency's NORMAL move over that horizon": each pair's raw log move over the horizon is weighted by 1/σ_pair² (quiet
 * pairs are measured more precisely) and the fitted scores are divided by one common unit, the median pair's normal move over the horizon / √2
 * (a pair carries two currencies' variance). A pair's normal move over a horizon is the median |log move| over that horizon in its own history
 * (1H and 4H from hourly bars, 1D and 1W from daily bars): so +1.0σ on 4H is a currency that moved as far as a typical currency normally does in
 * four hours, and the same number on 1W is the same idea over a week. Linear, so scores sum to zero and the triangle consistency survives.
 *
 * This is PRICE-based and LIVE (it moves with every bar); the desk's own strength strip is the Currency Manager's analyst read, once a day. They
 * measure different things and may disagree. Ordering only: nothing here is a direction call or a trade.
 */
export const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
// the 28 pairs in OANDA's own orientation (base_quote)
export const PAIRS = ['EUR_USD', 'GBP_USD', 'AUD_USD', 'NZD_USD', 'USD_JPY', 'USD_CAD', 'USD_CHF', 'EUR_GBP', 'EUR_JPY', 'EUR_CHF', 'EUR_AUD', 'EUR_CAD', 'EUR_NZD',
  'GBP_JPY', 'GBP_CHF', 'GBP_AUD', 'GBP_CAD', 'GBP_NZD', 'AUD_JPY', 'AUD_CHF', 'AUD_CAD', 'AUD_NZD', 'NZD_JPY', 'NZD_CHF', 'NZD_CAD', 'CAD_JPY', 'CAD_CHF', 'CHF_JPY'];
export const HORIZONS = [{ key: '1H', hours: 1 }, { key: '4H', hours: 4 }, { key: '1D', hours: 24 }, { key: '1W', hours: 168 }];
const HOUR = 3600e3;
const fin = v => v != null && Number.isFinite(+v);
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const r2 = v => Math.round(v * 100) / 100;

/** Close of the last bar that had finished by instant t (bars: [{ t (ms, bar OPEN), c }] ascending, step ms); null if nothing within 3 steps. */
export function priceAt(bars, step, t) {
  let lo = 0, hi = bars.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (bars[m].t + step <= t) { k = m; lo = m + 1; } else hi = m - 1; }
  if (k < 0 || t - (bars[k].t + step) > 3 * step + 2 * HOUR) return null;
  return bars[k].c;
}

/** A pair's normal move over each horizon: median |log move| in its own history. h1 = hourly bars, d = daily bars (ascending [{ t, c }]). */
export function normalMoves(h1, d) {
  const out = {}, ab = (a, k) => { const v = []; for (let i = k; i < a.length; i += k) { const x = Math.abs(Math.log(a[i].c / a[i - k].c)); if (Number.isFinite(x)) v.push(x); } return v; };
  out['1H'] = h1.length > 60 ? median(ab(h1, 1)) : null;
  out['4H'] = h1.length > 120 ? median(ab(h1, 4)) : null;
  out['1D'] = d.length > 40 ? median(ab(d, 1)) : null;
  out['1W'] = d.length > 80 ? median(ab(d, 5)) : null;
  return out;
}

/** Solve A x = b (dense, Gaussian elimination with partial pivoting). */
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
  return x;
}

/**
 * obs = [{ base, quote, raw (log move of the pair over the horizon), sigma (the pair's normal move over it) }].
 * Returns { scores: [{ ccy, score }] in σ (sum to zero), unit, n, concentration } or null.
 */
export function fitStrength(obs, ccys = CCYS) {
  const o = obs.filter(x => fin(x.raw) && fin(x.sigma) && x.sigma > 0 && ccys.includes(x.base) && ccys.includes(x.quote));
  if (o.length < 12) return null;
  const idx = Object.fromEntries(ccys.map((c, i) => [c, i])), n = ccys.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0)), b = new Array(n).fill(0);
  const sMed = median(o.map(x => x.sigma));
  for (const x of o) {
    const i = idx[x.base], j = idx[x.quote], w = (sMed / x.sigma) ** 2;
    L[i][i] += w; L[j][j] += w; L[i][j] -= w; L[j][i] -= w; b[i] += w * x.raw; b[j] -= w * x.raw;
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) L[i][j] += 1 / n;       // pins the free constant: the sum-to-zero solution
  const c = solve(L, b); if (!c || c.some(v => !Number.isFinite(v))) return null;
  const unit = sMed / Math.SQRT2, sc = c.map(v => v / unit), ss = sc.reduce((a, v) => a + v * v, 0);
  return { scores: ccys.map((ccy, i) => ({ ccy, score: r2(sc[i]) })), unit, n: o.length, concentration: ss > 0 ? r2(Math.max(...sc.map(v => v * v)) / ss) : null };
}

/**
 * bars = { 'EUR_USD': { m5: [{t,c}], h1: [{t,c}], d: [{t,c}] }, ... } (ascending, t = bar open ms). Returns the payload.
 * A pair missing any layer is skipped for the horizons that need it; a horizon with under 12 pairs is reported unavailable, never faked.
 */
export function buildStrength({ bars, now = Date.now() } = {}) {
  const per = {};
  let latest = 0;
  for (const [pair, b] of Object.entries(bars ?? {})) {
    if (!PAIRS.includes(pair) || !b?.m5?.length) continue;
    const [base, quote] = pair.split('_'), last = b.m5[b.m5.length - 1];
    latest = Math.max(latest, last.t + 300e3);
    per[pair] = { base, quote, last, b, sig: normalMoves(b.h1 ?? [], b.d ?? []) };
  }
  if (!Object.keys(per).length) return { ok: false, error: 'no price bars yet' };
  const horizons = {};
  for (const hz of HORIZONS) {
    const t0 = now - hz.hours * HOUR, obs = [];
    for (const p of Object.values(per)) {
      const sigma = p.sig[hz.key]; if (!fin(sigma) || sigma <= 0) continue;
      // the price at the start of the window; when the market has been shut since before that instant the last known price IS the price then (a flat window), not a gap
      const lastEnd = (a, step) => (a?.length ? a[a.length - 1].t + step : 0);
      const look = (a, step) => { const v = priceAt(a ?? [], step, t0); return v != null ? v : (a?.length && t0 >= lastEnd(a, step) ? a[a.length - 1].c : null); };
      const then = hz.hours <= 4 ? look(p.b.m5, 300e3) : look(p.b.h1, HOUR);
      if (!fin(then) || !fin(p.last.c)) continue;
      obs.push({ base: p.base, quote: p.quote, raw: Math.log(p.last.c / then), sigma });
    }
    const fit = fitStrength(obs);
    if (!fit) { horizons[hz.key] = { available: false, reason: `only ${obs.length} of 28 pairs had prices and a normal move for ${hz.key}`, pairs: obs.length }; continue; }
    const flat = obs.every(x => x.raw === 0);
    const sorted = [...fit.scores].sort((a, b) => b.score - a.score).map((s, i) => ({ ...s, rank: i + 1 }));
    horizons[hz.key] = { available: true, flat, from: new Date(t0).toISOString(), pairs: fit.n, unitPct: r2(fit.unit * 100 * 1000) / 1000, concentration: fit.concentration,
      scores: sorted, leader: sorted[0].ccy, laggard: sorted[sorted.length - 1].ccy, spread: r2(sorted[0].score - sorted[sorted.length - 1].score) };
  }
  const closed = latest && now - latest > 90 * 60e3;
  return { ok: true, builtAt: new Date(now).toISOString(), asOf: latest ? new Date(latest).toISOString() : null, closed: !!closed, horizons, unit: 'σ' };
}

const sg = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
/** "Strongest vs weakest on 1H: NZD vs JPY" plus the numbers and how concentrated the move is. Ordering only. */
export function describeStrength(payload, hz) {
  const h = payload?.horizons?.[hz];
  if (!payload?.ok || !h?.available) return null;
  if (h.flat) return `The market has not moved over ${hz}: every currency is at zero.`;
  const lead = h.scores[0], lag = h.scores[h.scores.length - 1];
  let s = `Strongest vs weakest on ${hz}: ${lead.ccy} vs ${lag.ccy} (${sg(lead.score)}σ and ${sg(lag.score)}σ, a ${h.spread.toFixed(1)}σ spread).`;
  if (h.concentration != null) s += h.concentration >= 0.4 ? ` One currency is doing most of the moving (${Math.round(h.concentration * 100)}% of the board's strength).` : ' The move is spread across currencies, not one story.';
  return s;
}
