/**
 * Factor exposure of the book (owner's build list item 3, 2026-11-04; plans/DESK_ANALYST_PIPELINE.md §9aj).
 *
 * WHY. The per-currency cap (js/deskExposure.js) counts currency legs. It cannot see that long AUD/JPY, long the
 * Nasdaq, long copper and short gold are the same risk-on bet, or that nine cards in nine different names all load on
 * the dollar. This breaks the book into five factors and measures how much of its risk each one carries, so "nine
 * cards that are really one dollar bet" shows up before the cap does.
 *
 * THE FACTORS (daily, from OANDA closes at 17:00 New York and FRED, on common dates)
 *   USD     equal-weight dollar against EUR, GBP, JPY, AUD, NZD, CAD, CHF, in % (positive = dollar up)
 *   CARRY   the top three policy-rate currencies less the bottom three (the eight majors, each against USD), in %.
 *           Ranked on TODAY's policy rates: over a one-to-two-year window the ranking barely moves, but it is not
 *           point-in-time, and it is labelled so.
 *   RISK    the S&P 500's daily return, in % (positive = risk-on)
 *   COMMOD  equal weight of WTI crude and copper, in %
 *   RATES   the change in the US 2-year Treasury yield (FRED DGS2), in basis points
 * Scenario drivers that are not factors but can be shocked (js/scenarioEngine.js maps them onto the factors through
 * their joint history): OIL (WTI %), VIX (points, FRED VIXCLS), US10Y (bp, FRED DGS10), GOLD (%).
 *
 * BETAS. Each instrument's daily % log return is regressed on the five factors over the last `window` common days
 * (default 500, about two years), ridge with a small penalty on standardised factors so collinear factors (USD and
 * COMMOD) do not produce wild offsetting betas. Each fit carries n and R².
 *
 * UNITS. The same as the portfolio risk manager (js/deskRisk.js): one normal-size card (size 1) moving one daily σ is
 * 1 card-σ. A card's position is x = direction × size ÷ σ (σ = its daily % sd over the window), so a book P&L is
 * Σ x·r in card-σ, and Σ x·r ÷ Σ|x| is the same P&L as a % of the book's gross notional when each card holds notional
 * in that proportion (vol-scaled sizing). Factor exposure = Σ x·β, in card-σ per factor unit.
 *
 * Description of the book on its own history, not a forecast: betas move, and a crisis brings correlations together.
 * Pure: the caller fetches the closes and FRED series. Tested in js/factorRisk.test.mjs.
 */
import { varEs } from './fleetPortfolio.js';

export const FACTORS = [
  { key: 'USD', label: 'Dollar', unit: '%', what: 'equal-weight USD against EUR, GBP, JPY, AUD, NZD, CAD, CHF' },
  { key: 'CARRY', label: 'Carry', unit: '%', what: 'top three policy-rate currencies less the bottom three (each against USD)' },
  { key: 'RISK', label: 'Risk-on', unit: '%', what: 'S&P 500 daily return' },
  { key: 'COMMOD', label: 'Commodities', unit: '%', what: 'equal weight of WTI crude and copper' },
  { key: 'RATES', label: 'US rates', unit: 'bp', what: 'change in the US 2-year Treasury yield' },
];
export const AUX_DRIVERS = [
  { key: 'OIL', label: 'WTI crude', unit: '%', what: 'WTI daily return' },
  { key: 'VIX', label: 'VIX', unit: 'pt', what: 'change in the VIX close (FRED VIXCLS)' },
  { key: 'US10Y', label: 'US 10y yield', unit: 'bp', what: 'change in the US 10-year yield (FRED DGS10)' },
  { key: 'GOLD', label: 'Gold', unit: '%', what: 'gold daily return' },
];
export const DRIVERS = [...FACTORS, ...AUX_DRIVERS];
export const FACTOR_KEYS = FACTORS.map(f => f.key);
export const CCY_LEGS = { EUR: ['EURUSD', 1], GBP: ['GBPUSD', 1], AUD: ['AUDUSD', 1], NZD: ['NZDUSD', 1], JPY: ['USDJPY', -1], CAD: ['USDCAD', -1], CHF: ['USDCHF', -1] };
const DIR = { STRONG_LONG: 1, LONG: 1, SHORT: -1, STRONG_SHORT: -1 };
export const cardDirection = r => DIR[r] ?? 0;

const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
export const rnd = (x, d = 3) => (Number.isFinite(x) ? +x.toFixed(d) : null);

