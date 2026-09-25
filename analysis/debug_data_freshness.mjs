// Check every pair's votetrades.json freshness/consistency, and whether two
// consecutive fresh reads give the same result -- to determine if the
// 39-vs-17 gap is a data pipeline consistency issue (some pairs stale,
// others fresh, or genuinely unstable) rather than a code/params bug
// (already ruled out via a byte-for-byte route reproduction).
import { pickFresher, loadLocalVoteTrades, PREFIX } from '../js/levelAtlasRoutes.js';
import { getJSON } from '../js/r2Store.js';

const PAIRS = ["eurusd","gbpusd","usdjpy","audusd","usdchf","euraud","eurchf","audjpy","cadjpy","chfjpy","gold","nq","spx","dow","us2000","de30","uk100"];

for (const pair of PAIRS) {
  const stored = pickFresher(await getJSON(`${PREFIX}/${pair}-votetrades.json`), loadLocalVoteTrades(pair));
  if (!stored) { console.log(pair, 'MISSING'); continue; }
  const count0924 = stored.trades.filter(t => t.date === '2026-09-24' && t.margin >= 3).length;
  console.log(`${pair}\tgeneratedAt=${stored.generatedAt}\tschema=${stored.schema}\ttotalTrades=${stored.trades.length}\t0924count(margin>=3, pre-cap)=${count0924}`);
}
