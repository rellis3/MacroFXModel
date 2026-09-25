// Safe pre-flight: time a full 5-bot _computeDailyReconciliation-equivalent
// pass for one date using the new, cheap (no-M1) audit/candidate functions,
// before triggering it against the live HTTP endpoint. If this is fast
// (seconds, not minutes), it's safe to trigger via the real route.
import { countVoteAtlasCandidates, auditVoteAtlasDrift, normalizeTradeHistoryForVoteAtlasAudit } from '../js/voteAtlasDriftAudit.js';
import { countFibAtlasCandidates, auditFibAtlasDrift, normalizeTradeHistoryForFibAtlasAudit } from '../js/fibAtlasDriftAudit.js';

const VOTE_PAIRS = ["eurusd","gbpusd","usdjpy","audusd","usdchf","euraud","eurchf","audjpy","cadjpy","chfjpy","gold","nq","spx","dow","us2000","de30","uk100"];
const FIB_PAIRS = ["eurusd","gbpusd","usdjpy","audusd","nzdusd","usdcad","usdchf","eurgbp","euraud","gbpaud","audjpy","audnzd","audcad","cadjpy","nzdjpy","gold"];
const DATE = process.argv[2] || '2026-09-24';

const t0 = Date.now();
const v2 = await countVoteAtlasCandidates(VOTE_PAIRS, DATE, { minMargin: 3, maxConcurrent: 3, ccyLossGate: true, maxDailyLossPct: 1 });
console.log(`v2 candidates: ${v2.total} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

const t1 = Date.now();
const v3 = await countVoteAtlasCandidates(VOTE_PAIRS, DATE, { minMargin: 3, maxConcurrent: 3, ccyLossGate: false, maxDailyLossPct: 1 });
console.log(`v3 candidates: ${v3.total} (${((Date.now() - t1) / 1000).toFixed(1)}s)`);

const t2 = Date.now();
const fa = await countFibAtlasCandidates(FIB_PAIRS, DATE, { maxConcurrent: 4, gapFilterOn: { asia: true, monday: true } });
console.log(`fib_atlas candidates: ${fa.total} (${((Date.now() - t2) / 1000).toFixed(1)}s)`);

const t3 = Date.now();
const fa2 = await countFibAtlasCandidates(FIB_PAIRS, DATE, { maxConcurrent: 4, gapFilterOn: { asia: true, monday: true } });
console.log(`fib_atlas_v2 candidates: ${fa2.total} (${((Date.now() - t3) / 1000).toFixed(1)}s)`);

console.log(`\nTOTAL WALL TIME for 4 bots' candidate counts: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
