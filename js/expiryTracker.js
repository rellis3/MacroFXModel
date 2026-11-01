/**
 * Expiry tracker: every listed CME option expiry pinned to its calendar date and recorded every night as it
 * counts down (register row `expiry-tracker`, plans/RESEARCH_REGISTER.md).
 *
 * The nightly capture (`oi_raw_<date>`, archived to R2 `archive/oi_raw/`) already holds the full strike x expiry
 * matrix, but it is stored one capture day at a time. The question here runs the other way: for ONE expiry (say the
 * late-November contract), what did its book look like 60, 59, 58 ... 0 days out, which strikes built and which
 * faded, and where was price when it expired? So this module re-cuts the daily captures into one series per expiry:
 *
 *   series = { pair, expiry: 'YYYY-MM-DD', code, inverted, days: [ snapshot, ... ] }   (one snapshot per capture date)
 *
 * Snapshots keep the ladder in FUTURES terms (the strike as CME lists it) plus the futures price, spot and basis of
 * that capture. Basis drifts day to day, so converting at capture time would move a strike between days and make a
 * fixed strike look like it walked. Readers convert with `toSpot` at whatever basis they want.
 *
 * Everything derived (changes, building streaks, zones, centre) is computed at READ time by `expiryView`, so the
 * stored series stays a plain record and a better zone rule never needs a rewrite of history.
 *
 * Caveats that the view reports rather than hides:
 *  - OI follows price: positions open near the money, so an expiry's OI centre drifts with price whether or not it
 *    has any pull. `expiryView` splits building into near-spot and away-from-spot for that reason.
 *  - A stale capture (the feed re-serving yesterday's book) shows as zero change everywhere; such days are flagged
 *    `stale` and skipped when changes are computed.
 *  - DTE in the paste is relative to the paste date, so expiry = capture date + DTE can wobble by a day; matching
 *    uses the contract code when the paste has one and a +-1 day window otherwise.
 *
 * Pure: no I/O. Tested by js/expiryTracker.test.mjs.
 */
import { oiMatrixExpiryLegs, oiCalcMaxPain } from './oi.js';

const DAY = 864e5;
export const TAIL_FRAC = 0.35;          // strikes further than 35% from the futures price are tail hedges, not zones (as _oiNearBook)

export function addDays(date, n) {
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(t) ? new Date(t + n * DAY).toISOString().slice(0, 10) : null;
}
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY);

/** Futures-terms strike -> spot-terms price (inverted pairs are quoted foreign-per-USD on CME). */
export function toSpot(strike, { basis = 0, inverted = false } = {}) {
  if (!Number.isFinite(strike) || strike <= 0) return null;
  const b = Number.isFinite(basis) ? basis : 0;
  return inverted ? 1 / strike - b : strike - b;
}

const round = (x, dp = 6) => (Number.isFinite(x) ? +x.toFixed(dp) : null);

/**
 * One capture day's raw entry for one pair -> a snapshot per expiry column.
 * rawEntry: the `oi_raw_<date>` value for the pair ({ rawOI, spot, futures, basis, ... }).
 * Returns [{ expiry, code, snap }] where snap is what gets stored for that capture date.
 */
