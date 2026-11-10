// Tests for js/eveningFacts.js: the day's facts the evening writer reads.   node --test js/eveningFacts.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveTiming, timingText, releasesText, headlinesText, ratesText, pastEvents, RATE_SERIES } from './eveningFacts.js';
import { renderEvening, dayMoves } from './newsletterEvening.js';
import { londonMs } from './deskScore.js';
import { barFigure } from './newsletterMag.js';

const D = '2026-11-10', T0 = londonMs(D, 8) / 1000;
// 780 one-minute bars 08:00-21:00 London; flat except a jump of `jump` between minute `at` and `at + 10`
const bars = (jump, at, drift = 0) => Array.from({ length: 780 }, (_, i) => { const p = 100 + drift * i / 779 + (i >= at + 10 ? jump : i >= at ? jump * (i - at) / 10 : 0); return { time: T0 + i * 60, open: p, high: p + 0.05, low: p - 0.05, close: p }; });
const L = { open: 100, up: { p50: 101 }, down: { p50: 99 } };

test('timing: the 30 minutes that carried a big move, its share of the day, in London time', () => {
  const B = { EURUSD: bars(-2, 330), GOLD: bars(0, 0, 1.5) };   // EURUSD: a burst at 13:30; GOLD: a steady drift
  const cards = { EURUSD: { levels: L }, GOLD: { levels: L } };
  const rows = moveTiming(B, dayMoves(B, cards, D), D);
  const e = rows.find(r => r.inst === 'EURUSD');
  assert.equal(e.from.slice(0, 2), '13'); assert.ok(e.share >= 95, `share ${e.share}`);
  const g = rows.find(r => r.inst === 'GOLD'); assert.ok(g.share < 10, 'a drift has no burst');
  const txt = timingText(rows);
  assert.match(txt, /EURUSD −2\.0 u on the day: its biggest 30 minutes were 13:\d\d-1\d:\d\d London, \d+% of the day's move \(most of the day in one burst\)/);
  assert.match(txt, /GOLD \+1\.5 u .*\(spread through the day\)/);
  assert.match(timingText([]), /no market moved/);
});

test('releases: actual against forecast, the 30 minutes after, only what is out, high and medium impact', () => {
  const at = londonMs(D, 13, 30);
  const evs = [{ country: 'US', event: 'Core CPI m/m', impact: 'high', ms: at, actual: '0.4%', estimate: '0.3%', prev: '0.3%' },
    { country: 'US', event: 'Redbook', impact: 'low', ms: at + 3600e3, actual: '5%' },
    { country: 'US', event: 'Late release', impact: 'high', ms: londonMs(D, 22) }];
  const sc = [{ country: 'US', ms: at, reactions: [{ name: 'EURUSD', dir: 'down', move: -25, unit: 'pips', ratio: 2.1 }] }];
  const t = releasesText(evs, sc, { now: londonMs(D, 21) });
  assert.match(t, /^13:30 London \[US\] Core CPI m\/m \(high\): actual 0\.4% vs forecast 0\.3% \(previous 0\.3%\) · next 30 min: EURUSD down 25 pips \(2\.1x an ordinary half-hour\)/);
  assert.ok(!t.includes('Redbook') && !t.includes('Late release'));
  assert.match(releasesText([{ country: 'US', event: 'X', impact: 'high', ms: at }], [], { now: at + 1 }), /actual not on the feed/);
  assert.match(releasesText([], []), /no high- or medium-impact releases/);
});

test('releases: the scorecard\'s filled actual is used when the calendar has none', () => {
  const at = londonMs(D, 13, 30);
  const t = releasesText([{ country: 'US', event: 'Core CPI m/m', impact: 'high', ms: at, estimate: '0.2%' }], [{ country: 'US', ms: at, prints: [{ event: 'Core CPI m/m', actual: '0.5%' }] }], { now: londonMs(D, 21) });
  assert.match(t, /actual 0\.5% vs forecast 0\.2%/);
});

test('headlines: tier 1-2 in the day, oldest first, with the read and whether the market followed it', () => {
  const h = (min, title, tier, extra = {}) => ({ title, ms: londonMs(D, 8) + min * 60e3, read: { tier, impact: { USD: 1, GOLD: -1 }, why: 'hawkish' }, ...extra });
  const t = headlinesText([h(105, 'Fed Waller: half-point hike in the mix', 1, { react: { m30: { label: 'with' } } }), h(30, 'Early tier-2 item', 2), h(60, 'A tier-3 item', 3), h(-300, 'Yesterday', 1)], { sinceMs: londonMs(D, 7), untilMs: londonMs(D, 21) });
  const lines = t.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^08:30 T2 Early tier-2 item/);
  assert.match(lines[1], /^09:45 T1 Fed Waller: half-point hike in the mix · read: USD↑ GOLD↓ \(hawkish\) · 30 min later the market moved the way the read implied$/);
  assert.match(headlinesText([]), /no tier-1\/2 headlines/);
});

