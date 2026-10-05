/**
 * Forward scorecard for the forecast lines built 2026-10-05 — the Forecaster Portfolio's
 * "forward evidence" check (Lesson 01, card 10): does each improvement hold on days that
 * did not exist when it was fitted?
 *
 * Scored every session, automatically, against the London 00:00–22:00 session (the window
 * every ladder was fitted on), from hourly bars:
 *   daily   plain ladder  vs  IV-adjusted ladder (snapshot taken the morning of the session)
 *   weekly  √h ladder     vs  reverting ladder   (both from Monday's archived forecast)
 *   live    Live Range projected lines, replayed at every hourly checkpoint
 *
 * A rung is "exceeded" when the realised move went past it. Targets: p50 50%, p75 25%, p90 10%.
 * Pure: no network, no clock.
 */
import { sessionState, reforecast, londonParts, classOf } from './intradayRange.js';

const RUNGS = ['p50', 'p75', 'p90'];
const TAUS = { p50: 0.5, p75: 0.75, p90: 0.9 };
const r4 = x => Math.round(x * 1e4) / 1e4;

/** Realised open/high/low (and % moves) over London sessions `dates` (00:00–22:00), from ascending bars. */
export function realised(bars, dates) {
  const set = new Set(Array.isArray(dates) ? dates : [dates]);
  const sess = (bars ?? []).filter(b => { const p = londonParts(b.t); return set.has(p.date) && p.hour < 22; });
  if (!sess.length) return null;
  const open = sess[0].open, high = Math.max(...sess.map(b => b.high)), low = Math.min(...sess.map(b => b.low));
  const days = new Set(sess.map(b => londonParts(b.t).date)).size;
  return { open, high, low, days, hl: (high - low) / open * 100, oh: (high - open) / open * 100, ol: (open - low) / open * 100 };
}

/** Exceedance flags per rung (1 = realised beyond the line) and the H-L p50+p75 pinball loss. */
export function scoreLadder(ladder, real) {
  if (!ladder || !real) return null;
  const out = {};
  for (const q of ['hl', 'oh', 'ol']) {
    if (!ladder[q]) continue;
    out[q] = RUNGS.map(k => (Number.isFinite(ladder[q][k]) ? (real[q] > ladder[q][k] ? 1 : 0) : null));
  }
  let pin = 0;
  for (const k of ['p50', 'p75']) {
    const p = ladder.hl?.[k], d = real.hl - p, t = TAUS[k];
    if (!Number.isFinite(p)) return { ...out, pin: null };
    pin += d >= 0 ? t * d : (t - 1) * d;
  }
  return { ...out, pin: r4(pin) };
}

/** Replay the Live Range checkpoints of one session: did the day's final extreme pass each projected line? */
export function scoreLiveRange(bars, date, instrument, sigmaDailyPct) {
  if (!classOf(instrument) || !(sigmaDailyPct > 0)) return null;
  const st = sessionState(bars, date);
  const real = realised(bars, date);
  if (!st || !real) return null;
  const groups = {};
  for (const cp of st.checkpoints) {
    const L = reforecast(cp, { instrument, open: st.open, sigmaDailyPct });
    if (!L) continue;
    const g = cp.h <= 7 ? '01-07' : cp.h <= 14 ? '08-14' : '15-21';
    const G = groups[g] ??= { n: 0, up: [0, 0, 0], dn: [0, 0, 0] };
    G.n += 1;
    RUNGS.forEach((k, i) => {
      if (real.high > L.projHigh[k]) G.up[i] += 1;
      if (real.low < L.projLow[k]) G.dn[i] += 1;
    });
  }
  return Object.keys(groups).length ? groups : null;
}

