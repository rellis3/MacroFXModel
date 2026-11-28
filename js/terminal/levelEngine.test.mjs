// js/terminal/levelEngine.test.mjs: the level engine core (reach / race / on the way / after a touch) on synthetic bars and a synthetic forecast, its Evidence wiring,
// its card text and the REACH command. node --test js/terminal/levelEngine.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { normCdf, brownianReach, impliedScale, race2, weekOpenMs, sessionsLeftInWeek, sessionsLeftToday, levelCard, ladderLevels, headline, parseReachArgs,
  drawdownLayer, nearestLine, x7At, COMPONENTS, DRAWDOWN_RULE, X7_BUCKETS, HORIZONS } from './levelEngineCore.js';
import { cardHtml, ladderHtml, footHtml, chip, clockOf } from './levelEngineView.js';
import { DESK_EVIDENCE } from '../deskEvidence.js';
import { RULE as DD_RULE } from '../drawdownShadowCore.js';
import { buildCommands, search, resolveInstrument } from './commandCore.js';
import { surfaceById } from './tabRegistry.js';
import { FEATURES } from './featureStatus.js';
import { PANELS } from './insightView.js';

const iso = s => Date.parse(s);
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

test('normCdf and the reflection principle: symmetric, the known values, and impliedScale inverts brownianReach', () => {
  close(normCdf(0), 0.5, 1e-7); close(normCdf(1.959964), 0.975, 1e-6); close(normCdf(-1) + normCdf(1), 1, 1e-7);
  close(brownianReach(1, 1), 2 * (1 - normCdf(1)), 1e-12); assert.equal(brownianReach(0, 1), 1); assert.equal(brownianReach(1, 0), 0);
  for (const p of [0.02, 0.2, 0.5, 0.9]) close(brownianReach(0.7, impliedScale(0.7, p)), p, 1e-6, `p ${p}`);
  assert.equal(impliedScale(1, 0), null); assert.equal(impliedScale(1, 1), null);
});

test('race2: b/(a+b) with no time limit, the one-barrier reach when the other is far, symmetric, and the three outcomes sum to one', () => {
  const inf = race2(1, 3, 1e6); close(inf.top, 0.75, 1e-6); close(inf.bottom, 0.25, 1e-6); close(inf.neither, 0, 1e-6);
  close(race2(1, 50, 0.8).top, brownianReach(1, 0.8), 1e-4, 'far floor: top = one-barrier reach');
  const s = race2(1, 1, 0.9); close(s.top, s.bottom, 1e-12); close(s.top + s.bottom + s.neither, 1, 1e-12);
  for (const sc of [0.05, 0.3, 1, 3]) { const r = race2(0.6, 1.4, sc); assert.ok(r.top <= brownianReach(0.6, sc) + 1e-6 && r.bottom <= brownianReach(1.4, sc) + 1e-6, `bounded by each reach at ${sc}`); assert.ok(r.top >= 0 && r.bottom >= 0 && r.neither >= 0); }
  assert.ok(race2(0.6, 1.4, 0.3).top < race2(0.6, 1.4, 1).top, 'more time, more chance');
  assert.equal(race2(0, 1, 1), null);
});

test('the week: Monday 00:00 London (GMT and BST), a weekend belongs to the week just ended; sessions left to Friday 22:00 and to tonight', () => {
  assert.equal(new Date(weekOpenMs(iso('2026-11-25T10:00:00Z'))).toISOString(), '2026-11-23T00:00:00.000Z');
  assert.equal(new Date(weekOpenMs(iso('2026-11-23T00:30:00Z'))).toISOString(), '2026-11-23T00:00:00.000Z');
  assert.equal(new Date(weekOpenMs(iso('2026-11-29T12:00:00Z'))).toISOString(), '2026-11-23T00:00:00.000Z', 'a Sunday');
  assert.equal(new Date(weekOpenMs(iso('2026-07-15T10:00:00Z'))).toISOString(), '2026-07-12T23:00:00.000Z', 'BST: Monday 00:00 London = Sunday 23:00 UTC');
  close(sessionsLeftInWeek(iso('2026-11-27T11:00:00Z')), 11 / 22, 1e-9, 'Friday 11:00');
  close(sessionsLeftInWeek(iso('2026-11-23T00:00:00Z')), 5, 1e-9, 'Monday open'); assert.equal(sessionsLeftInWeek(iso('2026-11-28T12:00:00Z')), 0, 'Saturday');
  assert.equal(sessionsLeftToday(iso('2026-11-25T22:30:00Z')), 0); close(sessionsLeftToday(iso('2026-11-25T11:00:00Z')), 0.5, 1e-9);
});

