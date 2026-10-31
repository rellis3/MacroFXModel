/**
 * Data archive — the permanent copy of data this system cannot get back (plans/DATA_ASSET_MAP.md §4A–B).
 *
 * Before 2026-10-31 several irreplaceable series lived only in KV or in process memory, on rolling windows:
 * the CME options capture (KV only; CME serves no history), the ^TNX intraday capture (120 days), ICE credit
 * spreads (FRED serves a rolling 3 years), gold ETF flows (120 points), the daily nowcast (latest only), and every
 * deep FRED series the server downloads and then trims (DGS10 from 1962 kept for 6-12 years in memory). This
 * module writes them to R2, append-only:
 *
 *   archive/<source>/<YYYY>/<date>.json        one snapshot per day (snapshot)
 *   archive/series/<source>/<id>.json          one growing series per id (mergeSeries): points only ever added
 *
 * Nothing here deletes. KV keeps its fast rolling windows; R2 is the record. Writes are throttled and skipped when
 * nothing changed, and every call is best-effort: an archive failure is logged and never breaks the caller.
 * R2 adapters are injected (js/r2Store.js in production) so js/dataArchive.test.mjs runs without a network.
 */

const DAY = 864e5;

/**
 * Merge dated points into an existing series. existing: [[date, value, firstValue?]] ascending; incoming:
 * [{date, value}]. The latest value wins for a date; the first value ever seen is kept as the third element when a
 * later revision differs, so revisions are visible rather than silently overwritten. Returns { points, added, revised }.
 */
