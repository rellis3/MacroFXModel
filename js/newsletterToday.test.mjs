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
  const big = todayOpening({ events: [{ ms: t(15, 0), ccy: 'USD', event: 'Pending Home Sales', impact: 'medium' }], nowMs, assets: [{ label: 'Gold', d1: -2.3, used: 1.4 }], since: { first: true } });
  ok('a market that has used most of its day is named with its move', /Gold has moved −2\.30%, 140% of a normal day's range\./.test(big.changed));
  ok('no events and a market past its normal day makes that move the headline', big.headline === 'Gold slides 2.3%');
  ok('no events and nothing unusual gives a calm calendar line', todayOpening({ events: [{ ms: t(15, 0), ccy: 'USD', event: 'Pending Home Sales', impact: 'medium' }], nowMs, assets: [{ label: 'Gold', d1: -0.1, used: 0.1 }], since: { first: true } }).headline === 'A quiet calendar: today is about the tape, not the releases');
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
  ok('the opening labels the story by edition', todayOpening({ events: [{ ms: t(15, 0), ccy: 'USD', event: 'Pending Home Sales', impact: 'medium' }], nowMs: 0, weekly: true }).story === 'The week in one line' && todayOpening({ events: [{ ms: t(15, 0), ccy: 'USD', event: 'Pending Home Sales', impact: 'medium' }], nowMs: 0 }).story === 'The month in one line'); }
