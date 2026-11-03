// Tests for js/deskScore.js on synthetic bars only (no market data).   node js/deskScore.test.mjs
import assert from 'node:assert/strict';
import { londonMs, windowFor, eligible, unitOf, scoreCard, scoreDay, shufflePlacebo, blockBootstrap, record, rng, cardDir } from './deskScore.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

t('London wall clock in GMT and BST', () => {
  assert.equal(new Date(londonMs('2026-11-04', 8)).toISOString(), '2026-11-04T08:00:00.000Z');   // GMT
  assert.equal(new Date(londonMs('2026-07-01', 8)).toISOString(), '2026-07-01T07:00:00.000Z');   // BST
  assert.equal(new Date(windowFor('2026-07-01').exitMs).toISOString(), '2026-07-01T20:00:00.000Z');
});

const run = (over = {}) => ({ date: '2026-11-04', mode: 'full', finishedAt: '2026-11-04T07:05:00Z', head: { ok: true, book: { instruments: {} } }, ...over });
t('eligible only when written before 08:00 London on its own date, full mode, with a book', () => {
  assert.equal(eligible(run()).ok, true);
  assert.match(eligible(run({ finishedAt: '2026-11-04T13:08:00Z' })).why, /after 08:00/);
  assert.match(eligible(run({ mode: 'quick' })).why, /full/);
  assert.match(eligible(run({ head: { ok: false } })).why, /Head/);
  assert.match(eligible(run({ finishedAt: '2026-11-03T22:00:00Z' })).why, /before its own/);
});

const L = { open: 100, up: { p50: 101 }, down: { p50: 99 } };
// one bar a minute from 08:00 to 20:59 London on 2026-11-04 (GMT), a straight line from `a` to `b`, with wicks `w`
const path = (a, b, { w = 0, from = 8, to = 21 } = {}) => { const s = londonMs('2026-11-04', from) / 1000, m = (to - from) * 60; return Array.from({ length: m }, (_, i) => { const p = a + (b - a) * i / (m - 1); return { time: s + i * 60, open: p, high: p + w, low: p - w, close: p }; }); };

t('unit is the mean p50 distance; a card with no levels or no direction is handled', () => {
  assert.equal(unitOf(L), 1);
  assert.equal(unitOf({ open: 100, up: { p50: 102 }, down: { p50: 99 } }), 1.5);
  assert.equal(unitOf(null), null);
  assert.equal(scoreCard({ rating: 'FLAT', levels: L }, path(100, 101), windowFor('2026-11-04')), null);
  assert.equal(scoreCard({ rating: 'LONG' }, path(100, 101), windowFor('2026-11-04')).missing, 'no forecast levels');
  assert.equal(cardDir('STRONG_SHORT'), -1); assert.equal(cardDir('REVIEW'), 0);
});

t('card score: direction x move / u, clipped at 3; race on entry +/- u', () => {
  const w = windowFor('2026-11-04');
  const up = scoreCard({ rating: 'LONG', size: 1, levels: L }, path(100, 101.5), w);
  assert.equal(up.R, 1.5); assert.equal(up.race, 1);
  assert.equal(scoreCard({ rating: 'SHORT', size: 1, levels: L }, path(100, 101.5), w).R, -1.5);
  assert.equal(scoreCard({ rating: 'SHORT', size: 1, levels: L }, path(100, 101.5), w).race, -1);
  assert.equal(scoreCard({ rating: 'LONG', levels: L }, path(100, 110), w).R, 3, 'clipped');
  assert.equal(scoreCard({ rating: 'LONG', levels: L }, path(100, 100.5), w).race, 0, 'neither line touched');
});

t('A1 windows: no bar 08:00-09:00 or 16:00-21:00 is missing; an early close (grains) still scores', () => {
  const w = windowFor('2026-11-04');
  assert.match(scoreCard({ rating: 'LONG', levels: L }, path(100, 101, { from: 10 }), w).missing, /08:00 and 09:00/);
  assert.match(scoreCard({ rating: 'LONG', levels: L }, path(100, 101, { to: 15 }), w).missing, /16:00 and 21:00/);
  assert.equal(scoreCard({ rating: 'LONG', levels: L }, path(100, 101, { to: 19.5 }), w).R, 1);
  assert.match(scoreCard({ rating: 'LONG', levels: L }, [], w).missing, /no M1/);
});

