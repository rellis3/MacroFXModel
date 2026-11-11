// js/nqRatesResidual.js: the Nasdaq-vs-rates monitor (analysis/output/nq-rates-residual-monitor/RESULTS.md, exploratory, CONTEXT).
// Daily, past-only rolling OLS:  r_t = a + b1 * d2y_t + b2 * dslope_t + e_t
//   r = Nasdaq-100 log return in %, d2y = change in the 2y yield in bp, dslope = change in (10y - 2y) in bp.
// Coefficients come from the W days BEFORE t, so e_t is out of sample. z = e / window residual sd; z20 = 20-day sum of e / (sd * sqrt 20).
// Same maths as scripts/nq-rates-residual-monitor/run.py (checked by js/nqRatesResidual.test.mjs). A regime gauge, not a signal.

/** Align three {date, value} series on the dates where all three print; returns { dates, r, d2y, dslope, nq }. */
export function alignDaily(nq, y2, y10) {
  const m2 = new Map(y2.map(o => [o.date, o.value])), m10 = new Map(y10.map(o => [o.date, o.value]));
  const rows = nq.filter(o => m2.has(o.date) && m10.has(o.date)).map(o => [o.date, o.value, m2.get(o.date), m10.get(o.date)]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const out = { dates: [], r: [], d2y: [], dslope: [], nq: [] };
  for (let i = 1; i < rows.length; i++) {
    const [d, p, a2, a10] = rows[i], [, p0, b2, b10] = rows[i - 1];
    out.dates.push(d); out.nq.push(p);
    out.r.push(100 * Math.log(p / p0)); out.d2y.push(100 * (a2 - b2)); out.dslope.push(100 * ((a10 - a2) - (b10 - b2)));
  }
  return out;
}

/** Least squares for y on [1, x1, x2] via the 3x3 normal equations. */
function ols3(y, x1, x2, lo, hi) {
  let n = 0, s1 = 0, s2 = 0, s11 = 0, s22 = 0, s12 = 0, sy = 0, s1y = 0, s2y = 0;
  for (let i = lo; i < hi; i++) { const a = x1[i], b = x2[i], c = y[i]; n++; s1 += a; s2 += b; s11 += a * a; s22 += b * b; s12 += a * b; sy += c; s1y += a * c; s2y += b * c; }
  const M = [[n, s1, s2], [s1, s11, s12], [s2, s12, s22]], v = [sy, s1y, s2y];
  const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M);
  if (!Number.isFinite(D) || Math.abs(D) < 1e-12) return null;
  return [0, 1, 2].map(k => det(M.map((row, i) => row.map((x, j) => (j === k ? v[i] : x)))) / D);      // Cramer's rule
}

/** Rolling monitor. Returns one row per day from index W on: { date, a, b2y, bslope, r2, sd, fit, e, z, z20, implied20, actual20, nq }. */
export function rollingMonitor({ dates, r, d2y, dslope, nq }, W = 120) {
  const rows = [];
  for (let t = W; t < r.length; t++) {
    const b = ols3(r, d2y, dslope, t - W, t);
    if (!b) continue;
    let ss = 0, sst = 0, mean = 0;
    for (let i = t - W; i < t; i++) mean += r[i];
    mean /= W;
    for (let i = t - W; i < t; i++) { const res = r[i] - (b[0] + b[1] * d2y[i] + b[2] * dslope[i]); ss += res * res; sst += (r[i] - mean) ** 2; }
    const fit = b[0] + b[1] * d2y[t] + b[2] * dslope[t], e = r[t] - fit, sd = Math.sqrt(ss / (W - 3));
    rows.push({ date: dates[t], a: b[0], b2y: b[1], bslope: b[2], r2: sst > 0 ? 1 - ss / sst : null, sd, fit, e, z: e / sd, r: r[t], nq: nq[t] });
  }
  for (let i = 0; i < rows.length; i++) {
    if (i < 19) { rows[i].z20 = rows[i].implied20 = rows[i].actual20 = null; continue; }
    let se = 0, sf = 0, sr = 0;
    for (let k = i - 19; k <= i; k++) { se += rows[k].e; sf += rows[k].fit; sr += rows[k].r; }
    rows[i].z20 = se / (rows[i].sd * Math.sqrt(20)); rows[i].implied20 = sf; rows[i].actual20 = sr;
  }
  return rows;
}

/** Plain-English read of the latest row (context only). */
export function describe(row) {
  if (!row) return null;
  const regime = row.r2 >= 0.2 ? 'Nasdaq is trading as a rates asset' : row.r2 >= 0.08 ? 'rates explain part of Nasdaq\'s moves' : 'Nasdaq is not trading on rates right now';
  const sign = Math.abs(10 * row.b2y) < 0.25 ? 'no clear direction from the 2y' : row.b2y > 0 ? 'yields up = Nasdaq up (growth / risk-on regime)' : 'yields up = Nasdaq down (discount-rate regime)';
  let gap = null;
  if (row.z20 != null) {
    gap = Math.abs(row.z20) >= 2.5 ? (row.z20 < 0 ? 'Nasdaq is far BELOW what rates implied over 20 days: the move is not a rates story' : 'Nasdaq is far ABOVE what rates implied over 20 days: the move is not a rates story')
      : Math.abs(row.z20) >= 1.5 ? (row.z20 < 0 ? 'Nasdaq is lagging what rates implied over 20 days' : 'Nasdaq is running ahead of what rates implied over 20 days') : 'Nasdaq is roughly where rates implied over 20 days';
  }
  return { regime, sign, gap };
}
