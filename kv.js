// kv.js — file-backed KV store
// Drop-in replacement for Cloudflare KV.  Persists to data/kv.json.
// On Railway / Render the filesystem is ephemeral by default; add a
// persistent volume and set DATA_DIR to keep data across deploys.

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = process.env.DATA_DIR || path.join(__dirname, 'data');
const KV_FILE    = path.join(DATA_DIR, 'kv.json');

let store = {};
let dirty = false;

export async function load() {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    const raw = await readFile(KV_FILE, 'utf8');
    store = JSON.parse(raw);
    // Prune TTL-expired keys on startup
    const now = Date.now();
    for (const key of Object.keys(store)) {
      if (key.startsWith('__ttl_')) continue;
      const ttlKey = `__ttl_${key}`;
      if (store[ttlKey] && now > store[ttlKey]) {
        delete store[key];
        delete store[ttlKey];
      }
    }
    console.log(`[KV] Loaded ${Object.keys(store).filter(k => !k.startsWith('__ttl_')).length} keys`);
  } catch {
    store = {};
    console.log('[KV] Starting fresh (no existing kv.json)');
  }
}

async function flush() {
  if (!dirty) return;
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(KV_FILE, JSON.stringify(store));
    dirty = false;
  } catch (e) {
    console.error('[KV] Flush error:', e.message);
  }
}

// Flush every 5 s and on process exit
setInterval(flush, 5_000);
process.on('beforeExit', flush);

export async function get(key) {
  const ttlKey = `__ttl_${key}`;
  if (store[ttlKey] && Date.now() > store[ttlKey]) {
    delete store[key];
    delete store[ttlKey];
    dirty = true;
    return null;
  }
  return store[key] ?? null;
}

export async function put(key, value, opts = {}) {
  store[key] = value;
  if (opts?.expirationTtl) {
    store[`__ttl_${key}`] = Date.now() + opts.expirationTtl * 1_000;
  }
  dirty = true;
}

export async function del(key) {
  delete store[key];
  delete store[`__ttl_${key}`];
  dirty = true;
}
