// Thread 2 cross-check: does the FOLLOW vs FADE MFE/giveback asymmetry found
// on Thread 1 (vote_atlas_mfe_giveback_analysis.mjs) show up in the naive,
// unfiltered base-rate population too? -- 2026-09-12
//
// Thread 1's trades are vote-selected (margin>=3) -- if the asymmetry is a
// property of the barrier-race mechanics themselves (follow bets on a
// continuation that either happens fast or doesn't; fade bets on a rejection
// that tolerates more back-and-forth), it should appear here too, on the
// SAME rungs with NO vote filtering at all (p50=follow/p75=fade, every
// touch, no margin gate). If it disappears or inverts, the vote's own
// selection is responsible for creating/amplifying it, not the mechanics.
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { splitAt } from '../js/levelAtlasReport.js';
import { priceBarrierTrade, reorientExcursion, applyConcurrencyCap } from '../js/levelAtlasVoteReview.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { boundPacked, LOOKBACK_DAYS } from '../js/levelAtlasRoutes.js';

const REARM = 0.3;
const RULE = { p50: 'follow', p75: 'fade' };
const MFE_BUCKETS = [
  { lo: 0, hi: 0.25, label: '0-0.25R' },
  { lo: 0.25, hi: 0.5, label: '0.25-0.5R' },
  { lo: 0.5, hi: 0.75, label: '0.5-0.75R' },
  { lo: 0.75, hi: 1.0, label: '0.75-1.0R' },
  { lo: 1.0, hi: 1.5, label: '1.0-1.5R' },
  { lo: 1.5, hi: 2.0, label: '1.5-2.0R' },
  { lo: 2.0, hi: Infinity, label: '2.0R+' },
];

const PAIRS = process.env.LA_PAIRS ? process.env.LA_PAIRS.split(',') : ['eurusd', 'gbpusd', 'usdjpy', 'audusd',
  'usdchf', 'euraud', 'eurchf', 'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

const allTrades = [];
for (const pair of PAIRS) {
  console.log(`${pair.toUpperCase()}: loading M1...`);
  const packed0 = await loadM1ForPair(pair);
  const packed = boundPacked(packed0, LOOKBACK_DAYS);
  const assetClass = assetClassFor(pair);
  const cost = costForPair(pair, assetClass);
  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [REARM], pendingRearmFrac: REARM });
  const atRearm = touches.filter(t => t.rearmFrac === REARM);
  const { split } = splitAt(atRearm);
  const oosBlock = atRearm.filter(t => t.date >= split);

  const rows = [];
  for (const t of oosBlock) {
    const decision = RULE[t.rung];
    if (!decision) continue; // p90, skipped, same as everywhere else
    const priced = priceBarrierTrade(t, decision, cost);
    if (!priced || !(priced.stopPips > 0)) continue;
    const { mfePips } = reorientExcursion(t, decision);
    const riskUnitPct = priced.stopPips * t.pip / t.open * 100;
    const finalR = riskUnitPct > 0 ? priced.pnlPct / riskUnitPct : null;
    const mfeR = mfePips / priced.stopPips;
    if (finalR == null) continue;
    rows.push({ instrument: pair.toUpperCase(), date: t.date, decision, win: priced.win, mfeR, finalR, giveback: mfeR - finalR, targetR: priced.targetPips / priced.stopPips });
  }
  const capped = applyConcurrencyCap(rows, { maxConcurrent: 1 }).kept ?? rows;
  allTrades.push(...capped);
  console.log(`  ${capped.length} trades`);
}

console.log(`\nTotal: ${allTrades.length} trades\n`);

function bucketRow(bucket, trades) {
  const inBucket = trades.filter(t => t.mfeR >= bucket.lo && t.mfeR < bucket.hi);
  if (!inBucket.length) return `${bucket.label.padEnd(12)}${'0'.padStart(7)}   [empty]`;
  const n = inBucket.length;
  const winRate = inBucket.filter(t => t.win).length / n * 100;
  const avgFinalR = inBucket.reduce((a, t) => a + t.finalR, 0) / n;
  const avgGiveback = inBucket.reduce((a, t) => a + t.giveback, 0) / n;
  return `${bucket.label.padEnd(12)}${String(n).padStart(7)}${winRate.toFixed(1).padStart(10)}%${avgFinalR.toFixed(3).padStart(12)}${avgGiveback.toFixed(3).padStart(14)}`;
}

console.log('='.repeat(72));
console.log('THREAD 2 (naive, unfiltered, no vote/margin) -- MFE STATE -> OUTCOME');
console.log('='.repeat(72));
console.log('MFE bucket'.padEnd(12), 'n'.padStart(7), 'win%'.padStart(11), 'avgFinalR'.padStart(12), 'avgGiveback'.padStart(14));
for (const b of MFE_BUCKETS) console.log(bucketRow(b, allTrades));

for (const decision of ['follow', 'fade']) {
  const sub = allTrades.filter(t => t.decision === decision);
  console.log(`\n--- ${decision.toUpperCase()} only (n=${sub.length}, typical targetR ~${(sub.reduce((a, t) => a + t.targetR, 0) / sub.length).toFixed(2)}) ---`);
  for (const b of MFE_BUCKETS) console.log(bucketRow(b, sub));
}

console.log('\n--- per pair: win% at MFE<0.25R (follow vs fade) ---');
for (const pair of PAIRS) {
  const P = pair.toUpperCase();
  const follow = allTrades.filter(t => t.instrument === P && t.decision === 'follow' && t.mfeR < 0.25);
  const fade = allTrades.filter(t => t.instrument === P && t.decision === 'fade' && t.mfeR < 0.25);
  const winPct = arr => arr.length ? (arr.filter(t => t.win).length / arr.length * 100).toFixed(1) : 'n/a';
  console.log(`  ${P.padEnd(8)} follow(n=${follow.length}): ${winPct(follow)}%   fade(n=${fade.length}): ${winPct(fade)}%`);
}
