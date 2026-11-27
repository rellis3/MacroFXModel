// js/terminal/helixFetch.js: Helix's one JSON loader (plans/HELIX_IMPROVEMENTS.md 0.10, 3.2, 3.3). Pure: the fetch function is injected, so js/terminal/helixFetch.test.mjs runs without a network.
//   - checks r.ok: a 4xx/5xx body is an error, never data (the error carries .status and the body's own `error` text);
//   - a 15 s timeout per request, so one hung route cannot stall the broadcast's gather();
//   - in-flight dedupe: three views asking for /api/oi-store at once share one request;
//   - a per-route TTL cache (GET only, bounded LRU), so the 3x oi-store / 3x bias-engine / 2x desk-run of one load become one each;
//   - load(url) returns { data, asOf, stale, error } for the as-of chip; prime(url, data) lets a server bundle fill the cache.
// POSTs (and any request with a body) are never cached or deduped. DESCRIPTION ONLY: this moves data; it decides nothing.

/** Route TTLs in ms, first match wins (path only, the query is ignored for the match). Short where the data moves intraday, long for daily builds. */
export const ROUTE_TTL = [
  [/^\/api\/(vol-forecast\/live|market-live|live-layer)$/, 30_000],
  [/^\/api\/(services|jarvis\/watch)$/, 20_000],
  [/^\/api\/(bias-engine|desk-news|events|calendar-events|calendar-feed|helix\/bundle)$/, 120_000],
  [/^\/api\/(desk-run|cog-chart\/candles|ohlc|vol-forecast\/session|vol-forecast|daily-brief|jarvis\/morning|asia-today)$/, 300_000],
  [/^\/api\/(oi-store|oi-history|oi-history-raw|corr-terminal|ohlc-range|vol-terrain|drill-series|wider-market|g10-rates|funding-board)$/, 600_000],
  [/^\/api\/(chapters|intl-yields|fredhistory|cot-state|desk-cot-history|newsletter\/archive)$/, 1_800_000],
];
export const DEFAULT_TTL = 60_000, TIMEOUT_MS = 15_000, MAX_ENTRIES = 120;
/** A reply older than this (by its own as-of stamp) is flagged stale. Daily feeds get 36 h, so the morning after a holiday still reads as stale. */
export const STALE_AFTER = [[/^\/api\/(oi-store|oi-history|chapters|intl-yields|drill-series|wider-market|g10-rates|funding-board|cot-state)/, 4 * 864e5], [/./, 36 * 3600e3]];

const pathOf = u => String(u ?? '').split('?')[0].split('#')[0];
export const ttlFor = u => { const p = pathOf(u); for (const [re, ms] of ROUTE_TTL) if (re.test(p)) return ms; return DEFAULT_TTL; };
const staleAfterFor = u => { const p = pathOf(u); for (const [re, ms] of STALE_AFTER) if (re.test(p)) return ms; return 36 * 3600e3; };

const AS_OF_KEYS = ['asOf', 'as_of', 'fetched_at', 'fetchedAt', 'generated_at', 'generatedAt', 'builtAt', 'computed_at', 'updatedAt', 'savedAt', 'at', 'to', 'session_date', 'date'];
/** The payload's own as-of stamp as epoch ms, or null. Looks at the usual field names on the top level; a bare YYYY-MM-DD counts as that day's 00:00 UTC. */
export function asOfOf(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  for (const k of AS_OF_KEYS) {
    const v = json[k]; if (v == null || v === '') continue;
    const ms = typeof v === 'number' ? (v > 1e12 ? v : v > 1e9 ? v * 1000 : NaN) : Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? `${v}T00:00:00Z` : String(v));
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}
/** Stale when the payload says so (stale / fallback / carried), or its as-of is older than the route allows. */
export function staleOf(json, url, now = Date.now()) {
  if (json && typeof json === 'object' && (json.stale === true || json.fallback === true)) return true;
  const a = asOfOf(json); return a != null && now - a > staleAfterFor(url);
}

