/**
 * js/positionBookHistory.js — keep what the OANDA position book said, over time.
 *
 * The live poll has fetched this book for years and thrown it away after computing
 * one number (and until 2026-09-11, the wrong number — see positionBookMetrics.js).
 * Nothing has ever kept a series, so "is retail more crowded than yesterday" has
 * never been answerable from this dashboard. This records the corrected aggregates
 * at poll time. It is nearly free: the request is already being made.
 *
 * TWO RESOLUTIONS, because the volume forces it. OANDA publishes on a strict
 * 20-minute grid, so 16 instruments produce ~1,150 snapshots a day — years of that
 * in one KV value is not on. So:
 *   • fine   — every snapshot, kept for FINE_DAYS (14). Enough to see a squeeze
 *              build intraday and to compare against the M15/H1 tape.
 *   • daily  — one row per UTC day beyond that: the day's LAST snapshot plus the
 *              day's mean and extremes of the crowding figure. Enough to see the
 *              slow drift a study would use.
 *
 * ROWS ARE ARRAYS, not objects, for size. Column order is fixed in COLS and must
 * never be reordered — append new columns at the end.
 *
 * WHAT THIS IS NOT. Not a signal. Retail positioning on FX tends to be the mirror
 * of momentum (retail fades moves), and momentum on FX is a banked null here, so
 * the prior on "fade the crowd" is that it collapses into something already tested.
 * The record exists so that claim can be checked with a momentum control, and so
 * the squeeze-risk angle (crowded AND underwater vs realised vol) can be studied at
 * all. Neither has been.
 */

export const BOOK_HISTORY_KV = 'oanda_book_history_v1';
export const FINE_DAYS = 14;
export const DAILY_MAX = 5 * 366;

// The 16 instruments OANDA publishes a book for (verified by sweeping all 123 —
// every CFD and exotic returns 400). Gold and silver are the only non-FX.
export const BOOK_INSTRUMENTS = [
  'AUD_JPY', 'AUD_USD', 'EUR_AUD', 'EUR_CHF', 'EUR_GBP', 'EUR_JPY', 'EUR_USD', 'GBP_CHF',
  'GBP_JPY', 'GBP_USD', 'NZD_USD', 'USD_CAD', 'USD_CHF', 'USD_JPY', 'XAG_USD', 'XAU_USD',
];

/** Fine-row columns. Fixed order; append only. */
export const COLS = ['t', 'spot', 'longPct', 'staleShare', 'longsUW', 'shortsUW', 'nearShare'];
/** Daily-row columns: last-of-day values, plus the day's crowding mean/min/max. */
export const DCOLS = ['d', 'spot', 'longPct', 'staleShare', 'longsUW', 'shortsUW', 'meanLong', 'minLong', 'maxLong', 'n'];

const DAY_MS = 864e5;
export const dayOf = ms => new Date(ms).toISOString().slice(0, 10);

/** One fine row from a summarisePositionBook() result. t is the SNAPSHOT time, not the poll time. */
export function fineRow(m) {
  if (!m || m.longPct == null) return null;
  const t = m.time ? Date.parse(m.time) : NaN;
  if (!Number.isFinite(t)) return null;      // a snapshot with no time cannot be placed on the grid
  return [
    t, m.spot, m.longPct, m.staleShare ?? null,
    m.pain?.longsUnderwaterPct ?? null, m.pain?.shortsUnderwaterPct ?? null,
    m.near?.positionsShare ?? null,
  ];
}

export function emptyStore() {
  return { v: 1, cols: COLS, dcols: DCOLS, byInstrument: {} };
}

/**
 * Parse a stored value. Corrupt is NOT empty: return null so the caller refuses to
 * write, rather than an empty store that would be written over the real one.
 */
export function parseStore(raw) {
  if (raw == null || raw === '') return emptyStore();
  try {
    const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!p || typeof p !== 'object' || !p.byInstrument || typeof p.byInstrument !== 'object') return null;
    return p;
  } catch { return null; }
}

