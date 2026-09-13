// Tests the lesson's own core, explicitly-flagged-as-open hypothesis
// (education/range-extension-levels-notes.md, open question #3: "Does
// confluence measurably help? Test alignment-zone touches vs
// single-session-level touches") -- which has NEVER been tested as an
// actual entry filter in this codebase despite the plumbing already
// existing (js/asiaFibAtlasVoteReview.js's buildBarrierTrades own
// `confluenceOnly`/`confluencePipMax` param, default threshold 2 pips
// matching the lesson's own EUR/USD tolerance exactly). The one existing
// confluence analysis (fib_atlas_entry_priority_backtest.mjs) tested
// asiaConfPips as a heat-cap-contention TIE-BREAKER, a different and much
// narrower question than "does filtering OUT low-confluence touches
// improve quality."
//
// Motivated directly by the owner's own hypothesis: EURUSD/GOLD get
// excluded by the pair-selection algorithm not because their edge is bad
// (confirmed standalone: EURUSD Sharpe 8.27, GOLD Sharpe 4.74, both strong)
// but because they're high-touch-frequency/high-volatility pairs where
// MOST touches are single-session noise, not confluence-backed -- exactly
// what the lesson's own "Strongest/Strong Levels" display modes filter out
// in the source Pine Script (Asia Fib.pine's own simple_mode input).
//
// Since asiaConfPips is already stored on every trade (js/asiaFibAtlasRoutes.js's
// trade-row construction copies it straight from the touch), this filters
// the ALREADY-REGENERATED, ALREADY-FIXED stored trades directly -- no
// re-walk needed.
//
//   node analysis/fib_atlas_confluence_filter_check.mjs
import { applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';

const BASE = process.env.BASE || 'https://macrofxmodel-production.up.railway.app';
const PAIRS = (process.env.PAIRS || 'eurusd,gold,gbpusd,audusd').split(',');
const MIN_MARGIN = 2, MAX_CONCURRENT = 1, RISK_PCT = 1;
// Thresholds to sweep, in the SAME "pips" unit asiaConfPips already uses
// (each pair's own pip size, per instrumentRegistry.js) -- includes the
// lesson's own stated EUR/USD tolerance (2) and a wider grid either side,
// plus Infinity (no filter) as the honest baseline.
const THRESHOLDS = [0.5, 1, 1.5, 2, 3, 5, 8, 12, Infinity];

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

async function loadPair(pair) {
  const resp = await fetchWithRetry(`${BASE}/api/asia-fib-atlas/vote-trades/${pair.toUpperCase()}?minMargin=${MIN_MARGIN}`);
  if (!resp || !resp.ok) return null;
  const j = await resp.json();
  return j.trades ?? [];
}

function statsFor(trades) {
  const capped = applyConcurrencyCap(trades, { maxConcurrent: MAX_CONCURRENT });
  const kept = capped?.kept?.length ? riskAdjustTrades(capped.kept, RISK_PCT).map(t => ({ ...t, pair: 'X' })) : [];
  if (!kept.length) return { trades: 0, sharpe: null, maxDD: null, winRate: null, cagr: null };
  const combined = buildPortfolioDailySeries({ X: kept }, { weights: { X: 1 } });
  const ps = portfolioStats(combined.dailyReturns, { mc: false });
  const winRate = +(100 * kept.filter(t => t.win).length / kept.length).toFixed(1);
  return { trades: kept.length, sharpe: ps.sharpe, maxDD: ps.maxDD, winRate, cagr: ps.cagr, profitFactor: ps.profitFactor };
}

function printRow(label, s) {
  console.log([String(label).padEnd(10), String(s.trades).padStart(7), String(s.sharpe).padStart(7),
    (s.maxDD != null ? s.maxDD + '%' : '—').padStart(8), (s.winRate != null ? s.winRate + '%' : '—').padStart(8),
    String(s.profitFactor).padStart(6)].join('  '));
}
function header() {
  console.log(['conf<=', 'trades', 'sharpe', 'maxDD', 'winRate', 'PF'].map((h, i) => h.padStart([10, 7, 7, 8, 8, 6][i])).join('  '));
}

async function main() {
  for (const pair of PAIRS) {
    const trades = await loadPair(pair);
    if (!trades?.length) { console.log(`${pair}: no data`); continue; }
    const withConf = trades.filter(t => t.asiaConfPips != null);
    console.log(`\n=== ${pair.toUpperCase()} (margin>=${MIN_MARGIN}, ${trades.length} total trades, ${withConf.length} carry asiaConfPips) ===`);
    header();
    for (const thr of THRESHOLDS) {
      const filtered = thr === Infinity ? trades : trades.filter(t => t.asiaConfPips != null && t.asiaConfPips <= thr);
      const s = statsFor(filtered);
      printRow(thr === Infinity ? 'none' : `<=${thr}`, s);
    }
  }
}

main();
