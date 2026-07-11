import test from 'node:test';
import assert from 'node:assert/strict';
import { cogFade } from './cogFadeEngine.js';

// Synthetic intraday: nDays London days, each a clean up-then-down triangle so σ is
// finite and the projected COG lines get touched.
function synthDays(nDays, amp = 0.012) {
  const bars = []; const H1 = 3600_000; const start = Date.UTC(2021, 0, 4, 0);
  let t = 0, px = 100;
  for (let d = 0; d < nDays; d++) {
    for (let h = 0; h < 24; h++) {
      const frac = h < 12 ? h / 12 : (24 - h) / 12;
      const c = px * (1 + amp * frac);
      bars.push({ time: new Date(start + t * H1), open: c, high: c * 1.0005, low: c * 0.9995, close: c }); t++;
    }
  }
  return bars;
}

test('cogFade: produces per-line (median/p75) IS/OOS A/B with costs applied', () => {
  // Closer constants than COG's so the lines reliably fall inside the synthetic range
  // (COG's median = Feller sits right at the range edge — the real "often not reached"
  // phenomenon, but poor for a mechanics test). Default-constants check is separate.
  const r = cogFade(synthDays(160), { pair: 'EURUSD', isFrac: 0.5, medC: 0.8, p75C: 1.0 });
  assert.ok(!r.insufficient, 'enough data');
  assert.equal(r.type, 'major'); assert.equal(r.cost, 1.5);
  for (const line of ['median', 'p75']) for (const exit of ['scalp', 'confirm']) {
    assert.ok(r[line][exit].is && r[line][exit].oos, `${line}.${exit} has is+oos`);
  }
  assert.ok(r.median.scalp.oos.trades > 0, 'median line touched OOS');
});

test('cogFade: the 75th line is reached no more often than the (closer) median line', () => {
  const r = cogFade(synthDays(160), { pair: 'GOLD', medC: 0.8, p75C: 1.0 });
  // p75 (further out) → fewer or equal touches than the median line.
  assert.ok(r.p75.scalp.is.trades + r.p75.scalp.oos.trades
    <= r.median.scalp.is.trades + r.median.scalp.oos.trades, '75th reached ≤ median');
});

test('cogFade: uses COG constants by default (median 1.56, 75th 1.93)', () => {
  const r = cogFade(synthDays(160));
  assert.ok(Math.abs(r.medC - 1.56) < 1e-9 && Math.abs(r.p75C - 1.93) < 1e-9, 'COG constants applied');
});

test('cogFade: insufficient data flagged, not thrown', () => {
  assert.equal(cogFade(synthDays(30)).insufficient, true);
});
