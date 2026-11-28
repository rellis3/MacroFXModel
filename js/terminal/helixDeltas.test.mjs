import test from 'node:test'; import assert from 'node:assert/strict';
import { dayDeltas, dayDelta, prevRatios, daysBetween } from './helixDeltas.js';
import { planBroadcast } from './broadcastCore.js';

const prev = { date: '2026-11-26', close: { rows: { GOLD: { ratio: 2.3 }, NQ: { ratio: 2.5 }, EURUSD: { ratio: 0.3 } } }, parts: { morning: { movers: [{ key: 'GOLD', vsUsual: 1 }, { key: 'USDJPY', vsUsual: -2.2 }] } } };

test('prevRatios: the scored close wins over the morning movers', () => {
  const p = prevRatios(prev); assert.equal(p.GOLD.ratio, 2.3); assert.equal(p.GOLD.from, 'close'); assert.equal(p.USDJPY.from, 'morning');
  assert.deepEqual(prevRatios(null), {}); assert.equal(daysBetween('2026-11-27', '2026-11-30'), 3);
});

test('dayDeltas: again, reversal, wakes; best first; a weekend gap names the day; too old or no overlap gives nothing', () => {
  const inp = { movers: [{ key: 'GOLD', ratio: 2.1 }, { key: 'NQ', ratio: -1.4 }, { key: 'EURUSD', ratio: 2.2 }, { key: 'BTCUSD', ratio: 3 }] };
  const d = dayDeltas(inp, prev, '2026-11-27');
  assert.deepEqual(d.map(x => x.kind), ['again', 'reversal', 'wakes']);
  assert.equal(d[0].text, 'Gold has moved more than twice its usual for a second day running, the same way.');
  assert.match(d[1].text, /moving back against yesterday's big move/);
  assert.match(d[2].text, /was quiet yesterday/);
  assert.match(dayDelta(inp, { ...prev, date: '2026-11-27' }, '2026-11-30').text, /again, as it did on Friday/);
  assert.deepEqual(dayDeltas(inp, prev, '2026-12-05'), []); assert.deepEqual(dayDeltas(inp, prev, '2026-11-26'), []); assert.equal(dayDelta({ movers: [] }, prev, '2026-11-27'), null);
  assert.ok(!d.some(x => /\b(buy|sell|long|short|will)\b/i.test(x.text)), 'description only');
});

test('the planner says the day-on-day line at most once: with its lead mover, else in the Markets segment', () => {
  const rows = [{ key: 'GOLD', ratio: 2.4, oc: 1.9, tone: 'up', hl: 1, range: 1.6 }, { key: 'EURUSD', ratio: 1.3, oc: 0.3, tone: 'up' }, { key: 'NQ', ratio: 0.2, oc: 0.1, tone: 'quiet' }];
  const base = { now: new Date('2026-11-27T07:05:00Z'), rows, movers: rows.filter(r => r.tone !== 'quiet'), board: { n: 3, up: 2, dn: 0, quiet: 1 } };
  const text = P => P.items.map(x => x.text).join(' ');
  const line = 'Gold has moved more than twice its usual for a second day running, the same way.';
  const a = planBroadcast({ ...base, dayDelta: { key: 'GOLD', text: line } }, { mode: 'full' });
  assert.equal(text(a).split(line).length - 1, 1); assert.ok(a.items.find(x => x.kind === 'lead' && x.text.includes(line)));
  const other = 'Wheat was quiet yesterday, under half its usual move; today it has moved more than twice its usual.';
  const b = planBroadcast({ ...base, dayDelta: { key: 'WHEAT', text: other } }, { mode: 'full' });
  assert.equal(text(b).split(other).length - 1, 1); assert.ok(b.items.find(x => x.kind === 'scene' && x.scene.id === 'candles' && x.text.includes(other)));
  const c = planBroadcast(base, { mode: 'full' }); assert.ok(!/second day running|was quiet yesterday/.test(text(c)), 'no delta, no line');
});
