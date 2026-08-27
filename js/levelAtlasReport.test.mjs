/**
 * Unit tests for js/levelAtlasReport.js. Pure/synthetic touch records — no
 * network, no engine dependency (keeps this fast and isolates report-layer
 * bugs from engine bugs).
 *   node js/levelAtlasReport.test.mjs
 */
import assert from 'node:assert/strict';
import { buildAtlasBook, sessionTransitionTable, buildAtlasCard, renderBookText, DIMENSIONS, extractHeldFindings, matchLiveContext, leanOf, NOISE_FLOOR } from './levelAtlasReport.js';

let passed = 0;
const t = (n, f) => { try { f(); passed++; console.log(`  ✓ ${n}`); }
  catch (e) { console.error(`  ✗ ${n}\n    ${e.message}`); process.exitCode = 1; } };

console.log('levelAtlasReport');

// ── Synthetic touch fixture ──────────────────────────────────────────────────
function mkTouches(n, { instrument = 'TEST', side = 'up', rung = 'p50', rearmFrac = 0.3,
                        outcomeFn = i => (i % 3 === 0 ? 'back' : i % 3 === 1 ? 'out' : 'neither'),
                        churnFn = i => (i % 2 === 0 ? '1·churned' : '3·driven') } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const date = `2020-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`;
    out.push({
      instrument, side, rung, rearmFrac, ordinal: 1, date,
      outcome: outcomeFn(i), fadePips: -5 - (i % 4), runPips: 3 + (i % 5),
      pullbackFrac: 0.3 + (i % 5) * 0.1, minsToResolve: 30 + i * 3,
      churn: churnFn(i), asiaVol: i % 2 === 0 ? '1·quiet' : '3·wild',
      londonVol: i % 3 === 0 ? '1·quiet' : i % 3 === 1 ? '2·normal' : '3·wild',
      session: 'London', dow: i % 7, dowSession: `${i % 7}|London`, gapBucket: 'flat',
      sessionPos: '1·early', dayVol: '2·normal', otherSideTouchedBefore: i % 4 === 0,
    });
  }
  return out;
}

t('buildAtlasBook splits IS/OOS by date and both halves add up to the total', () => {
  const touches = mkTouches(300);
  const book = buildAtlasBook(touches, { rearmFrac: 0.3 });
  const cell = book.cells['up|p50'];
  assert.equal(cell.n.is + cell.n.oos, 300);
  assert.ok(cell.n.is > cell.n.oos, 'IS should be the larger, earlier 60%');
});

t('buildAtlasBook only reads the requested rearmFrac', () => {
  const a = mkTouches(100, { rearmFrac: 0.15 });
  const b = mkTouches(50, { rearmFrac: 0.5 });
  const book = buildAtlasBook([...a, ...b], { rearmFrac: 0.15 });
  assert.equal(book.cells['up|p50'].n.is + book.cells['up|p50'].n.oos, 100);
});

t('base out/back/neither percentages sum to 100', () => {
  const book = buildAtlasBook(mkTouches(300), { rearmFrac: 0.3 });
  const b = book.cells['up|p50'].base;
  assert.ok(Math.abs(b.is.outPct + b.is.backPct + b.is.neitherPct - 100) < 0.2);
  assert.ok(Math.abs(b.oos.outPct + b.oos.backPct + b.oos.neitherPct - 100) < 0.2);
});

t('every DIMENSIONS entry that has data appears in the book, and buckets sum to the cell n', () => {
  const touches = mkTouches(400);
  const book = buildAtlasBook(touches, { rearmFrac: 0.3 });
  const cell = book.cells['up|p50'];
  for (const [dimKey] of DIMENSIONS) {
    if (!cell.dims[dimKey]) continue;
    const isSum = Object.values(cell.dims[dimKey].is).reduce((s, g) => s + g.n, 0);
    assert.equal(isSum, cell.n.is, `${dimKey} IS bucket counts don't sum to cell n`);
  }
});

