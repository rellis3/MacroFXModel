import assert from 'node:assert/strict';
import { shapeOf, horizonBoard, horizonFindings, bigDay, SHAPES } from './horizons.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

const N = 300;
const dates = Array.from({ length: N }, (_, i) => `d${String(i).padStart(4, '0')}`);
const spec = (key, kind = 'price') => ({ key, label: key.toUpperCase(), group: 'X', kind, what: 'a market' });
/** A series with a controllable last 20 sessions. */
const build = (base, shapeFn) => {
  let v = base; let s = 3;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
  const out = dates.map(() => (v += rnd() * base * 0.004));
  const start = out[N - 21];
  for (let k = 0; k <= 20; k++) out[N - 21 + k] = start * (1 + shapeFn(k) / 100);
  return out;
};

t('every shape has a label and an explanation worth reading', () => {
  for (const [k, v] of Object.entries(SHAPES)) {
    assert.ok(v.label && v.tone, `${k} incomplete`);
    assert.ok(v.means.length > 90, `${k} must explain what the shape tells you`);
    assert.doesNotMatch(v.means, /\b(will|expect|should continue)\b/i, `${k} must not predict`);
  }
});

t('a trend that rolled over reads as REVERSING, not as a monthly gain', () => {
  // up 8% over the first 15 sessions, then down hard for the last 5
  const series = build(100, k => k <= 15 ? k * 0.55 : 8.25 - (k - 15) * 1.5);
  const rows = horizonBoard({ dates, series: { x: series } }, [spec('x')]);
  assert.equal(rows[0].shape, 'reversing');
  assert.ok(rows[0].d20 > 0, 'the month is still positive');
  assert.ok(rows[0].d5 < 0, 'while the week is negative -- which is the whole point');
});

t('a move that stopped reads as STALLING, not as a live trend', () => {
  const series = build(100, k => k <= 14 ? k * 0.6 : 8.4);
  const rows = horizonBoard({ dates, series: { x: series } }, [spec('x')]);
  assert.equal(rows[0].shape, 'stalling');
  assert.ok(Math.abs(rows[0].d20) > Math.abs(rows[0].d5) * 4, 'a real month, a flat week');
});

t('a move getting faster reads as ACCELERATING', () => {
  // The bar is demanding on purpose: today must run 40% above the 5-day pace AND the
  // 5-day above the 20-day. A smoothly curving trend clears the second easily and the
  // first barely (pow5 gives 2.86 against a 2.89 bar), so only a real step up counts
  // -- which is what "accelerating" should mean if the flag is to be worth anything.
  const series = build(100, k => Math.pow(k / 20, 8) * 18);
  const rows = horizonBoard({ dates, series: { x: series } }, [spec('x')]);
  assert.equal(rows[0].shape, 'accelerating');
  const [p1, p5, p20] = rows[0].pace;
  assert.ok(p1 > p5 && p5 > p20, 'per-day pace must rise across the windows');
});

t('a steady trend is called boring, because it usually is', () => {
  const rows = horizonBoard({ dates, series: { x: build(100, k => k * 0.4) } }, [spec('x')]);
  assert.equal(rows[0].shape, 'steady');
});

t('"meaningful" is measured against THIS market, not a fixed number', () => {
  // The SAME +0.7% over twenty sessions: a real move for a market that barely twitches,
  // and nothing at all for one that swings that much before lunch. Both are prices, so
  // the only thing separating them is how much each one usually moves.
  const mk = (jitter) => {
    let v = 100, s2 = 9;
    const rnd = () => { s2 = (s2 * 1103515245 + 12345) % 2147483648; return s2 / 2147483648 - 0.5; };
    const out = dates.map(() => (v += rnd() * jitter));
    const st = out[N - 21];
    for (let k = 0; k <= 20; k++) out[N - 21 + k] = st * (1 + (k * 0.035) / 100);
    return out;
  };
  const calm = horizonBoard({ dates, series: { a: mk(0.05) } }, [spec('a')])[0];
  const wild = horizonBoard({ dates, series: { b: mk(9.0) } }, [spec('b')])[0];
  assert.ok(Math.abs(calm.d20 - wild.d20) < 0.01, 'the two moves are identical by construction');
  assert.ok(wild.noise > calm.noise * 10, `a jumpier series must carry a bigger floor: ${calm.noise} vs ${wild.noise}`);
  assert.equal(calm.shape, 'steady', 'a real move for the calm market');
  assert.equal(wild.shape, 'quiet', 'and the very same move is nothing for the jumpy one');
});

t('findings scale honestly: a handful is weather, a quarter of the board is a turn', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ shape: i < 6 ? 'reversing' : 'steady', label: `M${i}`, d20: -i }));
  const f = horizonFindings(rows);
  const rev = f.find(x => x.shape === 'reversing');
  assert.equal(rev.n, 6); assert.equal(rev.weight, 'broad');
  const few = horizonFindings(Array.from({ length: 20 }, (_, i) => ({ shape: i < 2 ? 'reversing' : 'steady', label: `M${i}`, d20: -i })));
  assert.equal(few.find(x => x.shape === 'reversing').weight, 'isolated');
});

t('a big day is measured in that market\'s own ordinary days', () => {
  const rows = [{ label: 'A', dayInNoise: 3.4 }, { label: 'B', dayInNoise: 1.1 }, { label: 'C', dayInNoise: 2.2 }];
  const big = bigDay(rows, 2);
  assert.deepEqual(big.map(r => r.label), ['A', 'C'], 'sorted, and B excluded');
});

t('a thin or gappy series is skipped rather than guessed at', () => {
  assert.deepEqual(horizonBoard({ dates: ['a', 'b'], series: { x: [1, 2] } }, [spec('x')]), []);
  assert.deepEqual(horizonBoard(null, [spec('x')]), []);
  assert.deepEqual(horizonBoard({ dates, series: {} }, [spec('x')]), []);
  assert.equal(shapeOf({ d1: null, d5: 1, d20: 2 }, 1), null);
  assert.equal(shapeOf({ d1: 1, d5: 1, d20: 2 }, 0), null, 'no noise floor means no verdict');
});

console.log(`horizons: ${n} groups, all passed`);
