// Tests for js/closeBasis.js.   node js/closeBasis.test.mjs
import { closeMove, dayWord, basisNote, londonDate } from './closeBasis.js';
import { todayTables } from './newsletterTables.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const near = (a, b, t = 0.005) => Number.isFinite(a) && Math.abs(a - b) <= t;

// Monday 2026-11-02 07:00 UK. The bundle ends Friday 2026-10-30.
const MON = Date.parse('2026-11-02T07:00:00Z'), LATEST = '2026-10-30';

const gold = closeMove({ last: 3875.645, prev: 4020.565, lastDate: '2026-10-30', latestDate: LATEST, live: 3907.68, liveStale: false, nowMs: MON });
ok('Monday, live price: gold is measured since Friday\'s close, not as Friday\'s fall', gold.basis === 'live' && near(gold.d1, 0.8266), String(gold.d1));
ok('the label names the close it runs from', gold.label === 'since Fri close', gold.label);

const goldBars = closeMove({ last: 3875.645, prev: 4020.565, lastDate: '2026-10-30', latestDate: LATEST, live: null, nowMs: MON });
ok('no live price: the last full day\'s move (Friday -3.6%), dated Fri', goldBars.basis === 'bars' && near(goldBars.d1, -3.6045, 0.01) && goldBars.label === 'Fri', `${goldBars.d1} ${goldBars.label}`);

const goldStaleLive = closeMove({ last: 3875.645, prev: 4020.565, lastDate: '2026-10-30', latestDate: LATEST, live: 3907.68, liveStale: true, nowMs: MON });
ok('a stale live price is not used', goldStaleLive.basis === 'bars');

const vix = closeMove({ last: 17.2, prev: 16.91, lastDate: '2026-10-29', latestDate: LATEST, live: null, nowMs: MON });
ok('null-bar case: VIX has no Friday bar, so no print (never Thursday\'s move under a Friday column)', vix.basis === 'none' && vix.noPrint && vix.d1 === null && vix.why === 'stale');

ok('no data: no print', closeMove({ last: null, lastDate: null, latestDate: LATEST }).noPrint);
ok('a lone bar with no live price: no print', closeMove({ last: 5, prev: null, lastDate: LATEST, latestDate: LATEST, nowMs: MON }).noPrint);

const sameDay = closeMove({ last: 100, prev: 99, lastDate: '2026-11-02', latestDate: '2026-11-02', live: 101, nowMs: Date.parse('2026-11-02T21:30:00Z') });
ok('a bar dated today is that day\'s own move, never "since today close"', sameDay.basis === 'bars' && sameDay.label === 'today');

ok('weekday within a week', dayWord('2026-10-30', MON) === 'Fri');
ok('older than a week gives a date', dayWord('2026-10-20', MON) === '20 Oct');
ok('London date, not UTC, decides today', londonDate(Date.parse('2026-07-01T23:30:00Z')) === '2026-07-02');

const note = basisNote([{ d1Basis: 'live', d1AsOf: '2026-10-30' }, { d1Basis: 'none' }], MON);
ok('footnote names the close the live moves run from and the no-print rule', /live price to the last daily close \(Fri\)/.test(note) && /No print/.test(note), note);
ok('footnote is silent with no rows', basisNote([]) === '');


// The daily pair table on a Monday: gold since Friday's close, VIX-style no print, and the footnote that says which basis was used.
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const row = (key, label, mv) => ({ key, label, price: '1', hlMed: 1.2, used: null, d20: 0, ...mv });
const assets = [
  row('GOLD', 'Gold', { d1: gold.d1, d1Basis: gold.basis, d1Label: gold.label, d1AsOf: gold.asOf }),
  row('NQ', 'Nasdaq', { d1: null, d1Basis: 'none', d1Label: '', d1AsOf: '2026-10-29' }),
];
const t = todayTables({ assets, events: [], nowMs: MON, isoDate: '2026-11-02' }, esc).pairsHtml;
ok('the table shows the gold move with the close it runs from', /\+0\.83%<\/b> <small>since Fri close<\/small>/.test(t), (t.match(/<td class="m"><b[^]*?<\/td>/) ?? [''])[0]);
ok('a market with no latest bar shows no print and stays in the table', /Nasdaq/.test(t) && /<small>no print<\/small>/.test(t));
ok('the footnote no longer says since yesterday close', !/since yesterday/.test(t) && /last daily close \(Fri\)/.test(t));
ok('the share-of-range bar does not invent a figure for a no-print market', /Nasdaq[^]*?<td class="u">·<\/td>/.test(t));

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
