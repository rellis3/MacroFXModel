import assert from 'node:assert/strict';
import { RULE, decisionOf, coinSide, b0Side, fnv1a, buildPlans, scoreSide, clusteredMean, summarise } from './tradePlanCore.js';

// direction layer
assert.equal(decisionOf(8), 'LONG'); assert.equal(decisionOf(10), 'LONG'); assert.equal(decisionOf(7), 'NO TRADE');
assert.equal(decisionOf(4), 'NO TRADE'); assert.equal(decisionOf(3), 'SHORT'); assert.equal(decisionOf(1), 'SHORT'); assert.equal(decisionOf(null), 'NO TRADE');
assert.equal(fnv1a('a'), 0xe40c292c);
assert.equal(coinSide('2026-11-09', 'NQ'), coinSide('2026-11-09', 'NQ'));              // fixed per row
const sides = new Set(); for (let i = 1; i <= 28; i++) sides.add(coinSide(`2026-11-${String(i).padStart(2, '0')}`, 'EURUSD')); assert.equal(sides.size, 2);
assert.equal(b0Side('GOLD'), 'LONG'); assert.equal(b0Side('EURUSD'), null);

// vol layer: stop beyond opposite p90 (stress-scaled) by 0.35σ; target same-side p75 (live)
const flat = { oh_p75: 1.0, ol_p75: 1.1, oh_p90: 1.5, ol_p90: 1.6 };
const p = buildPlans({ open: 100, flat, sigmaPct: 1, stressFactor: 1.1 });
assert.equal(p.lines, 'stress shadow (stop)');
assert.equal(+p.LONG.target.toFixed(6), 101); assert.equal(+p.LONG.stop.toFixed(6), +(100 * (1 - (1.6 * 1.1 + 0.35) / 100)).toFixed(6));
assert.equal(+p.SHORT.target.toFixed(6), 98.9); assert.equal(+p.SHORT.stop.toFixed(6), +(100 * (1 + (1.5 * 1.1 + 0.35) / 100)).toFixed(6));
assert.equal(+p.LONG.rr.toFixed(4), +(1 / (1.76 + 0.35)).toFixed(4));
const pl = buildPlans({ open: 100, flat, sigmaPct: 1 });
assert.equal(pl.lines, 'live'); assert.equal(+pl.LONG.stop.toFixed(6), 98.05);
assert.equal(buildPlans({ open: 100, flat: { oh_p75: 1 }, sigmaPct: 1 }), null);

// scoring: target, stop, both-in-bar -> stop, close exit, cost
const bar = (t, o, h, l, c) => ({ t, o, h, l, c });
const L = pl.LONG;                                    // target 101, stop 98.05, risk 1.95
let s = scoreSide(L, 100, [bar(0, 100, 100.5, 99.5, 100.2), bar(60, 100.2, 101.2, 100, 101)], 1000);
assert.equal(s.how, 'target'); assert.equal(+s.grossR.toFixed(4), +(1 / 1.95).toFixed(4));
s = scoreSide(L, 100, [bar(0, 100, 101.5, 98, 100)], 1000);
assert.equal(s.how, 'stop'); assert.equal(s.both, true); assert.equal(s.grossR, -1);
s = scoreSide(L, 100, [bar(0, 100, 100.5, 99.5, 100.2), bar(60, 100.2, 100.6, 99.9, 100.39), bar(2000, 100, 200, 0, 100)], 1000);
assert.equal(s.how, 'close'); assert.equal(s.exit, 100.39);                      // bar at/after endSec ignored
s = scoreSide(L, 100, [bar(0, 100, 100.1, 99.9, 100)], 1000, 0.0195);
assert.equal(s.costR, 0.01); assert.equal(s.netR, -0.01);
s = scoreSide(pl.SHORT, 100, [bar(0, 100, 100.1, 98.8, 99)], 1000);
assert.equal(s.how, 'target'); assert.ok(s.grossR > 0);

// summary: trade rows vs coin flip on the same rows
const mk = (date, sym, decision, lr, sr, coin) => ({ date, sym, decision, coin, b0: b0Side(sym), out: { LONG: { netR: lr, how: 'close' }, SHORT: { netR: sr, how: 'close' } } });
const rows = [];
for (let i = 0; i < 12; i++) { const d = `2027-01-${String(i + 1).padStart(2, '0')}`; rows.push(mk(d, 'NQ', 'LONG', 0.5, -0.5, i % 2 ? 'LONG' : 'SHORT'), mk(d, 'EURUSD', 'NO TRADE', 0.1, -0.1, 'LONG')); }
const S = summarise(rows, '2027-02-01');
assert.equal(S.tradeRows, 12); assert.equal(S.noTradeRows, 12); assert.equal(S.decision.mean, 0.5); assert.equal(S.pairedVsCoin.mean, 0.5);
assert.equal(S.mirror.mean, -0.5); assert.equal(S.b0OnTradeRows.mean, 0.5); assert.ok(S.decision.ci); assert.equal(S.judge.ready, false);
assert.equal(clusteredMean([], x => x).n, 0);
assert.equal(RULE.markets.length, 6);
console.log('tradePlanCore tests passed');
