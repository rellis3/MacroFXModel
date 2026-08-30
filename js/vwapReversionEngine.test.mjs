/**
 * Unit tests for vwapReversionEngine — synthetic bars only, no network.
 * Run: node js/vwapReversionEngine.test.mjs
 */
import { computeSessionVwap, simulateVwapSession, runVwapReversion } from './vwapReversionEngine.js';

let pass = 0, fail = 0;
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', msg); } }

// Build a bar with equal h/l/c (zero range) so tp = value exactly.
const flat = (t, v) => ({ time: t, open: v, high: v, low: v, close: v, volume: 1 });
const bar = (t, o, h, l, c) => ({ time: t, open: o, high: h, low: l, close: c, volume: 1 });

// ── 1) computeSessionVwap invariants ─────────────────────────────────────────
{
  const bars = Array.from({ length: 50 }, (_, i) => flat(i * 60, 100));
  const { vwap, sd } = computeSessionVwap(bars);
  ok(approx(vwap[49], 100), 'flat price → VWAP = price');
  ok(approx(sd[49], 0), 'flat price → σ = 0');
}
{
  // Alternating tp {100.02, 99.98} → mean 100, population σ = 0.02 exactly.
  const bars = Array.from({ length: 40 }, (_, i) => flat(i * 60, i % 2 === 0 ? 100.02 : 99.98));
  const { vwap, sd } = computeSessionVwap(bars);
  ok(approx(vwap[39], 100, 1e-9), 'alternating → VWAP = 100');
  ok(approx(sd[39], 0.02, 1e-9), 'alternating ±0.02 → σ = 0.02');
}

// ── Helper: 40-bar warmup at ±0.02 around 100 (VWAP=100, σ=0.02) ──────────────
function warmup() {
  return Array.from({ length: 40 }, (_, i) => flat(i * 60, i % 2 === 0 ? 100.02 : 99.98));
}

// ── 2) band_fade WIN on a stretch-then-revert day ────────────────────────────
{
  const bars = warmup();
  let t = 40 * 60;
  // Spike bar pokes just above +2σ band (100.04) then price reverts to VWAP.
  bars.push(bar(t, 100.00, 100.05, 100.00, 100.02)); t += 60;   // triggers SELL @100.04
  bars.push(bar(t, 100.02, 100.02, 99.99, 99.99)); t += 60;     // low 99.99 ≤ VWAP → TP
  for (let i = 0; i < 10; i++) { bars.push(flat(t, 99.98)); t += 60; }
  const r = simulateVwapSession(bars, { mode: 'band_fade', costPct: 0.012 });
  ok(r.filled, 'band_fade: filled on stretch-revert day');
  ok(r.side === 'SELL', 'band_fade: sold the upper band');
  ok(r.outcome === 'win', `band_fade: reverted to VWAP = win (got ${r.outcome})`);
  ok(r.pnl_pct > 0, `band_fade: positive net pnl (got ${r.pnl_pct})`);
}

// ── 3) band_fade LOSS when price trends away from the band (fades a trend) ────
{
  const bars = warmup();
  let t = 40 * 60;
  // Monotonic ramp up: touches +2σ, then keeps going → stop above.
  for (let i = 0; i < 20; i++) { const v = 100.04 + i * 0.02; bars.push(bar(t, v, v + 0.01, v - 0.005, v)); t += 60; }
  const r = simulateVwapSession(bars, { mode: 'band_fade', costPct: 0.012 });
  ok(r.filled && r.side === 'SELL', 'band_fade(trend): filled short');
  ok(r.outcome === 'loss', `band_fade(trend): stopped out = loss (got ${r.outcome})`);
}

// ── 4) vwap_bounce WIN: stretch up, return to VWAP, bounce up ─────────────────
{
  const bars = warmup();
  let t = 40 * 60;
  bars.push(bar(t, 100.00, 100.10, 100.00, 100.08)); t += 60;   // stretch up (≥+2σ)
  bars.push(bar(t, 100.05, 100.05, 99.99, 100.00)); t += 60;    // pull back to VWAP → BUY
  for (let i = 0; i < 8; i++) { const v = 100.02 + i * 0.02; bars.push(bar(t, v, v + 0.02, v - 0.005, v)); t += 60; } // bounce up
  const r = simulateVwapSession(bars, { mode: 'vwap_bounce', costPct: 0.012 });
  ok(r.filled, 'vwap_bounce: filled on stretch-return day');
  ok(r.side === 'BUY', 'vwap_bounce: bought the bounce in stretch direction');
  ok(r.outcome === 'win', `vwap_bounce: bounce reached band = win (got ${r.outcome})`);
}

