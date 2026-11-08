// Paper Library read progress. Logic copied from the Theory Lab (theory-lab/assets/progress.js and sync.js; those
// files are in the education login zone and are NOT loaded here). Same record shape and semantics:
//   libraryProgress[paperId] = { scrollPct 0..1, activeSec, percent 0..100, firstVisit, completedAt, updatedAt, pos }
//   percent is a high-water mark = max(scroll depth, active reading time / estimated read time); never drops.
// Deviations from the Theory Lab: the key is libraryProgress (per paper id), `pos` (reader block index, for resume)
// is added to the record, and the transport is POST /api/library/progress (login = identity, so no sync code):
// the same "push when the tab is hidden, at most once a minute, only if changed, merge what the server returns"
// behaviour as sync.js. The server may reply { ok, progress:{...record fields...} }; it is merged in, never replaces.
export const STORAGE_KEY = 'libraryProgress';
export const MIN_GAP = 60 * 1000;

// ── Pure merge (same rules as TLSync.merge's per-lesson step, plus pos) ─────────────────────────────────
function isPlain(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
const minTs = (a, b) => (a && b ? Math.min(a, b) : (a || b || null));
const maxTs = (a, b) => (a && b ? Math.max(a, b) : (a || b || null));

export function mergeRecord(a, b) {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  const newer = (+b.updatedAt || 0) >= (+a.updatedAt || 0) ? b : a;
  return {
    percent: Math.max(+a.percent || 0, +b.percent || 0),
    scrollPct: Math.max(+a.scrollPct || 0, +b.scrollPct || 0),
    activeSec: Math.max(+a.activeSec || 0, +b.activeSec || 0),
    firstVisit: minTs(a.firstVisit, b.firstVisit),
    completedAt: minTs(a.completedAt, b.completedAt),
    updatedAt: maxTs(a.updatedAt, b.updatedAt),
    pos: Math.max(0, +newer.pos || 0),
  };
}
/** merge two maps { paperId: record } */
export function mergeStores(local, remote) {
  const l = isPlain(local) ? local : {}, r = isPlain(remote) ? remote : {};
  const out = {};
  for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) out[k] = mergeRecord(isPlain(l[k]) ? l[k] : null, isPlain(r[k]) ? r[k] : null);
  return out;
}
/** Server paper.progress { pct, pos, at, done } -> a record (so list-time progress merges into local). */
export function recordFromServer(p) {
  if (!isPlain(p)) return null;
  const pct = Math.max(0, Math.min(100, +p.pct || 0));
  const at = p.at ? (typeof p.at === 'number' ? p.at : Date.parse(p.at)) || null : null;
  return { percent: pct, scrollPct: pct / 100, activeSec: 0, firstVisit: at, completedAt: p.done ? at || Date.now() : null, updatedAt: at, pos: +p.pos || 0 };
}
/** Server map { id: {pct,pos,at,done} } (or already-record entries) -> { id: record } */
export function remoteMap(m) {
  const out = {};
  for (const k of Object.keys(m || {})) { const v = m[k]; if (!isPlain(v)) continue; const r = 'percent' in v ? v : recordFromServer(v); if (r) out[k] = r; }
  return out;
}
export function fingerprint(store) {
  const m = mergeStores(store, {});
  return JSON.stringify(Object.keys(m).sort().map(k => { const r = m[k]; return [k, Math.round(r.percent), r.scrollPct, r.activeSec, r.firstVisit, r.completedAt, r.updatedAt, r.pos]; }));
}
/** Estimated reading time in seconds (about 6 characters a word at 220 words a minute, floor 60 s). */
export function readSecFor(chars) { return Math.max(60, Math.round(((+chars || 0) / 6 / 220) * 60)); }

// ── Storage ─────────────────────────────────────────────────────────────────────────────────────────────
export function storeApi(storage) {
  return {
    read() { try { const v = JSON.parse(storage.getItem(STORAGE_KEY) || '{}'); return isPlain(v) ? v : {}; } catch { return {}; } },
    write(s) { try { storage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* private mode */ } },
  };
}
export function localPercent(storage, id) { const r = storeApi(storage).read()[id]; return r ? Math.round(+r.percent || 0) : 0; }

/**
 * Per-paper tracker (progress.js). deps: { storage, id, readSec, now(), scrollPctNow() -> 0..1 }
 */