const book = { EURUSD: { rating: 'LONG', size: 1, levels: L }, GOLD: { rating: 'SHORT', size: 0.5, levels: L, }, NQ: { rating: 'STRONG_SHORT', size: 1, levels: L }, UK100: { rating: 'FLAT', size: 0, levels: L }, BTCUSD: { rating: 'SHORT', size: 0, levels: L }, CORN: { rating: 'LONG', size: 1, levels: L } };
const bars = { EURUSD: path(100, 101), GOLD: path(100, 101), NQ: path(100, 99), UK100: path(100, 100), BTCUSD: path(100, 102), CORN: path(100, 101, { from: 11 }) };

t('a day: size-weighted S over sized live cards, vetoed cards out of S but in the unweighted score, missing counted', () => {
  const d = scoreDay(run({ head: { ok: true, book: { instruments: book } } }), bars, { B: 200 });
  assert.equal(d.eligible, true); assert.equal(d.live, 5); assert.equal(d.scored, 4);
  assert.deepEqual(d.missing, [{ inst: 'CORN', why: 'no bar between 08:00 and 09:00 London' }]);
  assert.equal(d.S, +((1 * 1 + 0.5 * -1 + 1 * 1) / 2.5).toFixed(4));     // EURUSD +1, GOLD -1 (x0.5), NQ +1
  assert.equal(d.unweighted, +((1 - 1 + 1 - 2) / 4).toFixed(4));          // BTC (size 0) counts here
  assert.equal(d.strong.n, 1); assert.equal(d.strong.mean, 1);
  assert.ok(d.placebo && Number.isFinite(d.placebo.p95));
  assert.equal(d.cards.UK100, undefined, 'flat cards are not scored');
});

t('the placebo keeps the counts and sizes, so a book that is all one sign has a zero-spread placebo', () => {
  const one = [{ dir: 1, R: 1, size: 1 }, { dir: 1, R: -0.5, size: 1 }];
  const p = shufflePlacebo(one, { B: 50 });
  assert.ok(p.every(x => Math.abs(x - 0.25) < 1e-9));
  const mixed = shufflePlacebo([{ dir: 1, R: 1, size: 1 }, { dir: -1, R: 1, size: 1 }, { dir: 1, R: -1, size: 1 }], { B: 400 });
  assert.ok(Math.abs(mixed.reduce((s, x) => s + x, 0) / mixed.length) < 0.25, 'centred near zero');
});

t('the control is scored unweighted on the same bars', () => {
  const r = run({ head: { ok: true, book: { instruments: book } }, control: { ok: true, book: { instruments: { EURUSD: { rating: 'SHORT', levels: L }, NQ: { rating: 'SHORT', levels: L } } } } });
  const d = scoreDay(r, bars, { B: 50 });
  assert.deepEqual(d.control, { n: 2, unweighted: 0 });
});

t('seeded: the same seed gives the same shuffles and intervals', () => {
  const a = rng(7), b = rng(7); assert.equal(a(), b());
  const v = Array.from({ length: 40 }, (_, i) => Math.sin(i));
  assert.deepEqual(blockBootstrap(v, undefined, { B: 300 }), blockBootstrap(v, undefined, { B: 300 }));
});

t('record: interim numbers over eligible days only, halves, paired controls, race share', () => {
  const day = (date, S, extra = {}) => ({ date, eligible: true, S, unweighted: S, drift: 0, strong: { mean: S }, plain: { mean: 0 }, race: { resolved: 2, leanFirst: 1 }, placebo: { mean: 0, sd: 0.3 }, control: { unweighted: 0 }, ...extra });
  const days = [day('2026-11-04', 0.2), day('2026-11-05', -0.1), day('2026-11-06', 0.3), day('2026-11-09', 0.0), { date: '2026-11-10', eligible: false, S: 5 }];
  const rec = record(days, { B: 200 });
  assert.equal(rec.eligibleDays, 4); assert.equal(rec.allDays, 5);
  assert.equal(rec.S.mean, 0.1); assert.equal(rec.S.firstHalf, 0.05); assert.equal(rec.S.secondHalf, 0.15);
  assert.equal(rec.vsControl.mean, 0.1); assert.equal(rec.race.leanFirstShare, 0.5);
  assert.match(rec.label, /interim, not judged/);
});

console.log(`deskScore: ${n} tests passed`);
