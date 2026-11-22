// node js/terminal/cycleHoloCore.test.mjs: the WORLD CYCLE hologram's pure core (phases, the shared month axis, plane scaling and caps, halos, label placement, the spoken line).
import assert from 'node:assert/strict';
import { phaseOf, addMonths, monthLabel, lagMonths, fitHalf, toPlane, buildCycle, reerByArea, haloRadius, pointAt, monthsInPhase, phaseGroups, phaseMoves, placeLabels, cycleScript, cycleFigure, AREAS } from './cycleHoloCore.js';
import { cliBoard } from '../globalBoards.js';

let n = 0; const t = (name, f) => { f(); n++; };

t('phaseOf matches globalBoards.cliBoard (flat 3-month change = not rising)', () => {
  assert.equal(phaseOf(100.5, 0.2), 'expansion'); assert.equal(phaseOf(100, 0), 'slowdown'); assert.equal(phaseOf(99.2, 0.1), 'recovery'); assert.equal(phaseOf(99.2, 0), 'contraction');
  assert.equal(phaseOf(NaN, 1), null); assert.equal(phaseOf(100, undefined), null);
  // parity with the board that serves the route
  const s = v => v.map((value, i) => ({ period: addMonths('2024-10', i), value }));
  const byArea = { USA: s([99, 99.5, 100, 100.4, 100.6]), JPN: s([101, 100.8, 100.5, 100.2, 100.1]), BRA: s([98, 98.4, 98.7, 99, 99.3]), CHE: s([99.9, 99.6, 99.4, 99.2, 99.1]) };
  const b = cliBoard(byArea);
  for (const r of b.rows) assert.equal(phaseOf(r.cli, r.chg3m), r.phase, r.area);
  const M = buildCycle(b, null, Date.parse('2025-04-15'));
  for (const r of b.rows) { const e = M.econ.find(x => x.area === r.area); assert.equal(pointAt(e, M.months.length - 1).phase, r.phase); }
});

t('month helpers', () => {
  assert.equal(addMonths('2026-01', -1), '2025-12'); assert.equal(addMonths('2025-11', 3), '2026-02'); assert.equal(addMonths('bad', 1), null);
  assert.equal(monthLabel('2026-09'), 'Sep 2026'); assert.equal(monthLabel('2026-09', { short: true }), 'Sep 26'); assert.equal(monthLabel('2026-09', { long: true }), 'September 2026'); assert.equal(monthLabel(null), 'n/a');
  assert.equal(lagMonths('2026-09', Date.parse('2026-11-20')), 2); assert.equal(lagMonths('2027-01', Date.parse('2026-11-20')), 0);
});

t('plane scale: 97th percentile with room, floored; outliers clamp and are flagged', () => {
  assert.equal(fitHalf([]), 0.5); assert.equal(fitHalf([0.1, -0.2], { floor: 0.25 }), 0.25);
  const h = fitHalf([...Array(99).fill(1), 8]); assert.ok(h >= 1.15 && h < 2, `half ${h}`);
  const sc = { x: 2, z: 1 }; assert.deepEqual(toPlane(101, -0.5, sc), { u: 0.5, v: -0.5, capped: false });
  const c = toPlane(95, 3, sc); assert.equal(c.u, -1); assert.equal(c.v, 1); assert.equal(c.capped, true);
  assert.equal(toPlane(null, 1, sc), null);
});

const spark = (base, k = 0) => Array.from({ length: 24 }, (_, i) => +(base + Math.sin(i * 0.3 + k)).toFixed(2));
const CLI = { ok: true, asOf: '2026-09', label: 'x', rows: [
  { area: 'USA', name: 'United States', period: '2026-09', spark: spark(100, 0) },
  { area: 'CHN', name: 'China', period: '2026-08', spark: spark(100, 2) },
  { area: 'DEU', name: 'Germany', period: '2026-09', spark: spark(99.5, 4) },
  { area: 'XXX', name: 'Nowhere', period: '2026-09', spark: [100, 101] },                          // too short: dropped
  { area: 'BAD', name: 'Bad', period: 'Sept', spark: spark(100) },                                 // bad period: dropped
] };

t('buildCycle: shared month axis, 21 trail points from 24 readings, lagging economy aligned', () => {
  const M = buildCycle(CLI, null, Date.parse('2026-11-20'));
  assert.equal(M.ok, true); assert.equal(M.asOf, '2026-09'); assert.equal(M.lag, 2); assert.equal(M.econ.length, 3);
  assert.equal(M.months.at(-1), '2026-09'); assert.equal(M.months[0], addMonths('2026-08', -20));
  const us = M.econ.find(e => e.area === 'USA'), cn = M.econ.find(e => e.area === 'CHN');
  assert.equal(us.pts.filter(Boolean).length, 21); assert.equal(cn.pts.filter(Boolean).length, 21);
  assert.equal(us.last, M.months.length - 1); assert.equal(cn.last, M.months.length - 2);
  assert.equal(us.code, 'US'); assert.equal(us.region, 'americas'); assert.equal(cn.region, 'asia');
  const p = us.pts.at(-1), sp = CLI.rows[0].spark; assert.ok(Math.abs(p.chg3 - (sp[23] - sp[20])) < 1e-9); assert.ok(Math.abs(p.chg1 - (sp[23] - sp[22])) < 1e-9);
  assert.ok(Math.abs(p.u) <= 1 && Math.abs(p.v) <= 1);
  // China at the latest month is shown from its August point with a one-month lag
  const q = pointAt(cn, M.months.length - 1); assert.equal(q.lag, 1); assert.equal(q.period, '2026-08');
});