// ── 5) Flat day (σ=0) → no fill (no lookahead / no degenerate trigger) ────────
{
  const bars = Array.from({ length: 100 }, (_, i) => flat(i * 60, 100));
  for (const mode of ['band_fade', 'vwap_bounce', 'band_follow', 'vwap_trend_cross']) {
    const r = simulateVwapSession(bars, { mode });
    ok(!r.filled, `flat day → no ${mode} trade`);
  }
}

// ── 7) vwap_trend_cross (2026-08-30): rides a monotonic ramp to session close ──
{
  const bars = Array.from({ length: 40 }, (_, i) => flat(i * 60, 100));   // flat warmup, VWAP=100, σ=0
  let t = 40 * 60;
  for (let i = 0; i < 20; i++) { const v = 100.05 + i * 0.02; bars.push(bar(t, v, v + 0.01, v - 0.005, v)); t += 60; }
  const r = simulateVwapSession(bars, { mode: 'vwap_trend_cross', costPct: 0.012 });
  ok(r.filled, 'vwap_trend_cross: filled on a clean upward cross');
  ok(r.side === 'BUY', 'vwap_trend_cross: bought the upward cross (trading WITH VWAP, not against it)');
  ok(r.outcome === 'session_close', `vwap_trend_cross: no reversal -> rides to session close (got ${r.outcome})`);
  ok(r.pnl_pct > 0, `vwap_trend_cross: positive net pnl on a sustained one-way ramp (got ${r.pnl_pct})`);
}

// ── 8) vwap_trend_cross: exits on the FIRST opposite cross, not session end ────
{
  const bars = Array.from({ length: 40 }, (_, i) => flat(i * 60, 100));
  let t = 40 * 60;
  for (let i = 0; i < 10; i++) { const v = 100.05 + i * 0.02; bars.push(bar(t, v, v + 0.01, v - 0.005, v)); t += 60; }   // ramp up -> BUY
  for (let i = 0; i < 10; i++) { const v = 100.20 - i * 0.05; bars.push(bar(t, v, v + 0.005, v - 0.01, v)); t += 60; }  // sharp reversal down
  const r = simulateVwapSession(bars, { mode: 'vwap_trend_cross', costPct: 0.012 });
  ok(r.filled && r.side === 'BUY', 'vwap_trend_cross(reversal): filled long on the initial up-cross');
  ok(r.outcome === 'reverse_cross', `vwap_trend_cross(reversal): exits on the opposite cross, not session end (got ${r.outcome})`);
}

// ── 9) vwap_trend_cross: dir filter skips a cross of the excluded direction ────
{
  const bars = Array.from({ length: 40 }, (_, i) => flat(i * 60, 100));
  let t = 40 * 60;
  for (let i = 0; i < 20; i++) { const v = 100.05 + i * 0.02; bars.push(bar(t, v, v + 0.01, v - 0.005, v)); t += 60; }
  const r = simulateVwapSession(bars, { mode: 'vwap_trend_cross', dir: 'short', costPct: 0.012 });
  ok(!r.filled, 'vwap_trend_cross: dir=short skips an upward-only cross session (no_fill, not a mismatched trade)');
}

// ── 6) runVwapReversion buckets by session and emits dated records ────────────
{
  // Two UTC days of warmup-style bars.
  const mk = (dayOffset) => Array.from({ length: 60 }, (_, i) =>
    flat(dayOffset * 86400 + i * 60, i % 2 === 0 ? 100.02 : 99.98));
  const packDay = [...mk(0), ...mk(1)];
  const packed = {
    n: packDay.length,
    times: packDay.map(b => b.time),
    opens: packDay.map(b => b.open), highs: packDay.map(b => b.high),
    lows: packDay.map(b => b.low), closes: packDay.map(b => b.close),
    volumes: packDay.map(b => b.volume),
  };
  const recs = runVwapReversion(packed, { mode: 'band_fade', sessionAnchor: 'day' });
  ok(recs.length === 2, `two sessions → two records (got ${recs.length})`);
  ok(/^\d{4}-\d{2}-\d{2}$/.test(recs[0].date), 'record has YYYY-MM-DD date');
}

console.log(`\nvwapReversionEngine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
