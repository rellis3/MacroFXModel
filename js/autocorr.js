/**
 * Autocorrelation board for the Desk Terminal (owner, 2026-11-04): how much memory each market's daily moves carry.
 *
 * Per market, from OANDA daily closes (log returns):
 *   - return autocorrelation at lags 1..10 days, each with a heteroskedasticity-robust standard error
 *     (se_k = sqrt(sum e_t^2 e_{t-k}^2) / sum e_t^2), because the iid band 1/sqrt(n) is far too narrow when
 *     volatility clusters;
 *   - variance ratios at 5 and 20 days (Lo-MacKinlay 1988, overlapping, heteroskedasticity-consistent z*):
 *     above 1 = moves have tended to continue (trend), below 1 = they have tended to reverse (mean reversion);
 *   - volatility memory: the autocorrelation of |return| at lags 1..10 (volatility clustering), with an iid band
 *     Bonferroni-corrected for the ten lags looked at;
 *   - stability: lag-1 and VR(20) in the first and second half of the history, so a result that lives in one half
 *     is visible;
 *   - recent: lag-1 over the last 60 days, labelled context (noisy by construction: se ~ 0.13).
 *
 * Reading per market, corrected for looking at every market at once: Benjamini-Hochberg at 10% across the board on
 * each market's VR p-value (the smaller of VR5 / VR20, Bonferroni x2). "trends" / "reverts" only when it survives
 * BH AND both halves agree in sign; otherwise "no memory" (or "unstable" when it survives but the halves disagree).
 *
 * DESCRIPTION, NOT A SIGNAL. In-sample over the history to the lockbox (2026-08-21, the H-A holdout: no statistic
 * here reads a day after it except the labelled 60-day "recent" figure). Nothing here goes to the desk. A market
 * that "trends" here is a question for the research protocol (register, prereg on fresh data), not a result.
 *
 * Pure: no fetch, no clock. Tested in js/autocorr.test.mjs.
 */
export const AC_DEFAULTS = { maxLag: 10, vrHorizons: [5, 20], recentDays: 60, bhQ: 0.10, minN: 500, lockboxEnd: '2026-08-21' };
export const AC_LABEL = 'Description, not a signal: in-sample to the lockbox (2026-08-21), corrected for testing every market at once (BH 10%) and required to hold in both halves. Never fed to the desk; a market that trends or reverts here is a question for the research protocol, not a result.';

