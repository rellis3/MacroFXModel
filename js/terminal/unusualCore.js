// js/terminal/unusualCore.js: "what is unusual right now". Every series in the daily market bundle is ranked by how extreme its latest reading is
// against ITS OWN history (a percentile, never a size: a 1% move is huge for a yield curve and nothing for bitcoin). Pure: no DOM, no fetch, no clock.
//
// What is measured, per series (all on the series' own completed daily closes, nulls dropped):
//   the 1-day, 5-day and 20-day move   how big is the latest move against every other move of that length in the window (|move| percentile).
//                                      Windows overlap for 5 and 20 days, so those percentiles are less independent than they look: said on the board.
//   the level (only for series read by their level: yields, spreads, volatility indices)   two-sided: |2 * percentile - 1|, so a level in the top 2.5% or
//                                      bottom 2.5% scores 0.95, comparable with a move in the biggest 5% of moves.
// The score is the largest of these. It says "unusual against its own past", which is context: it is NOT a signal and says nothing about direction.
// Honest limits, printed on the board: ~90 series x 3-4 measures are looked at every day, so some always read extreme by chance (expectedByChance
// counts how many); history is 6 years for most series and ~3 for credit spreads and single shares (flagged); percentiles of a short history are rough.

import { metaFor } from './insightSeries.js';

export const MIN_N = 120;          // fewer completed closes than this: listed as "too short to rank", never ranked
export const SHORT_N = 800;        // fewer than this (about 3 years): ranked, but flagged short
export const HORIZONS = [1, 5, 20];
export const SPARK_N = 60;

const fin = v => v != null && Number.isFinite(+v);
const num = v => (v == null || v === '' ? null : (Number.isFinite(+v) ? +v : null));

/** Share of `sorted` (ascending) that is below x, with ties counted half: 0..1. */
export function pctRank(sorted, x) {
  const n = sorted.length; if (!n) return null;
  let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < x) lo = m + 1; else hi = m; }
  const below = lo; hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= x) lo = m + 1; else hi = m; }
  return (below + (lo - below) / 2) / n;
}

/** The change from a to b: a difference ('rate') or a log change ('ratio'). null when it is not defined (a non-positive price). */
export const change = (a, b, kind) => (kind === 'rate' ? b - a : (a > 0 && b > 0 ? Math.log(b / a) : null));

/** Drop the nulls: parallel arrays of dates and values. */
export function compact(dates, vals) {
  const d = [], v = [];
  for (let i = 0; i < vals.length; i++) { const x = num(vals[i]); if (x != null) { d.push(dates[i]); v.push(x); } }
  return { d, v };
}

/** All k-observation changes in v, and the latest one. */
export function movesAt(v, k, kind) {
  const all = [];
  for (let i = k; i < v.length; i++) { const c = change(v[i - k], v[i], kind); if (c != null) all.push(c); }
  const last = v.length > k ? change(v[v.length - 1 - k], v[v.length - 1], kind) : null;
  return { all, last };
}

const yearsOf = (d0, d1) => Math.max(0, (Date.parse(d1) - Date.parse(d0)) / (365.25 * 86_400_000));

/** A move said in the series' own words: basis points for a yield or spread, percent for a price or a volatility index. */
export function fmtMove(c, meta) {
  if (!fin(c)) return 'n/a';
  if (meta.kind === 'rate' && meta.moveUnit === 'pts') { const a = Math.abs(c); return `${c > 0 ? '+' : c < 0 ? '-' : ''}${a >= 10 ? a.toFixed(1) : a.toFixed(2)} pts`; }
  if (meta.kind === 'rate') { const bp = c * 100, a = Math.abs(bp); return `${bp > 0 ? '+' : bp < 0 ? '-' : ''}${a >= 100 ? a.toFixed(0) : a.toFixed(1)}bp`; }
  const p = (Math.exp(c) - 1) * 100, a = Math.abs(p);
  return `${p > 0 ? '+' : p < 0 ? '-' : ''}${a >= 10 ? a.toFixed(1) : a.toFixed(2)}%`;
}
/** A level said with sensible digits. */
export function fmtLevel(x, meta) {
  if (!fin(x)) return 'n/a';
  const a = Math.abs(x);
  const s = a >= 10000 ? x.toFixed(0) : a >= 100 ? x.toFixed(1) : a >= 10 ? x.toFixed(2) : x.toFixed(meta.group === 'fx' ? 4 : 3);
  return meta.unit === '%' || meta.unit === 'pp' ? `${s}%` : meta.moveUnit === 'pts' ? `${s} pts` : s;
}
const WORD = { 1: '1-day', 5: '5-day', 20: '20-day' };
const pct0 = p => Math.round(p * 100);
const sideWord = (c) => (c > 0 ? 'up' : c < 0 ? 'down' : 'flat');

/**
 * One series. Returns null when the series has no usable points. `refDate` is the bundle's last date (a series whose last value is older than
 * it by more than `staleDays` calendar days is flagged stale: its percentile describes an old reading).
 */
