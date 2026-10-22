// Tests for js/marketCalendars.js.   node js/marketCalendars.test.mjs
import { easter, usMarketDays, ukBankHolidays, targetHolidays, closuresBetween, etToMs, parseEarnings, parseAuctions, parseFedCalendar } from './marketCalendars.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const has = (arr, date, name) => arr.some(x => x.date === date && (!name || x.name === name));

ok('Easter: 2026-04-05, 2027-03-28, 2024-03-31', easter(2026) === '2026-04-05' && easter(2027) === '2027-03-28' && easter(2024) === '2024-03-31');
const us26 = usMarketDays(2026);
ok('US 2026 closures: MLK Jan 19, Presidents Feb 16, Good Friday Apr 3, Memorial May 25, Juneteenth Fri Jun 19, Labor Sep 7, Thanksgiving Nov 26, Christmas Dec 25',
  ['2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-09-07', '2026-11-26', '2026-12-25'].every(d => has(us26, d)));
ok('US 2026: Independence Day falls on a Saturday so the market is shut the Friday, Jul 3', has(us26, '2026-07-03', 'Independence Day') && !has(us26, '2026-07-04'));
ok('US 2026: the day after Thanksgiving is a 1pm early close, and Christmas Eve too', us26.some(x => x.date === '2026-11-27' && /early/.test(x.kind)) && us26.some(x => x.date === '2026-12-24' && /early/.test(x.kind)));
ok('New Year on a Saturday (2022) is not observed the Friday before; on a Sunday it moves to Monday', !has(usMarketDays(2022), '2021-12-31') && !has(usMarketDays(2022), '2022-01-01') && has(usMarketDays(2023), '2023-01-02'));
const uk26 = ukBankHolidays(2026);
ok('UK 2026: Good Friday Apr 3, Easter Monday Apr 6, May 4, May 25, Aug 31, Christmas Fri Dec 25, Boxing Day moves to Mon Dec 28', ['2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28'].every(d => has(uk26, d)) && !has(uk26, '2026-12-26'));
ok('Euro area 2026: Good Friday, Easter Monday, May 1, Dec 25; Boxing Day on a Saturday is dropped', ['2026-04-03', '2026-04-06', '2026-05-01', '2026-12-25'].every(d => has(targetHolidays(2026), d)) && !has(targetHolidays(2026), '2026-12-26'));
const c = closuresBetween('2026-12-21', '2027-01-05');
ok('a window across a year end lists each closure once, in order, with no weekends', c.map(x => x.date + x.market).join() === '2026-12-24US stock market,2026-12-25Euro area,2026-12-25UK,2026-12-25US stock market,2026-12-28UK,2027-01-01Euro area,2027-01-01UK,2027-01-01US stock market');

ok('New York wall time converts across the daylight-saving change: 13:00 on 2026-10-26 is 17:00Z (EDT), on 2026-11-02 is 18:00Z (EST)', new Date(etToMs('2026-10-26', 13)).toISOString() === '2026-10-26T17:00:00.000Z' && new Date(etToMs('2026-11-02', 13)).toISOString() === '2026-11-02T18:00:00.000Z');

const er = parseEarnings({ data: { rows: [
  { time: 'time-after-hours', symbol: 'V', name: 'Visa Inc.', marketCap: '$728,728,140,000', epsForecast: '$3.43', lastYearEPS: '$2.98' },
  { time: 'time-pre-market', symbol: 'KO', name: 'Coca-Cola Company (The)', marketCap: '$398,760,280,000', epsForecast: '$0.80' },
  { time: 'time-not-supplied', symbol: 'TINY', name: 'Tiny Corp', marketCap: '$1,200,000,000' },
  { time: 'time-after-hours', symbol: 'TSLA', name: 'Tesla', marketCap: '$90,000,000,000' },
  { time: 'time-pre-market', symbol: 'MSFT', name: 'Microsoft Corporation', marketCap: '$3,900,000,000,000' },
  { time: 'time-after-hours', symbol: 'GOOGL', name: 'Alphabet Inc.', marketCap: '$3,500,000,000,000' }, { time: 'time-after-hours', symbol: 'GOOG', name: 'Alphabet Inc.', marketCap: '$3,500,000,000,000' }] } }, '2026-10-27');
