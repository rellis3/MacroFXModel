// js/terminal/mediaCore.test.mjs: the MEDIA section's pure half: London days, broadcast order, filters, YouTube addresses, the podcast resume rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { londonDate, dayLabel, groupByDay, filterItems, partsIn, clock, thumbUrl, embedUrl, watchUrl, resumeAt, nextSpeed, trimPositions, safeSrc } from './mediaCore.js';

const V = (id, part, at, title = `${part} ${id}`) => ({ id, part, at, title });
const items = [
  V('aaaaaaaaaa1', 'evening', '2026-11-27T21:30:00Z', 'H.E.L.I.X. Evening · Gold runs 2.4 times'),
  V('aaaaaaaaaa2', 'morning', '2026-11-27T07:40:00Z', 'H.E.L.I.X. Morning · Dollar firm'),
  V('aaaaaaaaaa3', 'short', '2026-11-27T08:10:00Z'),
  V('aaaaaaaaaa4', 'special', '2026-11-27T14:10:00Z'),
  V('aaaaaaaaaa5', 'weekly', '2026-11-27T19:00:00Z'),
  V('aaaaaaaaaa6', 'evening', '2026-11-28T00:13:36Z', 'H.E.L.I.X. Evening · Gold edges higher'),   // after midnight: the 28th in London
  V('aaaaaaaaaa7', 'morning', '2026-06-10T23:30:00Z'),                                            // BST: 00:30 on the 11th in London
];

test('London days and labels', () => {
  assert.equal(londonDate('2026-11-28T00:13:36Z'), '2026-11-28');
  assert.equal(londonDate('2026-06-10T23:30:00Z'), '2026-06-11', 'summer time');
  assert.equal(londonDate('nope'), null);
  assert.equal(dayLabel('2026-11-27'), 'Fri 27 Nov'); assert.equal(dayLabel('2025-12-31', 2026), 'Wed 31 Dec 2025'); assert.equal(dayLabel('2026-11-27', 2026), 'Fri 27 Nov');
});

test('groupByDay: newest day first; within a day morning, short, evening, weekly, specials', () => {
  const g = groupByDay(items, 2026);
  assert.deepEqual(g.map(d => d.day), ['2026-11-28', '2026-11-27', '2026-06-11']);
  assert.equal(g[1].label, 'Fri 27 Nov');
  assert.deepEqual(g[1].items.map(x => x.part), ['morning', 'short', 'evening', 'weekly', 'special']);
  assert.deepEqual(groupByDay([{ id: 'x', at: 'bad' }]), []);
});

test('filters: programme, date range (London, inclusive) and every search word in the title', () => {
  assert.deepEqual(filterItems(items, { part: 'evening' }).map(x => x.id), ['aaaaaaaaaa1', 'aaaaaaaaaa6']);
  assert.deepEqual(filterItems(items, { from: '2026-11-28' }).map(x => x.id), ['aaaaaaaaaa6']);
  assert.equal(filterItems(items, { from: '2026-11-27', to: '2026-11-27' }).length, 5);
  assert.deepEqual(filterItems(items, { q: 'gold EVENING' }).map(x => x.id), ['aaaaaaaaaa1', 'aaaaaaaaaa6']);
  assert.deepEqual(filterItems(items, { q: 'gold higher' }).map(x => x.id), ['aaaaaaaaaa6']);
  assert.equal(filterItems(items, {}).length, items.length);
  assert.deepEqual(partsIn(items), ['morning', 'short', 'evening', 'weekly', 'special']);
});

test('clock and the YouTube addresses (built from a checked id only)', () => {
  assert.equal(clock(271), '4:31'); assert.equal(clock(3725), '1:02:05'); assert.equal(clock(0), '0:00'); assert.equal(clock(null), '0:00'); assert.equal(clock('x'), '');
  assert.equal(thumbUrl('Dp72bawELA4'), 'https://i.ytimg.com/vi/Dp72bawELA4/mqdefault.jpg');
  assert.match(embedUrl('Dp72bawELA4'), /^https:\/\/www\.youtube-nocookie\.com\/embed\/Dp72bawELA4\?autoplay=1/);
  assert.equal(watchUrl('Lz5J1LqNiPo', 'short'), 'https://youtube.com/shorts/Lz5J1LqNiPo'); assert.equal(watchUrl('Dp72bawELA4', 'wide'), 'https://youtu.be/Dp72bawELA4');
  for (const f of [thumbUrl, embedUrl, watchUrl]) assert.equal(f('"><script>'), '');
});

test('podcast: resume rule, speeds, the saved positions stay small, and only the feed route plays', () => {
  assert.equal(resumeAt(120, 360), 120); assert.equal(resumeAt(3, 360), 0); assert.equal(resumeAt(355, 360), 0); assert.equal(resumeAt(120, NaN), 120); assert.equal(resumeAt(undefined, 300), 0);
  assert.equal(nextSpeed(1), 1.25); assert.equal(nextSpeed(1.25), 1.5); assert.equal(nextSpeed(1.5), 1); assert.equal(nextSpeed(3), 1);
  const m = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`ep${i}`, { t: i, at: i }]));
  const t = trimPositions({ ...m, bad: { t: 'x' } }, 60);
  assert.equal(Object.keys(t).length, 60); assert.ok(t.ep79 && !t.ep0 && !t.bad);
  assert.equal(safeSrc('/api/helix/podcast/KEY_123/2026-11-27-evening.mp3'), '/api/helix/podcast/KEY_123/2026-11-27-evening.mp3');
  for (const u of ['https://evil.example/x.mp3', 'javascript:alert(1)', '/api/helix/podcast/k/../x.mp3']) assert.equal(safeSrc(u), '');
});
