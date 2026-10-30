// node js/signalCopierRecon.test.mjs
import assert from 'node:assert/strict';
import { signalIdFromComment, joinTradesToSignals, reconcileSignalCopierDay } from './signalCopierRecon.js';

const T = Date.parse('2026-10-30T07:01:00Z') / 1000;
const sig = (id, symbol, side, entry, sl, r, fill = true) => ({
  id, symbol, side, order: 'market', entry, sl, tp: null, style: 'swing', posted_ts: T,
  out: { fill_ts: fill ? T : null, r, exit_reason: 'close' },
});
const signals = [
  sig('101:0', 'USDJPY', 'SELL', 157.69, 157.96, 1.5),
  sig('101:1', 'EURJPY', 'SELL', 176.31, 176.67, -1.0),
  sig('101:2', 'BTCUSD', 'SELL', 78607, 79312, 0.8),
  sig('101:7', 'NAS100', 'SELL', 28965, 29096, null, false),
];
const trades = [
  { position_id: 1, symbol: 'USDJPY', comment: 'SC[101-0]', open_price: 157.67, close_price: 157.30, profit: 25, r: 1.32 },
  { position_id: 2, symbol: 'EURJPY', comment: 'SC[101-1]', open_price: 176.31, close_price: 176.20, profit: 5 },   // won where the record lost
  { position_id: 3, symbol: 'GBPJPY', comment: 'manual', open_price: 211.2, close_price: 211.0, profit: 3 },
];
const events = [
  { t: T + 5, id: '101:0', pair: 'usdjpy', status: 'entered' },
  { t: T + 5, id: '101:1', pair: 'eurjpy', status: 'entered' },
  { t: T + 5, id: '101:2', pair: 'btcusd', status: 'skipped', reason: 'symbol on skip list' },
];

assert.equal(signalIdFromComment('SC[101-7]'), '101:7');
assert.equal(signalIdFromComment('FA[x]'), null);

const j = joinTradesToSignals(trades, signals);
assert.equal(j[0].signal_id, '101:0');
assert.equal(j[0].slip_r, 0.074);           // sold 0.02 lower than his 157.69 on a 0.27 stop: worse (+ = worse)
assert.equal(j[0].real_r, 1.32);            // broker r wins when present
assert.equal(j[1].real_r, 0.306);           // computed from our fill and his stop
assert.equal(j[2].signal, null);

const rec = reconcileSignalCopierDay({ date: '2026-10-30', trades, signals, events });
assert.equal(rec.bot, 'signal_copier');
assert.equal(rec.tradeCount, 3);
assert.equal(rec.realPnl, 33);
assert.equal(rec.backtestCandidateCount, 3);          // NAS100 never filled on the record
assert.equal(rec.decisionMatchRate, 66.7);            // 2 of 3 trades are his signals
assert.equal(rec.winLossMatchRate, 50);               // EURJPY disagrees
assert.equal(rec.missedCandidates.length, 1);
assert.equal(rec.missedCandidates[0].id, '101:2');
assert.equal(rec.missedCandidates[0].explainedBy, 'skipped');
assert.equal(rec.missedCandidates[0].explainReason, 'symbol on skip list');
assert.equal(rec.unmatchedRealTrades.length, 1);
assert.equal(rec.mismatchDetail[0].signal_id, '101:1');

const empty = reconcileSignalCopierDay({ date: '2026-10-30', trades: [], signals, events: [] });
assert.equal(empty.decisionMatchRate, null);
assert.match(empty.note, /3 of his signal/);
assert.equal(empty.missedCandidates[0].explainReason, 'no decision logged for this signal (bot not running?)');

console.log('signalCopierRecon: all passed');