console.log('the day take, newspaper style');
{ const A = [{ key: 'GOLD', label: 'Gold', d1: 0.2, hlMed: 1.2 }, { key: 'NQ', label: 'Nasdaq', d1: -0.17, hlMed: 1.8 }];
  const wild = { GOLD: { atr: 0.71, band: 'wide', cutHigh: 0.34, netPct: -1.1, rangePct: 1.5 }, NQ: { atr: 0.51, band: 'wide', cutHigh: 0.33, netPct: -0.4, rangePct: 0.9 } };
  const o = todayOpening({ events, nowMs, assets: A, changes: [{ key: 'us10y', d1: -17 }, { key: 'hy', d1: 13 }], asia: wild });
  ok('a wild Asia is one short headline, not a list of percentages', o.headline === 'Gold lurches lower in a wild Asian session, with UK data and the Bank of Canada still to come', o.headline);
  ok('the numbers sit in the lede: range used, net move since the Asia open, and the tested meaning', /Gold covered 71% of a normal day's range before London opened and ended Asia 1\.1% lower\. Past wide-Asia days have left less for London: after 07:00 Gold reached the median band on 24% of them, against 46% when Asia was narrow\./.test(o.lede), o.lede);
  ok('the rest of the tape follows in plain words, with what each move means', /Credit got jumpier: junk-bond spreads, the extra yield lenders ask to hold risky debt, widened 13bp\./.test(o.lede) && /Borrowing costs fell: the US 10-year yield dropped 17bp, so money is cheaper across the board\./.test(o.lede), o.lede);
  const two = todayOpening({ events, nowMs, assets: A, asia: { GOLD: { ...wild.GOLD, atr: 0.8 }, NQ: { ...wild.NQ, atr: 0.7 } } });
  ok('two wild markets share one headline and agree on direction or say they swung', /^Gold and Nasdaq lurch lower in a wild Asian session/.test(two.headline) && /^Gold and Nasdaq swing wildly/.test(todayOpening({ events, nowMs, assets: A, asia: { GOLD: { ...wild.GOLD, atr: 0.8 }, NQ: { ...wild.NQ, atr: 0.7, netPct: 0.5 } } }).headline), two.headline);
  ok('a busy but not wild Asia is not the headline', !/Asia/.test(todayOpening({ events, nowMs, assets: A, asia: { GOLD: { ...wild.GOLD, atr: 0.5 } } }).headline));
  const r = todayOpening({ events, nowMs, assets: A, changes: [{ key: 'us10y', d1: -17 }] });
  ok('without Asia the biggest measured move leads, in plain words', r.headline === 'Yields fall 17bp, with UK data and the Bank of Canada still to come', r.headline);
  ok('a quiet tape falls back to the calendar headline', /^The Fed decides at 18:00, after/.test(todayOpening({ events, nowMs, assets: [{ key: 'GOLD', label: 'Gold', d1: -0.1, hlMed: 1.2 }], changes: [{ key: 'us10y', d1: -2 }] }).headline));
  ok('a market past its normal day with no event due is just that story', todayOpening({ events: [{ ms: t(15, 0), ccy: 'USD', event: 'Pending Home Sales', impact: 'medium' }], nowMs, assets: [{ label: 'Gold', d1: -2.3, used: 1.4 }], changes: [] }).headline === 'Gold slides 2.3%');
  ok('no Asia feed leaves the opening as it was', !/Asia/.test(todayOpening({ events, nowMs, assets: A }).lede));
  ok('the weekly never uses the day take', !/tumble|lurch/.test(todayOpening({ events, nowMs, weekly: true, assets: A, changes: [{ key: 'us10y', d1: -17 }], asia: wild }).headline)); }
console.log('a calendar that did not load');
{ const o = todayOpening({ events: [], nowMs, assets: [{ label: 'Gold', d1: -0.1, used: 0.1 }] });
  ok('an empty calendar is not reported as a quiet day', o.kicker === 'Today · Wednesday 28 October' && o.headline === 'Where the markets stand this morning' && !/quiet/i.test(o.headline + o.lede)); }
console.log('duplicate decisions and a second story');
{ const dup = [{ ms: t(13, 15), ccy: 'EUR', event: 'Main Refinancing Rate', impact: 'high', estimate: '2.65%' }, { ms: t(13, 15), ccy: 'EUR', event: 'Monetary Policy Statement', impact: 'high' }, { ms: t(12, 30), ccy: 'USD', event: 'Advance GDP q/q', impact: 'high' }];
  const o = todayOpening({ events: dup, nowMs, cb: [{ ccy: 'EUR', regime: 'HAWKISH' }] });
  ok('one bank, one moment, one row: the ECB is listed once, and counted once', o.count === 2 && o.sheet.filter(r => /ECB/.test(r.name)).length === 1 && /^Two high-impact releases/.test(o.lede) && o.sheet.find(r => /ECB/.test(r.name)).detail.startsWith('Expected 2.65%'), JSON.stringify(o.sheet));
  ok('Main Refinancing Rate is recognised as the ECB decision', /ECB day/.test(o.kicker));
  const two = todayOpening({ events: dup, nowMs, assets: [], changes: [{ key: 'us10y', d1: -17 }, { key: 'hy', d1: 13 }] });
  ok('a second story of its own size shares the headline', two.headline === 'Yields fall 17bp and credit jitters grow, with US data and the ECB still to come', two.headline);
  ok('a second story below its own normal does not', !/credit/.test(todayOpening({ events: dup, nowMs, assets: [], changes: [{ key: 'us10y', d1: -17 }, { key: 'hy', d1: 3 }] }).headline)); }
console.log('the human layer');
{ const calm = Object.fromEntries(['GOLD', 'EURUSD', 'USDJPY', 'GBPUSD'].map(k => [k, { atr: 0.1, band: 'narrow', cutHigh: 0.34, netPct: 0.02, rangePct: 0.1 }]));
  const A = [{ key: 'GOLD', label: 'Gold', d1: 0.1 }, { key: 'EURUSD', label: 'EUR/USD', d1: -0.05 }, { key: 'USDJPY', label: 'USD/JPY', d1: 0 }, { key: 'GBPUSD', label: 'GBP/USD', d1: 0.02 }];
  const ev = [{ ms: t(12, 30), ccy: 'USD', event: 'Advance GDP q/q', impact: 'high', note: { range: 'EUR/USD range +0.14 on the day; USD/CAD range +0.26 on the day (big surprises)' } }, { ms: t(12, 30), ccy: 'USD', event: 'Core PCE Price Index m/m', impact: 'high' }, { ms: t(13, 15), ccy: 'EUR', event: 'Main Refinancing Rate', impact: 'high' }];
  const o = todayOpening({ events: ev, nowMs, assets: [...A, { key: 'USDCAD', label: 'USD/CAD', d1: -0.4 }], changes: [{ key: 'hy', d1: -12 }], asia: calm });
  ok('a calm Asia and easing credit make the headline, with the releases to come in plain words', o.headline === 'Asia stays calm and credit eases, with US data and the ECB still to come', o.headline);
  ok('a calm Asia is explained with the desk own tested result', /Asia was quiet: Gold, EUR\/USD and USD\/JPY barely moved\. In the desk's tests a quiet Asia has left more of the day for London: Gold reached its median band after 07:00 on 46% of those days, against 24% when Asia was wide\./.test(o.lede), o.lede);
  ok('easing credit is explained as lenders getting less nervous', /Credit eased: junk-bond spreads, the extra yield lenders ask to hold risky debt, tightened 12bp\. Lenders are getting less nervous, not more\./.test(o.lede));
  ok('the pair the release is known to move, and that has moved most, is the one waiting on it', /USD\/CAD, down 0\.4% since yesterday's close, is the pair waiting on the US growth and inflation figures at 12:30\. In the desk's records, releases like this have widened its day\./.test(o.lede), o.lede);
  ok('with no Asia feed and nothing unusual the old wording stays', !/Asia/.test(todayOpening({ events: ev, nowMs, assets: A, changes: [] }).lede)); }
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
