// node --test js/terminal/eveningCore.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowMove, reactionOf, reviewScript, reviewFigure, releasedGroups, tomorrowScript, isEvening, reactKey } from './eveningCore.js';
import { mergeDay } from './dayAheadCore.js';
import { shockTodayScript } from './shockwaveCore.js';
import { dayMoveScript, pickMarket, DAY_MOVE_KEYS } from './jarvisSessionCore.js';

const T = s => Date.parse(s);
// 15-minute bars for 12 weekdays: flat at 1.3000 except a 0.02% drift in each 09:30-10:00 window, and a 0.10% drop on the last day at 09:30
function bars(lastDay = '2026-11-23') {
  const out = [], end = T(`${lastDay}T00:00:00Z`);
  for (let d = 16; d >= 0; d--) {
    const day = end - d * 864e5, dow = new Date(day).getUTCDay(); if (dow === 0 || dow === 6) continue;
    for (let m = 0; m < 24 * 60; m += 15) {
      const t = day + m * 60e3; let o = 1.3, c = 1.3;
      if (m === 9 * 60 + 30) c = d === 0 ? 1.3 * 0.9995 : 1.3 * 1.0001;
      if (m === 9 * 60 + 45) { o = d === 0 ? 1.3 * 0.9995 : 1.3 * 1.0001; c = d === 0 ? 1.3 * 0.999 : 1.3 * 1.0002; }
      out.push({ t: t / 1000, o, c });
    }
  }
  return out;
}

test('windowMove: open of the release bar to the close of the bar ending 30 minutes later; null when the window is not covered', () => {
  const b = bars();
  assert.ok(Math.abs(windowMove(b, T('2026-11-23T09:30:00Z')) - -0.1) < 1e-9);
  assert.equal(windowMove(b, T('2026-11-22T09:30:00Z')), null, 'a Sunday has no bars');
  assert.equal(windowMove(b, T('2026-11-23T23:50:00Z')), null, 'not finished');
  assert.equal(windowMove([], 0), null);
});

test('reactionOf: signed for the currency (+ = it gained), against the same half hour on earlier days', () => {
  const b = bars(), gbp = reactionOf(b, T('2026-11-23T09:30:00Z'), 'GBP');
  assert.equal(gbp.pair, 'GBPUSD'); assert.ok(gbp.movePct < 0); assert.ok(Math.abs(gbp.usualPct - 0.02) < 1e-6); assert.ok(Math.abs(gbp.ratio - 5) < 1e-6);
  const usd = reactionOf(b, T('2026-11-23T09:30:00Z'), 'USD');
  assert.ok(usd.movePct > 0, 'EURUSD down is the dollar up');
  assert.equal(reactionOf(b, T('2026-11-23T09:30:00Z'), 'CNY'), null, 'no pair for it');
});

const week = [
  { country: 'GB', event: 'Flash Services PMI', impact: 'medium', ms: T('2026-11-23T09:30:00Z'), estimate: '53.0', prev: '53.1', actual: null },
  { country: 'GB', event: 'Flash Manufacturing PMI', impact: 'medium', ms: T('2026-11-23T09:30:00Z'), estimate: '53.0', prev: '52.8', actual: null },
  { country: 'US', event: 'Flash Services PMI', impact: 'medium', ms: T('2026-11-23T14:45:00Z'), estimate: '55.6', prev: '57.9', actual: null },
  { country: 'US', event: 'CB Consumer Confidence', impact: 'medium', ms: T('2026-11-24T15:00:00Z'), estimate: '92.1', prev: '91.7', actual: null },
  { country: 'CA', event: 'BOC Gov Macklem Speaks', impact: 'medium', ms: T('2026-11-24T17:25:00Z'), estimate: null, prev: null, actual: null },
  { country: 'NZ', event: 'Retail Sales q/q', impact: 'low', ms: T('2026-11-24T21:45:00Z'), estimate: '0.5%', prev: '-0.5%', actual: null },
];
const feed = { printed: { rows: [
  { ms: T('2026-11-23T09:30:00Z'), country: 'United Kingdom', event: 'S&P Global Services PMI', actual: 52, consensus: 53, previous: 52.8 },
  { ms: T('2026-11-23T09:30:00Z'), country: 'United Kingdom', event: 'S&P Global Manufacturing PMI', actual: 52.7, consensus: 53, previous: 52.8 },
  { ms: T('2026-11-23T09:30:00Z'), country: 'United Kingdom', event: 'S&P Global Composite PMI', actual: 52.3, consensus: 51.9, previous: 52.9 },
  { ms: T('2026-11-23T14:45:00Z'), country: 'United States', event: 'S&P Global Services PMI', actual: 55.6, consensus: 55.6, previous: 56.1 },
] } };
const NOW = T('2026-11-23T21:00:00Z');

