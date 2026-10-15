// node js/cogLineRead.test.mjs: zig-zag behaviour and the live read on synthetic data
import assert from 'node:assert/strict';
import { zigzag, thetaBase, cogLineRead } from './cogLineRead.js';
let fails = 0; const ok = (n, f) => { try { f(); console.log('ok  ', n); } catch (e) { fails++; console.log('FAIL', n, '-', e.message); } };
// synthetic: 40 days of 15-minute bars, a slow wave so 4 h changes have a stable RMS
const T0 = 1_790_000_000 - (1_790_000_000 % 900), N = 40 * 96, times = Array.from({ length: N }, (_, i) => T0 + i * 900);
const wave = (amp, period, phase = 0) => times.map((_, i) => amp * Math.sin((2 * Math.PI * (i - phase)) / period));
ok('thetaBase is NaN for the first days and positive afterwards', () => { const b = thetaBase(wave(5, 96 * 3), times); assert.ok(Number.isNaN(b[10])); assert.ok(b[N - 1] > 0); });
ok('zigzag flips on a retrace of theta and never earlier than it can know', () => {
  const x = [0, 1, 2, 3, 4, 3, 2, 1, 2, 3, 4, 5, 6], base = x.map(() => 1), z = zigzag(x, base, 1.5);
  assert.deepEqual(z.events.map(e => e.dir), [1, -1, 1]); z.events.forEach(e => assert.ok(e.confirm > e.extreme));
  assert.ok(Number.isNaN(z.state[0])); assert.equal(z.state.at(-1), 1);
});
ok('zigzag skips NaN bars and never flips on a gap', () => { const x = [0, 2, 4, NaN, NaN, 4.2, 6], z = zigzag(x, x.map(() => 1), 1.5); assert.equal(z.events.length, 1); assert.equal(z.events[0].dir, 1); });
const hist = { constants: { corr1h: 0.176, betaPctPerBp: 0.041, r2: 0.031 }, days: [{ c: 0.12, b: 0.04 }] };
const mkLine = bp => ({ t0: T0, step: 900, bp, asOf: 'x' });
ok('read: both trends established, agreement reported, last hour attribution computed', () => {
  const lineBp = wave(6, 96 * 2.5).map(v => v + 70), nq = times.map((t, i) => ({ time: t, close: 20000 * Math.exp(0.0004 * wave(6, 96 * 2.5)[i]) }));
  const r = cogLineRead({ line: mkLine(lineBp), nq, history: hist, now: times.at(-1) + 900 });
  assert.ok(r.ok, r.reason); assert.equal(r.agree, r.line.state === r.nasdaq.state); assert.ok(r.lastHour && Number.isFinite(r.lastHour.impliedPct)); assert.ok(r.lines.length >= 3);
});
ok('read: opposite series disagree', () => {
  const lineBp = wave(6, 96 * 2.5).map(v => v + 70), nq = times.map((t, i) => ({ time: t, close: 20000 * Math.exp(-0.0004 * wave(6, 96 * 2.5)[i]) }));
  const r = cogLineRead({ line: mkLine(lineBp), nq, history: hist, now: times.at(-1) + 900 }); assert.ok(r.ok, r.reason); assert.equal(r.agree, false);
});
ok('read: too little history says so instead of guessing', () => {
  const r = cogLineRead({ line: { t0: T0, step: 900, bp: [70, 71, 72, 73], asOf: 'x' }, nq: [0, 1, 2, 3].map(i => ({ time: T0 + i * 900, close: 20000 + i })), history: hist, now: T0 + 4000 });
  assert.equal(r.ok, false); assert.ok(/history|data/.test(r.reason));
});
ok('read: a line that stopped updating is flagged stale', () => {
  const lineBp = wave(6, 96 * 2.5).map(v => v + 70), nq = times.map((t, i) => ({ time: t, close: 20000 * Math.exp(0.0004 * wave(6, 96 * 2.5)[i]) }));
  const r = cogLineRead({ line: mkLine(lineBp), nq, history: hist, now: times.at(-1) + 900 + 5 * 86400 }); assert.ok(r.ok); assert.equal(r.stale, true);
});
console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
