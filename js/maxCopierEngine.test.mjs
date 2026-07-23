// js/maxCopierEngine.test.mjs
// Offline, network-free unit tests for the Max Copier engine on synthetic data.
// Run:  node js/maxCopierEngine.test.mjs
import {
  runMaxCopier, compareMaxCopier, traceMaxCopier, EXIT_MODES,
  swingLows, swingHighs, hasHiddenDivergence,
} from './maxCopierEngine.js';

let failures = 0;
const ok = (name, cond, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) failures++;
};

// ── Deterministic synthetic M1 builder ───────────────────────────────────────
// Builds a packed series (epoch-second Int32 times, Float ohlc) whose price path
// contains exactly one clean long setup: flat base → 1h impulse up → tight
// consolidation → pullback into the value area → continuation up.
function buildPacked() {
  const t0 = Math.floor(1700000000 / 3600) * 3600; // hour-aligned
  const price = (i) => {
    if (i < 900)  return 100 + 0.05 * Math.sin(i / 3);          // 15h flat base
    if (i < 960)  return 100 + ((i - 900) / 59) * 1.0;          // 1h impulse → 101.0
    if (i < 1080) return 100.8 + 0.2 * Math.sin((i - 960) / 5); // 2h consolidation 100.6–101.0
    if (i < 1120) return 100.8 - ((i - 1080) / 39) * 0.15;      // pullback → 100.65 (below VAL)
    return 100.65 + ((i - 1120) / 319) * 1.35;                  // continuation → 102.0
  };
  const n = 1440;
  const times = new Int32Array(n), opens = new Float32Array(n), highs = new Float32Array(n),
        lows = new Float32Array(n), closes = new Float32Array(n), volumes = new Float32Array(n);
  let prev = price(0);
  for (let i = 0; i < n; i++) {
    const c = price(i), o = prev;
    times[i] = t0 + i * 60;
    opens[i] = o; closes[i] = c;
    highs[i] = Math.max(o, c) + 0.02;
    lows[i]  = Math.min(o, c) - 0.02;
    volumes[i] = 100;
    prev = c;
  }
  return { n, times, opens, highs, lows, closes, volumes };
}

const TEST_OPTS = {
  donchianLookback: 10, impulseAtrMult: 0.3, consolBars: 8, consolMaxAtr: 50,
  vaDepth: 0.3, entryTimeout: 40, stopAtrBuffer: 0.5, requireDivergence: false,
  divergenceSource: 'rsi', minGapBars: 5, nPositions: 4, maxHoldBarsM15: 40,
  atrPeriod: 10, rsiPeriod: 14, oosFrac: 0.4,
};

console.log('[divergence helpers]');
{
  const lows = [10, 9, 5, 9, 10, 11, 10, 6, 10, 11];
  const highs = [1, 2, 8, 2, 1, 0, 1, 7, 1, 0];
  const swL = swingLows(lows, 0, 9, 2);
  ok('swingLows finds the two troughs', swL.length === 2 && swL[0] === 2 && swL[1] === 7, JSON.stringify(swL));
  const swH = swingHighs(highs, 0, 9, 2);
  ok('swingHighs finds the two peaks', swH.length === 2 && swH[0] === 2 && swH[1] === 7, JSON.stringify(swH));

  // Bullish hidden div: higher low in price (6 > 5), lower low in RSI (30 < 40).
  const rsiDiv = [50, 45, 40, 45, 50, 55, 50, 30, 50, 55];
  ok('bullish hidden divergence detected',
    hasHiddenDivergence('long', { highs, lows }, rsiDiv, 0, 9, 2) === true);
  // No div when RSI also makes a higher low (50 > 40).
  const rsiNo = [50, 45, 40, 45, 50, 55, 50, 50, 50, 55];
  ok('no divergence when RSI confirms price',
    hasHiddenDivergence('long', { highs, lows }, rsiNo, 0, 9, 2) === false);
  // Bearish hidden div: lower high in price (7 < 8), higher high in RSI.
  const rsiBear = [50, 55, 40, 55, 50, 45, 50, 60, 50, 45];
  ok('bearish hidden divergence detected',
    hasHiddenDivergence('short', { highs, lows }, rsiBear, 0, 9, 2) === true);
}