/** Score one finished session for every instrument that has bars and a forecast. */
export function scoreSession({ date, forecast, ivadj, barsByName }) {
  const rows = {};
  for (const [name, fc] of Object.entries(forecast?.instruments ?? {})) {
    const bars = barsByName?.[name];
    const real = realised(bars, date);
    if (!real || real.days !== 1) continue;
    const row = { plain: scoreLadder(fc?.ladder, real) };
    if (ivadj?.[name]) row.ivadj = scoreLadder(ivadj[name], real);
    const lr = scoreLiveRange(bars, date, name, fc?.ladder?.sigma_daily_pct);
    if (lr) row.live = lr;
    rows[name] = row;
  }
  return rows;
}

/** Score one finished week (Monday's forecast, 5 sessions Mon→Fri). */
export function scoreWeek({ dates, forecast, barsByName }) {
  const rows = {};
  for (const [name, fc] of Object.entries(forecast?.instruments ?? {})) {
    const real = realised(barsByName?.[name], dates);
    if (!real || real.days < 4) continue;                       // a holiday-short week still counts; a gap does not
    const row = {};
    if (fc?.ladder_weekly) row.sqrt = scoreLadder(fc.ladder_weekly, real);
    if (fc?.ladder_weekly_rev) row.rev = scoreLadder(fc.ladder_weekly_rev, real);
    if (Object.keys(row).length) rows[name] = row;
  }
  return rows;
}

function _accLadder(acc, arm, s) {
  if (!s) return;
  const A = acc[arm] ??= { n: 0, pin: 0, pinN: 0, hl: [0, 0, 0], oh: [0, 0, 0], ol: [0, 0, 0] };
  A.n += 1;
  for (const q of ['hl', 'oh', 'ol']) s[q]?.forEach((v, i) => { if (v != null) A[q][i] += v; });
  if (s.pin != null) { A.pin += s.pin; A.pinN += 1; }
}
const _rates = A => ({ n: A.n, ...Object.fromEntries(['hl', 'oh', 'ol'].map(q => [q, A[q].map(x => r4(x / Math.max(A.n, 1)))])),
                      pinball_mean: A.pinN ? r4(A.pin / A.pinN) : null });

/** Roll the stored records up into what the page shows. */
export function summarise(store) {
  const days = Object.keys(store?.days ?? {}).sort(), weeks = Object.keys(store?.weeks ?? {}).sort();
  const daily = {}, weekly = {}, live = {}, paired = { daily: { plain: 0, ivadj: 0, n: 0 }, weekly: { sqrt: 0, rev: 0, n: 0 } };
  for (const d of days) for (const row of Object.values(store.days[d])) {
    _accLadder(daily, 'plain', row.plain); _accLadder(daily, 'ivadj', row.ivadj);
    if (row.plain?.pin != null && row.ivadj?.pin != null) { paired.daily.plain += row.plain.pin; paired.daily.ivadj += row.ivadj.pin; paired.daily.n += 1; }
    for (const [g, G] of Object.entries(row.live ?? {})) {
      const T = live[g] ??= { n: 0, up: [0, 0, 0], dn: [0, 0, 0] };
      T.n += G.n; G.up.forEach((x, i) => (T.up[i] += x)); G.dn.forEach((x, i) => (T.dn[i] += x));
    }
  }
  for (const w of weeks) for (const row of Object.values(store.weeks[w])) {
    _accLadder(weekly, 'sqrt', row.sqrt); _accLadder(weekly, 'rev', row.rev);
    if (row.sqrt?.pin != null && row.rev?.pin != null) { paired.weekly.sqrt += row.sqrt.pin; paired.weekly.rev += row.rev.pin; paired.weekly.n += 1; }
  }
  return {
    since: days[0] ?? null, sessions: days.length, weeks: weeks.length, targets: { p50: 0.5, p75: 0.25, p90: 0.1 },
    daily: Object.fromEntries(Object.entries(daily).map(([k, A]) => [k, _rates(A)])),
    weekly: Object.fromEntries(Object.entries(weekly).map(([k, A]) => [k, _rates(A)])),
    daily_ivadj_vs_plain_pinball: paired.daily.n ? r4(paired.daily.ivadj / paired.daily.plain) : null, daily_pairs: paired.daily.n,
    weekly_rev_vs_sqrt_pinball: paired.weekly.n ? r4(paired.weekly.rev / paired.weekly.sqrt) : null, weekly_pairs: paired.weekly.n,
    live: Object.fromEntries(Object.entries(live).map(([g, T]) => [g, { n: T.n, up: T.up.map(x => r4(x / T.n)), dn: T.dn.map(x => r4(x / T.n)) }])),
  };
}