ok('earnings: large companies and the tracked names only, biggest first, with when they report', er.map(x => x.symbol).join() === 'MSFT,GOOGL,V,KO,TSLA' && er.find(x => x.symbol === 'V').when === 'after the close' && er.find(x => x.symbol === 'KO').when === 'before the open' && er.find(x => x.symbol === 'KO').name === 'Coca-Cola Company' && er.find(x => x.symbol === 'TSLA').tracked === true);
const au = parseAuctions([
  { competitiveAuctionCloseDate: '2026-10-26T00:00:00', competitiveAuctionCloseTime: '01:00 PM', securityType: 'Note', securityTerm: '2-Year', offeringAmount: '69000000000', reopening: 'No', maturityDate: '2028-10-31T00:00:00' },
  { competitiveAuctionCloseDate: '2026-10-26T00:00:00', competitiveAuctionCloseTime: '11:30 AM', securityType: 'Bill', securityTerm: '13-Week', offeringAmount: '95000000000', reopening: 'Yes' },
  { competitiveAuctionCloseDate: '', securityType: 'Note' },
  { competitiveAuctionCloseDate: '2026-10-28T00:00:00', competitiveAuctionCloseTime: '01:00 PM', securityType: 'Note', securityTerm: '10-Year', inflationProtected: 'Yes', offeringAmount: '19000000000' }]);
ok('auctions: dated by the competitive close, in time order, with size in $bn and TIPS named; rows without a date are dropped', au.length === 3 && au[0].term === '13-Week' && au[1].term === '2-Year' && au[1].amountB === 69 && au[2].type === 'TIPS' && au[0].reopening === true);
const fed = parseFedCalendar('﻿' + JSON.stringify({ events: [
  { title: 'Speech - Vice Chair for Supervision Michelle W. Bowman', location: 'At the Bangkok Economic Festival 2026', time: '10:55 p.m.', month: '2026-10', days: '27', type: 'Speeches' },
  { title: 'Discussion - Chairman Kevin Warsh', location: 'At the Fireside Chat with IMF', time: '11:30 a.m.', month: '2026-10', days: '28', type: 'Speeches' },
  { title: 'Speech - Governor Lisa D. Cook', location: 'At the Atlantic Council&#8217;s Conversation &amp; Q&amp;A', time: '3:30 p.m.', month: '2026-10', days: '29', type: 'Speeches' },
  { title: 'FOMC Minutes', location: '', time: '2:00 p.m.', month: '2026-11', days: '18', type: 'FOMC' },
  { title: 'Holiday - Veterans Day', month: '2026-11', days: '11', type: 'Other' },
  { title: 'Speech - Governor Old', month: '2026-09', days: '1', type: 'Speeches', time: '1:00 p.m.' }] }), '2026-10-26', '2026-11-30');
ok('Fed calendar: window only, speeches and FOMC kept, other types dropped', fed.map(x => x.date).join() === '2026-10-27,2026-10-28,2026-10-29,2026-11-18');
ok('Fed speakers are shown by role and never by name', fed.every(x => !/Bowman|Warsh|Cook|Michelle|Kevin|Lisa/.test(x.what + (x.where ?? ''))) && fed[0].what === 'Fed Vice Chair for Supervision: speech' && fed[1].what === 'Fed Chair: discussion' && fed[2].what === 'Fed Governor: speech');
ok('Fed times are converted from New York time and entities are decoded', new Date(fed[0].ms).toISOString() === '2026-10-28T02:55:00.000Z' && fed[2].where === "the Atlantic Council's Conversation & Q&A" && fed[3].what === 'FOMC Minutes');
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