// ── small linear algebra ────────────────────────────────────────────────────────────────────────────────────────
/** Solve A x = b by Gaussian elimination with partial pivoting. A is not modified. Returns null if singular. */
export function solve(A, b) {
  const n = A.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}
/** Eigenvalues and vectors of a symmetric matrix (cyclic Jacobi). vectors[k] is the k-th eigenvector. */
export function symEigen(S, { sweeps = 60 } = {}) {
  const n = S.length, A = S.map(r => [...r]), V = A.map((_, i) => A.map((__, j) => (i === j ? 1 : 0)));
  for (let sw = 0; sw < sweeps; sw++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  return { values: A.map((r, i) => r[i]), vectors: A.map((_, k) => V.map(r => r[k])) };
}
/** Sample covariance of column arrays (each the same length). */
export function covariance(cols) {
  const k = cols.length, n = cols[0]?.length ?? 0, m = cols.map(mean);
  return Array.from({ length: k }, (_, a) => Array.from({ length: k }, (__, b) => { let s = 0; for (let t = 0; t < n; t++) s += (cols[a][t] - m[a]) * (cols[b][t] - m[b]); return n > 1 ? s / (n - 1) : 0; }));
}
const matVec = (M, v) => M.map(r => r.reduce((s, x, j) => s + x * v[j], 0));
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

// ── returns and factors ─────────────────────────────────────────────────────────────────────────────────────────
/** rows [{ date, close }] → Map date → daily log return in %. */
export function logReturns(rows) {
  const s = [...(rows ?? [])].filter(r => r && r.close > 0 && r.date).sort((a, b) => (a.date < b.date ? -1 : 1)), out = new Map();
  for (let i = 1; i < s.length; i++) if (s[i].date !== s[i - 1].date) out.set(s[i].date, 100 * Math.log(s[i].close / s[i - 1].close));
  return out;
}
/** rows [{ date, value }] (FRED) → Map date → change since the previous observation × scale. */
export function levelChanges(rows, scale = 1) {
  const s = [...(rows ?? [])].filter(r => r && r.date && Number.isFinite(+r.value)).sort((a, b) => (a.date < b.date ? -1 : 1)), out = new Map();
  for (let i = 1; i < s.length; i++) out.set(s[i].date, (+s[i].value - +s[i - 1].value) * scale);
  return out;
}
/** Dates present in every map, ascending. */
export function commonDates(maps) {
  const ms = maps.filter(Boolean); if (!ms.length) return [];
  const [first, ...rest] = [...ms].sort((a, b) => a.size - b.size);
  return [...first.keys()].filter(d => rest.every(m => m.has(d))).sort();
}

/** The carry basket from policy rates { USD: 4.5, EUR: 2, ... }: the top and bottom three of the eight. */
export function carryBasket(policyRates, k = 3) {
  const ranked = ['USD', ...Object.keys(CCY_LEGS)].filter(c => Number.isFinite(+policyRates?.[c])).sort((a, b) => +policyRates[b] - +policyRates[a]);
  if (ranked.length < 2 * k) return null;
  return { long: ranked.slice(0, k), short: ranked.slice(-k), rates: Object.fromEntries(ranked.map(c => [c, +policyRates[c]])) };
}

/**
 * Daily driver series. closes: { INST: [{ date, close }] } (desk names), fred: { DGS2, DGS10, VIXCLS: [{ date, value }] },
 * policyRates: { CCY: rate }. Returns { drivers: { KEY: Map }, returns: { INST: Map }, levels, carry, missing }.
 */
export function buildDrivers({ closes = {}, fred = {}, policyRates = {} } = {}) {
  const returns = Object.fromEntries(Object.entries(closes).map(([n, rows]) => [n, logReturns(rows)]).filter(([, m]) => m.size));
  const ccy = c => (c === 'USD' ? null : returns[CCY_LEGS[c][0]]);
  const ccyRet = (c, d) => (c === 'USD' ? 0 : CCY_LEGS[c][1] * returns[CCY_LEGS[c][0]].get(d));
  const missing = [], drivers = {};
  const legs = Object.keys(CCY_LEGS);
  if (legs.every(c => ccy(c))) {
    const m = new Map(); for (const d of commonDates(legs.map(ccy))) m.set(d, -mean(legs.map(c => ccyRet(c, d))));
    drivers.USD = m;
  } else missing.push(`USD (no closes for ${legs.filter(c => !ccy(c)).map(c => CCY_LEGS[c][0]).join(', ')})`);
  const carry = carryBasket(policyRates);
  if (carry && [...carry.long, ...carry.short].every(c => c === 'USD' || ccy(c))) {
    const m = new Map(); for (const d of commonDates([...carry.long, ...carry.short].filter(c => c !== 'USD').map(ccy))) m.set(d, mean(carry.long.map(c => ccyRet(c, d))) - mean(carry.short.map(c => ccyRet(c, d))));
    drivers.CARRY = m;
  } else missing.push(carry ? 'CARRY (a basket currency has no closes)' : 'CARRY (fewer than six policy rates)');
  if (returns.SPX500) drivers.RISK = returns.SPX500; else missing.push('RISK (no S&P 500 closes)');
  if (returns.WTI && returns.COPPER) { const m = new Map(); for (const d of commonDates([returns.WTI, returns.COPPER])) m.set(d, (returns.WTI.get(d) + returns.COPPER.get(d)) / 2); drivers.COMMOD = m; }
  else missing.push('COMMOD (no WTI or copper closes)');
  const fr = (id, scale) => { const m = levelChanges(fred[id], scale); return m.size ? m : null; };
  const r2y = fr('DGS2', 100); if (r2y) drivers.RATES = r2y; else missing.push('RATES (no FRED DGS2)');
  if (returns.WTI) drivers.OIL = returns.WTI;
  if (returns.GOLD) drivers.GOLD = returns.GOLD;
  const vix = fr('VIXCLS', 1); if (vix) drivers.VIX = vix;
  const r10 = fr('DGS10', 100); if (r10) drivers.US10Y = r10;
  const last = id => { const s = (fred[id] ?? []).filter(r => Number.isFinite(+r.value)).sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1); return s ? { value: +s.value, date: s.date } : null; };
  return { drivers, returns, carry, missing, levels: { VIX: last('VIXCLS'), US2Y: last('DGS2'), US10Y: last('DGS10') } };
}

