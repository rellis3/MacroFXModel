// Tests for js/tradeWatch.js.   node js/tradeWatch.test.mjs
import assert from 'node:assert/strict';
import { cardPlan, watchPlan, check, message, priceNums, invalidAtIssue, markInvalidAtIssue } from './tradeWatch.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const L = { open: 157.92, up: { p50: 158.25, p75: 158.55 }, down: { p50: 157.57, p75: 157.27 } };
const short = { rating: 'SHORT', conviction: 'high', size: 1.02, levels: L, plan: { zone: 'Sell rallies into 158.27-158.55', invalidation: 'Close back above 158.45-158.92', timing: 'Tokyo/London overlap' } };

t('plan from the card: zone, invalidation against the card, first target', () => {
  const p = cardPlan(short);
  assert.deepEqual(p.zone, [158.27, 158.55]); assert.equal(p.invalid, 158.45); assert.equal(p.target, 157.57); assert.equal(p.dir, -1);
  assert.equal(cardPlan({ ...short, rating: 'FLAT' }), null); assert.equal(cardPlan({ ...short, size: 0 }), null);
  // numbers far from the open (times, percentages) are dropped
  assert.deepEqual(cardPlan({ ...short, plan: { zone: 'after 15:00, 50% of size, into 158.30' } }).zone, [158.3, 158.3]);
});

t('events fire once, on a crossing, and nothing after invalidation', () => {
  const plan = watchPlan({ USDJPY: short }), st = {};
  assert.deepEqual(check(plan, { USDJPY: 158.0 }, st), []);
  const e1 = check(plan, { USDJPY: 158.6 }, st);   // jumped through the zone between checks
  assert.deepEqual(e1.map(e => e.kind), ['invalid']);   // 158.6 is beyond the invalidation 158.45: invalid wins
  assert.deepEqual(check(plan, { USDJPY: 157.5 }, st), []);   // nothing after invalidation
});

t('zone then target on a short', () => {
  const plan = watchPlan({ USDJPY: short }), st = {};
  check(plan, { USDJPY: 158.1 }, st);
  assert.deepEqual(check(plan, { USDJPY: 158.3 }, st).map(e => e.kind), ['zone']);
  assert.deepEqual(check(plan, { USDJPY: 158.35 }, st), []);   // still in the zone: not again
  assert.deepEqual(check(plan, { USDJPY: 157.5 }, st).map(e => e.kind), ['target']);
});

t('message names the level and says it is not an order', () => {
  const m = message({ inst: 'USDJPY', kind: 'zone', price: 158.31, level: [158.27, 158.55], dir: -1 }, short, { date: '2026-11-03' });
  assert.match(m, /entry zone/); assert.match(m, /158\.27–158\.55/); assert.match(m, /not an order/);
});

t('fix 2: no "first target" before the zone is reached, and none when the zone sits past the target', () => {
  const plan = watchPlan({ USDJPY: short }), st = {};
  check(plan, { USDJPY: 158.1 }, st);
  assert.deepEqual(check(plan, { USDJPY: 157.5 }, st), [], 'target reached without ever entering the zone: no alert');
  // a zone that reaches the target: zone alert carries the warning, and no target alert follows
  // short, down p50 157.57; the zone 157.50-158.40 reaches it; price trades in at 157.55, already past the target
  const far = { ...short, plan: { ...short.plan, zone: 'sell 157.50-158.40' } }, p2 = watchPlan({ USDJPY: far }), s2 = {};
  check(p2, { USDJPY: 157.4 }, s2);
  const z = check(p2, { USDJPY: 157.55 }, s2);
  assert.equal(z[0].kind, 'zone'); assert.equal(z[0].targetBehind, 157.57); assert.match(message(z[0], far, {}), /already at or behind/);
  assert.deepEqual(check(p2, { USDJPY: 157.0 }, s2), [], 'no target alert follows');
});

