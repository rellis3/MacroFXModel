// Tests for js/sourceConflict.js — two feeds for one thing, and which to believe.
//
// The check this replaces compared FRED's WTI to OANDA's on a shared date and called
// anything past 4% a DATA CONFLICT, which blocked every oil read. Two faults: a flat
// threshold on the LEVEL measures the basis between two different instruments (FRED ran
// ~1% above OANDA on 125 shared dates, robust sd 1.46%), and "they disagree" throws away
// a working number when only one of them is broken.
//
// Run:  node --test js/sourceConflict.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crossSourceRead, basisStats, implausiblePrints, mad } from './sourceConflict.js';

/** a quiet series pair with a constant basis and a little noise */
function quiet(n = 60, basisPct = -1) {
  const rows = [];
  let a = 100;
  for (let i = 0; i < n; i++) {
    a *= 1 + Math.sin(i * 1.7) * 0.015;                       // deterministic wobble
    const b = a * (1 + basisPct / 100) * (1 + Math.cos(i * 2.3) * 0.002);
    rows.push({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, a: +a.toFixed(3), b: +b.toFixed(3) });
  }
  return rows;
}

test('mad is robust to the outlier it is meant to survive', () => {
  const clean = [1, 1, 1, 1, 1, 1];
  assert.equal(mad(clean), 0);
  const withSpike = [1, 1, 1, 1, 1, 100];
  assert.equal(mad(withSpike), 0, 'one wild value must not move the spread');
  assert.equal(mad([]), null);
});

test('a steady offset between two instruments is not a conflict', () => {
  // 3% apart every single day: a different contract, not a disagreement
  const rows = quiet(60, -3);
  const r = crossSourceRead(rows, { aName: 'FRED', bName: 'OANDA' });
  assert.equal(r.verdict, 'agree');
  assert.ok(Math.abs(r.stats.basis + 3) < 0.5, `basis read as ${r.stats.basis}`);
  assert.match(r.line, /different contracts|normally run/i);
});

// THE CASE THE OLD RULE GOT BACKWARDS. One feed jumps, the other does not.
test('when one feed prints something impossible it is named, and the other is declared usable', () => {
  const rows = quiet(60, -1);
  rows[rows.length - 2].a *= 1.17;          // FRED jumps 17% two days from the end
  rows[rows.length - 1].a *= 1.17;          // and stays there
  const r = crossSourceRead(rows, { aName: 'FRED', bName: 'OANDA' });
  assert.equal(r.verdict, 'suspect');
  assert.equal(r.suspect, 'FRED');
  assert.equal(r.usable, 'OANDA');
  assert.match(r.line, /bad print, not a market move/);
  assert.match(r.line, /Use OANDA/);
});

test('the same jump in the OTHER feed names that one instead — no favourites', () => {
  const rows = quiet(60, -1);
  rows[rows.length - 2].b *= 1.17;
  rows[rows.length - 1].b *= 1.17;
  const r = crossSourceRead(rows, { aName: 'FRED', bName: 'OANDA' });
  assert.equal(r.verdict, 'suspect');
  assert.equal(r.suspect, 'OANDA');
  assert.equal(r.usable, 'FRED');
});

test('a move BOTH feeds make is the market, not a bad print', () => {
  const rows = quiet(60, -1);
  for (const i of [rows.length - 2, rows.length - 1]) { rows[i].a *= 1.17; rows[i].b *= 1.17; }
  const r = crossSourceRead(rows, { aName: 'FRED', bName: 'OANDA' });
  assert.notEqual(r.verdict, 'suspect', 'both jumped together — that is oil moving');
});

// A conflict has to be built by DRIFT, not a jump: any single-day move big enough to open
// a gap is itself the implausible print, so the two branches cannot be reached the same
// way. This is the case where both feeds look fine day to day and still end up apart.
test('a slow divergence with no faulty print on any day is still a conflict', () => {
  const rows = quiet(60, -1);
  for (let i = 1; i <= 15; i++) rows[rows.length - i].b *= 1 + 0.004 * (16 - i);   // ~0.4%/day
  assert.equal(implausiblePrints(rows).length, 0, 'no single day should look like a bad print');
  const r = crossSourceRead(rows, { aName: 'FRED', bName: 'OANDA' });
  assert.equal(r.verdict, 'conflict');
  assert.match(r.line, /DATA CONFLICT/);
  assert.match(r.line, /neither series shows a print that explains it/);
});

// A bad print inflates the very spread it has to stand out against. On a ten-day window
// two WTI outliers lifted the robust spread to 2.49% and buried a real divergence at z=-1.1.
test('the normal basis is estimated from clean days, not contaminated ones', () => {
  const rows = quiet(60, -1);
  rows[20].a *= 1.25; rows[21].a /= 1.25;          // a spike and its reversal, mid-window
  const contaminated = basisStats(rows);
  const clean = basisStats(rows, { exclude: new Set([rows[21].date, rows[22].date]) });
  assert.ok(clean.spread <= contaminated.spread,
    `excluding the spike must not widen the spread (${clean.spread} vs ${contaminated.spread})`);
});

test('an old bad print does not keep the alarm ringing', () => {
  const rows = quiet(60, -1);
  rows[10].a *= 1.2; rows[11].a /= 1.2;            // long ago, and recovered
  const r = crossSourceRead(rows, { aName: 'FRED', bName: 'OANDA' });
  assert.notEqual(r.verdict, 'suspect', 'a print 50 sessions back is history, not news');
});

test('too little shared history produces nothing rather than a confident verdict', () => {
  assert.equal(crossSourceRead(quiet(5), {}), null);
  assert.equal(crossSourceRead([], {}), null);
  assert.equal(crossSourceRead(null, {}), null);
  assert.equal(basisStats(null), null);
  assert.deepEqual(implausiblePrints(null), []);
});

// FRED leaves holidays EMPTY and _fredCsv drops them, but a zero or negative price must
// never divide anything here even if some other feed sends one.
test('non-positive and non-finite prices are dropped, never divided by', () => {
  const rows = quiet(60, -1);
  rows[5].a = 0; rows[6].a = -3; rows[7].b = NaN; rows[8] = null;
  const r = crossSourceRead(rows, { aName: 'FRED', bName: 'OANDA' });
  assert.ok(r, 'a few junk rows must not kill the read');
  for (const v of [r.stats.basis, r.stats.spread, r.stats.gap, r.stats.z]) assert.ok(Number.isFinite(v), `${v}`);
});

test('every verdict carries a line that names both readings and the date', () => {
  for (const rows of [quiet(60, -1), quiet(60, -6)]) {
    const r = crossSourceRead(rows, { aName: 'FRED', bName: 'OANDA', unit: '' });
    assert.ok(r.line.includes('FRED') && r.line.includes('OANDA'));
    assert.ok(r.line.includes(r.stats.latest.date));
    assert.ok(r.line.length > 60);
  }
});

test('the gap is measured on the LATEST row even when it is excluded from the baseline', () => {
  const rows = quiet(60, -1);
  rows[rows.length - 1].a *= 1.3;          // today is the contaminated one
  const r = crossSourceRead(rows, { aName: 'FRED', bName: 'OANDA' });
  assert.equal(r.stats.latest.date, rows[rows.length - 1].date);
  assert.ok(Math.abs(r.stats.gap) > 10, 'today’s real gap must still be reported');
});
