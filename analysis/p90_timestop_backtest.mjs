// p90 Time-Stop Backtest -- validates the ONE rule shape the regime study
// (analysis/p90_regime_study.mjs) actually supported: no price target, no
// stop-loss, just FADE every p90 touch that happens in Asia/London on a
// heavy-vol-regime day, and exit on a pure time-stop N minutes later,
// mark-to-market at whatever price is there. This is explicitly NOT the
// "next line" methodology p90_fade_study.mjs / p90_empirical_outer_backtest.mjs
// used (both abandoned) -- there is no target/stop here at all, by request.
//
// N is FIT on IS only (grid search maximizing IS Sharpe), then FROZEN and
// applied unchanged to OOS -- same discipline every other script this
// session uses. The filter itself (Asia/London + heavy dayVol) is NOT
// re-fit here; it's taken as given from the regime study's own findings
// (session and dayVol were the two dimensions that showed a real, monotonic
// effect on same-session reversion rate) to avoid re-discovering it on the
// same data the filter was chosen from.
//
// Needs one thing the regime study's cached JSON doesn't have: the actual
// forward price N minutes after each touch (mark-to-market for a time-stop
// has no relationship to fadePips/runPips, which track running EXTREMES, not
// the price at a fixed later time) -- so this re-walks atlasWalk per pair
// (same cost as the regime study) and additionally binary-searches the
// packed M1 series for the price at touch_time + N minutes, per candidate N.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook } from '../js/levelAtlasReport.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { applyConcurrencyCap, buildPortfolioDailySeries } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { costForPair } from '../js/perLineStrategy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output', 'p90_timestop_backtest.json');

const REARM_FRAC = 0.3, MAX_CONCURRENT = 1;
const N_GRID_MIN = [15, 30, 45, 60, 90, 120, 150, 180, 240];   // candidate time-stops, minutes
const MAX_GAP_TOLERANCE_SEC = 4 * 3600;   // reject an exit bar found more than 4h past the intended N -- a weekend/holiday gap, not a real N-minute hold
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

function bsearchGE(times, target) {
  let lo = 0, hi = times.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] >= target) { ans = mid; hi = mid - 1; } else lo = mid + 1;
  }
  return ans;
}