t('numbers written with thousands separators stay whole (gold, indices, Bitcoin; the live NQ plan of 2026-11-08)', () => {
  assert.deepEqual(priceNums('26,850-27,010'), [26850, 27010]);
  assert.deepEqual(priceNums('the 4,066-4,070 gamma-flip cluster'), [4066, 4070]);
  assert.deepEqual(priceNums('above 101,250.5'), [101250.5]);
  assert.deepEqual(priceNums('1.1118-1.1128, below open 1.11407'), [1.1118, 1.1128, 1.11407]);
  assert.deepEqual(priceNums('15:00, 2, 3 and 4'), [15, 0, 2, 3, 4], 'a comma between small numbers is a list, not a separator');
  const nq = { rating: 'SHORT', size: 0.7, levels: { open: 26990, up: { p50: 27250 }, down: { p50: 26700 } }, plan: { zone: '26,850-27,010', invalidation: 'close above 27,327' } };
  const p = cardPlan(nq);
  assert.deepEqual(p.zone, [26850, 27010]); assert.equal(p.invalid, 27327); assert.equal(p.target, 26700);
});

// review 2026-11-27, the live GOLD card: short, zone 3594.87-3613.20, invalidation 3613.2; gold traded 3650 at 06:45, book out at 06:53
const gold = { rating: 'SHORT', size: 0.3, levels: { open: 3567.9, up: { p50: 3613.2 }, down: { p50: 3525.4 } }, plan: { zone: '3594.87-3613.20', invalidation: '3613.2' },
  planCheck: { ok: false, issues: ['the invalidation (3613.2) sits inside or beyond the entry zone'] } };
const issueMs = Date.parse('2026-11-27T06:53:44Z'), bar = (iso, close) => ({ time: Date.parse(iso) / 1000, close });

t('a plan already through its invalidation at publication is "invalid at issue", and the watcher never fires "invalidated" later', () => {
  const plan = watchPlan({ GOLD: gold, USDJPY: short });
  const at = invalidAtIssue(plan, { GOLD: [bar('2026-11-27T02:15:00Z', 3617), bar('2026-11-27T06:45:00Z', 3650), bar('2026-11-27T07:10:00Z', 3500)], USDJPY: [bar('2026-11-27T06:50:00Z', 158.0)] }, issueMs);
  assert.deepEqual(Object.keys(at), ['GOLD'], 'USDJPY sat inside its plan at issue');
  assert.equal(at.GOLD.price, 3650, 'the last price at or before issue, not a later one');
  const st = {}, evs = markInvalidAtIssue(plan, at, st);
  assert.deepEqual(evs.map(e => e.kind), ['invalid-at-issue']);
  assert.match(message(evs[0], gold, {}), /already invalid when the book was published/);
  assert.deepEqual(check(plan, { GOLD: 3660 }, st).filter(e => e.inst === 'GOLD'), [], 'no "invalidated" after it');
  assert.deepEqual(markInvalidAtIssue(plan, at, st), [], 'once');
  // back inside by issue time: not invalid at issue (the Head wrote the plan after the earlier spike)
  assert.deepEqual(invalidAtIssue(plan, { GOLD: [bar('2026-11-27T02:15:00Z', 3617), bar('2026-11-27T06:50:00Z', 3600)] }, issueMs), {});
});

t('a broken plan is watched but every event and message says its levels do not fit together', () => {
  const plan = watchPlan({ GOLD: gold });
  assert.deepEqual(plan.GOLD.issues, gold.planCheck.issues);
  const st = {}; check(plan, { GOLD: 3580 }, st);
  const e = check(plan, { GOLD: 3600 }, st);
  assert.equal(e[0].kind, 'zone'); assert.deepEqual(e[0].planIssues, gold.planCheck.issues);
  assert.match(message(e[0], gold, {}), /plan levels do not fit together/);
  assert.equal(watchPlan({ USDJPY: short }).USDJPY.issues, undefined, 'a clean plan carries none');
});

t('an event on the first price the watcher has (day start, or after a restart) is flagged firstSeen; a crossing seen later is not', () => {
  const plan = watchPlan({ USDJPY: short }), st = {};
  const e = check(plan, { USDJPY: 158.3 }, st);   // already in the zone at the first look
  assert.equal(e[0].kind, 'zone'); assert.equal(e[0].firstSeen, true);
  const e2 = check(plan, { USDJPY: 157.5 }, st);
  assert.equal(e2[0].kind, 'target'); assert.equal(e2[0].firstSeen, undefined);
});

console.log(`tradeWatch: ${n} tests passed`);