t('buildCycle fails soft', () => {
  assert.equal(buildCycle(null).ok, false); assert.equal(buildCycle({ ok: false, error: 'HTTP 500' }).why.includes('HTTP 500'), true);
  assert.equal(buildCycle({ rows: [{ area: 'USA', period: '2026-09', spark: [null, 'x', NaN, null, null] }] }).ok, false);
  const M = buildCycle({ rows: [{ area: 'USA', period: '2026-09', spark: [100, 100.2, null, 100.5, 100.6, 100.4, 100.1] }] }, { rows: 'nope' });
  assert.equal(M.ok, true); assert.equal(M.econ[0].reer, null);
  assert.ok(M.econ[0].pts.filter(Boolean).length >= 2);                                             // the gap only drops the points whose 3-month change needs it
});

t('REER halos: joined by BIS code, area-proportional, capped and flagged', () => {
  const fair = { rows: [{ area: 'US', devPct: 12, period: '2026-09' }, { area: 'CN', devPct: -40 }, { area: 'XM', devPct: null }] };
  assert.deepEqual(Object.keys(reerByArea(fair)), ['US', 'CN']);
  const M = buildCycle(CLI, fair, Date.parse('2026-11-20'));
  assert.equal(M.econ.find(e => e.area === 'USA').reer.devPct, 12); assert.equal(M.econ.find(e => e.area === 'DEU').reer, null);     // Germany has no BIS series of its own
  const a = haloRadius(7.5, 1, 30), b = haloRadius(30, 1, 30); assert.ok(Math.abs((a.r / b.r) ** 2 - 0.25) < 1e-9);               // area, not radius
  assert.equal(haloRadius(-45, 1, 30).capped, true); assert.equal(haloRadius(-45, 1, 30).r, 1); assert.equal(haloRadius(-5).dearer, false); assert.equal(haloRadius(NaN), null);
  assert.equal(AREAS.EA20.bis, 'XM');
});

t('months in phase, phase groups and recent moves', () => {
  const mk = phases => ({ area: 'USA', pts: phases.map((ph, i) => (ph ? { phase: ph, period: addMonths('2026-01', i) } : null)) });
  const e = mk(['recovery', 'recovery', 'expansion', 'expansion', 'expansion']);
  assert.deepEqual(monthsInPhase(e, 4), { months: 3, atLeast: false }); assert.deepEqual(monthsInPhase(e, 1), { months: 2, atLeast: true });
  assert.equal(monthsInPhase({ pts: [null, null] }, 1), null);
  const f = { area: 'JPN', pts: [{ phase: 'expansion', period: '2026-01' }, { phase: 'expansion', period: '2026-02' }, { phase: 'expansion', period: '2026-03' }, { phase: 'expansion', period: '2026-04' }, { phase: 'slowdown', period: '2026-05' }] };
  const M = { econ: [e, f], months: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'] };
  const g = phaseGroups(M, 4); assert.equal(g.expansion.length, 1); assert.equal(g.slowdown.length, 1);
  const mv = phaseMoves(M, 4, 3); assert.equal(mv.length, 2); assert.equal(mv[0].econ.area, 'JPN'); assert.equal(mv[0].to, 'slowdown'); assert.equal(mv[0].monthsAgo, 0); assert.equal(mv[1].monthsAgo, 2);
  assert.equal(phaseMoves(M, 4, 1).length, 1);
});

t('label placement never overlaps and respects reserved boxes and the screen', () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ x: 300 + (i % 3) * 4, y: 300 + (i % 2) * 3, w: 30, h: 14, pri: i }));
  const res = placeLabels(items, { W: 800, top: 100, bottom: 600, reserved: [{ x: 0, y: 0, w: 800, h: 120 }] });
  const boxes = res.map((r, i) => (r ? { x: r.x, y: r.y, w: items[i].w, h: items[i].h } : null)).filter(Boolean);
  assert.ok(boxes.length >= 4 && boxes.length < 30);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j]; assert.ok(!(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y), 'overlap'); }
  for (const b of boxes) assert.ok(b.y >= 120 && b.x >= 4 && b.x + b.w <= 796 && b.y + b.h <= 600);
  assert.ok(res[29] !== null);                                                                        // the top priority always gets a spot
  assert.deepEqual(placeLabels([{ x: NaN, y: 1, w: 1, h: 1 }], { W: 100, bottom: 100 }), [null]);
});

t('spoken line and lower-third figure', () => {
  const M = buildCycle(CLI, null, Date.parse('2026-11-20')), s = cycleScript(M);
  assert.ok(s.startsWith('The world cycle, from the OECD\'s leading indicators up to September 2026.'));
  assert.ok(/Of three economies/.test(s)); assert.ok(s.endsWith('These phases are definitions, not a forecast.'));
  assert.ok(!/\b(will|expect|target)\b/i.test(s));
  const f = cycleFigure(M); assert.ok(/^\d of 3$/.test(f.value)); assert.equal(f.label, 'in expansion');
  assert.equal(cycleScript({ ok: false }), null); assert.equal(cycleFigure(null), null);
});

console.log(`cycleHoloCore: ${n} tests passed`);
