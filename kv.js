// kv.js — KV store with Cloudflare REST API backend (primary) or file backend (fallback)
//
// Primary backend — set all three env vars to persist data across deploys:
//   CF_ACCOUNT_ID       Cloudflare account ID
//   CF_API_TOKEN        API token with KV:Edit permission on the namespace
//   CF_KV_NAMESPACE_ID  KV namespace ID (defaults to the existing Pages namespace)
//
// Fallback: data/kv.json on disk (ephemeral on Railway unless a persistent volume
// is mounted at DATA_DIR — suitable for local dev only).

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = process.env.DATA_DIR || path.join(__dirname, 'data');
const KV_FILE   = path.join(DATA_DIR, 'kv.json');

// ── Cloudflare KV REST API backend ───────────────────────────────────────────

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN  = process.env.CF_API_TOKEN;
const CF_KV_NS_ID   = process.env.CF_KV_NAMESPACE_ID || '37e632371b754333bcbb33093f33b3bb';
const USE_CF        = !!(CF_ACCOUNT_ID && CF_API_TOKEN);

const CF_BASE    = USE_CF
  ? `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NS_ID}`
  : null;
const CF_HEADERS = USE_CF ? { Authorization: `Bearer ${CF_API_TOKEN}` } : {};

async function cfGet(key) {
  const r = await fetch(`${CF_BASE}/values/${encodeURIComponent(key)}`, { headers: CF_HEADERS });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`CF KV GET ${key}: ${r.status}`);
  return r.text();
}

async function cfPut(key, value, opts = {}) {
  const qs  = opts?.expirationTtl ? `?expiration_ttl=${opts.expirationTtl}` : '';
  const url = `${CF_BASE}/values/${encodeURIComponent(key)}${qs}`;
  const r   = await fetch(url, {
    method:  'PUT',
    headers: { ...CF_HEADERS, 'Content-Type': 'text/plain' },
    body:    value,
  });
  if (!r.ok) throw new Error(`CF KV PUT ${key}: ${r.status}`);
}

async function cfDel(key) {
  const r = await fetch(`${CF_BASE}/values/${encodeURIComponent(key)}`, {
    method:  'DELETE',
    headers: CF_HEADERS,
  });
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
  } else {
    await fileLoad();
    const count = Object.keys(store).filter(k => !k.startsWith('__ttl_')).length;
    console.log(`[KV] File backend — ${count} keys (${KV_FILE})`);
    console.log('[KV] Tip: set CF_ACCOUNT_ID + CF_API_TOKEN to persist across deploys');
  }
}

export async function get(key) {
  if (USE_CF) {
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
  if (USE_CF) {
    try   { await cfPut(key, value, opts); return; }
    catch (e) { console.error(`[KV] CF put failed (${key}):`, e.message); }
  }
  store[key] = value;
  if (opts?.expirationTtl) store[`__ttl_${key}`] = Date.now() + opts.expirationTtl * 1_000;
  dirty = true;
}

export async function del(key) {
  if (USE_CF) {
    try   { await cfDel(key); return; }
    catch (e) { console.error(`[KV] CF del failed (${key}):`, e.message); }
  }
  delete store[key];
  delete store[`__ttl_${key}`];
  dirty = true;
}