t('pullback/resolve percentiles are non-decreasing (p25 <= p50 <= p75)', () => {
  const book = buildAtlasBook(mkTouches(300), { rearmFrac: 0.3 });
  const churnDim = book.cells['up|p50'].dims.churn;
  for (const bucket of Object.values(churnDim.is)) {
    if (!bucket.pullbackPctiles) continue;
    assert.ok(bucket.pullbackPctiles.p25 <= bucket.pullbackPctiles.p50);
    assert.ok(bucket.pullbackPctiles.p50 <= bucket.pullbackPctiles.p75);
  }
});

t('a dimension absent from every touch is simply absent from the book (never a fake empty entry)', () => {
  const touches = mkTouches(100).map(t2 => { const c = { ...t2 }; delete c.confluence; return c; });
  const book = buildAtlasBook(touches, { rearmFrac: 0.3 });
  assert.ok(!('confluence' in book.cells['up|p50'].dims));
});

t('sessionTransitionTable counts ONE vote per day, not one per touch', () => {
  // 5 days, 3 touches each — all touches on a day carry the SAME asiaVol/londonVol
  // (they're day-level facts), so per-day dedup must NOT triple-count a day just
  // because it had more touches than another.
  const touches = [];
  for (let d = 0; d < 5; d++) {
    for (let k = 0; k < 3; k++) {
      touches.push({ date: `2020-01-0${d + 1}`, asiaVol: d < 3 ? '1·quiet' : '3·wild', londonVol: '2·normal' });
    }
  }
  const table = sessionTransitionTable(touches, 'asiaVol', 'londonVol');
  assert.equal(table['1·quiet'].n, 3, 'must count 3 DAYS, not 9 touches');
  assert.equal(table['3·wild'].n, 2);
});

t('sessionTransitionTable rows sum to 100%', () => {
  const touches = mkTouches(300);
  const table = sessionTransitionTable(touches, 'asiaVol', 'londonVol');
  for (const row of Object.values(table)) {
    const sum = Object.entries(row).filter(([k]) => k !== 'n').reduce((s, [, v]) => s + v, 0);
    assert.ok(Math.abs(sum - 100) < 0.5, `row sums to ${sum}, not 100`);
  }
});

t('buildAtlasCard emits one headline entry per (side, rung) cell with a lean and a detail string', () => {
  const book = buildAtlasBook(mkTouches(300), { rearmFrac: 0.3 });
  const card = buildAtlasCard(book);
  assert.equal(card.headline.length, Object.keys(book.cells).length);
  for (const h of card.headline) {
    assert.ok(['continuation', 'reversion', 'neutral'].includes(h.lean));
    assert.ok(typeof h.detail === 'string' && h.detail.length > 10);
    assert.ok(h.sameSignOOS === true || h.sameSignOOS === false || h.sameSignOOS === null);
  }
});

t('buildAtlasCard reports "neutral" rather than a coin-flip lean below the noise floor', () => {
  // out/back nearly tied (50.5% / 49.5%) — must NOT be reported as a directional lean.
  const touches = mkTouches(400, { outcomeFn: i => (i % 200 < 101 ? 'out' : i % 200 < 200 ? 'back' : 'neither') });
  const book = buildAtlasBook(touches, { rearmFrac: 0.3 });
  const card = buildAtlasCard(book);
  const h = card.headline.find(x => x.key === 'up|p50');
  if (Math.abs(h.out - h.back) < 3) {
    assert.equal(h.lean, 'neutral');
    assert.equal(h.sameSignOOS, null, 'a neutral lean should not be scored as agreeing/disagreeing with OOS');
  }
});

