import test from 'node:test';
import assert from 'node:assert/strict';
import * as V from './roomView.js';

test('every message kind renders, and text is escaped', () => {
  const kinds = [
    { key: 'a', kind: 'owner', who: 'owner', text: 'my <idea>', at: '2026-11-12T01:00:00Z' },
    { key: 'b', kind: 'brief', who: 'translator', brief: { title: 'T', hypothesis: 'H', target: { label: 'EURUSD' }, variables: [{ name: 'Gap', role: 'leader', construction: 'x' }], method: { lags: '1-20', regimes: ['VIX'] }, question: 'Which regime?' }, dataCheck: { quickTestReady: false, target: { id: 'oanda:EURUSD', have: true }, variables: [] } },
    { key: 'c', kind: 'onfile', who: 'onfile', entries: [{ id: 'jump-diffusion', verdict: 'context', claim: 'jumps' }] },
    { key: 'd', kind: 'library', who: 'librarian', papers: [{ id: 'p', title: 'Vol-managed', year: 2017 }] },
    { key: 'e', kind: 'answer', who: 'quant', round: 1, headline: 'Size by vol', text: 'reply', questions: ['which pairs?'], proposals: [{ id: 'p1', title: 'Vol sizing' }] },
    { key: 'f', kind: 'talk', who: 'skeptic', text: 'overfit risk', replyTo: 'quant' },
    { key: 'g', kind: 'talk', who: 'macro', pass: true },
    { key: 'h', kind: 'head', who: 'head', headline: 'Test sizing first', agree: ['a'], disagree: ['b'], nextStep: 'quick-test', plan: { variable: 'vol', benchmark: 'flat' } },
    { key: 'i', kind: 'system', who: 'system', text: 'Round 1' },
    { key: 'j', kind: 'error', who: 'flow', text: 'did not answer' },
    { key: 'k', kind: 'pending', who: 'owner', text: 'go on' },
  ];
  const h = V.conversationHtml(kinds);
  assert.ok(!h.includes('<idea>') && h.includes('my &lt;idea&gt;'));
  for (const s of ['Translator', 'Which regime?', 'CONTEXT', 'Vol-managed', 'Size by vol', 'Asks you', 'proposal: Vol sizing', 'to Quant researcher', 'Macro researcher passed', 'next: quick-test', 'Round 1', 'did not answer', 'waiting for the researchers', 'EURUSD'])
    assert.ok(h.includes(s), s);
  assert.equal(V.messageHtml({ kind: 'nonsense' }), '');
  const pic = V.messageHtml({ key: 'p', kind: 'owner', who: 'owner', text: 'see chart', images: [{ id: 'img1', url: '/api/research-pod/image?id=img1' }] });
  assert.match(pic, /<img src="\/api\/research-pod\/image\?id=img1"/);
});

test('the rooms list groups by who it waits on; the table places every seat', () => {
  const row = (id, on) => ({ id, title: `Room ${id}`, isRoom: true, updatedAt: '2026-11-12T01:00:00Z', waiting: { on, why: on }, stages: [{ state: 'done' }, { state: 'now' }], seats: [{ who: 'quant', short: 'Q', state: 'spoke' }], last: { who: 'quant', label: 'Quant', text: 'hi' } });
  const h = V.roomsList([row('a', 'you'), row('b', 'team'), row('c', 'closed')]);
  assert.ok(h.indexOf('Room a') < h.indexOf('The team is working') && h.indexOf('Room b') > h.indexOf('The team is working') && h.indexOf('Room c') > h.indexOf('Parked'));
  assert.match(h, /href="#room=a"/);
  const t = V.tableHtml([{ who: 'quant', state: 'spoke' }, { who: 'head', state: 'idle', note: 'when you call' }, { who: 'volopt', state: 'suggested' }], { title: 'X', waiting: { on: 'you' } });
  assert.equal((t.match(/class="seat /g) ?? []).length, 3); assert.match(t, /data-seat="volopt"/); assert.match(t, /waiting on you/);
});

test('the guests box: accept is disabled when the chairs are full; the bench toggles', () => {
  const guests = { volopt: { label: 'Vol & options' }, rates: { label: 'Rates & curves' }, skeptic: { label: 'Skeptic' } };
  const full = V.guestsBox({ room: { guests: ['volopt', 'rates'], suggested: ['skeptic'] }, guests, maxGuests: 2, seats: [{ who: 'flow', kind: 'core', state: 'benched' }] });
  assert.match(full, /2 of 2 chairs used/); assert.match(full, /data-action="accept" data-who="skeptic" disabled/); assert.match(full, /Bring back Flow/);
  const open = V.guestsBox({ room: { guests: [], suggested: ['skeptic'] }, guests, seats: [] });
  assert.ok(!/data-who="skeptic" disabled/.test(open)); assert.match(open, /\+ Vol &amp; options/);
});

test('the stage line marks done and now', () => {
  const h = V.stageLine([{ label: 'Brief', state: 'done' }, { label: 'Head', state: 'now' }]);
  assert.match(h, /st-done">✓ Brief/); assert.match(h, /st-now">Head/);
});
