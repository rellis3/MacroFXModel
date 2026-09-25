/**
 * Fib Atlas fade-direction bug — impact measurement (2026-09-26).
 *
 * Confirmed 2026-09-25/26: both live zone pricers (js/asiaFibAtlasZonePricer.js,
 * js/mondayFibAtlasZonePricer.js) set a trade's direction purely from
 * `rung.side` ('above' -> long, 'below' -> short), never from the vote's
 * fade/follow decision. The backtest's own priceBarrierTrade (a fade wins
 * when price reverts to the INNER rung) assumes fade is the OPPOSITE
 * direction from follow at the same side. So every live 'fade' trade is
 * really a trade in the follow direction, but priced with fade's swapped
 * target/stop magnitudes (inner-distance as target, outer-distance*0.9 as
 * stop) applied on the wrong side of entry — a trade shape the backtest
 * never simulated at all.
 *
 * This script does NOT change the backtest's honest scoring (priceBarrierTrade
 * stays exactly as-is — it already correctly validates what a REAL fade
 * should do). Instead it adds a SECOND, parallel pricer that reproduces what
 * the live bug actually pays out, by re-racing the real M1 bars against the
 * buggy (side-only-sign) barrier prices instead of the true inner/outer rung
 * prices. Comparing the two shows the P&L cost of the bug directly, before
 * touching the live bot.
 */
const REPO = 'C:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel';
const { loadM1ForPair } = await import(`file:///${REPO}/js/volBacktestM1Engine.js`);
const { asiaFibAtlasWalk } = await import(`file:///${REPO}/js/asiaFibAtlasEngine.js`);
const { mondayFibAtlasWalk } = await import(`file:///${REPO}/js/mondayFibAtlasEngine.js`);
const { buildAsiaFibAtlasBook } = await import(`file:///${REPO}/js/asiaFibAtlasReport.js`);
const { voteDecision, priceBarrierTrade } = await import(`file:///${REPO}/js/asiaFibAtlasVoteReview.js`);
const { assetClassFor } = await import(`file:///${REPO}/js/forecastAnalyserStore.js`);
const { costForPair } = await import(`file:///${REPO}/js/perLineStrategy.js`);
const { summarizeTrades } = await import(`file:///${REPO}/js/metricsCore.js`);

// Real live fib_atlas_bot_config enabled_pairs, fetched 2026-09-26 -- the
// actual pair universe this bug is live on, not an arbitrary sample.
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];
const LADDERS = ['asia', 'monday'];
const REARM = 0.3;
const MIN_MARGIN = 2;              // FIB_ATLAS_MIN_MARGIN -- the frozen live/best-config value
const STOP_TIGHTEN_FRAC = 0.9;     // FIB_ATLAS_STOP_TIGHTEN_FRAC, mirrored from the zone pricers

function bisectLeft(arr, n, x) {
  let lo = 0, hi = n;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < x) lo = mid + 1; else hi = mid; }
  return lo;
}

// Reproduces exactly what the live zone pricer + engine.py's zone_is_long
// actually pay out for a 'fade' decision: same direction as 'follow' at this
// side (sgn from side alone), but fade's target/stop magnitudes (inner as
// target, outer*stopTightenFrac as stop) applied on that side. 'follow' is
// untouched -- the bug never reaches it (its own sgn convention already
// matches the honest pricer). Needs the real M1 bars to re-race against
// these different barrier PRICES (not the same inner/outer rung prices
// asiaFibAtlasWalk/mondayFibAtlasWalk already raced).
function priceBarrierTradeLiveBug(touch, decision, cost, packed) {
  if (decision !== 'fade') return priceBarrierTrade(touch, decision, cost);
  const isAbove = touch.side === 'above';
  const sgn = isAbove ? 1 : -1;
  const pip = touch.pip;
  const targetPips = touch.innerDistPips;
  const stopPips = touch.outerDistPips != null ? +(touch.outerDistPips * STOP_TIGHTEN_FRAC).toFixed(1) : null;
  if (targetPips == null || stopPips == null) return null;
  const tpPrice = touch.price + sgn * targetPips * pip;
  const slPrice = touch.price - sgn * stopPips * pip;
  const reachFwd = (px) => isAbove ? px >= tpPrice : px <= tpPrice;
  const reachBwd = (px) => isAbove ? px <= slPrice : px >= slPrice;

  const { n, times, highs, lows } = packed;
  const endTime = touch.sessionCloseTime ?? times[n - 1];
  let idx = bisectLeft(times, n, touch.time);
  let win = null;
  for (; idx < n && times[idx] <= endTime; idx++) {
    const hi = highs[idx], lo = lows[idx];
    const fwd = isAbove ? hi : lo, bwd = isAbove ? lo : hi;
    // Same "forward barrier checked first on a same-bar tie" convention
    // asiaFibAtlasEngine.js's own race loop uses for out-vs-back.
    if (reachFwd(fwd)) { win = true; break; }
    if (reachBwd(bwd)) { win = false; break; }
  }
  const denom = touch.price;
  if (win == null) {
    // Never reached either buggy barrier by session close -- mark to market,
    // same treatment priceBarrierTrade gives a real 'neither', just relative
    // to the buggy (forward/follow-direction) side instead of the honest one.
    if (touch.sessionClose == null) return null;
    const runAtClose = (touch.sessionClose - touch.price) / pip * sgn;
    const pnlPips = runAtClose;   // buggy-fade behaves like a follow bet directionally
    win = pnlPips > 0;
    const pnlPct = +((pnlPips * pip / denom * 100) - cost).toFixed(4);
    return { win, pnlPips: +pnlPips.toFixed(1), pnlPct, targetPips, stopPips, timedOut: true };
  }
  const pnlPips = win ? targetPips : -stopPips;
  const pnlPct = +((pnlPips * pip / denom * 100) - cost).toFixed(4);
  return { win, pnlPips: +pnlPips.toFixed(1), pnlPct, targetPips, stopPips };
}

