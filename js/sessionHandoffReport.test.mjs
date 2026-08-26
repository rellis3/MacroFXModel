/**
 * Unit tests for js/sessionHandoffReport.js. Pure/synthetic: no network.
 *   node js/sessionHandoffReport.test.mjs
 */
import assert from 'node:assert/strict';
import { buildContinuationBook, buildVolClusterBook, extractHeldHandoffFindings, matchContinuation, matchVolCluster } from './sessionHandoffReport.js';

let passed = 0;
const t = (n, f) => { try { f(); passed++; console.log(`  ✓ ${n}`); }
  catch (e) { console.error(`  ✗ ${n}\n    ${e.message}`); process.exitCode = 1; } };

console.log('sessionHandoffReport');

function mkRows(n, fn) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(2020, 0, 1 + Math.floor(i / 3));
    rows.push({ date: d.toISOString().slice(0, 10), transition: ['London→NY', 'NY→Asia', 'Asia→London'][i % 3],
      side: i % 2 === 0 ? 'up' : 'down', giveback: ['1·held', '2·partial-giveback', '3·full-reversal'][i % 3],
      travel: ['1·churned', '2·mixed', '3·driven'][i % 3], vol: ['1·quiet', '2·normal', '3·wild'][i % 3],
      prevVol: ['1·quiet', '2·normal', '3·wild'][(i + 1) % 3],
      dow: i % 7, ...fn(i) });
  }
  return rows;
}

t('buildContinuationBook returns null on too little data, not a throw', () => {
  assert.equal(buildContinuationBook([]), null);
  assert.equal(buildContinuationBook(mkRows(5, () => ({ continued: true }))), null);
});

t('buildContinuationBook computes an honest base rate near the true coin-flip on random-ish data', () => {
  const rows = mkRows(3000, i => ({ continued: (i * 2654435761 % 100) < 50 }));
  const book = buildContinuationBook(rows);
  assert.ok(book);
  const rates = Object.values(book.cells).map(c => c.base.is).filter(x => x != null);
  assert.ok(rates.length > 0);
  for (const r of rates) assert.ok(r > 25 && r < 75, `expected a roughly balanced rate, got ${r}%`);
});

t('buildVolClusterBook finds a dow effect that holds; a noise dimension does not', () => {
  const rows = mkRows(4000, i => ({
    // dow=3 pushes nextVol strongly wild; everything else near a fixed base rate.
    nextVol: (i % 7 === 3) ? (i % 10 < 8 ? '3·wild' : '1·quiet') : (i % 10 < 3 ? '3·wild' : '1·quiet'),
  }));
  const book = buildVolClusterBook(rows);
  assert.ok(book);
  const findings = extractHeldHandoffFindings(book);
  const dowFinding = findings.find(f => f.dimKey === 'dow' && f.bucket === '3');
  assert.ok(dowFinding, 'expected the dow=3 effect to be found and to hold');
  assert.ok(dowFinding.deltaIS > 0, 'dow=3 should show a POSITIVE lift toward next-wild');
});

t('matchContinuation/matchVolCluster only surface dimensions the live row has a reading for', () => {
  const rows = mkRows(4000, i => ({
    continued: (i % 5 === 0) ? (i % 2 === 0) : (i % 3 === 0),
    nextVol: (i % 5 === 0) ? '3·wild' : (i % 4 === 0 ? '3·wild' : '1·quiet'),
  }));
  const contBook = buildContinuationBook(rows);
  const volBook = buildVolClusterBook(rows);
  const live = { transition: 'London→NY', side: 'up', giveback: '1·held', vol: '1·quiet', travel: '1·churned', dow: null };
  const mc = matchContinuation(contBook, live);
  const mv = matchVolCluster(volBook, live);
  if (mc) for (const m of mc.matched) assert.notEqual(m.dimKey, 'dow', 'must not surface a dimension the live row has no reading for');
  if (mv) for (const m of mv.matched) assert.notEqual(m.dimKey, 'dow', 'must not surface a dimension the live row has no reading for');
});

t('matchContinuation/matchVolCluster return null for a cell the book has no data for', () => {
  const rows = mkRows(200, i => ({ continued: i % 2 === 0, nextVol: i % 2 === 0 ? '3·wild' : '1·quiet' }));
  const contBook = buildContinuationBook(rows);
  const volBook = buildVolClusterBook(rows);
  assert.equal(matchContinuation(contBook, { transition: 'nonexistent', side: 'up', giveback: '1·held' }), null);
  assert.equal(matchVolCluster(volBook, { transition: 'nonexistent', vol: '1·quiet' }), null);
});

// ── #4 additions: prevVol persistence dimension + meanNextRatio ──────────────
t('buildVolClusterBook finds a prevVol effect that holds (persistence beyond one hop)', () => {
  // Self-contained fixture, not reusing mkRows' i%3 pattern for prevVol
  // (that formula ties prevVol to i in a way that doesn't cleanly separate
  // from vol/giveback/etc. for this specific test) — prevVol='3·wild' pushes
  // nextVol strongly wild; everything else sits at a fixed, lower base rate.
  const rows = [];
  for (let i = 0; i < 4000; i++) {
    const d = new Date(2020, 0, 1 + Math.floor(i / 3));
    const prevVol = ['1·quiet', '2·normal', '3·wild'][i % 3];
    rows.push({
      date: d.toISOString().slice(0, 10), transition: 'London→NY',
      side: 'up', giveback: '1·held', travel: '2·mixed', vol: '2·normal', prevVol, dow: i % 7,
      nextVol: prevVol === '3·wild' ? (i % 10 < 8 ? '3·wild' : '1·quiet') : (i % 10 < 3 ? '3·wild' : '1·quiet'),
    });
  }
  const book = buildVolClusterBook(rows);
  const findings = extractHeldHandoffFindings(book);
  const prevVolFinding = findings.find(f => f.dimKey === 'prevVol' && f.bucket === '3·wild');
  assert.ok(prevVolFinding, 'expected a held prevVol=3·wild finding on data deliberately shaped to produce one');
  assert.ok(prevVolFinding.deltaIS > 0, 'prevVol=3·wild should show a POSITIVE lift toward next-wild');
});

t('meanNextRatio reports IS/OOS means per cell, null (not NaN/throw) when a cell has no nextRatio data', () => {
  const rows = mkRows(4000, i => ({ nextVol: i % 4 === 0 ? '3·wild' : '1·quiet', nextRatio: 0.5 + (i % 10) / 10 }));
  const book = buildVolClusterBook(rows);
  assert.ok(book);
  for (const cell of Object.values(book.cells)) {
    assert.ok('meanNextRatio' in cell, 'every cell should carry a meanNextRatio entry');
    assert.ok(cell.meanNextRatio.is == null || Number.isFinite(cell.meanNextRatio.is));
    assert.ok(cell.meanNextRatio.oos == null || Number.isFinite(cell.meanNextRatio.oos));
  }
  const withReal = Object.values(book.cells).filter(c => c.meanNextRatio.is != null);
  assert.ok(withReal.length > 0, 'expected at least one cell with a real meanNextRatio (not vacuous)');
  const rowsNoRatio = mkRows(200, i => ({ nextVol: i % 2 === 0 ? '3·wild' : '1·quiet' }));
  const bookNoRatio = buildVolClusterBook(rowsNoRatio);
  for (const cell of Object.values(bookNoRatio.cells)) assert.equal(cell.meanNextRatio.is, null);
});

console.log(`\n${passed} passed${process.exitCode ? ' — FAILURES ABOVE' : ''}`);
