// Tests for js/tradeWatch.js.   node js/tradeWatch.test.mjs
import assert from 'node:assert/strict';
import { cardPlan, watchPlan, check, message } from './tradeWatch.js';

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

console.log(`tradeWatch: ${n} tests passed`);
