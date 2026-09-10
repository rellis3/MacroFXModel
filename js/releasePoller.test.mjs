// js/releasePoller.test.mjs — no network, no real clock (`now` is injected).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  latestObservationDate, observationAgeDays, shouldPoll, isLate, createReleasePoller,
} from './releasePoller.js';

const AT = d => Date.parse(d + 'T12:00:00Z');

test('latestObservationDate', async t => {
  await t.test('finds the newest date however the payload is shaped', () => {
    assert.equal(latestObservationDate({ byCcy: { USD: { headline: { latestDate: '2026-07-01' } } } }), '2026-07-01');
    assert.equal(latestObservationDate({ rows: [{ date: '2026-05-01' }, { date: '2026-08-01' }] }), '2026-08-01');
    assert.equal(latestObservationDate({ a: { b: { c: [{ asOf: '2026-09-01' }] } } }), '2026-09-01');
  });

  await t.test('IGNORES fetch-time metadata — otherwise every payload looks fresh forever', () => {
    // This is the whole point: generatedAt is when we asked, not how old the data is.
    const p = { generatedAt: '2026-09-10T14:40:00Z', byCcy: { USD: { latestDate: '2026-07-01' } } };
    assert.equal(latestObservationDate(p), '2026-07-01');
  });

  await t.test('reads the date half of an ISO timestamp on a non-meta key', () => {
    assert.equal(latestObservationDate({ observed: '2026-06-15T08:30:00Z' }), '2026-06-15');
  });

  await t.test('no dates at all is null, not a guess', () => {
    assert.equal(latestObservationDate({ score: 1, nested: { x: 'not-a-date' } }), null);
    assert.equal(latestObservationDate(null), null);
  });
});

test('cadence', async t => {
  await t.test('THE BUG: a stale print keeps polling instead of waiting for tomorrow', () => {
    // July print, read on 10 Sept — the exact case that shipped.
    const s = shouldPoll({ lastObs: '2026-07-01', lastPollAt: 0, now: AT('2026-09-10') });
    assert.equal(s.due, true);
    assert.equal(s.poll, true);
    assert.equal(s.interval, 20 * 60_000, 'polls eagerly while a print is outstanding');
  });

  await t.test('backs off once the observation actually advances', () => {
    const s = shouldPoll({ lastObs: '2026-09-01', lastPollAt: 0, now: AT('2026-09-10') });
    assert.equal(s.due, false);
    assert.equal(s.interval, 6 * 3600_000);
  });

  await t.test('respects the interval — it does not hammer FRED every tick', () => {
    const now = AT('2026-09-10');
    const s = shouldPoll({ lastObs: '2026-07-01', lastPollAt: now - 60_000, now });
    assert.equal(s.poll, false, 'one minute after a poll, due but not yet');
  });

  await t.test('nothing stored polls immediately', () => {
    assert.equal(shouldPoll({ lastObs: null, lastPollAt: 0, now: AT('2026-09-10') }).poll, true);
  });

  await t.test('"due" and "late" are deliberately different thresholds', () => {
    // A 40-day-old monthly print on the 10th is NORMAL — poll for it, do not warn.
    assert.equal(shouldPoll({ lastObs: '2026-08-01', lastPollAt: 0, now: AT('2026-09-10') }).due, true);
    assert.equal(isLate('2026-08-01', { now: AT('2026-09-10') }), false, 'must not cry wolf');
    // A full release behind IS worth warning about.
    assert.equal(isLate('2026-07-01', { now: AT('2026-09-10') }), true);
  });

  await t.test('age is measured in whole days', () => {
    assert.equal(observationAgeDays('2026-09-01', AT('2026-09-10')), 9);
    assert.equal(observationAgeDays(null), null);
  });
});

test('createReleasePoller', async t => {
  const mk = (payloads) => {
    let i = 0, builds = 0;
    const p = createReleasePoller({
      name: 'test',
      build: async () => { builds++; if (i < payloads.length - 1) i++; },
      read: async () => payloads[i],
    });
    return { p, builds: () => builds };
  };

  await t.test('seeds from storage so a redeploy does not re-poll for a month', async () => {
    const { p, builds } = mk([{ latestDate: '2026-09-01' }]);
    const r = await p.tick(AT('2026-09-10'));
    assert.equal(r.skipped, 'not due', 'fresh stored data means no immediate fetch');
    assert.equal(builds(), 0);
    assert.equal(p.state.lastObs, '2026-09-01');
  });

  await t.test('polls, notices the new print, and stops chasing', async () => {
    const { p, builds } = mk([{ latestDate: '2026-07-01' }, { latestDate: '2026-08-01' }]);
    await p.tick(AT('2026-09-10'));
    assert.equal(builds(), 1);
    assert.equal(p.state.lastObs, '2026-08-01', 'observation advanced');
    // Same day, well inside the idle interval now that it is current.
    const again = await p.tick(AT('2026-09-10') + 60_000);
    assert.equal(again.skipped, 'not due');
  });

  await t.test('a failing build is recorded and retried, never fatal', async () => {
    const p = createReleasePoller({
      name: 'boom', build: async () => { throw new Error('FRED 429'); }, read: async () => null,
    });
    const r = await p.tick(AT('2026-09-10'));
    assert.equal(r.error, 'FRED 429');
    assert.equal(p.state.lastError, 'FRED 429');
    assert.equal(p.state.running, false, 'the running flag must not leak on failure');
  });

  await t.test('overlapping ticks do not double-fetch', async () => {
    let inflight = 0, maxInflight = 0;
    const p = createReleasePoller({
      name: 'race',
      build: async () => { inflight++; maxInflight = Math.max(maxInflight, inflight); await new Promise(r => setTimeout(r, 20)); inflight--; },
      read: async () => ({ latestDate: '2026-07-01' }),
    });
    await Promise.all([p.tick(AT('2026-09-10')), p.tick(AT('2026-09-10'))]);
    assert.equal(maxInflight, 1);
  });
});