/**
 * Ridge regression of y on the columns of X (factors standardised, intercept unpenalised). lambda is relative to n.
 * Returns { beta[], alpha, r2, n, residSd }.
 */
export function ridge(y, X, { lambda = 0.01 } = {}) {
  const n = y.length, k = X.length, my = mean(y), mx = X.map(mean);
  const sx = X.map((c, j) => Math.sqrt(c.reduce((s, v) => s + (v - mx[j]) ** 2, 0) / Math.max(1, n - 1)) || 1);
  const Z = X.map((c, j) => c.map(v => (v - mx[j]) / sx[j])), yc = y.map(v => v - my);
  const A = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (__, b) => dot(Z[a], Z[b]) + (a === b ? lambda * n : 0)));
  const coef = solve(A, Z.map(c => dot(c, yc))) ?? new Array(k).fill(0);
  const beta = coef.map((c, j) => c / sx[j]), alpha = my - dot(beta, mx);
  let ssr = 0, sst = 0; for (let t = 0; t < n; t++) { const e = yc[t] - Z.reduce((s, c, j) => s + coef[j] * c[t], 0); ssr += e * e; sst += yc[t] ** 2; }
  return { beta, alpha, r2: sst > 0 ? 1 - ssr / sst : 0, n, residSd: Math.sqrt(ssr / Math.max(1, n - k - 1)) };
}

/**
 * The factor model: drivers, factor covariance, the joint driver covariance (for conditional scenarios) and every
 * instrument's betas. window: the last N common days used; minN: fewer and the instrument (or factor) is left out.
 */
