// One-off validation for the REWRITTEN countVoteAtlasCandidates/
// countFibAtlasCandidates (2026-09-25) -- reads precomputed votetrades.json
// (cheap R2 JSON, no M1 decode) instead of the old atlasWalk-based approach
// that caused a production outage AND produced a wrong count (45 vs 17
// ground truth for vote_atlas_v2 on 2026-09-24). Run via `railway ssh` as
// its own process, deliberately separate from server.js's event loop, for a
// first correctness check before wiring this into the live endpoint again.
import { countVoteAtlasCandidates } from '../js/voteAtlasDriftAudit.js';
import { countFibAtlasCandidates } from '../js/fibAtlasDriftAudit.js';

const VOTE_ATLAS_PAIRS = ["eurusd","gbpusd","usdjpy","audusd","usdchf","euraud","eurchf","audjpy","cadjpy","chfjpy","gold","nq","spx","dow","us2000","de30","uk100"];
const FIB_ATLAS_PAIRS = ["eurusd","gbpusd","usdjpy","audusd","nzdusd","usdcad","usdchf","eurgbp","euraud","gbpaud","audjpy","audnzd","audcad","cadjpy","nzdjpy","gold"];
const DATE = process.argv[2] || '2026-09-24';

console.log(`Ground truth (official backtest daily breakdown): 21 for 09-22, 19 for 09-23, 17 for 09-24`);
console.log(`\n=== vote_atlas_v2 candidates for ${DATE} (minMargin=3, maxConcurrent=3, ccyLossGate=true, maxDailyLossPct=1) ===`);
const t0 = Date.now();
const v2 = await countVoteAtlasCandidates(VOTE_ATLAS_PAIRS, DATE, { minMargin: 3, maxConcurrent: 3, ccyLossGate: true, maxDailyLossPct: 1 });
console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(2)}s`);
console.log(`TOTAL: ${v2.total}`);
console.log('By pair:', JSON.stringify(v2.byPair));

console.log(`\n=== fib_atlas candidates for ${DATE} (live defaults: minMargin=2, maxConcurrent=4, gapFilterOn) ===`);
const t1 = Date.now();
const fa = await countFibAtlasCandidates(FIB_ATLAS_PAIRS, DATE, { maxConcurrent: 4, gapFilterOn: { asia: true, monday: true } });
console.log(`Done in ${((Date.now() - t1) / 1000).toFixed(2)}s`);
console.log(`TOTAL: ${fa.total}`);
console.log('By pair:', JSON.stringify(fa.byPair));
