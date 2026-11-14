// js/deskSnapshotStore.js: the Desk Terminal "time machine", capture and storage half (js/deskSnapshot.js is the pure half). Every outside dependency is
// injected, so js/deskSnapshotStore.test.mjs runs it with in-memory fakes and no network. server.js builds one with the real KV, R2 and loopback fetch.
//
// WHERE THINGS LIVE, AND WHY BOTH
//   KV (Cloudflare) holds the ROLLING window the owner asked for: CORE points packed into one gzipped chunk per UTC hour (desk_snap_core_<YYYY-MM-DDTHH>), 16 days
//   long (the key's own expiration, so nothing has to prune it), and each day's FULL snapshot (desk_snap_full_<London date>, 20 days). KV is quick to read, but it is
//   the wrong place for permanence: it expires, and Cloudflare's free plan allows about 1,000 writes a day, so a point is not written on its own: points are kept in
//   memory and each hour's chunk is rewritten about every 20 minutes (a few dozen writes a day in all).
//   R2 is the permanent record. Each completed UTC day's CORE points are copied once to archive/desk_core/<year>/<date>.json, and each FULL snapshot to
//   archive/desk_full/<year>/<date>.json, through the existing append-only archive (js/dataArchive.js). Nothing deletes there, so the history keeps growing after
//   KV forgets it. Reads use R2 for completed days (one read a day) and KV for today.
//
// NEVER BLIND-WRITE. An hour chunk is read (getStrict: a backend failure throws, it does not read as empty) and merged before it is rewritten, so a restart or a failed
// read can never replace an hour's points with a fraction of them. A write that does not read back is reported, not trusted: kv.put falls back to a local file when
// Cloudflare fails, and that file dies with the next deploy.
import zlib from 'node:zlib';
import { CORE_FEEDS, MAX_POINT_BYTES, CHUNK_PREFIX, FULL_PREFIX, FULL_FEEDS, chunkKey, fullKey, utcDate, captureIntervalMs, dueFeeds, extractFeed, buildCorePoint, trimPoint,
  mergeByTs, downsample, selectFields, chooseStep, buildFullSnapshot } from './deskSnapshot.js';
import { londonDate } from './deskPack.js';

export const CORE_TTL_S = 16 * 86400, FULL_TTL_S = 20 * 86400;
export const FLUSH_EVERY_MS = 20 * 60_000;
export const MAX_CHUNK_B64 = 900_000;          // a chunk is twelve 5-minute points, about 60-100 KB; this is a runaway guard, not an expectation
const MAX_RANGE_MS = 31 * 86400_000;

export const packJSON = obj => zlib.gzipSync(Buffer.from(JSON.stringify(obj)), { level: 9 }).toString('base64');
export const unpackJSON = s => JSON.parse(zlib.gunzipSync(Buffer.from(String(s), 'base64')).toString('utf8'));

async function pool(items, size, fn) {
  const out = new Map(); let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (i < items.length) { const it = items[i++]; out.set(it.id ?? it, await fn(it)); } }));
  return out;
}
const londonMinutes = ms => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).map(x => [x.type, x.value])); return +p.hour * 60 + +p.minute; };

/**
 * deps: { kvGet, kvGetStrict, kvPut(key, value, { expirationTtl }), kvKeys(prefix), archive (js/dataArchive.js instance), r2Get(key), fetchFeed(path, { timeoutMs }) -> { json, httpStatus, error, timedOut, ms },
 *         deskRunDate() -> 'YYYY-MM-DD'|null, now(), log, coreFeedTimeoutMs, fullFeedTimeoutMs, concurrency }
 */
