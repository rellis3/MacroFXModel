/**
 * Theory Lab progress sync — the server half.
 *
 * The education login is ONE shared password, so there is no per-user identity to
 * hang progress on. Instead a reader asks for a random sync code on one device and
 * types it on another; the code IS the only handle (and the only secret) for a small
 * blob of { progress, path, checks } — the same three localStorage keys the Theory Lab
 * already keeps (theoryLabProgress / theoryLabPath / theoryLabPathChecks).
 *
 * Nothing here is personal: lesson slugs, read percentages, timestamps, a path id and
 * capstone ticks. The validator below is the only thing standing between a public-ish
 * route and the KV store, so it is deliberately strict: known fields only, bounded
 * sizes, numbers clamped, anything else rejected.
 *
 * mergeSyncPayload() is the same merge theory-lab/assets/sync.js does in the browser
 * (js/progressSync.test.mjs checks the two agree), used on PUT so two devices pushing
 * in the same minute cannot clobber each other.
 */
import { randomInt } from 'crypto';

// 31 symbols: no 0/O, 1/I/L — a code read off a phone screen survives being typed.
export const SYNC_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const SYNC_CODE_LEN = 10;              // 31^10 ≈ 8.2e14 — not enumerable at any sane request rate
export const SYNC_MAX_BYTES = 64 * 1024;
export const SYNC_KV_PREFIX = 'tl_sync_';     // routed to durable CF KV in kv.js isCfKey()
const MAX_LESSONS = 1000, MAX_PATHS = 20, MAX_STEPS = 50;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;
const PATH_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const TS_MIN = Date.UTC(2020, 0, 1);

export function newSyncCode() {
  let s = '';
  for (let i = 0; i < SYNC_CODE_LEN; i++) s += SYNC_ALPHABET[randomInt(SYNC_ALPHABET.length)];
  return s;
}

/** Accepts "abcde-fghjk", " ABCDE FGHJK " etc.; returns the canonical code or null. */
export function normalizeSyncCode(raw) {
  if (typeof raw !== 'string' || raw.length > 40) return null;
  const c = raw.toUpperCase().replace(/[\s-]/g, '');
  if (c.length !== SYNC_CODE_LEN) return null;
  for (const ch of c) if (!SYNC_ALPHABET.includes(ch)) return null;
  return c;
}

const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function num(v, lo, hi, round) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  const c = clamp(n, lo, hi);
  return round ? Math.round(c) : c;
}
function ts(v) {
  const n = Number(v);
  if (v == null || !Number.isFinite(n)) return null;
  const now = Date.now() + 86_400_000;   // a day of clock skew
  return n >= TS_MIN && n <= now ? Math.round(n) : null;
}
function cleanLesson(r) {
  return {
    percent: num(r.percent, 0, 100, true),
    scrollPct: num(r.scrollPct, 0, 1, false),
    activeSec: num(r.activeSec, 0, 864_000, true),   // 10 days of reading is plenty
    firstVisit: ts(r.firstVisit),
    completedAt: ts(r.completedAt),
    updatedAt: ts(r.updatedAt),
  };
}

/**
 * Validate + sanitize a sync body. Returns { ok: true, value } or { ok: false, error }.
 * Top-level fields other than progress/path/checks are an error (not silently dropped);
 * unknown fields INSIDE a lesson record are dropped, so a future progress.js field
 * doesn't break sync for everyone still on the old server.
 */
