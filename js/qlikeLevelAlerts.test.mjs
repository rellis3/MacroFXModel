// node --test js/qlikeLevelAlerts.test.mjs: QLIKE level alerts (js/qlikeLevelAlerts.js): level prices, reach detection with the silent
// baseline, once per level per session, quiet hours 22:00-07:00 London, the daily cap, the wording and the bounded state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { QLA_LINES, QLA_DEFAULTS, londonMidnightMs, fmtPrice, levelPrices, checkMarket, hitRate, alertText, gate, emptyGate, rollSession, telegramMessage, appendLog, parseList, QLA_NOTE } from './qlikeLevelAlerts.js';

const Q = { oh_p50: 0.2, oh_p75: 0.4, oh_p90: 0.6, ol_p50: 0.2, ol_p75: 0.4, ol_p90: 0.6, cup_p50: 0.1 };
const P = { lines: { oh: { hits_2020_26: [50.2, 24.8, 10] }, ol: { hits_2020_26: [50.4, 24.9, 9.5] } } };
// 2026-11-30 is a Monday in GMT; 2026-07-01 is in BST
const AT = (date, hh, mm = 0) => londonMidnightMs(date) + (hh * 60 + mm) * 60_000;

test('London midnight handles GMT and BST', () => {
  assert.equal(new Date(londonMidnightMs('2026-11-30')).toISOString(), '2026-11-30T00:00:00.000Z');
  assert.equal(new Date(londonMidnightMs('2026-07-01')).toISOString(), '2026-06-30T23:00:00.000Z');
  assert.equal(londonMidnightMs('nope'), null);
});

test('level prices: off the open, side by line, only the chosen lines', () => {
  const L = levelPrices(Q, 1.1, ['oh_p75', 'ol_p90', 'cup_p50', 'nope']);
  assert.deepEqual(L.map(l => l.line), ['oh_p75', 'ol_p90']);
  assert.ok(Math.abs(L[0].price - 1.1 * 1.004) < 1e-12 && L[0].side === 1 && L[0].tau === 75);
  assert.ok(Math.abs(L[1].price - 1.1 * 0.994) < 1e-12 && L[1].side === -1 && L[1].tau === 90);
  assert.deepEqual(levelPrices(null, 1.1), []);
  assert.deepEqual(levelPrices(Q, NaN), []);
  assert.deepEqual(levelPrices(Q, 0), []);
  assert.equal(Object.keys(QLA_LINES).length, 6);
});

test('reach detection: silent baseline, cross, touch, once only, no mutation', () => {
  const L = levelPrices(Q, 100, ['oh_p75', 'oh_p90', 'ol_p75']);   // 100.4, 100.6, 99.6
  // first sight at 100.5: oh_p75 already beyond -> baseline, silent
  let r = checkMarket(L, null, 100.5);
  assert.deepEqual(r.hits, []); assert.deepEqual(r.baseline, ['oh_p75']); assert.equal(r.st.prev, 100.5);
  // up through 100.6: oh_p90 crossed
  const before = JSON.stringify(r.st);
  r = checkMarket(L, r.st, 100.7);
  assert.equal(JSON.stringify(checkMarket(L, JSON.parse(before), 100.7).st.done), JSON.stringify(r.st.done));
  assert.deepEqual(r.hits.map(h => [h.line, h.kind]), [['oh_p90', 'crossed']]);
  // back down and up again: no repeat
  r = checkMarket(L, r.st, 100.3); r = checkMarket(L, r.st, 100.8);
  assert.deepEqual(r.hits, []);
  // a touch exactly on the lower line counts, and it is 'touched' not crossed
  r = checkMarket(L, r.st, 99.6);
  assert.deepEqual(r.hits.map(h => [h.line, h.kind]), [['ol_p75', 'touched']]);
  // a bad price changes nothing
  const s = r.st; r = checkMarket(L, s, NaN); assert.deepEqual(r.st, s); assert.deepEqual(r.hits, []);
});

test('a gap through two lines in one check reports both', () => {
  const L = levelPrices(Q, 100, ['oh_p75', 'oh_p90']);
  let r = checkMarket(L, null, 100.1); r = checkMarket(L, r.st, 101);
  assert.deepEqual(r.hits.map(h => h.line), ['oh_p75', 'oh_p90']);
});

