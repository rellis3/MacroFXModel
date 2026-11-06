// Tests for js/morningTape.js on the 5-6 Nov 2026 tape.   node js/morningTape.test.mjs
import { ASSETS, EVENING } from './morningTape.fixture.mjs';
import { tapeRow, tapeRows, rowText, yesterdayLine, tapeNote, lastFullDay, multiple, rangePosition, fmtMove, dayName } from './morningTape.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const by = k => tapeRow(ASSETS.find(a => a.key === k));

console.log('the two moves');
const nq = by('NQ');
ok("the Nasdaq's full day is Thursday's close against Wednesday's: −7.03%", Math.abs(nq.day.pct - (26531 / 28537.8 - 1) * 100) < 1e-9 && nq.day.pct.toFixed(2) === '-7.03' && nq.day.date === '2026-11-05');
ok('the overnight is the live price against Thursday\'s close: +1.33%', nq.night.pct.toFixed(2) === '1.33');
ok('each in normal days: |move| ÷ the forecast median day range (4.1× and 0.8×)', nq.day.mult.toFixed(1) === '4.1' && nq.night.mult.toFixed(1) === '0.8' && multiple(-7.03, 1.71).toFixed(2) === '4.11');
const spx = by('SPX500');
ok('with no live price (the S&P) the full day stands alone and there is no overnight', spx.day.pct.toFixed(2) === '-4.90' && spx.night === null);
ok('a stale or empty market has no tape', tapeRow({ label: 'X', d1: null, d1Basis: 'none' }).day === null && lastFullDay({ d1Basis: 'live', d1: 1, spark: [5] }) === null);
ok('without prevClose the full day comes from the last two closes in the spark', lastFullDay({ d1Basis: 'live', d1: 1.33, d1AsOf: '2026-11-05', spark: [28537.8, 26531] }).pct.toFixed(2) === '-7.03');

console.log('the ranking');
const order = tapeRows(ASSETS).map(r => r.key);
ok('biggest first by the larger multiple: the crash day leads although its overnight is a bounce', order.join(',') === 'NQ,SPX500,AUDUSD,DE30,GOLD', order.join(','));
ok('a row without a unit goes after the rows with one', tapeRows([{ label: 'A', d1: 9, d1Basis: 'bars', d1AsOf: '2026-11-05' }, { label: 'B', d1: 0.5, d1Basis: 'bars', d1AsOf: '2026-11-05', hlMed: 1 }]).map(r => r.label).join() === 'B,A');

console.log('where the price sits in yesterday\'s range');
ok('Nasdaq at 26,883 in a 26,420-28,610 day: 21%, bottom third', rowText(nq).pos === "21% of Thu's range, bottom third");
ok('AUD/USD below Thursday\'s low', rowText(by('AUDUSD')).pos === "below Thu's low");
ok('without a live price it is where the market closed', rowText(spx).pos === "closed at 6% of Thu's range, bottom third");
ok('thirds and the outside words', rangePosition({ high: 10, low: 0, price: 5 }).word === 'middle third' && rangePosition({ high: 10, low: 0, price: 9 }).word === 'top third' && rangePosition({ high: 10, low: 0, price: 11 }).word === 'above high' && rangePosition({ high: 1, low: 1, price: 1 }) === null);

console.log('the words');
ok('compact cells: "−7.03% (4.1×)"', fmtMove(nq.day.pct, nq.day.mult) === '−7.03% (4.1×)' && rowText(nq).day === 'Thu −7.03% (4.1×)' && rowText(nq).night === "+1.33% (0.8×) since Thu's close");
const yl = yesterdayLine({ assets: ASSETS });
ok('yesterday in one line from the data, labelled as the full day', yl.source === 'data' && yl.text === "Thursday's full day: Nasdaq −7.0% (4.1× a normal day), S&P 500 −4.9% (3.6×), AUD/USD −1.1% (1.7×)", yl.text);
const ye = yesterdayLine({ assets: ASSETS, evening: EVENING });
ok('from last night\'s evening edition when one is stored for that day, with the numbers kept', ye.source === 'evening' && ye.text === "Thursday, from last night's evening edition: The Nasdaq's worst day in years, and the dollar bid" && ye.numbers === yl.text);
ok('an evening edition for another day is not used', yesterdayLine({ assets: ASSETS, evening: [{ date: '2026-11-04', subject: 'Evening: old' }] }).source === 'data');
const note = tapeNote(tapeRows(ASSETS));
ok('the footnote says what × means and that the range runs narrow in stress', /× = the move divided by the market's forecast median day range \(high to low\)/.test(note) && /runs narrow in stress/.test(note) && /forecast-miss/.test(note) && /close to close/.test(note));
ok('nothing forecasts a direction', !/will|expect|likely|should/i.test(note + yl.text + ye.text));
ok('day names', dayName('2026-11-05') === 'Thu' && dayName('2026-11-05', true) === 'Thursday' && dayName(null) === '');

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
