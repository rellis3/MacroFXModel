/**
 * runAnalyser never scores a weekend-dated session (REPO_REVIEW_2026-10-31).
 * Run: node --test js/forecastAnalyser.weekend.test.mjs
 * London bucketing puts the 2-hour Sunday-evening FX open on a Sunday key with ~120 M1 bars, which cleared
 * minBarsPerSession and was scored as a session (and fed σ).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAnalyser } from './forecastAnalyser.js';

function sessionsWithSundayStubs(weeks = 12) {
  const m = new Map(); let px = 1.1, seed = 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  const d = new Date(Date.UTC(2026, 0, 4));                       // a Sunday
  for (let k = 0; k < weeks * 7; k++, d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay(); if (dow === 6) continue;
    const key = d.toISOString().slice(0, 10), n = dow === 0 ? 120 : 600, t0 = d.getTime() / 1000 + (dow === 0 ? 22 * 3600 : 0);
    const bars = [];
    for (let i = 0; i < n; i++) { const o = px; px *= 1 + rnd() * 0.0008; bars.push({ time: t0 + i * 60, open: o, high: Math.max(o, px) * 1.0001, low: Math.min(o, px) * 0.9999, close: px }); }
    m.set(key, bars);
  }
  return m;
}

test('no record is dated Saturday or Sunday; keepWeekends restores them', () => {
  const s = sessionsWithSundayStubs();
  const recs = runAnalyser(s, 'fx', { minLookback: 5 });
  assert.ok(recs.length > 0);
  const days = new Set(recs.map(r => new Date((r.date ?? r.session) + 'T12:00:00Z').getUTCDay()));
  assert.ok(!days.has(0) && !days.has(6), [...days].join(','));
  const recsAll = runAnalyser(s, 'fx', { minLookback: 5, keepWeekends: true });
  assert.ok(recsAll.some(r => new Date((r.date ?? r.session) + 'T12:00:00Z').getUTCDay() === 0));
});