test('releasedGroups: printed releases by time and currency; a bare composite PMI gives way to the named parts', () => {
  const day = mergeDay({ feed, week, now: NOW }), g = releasedGroups(day, NOW);
  assert.deepEqual(g.map(x => x.key), ['09:30|GBP', '14:45|USD']);
  assert.ok(g[0].ev.every(e => e.short !== 'UK PMI'), g[0].ev.map(e => e.short).join());
  assert.equal(releasedGroups(day, T('2026-11-23T08:00:00Z')).length, 0, 'nothing has printed at 08:00');
});

test('reviewScript: each number against its forecast (above / below / in line), what the currency did after, and no claim of cause', () => {
  const day = mergeDay({ feed, week, now: NOW }), react = { [reactKey('09:30', 'GBP')]: { movePct: -0.1, usualPct: 0.03, ratio: 3.4 }, [reactKey('14:45', 'USD')]: { movePct: 0.005, usualPct: 0.04, ratio: 0.1 } };
  const t = reviewScript(day, react, NOW);
  assert.match(t, /^Today's releases, and what followed\. At 09:30, UK (services|manufacturing) PMI came in at/);
  assert.match(t, /UK services PMI came in at 52, below the 53\.0 expected/);
  assert.match(t, /In the half hour after, the pound fell 0\.1 percent, about 3 times the usual for that time of day\./);
  assert.match(t, /At 14:45, US services PMI came in at 55\.6, in line with the 55\.6 expected\. The dollar barely moved in the half hour after\./);
  assert.match(t, /not proof one caused the other\.$/);
  assert.doesNotMatch(t, /\bbecause\b|\bbeat\b|\bmissed\b/);
  assert.deepEqual(reviewFigure(day, react, NOW), { value: '3.4×', label: 'GBP after 09:30 vs usual' });
  assert.equal(reviewScript(mergeDay({ week, now: T('2026-11-23T07:00:00Z') }), {}, T('2026-11-23T07:00:00Z')), null);
  // max: the short cut reads at most two times
  assert.equal((reviewScript(day, react, NOW, 1).match(/\bAt \d\d:\d\d/g) ?? []).length, 1);
});

test('tomorrowScript: the next day\'s calendar in the outlook\'s words; skips a weekend; null past the calendar', () => {
  const t = tomorrowScript(week, NOW);
  assert.equal(t.label, 'Tomorrow');
  assert.match(t.text, /^No top-tier releases tomorrow; the medium-impact ones, London time\. At 15:00, US consumer sentiment: expected 92\.1, after 91\.7 last time\. At 17:25, Macklem speaks\./);
  const fri = [{ country: 'US', event: 'ISM Manufacturing PMI', impact: 'high', ms: T('2026-11-30T15:00:00Z'), estimate: '49.0', prev: '48.7', actual: null }];
  const mon = tomorrowScript(fri, T('2026-11-27T21:00:00Z'));
  assert.equal(mon.label, 'Monday'); assert.match(mon.text, /^Monday's calendar, London time\. At 15:00, US manufacturing PMI: expected 49\.0, after 48\.7 last time\.$/);
  assert.equal(tomorrowScript([], NOW), null);
});

test('isEvening: from 18:00 London', () => {
  assert.equal(isEvening(T('2026-11-23T17:59:00Z')), false); assert.equal(isEvening(T('2026-11-23T18:00:00Z')), true);
  assert.equal(isEvening(T('2026-07-01T17:30:00Z')), true, 'summer time: 18:30 London');
});

test('shockTodayScript: today\'s big release, what printed, and the main market\'s real first half hour against its typical size', () => {
  const rel = { family: 'NFP', actual: 29000, consensus: 65000, M: { eurusd: { m30: -0.31 } } };
  assert.equal(shockTodayScript({ rel, mkt: 'eurusd', typ: { med: 0.15, n: 24, unit: '%' }, hm: '13:30' }),
    "Today's big one: the US payrolls at 13:30. It printed 29 thousand against 65 thousand expected. In the first thirty minutes, Euro Dollar fell 0.31 percent, about twice the typical 0.15 percent over the last 24 of them.");
  assert.equal(shockTodayScript({ rel: { family: 'NFP', M: {} }, mkt: 'eurusd', typ: { med: 0.15, n: 24, unit: '%' } }), null);
});

test('the move of the day: chosen from the Nasdaq, gold and the dollar majors only; told as a finished day', () => {
  const inst = { BTCUSD: { oc: 9, forecast: { oc_median: 1 } }, GOLD: { oc: 1.8, forecast: { oc_median: 0.6 } }, NQ: { oc: -0.5, forecast: { oc_median: 1 } } };
  assert.equal(pickMarket(null, inst, DAY_MOVE_KEYS), 'GOLD');
  const t = dayMoveScript('GOLD', { open: 2650, lo: 2641, hi: 2702, last: 2698, movePct: 1.8, times: 3 });
  assert.match(t, /^The move of the day: gold\. It opened at 2650, traded between 2641 and 2702, and stands at 2698 this evening\. That is up 1\.8 percent on the day, about 3 times its usual move\.$/);
});