// a synthetic Wednesday of 5-minute bars from the London midnight, flat around 1.1000 with a little range, and hourly bars back to Monday
const DAY = iso('2026-11-25T00:00:00Z');
const bars5 = (n, f = () => 1.1) => Array.from({ length: n }, (_, i) => { const p = f(i); return { time: DAY / 1000 + i * 300, open: p, high: p + 0.0003, low: p - 0.0003, close: p }; });
const weekBars = Array.from({ length: 48 }, (_, i) => ({ time: iso('2026-11-23T00:00:00Z') / 1000 + i * 3600, open: 1.1, high: 1.1015, low: 1.0985, close: 1.1 }));
const FC = {
  harLog: { vol_annual: 6.3, news_mult: 1 },
  ladder: { sigma_daily_pct: 0.4, oh: { p50: 0.25, p75: 0.45, p90: 0.65 }, ol: { p50: 0.25, p75: 0.45, p90: 0.65 } },
  ladder_weekly_rev: { oh: { p50: 0.55, p75: 0.9, p90: 1.3 }, ol: { p50: 0.55, p75: 0.9, p90: 1.3 } },
};
const NOW = DAY + 10.3 * 3600e3, B = bars5(124);
const base = { sym: 'EURUSD', fc: FC, bars: B, weekBars, nowMs: NOW };

test('reach: M1 from now (with 30 min to 4 h), the session prior, the week and the week-from-now geometry; farther is less likely; a touched level says so', () => {
  const near = levelCard({ ...base, level: 1.103 }), far = levelCard({ ...base, level: 1.106 });
  assert.equal(near.ok, true); assert.equal(near.side, 'up');
  assert.ok(near.reach.ROS.p > far.reach.ROS.p && far.reach.ROS.p > 0, 'M1 falls with distance');
  assert.ok(near.reach.ROS.by['30'] < near.reach.ROS.by['240'] && near.reach.ROS.by['240'] <= near.reach.ROS.p + 1e-9, 'longer window, higher chance');
  assert.equal(near.reach.ROS.c, 'm1'); assert.ok(near.reach.EOD.p > far.reach.EOD.p); assert.ok(near.reach.EOW.p > near.reach.EOD.p, 'the week is wider than the day');
  assert.equal(near.reach.EOW.ladder, 'reverting'); assert.equal(near.reach.EOW.coversMonday, true); assert.ok(near.reach.EOWnow.p > 0 && near.reach.EOWnow.sessionsLeft > 2);
  const touched = levelCard({ ...base, level: 1.1002 });
  assert.equal(touched.alreadyTouched, true); assert.equal(touched.reach.ROS.touched, true);
  const wk = levelCard({ ...base, level: 1.1012 }); assert.equal(wk.reach.EOW.alreadyTouched, true, 'the hourly bars reached 1.1015 earlier this week');
  assert.equal(headline(near).c, 'm1'); assert.equal(headline(levelCard({ ...base, level: 1.103, horizon: 'EOW' })).c, 'week');
});

test('no lookahead: bars after the clock are ignored, so a later spike cannot change the answer; the as-of clock is what counts', () => {
  const spike = [...B, ...Array.from({ length: 6 }, (_, i) => ({ time: NOW / 1000 + 600 + i * 300, open: 1.11, high: 1.12, low: 1.1, close: 1.11 }))];
  const a = levelCard({ ...base, level: 1.104, level2: 1.096 }), b = levelCard({ ...base, bars: spike, level: 1.104, level2: 1.096 });
  assert.deepEqual(b.reach, a.reach); assert.deepEqual(b.race, a.race); assert.deepEqual(b.mae, a.mae); assert.equal(b.price, a.price);
  assert.equal(clockOf({ __deskAsof: { active: true, t: 123 } }).ms, 123); assert.equal(clockOf({ __deskAsof: { active: false, t: 123 } }).asof, false);
});