export function expirySnapshotsFromRaw(rawEntry, { date, inverted = false, minOI = 1 } = {}) {
  if (!rawEntry?.rawOI || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return [];
  const legs = oiMatrixExpiryLegs(rawEntry.rawOI, { basis: 0, inverted: false, minOI });   // futures terms, no shift
  if (!legs) return [];
  const futures = Number.isFinite(rawEntry.futures) ? rawEntry.futures : null;
  const out = [];
  for (const l of legs) {
    if (!Number.isFinite(l.dte) || l.dte < 0) continue;
    const ladder = [];
    for (let i = 0; i < l.strikes.length; i++) {
      const c = l.calls[i] || 0, p = l.puts[i] || 0;
      if (c + p <= 0) continue;
      ladder.push([round(l.strikes[i], 8), Math.round(c), Math.round(p)]);
    }
    if (ladder.length < 2) continue;
    out.push({
      expiry: addDays(date, l.dte), code: l.code ?? null,
      snap: {
        date, dte: l.dte,
        futures, spot: Number.isFinite(rawEntry.spot) ? rawEntry.spot : null,
        basis: Number.isFinite(rawEntry.basis) ? rawEntry.basis : null,
        savedAtMs: rawEntry.savedAtMs ?? null,
        ladder,
      },
    });
  }
  return out;
}

/** Find the series key an incoming expiry belongs to: same code first, else a stored expiry within +-1 day. */
export function matchExpiryKey(existingKeys, { expiry, code }, codeOf = () => null) {
  if (!expiry) return null;
  if (code) { const k = existingKeys.find(x => codeOf(x) === code); if (k) return k; }
  if (existingKeys.includes(expiry)) return expiry;
  const near = existingKeys.find(k => Math.abs(dayDiff(k, expiry)) <= 1 && (!code || !codeOf(k) || codeOf(k) === code));
  return near ?? expiry;
}

const ladderSig = ladder => (ladder || []).map(r => r.join(':')).join('|');

/**
 * Add (or replace) one capture day's snapshot in an expiry series. Idempotent: replaying the same day is a no-op.
 * A snapshot whose ladder is byte-identical to the previous capture day is marked `stale` (the feed re-served an old
 * book); the OI is kept as the stock it is, but the day carries no change information.
 */
export function mergeExpirySnapshot(series, { pair, expiry, code = null, inverted = false }, snap) {
  const s = series && Array.isArray(series.days)
    ? { ...series, days: series.days.slice() }
    : { v: 1, pair, expiry, code, inverted: !!inverted, days: [] };
  if (!s.code && code) s.code = code;
  const i = s.days.findIndex(d => d.date === snap.date);
  const before = i >= 0 ? JSON.stringify(s.days[i]) : null;
  if (i >= 0) s.days[i] = snap; else s.days.push(snap);
  s.days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  // re-mark staleness around the touched day (only the day itself and its successor can change)
  for (let k = 0; k < s.days.length; k++) {
    const prev = s.days[k - 1];
    const stale = !!prev && ladderSig(prev.ladder) === ladderSig(s.days[k].ladder);
    if (stale) s.days[k] = { ...s.days[k], stale: true };
    else if (s.days[k].stale) { const { stale: _s, ...rest } = s.days[k]; s.days[k] = rest; }
  }
  const changed = before !== JSON.stringify(s.days.find(d => d.date === snap.date));
  s.first = s.days[0]?.date ?? null; s.last = s.days.at(-1)?.date ?? null; s.n = s.days.length;
  return { series: s, changed };
}

/**
 * Fold a batch of capture days into a map of series. dayEntries: [{ date, pairs: { pair: rawEntry } }].
 * seriesMap: Map(`${pair}|${expiry}` -> series), mutated in place; returns the set of keys that changed.
 */
export function foldCaptureDays(seriesMap, dayEntries, { invertedPairs = new Set(), minOI = 1 } = {}) {
  const touched = new Set();
  const days = [...dayEntries].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const { date, pairs } of days) {
    for (const [pair, raw] of Object.entries(pairs || {})) {
      const inverted = invertedPairs.has(pair);
      const keysForPair = [...seriesMap.keys()].filter(k => k.startsWith(`${pair}|`)).map(k => k.slice(pair.length + 1));
      const codeOf = e => seriesMap.get(`${pair}|${e}`)?.code ?? null;
      for (const { expiry, code, snap } of expirySnapshotsFromRaw(raw, { date, inverted, minOI })) {
        const key = matchExpiryKey(keysForPair, { expiry, code }, codeOf);
        const mapKey = `${pair}|${key}`;
        const { series, changed } = mergeExpirySnapshot(seriesMap.get(mapKey), { pair, expiry: key, code, inverted }, snap);
        seriesMap.set(mapKey, series);
        if (!keysForPair.includes(key)) keysForPair.push(key);
        if (changed) touched.add(mapKey);
      }
    }
  }
  return touched;
}