export function buildFactorModel({ closes, fred, policyRates, window = 500, minN = 120, lambda = 0.01, asOf = null } = {}) {
  const built = buildDrivers({ closes, fred, policyRates });
  const { drivers, returns } = built;
  const factors = FACTOR_KEYS.filter(k => drivers[k]?.size >= minN);
  const joint = DRIVERS.map(d => d.key).filter(k => drivers[k]?.size >= minN);
  const fDates = commonDates(factors.map(k => drivers[k])).slice(-window);
  const jDates = commonDates(joint.map(k => drivers[k])).slice(-window);
  const fCols = factors.map(k => fDates.map(d => drivers[k].get(d))), jCols = joint.map(k => jDates.map(d => drivers[k].get(d)));
  const factorCov = fDates.length > factors.length + 5 ? covariance(fCols) : null;
  const jointCov = jDates.length > joint.length + 5 ? covariance(jCols) : null;
  const instruments = {};
  if (factors.length && fDates.length >= minN) {
    for (const [n, m] of Object.entries(returns)) {
      const dates = commonDates([m, ...factors.map(k => drivers[k])]).slice(-window);
      const own = [...m.values()].slice(-window), sd = Math.sqrt(covariance([own])[0][0]);
      if (dates.length < minN || !(sd > 0)) { instruments[n] = { ok: false, n: dates.length, sd: rnd(sd, 4), why: `only ${dates.length} common days` }; continue; }
      const fit = ridge(dates.map(d => m.get(d)), factors.map(k => dates.map(d => drivers[k].get(d))), { lambda });
      instruments[n] = { ok: true, n: fit.n, from: dates[0], to: dates.at(-1), sd, beta: Object.fromEntries(factors.map((k, j) => [k, fit.beta[j]])), r2: fit.r2, residSd: fit.residSd, first: [...m.keys()][0] };
    }
  }
  return {
    asOf, window, minN, lambda, factors, joint, missing: built.missing, carry: built.carry, levels: built.levels,
    factorDays: { n: fDates.length, from: fDates[0] ?? null, to: fDates.at(-1) ?? null },
    jointDays: { n: jDates.length, from: jDates[0] ?? null, to: jDates.at(-1) ?? null },
    factorCov, factorSd: factorCov ? factorCov.map((r, i) => Math.sqrt(r[i])) : null, jointCov,
    instruments,
    // not serialised (Maps): the series the book risk, the replays and the risk-off scenario read
    _drivers: drivers, _returns: returns,
  };
}

/** A JSON view of the model (no series): factors, their σ, every instrument's betas, n and R². */
export function modelSummary(model) {
  return {
    asOf: model.asOf, window: model.window, factors: model.factors.map(k => ({ ...FACTORS.find(f => f.key === k), sd: rnd(model.factorSd?.[model.factors.indexOf(k)], 3) })),
    drivers: model.joint, missing: model.missing, carry: model.carry, levels: model.levels, factorDays: model.factorDays, jointDays: model.jointDays,
    factorCorr: model.factorCov ? model.factorCov.map((r, i) => r.map((c, j) => rnd(c / (model.factorSd[i] * model.factorSd[j]), 2))) : null,
    betas: Object.fromEntries(Object.entries(model.instruments).map(([n, x]) => [n, x.ok ? { beta: Object.fromEntries(Object.entries(x.beta).map(([k, v]) => [k, rnd(v, 3)])), r2: rnd(x.r2, 2), n: x.n, sd: rnd(x.sd, 3) } : { ok: false, n: x.n, why: x.why }])),
  };
}

/** The live cards as positions: x = direction × size ÷ σ (card-σ per 1% move). Cards without a fitted model are listed. */
export function positions(model, cards) {
  const live = [], uncovered = [];
  for (const [n, c] of Object.entries(cards ?? {})) {
    const dir = cardDirection(c?.rating), size = Number.isFinite(+c?.size) && c?.size !== null ? +c.size : 1;
    if (!dir || !(size > 0)) continue;
    const m = model.instruments[n];
    if (!m?.ok) { uncovered.push(n); continue; }
    live.push({ name: n, w: dir * size, x: (dir * size) / m.sd, sd: m.sd });
  }
  return { live, uncovered };
}

const Z = { 0.95: { z: 1.6449, es: 2.0627 }, 0.99: { z: 2.3263, es: 2.6652 } };

/**
 * The book's factor exposure, risk decomposition, concentration and VaR/ES. cards: { INST: { rating, size } }.
 * Returns ok:false with a reason when fewer than two cards have history or the cards share under 60 days.
 */
