import test from 'node:test';
import assert from 'node:assert/strict';
import { atlasFreshness, ageText } from './atlasFreshness.js';

const NOW = Date.parse('2026-11-09T22:15:00Z');   // 22:15 UK (GMT in November)
const S = (label, asOf, cadence = 'live') => ({ label, source: 'x', asOf, cadence });

test('refreshed time is the newest timestamped feed, in UK time, with its age and name', () => {
  const r = atlasFreshness([S('Range forecast', '2026-11-09T21:05:00Z'), S('Implied volatility', '2026-11-09T21:10:00Z', 'daily'), S('Market prices', '2026-11-09', 'daily')], { nowMs: NOW, isoDate: '2026-11-10' });
  assert.match(r.text, /Data refreshed 21:10 UK \(1h 05m ago\)/);
  assert.match(r.text, /newest: Implied volatility/);
  assert.equal(r.newestMs, Date.parse('2026-11-09T21:10:00Z'));
});

test('all current: green and says so; a stale or missing feed turns it amber and is named', () => {
  const ok = atlasFreshness([S('Range forecast', '2026-11-09T21:05:00Z'), S('Market prices', '2026-11-09', 'daily')], { nowMs: NOW, isoDate: '2026-11-10' });
  assert.equal(ok.tone, 'green'); assert.match(ok.text, /all feeds current/);
  const bad = atlasFreshness([S('Range forecast', '2026-11-09T21:05:00Z'), S('Market prices', '2026-11-04', 'daily'), S('Release calendar', null)], { nowMs: NOW, isoDate: '2026-11-10' });
  assert.equal(bad.tone, 'amber'); assert.match(bad.text, /2 feeds behind/); assert.equal(bad.behind.length, 2);
});

test('an old refresh is amber even when every feed is by its own rhythm current; yesterday shows its date', () => {
  const r = atlasFreshness([S('Range forecast', '2026-11-09T09:00:00Z')], { nowMs: NOW, isoDate: '2026-11-09' });
  assert.equal(r.tone, 'amber');
  const y = atlasFreshness([S('Range forecast', '2026-11-08T21:05:00Z')], { nowMs: NOW, isoDate: '2026-11-09' });
  assert.match(y.text, /Data refreshed 8 Nov 21:05 UK/);
});

test('a time in the future is ignored (a clock error is not freshness); nothing timestamped says so; bad input does not throw', () => {
  const f = atlasFreshness([S('Range forecast', '2026-11-10T10:00:00Z')], { nowMs: NOW, isoDate: '2026-11-10' });
  assert.match(f.text, /No feed reported a refresh time/);
  assert.doesNotThrow(() => atlasFreshness(undefined)); assert.doesNotThrow(() => atlasFreshness([null].filter(Boolean)));
});

test('age text', () => { assert.equal(ageText(NOW - 20_000, NOW), 'just now'); assert.equal(ageText(NOW - 5 * 60_000, NOW), '5m ago'); assert.equal(ageText(NOW - 26 * 3.6e6, NOW), '1d ago'); });

test('a long list of feeds behind is cut to three names and a count', () => {
  const many = ['A', 'B', 'C', 'D', 'E'].map(l => S(l, null));
  const r = atlasFreshness(many, { nowMs: NOW, isoDate: '2026-11-10' });
  assert.match(r.text, /5 feeds behind: A did not load; B did not load; C did not load; \+2 more/);
  assert.equal(r.behind.length, 5);
});
