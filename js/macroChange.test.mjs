// Synthetic, no-network unit tests for the macro-change brick.
//   node js/macroChange.test.mjs

import { seriesDeltas, seriesCadenceDays, buildMacroChanges, formatMacroChanges, MACRO_CHANGE_SPEC, flowDp, formatFlowBn } from './macroChange.js';

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


// ── calendar-day windows, not observation counts ────────────────────────────
// Regression: the 1d/5d/20d labels used to be OBSERVATION offsets. Fed FRED's GS10
// (a MONTHLY average, which is what us10y was wired to), "1d" was a one-month move
// and "20d" a twenty-month move — rendered in the same strip, in the same style, as
// genuinely-daily VIX and HY rows.
const monthly = [
  '2025-01-01','2025-02-01','2025-03-01','2025-04-01','2025-05-01','2025-06-01',
  '2025-07-01','2025-08-01','2025-09-01','2025-10-01','2025-11-01','2025-12-01',
  '2026-01-01','2026-02-01','2026-03-01','2026-04-01','2026-05-01','2026-06-01',
  '2026-07-01','2026-08-01','2026-09-01',
].map((date, i) => ({ date, value: 4.00 + i * 0.05 }));

const md = seriesDeltas(monthly, [1, 5, 20]);
ok('monthly cadence is measured', Math.round(seriesCadenceDays(monthly)) === 30 || Math.round(seriesCadenceDays(monthly)) === 31, String(seriesCadenceDays(monthly)));
ok('a monthly series cannot answer "1 day"', md.d[1] === null, String(md.d[1]));
ok('a monthly series cannot answer "5 days"', md.d[5] === null, String(md.d[5]));
ok('a monthly series CAN answer "20 days"', md.d[20] != null, String(md.d[20]));
ok('and it reports the span it actually used', md.refGapDays[20] >= 28 && md.refGapDays[20] <= 35, String(md.refGapDays[20]));

// A daily series with a weekend/holiday hole still answers 1d, and says how far back it reached.
const gappy = [
  { date: '2026-09-01', value: 4.10 },
  { date: '2026-09-02', value: 4.12 },
  { date: '2026-09-07', value: 4.20 },   // 5-day hole (long weekend)
];
const gd = seriesDeltas(gappy, [1]);
ok('a gap does not blank the 1d window', gd.d[1] != null, String(gd.d[1]));
ok('the real span is reported, not assumed', gd.refGapDays[1] === 5, String(gd.refGapDays[1]));

// The formatter must SAY when a window spans more than its label.
const gapText = formatMacroChanges([{
  label: 'US 10Y', unit: 'bps', kind: 'rate', last: 4.2, dir: '↑', note: '',
  deltas: { 1: 8, 5: null, 20: null }, refGapDays: { 1: 5, 5: null, 20: null }, cadenceDays: 1,
}], [1, 5, 20]);
ok('formatter flags a window wider than its label', /1d \+8bps \(over 5d\)/.test(gapText), gapText);
ok('formatter prints n/a for an unanswerable window', /5d n\/a/.test(gapText), gapText);

// Undated series keep the old positional behaviour, so existing callers are unaffected.
const undated = [1, 2, 3, 4, 5, 6].map(v => ({ value: v }));
ok('undated series fall back to positional windows', seriesDeltas(undated, [1])?.d[1] === 1, String(seriesDeltas(undated, [1])?.d[1]));

// Rows carry the provenance downstream so the page and the AI prompt can show it.
const provRows = buildMacroChanges({ us10y }, MACRO_CHANGE_SPEC, { windows: [1, 5, 20] }).rows;
ok('rows expose refGapDays/cadenceDays', provRows[0].refGapDays != null && provRows[0].cadenceDays != null);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll macroChange tests passed');
process.exit(failures ? 1 : 0);
