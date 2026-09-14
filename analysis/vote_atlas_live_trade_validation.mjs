// Validates EVERY real trade this bot has taken against an independently
// rebuilt decision — 2026-09-12.
//
// For each trade: reconstruct the exact touch from real M1 (atlasWalk, same
// as every other script tonight), build the book from ONLY touches dated
// STRICTLY BEFORE the trade's own date (the honest, as-of-that-day book --
// not today's book, which has data no live bot could have had on that day),
// then independently compute voteDecision + priceBarrierTrade and compare
// against what was ACTUALLY traded (direction, and margin>=3 gate).
//
// Trades before the look-ahead bug fixes (2026-09-09 23:01 dropped-touches,
// 2026-09-11 08:07 book-leak, 2026-09-11 12:07 10yr-bound) were decided
// using the OLD, buggy book -- a mismatch there is expected/attributable,
// not a new problem. Trades after all three should match, since they were
// decided by the same code this script now reuses.
import fs from 'fs';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook } from '../js/levelAtlasReport.js';
import { voteDecision, priceBarrierTrade, betDirection } from '../js/levelAtlasVoteReview.js';
import { mergeBarsIntoPacked } from '../js/m1GapFill.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { boundPacked, LOOKBACK_DAYS, DEFAULT_REARM } from '../js/levelAtlasRoutes.js';

const KEY_TO_PAIR = { rut: 'us2000', spx: 'spx', de40: 'de30', ftse: 'uk100', gold: 'gold', nq: 'nq', dow: 'dow' };
const FIX_CUTOFF = '2026-09-11'; // book-leak + 10yr-bound both landed on this date; treat trades dated before it as pre-fix
const PROD_BASE = 'https://macrofxmodel-production.up.railway.app';

const trades = JSON.parse(fs.readFileSync('C:/Users/relli/AppData/Local/Temp/parity_tradelog.json', 'utf8')).data;
const byPair = {};
for (const t of trades) {
  const pair = KEY_TO_PAIR[t.key] ?? t.key;
  (byPair[pair] ??= []).push(t);
}
const lastTradeDate = trades.reduce((a, t) => t.date > a ? t.date : a, '0000-00-00');

// Local R2 snapshot is a periodically, manually re-backfilled archive (found
// stale at 2026-08-20 while auditing this exact gap tonight) -- top it up
// from production's own candles route (js/m1GapFill.js's fetchM1Gap under the
// hood, fixed the same night to chunk+retry properly) so this validation
// runs on data that actually covers every trade being checked, not whatever
// happened to be in the last manual backfill.
async function fetchGapCandles(pair, fromDate, toDate) {
  const url = `${PROD_BASE}/api/vol-backtest/candles/${pair}?from=${fromDate}&to=${toDate}`;
  const r = await fetch(url);
  const j = await r.json();
  if (!j.ok) { console.warn(`  gap-fetch failed for ${pair}: ${j.error}`); return []; }
  return j.candles.map(c => ({ time: c.time + 'Z', open: c.open, high: c.high, low: c.low, close: c.close }));
}

const onlyPairs = process.env.LA_PAIRS ? new Set(process.env.LA_PAIRS.split(',')) : null;
const results = [];
for (const [pair, pairTrades] of Object.entries(byPair)) {
  if (onlyPairs && !onlyPairs.has(pair)) continue;
  console.log(`${pair.toUpperCase()}: loading M1, ${pairTrades.length} trades to check...`);
  let packed0 = await loadM1ForPair(pair);
  const lastLocalDate = new Date(packed0.times[packed0.n - 1] * 1000).toISOString().slice(0, 10);
  if (lastLocalDate < lastTradeDate) {
    console.log(`  local archive ends ${lastLocalDate}, trades go to ${lastTradeDate} -- fetching the gap from production...`);
    const gapBars = await fetchGapCandles(pair, lastLocalDate, lastTradeDate);
    console.log(`  fetched ${gapBars.length} gap-fill bars`);
    packed0 = mergeBarsIntoPacked(packed0, gapBars);
  }
  const packed = boundPacked(packed0, LOOKBACK_DAYS);
  const assetClass = assetClassFor(pair);
  const cost = costForPair(pair, assetClass);
  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM], pendingRearmFrac: DEFAULT_REARM });
  const atRearm = touches.filter(t => t.rearmFrac === DEFAULT_REARM);

  for (const trade of pairTrades) {
    const m = trade.zone_id.match(/^(up|down)(p50|p75|p90)_(\d+)$/);
    if (!m) { results.push({ ...trade, pair, note: `unparseable zone_id` }); continue; }
    const [, side, rung, instanceStr] = m;
    const instance = +instanceStr;
    const sameDay = atRearm.filter(t => t.date === trade.date && t.side === side && t.rung === rung)
      .sort((a, b) => a.time - b.time);
    const touch = sameDay[instance - 1];
    if (!touch) { results.push({ ...trade, pair, note: `no matching touch found (${sameDay.length} on that day)` }); continue; }

    const isOnly = atRearm.filter(t => t.date < trade.date);
    const book = buildAtlasBook(isOnly, { rearmFrac: DEFAULT_REARM });
    const vd = book ? voteDecision(book, touch) : null;
    const preFix = trade.date < FIX_CUTOFF;

    if (!vd || vd.margin < 3) {
      results.push({ ...trade, pair, side, rung, instance, preFix, note: vd ? `margin ${vd.margin} < 3, should not have traded` : 'no vote (insufficient book)', myDecision: vd?.decision ?? null, myMargin: vd?.margin ?? null });
      continue;
    }
    const myDir = betDirection({ decision: vd.decision, side });
    const actualDir = trade.direction === 'BUY' ? 'long' : 'short';
    const dirMatch = myDir === actualDir;
    results.push({ ...trade, pair, side, rung, instance, preFix, myDecision: vd.decision, myMargin: vd.margin, myDir, actualDir, dirMatch });
  }
}

const withVote = results.filter(r => r.dirMatch !== undefined);
const noVoteOrThin = results.filter(r => r.dirMatch === undefined);
const preFix = withVote.filter(r => r.preFix);
const postFix = withVote.filter(r => !r.preFix);

function summarize(label, set) {
  const matched = set.filter(r => r.dirMatch).length;
  console.log(`${label}: ${matched}/${set.length} direction matches`);
  for (const r of set.filter(r => !r.dirMatch)) {
    console.log(`  MISMATCH: ${r.pair} ${r.date} ${r.zone_id} actual=${r.direction}(${r.actualDir}) mine=${r.myDecision}/${r.side}->${r.myDir} margin=${r.myMargin}`);
  }
}

console.log(`\nTotal trades: ${trades.length}. Parsed+matched to a real touch: ${withVote.length + noVoteOrThin.length}.`);
console.log(`\n--- PRE-FIX trades (dated before ${FIX_CUTOFF}) ---`);
summarize('Pre-fix', preFix);
console.log(`\n--- POST-FIX trades (dated ${FIX_CUTOFF} or later) ---`);
summarize('Post-fix', postFix);

console.log(`\n--- Trades with no vote / thin margin under today's honest logic ---`);
for (const r of noVoteOrThin) console.log(`  ${r.pair} ${r.date} ${r.zone_id} (preFix=${r.preFix}): ${r.note}`);

fs.writeFileSync('analysis/output/vote_atlas_live_trade_validation.json', JSON.stringify(results, null, 1));
console.log(`\nWrote analysis/output/vote_atlas_live_trade_validation.json`);