t('buildAtlasCard sameSignOOS correctly flags a lean that FLIPPED between IS and OOS', () => {
  // Force IS to favour 'out' and OOS to favour 'back' by date-ordering outcomes.
  const touches = mkTouches(300, { outcomeFn: i => (i < 180 ? 'out' : 'back') });
  const book = buildAtlasBook(touches, { rearmFrac: 0.3 });
  const card = buildAtlasCard(book);
  const h = card.headline.find(x => x.key === 'up|p50');
  // Not guaranteed which way the date-sort lands the split, but the flag must
  // be internally consistent with the IS/OOS numbers it's derived from.
  const isLean = h.out >= h.back ? 'continuation' : 'reversion';
  const oosLean = h.outOOS >= h.backOOS ? 'continuation' : 'reversion';
  assert.equal(h.sameSignOOS, isLean === oosLean);
});

t('renderBookText runs without throwing on a real book and mentions every cell', () => {
  const book = buildAtlasBook(mkTouches(400), { rearmFrac: 0.3 });
  const text = renderBookText(book);
  for (const key of Object.keys(book.cells)) {
    const [side, rung] = key.split('|');
    assert.ok(text.includes(`${side.toUpperCase()} ${rung}`), `book text missing section for ${key}`);
  }
});

t('an empty touch list degrades to null/(no data), never throws', () => {
  assert.equal(buildAtlasBook([]), null);
  assert.equal(renderBookText(null), '(no data)');
  assert.equal(buildAtlasCard(null), null);
});

// ── holdsOOS gate — the piece that stops an auto-picked chip from being a
// fishing expedition dressed as a finding ─────────────────────────────────────
t('a dimension bucket that is IDENTICAL to the cell base never holds (no effect ⇒ never a chip)', () => {
  // churnFn constant → the 'churn' dimension has exactly ONE bucket, so its
  // outPct is BY CONSTRUCTION identical to the cell base — must never hold.
  const touches = mkTouches(400, { churnFn: () => '3·driven' });
  const book = buildAtlasBook(touches, { rearmFrac: 0.3 });
  const dim = book.cells['up|p50'].dims.churn;
  for (const g of Object.values(dim.is)) assert.equal(g.holdsOOS, false);
});

t('a bucket that flips sign between IS and OOS never holds, however large either half looks', () => {
  // churn bucket '1·churned' favours 'out' in IS, favours 'back' in OOS — a
  // real, large effect in EACH half individually, but opposite signs, so it
  // must NOT be presented as a held finding.
  const touches = mkTouches(600, {
    churnFn: i => (i % 2 === 0 ? '1·churned' : '2·mixed'),
    outcomeFn: i => {
      const isHalf = i < 360;   // mkTouches spreads dates across 2020 in order-ish; use index as a proxy
      if (i % 2 === 0) return isHalf ? 'out' : 'back';   // churned: out-heavy IS, back-heavy OOS
      return i % 3 === 0 ? 'out' : 'back';
    },
  });
  const book = buildAtlasBook(touches, { rearmFrac: 0.3 });
  const dim = book.cells['up|p50'].dims.churn;
  const churned = dim.is['1·churned'];
  if (churned && dim.oos['1·churned']) {
    // Whatever the actual numbers land as, holdsOOS must be false whenever the
    // sign truly flips — assert the INVARIANT via the stored deltas, not a
    // hand-predicted number (the IS/OOS date split point is data-dependent).
    const oosSide = dim.oos['1·churned'];
    if (Math.sign(churned.deltaOut) !== Math.sign(oosSide.deltaOut) && churned.deltaOut !== 0 && oosSide.deltaOut !== 0) {
      assert.equal(churned.holdsOOS, false, 'a sign-flipped bucket must never holdsOOS');
    }
  }
});