export function createTracker(deps) {
  const st = storeApi(deps.storage), now = deps.now || Date.now;
  const saved = st.read()[deps.id] || {};
  const rec = {
    scrollPct: Number(saved.scrollPct) || 0,
    activeSec: Number(saved.activeSec) || 0,
    percent: Number(saved.percent) || 0,
    firstVisit: saved.firstVisit || now(),
    completedAt: saved.completedAt || null,
    pos: Number(saved.pos) || 0,
  };
  if (saved.updatedAt) rec.updatedAt = saved.updatedAt;
  const readSec = Math.max(60, deps.readSec || 600);
  const api = {
    rec,
    bestPercent() {
      const s = Math.max(rec.scrollPct, deps.scrollPctNow());
      const t = Math.min(1, rec.activeSec / readSec);
      return Math.max(rec.percent, Math.round(Math.min(1, Math.max(s, t)) * 100));   // high-water mark
    },
    onScroll(pos) { rec.scrollPct = Math.max(rec.scrollPct, deps.scrollPctNow()); if (pos != null) rec.pos = pos; },
    tick(visible) { if (visible) rec.activeSec += 1; },
    persist() {
      rec.percent = api.bestPercent();
      rec.updatedAt = now();
      if (rec.percent >= 100 && !rec.completedAt) rec.completedAt = now();
      const s = st.read();   // re-read so another tab's entries are not clobbered
      s[deps.id] = mergeRecord(s[deps.id] || null, rec);
      st.write(s);
      return rec;
    },
  };
  return api;
}

/**
 * Transport (sync.js): push when hidden, at most once a minute, only when changed, merge the server's reply.
 * deps: { storage, post(body)->Promise<json>, now(), setTimer, clearTimer, onUpdated() }
 */
export function createSync(deps) {
  const st = storeApi(deps.storage), now = deps.now || Date.now;
  const setT = deps.setTimer || setTimeout;
  const K_LAST = 'libraryProgressSyncLast', K_AT = 'libraryProgressSyncAt';
  const rawGet = k => { try { return deps.storage.getItem(k); } catch { return null; } };
  const rawSet = (k, v) => { try { v == null ? deps.storage.removeItem(k) : deps.storage.setItem(k, v); } catch { /* ignore */ } };
  let timer = null;

  function apply(remote) {   // merge with what is in storage NOW
    st.write(mergeStores(st.read(), remote));
    if (deps.onUpdated) deps.onUpdated();
  }
  /** Fold the lists's server-side progress into local storage (the "pull" half). */
  function pullFromPapers(papers) {
    const remote = {};
    for (const p of papers) { const r = recordFromServer(p.progress); if (r) remote[p.id] = r; }
    apply(remote);
  }
  /** Changed ids since the last push are sent one POST each (the contract is per paper). */
  async function push(opts = {}) {
    const store = st.read(), fp = fingerprint(store);
    if (fp === rawGet(K_LAST) && !opts.force) return null;
    const wait = MIN_GAP - (now() - (+rawGet(K_AT) || 0));
    if (wait > 0 && !opts.force) {
      if (!timer) timer = setT(() => { timer = null; push().catch(() => {}); }, wait + 50);
      return null;
    }
    rawSet(K_AT, String(now()));
    const sent = JSON.parse(rawGet(K_LAST + 'Map') || '{}');
    const results = [];
    for (const id of Object.keys(store)) {
      const r = store[id], key = JSON.stringify([Math.round(r.percent), r.pos, r.updatedAt]);
      if (sent[id] === key && !opts.force) continue;
      const body = { id, pct: Math.round(r.percent), pos: r.pos || 0, done: !!r.completedAt || r.percent >= 97, scrollPct: r.scrollPct, activeSec: r.activeSec, firstVisit: r.firstVisit, completedAt: r.completedAt, updatedAt: r.updatedAt };
      try {
        const j = await deps.post(body);
        sent[id] = key; results.push(j);
        if (j && isPlain(j.progress) && !opts.keepalive) apply(remoteMap(j.progress));   // server replies with the full merged map
      } catch (e) { if (e && e.status === 429) { if (!timer) timer = setT(() => { timer = null; push({ force: true }).catch(() => {}); }, 15000); return null; } throw e; }
    }
    rawSet(K_LAST + 'Map', JSON.stringify(sent));
    rawSet(K_LAST, fingerprint(st.read()));
    return results;
  }
  return { push, apply, pullFromPapers, fingerprint: () => fingerprint(st.read()) };
}
