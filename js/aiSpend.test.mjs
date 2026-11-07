import test from 'node:test';
import assert from 'node:assert/strict';
import { priceFor, usdOf, addCall, emptyDay, mergeDays, daySummary, capCheck, callerFromStack, utcDay } from './aiSpend.js';

test('list price for Sonnet 5; env override wins; unknown model has none', () => {
  assert.equal(priceFor('anthropic', 'claude-sonnet-5').in, 2);
  assert.equal(priceFor('anthropic', 'claude-sonnet-5', { anthropic: { in: 9, out: 9 } }).in, 9);
  assert.equal(priceFor('deepseek', 'deepseek-chat'), null);
});

test('the 2026-11-04 desk run prices at about $3.23 on Sonnet 5', () => {
  const usd = usdOf({ in: 674822, out: 187772 }, priceFor('anthropic', 'claude-sonnet-5'));
  assert.ok(Math.abs(usd - 3.2274) < 0.001, String(usd));
});

test('addCall sums by caller, counts failures without a reply, and skips cost for unpriced providers', () => {
  const d = emptyDay('2026-11-04');
  addCall(d, { provider: 'anthropic', model: 'claude-sonnet-5', task: 'desk-head', label: 'lit:dossier', ok: true, usage: { in: 1e6, out: 1e5 } });
  addCall(d, { provider: 'anthropic', model: 'claude-sonnet-5', task: 'desk-head', label: 'lit:dossier', ok: false, httpStatus: 0 });
  addCall(d, { provider: 'deepseek', model: 'deepseek-chat', task: 'desk-news', label: 'news', ok: true, usage: { in: 1000, out: 100 } });
  addCall(d, { provider: 'anthropic', model: 'claude-sonnet-5', task: 'desk-head', label: 'lit:dossier', blocked: true });
  const s = daySummary(d);
  assert.equal(s.anthropicUsd, 3);
  assert.equal(s.noReply, 1);
  assert.equal(s.blocked, 1);
  assert.equal(s.rows[0].label, 'lit:dossier');
  assert.equal(s.rows[0].calls, 2);
  assert.equal(s.rows.find(r => r.provider === 'deepseek').priced, false);
});

test('mergeDays adds two halves of the same day', () => {
  const a = addCall(emptyDay('d'), { provider: 'anthropic', model: 'claude-sonnet-5', task: 't', label: 'x', ok: true, usage: { out: 1e5 } });
  const b = addCall(emptyDay('d'), { provider: 'anthropic', model: 'claude-sonnet-5', task: 't', label: 'x', ok: true, usage: { out: 1e5 } });
  const m = mergeDays(a, b);
  assert.equal(m.anthropicUsd, 2);
  assert.equal(Object.values(m.rows)[0].calls, 2);
});

test('capCheck blocks Anthropic only, and only when a cap is set', () => {
  assert.equal(capCheck({ provider: 'anthropic', spentUsd: 20, cap: 20 }).ok, false);
  assert.equal(capCheck({ provider: 'anthropic', spentUsd: 19.9, cap: 20 }).ok, true);
  assert.equal(capCheck({ provider: 'deepseek', spentUsd: 99, cap: 20 }).ok, true);
  assert.equal(capCheck({ provider: 'anthropic', spentUsd: 99, cap: 0 }).ok, true);
});

test('callerFromStack skips the plumbing', () => {
  const stack = 'Error\n    at callModel (/app/server.js:1:1)\n    at async _modelJson (/app/server.js:2:2)\n    at async _rpThreadReply (/app/server.js:3:3)';
  assert.equal(callerFromStack(stack), '_rpThreadReply');
  const route = 'Error\n    at callModel (file:///app/server.js:1:1)\n    at file:///app/server.js:8850:15\n    at next (/app/node_modules/express/lib/router/route.js:149:13)';
  assert.equal(callerFromStack(route), 'server.js:8850');
  const route2 = 'Error\n    at callModel (file:///app/server.js:1:1)\n    at next (/app/node_modules/express/lib/router/route.js:149:13)';
  assert.equal(callerFromStack(route2), null);
});

test('utcDay', () => assert.equal(utcDay(Date.UTC(2026, 10, 4, 23, 59)), '2026-11-04'));
