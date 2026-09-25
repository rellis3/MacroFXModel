// One-off, isolated validation for countVoteAtlasCandidates -- run via
// `railway ssh` as its own process, deliberately NOT through the live
// server.js/_computeDailyReconciliation path, after that path caused a
// production outage on 2026-09-25 (CPU-bound decode + non-cancelling
// timeout + concurrency starved every other live bot's KV/R2 reads).
// This script shares the box's CPU/network but not server.js's event loop,
// connection pool, or in-memory caches -- a much smaller blast radius for a
// first correctness check against known ground truth.
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { countVoteAtlasCandidates } from '../js/voteAtlasDriftAudit.js';

const VOTE_ATLAS_PAIRS = ["eurusd","gbpusd","usdjpy","audusd","usdchf","euraud","eurchf","audjpy","cadjpy","chfjpy","gold","nq","spx","dow","us2000","de30","uk100"];
const DATE = process.argv[2] || '2026-09-24';

console.log(`Testing countVoteAtlasCandidates for vote_atlas_v2 on ${DATE} (minMargin=3, ${VOTE_ATLAS_PAIRS.length} pairs)`);
console.log('Ground truth (official backtest daily breakdown): 21 for 09-22, 19 for 09-23, 17 for 09-24');
const t0 = Date.now();
const result = await countVoteAtlasCandidates(VOTE_ATLAS_PAIRS, DATE, loadM1ForPair, { minMargin: 3 });
console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`TOTAL CANDIDATES: ${result.total}`);
console.log('By pair:', JSON.stringify(result.byPair, null, 2));
