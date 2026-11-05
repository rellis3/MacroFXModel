// Tests for js/newsOps.js.   node js/newsOps.test.mjs
import assert from 'node:assert/strict';
import { NEWS_SOURCES, backoff, dueSources, allowAlert, breakingCandidates, breakingMessage } from './newsOps.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const M = 60e3;

t('sources: unique names, https only, the new feeds present', () => {
  const names = NEWS_SOURCES.map(([s]) => s);
  assert.equal(new Set(names).size, names.length);
  assert.ok(NEWS_SOURCES.every(([, u]) => /^https:\/\//.test(u)));
  for (const s of ['ForexLive', 'FXStreet', 'RBA', 'BoJ', 'BoC', 'SNB', 'RBNZ']) assert.ok(names.includes(s), s);
});

t('back-off: next poll on success, doubling on failure, capped', () => {
  let s = backoff(null, false, 0, { error: 'HTTP 503' });
  assert.equal(s.fails, 1); assert.equal(s.nextAt, 4 * M - 15e3); assert.equal(s.lastError, 'HTTP 503');
  s = backoff(s, false, 0); assert.equal(s.nextAt, 8 * M - 15e3);
  for (let i = 0; i < 6; i++) s = backoff(s, false, 0);
  assert.equal(s.nextAt, 30 * M - 15e3, 'capped at 30 min');
  s = backoff(s, true, 100); assert.deepEqual(s, { fails: 0, nextAt: 100 + 2 * M - 15e3, lastOk: 100, lastError: null });
});

t('due: a feed backing off is skipped, the others are not', () => {
  const st = { Fed: { nextAt: 10 * M }, ECB: { nextAt: 1 } };
  assert.deepEqual(dueSources([['Fed', 'a'], ['ECB', 'b'], ['BoE', 'c']], st, 5 * M).map(([s]) => s), ['ECB', 'BoE']);
});

t('throttle: one per headline, six an hour', () => {
  let st = null;
  for (let i = 0; i < 6; i++) { const r = allowAlert(st, `h${i}`, i * M); assert.ok(r.ok); st = r.state; }
  assert.equal(allowAlert(st, 'h6', 10 * M).why, 'cap 6 an hour');
  assert.equal(allowAlert(st, 'h0', 90 * M).why, 'already sent');
  const later = allowAlert(st, 'h6', 61 * M); assert.ok(later.ok, 'the hour rolls');
  assert.ok(allowAlert({ sent: { h0: 0 }, times: [] }, 'h0', 100 * 3600e3).ok, 'old ids are forgotten after keepH');
});

t('breaking candidates: tier 1 by the read, with impact, recent, unsent, oldest first', () => {
  const now = 100 * M;
  const w = [
    { id: 'a', ms: now - 5 * M, tier: 2, read: { tier: 1, impact: { USD: 1 } } },
    { id: 'b', ms: now - 9 * M, tier: 1, read: { tier: 1, impact: {} } },
    { id: 'c', ms: now - 90 * M, tier: 1, read: { tier: 1, impact: { EUR: 1 } } },
    { id: 'd', ms: now - 2 * M, tier: 1, read: { tier: 2, impact: { EUR: 1 } } },
    { id: 'e', ms: now - 7 * M, tier: 1, read: { tier: 1, impact: { JPY: -2 } } },
    { id: 'f', ms: now - 90 * M, firstSeen: now - M, tier: 1, read: { tier: 1, impact: { GBP: 1 } } },
  ];
  assert.deepEqual(breakingCandidates(w, now, { sent: { e: 1 } }).map(h => h.id), ['f', 'a']);
});

t('message: headline, read, cards split by stance, escaped, labelled', () => {
  const h = { title: 'Fed cuts rates <surprise>', source: 'Fed', sources: ['Fed', 'ForexLive'], read: { why: 'easier than priced', impact: { USD: -2, GOLD: 1 } } };
  const m = breakingMessage(h, [{ inst: 'EURUSD', dir: 2, card: 'LONG', stance: 'supports' }, { inst: 'USDJPY', dir: -2, card: 'STRONG_LONG', stance: 'against' }, { inst: 'GBPUSD', dir: 2, card: null, stance: null }]);
  assert.match(m, /<b>Fed cuts rates &lt;surprise&gt;<\/b>/);
  assert.match(m, /Read: USD ▼▼ · GOLD ▲/);
  assert.match(m, /Supports: EURUSD long/); assert.match(m, /Against: USDJPY long/);
  assert.match(m, /Fed, ForexLive · context, not a signal/);
  assert.match(breakingMessage({ ...h, sources: null }, []), /No live card on these markets/);
});

console.log(`newsOps: ${n} tests passed`);
