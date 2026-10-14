// node js/cogLine.test.mjs: slicing, units, export round-trip for js/cogLine.js
import assert from 'node:assert/strict';
import { sliceDays, toBars, toUnits, exportText, parseExport, legsAt } from './cogLine.js';
let fails = 0; const ok = (n, f) => { try { f(); console.log('ok  ', n); } catch (e) { fails++; console.log('FAIL', n, '-', e.message); } };
const mk = () => { const bp = []; for (let i = 0; i < 96 * 6; i++) bp.push(i % 50 === 7 ? null : 60 + (i % 40) / 10); bp.push(null, null); return { t0: 1_790_000_000, step: 900, bp, legs: [{ label: 'SOFR Sep26 minus Euribor Mar27' }], asOf: 'x' }; };
ok('units: bp*0.1 + 1.445', () => { assert.ok(Math.abs(toUnits(70) - 8.445) < 1e-9); assert.equal(toUnits(null), null); });
ok('sliceDays ends at the last valid bar, not the trailing nulls', () => { const s = mk(), sl = sliceDays(s, 2); assert.equal(sl.to, s.t0 + (96 * 6 - 1) * 900); });
ok('sliceDays: 2 days is at most 192 bars', () => { const n = sliceDays(mk(), 2).bp.length; assert.ok(n >= 188 && n <= 192, String(n)); });
ok('toBars skips empties and times line up', () => { const sl = sliceDays(mk(), 1), b = toBars(sl); assert.ok(b.length <= sl.bp.length && b.every(r => Number.isFinite(r.units))); assert.equal(b[0].t % 900, sl.t0 % 900); });
ok('export round-trips exactly', () => { const s = mk(), p = parseExport(exportText(s, 3)), sl = sliceDays(s, 3); assert.equal(p.t0, sl.t0); assert.equal(p.step, 900); assert.equal(p.bp.length, sl.bp.length); sl.bp.forEach((v, i) => assert.equal(p.bp[i], v == null ? null : Math.round(v * 10) / 10)); });
ok('export is compact (10 days under 4.5 KB)', () => assert.ok(exportText({ ...mk(), bp: Array.from({ length: 96 * 12 }, () => 71.3) }, 10).length < 4500));
ok('legs label is the pair in force at the end of the window, not a future roll', () => { const s = { legs: [{ frm: '2026-09-15', label: 'A' }, { frm: '2099-01-01', label: 'B' }] }; assert.equal(legsAt(s, 1_790_000_000), 'A'); assert.equal(legsAt(s, 4_200_000_000), 'B'); assert.ok(exportText({ ...mk(), legs: s.legs }, 1).includes('legs=A')); });
console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