/**
 * Plain-English verdicts for the page. Judged on SESSIONS / WEEKS, not instrument-days: 30+
 * instruments on one day mostly share the same few moves (MD: range-forecast-calibrated note), so
 * 123 instrument-days from 3 sessions is 3 observations, not 123. Thresholds are fixed here, in
 * advance: no verdict before 15 sessions (daily) / 6 weeks (weekly); "better/worse" only past ±2%.
 * Returns [{ topic, status: 'early'|'good'|'warn'|'same', text }].
 */
export const VERDICT_MIN = { sessions: 15, weeks: 6 };
export function verdicts(S) {
  const out = [];
  const pc = x => `${Math.round(x * 100)}%`;
  const fit = (rate, n, what, enough) => {
    if (!enough || !n) return { status: 'early', text: `${what}: too early to judge.` };
    if (rate > 0.30) return { status: 'warn', text: `${what}: running TIGHT, days bigger than forecast (p75 passed ${pc(rate)} vs 25%).` };
    if (rate < 0.20) return { status: 'warn', text: `${what}: running WIDE, days smaller than forecast (p75 passed ${pc(rate)} vs 25%).` };
    return { status: 'good', text: `${what}: about right (p75 passed ${pc(rate)} vs 25%).` };
  };
  const vs = (ratio, pairs, units, enough, a, b) => {
    if (!enough || ratio == null) return { status: 'early', text: `${b} vs ${a}: too early to judge (${units} so far).` };
    if (ratio < 0.98) return { status: 'good', text: `${b} beating ${a} by ${Math.round((1 - ratio) * 100)}% (${units}). Keep using it.` };
    if (ratio > 1.02) return { status: 'warn', text: `${b} doing WORSE than ${a} by ${Math.round((ratio - 1) * 100)}% (${units}). Consider going back to ${a}.` };
    return { status: 'same', text: `${b} and ${a} about the same so far (${units}).` };
  };
  const dEnough = S.sessions >= VERDICT_MIN.sessions, wEnough = S.weeks >= VERDICT_MIN.weeks;
  out.push({ topic: 'daily', ...vs(S.daily_ivadj_vs_plain_pinball, S.daily_pairs, `${S.sessions} sessions`, dEnough && S.daily_pairs > 0, 'plain Forecast', 'IV-adjusted') });
  out.push({ topic: 'daily', ...fit(S.daily?.ivadj?.hl?.[1], S.daily?.ivadj?.n, 'IV-adjusted daily lines', dEnough) });
  out.push({ topic: 'daily', ...fit(S.daily?.plain?.hl?.[1], S.daily?.plain?.n, 'Plain daily lines', dEnough) });
  out.push({ topic: 'weekly', ...vs(S.weekly_rev_vs_sqrt_pinball, S.weekly_pairs, `${S.weeks} weeks`, wEnough && S.weekly_pairs > 0, '√h Weekly', 'Reverting Weekly') });
  out.push({ topic: 'weekly', ...fit(S.weekly?.rev?.hl?.[1], S.weekly?.rev?.n, 'Reverting weekly lines', wEnough) });
  const L = Object.values(S.live ?? {});
  if (L.length) {
    const n = L.reduce((a, g) => a + g.n, 0);
    const p75 = L.reduce((a, g) => a + g.n * (g.up[1] + g.dn[1]) / 2, 0) / Math.max(n, 1);
    out.push({ topic: 'live', ...fit(p75, n, 'Live Range bold lines', dEnough) });
  } else out.push({ topic: 'live', status: 'early', text: 'Live Range bold lines: too early to judge.' });
  return out;
}
