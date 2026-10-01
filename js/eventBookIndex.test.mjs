// Tests for js/eventBookIndex.js — matching the calendar's wording to the book's families.
//
// The bug: the Event Response Book names releases one way and the economic calendar
// another, with nothing mapping between them. Checked against the live feed on
// 2026-10-01, ZERO of that week's ten high-impact events resolved to a book family by
// name, and the lossy country|category bridge reached only two — one of them WRONGLY,
// rendering payrolls' figures under the unemployment rate.
//
// Run:  node --test js/eventBookIndex.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, familyFor, isRealFamily, orderFamilies, EVENT_ALIASES } from './eventBookIndex.js';

// a stand-in shaped like the real book
const families = {
  'us|core-pce-price-index-month-over-month': { label: 'US Core PCE Price Index Month-over-Month', joinProof: { medianSpikeR0: 2.4 } },
  'us|payroll-jobs-growth':                   { label: 'US Payroll Jobs Growth',                   joinProof: { medianSpikeR0: 4.8 } },
  'us|headline-unemployment-rate':            { label: 'US Headline Unemployment Rate',            joinProof: { medianSpikeR0: 3.1 } },
  'us|fed-interest-rate-decision':            { label: 'US Fed Interest Rate Decision',            joinProof: { medianSpikeR0: 5.1 } },
  'gb|boe-interest-rate-decision':            { label: 'GB BoE Interest Rate Decision',            joinProof: { medianSpikeR0: 3.0 } },
  'us|existing-home-sales':                   { label: 'US Existing Home Sales',                   joinProof: { medianSpikeR0: 1.1 } },
  'fomc':                                     { label: 'US FOMC statement (tone)',                 joinProof: { medianSpikeR0: 5.5 } },
  'beige-book':                               { label: 'US Beige Book',                            joinProof: { medianSpikeR0: 1.0 } },
};
const book = Object.fromEntries(Object.keys(families).map(k => [k, { instruments: { EURUSD: { spikeR0: 2, n: 50 } } }]));

test('calendar shorthand expands to the book’s long form', () => {
  assert.equal(slugify('Core PCE Price Index m/m'), 'core-pce-price-index-month-over-month');
  assert.equal(slugify('Final GDP q/q'), 'final-gdp-quarter-over-quarter');
  assert.equal(slugify('CPI y/y'), 'cpi-year-over-year');
  assert.equal(slugify('Prelim UoM Consumer Sentiment'), 'prel-uom-consumer-sentiment');
  assert.equal(slugify(''), '');
  assert.equal(slugify(null), '');
});

// The one that was silently wrong: both bucket to US|employment, whose representative is
// payrolls, so the unemployment rate row rendered payrolls' measured figures.
test('the unemployment rate resolves to its OWN family, not payrolls', () => {
  assert.equal(familyFor('US', 'Unemployment Rate', families), 'us|headline-unemployment-rate');
  assert.equal(familyFor('US', 'Non-Farm Employment Change', families), 'us|payroll-jobs-growth');
  assert.notEqual(familyFor('US', 'Unemployment Rate', families), familyFor('US', 'Non-Farm Employment Change', families));
});

test('a release the book holds under a different name still resolves', () => {
  assert.equal(familyFor('GB', 'Official Bank Rate', families), 'gb|boe-interest-rate-decision');
  assert.equal(familyFor('US', 'FOMC Statement', families), 'us|fed-interest-rate-decision');
  assert.equal(familyFor('US', 'Core PCE Price Index m/m', families), 'us|core-pce-price-index-month-over-month');
});

// Two families are stored with no country prefix. A country|slug lookup alone never
// reaches them, so they were unreachable from the calendar.
test('the un-prefixed families are reachable', () => {
  assert.equal(familyFor('US', 'Beige Book', families), 'beige-book');
});

test('country is respected — a GB release cannot borrow a US family', () => {
  assert.equal(familyFor('GB', 'Core PCE Price Index m/m', families), null);
  assert.equal(familyFor('US', 'Official Bank Rate', families), null);
});

// The failure mode this file exists to avoid is a NEAR match putting one release's
// numbers under another's name. Absence must stay absence.
test('a release the book does not hold returns null rather than something close', () => {
  assert.equal(familyFor('AU', 'Cash Rate', families), null);
  assert.equal(familyFor('AU', 'CPI m/m', families), null);
  assert.equal(familyFor('US', 'Final GDP q/q', families), null);
  assert.equal(familyFor('US', 'Average Hourly Earnings m/m', families), null);
});

