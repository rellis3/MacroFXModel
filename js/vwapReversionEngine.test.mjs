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

// ── 10) vwap_trend_cross confirmTfMinutes: skips a whipsaw, picks up the later real ramp ──
{
  const bars = Array.from({ length: 40 }, (_, i) => flat(i * 60, 100));
  let t = 40 * 60;
  bars.push(bar(t, 100.00, 100.06, 100.00, 100.05)); t += 60;   // bar40: raw cross up
  bars.push(bar(t, 100.05, 100.05, 99.90, 99.95)); t += 60;     // bar41 (3m bucket close for bar40): whipsaws back down
  bars.push(bar(t, 99.95, 99.95, 99.85, 99.90)); t += 60;       // bar42: stays down
  for (let i = 0; i < 20; i++) { const v = 100.05 + i * 0.05; bars.push(bar(t, v, v + 0.02, v - 0.01, v)); t += 60; }  // genuine sustained ramp

  // dir:'long' isolates the up-cross read -- the SAME whipsaw bar also
  // satisfies its own (separately confirmable) down-cross read, which would
  // otherwise win the race by occurring earlier than the later up-move.
  const unconfirmed = simulateVwapSession(bars, { mode: 'vwap_trend_cross', dir: 'long', confirmTfMinutes: 1, costPct: 0.012 });
  ok(unconfirmed.filled && unconfirmed.side === 'BUY', 'confirmTfMinutes=1 (default): fires on the raw whipsaw cross');
  ok(unconfirmed.outcome === 'reverse_cross', `confirmTfMinutes=1: the whipsaw itself reverses fast (got ${unconfirmed.outcome})`);

  const confirmed = simulateVwapSession(bars, { mode: 'vwap_trend_cross', dir: 'long', confirmTfMinutes: 3, costPct: 0.012 });
  ok(confirmed.filled && confirmed.side === 'BUY', 'confirmTfMinutes=3: still fills, on the later confirmed cross');
  ok(confirmed.entry > unconfirmed.entry, 'confirmTfMinutes=3: entry is LATER (post-whipsaw) than the unconfirmed version, not the same bar');
}

// ── 11) vwap_trend_cross minCrossSigma: skips a tiny cross, takes a clear one ──
// warmupBars:40 skips the ENTIRE alternating-warmup region -- warmup()'s own
// ±0.02 alternation flips sign every single bar (fine for band tests, which
// only look at the touch-bar wick; a raw close-vs-vwap cross reader picks up
// that alternation itself as spurious "crosses" if the scan starts inside it).
{
  const bars = warmup();   // alternating ±0.02 around 100 -> VWAP=100, σ=0.02
  let t = 40 * 60;
  bars.push(bar(t, 100.00, 100.02, 99.99, 100.01)); t += 60;    // tiny cross: +0.01 ≈ 0.5σ
  for (let i = 0; i < 10; i++) { bars.push(flat(t, 100.01)); t += 60; }   // holds just above, never a big move
  const r0 = simulateVwapSession(bars, { mode: 'vwap_trend_cross', dir: 'long', warmupBars: 40, minCrossSigma: 1.0, costPct: 0.012 });
  ok(!r0.filled, 'minCrossSigma=1.0: a sub-σ cross (+0.01 ≈ 0.5σ) is skipped, not traded');

  const bars2 = warmup();
  let t2 = 40 * 60;
  bars2.push(bar(t2, 100.00, 100.07, 99.99, 100.06)); t2 += 60;   // clear cross: +0.06 = 3σ
  for (let i = 0; i < 10; i++) { bars2.push(flat(t2, 100.06)); t2 += 60; }
  const r1 = simulateVwapSession(bars2, { mode: 'vwap_trend_cross', dir: 'long', warmupBars: 40, minCrossSigma: 1.0, costPct: 0.012 });
  ok(r1.filled && r1.side === 'BUY', 'minCrossSigma=1.0: a clear 3σ cross still fires');
}

// ── 12) vwap_trend_cross requireTrendRegime: gate wiring, threshold 0 vs impossible ──
// adxThreshold:0 always passes (ADX>=0 by construction) -- proves the gate is
// wired and reads a real (if still-warming-up) ADX value, without needing to
// hand-tune Wilder-smoothed ADX's own lag to a precise magnitude.
{
  const bars = Array.from({ length: 60 }, (_, i) => flat(i * 60, 100));
  let t = 60 * 60;
  for (let i = 0; i < 30; i++) { const v = 100.05 + i * 0.05; bars.push(bar(t, v, v + 0.02, v - 0.01, v)); t += 60; }
  const easy = simulateVwapSession(bars, { mode: 'vwap_trend_cross', requireTrendRegime: true, adxThreshold: 0, costPct: 0.012 });
  ok(easy.filled, 'requireTrendRegime with a trivial threshold (0) still fires on a real trend');
  const impossible = simulateVwapSession(bars, { mode: 'vwap_trend_cross', requireTrendRegime: true, adxThreshold: 999, costPct: 0.012 });
  ok(!impossible.filled, 'requireTrendRegime with an impossible threshold (999) suppresses the trade entirely');
}

