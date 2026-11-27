import test from 'node:test';
import assert from 'node:assert/strict';
import { londonParts, emptyState, normaliseState, planAlerts, alertText, memoryEvent, liveUsable, overnightAlerts, morningDue, todaysEvents, buildDigest, DEDUPE_MS, DAILY_CAP } from './jarvisLogic.js';

const T0 = Date.parse('2026-11-18T10:00:00Z');   // Wed, GMT
const ev = (id, kind = 'broke') => ({ kind, level: 'warn', id, text: `The link ${id} just broke.` });

test('londonParts handles GMT and BST and weekday', () => {
  assert.deepEqual(londonParts(Date.parse('2026-01-14T06:30:00Z')), { date: '2026-01-14', hm: '06:30', mins: 390, dow: 'Wed', weekday: true });
  const b = londonParts(Date.parse('2026-07-14T05:30:00Z'));   // 06:30 BST
  assert.equal(b.hm, '06:30'); assert.equal(b.date, '2026-07-14');
  assert.equal(londonParts(Date.parse('2026-07-14T23:30:00Z')).date, '2026-07-15');   // London midnight, not UTC
  assert.equal(londonParts(Date.parse('2026-11-21T12:00:00Z')).weekday, false);
});

test('alert text carries the prefix and the suffix', () => {
  assert.equal(alertText(ev('a')), 'Helix: The link a just broke. (description, not a trade)');
});

test('the same event is sent once per 6 hours, again after', () => {
  const a = planAlerts(emptyState(), [ev('x')], T0);
  assert.equal(a.send.length, 1);
  assert.equal(planAlerts(a.state, [ev('x')], T0 + DEDUPE_MS - 1).send.length, 0);
  assert.equal(planAlerts(a.state, [ev('x')], T0 + DEDUPE_MS + 1).send.length, 1);
  assert.equal(planAlerts(a.state, [ev('x', 'healed')], T0 + 1000).send.length, 1);   // another kind is another event
});

test('the cap is 12 per London day and resets on the next London date', () => {
  const many = Array.from({ length: 20 }, (_, i) => ev('l' + i));
  const a = planAlerts(emptyState(), many, T0);
  assert.equal(a.send.length, DAILY_CAP);
  assert.equal(planAlerts(a.state, [ev('fresh')], T0 + 60_000).send.length, 0);
  assert.equal(planAlerts(a.state, [ev('fresh')], T0 + 24 * 3600_000).send.length, 1);
});

test('planAlerts never mutates its input and skips empty events', () => {
  const s = emptyState(), snap = JSON.stringify(s);
  planAlerts(s, [ev('x'), null, { kind: 'k', id: 'i' }], T0);
  assert.equal(JSON.stringify(s), snap);
});

test('normaliseState survives junk', () => {
  assert.deepEqual(normaliseState('not json'), emptyState());
  assert.deepEqual(normaliseState(null), emptyState());
  const s = normaliseState(JSON.stringify({ sent: { a: 5, b: 'x' }, log: [{ at: 1, text: 't' }, { nope: 1 }], digestDate: '2026-11-18' }));
  assert.deepEqual(s.sent, { a: 5 }); assert.equal(s.log.length, 1); assert.equal(s.digestDate, '2026-11-18');
});

test('memoryEvent: none when ok or no limit', () => {
  assert.equal(memoryEvent(500, 0, 'ok'), null);
  assert.equal(memoryEvent(500, 1000, 'ok'), null);
  assert.match(memoryEvent(900, 1000, 'high').text, /900 MB, high against your 1000 MB limit/);
});

test('liveUsable: frozen or missing live block means no alerts', () => {
  assert.equal(liveUsable(null), false);
  assert.equal(liveUsable({ ok: true, frozen: true }), false);
  assert.equal(liveUsable({ ok: true, frozen: false }), true);
});

test('morningDue: weekdays 06:30 to 11:00 London, once', () => {
  const at = iso => Date.parse(iso);
  assert.equal(morningDue(at('2026-11-18T06:29:00Z'), ''), false);
  assert.equal(morningDue(at('2026-11-18T06:30:00Z'), ''), true);
  assert.equal(morningDue(at('2026-11-18T06:30:00Z'), '2026-11-18'), false);
  assert.equal(morningDue(at('2026-11-18T11:30:00Z'), ''), false);
  assert.equal(morningDue(at('2026-11-21T07:00:00Z'), ''), false);          // Saturday
  assert.equal(morningDue(at('2026-07-15T05:30:00Z'), ''), true);           // 06:30 BST
  assert.equal(morningDue(at('2026-07-15T05:29:00Z'), ''), false);
});

test('overnightAlerts keeps the last 14 hours, oldest first', () => {
  const log = [{ at: T0 - 20 * 3600_000, text: 'old' }, { at: T0 - 3600_000, text: 'b' }, { at: T0 - 5 * 3600_000, text: 'a' }];
  assert.deepEqual(overnightAlerts(log, T0).map(x => x.text), ['a', 'b']);
});

