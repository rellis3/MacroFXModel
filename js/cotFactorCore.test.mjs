// Tests for js/cotFactorCore.js — the publication-lag rule (the lookahead trap),
// OI-normalisation, the flip convention, and the history guard.
// Run: node js/cotFactorCore.test.mjs
import assert from 'node:assert/strict';
import {
  tradableFrom, cotFactorSeries, qualifies,
  COT_WINDOW_WEEKS, MIN_WEEKS_QUALIFY, FLIP_SYMS,
} from './cotFactorCore.js';

const dow = d => new Date(`${d}T00:00:00Z`).getUTCDay();

// ── publication lag: the whole point of this brick ───────────────────────────
// A Tuesday report is released Friday 15:30 ET; first tradable open is the
// FOLLOWING Monday = report + 6 days.
assert.equal(tradableFrom('2026-08-18'), '2026-08-24', 'Tue → following Mon');
assert.equal(dow('2026-08-18'), 2, 'fixture really is a Tuesday');
assert.equal(dow('2026-08-24'), 1, 'result really is a Monday');

// every Tuesday in a sample year maps to +6 and lands on a Monday
for (const d of ['2026-01-06', '2026-03-31', '2026-06-30', '2026-12-29']) {
  assert.equal(dow(d), 2, `${d} is a Tuesday`);
  const t = tradableFrom(d);
  assert.equal(dow(t), 1, `${d} → Monday`);
  const gap = (Date.parse(t) - Date.parse(d)) / 86400000;
  assert.equal(gap, 6, `${d} → +6 days`);
}

// year/month boundaries (UTC arithmetic, no local-timezone drift)
assert.equal(tradableFrom('2026-12-29'), '2027-01-04', 'crosses the year end');

// NEVER earlier than the release, for ANY report weekday (off-cycle safety)
for (let i = 0; i < 14; i++) {
  const d = new Date(Date.UTC(2026, 5, 1) + i * 86400000).toISOString().slice(0, 10);
  const t = tradableFrom(d);
  const lag = (Date.parse(t) - Date.parse(d)) / 86400000;
  assert.ok(lag >= 4, `${d}: tradable must be after the +3d release (got +${lag})`);
  assert.equal(dow(t), 1, `${d}: always lands on a Monday`);
}

assert.equal(tradableFrom('not-a-date'), null);
assert.equal(tradableFrom(null), null);

// ── OI normalisation: the share, not the raw count, is what gets ranked ──────
// Two weeks with the SAME raw net but very different open interest must produce
// very different shares — this is the defect the whole exercise started from.
const mk = (date, long, short, oi) => ({ date, specLong: long, specShort: short, openInterest: oi });
const two = cotFactorSeries([mk('2026-01-06', 60000, 10000, 100000),
                             mk('2026-01-13', 60000, 10000, 500000)], { window: 2 });
assert.equal(two[0].specNet, 50000);
assert.equal(two[1].specNet, 50000, 'same raw net');
assert.ok(Math.abs(two[0].share - 0.5) < 1e-12, 'share = net/OI');
assert.ok(Math.abs(two[1].share - 0.1) < 1e-12, 'same net, 5x OI → 1/5 the share');

// ── flip convention: net AND its derived stats flip together ────────────────
const rows = Array.from({ length: 5 }, (_, i) =>
  mk(`2026-0${i + 1}-06`, 60000 + i * 1000, 10000, 100000));
const plain = cotFactorSeries(rows, { window: 3 });
const flipped = cotFactorSeries(rows, { flip: true, window: 3 });
assert.equal(flipped[0].specNet, -plain[0].specNet, 'net flips');
assert.ok(Math.abs(flipped[4].share + plain[4].share) < 1e-12, 'share flips');
assert.ok(Math.abs(flipped[4].z + plain[4].z) < 1e-9, 'z flips with it, not against');
assert.ok(FLIP_SYMS.has('JPY') && FLIP_SYMS.has('CAD') && FLIP_SYMS.has('CHF'));
assert.ok(!FLIP_SYMS.has('EUR'), 'EUR must not flip');

// ── windowing: no score before the window is full ───────────────────────────
const many = Array.from({ length: 10 }, (_, i) =>
  mk(new Date(Date.UTC(2026, 0, 6) + i * 7 * 86400000).toISOString().slice(0, 10),
     50000 + i * 900, 10000, 100000 + i * 300));
const s5 = cotFactorSeries(many, { window: 5 });
assert.equal(s5[3].z, null, 'no z before the window fills');
assert.ok(s5[4].z != null, 'z appears once the window is full');
assert.ok(s5.every(r => r.tradableFrom && r.date < r.tradableFrom), 'lag applied to every row');

// rising share against its own history ranks high; falling ranks low
const rising = cotFactorSeries(many, { window: 5 });
assert.ok(rising.at(-1).pct >= 80, `rising share ranks high (got ${rising.at(-1).pct})`);
assert.ok(rising.at(-1).z > 0, 'and z is positive');

// ── bad data degrades to null, never to a fabricated number ─────────────────
const bad = cotFactorSeries([mk('2026-01-06', 5, 1, 0), mk('2026-01-13', 5, 1, null)], { window: 1 });
assert.equal(bad[0].share, null, 'zero OI → null, not Infinity');
assert.equal(bad[1].share, null, 'missing OI → null');

// ── input hygiene ───────────────────────────────────────────────────────────
assert.deepEqual(cotFactorSeries(null), []);
assert.deepEqual(cotFactorSeries([{ nope: 1 }]), []);
const unsorted = cotFactorSeries([mk('2026-02-03', 5, 1, 10), mk('2026-01-06', 5, 1, 10)], { window: 1 });
assert.equal(unsorted[0].date, '2026-01-06', 'sorts ascending regardless of input order');

// ── history guard counts SCORED weeks (renames truncate silently) ────────────
assert.equal(qualifies(s5, 3), true);
assert.equal(qualifies(s5, 500), false);
assert.equal(COT_WINDOW_WEEKS, 156);
assert.equal(MIN_WEEKS_QUALIFY, 260);

console.log('cotFactorCore.test.mjs: all assertions passed');
