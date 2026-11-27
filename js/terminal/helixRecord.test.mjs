import test from 'node:test'; import assert from 'node:assert/strict';
import { dayRecordBody, postDayRecord } from './helixRecord.js';

test('the record body carries inputs, headline, the plan with every scene text, and the London date', () => {
  const inp = { movers: [{ key: 'NQ', oc: 1.2, ratio: 2.1, tone: 'up' }], board: { tone: 'mixed' }, chain: { holding: 3 }, events: [{ time: '13:30', country: 'US', event: 'CPI' }], headline: { text: 'Gold jumps' }, degraded: { blocks: ['xccy'], partial: false } };
  const P = { items: [{ kind: 'open', title: 'THE MORNING BRIEFING', view: 'globe', text: 'Good morning.' }, { kind: 'scene', scene: { id: 'yields' }, title: 'The yield curve', view: 'yields', text: 'The curve...' }] };
  const b = dayRecordBody(inp, P, { mode: 'quick', part: 'morning', now: Date.parse('2026-11-27T23:30:00Z') });
  assert.equal(b.date, '2026-11-27'); assert.equal(b.plan.length, 2); assert.equal(b.plan[1].id, 'yields'); assert.equal(b.plan[0].text, 'Good morning.');
  assert.deepEqual(b.inputs.movers[0], { key: 'NQ', oc: 1.2, vsUsual: 2.1, tone: 'up' }); assert.equal(b.inputs.events.n, 1); assert.deepEqual(b.degraded, ['xccy']);
  assert.equal(dayRecordBody({ headline: { big: 'x'.repeat(400_000) } }, null).headline.dropped, 'too large for the record');
  assert.equal(dayRecordBody({}, null, { now: Date.parse('2026-07-01T23:30:00Z') }).date, '2026-07-02', 'London date (BST)');
});
test('postDayRecord never throws', async () => {
  assert.equal(await postDayRecord(async () => { throw new Error('down'); }, {}), null);
  let seen = null; await postDayRecord(async (u, o) => { seen = [u, o.method]; return { ok: true }; }, { date: 'x' }); assert.deepEqual(seen, ['/api/helix/record', 'POST']);
});
