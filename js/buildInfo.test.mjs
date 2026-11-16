// js/buildInfo.test.mjs: node --test js/buildInfo.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInfo } from './buildInfo.js';

const T0 = Date.parse('2026-11-16T13:41:00Z'), F0 = Date.parse('2026-11-16T13:35:12Z');

test('on Railway: the commit, branch and deployment come from the Railway variables and nothing else is read', () => {
  const env = { RAILWAY_GIT_COMMIT_SHA: '6DB8FFD4A1B2C3D4E5F60718293A4B5C6D7E8F90', RAILWAY_GIT_BRANCH: 'main', RAILWAY_DEPLOYMENT_ID: 'dep-123',
    ANTHROPIC_API_KEY: 'sk-secret', OANDA_TOKEN: 'secret', KV_TOKEN: 'secret' };
  const b = buildInfo({ env, startedAtMs: T0, filesAtMs: F0 });
  assert.equal(b.ok, true); assert.equal(b.sha, '6db8ffd4a1b2c3d4e5f60718293a4b5c6d7e8f90'); assert.equal(b.shortSha, '6db8ffd');
  assert.equal(b.branch, 'main'); assert.equal(b.deploymentId, 'dep-123'); assert.equal(b.source, 'railway');
  assert.equal(b.startedAt, '2026-11-16T13:41:00.000Z'); assert.equal(b.builtAt, '2026-11-16T13:35:12.000Z'); assert.equal(b.builtAtSource, 'server.js modified time');
  const text = JSON.stringify(b); for (const s of ['sk-secret', 'secret', 'ANTHROPIC', 'OANDA', 'KV_TOKEN']) assert.ok(!text.includes(s), `no ${s} in the answer`);
});

test('a local run falls back to the git read, and says so', () => {
  const b = buildInfo({ env: {}, startedAtMs: T0, gitSha: 'abcdef1234567890abcdef1234567890abcdef12', gitBranch: 'claude/x' });
  assert.equal(b.shortSha, 'abcdef1'); assert.equal(b.source, 'git'); assert.equal(b.branch, 'claude/x'); assert.equal(b.deploymentId, null);
});

test('Railway wins over git; a malformed value is ignored, never echoed', () => {
  assert.equal(buildInfo({ env: { RAILWAY_GIT_COMMIT_SHA: 'aaaaaaa' }, gitSha: 'bbbbbbb' }).shortSha, 'aaaaaaa');
  const bad = buildInfo({ env: { RAILWAY_GIT_COMMIT_SHA: 'not a sha; rm -rf /' }, gitSha: 'ccccccc1' });
  assert.equal(bad.shortSha, 'ccccccc'); assert.ok(!JSON.stringify(bad).includes('rm -rf'));
});

test('nothing known: sha is "unknown" with null dates, never a crash and never invented', () => {
  const b = buildInfo({});
  assert.equal(b.sha, 'unknown'); assert.equal(b.shortSha, 'unknown'); assert.equal(b.source, 'unknown');
  assert.equal(b.builtAt, null); assert.equal(b.builtAtSource, null); assert.equal(b.startedAt, null); assert.equal(b.branch, null);
  assert.doesNotThrow(() => buildInfo({ env: { RAILWAY_GIT_COMMIT_SHA: 42, RAILWAY_GIT_BRANCH: '   ' }, filesAtMs: NaN, startedAtMs: 'x' }));
});