console.log('[pipeline on synthetic long setup]');
{
  const packed = buildPacked();
  const run = runMaxCopier(packed, 'eurusd', TEST_OPTS);
  ok('detects ≥1 signal', run.signalCount >= 1, `signals=${run.signalCount}`);
  ok('all three exit modes present',
    EXIT_MODES.every((m) => run.modes[m] && Array.isArray(run.modes[m].records)));

  const fr = run.modes.fixed_r;
  ok('fixed_r produced a basket record', fr.records.length >= 1);
  ok('basket has nPositions position rows', fr.positions.length === fr.records.length * TEST_OPTS.nPositions,
    `${fr.positions.length} vs ${fr.records.length * TEST_OPTS.nPositions}`);

  const allPos = EXIT_MODES.flatMap((m) => run.modes[m].positions);
  ok('every position pnl/R is finite', allPos.every((p) => Number.isFinite(p.pnlPct) && Number.isFinite(p.pnlR)));
  ok('MAE is reported non-positive (≤0)', allPos.every((p) => p.maePct <= 1e-9));
  ok('stop distance is positive', allPos.every((p) => p.slDist > 0));
  ok('exit reasons are from the known set',
    allPos.every((p) => ['tp', 'stop', 'trail', 'time'].includes(p.reason)));
  ok('long continuation is net profitable on this path',
    fr.records.every((r) => r.pnl_pct > 0));

  // ladder_trail must vary position outcomes (rungs + runner), not clone one exit.
  const lt = run.modes.ladder_trail;
  if (lt.records.length) {
    const first = lt.positions.slice(0, TEST_OPTS.nPositions);
    ok('ladder_trail positions are not all identical',
      new Set(first.map((p) => p.pnlR)).size > 1, JSON.stringify(first.map((p) => p.pnlR)));
  }
}

console.log('[autopsy + trace]');
{
  const packed = buildPacked();
  const run = runMaxCopier(packed, 'eurusd', TEST_OPTS);
  const au = run.autopsy;
  ok('autopsy has premise horizons', au && au.premise && [16,32,96].every(H => au.premise[H] && Number.isFinite(au.premise[H].mean)));
  ok('autopsy premise counts impulses', au.premise[16].n >= 1, `n=${au.premise[16].n}`);
  ok('autopsy expectancy has breakeven + edgeGap', Number.isFinite(au.expectancy.breakevenWinRate) && Number.isFinite(au.expectancy.edgeGap));
  ok('autopsy exitMix reasons are known', Object.keys(au.exitMix).every(r => ['tp','stop','trail','time'].includes(r)));
  ok('autopsyRaw is present for pooling', run.autopsyRaw && run.autopsyRaw.premise && run.autopsyRaw.expectancy);
  ok('positions carry mfeR + entryTime + exitTime', run.modes.fixed_r.positions.every(p => Number.isFinite(p.mfeR) && Number.isFinite(p.entryTime) && Number.isFinite(p.exitTime) && p.exitTime >= p.entryTime));

  const tr = traceMaxCopier(packed, 'eurusd', TEST_OPTS, { mode:'fixed_r' });
  ok('trace returns candles + WaveTrend', tr.candles.length > 0 && tr.wt.length === tr.candles.length);
  ok('trace WaveTrend values finite', tr.wt.every(w => Number.isFinite(w.wt1) && Number.isFinite(w.wt2)));
  ok('trace lists ≥1 impulse mark', tr.impulses.length >= 1, `impulses=${tr.impulses.length}`);
  ok('trace trade carries entry/stop/exits', tr.trades.length >= 1 && tr.trades[0].exits.length >= 1);
}

console.log('[compare + split]');
{
  const packed = buildPacked();
  const cmp = compareMaxCopier(packed, 'gold', TEST_OPTS);
  ok('compare returns a split per mode',
    EXIT_MODES.every((m) => cmp.modes[m] && cmp.modes[m].split && cmp.modes[m].split.full));
  ok('gold is priced as commodity friction', cmp.assetClass === 'commodity' && cmp.costPct > 0);
  const full = cmp.modes.fixed_r.split.full;
  ok('summary Sharpe is finite', Number.isFinite(full.sharpe));
}

console.log('[flat market → no signal]');
{
  const n = 1440, t0 = Math.floor(1700000000 / 3600) * 3600;
  const times = new Int32Array(n), o = new Float32Array(n), h = new Float32Array(n),
        l = new Float32Array(n), c = new Float32Array(n), v = new Float32Array(n);
  for (let i = 0; i < n; i++) { times[i] = t0 + i * 60; const p = 100 + 0.03 * Math.sin(i / 4); o[i] = p; c[i] = p; h[i] = p + 0.02; l[i] = p - 0.02; v[i] = 100; }
  const run = runMaxCopier({ n, times, opens: o, highs: h, lows: l, closes: c, volumes: v }, 'eurusd', TEST_OPTS);
  ok('no impulse → no signals in a flat market', run.signalCount === 0, `signals=${run.signalCount}`);
}

console.log(failures === 0 ? '\nALL PASSED ✓' : `\n${failures} CHECK(S) FAILED ✗`);
process.exit(failures === 0 ? 0 : 1);
