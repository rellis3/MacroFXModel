// winrate.js — Trade outcome tracking and win-rate feedback loop
//
// Stores a compact performance table in the shared KV store so data is available
// on every device (phone, laptop, bot). Key: wt_winrate_v1
//
// Architecture: in-memory cache loaded from KV on module init.
// All reads are synchronous (from cache). All writes update the cache immediately
// and fire an async KV write in the background — no blocking, no await in callers.
//
// Profile key: "{stars}_{volLabel}_{session}" e.g. "4_HIGH_LONDON"
// Each bucket: { wins, losses, skips, pending: [{id, sym, price, direction, ...}] }

const KV_KEY = 'wt_winrate_v1';
const MAX_PER_PROFILE = 200;

// ── In-memory cache (sync interface) ─────────────────────────────────────────

let _cache = {};

async function _initCache() {
  try {
    const res = await fetch(`/api/kv/get?key=${encodeURIComponent(KV_KEY)}`);
    if (!res.ok) return;
    const obj = await res.json();
    if (!obj.miss && obj.data && typeof obj.data === 'object') {
      // Merge KV data into cache — keeps any pending entries recorded this session
      // before the async load completed (race on very fast first-render)
      for (const [k, v] of Object.entries(obj.data)) {
        if (!_cache[k]) {
          _cache[k] = v;
        } else {
          // Merge counters from KV (authoritative) with any session-recorded pending
          _cache[k].wins    = v.wins    ?? _cache[k].wins;
          _cache[k].losses  = v.losses  ?? _cache[k].losses;
          _cache[k].skips   = v.skips   ?? _cache[k].skips;
          // Keep pending from both; deduplicate by id
          const kvPendingIds = new Set((v.pending ?? []).map(p => p.id));
          const sessionOnly  = (_cache[k].pending ?? []).filter(p => !kvPendingIds.has(p.id));
          _cache[k].pending  = [...(v.pending ?? []), ...sessionOnly];
        }
      }
    }
  } catch(e) {}
}
_initCache(); // fire-and-forget — no callers await this

function _load() {
  return _cache;
}

function _save(data) {
  _cache = data;
  // Async KV write — fire-and-forget. Errors logged but not thrown.
  fetch('/api/kv/set', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ key: KV_KEY, data, timestamp: Date.now() }),
  }).catch(e => console.warn('winrate KV write failed:', e.message));
}

// ── Profile key ──────────────────────────────────────────────────────────────

export function profileKey(entry) {
  const stars   = Math.min(5, Math.max(1, Math.round(entry.totalStars ?? entry.stars ?? 1)));
  const vol     = entry.volLabel    ?? 'NORM';  // 'LOW'|'NORM'|'HIGH'|'EXTREME'
  const session = entry.sessionName ?? 'NONE';  // 'ASIA'|'LONDON'|'NEW_YORK'
  return `${stars}_${vol}_${session}`;
}

// ── Record a surfaced entry ───────────────────────────────────────────────────
// Returns an entry ID (ts_sym_price) for later outcome resolution.

export function recordEntry(sym, entry) {
  const data = _load();
  const key  = profileKey(entry);
  if (!data[key]) data[key] = { wins: 0, losses: 0, skips: 0, pending: [] };

  const id = `${Date.now()}_${sym}_${(entry.price ?? 0).toFixed(5)}`;
  data[key].pending.push({
    id,
    sym,
    price:     entry.price,
    direction: entry.direction,
    stars:     entry.totalStars ?? entry.stars,
    tp:        entry.tp,
    sl:        entry.sl,
    ts:        Date.now(),
  });

  if (data[key].pending.length > MAX_PER_PROFILE) {
    data[key].pending = data[key].pending.slice(-MAX_PER_PROFILE);
  }

  _save(data);
  return id;
}

// ── Resolve an entry outcome ──────────────────────────────────────────────────
// outcome: 'win' | 'loss' | 'skip'

export function resolveEntry(id, outcome) {
  const data = _load();
  for (const key of Object.keys(data)) {
    const bucket = data[key];
    const idx    = bucket.pending?.findIndex(e => e.id === id) ?? -1;
    if (idx === -1) continue;
    bucket.pending.splice(idx, 1);
    if (outcome === 'win')       bucket.wins++;
    else if (outcome === 'loss') bucket.losses++;
    else if (outcome === 'skip') bucket.skips++;
    _save(data);
    return true;
  }
  return false;
}

// ── Query win rate for a profile ─────────────────────────────────────────────
// Returns { wr, n, wins, losses, skips, pending } or null if insufficient data.
// wr is 0–1; skips excluded from denominator.

export function getWinRate(entry) {
  const data   = _load();
  const key    = profileKey(entry);
  const bucket = data[key];
  if (!bucket) return null;
  const n = bucket.wins + bucket.losses;
  if (n === 0) return null;
  return {
    wr:      bucket.wins / n,
    n,
    wins:    bucket.wins,
    losses:  bucket.losses,
    skips:   bucket.skips ?? 0,
    pending: (bucket.pending ?? []).length,
  };
}

// ── Bulk stats export ─────────────────────────────────────────────────────────

export function getAllStats() {
  return _load();
}

// ── Session-level deduplication ───────────────────────────────────────────────
// Prevents re-recording the same zone on every render tick.
const _sessionSeen = new Set();

function _entrySessionKey(sym, entry) {
  return `${sym}_${(entry.price ?? 0).toFixed(5)}_${entry.direction ?? 'none'}`;
}

// ── Annotate an entry with WR data ───────────────────────────────────────────
// Attaches { wrStats, wrWarning, wrBadge, _wrId } (mutates entry in place).
// Auto-records the entry once per session so outcome buttons work immediately.
// wrWarning = true when WR < 35% with ≥10 resolved trades.

export function annotateEntry(sym, entry) {
  const sessionKey = _entrySessionKey(sym, entry);

  let entryId = null;
  if (!_sessionSeen.has(sessionKey)) {
    _sessionSeen.add(sessionKey);
    entryId = recordEntry(sym, entry);
  } else {
    const data   = _load();
    const key    = profileKey(entry);
    const match  = data[key]?.pending?.find(p =>
      p.sym === sym &&
      p.direction === entry.direction &&
      Math.abs(p.price - entry.price) < 1e-7
    );
    if (match) entryId = match.id;
  }

  entry._wrId = entryId;

  const stats = getWinRate(entry);
  if (stats) {
    entry.wrStats   = stats;
    entry.wrWarning = stats.n >= 10 && stats.wr < 0.35;
    entry.wrBadge   = `${Math.round(stats.wr * 100)}% (${stats.n})`;
  }
  return entry;
}

// ── Purge stale pending entries (call periodically) ───────────────────────────

export function purgeStalePending(days = 7) {
  const cutoff = Date.now() - days * 86_400_000;
  const data   = _load();
  let changed  = false;
  for (const key of Object.keys(data)) {
    const before = (data[key].pending ?? []).length;
    data[key].pending = (data[key].pending ?? []).filter(e => e.ts > cutoff);
    if (data[key].pending.length !== before) changed = true;
  }
  if (changed) _save(data);
}
