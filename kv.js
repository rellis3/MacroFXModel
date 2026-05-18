// kv.js — KV store with Cloudflare REST API backend (primary) or file backend (fallback)
//
// Primary backend — set all three env vars to persist data across deploys:
//   CF_ACCOUNT_ID       Cloudflare account ID
//   CF_API_TOKEN        API token with KV:Edit permission on the namespace
//   CF_KV_NAMESPACE_ID  KV namespace ID (defaults to the existing Pages namespace)
//
// KEY ROUTING — only truly persistent keys go to CF KV REST API.
// Ephemeral market-data caches (ohlc, quote, compass, fredhistory) are stored
// in the local file store only; they are rebuilt automatically on next page load
// and do not need to survive redeploys. This keeps CF KV writes well within the
// free-plan limit of 1,000/day.
//
// Persistent (→ CF KV):   ai_*, tg_config, journal_*, oi_store, cot_data,
//                          surprise_index, events_today, sentiment
// Ephemeral (→ file only): ohlc_*, ohlc5m_*, ohlc30m_*, quote_*, compass_*,
//                          fredhistory_*, and anything else not listed above

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = process.env.DATA_DIR || path.join(__dirname, 'data');
const KV_FILE   = path.join(DATA_DIR, 'kv.json');

// Only keys that are irreplaceable if the server restarts go to CF KV.
// Everything else — market-data caches, computed entries, cooldowns — is stored
// locally and rebuilt automatically. This keeps CF KV writes under ~20/day,
// well within the free-plan limit of 1,000/day.
//
//  CF KV (→ survives redeploys):
//    journal_store, journal_replay_store  — user's trade journal
//    tg_config                            — Telegram bot credentials
//    ai_alert_cfg                         — alert thresholds/pairs
//    oi_store                             — user-pasted CME OI data (cannot auto-rebuild)
//    cot_data, cot_urls, cot_url          — CFTC COT data + user-set report URLs
//    caps                                 — user-configured proximity caps
//
//  Local file only (→ rebuilds on restart, no CF quota used):
//    ai_entries_*  recomputed by levels.js within 30 min of startup
//    ai_cron_cooldowns  acceptable to lose on redeploy (first alert re-fires once)
//    ohlc_*, ohlc5m_*, ohlc30m_*, quote_*, compass_*, fredhistory_*  ephemeral caches
//    surprise_index, events_*  re-fetched from Finnhub on next page load
const _CF_EXACT = new Set([
  'tg_config', 'ai_alert_cfg',
  'journal_store', 'journal_replay_store',
  'oi_store',               // user-pasted CME OI data — cannot be auto-rebuilt
  'cot_data',               // parsed CFTC COT — requires user-set URL to rebuild
  'cot_urls',               // user-configured CFTC report URLs (multi-asset)
  'cot_url',                // legacy single CFTC URL key
  'caps',                   // user-configured proximity caps
  'daily_watchlist',        // top-6 levels per pair, computed at 06:05 London — persists within trading day
  'hmm5m_trained_params',   // Baum-Welch learned HMM V2 params — must survive redeploys
  'hmm5m_macro_context',    // FRED macro context snapshot
]);
function isCfKey(key) {
  // ai_entries_* and ai_cron_* are ephemeral — rebuilt automatically on restart
  if (key.startsWith('ai_entries_') || key.startsWith('ai_cron_')) return false;
  return _CF_EXACT.has(key) || key.startsWith('journal_') || key.startsWith('ai_');
}

// ── Cloudflare KV REST API backend ───────────────────────────────────────────

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN  = process.env.CF_API_TOKEN;
const CF_KV_NS_ID   = process.env.CF_KV_NAMESPACE_ID || '37e632371b754333bcbb33093f33b3bb';
const USE_CF        = !!(CF_ACCOUNT_ID && CF_API_TOKEN);

const CF_BASE    = USE_CF
  ? `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NS_ID}`
  : null;
const CF_HEADERS = USE_CF ? { Authorization: `Bearer ${CF_API_TOKEN}` } : {};

// In-memory read cache — absorbs repeated reads of the same key within 30 s.
// A browser page load can trigger 30–50 CF KV reads (ohlc, quotes, entries for
// all pairs) in quick succession; caching here cuts CF API calls dramatically.
// Writes invalidate the cached entry immediately.
const _readCache = new Map(); // key → { value, expiresAt }
const READ_CACHE_TTL = 30_000;

function cacheGet(key) {
  const entry = _readCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { _readCache.delete(key); return undefined; }
  return entry.value;
}
function cacheSet(key, value) {
  _readCache.set(key, { value, expiresAt: Date.now() + READ_CACHE_TTL });
}
function cacheInvalidate(key) { _readCache.delete(key); }

