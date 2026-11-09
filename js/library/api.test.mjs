import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from './api.js';

const okResp = body => ({ status: 200, ok: true, redirected: false, url: '/x', json: async () => body });

test('a dropped GET is tried once more and then succeeds', async () => {
  let n = 0;
  globalThis.fetch = async () => { n++; if (n === 1) throw new TypeError('Failed to fetch'); return okResp({ ok: true, papers: [] }); };
  const d = await api.papers();
  assert.equal(n, 2);
  assert.equal(d.ok, true);
});

test('two drops in a row give a plain-words error, not "Failed to fetch"', async () => {
  let n = 0;
  globalThis.fetch = async () => { n++; throw new TypeError('Failed to fetch'); };
  await assert.rejects(() => api.papers(), e => e.network === true && /Could not reach the server/.test(e.message));
  assert.equal(n, 2);
});

test('a POST is never retried (it could repeat an action)', async () => {
  let n = 0;
  globalThis.fetch = async () => { n++; throw new TypeError('Failed to fetch'); };
  await assert.rejects(() => api.progress({ id: 'x' }), e => e.network === true);
  assert.equal(n, 1);
});

test('a 401 still says to sign in', async () => {
  globalThis.fetch = async () => ({ status: 401, ok: false, redirected: false, url: '/x', json: async () => ({}) });
  await assert.rejects(() => api.papers(), e => e.auth === true);
});
