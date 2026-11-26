/**
 * PRE-OPEN per-line SHADOW ladder. Not live; the live QLIKE export is unchanged.
 *   gold-calc-upgrades (banked 2026-11-26) + calc-upgrades-wide: HAR-CJ plus the realised variance of the hour before the
 *   London open (gold reopens 23:00 London), plus implied vol where a CBOE index exists (GVZ, VXN, VIX, ...).
 *
 * Because it reads the bars between the NY close and London midnight, the board for session D can only be built AFTER
 * 00:00 London on D. Params: js/ladderPreopenParams.json (scripts/calc-upgrades-wide/build_params.py);
 * parity: js/ladderPreopen.test.mjs against js/ladderPreopen.fixture.json.
 *
 * Feature definitions (must match scripts/gold-calc-upgrades/score.py `features` / `design`):
 *   per NY-close day (key = date of NY time + 7h), 5-minute bars [t, high, low, close]; returns r = ln(c_k / c_{k-1})
 *   within the day (the first bar of a day has no return)
 *   rv = sum r^2 ; bv = pi/2 sum |r_k||r_{k-1}| ; C = min(rv, bv) (rv if bv = 0) ; J = max(rv - C, 0)
 *   rq = (M / 3) sum r^4 (M = number of returns) ; rr = sum (ln H/L)^2 / (4 ln 2) over every bar
 *   sessions by the NY hour of the bar start: asia h >= 17 or h < 2, ldn 2 <= h < 8, ny otherwise
 *   fresh(D) = sum r^2 over bars of NY day D that start before London midnight of D
 *   row t (the last complete NY day before session D):
 *     c1 = ln C_t, c5 = ln mean(C over 5 rows), c22 = ln mean(C over 22 rows), j1 = ln(1 + J_t / C_t)
 *     cq = c1 (sqrt(rq_t) / rv_t - qmean) ; a1 = ln max(asia_t, 0.01 rv_t) ; l1 = ln max(ldn_t, 0.01 rv_t)
 *     fr = ln max(fresh(D), fresh_floor rv_t) (fresh_floor 0.001; the previous day's rv, never day D's own: prereg A3) ; r1 = ln rr_t ; iv = ln((IV / 100)^2 / 252), IV = the last index close dated <= t
 *   sigma (daily %) = sqrt(exp(x . coef + s2 / 2)) * 100
 */
import { readFileSync, existsSync } from 'node:fs';

const load = f => { const u = new URL(f, import.meta.url); return existsSync(u) ? JSON.parse(readFileSync(u, 'utf8')) : { fut: {}, cfd: {} }; };
export const PREOPEN = load('./ladderPreopenParams.json');
const QS = ['hl', 'oc', 'oh', 'ol', 'cup', 'cdn'];
const TAUS = ['50', '75', '90'];
const SQRT252 = Math.sqrt(252);

export const preopenInstruments = (track = 'fut') => Object.keys(PREOPEN[track] ?? {});
export const preopenParams = (sym, track = 'fut') => PREOPEN[track]?.[sym];

// One formatter each, reused (a per-bar Intl.DateTimeFormat leaked native memory on Railway, 2026-11-22).
const _ny = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const _ld = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });
function nyParts(sec) {
  const p = {};
  for (const x of _ny.formatToParts(new Date(sec * 1000))) p[x.type] = x.value;
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) + 7 * 3600e3;
  return { key: new Date(wall).toISOString().slice(0, 10), hour: +p.hour };
}
const londonDate = sec => _ld.format(new Date(sec * 1000));
const weekday = key => { const d = new Date(key + 'T12:00:00Z').getUTCDay(); return d >= 1 && d <= 5; };

/** Per NY-close day stats from 5-minute bars [[sec, high, low, close], ...] (sorted). */
export function dayStats(m5) {
  const days = new Map();
  let prevKey = null, prevC = null;
  for (const [t, h, l, c] of m5) {
    const { key, hour } = nyParts(t);
    let d = days.get(key);
    if (!d) { d = { rv: 0, bv: 0, rq: 0, M: 0, rr: 0, asia: 0, ldn: 0, ny: 0, fresh: 0, lastAbs: null }; days.set(key, d); }
    if (h > 0 && l > 0) d.rr += Math.log(h / l) ** 2 / (4 * Math.log(2));
    if (key !== prevKey) { prevKey = key; prevC = c; continue; }
    const r = Math.log(c / prevC); prevC = c;
    const r2 = r * r;
    d.rv += r2; d.rq += r2 * r2; d.M += 1;
    if (d.lastAbs !== null) d.bv += (Math.PI / 2) * Math.abs(r) * d.lastAbs;
    d.lastAbs = Math.abs(r);
    if (hour >= 17 || hour < 2) d.asia += r2; else if (hour < 8) d.ldn += r2; else d.ny += r2;
    if (londonDate(t) < key) d.fresh += r2;
  }
  for (const d of days.values()) d.rq = (d.M / 3) * d.rq;
  return days;
}

