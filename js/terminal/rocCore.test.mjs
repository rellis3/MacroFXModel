// js/terminal/rocCore.test.mjs: the rate-of-change maths behind the Momentum board (js/terminal/rocCore.js), the definitions of forge/ROC_STALL_50D_PREREG.md.
// node --test js/terminal/rocCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { rocArray, walk, runs, read, rankAll, caption, nth, fmtChange, evidenceFor, EVIDENCE_IDS, RELATED_IDS, MIN_HIST, N_LOOK } from './rocCore.js';
import { DESK_EVIDENCE } from '../deskEvidence.js';

const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const dates = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2015, 0, 1) + i * 86400000).toISOString().slice(0, 10));
/** a noisy random walk (1% daily), then `moves` appended as exact log changes */
function series(seed, n, tail = []) {
  const r = rng(seed), g = () => { let u = 0; while (!u) u = r(); let v = 0; while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  let p = 100; const v = [];
  for (let i = 0; i < n; i++) { p *= Math.exp(0.01 * g()); v.push(p); }
  for (const m of tail) { p *= Math.exp(m); v.push(p); }
  return v;
}

test('rocArray: a log change in percent for prices, a plain difference for rates, NaN where it cannot be formed', () => {
  const r = rocArray([100, 110, 121], 1, 'ratio'); assert.ok(Number.isNaN(r[0])); assert.ok(Math.abs(r[1] - 100 * Math.log(1.1)) < 1e-9); assert.ok(Math.abs(r[2] - 100 * Math.log(1.1)) < 1e-9);
  assert.deepEqual(rocArray([4.0, 4.5, 4.25], 1, 'rate').slice(1), [0.5, -0.25]);
  assert.ok(Number.isNaN(rocArray([100, null, 120], 1)[1]) && Number.isNaN(rocArray([100, null, 120], 1)[2]));
});

test('formatting: ordinals and signed changes', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 99].map(p => nth(p / 100)), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '99th']);
  assert.equal(fmtChange(12.34, 'ratio'), '+12%'); assert.equal(fmtChange(-3.21, 'ratio'), '−3.2%'); assert.match(fmtChange(0.25, 'rate', 'pp'), /^\+0\.25 pp$/); assert.equal(fmtChange(NaN, 'ratio'), 'n/a');
});

test('a TOP stall is flagged: a strong run in the top fifth of its history, then 50 sessions of nothing', () => {
  const run = Array.from({ length: 50 }, () => 0.0075), flat = Array.from({ length: 50 }, (_, i) => (i % 2 ? 0.0004 : -0.0004));
  const v = series(7, MIN_HIST + 300, [...run, ...flat]), d = dates(v.length);
  const atEndOfRun = read(d, v, 'ratio', v.length - 51), now = read(d, v, 'ratio');
  assert.ok(atEndOfRun.pct50 >= 0.95, `the run is extreme at its own end: ${atEndOfRun.pct50}`);
  assert.equal(now.stall, 'top'); assert.ok(now.priorPct >= 0.8 && now.flat === true);
  assert.match(caption({ def: { label: 'Test series' }, ...now }), /a strong run that has stalled/);
});

test('a BOTTOM stall is the mirror: a hard fall, then nothing', () => {
  const fall = Array.from({ length: 50 }, () => -0.0075), flat = Array.from({ length: 50 }, (_, i) => (i % 2 ? 0.0004 : -0.0004));
  const v = series(11, MIN_HIST + 300, [...fall, ...flat]), d = dates(v.length), now = read(d, v, 'ratio');
  assert.equal(now.stall, 'bottom'); assert.match(caption({ def: { label: 'X' }, ...now }), /a fall that has stopped/);
});

test('no stall on a market that is still running, and none on ordinary noise', () => {
  const v = series(3, MIN_HIST + 400, Array.from({ length: 100 }, () => 0.0075)), d = dates(v.length);
  assert.equal(read(d, v, 'ratio').stall, null, 'still running: ROC_50 is not about zero');
  const w = walk(series(5, MIN_HIST + 1500), 'ratio'), frac = w.top.filter(Boolean).length / w.n;
  assert.ok(frac < 0.06, `a stall is rare on a random walk (${(frac * 100).toFixed(1)}% of sessions)`);
});

