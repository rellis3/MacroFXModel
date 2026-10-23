// Tests for js/rangePressure.js.   node js/rangePressure.test.mjs
import { rangePressure, pressureWords } from './rangePressure.js';
import { DESK_EVIDENCE } from './deskEvidence.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

const flat = (n, v) => Array(n).fill(v);
const base = { vix: [17], vix3m: [19], vix9d: [15], spx: [...flat(30, 100)], nq: flat(10, 100), dspx: [...Array.from({ length: 400 }, (_, i) => 100 + (i % 50)), 110] };
const calm = rangePressure(base);
ok('on a calm day none of the five signals is on, and all five are measurable', calm.n === 5 && calm.on === 0 && calm.rows.length === 5);
ok('the ratio 15/17 = 0.88 is on the calm side, which is named', calm.calmFront === true && /None of the 5 validated range signals is on/.test(pressureWords(calm)) && /narrower days/.test(pressureWords(calm)));
const busy = rangePressure({ vix: [24], vix3m: [22], vix9d: [25], spx: [...flat(10, 100), ...Array.from({ length: 21 }, (_, i) => 100 - i * 0.2)], nq: [100, 100, 99, 98.5, 98.2, 97.5], dspx: [...Array.from({ length: 400 }, (_, i) => 100 + (i % 50)), 160] });
ok('an inverted curve, a dear front, an S&P fall over 2%, a Nasdaq down-week and a crowded market are each detected', busy.on === 5 && busy.rows.every(r => r.on === true), JSON.stringify(busy.rows.map(r => [r.key, r.on])));
ok('the count is stated in plain words', /5 of 5 validated range signals are on today/.test(pressureWords(busy)) && /never with a direction/.test(pressureWords(busy)));
ok('thresholds sit exactly where the ledger says: VIX equal to VIX3M is on; ratio 0.9669 is on, 0.9668 is not; S&P exactly -2% is on', rangePressure({ ...base, vix: [20], vix3m: [20] }).rows[0].on === true && rangePressure({ ...base, vix: [100], vix9d: [96.69] }).rows[1].on === true && rangePressure({ ...base, vix: [100], vix9d: [96.68] }).rows[1].on === false && rangePressure({ ...base, spx: [...flat(30, 100), 98] }).rows[2].on === true && rangePressure({ ...base, spx: [...flat(30, 100), 98.1] }).rows[2].on === false);
const missing = rangePressure({ vix: [17], vix3m: [19] });
ok('missing series are reported as not measurable, never as off', missing.n === 1 && missing.rows.filter(r => r.on === null).length === 4 && /None of the 1/.test(pressureWords(missing)));
ok('nothing measurable says so', /Not enough data/.test(pressureWords(rangePressure({}))));
ok('every row cites a ledger entry that exists and is validated', rangePressure(base).rows.every(r => { const e = DESK_EVIDENCE.find(x => x.id === r.evidence); return e && e.verdict === 'validated'; }));
ok('no row or sentence names a direction or a trade', rangePressure(busy).rows.concat([{ effect: pressureWords(busy) }]).every(r => !/\b(buy|sell|bullish|bearish|will rise|will fall)\b/i.test(r.effect)));
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