// Core CF fetch with 429 retry + exponential backoff (1 s → 2 s → 4 s → 8 s)
async function cfFetch(method, key, body, opts) {
  const qs  = opts?.expirationTtl ? `?expiration_ttl=${opts.expirationTtl}` : '';
  const url = `${CF_BASE}/values/${encodeURIComponent(key)}${qs}`;
  const init = {
    method,
    headers: method === 'PUT'
      ? { ...CF_HEADERS, 'Content-Type': 'text/plain' }
      : CF_HEADERS,
  };
  if (method === 'PUT') init.body = body;

  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, init);
    if (r.status === 429) {
      const delay = Math.min(1_000 * 2 ** attempt, 8_000);
      console.warn(`[KV] CF rate limited (${method} ${key}), retry in ${delay} ms`);
      await new Promise(res => setTimeout(res, delay));
      continue;
    }
    return r;
  }
  throw new Error(`CF KV ${method} ${key}: rate limited after 4 attempts`);
}

async function cfGet(key) {
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  const r = await cfFetch('GET', key);
  if (r.status === 404) { cacheSet(key, null); return null; }
  if (!r.ok) throw new Error(`CF KV GET ${key}: ${r.status}`);
  const value = await r.text();
  cacheSet(key, value);
  return value;
}

async function cfPut(key, value, opts = {}) {
  cacheInvalidate(key);
  const r = await cfFetch('PUT', key, value, opts);
  if (!r.ok) throw new Error(`CF KV PUT ${key}: ${r.status}`);
}

async function cfDel(key) {
  cacheInvalidate(key);
  const r = await cfFetch('DELETE', key);
  if (!r.ok && r.status !== 404) throw new Error(`CF KV DEL ${key}: ${r.status}`);
}

// ── File backend ──────────────────────────────────────────────────────────────

let store = {};
let dirty = false;

async function fileLoad() {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    const raw = await readFile(KV_FILE, 'utf8');
    store = JSON.parse(raw);
    const now = Date.now();
    for (const key of Object.keys(store)) {
      if (key.startsWith('__ttl_')) continue;
      const ttlKey = `__ttl_${key}`;
      if (store[ttlKey] && now > store[ttlKey]) {
        delete store[key];
        delete store[ttlKey];
      }
    }
  } catch {
    store = {};
  }
}

async function fileFlush() {
  if (!dirty) return;
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(KV_FILE, JSON.stringify(store));
    dirty = false;
  } catch (e) {
    console.error('[KV] Flush error:', e.message);
  }
}

setInterval(fileFlush, 5_000);
process.on('beforeExit', fileFlush);

// ── Public API ────────────────────────────────────────────────────────────────

export async function load() {
  if (USE_CF) {
    console.log(`[KV] CF REST API backend — account ${CF_ACCOUNT_ID} ns ${CF_KV_NS_ID}`);
    console.log(`[KV] Read cache TTL ${READ_CACHE_TTL / 1000} s — 429 retry with backoff enabled`);
  } else {
    await fileLoad();
    const count = Object.keys(store).filter(k => !k.startsWith('__ttl_')).length;
    console.log(`[KV] File backend — ${count} keys (${KV_FILE})`);
    console.log('[KV] Tip: set CF_ACCOUNT_ID + CF_API_TOKEN to persist across deploys');
  }
}

export async function get(key) {
  if (USE_CF && isCfKey(key)) {
    try   { return await cfGet(key); }
    catch (e) { console.error(`[KV] CF get failed (${key}):`, e.message); return null; }
  }
  const ttlKey = `__ttl_${key}`;
  if (store[ttlKey] && Date.now() > store[ttlKey]) {
    delete store[key]; delete store[ttlKey]; dirty = true; return null;
  }
  return store[key] ?? null;
}

export async function put(key, value, opts = {}) {
  if (USE_CF && isCfKey(key)) {
    try   { await cfPut(key, value, opts); return; }
    catch (e) { console.error(`[KV] CF put failed (${key}):`, e.message); }
  }
  store[key] = value;
  if (opts?.expirationTtl) store[`__ttl_${key}`] = Date.now() + opts.expirationTtl * 1_000;
  dirty = true;
}

export async function del(key) {
  if (USE_CF && isCfKey(key)) {
    try   { await cfDel(key); return; }
    catch (e) { console.error(`[KV] CF del failed (${key}):`, e.message); }
  }
  delete store[key];
  delete store[`__ttl_${key}`];
  dirty = true;
}