export function createSnapshotService(deps) {
  const { kvGet, kvGetStrict, kvPut, kvKeys, archive, r2Get, fetchFeed, deskRunDate = () => null, now = () => Date.now(), log = console } = deps;
  const conc = deps.concurrency ?? 4;
  const last = {};                    // feed id -> { at, section }: the last good section of each feed (carried between its refreshes)
  const buf = new Map();              // chunk key -> { points, dirty, loaded }
  const dayCache = new Map();         // utc date -> { at, pts, src }
  const st = { bootedAt: now(), lastCaptureAt: null, lastCaptureOkAt: null, lastCaptureMs: null, lastLiveOk: null, lastLiveDue: null, lastGaps: [], consecutiveFailures: 0, lastError: null, captures: 0,
    lastFlushAt: null, lastFlushOkAt: null, flushError: null, lastFullAt: null, lastFullLd: null, lastFullOkN: null, lastFullGaps: [], fullError: null, lastArchiveAt: null, lastArchiveOkAt: null, archiveEnabled: null, archived: [], archiveError: null,
    lastPointBytes: null, lastTrimmed: [] };
  let capturing = null, fullRunning = null, flushing = null, rolling = null, lastRollAt = 0, fullChecked = null;

  // ── CORE capture ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  function append(point) {
    const key = chunkKey(point.ts), b = buf.get(key) ?? { points: [], dirty: false, loaded: false };
    b.points = mergeByTs(b.points, [point]); b.dirty = true; buf.set(key, b);
    dayCache.delete(utcDate(point.ts));
    // KV down for days must not grow memory without limit: past 2,000 unwritten points (about 7 days at 5 minutes) the oldest hour is let go, and said so
    let total = 0; for (const x of buf.values()) total += x.points.length;
    if (total > 2000) { const oldest = [...buf.keys()].sort()[0]; if (oldest !== key) { buf.delete(oldest); log.error?.(`[desk-snapshot] ${total} points waiting for KV: dropped the oldest hour (${oldest}) from memory`); } }
  }

  /** One CORE capture, single-flight. Returns { ok, point, bytes, gaps, trimmed }. A point is ALWAYS recorded, even when most feeds failed: the hole is the record. */
  function captureCore() {
    if (capturing) return capturing;
    capturing = (async () => {
      const t0 = now(); st.lastCaptureAt = t0;
      try {
        const due = dueFeeds(last, t0);
        const fetched = await pool(due, conc, async spec => extractFeed(spec, await fetchFeed(spec.path, { timeoutMs: spec.timeoutMs ?? deps.coreFeedTimeoutMs ?? 50_000 })));
        const entries = CORE_FEEDS.map(spec => {
          const f = fetched.get(spec.id);
          if (f?.ok) { last[spec.id] = { at: t0, section: f }; return f; }
          const prev = last[spec.id]?.section;
          if (!f) return prev ? { ...prev, src: 'carried' } : { id: spec.id, ok: false, why: 'not fetched yet' };
          return prev ? { ...prev, src: 'carried', failed: f.why } : f;          // a failed refresh: the older section stays, marked, with the failure beside it
        });
        const liveOk = [...fetched.values()].filter(x => x?.ok).length;
        const { point, trimmed, bytes } = trimPoint(buildCorePoint({ now: t0, entries }), MAX_POINT_BYTES);
        append(point);
        st.lastCaptureMs = now() - t0; st.lastPointBytes = bytes; st.lastTrimmed = trimmed; st.lastGaps = point.gaps; st.captures++;
        st.lastLiveOk = liveOk; st.lastLiveDue = due.length;
        if (trimmed.length) log.warn?.(`[desk-snapshot] point was ${bytes} bytes over the ${MAX_POINT_BYTES} budget before trimming; dropped ${trimmed.join(', ')}`);
        const ok = due.length === 0 || liveOk >= Math.ceil(due.length / 2);
        if (ok) { st.lastCaptureOkAt = t0; st.consecutiveFailures = 0; st.lastError = null; }
        else { st.consecutiveFailures++; st.lastError = `only ${liveOk} of ${due.length} feeds answered`; log.warn?.(`[desk-snapshot] ${st.lastError}`); }
        return { ok, point, bytes, gaps: point.gaps, trimmed };
      } catch (e) {
        st.consecutiveFailures++; st.lastError = e?.message ?? String(e); log.error?.(`[desk-snapshot] capture failed: ${st.lastError}`);
        return { ok: false, error: st.lastError };
      } finally { capturing = null; }
    })();
    return capturing;
  }

  // ── KV chunks ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const readChunk = async (key, strict) => { const raw = await (strict ? kvGetStrict : kvGet)(key); return raw ? unpackJSON(raw).points ?? [] : []; };

  /** Write every dirty hour chunk: read what is stored, merge, write, read back. Never overwrites what it could not read. */
  function flush() {
    if (flushing) return flushing;
    flushing = (async () => {
      st.lastFlushAt = now(); let wrote = 0; st.flushError = null;
      for (const [key, b] of buf) {
        if (!b.dirty) continue;
        try {
          if (!b.loaded) { b.points = mergeByTs(await readChunk(key, true), b.points); b.loaded = true; }
          let pts = b.points, val = packJSON({ v: 1, hour: key.slice(CHUNK_PREFIX.length), points: pts });
          if (val.length > MAX_CHUNK_B64) { pts = pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1); val = packJSON({ v: 1, hour: key.slice(CHUNK_PREFIX.length), points: pts, thinned: true }); log.warn?.(`[desk-snapshot] chunk ${key} over ${MAX_CHUNK_B64} bytes: thinned to ${pts.length} points`); }
          await kvPut(key, val, { expirationTtl: CORE_TTL_S });
          const back = await kvGetStrict(key);
          if (back !== val) throw new Error('written but did not read back (Cloudflare KV may be failing and the write fell to the local file)');
          b.dirty = false; wrote++; st.lastFlushOkAt = now();
        } catch (e) { st.flushError = `${key}: ${e?.message ?? e}`; log.warn?.(`[desk-snapshot] flush ${st.flushError}`); }
      }
      const hourNow = chunkKey(now());
      for (const [key, b] of buf) if (!b.dirty && key < hourNow && b.loaded) buf.delete(key);    // an old hour that is safely written no longer needs to sit in memory
      return { wrote, error: st.flushError };
    })().finally(() => { flushing = null; });
    return flushing;
  }
  const dirtyCount = () => [...buf.values()].filter(b => b.dirty).length;
  const pendingPoints = () => [...buf.values()].filter(b => b.dirty).reduce((n, b) => n + b.points.length, 0);

  // ── the day's points: from R2 once the day is archived, KV hours otherwise, plus anything still in memory ──────────────────────
  async function kvDay(date) {
    const hours = Array.from({ length: 24 }, (_, h) => `${CHUNK_PREFIX}${date}T${String(h).padStart(2, '0')}`);
    const got = await pool(hours, 6, async key => { try { return await readChunk(key, false); } catch { return []; } });
    return hours.flatMap(k => got.get(k) ?? []);
  }
  async function loadDay(date) {
    const c = dayCache.get(date), today = utcDate(now());
    if (c && now() - c.at < (date >= today ? 30_000 : 600_000)) return c;
    let pts = [], src = [];
    if (date < today && r2Get) {
      try { const o = await r2Get(`archive/desk_core/${date.slice(0, 4)}/${date}.json`); if (o?.payload?.points?.length) { pts = o.payload.points; src.push('r2'); } } catch { /* fall to KV */ }
    }
    if (!pts.length) { pts = await kvDay(date); if (pts.length) src.push('kv'); }
    const mem = [...buf].filter(([k]) => k.startsWith(`${CHUNK_PREFIX}${date}`)).flatMap(([, b]) => b.points);
    if (mem.length) { pts = mergeByTs(pts, mem); src.push('memory'); }
    const rec = { at: now(), pts, src };
    // only today and yesterday are kept (a day of points is about 3 MB as objects); an older day is read, used and let go
    if (date >= utcDate(now() - 86400_000)) { dayCache.set(date, rec); if (dayCache.size > 3) dayCache.delete(dayCache.keys().next().value); }
    return rec;
  }

  /** Copy every completed UTC day (up to the KV window) that R2 does not have yet. Idempotent; run as often as you like. */
  function rollArchive() {
    if (rolling) return rolling;
    rolling = (async () => {
      lastRollAt = now(); st.lastArchiveAt = lastRollAt; st.archiveEnabled = !!archive?.enabled;
      if (!archive?.enabled) return { skipped: 'R2 not configured' };
      try {
        await flush();                                         // the last hour of yesterday must be in KV before it is read back
        const dates = Array.from({ length: 14 }, (_, i) => utcDate(now() - (i + 1) * 86400_000));
        const done = await archive.backfill('desk_core', dates, async d => { const pts = await kvDay(d); return pts.length ? { v: 1, date: d, n: pts.length, points: pts } : null; });
        if (done.length) { st.archived = [...done, ...st.archived].slice(0, 30); log.log?.(`[desk-snapshot] archived CORE days to R2: ${done.join(', ')}`); }
        st.archiveError = null; st.lastArchiveOkAt = now(); return { archived: done };
      } catch (e) { st.archiveError = e?.message ?? String(e); log.warn?.(`[desk-snapshot] archive roll failed: ${st.archiveError}`); return { error: st.archiveError }; }
    })().finally(() => { rolling = null; });
    return rolling;
  }

  // ── FULL ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  function captureFull() {
    if (fullRunning) return fullRunning;
    fullRunning = (async () => {
      const t0 = now(), ld = londonDate(t0);
      try {
        const got = await pool(FULL_FEEDS.map(path => ({ id: path, path })), conc, async f => ({ path: f.path, ...(await fetchFeed(f.path, { timeoutMs: deps.fullFeedTimeoutMs ?? 60_000 })) }));
        const snap = buildFullSnapshot({ now: t0, entries: FULL_FEEDS.map(p => got.get(p)), deskRunDate: deskRunDate() });
        const val = packJSON(snap);
        await kvPut(fullKey(ld), val, { expirationTtl: FULL_TTL_S });
        if ((await kvGetStrict(fullKey(ld))) !== val) throw new Error('FULL written but did not read back');
        let archived = null;
        if (archive?.enabled) archived = await archive.snapshot('desk_full', ld, snap);
        st.lastFullAt = t0; st.lastFullLd = ld; st.lastFullOkN = snap.okN; st.lastFullGaps = snap.gaps.map(g => g.path); st.fullError = null;
        log.log?.(`[desk-snapshot] FULL ${ld}: ${snap.okN}/${snap.n} feeds, ${Math.round(val.length / 1024)} KB gz${archived?.wrote ? ', archived to R2' : ''}`);
        return { ok: true, ld, okN: snap.okN, n: snap.n, bytesGz: val.length, gaps: snap.gaps };
      } catch (e) { st.fullError = e?.message ?? String(e); log.warn?.(`[desk-snapshot] FULL failed: ${st.fullError}`); return { ok: false, error: st.fullError }; }
      finally { fullRunning = null; }
    })();
    return fullRunning;
  }
  /** FULL is due once a London day, from 10:00 London (the desk run, when it runs, has finished by then). On the first look after a restart it asks KV whether today's exists. */
  async function fullDue() {
    const t = now(), ld = londonDate(t);
    if (st.lastFullLd === ld || londonMinutes(t) < 10 * 60) return false;
    if (fullChecked !== ld) { fullChecked = ld; try { if ((await kvKeys(fullKey(ld))).length) { st.lastFullLd = ld; return false; } } catch { /* assume not yet taken */ } }
    return !fullRunning;
  }

  // ── the schedule ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  /** Called every 5 minutes (and once shortly after boot). Each step is independent; one failing never stops the others. */
  async function tick({ boot = false } = {}) {
    const t = now();
    if (boot || !st.lastCaptureAt || t - st.lastCaptureAt >= captureIntervalMs(t) - 20_000) await captureCore();
    const hourNow = chunkKey(t);
    if (dirtyCount() && (!st.lastFlushAt || t - st.lastFlushAt >= FLUSH_EVERY_MS - 20_000 || [...buf].some(([k, b]) => b.dirty && k < hourNow))) await flush().catch(() => {});
    if (await fullDue().catch(() => false)) await captureFull().catch(() => {});
    if (t - lastRollAt >= 3600_000) await rollArchive().catch(() => {});
  }

  // ── reads ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  /** CORE points in [from, to]: { ok, from, to, stepMin, n, fields, sources, points }. fields: section ids (empty = all); stepMin widens to hold at most `max` points. */
  async function readCore({ from, to, fields = [], stepMin = 0, max = 800, maxBytes = 6_000_000 } = {}) {
    const t1 = Number.isFinite(+to) && +to > 0 ? +to : now();
    const t0 = Number.isFinite(+from) && +from > 0 ? +from : t1 - 86400_000;
    if (t0 >= t1) return { ok: false, error: 'from must be before to' };
    if (t1 - t0 > MAX_RANGE_MS) return { ok: false, error: 'at most 31 days at a time' };
    const dates = []; for (let d = utcDate(t0); d <= utcDate(t1); d = utcDate(Date.parse(`${d}T12:00:00Z`) + 86400_000)) dates.push(d);
    // each day is reduced as soon as it is read (window, step, fields) so a 31-day request never holds 31 days of full points
    const step0 = chooseStep(t1 - t0, stepMin, max), sources = {}; let pts = [];
    for (let i = 0; i < dates.length; i += 3) {
      const batch = dates.slice(i, i + 3), days = await Promise.all(batch.map(d => loadDay(d)));
      batch.forEach((d, k) => {
        sources[d] = days[k]?.src?.join('+') || 'none';
        let p = (days[k]?.pts ?? []).filter(x => x.ts >= t0 && x.ts <= t1); p = downsample(p, step0);
        pts = pts.concat(fields.length ? p.map(x => selectFields(x, fields)) : p);
      });
    }
    pts = mergeByTs([], pts);
    let step = step0;
    let out = downsample(pts, step);
    // a response stays under maxBytes: if the chosen window and fields are still too big, the step is doubled until they fit (and `widened` says so)
    let widened = false;
    const bytes = a => a.reduce((n, p) => n + JSON.stringify(p).length, 0);
    for (let guard = 0; bytes(out) > maxBytes && out.length > 2 && guard < 8; guard++) {
      step = Math.max(step * 2, 2 * 5 * 60_000); widened = true;
      out = downsample(pts, step);
    }
    return { ok: true, from: t0, to: t1, stepMin: step / 60_000, n: out.length, fields, sources, ...(widened ? { widened: true, note: `the window was thinned to stay under ${Math.round(maxBytes / 1e6)} MB: ask for fewer fields or a shorter window for finer steps` } : {}), points: out };
  }
  /** One day's FULL snapshot (London date), optionally only some feeds. KV first (20 days), then R2. */
  async function readFull(date, feeds = []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ''))) return { ok: false, error: 'date=YYYY-MM-DD (London date)' };
    let snap = null, source = null;
    try { const raw = await kvGet(fullKey(date)); if (raw) { snap = unpackJSON(raw); source = 'kv'; } } catch { snap = null; }
    if (!snap && r2Get) { try { const o = await r2Get(`archive/desk_full/${date.slice(0, 4)}/${date}.json`); if (o?.payload) { snap = o.payload; source = 'r2'; } } catch { snap = null; } }
    if (!snap) return { ok: false, error: `no FULL snapshot saved for ${date}` };
    if (feeds.length) snap = { ...snap, feeds: Object.fromEntries(Object.entries(snap.feeds ?? {}).filter(([k]) => feeds.includes(k))) };
    return { ok: true, source, snapshot: snap };
  }
  /** Which days exist: CORE (KV hour keys and archived R2 days) and FULL. */
  async function index() {
    const [coreKeys, fullKeys, coreR2, fullR2] = await Promise.all([kvKeys(CHUNK_PREFIX).catch(() => []), kvKeys(FULL_PREFIX).catch(() => []),
      archive?.enabled ? archive.archivedDates('desk_core').catch(() => new Set()) : new Set(), archive?.enabled ? archive.archivedDates('desk_full').catch(() => new Set()) : new Set()]);
    const core = new Set([...coreKeys.map(k => k.slice(CHUNK_PREFIX.length, CHUNK_PREFIX.length + 10)), ...coreR2, ...[...buf.keys()].map(k => k.slice(CHUNK_PREFIX.length, CHUNK_PREFIX.length + 10))]);
    const full = new Set([...fullKeys.map(k => k.slice(FULL_PREFIX.length)), ...fullR2]);
    return { ok: true, coreDays: [...core].sort(), fullDays: [...full].sort() };
  }
  function status() {
    return { ok: true, ...st, pendingPoints: pendingPoints(), dirtyChunks: dirtyCount(), inMemoryChunks: buf.size, capturing: !!capturing, fullRunning: !!fullRunning, open: captureIntervalMs(now()) === 5 * 60_000,
      cadenceMin: captureIntervalMs(now()) / 60_000, feeds: CORE_FEEDS.length };
  }

  return { tick, captureCore, captureFull, flush, rollArchive, readCore, readFull, index, status, _buf: buf, _last: last };
}
