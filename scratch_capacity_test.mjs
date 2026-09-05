import { costForPair } from './js/perLineStrategy.js';
import { assetClassFor } from './js/forecastAnalyserStore.js';
import { portfolioStats } from './js/backtestStats.js';

const PAIRS = ['eurusd','gbpusd','usdjpy','audusd','usdchf','euraud','eurchf','audjpy','cadjpy','chfjpy','gold','nq','spx','dow','us2000','de30','uk100'];
const params = new URLSearchParams({ pairs: PAIRS.join(','), minMargin: '3', maxConcurrent: '1', sizing: 'fixed-risk', riskPct: '1' });
const res = await fetch(`https://macrofxmodel-production.up.railway.app/api/level-atlas/vote-portfolio?${params}`);
const j = await res.json();
const trades = j.trades;
console.log('trades:', trades.length, 'days:', j.equityCurve.length);

// Per-pair fixed cost (%, roundtrip) — same value baked into each trade's
// pnlPct at build time (priceBarrierTrade: pnlPct = gross - cost). Verify
// the reconstruction is exact before trusting anything downstream: rebuild
// gross from a sample of REAL trades and re-derive pnlPct at mult=1, must
// match the stored value exactly (to float rounding).
const costByPair = {};
for (const p of PAIRS) costByPair[p] = costForPair(p, assetClassFor(p));
console.log('\nper-pair cost (%):', JSON.stringify(costByPair, null, 1));

function stressedPnl(t, mult) {
  const cost = costByPair[t.pair.toLowerCase()];
  return t.pnlPct - cost * (mult - 1);
}
// Verification: mult=1 must reproduce the original pnlPct exactly.
let maxDiff = 0;
for (const t of trades.slice(0, 500)) maxDiff = Math.max(maxDiff, Math.abs(stressedPnl(t, 1) - t.pnlPct));
console.log('\nreconstruction check (mult=1 vs original), max abs diff:', maxDiff, maxDiff < 1e-6 ? 'OK' : 'MISMATCH -- STOP');
if (maxDiff >= 1e-6) process.exit(1);

function dailySeriesAt(mult, tradeList = trades) {
  const m = new Map();
  for (const t of tradeList) {
    const p = stressedPnl(t, mult) * (t.weight ?? 1);
    m.set(t.date, (m.get(t.date) || 0) + p);
  }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, v]) => v);
}

const MULTS = [1, 1.5, 2, 3, 4, 5, 7, 10, 15, 20, 30, 50];
console.log('\n=== PORTFOLIO cost-sensitivity ===');
const portfolioRows = [];
for (const mult of MULTS) {
  const s = portfolioStats(dailySeriesAt(mult), { mc: false });
  portfolioRows.push({ mult, sharpe: s.sharpe, cagr: s.cagr, maxDD: s.maxDD, winRate: s.winRate });
  console.log(`  ${mult}x  sharpe=${s.sharpe}  cagr=${s.cagr}%  maxDD=${s.maxDD}%  winRate(days)=${s.winRate}%`);
}
// Find the zero-crossing multiplier (linear interpolation between bracket points)
function findZeroCrossing(rows) {
  for (let i = 1; i < rows.length; i++) {
    if (rows[i-1].sharpe > 0 && rows[i].sharpe <= 0) {
      const a = rows[i-1], b = rows[i];
      const frac = a.sharpe / (a.sharpe - b.sharpe);
      return a.mult + frac * (b.mult - a.mult);
    }
  }
  return rows[rows.length-1].sharpe > 0 ? null : rows[0].mult; // never crosses in range, or already <=0 at 1x
}
console.log('\nPortfolio Sharpe=0 crossing at approx', findZeroCrossing(portfolioRows).toFixed(2) + 'x current cost');

console.log('\n=== PER-PAIR cost-sensitivity (Sharpe=0 crossing multiplier) ===');
const perPairResults = [];
for (const pair of PAIRS) {
  const pairTrades = trades.filter(t => t.pair.toLowerCase() === pair);
  if (pairTrades.length < 30) { console.log(`  ${pair}: too few trades (${pairTrades.length})`); continue; }
  const rows = MULTS.map(mult => {
    const s = portfolioStats(dailySeriesAt(mult, pairTrades), { mc: false });
    return { mult, sharpe: s.sharpe };
  });
  const crossing = findZeroCrossing(rows);
  perPairResults.push({ pair, n: pairTrades.length, cost: costByPair[pair], baseSharpe: rows[0].sharpe, crossing });
}
perPairResults.sort((a,b) => (a.crossing ?? 999) - (b.crossing ?? 999));
for (const r of perPairResults) {
  console.log(`  ${r.pair.padEnd(8)} n=${String(r.n).padStart(5)}  cost=${r.cost.toFixed(3)}%  baseSharpe=${r.baseSharpe.toFixed(2)}  diesAt=${r.crossing != null ? r.crossing.toFixed(1)+'x' : '>50x (never in range)'}`);
}
