// Empirical target/stop redesign — 2026-09-11
//
// Everything tried on exits so far (fade-stop tightening, chandelier/ride
// trail) kept the LADDER'S OWN rung distances as the anchor and only changed
// how a trade exits relative to them. The R:R geometry study found the real
// problem sits upstream of that: the ladder gives this rule a structural
// ~0.82 target:stop ratio by construction. This throws the ladder rungs away
// entirely for TARGET/STOP PLACEMENT and instead asks: what does this trade's
// OWN real price path (mfePips/maePips -- the actual favourable/adverse
// excursion Thread 1's trades already carry) say a good target and stop
// distance would have been? IS-fit per pair per decision (fade/follow have
// different excursion shapes and different pip scales -- must not pool
// across pairs, same discipline levelAtlasRoutes.js's fadeStopTighten
// comment already established), frozen, applied unchanged to a real held-out
// slice via the SAME bar-level walk (simulateExitVariants, 'fixed' rule --
// already validated, order-respecting) everything else here reuses.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook, splitAt } from '../js/levelAtlasReport.js';
import { buildBarrierTrades, applyConcurrencyCap, buildPortfolioDailySeries } from '../js/levelAtlasVoteReview.js';
import { simulateExitVariants, bucketM1IntoSessions } from '../js/forecastAnalyser.js';
import { portfolioStats } from '../js/backtestStats.js';
import { summarizeTrades } from '../js/metricsCore.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { boundPacked, LOOKBACK_DAYS, DEFAULT_REARM } from '../js/levelAtlasRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');
const MIN_MARGIN = 3;
const MAX_CONCURRENT = 3;
const TARGET_PCTILES = [40, 50, 60];
const STOP_PCTILES = [50, 70, 90];
const MIN_CANDIDATE_N = 40;

const PAIRS = process.env.LA_PAIRS ? process.env.LA_PAIRS.split(',') : ['eurusd', 'gbpusd', 'usdjpy', 'audusd',
  'usdchf', 'euraud', 'eurchf', 'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

function pctile(arr, p) {
  const s = arr.filter(x => x != null && x > 0).sort((a, b) => a - b);
  if (!s.length) return null;
  return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))];
}

// Re-price ONE trade against arbitrary target/stop pip distances, via a real
// bar-level walk -- unlike priceAtTighterStop (summary-excursion only, can
// only ever TIGHTEN), this can propose a WIDER or narrower target/stop than
// the trade originally had, because it re-derives the outcome from the real
// path in order, not from a single pre-computed peak value.
function repriceTrade(t, targetPips, stopPips, sessions, cost) {
  const bars = sessions.get(t.date);
  if (!bars?.length) return null;
  const touchIdx = bars.findIndex(b => b.time === t.time);
  if (touchIdx < 0) return null;
  const isUp = t.side === 'up';
  const innerDistPips = t.decision === 'fade' ? targetPips : stopPips;
  const outerDistPips = t.decision === 'fade' ? stopPips : targetPips;
  const sgn = isUp ? 1 : -1;
  const inner = t.entry - sgn * innerDistPips * t.pip;
  const outer = t.entry + sgn * outerDistPips * t.pip;
  const ex = simulateExitVariants(bars, touchIdx, { touchLvl: t.entry, inner, outer, isUp, open: bars[0].open });
  const raw = t.decision === 'fade' ? ex.exFadeFixed : ex.exFollowFixed;
  if (raw == null) return null;
  const pnlPct = +(raw - cost).toFixed(4);
  return { pnlPct, win: pnlPct > 0, date: t.date };
}

const perPairBaseline = {}, perPairNew = {};
const summary = [];