// ── 13) vwap_trend_cross excludeSession: a cross inside the excluded session is skipped ──
{
  // Bars start at epoch 0 -> every bar lands in UTC hour 0 ('Asia', per this
  // file's own sessionOf boundaries), so excludeSession='Asia' must suppress
  // an otherwise-valid cross entirely.
  const bars = Array.from({ length: 40 }, (_, i) => flat(i * 60, 100));
  let t = 40 * 60;
  for (let i = 0; i < 20; i++) { const v = 100.05 + i * 0.02; bars.push(bar(t, v, v + 0.01, v - 0.005, v)); t += 60; }
  const excluded = simulateVwapSession(bars, { mode: 'vwap_trend_cross', excludeSession: 'Asia', costPct: 0.012 });
  ok(!excluded.filled, "excludeSession='Asia': suppresses a cross that happens during that session");
  const notExcluded = simulateVwapSession(bars, { mode: 'vwap_trend_cross', excludeSession: 'London', costPct: 0.012 });
  ok(notExcluded.filled, "excludeSession='London': unaffected when the cross happens in a different session");
}

// ── 14) vwap_trend_cross MAE: max adverse excursion tracked from the real path ──
// This mode has no stop at all (unlike every fade-family test in this study) --
// maePrice/maeSigma exist to check whether the null is (also) a fat-tail-risk
// problem. Engineered path: entry at 100.10, a deliberate dip to low=99.95
// right after entry (adverse = 0.15), then price resumes up and never
// reverse-crosses VWAP, so it rides to session_close -- isolating MAE from
// the exit-outcome logic.
{
  const bars = Array.from({ length: 40 }, (_, i) => flat(i * 60, 100));   // flat warmup, VWAP=100, σ=0
  let t = 40 * 60;
  bars.push(bar(t, 100.05, 100.06, 100.04, 100.05)); t += 60;   // bar40: raw cross up -> confirmed entry trigger (entryIdx=40)
  bars.push(bar(t, 100.10, 100.10, 100.10, 100.10)); t += 60;   // bar41 = entryIdx+1 -> entryPx = open = 100.10
  bars.push(bar(t, 100.08, 100.09, 99.95, 100.06));  t += 60;   // bar42: dips to low=99.95 -> adverse = entryPx - low = 0.15
  for (let i = 0; i < 15; i++) { const v = 100.10 + i * 0.05; bars.push(bar(t, v, v + 0.02, v - 0.01, v)); t += 60; }  // resumes up, never reverse-crosses -> session_close

  const { sd } = computeSessionVwap(bars);
  const expectedMaeSigma = +(0.15 / sd[40]).toFixed(3);

  const r = simulateVwapSession(bars, { mode: 'vwap_trend_cross', costPct: 0.012 });
  ok(r.filled && r.side === 'BUY', 'MAE test: filled long on the up-cross');
  ok(r.outcome === 'session_close', `MAE test: no reversal -> rides to session close (got ${r.outcome})`);
  ok(approx(r.maePrice, 0.15, 1e-6), `MAE test: worst adverse excursion = entry(100.10) - lowest low(99.95) = 0.15 (got ${r.maePrice})`);
  ok(approx(r.maeSigma, expectedMaeSigma, 1e-3), `MAE test: maeSigma = maePrice / σ-at-entry (got ${r.maeSigma}, expected ${expectedMaeSigma})`);
}

// ── 15) vwap_trend_cross stopSigma: a real forward-walked stop, not a retroactive cap ──
// Reuses test 14's exact path: entry@100.10, a dip to low=99.95 right after
// entry (~19.4σ adverse at that σ=0 warmup scale), then price recovers and
// rides to session_close with no stop. stopSigma=2 should trigger an early
// 'stopped' exit AT the stop level (not the bar's wick price) during that dip.
{
  const bars = Array.from({ length: 40 }, (_, i) => flat(i * 60, 100));
  let t = 40 * 60;
  bars.push(bar(t, 100.05, 100.06, 100.04, 100.05)); t += 60;
  bars.push(bar(t, 100.10, 100.10, 100.10, 100.10)); t += 60;   // entryIdx+1 -> entryPx=100.10
  bars.push(bar(t, 100.08, 100.09, 99.95, 100.06));  t += 60;   // dip -> should trip a 2σ stop
  for (let i = 0; i < 15; i++) { const v = 100.10 + i * 0.05; bars.push(bar(t, v, v + 0.02, v - 0.01, v)); t += 60; }

  const { sd } = computeSessionVwap(bars);
  const expectedStopLevel = 100.10 - 2 * sd[40];

  const stopped = simulateVwapSession(bars, { mode: 'vwap_trend_cross', costPct: 0.012, stopSigma: 2 });
  ok(stopped.filled && stopped.side === 'BUY', 'stopSigma=2: still fills long on the up-cross');
  ok(stopped.outcome === 'stopped', `stopSigma=2: the dip trips the stop before the natural exit (got ${stopped.outcome})`);
  ok(approx(stopped.exit, expectedStopLevel, 1e-6), `stopSigma=2: exits AT the stop level (entry - 2σ), not the bar's wick (got ${stopped.exit}, expected ${expectedStopLevel})`);
  ok(stopped.pnl_pct < 0, `stopSigma=2: a stopped-out trade is a realized loss (got ${stopped.pnl_pct})`);

  // A stop so wide it's never touched must behave identically to no stop at all (test 14's baseline).
  const untouched = simulateVwapSession(bars, { mode: 'vwap_trend_cross', costPct: 0.012, stopSigma: 30 });
  ok(untouched.outcome === 'session_close', `stopSigma=30 (never hit): falls back to the natural exit (got ${untouched.outcome})`);
  ok(approx(untouched.pnl_pct, 0.6873, 1e-3), 'stopSigma=30 (never hit): pnl matches the no-stop baseline from test 14');
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