const fin = Number.isFinite;
const r3 = x => (fin(x) ? +x.toFixed(3) : null);
const r2 = x => (fin(x) ? +x.toFixed(2) : null);
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf). */
export function normCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
/** Inverse normal CDF (Acklam's rational approximation, |error| < 1.2e-9). */
export function normInv(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - lo) return -normInv(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
const p2 = z => 2 * (1 - normCdf(Math.abs(z)));

/** Ascending [{date, value}] closes → [{date, r}] daily log returns (non-positive, missing and weekend-dated closes skipped). */
export function logReturns(closes = []) {
  const wkday = d => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay());   // a weekend stub bar rolls into Monday's close-to-close
  const s = (closes ?? []).filter(p => p && fin(p.value) && p.value > 0 && wkday(p.date)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const out = [];
  for (let i = 1; i < s.length; i++) if (s[i].date !== s[i - 1].date) out.push({ date: s[i].date, r: Math.log(s[i].value / s[i - 1].value) });
  return out;
}

/** Autocorrelation of x at lags 1..maxLag, with the robust standard error of each. */
export function acf(x, maxLag = 10) {
  const n = x.length, m = mean(x), e = x.map(v => v - m), den = e.reduce((s, v) => s + v * v, 0);
  const out = [];
  for (let k = 1; k <= maxLag; k++) {
    let num = 0, q = 0;
    for (let t = k; t < n; t++) { num += e[t] * e[t - k]; q += e[t] * e[t] * e[t - k] * e[t - k]; }
    out.push({ lag: k, r: den ? num / den : null, se: den ? Math.sqrt(q) / den : null });
  }
  return out;
}

/** Lo-MacKinlay variance ratio at horizon q (overlapping), with the heteroskedasticity-consistent z*. */
export function varianceRatio(x, q) {
  const n = x.length; if (n < q * 10) return null;
  const mu = mean(x), e = x.map(v => v - mu), s1 = e.reduce((s, v) => s + v * v, 0) / (n - 1);
  let sq = 0;
  for (let t = q - 1; t < n; t++) { let s = 0; for (let j = 0; j < q; j++) s += e[t - j]; sq += s * s; }
  const m = q * (n - q + 1) * (1 - q / n), vr = (sq / m) / s1;
  const den = e.reduce((s, v) => s + v * v, 0) ** 2;
  let theta = 0;
  for (let j = 1; j < q; j++) {
    let d = 0; for (let t = j; t < n; t++) d += e[t] * e[t] * e[t - j] * e[t - j];
    theta += (2 * (q - j) / q) ** 2 * (n * d / den);
  }
  const z = theta > 0 ? (vr - 1) / Math.sqrt(theta / n) : null;
  return { q, vr, z, p: z == null ? null : p2(z) };
}

/** Benjamini-Hochberg: p-values (null allowed) → boolean "discovery" at level q, same order. */
export function bh(ps, q = 0.1) {
  const idx = ps.map((p, i) => [p, i]).filter(([p]) => fin(p)).sort((a, b) => a[0] - b[0]), m = idx.length, out = ps.map(() => false);
  let kMax = 0; idx.forEach(([p], j) => { if (p <= ((j + 1) / m) * q) kMax = j + 1; });
  for (let j = 0; j < kMax; j++) out[idx[j][1]] = true;
  return out;
}

/** One market's profile from its daily closes. Returns { ok:false, why } when too short. */
export function profile(closes, opts = {}) {
  const o = { ...AC_DEFAULTS, ...opts };
  const all = logReturns(closes), R = all.filter(p => p.date <= o.lockboxEnd), x = R.map(p => p.r);
  if (x.length < o.minN) return { ok: false, why: `${x.length} daily returns to the lockbox (need ${o.minN})`, n: x.length };
  const ret = acf(x, o.maxLag), absx = x.map(Math.abs), vol = acf(absx, o.maxLag);
  const bandRet = normInv(1 - 0.05 / (2 * o.maxLag));   // z per lag, Bonferroni over the lags
  const bandAbs = bandRet / Math.sqrt(x.length);
  const vr = Object.fromEntries(o.vrHorizons.map(q => [q, varianceRatio(x, q)]));
  const half = Math.floor(x.length / 2), A = x.slice(0, half), B = x.slice(half);
  const halves = [A, B].map(h => ({ acf1: r3(acf(h, 1)[0].r), vr20: r3(varianceRatio(h, 20)?.vr) }));
  const recentX = all.slice(-o.recentDays).map(p => p.r);
  const ps = o.vrHorizons.map(q => vr[q]?.p).filter(fin), pMin = ps.length ? Math.min(1, Math.min(...ps) * ps.length) : null;
  const lead = o.vrHorizons.map(q => vr[q]).filter(v => v?.p != null).sort((a, b) => a.p - b.p)[0] ?? null;
  // vol memory: how many lags clear the band, and the lag-1 / lag-10 levels
  const volLags = vol.filter(v => fin(v.r) && v.r > bandAbs).length;
  return {
    ok: true, n: x.length, from: R[0]?.date, to: R.at(-1)?.date,
    ret: ret.map(v => ({ lag: v.lag, r: r3(v.r), se: r3(v.se), sig: fin(v.r) && fin(v.se) && v.se > 0 && Math.abs(v.r / v.se) > bandRet })),
    vol: vol.map(v => ({ lag: v.lag, r: r3(v.r) })), bandRetZ: r2(bandRet), bandAbs: r3(bandAbs), volLags,
    vr: Object.fromEntries(Object.entries(vr).map(([q, v]) => [q, v ? { vr: r3(v.vr), z: r2(v.z), p: r3(v.p) } : null])),
    leadQ: lead?.q ?? null, leadVr: r3(lead?.vr), pMin: r3(pMin),
    halves, recent: { days: recentX.length, acf1: recentX.length >= 30 ? r3(acf(recentX, 1)[0].r) : null, to: all.at(-1)?.date ?? null },
  };
}

/** Plain-English reading of one profile, given whether it survived BH. */
export function reading(p, survived) {
  if (!p?.ok) return { word: 'no data', line: p?.why ?? 'no data' };
  const dir = (p.leadVr ?? 1) > 1 ? 1 : -1, halvesAgree = p.halves.every(h => fin(h.vr20) && Math.sign(h.vr20 - 1) === dir);
  const volLine = p.volLags >= 8 ? 'volatility clusters strongly (a big day tends to follow a big day for 10+ days)' : p.volLags >= 3 ? 'volatility clusters' : 'little volatility clustering';
  if (!survived) return { word: 'no memory', line: `Daily moves carry no reliable memory in direction (a random walk at 5 and 20 days); ${volLine}.` };
  if (!halvesAgree) return { word: 'unstable', line: `Variance ratio at ${p.leadQ} days is ${p.leadVr} over the whole history, but the two halves disagree: not a stable property; ${volLine}.` };
  return dir > 0
    ? { word: 'trends', line: `Moves have tended to continue: ${p.leadQ}-day variance is ${Math.round((p.leadVr - 1) * 100)}% more than ${p.leadQ} one-day moves would give, in both halves; ${volLine}.` }
    : { word: 'reverts', line: `Moves have tended to reverse: ${p.leadQ}-day variance is ${Math.round((1 - p.leadVr) * 100)}% less than ${p.leadQ} one-day moves would give, in both halves; ${volLine}.` };
}

/** The board: { id: { label, closes } } → rows with BH applied across markets. */
export function board(series, opts = {}) {
  const o = { ...AC_DEFAULTS, ...opts };
  const ids = Object.keys(series ?? {}), profs = ids.map(id => profile(series[id].closes, o));
  const disc = bh(profs.map(p => (p.ok ? p.pMin : null)), o.bhQ);
  const rows = ids.map((id, i) => ({ id, label: series[id].label ?? id, ...profs[i], survivedBH: disc[i], reading: reading(profs[i], disc[i]) }));
  const rank = { trends: 0, reverts: 1, unstable: 2, 'no memory': 3, 'no data': 4 };
  rows.sort((a, b) => rank[a.reading.word] - rank[b.reading.word] || (a.pMin ?? 1) - (b.pMin ?? 1));
  const count = w => rows.filter(r => r.reading.word === w).length;
  return { rows, summary: { markets: rows.filter(r => r.ok).length, trends: count('trends'), reverts: count('reverts'), unstable: count('unstable'), noMemory: count('no memory') }, label: AC_LABEL, params: { maxLag: o.maxLag, vrHorizons: o.vrHorizons, bhQ: o.bhQ, lockboxEnd: o.lockboxEnd } };
}
