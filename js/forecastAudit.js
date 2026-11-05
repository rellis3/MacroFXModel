/**
 * Forecast Auditor — checks the forecast lines against what the market did, over the forward record and over history.
 *
 * Monitoring and description only. It never changes a forecast, a ladder or any desk score, and it never banks a
 * verdict: a drift alarm is a prompt to look, and a history re-test is an exploratory backtest, not a pre-registered
 * test (research-protocol skill).
 *
 * Rows come from the forward scorecard (js/forecastScorecard.js, KV forecast_scorecard_v1): each finished London
 * session, per instrument, per line set, the exceedance flags of every rung (H-L, O-H, O-L at p50/p75/p90) and the
 * H-L p50+p75 pinball. The history mode builds rows of the same shape (js/forecastAuditHistory.js), so both are read by
 * the same code here.
 *
 *   row (daily)  { date, inst, regime, event, s: { plain, persist, ivadj, har800 } }   s[set] = scoreLadder() output
 *   row (weekly) { date: Monday, inst, s: { sqrt, rev } }
 *
 * Targets: p50 passed 50% of days, p75 25%, p90 10%.
 *
 * Bands. A rung's exceedance rate is judged against a binomial 95% band around its target. Pooled across instruments
 * the rows of one date are not independent: cross-instrument σ errors correlate ≈ 0.47 (plans/SEARCH_BREADTH.md,
 * research-protocol stats-defaults), so n rows over S dates carry n / DE independent observations, with the cluster
 * design effect DE = 1 + (m − 1)·ρ, m = n / S rows per date. Serial correlation within an instrument (misses cluster in
 * busy spells) is NOT in the band, so the band is if anything too narrow: treat a single alarm as a prompt, not a verdict.
 *
 * Pure: no network, no clock (asOf and seeds are passed in).
 */
import { SIGMA_ESTIMATORS } from './forecastSigma.js';
import { mulberry32 } from './statsCore.js';

export const RUNGS = ['p50', 'p75', 'p90'];
export const TARGET = [0.5, 0.25, 0.1];
export const QS = ['hl', 'oh', 'ol'];
export const QLABEL = { hl: 'H-L', oh: 'O-H', ol: 'O-L' };
export const DESIGN_RHO = 0.47;
export const LOCKBOX_END = '2026-08-21';           // forge/LOCKBOX_PROTOCOL.md: layer 3 (HAR-800) is never scored after this
export const AUDIT_SEED = 20261105;

/** The line sets. `base` = what its pinball is compared with. */
export const LINE_SETS = {
  plain:   { label: 'Plain', horizon: 'daily', base: null },
  persist: { label: 'Chosen ★ (persistence + IV)', horizon: 'daily', base: 'plain' },
  ivadj:   { label: 'IV-adjusted', horizon: 'daily', base: 'plain' },
  har800:  { label: 'HAR-800', horizon: 'daily', base: 'plain', lockbox: true },
  sqrt:    { label: 'Weekly √h', horizon: 'weekly', base: null },
  rev:     { label: 'Weekly reverting', horizon: 'weekly', base: 'sqrt' },
};
export const DAILY_SETS = ['plain', 'persist', 'ivadj', 'har800'];
export const WEEKLY_SETS = ['sqrt', 'rev'];
/** Rolling windows: sessions for daily lines, weeks for weekly lines (4 / 12 / 24 weeks ≈ 20 / 60 / 120 sessions). */
export const WINDOWS = { daily: { r20: 20, r60: 60, r120: 120 }, weekly: { r20: 4, r60: 12, r120: 24 } };

/**
 * The drift rule. A line set drifts when, over its last 60 sessions (12 weeks for the weekly lines):
 *   1. a rung's pooled exceedance is outside its binomial 95% band (design effect above), or
 *   2. its pinball ÷ its base's pinball is above PIN_RATIO_MAX AND the date-block bootstrap 95% interval of that ratio
 *      lies wholly above 1.
 * PIN_RATIO_MAX = 1.02 is the scorecard's own "doing worse" line (forecastScorecard.verdicts), so the alarm and the
 * Track record card cannot disagree about what "worse" means. The interval condition stops a 60-session wobble from
 * firing it: the chosen forecast won its pick by 3.6% over six years (0.964 of plain), so a real reversal of that edge
 * is a move of ≥ 5-6% in the ratio, which 60 sessions can resolve; a 2% wobble they cannot.
 * MIN = the scorecard's VERDICT_MIN (15 sessions / 6 weeks): no alarm on less.
 */
