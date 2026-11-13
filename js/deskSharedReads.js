// js/deskSharedReads.js - ONE SHARED READ PER DAY for every fixed, keyed AI read on the Desk Terminal (owner 2026-11-13).
//
// The rule: the first desk user to press a read's button generates it; it is stored for EVERYONE for the rest of the
// Europe/London day; the button then disappears for everyone, replaced by a "Shared read · synced today HH:MM UK" label.
// Only the OWNER (the main-login session) keeps a Refresh button, which regenerates and REPLACES the shared copy.
// Free-form / per-question / explain routes are not shared reads: they are OWNER-ONLY (OWNER_ONLY_POSTS below), so
// nobody else can run up the model bill.
//
// Pure: no fs, no network, no clock read except through the `now` argument. Used by server.js (the decisions, the
// store shape, the single-flight lock, the daily cap) and by js/terminal/sharedRead.js (the three button states).
// Tested by js/deskSharedReads.test.mjs.
import { _londonParts } from './londonSession.js';

/** The shared store's KV key. One new key, listed in kv.js, _worker.js (both lists) and js/storeRegistry.js. */
export const SHARED_KV = 'desk_shared_reads_v1';

/** Kinds of fixed, keyed reads, with the key each is keyed by and the daily runaway guard on model calls. */
export const SHARED_KINDS = {
  asset: { label: 'Market deep read', keyedBy: 'market', cap: 100 },   // POST /api/desk-asset-analyse (the cap it already had)
  chain: { label: 'Chain read', keyedBy: 'window', cap: 40 },          // POST /api/chain-read, stored in chain_read_v1 (byWin)
};

/** The windows a chain read is keyed by. 'live' is an intraday snapshot, so it is owner-generated only (see decideRead). */
export const CHAIN_WINDOWS = [1, 5, 20, 'live'];

/** POST paths a VIEWER (desk login) may call: the shared keyed reads only. Merge point for the desk-zone viewerMayCall list. */
export const VIEWER_SHARED_POSTS = ['/api/desk-asset-analyse', '/api/chain-read'];

/** POST paths that spend money on a free-form / per-question / explain model call: 403 to anyone but the owner. */
export const OWNER_ONLY_POSTS = [
  '/api/desk-ask',            // "Ask the desk" (and the floating Ask-the-bot pill): one free-text question per call
  '/api/explain',             // "Explain this": one item per call
  '/api/oi-explain',
  '/api/currency-analysis',
  '/api/analysis',
  '/api/analysis-historical',
  '/api/morning-brief',       // the brief is manual by design; a viewer never writes it
  '/api/research-pod/thread', // a free-text research turn
];

/** The Europe/London calendar day of a timestamp (ms or ISO string): 'YYYY-MM-DD'. Never a seasonal UTC hour. */
export function dayKey(t) {
  const ms = typeof t === 'number' ? t : Date.parse(t);
  return Number.isFinite(ms) ? _londonParts(new Date(ms)).date : null;
}

const yesterdayOf = today => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };

/** An empty store for a day: reads by kind then key, and the day's model-call counters by kind. */
export function emptyStore(today) { return { day: today, reads: {}, counts: {}, prev: {} }; }

/**
 * Roll a stored document to `today`. Today's reads and counters stay; when the day changes the old reads move to `prev`
 * (yesterday only, kept so an old read stays visible, dated) and the counters reset. Anything older than yesterday goes.
 * Never mutates its argument.
 */
export function rollStore(store, today) {
  if (!store || typeof store !== 'object' || !store.day) return emptyStore(today);
  if (store.day === today) return { day: today, reads: store.reads ?? {}, counts: store.counts ?? {}, prev: store.prev ?? {} };
  const keep = store.day === yesterdayOf(today) ? (store.reads ?? {}) : {};
  return { day: today, reads: {}, counts: {}, prev: keep };
}

/** Today's read for (kind, key), else null. The store must already be rolled to `today`. */
export function readToday(store, kind, key) { return store?.reads?.[kind]?.[String(key)] ?? null; }
/** The most recent read for (kind, key): today's, else yesterday's (dated), else null. */
export function readLatest(store, kind, key) { return readToday(store, kind, key) ?? store?.prev?.[kind]?.[String(key)] ?? null; }

/** Put a read (immutably). `by` is 'owner' or 'viewer'. */
export function putRead(store, kind, key, read, { by = 'viewer', at = new Date().toISOString() } = {}) {
  const reads = { ...(store.reads ?? {}) };
  reads[kind] = { ...(reads[kind] ?? {}), [String(key)]: { read, generatedAt: at, generatedBy: by } };
  return { ...store, reads };
}

