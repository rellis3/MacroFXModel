// Verify the riskAdjustTrades fix reproduces the real route's 17-trade
// answer for 2026-09-24, matching the direct curl A/B test against
// production (throttle irrelevant, confirmed; ccyLossGate real, confirmed;
// riskAdjustTrades before the gate is the missing piece, confirmed by
// skippedCount: real route 3279, this file's old code ~1127-1190).
import { countVoteAtlasCandidates } from '../js/voteAtlasDriftAudit.js';

const PAIRS = ["eurusd","gbpusd","usdjpy","audusd","usdchf","euraud","eurchf","audjpy","cadjpy","chfjpy","gold","nq","spx","dow","us2000","de30","uk100"];
const DATE = process.argv[2] || '2026-09-24';

console.log('Ground truth from direct curl against production: 17 trades for 2026-09-24 (ccyLossGate=true, riskPct=0.5)');
const result = await countVoteAtlasCandidates(PAIRS, DATE, { minMargin: 3, maxConcurrent: 3, ccyLossGate: true, maxDailyLossPct: 1, riskPct: 0.5 });
console.log('TOTAL:', result.total);
console.log('By pair:', JSON.stringify(result.byPair));
