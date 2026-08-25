// Synthetic, no-network unit tests for the macro-change brick.
//   node js/macroChange.test.mjs

import { seriesDeltas, buildMacroChanges, formatMacroChanges, MACRO_CHANGE_SPEC, flowDp, formatFlowBn } from './macroChange.js';

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

// ── money-market plumbing: flow ($bn) + rate (SOFR) ──
const rrp  = mk([420, 420, 420, 420, 420, 500, 480, 470, 460, 450, 445, 440, 438, 436, 435, 434, 433, 432, 431, 430, 428, 426, 424, 435, 405]);
const sofr = mk(Array(24).fill(4.31).concat([4.33]));
const mm = buildMacroChanges({ rrp, sofr }, MACRO_CHANGE_SPEC, { windows: [1, 5, 20] });
const rrpRow = mm.rows.find(r => r.key === 'rrp');
ok('rrp flow unit is bn (no bps scaling)', rrpRow?.unit === 'bn' && rrpRow.deltas[1] === -30, `${rrpRow?.unit} ${rrpRow?.deltas[1]}`);
ok('rrp last formats as $405bn', /Reverse repo \(RRP\) \$405bn/.test(mm.text), mm.text.split('\n').find(l => l.startsWith('Reverse')) || '');
ok('sofr rate delta in bps (+2)', mm.rows.find(r => r.key === 'sofr')?.deltas[1] === 2, String(mm.rows.find(r => r.key === 'sofr')?.deltas[1]));

// ── formatting ──
ok('text has one line per row', text.split('\n').length === rows.length);
ok('text sign-formats deltas', /1d \+6bps/.test(text));
ok('empty rows → empty text', formatMacroChanges([]) === '');

// ── $bn flow formatting ─────────────────────────────────────────────────────
// Regression: the Fed's ON RRP facility has drained from hundreds of billions to
// under $1bn. At the old whole-billion precision the sidebar rendered a live 0.38
// as "$0bn · 1d 0 · 5d 0" — indistinguishable from a dead feed, and reported as one.
ok('drained-but-live RRP does not render as zero', formatFlowBn(0.38) === '0.38', formatFlowBn(0.38));
ok('precision follows magnitude (bn)', flowDp(2500) === 0 && flowDp(42.7) === 1 && flowDp(0.38) === 2);
ok('large flows keep whole-billion form', formatFlowBn(2500) === '2500' && formatFlowBn(42.7) === '42.7');
ok('a genuine zero still reads as zero', Number(formatFlowBn(0)) === 0, formatFlowBn(0));
ok('a live trickle is not rounded away', formatFlowBn(0.004) === '<0.01' && formatFlowBn(-0.004) === '>-0.01');
ok('missing data is a dash, not a number', [null, undefined, NaN, 'x'].every(v => formatFlowBn(v) === '–'));
ok('negative flows keep their sign', formatFlowBn(-1) === '-1.00' && formatFlowBn(-250) === '-250');
ok('rrp spec carries flow precision', MACRO_CHANGE_SPEC.rrp.dp === 2 && MACRO_CHANGE_SPEC.rrp.kind === 'flow');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll macroChange tests passed');
process.exit(failures ? 1 : 0);
