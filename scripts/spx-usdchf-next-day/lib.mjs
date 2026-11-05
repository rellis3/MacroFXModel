/**
 * spx-usdchf-next-day (forge/SPX_USDCHF_NEXT_DAY_PREREG.md): the pure part of the scorer. No fetch, no clock.
 *
 *   pairs(spx, chf, from)   leader a_t (S&P log return on day t) and follower b_{t+1} (USDCHF log return on the next
 *                           common session), both on the 17:00 New York bar, t >= the window start
 *   score(...)              H1: r(a_t, b_{t+1}) with the robust se (js/leadLag.js xcorr), one-sided p; the lag-0 and
 *                           lag-2 controls and the mean of lags 3-5
 *   rule(...)               descriptive trade cell: walk-forward 250-session 80th/20th percentile of a_t, short
 *                           USDCHF after a top day, long after a bottom day, 2 pips round trip, month-block bootstrap
 *   gate(...)               the prereg's verdict logic: nothing before 500 sessions, a futility stop at 500, the
 *                           judgement at 765
 */
import { xcorr } from '../../js/leadLag.js';
import { normCdf } from '../../js/autocorr.js';

export const WINDOW_START = '2026-08-22';   // the first session after the lockbox date
export const N_FUTILITY = 500, N_JUDGE = 765, R_BAR = -0.05, CTRL_BAR = 0.05;
const wk = d => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay());

/** closes [{date, close}] x2 → the common weekday calendar with log returns; then the (t, t+1) pairs inside the window */
export function aligned(spx, chf) {
  const m = new Map((chf ?? []).filter(b => wk(b.date) && b.close > 0).map(b => [b.date, b.close]));
  const days = (spx ?? []).filter(b => wk(b.date) && b.close > 0 && m.has(b.date)).sort((x, y) => (x.date < y.date ? -1 : 1));
  const out = [];
  for (let i = 1; i < days.length; i++) out.push({ date: days[i].date, a: Math.log(days[i].close / days[i - 1].close), b: Math.log(m.get(days[i].date) / m.get(days[i - 1].date)) });
  return out;   // common sessions in order; a and b are each day's own return
}

/** H1 and the controls on the window. rows = aligned(); returns lags measured with the leader at index t, follower at t+k */
export function score(rows, from = WINDOW_START) {
  const i0 = rows.findIndex(r => r.date >= from); if (i0 < 0) return { n: 0 };
  // the leader must be inside the window; the follower is the next common session
  const A = Float64Array.from(rows.slice(i0), r => r.a), B = Float64Array.from(rows.slice(i0), r => r.b);
  const lag = k => xcorr(A, B, k);
  const h1 = lag(1), z = h1.se > 0 ? h1.r / h1.se : null;
  return { n: h1.n, from: rows[i0].date, to: rows.at(-1).date, r: h1.r, se: h1.se, z, pOneSided: z == null ? null : normCdf(z),
    controls: { lag0: lag(0).r, lag2: lag(2).r, lags3to5: [3, 4, 5].map(k => lag(k).r).reduce((s, v) => s + (v ?? 0), 0) / 3 } };
}

/** the prereg's verdict logic */
export function gate(s) {
  if (!s?.n || s.n < N_FUTILITY) return { stage: 'waiting', verdict: null, why: `${s?.n ?? 0} of ${N_FUTILITY} sessions for the futility look (${N_JUDGE} to judge); nothing is read before then` };
  if (s.n < N_JUDGE) return s.r > 0 ? { stage: 'futility', verdict: 'NULL', why: `wrong sign at ${s.n} sessions (r ${s.r.toFixed(3)} > 0): closed early as the prereg allows` } : { stage: 'continue', verdict: null, why: `futility look passed at ${s.n} sessions; judge at ${N_JUDGE}` };
  const pass = s.pOneSided < 0.05 && s.r <= R_BAR && Math.abs(s.controls.lag2 ?? 1) < CTRL_BAR;
  if (pass) return { stage: 'judged', verdict: 'VALIDATED', why: `r ${s.r.toFixed(3)}, one-sided p ${s.pOneSided.toFixed(4)}, lag-2 control ${s.controls.lag2.toFixed(3)} (research-only until |t| >= 3)` };
  const powered = Math.abs(R_BAR) >= (1.645 + 0.8416) / Math.sqrt(s.n) || s.r > R_BAR + 0.03;
  return { stage: 'judged', verdict: s.pOneSided >= 0.05 && !powered ? 'UNDERPOWERED' : 'NULL', why: `r ${s.r.toFixed(3)}, one-sided p ${s.pOneSided.toFixed(4)}, lag-2 ${s.controls.lag2?.toFixed(3)}; gate not met` };
}

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** descriptive trade cell. rows = aligned() over the full history (the thresholds need 250 sessions before the window) */
export function rule(rows, { from = WINDOW_START, look = 250, costPct = null, seed = 20261105, B = 2000, block = 21 } = {}) {
  const trades = [];
  for (let t = look; t + 1 < rows.length; t++) {
    if (rows[t].date < from) continue;
    const past = rows.slice(t - look, t).map(r => r.a).sort((x, y) => x - y), q = p => past[Math.min(past.length - 1, Math.floor(p * past.length))];
    const side = rows[t].a >= q(0.8) ? -1 : rows[t].a <= q(0.2) ? 1 : 0; if (!side) continue;
    const next = rows[t + 1], px = 1;   // the cost: 2 pips of USDCHF in %, from that day's level when given
    const cost = costPct ?? 0.0002 / 0.9;   // 2 pips ≈ 0.022% at USDCHF 0.90
    trades.push({ date: rows[t].date, side, ret: side * next.b - cost * px });
  }
  if (!trades.length) return { n: 0 };
  const mean = trades.reduce((s, x) => s + x.ret, 0) / trades.length, R = rng(seed), means = [];
  for (let b = 0; b < B; b++) { const s = []; while (s.length < trades.length) { const st = Math.floor(R() * trades.length); for (let k = 0; k < block && s.length < trades.length; k++) s.push(trades[(st + k) % trades.length].ret); } means.push(s.reduce((x, y) => x + y, 0) / s.length); }
  means.sort((x, y) => x - y);
  return { n: trades.length, meanPct: mean * 100, ci95Pct: [means[Math.floor(0.025 * B)] * 100, means[Math.floor(0.975 * B)] * 100], hit: trades.filter(x => x.ret > 0).length / trades.length };
}
