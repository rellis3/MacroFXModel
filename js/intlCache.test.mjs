// js/intlCache.test.mjs: the cache must change nothing but the number of native objects built.
import test from 'node:test';
import assert from 'node:assert/strict';
import { intlCacheStats, originalIntl as O } from './intlCache.js';

const DATES = [Date.UTC(2026, 2, 29, 0, 30), Date.UTC(2026, 2, 29, 1, 0), Date.UTC(2026, 9, 25, 0, 30), Date.UTC(2026, 9, 25, 1, 30), Date.UTC(2025, 0, 1, 12, 5, 9), Date.UTC(2026, 11, 31, 23, 59, 59), 0, 1.7e12].map(t => new Date(t));
const LOCALES = [undefined, 'en-GB', 'en-CA', 'en-US', 'sv-SE', 'de-DE', ['fr-FR', 'en']];
const OPTS = [
  undefined, {}, { timeZone: 'Europe/London' }, { timeZone: 'America/New_York', hour12: false }, { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' },
  { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/London' }, { weekday: 'short', day: 'numeric', month: 'short' }, { month: 'long', year: 'numeric', timeZone: 'Asia/Tokyo' },
  { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' }, { dateStyle: 'full' }, { timeStyle: 'medium' }, { hour: 'numeric', timeZone: 'Australia/Sydney' }, { timeZoneName: 'short', timeZone: 'Europe/London' },
];

test('Date#toLocaleString / DateString / TimeString give the original text for every locale/options pair', () => {
  let n = 0;
  for (const d of DATES) for (const l of LOCALES) for (const o of OPTS) for (const m of ['dls', 'dld', 'dlt']) {
    const name = { dls: 'toLocaleString', dld: 'toLocaleDateString', dlt: 'toLocaleTimeString' }[m];
    let want, got, wantErr = null, gotErr = null;
    try { want = O[m].call(d, l, o); } catch (e) { wantErr = e.constructor.name; }
    try { got = d[name](l, o); } catch (e) { gotErr = e.constructor.name; }
    assert.equal(gotErr, wantErr, `${name} ${d.toISOString()} ${JSON.stringify(l)} ${JSON.stringify(o)} threw differently`);
    assert.equal(got, want, `${name} ${d.toISOString()} ${JSON.stringify(l)} ${JSON.stringify(o)}`); n++;
  }
  assert.ok(n > 1500);
});

test('an invalid date still reads "Invalid Date" and Intl.DateTimeFormat output matches the original', () => {
  assert.equal(new Date(NaN).toLocaleString('en-GB', { timeZone: 'UTC' }), O.dls.call(new Date(NaN), 'en-GB', { timeZone: 'UTC' }));
  for (const d of DATES) for (const l of LOCALES) for (const o of OPTS) {
    const a = new O.DTF(l, o), b = new Intl.DateTimeFormat(l, o);
    assert.equal(b.format(d), a.format(d)); assert.deepEqual(b.formatToParts(d), a.formatToParts(d)); assert.deepEqual(b.resolvedOptions(), a.resolvedOptions());
  }
});

test('Number#toLocaleString and Intl.NumberFormat give the original text', () => {
  const NUM = [0, 1, -1.5, 1234.5678, 1e9, 0.000123, NaN, Infinity, 99.995];
  const NO = [undefined, {}, { maximumFractionDigits: 2 }, { minimumFractionDigits: 1, maximumFractionDigits: 1 }, { style: 'percent' }, { style: 'currency', currency: 'USD' }, { notation: 'compact' }, { useGrouping: false }];
  for (const x of NUM) for (const l of [undefined, 'en-US', 'de-DE', 'en-GB']) for (const o of NO) {
    assert.equal(x.toLocaleString(l, o), O.nls.call(x, l, o), `${x} ${l} ${JSON.stringify(o)}`);
    assert.equal(new Intl.NumberFormat(l, o).format(x), new O.NF(l, o).format(x));
  }
});

test('identical arguments share one instance, different arguments do not, unusual arguments bypass the cache', () => {
  const a = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit' }), b = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', timeZone: 'Europe/London' });
  assert.equal(a, b, 'key order must not matter');
  assert.notEqual(a, new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit' }));
  assert.notEqual(a, new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', hour: '2-digit' }));
  assert.ok(a instanceof Intl.DateTimeFormat);
  const before = intlCacheStats.bypass; const w = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: 'numeric', get x() { return 1; } }); assert.ok(w.format(new Date(0)));
  new Intl.DateTimeFormat(new Intl.Locale('en-GB')); assert.ok(intlCacheStats.bypass > before);
  assert.equal(typeof Intl.DateTimeFormat.supportedLocalesOf, 'function');
  assert.ok(Intl.DateTimeFormat('en-GB').format(new Date(0)), 'callable without new');
});

test('a hot loop builds one native formatter, not one per call', () => {
  const m0 = intlCacheStats.misses; const d = new Date(Date.UTC(2026, 5, 1, 12));
  for (let i = 0; i < 20000; i++) d.toLocaleString('sv-SE', { timeZone: 'Europe/London' });
  assert.ok(intlCacheStats.misses - m0 <= 1, 'at most one new formatter for 20,000 calls');
});
