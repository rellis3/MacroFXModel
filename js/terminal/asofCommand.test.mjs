// js/terminal/asofCommand.test.mjs: the ASOF command line commands and the date reader. node --test js/terminal/asofCommand.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommands, search, plainAction, parseAsofText } from './commandCore.js';
import { perform } from './commandLine.js';

const NOW = Date.parse('2026-11-16T10:00:00Z');
const all = buildCommands({ now: () => NOW });
const run = line => { const r = search(all, line, { limit: 3 })[0]; return r; };

test('the date reader: day month time, ISO, date alone (12:00), no year = this year; unreadable is null', () => {
  const iso = s => { const v = parseAsofText(s, NOW); return v == null ? null : new Date(v).toISOString(); };
  assert.equal(iso('12 nov 14:30'), '2026-11-12T14:30:00.000Z'); assert.equal(iso('12 november'), '2026-11-12T12:00:00.000Z'); assert.equal(iso('2026-11-12 14:30'), '2026-11-12T14:30:00.000Z');
  assert.equal(iso('2026-11-12'), '2026-11-12T12:00:00.000Z'); assert.equal(iso('15 nov 2026 09:30'), '2026-11-15T09:30:00.000Z');
  for (const bad of ['', 'tomorrow', '31 nov', '99 nov', 'nov 12']) assert.equal(iso(bad), null, bad);
});

test('ASOF turns into the right action: open, live, step, set; an unreadable time gets a plain error with examples', () => {
  const a = line => run(line);
  const bare = plainAction(a('asof').cmd); assert.equal(bare.action.kind, 'asof'); assert.equal(bare.action.op, 'open');
  assert.equal(a('asof live').action.op, 'live');
  const st = a('asof -1d'); assert.equal(st.action.op, 'step'); assert.equal(st.action.ms, -86_400_000);
  const set = a('asof 12 nov 14:30'); assert.equal(set.action.op, 'set'); assert.equal(set.action.t, Date.parse('2026-11-12T14:30:00Z')); assert.match(set.summary, /Thu 12 Nov 14:30 UTC/);
  assert.match(a('asof banana').error ?? '', /could not read "banana"/);
});

test('a desk login with the preview off is not offered ASOF at all; the owner is', () => {
  assert.ok(buildCommands({ isOn: () => true, now: () => NOW }).some(c => c.id === 'asof'));
  assert.ok(!buildCommands({ isOn: id => id !== 'widget.asof', now: () => NOW }).some(c => c.id === 'asof'));
});

test('perform(): the asof action calls the clock; with no clock on the page it does nothing and says false', () => {
  const calls = [];
  assert.equal(perform({ kind: 'asof', op: 'live' }, {}, { deskAsof: { act: a => { calls.push(a); return true; } } }), true); assert.deepEqual(calls, [{ kind: 'asof', op: 'live' }]);
  assert.equal(perform({ kind: 'asof', op: 'live' }, {}, {}), false);
});
