// node js/yieldLegs.test.mjs
import assert from 'assert/strict';
import { zonedEpoch, anchors, estimateDuration, impliedYieldBars, buildYieldLeg, yieldMeta, YIELD_LEGS, aggregate } from './yieldLegs.js';

let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok ', name); };

ok('zonedEpoch: 15:30 New York is 19:30 UTC in summer and 20:30 UTC in winter', () => {
  assert.equal(new Date(zonedEpoch('2026-07-15', 15, 30, 'America/New_York') * 1000).toISOString(), '2026-07-15T19:30:00.000Z');
  assert.equal(new Date(zonedEpoch('2026-01-15', 15, 30, 'America/New_York') * 1000).toISOString(), '2026-01-15T20:30:00.000Z');
  assert.equal(new Date(zonedEpoch('2026-01-15', 17, 15, 'Europe/Berlin') * 1000).toISOString(), '2026-01-15T16:15:00.000Z');
});

// synthetic market: a yield path, a CFD whose log price moves -D/100 per 1 pp of yield; official close = the yield at the fix
const D_TRUE = 1.9, days = [];
for (let i = 0; i < 120; i++) { const d = new Date(Date.UTC(2026, 0, 5) + i * 86400e3); if (d.getUTCDay() % 6) days.push(d.toISOString().slice(0, 10)); }
let y = 3.5; const bars = [], official = []; let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
for (const d of days) {
  const t0 = zonedEpoch(d, 0, 0, 'UTC');
  for (let k = 0; k < 96; k++) {
    const t = t0 + k * 900; y += rnd() * 0.01;
    const p = 100 * Math.exp(-D_TRUE * (y - 3.5) / 100);
    bars.push({ t, o: p, h: p * 1.0001, l: p * 0.9999, c: p, y });
  }
  const fixT = YIELD_LEGS.Y_US2.fix(d); const b = [...bars].reverse().find(b => b.t + 900 <= fixT);
  official.push({ date: d, value: b.y });
}

ok('duration is recovered from daily price and yield changes', () => {
  const anc = anchors(official, bars, 900, YIELD_LEGS.Y_US2.fix), dur = estimateDuration(anc, 5);
  assert.ok(dur.fitted && Math.abs(dur.D - D_TRUE) < 0.05, JSON.stringify(dur));
});

ok('implied intraday yields match the true path (exact at anchors, sub-bp between them)', () => {
  const leg = buildYieldLeg('Y_US2', { official, m15: bars });
  const truth = new Map(bars.map(b => [b.t, b.y]));
  const err = leg.m15.map(b => Math.abs(b.c - truth.get(b.t)));
  assert.ok(Math.max(...err) < 0.002, 'max error ' + Math.max(...err));        // < 0.2 bp
  assert.equal(leg.mode, 'intraday');
});

ok('a yield high comes from the price low (the inverse relation)', () => {
  const anc = [{ t: 0, y: 3, p: 100 }];
  const [b] = impliedYieldBars([{ t: 10, o: 100, h: 101, l: 99, c: 100 }], anc, 2);
  assert.ok(b.h > b.c && b.l < b.c && b.h > b.l);
});

ok('a daily-only leg (German 2y) is one bar per date at the Frankfurt fix, held until the next print', () => {
  const fix22 = YIELD_LEGS.Y_DE2.fix('2026-10-22');
  const leg = buildYieldLeg('Y_DE2', { official: [{ date: '2026-10-21', value: 3.1 }, { date: '2026-10-22', value: 3.11 }], now: fix22 + 6 * 3600 });
  assert.equal(leg.mode, 'daily'); assert.equal(leg.m15[1].c, 3.11);
  assert.equal(leg.m15.length, 3, 'a hold bar carries the last value through the day');
  assert.equal(leg.m15[2].t, fix22 + 6 * 3600); assert.equal(leg.m15[2].c, 3.11);
  const late = buildYieldLeg('Y_DE2', { official: [{ date: '2026-10-22', value: 3.11 }], now: fix22 + 5 * 86400 });
  assert.equal(late.m15[late.m15.length - 1].t, YIELD_LEGS.Y_DE2.fix('2026-10-23') + 2700, 'the hold stops an hour after the next fix (a missed print shows as a gap)');
  const fri = YIELD_LEGS.Y_DE2.fix('2026-10-23');
  const wkd = buildYieldLeg('Y_DE2', { official: [{ date: '2026-10-23', value: 3.2 }], now: YIELD_LEGS.Y_DE2.fix('2026-10-26') - 3600 });
  assert.equal(wkd.m15[wkd.m15.length - 1].t, YIELD_LEGS.Y_DE2.fix('2026-10-26') - 3600, 'a Friday value carries over the weekend to Monday morning'); void fri;
});

ok('meta rows carry kind "yield" for every leg', () => {
  const m = yieldMeta(); assert.equal(m.length, Object.keys(YIELD_LEGS).length); assert.ok(m.every(r => r.kind === 'yield' && r.name.startsWith('Y_')));
});

ok('aggregate to 1h keeps open/close and the extremes', () => {
  const a = aggregate([{ t: 0, o: 1, h: 2, l: 0.5, c: 1.5 }, { t: 900, o: 1.5, h: 3, l: 1, c: 2 }], 3600);
  assert.deepEqual(a, [{ t: 0, o: 1, h: 3, l: 0.5, c: 2 }]);
});
console.log(`yieldLegs: ${n} tests passed`);
