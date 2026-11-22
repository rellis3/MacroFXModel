/**
 * ladder-v2 SHADOW ladder + exhaustion zones — the site port of scripts/ladder-v2/export_shadow.py and
 * export_exhaustion.py. Pure functions; the route (js/ladderV2ShadowRoutes.js) fetches the OANDA bars.
 *
 * Per instrument (banked 2026-11-19: ladder-v2-nq / -gold / -eurusd, exhaustion-v2-*, reversal-zones):
 *   NQ      sigma = har_rv_log on NY-close daily bars (OANDA, from 2016-01-04); futures reuse the CFD widths
 *   GOLD    sigma = HAR-CJ on OANDA 5-minute RV; CFD widths, and CME GC widths fitted on the same spot sigma
 *   EURUSD  sigma = HAR-CJ on OANDA 5-minute RV; 6E reuses the CFD widths
 * Fixed parts (coefficients, widths, zones, odds) live in js/ladderV2Params.json, written by
 * scripts/ladder-v2/build_params.py. js/ladderV2Shadow.test.mjs checks sigma against the Python on a frozen fixture.
 * SHADOW ONLY: nothing live reads this.
 */
import { readFileSync } from 'node:fs';
import { harRvLogSigma, SIGMA_ESTIMATORS } from './forecastSigma.js';

export const PARAMS = JSON.parse(readFileSync(new URL('./ladderV2Params.json', import.meta.url), 'utf8'));
const SQRT252 = Math.sqrt(252);
const QS = ['hl', 'oc', 'oh', 'ol'];
const TAUS = ['50', '75', '90'];
const LABEL = { hl: ['High to Low range', '75th Percentile'], oc: ['Open to Close move', '75th Percentile'],
                oh: ['Open High (upside)', '75th'], ol: ['Open Low  (downside)', '75th'] };

const _nyFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
/** NY-close day key (YYYY-MM-DD): the date of (New York wall-clock time + 7h), as ladder.ny_bars. */
export function nyKey(sec) {
  const p = Object.fromEntries(_nyFmt.formatToParts(new Date(sec * 1000)).map(x => [x.type, x.value]));
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) + 7 * 3600e3;
  return new Date(wall).toISOString().slice(0, 10);
}
const weekday = key => { const d = new Date(key + 'T12:00:00Z').getUTCDay(); return d >= 1 && d <= 5; };