/**
 * createHelixFetch(fetchImpl, opts) -> { jf, load, meta, prime, clear, size }.
 * fetchImpl(url, init) is window.fetch (or a fake). opts: { timeoutMs, maxEntries, now, ttl(url) }.
 */
export function createHelixFetch(fetchImpl, { timeoutMs = TIMEOUT_MS, maxEntries = MAX_ENTRIES, now = () => Date.now(), ttl = ttlFor } = {}) {
  const cache = new Map();      // url -> { at, data, asOf }  (insertion order = LRU order)
  const inflight = new Map();   // url -> Promise
  const put = (u, data) => { cache.delete(u); cache.set(u, { at: now(), data, asOf: asOfOf(data) }); while (cache.size > maxEntries) cache.delete(cache.keys().next().value); };
  const isGet = o => !o || ((!o.method || String(o.method).toUpperCase() === 'GET') && o.body == null);

  async function raw(u, o0 = {}) {
    const { timeoutMs: tms = timeoutMs, ...o } = o0 ?? {};          // opts.timeoutMs: a longer limit for one call (the server bundle)
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), tms) : null;
    let signal = ctl?.signal;
    if (o.signal && ctl) { if (o.signal.aborted) ctl.abort(); else o.signal.addEventListener?.('abort', () => ctl.abort(), { once: true }); }
    try {
      const r = await fetchImpl(u, { ...o, signal });
      let body = null, parseErr = null;
      try { body = await r.json(); } catch (e) { parseErr = e; }
      if (!r.ok) { const e = new Error((body && (body.error || body.message)) || `HTTP ${r.status}`); e.status = r.status; e.body = body; throw e; }
      if (parseErr) { const e = new Error(`not JSON: ${parseErr.message}`); e.status = r.status; throw e; }
      return body;
    } catch (e) {
      if (e?.name === 'AbortError' && !o.signal?.aborted) { const t = new Error(`timed out after ${Math.round(tms / 1000)} s: ${pathOf(u)}`); t.timeout = true; throw t; }
      throw e;
    } finally { if (timer) clearTimeout(timer); }
  }

  /** fetch JSON. GET: served from the cache while fresh, shared while in flight. opts.cache === 'no-store' skips the cache (still shared in flight). */
  function jf(u, o) {
    if (!isGet(o)) return raw(u, o);
    const fresh = o?.cache === 'no-store' ? null : cache.get(u);
    if (fresh && now() - fresh.at < ttl(u)) { cache.delete(u); cache.set(u, fresh); return Promise.resolve(fresh.data); }
    if (inflight.has(u)) return inflight.get(u);
    const p = raw(u, o).then(d => { put(u, d); return d; }).finally(() => inflight.delete(u));
    inflight.set(u, p); return p;
  }
  /** { data, asOf (ms|null), stale, error }: never throws. A failed refresh keeps the last good copy, marked stale, so a view can say "as of" instead of drawing old data as live. */
  async function load(u, o) {
    try { const data = await jf(u, o); const c = cache.get(u); return { data, asOf: asOfOf(data) ?? c?.at ?? now(), stale: staleOf(data, u, now()), error: null }; }
    catch (e) { const c = cache.get(u); return c ? { data: c.data, asOf: c.asOf ?? c.at, stale: true, error: e.message } : { data: null, asOf: null, stale: true, error: e.message }; }
  }
  const meta = u => { const c = cache.get(u); return c ? { at: c.at, asOf: c.asOf ?? c.at, stale: staleOf(c.data, u, now()) } : null; };
  /** Fill the cache from a server bundle (only pass the route's FULL payload; a trimmed copy would be served to every other reader). */
  const prime = (u, data) => { if (data != null && !cache.has(u) && !inflight.has(u)) put(u, data); };
  return { jf, load, meta, prime, clear: () => cache.clear(), size: () => cache.size };
}
