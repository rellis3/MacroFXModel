// node js/deskNewsSearches.test.mjs: the server half of saved News searches (who may call, save, delete, a corrupt store).
import assert from 'node:assert/strict';
import { handle, readStore, KEY } from './deskNewsSearches.js';
const mem = () => { const m = new Map(); return { m, get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; };
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const kv = mem();
ok((await handle({ method: 'GET', role: null, kv })).status === 401, 'no session: 401');
ok((await handle({ method: 'GET', role: 'viewer', kv, on: () => false })).status === 403, 'desk login, switch off: 403');
ok((await handle({ method: 'POST', role: 'viewer', kv, on: () => true, body: { action: 'save', name: 'x', search: { q: 'ecb' } } })).status === 403, 'desk login never writes');
ok((await handle({ method: 'POST', role: 'owner', kv, body: { action: 'save', name: 'ECB', search: { q: 'ecb', tier: 1 } } })).status === 200 && kv.m.has(KEY), 'owner saves');
ok((await handle({ method: 'POST', role: 'owner', kv, body: { action: 'save', name: 'Empty', search: { q: '' } } })).status === 400, 'empty search refused');
ok((await handle({ method: 'GET', role: 'viewer', kv, on: id => id === 'panel.news.saved' })).json.searches.length === 1, 'desk login reads once switched on');
ok((await handle({ method: 'POST', role: 'owner', kv, body: { action: 'delete', name: 'ECB' } })).json.searches.length === 0, 'delete');
ok((await handle({ method: 'PUT', role: 'owner', kv })).status === 405, 'other methods refused');
kv.m.set(KEY, 'not json');
ok((await readStore(kv)).searches.length === 0, 'a corrupt store reads as empty');
console.log(`deskNewsSearches: ${n} checks OK`);
