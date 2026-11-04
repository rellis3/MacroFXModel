/**
 * Lead-lag grid for the Desk Terminal (owner, 2026-11-04): does one market's daily move lead another's a day or more
 * later? Cross-correlation across every ordered pair of the markets on the autocorrelation board (js/autocorr.js).
 *
 * Per ordered pair (A leads B), from OANDA daily closes (log returns, weekdays, the same 17:00 New York bar for every
 * market, so no clock offset between the two ends):
 *   - corr(A_t, B_{t+k}) at k = 1..5 days, with a heteroskedasticity-robust standard error
 *     (se = sqrt(sum a_t^2 b_{t+k}^2) / sqrt(sum a^2 * sum b^2), on demeaned returns);
 *   - the best lag's p-value, Bonferroni over the five lags looked at;
 *   - the same-day correlation (k = 0) as context: pairs sharing a leg (EURUSD, GBPUSD) move together the same day,
 *     which is not a lead;
 *   - the best lag's correlation in the first and second half of the history.
 *
 * A pair is a "lead" only when it survives Benjamini-Hochberg at 10% across every ordered pair (about 1,900) AND the
 * two halves agree in sign. Everything else is shown as a near miss at most.
 *
 * DESCRIPTION, NOT A SIGNAL. In-sample to the lockbox (2026-08-21). A lag-1 link can also come from a market that
 * trades thinly or is quoted late (a stale close catches up the next day). Nothing here goes to the desk; a lead found
 * here is a question for the research protocol (register, prereg on fresh data), not a result.
 *
 * Pure: no fetch, no clock. Tested in js/leadLag.test.mjs.
 */
import { logReturns, normCdf, bh } from './autocorr.js';

export const LL_DEFAULTS = { maxLag: 5, bhQ: 0.10, minN: 500, lockboxEnd: '2026-08-21', top: 40 };
export const LL_LABEL = 'Description, not a signal: in-sample to the lockbox (2026-08-21), corrected for testing every ordered pair at once (BH 10%) and required to hold in both halves. A same-day correlation is not a lead. Never fed to the desk; a lead here is a question for the research protocol, not a result.';

const fin = Number.isFinite;
const r3 = x => (fin(x) ? +x.toFixed(3) : null);
const r4 = x => (fin(x) ? +x.toFixed(4) : null);

/** { id: closes } → { dates, R: { id: Float64Array of returns on the common dates (NaN where missing) } } */
export function alignReturns(series, lockboxEnd = LL_DEFAULTS.lockboxEnd) {
  const per = {}, all = new Set();
  for (const [id, closes] of Object.entries(series ?? {})) {
    const m = new Map(); for (const p of logReturns(closes)) if (p.date <= lockboxEnd) { m.set(p.date, p.r); all.add(p.date); }
    per[id] = m;
  }
  const dates = [...all].sort();
  const R = Object.fromEntries(Object.entries(per).map(([id, m]) => [id, Float64Array.from(dates, d => (m.has(d) ? m.get(d) : NaN))]));
  return { dates, R };
}

/** Cross-correlation of a_t with b_{t+k} over [from, to) of the index, pairwise-complete, with the robust se. */
export function xcorr(a, b, k, from = 0, to = a.length) {
  let n = 0, sa = 0, sb = 0;
  for (let t = from; t + k < to; t++) { const x = a[t], y = b[t + k]; if (x === x && y === y) { n++; sa += x; sb += y; } }
  if (n < 30) return { r: null, se: null, n };
  const ma = sa / n, mb = sb / n;
  let sab = 0, saa = 0, sbb = 0, q = 0;
  for (let t = from; t + k < to; t++) { const x = a[t], y = b[t + k]; if (x === x && y === y) { const u = x - ma, v = y - mb; sab += u * v; saa += u * u; sbb += v * v; q += u * u * v * v; } }
  const den = Math.sqrt(saa * sbb);
  return den ? { r: sab / den, se: Math.sqrt(q) / den, n } : { r: null, se: null, n };
}

