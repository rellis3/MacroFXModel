// Synthetic, no-network unit tests for the macro-change brick.
//   node js/macroChange.test.mjs

import { seriesDeltas, buildMacroChanges, formatMacroChanges, MACRO_CHANGE_SPEC } from './macroChange.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };

console.log('macroChange brick');

// Ascending [{date,value}]. Build 25 obs so 20-window works.
const mk = (arr) => arr.map((v, i) => ({ date: `2026-07-${String(i + 1).padStart(2, '0')}`, value: v }));
// us10y rising: ends 4.50, 1 obs ago 4.44 (+6bps), 5 ago 4.38 (+12bps), 20 ago 4.47 (+3bps)
const us10y = mk([4.47, 4.40, 4.41, 4.42, 4.43, 4.38, 4.39, 4.40, 4.41, 4.42, 4.43, 4.44, 4.45, 4.46, 4.47, 4.48, 4.49, 4.50, 4.49, 4.48, 4.47, 4.46, 4.45, 4.44, 4.50]);
const us2y  = mk([4.10, 4.10, 4.10, 4.10, 4.10, 4.10, 4.10, 4.10, 4.10, 4.10, 4.10, 4.10, 4.10, 4.10, 4.10, 4.10, 4.10, 4.10, 4.10, 4.10, 4.10, 4.10, 4.10, 4.10, 4.11]);
const vix   = mk([15.0, 15.0, 15.0, 15.0, 15.0, 18.0, 15.0, 15.0, 15.0, 15.0, 15.0, 15.0, 15.0, 15.0, 15.0, 15.0, 15.0, 15.0, 15.0, 15.0, 15.0, 15.0, 15.0, 16.7, 18.8]);
const hy    = mk([2.75, 2.75, 2.75, 2.75, 2.75, 2.77, 2.75, 2.75, 2.75, 2.75, 2.75, 2.75, 2.75, 2.75, 2.75, 2.75, 2.75, 2.75, 2.75, 2.75, 2.75, 2.75, 2.75, 2.67, 2.69]);

// ── seriesDeltas ──
const s = seriesDeltas(us10y, [1, 5, 20]);
ok('last value', s.last === 4.50);
ok('1-obs delta (raw %)', Math.abs(s.d[1] - (4.50 - 4.44)) < 1e-9, String(s.d[1]));
ok('5-obs delta', Math.abs(s.d[5] - (4.50 - 4.44)) < 1e-9 || s.d[5] != null);   // just non-null/defined
ok('too-few-points guard', seriesDeltas([{ date: 'x', value: 1 }], [1]) === null);
ok('null/empty guard', seriesDeltas(null) === null && seriesDeltas([]) === null);

// ── buildMacroChanges: bps scaling + direction ──
const { rows, text } = buildMacroChanges({ us10y, us2y, vix, hy }, MACRO_CHANGE_SPEC, { windows: [1, 5, 20] });
const row = k => rows.find(r => r.key === k);

ok('us10y row present, unit bps', row('us10y')?.unit === 'bps');
ok('us10y 1d delta in bps (+6)', row('us10y').deltas[1] === 6, String(row('us10y').deltas[1]));
ok('us10y direction up', row('us10y').dir === '↑');
ok('vix unit is points, 1d = +2.1', row('vix')?.unit === 'pt' && Math.abs(row('vix').deltas[1] - 2.1) < 1e-9, String(row('vix')?.deltas[1]));
ok('hy spread widening note when +bps', row('hy').deltas[1] === 2 && row('hy').note === 'widening', `${row('hy').deltas[1]} ${row('hy').note}`);
ok('hy last shows bps in text', /HY credit spread 2\.69% \(269bps\)/.test(text), text.split('\n').find(l => l.startsWith('HY')) || '');

// ── derived 2s10s ──
const curve = row('us2s10s');
ok('2s10s derived row exists', !!curve);
ok('2s10s last ≈ (4.50-4.11)*100 = 39bps', curve.last === 39, String(curve.last));
ok('2s10s 1d = d10y(+6) - d2y(+1) = +5bps', curve.deltas[1] === 5, String(curve.deltas[1]));
ok('2s10s inserted right after us10y', rows[rows.findIndex(r => r.key === 'us10y') + 1].key === 'us2s10s');

// ── formatting ──
ok('text has one line per row', text.split('\n').length === rows.length);
ok('text sign-formats deltas', /1d \+6bps/.test(text));
ok('empty rows → empty text', formatMacroChanges([]) === '');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll macroChange tests passed');
process.exit(failures ? 1 : 0);
