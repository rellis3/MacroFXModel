import test from 'node:test';
import assert from 'node:assert/strict';
import { exhaustionForecast } from './exhaustionForecastEngine.js';

// Synthetic intraday: each day rises ~amp then falls back, so there's a clear dominant
// reversal from the running low, and σ is finite.
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

test('exhaustionForecast: estimates kFade + cCal and forecasts the fade-back distance', () => {
  const r = exhaustionForecast(synthDays(200), { pair: 'EURUSD' });
  assert.ok(!r.insufficient, 'enough data');
  assert.ok(r.kFade > 0, 'exhaustion constant estimated');
  assert.ok(r.cCal > 0, 'calibrated median constant estimated');
  assert.ok(r.forecast.nDays > 0, 'OOS forecast days measured');
  assert.ok(r.forecast.predictedPct > 0 && r.forecast.actualPct > 0, 'predicted + actual fade-back present');
  assert.ok(r.forecast.hitRatePct >= 0 && r.forecast.hitRatePct <= 100, 'hit rate is a %');
});

test('exhaustionForecast: fadeVsMedian = kFade ÷ cCal (the fade-back sits relative to the median)', () => {
  const r = exhaustionForecast(synthDays(200));
  assert.ok(Math.abs(r.fadeVsMedian - r.kFade / r.cCal) < 1e-3, 'ratio consistent');
});

test('exhaustionForecast: gated + ungated fade both produce IS/OOS summaries', () => {
  const r = exhaustionForecast(synthDays(200), { budgetFrac: 0.8 });
  for (const k of ['gatedFade', 'ungatedFade']) {
    assert.ok(r[k].is && r[k].oos, `${k} has is + oos`);
    assert.ok(typeof r[k].oos.trades === 'number', `${k} oos trades numeric`);
  }
});

test('exhaustionForecast: insufficient data flagged, not thrown', () => {
  assert.equal(exhaustionForecast(synthDays(30)).insufficient, true);
});

test('exhaustionForecast: hard harness reports strict-marked robustness fields', () => {
  const r = exhaustionForecast(synthDays(200), { budgetFrac: 0.8 });
  const h = r.hard;
  assert.ok(h, 'hard block present');
  assert.ok(typeof h.winRate === 'number' && typeof h.expectancy === 'number', 'win rate + expectancy surfaced');
  assert.ok(Array.isArray(h.costSens) && h.costSens.length === 3, 'cost-sensitivity ×1/×2/×3');
  assert.ok(h.costSens[2].sharpe <= h.costSens[0].sharpe, '×3 cost is no better than ×1');
  assert.ok(typeof h.posYears === 'number' && h.posYears <= h.totYears, 'per-year split consistent');
  assert.equal(typeof h.survives, 'boolean', 'survivor verdict is a boolean');
});
