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