/** Index entry for one series (what the list endpoint shows without loading ladders). */
export function seriesIndexEntry(series) {
  const last = series?.days?.at(-1);
  const tot = l => (l || []).reduce((a, r) => a + r[1] + r[2], 0);
  return { expiry: series.expiry, code: series.code ?? null, first: series.first, last: series.last, n: series.n,
    dteNow: last?.dte ?? null, totalOI: tot(last?.ladder), maxDteSeen: series.days?.[0]?.dte ?? null };
}

/**
 * Read-time view of one expiry series: per capture day, the book's totals, OI-weighted centre, max pain and its
 * strongest zones, with day-over-day and since-first changes and a building streak per strike.
 *  awayFrac: a strike counts as "away from price" when |strike/futures - 1| > awayFrac on that day.
 *  topN: zones reported per day.
 * Prices are reported in futures terms (k) and spot terms (px, at that day's basis).
 */
export function expiryView(series, { awayFrac = 0.01, topN = 6 } = {}) {
  if (!series?.days?.length) return null;
  const inverted = !!series.inverted;
  const firstMap = new Map((series.days[0].ladder || []).map(r => [r[0], r[1] + r[2]]));
  let prevMap = null;
  const streak = new Map();                                   // strike -> consecutive non-stale days of OI increase
  const days = [];
  for (const d of series.days) {
    const ref = Number.isFinite(d.futures) ? d.futures : null;
    const rows = (d.ladder || []).filter(r => ref == null || Math.abs(r[0] / ref - 1) <= TAIL_FRAC);
    const map = new Map(rows.map(r => [r[0], r[1] + r[2]]));
    const total = rows.reduce((a, r) => a + r[1] + r[2], 0);
    const centre = total > 0 ? rows.reduce((a, r) => a + r[0] * (r[1] + r[2]), 0) / total : null;
    const conv = k => toSpot(k, { basis: d.basis ?? 0, inverted });
    let chgNear = 0, chgAway = 0;
    if (prevMap && !d.stale) {
      for (const [k, oi] of map) {
        const dOI = oi - (prevMap.get(k) ?? 0);
        const away = ref != null && Math.abs(k / ref - 1) > awayFrac;
        if (away) chgAway += dOI; else chgNear += dOI;
        streak.set(k, dOI > 0 ? (streak.get(k) ?? 0) + 1 : 0);
      }
      for (const k of prevMap.keys()) if (!map.has(k)) { streak.set(k, 0); const away = ref != null && Math.abs(k / ref - 1) > awayFrac; if (away) chgAway -= prevMap.get(k); else chgNear -= prevMap.get(k); }
    }
    const zones = rows.map(r => {
      const oi = r[1] + r[2];
      return { k: r[0], px: round(conv(r[0])), oi, call: r[1], put: r[2], share: total > 0 ? round(oi / total, 4) : null,
        chg1d: prevMap && !d.stale ? oi - (prevMap.get(r[0]) ?? 0) : null,
        chgSinceFirst: oi - (firstMap.get(r[0]) ?? 0),
        buildStreak: streak.get(r[0]) ?? 0,
        distPct: ref != null ? round((r[0] / ref - 1) * 100 * (inverted ? -1 : 1), 3) : null };
    }).sort((a, b) => b.oi - a.oi).slice(0, topN);
    days.push({ date: d.date, dte: d.dte, stale: !!d.stale, futures: d.futures, spot: d.spot, basis: d.basis,
      totalOI: total, centre: round(centre, 8), centrePx: round(conv(centre)),
      maxPain: rows.length >= 2 ? round(conv(oiCalcMaxPain(rows.map(r => r[0]), rows.map(r => r[1]), rows.map(r => r[2])))) : null,
      chgNearSpot: prevMap && !d.stale ? chgNear : null, chgAwayFromSpot: prevMap && !d.stale ? chgAway : null,
      zones });
    if (!d.stale) prevMap = map;
  }
  return { pair: series.pair, expiry: series.expiry, code: series.code ?? null, inverted, n: days.length, days };
}