/**
 * Insert one fine row for an instrument. Keyed by snapshot time, so polling the
 * same 20-minute snapshot twice (the poll runs more often than the grid, on
 * purpose, so a late snapshot is not missed) stores it once.
 */
export function upsertFine(store, instrument, row) {
  if (!row) return { changed: false, reason: 'no row' };
  const inst = (store.byInstrument[instrument] ||= { fine: [], daily: [] });
  const t = row[0];
  const i = inst.fine.findIndex(r => r[0] === t);
  if (i >= 0) {
    if (JSON.stringify(inst.fine[i]) === JSON.stringify(row)) return { changed: false, reason: 'same snapshot' };
    inst.fine[i] = row;
    return { changed: true, reason: 'replaced' };
  }
  inst.fine.push(row);
  inst.fine.sort((a, b) => a[0] - b[0]);
  return { changed: true, reason: 'appended' };
}

/**
 * Roll fine rows older than FINE_DAYS into daily rows, and cap daily.
 *
 * Only COMPLETE days are rolled — a day is complete once now is past its end —
 * so the daily row always reflects the whole day, and today's partial data stays
 * in fine where it belongs. Returns whether anything moved.
 */
export function rollDaily(store, now = Date.now()) {
  let changed = false;
  const cutoff = now - FINE_DAYS * DAY_MS;
  for (const inst of Object.values(store.byInstrument)) {
    const keep = [], byDay = new Map();
    for (const r of inst.fine) {
      const d = dayOf(r[0]);
      const dayEnd = Date.parse(d + 'T00:00:00Z') + DAY_MS;
      if (r[0] < cutoff && dayEnd <= now) {
        if (!byDay.has(d)) byDay.set(d, []);
        byDay.get(d).push(r);
      } else keep.push(r);
    }
    if (!byDay.size) continue;
    for (const [d, rows] of byDay) {
      rows.sort((a, b) => a[0] - b[0]);
      const last = rows.at(-1);
      const longs = rows.map(r => r[2]).filter(v => v != null);
      const mean = longs.length ? +(longs.reduce((a, v) => a + v, 0) / longs.length).toFixed(1) : null;
      const drow = [d, last[1], last[2], last[3], last[4], last[5],
        mean, longs.length ? Math.min(...longs) : null, longs.length ? Math.max(...longs) : null, rows.length];
      const j = inst.daily.findIndex(x => x[0] === d);
      if (j >= 0) inst.daily[j] = drow; else inst.daily.push(drow);
    }
    inst.daily.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    if (inst.daily.length > DAILY_MAX) inst.daily = inst.daily.slice(inst.daily.length - DAILY_MAX);
    inst.fine = keep;
    changed = true;
  }
  return { changed };
}

/**
 * Change in crowding over a lookback, for the drawer's "vs 24h / 7d" line.
 * Uses fine rows where they cover the lookback, daily rows beyond. Returns null
 * rather than a fake zero when there is nothing old enough to compare against.
 */
export function changeOver(store, instrument, hours, now = Date.now()) {
  const inst = store?.byInstrument?.[instrument];
  if (!inst) return null;
  const target = now - hours * 3600_000;
  const latest = inst.fine.at(-1);
  if (!latest) return null;
  // Newest fine row at or before the target time.
  let then = null;
  for (let i = inst.fine.length - 1; i >= 0; i--) { if (inst.fine[i][0] <= target) { then = inst.fine[i]; break; } }
  if (then) return { now: latest[2], then: then[2], delta: +(latest[2] - then[2]).toFixed(1), at: then[0], source: 'fine' };
  // Fall back to the daily row on or before the target day.
  const d = dayOf(target);
  for (let i = inst.daily.length - 1; i >= 0; i--) {
    if (inst.daily[i][0] <= d) {
      const row = inst.daily[i];
      return { now: latest[2], then: row[2], delta: +(latest[2] - row[2]).toFixed(1), at: Date.parse(row[0] + 'T23:59:59Z'), source: 'daily' };
    }
  }
  return null;
}

/** Rough byte size, so the poller can log it and a runaway is visible. */
export function approxBytes(store) { return JSON.stringify(store).length; }
