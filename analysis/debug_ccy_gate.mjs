// Diagnostic: does applyCurrencyLossGate actually skip anything now that
// pair casing is fixed? Run via `railway ssh`, isolated process.
import { applyConcurrencyCap, applyCurrencyLossGate } from '../js/levelAtlasVoteReview.js';
import { pickFresher, loadLocalVoteTrades, PREFIX } from '../js/levelAtlasRoutes.js';
import { getJSON } from '../js/r2Store.js';

const PAIRS = ["eurusd","gbpusd","usdjpy","audusd","usdchf","euraud","eurchf","audjpy","cadjpy","chfjpy","gold","nq","spx","dow","us2000","de30","uk100"];
const perPairKept = {};
for (const pair of PAIRS) {
  const stored = pickFresher(await getJSON(`${PREFIX}/${pair}-votetrades.json`), loadLocalVoteTrades(pair));
  if (!stored) continue;
  const filtered = stored.trades.filter(t => t.margin >= 3);
  const capped = applyConcurrencyCap(filtered, { maxConcurrent: 3, perDirection: false });
  perPairKept[pair] = (capped?.kept ?? []).map(t => ({ ...t, pair: pair.toUpperCase() }));
}
const merged = Object.values(perPairKept).flat();
console.log('merged (margin+concurrency, all dates):', merged.length);
const gated = applyCurrencyLossGate(merged, { maxDailyLossPct: 1 });
console.log('after ccy gate: kept', gated.kept.length, 'skipped', gated.skippedCount, 'total', gated.totalCount);

const merged0924 = merged.filter(t => t.date === '2026-09-24');
console.log('\n2026-09-24 BEFORE ccy gate:', merged0924.length);
const kept0924 = gated.kept.filter(t => t.date === '2026-09-24');
console.log('2026-09-24 AFTER ccy gate:', kept0924.length);
console.log('sample kept trade:', JSON.stringify(gated.kept[0]));