/** IV close for row t: the last [date, value] with date <= t. iv sorted ascending. */
function ivAsof(iv, t) {
  let v = null;
  for (const [d, x] of iv) { if (d <= t) v = x; else break; }
  return v;
}

/** Sigma (daily %) for London session `session` (YYYY-MM-DD); null if inputs are missing. */
export function preopenSigma(P, m5, iv, session) {
  const days = dayStats(m5);
  const keys = [...days.keys()].filter(k => k < session && weekday(k) && days.get(k).rv > 0).sort();
  if (keys.length < 22) return null;
  const today = days.get(session);
  if (!today) return null;                              // no bars yet between the NY close and London midnight
  const C = keys.map(k => { const d = days.get(k); return d.bv > 0 ? Math.min(d.rv, d.bv) : d.rv; });
  const i = keys.length - 1, t = keys[i], d = days.get(t);
  const mean = n => C.slice(i - n + 1, i + 1).reduce((s, v) => s + v, 0) / n;
  const c1 = Math.log(C[i]);
  const fl = x => Math.log(Math.max(x, 0.01 * d.rv));
  const f = {
    c1, c5: Math.log(mean(5)), c22: Math.log(mean(22)), j1: Math.log1p(Math.max(d.rv - C[i], 0) / C[i]),
    cq: c1 * (Math.sqrt(d.rq) / d.rv - P.qmean), a1: fl(d.asia), l1: fl(d.ldn), fr: Math.log(Math.max(today.fresh, (P.fresh_floor ?? 0.001) * d.rv)), r1: Math.log(d.rr),
  };
  if (P.cols.includes('iv')) {
    const v = iv ? ivAsof(iv, t) : null;
    if (!(v > 0)) return null;
    f.iv = Math.log((v / 100) ** 2 / 252);
  }
  let z = P.coef[0];
  P.cols.forEach((c, j) => { z += P.coef[j + 1] * f[c]; });
  const sigma = Math.sqrt(Math.exp(z + P.s2 / 2)) * 100;
  return Number.isFinite(sigma) && sigma > 0 ? { sigma, asof: t, fresh_bars_to: session } : null;
}

/** Same level object as qlikeDayLevels (rungs in % of the London 00:00 open), every line on the pre-open sigma. */
export function preopenDayLevels(sym, track, v) {
  const P = preopenParams(sym, track);
  if (!P || !v) return null;
  const o = { sigmas: {}, arms: {} };
  for (const q of QS) {
    o.sigmas[q] = v.sigma; o.arms[q] = P.arm === 'N7_ALL' ? 'PREOPEN+IV' : 'PREOPEN';
    for (const t of TAUS) o[`${q}_p${t}`] = P.widths[q][t] * v.sigma;
  }
  o.sigma = v.sigma;
  o.zone50_pct = P.zone_sigma[0] * v.sigma;
  o.zone75_pct = P.zone_sigma[1] * v.sigma;
  o.odds = P.odds;
  o.asof = v.asof;
  o.preopen = true;
  return o;
}

const LABEL = { hl: 'High to Low range', oc: 'Open to Close move', oh: 'Open High (upside)', ol: 'Open Low  (downside)',
  cup: 'Close+ (close above open)', cdn: 'Close- (close below open)' };
const div = name => { const pre = `──── ${name} `; return pre + '─'.repeat(Math.max(0, 30 - pre.length)); };

/** Paste text. lv = { SYM: levels } for every instrument of the QLIKE export; pre-open ones carry o.preopen. */
export function preopenText(lv, names, session, track = 'fut') {
  const sl = new Date(session + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(/,/g, '');
  const cfd = track === 'cfd';
  const out = ['**VOL & RANGE FORECAST — SHADOW PRE-OPEN ladder (not live)**',
    `**${cfd ? 'CFD (OANDA) charts' : 'Futures charts'} · For session: ${sl} (London 00:00–22:00)**`,
    'Built after 00:00 London: HAR-CJ plus the hour before the open (plus implied vol where an index exists) on validated instruments; the rest repeat the QLIKE per-line export.', ''];
  for (const sym of names) {
    const o = lv[sym];
    out.push(div(sym));
    if (!o) { out.push('unavailable (no recent bars)', ''); continue; }
    for (const q of QS) {
      if (o[`${q}_p50`] == null) continue;
      out.push(`${LABEL[q].padEnd(24)}: ${o[`${q}_p50`].toFixed(2)}% median · ${o[`${q}_p75`].toFixed(2)}% 75th · ${o[`${q}_p90`].toFixed(2)}% 90th  [${o.arms[q]}, ${(o.sigmas[q] * SQRT252).toFixed(1)}% ann.]`);
    }
    out.push('');
  }
  return out.join('\n');
}