test('acceleration: a sharp deceleration puts ROC_50 change in its bottom tenth', () => {
  const up = Array.from({ length: 60 }, () => 0.006), down = Array.from({ length: 20 }, () => -0.012);
  const v = series(13, MIN_HIST + 300, [...up, ...down]), d = dates(v.length), now = read(d, v, 'ratio');
  assert.equal(now.accDown, true); assert.ok(now.pacc <= 0.10); assert.match(caption({ def: { label: 'X' }, ...now }), /decelerating/);
});

test('AS-OF SAFE: a reading at session i is identical with or without the later data (no lookahead)', () => {
  const v = series(21, MIN_HIST + 400, Array.from({ length: 60 }, () => 0.005)), d = dates(v.length);
  for (const i of [MIN_HIST + 120, MIN_HIST + 300, v.length - 40]) {
    const full = read(d, v, 'ratio', i), cut = read(d.slice(0, i + 1), v.slice(0, i + 1), 'ratio');
    for (const k of ['roc20', 'roc50', 'roc100', 'pct50', 'priorPct', 'accel', 'pacc', 'sd50', 'stall', 'accDown', 'accUp']) assert.equal(full[k], cut[k], `${k} at ${i}`);
  }
});

test('a short record is ranked as short, not guessed', () => {
  const v = series(2, 300), d = dates(v.length), r = read(d, v, 'ratio');
  assert.equal(r.short, true); assert.equal(r.pct50, null); assert.match(caption({ def: { label: 'Short one' }, ...r }), /too short to rank/);
  assert.equal(read(dates(30), series(2, 30), 'ratio'), null, 'under 50 closes there is no 50-session move at all');
});

test('runs(): consecutive true flags become [from, to] pairs', () => {
  assert.deepEqual(runs([false, true, true, false, true]), [[1, 2], [4, 4]]); assert.deepEqual(runs([false, false]), []);
});

test('rankAll: builds the lists from a bundle, skips missing series, and an as-of date reads only the past', () => {
  const run = Array.from({ length: 50 }, () => 0.0075), flat = Array.from({ length: 50 }, (_, i) => (i % 2 ? 0.0004 : -0.0004));
  const a = series(7, MIN_HIST + 300, [...run, ...flat]), n = a.length, b = series(9, n), d = dates(n);
  const bundle = { dates: d, series: { aaa: a, bbb: b } };
  const defs = [{ key: 'aaa', label: 'A', group: 'index', kind: 'ratio' }, { key: 'bbb', label: 'B', group: 'index', kind: 'ratio' }, { key: 'zzz', label: 'Z', group: 'index', kind: 'ratio' }];
  const rk = rankAll(bundle, defs);
  assert.equal(rk.rows.length, 2); assert.equal(rk.refDate, d[n - 1]); assert.deepEqual(rk.stalledLeaders.map(r => r.def.key), ['aaa']);
  const past = rankAll(bundle, defs, d[n - 120]); assert.equal(past.refDate, d[n - 120]); assert.equal(past.stalledLeaders.length, 0, 'before the run, nothing had stalled');
});

test('evidence: the six banked ids resolve from the Evidence Book, with a verdict word each, and the related tests exist', () => {
  const ev = evidenceFor(DESK_EVIDENCE); assert.equal(ev.length, EVIDENCE_IDS.length, 'every roc-stall-50d id is banked');
  for (const e of ev) assert.ok(['validated', 'null', 'underpowered', 'context'].includes(e.verdict), e.id);
  assert.equal(evidenceFor(DESK_EVIDENCE, RELATED_IDS).length, RELATED_IDS.length, 'the nearby tests exist');
  assert.deepEqual(evidenceFor([], EVIDENCE_IDS), [], 'an empty book gives nothing, not an error');
  assert.equal(N_LOOK, 50);
});
