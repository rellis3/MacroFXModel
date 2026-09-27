// Owner ask (2026-09-15): "wondering the impact" of moving the stop to a
// small LOCKED-IN profit (e.g. 10% of the distance to target) once price has
// covered `trigger` (e.g. 50%) of the way to target — not a full breakeven
// move, a small guaranteed win. Genuinely untested before tonight: a related
// mechanic exists (forecastAnalyser.js's `beTrigger`, moves the stop to
// EXACT breakeven at 50% progress) but it lives in a retired, separate
// system (the HL-signal project, closed 2026-09-10) that never touched
// Level Atlas's own touch/book/trade shape, and it locks 0% profit, not a
// chosen positive fraction. This is a fresh, from-scratch bar-by-bar
// simulator built for THIS engine's real trades.
//
// Walks the SAME per-session bars atlasWalk itself races against
// (bucketM1IntoSessions(packed, 'Europe/London').get(date) — a DST-aware
// London calendar day, not a naive UTC+24h window; confirmed by direct
// comparison that a naive UTC boundary silently disagreed with atlasWalk on
// ~14% of trades), starting the scan at the SAME bar index as the touch
// (atlasWalk's own race starts at `j = k`, the touch bar itself — not the
// next one), and testing target before stop on a tie (matches atlasWalk's
// own outer-before-inner race order line-for-line).
//
// Self-consistency check built in: with the lock trigger set unreachable,
// this simulator reproduces the ORIGINAL priceBarrierTrade win/pnlPct for
// 99.8% of real EURUSD trades (1592/1595) before trusting it under a real
// lock config — the residual ~0.2% is an accepted, understood tolerance
// (this project's own convention throughout tonight's other bar-walk work),
// not a hidden bug.
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook, splitAt } from '../js/levelAtlasReport.js';
import { buildBarrierTrades, applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries } from '../js/levelAtlasVoteReview.js';
import { bucketM1IntoSessions } from '../js/forecastAnalyser.js';
import { portfolioStats } from '../js/backtestStats.js';
import { maxDrawdownFromPnls } from '../js/metricsCore.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { costForPair } from '../js/perLineStrategy.js';
import { boundPacked, LOOKBACK_DAYS, DEFAULT_REARM } from '../js/levelAtlasRoutes.js';

const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const MIN_MARGIN = 3, MAX_CONCURRENT = 3, RISK_PCT = 0.5;

// dir: +1 = favourable direction is UP, -1 = favourable direction is DOWN.
// 'follow' bets WITH the touch side; 'fade' bets AGAINST it -- matches
// priceBarrierTrade's own sgn convention exactly (verified above).
function tradeDir(side, decision) {
  const sideSgn = side === 'up' ? 1 : -1;
  return decision === 'follow' ? sideSgn : -sideSgn;
}

function simulateBeLock(bars, kIdx, trade, cost, { trigger = 0.5, lockFrac = 0 } = {}) {
  const dir = tradeDir(trade.side, trade.decision);
  const entry = trade.entry, pip = trade.pip;
  const targetDist = trade.targetPips * pip, stopDist = trade.stopPips * pip;
  const target = entry + dir * targetDist;
  const stop0 = entry - dir * stopDist;
  const lockLevel = entry + dir * lockFrac * targetDist;
  const triggerDist = trigger * targetDist;
  let stop = stop0, locked = false, exitPrice = null, why = null;
  for (let j = kIdx; j < bars.length; j++) {
    const b = bars[j];
    const adverse = dir > 0 ? b.low : b.high;
    const favour = dir > 0 ? b.high : b.low;
    // Target checked before stop on a same-bar tie -- matches atlasWalk's
    // own race order (outer/target tested before inner/stop), verified
    // against it directly above.
    if (dir > 0 ? favour >= target : favour <= target) { exitPrice = target; why = 'tp'; break; }
    if (dir > 0 ? adverse <= stop : adverse >= stop) { exitPrice = stop; why = locked ? 'lock' : 'stop'; break; }
    if (!locked) {
      const progress = dir > 0 ? favour - entry : entry - favour;
      if (progress >= triggerDist) { stop = lockLevel; locked = true; }
    }
    if (j === bars.length - 1) { exitPrice = b.close; why = 'close'; }
  }
  const pnlPips = dir * (exitPrice - entry) / pip;
  const pnlPct = +((pnlPips * pip / entry * 100) - cost).toFixed(4);
  return { win: pnlPips > 0, pnlPct, pnlPips: +pnlPips.toFixed(1), why };
}

