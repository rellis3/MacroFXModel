// Tests for js/directionRead.js.   node js/directionRead.test.mjs
import { directionReads, directionCell, directionNote, rangeCell, BASE_1D } from './directionRead.js';
import { todayTables } from './newsletterTables.js';
import { eventPast, eventFamily } from './newsletterToday.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const shown = (id, label, tier, e = 0) => ({ id, label, tier, tierLabel: tier, s: 0, e, note: '' });
const gr = {
  ranked: [{ sym: 'NQ' }, { sym: 'GOLD' }],
  cards: {
    GOLD: { direction: { pUp: 0.5, nLive: 0, shown: [shown('real-yields', 'Real yield trend', 'untested'), shown('risk-tone', 'Credit / risk tone', 'null')] }, range: { hlP50: 1.73, hlP75: 2.3, pAbove75: 0.25 } },
    NQ: { direction: { pUp: 0.58, nLive: 1, shown: [shown('y2', '2Y spread', 'validated', 0.12), shown('dollar', 'Dollar trend', 'untested')] }, range: { hlP50: 1.1, hlP75: 1.5, pAbove75: 0.36 } },
    AUDUSD: { direction: { pUp: 0.5, nLive: 0, shown: [] }, range: { hlP50: 0.6, hlP75: 0.8, pAbove75: 0.15 } },
  },
};
const R = directionReads(gr);
ok('rows follow the ranked order, then the rest', R.rows.map(r => r.sym).join() === 'NQ,GOLD,AUDUSD');
ok('a market with no tested input live has no P(up) and says so in words', directionCell(R.rows[1]).startsWith('none '));
ok('the base rate is the frozen one-day B0 and printed beside it', directionCell(R.rows[1]).includes(`base ${Math.round(BASE_1D.GOLD * 100)}%`));
ok('a market with a live tested input prints its P(up) beside the base rate', /^58% up <small>base 55%/.test(directionCell(R.rows[0])));
ok('a market with no measured base rate says so rather than inventing one', /no base rate/.test(directionCell(R.rows[2])));
ok('weighted inputs are kept, zero-weight ones are grouped by tier', R.rows[0].weighted.length === 1 && R.zero.untested.includes('Real yield trend') && R.zero.untested.includes('Dollar trend') && R.zero.null.includes('Credit / risk tone'));
ok('the note counts live markets and counts the inputs read but given no weight (Today names them)', /1 of 3 markets have a tested input live; the rest show no directional evidence beyond the baseline/.test(directionNote(R)) && /\d+ never tested/.test(directionNote(R)) && /\d+ tested with no edge/.test(directionNote(R)));
ok('with nothing live the note says there is no directional evidence beyond the baseline', /no directional evidence beyond the baseline/.test(directionNote(directionReads({ cards: { GOLD: gr.cards.GOLD } }))));
ok('the note states the detectability limit', /about 6 points cannot be told from chance/.test(directionNote(R)));
ok('the range cell shows the typical day, the 1-in-4 mark and flags a wider or narrower setup', /^1\.73% · 2\.30%$/.test(rangeCell(R.rows[1])) && /wider/.test(rangeCell(R.rows[0])) && /narrower/.test(rangeCell(R.rows[2])));
ok('no Global Read means no reads', directionReads(null) === null && directionNote(null) === '');
ok('the story arm is never used', !JSON.stringify(R).includes('story'));

// the daily pairs table
const assets = [{ key: 'GOLD', label: 'Gold', price: '4127', d1: 0.4, used: 0.5, hlMed: 1.7 }];
const withReads = todayTables({ reads: R, assets, events: [], nowMs: Date.parse('2026-11-02T08:00:00Z'), isoDate: '2026-11-02' }, esc).pairsHtml;
const without = todayTables({ assets, events: [], nowMs: Date.parse('2026-11-02T08:00:00Z'), isoDate: '2026-11-02' }, esc).pairsHtml;
ok('the pairs table gains a typical-day and a direction-evidence column when reads are supplied', /<th>Direction, tested inputs<\/th>/.test(withReads) && /none <small>base 53%/.test(withReads) && /1\.73%/.test(withReads));
ok('without reads the table is the earlier one', !/Direction, tested inputs/.test(without));

// event day on the sheet
const line = 'US CPI (due 13:30 London today): over the 12 previous US CPI events in the Release Reaction record (from 2024-01-11), the typical first-30-minute move, either way, was US 10y note future 0.21%, dollar index 0.18%, EUR/USD 0.16%, USD/JPY 0.25%, gold 0.40%, Nasdaq 0.55%. The 4-hour move pointed the same way as the 30-minute move in: gold 7 of 12. Descriptive history, not a forecast. Tested here: x';
const ed = { events: [{ family: 'CPI', line }] };
ok('a CPI row maps to the CPI family and a decision to its bank', eventFamily({ event: 'CPI m/m', ccy: 'USD' }) === 'CPI' && eventFamily({ event: 'Fed Interest Rate Decision', ccy: 'USD' }) === 'FOMC' && eventFamily({ event: 'ECB Interest Rate Decision', ccy: 'EUR' }) === 'ECB' && eventFamily({ event: 'GDP', ccy: 'EUR' }) === null);
const past = eventPast({ event: 'CPI m/m', ccy: 'USD' }, ed);
ok('the past line keeps the count and four markets and drops the evidence paragraph', /^In the 12 like it on record the typical first-30-minute move, either way, was US 10y note future 0\.21%, dollar index 0\.18%, EUR\/USD 0\.16%, USD\/JPY 0\.25%$/.test(past), past);
ok('no matching event gives nothing, so the older phrase stays', eventPast({ event: 'GDP', ccy: 'EUR' }, ed) === '' && eventPast({ event: 'CPI m/m', ccy: 'USD' }, null) === '');
// the classic and weekly market section carries the note once
import { buildNewsletter } from './newsletter.js';
{ const mk = reads => buildNewsletter({ date: 'x', isoDate: '2026-10-29', edition: 'weekly', assets: [{ key: 'GOLD', label: 'Gold', price: '4127', d1: 0.4, d20: 1.2, spark: [1, 2, 3], used: 0.5, hlMed: 1.7 }], reads }).html;
  ok('the weekly market section prints the direction note when reads are supplied, and not otherwise', /<b>Direction evidence\.<\/b> No market has a tested direction input live/.test(mk(directionReads({ cards: { GOLD: gr.cards.GOLD } }))) && !/Direction evidence\./.test(mk(null))); }
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