function poolDailyMaxDD(trades) {
  const byDate = new Map();
  for (const t of trades) byDate.set(t.date, (byDate.get(t.date) ?? 0) + t.pnlPct);
  const dates = [...byDate.keys()].sort();
  let equity = 0, peak = 0, maxDD = 0;
  for (const d of dates) {
    equity += byDate.get(d);
    if (equity > peak) peak = equity;
    maxDD = Math.min(maxDD, equity - peak);
  }
  return { maxDD: +maxDD.toFixed(2), finalPct: +equity.toFixed(2), tradingDays: dates.length };
}

const honestAll = [], buggyAll = [];
const honestFade = [], buggyFade = [];
let processed = 0, skippedNoBook = 0;

for (const pair of PAIRS) {
  let packed;
  try { packed = await loadM1ForPair(pair); } catch (e) { console.warn(`${pair}: load failed - ${e.message}`); continue; }
  if (!packed?.n) { console.warn(`${pair}: no M1 data`); continue; }
  const assetClass = assetClassFor(pair);
  const cost = costForPair(pair, assetClass);

  for (const ladder of LADDERS) {
    const walkFn = ladder === 'asia' ? asiaFibAtlasWalk : mondayFibAtlasWalk;
    let touches;
    try {
      ({ touches } = walkFn(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [REARM], pendingRearmFrac: REARM }));
    } catch (e) { console.warn(`${pair}/${ladder}: walk failed - ${e.message}`); continue; }
    const atRearm = touches.filter(t => t.rearmFrac === REARM);
    const book = buildAsiaFibAtlasBook(atRearm, { rearmFrac: REARM });
    if (!book) { skippedNoBook++; continue; }
    const oos = atRearm.filter(t => t.date >= book.splitDate);

    for (const t of oos) {
      const vd = voteDecision(book, t);
      if (!vd || vd.margin < MIN_MARGIN) continue;
      const honest = priceBarrierTrade(t, vd.decision, cost);
      if (!honest) continue;
      const buggy = priceBarrierTradeLiveBug(t, vd.decision, cost, packed);
      if (!buggy) continue;
      processed++;
      const row = { pair, ladder, date: t.date, decision: vd.decision };
      honestAll.push({ ...row, pnlPct: honest.pnlPct });
      buggyAll.push({ ...row, pnlPct: buggy.pnlPct });
      if (vd.decision === 'fade') {
        honestFade.push({ ...row, pnlPct: honest.pnlPct });
        buggyFade.push({ ...row, pnlPct: buggy.pnlPct });
      }
    }
    console.log(`${pair}/${ladder}: OOS touches ${oos.length}, split ${book.splitDate}`);
  }
}

console.log(`\nprocessed ${processed} traded touches, ${skippedNoBook} pair/ladder combos skipped (no book)`);
console.log(`fade share: ${honestFade.length}/${processed} = ${(honestFade.length / processed * 100).toFixed(1)}%`);

function report(label, honest, buggy) {
  console.log(`\n=== ${label} (n=${honest.length}) ===`);
  const hS = summarizeTrades(honest.map(t => t.pnlPct), honest.map(t => t.date));
  const bS = summarizeTrades(buggy.map(t => t.pnlPct), buggy.map(t => t.date));
  const hDD = poolDailyMaxDD(honest), bDD = poolDailyMaxDD(buggy);
  console.log('HONEST (backtest, as validated) :', JSON.stringify({ ...hS, poolMaxDD: hDD.maxDD, poolFinalPct: hDD.finalPct }));
  console.log('LIVE-BUG (what actually pays)   :', JSON.stringify({ ...bS, poolMaxDD: bDD.maxDD, poolFinalPct: bDD.finalPct }));
}

report('FADE TRADES ONLY (isolates the bug)', honestFade, buggyFade);
report('FULL PORTFOLIO (fade+follow combined, as actually traded)', honestAll, buggyAll);
process.exit(0);
