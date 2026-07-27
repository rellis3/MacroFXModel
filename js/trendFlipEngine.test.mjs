// Synthetic, no-network unit test for the trend-flip engine. No OANDA/R2 data —
// this proves the pipeline is wired correctly and has no lookahead; it is NOT
// evidence the strategy has edge (that needs a real-data run, see LEGO_MODULES.md §1ae).
import { runTrendFlip, runTrendFlipSummarized, computeHtfBiasByDate } from './trendFlipEngine.js';

// Deterministic synthetic series (no Math.random): daily bars with a slow
// drift + noise, M1 bars linearly interpolated between each day's open/close
// with small intrabar noise so ATR/MAE have something real to read.
function lcg(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }

function synthDaily(n, drift, seed) {
  const rand = lcg(seed);
  const bars = [];
  let px = 1.1000;
  const start = Date.UTC(2024, 0, 1) / 1000;
  for (let i = 0; i < n; i++) {
    px *= 1 + drift + (rand() - 0.5) * 0.0002;
    const date = new Date((start + i * 86400) * 1000).toISOString().slice(0, 10);
    bars.push({ date, open: px, high: px * 1.002, low: px * 0.998, close: px });
  }
  return bars;
}

function synthM1(dailyBars, seed) {
  const rand = lcg(seed);
  const n = dailyBars.length * 1440;
  const times = new Int32Array(n), opens = new Float32Array(n), highs = new Float32Array(n),
        lows = new Float32Array(n), closes = new Float32Array(n);
  let k = 0;
  for (let d = 0; d < dailyBars.length; d++) {
    const dayStart = Date.UTC(+dailyBars[d].date.slice(0, 4), +dailyBars[d].date.slice(5, 7) - 1, +dailyBars[d].date.slice(8, 10)) / 1000;
    const o = dailyBars[d].open, c = dailyBars[d].close;
    for (let m = 0; m < 1440; m++) {
      const frac = m / 1440;
      const px = o + (c - o) * frac + (rand() - 0.5) * (o * 0.0003);
      times[k] = dayStart + m * 60;
      opens[k] = px; closes[k] = px; highs[k] = px * 1.0002; lows[k] = px * 0.9998;
      k++;
    }
  }
  return { n, times, opens, highs, lows, closes };
}

const UP_DAILY = synthDaily(300, 0.0006, 42);
const UP_M1 = synthM1(UP_DAILY, 7);
const DOWN_DAILY = synthDaily(300, -0.0006, 43);
const DOWN_M1 = synthM1(DOWN_DAILY, 8);

let failed = false;
function check(label, cond) {
  console.log(`  ${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failed = true;
}

// [1] HTF bias sign matches the underlying drift direction (mean over the tail).
{
  const upHtf = computeHtfBiasByDate(UP_DAILY, 20);
  const downHtf = computeHtfBiasByDate(DOWN_DAILY, 20);
  const meanTail = (h) => { const vals = h.dates.slice(-100).map(d => h.byDate.get(d)); return vals.reduce((a, b) => a + b, 0) / vals.length; };
  const upMean = meanTail(upHtf), downMean = meanTail(downHtf);
  console.log(`[1] HTF bias sign — up-drift mean=${upMean.toFixed(3)}, down-drift mean=${downMean.toFixed(3)}`);
  check('up-drift series reads bullish', upMean > 0);
  check('down-drift series reads bearish', downMean < 0);
}

// [2] Trades generated, all sane (no crash, non-negative MAE, finite R/pnl).
let upResult, downResult;
{
  upResult = runTrendFlipSummarized('eurusd', UP_DAILY, UP_M1, 'fx', {});
  downResult = runTrendFlipSummarized('eurusd', DOWN_DAILY, DOWN_M1, 'fx', {});
  console.log(`[2] trades — up-drift=${upResult.trades.length}, down-drift=${downResult.trades.length}`);
  check('up-drift produced at least one trade', upResult.trades.length > 0);
  check('down-drift produced at least one trade', downResult.trades.length > 0);
  let bad = 0;
  for (const t of [...upResult.trades, ...downResult.trades]) {
    if (!(t.mae_pct >= 0)) bad++;
    if (!Number.isFinite(t.pnl_pct)) bad++;
    if (!Number.isFinite(t.R)) bad++;
    if (!(t.entry_ts < t.exit_ts)) bad++;
  }
  check('all trades sane (MAE>=0, finite pnl/R, exit after entry)', bad === 0);
}

// [3] Directional sanity: an up-drift-only market should produce mostly/only
// BUY flips (HTF bullish gates flipUp; flipDown needs htfBearish which a
// steady up-drift shouldn't reach), and vice versa for the down-drift market.
{
  const upSides = new Set(upResult.trades.map(t => t.side));
  const downSides = new Set(downResult.trades.map(t => t.side));
  console.log(`[3] side distribution — up-drift=${[...upSides]}, down-drift=${[...downSides]}`);
  check('up-drift trades are BUY-only', upSides.size === 1 && upSides.has('BUY'));
  check('down-drift trades are SELL-only', downSides.size === 1 && downSides.has('SELL'));
}

// [4] No lookahead: truncating the daily+M1 history strictly AFTER a cutoff
// date must not change any trade whose entry is strictly before that cutoff.
{
  const cutoffIdx = 220; // daily index
  const cutoffDate = UP_DAILY[cutoffIdx].date;
  const cutoffEpoch = Math.floor(Date.parse(cutoffDate + 'T00:00:00Z') / 1000);

  const truncDaily = UP_DAILY.slice(0, cutoffIdx);
  const keepN = UP_M1.times.findIndex(t => t >= cutoffEpoch);
  const cut = keepN < 0 ? UP_M1.n : keepN;
  const truncM1 = { n: cut, times: UP_M1.times.slice(0, cut), opens: UP_M1.opens.slice(0, cut), highs: UP_M1.highs.slice(0, cut), lows: UP_M1.lows.slice(0, cut), closes: UP_M1.closes.slice(0, cut) };

  const { trades: fullTrades } = runTrendFlip(UP_DAILY, UP_M1, 'fx', {});
  const { trades: truncTrades } = runTrendFlip(truncDaily, truncM1, 'fx', {});

  const fullBefore = fullTrades.filter(t => t.entry_ts < cutoffEpoch - 30 * 86400); // margin so a trade's own 30d walk window doesn't get cut short by truncation and change its outcome
  const truncBefore = truncTrades.filter(t => t.entry_ts < cutoffEpoch - 30 * 86400);
  const sameCount = fullBefore.length === truncBefore.length;
  let sameSignals = true;
  for (let i = 0; i < Math.min(fullBefore.length, truncBefore.length); i++) {
    if (fullBefore[i].entry_ts !== truncBefore[i].entry_ts || fullBefore[i].side !== truncBefore[i].side) sameSignals = false;
  }
  console.log(`[4] no-lookahead — full pre-cutoff trades=${fullBefore.length}, truncated=${truncBefore.length}`);
  check('same trade count before the cutoff regardless of future data', sameCount);
  check('same entry timestamps/sides before the cutoff regardless of future data', sameSignals);
}

// [5] IS/OOS split partitions all filled trades exactly once.
{
  check('IS + OOS trade counts equal full trade count', upResult.is.trades + upResult.oos.trades === upResult.full.trades);
}

if (failed) { console.error('\nFAIL'); process.exit(1); }
console.log('\nAll trendFlipEngine checks passed (synthetic data — no edge claim, see LEGO_MODULES.md §1ae).');