t('a bucket needs BOTH halves to clear the n floor to hold, even with a huge IS effect', () => {
  // A large, evenly-dated baseline (churn mixed, outcome back) so 5 extra rows
  // can't meaningfully shift the 60th-percentile split date. A DISTINCT churn
  // bucket with a big, real effect is then injected ONLY as 5 rows, all dated
  // at the dataset's literal maximum date — unambiguously in the OOS tail, and
  // few enough to stay under the n floor there. (An earlier version of this
  // test injected 200 "IS" rows spanning Jan-Jun by cycling day-of-month, which
  // let ~30 of them land AFTER the actual split date and leak into OOS — this
  // version sidesteps date arithmetic entirely by using one fixed date.)
  const base = mkTouches(2000, { churnFn: () => '2·mixed', outcomeFn: () => 'back' });
  const touches = [...base];
  for (let i = 0; i < 300; i++) touches.push({ ...base[0], date: `2020-0${1 + (i % 6)}-01`, churn: '3·driven', outcome: 'out' });   // IS-only, well before the tail
  for (let i = 0; i < 5; i++) touches.push({ ...base[0], date: '2020-12-31', churn: '3·driven', outcome: 'out' });                  // OOS tail, n=5 only
  const book = buildAtlasBook(touches, { rearmFrac: 0.3 });
  const g = book.cells['up|p50'].dims.churn.is['3·driven'];
  const o = book.cells['up|p50'].dims.churn.oos['3·driven'];
  assert.ok(g && g.n >= 200, 'IS side should have plenty of the injected bucket');
  assert.ok(o && o.n < 30, `test setup check: OOS n should be under the floor, got ${o?.n}`);
  assert.equal(g.holdsOOS, false, 'OOS n is under the floor — must not hold regardless of IS size');
});

t('extractHeldFindings returns only holdsOOS entries, sorted by |effect| descending', () => {
  const touches = mkTouches(500, {
    churnFn: i => (i % 4 === 0 ? '1·churned' : i % 4 === 1 ? '2·mixed' : '3·driven'),
    outcomeFn: i => (i % 4 === 0 ? (i % 8 === 0 ? 'out' : 'back') : (i % 5 === 0 ? 'out' : 'back')),
  });
  const book = buildAtlasBook(touches, { rearmFrac: 0.3 });
  const found = extractHeldFindings(book);
  for (const f of found) assert.ok(Math.abs(f.deltaOutIS) >= 0, 'sanity: has a numeric delta');
  for (let i = 1; i < found.length; i++) assert.ok(Math.abs(found[i - 1].deltaOutIS) >= Math.abs(found[i].deltaOutIS), 'not sorted descending');
  // Cross-check against a manual scan for at least one dimension.
  const manual = [];
  for (const [cellKey, cell] of Object.entries(book.cells)) for (const [dimKey, dim] of Object.entries(cell.dims))
    for (const [bucket, g] of Object.entries(dim.is)) if (g.holdsOOS) manual.push(`${cellKey}|${dimKey}|${bucket}`);
  const gotKeys = found.map(f => `${f.cellKey}|${f.dimKey}|${f.bucket}`);
  for (const k of manual) assert.ok(gotKeys.includes(k) || found.length >= 50, `manual-found holding cell ${k} missing from extractHeldFindings`);
});

t('buildAtlasCard.context only contains OOS-confirmed dimension buckets, sorted by effect', () => {
  const touches = mkTouches(500, {
    churnFn: i => (i % 3 === 0 ? '1·churned' : '3·driven'),
    outcomeFn: i => (i % 3 === 0 ? (i % 6 === 0 ? 'out' : 'back') : (i % 5 === 0 ? 'out' : 'back')),
  });
  const book = buildAtlasBook(touches, { rearmFrac: 0.3 });
  const card = buildAtlasCard(book);
  const h = card.headline.find(x => x.key === 'up|p50');
  assert.ok(Array.isArray(h.context));
  for (const c of h.context) assert.ok('dimKey' in c && 'bucket' in c && 'deltaOutIS' in c);
  for (let i = 1; i < h.context.length; i++) assert.ok(Math.abs(h.context[i - 1].deltaOutIS) >= Math.abs(h.context[i].deltaOutIS));
});