test('race: two levels either side give up-first, down-first and neither that sum to one, b/(a+b) without a time limit; the same side says the nearer is first', () => {
  const c = levelCard({ ...base, level: 1.103, level2: 1.098 });
  close(c.race.upFirst + c.race.downFirst + c.race.neither, 1, 1e-9); close(c.race.upEventually, 0.002 / 0.005, 1e-9);
  assert.ok(c.race.downFirst > c.race.upFirst, 'the nearer level is likelier first');
  const w = levelCard({ ...base, level: 1.103, level2: 1.098, horizon: 'EOW' }); assert.ok(w.race.neither < c.race.neither, 'more time, less neither');
  const same = levelCard({ ...base, level: 1.103, level2: 1.105 }); assert.equal(same.race.sameSide, true); assert.equal(same.race.first, 1.103);
});

test('on the way: the chance of going m the other way first falls as m grows and is below the no-time-limit b/(a+b) figure', () => {
  const c = levelCard({ ...base, level: 1.104 });
  assert.equal(c.mae.length, 3);
  for (let i = 1; i < 3; i++) assert.ok(c.mae[i].againstFirst < c.mae[i - 1].againstFirst);
  for (const m of c.mae) { assert.ok(m.againstFirst <= m.againstEventually + 1e-9); assert.ok(m.price < c.price, 'the other way from an up level is below'); }
});

test('drawdown layer: on only after a 20-day S&P fall of 2% or more and only for FX and indices; shown beside the base, which it never changes', () => {
  assert.deepEqual(DRAWDOWN_RULE.factor, DD_RULE.factor); assert.equal(DRAWDOWN_RULE.thresholdPct, DD_RULE.thresholdPct);
  assert.equal(drawdownLayer('EURUSD', -3).on, true); assert.equal(drawdownLayer('EURUSD', -1).on, false); assert.equal(drawdownLayer('GOLD', -5).on, false); assert.equal(drawdownLayer('NQ', -2).factor, 1.028);
  const off = levelCard({ ...base, level: 1.104, level2: 1.096 }), on = levelCard({ ...base, level: 1.104, level2: 1.096, spx20: -3.5 });
  assert.deepEqual(on.reach.ROS, off.reach.ROS, 'the base numbers are identical'); assert.equal(on.reach.EOD.p, off.reach.EOD.p);
  assert.ok(on.reach.EOD.drawdown.p > on.reach.EOD.p && on.reach.EOW.drawdown.p > on.reach.EOW.p, 'wider ranges reach further'); assert.equal(off.reach.EOD.drawdown, null);
  assert.ok(on.race.drawdown.neither < on.race.neither); assert.ok(on.mae[0].drawdown.againstFirst >= on.mae[0].againstFirst);
});

test('after a touch: the ladder line is named, next-line odds and the X7 window by London hour, and the reaction block is the three NULL entries', () => {
  const L = FC.ladder; assert.equal(nearestLine(L, 1.1, 1.1 * 1.0045, 0.0044).name, 'p75'); assert.equal(nearestLine(L, 1.1, 1.1 * 1.0035, 0.0044), null);
  const c = levelCard({ ...base, level: 1.1 * 1.0045 }); assert.equal(c.after.line.name, 'p75'); assert.equal(c.after.nextRung.p, 0.4); assert.equal(c.after.x7.p, 0.56, '10:18 London is the 07-12 window');
  assert.equal(levelCard({ ...base, sym: 'GBPUSD', level: 1.104 }).after.x7, null, 'X7 is NQ, GOLD and EURUSD only');
  assert.equal(x7At(DAY + 17 * 3600e3).p, 0.28); assert.equal(X7_BUCKETS.length, 4);
  assert.deepEqual(c.after.reaction.items, ['reaction', 'nearMiss', 'lineRace']); for (const k of c.after.reaction.items) assert.equal(COMPONENTS[k].verdict, 'null');
});

test('every component cites a real Evidence Book entry with the verdict it holds there (a chip cannot claim more than the book)', () => {
  const ev = new Map(DESK_EVIDENCE.map(e => [e.id, e]));
  for (const [k, c] of Object.entries(COMPONENTS)) {
    assert.ok(c.ev && ev.has(c.ev), `${k}: ${c.ev} is in the Evidence Book`); assert.equal(c.verdict, ev.get(c.ev).verdict, `${k}: verdict`);
    if (c.ev2) assert.equal(ev.get(c.ev2)?.verdict, c.verdict, `${k}: ${c.ev2}`);
    if (c.shown) assert.equal(c.shown, 'context', `${k}: a borrowed chip may only say context`);
    assert.ok(c.note && c.note.length > 30, `${k} says what it rests on`);
  }
  assert.match(chip('geometry'), /in-vd context/); assert.match(chip('m1'), /in-vd validated[^]*level-p2-reach/); assert.match(chip('reaction'), /in-vd null/);
});

