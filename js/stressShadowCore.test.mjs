import assert from 'node:assert/strict';
import { RULE, inputsAsOf, conditions, isMonthEnd, factorFor, shadowLadder, scoreRow, scorecard, improvementCI } from './stressShadowCore.js';

// inputs use only what closed before the session
const spx = Array.from({ length: 70 }, (_, i) => ({ t: 1000 + i * 86400, c: 100 * Math.exp(-0.001 * i) }));
const vix = Array.from({ length: 10 }, (_, i) => ({ date: `2026-10-${String(10 + i).padStart(2, '0')}`, value: 15 + i }));
const vix3m = vix.map(x => ({ date: x.date, value: 20 }));
const inp = inputsAsOf({ spx, vix, vix3m }, '2026-10-19', 1000 + 65 * 86400);    // spx 0..65, vix up to 10-18 (value 23)
assert.equal(+inp.spx5.toFixed(6), -0.5); assert.equal(+inp.spx60.toFixed(6), -6);
assert.equal(inp.vix, 23); assert.equal(inp.vixChg5, 5); assert.equal(inp.vixTerm, 23 / 20);
const c = conditions(inp);
assert.equal(c.fxCount, 5); assert.equal(c.idxCount, 2); assert.deepEqual(c.missing, []);
const calm = conditions({ spx5: 1, spx60: 5, vix: 13, vixChg5: -1, vixTerm: 0.85 });
assert.equal(calm.fxCount, 0); assert.equal(calm.idxCount, 0);
const gap = conditions({ spx5: null, spx60: 5, vix: 13, vixChg5: -1, vixTerm: null });
assert.deepEqual(gap.missing, ['spx5Fall', 'vixInverted']); assert.equal(gap.fxCount, 0);
// mismatched VIX3M date -> no term ratio
assert.equal(inputsAsOf({ spx, vix, vix3m: vix3m.slice(0, 5) }, '2026-10-19', 1000 + 65 * 86400).vixTerm, null);

// month-end: first 2 / last 2 weekdays (Oct 2026: Thu 1, Fri 2 ... Thu 29, Fri 30)
assert.ok(isMonthEnd('2026-10-01') && isMonthEnd('2026-10-02') && isMonthEnd('2026-10-29') && isMonthEnd('2026-10-30'));
assert.ok(!isMonthEnd('2026-10-05') && !isMonthEnd('2026-10-28'));

// factors follow A1
assert.equal(factorFor('fx', calm, false), 0.95); assert.equal(factorFor('fx', c, false), 1.15);
assert.equal(factorFor('fx', calm, true), +(0.95 * 1.067).toFixed(4));
assert.equal(factorFor('idx', calm, true), 0.96); assert.equal(factorFor('idx', c, false), 1.06);
assert.equal(factorFor('gold', c, false), null);

// shadow never mutates live; gold not covered
const live = { hl_p50: 0.5, hl_p75: 0.7, hl_p90: 0.9 }; const frozen = JSON.stringify(live);
assert.equal(shadowLadder('EURUSD', live, c, false).flat.hl_p75, +(0.7 * 1.15).toPrecision(8));
assert.equal(shadowLadder('GOLD', live, c, false), null);
assert.equal(JSON.stringify(live), frozen);

// a calm day: realised HL 0.68 sits between shadow p75 (0.665) and live p75 (0.70) -> live holds, shadow passed
const row = scoreRow('EURUSD', live, { hl: 0.68, oh: 0.3, ol: 0.3, oc: 0.1 }, calm, false);
assert.equal(row.live.hl_p75, 0); assert.equal(row.shadow.hl_p75, 1); assert.equal(row.factor, 0.95);
assert.equal(scoreRow('EURUSD', live, { error: 'x' }, calm, false), null);

const sc = scorecard([{ date: '2026-10-28', rows: [row] }]);
assert.equal(sc.sessions, 1); assert.equal(sc.byClass.fx.hl_p75.live, 0); assert.equal(sc.byClass.fx.hl_p75.shadow, 1);
assert.equal(sc.ready, false); assert.equal(sc.byClass.fx.p75ImprovementCI, null);   // too few sessions for a CI

// CI is reproducible and signs right when the shadow is always nearer 25%
const days = Array.from({ length: 30 }, () => ({ n: 4, live: 2, shadow: 1 }));   // live 50%, shadow 25%
const ci = improvementCI(days); assert.deepEqual(ci, improvementCI(days)); assert.ok(ci[0] > 0);
assert.equal(RULE.judgeAt, 120);
console.log('stressShadowCore: all passed');
