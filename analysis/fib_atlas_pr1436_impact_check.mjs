// Read-only R2 check (no writes, no regen) — current state of all 16 default
// pairs' stored Fib Atlas data as of today, for both ladders. Run to answer
// "what's the impact of PR #1436 (the guardAgainstRegression fix) on
// backtest numbers": (1) get real current trade counts/Sharpe as a baseline,
// (2) confirm the new dataAsOf/gapFillChunkFailures fields aren't retroactive
// — existing blobs won't have them until their next successful runOne after
// the PR merges — and (3) quantify how many pairs are still stale today vs
// the 2026-09-08 check (fib_atlas_check_coverage.mjs).
import { getJSON } from '../js/r2Store.js';

const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];

const TODAY = '2026-09-11';

function daysBehind(lastDate) {
  if (!lastDate) return null;
  const a = new Date(TODAY), b = new Date(lastDate);
  return Math.round((a - b) / 86400000);
}

async function report(prefix, label) {
  console.log(`\n=== ${label} (${prefix}) ===`);
  let totalTrades = 0, sharpeSum = 0, sharpeN = 0, staleCount = 0;
  for (const pair of PAIRS) {
    const stored = await getJSON(`${prefix}/${pair}-votetrades.json`);
    if (!stored) { console.log(`${pair}\tMISSING`); continue; }
    const trades = stored.trades || [];
    const lastDate = trades.reduce((max, t) => (t.date > max ? t.date : max), '');
    const db = daysBehind(lastDate);
    if (db != null && db > 3) staleCount++;
    const sharpe = stored.summaryByMargin?.[2]?.sharpe ?? stored.summaryByMargin?.[1]?.sharpe ?? null;
    const n = stored.summaryByMargin?.[2]?.n ?? trades.length;
    totalTrades += n;
    if (sharpe != null) { sharpeSum += sharpe; sharpeN++; }
    console.log(`${pair}\tgeneratedAt=${stored.generatedAt}\tlastTrade=${lastDate}\tdaysBehind=${db}\tn=${n}\tsharpe=${sharpe?.toFixed?.(2) ?? sharpe}\tdataAsOf=${stored.dataAsOf ?? 'ABSENT (pre-fix blob)'}\tgapFillChunkFailures=${stored.gapFillChunkFailures ?? 'ABSENT'}`);
  }
  console.log(`--- ${label} totals: ${totalTrades} trades across ${PAIRS.length} pairs, ${staleCount} pairs stale (>3d behind), avg per-pair Sharpe ${sharpeN ? (sharpeSum / sharpeN).toFixed(2) : 'n/a'} ---`);
}

await report('asia-fib-atlas', 'ASIA');
await report('monday-fib-atlas', 'MONDAY');