export function bookFactorRisk(model, cards, { minDays = 60, shrink = 0.1, top = 8 } = {}) {
  const { live, uncovered } = positions(model, cards);
  if (live.length < 1) return { ok: false, reason: 'no live card with a fitted history', uncovered };
  const R = model._returns, dates = commonDates(live.map(p => R[p.name])).slice(-model.window);
  if (dates.length < minDays) return { ok: false, reason: `the live cards share only ${dates.length} days of history`, uncovered };
  const cols = live.map(p => dates.map(d => R[p.name].get(d)));
  const S0 = covariance(cols), S = S0.map((r, i) => r.map((v, j) => (i === j ? v : (1 - shrink) * v)));   // shrink correlations a little toward zero
  const x = live.map(p => p.x), Sx = matVec(S, x), V = dot(x, Sx), sigma = Math.sqrt(V), grossX = x.reduce((s, v) => s + Math.abs(v), 0);
  const gross = live.reduce((s, p) => s + Math.abs(p.w), 0);
  const toPct = v => (grossX > 0 ? v / grossX : null);
  // VaR / ES: parametric (normal on the covariance) and historical (the book as if held over each common day)
  const parametric = Object.fromEntries([0.95, 0.99].map(l => [String(l), { var: rnd(Z[l].z * sigma, 3), es: rnd(Z[l].es * sigma, 3), varPct: rnd(toPct(Z[l].z * sigma), 3), esPct: rnd(toPct(Z[l].es * sigma), 3) }]));
  const pnl = dates.map((_, t) => live.reduce((s, p, i) => s + p.x * cols[i][t], 0));
  const hist = varEs(pnl) ?? null;
  const worstT = pnl.indexOf(Math.min(...pnl));
  const historical = hist ? Object.fromEntries(Object.entries(hist).map(([l, v]) => [l, { ...v, varPct: rnd(toPct(v.var), 3), esPct: rnd(toPct(v.es), 3) }])) : null;
  // per card: marginal (∂σ/∂x) and component contribution (sums to σ)
  const contrib = live.map((p, i) => ({ name: p.name, weight: rnd(p.w, 2), marginal: rnd(Sx[i] / sigma, 4), component: rnd(p.x * Sx[i] / sigma, 3), share: rnd((p.x * Sx[i]) / V, 3) }))
    .sort((a, b) => b.share - a.share);
  // factor exposure b_f = Σ x β_f (card-σ per factor unit), per one-σ factor move, and the variance split
  const F = model.factors, b = F.map(k => live.reduce((s, p) => s + p.x * model.instruments[p.name].beta[k], 0));
  const Fb = model.factorCov ? matVec(model.factorCov, b) : b.map(() => 0);
  const sys = dot(b, Fb), idio = live.reduce((s, p) => s + p.x ** 2 * model.instruments[p.name].residSd ** 2, 0), modelVar = sys + idio;
  const factors = F.map((k, j) => {
    const by = live.map(p => ({ name: p.name, v: p.x * model.instruments[p.name].beta[k] })).filter(c => Math.abs(c.v) > 1e-9).sort((a, c) => Math.abs(c.v) - Math.abs(a.v));
    const info = FACTORS.find(f => f.key === k);
    return { key: k, label: info.label, unit: info.unit, exposure: rnd(b[j], 4), perSigma: rnd(b[j] * model.factorSd[j], 3), share: rnd(modelVar > 0 ? (b[j] * Fb[j]) / modelVar : 0, 3), cards: by.slice(0, 5).map(c => ({ name: c.name, perSigma: rnd(c.v * model.factorSd[j], 3) })) };
  });
  const idioShare = rnd(modelVar > 0 ? idio / modelVar : 0, 3);
  const topF = [...factors].sort((a, c) => c.share - a.share)[0];
  // effective bets: (Σ|w|)² ÷ w'Cw as in js/deskRisk.js, and the entropy of the risk across principal components (Meucci 2009)
  const eig = symEigen(S), p = eig.vectors.map((v, k) => (dot(v, x) ** 2 * Math.max(0, eig.values[k])) / V).filter(v => v > 1e-12);
  const enb = Math.exp(-p.reduce((s, v) => s + v * Math.log(v), 0));
  const flag = live.length >= 4 && topF && topF.share >= 0.5
    ? `${live.length} cards, but ${Math.round(topF.share * 100)}% of the book's risk is one ${topF.label.toLowerCase()} bet (${topF.perSigma > 0 ? 'long' : 'short'} the factor)` : null;
  return {
    ok: true, cards: live.length, uncovered, days: dates.length, from: dates[0], to: dates.at(-1), gross: rnd(gross, 2),
    sigma: rnd(sigma, 3), sigmaPct: rnd(toPct(sigma), 3),
    var: { parametric, historical, worstDay: { date: dates[worstT], pnl: rnd(pnl[worstT], 3), pnlPct: rnd(toPct(pnl[worstT]), 3) } },
    factors, idiosyncraticShare: idioShare, systematicShare: rnd(modelVar > 0 ? sys / modelVar : 0, 3),
    concentration: { topFactor: topF ? { key: topF.key, label: topF.label, share: topF.share } : null, effectiveBets: rnd(gross * gross / V, 2), enb: rnd(enb, 2), topCardShare: contrib[0]?.share ?? null, flag },
    contributors: contrib.slice(0, top), allContributions: contrib,
  };
}
