// js/goldEtfFlowCore.test.mjs: the cache and response rules of /api/gold-etf-flow. A failed or empty try is not cached for hours, the reason is in the
// body, and the data-health row carries it. (server.js itself is not importable here: the last test reads its source to check the wiring.)
// node --test js/goldEtfFlowCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { OK_TTL_MS, RETRY_MS, cacheTtlMs, reasonOf, fetchBlock, routeBody, healthParts, todayUtc } from './goldEtfFlowCore.js';

test('a good day is cached six hours; an empty or failed try only two minutes', () => {
  assert.equal(cacheTtlMs(true), OK_TTL_MS); assert.equal(cacheTtlMs(false), RETRY_MS);
  assert.equal(OK_TTL_MS, 6 * 3600 * 1000); assert.equal(RETRY_MS, 120000);
  assert.equal(todayUtc(Date.parse('2026-11-15T23:59:00Z')), '2026-11-15');
});

test('reasonOf keeps the HTTP status, drops a crumb and caps the length', () => {
  assert.equal(reasonOf(new Error('Yahoo crumb HTTP 429')), 'Yahoo crumb HTTP 429');
  assert.equal(reasonOf(new Error('Yahoo fund AUM GLD HTTP 401')), 'Yahoo fund AUM GLD HTTP 401');
  assert.ok(!/abc123/.test(reasonOf(new Error('GET ...&crumb=abc123 failed'))));
  assert.ok(reasonOf(new Error('x'.repeat(500))).length <= 160);
  assert.equal(reasonOf(null), 'unknown error');
});

test('fetchBlock: ok when today is held; otherwise the reason (or a plain default), when it was tried and how soon the next try is', () => {
  const now = Date.parse('2026-11-15T23:10:00Z'), at = now - 30_000;
  const bad = fetchBlock({ haveToday: false, reason: 'Yahoo crumb HTTP 429', attemptedAt: at, now });
  assert.equal(bad.ok, false); assert.equal(bad.reason, 'Yahoo crumb HTTP 429'); assert.equal(bad.retryInSec, 90); assert.equal(bad.attemptedAt, new Date(at).toISOString());
  assert.match(fetchBlock({ haveToday: false }).reason, /No point recorded for today/);
  const good = fetchBlock({ haveToday: true, reason: 'old error', okAt: now, now }); assert.equal(good.ok, true); assert.equal(good.reason, null); assert.equal(good.retryInSec, null);
});

test('routeBody: empty and failed -> ok:false with the reason; stale history stays ok:true and carries the reason; a good day is plain ok', () => {
  const empty = { series: [], last: null, asOf: null, deltas: null, fetch: fetchBlock({ haveToday: false, reason: 'Yahoo crumb HTTP 429' }) };
  const a = routeBody(empty); assert.equal(a.ok, false); assert.equal(a.error, 'Yahoo crumb HTTP 429'); assert.equal(a.reason, 'Yahoo crumb HTTP 429'); assert.deepEqual(a.series, []);
  const stale = { series: [{ date: '2026-11-13', value: 2.6e11 }], last: 2.6e11, asOf: '2026-11-13', deltas: {}, fetch: fetchBlock({ haveToday: false, reason: 'Yahoo fund AUM GLD HTTP 401' }) };
  const b = routeBody(stale); assert.equal(b.ok, true); assert.equal(b.fetch.reason, 'Yahoo fund AUM GLD HTTP 401'); assert.equal(b.series.length, 1);
  const good = { series: [{ date: '2026-11-15', value: 2.6e11 }], last: 2.6e11, asOf: '2026-11-15', deltas: {}, fetch: fetchBlock({ haveToday: true }) };
  assert.equal(routeBody(good).ok, true); assert.equal(routeBody(good).fetch.ok, true);
  assert.equal(routeBody(undefined).ok, false, 'no data at all is a failure with a default reason');
});

test('healthParts: the reason goes in the label, the last good day is the series date or the last good fetch', () => {
  const failed = { series: [], asOf: null, fetch: fetchBlock({ haveToday: false, reason: 'Yahoo crumb HTTP 429' }) };
  const h = healthParts({ lastOkAt: null, lastError: 'Yahoo crumb HTTP 429' }, failed);
  assert.equal(h.suffix, ' (Yahoo crumb HTTP 429)'); assert.equal(h.lastIso, null);
  const held = { series: [{ date: '2026-11-13', value: 1 }], asOf: '2026-11-13', fetch: fetchBlock({ haveToday: false, reason: 'x' }) };
  assert.equal(healthParts({ lastOkAt: null }, held).lastIso, '2026-11-13T12:00:00.000Z');
  const ok = healthParts({ lastOkAt: Date.parse('2026-11-15T10:00:00Z') }, { fetch: fetchBlock({ haveToday: true }), asOf: '2026-11-15' });
  assert.equal(ok.suffix, ''); assert.equal(ok.lastIso, '2026-11-15T10:00:00.000Z');
});

test('server.js is wired to these rules: the 6h constant is gone, the TTL follows the result, one build at a time, the route and health row use them', () => {
  const src = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.ok(!/GOLD_ETF_FLOW_TTL_MS/.test(src), 'the fixed 6h TTL is gone');
  assert.match(src, /_goldEtfFlowCache\.ttlMs = _gefTtl\(haveToday\)/);
  assert.match(src, /_goldEtfFlowInflight/);
  assert.match(src, /res\.json\(_gefRouteBody\(await _goldEtfFlowSeries\(\)\)\)/);
  assert.match(src, /push\('goldEtf',/);
  assert.match(src, /kv\.getStrict\(GOLD_ETF_FLOW_KV\)/, 'the read-modify-write still reads strictly');
});
