import assert from 'node:assert/strict';
import { buildPlan, scorePlan } from './hedgingPlan.js';
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

const lines = { oh: { p50: 0.5, p75: 1.0, p90: 1.5 }, ol: { p50: 0.5, p75: 1.0, p90: 1.5 } };
const bar = (lmin, o, h, l, c) => ({ lmin, o, h, l, c });

t('speeds -> follow: stop orders at p75, stop at p50, target p90; push note', () => {
  const p = buildPlan({ state: 'speeds', flowUp1pct: 100, flowDown1pct: -250, switchPoint: 104 }, lines, 100);
  assert.equal(p.mode, 'follow');
  const b = p.orders.find(o => o.side === 'buy');
  assert.equal(b.type, 'stop'); assert.ok(Math.abs(b.entry - 101) < 1e-9 && Math.abs(b.stop - 100.5) < 1e-9 && Math.abs(b.target - 101.5) < 1e-9);
  assert.ok(p.notes.some(x => /sell stop/.test(x)));
  assert.ok(!p.notes.some(x => /switch point/.test(x)));               // 104 is outside the p75 lines
});

t('calms -> fade: limit orders at p75, stop p90, target p50; switch-point warning when inside', () => {
  const p = buildPlan({ state: 'calms', switchPoint: 99.5 }, lines, 100);
  const s = p.orders.find(o => o.side === 'sell');
  assert.equal(p.mode, 'fade'); assert.equal(s.type, 'limit');
  assert.ok(Math.abs(s.stop - 101.5) < 1e-9 && Math.abs(s.target - 100.5) < 1e-9);
  assert.ok(p.notes.some(x => /switch point/.test(x)));
});

t('scoring: follow buy hits target = +1R less cost; same-minute stop+target = stop', () => {
  const p = buildPlan({ state: 'speeds' }, lines, 100);
  const win = scorePlan(p, [bar(0, 100, 100.2, 99.9, 100), bar(600, 100.6, 101.05, 100.6, 101), bar(601, 101, 101.6, 100.9, 101.5)]);
  assert.equal(win.triggered, true); assert.equal(win.how, 'target'); assert.ok(win.R > 0.97 && win.R < 1);
  const both = scorePlan(p, [bar(600, 100.6, 101.6, 100.4, 101)]);
  assert.equal(both.how, 'stop'); assert.ok(both.R < -1);
});

t('scoring: touch before 08:00 = no trade; no touch = no trade; fade sell stopped at p90', () => {
  const p = buildPlan({ state: 'calms' }, lines, 100);
  assert.equal(scorePlan(p, [bar(300, 100, 101.2, 100, 101)]).triggered, false);
  assert.equal(scorePlan(p, [bar(600, 100, 100.3, 99.8, 100)]).reason, 'no p75 touch');
  const r = scorePlan(p, [bar(600, 100.8, 101.1, 100.8, 101), bar(601, 101, 101.6, 101, 101.5)]);
  assert.equal(r.side, 'sell'); assert.equal(r.how, 'stop'); assert.ok(r.R < -1 && r.R > -1.03);   // -1 R and 0.02 R of cost on a half-point stop
});

t('bad input -> null', () => { assert.equal(buildPlan(null, lines, 100), null); assert.equal(buildPlan({ state: 'calms' }, {}, 100), null); });


// ── export block (pine/OI Bot Trades.pine format) ──
const { buildHedgePlanText, orderStates } = await import('./hedgingPlanExport.js');
t('export: OI Bot Trades block format, one block per market, 10+ tokens per zone line', () => {
  const plan = buildPlan({ state: 'speeds', switchPoint: 100.2 }, lines, 100);
  const txt = buildHedgePlanText({ markets: [{ pair: 'NAS100_USD', open: 100, plan }, { pair: 'XAU_USD', plan: null, error: 'no daily lines' }] }, {}, { generated: Date.parse('2026-10-19T13:40:00Z') });
  const rows = txt.split('\n');
  assert.match(rows[0], /^──── HEDGE PLAN/); assert.match(rows[1], /^Generated: 2026-10-19 13:40 UTC/);
  assert.ok(rows.includes('NQ') && rows.includes('GOLD'));
  const z = rows.filter(r => r.startsWith('TZ '));
  assert.equal(z.length, 2);
  for (const r of z) { const p = r.split(' '); assert.ok(p.length >= 10); assert.ok(Number.isFinite(+p[4]) && Number.isFinite(+p[5])); assert.equal(p[7], '-'); assert.equal(p[8], 'armed'); }
  assert.match(txt, /switch 100\.20 inside the lines/);
});
t('export: live states (armed / open / done / primed)', () => {
  const plan = buildPlan({ state: 'speeds' }, lines, 100);
  assert.deepEqual(orderStates(plan, [bar(300, 100, 101.2, 100, 101)], 400), { up: 'primed', down: 'primed' });
  assert.deepEqual(orderStates(plan, [bar(600, 100.9, 101.05, 100.9, 101)], 610), { up: 'open', down: 'done' });
  assert.deepEqual(orderStates(plan, [bar(600, 100.9, 101.05, 100.9, 101), bar(601, 101, 101.6, 101, 101.5)], 700), { up: 'done', down: 'done' });
  assert.deepEqual(orderStates(plan, [bar(600, 100, 100.2, 99.9, 100)], 610), { up: 'armed', down: 'armed' });
});
console.log(`hedgingPlan + export: ${n} tests passed`);
