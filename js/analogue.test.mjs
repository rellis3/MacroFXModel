import assert from 'node:assert/strict';
import { analogues, keysFor, ANALOGUE_KEYS } from './analogue.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

const N = 1600;
const dates = Array.from({ length: N }, (_, i) => `d${String(i).padStart(4, '0')}`);
let s = 99; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
const walk = (st, sp) => { let v = st; return dates.map(() => (v += rnd() * sp)); };

/**
 * A bundle with a repeating configuration planted at known indices.
 *
 * Two things this helper got wrong first, both instructive.
 *
 * It multiplied a random walk by a few tenths of a per cent, and the planted signal was
 * swamped — the matcher returned near-misses, which looked like a bug in the matcher and
 * was a bug in the test. The configuration here is unmistakable instead: a and c ramp
 * hard UP into each spot while b ramps hard DOWN, holding after.
 *
 * Then the baseline was uniform jitter, which made the trailing standard deviation
 * almost zero — so in the quiet stretches a microscopic move scored a HUGE z and those
 * days matched a genuinely violent today. That is a real property of standardising
 * against a trailing window, not a test artefact, and it is why the baseline here is a
 * proper random walk: real markets do not sit still enough to produce it, but a test
 * fixture will if you let it.
 */
function planted(spots, { after = 0 } = {}) {
  const a = walk(100, 0.5), b = walk(50, 0.25), c = walk(20, 0.1);
  const spx = walk(4000, 12), vix = walk(16, 0.25);
  const ramp = (arr, p, pct) => {
    const from = arr[Math.max(0, p - 20)];
    for (let k = 0; k <= 20; k++) { const i = p - 20 + k; if (i >= 0) arr[i] = from * (1 + (pct / 100) * k / 20); }
    const held = arr[p], drift = arr[p] / (arr[p + 1] ?? arr[p]);
    for (let i = p + 1; i < arr.length; i++) arr[i] *= drift;   // shift the rest, keep its texture
  };
  for (const p of spots) {
    ramp(a, p, +18); ramp(b, p, -14); ramp(c, p, +22);
    // and a known thing happens over the NEXT 20 sessions
    for (let k = 1; k <= 20; k++) if (p + k < N) spx[p + k] = spx[p] * (1 + (after / 100) * k / 20);
  }
  return { dates, series: { a, b, c, spx, vix } };
}

t('units come from the board, not from guessing at the number', async () => {
  // a gap series crossing zero: -0.02 -> +0.03 is 5bp, not a 250% move
  const { BOARD } = await import('./marketScan.js');
  assert.ok(BOARD.find(b => b.key === 'jgbgap')?.kind === 'gap', 'jgbgap must be carried as a gap');
  assert.ok(BOARD.find(b => b.key === 'gold')?.kind === 'price', 'and gold as a price');
});

t('past days that look like today are found, and reported oldest first', () => {
  const spots = [400, 700, 1000, 1300];
  const b = planted([...spots, N - 1]);
  const r = analogues(b, ['a', 'b', 'c'], { outcomes: ['spx'] });
  assert.ok(r, 'a planted repeat should produce matches');
  assert.ok(r.episodes.length >= 3, `expected several episodes, got ${r.episodes.length}`);
  const found = r.episodes.map(e => +e.date.replace('d', ''));
  // The days just AFTER a spot legitimately look like it -- the ramp is still inside
  // their trailing window -- and de-clustering keeps only the closest of each run. So a
  // spot is "recovered" if some episode lands in its cluster, not on its exact index.
  for (const p of spots) assert.ok(found.some(f => f >= p - 2 && f <= p + 20), `planted spot ${p} missing from ${found}`);
  for (let k = 1; k < r.episodes.length; k++) assert.ok(r.episodes[k - 1].date < r.episodes[k].date, 'chronological');
});

t('episodes are de-clustered, so one event cannot be counted ten times', () => {
  const r = analogues(planted([500, N - 1]), ['a', 'b', 'c'], { outcomes: ['spx'], limit: 8 });
  if (!r) return;                                        // too few distinct episodes is a valid answer
  for (let i = 0; i < r.episodes.length; i++)
    for (let j = i + 1; j < r.episodes.length; j++) {
      const gap = Math.abs(+r.episodes[i].date.replace('d', '') - +r.episodes[j].date.replace('d', ''));
      assert.ok(gap >= 20, `episodes ${r.episodes[i].date} and ${r.episodes[j].date} are ${gap} apart — same event twice`);
    }
});