// ── matchLiveContext ──────────────────────────────────────────────────────────
t('matchLiveContext only matches dimensions the LIVE touch actually has a reading for', () => {
  const touches = mkTouches(500, {
    churnFn: i => (i % 3 === 0 ? '1·churned' : '3·driven'),
    outcomeFn: i => (i % 3 === 0 ? (i % 6 === 0 ? 'out' : 'back') : (i % 5 === 0 ? 'out' : 'back')),
  });
  const book = buildAtlasBook(touches, { rearmFrac: 0.3 });
  // A live touch missing churn (null) must never surface a churn match, even
  // though churn holds in the stored book.
  const live = { instrument: 'TEST', side: 'up', rung: 'p50', ordinal: 1, date: '2025-01-01', churn: null };
  const m = matchLiveContext(book, live);
  assert.ok(m, 'expected a match for a cell the book has data for');
  assert.ok(!m.supports.some(x => x.dimKey === 'churn') && !m.challenges.some(x => x.dimKey === 'churn'),
    'a null live field must never produce a matched dimension');
});

t('matchLiveContext splits into supports/challenges by whether the matched dim agrees with the cell lean', () => {
  // Force a clear cell lean (out >> back) and a churn bucket whose OWN effect
  // favours 'back' (the opposite of the cell lean) — must land in challenges.
  const touches = mkTouches(600, {
    churnFn: i => (i % 2 === 0 ? '1·churned' : '3·driven'),
    outcomeFn: i => {
      if (i % 2 === 0) return i % 4 === 0 ? 'out' : 'back';    // '1·churned': mostly back (favours back)
      return 'out';                                             // '3·driven': always out (favours out, and IS the cell base driver)
    },
  });
  const book = buildAtlasBook(touches, { rearmFrac: 0.3 });
  const cellLean = leanOf(book.cells['up|p50'].base.is.outPct, book.cells['up|p50'].base.is.backPct);
  const churnedBucket = book.cells['up|p50'].dims.churn?.is['1·churned'];
  if (cellLean !== 'neutral' && churnedBucket?.holdsOOS) {
    const live = { instrument: 'TEST', side: 'up', rung: 'p50', ordinal: 1, date: '2025-01-01', churn: '1·churned' };
    const m = matchLiveContext(book, live);
    const inChallenges = m.challenges.some(x => x.dimKey === 'churn' && x.bucket === '1·churned');
    const inSupports = m.supports.some(x => x.dimKey === 'churn' && x.bucket === '1·churned');
    assert.ok(inChallenges !== inSupports, 'the churn match must land in exactly one of supports/challenges');
    // '1·churned' favours 'back'; if the cell itself leans 'continuation' (out),
    // this bucket must be a CHALLENGE, not a support.
    if (churnedBucket.deltaOut < 0 && cellLean === 'continuation') assert.ok(inChallenges);
  }
});

t('matchLiveContext returns null for a (side,rung) the book has no data for', () => {
  const book = buildAtlasBook(mkTouches(300), { rearmFrac: 0.3 });
  const live = { instrument: 'TEST', side: 'up', rung: 'p90', ordinal: 1, date: '2025-01-01' };   // p90 never populated by mkTouches
  assert.equal(matchLiveContext(book, live), null);
});

t('matchLiveContext handles boolean-valued dimensions (overlapWindow-style) via string coercion', () => {
  const touches = mkTouches(400).map((t2, i) => ({ ...t2, overlapWindow: i % 2 === 0, outcome: i % 2 === 0 ? 'out' : 'back' }));
  const book = buildAtlasBook(touches, { rearmFrac: 0.3 });
  // mkTouches doesn't register overlapWindow in DIMENSIONS by default in this
  // test file's fixture, so just confirm no crash and a sane null/array result
  // regardless of whether it happens to hold — the coercion itself is the point.
  const live = { instrument: 'TEST', side: 'up', rung: 'p50', ordinal: 1, date: '2025-01-01', overlapWindow: true };
  assert.doesNotThrow(() => matchLiveContext(book, live));
});

