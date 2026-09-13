// Cross-ladder (Asia+Monday, same pair) duplicate/correlation check
// (2026-09-12) — the "Both (combined)" vote-portfolio page lets the SAME
// pair's Asia and Monday legs both be open at once with NO shared exposure
// control (js/asiaFibAtlasRoutes.js's own /vote-portfolio-combined route
// header says so explicitly: "the existing maxHeatPct/throttle machinery...
// now also governs cross-LADDER stacking" -- but "best config" ships with
// BOTH heat cap and throttle OFF). This is the same failure shape already
// found and fixed for WITHIN-ladder same-direction stacking (27.1% of win
// PnL was duplicate-counted, analysis/fib_atlas_chandelier_exit_backtest.mjs)
// -- but for ACROSS-ladder same-pair overlap, never measured.
//
// Measures, per pair: how often an Asia trade and a Monday trade on the
// SAME pair have overlapping [time, resolveTime] windows (both open at
// once), and among those, how often they're the SAME direction (both BUY
// or both SELL, inferred from side+decision) and resolve as the SAME
// win/loss outcome -- i.e. very likely riding the exact same real market
// move counted twice, not two independent bets.
import { RANGE_FIB_INSTRUMENTS } from '../js/rangeFibEngine.js';

const BASE = process.env.BASE || 'https://macrofxmodel-production.up.railway.app';
// "Best config" recommended pairs (screenshot) -- the actual shipped set.
const PAIRS = (process.env.PAIRS || 'eurusd,gbpusd,usdjpy,audusd,nzdusd,usdcad,usdchf,eurgbp,euraud,gbpaud,audjpy,audnzd,audcad,cadjpy,nzdjpy,gold').split(',');
const MIN_MARGIN = 2;

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (resp.ok || resp.status === 404) return resp;
      if (i === retries) return resp;
    } catch (e) { if (i === retries) return null; }
    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
}

async function loadLadder(pair, ladder) {
  const routePrefix = ladder === 'asia' ? 'asia-fib-atlas' : 'monday-fib-atlas';
  const resp = await fetchWithRetry(`${BASE}/api/${routePrefix}/vote-trades/${pair.toUpperCase()}?minMargin=${MIN_MARGIN}`);
  if (!resp || !resp.ok) return [];
  const j = await resp.json();
  // "direction" of the bet: follow+above or fade+below = long; follow+below or fade+above = short
  // (mirrors real BUY/SELL: a follow bet on an 'above' rung wants price to
  // keep going UP -> long; a fade bet on an 'above' rung wants price to
  // revert DOWN -> short. Mirror image for 'below'.)
  return (j.trades ?? []).map(t => ({
    ...t,
    long: (t.decision === 'follow') === (t.side === 'above'),
  }));
}

// Do two [time, resolveTime] windows overlap at all?
function overlaps(a, b) {
  const aEnd = a.resolveTime ?? a.time, bEnd = b.resolveTime ?? b.time;
  return a.time <= bEnd && b.time <= aEnd;
}

async function checkPair(pair) {
  const [asia, monday] = await Promise.all([loadLadder(pair, 'asia'), loadLadder(pair, 'monday')]);
  if (!asia.length || !monday.length) return null;
  let overlapCount = 0, sameDirCount = 0, sameOutcomeCount = 0;
  let overlapWinPnl = 0, totalWinPnl = 0;
  for (const t of [...asia, ...monday]) if (t.win) totalWinPnl += t.pnlPct;
  for (const a of asia) {
    for (const m of monday) {
      if (!overlaps(a, m)) continue;
      overlapCount++;
      const sameDir = a.long === m.long;
      if (sameDir) sameDirCount++;
      if (a.win === m.win) sameOutcomeCount++;
      if (sameDir && a.win && m.win) overlapWinPnl += a.pnlPct + m.pnlPct;
    }
  }
  return {
    pair, asiaN: asia.length, mondayN: monday.length,
    overlapCount, sameDirCount, sameOutcomeCount,
    pctOverlapSameDir: overlapCount ? +(100 * sameDirCount / overlapCount).toFixed(1) : 0,
    pctOfTotalWinPnlFromSameDirOverlap: totalWinPnl > 0 ? +(100 * overlapWinPnl / totalWinPnl).toFixed(2) : 0,
  };
}

async function main() {
  console.log(`Cross-ladder (Asia+Monday) same-pair overlap check — pairs: ${PAIRS.join(', ')}\n`);
  console.log(['pair', 'asiaN', 'mondayN', 'overlaps', 'sameDir', '%sameDir', '%winPnlFromSameDirOverlap'].join('\t'));
  let grandOverlapWinPnl = 0, grandTotalWinPnl = 0, grandOverlaps = 0, grandSameDir = 0;
  for (const pair of PAIRS) {
    const r = await checkPair(pair);
    if (!r) { console.log(`${pair}\t(missing data on one or both ladders)`); continue; }
    console.log([r.pair, r.asiaN, r.mondayN, r.overlapCount, r.sameDirCount, r.pctOverlapSameDir + '%', r.pctOfTotalWinPnlFromSameDirOverlap + '%'].join('\t'));
    grandOverlaps += r.overlapCount; grandSameDir += r.sameDirCount;
  }
}

main();