t('nothing inside the outcome horizon is used, because it has no outcome yet', () => {
  const b = planted([400, 800, 1200, N - 1]);
  const r = analogues(b, ['a', 'b', 'c'], { horizon: 20, outcomes: ['spx'] });
  assert.ok(r);
  const last = N - 1;
  for (const e of r.episodes) {
    const idx = +e.date.replace('d', '');
    assert.ok(idx <= last - 20 - 20, `${e.date} is too close to today to have a complete outcome`);
  }
});

t('what followed is reported as a spread and a count, never as a bare average', () => {
  const b = planted([350, 650, 950, 1250, N - 1], { after: 6 });
  const r = analogues(b, ['a', 'b', 'c'], { outcomes: ['spx'] });
  assert.ok(r?.outcomes?.spx, 'the outcome must come back');
  const o = r.outcomes.spx;
  for (const k of ['n', 'up', 'lo', 'hi', 'median', 'each']) assert.ok(k in o, `missing ${k}`);
  assert.ok(o.lo <= o.median && o.median <= o.hi, 'the spread must bracket its own median');
  assert.equal(o.each.length, o.n, 'every episode is listed, not just the summary');
  assert.ok(o.up <= o.n);
  assert.equal('mean' in o, false, 'a mean of a handful of episodes describes none of them');
});

t('a bundle with no repeat, or too little history, returns null instead of inventing matches', () => {
  assert.equal(analogues({ dates: ['a'], series: {} }, ['a', 'b']), null);
  assert.equal(analogues(planted([N - 1]), ['a'], { outcomes: ['spx'] }), null, 'one dimension is not a configuration');
  assert.equal(analogues(null, ['a', 'b']), null);
  // a series that is entirely flat has no standard deviation to measure against
  const flatB = { dates, series: { a: dates.map(() => 1), b: dates.map(() => 2), spx: walk(4000, 10) } };
  assert.equal(analogues(flatB, ['a', 'b'], { outcomes: ['spx'] }), null);
});

t('only dimensions actually present in the bundle are used', () => {
  const b = planted([400, 800, 1200, N - 1]);
  const r = analogues(b, ['a', 'b', 'nope', 'alsonope'], { outcomes: ['spx'] });
  assert.ok(r, 'two real dimensions is enough');
  assert.deepEqual(r.keys, ['a', 'b'], 'and the missing ones are dropped rather than zero-filled');
});

t('keysFor gives each finding a small, relevant set of dimensions', () => {
  assert.deepEqual(keysFor({ kind: 'ratekind' }), ANALOGUE_KEYS.ratekind);
  assert.deepEqual(keysFor({ kind: 'dislocation', key: 'tips-gold' }), ['tips', 'gold', 'vix']);
  assert.deepEqual(keysFor({ kind: 'extreme', key: 'us2y' }), ['us2y', 'vix', 'spx']);
  assert.equal(keysFor({ kind: 'quiet' }), null);
  assert.equal(keysFor(null), null);
  for (const [k, v] of Object.entries(ANALOGUE_KEYS)) {
    if (!v) continue;
    assert.ok(v.length >= 3 && v.length <= 5, `${k}: a configuration of ${v.length} dimensions is the wrong size`);
  }
});

t('tightness is reported so a page can refuse loose matches', () => {
  const r = analogues(planted([400, 800, 1200, N - 1]), ['a', 'b', 'c'], { outcomes: ['spx'] });
  assert.ok(typeof r.tightness === 'number' && r.tightness >= 0);
  assert.ok(r.episodes.every(e => typeof e.dist === 'number'), 'and per-episode distance too');
});

t('matches bunched into one regime are flagged as one observation, not many', () => {
  // four planted spots inside a narrow slice, capped so only they are picked
  const bunched = analogues(planted([600, 640, 690, 740, N - 1]), ['a', 'b', 'c'], { outcomes: ['spx'], limit: 4 });
  const spread = analogues(planted([300, 700, 1100, 1450, N - 1]), ['a', 'b', 'c'], { outcomes: ['spx'], limit: 4 });
  assert.ok(bunched && spread, 'both fixtures should return matches');
  assert.ok(bunched.span.frac < spread.span.frac,
    `bunched (${bunched.span.frac}) must cover less history than spread (${spread.span.frac})`);
  assert.equal(bunched.oneRegime, true, `span ${bunched.span.frac} should read as a single regime`);
  assert.equal(spread.oneRegime, false, `span ${spread.span.frac} covers most of the history`);
  for (const r of [bunched, spread]) assert.ok(r.span.from <= r.span.to);
});

console.log(`analogue: ${n} groups, all passed`);