test('wording: description only, names the side, the percentile, the price and the line\'s own hit rate', () => {
  const t = alertText('EURUSD', { line: 'oh_p75', side: 1, tau: 75, pct: 0.42, level: 1.09123 }, P);
  assert.equal(t, "EURUSD reached its upper QLIKE level (1.09123), the forecast's 75th-percentile range edge (+0.42% from the 00:00 London open); 25% of 2020-26 sessions reached this line");
  const d = alertText('GOLD', { line: 'ol_p90', side: -1, tau: 90, pct: 1.2, level: 3601.25 }, null);
  assert.match(d, /^GOLD reached its lower QLIKE level \(3601\.3\), the forecast's 90th-percentile range edge \(−1\.20%/);
  for (const s of [t, d, QLA_NOTE]) assert.doesNotMatch(s, /\b(buy|sell|fade|short it|go long|entry|stop loss|target)\b/i);
  assert.match(QLA_NOTE, /level-touch/); assert.match(QLA_NOTE, /line-touch-reach/);
  assert.equal(hitRate(P, 'ol_p50'), 50.4); assert.equal(hitRate(P, 'nope'), null); assert.equal(hitRate(null, 'oh_p75'), null);
  assert.equal(fmtPrice(155.1234), '155.123'); assert.equal(fmtPrice(NaN), '–');
});

test('gate: once per key, quiet hours logged not sent, daily cap, new day resets the count', () => {
  const ev = k => ({ key: `2026-11-30|EURUSD|${k}`, text: k });
  // 06:59 London: quiet
  let g = gate(emptyGate('2026-11-30'), [ev('a')], AT('2026-11-30', 6, 59));
  assert.equal(g.events[0].send, false); assert.match(g.events[0].held, /quiet hours/); assert.equal(g.state.sent, 0);
  // the same key later in the day is dropped entirely
  g = gate(g.state, [ev('a'), ev('b')], AT('2026-11-30', 7, 0));
  assert.deepEqual(g.events.map(e => [e.text, e.send]), [['b', true]]); assert.equal(g.state.sent, 1);
  // 22:00 London is quiet again
  assert.equal(gate(g.state, [ev('z')], AT('2026-11-30', 22, 0)).events[0].send, false);
  // the cap
  const cap = { ...QLA_DEFAULTS, dailyCap: 2 };
  g = gate(g.state, [ev('c'), ev('d'), ev('e')], AT('2026-11-30', 9, 0), cap);
  assert.deepEqual(g.events.map(e => e.send), [true, false, false]); assert.match(g.events[2].held, /daily cap/);
  // a new London day starts the count again
  const n = gate(g.state, [ev('f')], AT('2026-12-01', 9, 0), cap);
  assert.equal(n.events[0].send, true); assert.equal(n.state.sent, 1);
  // input never mutated
  const st = emptyGate('x'); gate(st, [ev('q')], AT('2026-11-30', 9, 0)); assert.deepEqual(st.keys, {});
});

test('state stays bounded: a new session drops the old keys; the log is capped', () => {
  const s = { session: '2026-11-30', day: '2026-11-30', sent: 3, keys: { a: 1, b: 2 } };
  assert.equal(rollSession(s, '2026-11-30'), s);
  const r = rollSession(s, '2026-12-01'); assert.deepEqual(r.keys, {}); assert.equal(r.session, '2026-12-01'); assert.equal(r.sent, 3);
  let log = []; for (let i = 0; i < 50; i++) log = appendLog(log, [{ i }, { i: i + 0.5 }], 30);
  assert.equal(log.length, 30); assert.equal(log[0].i, 49.5);
});

test('telegram: only sendable events, HTML escaped, the evidence note, at most 10 bullets', () => {
  assert.equal(telegramMessage([{ send: false, text: 'x' }], '10:00'), null);
  const many = Array.from({ length: 12 }, (_, i) => ({ send: true, text: `M${i} <b>` }));
  const m = telegramMessage(many, '10:42');
  assert.match(m, /^📏 <b>QLIKE levels<\/b> · 10:42 London/); assert.ok(m.includes('M0 &lt;b&gt;')); assert.ok(m.includes('and 2 more')); assert.ok(m.includes('level-touch'));
  assert.equal((m.match(/^• /gm) ?? []).length, 11);
});

test('env lists: unknown names dropped, empty falls back', () => {
  assert.deepEqual(parseList('oh_p75, nope ,ol_p50', Object.keys(QLA_LINES), ['x']), ['oh_p75', 'ol_p50']);
  assert.deepEqual(parseList('', null, ['x']), ['x']);
  assert.deepEqual(parseList('EURUSD,GOLD', null, []), ['EURUSD', 'GOLD']);
});
