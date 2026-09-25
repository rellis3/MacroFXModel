// Byte-for-byte reproduction of js/levelAtlasRoutes.js's own
// /api/level-atlas/vote-portfolio trade-building block (lines ~918-1001),
// including earlyExit's repricing merge, which the simplified
// countVoteAtlasCandidates skips. Purpose: determine whether the 39-vs-17
// gap for 2026-09-24 is a bug in the simplified reimplementation, or
// something present in the real route too.
import { applyConcurrencyCap, applyCurrencyLossGate, applyFadeStopTightening, priceAtTighterStop, buildPortfolioDailySeries } from '../js/levelAtlasVoteReview.js';
import { pickFresher, loadLocalVoteTrades, loadLocalP90VoteTrades, PREFIX } from '../js/levelAtlasRoutes.js';
import { getJSON } from '../js/r2Store.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VOTE_TRADES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'analysis', 'output', 'level-atlas-vote-trades');
function loadLocalEarlyExitVoteTrades(pair) {
  try { return JSON.parse(fs.readFileSync(path.join(VOTE_TRADES_DIR, `${pair}-earlyexit-votetrades.json`), 'utf8')); } catch { return null; }
}

const pairs = ["eurusd","gbpusd","usdjpy","audusd","usdchf","euraud","eurchf","audjpy","cadjpy","chfjpy","gold","nq","spx","dow","us2000","de30","uk100"];
const minMargin = 3, maxConcurrent = 3, perDirection = false;
const earlyExit = true, fadeStopTighten = false, includeP90 = false;
const ccyLossGate = true, maxDailyLossPct = 1;

const perPairTradesRaw = {};
for (const pair of pairs) {
  const stored = pickFresher(await getJSON(`${PREFIX}/${pair}-votetrades.json`), loadLocalVoteTrades(pair));
  if (!stored) { console.log(pair, 'MISSING'); continue; }
  let filtered = stored.trades.filter(t => t.margin >= minMargin);

  if (earlyExit) {
    const eeStored = pickFresher(await getJSON(`${PREFIX}/${pair}-earlyexit-votetrades.json`), loadLocalEarlyExitVoteTrades(pair));
    if (eeStored?.trades?.length) {
      const byTime = new Map(eeStored.trades.map(t => [t.time, t]));
      filtered = filtered.map(t => byTime.get(t.time) ?? t);
    }
  }
  if (fadeStopTighten) {
    const tightened = applyFadeStopTightening(filtered, { cost: stored.cost });
    filtered = tightened.trades;
  }
  if (includeP90) {
    const p90Stored = pickFresher(await getJSON(`${PREFIX}/${pair}-p90votetrades.json`), loadLocalP90VoteTrades(pair));
    if (p90Stored?.trades?.length) filtered = filtered.concat(p90Stored.trades);
  }

  const capped = applyConcurrencyCap(filtered, { maxConcurrent, perDirection });
  perPairTradesRaw[stored.instrument] = capped?.kept ?? [];
}

// riskAdjustTrades/sizing doesn't change count -- skipped, same reasoning as before.
const withPair = {};
for (const [sym, list] of Object.entries(perPairTradesRaw)) withPair[sym] = list.map(t => ({ ...t, pair: sym }));

let finalTrades = Object.values(withPair).flat();
if (ccyLossGate) {
  const gated = applyCurrencyLossGate(finalTrades, { maxDailyLossPct });
  console.log('ccy gate: kept', gated.kept.length, 'skipped', gated.skippedCount, 'of', gated.totalCount);
  finalTrades = gated.kept;
}

const day = finalTrades.filter(t => t.date === '2026-09-24').sort((a, b) => a.time - b.time);
console.log(`\n${day.length} trades on 2026-09-24 (faithful route reproduction):`);
for (const t of day) console.log(`${t.pair}\t${t.side}\t${t.rung}\t${t.session}\tmargin=${t.margin}\tdecision=${t.decision}\twin=${t.win}\ttime=${t.time}`);

// Sanity cross-check against the page's own printed "1133 portfolio trading
// days" -- if this doesn't match, the date RANGE/population differs, not
// just this one day's filtering.
const byPairFinal = {};
for (const t of finalTrades) (byPairFinal[t.pair] ??= []).push(t);
const combined = buildPortfolioDailySeries(byPairFinal);
console.log(`\nTotal portfolio trading days: ${combined?.dates?.length ?? 'N/A'} (page shows 1133)`);
console.log(`Total kept trades (all dates, all pairs): ${finalTrades.length}`);
console.log(`Date range: ${combined?.dates?.[0]} to ${combined?.dates?.at(-1)}`);
