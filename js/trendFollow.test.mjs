// Synthetic, no-network tests for the diversified trend-following engine.
//   node js/trendFollow.test.mjs
// Deterministic (seeded). Proves properties, not just "it ran".

import { momentumSignal, rollingVol, backtestMarket, backtestBasket, robustness, isOosSplit, DEFAULTS } from './trendFollowEngine.js';

let tests = 0, failures = 0;
const ok = (n, c, x = '') => { tests++; console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${x ? '  ' + x : ''}`); if (!c) failures++; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
function rng(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const gauss = r => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// Build a trending market: persistent drift regimes (up then down then up) + noise.
function trendingMarket(seed, n = 1500, driftScale = 0.0006, noise = 0.006) {
  const r = rng(seed); const c = [100]; let drift = driftScale;
  for (let i = 1; i < n; i++) {
    if (i % 250 === 0) drift = -drift;              // flip trend every ~year
    c.push(c[i - 1] * (1 + drift + noise * gauss(r)));
  }
  return c;
}
function randomWalk(seed, n = 1500, noise = 0.006) {
  const r = rng(seed); const c = [100];
  for (let i = 1; i < n; i++) c.push(c[i - 1] * (1 + noise * gauss(r)));
  return c;
}

console.log('\n── signal + sizing ──');
{
  const c = trendingMarket(1);
  const sig = momentumSignal(c);
  ok('signal in [-1,1]', sig.every(s => s >= -1 && s <= 1));
  ok('signal 0 during warmup', sig.slice(0, 20).every(s => s === 0));
  ok('signal picks up an uptrend (early, pre-flip)', sig[240] > 0, `=${sig[240]}`);
  const rets = c.slice(1).map((p, i) => (p - c[i]) / c[i]);
  const vol = rollingVol([0, ...rets]);
  ok('rolling vol positive after warmup', vol[300] > 0 && Number.isFinite(vol[300]));
}

console.log('\n── no-lookahead ──');
{
  // Truncating the series must not change earlier positions/returns (causal).
  const c = trendingMarket(2);
  const full = backtestMarket(c);
  const trunc = backtestMarket(c.slice(0, 800));
  let same = true;
  for (let i = 0; i < 800; i++) if (!near(full.dailyRet[i], trunc.dailyRet[i], 1e-12)) { same = false; break; }
  ok('daily returns are causal (truncation-invariant)', same);
}

console.log('\n── trend edge on trending markets ──');
{
  // A basket of trending markets should earn a positive Sharpe after costs.
  const markets = [1, 2, 3, 4, 5, 6].map(s => ({ symbol: 'M' + s, closes: trendingMarket(s * 7) }));
  const res = backtestBasket(markets);
  ok('basket runs', res.ok === true, res.error || '');
  ok('positive portfolio Sharpe on trending markets', res.portfolio.sharpe > 0.5, `Sharpe=${res.portfolio.sharpe}`);
  ok('diversified basket Sharpe ≥ median single-market Sharpe', (() => {
    const s = res.markets.map(m => m.sharpe).sort((a, b) => a - b); const med = s[Math.floor(s.length / 2)];
    return res.combinedEqualWeight.sharpe >= med - 0.05;
  })(), `port=${res.combinedEqualWeight.sharpe}`);
  ok('reports drawdown + positive-years', res.portfolio.maxDD < 0 && res.portfolio.positiveYears.years >= 4);
}

console.log('\n── no POSITIVE edge on random walks (trend-following bleeds on noise) ──');
{
  // Honest property: a trend-follower CANNOT profit from a random walk — it chases
  // non-existent trends and pays whipsaw + costs, so Sharpe is ≤0 (often negative).
  // This is exactly why it needs genuinely-trending, diversified markets.
  const markets = [11, 12, 13, 14, 15, 16].map(s => ({ symbol: 'N' + s, closes: randomWalk(s * 7) }));
  const res = backtestBasket(markets);
  ok('random-walk basket shows NO positive edge (Sharpe ≤ ~0.2)', res.portfolio.sharpe < 0.2, `Sharpe=${res.portfolio.sharpe} (negative = whipsaw cost, expected)`);
}

console.log('\n── costs bite ──');
{
  const c = trendingMarket(3);
  const free = backtestMarket(c, { costBp: 0 });
  const costly = backtestMarket(c, { costBp: 20 });
  const sum = a => a.reduce((s, x) => s + x, 0);
  ok('higher costs reduce net return', sum(costly.dailyRet) < sum(free.dailyRet), `${sum(costly.dailyRet).toFixed(3)} < ${sum(free.dailyRet).toFixed(3)}`);
  ok('long/flat takes no shorts', backtestMarket(c, { longShort: false }).positions.every(p => p >= -1e-9));
}

console.log('\n── honest-read robustness ──');
{
  const markets = [1, 2, 3, 4, 5, 6].map(s => ({ symbol: 'M' + s, closes: trendingMarket(s * 7) }));
  const rob = robustness(markets);
  ok('robustness runs', rob.ok === true);
  ok('sub-periods early/mid/recent present', ['early', 'mid', 'recent'].every(k => typeof rob.subPeriods[k] === 'number'));
  ok('rolling 1y Sharpe series produced', Array.isArray(rob.rolling) && rob.rolling.length > 3);
  ok('cost sensitivity spans 0..20bp and is non-increasing', (() => {
    const s = rob.costSensitivity.map(x => x.sharpe);
    for (let i = 1; i < s.length; i++) if (s[i] > s[i - 1] + 0.05) return false;   // higher cost never meaningfully helps
    return rob.costSensitivity[0].costBp === 0 && rob.costSensitivity.at(-1).costBp === 20;
  })(), rob.costSensitivity.map(x => `${x.costBp}:${x.sharpe}`).join(' '));
  ok('concentration drop-best computed', rob.concentration.bestMarket && rob.concentration.dropBestSharpe != null);
  ok('read is a string with a verdict', typeof rob.read === 'string' && /Robust|Caveats/.test(rob.read));

  // Random walk: robustness should NOT say "Robust" (no real edge to be robust).
  const noise = [11, 12, 13, 14, 15, 16].map(s => ({ symbol: 'N' + s, closes: randomWalk(s * 7) }));
  ok('random-walk robustness is NOT "Robust"', !/^Robust/.test(robustness(noise).read));
}

console.log('\n── parameter IS/OOS split ──');
{
  const markets = [1, 2, 3, 4, 5, 6].map(s => ({ symbol: 'M' + s, closes: trendingMarket(s * 7) }));
  const io = isOosSplit(markets);
  ok('isOosSplit runs', io.ok === true);
  ok('every config has IS + OOS Sharpe', io.configs.length >= 2 && io.configs.every(c => typeof c.isSharpe === 'number' && typeof c.oosSharpe === 'number'));
  ok('IS-selected config is the IS-Sharpe max', io.configs.every(c => c.isSharpe <= io.isSelected.isSharpe + 1e-9));
  ok('overfitGap = IS − OOS of the selected config', near(io.overfitGap, +(io.isSelected.isSharpe - io.isSelected.oosSharpe).toFixed(2)));
  ok('read is a string verdict', typeof io.read === 'string' && io.read.length > 10);
}

console.log(`\n${failures === 0 ? '✅' : '❌'} trend-follow tests: ${tests - failures}/${tests} passed${failures ? `, ${failures} FAILED` : ''}\n`);
process.exit(failures ? 1 : 0);