test('bad input is explained, never guessed', () => {
  assert.match(levelCard({ ...base, level: null }).error, /Type a price/); assert.match(levelCard({ ...base, fc: null, level: 1.1 }).error, /No forecast/);
  assert.match(levelCard({ ...base, bars: [], weekBars: [], level: 1.1 }).error, /No prices/);
  const early = levelCard({ ...base, nowMs: DAY + 2 * 3600e3, bars: bars5(24), level: 1.104 }); assert.equal(early.reach.ROS, null); assert.ok(early.notes.some(n => /03:00/.test(n)));
  const wayOut = levelCard({ ...base, level: 1.2 }); assert.equal(wayOut.reach.ROS, null); assert.ok(wayOut.notes.some(n => /3 sigma/.test(n)));
  assert.ok(HORIZONS.includes(levelCard({ ...base, level: 1.104, horizon: 'zzz' }).horizon));
});

test('the card text: every number with its chip, the reaction NULL said plainly, no direction or trade wording, no hard-coded colours, escaped', () => {
  const c = levelCard({ ...base, level: 1.104, level2: 1.097, spx20: -3 }), h = cardHtml(c) + ladderHtml(ladderLevels({ ...base, horizon: 'ROS' }), 'EURUSD') + footHtml();
  for (const id of ['level-p2-reach', 'ladder-calibration', 'horizon-reversion', 'level-p2-race', 'drawdown-forecast-error-fx', 'level-context-engine', 'level-near-miss-entry', 'live-range-line-race']) assert.ok(h.includes(id), id);
  assert.match(h, /placebo after costs/); assert.match(h, /With drawdown layer/); assert.match(h, /never implied/); assert.match(h, /data-level2=/);
  const text = h.replace(/<span class="le-id">[^<]*<\/span>/g, ' ').replace(/<[^>]+>/g, ' ');   // Evidence ids are names (level-near-miss-entry), not wording
  assert.ok(!/\b(buy|sell|go long|go short|stop loss|take profit|bullish|bearish|entry)\b/i.test(text), 'no trade or direction wording');
  assert.ok(!/#[0-9a-f]{6}\b/i.test(h)); assert.ok(!/<1%|>99%/.test(h), 'the < and > of the edge cases are escaped');
  assert.ok(!cardHtml({ ok: false, error: '<img src=x>' }).includes('<img src=x>'));
  assert.ok(!/&amp;(lt|gt);/.test(h), 'no double escaping');
  const t = cardHtml(levelCard({ ...base, level: 1.1002 })); assert.match(t, /le-big">touched</, 'a touched level says touched in the headline');
  assert.equal(ladderLevels({ ...base, fc: { ladder: {} } }).length, 0);
});

test('the REACH command parses market, one or two prices and a horizon, and opens the Level engine; the surface is a registered preview with a status entry', () => {
  const q = parseReachArgs('gold 4,200 eod', resolveInstrument); assert.deepEqual(q, { inst: 'GOLD', level: 4200, level2: null, horizon: 'EOD' });
  assert.deepEqual(parseReachArgs('eurusd 1.17 1.15', resolveInstrument), { inst: 'EURUSD', level: 1.17, level2: 1.15, horizon: null });
  assert.match(parseReachArgs('eurusd zzz', resolveInstrument).error, /not a market/); assert.match(parseReachArgs('eurusd 1 2 3', resolveInstrument).error, /At most two/);
  const cmds = buildCommands({ now: () => iso('2026-11-25T10:00:00Z') }), run = line => search(cmds, line)[0];
  assert.deepEqual(run('reach gold 4200 eow').action, { kind: 'levelengine', inst: 'GOLD', level: 4200, level2: null, horizon: 'EOW' });
  assert.deepEqual(run('reach eurusd 1.17 1.15').action, { kind: 'levelengine', inst: 'EURUSD', level: 1.17, level2: 1.15, horizon: 'ROS' });
  const row = surfaceById('panel.insight.reach'); assert.equal(row.hidden, 'preview'); assert.match(row.label, /level engine/);
  assert.equal(FEATURES.levelEngine.surface, 'panel.insight.reach'); assert.ok(FEATURES.levelEngine.where.join(' ').includes('REACH'));
  assert.match(PANELS.find(p => p.key === 'reach').pill, />Level engine</);
});
