// Every job on the AI models page's "Scheduled AI jobs" list (server.js _AI_JOBS) must be a registered service that
// server.js actually schedules, or its tick box would pause nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SERVICES } from './serviceFlags.js';

const src = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const block = src.match(/var _AI_JOBS = \{([\s\S]*?)\n\};/);

test('the AI jobs list exists and every id is a scheduled, registered service', () => {
  assert.ok(block, 'var _AI_JOBS = { ... } not found in server.js');
  const ids = [...block[1].matchAll(/^\s*(\w+):\s*\{/gm)].map(m => m[1]);
  assert.ok(ids.length >= 10, `only ${ids.length} jobs listed`);
  for (const id of ids) {
    assert.ok(SERVICES.some(s => s.id === id), `${id} is not in js/serviceFlags.js`);
    assert.ok(new RegExp(`svc(Interval|Timeout|Boot)\\('${id}'`).test(src), `${id} is never scheduled in server.js`);
  }
});

test('svcRun checks the page switch before running a listed job', () => {
  const svcRun = src.match(/function svcRun\(id, fn\) \{([\s\S]*?)\n\}/);
  assert.ok(svcRun && /_AI_JOBS\[id\]/.test(svcRun[1]) && /_aiJobsOff\[id\]/.test(svcRun[1]));
});
