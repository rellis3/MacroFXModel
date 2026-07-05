/**
 * Unit tests for trendBasketEngine — pure, synthetic, no network.
 * Run: node js/trendBasketEngine.test.mjs
 */
import { alignSeries, runTrendBasket } from './trendBasketEngine.js';

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error('  ✗ ' + name); } }
const dateStr = i => new Date(Date.UTC(2005, 0, 1) + i * 86400000).toISOString().slice(0, 10);

// ── alignSeries ────────────────────────────────────────────────────────────────
{
  const a = alignSeries({
    EUR: [{ t: '01', v: 1 }, { t: '02', v: 2 }, { t: '03', v: 3 }],
    JPY: [{ t: '02', v: 9 }, { t: '03', v: 8 }, { t: '04', v: 7 }],
  });
  ok('align common dates', a.dates.join(',') === '02,03');
  ok('align cols', a.cols.EUR.join(',') === '2,3' && a.cols.JPY.join(',') === '9,8');
}

// ── runTrendBasket: persistent trends ⇒ trend-follower profits ─────────────────
{
  // 4 currencies: two drift up, two drift down, small noise. A 12-mo trend
  // follower should go long the up-drifters and short the down-drifters → profit.
  const N = 900, ccys = {};
  for (let k = 0; k < 4; k++) {
    const drift = (k < 2 ? 1 : -1) * 0.0004;
    let v = 1; const s = [];
    for (let i = 0; i < N; i++) { v *= Math.exp(drift + (((i * 7 + k * 13) % 20 - 10) * 0.0002)); s.push({ t: dateStr(i), v }); }
    ccys['C' + k] = s;
  }
  const r = runTrendBasket(ccys, { lookback: 200, volWindow: 40, rebalDays: 5, costBps: 0, isFrac: 0.6 });
  ok('basket runs', !r.error && r.nDays === N);
  ok('basket profits on trends (all Sharpe>0)', r.all.sharpe > 0.3);
  ok('basket OOS positive', r.oos.sharpe > 0);
  ok('basket emits equity curve', Array.isArray(r.equity) && r.equity.length > 10);
  ok('basket current signals', r.current.length === 4 && r.current.every(c => [-1, 0, 1].includes(c.trend)));
  ok('basket per-year', Array.isArray(r.perYear) && r.perYear.length >= 2);
}

// ── costs bite: high cost + frequent rebalance lowers Sharpe ────────────────────
{
  const N = 900, ccys = {};
  for (let k = 0; k < 4; k++) { const drift = (k < 2 ? 1 : -1) * 0.0004; let v = 1; const s = [];
    for (let i = 0; i < N; i++) { v *= Math.exp(drift + (((i * 7 + k * 13) % 20 - 10) * 0.0002)); s.push({ t: dateStr(i), v }); } ccys['C' + k] = s; }
  const cheap = runTrendBasket(ccys, { lookback: 200, rebalDays: 5, costBps: 0, isFrac: 0.6 });
  const dear  = runTrendBasket(ccys, { lookback: 200, rebalDays: 1, costBps: 50, isFrac: 0.6 });
  ok('cost drag lowers Sharpe', dear.all.sharpe < cheap.all.sharpe);
}

// ── insufficient data guard ────────────────────────────────────────────────────
{
  const r = runTrendBasket({ EUR: [{ t: '01', v: 1 }, { t: '02', v: 1.01 }] }, { lookback: 200 });
  ok('guards short data', !!r.error);
}

console.log(`trendBasketEngine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
