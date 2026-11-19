import test from 'node:test'; import assert from 'node:assert/strict';
import { pickDates, frameDelay, buildFrames, captionsFor, biggestMover, closingCaption } from './jarvisFilmCore.js';

const edge = (id, verdict) => ({ id, verdict, short: id });
const node = (key, delta, moved, text) => ({ key, end: { delta, floor: 1, moved, text } });
const g = (edges, nodes) => ({ edges, nodes });
const day = (date, v, delta) => ({ date, graph: g([edge('a-b', v)], [node('oil', delta, Math.abs(delta) >= 1, `${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)}%`)]) });

test('pickDates takes the last n, oldest first', () => { assert.deepEqual(pickDates(['1', '2', '3', '4', '5', '6', '7'], 5), ['3', '4', '5', '6', '7']); assert.deepEqual(pickDates(null), []); });
test('frameDelay by speed', () => { assert.equal(frameDelay(1), 1500); assert.equal(frameDelay(2), 750); assert.equal(frameDelay(4), 375); assert.equal(frameDelay(9), 1500); });
test('frames, captions, closing', () => {
  const fr = buildFrames([day('d1', 'holding', 0.2), day('d2', 'broken', 2.5), day('d3', 'holding', 0.1), { date: 'x', graph: null }], { oil: 'Oil' });
  assert.equal(fr.length, 3); assert.deepEqual(fr[0].events, []);
  const c2 = captionsFor(fr[1]); assert.ok(c2.some(c => c.kind === 'broke' && c.text.startsWith('d2: ')));
  assert.ok(c2.some(c => c.kind === 'big' && /Oil/.test(c.text)));
  assert.ok(captionsFor(fr[2]).some(c => c.kind === 'healed'));
  const m = biggestMover(fr); assert.equal(m.key, 'oil'); assert.equal(m.date, 'd2');
  const cl = closingCaption(fr); assert.match(cl, /1 link broke and 1 link healed/); assert.match(cl, /Oil/);
  assert.doesNotMatch(cl, /\bwill\b|\bbuy\b|\bsell\b/i);
});
test('closing handles short and quiet runs', () => {
  assert.match(closingCaption([]), /Not enough/);
  assert.match(closingCaption(buildFrames([day('a', 'holding', 0.1), day('b', 'holding', 0.1)])), /0 links broke and 0 links healed\. Nothing moved/);
  assert.deepEqual(captionsFor(null), []);
});
