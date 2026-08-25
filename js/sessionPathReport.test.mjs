/**
 * Unit tests for js/sessionPathReport.js. Pure/synthetic: no network.
 *   node js/sessionPathReport.test.mjs
 */
import assert from 'node:assert/strict';
import { buildSessionPathBook, extractHeldSessionFindings, matchSessionPath, SESSION_DIMENSIONS } from './sessionPathReport.js';

let passed = 0;
const t = (n, f) => { try { f(); passed++; console.log(`  ✓ ${n}`); }
  catch (e) { console.error(`  ✗ ${n}\n    ${e.message}`); process.exitCode = 1; } };

console.log('sessionPathReport');

// Synthetic rows: 200 days, deterministic. `dow` cycles 1..5; on dow===3 the
// outcome rate is engineered MUCH higher — a real, findable effect — while
// every other dimension is pure noise (uncorrelated with the outcome).
function syntheticRows(n = 400) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const date = `2024-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`;
    const dow = 1 + (i % 5);
    const noiseDim = i % 3 === 0 ? 'a' : i % 3 === 1 ? 'b' : 'c';
    // Base rate ~30%; dow===3 pushes it to ~70% (a real, large, findable effect).
    const p = dow === 3 ? 0.70 : 0.30;
    const reachedLater = (i * 2654435761 % 1000) / 1000 < p;   // deterministic pseudo-random via a fixed hash step
    rows.push({ date, side: 'up', rung: 'p50', checkpointHour: 7, progress: '2·partway', shape: '2·extending',
      dow, gapBucket: 'flat', dayVol: '2·normal', asiaVol: null, londonVol: null, prevCloseLoc: null,
      otherSideProgress: noiseDim, reachedLater });
  }
  return rows;
}

t('buildSessionPathBook returns null on too little data, not a throw', () => {
  assert.equal(buildSessionPathBook([]), null);
  assert.equal(buildSessionPathBook(null), null);
});

t('a cell only appears once it clears the n-floor in BOTH halves', () => {
  const rows = syntheticRows(400);
  const book = buildSessionPathBook(rows);
  assert.ok(book, 'expected a book from 400 synthetic rows');
  const key = 'up|p50|7|2·partway|2·extending';
  assert.ok(book.cells[key], 'expected the single synthetic cell to appear');
  assert.ok(book.cells[key].base.n.is >= 30 && book.cells[key].base.n.oos >= 30);
});

t('the dow=3 effect is found and holds; the noise dimension does not hold', () => {
  const rows = syntheticRows(400);
  const book = buildSessionPathBook(rows);
  const cell = book.cells['up|p50|7|2·partway|2·extending'];
  assert.ok(cell.dims.dow, 'expected a dow dimension table');
  assert.ok(cell.dims.dow['3'], 'expected a bucket for dow=3');
  assert.equal(cell.dims.dow['3'].holds, true, `expected the large, real dow=3 effect to hold — got ${JSON.stringify(cell.dims.dow['3'])}`);
  // Pure noise dimension: real synthetic generator has no dependence on
  // otherSideProgress, so none of its buckets should show a holding effect.
  if (cell.dims.otherSideProgress) {
    for (const [bucket, g] of Object.entries(cell.dims.otherSideProgress)) {
      assert.equal(g.holds, false, `noise dimension otherSideProgress=${bucket} should not hold, got ${JSON.stringify(g)}`);
    }
  }
});

t('extractHeldSessionFindings returns only holding entries, sorted by |deltaIS| descending', () => {
  const rows = syntheticRows(400);
  const book = buildSessionPathBook(rows);
  const held = extractHeldSessionFindings(book);
  assert.ok(held.length > 0, 'expected at least the dow=3 finding to hold');
  for (const f of held) assert.equal(f.holds, true);
  for (let i = 1; i < held.length; i++) assert.ok(Math.abs(held[i - 1].deltaIS) >= Math.abs(held[i].deltaIS), 'not sorted by |deltaIS| descending');
});

t('matchSessionPath only surfaces dimensions the live row actually has a reading for', () => {
  const rows = syntheticRows(400);
  const book = buildSessionPathBook(rows);
  const live = { side: 'up', rung: 'p50', checkpointHour: 7, progress: '2·partway', shape: '2·extending', dow: 3, otherSideProgress: null };
  const m = matchSessionPath(book, live);
  assert.ok(m, 'expected a match for the synthetic cell');
  assert.ok(m.matched.some(x => x.dimKey === 'dow'), 'expected the held dow=3 finding to surface');
  assert.ok(!m.matched.some(x => x.dimKey === 'otherSideProgress'), 'otherSideProgress is null on the live row — must never be surfaced');
});

t('matchSessionPath returns null for a (side,rung,checkpoint,progress,shape) combo the book has no data for', () => {
  const rows = syntheticRows(400);
  const book = buildSessionPathBook(rows);
  const live = { side: 'down', rung: 'p90', checkpointHour: 20, progress: '3·most-of-the-way', shape: '4·deep-reversal', dow: 3 };
  assert.equal(matchSessionPath(book, live), null);
});

t('SESSION_DIMENSIONS entries all have a human label, and matchSessionPath reuses it (no second copy for a UI to drift from)', () => {
  for (const [key, label] of SESSION_DIMENSIONS) { assert.equal(typeof key, 'string'); assert.equal(typeof label, 'string'); assert.ok(label.length > 3); }
  const rows = syntheticRows(400);
  const book = buildSessionPathBook(rows);
  const live = { side: 'up', rung: 'p50', checkpointHour: 7, progress: '2·partway', shape: '2·extending', dow: 3 };
  const m = matchSessionPath(book, live);
  const dowMatch = m.matched.find(x => x.dimKey === 'dow');
  assert.equal(dowMatch.dimLabel, new Map(SESSION_DIMENSIONS).get('dow'));
});

console.log(`\n${passed} passed${process.exitCode ? ' — FAILURES ABOVE' : ''}`);