test('rates: today\'s close and day change, bp for yields; an old close is named, not used', () => {
  const s = { us10y: [{ date: '2026-11-09', value: 4.864 }, { date: D, value: 4.983 }], dxy: [{ date: '2026-11-09', value: 101.65 }, { date: D, value: 102.252 }],
    vix: [{ date: '2026-11-06', value: 25.64 }, { date: '2026-11-09', value: 19.92 }] };
  const t = ratesText(s, D);
  assert.match(t, /US 10-year yield: 4\.983%, \+12bp on the day/);
  assert.match(t, /Dollar index \(DXY\): 102\.25, \+0\.59% on the day/);
  assert.match(t, /VIX: no close for 2026-11-10 yet \(last 2026-11-09, 19\.92\)/);
  assert.match(t, /US 30-year yield: not available/);
  assert.match(t, /US 2-year: not in this feed/);
  assert.ok(RATE_SERIES.every(r => r.ticker && r.label));
});

test('the morning\'s timed events are handed over as having happened', () => {
  const t = pastEvents(['US Core CPI at 13:30 London could flip the dollar', 'Concentration in USD legs'], D);
  assert.match(t, /US Core CPI at 13:30/); assert.ok(!t.includes('Concentration'));
  assert.match(t, /these have HAPPENED/);
  assert.match(pastEvents([], D), /no timed events/);
});

test('the evening issue: six sections, two and the currency chart on page 1, the rest after, none cut to three sentences', () => {
  const B = { EURUSD: bars(-2, 330), USDJPY: bars(1.5, 330), GBPUSD: bars(-1, 200), AUDUSD: bars(-1, 300) };
  const cards = Object.fromEntries(Object.keys(B).map(k => [k, { levels: L }]));
  const long = 'One. Two. Three. Four. Five.';
  const titles = ['The day', 'Rates and the dollar', 'Currencies', 'Stocks, commodities and crypto', 'What stood out', 'Into tomorrow'];
  const issue = { subject: 'Hot CPI lifts the dollar', standfirst: 'A dollar day. The call held.', sections: titles.map((title, i) => ({ title, label: i < 4 ? 'Observed data' : i === 4 ? 'Untested interpretation' : 'Context, not a signal', body: long })) };
  const { html } = renderEvening({ date: D, issue, score: null, reflection: null, movers: null, record: null, moves: dayMoves(B, cards, D), cards }, { esc: s => String(s ?? '') });
  const p1 = html.slice(0, html.indexOf('Across markets')), p2 = html.slice(html.indexOf('Across markets'));
  assert.ok(p1.includes('Rates and the dollar') && p1.includes('THE CURRENCIES TODAY') && !p1.includes('>Currencies<'));
  assert.ok(p2.includes('>Currencies<') && p2.includes('Into tomorrow'));
  assert.ok(html.includes('Five.'), 'a section keeps up to six sentences');
});

test('bar figure: a long note on a negative bar is kept clear of the value column', () => {
  const svg = barFigure('t', [{ label: 'GBP/USD', v: -1.5, note: 'long · −3.00 u · mkt −108 pips, −0.80% and a much longer tail that cannot fit' }], { esc: s => s }, { unit: '' });
  const note = svg.match(/<text x="(\d+)"[^>]*text-anchor="start"[^>]*>([^<]*)<\/text>/), val = svg.match(/<text x="(\d+)"[^>]*font-weight="700"[^>]*>−1\.5<\/text>/);
  assert.ok(note && val);
  assert.ok(+note[1] + note[2].length * 6.1 <= +val[1], `note ends ${+note[1] + note[2].length * 6.1}, value at ${val[1]}`);
  assert.ok(note[2].endsWith('…'));
});