test('todaysEvents keeps high impact on the London date', () => {
  const rows = [{ ms: Date.parse('2026-11-18T13:30:00Z'), ccy: 'USD', rank: 3, event: 'CPI' }, { ms: Date.parse('2026-11-18T13:30:00Z'), ccy: 'USD', rank: 2, event: 'minor' }, { ms: Date.parse('2026-11-19T13:30:00Z'), ccy: 'USD', rank: 3, event: 'tomorrow' }];
  assert.deepEqual(todaysEvents(rows, '2026-11-18'), [{ time: '13:30', ccy: 'USD', event: 'CPI' }]);
  assert.deepEqual(todaysEvents(null, '2026-11-18'), []);
});

test('buildDigest: template text, five movers, no forecast words', () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ key: 'k' + i, label: 'M' + i, text: '+1.0%', ratio: 3 - i * 0.1, why: 'w' }));
  const d = buildDigest({ date: '2026-11-18', summary: { headline: 'Most links hold.', holding: 9, broken: 2 }, radar: { items, broken: [{ short: 'real→gold' }] }, alerts: [{ at: 1, text: 'x' }], events: [{ time: '13:30', ccy: 'USD', event: 'CPI' }] });
  assert.equal(d.movers.length, 5);
  assert.match(d.text, /9 holding, 2 broken/); assert.match(d.text, /Broken links: real→gold/); assert.match(d.text, /Alerts overnight: 1/); assert.match(d.text, /13:30 USD CPI/);
  assert.match(d.text, /\(description, not a trade\)$/);
  assert.doesNotMatch(d.text, /\b(will|buy|sell)\b/i);
});

test('buildDigest degrades: no chain, no calendar, no alerts', () => {
  const d = buildDigest({ date: '2026-11-18' });
  assert.equal(d.summary, null); assert.match(d.text, /not available/); assert.match(d.text, /No alerts overnight/); assert.deepEqual(d.events, []);
  assert.doesNotMatch(d.text, /releases/);
});

test('Helix brand, links back, quiet hours and the tab watcher gate', async () => {
  const L = await import('./jarvisLogic.js');
  assert.equal(L.BRAND, 'Helix');
  assert.equal(L.helixLink('mfx.up.railway.app', 'reactor'), 'https://mfx.up.railway.app/desk-terminal.html#helix/reactor');
  assert.equal(L.helixLink('https://x.example.com/', 'alerts'), 'https://x.example.com/desk-terminal.html#helix/alerts');
  assert.equal(L.helixLink('', 'x'), ''); assert.equal(L.helixLink('javascript:alert(1)'), ''); assert.equal(L.helixLink('evil.com/path?x'), '');
  assert.equal(L.alertView({ kind: 'broke' }), 'reactor'); assert.equal(L.alertView({ kind: 'big' }), 'radar'); assert.equal(L.alertView({ kind: 'memory' }), 'system'); assert.equal(L.alertView({}), 'alerts');
  const at = (iso) => Date.parse(iso);
  assert.equal(L.inQuiet(at('2026-11-27T23:30:00Z')), true); assert.equal(L.inQuiet(at('2026-11-27T06:59:00Z')), true); assert.equal(L.inQuiet(at('2026-11-27T07:00:00Z')), false);
  assert.equal(L.inQuiet(at('2026-07-01T06:30:00Z')), false, 'BST: 06:30 UTC is 07:30 London');
  assert.equal(L.inQuiet(at('2026-11-27T12:00:00Z'), { from: 600, to: 900 }), true); assert.equal(L.inQuiet(at('2026-11-27T12:00:00Z'), null), false);
  const ev = id => ({ kind: 'broke', id, text: `link ${id}` }), noon = at('2026-11-27T12:00:00Z');
  let g = L.gateTabAlerts(null, [ev('a'), ev('b')], noon); assert.equal(g.loud.length, 2); assert.equal(g.state.dayCount, 2);
  g = L.gateTabAlerts(g.state, [ev('a'), ev('c')], noon + 60_000); assert.deepEqual(g.loud.map(e => e.id), ['c'], 'a repeat inside 6 h is dropped');
  g = L.gateTabAlerts(g.state, [ev('d')], noon, { cap: 3 }); assert.equal(g.loud.length, 0); assert.equal(g.quiet.length, 1, 'over the cap: listed, not spoken');
  const night = L.gateTabAlerts(null, [ev('z')], at('2026-11-27T23:00:00Z')); assert.equal(night.loud.length, 0); assert.equal(night.quiet.length, 1);
  assert.match(L.buildDigest({ date: '2026-11-27', link: 'https://x/desk-terminal.html#helix/today' }).text, /^Helix: while you slept[\s\S]*Open in Helix: https:\/\/x\//);
});
