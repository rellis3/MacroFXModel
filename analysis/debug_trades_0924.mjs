// Print the exact kept trade list for 2026-09-24 under "Load best config"
// params, so it can be diffed row-by-row against the real page's own trade
// log rather than compared by total count alone.
import { applyConcurrencyCap, applyCurrencyLossGate } from '../js/levelAtlasVoteReview.js';
import { pickFresher, loadLocalVoteTrades, PREFIX } from '../js/levelAtlasRoutes.js';
import { getJSON } from '../js/r2Store.js';

const PAIRS = ["eurusd","gbpusd","usdjpy","audusd","usdchf","euraud","eurchf","audjpy","cadjpy","chfjpy","gold","nq","spx","dow","us2000","de30","uk100"];
const DATE = '2026-09-24';

const perPairKept = {};
let generatedAtSample = null;
for (const pair of PAIRS) {
  const stored = pickFresher(await getJSON(`${PREFIX}/${pair}-votetrades.json`), loadLocalVoteTrades(pair));
  if (!stored) { console.log(pair, 'MISSING'); continue; }
  if (!generatedAtSample) generatedAtSample = { pair, generatedAt: stored.generatedAt, schema: stored.schema, totalTrades: stored.trades.length };
  const filtered = stored.trades.filter(t => t.margin >= 3);
  const capped = applyConcurrencyCap(filtered, { maxConcurrent: 3, perDirection: false });
  perPairKept[pair] = (capped?.kept ?? []).map(t => ({ ...t, pair: pair.toUpperCase() }));
}
console.log('data freshness sample:', JSON.stringify(generatedAtSample));

const merged = Object.values(perPairKept).flat();
const gated = applyCurrencyLossGate(merged, { maxDailyLossPct: 1 });

const day = gated.kept.filter(t => t.date === DATE).sort((a, b) => a.time - b.time);
console.log(`\n${day.length} trades on ${DATE}:`);
for (const t of day) {
  console.log(`${t.pair}\t${t.side}\t${t.rung}\t${t.session}\tentry=${t.entry}\tmargin=${t.margin}\tdecision=${t.decision}\twin=${t.win}\ttime=${t.time}`);
}
