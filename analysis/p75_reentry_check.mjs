// Follow-up to p75_continuation_check.mjs: does the EXISTING system actually
// catch a fresh, margin-qualifying entry at p75 right after a p50 follow
// trade wins (the moment price crosses p75, which is definitionally also a
// p75 touch event, IF p75 is armed) -- or is something causing it to miss
// these? No new mechanism needed if the system already can do this; this
// just checks whether it does.
//
// For every winning p50 FOLLOW trade (margin>=3), look for a p75 touch on
// the same side/date within a few minutes of the p50 trade's resolveTime
// (that's the exact moment price crossed p75) and classify what happens:
//   - no matching p75 touch at all -> p75 wasn't armed (structural gap,
//     e.g. already touched earlier that day and not yet re-armed)
//   - touch exists but voteDecision returns null -> no dimension held for
//     that cell (thin sample, same class of gap p90 has, just less severe)
//   - touch exists, vote fires, margin < 3 -> genuine signal too weak
//   - touch exists, vote fires margin>=3 favoring FADE -> system correctly
//     would NOT take a fresh follow entry there (matches the p75 continuation
//     check's own finding that retracement is the more common outcome)
//   - touch exists, vote fires margin>=3 favoring FOLLOW -> a real, capturable
//     opportunity the CURRENT system can already take with a normal new
//     entry, no rolling-stop rebuild required
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook } from '../js/levelAtlasReport.js';
import { voteDecision } from '../js/levelAtlasVoteReview.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';

const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const MIN_MARGIN = 3;
const MATCH_WINDOW_SEC = 300; // 5 min -- generous given M1 granularity

const totals = { noTouch: 0, noVote: 0, belowMargin: 0, votedFade: 0, votedFollow: 0 };
let totalWins = 0;

for (const pair of PAIRS) {
  console.log(`Loading M1 + walking ladder for ${pair}...`);
  const packed = await loadM1ForPair(pair);
  if (!packed) { console.log(`  no M1 for ${pair}, skipping`); continue; }
  const assetClass = assetClassFor(pair);
  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [0.3], pendingRearmFrac: 0.3 });
  const book = buildAtlasBook(touches, { rearmFrac: 0.3 });
  if (!book) { console.log(`  no book for ${pair}, skipping`); continue; }

  const p50OOS = touches.filter(t => t.rung === 'p50' && t.rearmFrac === 0.3 && t.date >= book.splitDate);
  const p75OOS = touches.filter(t => t.rung === 'p75' && t.rearmFrac === 0.3 && t.date >= book.splitDate);

  const p50Wins = [];
  for (const t of p50OOS) {
    const vd = voteDecision(book, t);
    if (!vd || vd.margin < MIN_MARGIN) continue;
    if (vd.decision === 'follow' && t.outcome === 'out') p50Wins.push(t);
  }

  const counts = { noTouch: 0, noVote: 0, belowMargin: 0, votedFade: 0, votedFollow: 0 };
  for (const w of p50Wins) {
    const candidates = p75OOS.filter(p => p.side === w.side && p.date === w.date && Math.abs(p.time - w.resolveTime) <= MATCH_WINDOW_SEC);
    if (!candidates.length) { counts.noTouch++; continue; }
    // Closest match by time, in case of multiple candidates.
    const match = candidates.reduce((a, b) => Math.abs(b.time - w.resolveTime) < Math.abs(a.time - w.resolveTime) ? b : a);
    const vd = voteDecision(book, match);
    if (!vd) { counts.noVote++; continue; }
    if (vd.margin < MIN_MARGIN) { counts.belowMargin++; continue; }
    if (vd.decision === 'follow') counts.votedFollow++; else counts.votedFade++;
  }

  const n = p50Wins.length;
  console.log(`  ${pair}: ${n} p50-follow wins  ->  noTouch=${counts.noTouch} (${(counts.noTouch / n * 100).toFixed(0)}%)  noVote=${counts.noVote} (${(counts.noVote / n * 100).toFixed(0)}%)  belowMargin=${counts.belowMargin} (${(counts.belowMargin / n * 100).toFixed(0)}%)  votedFade=${counts.votedFade} (${(counts.votedFade / n * 100).toFixed(0)}%)  votedFollow=${counts.votedFollow} (${(counts.votedFollow / n * 100).toFixed(0)}%)`);

  totalWins += n;
  for (const k of Object.keys(totals)) totals[k] += counts[k];
}

console.log(`\n──── TOTAL across ${PAIRS.length} pairs, p50-follow wins (n=${totalWins}) ────`);
for (const [k, v] of Object.entries(totals)) console.log(`${k}: ${v} (${(v / totalWins * 100).toFixed(1)}%)`);