/** Count one model call against today's guard (immutably). */
export function countCall(store, kind) { return { ...store, counts: { ...(store.counts ?? {}), [kind]: (store.counts?.[kind] ?? 0) + 1 } }; }
export const callsToday = (store, kind) => store?.counts?.[kind] ?? 0;

/**
 * The decision for one request. Inputs:
 *   isOwner       the caller holds the main-login (owner) session
 *   force         the caller asked to regenerate
 *   hasToday      a read for this (kind, key) already exists for today
 *   inflight      another request is already generating this (kind, key)
 *   calls, cap    model calls made today for this kind, and the guard
 *   liveSnapshot  the key is an intraday snapshot (chain 'live'): only the owner may generate it
 * Returns { action, why }:
 *   'serve'    return the stored read (a viewer, or an owner without force) - never calls the model
 *   'join'     a generation is already running: wait for it and return its result - no second call
 *   'generate' make the model call
 *   'forbid'   a viewer may not generate this (403)
 *   'cap'      today's guard is spent (429)
 */
export function decideRead({ isOwner = false, force = false, hasToday = false, inflight = false, calls = 0, cap = Infinity, liveSnapshot = false } = {}) {
  const regenerate = isOwner && force;
  if (hasToday && !regenerate) return { action: 'serve', why: 'a shared read already exists today' };
  if (inflight) return { action: 'join', why: 'one generation is already running for this read' };
  if (liveSnapshot && !isOwner) return { action: 'forbid', why: 'a live snapshot is generated by the owner only' };
  if (calls >= cap) return { action: 'cap', why: `the daily limit of ${cap} reads is reached` };
  return { action: 'generate', why: regenerate ? 'owner refresh replaces the shared copy' : 'first read today' };
}

/**
 * Single flight: run(key, fn) starts fn once per key at a time; a second caller with the same key gets the SAME promise,
 * so two people pressing at once cost one model call. Assumes ONE server instance (an in-memory Map): if Railway ever runs
 * two, a race can make two calls (still bounded by the daily cap) and the later write wins.
 */
export function createSingleFlight() {
  const m = new Map();
  return {
    has: key => m.has(key),
    keys: () => [...m.keys()],
    run(key, fn) {
      if (m.has(key)) return m.get(key);
      const p = (async () => { try { return await fn(); } finally { m.delete(key); } })();
      m.set(key, p);
      return p;
    },
  };
}

/** Normalise a market id the way /api/desk-asset-analyse does. */
export const normInst = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/** Normalise a chain window key: 1, 5, 20 or 'live' (anything else is 20, as the route does). */
export function normWindow(w) { if (w === 'live') return 'live'; const n = Number(w); return [1, 5, 20].includes(n) ? n : 20; }

/** The label under a shared read: "Shared read · synced today 09:42 UK" (or the dated old read). */
export function syncLabel(generatedAt, today, { owner = false } = {}) {
  const ms = Date.parse(generatedAt ?? ''); if (!Number.isFinite(ms)) return '';
  const d = dayKey(ms), parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).formatToParts(new Date(ms));
  const g = t => parts.find(p => p.type === t)?.value ?? '';
  const hm = `${g('hour')}:${g('minute')}`;
  return d === today ? `Shared read · synced today ${hm} UK` : `Older read · ${g('day')} ${g('month')} ${hm} UK`;
}

/**
 * What the page shows for one read. Inputs: the read (or null) with generatedAt, today (London), whether another
 * user's generation is running, and the caller's role. Returns { state, showGenerate, showRefresh, label, stale }.
 *   state 'none'        no read at all
 *   state 'old'         the newest read is from a previous day: dated, kept visible, the button is back
 *   state 'ready'       today's read exists: no button for a viewer; the owner sees Refresh
 *   state 'generating'  a generation is running for everyone who opens the page meanwhile (poll ~5 s)
 */
export function viewState({ read = null, generatedAt = null, today, inflight = false, isOwner = false, liveSnapshot = false } = {}) {
  const has = !!read, fresh = has && dayKey(generatedAt) === today;
  const canGenerate = !liveSnapshot || isOwner;
  if (inflight) return { state: 'generating', showGenerate: false, showRefresh: false, label: 'Another user is writing this read now', stale: has && !fresh };
  if (fresh) return { state: 'ready', showGenerate: false, showRefresh: isOwner, label: syncLabel(generatedAt, today), stale: false };
  if (has) return { state: 'old', showGenerate: canGenerate, showRefresh: false, label: syncLabel(generatedAt, today), stale: true };
  return { state: 'none', showGenerate: canGenerate, showRefresh: false, label: '', stale: false };
}
