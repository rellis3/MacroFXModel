/**
 * Tests for trendFollowEmaEngine + the signalSeries injection point.
 * Run: node js/trendFollowEma.test.mjs   (synthetic data, no network)
 */
import { backtestMarket, momentumSignal } from './trendFollowEngine.js';
import { emaCrossSignal, withEmaSignal, compareTrendSignals, emaIsOosSplit, buyHoldStats } from './trendFollowEmaEngine.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ FAIL:', m); } };

// Seeded LCG for deterministic synthetic series.
function lcg(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }
function series(seed, n = 800, drift = 0.0002, vol = 0.007) {
  const r = lcg(seed); const out = [100];
  for (let i = 1; i < n; i++) { const z = (r() + r() + r() - 1.5) * 2; out.push(out[i - 1] * (1 + drift + vol * z)); }
  return out;
}

// ── 1) Injection point is behavior-preserving (golden) ───────────────────────
{
  const closes = series(1);
  const dflt = backtestMarket(closes, {});
  const inj = backtestMarket(closes, {}, null, momentumSignal(closes));  // explicitly inject the default
  const same = dflt.dailyRet.every((x, i) => x === inj.dailyRet[i]) && dflt.dailyRet.length === inj.dailyRet.length;
  ok(same, 'injecting momentumSignal == default (bit-identical)');
}

// ── 2) emaCrossSignal invariants ─────────────────────────────────────────────
{
  const rising = Array.from({ length: 300 }, (_, i) => 100 + i);   // strictly up
  const s = emaCrossSignal(rising, [15, 50, 100]);
  ok(s.slice(0, 100).every(x => x === 0), 'warmup (i<slow) → signal 0');
  ok(s[299] === 1, `stacked-up → +1 (got ${s[299]})`);
  const falling = Array.from({ length: 300 }, (_, i) => 100 - i * 0.1);
  const sf = emaCrossSignal(falling, [15, 50, 100]);
  ok(sf[299] === -1, `stacked-down → −1 (got ${sf[299]})`);
  ok(s.every(x => x >= -1 && x <= 1), 'signal within [-1,1]');
}

// ── 3) withEmaSignal attaches a causal signalSeries ──────────────────────────
{
  const closes = series(3);
  const [m] = withEmaSignal([{ symbol: 'X', closes }], [15, 50, 100]);
  ok(Array.isArray(m.signalSeries) && m.signalSeries.length === closes.length, 'signalSeries attached, aligned');
}

// ── 4) compareTrendSignals returns both baskets on a synthetic universe ──────
{
  const markets = [1, 2, 3, 4, 5].map(s => ({ symbol: `S${s}`, closes: series(s * 7) }));
  const res = compareTrendSignals(markets, { costBp: 2 });
  ok(res.ok, 'compareTrendSignals ok');
  ok(typeof res.momentum.portfolio.sharpe === 'number', 'momentum basket sharpe present');
  ok(typeof res.emaCross.portfolio.sharpe === 'number', 'emaCross basket sharpe present');
  ok(res.buyHold.length === 5, 'buy-hold floor computed per market');
  const io = emaIsOosSplit(markets, { costBp: 2 });
  ok(io.ok && io.configs.length >= 2 && io.isSelected, 'emaIsOosSplit selects on IS, evaluates OOS');
}

console.log(`\ntrendFollowEma: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