test('headline CPI is never aliased onto the core series', () => {
  for (const [, m] of Object.entries(EVENT_ALIASES)) {
    for (const [from, to] of Object.entries(m)) {
      if (/^cpi-|^cpi$/.test(from) && !/^core/.test(from)) {
        assert.ok(!/core/.test(to), `"${from}" is aliased to the core series "${to}" — different series`);
      }
    }
  }
});

test('missing arguments produce null, never a throw', () => {
  assert.equal(familyFor(null, 'CPI', families), null);
  assert.equal(familyFor('US', null, families), null);
  assert.equal(familyFor('US', 'CPI', null), null);
});

test('a family with no label or no instruments is not offered', () => {
  const fams = { ...families, 'us|ghost': { label: undefined }, 'us|empty': { label: 'US Empty' } };
  const bk = { ...book, 'us|empty': { instruments: {} } };
  assert.equal(isRealFamily('us|ghost', fams, bk), false);
  assert.equal(isRealFamily('us|empty', fams, bk), false);
  assert.equal(isRealFamily('us|payroll-jobs-growth', fams, bk), true);
});

// ── the ordering ────────────────────────────────────────────────────────────
const now = Date.parse('2026-10-01T12:00:00Z');
const events = [
  { country: 'US', event: 'Non-Farm Employment Change', ms: now + 2 * 864e5, impact: 'High' },
  { country: 'US', event: 'Unemployment Rate',          ms: now + 2 * 864e5, impact: 'High' },
  { country: 'US', event: 'Core PCE Price Index m/m',   ms: now + 36e5,      impact: 'High' },
  { country: 'AU', event: 'Cash Rate',                  ms: now + 3 * 864e5, impact: 'High' },
  { country: 'US', event: 'Existing Home Sales',        ms: now + 4 * 864e5, impact: 'Low' },
];

test('what is due comes first, soonest first', () => {
  const o = orderFamilies(families, book, events, now);
  assert.deepEqual(o.due, ['us|core-pce-price-index-month-over-month', 'us|payroll-jobs-growth', 'us|headline-unemployment-rate']);
  assert.equal(o.dueByKey.get(o.due[0]).event, 'Core PCE Price Index m/m',
    'the option must carry the CALENDAR’s wording, which is what the reader arrives with');
});

test('a due release is not listed twice', () => {
  const o = orderFamilies(families, book, events, now);
  const all = [...o.due, ...o.movers, ...o.rest];
  assert.equal(new Set(all).size, all.length);
  assert.equal(all.length, Object.keys(families).length, 'every real family appears exactly once');
});

test('only high-impact events promote a family', () => {
  const o = orderFamilies(families, book, events, now);
  assert.ok(!o.due.includes('us|existing-home-sales'), 'a low-impact row must not jump the queue');
});

test('movers and the rest split on the book’s own 2x bar', () => {
  const o = orderFamilies(families, book, events, now);
  assert.ok(o.movers.every(k => families[k].joinProof.medianSpikeR0 >= 2));
  assert.ok(o.rest.every(k => families[k].joinProof.medianSpikeR0 < 2));
  assert.ok(o.movers.includes('fomc'));
  assert.ok(o.rest.includes('beige-book'));
});

test('an event that has already printed still counts for the rest of its day', () => {
  const past = [{ country: 'US', event: 'Core PCE Price Index m/m', ms: now - 36e5, impact: 'High' }];
  const o = orderFamilies(families, book, past, now);
  assert.deepEqual(o.due, ['us|core-pce-price-index-month-over-month']);
  assert.equal(o.dueByKey.get(o.due[0]).past, true, 'and is marked as already out');
  const old = [{ country: 'US', event: 'Core PCE Price Index m/m', ms: now - 3 * 864e5, impact: 'High' }];
  assert.deepEqual(orderFamilies(families, book, old, now).due, [], 'last week is not this week');
});

test('no calendar at all still yields a usable picker', () => {
  for (const evs of [[], null, undefined]) {
    const o = orderFamilies(families, book, evs, now);
    assert.equal(o.due.length, 0);
    assert.equal(o.movers.length + o.rest.length, Object.keys(families).length);
    assert.ok(o.movers.length, 'the movers group must still be populated');
  }
});

test('an empty book does not throw', () => {
  const o = orderFamilies({}, {}, events, now);
  assert.deepEqual(o.due, []); assert.deepEqual(o.movers, []); assert.deepEqual(o.rest, []);
});
