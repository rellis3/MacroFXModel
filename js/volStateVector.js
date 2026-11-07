// js/volStateVector.js — volatility as a shared state variable (C.OG), one vector per instrument per London session.
//
// DESCRIPTIVE ONLY. Every field is assembled from numbers the server already computes (the vol forecaster, the hourly
// HMM log, the stress and drawdown shadows, the forecast-vs-realised session audits). Nothing here fits a model, forecasts
// or signals; nothing here is read by a bot. Each field is { value, asOf, source, ... } or { value: null, reason } — a
// missing input is never filled with an invented number.
//
// Pure: no I/O, no clock. The route (js/volStateRoutes.js) gathers the inputs. Tested in js/volStateVector.test.mjs.

export const FIELDS = ['sigma_now', 'sigma_expected_change', 'sigma_vs_longrun', 'regime', 'forecast_error', 'jump_intensity'];
export const ERR_WINDOW = 20, LONGRUN_WINDOW = 252, LONGRUN_MIN = 200;
export const JUMP_PENDING = 'pending study jump-next-day-miss';

const fin = Number.isFinite;
const r = (v, d = 4) => (fin(v) ? +v.toFixed(d) : null);
const missing = (reason, extra = {}) => ({ value: null, reason, ...extra });

/** 1. σ the forecaster's lines are built from today (daily, % of open). */
export function sigmaNow(fc, asOf) {
  const L = fc?.ladder;
  if (fin(L?.sigma_used_pct) && L.sigma_used_pct > 0) {
    return { value: L.sigma_used_pct, unit: '% of open, daily', asOf, source: 'vol forecast ladder.sigma_used_pct (the σ the live lines use, event multiplier included)',
             sigma_daily_pct: L.sigma_daily_pct ?? null, event_mult: L.event_mult ?? null, estimator: L.estimator ?? null, stale: !!fc.stale };
  }
  return missing(fc ? 'no daily ladder in the forecast for this instrument' : 'instrument not in the vol forecast');
}

/** 2. The forecaster does not publish a next-session σ, so this is a labelled PROXY: the term-structure slope it computes. */
export function sigmaExpectedChange(fc, asOf) {
  const ts = fc?.term_structure, c5 = fc?.cone_5d, c63 = fc?.cone_63d;
  if (!fin(c5) || !fin(c63)) return missing('the forecaster has no 5d/63d cone percentiles for this instrument (no next-session σ is published either)');
  return {
    value: fin(ts?.slope) ? ts.slope : c5 - (fin(fc.vol_pct) ? fc.vol_pct : c63), unit: 'percentile points (5-day cone minus long window)',
    label: ts?.label ?? null, proxy: true, asOf,
    source: 'PROXY: forecaster term_structure.slope (today\'s σ percentile in its last 5 days minus in its trailing 252); the forecaster publishes no next-session σ',
    cone_5d: c5, cone_21d: fc.cone_21d ?? null, cone_63d: c63, vol_accel: fc.vol_accel?.label ?? null,
  };
}

/** Ratio of the last value to the median of the trailing window, and its percentile (average rank, as pandas rank(pct=True)). */
export function longrunStats(series, win = LONGRUN_WINDOW, minN = LONGRUN_MIN) {
  const w = (series ?? []).filter(fin).slice(-win);
  if (w.length < minN) return null;
  const x = w.at(-1), s = [...w].sort((a, b) => a - b);
  const med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  let less = 0, eq = 0;
  for (const v of w) { if (v < x) less++; else if (v === x) eq++; }
  return { ratio: med > 0 ? x / med : null, pct: (less + (eq + 1) / 2) / w.length * 100, n: w.length, median: med, last: x };
}

/** 3. σ ÷ trailing-252 median σ, on OANDA NY-close daily bars with the ladder's own estimator. */
export function sigmaVsLongrun(lr, fc) {
  if (!lr?.series) return missing(lr?.reason ?? 'no daily bars for the long-run σ series');
  const st = longrunStats(lr.series);
  if (!st) return missing(`only ${lr.series.filter(fin).length} σ values; need ${LONGRUN_MIN}`);
  return { value: r(st.ratio, 3), unit: 'σ ÷ median σ of the trailing 252 sessions', percentile: r(st.pct, 1), n: st.n, asOf: lr.asOf,
           source: `OANDA NY-close daily bars, estimator ${lr.estimator} (the ladder's), series computed here; forecaster's own 252-session percentile of its incumbent σ: ${fin(fc?.vol_pct) ? fc.vol_pct : 'n/a'}`,
           forecaster_vol_pct: fin(fc?.vol_pct) ? fc.vol_pct : null };
}