async function main() {
  // perPairByN[N] -> { pair -> [trades] }
  const perPairByN = {};
  for (const N of N_GRID_MIN) perPairByN[N] = {};
  const isDates = {}, splitDates = {};

  for (const pair of PAIRS) {
    console.log(`Loading M1 + walking ${pair}...`);
    let packed;
    try { packed = await loadM1ForPair(pair); } catch (e) { console.log(`  M1 load failed: ${e.message}`); continue; }
    if (!packed || !packed.n) { console.log(`  no M1, skipping`); continue; }
    const assetClass = assetClassFor(pair);
    const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [REARM_FRAC], pendingRearmFrac: REARM_FRAC });
    if (!touches.length) { console.log(`  no touches, skipping`); continue; }
    const book = buildAtlasBook(touches, { rearmFrac: REARM_FRAC });
    if (!book) { console.log(`  no book, skipping`); continue; }
    splitDates[pair.toUpperCase()] = book.splitDate;

    const p90 = touches.filter(t => t.rung === 'p90' && t.rearmFrac === REARM_FRAC
      && (t.session === 'Asia' || t.session === 'London') && t.dayVol === '3·heavy');
    if (!p90.length) { console.log(`  0 filtered p90 touches, skipping`); continue; }

    const cost = costForPair(pair, assetClass);
    const times = packed.times;

    for (const N of N_GRID_MIN) {
      const trades = [];
      for (const t of p90) {
        const targetTime = t.time + N * 60;
        const idx = bsearchGE(times, targetTime);
        if (idx < 0) continue;                                    // ran off the end of loaded data
        const exitTime = times[idx];
        if (exitTime - t.time > N * 60 + MAX_GAP_TOLERANCE_SEC) continue;   // weekend/holiday gap, not a real N-min hold
        const exitPx = packed.closes[idx];
        const isUp = t.side === 'up';
        // FADE only (the only direction the regime study's own numbers
        // supported in this cell): sell an up-touch, buy a down-touch.
        const pnlPct = +(((isUp ? (t.level - exitPx) : (exitPx - t.level)) / t.level * 100) - cost).toFixed(4);
        trades.push({
          pair: pair.toUpperCase(), date: t.date, entryTime: t.time, resolveTime: exitTime,
          side: t.side, entry: t.level, exit: exitPx, pnlPct, win: pnlPct > 0,
        });
      }
      if (trades.length) perPairByN[N][pair.toUpperCase()] = trades;
    }
    console.log(`  ${pair}: ${p90.length} filtered touches, cost=${cost}%`);
  }

  // IS/OOS split per trade using that PAIR's own book.splitDate (matches
  // every other script's per-pair split convention).
  function isTrade(t) { return t.date < splitDates[t.pair] || splitDates[t.pair] == null; }
  function splitFor(pairTrades) {
    const is = {}, oos = {};
    for (const [pair, trades] of Object.entries(pairTrades)) {
      is[pair] = trades.filter(isTrade);
      oos[pair] = trades.filter(t => !isTrade(t));
    }
    return { is, oos };
  }
  // No riskAdjustTrades here -- that function R-multiples pnlPct against a
  // STOP distance (t.stopPips), which a pure time-stop trade doesn't have by
  // construction (no stop-loss at all). Using it on a stop-less trade
  // silently zeroed every pnlPct (undefined*pip=NaN -> r=0) -- caught after
  // the first run came back with an exact-zero Sharpe/meanPnl on every N,
  // which was the tell. Trades are combined on their RAW price-move %
  // instead, equal-weighted per pair (buildPortfolioDailySeries's default).
  function portfolioOf(pairTrades) {
    const cappedByPair = {};
    let nTrades = 0;
    for (const [pair, trades] of Object.entries(pairTrades)) {
      if (!trades.length) continue;
      const capped = applyConcurrencyCap(trades, { maxConcurrent: MAX_CONCURRENT });
      const kept = capped?.kept ?? [];
      nTrades += kept.length;
      cappedByPair[pair] = kept.map(x => ({ ...x, pair }));
    }
    if (!nTrades) return null;
    const weights = Object.fromEntries(Object.keys(cappedByPair).map(p => [p, 1]));
    const combined = buildPortfolioDailySeries(cappedByPair, { weights });
    if (!combined || !combined.dailyReturns.length) return null;
    const ps = portfolioStats(combined.dailyReturns, { mc: false });
    const all = Object.values(cappedByPair).flat();
    const winRate = all.length ? +(all.filter(t => t.win).length / all.length * 100).toFixed(1) : null;
    const meanPnlPct = all.length ? +(all.reduce((s, t) => s + t.pnlPct, 0) / all.length).toFixed(4) : null;
    return { nTrades, winRate, meanPnlPct, sharpe: ps.sharpe, maxDD: ps.maxDD, cagr: ps.cagr, annVol: ps.annVol, tradingDays: combined.dailyReturns.length };
  }

  console.log(`\n==== FIT: grid search N on IS only ====`);
  const gridResults = [];
  for (const N of N_GRID_MIN) {
    const { is } = splitFor(perPairByN[N]);
    const res = portfolioOf(is);
    console.log(`  N=${String(N).padStart(3)}min  ${res ? `trades=${res.nTrades}  winRate=${res.winRate}%  sharpe=${res.sharpe}  meanPnl=${res.meanPnlPct}%` : 'no combinable series'}`);
    gridResults.push({ N, is: res });
  }
  const best = gridResults.filter(g => g.is && g.is.nTrades >= 30).sort((a, b) => (b.is.sharpe ?? -99) - (a.is.sharpe ?? -99))[0];
  if (!best) { console.log('\nNo N cleared a usable IS sample. Stopping.'); return; }
  console.log(`\nBest IS N = ${best.N} minutes (Sharpe ${best.is.sharpe}) -- FREEZING this and applying to OOS, unseen.`);

  const { is, oos } = splitFor(perPairByN[best.N]);
  const isRes = portfolioOf(is), oosRes = portfolioOf(oos);
  console.log(`\n==== FROZEN N=${best.N}min -- IS ====`);
  console.log(JSON.stringify(isRes, null, 2));
  console.log(`\n==== FROZEN N=${best.N}min -- OOS (never touched during fit) ====`);
  console.log(JSON.stringify(oosRes, null, 2));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ grid: gridResults, bestN: best.N, is: isRes, oos: oosRes }, null, 2));
  console.log(`\nWrote full results to ${OUT}`);
}

main();
