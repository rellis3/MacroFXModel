/**
 * The point-in-time feature store — the only way a study may read a feature.
 *
 * WHY THIS EXISTS. Every macro backtest on this desk read a series as it looks today and
 * asked what it would have predicted in 2019. A revised CPI print, a monthly OECD mirror
 * that arrives six weeks late, a COT report published three days after its date — each is
 * lookahead unless the study knows when the number became KNOWABLE. The ledger's macro
 * family (4 validated, 35 null) was built without that discipline, which means the nulls
 * are probably right and the validated ones are not yet trustworthy. Step 1 of
 * plans/QUANT_SYSTEM_BUILD_PLAN.md: nothing downstream is safe without this.
 *
 * THE RULE. `at(id, t)` returns the newest row whose `asof` is at or before `t`. Not the
 * newest row whose `date` is before `t` — the date is the period the value DESCRIBES, the
 * asof is when you could have had it. The two differ by a day for a daily close and by
 * weeks for a macro print, and that difference is the whole point.
 *
 * WHAT IT REFUSES. A feature that is not in plans/FEATURE_MANIFEST.json throws. A feature
 * that is registered but not built (status 'gap') throws. A row whose asof precedes its
 * own date throws at load. A study cannot quietly run on a feature nobody vouched for.
 *
 * Files are parquet (snappy), written by analysis/features/build_features.py with pyarrow
 * and read here with hyparquet; gzip is not supported by the reader, so the writer never
 * uses it. The manifest is committed; the data is not.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const parquetReadObjects = async () => { throw new Error('stub'); };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MANIFEST_PATH = path.join(ROOT, 'plans', 'FEATURE_MANIFEST.json');
export const FEATURES_DIR = path.join(ROOT, 'features');

export const ASOF_RULES = new Set(['close+1h', 'vintage', 'release_ts', 'report+3d', 'schedule-7d', 'cache-day-end+1h', 'measured']);
const FIXED_LAG = /^fixed_lag:(\d+)$/;
export const KINDS = new Set(['series', 'events', 'profile']);

export class UnregisteredFeature extends Error { constructor(id) { super(`feature "${id}" is not in FEATURE_MANIFEST.json — register it with an asof rule before using it`); this.name = 'UnregisteredFeature'; } }
export class FeatureNotBuilt extends Error { constructor(id, status, note) { super(`feature "${id}" is registered but not built (status: ${status ?? 'unbuilt'}${note ? ' — ' + note : ''})`); this.name = 'FeatureNotBuilt'; } }
export class BadFeatureRows extends Error { constructor(id, why) { super(`feature "${id}": ${why}`); this.name = 'BadFeatureRows'; } }

/** Validate one manifest entry's shape. Throws with the entry id so the fix is obvious. */
export function validateEntry(e) {
  if (!e || typeof e.id !== 'string' || !e.id) throw new Error('manifest entry without an id');
  if (!KINDS.has(e.kind)) throw new Error(`manifest "${e.id}": kind must be one of ${[...KINDS].join('|')}`);
  if (!(ASOF_RULES.has(e.asofRule) || FIXED_LAG.test(e.asofRule ?? ''))) throw new Error(`manifest "${e.id}": unknown asofRule "${e.asofRule}"`);
  if (typeof e.revises !== 'boolean') throw new Error(`manifest "${e.id}": revises must be true or false`);
  if (!Array.isArray(e.countries)) throw new Error(`manifest "${e.id}": countries must be an array`);
  return true;
}

export async function loadManifest(file = MANIFEST_PATH) {
  const m = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(m.features)) throw new Error('manifest has no features[]');
  const seen = new Set();
  for (const e of m.features) { validateEntry(e); if (seen.has(e.id)) throw new Error(`manifest: duplicate id "${e.id}"`); seen.add(e.id); }
  return m;
}

const toMs = v => (v == null ? NaN : typeof v === 'number' ? v : Date.parse(String(v)));

/**
 * Validate rows against their kind. The one rule that matters is enforced here, not
 * trusted to the builder: for a series, asof must never precede the start of the date it
 * describes — a value cannot be known before its period exists.
 */
export function validateRows(id, kind, rows) {
  if (!Array.isArray(rows)) throw new BadFeatureRows(id, 'rows is not an array');
  if (kind === 'profile') {
    for (const r of rows) if (r.pair == null || r.hour == null || r.mean == null) throw new BadFeatureRows(id, 'profile row missing pair/hour/mean');
    return rows;
  }
  for (const r of rows) {
    const asof = toMs(r.asof);
    if (!Number.isFinite(asof)) throw new BadFeatureRows(id, `row has no parseable asof (date ${r.date})`);
    if (kind === 'series') {
      const d = Date.parse(String(r.date) + 'T00:00:00Z');
      if (!Number.isFinite(d)) throw new BadFeatureRows(id, `row has no parseable date (${r.date})`);
      if (asof < d) throw new BadFeatureRows(id, `asof ${r.asof} precedes its own date ${r.date} — a value cannot be knowable before its period exists`);
      if (r.value != null && !Number.isFinite(Number(r.value))) throw new BadFeatureRows(id, `non-numeric value at ${r.date}`);
    }
  }
  return rows;
}

/**
 * hyparquet returns INT64 columns as BigInt — pyarrow writes every plain Python int that way,
 * so `hour: 10` comes back as `10n`, which fails strict equality and cannot be JSON-serialised.
 * Values inside the safe-integer range are returned as Numbers; anything larger stays BigInt
 * rather than being silently rounded.
 */
