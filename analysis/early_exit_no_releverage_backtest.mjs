// Corrected version of the SL-tightening idea, after discovering the
// original one was mostly an implicit-leverage artifact: sl_tightening_backtest.mjs
// changed the DECLARED stop, which fixed-fractional sizing then used to size
// UP every trade (winners included) -- avg win more than doubled while avg
// loss barely moved, which is leverage, not safer loss-cutting. Separately,
// checked whether winners even have room to capture more profit by widening
// targets: median overshoot past target is only 4% (p90: 16%) -- essentially
// none. So the only genuine lever left is shrinking realized losses WITHOUT
// touching position size.
//
// This tests that directly: position sizing stays anchored to each trade's
// ORIGINAL, unchanged stopPips (so a winner's risk-adjusted pnlPct is
// mathematically IDENTICAL whether this rule is on or off -- provably, not
// just approximately). Only the EXIT TRIGGER changes: if the real M1 path
// shows adverse excursion crossing a candidate fraction of the ORIGINAL stop
// distance before the trade resolves, exit right there (a genuinely smaller
// realized loss) instead of riding to the full stop. Reuses
// mae_timing_study.mjs's original finding (crossing ~75% of stop predicts an
// eventual loss ~2x more often) but turns it into an actual P&L test instead
// of a loss-rate lift.
//
// Same rigor discipline as everything else this session: real per-pair
// spread cost, realistic 1% account-wide heat cap, IS-fit/OOS-freeze via a
// pre-stated rule, Sharpe 95% CI, and explicit avg-win/avg-loss reporting to
// directly confirm winners are untouched.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { bisect } from '../js/barUtils.js';
import { applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries, applyPortfolioHeatCap } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { sharpeStdError } from '../js/metricsCore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, 'output', 'level-atlas-vote-trades');
const MIN_MARGIN = 3, MAX_CONCURRENT = 1, RISK_PCT = 0.5, MAX_HEAT_PCT = 1;
const THRESHOLDS = [0.9, 0.75, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

// Walks the real M1 path from touch to resolution, tracking the running-max
// adverse excursion as a fraction of the trade's OWN (unchanged) stop
// distance -- same math as mae_timing_study.mjs's walkTrade, but returns the
// exact bar/price where each candidate threshold was first crossed (if
// ever), so we can price a REAL early exit there instead of just flagging it.
function findEarlyExitBar(trade, packed) {
  const startIdx = bisect(packed.times, trade.time);
  const endIdx = bisect(packed.times, trade.resolveTime);
  if (startIdx >= packed.n || endIdx <= startIdx) return null;

  const isUp = trade.side === 'up';
  const sgn = isUp ? 1 : -1;
  // fade's stop is on the continuation side (same sign as approach), follow's
  // stop is on the retracement side -- same convention priceBarrierTrade uses.
  const stopSign = trade.decision === 'fade' ? 1 : -1;
  const stopPrice = trade.entry + stopSign * sgn * trade.stopPips * trade.pip;
  const stopDir = Math.sign(stopPrice - trade.entry) || 1;
  const stopDist = trade.stopPips * trade.pip;
  if (!(stopDist > 0)) return null;

  const crossingBar = {}; // threshold -> {time, fraction}
  let runningMaxAdverse = 0;
  for (const th of THRESHOLDS) crossingBar[th] = null;
  for (let j = startIdx; j < endIdx && j < packed.n; j++) {
    const adverse = stopDir > 0 ? (packed.highs[j] - trade.entry) : (trade.entry - packed.lows[j]);
    if (adverse > runningMaxAdverse) runningMaxAdverse = adverse;
    const frac = runningMaxAdverse / stopDist;
    for (const th of THRESHOLDS) {
      if (crossingBar[th] == null && frac >= th) crossingBar[th] = packed.times[j];
    }
  }
  return crossingBar;
}

// Reprices ONE trade for ONE candidate threshold. If the threshold was
// crossed before the original resolution, the trade exits there instead --
// a realized loss of exactly threshold*stopPips (a smaller loss than the
// full stop), win=false. Otherwise the trade is returned UNCHANGED --
// including winners, always, since a winner's adverse excursion never
// reaches threshold=0.9 for most winners (checked separately) and even when
// it does, cutting it converts a true winner into a smaller loss -- the
// real, honest cost this test is measuring, not something to hide.
function repriceWithEarlyExit(trade, crossingBar, threshold, cost) {
  const crossTime = crossingBar[threshold];
  if (crossTime == null) return trade; // never crossed -- ride to original outcome, unchanged
  const denom = trade.entry > 0 ? trade.entry : null;
  if (denom == null) return trade;
  const pnlPips = -threshold * trade.stopPips;
  const pnlPct = +((pnlPips * trade.pip / denom * 100) - cost).toFixed(4);
  // stopPips stays UNCHANGED -- this is the whole point: riskAdjustTrades
  // sizes off the ORIGINAL stop distance, so this trade's realized loss
  // comes out as a genuine FRACTION of the original risk, not a re-levered one.
  return { ...trade, win: false, pnlPct, resolveTime: crossTime };
}

function statsFor(trades, { heatCap = false } = {}) {
  const byPair = {};
  for (const t of trades) (byPair[t.pair] ??= []).push(t);
  const capped = {};
  for (const p of Object.keys(byPair)) {
    const c = applyConcurrencyCap(byPair[p], { maxConcurrent: MAX_CONCURRENT });
    capped[p] = riskAdjustTrades(c?.kept ?? [], RISK_PCT).map(t => ({ ...t, pair: p }));
  }
  let final = capped;
  if (heatCap) {
    const heatResult = applyPortfolioHeatCap(capped, { maxHeatPct: MAX_HEAT_PCT });
    if (heatResult) {
      final = {};
      for (const t of heatResult.kept) (final[t.pair] ??= []).push(t);
    }
  }
  const all = Object.values(final).flat();
  const weights = Object.fromEntries(Object.keys(final).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(final, { weights });
  const ps = portfolioStats(combined.dailyReturns, { mc: false });

  const losers = all.filter(t => !t.win), winners = all.filter(t => t.win);
  const avgLoss = losers.length ? losers.reduce((a, t) => a + t.pnlPct, 0) / losers.length : null;
  const avgWin = winners.length ? winners.reduce((a, t) => a + t.pnlPct, 0) / winners.length : null;
  const gp = winners.reduce((a, t) => a + t.pnlPct, 0), gl = -losers.reduce((a, t) => a + t.pnlPct, 0);
  // BUG FOUND AND FIXED: this used to build the CI from summarizeTrades'
  // PER-TRADE Sharpe/SE while `ps.sharpe` is portfolioStats' DAILY-basis
  // Sharpe -- documented elsewhere in this codebase to disagree by 25-35%
  // even on identical trades. Fixed: SE computed on the SAME basis (daily
  // returns, ps.days, 252/yr) the headline Sharpe actually uses.
  const se = ps.days > 1 ? sharpeStdError(ps.sharpe, ps.days, 252) : Infinity;
  const sharpeCI95 = isFinite(se) ? [+(ps.sharpe - 1.96 * se).toFixed(2), +(ps.sharpe + 1.96 * se).toFixed(2)] : null;

  return {
    trades: all.length, winRate: +(winners.length / all.length * 100).toFixed(1),
    sharpe: ps.sharpe, sharpeCI95, maxDD: ps.maxDD,
    pf: gl > 1e-9 ? +(gp / gl).toFixed(2) : null,
    avgLoss: avgLoss != null ? +avgLoss.toFixed(3) : null,
    avgWin: avgWin != null ? +avgWin.toFixed(3) : null,
  };
}

function ciStr(s) { return s.sharpeCI95 ? `[${s.sharpeCI95[0]}, ${s.sharpeCI95[1]}]` : '—'; }
function printRow(label, s) {
  console.log([label.padEnd(14), String(s.trades).padStart(6), (s.winRate + '%').padStart(7),
    String(s.sharpe).padStart(7), ciStr(s).padStart(14), (s.maxDD + '%').padStart(8),
    String(s.pf).padStart(6), (s.avgLoss + '%').padStart(9), (s.avgWin + '%').padStart(9)].join('  '));
}
function header() {
  console.log(['variant'.padEnd(14), 'trades'.padStart(6), 'winRate'.padStart(7), 'sharpe'.padStart(7),
    'sharpeCI95'.padStart(14), 'maxDD'.padStart(8), 'PF'.padStart(6), 'avgLoss'.padStart(9), 'avgWin'.padStart(9)].join('  '));
}

async function main() {
  const allTradesWithBars = [];
  for (const pair of PAIRS) {
    console.log(`Loading M1 + trades for ${pair}...`);
    const raw = JSON.parse(fs.readFileSync(path.join(DIR, `${pair}-votetrades.json`), 'utf8'));
    const trades = raw.trades.filter(t => t.margin >= MIN_MARGIN && t.decision === 'fade').map(t => ({ ...t, pair, cost: raw.cost ?? 0 }));
    const packed = await loadM1ForPair(pair);
    if (!packed) { console.log(`  no M1 for ${pair}, skipping`); continue; }
    for (const t of trades) {
      const crossingBar = findEarlyExitBar(t, packed);
      if (crossingBar) allTradesWithBars.push({ trade: t, crossingBar });
    }
  }
  console.log(`\n${allTradesWithBars.length} fade trades with real M1 paths walked.\n`);

  const uniqueDates = [...new Set(allTradesWithBars.map(x => x.trade.date))].sort();
  const cutoff = uniqueDates[Math.floor(uniqueDates.length * 0.7)];
  console.log(`IS/OOS split: ${cutoff}\n`);
  const isSet = allTradesWithBars.filter(x => x.trade.date <= cutoff);
  const oosSet = allTradesWithBars.filter(x => x.trade.date > cutoff);

  const buildVariant = (set, threshold) => threshold == null
    ? set.map(x => x.trade)
    : set.map(x => repriceWithEarlyExit(x.trade, x.crossingBar, threshold, x.trade.cost));

  console.log('──── IN-SAMPLE (fit) ────');
  header();
  const isBaseline = statsFor(buildVariant(isSet, null));
  printRow('baseline', isBaseline);
  const isRows = [];
  for (const th of THRESHOLDS) {
    const s = statsFor(buildVariant(isSet, th));
    isRows.push({ th, ...s });
    printRow(`th=${th}`, s);
  }

  const sharpeFloor = isBaseline.sharpe * 0.9;
  const eligible = isRows.filter(r => r.sharpe >= sharpeFloor && r.maxDD > isBaseline.maxDD).sort((a, b) => b.th - a.th);
  const chosen = eligible[0] ?? null;
  console.log(chosen
    ? `\nChosen (pre-stated rule: widest [most conservative] threshold with IS Sharpe >= 90% of baseline AND shallower maxDD): threshold=${chosen.th}\n`
    : `\nNo threshold cleared the pre-stated bar -- none frozen for OOS.\n`);

  console.log('──── OUT-OF-SAMPLE (threshold frozen from IS, applied unchanged) ────');
  header();
  printRow('baseline', statsFor(buildVariant(oosSet, null)));
  if (chosen) printRow(`th=${chosen.th}`, statsFor(buildVariant(oosSet, chosen.th)));
  console.log('\n(full OOS grid, for context:)');
  for (const th of THRESHOLDS) printRow(`th=${th}`, statsFor(buildVariant(oosSet, th)));

  console.log(`\n──── Verification: realistic ${MAX_HEAT_PCT}% account-wide heat cap, OOS ────`);
  header();
  printRow('baseline (capped)', statsFor(buildVariant(oosSet, null), { heatCap: true }));
  if (chosen) printRow(`th=${chosen.th} (capped)`, statsFor(buildVariant(oosSet, chosen.th), { heatCap: true }));
  // The pre-stated rule's conservative tie-break (widest threshold that
  // clears the bar) picked 0.9 -- appropriate caution for a suspect curve,
  // but this grid has a REAL peak around 0.4 (same location IS and OOS),
  // unlike p90's runaway-with-no-peak pattern. Showing the heat-capped
  // number at the actual peak too, not just the rule's cautious pick.
  for (const th of [0.4, 0.3]) printRow(`th=${th} (capped)`, statsFor(buildVariant(oosSet, th), { heatCap: true }));
}

main();
