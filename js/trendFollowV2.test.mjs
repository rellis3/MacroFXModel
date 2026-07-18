// Synthetic, no-network tests for trend-following v2 (forecast-σ sizing A/B).
//   node js/trendFollowV2.test.mjs
// Deterministic (seeded). Proves the sizing injection is bit-safe, the forecast
// vol series is causal and warmup-safe, and the A/B harness reports honestly.

import { backtestMarket, rollingVol, DEFAULTS } from './trendFollowEngine.js';
import { forecastVolSeries, runTrendAB, compareAB } from './trendFollowV2Engine.js';

let tests = 0, failures = 0;
const ok = (n, c, x = '') => { tests++; console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${x ? '  ' + x : ''}`); if (!c) failures++; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
function rng(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const gauss = r => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// Trending OHLC market: persistent drift regimes + noise, honest intrabar range.
function trendingBars(seed, n = 1500, driftScale = 0.0006, noise = 0.006) {
  const r = rng(seed); const bars = []; let px = 100, drift = driftScale;
  for (let i = 0; i < n; i++) {
    if (i > 0 && i % 250 === 0) drift = -drift;
    const open = px, close = px * (1 + drift + noise * gauss(r));
    const high = Math.max(open, close) * (1 + 0.3 * noise * Math.abs(gauss(r)));
    const low = Math.min(open, close) * (1 - 0.3 * noise * Math.abs(gauss(r)));
    bars.push({ open, high, low, close }); px = close;
  }
  return bars;
}

console.log('\n── volSeries injection is bit-safe ──');
{
  // Injecting the engine's OWN trailing vol must reproduce the default run exactly:
  // the parameter changes nothing unless the series differs.
  const closes = trendingBars(1).map(b => b.close);
  const rets = closes.map((c, i) => i ? (c - closes[i - 1]) / closes[i - 1] : 0);
  const injected = backtestMarket(closes, {}, rollingVol(rets, DEFAULTS.volWindow));
  const vanilla = backtestMarket(closes, {});
  ok('injected trailing vol ≡ default run (bit-identical)',
     injected.dailyRet.every((x, i) => near(x, vanilla.dailyRet[i], 0)));
}

console.log('\n── forecastVolSeries: causal, warmup-safe, sane scale ──');
{
  const bars = trendingBars(2);
  const fx = forecastVolSeries(bars, 'fx');
  const idx = forecastVolSeries(bars, 'index');
  // Causality: truncating the future must not change the past.
  const fxTrunc = forecastVolSeries(bars.slice(0, 800), 'fx');
  ok('causal (truncation-invariant)', fxTrunc.slice(0, 799).every((v, i) =>
    (Number.isNaN(v) && Number.isNaN(fx[i])) || near(v, fx[i], 1e-12)));
  // Warmup: YZ needs ~30 bars; those slots must be NaN, never a tiny σ that
  // would make 1/σ sizing take max leverage on garbage.
  ok('fx warmup is NaN, not near-zero', fx.slice(0, 25).every(Number.isNaN));
  const live = fx.filter(Number.isFinite);
  ok('post-warmup fx σ is sane (1%..100% annualised)', live.length > 1000 && live.every(v => v > 0.01 && v < 1.0),
     `min=${Math.min(...live).toFixed(3)} max=${Math.max(...live).toFixed(3)}`);
  ok('index (GARCH) branch produces finite σ', idx.filter(Number.isFinite).length > 1000);
  // Same ballpark as trailing vol on the same data (both estimate the same σ).
  const closes = bars.map(b => b.close);
  const rets = closes.map((c, i) => i ? (c - closes[i - 1]) / closes[i - 1] : 0);
  const tv = rollingVol(rets).filter(Number.isFinite);
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  ok('forecast σ within 2× of trailing σ on average', mean(live) / mean(tv) > 0.5 && mean(live) / mean(tv) < 2,
     `ratio=${(mean(live) / mean(tv)).toFixed(2)}`);
}

console.log('\n── A/B harness runs and reports both variants honestly ──');
{
  const markets = [1, 2, 3, 4, 5, 6].map(s => ({ symbol: 'M' + s, bars: trendingBars(s * 7), assetClass: 'fx' }));
  const ab = runTrendAB(markets);
  ok('A/B runs', ab.ok === true, ab.error || '');
  ok('both variants produce a portfolio card', ab.incumbent.portfolio && ab.forecastSized.portfolio);
  ok('both variants carry Sharpe SE + min track record',
     typeof ab.incumbent.portfolio.sharpeSE === 'number' && 'minTrackYears' in ab.incumbent.portfolio &&
     typeof ab.forecastSized.portfolio.sharpeSE === 'number');
  ok('comparison has a pre-registered verdict', ['v2_wins', 'v2_fragile', 'no_improvement', 'inconclusive'].includes(ab.comparison.verdict),
     `verdict=${ab.comparison.verdict}`);
  ok('comparison reads OOS Sharpes, not full-sample', ab.comparison.oos && 'gain' in ab.comparison.oos);
  ok('verdict text is a sentence', typeof ab.comparison.read === 'string' && ab.comparison.read.length > 40);
  // The trending synthetic markets should give BOTH variants a positive edge —
  // the A/B question is only about the size, not the sign.
  ok('trend edge present in both variants', ab.incumbent.portfolio.sharpe > 0.3 && ab.forecastSized.portfolio.sharpe > 0.3,
     `v1=${ab.incumbent.portfolio.sharpe} v2=${ab.forecastSized.portfolio.sharpe}`);
}

console.log('\n── compareAB verdict logic (pre-registered criteria) ──');
{
  const mk = (oosSharpe, cost5) => ({
    portfolio: { sharpe: 0.5 },
    isOos: { ok: true, isSelected: { oosSharpe } },
    robustness: { ok: true, costSensitivity: [{ costBp: 5, sharpe: cost5 }] },
  });
  ok('better OOS + survives costs → v2_wins', compareAB(mk(0.4, 0.35), mk(0.6, 0.5)).verdict === 'v2_wins');
  ok('better OOS but dies at 5bp → v2_fragile', compareAB(mk(0.4, 0.35), mk(0.6, 0.2)).verdict === 'v2_fragile');
  ok('worse OOS → no_improvement', compareAB(mk(0.4, 0.35), mk(0.3, 0.5)).verdict === 'no_improvement');
  ok('missing IS/OOS → inconclusive', compareAB({ portfolio: { sharpe: 0.5 } }, mk(0.6, 0.5)).verdict === 'inconclusive');
}

console.log(`\n${failures === 0 ? '✅' : '❌'} trend-follow v2 tests: ${tests - failures}/${tests} passed${failures ? `, ${failures} FAILED` : ''}\n`);
process.exit(failures ? 1 : 0);