const deBig = v => (typeof v === 'bigint' && v <= Number.MAX_SAFE_INTEGER && v >= Number.MIN_SAFE_INTEGER) ? Number(v) : v;
async function readParquet(file) {
  const buf = await readFile(file);
  const rows = await parquetReadObjects({ file: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
  for (const r of rows) for (const k in r) if (typeof r[k] === 'bigint') r[k] = deBig(r[k]);
  return rows;
}

export class FeatureStore {
  /**
   * `manifest` is the loaded manifest object; `dir` is where the parquet files live.
   * Both are injectable so tests run on fixtures and never touch the real store.
   */
  constructor(manifest, dir = FEATURES_DIR) {
    this.manifest = manifest;
    this.dir = dir;
    this.byId = new Map(manifest.features.map(e => [e.id, e]));
    this._cache = new Map();
  }

  entry(id) {
    const e = this.byId.get(id);
    if (!e) throw new UnregisteredFeature(id);
    return e;
  }

  /** Rows for a feature, sorted by asof, cached. Throws if unregistered or not built. */
  async rows(id) {
    if (this._cache.has(id)) return this._cache.get(id);
    const e = this.entry(id);
    const file = path.join(this.dir, `${id}.parquet`);
    if (e.status === 'gap' || !existsSync(file)) throw new FeatureNotBuilt(id, e.status, e.note);
    const raw = await readParquet(file);
    const rows = validateRows(id, e.kind, raw).map(r => ({ ...r, _asofMs: toMs(r.asof) }));
    if (e.kind !== 'profile') rows.sort((a, b) => a._asofMs - b._asofMs || String(a.date).localeCompare(String(b.date)));
    this._cache.set(id, rows);
    return rows;
  }

  /**
   * The newest value knowable at `t`. Binary search on asof. Returns null when nothing was
   * knowable yet (before the series' first asof) — that is a legitimate answer; a study
   * then has no feature, not a stale one.
   */
  async at(id, t) {
    const e = this.entry(id);
    if (e.kind !== 'series') throw new Error(`at() is for series; "${id}" is ${e.kind} — use events() or profile()`);
    const rows = await this.rows(id);
    const tm = toMs(t);
    if (!Number.isFinite(tm)) throw new Error(`at(${id}): t "${t}" is not a time`);
    let lo = 0, hi = rows.length - 1, best = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (rows[mid]._asofMs <= tm) { best = mid; lo = mid + 1; } else hi = mid - 1; }
    if (best < 0) return null;
    // several rows can share an asof (a vintage republishes history): the one with the
    // latest DATE is the newest period known at that moment
    let k = best; while (k > 0 && rows[k - 1]._asofMs === rows[best]._asofMs) k--;
    let pick = rows[best]; for (let i = k; i <= best; i++) if (String(rows[i].date) > String(pick.date)) pick = rows[i];
    const { _asofMs, ...out } = pick;
    return out;
  }

  /**
   * The series as it was knowable at `asofBefore` (default: now), between `from` and `to`
   * by date. With `revises: true` features this is the only honest way to get a history:
   * for each date, the newest vintage published at or before `asofBefore`.
   */
  async series(id, { from = null, to = null, asofBefore = null } = {}) {
    const e = this.entry(id);
    if (e.kind !== 'series') throw new Error(`series() is for series; "${id}" is ${e.kind}`);
    const rows = await this.rows(id);
    const cut = asofBefore == null ? Infinity : toMs(asofBefore);
    const byDate = new Map();
    for (const r of rows) {
      if (r._asofMs > cut) continue;
      if (from && String(r.date) < from) continue;
      if (to && String(r.date) > to) continue;
      const prev = byDate.get(r.date);
      if (!prev || r._asofMs >= prev._asofMs) byDate.set(r.date, r);
    }
    return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))).map(({ _asofMs, ...r }) => r);
  }

  /** Event rows (surprises, calendar) in a window, by asof. */
  async events(id, { from = null, to = null } = {}) {
    const e = this.entry(id);
    if (e.kind !== 'events') throw new Error(`events() is for events; "${id}" is ${e.kind}`);
    const rows = await this.rows(id);
    const f = from ? toMs(from) : -Infinity, t = to ? toMs(to) : Infinity;
    return rows.filter(r => r._asofMs >= f && r._asofMs <= t).map(({ _asofMs, ...r }) => r);
  }

  async profile(id) {
    const e = this.entry(id);
    if (e.kind !== 'profile') throw new Error(`profile() is for profiles; "${id}" is ${e.kind}`);
    return (await this.rows(id)).map(({ _asofMs, ...r }) => r);
  }

  /** What is built, what is a gap, and how far each reaches — the manifest's own answer. */
  coverage() {
    return this.manifest.features.map(e => ({
      id: e.id, kind: e.kind, status: e.status ?? 'unbuilt', asofRule: e.asofRule,
      firstAsof: e.firstAsof ?? null, lastAsof: e.lastAsof ?? null, rows: e.rows ?? null,
      built: existsSync(path.join(this.dir, `${e.id}.parquet`)),
      note: e.note ?? null,
    }));
  }
}

/** The real store. */
export async function openStore() {
  return new FeatureStore(await loadManifest(), FEATURES_DIR);
}