/** The grid. series: { id: { label, closes } }. */
export function leadLagGrid(series, opts = {}) {
  const o = { ...LL_DEFAULTS, ...opts };
  const ids = Object.keys(series ?? {}).filter(id => (series[id]?.closes ?? []).length > o.minN);
  const { dates, R } = alignReturns(Object.fromEntries(ids.map(id => [id, series[id].closes])), o.lockboxEnd);
  const half = Math.floor(dates.length / 2), pairs = [];
  for (const A of ids) for (const B of ids) {
    if (A === B) continue;
    const lags = [];
    for (let k = 1; k <= o.maxLag; k++) { const c = xcorr(R[A], R[B], k); lags.push({ k, r: c.r, se: c.se, n: c.n, z: fin(c.r) && c.se > 0 ? c.r / c.se : null }); }
    const ok = lags.filter(l => fin(l.z)); if (!ok.length || ok[0].n < o.minN) continue;
    const best = ok.reduce((m, l) => (Math.abs(l.z) > Math.abs(m.z) ? l : m));
    const p = Math.min(1, 2 * (1 - normCdf(Math.abs(best.z))) * o.maxLag);
    const same = xcorr(R[A], R[B], 0), h1 = xcorr(R[A], R[B], best.k, 0, half), h2 = xcorr(R[A], R[B], best.k, half);
    pairs.push({ lead: A, follow: B, k: best.k, r: r3(best.r), z: +best.z.toFixed(2), p: r4(p), n: best.n, r1: r3(lags[0].r), sameDay: r3(same.r), halves: [r3(h1.r), r3(h2.r)], lags: lags.map(l => r3(l.r)) });
  }
  const disc = bh(pairs.map(x => x.p), o.bhQ);
  pairs.forEach((x, i) => { x.survivedBH = disc[i]; x.halvesAgree = x.halves.every(h => fin(h) && Math.sign(h) === Math.sign(x.r)); x.lead_ = disc[i] && x.halvesAgree; });
  pairs.sort((a, b) => a.p - b.p || Math.abs(b.z) - Math.abs(a.z));
  const leads = pairs.filter(x => x.lead_), near = pairs.filter(x => !x.lead_).slice(0, o.top);
  // the lag-1 matrix for the heat grid: matrix[A][B] = corr(A today, B tomorrow)
  const matrix = Object.fromEntries(ids.map(A => [A, Object.fromEntries(ids.filter(B => B !== A).map(B => [B, null]))]));
  for (const x of pairs) matrix[x.lead][x.follow] = x.r1;
  const leadSet = new Set(leads.map(x => `${x.lead}>${x.follow}`));
  return {
    ids, labels: Object.fromEntries(ids.map(id => [id, series[id].label ?? id])), from: dates[0] ?? null, to: dates.at(-1) ?? null, days: dates.length,
    tested: pairs.length, lags: o.maxLag, leads: leads.map(strip), near: near.map(strip), matrix, leadKeys: [...leadSet],
    byMarket: Object.fromEntries(ids.map(id => [id, {
      ledBy: pairs.filter(x => x.follow === id).slice(0, 5).map(strip),
      leads: pairs.filter(x => x.lead === id).slice(0, 5).map(strip),
    }])),
    label: LL_LABEL, params: { maxLag: o.maxLag, bhQ: o.bhQ, lockboxEnd: o.lockboxEnd },
  };
}
const strip = x => ({ lead: x.lead, follow: x.follow, k: x.k, r: x.r, z: x.z, p: x.p, n: x.n, sameDay: x.sameDay, halves: x.halves, lags: x.lags, survivedBH: x.survivedBH, halvesAgree: x.halvesAgree, isLead: x.lead_ });

/** A plain-English line for one pair. */
export function pairLine(x, labels = {}) {
  const L = id => labels[id] ?? id;
  const dir = x.r > 0 ? 'the same way' : 'the opposite way';
  const verdict = x.isLead ? 'a lead (survives the correction, both halves agree)' : x.survivedBH ? 'survives the correction but the two halves disagree' : 'not reliable after the correction';
  return `${L(x.lead)} today → ${L(x.follow)} ${x.k} day${x.k > 1 ? 's' : ''} later, ${dir} (r ${x.r > 0 ? '+' : ''}${x.r}; same day ${x.sameDay > 0 ? '+' : ''}${x.sameDay}): ${verdict}.`;
}
