// Tests for js/newsletterToday.js.   node js/newsletterToday.test.mjs
import { todayOpening, weekStory } from './newsletterToday.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

const t = (h, m, d = 28) => Date.UTC(2026, 9, d, h, m);   // UK is on GMT from 25 Oct 2026
const nowMs = t(7, 0);
const events = [
  { ms: t(12, 30), ccy: 'GBP', event: 'UK Autumn Budget', impact: 'high' }, { ms: t(13, 45), ccy: 'CAD', event: 'BoC Interest Rate Decision', impact: 'high' },
  { ms: t(18, 0), ccy: 'USD', event: 'FOMC Rate Decision', impact: 'high' }, { ms: t(18, 30), ccy: 'USD', event: 'FOMC Press Conference', impact: 'high' },
  { ms: t(15, 0), ccy: 'USD', event: 'Pending Home Sales', impact: 'medium' }, { ms: t(9, 0, 29), ccy: 'EUR', event: 'ECB Interest Rate Decision', impact: 'high' }];
const rf = { active: 0, total: 6, flags: [{ label: 'VIX elevated', on: false, value: 18.4 }, { label: 'VIX curve backwardated', on: false, value: 0.95 }, { label: 'FX implied vol stressed', on: null, value: null }] };
const assets = [{ label: 'EUR/USD', d1: 0.1, used: 0.2 }, { label: 'Nasdaq', d1: -1.2, used: 0.55 }, { label: 'Gold', d1: -0.71, used: 0.41 }];

console.log('a central-bank day');
{ const o = todayOpening({ events, nowMs, regimeWord: 'MIXED', riskFlags: rf, assets, since: { first: false, items: [{ text: 'The RBNZ held and the kiwi fell.' }, { text: 'Fed odds trimmed.' }, { text: 'third' }] } });
  ok('the headline names the Fed as the lead and the events that come before it', o.headline === 'The Fed decides at 18:00, after the UK Autumn Budget and the Bank of Canada');
  ok('the kicker is the day, in UK terms', o.kicker === 'Fed day · Wednesday 28 October');
  ok('the regime line says what the flags show and quotes the VIX, counting only what is measured', o.regime === 'Mixed regime. None of the 2 measured warning flags is on, VIX 18.4.');
  ok('what changed is the last issue\'s own differences, two at most', o.changed === 'The RBNZ held and the kiwi fell. Fed odds trimmed.');
  ok('watch lists only today\'s high-impact events in time order, in UK time, and not tomorrow\'s or a medium one', o.watch === 'UK Autumn Budget 12:30, Bank of Canada 13:45, Fed 18:00 and FOMC Press Conference 18:30. UK time.' && !/ECB|Pending/.test(o.watch));
  ok('it counts today\'s high-impact events', o.count === 4); }

console.log('quiet and odd days');
{ const q = todayOpening({ events: events.filter(e => e.ms > t(23, 0)), nowMs, regimeWord: 'MIXED', riskFlags: { active: 2, total: 5, flags: [] }, assets, since: { first: true, items: [] } });
  ok('with nothing high-impact today it says so and names what is next, never an invented story', q.headline === 'A quiet day on the calendar, then the ECB on Thursday' && /Nothing high-impact in the window\. Next: ECB, Thursday 09:00 UK time/.test(q.watch));
  ok('with no earlier issue, what changed falls back to how much the busiest market has moved against its own normal day', /Nothing has moved much: the busiest market, Nasdaq, has used 55% of a normal day's range\./.test(q.changed));
  ok('two or more warning flags is said plainly', /^Mixed regime\. 2 of the 5 measured warning flags are on\.$/.test(q.regime));
  const big = todayOpening({ events: [], nowMs, assets: [{ label: 'Gold', d1: -2.3, used: 1.4 }], since: { first: true } });
  ok('a market that has used most of its day is named with its move', /Gold has moved −2\.30%, 140% of a normal day's range\./.test(big.changed));
  ok('no events at all gives a calm calendar line', big.headline === 'A quiet calendar: today is about the tape, not the releases');
  const solo = todayOpening({ events: [{ ms: t(13, 30), ccy: 'USD', event: 'Core PCE', impact: 'high' }], nowMs });
  ok('a single release is a short headline', solo.headline === 'Core PCE at 13:30');
  ok('nothing in, nothing broken', todayOpening({}).headline.length > 0 && todayOpening({}).regime === ''); }

console.log('the weekly edition');
{ const w = todayOpening({ events, nowMs: t(7, 0, 25), weekly: true, regimeWord: 'MIXED', riskFlags: rf, assets });
  ok('the week names the lead decision by weekday and counts the rest', w.headline === 'The Fed decides on Wednesday, plus four more big releases' && /^This week · from /.test(w.kicker));
  ok('the watch line carries the weekday', /Wed 12:30/.test(w.watch) || /Wed/.test(w.watch)); }

console.log('the weekly story');
{ const ch = [{ key: 'us10y', d5: -13 }, { key: 'hy', d5: 9 }, { key: 'tips', d5: -10 }, { key: 'us2s10s', d5: -4 }, { key: 'vix', d5: -0.96 }, { key: 'dxy', d5: -0.2, last: 121.4 }];
  const w = weekStory(ch);
  ok('the week line is five sessions, never twenty days', w.headline === 'Yields fell 13bp this week, yet junk-bond spreads widened 9bp' && !/20/.test(w.headline + w.standfirst) && /Measured over the last five sessions\.$/.test(w.standfirst));
  ok('the standfirst gives the real-yield share and the curve, three parts at most', /^The real yield fell 10bp, which is 77% of the 10-year's move; the 2s10s curve flattened 4bp; the dollar index fell 0\.2%\./.test(w.standfirst));
  ok('a stale or missing 10-year gives no week line rather than a guess', weekStory([{ key: 'us10y', d5: -13, stale: true }]) === null && weekStory([]) === null);
  ok('a flat week says so', weekStory([{ key: 'us10y', d5: 0.2 }]).headline === 'The 10-year yield barely moved this week');
  ok('the opening labels the story by edition', todayOpening({ events: [], nowMs: 0, weekly: true }).story === 'The week in one line' && todayOpening({ events: [], nowMs: 0 }).story === 'The month in one line'); }
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
