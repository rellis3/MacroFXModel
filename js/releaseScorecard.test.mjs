import assert from 'node:assert/strict';
import { groupReleases, measureReaction, unitOf, oandaSym, sideOf, scoreCall, summariseCalls, formatScorecard, sizeWord, familyOf } from './releaseScorecard.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const T0 = Date.parse('2026-09-11T12:30:00Z');

t('grouping: same country and minute is one event; window 31-60 min; high only', () => {
  const now = T0 + 40 * 60_000;
  const evs = [
    { country: 'US', event: 'CPI m/m', impact: 'high', ms: T0, estimate: '0.3%', actual: '0.4%' },
    { country: 'US', event: 'Core CPI m/m', impact: 'high', ms: T0, estimate: '0.3%', actual: '0.3%' },
    { country: 'US', event: 'Unemployment Claims', impact: 'medium', ms: T0, estimate: '207K' },
    { country: 'CA', event: 'CPI m/m', impact: 'high', ms: T0, estimate: '0.1%' },
    { country: 'US', event: 'Retail Sales m/m', impact: 'high', ms: T0 - 2 * 3600e3, estimate: '0.8%' },   // too old
    { country: 'GB', event: 'CPI y/y', impact: 'high', ms: now - 10 * 60_000, estimate: '3.1%' },        // too fresh
  ];
  const g = groupReleases(evs, { now });
  assert.equal(g.length, 2);
  assert.equal(g[0].prints.length, 2); assert.equal(g[0].prints[0].family, 'cpi');
  assert.equal(g[1].country, 'CA');
});
t('units and symbols', () => {
  assert.deepEqual(unitOf('EURUSD'), { mult: 10000, unit: 'pips', dp: 0 });
  assert.deepEqual(unitOf('USDJPY'), { mult: 100, unit: 'pips', dp: 0 });
  assert.equal(unitOf('GOLD').unit, '$'); assert.equal(oandaSym('EURUSD'), 'EUR_USD'); assert.equal(oandaSym('GOLD'), 'XAU_USD');
  assert.equal(familyOf('Non-Farm Employment Change'), 'employment');
});
t('reaction: last close before the print to the close 30 min after, against the median 30-min move', () => {
  // bars start at T0-30 ... T0+40; the bar starting AT the print is the first reaction bar
  const m5 = []; for (let k = -6; k <= 8; k++) { const p = 1.1000 + (k >= 0 ? 0.0003 * (k + 1) : 0); m5.push({ time: T0 + k * 5 * 60_000, open: p, high: p + 0.0002, low: p - 0.0001, close: p }); }
  // same-clock bars (12:30 UTC on prior weekdays) move 6 pips; every other slot moves 20 -- the baseline must be the same-clock one
  const m30 = []; for (let i = 1; i <= 1400; i++) { const t = T0 - i * 30 * 60_000; const d = new Date(t); const sameClock = d.getUTCHours() === 12 && d.getUTCMinutes() === 30; m30.push({ time: t, open: 1.1, close: 1.1 + (sameClock ? 0.0006 : 0.0020) * (i % 2 ? 1 : -1) }); }
  const r = measureReaction('EURUSD', T0, m5, m30);
  assert.equal(r.move, 18); assert.equal(r.dir, 'up'); assert.equal(r.unit, 'pips'); assert.equal(r.ordinary, 6); assert.equal(r.ordinaryBasis, 'same clock'); assert.equal(r.ratio, 3); assert.equal(r.bars30, 6);
  assert.equal(measureReaction('EURUSD', T0, m5.slice(0, 8), m30), null);   // fewer than four bars after the print: not measurable yet
  assert.equal(measureReaction('EURUSD', T0, m5, m30.slice(0, 10)).ratio, null);   // too few reference bars: no ratio, move still reported
});
t('size words against the book', () => {
  assert.equal(sizeWord(3.0, { spike: 2.9, n: 124 }), 'about what the book said');
  assert.equal(sizeWord(4.5, { spike: 2.9, n: 124 }), 'bigger than the book');
  assert.equal(sizeWord(1.2, { spike: 2.9, n: 124 }), 'smaller than the book');
  assert.equal(sizeWord(3.2, null), 'a big move');
});
t('calls: higher/lower as printed; in line is a push', () => {
  assert.equal(sideOf('0.4%', '0.3%'), 'higher'); assert.equal(sideOf('196K', '207K'), 'lower'); assert.equal(sideOf('4.00%', '4.00%'), 'inline');
  assert.equal(scoreCall('higher', '0.4%', '0.3%'), 'hit'); assert.equal(scoreCall('lower', '0.4%', '0.3%'), 'miss'); assert.equal(scoreCall('higher', '0.3%', '0.3%'), 'push'); assert.equal(scoreCall('higher', null, '0.3%'), null);
  const s = summariseCalls([{ result: 'hit', modelResult: 'miss' }, { result: 'miss', modelResult: 'hit' }, { result: 'push' }, { result: 'hit' }]);
  assert.equal(s.n, 3); assert.equal(s.hits, 2); assert.equal(s.pushes, 1); assert.equal(s.model.n, 2); assert.equal(s.model.hits, 1);
});
t('the card reads as sentences', () => {
  const card = { country: 'US', ms: T0, prints: [{ event: 'CPI m/m', estimate: '0.3%', actual: '0.4%' }, { event: 'Core CPI m/m', estimate: '0.3%', actual: '0.3%' }],
    reactions: [{ name: 'EURUSD', move: -18, unit: 'pips', dir: 'down', ratio: 2.1, book: { spike: 2.9, n: 124 } }, { name: 'GOLD', move: 14.2, unit: '$', dir: 'up', ratio: 1.6, book: null }],
    call: { call: 'higher', result: 'hit', model: 'higher', modelResult: 'hit' } };
  const txt = formatScorecard(card);
  assert.match(txt, /CPI m\/m: 0\.4%, higher than the 0\.3% expected · Core CPI m\/m: 0\.3%, as expected/);
  assert.match(txt, /EUR\/USD moved 18 pips down in 30 min — 2\.1× a normal half-hour \(the book: 2\.9× on 124 prints\), about what the book said/);
  assert.match(txt, /GOLD moved \$14\.2 up in 30 min — 1\.6× a normal half-hour, a real move/);
  assert.match(txt, /Your call: higher — ✓ right · the model said higher \(✓\)/);
});
console.log(`releaseScorecard: ${n} groups, all passed`);