t('matchLiveContext attaches the SAME human-readable label DIMENSIONS defines — no second copy for a UI to drift from', () => {
  const touches = mkTouches(500, {
    churnFn: i => (i % 3 === 0 ? '1·churned' : '3·driven'),
    outcomeFn: i => (i % 3 === 0 ? (i % 6 === 0 ? 'out' : 'back') : (i % 5 === 0 ? 'out' : 'back')),
  });
  const book = buildAtlasBook(touches, { rearmFrac: 0.3 });
  const live = { instrument: 'TEST', side: 'up', rung: 'p50', ordinal: 1, date: '2025-01-01', churn: '1·churned' };
  const m = matchLiveContext(book, live);
  const churnMatch = [...m.supports, ...m.challenges].find(x => x.dimKey === 'churn');
  if (churnMatch) {
    const expected = DIMENSIONS.find(([k]) => k === 'churn')[1];
    assert.equal(churnMatch.dimLabel, expected);
  }
});

t('matchLiveContext({keyField, dimLabels}) generalizes past the `rung` field — Asia Fib Atlas reuse, 2026-08-27', () => {
  // buildAtlasBook itself is Level-Atlas-specific (always keys by `rung`) —
  // this test only needs to prove matchLiveContext's OWN generalization, so
  // it hand-builds a minimal book in the `side|level` shape asiaFibAtlasReport.js's
  // buildAsiaFibAtlasBook actually produces, rather than depending on either
  // engine's real book-builder (keeps this file's own isolation — no
  // cross-engine import). Default behaviour (no opts) stays byte-identical
  // for every existing Level Atlas call site — proven by every test above
  // passing unmodified.
  const book = {
    cells: {
      'up|1.5': {
        base: { is: { outPct: 60, backPct: 30, neitherPct: 10 }, oos: { outPct: 58, backPct: 32, neitherPct: 10 } },
        dims: { churn: { is: { '1·churned': { deltaOut: 12, n: 80, holdsOOS: true } }, oos: { '1·churned': { deltaOut: 10, n: 40 } } } },
      },
    },
  };
  const dimLabels = new Map([['churn', 'Custom churn label']]);
  const live = { instrument: 'TEST', side: 'up', level: 1.5, ordinal: 1, date: '2025-01-01', churn: '1·churned' };
  const m = matchLiveContext(book, live, { keyField: 'level', dimLabels });
  assert.ok(m, 'expected a match against the level-keyed cell');
  assert.equal(m.level, 1.5);
  assert.equal(m.key, 'up|1.5');
  const churnMatch = [...m.supports, ...m.challenges].find(x => x.dimKey === 'churn');
  assert.ok(churnMatch, 'the held churn bucket must surface');
  assert.equal(churnMatch.dimLabel, 'Custom churn label', 'custom dimLabels map must be honored');
  // A default-opts call against the SAME level-keyed book must miss (looks
  // for `liveTouch.rung`, which is undefined here) — proves the default
  // keyField is still 'rung', unchanged for existing Level Atlas callers.
  assert.equal(matchLiveContext(book, live), null);
});

t('leanOf / NOISE_FLOOR are the SAME instance buildAtlasCard uses — no drift between the two entry points', () => {
  assert.equal(leanOf(50, 50 - NOISE_FLOOR + 0.1), 'neutral');
  assert.equal(leanOf(50, 50 - NOISE_FLOOR - 0.1), 'continuation');
  const book = buildAtlasBook(mkTouches(300), { rearmFrac: 0.3 });
  const card = buildAtlasCard(book);
  const h = card.headline.find(x => x.key === 'up|p50');
  const live = { instrument: 'TEST', side: 'up', rung: 'p50', ordinal: 1, date: '2025-01-01' };
  const m = matchLiveContext(book, live);
  assert.equal(h.lean, m.lean, 'buildAtlasCard and matchLiveContext must compute the SAME lean for the same cell');
});

console.log(`\n${passed} passed${process.exitCode ? ' — FAILURES ABOVE' : ''}`);
