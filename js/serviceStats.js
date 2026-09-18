// js/serviceStats.js — the pure half of "where did the day actually go".
//
// `/api/services` times every background job, but those counters lived only in
// the process, and Railway redeploys on every push to `main`. On a repo with
// several pushes a day the meter was reset before it ever measured a day — the
// first real read after shipping it showed `uptimeSec: 17`. Persisting the
// numbers is what makes the measurement usable, and this module is the part
// that decides what gets kept: day buckets, merged across restarts, trimmed to
// a window. The I/O (R2 read/write, the flush timer, the SIGTERM hook) stays in
// server.js — this stays pure so it can be tested on synthetic data.
//
// STORE SHAPE (what lands in R2)
//   {
//     version: 1,
//     updatedAt: '2026-09-16T19:45:00.000Z',
//     days: {                             // UTC date → per-service totals
//       '2026-09-16': { hmm5m: { runs: 2812, errors: 3, totalMs: 486210 }, … },
//     },
//   }
//
// DELTAS, NOT TOTALS. A flush hands `mergeDeltas` only what has accrued since
// the previous flush, so a mid-day flush adds rather than overwrites and a
// restart (counters back to zero) simply contributes its own run. That is the
// one invariant worth holding onto: the same work must never be counted twice,
// and a process that dies between flushes loses at most that interval.
//
// A job that starts before midnight and ends after it is attributed to the day
// the flush sees, not the day it began. At a 15-minute flush cadence the error
// is bounded by one interval's work on one boundary per day — not worth a
// per-run timestamp to fix.

export const STORE_VERSION = 1;
export const DEFAULT_KEEP_DAYS = 14;

/** UTC `yyyy-mm-dd`. The bucket key — UTC so a restart in another zone agrees. */
export function dayKey(when = new Date()) {
  return new Date(when).toISOString().slice(0, 10);
}

export function emptyStore() {
  return { version: STORE_VERSION, updatedAt: null, days: {} };
}

/**
 * Coerce whatever came back from R2 into a store we can safely add to.
 * Anything unrecognised (old version, truncated write, `null`) becomes an empty
 * store rather than throwing — losing history is a nuisance, refusing to boot
 * because of it is worse.
 */
export function normalizeStore(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== STORE_VERSION || !raw.days || typeof raw.days !== 'object') {
    return emptyStore();
  }
  const days = {};
  for (const [day, services] of Object.entries(raw.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !services || typeof services !== 'object') continue;
    const clean = {};
    for (const [id, v] of Object.entries(services)) {
      if (!v || typeof v !== 'object') continue;
      clean[id] = {
        runs:    Number.isFinite(v.runs)    ? v.runs    : 0,
        errors:  Number.isFinite(v.errors)  ? v.errors  : 0,
        totalMs: Number.isFinite(v.totalMs) ? v.totalMs : 0,
      };
    }
    days[day] = clean;
  }
  return { version: STORE_VERSION, updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null, days };
}

/**
 * Add one flush's worth of deltas into the store, in place.
 *
 * @param {object} store   from `emptyStore`/`normalizeStore`
 * @param {object} deltas  { serviceId: { runs, errors, totalMs } } — since the last flush
 * @param {object} [opts]  { day, now, keepDays }
 * @returns {object} the same store, mutated
 */
export function mergeDeltas(store, deltas, { day = dayKey(), now = new Date(), keepDays = DEFAULT_KEEP_DAYS } = {}) {
  const bucket = store.days[day] ?? (store.days[day] = {});
  for (const [id, d] of Object.entries(deltas ?? {})) {
    if (!d) continue;
    const runs    = Number.isFinite(d.runs)    ? d.runs    : 0;
    const errors  = Number.isFinite(d.errors)  ? d.errors  : 0;
    const totalMs = Number.isFinite(d.totalMs) ? d.totalMs : 0;
    if (!runs && !errors && !totalMs) continue;          // idle service adds no row
    const cur = bucket[id] ?? (bucket[id] = { runs: 0, errors: 0, totalMs: 0 });
    cur.runs    += runs;
    cur.errors  += errors;
    cur.totalMs += totalMs;
  }
  store.updatedAt = new Date(now).toISOString();
  trimDays(store, keepDays);
  return store;
}

/** Keep only the most recent `keepDays` buckets (lexicographic == chronological for ISO dates). */
export function trimDays(store, keepDays = DEFAULT_KEEP_DAYS) {
  const days = Object.keys(store.days).sort();
  for (const day of days.slice(0, Math.max(0, days.length - keepDays))) delete store.days[day];
  return store;
}

/**
 * Per-service totals across the last `days` buckets (today included).
 * @returns {{ from: string|null, to: string|null, days: number, services: Record<string, {runs,errors,totalMs}> }}
 */
export function rollup(store, { days = 1, until = dayKey() } = {}) {
  const keys = Object.keys(store.days).filter(d => d <= until).sort().slice(-Math.max(1, days));
  const services = {};
  for (const key of keys) {
    for (const [id, v] of Object.entries(store.days[key])) {
      const cur = services[id] ?? (services[id] = { runs: 0, errors: 0, totalMs: 0 });
      cur.runs    += v.runs;
      cur.errors  += v.errors;
      cur.totalMs += v.totalMs;
    }
  }
  return { from: keys[0] ?? null, to: keys[keys.length - 1] ?? null, days: keys.length, services };
}

/**
 * The deltas to flush: current cumulative counters minus what was already
 * flushed. Returns `[deltas, nextFlushed]` — the caller only adopts
 * `nextFlushed` once the write succeeded, so a failed flush is retried whole on
 * the next tick instead of being silently dropped.
 *
 * @param {Map<string, {runs,errors,totalMs}>} live      the in-process counters
 * @param {Record<string, {runs,errors,totalMs}>} flushed what a previous flush already persisted
 */
export function pendingDeltas(live, flushed = {}) {
  const deltas = {};
  const next = {};
  for (const [id, st] of live instanceof Map ? live.entries() : Object.entries(live)) {
    const cum  = { runs: st.runs ?? 0, errors: st.errors ?? 0, totalMs: st.totalMs ?? 0 };
    const prev = flushed[id] ?? { runs: 0, errors: 0, totalMs: 0 };
    // A counter that went BACKWARDS means the process restarted since the last
    // flush (fresh zeros) — take the current value whole rather than a negative.
    const back = cum.runs < prev.runs || cum.totalMs < prev.totalMs;
    const d = back ? cum : { runs: cum.runs - prev.runs, errors: cum.errors - prev.errors, totalMs: cum.totalMs - prev.totalMs };
    if (d.runs || d.errors || d.totalMs) deltas[id] = d;
    next[id] = cum;
  }
  return [deltas, next];
}