export function validateSyncBody(body) {
  if (!isPlain(body)) return { ok: false, error: 'body must be a JSON object' };
  for (const k of Object.keys(body)) if (!['progress', 'path', 'checks'].includes(k)) return { ok: false, error: `unknown field: ${k.slice(0, 40)}` };

  const progress = {};
  if (body.progress != null) {
    if (!isPlain(body.progress)) return { ok: false, error: 'progress must be an object' };
    const keys = Object.keys(body.progress);
    if (keys.length > MAX_LESSONS) return { ok: false, error: 'too many lessons' };
    for (const slug of keys) {
      if (!SLUG_RE.test(slug)) return { ok: false, error: 'bad lesson slug' };
      const r = body.progress[slug];
      if (!isPlain(r)) return { ok: false, error: 'lesson record must be an object' };
      progress[slug] = cleanLesson(r);
    }
  }

  let path = null;
  if (body.path != null && body.path !== '') {
    if (typeof body.path !== 'string' || !PATH_RE.test(body.path)) return { ok: false, error: 'bad path' };
    path = body.path;
  }

  const checks = {};
  if (body.checks != null) {
    if (!isPlain(body.checks)) return { ok: false, error: 'checks must be an object' };
    const ids = Object.keys(body.checks);
    if (ids.length > MAX_PATHS) return { ok: false, error: 'too many paths in checks' };
    for (const id of ids) {
      if (!PATH_RE.test(id)) return { ok: false, error: 'bad path id in checks' };
      const steps = body.checks[id];
      if (!isPlain(steps)) return { ok: false, error: 'checks entry must be an object' };
      const out = {};
      for (const i of Object.keys(steps)) {
        if (!/^\d{1,2}$/.test(i) || Number(i) >= MAX_STEPS) return { ok: false, error: 'bad step index' };
        if (typeof steps[i] !== 'boolean') return { ok: false, error: 'step tick must be boolean' };
        if (steps[i]) out[i] = true;   // union semantics: only ticks carry information
      }
      if (Object.keys(out).length) checks[id] = out;
    }
  }

  const value = { progress, path, checks };
  if (Buffer.byteLength(JSON.stringify(value)) > SYNC_MAX_BYTES) return { ok: false, error: 'payload too large' };
  return { ok: true, value };
}

// ── Merge (keep in step with theory-lab/assets/sync.js merge) ───────────────────
function minTs(a, b) { return a && b ? Math.min(a, b) : (a || b || null); }
function maxTs(a, b) { return a && b ? Math.max(a, b) : (a || b || null); }
function mergeLesson(a, b) {
  if (!a) return { ...b };
  if (!b) return { ...a };
  return {
    percent: Math.max(+a.percent || 0, +b.percent || 0),
    scrollPct: Math.max(+a.scrollPct || 0, +b.scrollPct || 0),
    activeSec: Math.max(+a.activeSec || 0, +b.activeSec || 0),
    firstVisit: minTs(a.firstVisit, b.firstVisit),
    completedAt: minTs(a.completedAt, b.completedAt),   // first completion wins, never cleared
    updatedAt: maxTs(a.updatedAt, b.updatedAt),
  };
}
/** local wins the path when it has one; progress is a per-lesson high-water mark; ticks are a union. */
export function mergeSyncPayload(local, remote) {
  local = local || {}; remote = remote || {};
  const lp = isPlain(local.progress) ? local.progress : {}, rp = isPlain(remote.progress) ? remote.progress : {};
  const progress = {};
  for (const slug of new Set([...Object.keys(lp), ...Object.keys(rp)])) progress[slug] = mergeLesson(lp[slug], rp[slug]);
  const lc = isPlain(local.checks) ? local.checks : {}, rc = isPlain(remote.checks) ? remote.checks : {};
  const checks = {};
  for (const id of new Set([...Object.keys(lc), ...Object.keys(rc)])) {
    const o = {};
    for (const src of [lc[id], rc[id]]) if (isPlain(src)) for (const i of Object.keys(src)) if (src[i]) o[i] = true;
    checks[id] = o;
  }
  return { progress, path: local.path || remote.path || null, checks };
}

/** Key-order-independent fingerprint, so "did this PUT change anything?" skips no-op writes. */
export function syncFingerprint(v) {
  const sortObj = o => (isPlain(o) ? Object.fromEntries(Object.keys(o).sort().map(k => [k, sortObj(o[k])])) : o);
  return JSON.stringify(sortObj(v));
}
