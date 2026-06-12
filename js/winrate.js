// winrate.js — Trade outcome tracking and win-rate feedback loop
//
// Stores a compact performance table in localStorage keyed by setup profile:
//   stars_volRegime_session (e.g. "4_HIGH_LONDON")
//
// Entries are recorded automatically when the entry scanner surfaces them.
// Outcomes are marked manually by the user from the dashboard entry cards.
// The scanner reads historical WR to annotate and soft-gate low-WR profiles.

const STORE_KEY = 'wt_winrate_v1';
const MAX_PER_PROFILE = 200; // cap per profile bucket to avoid unbounded growth

// ── Persistence ──────────────────────────────────────────────────────────────

function _load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}'); }
  catch { return {}; }
}

function _save(data) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); }
  catch {}
}

// ── Profile key ──────────────────────────────────────────────────────────────

export function profileKey(entry) {
  const stars   = Math.min(5, Math.max(1, Math.round(entry.totalStars ?? entry.stars ?? 1)));
  const vol     = entry.volLabel ?? 'NORM';    // e.g. 'LOW'|'NORM'|'HIGH'|'EXTREME'
  const session = entry.sessionName ?? 'NONE'; // e.g. 'ASIA'|'LONDON'|'NEW_YORK'
  return `${stars}_${vol}_${session}`;
}

// ── Record a surfaced entry ───────────────────────────────────────────────────
// Call this whenever the entry scanner surfaces a new entry. Outcome starts
// as null (pending). Returns the entry ID (ts_sym_price) for later resolution.

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

  // Trim pending list to prevent unbounded growth (keep most recent)
  if (data[key].pending.length > MAX_PER_PROFILE) {
    data[key].pending = data[key].pending.slice(-MAX_PER_PROFILE);
  }

  _save(data);
  return id;
}

// ── Resolve an entry outcome ──────────────────────────────────────────────────
// outcome: 'win' | 'loss' | 'skip' (skip = did not take the trade)

export function resolveEntry(id, outcome) {
  const data = _load();
  for (const key of Object.keys(data)) {
    const bucket = data[key];
    const idx    = bucket.pending?.findIndex(e => e.id === id) ?? -1;
    if (idx === -1) continue;
    bucket.pending.splice(idx, 1);
    if (outcome === 'win')  bucket.wins++;
    else if (outcome === 'loss') bucket.losses++;
    else if (outcome === 'skip') bucket.skips++;
    _save(data);
    return true;
  }
  return false;
}

// ── Query win rate for a profile ─────────────────────────────────────────────
// Returns { wr, n, wins, losses, skips, pending } or null if no data.
// wr is 0–1 (excludes skips from denominator).

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

// ── Bulk stats export (for dashboard display) ─────────────────────────────────

export function getAllStats() {
  return _load();
}

// ── Session-level deduplication for auto-recording ───────────────────────────
// Prevents the same zone from being recorded multiple times per session.
const _sessionSeen = new Set();

function _entrySessionKey(sym, entry) {
  const dir = entry.direction ?? 'none';
  const px  = (entry.price ?? 0).toFixed(5);
  return `${sym}_${px}_${dir}`;
}

// ── Annotate an entry with WR data ───────────────────────────────────────────
// Attaches { wrStats, wrWarning, wrBadge, _wrId } to an entry (mutates in place).
// Also records the entry (once per session) so outcomes can be resolved later.
// wrWarning is true when WR < 35% with n ≥ 10 — meaningful signal to reduce size.

export function annotateEntry(sym, entry) {
  const sessionKey = _entrySessionKey(sym, entry);

  // Auto-record once per session when the scanner surfaces this zone
  let entryId = null;
  if (!_sessionSeen.has(sessionKey)) {
    _sessionSeen.add(sessionKey);
    entryId = recordEntry(sym, entry);
  } else {
    // Retrieve existing pending ID for this zone so outcome buttons stay wired
    const data   = _load();
    const key    = profileKey(entry);
    const bucket = data[key];
    const match  = bucket?.pending?.find(p =>
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

// ── Purge pending entries older than N days (cleanup) ────────────────────────

export function purgeStalePending(days = 7) {
  const cutoff = Date.now() - days * 86400_000;
  const data   = _load();
  let changed  = false;
  for (const key of Object.keys(data)) {
    const before = (data[key].pending ?? []).length;
    data[key].pending = (data[key].pending ?? []).filter(e => e.ts > cutoff);
    if (data[key].pending.length !== before) changed = true;
  }
  if (changed) _save(data);
}