for (const pair of PAIRS) {
  console.log(`${pair.toUpperCase()}: loading M1...`);
  const packed0 = await loadM1ForPair(pair);
  const packed = boundPacked(packed0, LOOKBACK_DAYS);
  const assetClass = assetClassFor(pair);
  const cost = costForPair(pair, assetClass);
  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM], pendingRearmFrac: DEFAULT_REARM });
  const atRearm = touches.filter(t => t.rearmFrac === DEFAULT_REARM);
  const { split: realSplit } = splitAt(atRearm);
  const isOnly = atRearm.filter(t => t.date < realSplit);
  const honestBook = buildAtlasBook(isOnly, { rearmFrac: DEFAULT_REARM });
  const trades = buildBarrierTrades(touches, honestBook, { rearmFrac: DEFAULT_REARM, cost, oosStartDate: realSplit })
    .filter(t => t.margin >= MIN_MARGIN);
  const capped = (applyConcurrencyCap(trades, { maxConcurrent: MAX_CONCURRENT }).kept ?? []).sort((a, b) => a.time - b.time);
  console.log(`  ${capped.length} trades (post cap)`);
  if (capped.length < 100) { summary.push({ pair: pair.toUpperCase(), note: 'too few trades' }); continue; }

  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const splitIdx = Math.floor(capped.length * 0.7);
  const discovery = capped.slice(0, splitIdx);
  const heldOut = capped.slice(splitIdx);

  const P = pair.toUpperCase();
  perPairBaseline[P] = heldOut.map(t => ({ pnlPct: t.pnlPct, date: t.date, pair: P }));

  const newHeldOut = [];
  for (const decision of ['fade', 'follow']) {
    const discDec = discovery.filter(t => t.decision === decision);
    const heldDec = heldOut.filter(t => t.decision === decision);
    if (discDec.length < MIN_CANDIDATE_N || heldDec.length < MIN_CANDIDATE_N) {
      // Fall back to the original (fixed-rung) trade for this decision -- not enough data to redesign safely.
      newHeldOut.push(...heldDec.map(t => ({ pnlPct: t.pnlPct, date: t.date, pair: P })));
      continue;
    }
    const mfes = discDec.map(t => t.mfePips);
    const maes = discDec.map(t => t.maePips);
    let best = null;
    for (const tp of TARGET_PCTILES) {
      const targetPips = pctile(mfes, tp);
      if (!targetPips) continue;
      for (const sp of STOP_PCTILES) {
        const stopPips = pctile(maes, sp);
        if (!stopPips) continue;
        const priced = discDec.map(t => repriceTrade(t, targetPips, stopPips, sessions, cost)).filter(Boolean);
        if (priced.length < MIN_CANDIDATE_N) continue;
        const s = summarizeTrades(priced.map(p => p.pnlPct), priced.map(p => p.date));
        if (!best || (s.sharpe ?? -Infinity) > best.sharpe) best = { tp, sp, targetPips, stopPips, sharpe: s.sharpe, n: priced.length };
      }
    }
    if (!best) { newHeldOut.push(...heldDec.map(t => ({ pnlPct: t.pnlPct, date: t.date, pair: P }))); continue; }
    const heldPriced = heldDec.map(t => repriceTrade(t, best.targetPips, best.stopPips, sessions, cost)).filter(Boolean);
    newHeldOut.push(...heldPriced.map(p => ({ pnlPct: p.pnlPct, date: p.date, pair: P })));
    summary.push({ pair: P, decision, discSharpe: best.sharpe, targetPips: best.targetPips, stopPips: best.stopPips, targetPctile: best.tp, stopPctile: best.sp, nDisc: best.n, nHeld: heldPriced.length });
  }
  perPairNew[P] = newHeldOut;
}

console.log('\n--- IS-fit candidates chosen per pair/decision ---');
for (const s of summary) {
  if (s.note) { console.log(`  ${s.pair}: ${s.note}`); continue; }
  console.log(`  ${s.pair} ${s.decision.padEnd(7)} target=${s.targetPips}(p${s.targetPctile}) stop=${s.stopPips}(p${s.stopPctile}) discSharpe=${s.discSharpe?.toFixed(2)} n=${s.nDisc}/${s.nHeld}`);
}

function combinedStats(perPairTrades) {
  const weights = Object.fromEntries(Object.keys(perPairTrades).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(perPairTrades, { weights });
  return portfolioStats(combined.dailyReturns, { mc: false, targetVol: 10 });
}

const baselineStats = combinedStats(perPairBaseline);
const newStats = combinedStats(perPairNew);
console.log('\n' + '='.repeat(80));
console.log('HELD-OUT COMPARISON (same trades, same time window, same portfolio pipeline)');
console.log('='.repeat(80));
console.log(`BASELINE (ladder rung target/stop): Sharpe ${baselineStats.sharpe?.toFixed(2)}  CAGR ${baselineStats.cagr?.toFixed(1)}%  maxDD ${baselineStats.maxDD?.toFixed(1)}%`);
console.log(`NEW (empirical MFE/MAE target/stop): Sharpe ${newStats.sharpe?.toFixed(2)}  CAGR ${newStats.cagr?.toFixed(1)}%  maxDD ${newStats.maxDD?.toFixed(1)}%`);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'vote_atlas_empirical_exit_redesign.json'), JSON.stringify({ summary, baselineStats, newStats }, null, 1));
console.log(`\nWrote ${OUT_DIR}/vote_atlas_empirical_exit_redesign.json`);
