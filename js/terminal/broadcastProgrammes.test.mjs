// js/terminal/broadcastProgrammes.test.mjs: the extra programmes (weekly recap, release special), the opening hook and the Friday sign-off (Helix wave 4 items 9 and 13).
// Run: node js/terminal/broadcastProgrammes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { planBroadcast, openerLine, signoffLine, dateWords, SIGNOFF_TEXT, HOOKS } from './broadcastCore.js';

const fri = new Date('2026-11-27T21:10:00Z'), thu = new Date('2026-11-26T19:30:00Z'), friAm = new Date('2026-11-27T07:05:00Z');

test('the briefing opener is unchanged without a headline figure; with one it opens on the number, rotated by date', () => {
  const d = dateWords(friAm);
  assert.equal(openerLine({ date: d, part: 'morning' }), 'Good morning. This is Helix, with the morning briefing for Friday the twenty-seventh of November.');
  const head = { figure: { value: '2.4×', label: 'vs usual' } };
  const o = openerLine({ date: d, part: 'morning', head, when: 'this morning' });
  assert.ok(o.startsWith('2.4 times usual') && o.endsWith('This is Helix, with the morning briefing for Friday the twenty-seventh of November.'), o);
  const forms = new Set([0, 1, 2].map(k => openerLine({ date: { ...d, doy: k }, part: 'morning', head, when: 'today' }).split('Good')[0]));
  assert.equal(forms.size, HOOKS.length, 'three hooks, chosen by the day of the year');
});

test('the sign-off knows Friday night and the extra programmes', () => {
  assert.equal(signoffLine({ date: dateWords(thu), part: 'evening' }), SIGNOFF_TEXT);
  assert.match(signoffLine({ date: dateWords(fri), part: 'evening' }), /Until Monday, and have a good weekend\.$/);
  assert.equal(signoffLine({ date: dateWords(friAm), part: 'morning' }), SIGNOFF_TEXT);
  assert.match(signoffLine({ date: dateWords(fri), part: 'evening', programme: 'weekly' }), /^That is the week\. Description, not advice\./);
  assert.match(signoffLine({ date: dateWords(friAm), part: 'afternoon', programme: 'special' }), /evening briefing has the rest of the day/);
  for (const p of ['briefing', 'weekly', 'special']) assert.match(signoffLine({ date: dateWords(fri), part: 'evening', programme: p }), /Description, not advice/, 'the one disclaimer is always said');
});

test('the weekly recap and the release special plan as evening look-backs with their own title and words', () => {
  const W = planBroadcast({ now: fri }, { hooks: [], programme: 'weekly', mode: 'quick' });
  assert.equal(W.programme, 'weekly'); assert.equal(W.items[0].title, 'THE WEEKLY RECAP');
  assert.match(W.items[0].text, /with the weekly recap for the week to Friday the twenty-seventh of November\.$/);
  assert.match(W.items[W.items.length - 1].text, /^That is the week\./);
  const at = new Date('2026-12-04T14:10:00Z');
  const S = planBroadcast({ now: at }, { hooks: [], programme: 'special', mode: 'short', release: { name: 'Non-Farm Employment Change', ccy: 'USD', hm: '13:30' } });
  assert.equal(S.items[0].title, 'THE RELEASE SPECIAL');
  assert.equal(S.items[0].text, 'Good afternoon. This is Helix, with a release special on US Non-Farm Employment Change, out at 13:30 London time.');
  assert.match(S.items[S.items.length - 1].text, /^That is the special\./);
  assert.equal(planBroadcast({ now: at }, { hooks: [], programme: 'nonsense' }).programme, 'briefing', 'an unknown programme is the briefing');
});
