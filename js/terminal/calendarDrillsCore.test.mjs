// node --test js/terminal/calendarDrillsCore.test.mjs: the calendar drills' pure rules (number parsing, nowcast gap with its evidence grade, similar releases, earnings by day, scorecard lines, row matching).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNum, nowcastKind, nowcastGap, similarReleases, earningsByDay, scorecardLines, recentScorecards, rowSignature, sameRow, NOWCAST_EVIDENCE } from './calendarDrillsCore.js';

test('numbers on a calendar row parse with their suffixes, and junk is null', () => {
  assert.equal(parseNum('0.3%'), 0.3); assert.equal(parseNum('-1.2'), -1.2); assert.equal(parseNum('−0.4%'), -0.4); assert.equal(parseNum('2.5K'), 2500); assert.equal(parseNum('1,250'), 1250);
  assert.equal(parseNum(''), null); assert.equal(parseNum('n/a'), null); assert.equal(parseNum(null), null); assert.equal(parseNum(0.5), 0.5);
});
test('only the matching US rows have a nowcast', () => {
  assert.equal(nowcastKind({ country: 'US', event: 'Core Inflation Rate MoM' }).kind, 'core');
  assert.equal(nowcastKind({ country: 'US', event: 'Inflation Rate MoM' }).kind, 'cpi');
  assert.equal(nowcastKind({ country: 'US', event: 'GDP Growth Rate QoQ Adv' }).kind, 'gdp');
  assert.equal(nowcastKind({ country: 'US', event: 'Core PCE Price Index MoM' }), null);
  assert.equal(nowcastKind({ country: 'GB', event: 'Inflation Rate MoM' }), null);
  assert.equal(nowcastKind({ country: 'US', event: 'GDP Price Index QoQ' }), null);
});
test('the nowcast gap says how far it is from consensus and carries its evidence grade (CPI null, GDP context)', () => {
  const nc = { cleveland: { month: '2026-11', asOf: '2026-11-14', cpi: 0.31, core: 0.27 }, gdpnow: { quarter: '2026-11-13', value: 2.4 } };
  const g = nowcastGap({ country: 'US', event: 'Core Inflation Rate MoM', estimate: '0.3%' }, nc);
  assert.equal(g.kind, 'core'); assert.equal(g.gap, -0.03); assert.match(g.words, /about the same/); assert.equal(g.evidence.grade, 'null'); assert.match(g.words, /no usable edge/);
  const c = nowcastGap({ country: 'US', event: 'Inflation Rate MoM', estimate: '0.2%' }, nc);
  assert.equal(c.gap, 0.11); assert.match(c.words, /0\.11 points above it/);
  const d = nowcastGap({ country: 'US', event: 'GDP Growth Rate QoQ Adv', estimate: '2.0%' }, nc);
  assert.equal(d.evidence.grade, 'context'); assert.match(d.words, /not tested as a lean/);
  assert.equal(nowcastGap({ country: 'US', event: 'Inflation Rate MoM', estimate: '' }, nc), null, 'no estimate, no gap');
  assert.equal(nowcastGap({ country: 'US', event: 'Inflation Rate MoM', estimate: '0.2%' }, { cleveland: null }), null, 'no nowcast, no gap');
  assert.ok(!/\b(buy|sell|long|short|bullish|bearish)\b/i.test(g.words + c.words + d.words), 'no lean wording');
  assert.ok(NOWCAST_EVIDENCE.cpi.id === 'nowcast-gap-cpi' && NOWCAST_EVIDENCE.gdp.id === 'nowcast-gap-gdp');
});
test('similar releases: what this release did to each market in size, direction as a coin flip; a release the book has no line for is null', () => {
  const s = similarReleases({ country: 'US', event: 'Core CPI MoM' });
  assert.ok(s.events > 50 && s.rows.length >= 3 && s.rows[0].spike >= s.rows[1].spike); assert.match(s.words, /coin flip/); assert.match(s.words, /ordinary half-hour/);
  assert.equal(similarReleases({ country: 'US', event: 'Totally Unknown Release Name' }), null);
  assert.ok(!/\b(buy|sell|bullish|bearish)\b/i.test(s.words));
});
test('earnings by day: this week only, biggest first, capped per day, junk dropped', () => {
  const now = Date.parse('2026-11-16T09:00:00Z');
  const rows = [{ date: '2026-11-16', symbol: 'AAA', name: 'A Corp', capB: 300, when: 'after the close' }, { date: '2026-11-16', symbol: 'BBB', name: 'B Corp', capB: 900, when: 'before the open' },
    { date: '2026-11-18', symbol: 'CCC', name: 'C Corp', capB: 200 }, { date: '2026-11-10', symbol: 'OLD', capB: 999 }, { date: '2026-12-30', symbol: 'FAR', capB: 999 }, { date: 'x', symbol: 'BAD' }, { symbol: 'NODATE' }, null];
  const r = earningsByDay(rows, { now, perDay: 1 });
  assert.deepEqual(r.map(d => d.date), ['2026-11-16', '2026-11-18']); assert.equal(r[0].items[0].symbol, 'BBB'); assert.equal(r[0].total, 2); assert.equal(r[0].items.length, 1);
  assert.match(r[0].label, /Mon 16 Nov/); assert.deepEqual(earningsByDay(null, { now }), []);
});
test('scorecard lines: size against a normal half-hour; the owner\'s private call only for the owner', () => {
  const card = { key: 'US|1', country: 'US', ms: 1, prints: [{ event: 'Core CPI MoM', actual: '0.4%', estimate: '0.3%', prev: '0.3%' }], reactions: [{ name: 'EURUSD', move: 18, unit: 'pips', dir: 'down', ratio: 2.1, book: { spike: 2.9, n: 124 } }], call: { call: 'higher', result: 'hit' } };
  const v = scorecardLines(card, { owner: false });
  assert.match(v.head, /Core CPI MoM: 0\.4%, higher than the 0\.3% expected/); assert.match(v.lines[0], /EUR\/USD moved 18 pips down in 30 min, 2\.1× a normal half-hour \(the book: 2\.9× on 124 prints\)/);
  assert.equal(v.call, undefined, 'a desk login never sees the owner\'s call');
  assert.match(scorecardLines(card, { owner: true }).call, /Your call: higher \(right\)/);
  assert.deepEqual(scorecardLines({ country: 'GB', prints: [], reactions: [null] }).lines, []);
});
test('recent scorecards: newest first, capped, empty ones dropped', () => {
  const cards = [{ ms: 1, prints: [{}] }, { ms: 3, prints: [{}] }, { ms: 2, prints: [] }, null, { ms: 4, prints: [{}] }];
  assert.deepEqual(recentScorecards(cards, 2).map(c => c.ms), [4, 3]); assert.deepEqual(recentScorecards(null), []);
});
test('a drawn row matches its event by time, country and name', () => {
  const e = { ms: Date.parse('2026-11-16T13:30:00Z'), country: 'US', event: ' Core CPI MoM ' };
  const sig = rowSignature(e); assert.deepEqual(sig, { time: '13:30', country: 'US', event: 'Core CPI MoM' });
  assert.ok(sameRow(sig, { time: '13:30', country: 'US', event: 'Core CPI MoM' })); assert.ok(!sameRow(sig, { time: '14:30', country: 'US', event: 'Core CPI MoM' }));
});