export function mergePoints(existing = [], incoming = []) {
  const by = new Map(existing.map(p => [p[0], p.slice()]));
  let added = 0, revised = 0;
  for (const q of incoming) {
    const d = String(q?.date ?? '').slice(0, 10), v = Number(q?.value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(v)) continue;
    const cur = by.get(d);
    if (!cur) { by.set(d, [d, v]); added++; continue; }
    if (cur[1] !== v) {
      const first = cur.length > 2 ? cur[2] : cur[1];
      by.set(d, first === v ? [d, v] : [d, v, first]);
      revised++;
    }
  }
  const points = [...by.values()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { points, added, revised };
}

const safe = s => String(s).replace(/[^A-Za-z0-9._-]/g, '_');

export function createDataArchive({ putJSON, getJSON, listKeys = async () => [], configured = () => true, log = console, now = () => Date.now(), minIntervalMs = 6 * 3600e3 } = {}) {
  const lastWrite = new Map();          // key -> { at, sig }
  // `configured` lets the caller say whether R2 credentials exist (r2Store returns false without them).
  const hasFns = typeof putJSON === 'function' && typeof getJSON === 'function';
  const isOn = () => hasFns && !!configured();

  /** One snapshot per (source, date). Rewritten only when the payload changed. */
  async function snapshot(source, date, payload) {
    if (!isOn() || !date || payload == null) return { wrote: false, reason: isOn() ? 'empty' : 'no R2' };
    const key = `archive/${safe(source)}/${String(date).slice(0, 4)}/${safe(date)}.json`;
    const sig = JSON.stringify(payload);
    if (lastWrite.get(key)?.sig === sig) return { wrote: false, reason: 'unchanged', key };
    try {
      const ok = await putJSON(key, { source, date, savedAt: new Date(now()).toISOString(), payload });
      if (ok) lastWrite.set(key, { at: now(), sig });
      return { wrote: !!ok, key };
    } catch (e) { log.warn?.(`[archive] ${key}: ${e?.message}`); return { wrote: false, error: e?.message, key }; }
  }

  /** Merge a dated series into its permanent copy. Throttled per id; never drops a stored point. */
  async function mergeSeries(source, id, points, meta = {}) {
    if (!isOn() || !Array.isArray(points) || !points.length) return { wrote: false, reason: isOn() ? 'empty' : 'no R2' };
    const key = `archive/series/${safe(source)}/${safe(id)}.json`;
    const lw = lastWrite.get(key);
    if (lw && now() - lw.at < minIntervalMs) return { wrote: false, reason: 'throttled', key };
    try {
      const prev = await getJSON(key);
      const m = mergePoints(prev?.points ?? [], points);
      lastWrite.set(key, { at: now() });
      if (prev && !m.added && !m.revised) return { wrote: false, reason: 'unchanged', key, n: m.points.length };
      await putJSON(key, { source, id, ...meta, updatedAt: new Date(now()).toISOString(), first: m.points[0]?.[0] ?? null, last: m.points.at(-1)?.[0] ?? null, n: m.points.length, points: m.points });
      return { wrote: true, key, added: m.added, revised: m.revised, n: m.points.length };
    } catch (e) { log.warn?.(`[archive] ${key}: ${e?.message}`); return { wrote: false, error: e?.message, key }; }
  }

  /**
   * Merge dated multi-field rows ([{date, ...numbers}]) into archive/tables/<source>/<id>.json. Rows only ever get
   * added; a changed row keeps its first version under `firstSeen` so CFTC/agency revisions stay visible.
   */
  async function mergeTable(source, id, rows, meta = {}) {
    if (!isOn() || !Array.isArray(rows) || !rows.length) return { wrote: false, reason: isOn() ? 'empty' : 'no R2' };
    const key = `archive/tables/${safe(source)}/${safe(id)}.json`;
    const lw = lastWrite.get(key);
    if (lw && now() - lw.at < minIntervalMs) return { wrote: false, reason: 'throttled', key };
    try {
      const prev = await getJSON(key);
      const by = new Map((prev?.rows ?? []).map(r => [r.date, r]));
      let added = 0, revised = 0;
      for (const r of rows) {
        const d = String(r?.date ?? '').slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
        const { firstSeen: _f, ...clean } = { ...r, date: d };
        const cur = by.get(d);
        if (!cur) { by.set(d, clean); added++; continue; }
        const { firstSeen, ...curClean } = cur;
        if (JSON.stringify(curClean) !== JSON.stringify(clean)) { by.set(d, { ...clean, firstSeen: firstSeen ?? curClean }); revised++; }
      }
      lastWrite.set(key, { at: now() });
      if (prev && !added && !revised) return { wrote: false, reason: 'unchanged', key, n: by.size };
      const out = [...by.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
      await putJSON(key, { source, id, ...meta, updatedAt: new Date(now()).toISOString(), first: out[0]?.date ?? null, last: out.at(-1)?.date ?? null, n: out.length, rows: out });
      return { wrote: true, key, added, revised, n: out.length };
    } catch (e) { log.warn?.(`[archive] ${key}: ${e?.message}`); return { wrote: false, error: e?.message, key }; }
  }

  /** Dates already archived for a snapshot source (cached per process, refreshed daily). */
  const known = new Map();
  async function archivedDates(source) {
    const k = known.get(source);
    if (k && now() - k.at < DAY) return k.dates;
    let dates = new Set();
    try {
      const keys = await listKeys(`archive/${safe(source)}/`);
      dates = new Set(keys.map(x => (x.match(/(\d{4}-\d{2}-\d{2})\.json$/) ?? [])[1]).filter(Boolean));
    } catch (e) { log.warn?.(`[archive] list ${source}: ${e?.message}`); }
    known.set(source, { at: now(), dates });
    return dates;
  }

  /**
   * Copy every day a KV-held source has that R2 does not, e.g. the oi_raw_<date> keys. getDay(date) → payload.
   * Returns the dates copied. Idempotent: run it as often as you like.
   */
  async function backfill(source, dates, getDay) {
    if (!isOn()) return [];
    const have = await archivedDates(source), done = [];
    for (const d of dates) {
      if (have.has(d)) continue;
      try { const p = await getDay(d); if (p == null) continue; const r = await snapshot(source, d, p); if (r.wrote) { have.add(d); done.push(d); } }
      catch (e) { log.warn?.(`[archive] backfill ${source} ${d}: ${e?.message}`); }
    }
    return done;
  }

  return { get enabled() { return isOn(); }, snapshot, mergeSeries, mergeTable, backfill, archivedDates };
}

/** FRED series whose only free source is a rolling window: archive daily or lose them (ICE BofA on FRED: 3 years). */
export const ICE_SPREAD_IDS = ['BAMLH0A0HYM2', 'BAMLH0A1HYBB', 'BAMLH0A2HYB', 'BAMLH0A3HYC', 'BAMLC0A0CM', 'BAMLC0A4CBBB', 'BAMLEMCBPIOAS', 'BAMLHE00EHYIOAS'];
