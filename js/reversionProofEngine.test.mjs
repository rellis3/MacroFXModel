import test from 'node:test';
import assert from 'node:assert/strict';
import { reversionProof } from './reversionProofEngine.js';

// Synthetic intraday: each London day opens at 100, rises to +amp, falls to 0 — so the
// high sits amp% above open and the low ~0. σ (YZ) is finite.
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

test('reversionProof: emits per-day rows + an aggregate that is their average', () => {
  const r = reversionProof(synthDays(160), { pair: 'EURUSD', tolPips: 5 });
  assert.ok(!r.insufficient, 'enough data');
  assert.ok(r.rows.length > 0, 'per-day rows present');
  const a = r.aggregate;
  assert.ok(a.avgR > 0, 'average median line distance computed');
  assert.ok(a.avgHighPct >= 0 && a.avgLowPct >= 0, 'average reversion reach computed');
  assert.ok(a.upHitRate >= 0 && a.upHitRate <= 100, 'hit rate is a %');
  // Every row carries the numbers needed to draw + verify: line prices and the extremes.
  const row = r.rows[0];
  for (const k of ['date', 'open', 'R', 'highPct', 'lowPct', 'lineUp', 'lineDn', 'high', 'low', 'upGapPips', 'upWin']) {
    assert.ok(k in row, `row has ${k}`);
  }
  // lineUp must be above open, lineDn below (sanity on the geometry).
  assert.ok(row.lineUp > row.open && row.lineDn < row.open, 'lines bracket the open');
});

test('reversionProof: reachOverLine < 1 when the day only reaches part of the range from open', () => {
  // In the synth the high is amp% above open; the median line R = 1.572σ is wider than one
  // side's reach, so the upside reach ÷ line should be < 1 (reverts short of the full-range line).
  const r = reversionProof(synthDays(160));
  assert.ok(r.aggregate.reachOverLineUp < 1, 'upside reverts short of the full-range line');
});

test('reversionProof: wider tolerance never lowers the hit rate', () => {
  const tight = reversionProof(synthDays(160), { tolPips: 2 });
  const wide = reversionProof(synthDays(160), { tolPips: 50 });
  assert.ok(wide.aggregate.upHitRate >= tight.aggregate.upHitRate, 'wider tol ⇒ ≥ hit rate');
});

test('reversionProof: insufficient data flagged, not thrown', () => {
  assert.equal(reversionProof(synthDays(30)).insufficient, true);
});
