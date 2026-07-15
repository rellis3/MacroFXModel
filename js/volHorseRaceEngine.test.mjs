import test from 'node:test';
import assert from 'node:assert/strict';
import { volHorseRace, HR_MODELS } from './volHorseRaceEngine.js';

// synthetic intraday with a persistent, mean-reverting vol process so HAR (long
// memory) has something real to track — enough for the walk-forward to train.
function synthM1(nDays) {
  const bars = []; const startSec = Math.floor(Date.UTC(2019, 0, 1, 0, 0, 0) / 1000);
  const perDay = 24 * 60; let px = 100; let vol = 0.008;
  for (let d = 0; d < nDays; d++) {
    vol = 0.004 + 0.85 * (vol - 0.004) + 0.0015 * Math.abs(Math.sin(d * 0.9));   // persistent vol
    for (let m = 0; m < perDay; m++) {
      const frac = m / perDay;
      const step = vol * Math.sin(frac * Math.PI * 6 + d) * 0.35;
      const o = px, c = px * (1 + step * 0.1 + vol * 0.02 * Math.sin(d + frac * 20));
      const hi = Math.max(o, c) * (1 + vol * 0.15), lo = Math.min(o, c) * (1 - vol * 0.15);
      bars.push({ time: startSec + (d * perDay + m) * 60, open: o, high: hi, low: lo, close: c });
      px = c;
    }
  }
  return bars;
}

test('volHorseRace: scores every model on an identical OOS day set', () => {
  const r = volHorseRace(synthM1(400), 'fx');
  assert.ok(!r.insufficient, `enough data (${JSON.stringify(r)})`);
  assert.deepEqual(r.models, HR_MODELS);
  const n0 = r.scores['HAR-RV'].n;
  for (const m of HR_MODELS) {
    assert.ok(r.scores[m], `${m} scored`);
    assert.equal(r.scores[m].n, n0, `${m} scored on the same day count (fair race)`);
    assert.ok(typeof r.scores[m].qlike === 'number', `${m} has QLIKE`);
  }
});

test('volHorseRace: ranks by QLIKE and reports a winner', () => {
  const r = volHorseRace(synthM1(400), 'fx');
  assert.equal(r.ranked.length, HR_MODELS.length);
  for (let i = 1; i < r.ranked.length; i++)
    assert.ok(r.scores[r.ranked[i - 1]].qlike <= r.scores[r.ranked[i]].qlike, 'sorted ascending QLIKE');
  assert.equal(r.winner, r.ranked[0]);
});

test('volHorseRace: reports platform-vs-HAR verdict for the class', () => {
  const r = volHorseRace(synthM1(400), 'index');
  assert.equal(r.platform, 'GARCH');
  assert.ok(typeof r.harBeatsPlatform === 'boolean');
  assert.ok(r.harRank >= 1 && r.harRank <= HR_MODELS.length);
});

test('volHorseRace: insufficient data flagged, not thrown', () => {
  assert.ok(volHorseRace(synthM1(40), 'fx').insufficient);
});