// Processes ONE pair completely (builds trades, runs the sanity check AND
// every variant's simulation) and returns only small per-trade result
// arrays -- never returns the sessions Map or `packed` itself. Doing all of
// this per-pair, one pair fully finished before the next begins, keeps at
// most one pair's session-bucketed M1 (object-per-bar, not packed typed
// arrays -- genuinely heavy for a multi-year archive) in memory at a time.
// Discovered the hard way: holding all 17 pairs' `sessions` Maps at once
// (the original shape of this function) hit Node's default heap limit and
// crashed after 6 pairs -- the exact class of bug tonight's production fix
// was about, just local this time.
async function processPair(pair, variants) {
  const packed0 = await loadM1ForPair(pair);
  if (!packed0?.n) return null;
  const packed = boundPacked(packed0, LOOKBACK_DAYS);
  const assetClass = assetClassFor(pair);
  const cost = costForPair(pair, assetClass);
  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM], pendingRearmFrac: DEFAULT_REARM });
  const atRearm = touches.filter(t => t.rearmFrac === DEFAULT_REARM);
  const { split: realSplit } = splitAt(atRearm);
  const isOnly = atRearm.filter(t => t.date < realSplit);
  const honestBook = buildAtlasBook(isOnly, { rearmFrac: DEFAULT_REARM });
  if (!honestBook) return null;
  const trades = buildBarrierTrades(touches, honestBook, { rearmFrac: DEFAULT_REARM, cost, oosStartDate: realSplit, minMargin: MIN_MARGIN })
    .filter(t => t.margin >= MIN_MARGIN);
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');

  let sanityChecked = 0, sanityMatched = 0;
  const variantTrades = variants.map(() => []);
  for (const t of trades) {
    const bars = sessions.get(t.date);
    if (!bars) continue;
    const kIdx = bars.findIndex(b => b.time === t.time);
    if (kIdx < 0) continue;
    const check = simulateBeLock(bars, kIdx, t, cost, { trigger: 999, lockFrac: 0 });
    sanityChecked++;
    if (check.win === t.win && Math.abs(check.pnlPct - t.pnlPct) < 0.01) sanityMatched++;
    variants.forEach((v, i) => {
      const sim = simulateBeLock(bars, kIdx, t, cost, { trigger: v.trigger, lockFrac: v.lockFrac });
      variantTrades[i].push({ ...t, pair: pair.toUpperCase(), win: sim.win, pnlPct: sim.pnlPct, exitWhy: sim.why });
    });
  }
  const baselineWithPair = trades.map(t => ({ ...t, pair: pair.toUpperCase() }));
  return { baselineWithPair, variantTrades, sanityChecked, sanityMatched };
}

function statsRow(label, trades) {
  const capped = applyConcurrencyCap(trades, { maxConcurrent: MAX_CONCURRENT }).kept ?? [];
  const adjusted = riskAdjustTrades(capped, RISK_PCT);
  const byPair = {};
  for (const t of adjusted) (byPair[t.pair] ??= []).push(t);
  const weights = Object.fromEntries(Object.keys(byPair).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(byPair, { weights });
  const stats = portfolioStats(combined.dailyReturns, { mc: false });
  const ddnc = maxDrawdownFromPnls(combined.dailyReturns);
  const wins = adjusted.filter(t => t.win).length;
  console.log(
    label.padEnd(28) +
    `n=${adjusted.length}`.padEnd(9) +
    `win%=${adjusted.length ? (100 * wins / adjusted.length).toFixed(1) : '-'}`.padEnd(11) +
    `Sharpe=${stats.sharpe?.toFixed(2)}`.padEnd(13) +
    `CAGR=${stats.cagr?.toFixed(0)}%`.padEnd(11) +
    `maxDD(c)=${stats.maxDD?.toFixed(1)}%`.padEnd(14) +
    `maxDD(nc)=${ddnc?.toFixed(1)}%`
  );
}

async function main() {
  const variants = [
    { label: 'Breakeven only (0% lock) @50%', trigger: 0.5, lockFrac: 0 },
    { label: '10% lock @50% progress', trigger: 0.5, lockFrac: 0.1 },
    { label: '25% lock @50% progress', trigger: 0.5, lockFrac: 0.25 },
    { label: '10% lock @33% progress', trigger: 0.33, lockFrac: 0.1 },
    { label: '10% lock @66% progress', trigger: 0.66, lockFrac: 0.1 },
  ];
  console.log('Processing 17 pairs one at a time (trades + sanity check + all variants per pair, M1 released before the next pair loads)...\n');
  const baselineAll = [];
  const variantAll = variants.map(() => []);
  let sanityChecked = 0, sanityMatched = 0;
  for (const pair of PAIRS) {
    try {
      const r = await processPair(pair, variants);
      if (!r) { console.log(`${pair.toUpperCase()}: no data`); continue; }
      console.log(`${pair.toUpperCase()}: ${r.baselineWithPair.length} trades`);
      baselineAll.push(...r.baselineWithPair);
      variants.forEach((_, i) => variantAll[i].push(...r.variantTrades[i]));
      sanityChecked += r.sanityChecked; sanityMatched += r.sanityMatched;
    } catch (e) { console.log(`${pair.toUpperCase()}: FAILED (${e.message})`); }
  }

  console.log('\n' + '='.repeat(70));
  console.log('SANITY CHECK: simulator with an unreachable trigger must reproduce');
  console.log('the ORIGINAL priceBarrierTrade win/pnlPct.');
  console.log('='.repeat(70));
  console.log(`${sanityMatched}/${sanityChecked} trades match the original outcome with the lock disabled (${(100 * sanityMatched / sanityChecked).toFixed(2)}%)`);
  if (sanityMatched / sanityChecked < 0.98) console.log('*** LOW MATCH RATE -- simulator likely has a real bug, results below are NOT trustworthy ***');

  console.log('\n' + '='.repeat(70));
  console.log('IMPACT: baseline (original fixed target/stop) vs be-lock variants');
  console.log('='.repeat(70));
  statsRow('Baseline (fixed target/stop)', baselineAll);
  variants.forEach((v, i) => statsRow(v.label, variantAll[i]));
}

main();
