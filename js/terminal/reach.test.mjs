// js/terminal/reach.test.mjs: the level-reach calculator on synthetic bars and a synthetic forecast. node --test js/terminal/reach.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { exceedance, londonOpenMs, checkpointAt, travelClass, harSigmaDailyPct, reach, ladderRows, band, CHECKPOINTS } from './reachCore.js';
import { travelClass as shadowClass, harSigmaDailyPct as shadowSigma } from '../harShadowCore.js';
import { REMAINING_TRAVEL_R3 } from '../remainingTravelParamsR3.js';

const iso = s => Date.parse(s);
const RUNGS = [{ x: 0.5, p: 0.5 }, { x: 1, p: 0.25 }, { x: 1.6, p: 0.1 }];

test('exceedance: 1 at zero, hits each rung exactly, falls monotonically, and flags the tail beyond the last rung', () => {
  assert.equal(exceedance(RUNGS, 0).p, 1); assert.equal(exceedance(RUNGS, -1).p, 1);
  for (const r of RUNGS) assert.ok(Math.abs(exceedance(RUNGS, r.x).p - r.p) < 1e-12, `rung ${r.x}`);
  let prev = 1; for (let x = 0.05; x < 4; x += 0.05) { const e = exceedance(RUNGS, x); assert.ok(e.p <= prev + 1e-12, `monotone at ${x}`); prev = e.p; assert.equal(e.tail, x > 1.6); }
  assert.ok(exceedance(RUNGS, 6).p >= 0.001); assert.equal(exceedance([{ x: 1, p: 0.5 }], 1).p, null, 'under three points: no answer');
});
test('londonOpenMs: the London midnight, in winter (GMT) and in summer (BST); checkpointAt counts hours from it and names the latest odd checkpoint', () => {
  assert.equal(new Date(londonOpenMs(iso('2026-11-16T10:20:00Z'))).toISOString(), '2026-11-16T00:00:00.000Z');
  assert.equal(new Date(londonOpenMs(iso('2026-07-15T10:20:00Z'))).toISOString(), '2026-07-14T23:00:00.000Z');
  assert.equal(new Date(londonOpenMs(iso('2026-11-16T00:10:00Z'))).toISOString(), '2026-11-16T00:00:00.000Z');
  const c = checkpointAt(iso('2026-11-16T10:20:00Z')); assert.equal(c.checkpoint, 9); assert.ok(Math.abs(c.hours - 10.3333) < 1e-3); assert.equal(checkpointAt(iso('2026-11-16T00:30:00Z')).checkpoint, null); assert.equal(checkpointAt(iso('2026-11-16T22:59:00Z')).checkpoint, 21);
});
test('the class and sigma rules agree with js/harShadowCore.js (the model was fitted on those)', () => {
  for (const s of ['EURUSD', 'GBPJPY', 'GOLD', 'NQ', 'SPX500', 'WHEAT', 'USDJPY', 'DE30', 'EURNOK']) assert.equal(travelClass(s), shadowClass(s), s);
  const fc = { harLog: { vol_annual: 6.22, news_mult: 1.3 } }; assert.equal(harSigmaDailyPct(fc), shadowSigma(fc)); assert.equal(harSigmaDailyPct({}), null);
  assert.ok(CHECKPOINTS.every(h => REMAINING_TRAVEL_R3.classes.major[String(h)]), 'the model has every checkpoint for the majors');
});
// a flat day of 5 minute bars around 1.1000 starting at the London midnight
const barsFrom = (openMs, n, f = i => 1.1) => Array.from({ length: n }, (_, i) => { const p = f(i); return { time: openMs / 1000 + i * 300, open: p, high: p + 0.0002, low: p - 0.0002, close: p }; });
const FC = { harLog: { vol_annual: 6.3, news_mult: 1 }, ladder: { oh: { p50: 0.25, p75: 0.45, p90: 0.65 }, ol: { p50: 0.25, p75: 0.45, p90: 0.65 } } };
test('reach: the rest-of-session chance falls with distance and with the hour; the whole-session chance matches the ladder at its own rungs; a level beyond the p90 line is flagged as extrapolated', () => {
  const open = iso('2026-11-16T00:00:00Z'), bars = barsFrom(open, 12 * 10 + 4), nowMs = open + 10.3 * 3600e3, P = 1.1;
  const near = reach({ sym: 'EURUSD', fc: FC, bars, nowMs, level: P * 1.001 }), far = reach({ sym: 'EURUSD', fc: FC, bars, nowMs, level: P * 1.004 });
  assert.equal(near.ok, true); assert.ok(near.rest.p > far.rest.p && far.rest.p > 0); assert.ok(near.whole.p > far.whole.p);
  const atP50 = reach({ sym: 'EURUSD', fc: FC, bars, nowMs, level: 1.1 * (1 + 0.0025) }); assert.ok(Math.abs(atP50.whole.p - 0.5) < 0.01, `whole at the first line ${atP50.whole.p}`);
  const wayOut = reach({ sym: 'EURUSD', fc: FC, bars, nowMs, level: P * 1.02 }); assert.equal(wayOut.whole.tail, true); assert.ok(wayOut.whole.band.h >= 0.06);
  const late = reach({ sym: 'EURUSD', fc: FC, bars: barsFrom(open, 12 * 20 + 4), nowMs: open + 20.3 * 3600e3, level: P * 1.002 }); assert.ok(late.rest.p < near.rest.p, 'less time left, lower chance');
  assert.equal(near.rest.checkpoint, 9); assert.ok(near.rest.rungs.p50 > P && near.rest.rungs.p90 > near.rest.rungs.p75);
});
test('reach: a level already touched this session says so; the 21:00 checkpoint is flagged with a wider band; unfitted markets, early hours and bad input are explained, not guessed', () => {
  const open = iso('2026-11-16T00:00:00Z'), bars = barsFrom(open, 12 * 10 + 4, i => (i === 20 ? 1.1035 : 1.1)), nowMs = open + 10.3 * 3600e3;
  const t = reach({ sym: 'EURUSD', fc: FC, bars, nowMs, level: 1.102 }); assert.equal(t.alreadyTouched, true); assert.ok(t.sessionHigh >= 1.1035);
  const h21 = reach({ sym: 'EURUSD', fc: FC, bars: barsFrom(open, 12 * 21 + 4), nowMs: open + 21.4 * 3600e3, level: 1.1006 }); assert.equal(h21.rest.flagged, true); assert.ok(h21.rest.band.h >= 0.05); assert.ok(h21.notes.some(n => /21:00/.test(n)));
  const un = reach({ sym: 'WHEAT', fc: FC, bars, nowMs, level: 1.2 }); assert.equal(un.rest, null); assert.ok(un.notes.some(n => /not fitted/.test(n)));
  const early = reach({ sym: 'EURUSD', fc: FC, bars: barsFrom(open, 4), nowMs: open + 0.3 * 3600e3, level: 1.101 }); assert.equal(early.rest, null); assert.ok(early.notes.some(n => /01:00/.test(n)));
  assert.equal(reach({ sym: 'EURUSD', fc: FC, bars, nowMs, level: NaN }).ok, false); assert.equal(reach({ sym: 'EURUSD', fc: FC, bars: [], nowMs, level: 1.1 }).ok, false);
});
test('ladderRows: six distances either side, chance falls with distance on each side; band: wider in the tail and at the flagged hour', () => {
  const open = iso('2026-11-16T00:00:00Z'), rows = ladderRows({ sym: 'EURUSD', fc: FC, bars: barsFrom(open, 12 * 10 + 4), nowMs: open + 10.3 * 3600e3 });
  assert.equal(rows.length, 6); for (let i = 1; i < rows.length; i++) { assert.ok(rows[i].up.p <= rows[i - 1].up.p + 1e-12); assert.ok(rows[i].down.p <= rows[i - 1].down.p + 1e-12); } assert.ok(rows[0].up.level > 1.1 && rows[0].down.level < 1.1);
  assert.ok(band(0.5, { kind: 'r3' }).h < band(0.5, { kind: 'r3', flagged: true }).h); assert.ok(band(0.5, { kind: 'whole' }).h < band(0.5, { kind: 'whole', tail: true }).h); assert.equal(band(0.01, { kind: 'whole' }).lo, 0);
});
// the page text tests moved to levelEngine.test.mjs with the Level engine card (reachView.js retired 2026-11-28)