export const DRIFT = { window: { daily: 60, weekly: 12 }, min: { daily: 15, weekly: 6 }, pinRatioMax: 1.02, alpha: 0.05 };

const r4 = x => (Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : null);

// ── binomial band ─────────────────────────────────────────────────────────────────────────────────────────────────
function lgamma(x) {                                          // Lanczos, |error| < 1e-13 for x > 0
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
/** P(X ≤ k), X ~ Binomial(n, p). */
export function binomCdf(k, n, p) {
  if (k < 0) return 0;
  if (k >= n) return 1;
  let s = 0;
  const lp = Math.log(p), lq = Math.log(1 - p), ln = lgamma(n + 1);
  for (let i = 0; i <= k; i++) s += Math.exp(ln - lgamma(i + 1) - lgamma(n - i + 1) + i * lp + (n - i) * lq);
  return Math.min(1, s);
}
/**
 * Exact binomial (1 − alpha) acceptance band for the RATE of a p-event over nEff independent trials (nEff rounded down,
 * at least 1): [k_lo / n, k_hi / n] with P(X < k_lo) ≤ alpha/2 and P(X > k_hi) ≤ alpha/2.
 */
export function binomBand(p, nEff, alpha = DRIFT.alpha) {
  const n = Math.max(1, Math.floor(nEff));
  const lp = Math.log(p), lq = Math.log(1 - p), ln = lgamma(n + 1);
  let cdf = 0, lo = null, hi = n;                             // one pass: lo = smallest k with P(X ≤ k) ≥ α/2,
  for (let k = 0; k <= n; k++) {                              //           hi = smallest k with P(X ≤ k) ≥ 1 − α/2
    cdf += Math.exp(ln - lgamma(k + 1) - lgamma(n - k + 1) + k * lp + (n - k) * lq);
    if (lo == null && cdf >= alpha / 2) lo = k;
    if (cdf >= 1 - alpha / 2) { hi = k; break; }
  }
  return { lo: r4((lo ?? 0) / n), hi: r4(hi / n), n };
}
/** Cluster design effect: m rows per date, intra-date correlation rho. */
export const designEffect = (m, rho = DESIGN_RHO) => 1 + Math.max(0, m - 1) * rho;

// ── regime (σ against its own usual level) ────────────────────────────────────────────────────────────────────────
/**
 * The regime of the session that follows `bars` (NY-close daily bars that all closed before it), by the measure the
 * forecast work uses (forge/FORECAST_RECORD_PREREG.md, js/forecastLadderPersist.js `regime`): today's σ ÷ the median σ
 * over the previous 250 bars, same estimator, causal. calm < 0.85 ≤ normal ≤ 1.15 < stressed.
 */
export const REGIME_CUT = { calm: 0.85, stressed: 1.15 };
export function regimeOf(bars, estimator = 'yz_30', window = 250) {
  const fn = SIGMA_ESTIMATORS[estimator] ?? SIGMA_ESTIMATORS.yz_30;
  if (!Array.isArray(bars) || bars.length < 140 || estimator === 'har_rv_log') return null;
  const s = fn(bars), n = s.length, today = s[n - 1];
  if (!(today > 0)) return null;
  const prior = [];
  for (let k = Math.max(0, n - 1 - window); k < n - 1; k++) if (s[k] > 0) prior.push(s[k]);
  if (prior.length < 120) return null;
  prior.sort((a, b) => a - b);
  const m = prior.length, med = m % 2 ? prior[(m - 1) / 2] : (prior[m / 2 - 1] + prior[m / 2]) / 2;
  const ratio = today / med;
  return { ratio: r4(ratio), regime: ratio < REGIME_CUT.calm ? 'calm' : ratio > REGIME_CUT.stressed ? 'stressed' : 'normal' };
}
/** The event groups the split reports (the ladder's own event buckets, grouped). */
export function eventGroup(tag) {
  if (tag == null) return 'unknown';
  if (tag === 'none') return 'quiet';
  if (tag === 'holiday') return 'holiday';
  return 'event';                                             // FOMC / NFP / CPI / high
}

// ── rows ──────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Flatten the forward scorecard store (+ the auditor's per-day tags) into rows. */
export function rowsFromStore(store, tags = {}) {
  const daily = [], weekly = [];
  for (const date of Object.keys(store?.days ?? {}).sort()) {
    for (const [inst, row] of Object.entries(store.days[date] ?? {})) {
      const s = {};
      for (const k of ['plain', 'persist', 'ivadj']) if (row?.[k]) s[k] = row[k];
      if (!Object.keys(s).length) continue;
      const t = tags?.[date]?.[inst] ?? {};
      daily.push({ date, inst, regime: t.regime ?? null, event: t.event === undefined ? undefined : t.event, s });
    }
  }
  for (const date of Object.keys(store?.weeks ?? {}).sort()) {
    for (const [inst, row] of Object.entries(store.weeks[date] ?? {})) {
      const s = {};
      for (const k of ['sqrt', 'rev']) if (row?.[k]) s[k] = row[k];
      if (Object.keys(s).length) weekly.push({ date, inst, s });
    }
  }
  return { daily, weekly };
}
/** Rows of the last `n` distinct dates (all rows when n is not finite). */
export function lastSessions(rows, n) {
  if (!Number.isFinite(n)) return rows;
  const dates = [...new Set(rows.map(r => r.date))].sort().slice(-n);
  const keep = new Set(dates);
  return rows.filter(r => keep.has(r.date));
}

// ── per-date aggregates (the unit every count and every bootstrap works on) ───────────────────────────────────────
const EMPTY = () => ({ n: 0, ex: new Array(9).fill(0), exN: new Array(9).fill(0), pin: 0, pinN: 0, pa: 0, pb: 0, pn: 0 });
function addScore(A, s, b) {
  A.n += 1;
  QS.forEach((q, qi) => s[q]?.forEach((v, i) => { if (v != null) { A.ex[qi * 3 + i] += v; A.exN[qi * 3 + i] += 1; } }));
  if (s.pin != null) { A.pin += s.pin; A.pinN += 1; }
  if (b && s.pin != null && b.pin != null) { A.pa += s.pin; A.pb += b.pin; A.pn += 1; }
}
function addInto(T, A) {
  T.n += A.n; T.pin += A.pin; T.pinN += A.pinN; T.pa += A.pa; T.pb += A.pb; T.pn += A.pn;
  for (let i = 0; i < 9; i++) { T.ex[i] += A.ex[i]; T.exN[i] += A.exN[i]; }
}
/** Per-date aggregates of one line set over `rows` (optionally filtered). Sorted by date. */
export function byDate(rows, set, base = LINE_SETS[set]?.base, filter = null) {
  const m = new Map();
  for (const r of rows) {
    const s = r.s?.[set];
    if (!s || (filter && !filter(r))) continue;
    if (!m.has(r.date)) m.set(r.date, EMPTY());
    addScore(m.get(r.date), s, base ? r.s?.[base] : null);
  }
  return [...m.keys()].sort().map(d => ({ date: d, ...m.get(d) }));
}

/** One calibration cell from per-date aggregates: rates, bands, in/out flags, pinball and the ratio to the base. */
export function cellOf(days, { rho = DESIGN_RHO, alpha = DRIFT.alpha } = {}) {
  const T = EMPTY();
  for (const d of days) addInto(T, d);
  if (!T.n) return null;
  const sessions = days.length;
  const out = { n: T.n, sessions, de: r4(designEffect(T.n / sessions, rho)) };
  QS.forEach((q, qi) => {
    out[q] = TARGET.map((tgt, i) => {
      const k = T.ex[qi * 3 + i], n = T.exN[qi * 3 + i];
      if (!n) return null;
      const nEff = n / designEffect(n / sessions, rho);
      const band = binomBand(tgt, nEff, alpha), rate = k / n;
      return { rate: r4(rate), lo: band.lo, hi: band.hi, nEff: band.n, out: rate < band.lo ? -1 : rate > band.hi ? 1 : 0 };
    });
  });
  out.pinball = T.pinN ? r4(T.pin / T.pinN) : null;
  out.ratio = T.pn && T.pb > 0 ? r4(T.pa / T.pb) : null;
  out.pairs = T.pn;
  return out;
}

// ── date-block bootstrap ──────────────────────────────────────────────────────────────────────────────────────────
/**
 * Stationary block bootstrap over dates (all instruments on a date move together), the scheme of
 * js/harness/stats.mjs clusteredBlockBootstrap: runs of consecutive dates with geometric length of mean `meanBlock`
 * (capped at C/8), seeded. `stats(T)` maps a summed aggregate to an array of numbers; returns per-stat 95% percentile
 * intervals [lo, hi] (null where undefined).
 */
export function blockBootstrap(days, stats, { nBoot = 2000, meanBlock = 20, seed = AUDIT_SEED } = {}) {
  const C = days.length;
  if (C < 8) return null;
  const block = Math.max(1, Math.min(Math.round(meanBlock), Math.floor(C / 8)));
  const rng = mulberry32(seed >>> 0), p = 1 / block;
  const draws = [];
  for (let b = 0; b < nBoot; b++) {
    const T = EMPTY();
    let idx = (rng() * C) | 0;
    for (let k = 0; k < C; k++) {
      addInto(T, days[idx]);
      idx = rng() < p ? (rng() * C) | 0 : (idx + 1) % C;
    }
    draws.push(stats(T));
  }
  const K = draws[0]?.length ?? 0;
  return Array.from({ length: K }, (_, j) => {
    const v = draws.map(d => d[j]).filter(Number.isFinite).sort((a, b) => a - b);
    if (v.length < nBoot * 0.9) return null;
    const q = f => v[Math.min(v.length - 1, Math.max(0, Math.floor(f * v.length)))];
    return [r4(q(0.025)), r4(q(0.975))];
  });
}
/** The stats the bootstrap reports, in order: the nine rung rates (hl, oh, ol × p50/p75/p90), then the pinball ratio. */
export const bootStats = T => [...T.ex.map((k, i) => (T.exN[i] ? k / T.exN[i] : NaN)), T.pb > 0 ? T.pa / T.pb : NaN];

// ── the audit ─────────────────────────────────────────────────────────────────────────────────────────────────────
const SPLITS = {
  regime: { key: r => r.regime ?? 'unknown', groups: ['calm', 'normal', 'stressed', 'unknown'] },
  event: { key: r => eventGroup(r.event), groups: ['event', 'quiet', 'holiday', 'unknown'] },
};
/** Calibration of one set over `rows`: pooled, per instrument, and (daily) split by regime and by event. */
export function calibrate(rows, set, { splits = true } = {}) {
  const base = LINE_SETS[set]?.base;
  const pooled = cellOf(byDate(rows, set, base));
  if (!pooled) return null;
  const insts = [...new Set(rows.filter(r => r.s?.[set]).map(r => r.inst))].sort();
  const byInst = Object.fromEntries(insts.map(i => [i, cellOf(byDate(rows, set, base, r => r.inst === i))]));
  const out = { pooled, byInst };
  if (splits && LINE_SETS[set]?.horizon === 'daily') {
    for (const [name, S] of Object.entries(SPLITS)) {
      out[name] = {};
      for (const g of S.groups) {
        const c = cellOf(byDate(rows, set, base, r => S.key(r) === g));
        if (c) out[name][g] = c;
      }
    }
  }
  return out;
}
/** Rolling pooled exceedance of one quantity's rungs, one point per date (the chart). */
export function rollingSeries(rows, set, { window = 20, q = 'hl', every = 1 } = {}) {
  const days = byDate(rows, set);
  const qi = QS.indexOf(q), out = [];
  for (let j = window - 1; j < days.length; j++) {
    if ((days.length - 1 - j) % every) continue;
    const k = [0, 0, 0], n = [0, 0, 0];
    for (let t = j - window + 1; t <= j; t++) for (let i = 0; i < 3; i++) { k[i] += days[t].ex[qi * 3 + i]; n[i] += days[t].exN[qi * 3 + i]; }
    out.push({ date: days[j].date, r: k.map((x, i) => (n[i] ? r4(x / n[i]) : null)) });
  }
  return out;
}

/** Drift alarms for one set over its rows (already the full record; the rule takes the last window itself). */
export function driftAlarms(rows, set, { seed = AUDIT_SEED, nBoot = 1000 } = {}) {
  const L = LINE_SETS[set];
  if (!L || L.lockbox) return [];
  const H = L.horizon, win = DRIFT.window[H];
  const days = byDate(lastSessions(rows.filter(r => r.s?.[set]), win), set, L.base);
  if (days.length < DRIFT.min[H]) return [];
  const c = cellOf(days);
  const out = [], from = days[0].date, to = days.at(-1).date;
  const unit = H === 'daily' ? 'sessions' : 'weeks';
  for (const q of QS) c[q].forEach((x, i) => {
    if (!x || !x.out) return;
    out.push({ key: `${set}:${q}:${RUNGS[i]}`, set, kind: 'exceedance', q, rung: RUNGS[i], rate: x.rate, lo: x.lo, hi: x.hi,
      target: TARGET[i], sessions: days.length, from, to,
      text: `${L.label}: ${QLABEL[q]} ${RUNGS[i]} passed ${Math.round(x.rate * 100)}% of the time over the last ${days.length} ${unit} `
        + `(target ${Math.round(TARGET[i] * 100)}%, band ${Math.round(x.lo * 100)}-${Math.round(x.hi * 100)}%): lines running ${x.out > 0 ? 'TIGHT' : 'WIDE'}.` });
  });
  if (L.base && c.ratio != null && c.ratio > DRIFT.pinRatioMax) {
    const ci = blockBootstrap(days, T => [T.pb > 0 ? T.pa / T.pb : NaN], { nBoot, meanBlock: 20, seed })?.[0];
    if (ci && ci[0] > 1) {
      out.push({ key: `${set}:pinball`, set, kind: 'pinball', ratio: c.ratio, ci, sessions: days.length, from, to,
        text: `${L.label}: pinball ${Math.round((c.ratio - 1) * 100)}% worse than ${LINE_SETS[L.base].label} over the last ${days.length} ${unit} `
          + `(95% interval ${ci[0].toFixed(3)}-${ci[1].toFixed(3)}, all above 1).` });
    }
  }
  return out;
}

/**
 * The full forward audit from the scorecard store and the auditor's tags.
 * HAR-800 is never scored on the forward record: every forward session is after the lockbox date, so it appears as
 * "not scored (lockbox)" with a session count only (forge/LOCKBOX_PROTOCOL.md).
 */
export function buildAudit({ store, tags = {}, asOf = null, seed = AUDIT_SEED, harSessions = 0 } = {}) {
  const { daily, weekly } = rowsFromStore(store, tags);
  const sets = {};
  for (const set of [...DAILY_SETS, ...WEEKLY_SETS]) {
    const L = LINE_SETS[set];
    if (L.lockbox) {
      sets[set] = { label: L.label, horizon: L.horizon, lockbox: true, sessions: harSessions,
        note: `Not scored (lockbox): every forward session is after ${LOCKBOX_END}. It is scored once, by python -m forge.lockbox_check --evaluate.` };
      continue;
    }
    const rows = L.horizon === 'daily' ? daily : weekly;
    if (!rows.some(r => r.s?.[set])) continue;
    const windows = {};
    for (const [k, n] of Object.entries(WINDOWS[L.horizon])) windows[k] = cellOf(byDate(lastSessions(rows.filter(r => r.s?.[set]), n), set, L.base));
    windows.all = cellOf(byDate(rows, set, L.base));
    const full = calibrate(rows, set);
    sets[set] = { label: L.label, horizon: L.horizon, base: L.base, windows, byInst: full?.byInst ?? {},
      ...(L.horizon === 'daily' ? { regime: full?.regime ?? {}, event: full?.event ?? {} } : {}),
      rolling: Object.fromEntries(QS.map(q => [q, rollingSeries(rows, set, { window: L.horizon === 'daily' ? 20 : 4, q })])) };
  }
  const alarms = Object.keys(sets).flatMap(set => driftAlarms(LINE_SETS[set].horizon === 'daily' ? daily : weekly, set, { seed }));
  const dates = [...new Set(daily.map(r => r.date))].sort();
  return { asOf, since: dates[0] ?? null, last: dates.at(-1) ?? null, sessions: dates.length,
    weeks: new Set(weekly.map(r => r.date)).size, targets: { p50: 0.5, p75: 0.25, p90: 0.1 }, rho: DESIGN_RHO,
    drift: DRIFT, sets, alarms };
}

/** Alarms in `cur` that were not active in `prev` (what is worth a message). */
export function newAlarms(prev = [], cur = []) {
  const was = new Set((prev ?? []).map(a => a.key));
  return (cur ?? []).filter(a => !was.has(a.key));
}
/** The Telegram text for new alarms (HTML parse mode). */
export function alarmMessage(alarms, date) {
  if (!alarms?.length) return null;
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return `📐 <b>Forecast auditor — drift ${esc(date ?? '')}</b>\n${alarms.map(a => `• ${esc(a.text)}`).join('\n')}`
    + '\nA prompt to look, not a verdict. No forecast is changed automatically.';
}

/** Days still missing a tag (date list), so the server only fetches what it needs. */
export function untaggedDates(store, tags = {}) {
  return Object.keys(store?.days ?? {}).sort().filter(d => Object.keys(store.days[d] ?? {}).some(i => !tags?.[d]?.[i]));
}
