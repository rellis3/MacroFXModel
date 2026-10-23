import assert from 'node:assert/strict';
import { RULE, classOf, spx20AsOf, isTrigger, shadowLadder, scoreRow, scorecard } from './drawdownShadowCore.js';

assert.equal(classOf('EURUSD'), 'fx'); assert.equal(classOf('GBPJPY'), 'fx');
assert.equal(classOf('NQ'), 'idx'); assert.equal(classOf('DE30'), 'idx');
assert.equal(classOf('GOLD'), null); assert.equal(classOf('BTCUSD'), null); assert.equal(classOf('WTI'), null);

// 20-day return uses only candles closed by the session midnight
const candles = Array.from({ length: 30 }, (_, i) => ({ t: 1000 + i * 86400, c: 100 * Math.exp(-0.002 * i) }));
const mid = 1000 + 25 * 86400;                                     // candles 0..25 known
assert.equal(spx20AsOf(candles, mid), +(100 * -0.002 * 20).toFixed(3));   // -4%
assert.equal(spx20AsOf(candles.slice(0, 10), mid), null);
assert.ok(isTrigger(-4) && isTrigger(-2.0) && !isTrigger(-1.99) && !isTrigger(null));

// shadow = live x factor only on trigger sessions; live object is never mutated
const live = { hl_p50: 0.5, hl_p75: 0.7, hl_p90: 0.9, oc_p75: 0.3 };
const frozen = JSON.stringify(live);
assert.equal(shadowLadder('EURUSD', live, -3).flat.hl_p75, +(0.7 * RULE.factor.fx).toPrecision(8));
assert.equal(shadowLadder('NQ', live, -3).factor, RULE.factor.idx);
assert.equal(shadowLadder('EURUSD', live, -1).factor, 1);
assert.equal(shadowLadder('GOLD', live, -3), null);
assert.equal(JSON.stringify(live), frozen);

// scoring: a realised HL between live and shadow p75 counts as a live miss, shadow hold
const row = scoreRow('EURUSD', live, { hl: 0.72, oh: 0.4, ol: 0.3, oc: -0.2 }, -3);
assert.equal(row.live.hl_p75, 1); assert.equal(row.shadow.hl_p75, 0); assert.equal(row.trigger, true);
assert.equal(scoreRow('EURUSD', live, { error: 'x' }, -3), null);

const sc = scorecard([{ date: '2026-10-23', trigger: true, rows: [row] }, { date: '2026-10-24', trigger: false, rows: [scoreRow('EURUSD', live, { hl: 0.8 }, -1)] }]);
assert.equal(sc.triggerSessions, 1); assert.equal(sc.byClass.fx.hl_p75.live, 1); assert.equal(sc.byClass.fx.hl_p75.shadow, 0);
assert.equal(sc.ready, false);
console.log('drawdownShadowCore: all passed');
