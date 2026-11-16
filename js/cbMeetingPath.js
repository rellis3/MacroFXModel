/**
 * Meeting-by-meeting path for the ECB, the BoE and the BoJ, from the laptop's short-rate futures (scripts/rates_line/refresh_cb_expectations.py -> KV
 * cb_rate_futures_v1 -> /api/cb-expectations). Pure and tested in js/cbMeetingPath.test.mjs. PRICED, NOT FORECAST: it says what the strip implies, not what a
 * bank will do.
 *
 * WHAT THE INPUT IS. Each rung is a 3-month contract on a compounded overnight rate (ESTR, SONIA, TONA). Its price is 100 minus the rate that compounds
 * over the reference period that ENDS at the contract's last trading day and starts at the previous contract's last trading day (the front contract's
 * period starts about 13 weeks earlier). So the strip is a list of average overnight rates over consecutive quarters.
 *
 * METHOD. The overnight rate is a piecewise-constant path that steps at each policy meeting (on the day the new rate takes effect; the ECB moves the
 * Wednesday after its Thursday decision). Starting from today's overnight rate L0, the unknowns are the steps. Each rung gives one equation: the average of
 * the path over its period minus L0 equals the step sizes weighted by the share of the period spent after each meeting. There are more meetings than
 * quarters, so the equations are solved as the smallest set of moves (ridge least squares) that reproduces every rung. Two things follow and are stated
 * on screen: the move priced by the END of each quarter is well determined (it is the rung itself); how it is split between two meetings inside one
 * quarter is not, so the per-meeting bp is a reading, not a measurement. The move shown as a probability is |step| / 25 bp, capped at 100%, which treats
 * every move as a 25 bp move (a coarse reading, not a CME FedWatch style distribution).
 *
 * ASSUMPTIONS (all printed in the output): today's overnight rate is the policy rate plus a fixed spread (ESTR is about 6 bp under the deposit rate, SONIA
 * about 2 bp under Bank Rate, TONA about 2 bp under the call-rate target); the days of a period that have already passed are taken to have run at L0, so
 * a policy change inside the front period (the BoE hiked on 5 Nov 2026, inside the contract that started in mid-September) is not seen by the front
 * rung, which is why the front rung is only used when a meeting remains inside it. The strip is a proxy for an OIS curve: 3-month contracts are coarse
 * around a meeting, prices are the day's close, and the account's market data is delayed.
 */
const DAY = 86400000;
const ymd = s => Date.UTC(+String(s).slice(0, 4), +String(s).slice(4, 6) - 1, +String(s).slice(6, 8));
const iso = t => new Date(t).toISOString().slice(0, 10);
const isoMs = s => Date.parse(`${s}T00:00:00Z`);
const fin = Number.isFinite;

/** Decision days from each bank's own calendar (ECB: ecb.europa.eu monetary policy meetings, Day 2; BoE: MPC dates 2026 and 2027; BoJ: MPM second day). Hand-kept: the stale guard below tells when to refresh. */
export const CALENDAR_AS_OF = '2026-11-16';
export const MEETINGS = {
  EUR: { bank: 'ECB', lagDays: 6, spread: -0.063, rfr: 'ESTR', dates: ['2026-12-17', '2027-02-04', '2027-03-18', '2027-04-29', '2027-06-10', '2027-07-22', '2027-09-09', '2027-10-28', '2027-12-16'] },
  GBP: { bank: 'BoE', lagDays: 0, spread: -0.02, rfr: 'SONIA', dates: ['2026-12-17', '2027-02-04', '2027-03-18', '2027-04-29', '2027-06-17', '2027-07-29', '2027-09-16', '2027-11-04', '2027-12-16'] },
  JPY: { bank: 'BoJ', lagDays: 0, spread: -0.02, rfr: 'TONA', dates: ['2026-12-18', '2027-01-22', '2027-03-18', '2027-04-28', '2027-06-11', '2027-07-22', '2027-09-22', '2027-10-29', '2027-12-17'] },
};

/** Days between `now` and the last meeting on the calendar, per bank: the stale guard (refresh the lists when this gets under about 120). */
export function calendarCoverage(now = Date.now()) {
  const out = {};
  for (const [c, m] of Object.entries(MEETINGS)) out[c] = Math.round((isoMs(m.dates.at(-1)) - now) / DAY);
  return out;
}

/** Solve (A'A + lambda I) x = A'y by Gaussian elimination with partial pivoting. */
function solveRidge(A, y, lambda) {
  const n = A[0]?.length ?? 0;
  const M = Array.from({ length: n }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (j === n ? 0 : (i === j ? lambda : 0))));
  for (let k = 0; k < A.length; k++) for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) M[i][j] += A[k][i] * A[k][j]; M[i][n] += A[k][i] * y[k]; }
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    if (Math.abs(M[i][i]) < 1e-12) continue;
    for (let r = i + 1; r < n; r++) { const f = M[r][i] / M[i][i]; for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = Math.abs(M[i][i]) < 1e-12 ? 0 : s / M[i][i]; }
  return x;
}