/** London session the export is for: today, or the next weekday after 22:00 London. */
export function sessionDate(ms = Date.now()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
  if (+p.hour >= 22) d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** NQ: har_rv_log forecast for the session from NY-close daily bars [{key, open, high, low, close}] (daily %). */
export function nqSigma(d1, session) {
  const bars = d1.filter(b => b.key >= PARAMS.instruments.NQ.har_start && b.key < session && weekday(b.key));
  if (bars.length < 300) return null;
  const last = bars[bars.length - 1];
  // the estimator stores the forecast for bar i+1 at slot i: append a placeholder bar for the session
  const x = [...bars, { open: last.close, high: last.close, low: last.close, close: last.close }];
  const s = harRvLogSigma(x)[bars.length - 1];
  return Number.isFinite(s) ? { sigma: s / SQRT252, asof: last.key } : null;
}

/** GOLD / EURUSD: HAR-CJ forecast for the session from 5-minute mid closes [[sec, close], ...] (daily %). */
export function harcjSigma(sym, m5, session) {
  const P = PARAMS.instruments[sym];
  const days = new Map();
  let prevKey = null, prevC = null;
  for (const [t, c] of m5) {
    const k = nyKey(t);
    if (k !== prevKey) { prevKey = k; prevC = c; if (!days.has(k)) days.set(k, { rv: 0, bv: 0, lastAbs: null }); continue; }
    const r = Math.log(c / prevC); prevC = c;
    const d = days.get(k);
    d.rv += r * r;
    if (d.lastAbs !== null) d.bv += (Math.PI / 2) * Math.abs(r) * d.lastAbs;
    d.lastAbs = Math.abs(r);
  }
  const keys = [...days.keys()].filter(k => weekday(k) && days.get(k).rv > 0).sort();
  const C = [], J = [];
  for (const k of keys) {
    const { rv, bv } = days.get(k);
    const c = bv > 0 ? Math.min(rv, bv) : rv;
    C.push(c); J.push(Math.max(rv - c, 0));
  }
  const mean = (a, i, n) => { let s = 0; for (let j = i - n + 1; j <= i; j++) s += a[j]; return s / n; };
  let idx = -1;
  for (let i = 0; i < keys.length; i++) if (keys[i] < session) idx = i;
  if (idx < 21) return null;
  const x = [1, Math.log(C[idx]), Math.log(mean(C, idx, 5)), Math.log(mean(C, idx, 22)), Math.log1p(J[idx] / C[idx])];
  const z = x.reduce((s, v, i) => s + v * P.coef[i], 0);
  return { sigma: Math.sqrt(Math.exp(z + P.s2 / 2)) * 100, asof: keys[idx] };
}

/** Rungs (% of the London-midnight open) for one instrument and track. */
export function ladderFor(sym, track, sigma) {
  const w = PARAMS.instruments[sym][track].widths;
  return Object.fromEntries(QS.map(q => [q, Object.fromEntries(TAUS.map(t => [t, w[q][t] * sigma]))]));
}

const div = name => { const pre = `──── ${name} `; return pre + '─'.repeat(Math.max(0, 30 - pre.length)); };
const sessLabel = s => new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(/,/g, '');

function forecastBlock(name, sigma, L) {
  const out = [div(name), `Volatility (annualized) : ${(sigma * SQRT252).toFixed(2)}%`];
  for (const q of QS) {
    const [lab, w75] = LABEL[q];
    out.push(`${lab.padEnd(24)}: ${L[q]['50'].toFixed(2)}% median · ${L[q]['75'].toFixed(2)}% ${w75} · ${L[q]['90'].toFixed(2)}% 90th`);
  }
  return out;
}

function exhaustionBlock(name, sym, sigma, L) {
  const P = PARAMS.instruments[sym];
  const [z50, z75] = P.zone_sigma;
  const out = [div(name), `Sigma daily             : ${sigma.toFixed(3)}%`,
    `Zone past line          : ${(z50 * sigma).toFixed(3)}% median · ${(z75 * sigma).toFixed(3)}% 75th  (${z50.toFixed(2)}σ · ${z75.toFixed(2)}σ${P.zone_note ? ', pooled' : ''})`,
    `Time buckets (London)   : ${PARAMS.buckets_london.join(' · ')}`];
  for (const [side, q] of [['OH', 'oh'], ['OL', 'ol']]) {
    for (const t of TAUS) {
      const word = t === '90' ? '+0.25σ' : 'next';
      const od = P.odds[t].map(v => `${Math.round(v)}%`).join(' · ');
      out.push(`${`${side} p${t}`.padEnd(24)}: ${L[q][t].toFixed(2)}% | ${word} ${od}`);
    }
  }
  return out;
}

/**
 * Build the paste text. sigmas = { NQ: {sigma, asof}, GOLD: {...}, EURUSD: {...} } (daily %).
 * kind: 'forecast' | 'exhaustion'; track: 'cfd' | 'fut'.
 */
export function buildText(kind, track, sigmas, session) {
  const order = ['GOLD', 'EURUSD', 'NQ', ...instrumentsFor(track).filter(s => !['GOLD', 'EURUSD', 'NQ'].includes(s) && s in sigmas)];
  const head = kind === 'forecast'
    ? ['**VOL & RANGE FORECAST — SHADOW ladder-v2 (not live)**',
       `**${track === 'fut' ? 'Futures charts · ' : ''}For session: ${sessLabel(session)} (London 00:00–22:00)**`,
       'Event bucket: not applied (shadow σ, no event multiplier)', '']
    : ['**EXHAUSTION ZONES — SHADOW ladder-v2 (not live)**',
       `**${track === 'fut' ? 'Futures charts · ' : ''}For session: ${sessLabel(session)} (London 00:00–22:00)**`,
       'Zone = how far price typically runs past a line before its first 0.25σ pullback (any level, not a line effect).',
       'Odds = chance a line touched in that time bucket goes on to the next line (p90: a further 0.25σ).', ''];
  const lines = [...head];
  for (const sym of order) {
    const s = sigmas[sym];
    if (!s || !Number.isFinite(s.sigma)) { lines.push(div(sym), 'unavailable (no recent bars)', ''); continue; }
    const L = ladderFor(sym, track, s.sigma);
    lines.push(...(kind === 'forecast' ? forecastBlock(sym, s.sigma, L) : exhaustionBlock(sym, sym, s.sigma, L)), '');
  }
  return lines.join('\n');
}

// ── per-day series (forecast-reversion page: v2 lines for any date) ────────────────────────────────
/** NQ: Map NY-close key -> sigma (daily %) forecast for the NEXT weekday session after that bar. */
export function nqSigmaSeries(d1) {
  const bars = d1.filter(b => b.key >= PARAMS.instruments.NQ.har_start && weekday(b.key));
  if (bars.length < 300) return new Map();
  const last = bars[bars.length - 1];
  const s = harRvLogSigma([...bars, { open: last.close, high: last.close, low: last.close, close: last.close }]);
  const out = new Map();
  for (let i = 0; i < bars.length; i++) if (Number.isFinite(s[i])) out.set(bars[i].key, s[i] / SQRT252);
  return out;
}

/** GOLD / EURUSD: Map NY-close key -> HAR-CJ sigma (daily %) forecast for the next session, from 5-min closes. */
export function harcjSigmaSeries(sym, m5) {
  const P = PARAMS.instruments[sym];
  const days = new Map();
  let prevKey = null, prevC = null;
  for (const [t, c] of m5) {
    const k = nyKey(t);
    if (k !== prevKey) { prevKey = k; prevC = c; if (!days.has(k)) days.set(k, { rv: 0, bv: 0, lastAbs: null }); continue; }
    const r = Math.log(c / prevC); prevC = c;
    const d = days.get(k);
    d.rv += r * r;
    if (d.lastAbs !== null) d.bv += (Math.PI / 2) * Math.abs(r) * d.lastAbs;
    d.lastAbs = Math.abs(r);
  }
  const keys = [...days.keys()].filter(k => weekday(k) && days.get(k).rv > 0).sort();
  const C = [], J = [];
  for (const k of keys) {
    const { rv, bv } = days.get(k);
    const c = bv > 0 ? Math.min(rv, bv) : rv;
    C.push(c); J.push(Math.max(rv - c, 0));
  }
  const out = new Map();
  let s5 = 0, s22 = 0;
  for (let i = 0; i < keys.length; i++) {
    s5 += C[i]; s22 += C[i];
    if (i >= 5) s5 -= C[i - 5];
    if (i >= 22) s22 -= C[i - 22];
    if (i < 21) continue;
    const x = [1, Math.log(C[i]), Math.log(s5 / 5), Math.log(s22 / 22), Math.log1p(J[i] / C[i])];
    const z = x.reduce((s, v, j) => s + v * P.coef[j], 0);
    out.set(keys[i], Math.sqrt(Math.exp(z + P.s2 / 2)) * 100);
  }
  return out;
}

// ── rollout instruments (ladder-v2-rollout; params from scripts/ladder-v2/build_params_rollout.py) ─────────
// P.sigma is one of:
//   { type: 'est', est }                       forge estimator on NY-close daily bars (yz_10, ewma_094, har_rv_log, ...)
//   { type: 'garch', model, params }           GARCH / GARCH-t / GJR / EGARCH on daily % log returns, params fitted
//                                              before 2026 (arch conventions: 0.94-weighted 75-bar backcast)
//   { type: 'reg', arm, coef, s2 }             HAR regression on intraday RV: R5 / SHAR / HAR-CJ from 5-minute closes,
//                                              R15 from 15-minute closes
//   { type: 'blend', parts: [a, b] }           50/50 of two of the above (HAR + GARCH-t)
// Every series maps an NY-close bar key -> sigma (daily %) forecast for the next weekday session.
const d1For = (P, d1) => d1.filter(b => b.key >= P.d1_start && weekday(b.key));

function estSeries(est, bars) {
  const out = new Map();
  if (bars.length < 60) return out;
  let arr;
  if (est === 'har_rv_log') {
    const last = bars[bars.length - 1];
    arr = harRvLogSigma([...bars, { open: last.close, high: last.close, low: last.close, close: last.close }]);
  } else {
    arr = SIGMA_ESTIMATORS[est](bars);
  }
  for (let i = 0; i < bars.length; i++) if (Number.isFinite(arr[i]) && arr[i] > 0) out.set(bars[i].key, arr[i] / SQRT252);
  return out;
}

function garchSeries(model, p, bars) {
  const out = new Map();
  if (bars.length < 100) return out;
  const keys = [], e = [];
  for (let i = 1; i < bars.length; i++) { keys.push(bars[i].key); e.push(100 * Math.log(bars[i].close / bars[i - 1].close) - p.mu); }
  const tau = Math.min(75, e.length);
  let bc = 0, ws = 0;
  for (let j = 0; j < tau; j++) { const w = 0.94 ** j; bc += w * e[j] * e[j]; ws += w; }
  bc /= ws;
  const om = p.omega, al = p['alpha[1]'], be = p['beta[1]'], ga = p['gamma[1]'] ?? 0;
  if (model === 'G_egarch') {
    const k = Math.sqrt(2 / Math.PI);
    let ln = om + be * Math.log(bc);                                     // t = 0 (arch: no lagged shock yet)
    for (let t = 0; t < e.length; t++) {
      const z = e[t] / Math.sqrt(Math.exp(ln));
      const next = om + al * (Math.abs(z) - k) + ga * z + be * ln;      // forecast for t+1 made at t
      out.set(keys[t], Math.sqrt(Math.exp(next)));
      ln = next;
    }
    return out;
  }
  let v = om + al * bc + ga * 0.5 * bc + be * bc;                        // t = 0 (arch: backcast for the lags)
  for (let t = 0; t < e.length; t++) {
    const next = om + al * e[t] * e[t] + (e[t] < 0 ? ga * e[t] * e[t] : 0) + be * v;
    out.set(keys[t], Math.sqrt(next));
    v = next;
  }
  return out;
}

/** Per NY-close day from intraday closes [[sec, close], ...]: rv, semivariances, bipower variation (weekdays, rv > 0). */
function dayRv(closes) {
  const days = new Map();
  let prevKey = null, prevC = null;
  for (const [t, c] of closes) {
    const k = nyKey(t);
    if (k !== prevKey) { prevKey = k; prevC = c; if (!days.has(k)) days.set(k, { rv: 0, rsp: 0, rsn: 0, bv: 0, lastAbs: null }); continue; }
    const r = Math.log(c / prevC); prevC = c;
    const d = days.get(k);
    d.rv += r * r;
    if (r > 0) d.rsp += r * r; else d.rsn += r * r;
    if (d.lastAbs !== null) d.bv += (Math.PI / 2) * Math.abs(r) * d.lastAbs;
    d.lastAbs = Math.abs(r);
  }
  const keys = [...days.keys()].filter(k => weekday(k) && days.get(k).rv > 0).sort();
  return { keys, d: keys.map(k => days.get(k)) };
}

function regSeries(spec, inp) {
  const out = new Map();
  const src = spec.arm === 'R15' ? inp.m15 : inp.m5;
  if (!src || !src.length) return out;
  const { keys, d } = dayRv(src);
  const rv = d.map(x => x.rv);
  const base = spec.arm === 'HARCJ' ? d.map(x => (x.bv > 0 ? Math.min(x.rv, x.bv) : x.rv)) : rv;
  let s5 = 0, s22 = 0;
  for (let i = 0; i < keys.length; i++) {
    s5 += base[i]; s22 += base[i];
    if (i >= 5) s5 -= base[i - 5];
    if (i >= 22) s22 -= base[i - 22];
    if (i < 21) continue;
    let x;
    if (spec.arm === 'HARCJ') {
      const J = Math.max(rv[i] - base[i], 0);
      x = [1, Math.log(base[i]), Math.log(s5 / 5), Math.log(s22 / 22), Math.log1p(J / base[i])];
    } else if (spec.arm === 'SHAR') {
      const fl = 0.01 * rv[i];
      x = [1, Math.log(Math.max(d[i].rsp, fl)), Math.log(Math.max(d[i].rsn, fl)), Math.log(s5 / 5), Math.log(s22 / 22)];
    } else {
      x = [1, Math.log(rv[i]), Math.log(s5 / 5), Math.log(s22 / 22)];
    }
    const z = x.reduce((s, v, j) => s + v * spec.coef[j], 0);
    out.set(keys[i], Math.sqrt(Math.exp(z + spec.s2 / 2)) * 100);
  }
  return out;
}

export function specSeries(spec, P, inp) {
  if (spec.type === 'est') return estSeries(spec.est, d1For(P, inp.d1 || []));
  if (spec.type === 'garch') return garchSeries(spec.model, spec.params, d1For(P, inp.d1 || []));
  if (spec.type === 'reg') return regSeries(spec, inp);
  if (spec.type === 'blend') {
    const [a, b] = spec.parts.map(s => specSeries(s, P, inp));
    const out = new Map();
    for (const [k, v] of a) if (b.has(k)) out.set(k, 0.5 * (v + b.get(k)));
    return out;
  }
  throw new Error(`unknown sigma spec ${spec.type}`);
}

/** Rollout instrument: Map NY-close key -> sigma (daily %) for the next session. inp = { d1, m5?, m15? }. */
export function rolloutSigmaSeries(sym, inp) {
  return specSeries(PARAMS.instruments[sym].sigma, PARAMS.instruments[sym], inp);
}

/** The instruments (pilots first) that have a ladder on this track: 'cfd' | 'fut'. */
export function instrumentsFor(track) {
  return Object.keys(PARAMS.instruments).filter(s => PARAMS.instruments[s][track]);
}

/** sigma for a London session date from a key -> sigma Map: the last key strictly before the session. */
export function sigmaForSession(series, session) {
  let best = null, bestKey = '';
  for (const [k, v] of series) if (k < session && k > bestKey) { bestKey = k; best = v; }
  return best == null ? null : { sigma: best, asof: bestKey };
}

/** The page's per-day level object: rungs (% of open) named like the fitted ladder, plus zones and odds. */
export function dayLevels(sym, track, sigma) {
  const L = ladderFor(sym, track, sigma);
  const P = PARAMS.instruments[sym];
  const o = { sigma };
  for (const q of QS) for (const t of TAUS) o[`${q}_p${t}`] = L[q][t];
  o.zone50_pct = P.zone_sigma[0] * sigma;
  o.zone75_pct = P.zone_sigma[1] * sigma;
  o.odds = P.odds;                     // { '50': [4 buckets], '75': [...], '90': [...] }, % ; buckets 00-07/07-12/12-16/16-22 London
  return o;
}
