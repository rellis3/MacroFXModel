// js/terminal/buildVersion.test.mjs: node --test js/terminal/buildVersion.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { utcStamp, versionHtml, mountVersion } from './buildVersion.js';

const OK = { ok: true, sha: '6db8ffd4a1b2c3d4e5f60718293a4b5c6d7e8f90', shortSha: '6db8ffd', branch: 'main', builtAt: '2026-11-16T13:35:12.000Z', startedAt: '2026-11-16T13:41:00.000Z' };

test('the stamp is UTC and plain', () => {
  assert.equal(utcStamp('2026-11-16T13:35:12.000Z'), '16 Nov 13:35 UTC'); assert.equal(utcStamp('2026-01-05T04:07:00Z'), '5 Jan 04:07 UTC');
  assert.equal(utcStamp(null), ''); assert.equal(utcStamp('nonsense'), '');
});
test('the line shows the short commit (full commit on hover), branch, build and start time', () => {
  const h = versionHtml(OK);
  assert.ok(h.includes('6db8ffd')); assert.ok(h.includes('title="6db8ffd4a1b2c3d4e5f60718293a4b5c6d7e8f90"')); assert.ok(h.includes('main'));
  assert.ok(h.includes('built 16 Nov 13:35 UTC')); assert.ok(h.includes('running since 16 Nov 13:41 UTC'));
});
test('an unknown commit says so; missing dates are left out; unusable answers show nothing', () => {
  assert.ok(versionHtml({ ok: true, sha: 'unknown', shortSha: 'unknown', branch: null, builtAt: null, startedAt: null }).includes('commit unknown'));
  assert.ok(!versionHtml({ ...OK, builtAt: null }).includes('built '));
  for (const bad of [null, undefined, {}, { ok: false }, { ok: true }, { ok: true, shortSha: 7 }]) assert.equal(versionHtml(bad), '');
});
test('hostile values are escaped', () => {
  const h = versionHtml({ ...OK, branch: '<img src=x onerror=alert(1)>', sha: '"><script>' });
  assert.ok(!h.includes('<img') && !h.includes('<script>'));
});
test('mount fills the host, and a failed or refused call leaves it empty without throwing', async () => {
  const host = { innerHTML: '' };
  assert.equal(await mountVersion(host, { fetchJson: async () => OK }), true); assert.ok(host.innerHTML.includes('Running build'));
  const h2 = { innerHTML: 'x' };
  assert.equal(await mountVersion(h2, { fetchJson: async () => { throw new Error('no record'); } }), false);
  assert.equal(await mountVersion({ innerHTML: '' }, { fetchJson: async () => ({ ok: false, error: 'No record' }) }), false);
  assert.equal(await mountVersion(null), false);
});