/** The reference periods of a strip: [start, end) in ms for each rung, in expiry order. The first period starts 91 days before its end. */
export function periods(rungs) {
  const rs = [...rungs].filter(r => /^\d{8}$/.test(String(r.expiry))).sort((a, b) => String(a.expiry).localeCompare(String(b.expiry)));
  return rs.map((r, i) => { const end = ymd(r.expiry); return { r, start: i === 0 ? end - 91 * DAY : ymd(rs[i - 1].expiry), end }; });
}

/**
 * One bank's meeting-by-meeting path.
 *   rungs   [{ expiry:'YYYYMMDD', rate, rateWeekAgo?, rateDayAgo?, rate4wAgo?, local?, month? }]
 *   ccy     'EUR' | 'GBP' | 'JPY'
 *   policy  the current policy rate in %
 *   now     ms
 * Returns null when there is nothing to solve (no calendar, no rungs, no policy rate).
 */
export function meetingPath(rungs, ccy, policy, now = Date.now()) {
  const cal = MEETINGS[ccy];
  if (!cal || !fin(policy) || !rungs?.length) return null;
  const P = periods(rungs.filter(r => fin(r.rate)));
  if (!P.length) return null;
  const T = Math.floor(now / DAY) * DAY, L0 = policy + cal.spread, lastEnd = P.at(-1).end;
  const mt = cal.dates.map(d => ({ date: d, eff: isoMs(d) + cal.lagDays * DAY })).filter(m => m.eff > T && m.eff < lastEnd);
  const frac = (p, m) => Math.max(0, (p.end - Math.max(p.start, m.eff, T)) / DAY) / ((p.end - p.start) / DAY);
  const rows = [], ys = [], used = [];
  for (const p of P) {
    if (p.end <= T) continue;
    const a = mt.map(m => frac(p, m));
    if (!a.some(v => v > 0)) continue;                    // no meeting left inside this period: it carries no information about a step
    rows.push(a); ys.push((p.r.rate - L0) * 100); used.push(p);
  }
  const strip = P.filter(p => p.end > T).map(p => ({ period: `${iso(p.start)} to ${iso(p.end)}`, end: iso(p.end), local: p.r.local ?? null, rate: +p.r.rate.toFixed(3), vsOvernightBp: Math.round((p.r.rate - L0) * 100),
    movedBp: { d1: fin(p.r.rateDayAgo) ? Math.round((p.r.rate - p.r.rateDayAgo) * 100) : null, w1: fin(p.r.rateWeekAgo) ? Math.round((p.r.rate - p.r.rateWeekAgo) * 100) : null, w4: fin(p.r.rate4wAgo) ? Math.round((p.r.rate - p.r.rate4wAgo) * 100) : null } }));
  let steps = mt.map(() => 0);
  if (rows.length && mt.length) steps = solveRidge(rows, ys, 0.02);
  let cum = 0;
  const meetings = mt.map((m, j) => { cum += steps[j]; return { date: m.date, effective: iso(m.eff), stepBp: +steps[j].toFixed(1), cumBp: +cum.toFixed(1), rate: +(L0 + cum / 100 - cal.spread).toFixed(3), probMove: +Math.min(1, Math.abs(steps[j]) / 25).toFixed(2), direction: Math.abs(steps[j]) < 2 ? 'none' : steps[j] > 0 ? 'hike' : 'cut' }; });
  // how well the steps reproduce each rung (bp): a large residual means the strip is not a clean policy path (a spread, a term premium, a stale price)
  const fit = rows.map((a, k) => ({ period: used[k].r.local ?? iso(used[k].end), residualBp: +(a.reduce((s, v, j) => s + v * steps[j], 0) - ys[k]).toFixed(1) }));
  const front = P.find(p => p.end > T);
  return {
    bank: cal.bank, rfr: cal.rfr, policy, overnight: +L0.toFixed(3), spreadAssumed: cal.spread, meetings, strip, fit,
    frontPeriod: front ? { period: `${iso(front.start)} to ${iso(front.end)}`, rate: +front.r.rate.toFixed(3), vsOvernightBp: Math.round((front.r.rate - L0) * 100), usedInFit: used.includes(front) } : null,
    calendar: { asOf: CALENDAR_AS_OF, daysLeft: Math.round((isoMs(cal.dates.at(-1)) - now) / DAY), stale: (isoMs(cal.dates.at(-1)) - now) / DAY < 120 },
    method: 'Smallest set of rate moves that reproduces every quarterly futures rate. The move by the end of each quarter is solid; how it splits between two meetings in one quarter is not. Probability = |move| / 25 bp. Priced, not forecast.',
  };
}
