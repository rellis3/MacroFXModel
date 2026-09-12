// MFE state / giveback analysis — 2026-09-11
//
// Every SL/TP redesign tried today (fade-stop tightening, chandelier/ride,
// empirical MFE/MAE target/stop) treated the exit as a decision fixed at
// entry. This is the cheap first pass on the alternative: does a trade's
// OWN favourable excursion, once reached, carry information about the
// eventual outcome? Pure description -- no fitting, no new mechanism,
// reuses fields already computed on every Thread 1 trade (buildBarrierTrades'
// own mfePips/maePips, via reorientExcursion). No further discovery/held-out
// split needed for the same reason vote_atlas_confluence_with_base_rate.mjs
// and vote_atlas_fib_confluence_crossref.mjs didn't need one -- nothing here
// is fit on outcome data.
//
// Caveat, stated plainly: mfePips/maePips are the FINAL PEAK excursion
// reached before the trade resolved (however many bars that took), not a
// bar-by-bar running series. This answers "given how far this trade's best
// moment got, what fraction became full winners and how much was given
// back by the end" -- not yet "at bar N with the trade still open, what
// happens next." That needs a real path reconstruction (bucketM1IntoSessions
// + a bar walk, like the exit-variant scripts), a bigger build than this one.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook, splitAt } from '../js/levelAtlasReport.js';
import { buildBarrierTrades, applyConcurrencyCap } from '../js/levelAtlasVoteReview.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { boundPacked, LOOKBACK_DAYS, DEFAULT_REARM } from '../js/levelAtlasRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');
const MIN_MARGIN = 3;
const MAX_CONCURRENT = 3;
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
  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM], pendingRearmFrac: DEFAULT_REARM });
  const atRearm = touches.filter(t => t.rearmFrac === DEFAULT_REARM);
  const { split: realSplit } = splitAt(atRearm);
  const isOnly = atRearm.filter(t => t.date < realSplit);
  const honestBook = buildAtlasBook(isOnly, { rearmFrac: DEFAULT_REARM });
  const trades = buildBarrierTrades(touches, honestBook, { rearmFrac: DEFAULT_REARM, cost, oosStartDate: realSplit })
    .filter(t => t.margin >= MIN_MARGIN);
  const capped = applyConcurrencyCap(trades, { maxConcurrent: MAX_CONCURRENT }).kept ?? [];

  for (const t of capped) {
    if (!(t.stopPips > 0) || t.mfePips == null) continue;
    const riskUnitPct = t.stopPips * t.pip / t.entry * 100;
    const finalR = riskUnitPct > 0 ? t.pnlPct / riskUnitPct : null;
    const mfeR = t.mfePips / t.stopPips;
    if (finalR == null) continue;
    allTrades.push({ instrument: pair.toUpperCase(), date: t.date, decision: t.decision, win: t.win, timedOut: t.timedOut, mfeR, finalR, giveback: mfeR - finalR, targetR: t.targetPips / t.stopPips });
  }
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
  const sortedGiveback = [...inBucket].sort((a, b) => a.giveback - b.giveback);
  const medGiveback = sortedGiveback[Math.floor(n / 2)].giveback;
  return `${bucket.label.padEnd(12)}${String(n).padStart(7)}${winRate.toFixed(1).padStart(10)}%${avgFinalR.toFixed(3).padStart(12)}${avgGiveback.toFixed(3).padStart(14)}${medGiveback.toFixed(3).padStart(12)}`;
}

console.log('='.repeat(80));
console.log('MFE STATE -> EVENTUAL OUTCOME (pooled, all decisions)');
console.log('='.repeat(80));
console.log('MFE bucket'.padEnd(12), 'n'.padStart(7), 'win%'.padStart(11), 'avgFinalR'.padStart(12), 'avgGiveback'.padStart(14), 'medGiveback'.padStart(12));
for (const b of MFE_BUCKETS) console.log(bucketRow(b, allTrades));

for (const decision of ['follow', 'fade']) {
  const sub = allTrades.filter(t => t.decision === decision);
  console.log(`\n--- ${decision.toUpperCase()} only (n=${sub.length}, typical targetR ~${(sub.reduce((a, t) => a + t.targetR, 0) / sub.length).toFixed(2)}) ---`);
  for (const b of MFE_BUCKETS) console.log(bucketRow(b, sub));
}

// Per-pair consistency check on the single most informative bucket contrast:
// does a trade that reached >=1.0R MFE have a meaningfully higher eventual
// win-rate than one that only reached 0-0.25R? If this doesn't hold pair by
// pair, pooled numbers could be a cross-pair artifact.
console.log('\n--- per pair: win% at MFE<0.25R vs MFE>=1.0R ---');
for (const pair of PAIRS) {
  const P = pair.toUpperCase();
  const sub = allTrades.filter(t => t.instrument === P);
  const low = sub.filter(t => t.mfeR < 0.25);
  const high = sub.filter(t => t.mfeR >= 1.0);
  const winPct = arr => arr.length ? (arr.filter(t => t.win).length / arr.length * 100).toFixed(1) : 'n/a';
  console.log(`  ${P.padEnd(8)} n=${sub.length.toString().padStart(5)}  low(n=${low.length}): ${winPct(low)}%   high(n=${high.length}): ${winPct(high)}%`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'vote_atlas_mfe_giveback_analysis.json'), JSON.stringify({
  totalTrades: allTrades.length,
  buckets: MFE_BUCKETS.map(b => ({ label: b.label, ...(() => {
    const inB = allTrades.filter(t => t.mfeR >= b.lo && t.mfeR < b.hi);
    return { n: inB.length, winRate: inB.length ? inB.filter(t => t.win).length / inB.length : null,
      avgFinalR: inB.length ? inB.reduce((a, t) => a + t.finalR, 0) / inB.length : null,
      avgGiveback: inB.length ? inB.reduce((a, t) => a + t.giveback, 0) / inB.length : null };
  })() })),
}, null, 1));
console.log(`\nWrote ${OUT_DIR}/vote_atlas_mfe_giveback_analysis.json`);
