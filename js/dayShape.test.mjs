import assert from 'node:assert/strict';
import { percentileIn, sizeWord, sizeRows, clockRows, stateRows, closestFlags, dayShape } from './dayShape.js';

// percentile: last value among the last n; too short is null
const ramp = Array.from({ length: 100 }, (_, i) => i + 1);
assert.equal(percentileIn(ramp), 100);
assert.equal(percentileIn([...ramp].reverse()), 1);
assert.equal(percentileIn(ramp.slice(0, 30)), null);
assert.equal(percentileIn([...ramp, null]), 100, 'a trailing null is skipped, not counted');

// size words
assert.equal(sizeWord(85), 'wide'); assert.equal(sizeWord(50), 'normal'); assert.equal(sizeWord(10), 'narrow'); assert.equal(sizeWord(null), '');

// size rows: from the brief, falling back to the forecast, none when the market has neither
const rows = sizeRows({
  instruments: { NQ: { levels: { hl_med: { pct: 1.3 }, hl_75: { pct: 1.7 } }, vol_pct: 62 } },
  fc: { instruments: { GOLD: { hl_median: 1.1, hl_75: 1.5, vol_pct: 15 } } },
  sess: { instruments: { NQ: { hl: 0.65 } } },
});
assert.deepEqual(rows.map(r => r.key), ['NQ', 'GOLD']);
assert.equal(rows[0].word, 'above normal'); assert.equal(rows[0].used, 50); assert.equal(rows[1].word, 'narrow'); assert.equal(rows[1].used, null);

// clock: only high impact inside the window, in time order, capped; past text only when the record has it
const now = Date.UTC(2026, 10, 2, 8, 0);
const ev = (h, impact, event, ccy) => ({ ms: now + h * 3.6e6, impact, event, ccy });
const c = clockRows({ events: [ev(3, 'high', 'Core CPI m/m', 'USD'), ev(1, 'high', 'Cash Rate', 'AUD'), ev(2, 'medium', 'X', 'EUR'), ev(30, 'high', 'Late', 'USD')], eventDay: { events: [] }, nowMs: now });
assert.deepEqual(c.map(x => x.name), ['Cash Rate', 'Core CPI m/m']);
assert.equal(c[0].past, '');
assert.equal(clockRows({ events: [], nowMs: now }).length, 0);

// state rows: percentile of own history; the term ratio is its own bar against the 1.00 line
const s = stateRows({ drill: { series: { vix: [...ramp] , hy: ramp.slice(0, 30), us10y: ramp.map(x => 4 + x / 100), us2y: ramp.map(() => 4) } }, flags: [{ key: 'vix_term', value: 0.89 }] });
assert.deepEqual(s.map(x => x.key), ['vix', 'term', 'curve']);
assert.equal(s.find(x => x.key === 'term').pct, 89);
assert.ok(!s.some(x => x.key === 'hy'), 'a series with too little history is left out, not guessed');

// closest flags: a flag that is on first, then by share
const prox = [{ name: 'a', share: 0.2, on: false }, { name: 'b', share: 0.9, on: false }, { name: 'c', share: 0.5, on: true }];
assert.deepEqual(closestFlags(prox).map(x => x.name), ['c', 'b']);

// whole: badge from the flags, scores pass through, no data gives empty parts and no throw
const w = dayShape({ rf: { active: 0, available: 5, flags: [] }, prox, scores: [{ sym: 'NQ', label: 'Nasdaq', score: 5, band: 'No direction', extra: 1 }], nowMs: now });
assert.equal(w.badge, '0/5 flags'); assert.deepEqual(w.scores, [{ sym: 'NQ', label: 'Nasdaq', score: 5, band: 'No direction' }]);
const e = dayShape({});
assert.equal(e.badge, ''); assert.deepEqual(e.size, []); assert.deepEqual(e.clock, []); assert.deepEqual(e.state, []);
console.log('dayShape: ok');
