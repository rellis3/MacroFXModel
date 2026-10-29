// Tests for js/eventDayContext.js.   node js/eventDayContext.test.mjs
import { eventDay, eventsToday, familyHistory, frontEnds, scheduleFromCalendars, zonedMs, londonDate } from './eventDayContext.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

const row = (t, family, gilt30, gilt240, extra = {}) => ({ t, family, name: extra.name ?? family, M: { gilt: gilt30 == null ? null : { m30: gilt30, m240: gilt240 }, gbpusd: { m30: 0.1, m240: 0.1 }, ftse: null }, ...extra });
const past = [row('2024-10-30T12:30:00Z', 'UKFISCAL', 0.4, -0.2), row('2025-03-26T12:30:00Z', 'UKFISCAL', -0.3, 0.1), row('2025-11-26T11:40:00Z', 'UKFISCAL', 0.2, 0.3), row('2026-03-03T12:30:00Z', 'UKFISCAL', 0.1, -0.1)];
const today = row('2026-10-28T12:30:00Z', 'UKFISCAL', -0.05, 0.02, { name: 'Budget 2026' });

console.log('history');
{ const h = familyHistory([...past, today], 'UKFISCAL', Date.parse(today.t));
  ok('only events before the one being described count', h.n === 4 && h.assets.gilt.n === 4);
  ok('median size is of absolute moves', Math.abs(h.assets.gilt.med30 - 0.25) < 1e-9);
  ok('continuation counts the 4-hour sign against the 30-minute sign', h.assets.gilt.keep === 1 && h.assets.gilt.keepN === 4);
  ok('an asset with no data is left out, not zero', !('ftse' in h.assets)); }

console.log('selection');
{ const now = Date.parse('2026-10-28T16:00:00Z');
  const ev = eventsToday([...past, today], [{ t: '2026-10-28T18:00:00Z', family: 'FOMC', name: 'FOMC decision' }, { t: '2026-10-31T12:00:00Z', family: 'BOE' }], now);
  ok('today\'s released and upcoming events are kept, later ones dropped', ev.map(e => e.family).join() === 'UKFISCAL,FOMC');
  const dup = eventsToday([today], [{ t: '2026-10-28T12:30:00Z', family: 'UKFISCAL', name: 'Budget 2026' }], now);
  ok('a schedule entry does not duplicate a measured row, and the measured one wins', dup.length === 1 && dup[0].M);
  const bojDay = eventsToday([], [{ t: '2026-10-30T03:00:00Z', family: 'BOJ' }], Date.parse('2026-10-29T08:00:00Z'));
  ok('an event within the next 24 hours is kept even on the next London day', bojDay.length === 1);
  ok('unknown families are ignored', eventsToday([], [{ t: '2026-10-28T13:00:00Z', family: 'XYZ' }], now).length === 0); }

console.log('the line');
{ const now = Date.parse('2026-10-28T16:00:00Z');
  const [e] = eventDay([...past, today], [], { now });
  ok('says released with the London clock', /Budget 2026 \(released 12:30 London\)/.test(e.line), e.line.slice(0, 80));
  ok('flags a small sample', /a small sample/.test(e.line));
  ok('compares this one with the ones before it', /10y gilt \(price\) −0\.05% \(smaller than all 4 before it\)/.test(e.line));
  ok('carries the fiscal evidence, not a direction', /fiscal-reaction-uk-size, underpowered/.test(e.line) && /not a forecast/.test(e.line));
  const early = eventDay([...past, today], [], { now: Date.parse('2026-10-28T12:45:00Z') })[0];
  ok('no "this one" figure before 30 minutes have passed', !/This one/.test(early.line));
  ok('a currency filter keeps only that currency\'s events', eventDay([...past, today], [], { now, ccys: ['EUR'] }).length === 0 && eventDay([...past, today], [], { now, ccys: ['GBP', 'USD'] }).length === 1);
  const boj = eventDay([], [{ t: '2026-10-30T03:00:00Z', family: 'BOJ', name: 'BoJ rate decision' }], { now: Date.parse('2026-10-29T08:00:00Z') })[0];
  ok('a BoJ placeholder time is not printed as if it were the release time', /Tokyo morning/.test(boj.line) && !/03:00 London/.test(boj.line));
  ok('no history says so rather than inventing numbers', /too few earlier events/.test(boj.line)); }

console.log('schedule from the calendars');
{ ok('ECB 14:15 Frankfurt is 13:15 UTC in winter and 12:15 in summer', new Date(zonedMs('2026-10-29', '14:15', 'Europe/Berlin')).toISOString() === '2026-10-29T13:15:00.000Z' && new Date(zonedMs('2026-07-23', '14:15', 'Europe/Berlin')).toISOString() === '2026-07-23T12:15:00.000Z');
  const s = scheduleFromCalendars({ fomc: [{ date: '2026-10-28' }], fiscal: [{ kind: 'refunding', title: 'Refunding', ms: Date.UTC(2026, 10, 4, 13, 30) }],
    calendar: [{ country: 'US', impact: 'high', event: 'Non-Farm Employment Change', ms: Date.UTC(2026, 10, 6, 13, 30) }, { country: 'US', impact: 'low', event: 'CPI', ms: 0 }, { country: 'GB', impact: 'high', event: 'CPI y/y', ms: 1 }] });
  ok('FOMC at 14:00 New York (18:00 UTC before the US clock change)', s.find(x => x.family === 'FOMC').t === '2026-10-28T18:00:00Z');
  ok('a refunding comes from the fiscal list', s.some(x => x.family === 'REFUNDING'));
  ok('US high-impact payrolls map from the vendor name; low-impact and non-US are skipped', s.filter(x => ['NFP', 'CPI'].includes(x.family)).length === 1); }

console.log('rate legs');
{ const t0 = Date.parse('2026-10-26T12:00:00Z') / 1000, t1 = Date.parse('2026-10-27T12:00:00Z') / 1000;
  const legs = { SR3Z6: { kind: 'rate', m5: { t: [t0, t1], c: [96.00, 95.95] } }, IZ6: { kind: 'rate', m5: { t: [t0, t1], c: [97.80, 97.80] } }, FGBL2612: { kind: 'price', m5: { t: [t0, t1], c: [130, 129.35] } } };
  const f = frontEnds(legs, { now: Date.parse('2026-10-27T13:00:00Z') });
  ok('a short-rate price fall is a rise in the rate, in bp', Math.abs(f.rows.find(r => r.name === 'SR3Z6').d1 - 5) < 1e-6);
  ok('bond futures stay a price change in %', Math.abs(f.rows.find(r => r.name === 'FGBL2612').d1 + 0.5) < 1e-6);
  ok('names which front end did the moving', /the US side did the moving/.test(f.line));
  ok('carries the null verdicts', /no lead from them survived testing/.test(f.line));
  ok('fresh data is not flagged stale', f.stale === false);
  ok('old data says it is not today', frontEnds(legs, { now: Date.parse('2026-10-30T13:00:00Z') }).line.includes('NOT UPDATED'));
  ok('no legs, no line', frontEnds({}).line === null);
  ok('London date helper', londonDate(Date.parse('2026-06-30T23:30:00Z')) === '2026-07-01'); }

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
