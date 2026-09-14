// Fast follow-up (uses the cached daily-return series, no M1 walk): find WHERE
// the cliff-down/staged-up hybrid's drawdown exceeds the current design's, to
// see concretely why "ratchet upward only" backfired.
import fs from 'fs';
import { applyDrawdownThrottle } from '../js/levelAtlasVoteReview.js';

const { dates, dailyReturns } = JSON.parse(fs.readFileSync('analysis/output/throttle_daily_returns_cache.json', 'utf8'));

function applyCliffDownStagedUp(returns, { triggerDD, restoreDD, upStages }) {
  let equity = 1, peak = 1, throttled = false, stageIdx = 0;
  const scaled = []; const track = [];
  for (let i = 0; i < returns.length; i++) {
    const ddNow = (equity - peak) / peak * 100;
    let mult = 1;
    if (!throttled) {
      if (ddNow <= triggerDD) { throttled = true; stageIdx = 0; }
    } else {
      if (ddNow >= restoreDD) throttled = false;
      else if (ddNow <= triggerDD) stageIdx = 0;
      else while (stageIdx + 1 < upStages.length && ddNow > upStages[stageIdx + 1].ddAbove) stageIdx++;
    }
    if (throttled) mult = upStages[stageIdx].mult;
    const r = returns[i] * mult;
    scaled.push(+r.toFixed(4));
    equity *= (1 + r / 100);
    if (equity > peak) peak = equity;
    track.push({ date: dates[i], ddNow: +ddNow.toFixed(2), throttled, mult });
  }
  return { dailyReturns: scaled, track };
}

const current = applyDrawdownThrottle(dailyReturns, dates, { triggerDD: -8, restoreDD: -2, throttleMult: 0.25 });
const hybrid = applyCliffDownStagedUp(dailyReturns, {
  triggerDD: -8, restoreDD: -2,
  upStages: [{ ddAbove: -8, mult: 0.25 }, { ddAbove: -6, mult: 0.40 }, { ddAbove: -4, mult: 0.65 }],
});

function ddSeries(returns) {
  let eq = 1, peak = 1; const dd = [];
  for (const r of returns) { eq *= (1 + r / 100); if (eq > peak) peak = eq; dd.push((eq - peak) / peak * 100); }
  return dd;
}
const ddCurrent = ddSeries(current.dailyReturns);
const ddHybrid = ddSeries(hybrid.dailyReturns);

// Find the day where hybrid's DD is worst relative to current's DD.
let worstGapIdx = 0, worstGap = 0;
for (let i = 0; i < dates.length; i++) {
  const gap = ddCurrent[i] - ddHybrid[i]; // positive = hybrid deeper than current
  if (gap > worstGap) { worstGap = gap; worstGapIdx = i; }
}
console.log(`Largest single-day gap (hybrid deeper than current): ${dates[worstGapIdx]}, hybrid DD ${ddHybrid[worstGapIdx].toFixed(1)}% vs current DD ${ddCurrent[worstGapIdx].toFixed(1)}% (gap ${worstGap.toFixed(1)}pp)`);

// Walk back ~40 trading days to show the whole episode that produced it.
const start = Math.max(0, worstGapIdx - 40);
console.log(`\nDay-by-day from ${dates[start]} to ${dates[worstGapIdx]}:  date | hybrid DD/mult | current DD/mult`);
for (let i = start; i <= worstGapIdx; i++) {
  const h = hybrid.track[i];
  const curMult = ddCurrent[i] <= -8 || (i > 0 && current.dailyReturns[i] !== dailyReturns[i] * 1) ? null : null; // placeholder, compute directly below
  console.log(`  ${dates[i]}  hybrid: DD${h.ddNow.toString().padStart(6)}%  mult=${h.mult}   |  current: DD${ddCurrent[i].toFixed(1).padStart(6)}%`);
}

// Overall max DD comparison
console.log(`\nFull-period max DD: current ${Math.min(...ddCurrent).toFixed(1)}%, hybrid ${Math.min(...ddHybrid).toFixed(1)}%`);
