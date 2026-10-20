import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STORES, storeFeeds } from './storeRegistry.js';
import { FEEDS } from './dataFeeds.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

// the permanent keys, exactly as kv.js declares them
const kvSrc = fs.readFileSync(path.join(root, 'kv.js'), 'utf8');
const i = kvSrc.indexOf('const _CF_EXACT = new Set(['), j = kvSrc.indexOf(']);', i);
const permanent = [...kvSrc.slice(i, j).matchAll(/^\s*'([^']+)',?/gm)].map(m => m[1]);
const handKeys = new Set(FEEDS.filter(f => !f.id.startsWith('store:')).map(f => f.kvStamp?.key).filter(Boolean));

t('kv.js still lists its permanent keys (the guard would be vacuous otherwise)', () => assert.ok(permanent.length > 100, String(permanent.length)));

t('every permanent KV key is described: in the store registry, or by a hand-written feed', () => {
  const missing = permanent.filter(k => !STORES[k] && !handKeys.has(k));
  assert.deepEqual(missing, [], `kv.js _CF_EXACT has keys the Data Map cannot see: ${missing.join(', ')} — describe each in js/storeRegistry.js (record / log / state / config / secret)`);
});

t('every readable store has a cadence, so a dead writer can be seen', () => {
  for (const [k, s] of Object.entries(STORES)) if (['record', 'log', 'state'].includes(s.kind)) assert.ok(s.cadenceDays > 0, `${k} has no cadence`);
});

t('secrets and configs never become health rows (credentials are never read by the monitor)', () => {
  const ids = new Set(storeFeeds().map(f => f.kvStamp.key));
  for (const [k, s] of Object.entries(STORES)) if (s.kind === 'secret' || s.kind === 'config') assert.ok(!ids.has(k), `${k} (${s.kind}) must not be read`);
  assert.ok(Object.keys(STORES).filter(k => /credential|_tg$/.test(k)).every(k => STORES[k].kind === 'secret'), 'a credentials key is not marked secret');
});

t('no key is described twice (hand-written feed AND generated row)', () => {
  const gen = storeFeeds(handKeys).map(f => f.kvStamp.key);
  assert.deepEqual(gen.filter(k => handKeys.has(k)), []);
  assert.equal(new Set(gen).size, gen.length);
});

t('the registry has no key kv.js does not know (typos would hide a real store)', () => {
  const unknown = Object.keys(STORES).filter(k => !permanent.includes(k) && !handKeys.has(k));
  assert.deepEqual(unknown, [], `registry keys not in kv.js _CF_EXACT: ${unknown.join(', ')}`);
});
console.log(`storeRegistry: ${n} tests passed`);
