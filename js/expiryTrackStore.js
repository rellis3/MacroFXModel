/**
 * Expiry tracker store: folds the nightly CME captures into one permanent R2 series per expiry
 * (see js/expiryTracker.js for the data model; register row `expiry-tracker`).
 *
 *   archive/expiry_track/<pair>/<expiry>.json   one series per (pair, expiry), append-only by capture date
 *   archive/expiry_track/_index.json            { v, foldedDates: [...], series: { 'pair|expiry': indexEntry } }
 *
 * Source days come from KV `oi_raw_<date>` (fast, rolling) and R2 `archive/oi_raw/` (permanent), so a fold can
 * rebuild every expiry back to the first capture (2026-07-31). The last two capture days are always re-folded,
 * because a day's capture can still be completed later that day (the IV boxes land after the ladder); merging is
 * idempotent so this costs nothing when nothing changed.
 *
 * Deps are injected so js/expiryTrackStore.test.mjs runs without a network. Nothing here deletes.
 */
import { foldCaptureDays, seriesIndexEntry, expiryView } from './expiryTracker.js';

export const ET_PREFIX = 'archive/expiry_track/';
const safe = s => String(s).replace(/[^A-Za-z0-9._-]/g, '_');
export const seriesKey = (pair, expiry) => `${ET_PREFIX}${safe(pair)}/${safe(expiry)}.json`;
const INDEX_KEY = `${ET_PREFIX}_index.json`;

/**
 * deps: { getJSON(key), putJSON(key, obj), kvKeys(prefix) -> [keys], kvGet(key) -> string|null,
 *         archivedDates(source) -> Set, invertedPairs: Set, log }
 */
export function createExpiryTrackStore(deps) {
  const { getJSON, putJSON, kvKeys = async () => [], kvGet = async () => null, archivedDates = async () => new Set(),
    invertedPairs = new Set(), log = console } = deps;

  async function readDay(date) {
    try {
      const raw = await kvGet(`oi_raw_${date}`);
      if (raw) { const j = JSON.parse(raw); return j.data ?? j; }
    } catch { /* fall through to R2 */ }
    const doc = await getJSON(`archive/oi_raw/${date.slice(0, 4)}/${date}.json`).catch(() => null);
    return doc?.payload ?? null;
  }

  async function knownDates() {
    const kv = (await kvKeys('oi_raw_')).map(k => k.replace(/^oi_raw_/, '')).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
    const r2 = [...(await archivedDates('oi_raw'))];
    return [...new Set([...kv, ...r2])].sort();
  }

  /** Fold every capture day not yet folded (plus the last two). maxDays caps one run's work. */
  async function fold({ maxDays = 400, rebuild = false } = {}) {
    const index = (!rebuild && await getJSON(INDEX_KEY).catch(() => null)) || { v: 1, foldedDates: [], series: {} };
    const done = new Set(index.foldedDates || []);
    const all = await knownDates();
    const recent = new Set(all.slice(-2));
    const pending = all.filter(d => !done.has(d) || recent.has(d)).slice(0, maxDays);
    if (!pending.length) return { ok: true, folded: 0, wrote: 0, series: Object.keys(index.series).length };
    // Preload only the series that can still receive a snapshot: expiry on or after the first pending day - 1.
    const from = pending[0];
    const map = new Map();
    for (const [k, e] of Object.entries(index.series)) {
      if (rebuild || e.expiry < from) continue;
      const [pair] = k.split('|');
      const s = await getJSON(seriesKey(pair, e.expiry)).catch(() => null);
      if (s) map.set(k, s);
    }
    const days = [];
    for (const d of pending) {
      const pairs = await readDay(d).catch(() => null);
      if (pairs && typeof pairs === 'object') days.push({ date: d, pairs });
      done.add(d);
    }
    const touched = foldCaptureDays(map, days, { invertedPairs });
    let wrote = 0;
    for (const k of touched) {
      const s = map.get(k);
      try { if (await putJSON(seriesKey(s.pair, s.expiry), s)) { wrote++; index.series[k] = seriesIndexEntry(s); } }
      catch (e) { log.warn?.(`[expiry-track] write ${k}: ${e?.message}`); }
    }
    index.foldedDates = [...done].sort();
    index.updatedAt = new Date().toISOString();
    await putJSON(INDEX_KEY, index);
    return { ok: true, folded: days.length, wrote, series: Object.keys(index.series).length, from, to: pending.at(-1) };
  }

  async function list(pair = null) {
    const index = await getJSON(INDEX_KEY).catch(() => null);
    if (!index) return { ok: true, foldedDates: 0, series: [] };
    const rows = Object.entries(index.series).map(([k, e]) => ({ pair: k.split('|')[0], ...e }))
      .filter(r => !pair || r.pair === pair).sort((a, b) => (a.pair === b.pair ? (a.expiry < b.expiry ? -1 : 1) : a.pair < b.pair ? -1 : 1));
    return { ok: true, foldedDates: index.foldedDates?.length ?? 0, first: index.foldedDates?.[0] ?? null, last: index.foldedDates?.at(-1) ?? null, series: rows };
  }

  async function view(pair, expiry, opts = {}) {
    const s = await getJSON(seriesKey(pair, expiry)).catch(() => null);
    return s ? expiryView(s, opts) : null;
  }

  return { fold, list, view, readDay, knownDates };
}