/**
 * 4. P(active = high-variance state) from the hourly HMM log, the last hour completed at or before `beforeMs`.
 * entry = { t0: 'YYYY-MM-DDTHH', s: 'qa.', p: [...] } (js/hmmHourly.js). Each reading is the filtered probability at the
 * last bar of a fit on bars up to that hour, so it is what was knowable then.
 */
export function hmmHighVolProb(entry, beforeMs) {
  if (!entry?.s || !entry.t0) return null;
  const t0 = Date.parse(entry.t0 + ':00:00Z');
  for (let i = entry.s.length - 1; i >= 0; i--) {
    const start = t0 + i * 3.6e6;
    if (start + 3.6e6 > beforeMs) continue;                         // hour not complete before the cut-off
    const ch = entry.s[i];
    if (ch === '.') continue;
    const p = entry.p?.[i];
    if (!fin(p)) continue;
    return { pActive: ch === 'a' ? p / 100 : 1 - p / 100, state: ch === 'a' ? 'active' : 'quiet', hour: new Date(start).toISOString().slice(0, 13) + ':00Z', ageH: (beforeMs - start) / 3.6e6 - 1 };
  }
  return null;
}

export function regime(hmm, cutoffIso) {
  if (!hmm) return missing('no hourly HMM reading for this instrument before the London open');
  if (hmm.ageH > 6) return missing(`last hourly HMM reading is ${hmm.ageH.toFixed(0)}h before the London open (market closed or log gap)`, { lastHour: hmm.hour });
  return { value: r(hmm.pActive, 3), unit: 'P(high-variance "active" state), filtered', state: hmm.state, asOf: hmm.hour, cutoff: cutoffIso,
           source: 'hourly two-state Gaussian HMM log (hmm_hourly_v1, js/hmmHourly.js): filtered probability at the last hour completed before the London open; states differ by variance, not direction' };
}

/** 5a. Trailing mean log(realised H→L ÷ forecast H→L p50) over the last ERR_WINDOW audited sessions before the session. */
export function forecastErrorStat(rows, win = ERR_WINDOW) {
  const ok = (rows ?? []).filter(x => fin(x.hl) && x.hl > 0 && fin(x.p50) && x.p50 > 0).sort((a, b) => a.date.localeCompare(b.date)).slice(-win);
  if (!ok.length) return null;
  const logs = ok.map(x => Math.log(x.hl / x.p50));
  const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
  return { mean, n: ok.length, from: ok[0].date, to: ok.at(-1).date, overP50: ok.filter(x => x.hl > x.p50).length / ok.length };
}

export function forecastError(rows, { stress = null, drawdown = null, cls = null } = {}) {
  const st = forecastErrorStat(rows);
  const shadows = {
    stress: stress && fin(stress.factor) ? { factor: stress.factor, asOf: stress.sessionDate, source: '/api/stress-shadow (forecast-miss-scan A1, live ladder × factor)' }
                                          : missing(cls ? 'no stress-shadow factor for this instrument today' : 'stress shadow covers FX and indices only'),
    drawdown: drawdown && fin(drawdown.factor) ? { factor: drawdown.factor, trigger: !!drawdown.trigger, asOf: drawdown.sessionDate, source: '/api/drawdown-shadow (drawdown-forecast-error A1)' }
                                              : missing(cls ? 'no drawdown-shadow factor for this instrument today' : 'drawdown shadow covers FX and indices only'),
  };
  if (!st) return { ...missing('no audited forecast-vs-realised sessions in the window'), shadows };
  const ready = st.n >= ERR_WINDOW;
  return { value: r(st.mean, 4), unit: `mean log(realised H→L ÷ forecast H→L p50), last ${st.n} audited sessions`, n: st.n, full: ready, asOf: st.to, from: st.from,
           share_over_p50: r(st.overP50, 3), source: 'vol_session_<date>.hl vs vol_forecast_<date> ladder H→L p50 (audits taken after the session ended are skipped)', shadows };
}

/** 6. Jump intensity: not built here; waits for its own study. */
export function jumpIntensity(live = null) {
  if (live && fin(live.value)) return live;
  return missing(JUMP_PENDING);
}

/** The whole vector for one instrument. */
export function buildVector({ sym, sessionDate, fc, fcAsOf, longrun, hmm, cutoffIso, errRows, stress, drawdown, cls, jump }) {
  return {
    sym, sessionDate,
    sigma_now: sigmaNow(fc, fcAsOf),
    sigma_expected_change: sigmaExpectedChange(fc, fcAsOf),
    sigma_vs_longrun: sigmaVsLongrun(longrun, fc),
    regime: regime(hmm, cutoffIso),
    forecast_error: forecastError(errRows, { stress, drawdown, cls }),
    jump_intensity: jumpIntensity(jump),
  };
}