export function analyse(key, dates, vals, { refDate = null, staleDays = 6 } = {}) {
  const meta = metaFor(key);
  const { d, v } = compact(dates, vals);
  if (!v.length) return null;
  const n = v.length, last = v[n - 1], lastDate = d[n - 1];
  const row = { key, label: meta.label, group: meta.group, kind: meta.kind, go: meta.go, n, from: d[0], to: lastDate, years: yearsOf(d[0], lastDate), last, lastFmt: fmtLevel(last, meta), spark: v.slice(-SPARK_N),
    stale: refDate && yearsOf(lastDate, refDate) * 365.25 > staleDays ? lastDate : null, short: n < SHORT_N, tooShort: n < MIN_N, moves: {}, level: null, drivers: [], score: null, driver: null };
  if (row.tooShort) return row;
  for (const k of HORIZONS) {
    const { all, last: lc } = movesAt(v, k, meta.kind);
    if (lc == null || all.length < 60) continue;
    const absSorted = all.map(Math.abs).sort((a, b) => a - b);
    const p = pctRank(absSorted, Math.abs(lc));
    row.moves[k] = { chg: lc, text: fmtMove(lc, meta), pct: p, n: all.length };
    row.drivers.push({ id: `m${k}`, k, pct: p, chg: lc });
  }
  if (meta.level) {
    const sorted = [...v].sort((a, b) => a - b), p = pctRank(sorted, last);
    row.level = { pct: p, ext: Math.abs(2 * p - 1), side: p >= 0.5 ? 'high' : 'low' };
    row.drivers.push({ id: 'level', pct: row.level.ext, level: p });
  }
  if (row.drivers.length) {
    const best = row.drivers.reduce((a, b) => (b.pct > a.pct ? b : a));
    row.score = best.pct;
    row.driver = best.id === 'level'
      ? { id: 'level', pct: best.pct, text: `sits at the ${best.level >= 0.5 ? 'top' : 'bottom'} ${Math.max(0.1, Math.round((best.level >= 0.5 ? 1 - best.level : best.level) * 1000) / 10)}% of its own ${row.years.toFixed(1)} years` }
      : { id: best.id, pct: best.pct, text: `${WORD[best.k]} move of ${row.moves[best.k].text} (${sideWord(best.chg)}) is bigger than ${pct0(best.pct)}% of its ${WORD[best.k]} moves` };
  }
  return row;
}

/** Every series in the bundle, analysed and ranked (most unusual first). Series too short to rank come after, in `tooShort`. */
export function rankBundle(bundle, opts = {}) {
  const dates = bundle?.dates ?? [], series = bundle?.series ?? {};
  const refDate = opts.refDate ?? bundle?.to ?? dates[dates.length - 1] ?? null;
  const rows = [], tooShort = [], none = [];
  for (const key of Object.keys(series)) {
    const r = analyse(key, dates, series[key], { refDate, staleDays: opts.staleDays });
    if (!r) { none.push(key); continue; }
    if (r.tooShort) tooShort.push(r); else if (r.score != null) rows.push(r);
  }
  rows.sort((a, b) => b.score - a.score || b.n - a.n || (a.key < b.key ? -1 : 1));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return { rows, tooShort, none, refDate, windowFrom: rows.length ? rows.reduce((m, r) => (r.from < m ? r.from : m), rows[0].from) : null };
}

/**
 * How many readings would sit at or beyond `threshold` by chance alone, against how many do. Every ranked series is looked at on each measure
 * (3 move lengths, plus its level when it is read by level); a reading beyond the threshold happens a (1 - threshold) share of the time by construction.
 */
export function expectedByChance(rows, threshold = 0.95) {
  let measures = 0, hits = 0;
  for (const r of rows) for (const dr of r.drivers) { measures++; if (dr.pct >= threshold) hits++; }
  return { threshold, measures, hits, expected: measures * (1 - threshold) };
}

/** Group counts for the filter pills: [{ group, label, n, hot }] where hot = how many of the group are at or beyond `threshold`. */
export function groupCounts(rows, groups, threshold = 0.95) {
  const out = new Map();
  for (const r of rows) { const g = out.get(r.group) ?? { group: r.group, label: groups[r.group] ?? r.group, n: 0, hot: 0 }; g.n++; if (r.score >= threshold) g.hot++; out.set(r.group, g); }
  return [...out.values()].sort((a, b) => b.hot - a.hot || b.n - a.n);
}

/** Plain words for how much to trust a row's percentile. */
export function trustNote(r) {
  const bits = [`${r.n.toLocaleString('en-GB')} closes since ${r.from} (${r.years.toFixed(1)} years)`];
  if (r.short) bits.push('short history, so the percentile is rough');
  if (r.stale) bits.push(`last value is from ${r.stale}`);
  if (r.driver && r.driver.id !== 'level' && r.driver.id !== 'm1') bits.push('5 and 20 day windows overlap, so they are less independent than a daily one');
  return bits.join('; ');
}
