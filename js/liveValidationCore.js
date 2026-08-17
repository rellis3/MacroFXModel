/**
 * Live-OANDA validation core — pure orchestration, no CLI/DOM/console
 * dependency, so both the CLI script
 * (education/jordan_impulse_range_backtest/scripts/live_validation_harness.mjs)
 * and the server's async-job route (/api/live-validation/*) call the SAME
 * implementation, per this repo's Lego Principle 1 (one shared core,
 * imported — never copied).
 *
 * Loads the frozen R2 archive, gap-fills it to NOW via real OANDA M1
 * (js/m1GapFill.js's gapFillPacked + fetchM1Range — the same chunked-fetch
 * brick the per-line book's own rebuild-time top-up uses), runs
 * js/impulseEmaRangeV2Engine.js 4 ways (baseline, exhausted-range, VWAP
 * band, liquidity-sweep post-filter), and cross-references against
 * Jordan's 4 known reconstructed trades (same numbers as trade-lab.html's
 * KNOWN_TRADES) for timing/direction/price proximity.
 *
 * v1 (js/impulseEmaRangeV1Engine.js) is never touched — v2 runs at
 * v1-matching defaults for 'baseline', verified byte-identical to v1's own
 * committed baseline trades.json (see v2's file header).
 */
import { loadM1ForPair } from './volBacktestM1Engine.js';
import { fetchM1Range } from './volBacktestEngine.js';
import { gapFillPacked } from './m1GapFill.js';
import { runImpulseEmaRange, buildDaily } from './impulseEmaRangeV2Engine.js';
import { oandaSymbol } from './instrumentRegistry.js';

export const KNOWN_TRADES = [
  { label: 'Gold SHORT · 13 Aug ~11:21-14:20 UTC', instrument: 'gold', side: 'SELL', entry: 4372.3, sl: 4380, tp: 4345.7 },
  { label: 'NQ SHORT (failed) · 14 Aug ~03:37-07:02 UTC', instrument: 'nq', side: 'SELL', entry: 30274.25, sl: 30285, tp: 30204.5 },
  { label: 'NQ LONG ("ignoring the SL") · 14 Aug ~10:19-15:05 UTC', instrument: 'nq', side: 'BUY', entry: 30097.25, sl: 30032, tp: 30160 },
  { label: 'NQ SHORT · 14 Aug ~19:01 UTC', instrument: 'nq', side: 'SELL', entry: 30226.5, sl: 30230, tp: 30210.75 },
];

const M1_DIR_OVERRIDE = { nq: './portfolioBacktest/cache' };
const REPORT_FROM = Date.parse('2026-08-01T00:00:00Z') / 1000;
const KNOWN_APPROX_TIME = Date.parse('2026-08-13T12:00:00Z') / 1000;

// pair: 'gold' | 'nq'. onLog: optional (msg) => void for progress lines.
export async function runLiveValidation(pair, { onLog = () => {} } = {}) {
  if (!process.env.OANDA_KEY) throw new Error('OANDA_KEY not set — this needs real OANDA access.');

  const nowSec = Math.floor(Date.now() / 1000);
  let packed = await loadM1ForPair(pair, M1_DIR_OVERRIDE[pair]);
  const archiveEnd = packed.times[packed.n - 1];
  onLog(`${pair}: archive ${packed.n} bars, ends ${new Date(archiveEnd * 1000).toISOString()}`);

  packed = await gapFillPacked(packed, oandaSymbol(pair), fetchM1Range, {
    nowSec, onLog: msg => onLog(`  [gap-fill] ${msg}`),
  });
  const newEnd = packed.times[packed.n - 1];
  onLog(`${pair}: after gap-fill, ends ${new Date(newEnd * 1000).toISOString()}`);
  const freshEnough = newEnd >= REPORT_FROM;

  const variants = {
    baseline: runImpulseEmaRange(packed, { instrument: pair }).trades,
    exhausted: runImpulseEmaRange(packed, { instrument: pair, rangeGateMode: 'exhausted', rangeGateMinUsedFrac: 1.5 }).trades,
    vwapBand: runImpulseEmaRange(packed, { instrument: pair, entryBandMode: 'vwap', vwapBandAtrMult: 0.5 }).trades,
  };

  const daily = buildDaily(packed);
  const DAY = 86400;
  const dayIndexByKey = new Map(daily.map((d, i) => [d.time, i]));
  variants.sweptOnly = variants.baseline.filter(t => {
    const originDayKey = t.legOriginTime - (t.legOriginTime % DAY);
    const di = dayIndexByKey.get(originDayKey);
    if (di == null || di === 0) return false;
    const prior = daily[di - 1];
    return t.legDir === 'up' ? t.legOrigin < prior.low : t.legOrigin > prior.high;
  });

  const recentByVariant = {};
  const allSignals = [];
  for (const [name, trades] of Object.entries(variants)) {
    const recent = trades.filter(t => t.fillTime >= REPORT_FROM);
    recentByVariant[name] = recent;
    for (const t of recent) allSignals.push({ variant: name, ...t });
  }

  const matches = KNOWN_TRADES.filter(k => k.instrument === pair).map(kt => {
    const sameDir = allSignals.filter(s => s.side === kt.side);
    let best = null, bestDist = Infinity;
    for (const s of sameDir) {
      const dt = Math.abs(s.fillTime - KNOWN_APPROX_TIME);
      if (dt < bestDist) { bestDist = dt; best = s; }
    }
    if (!best || bestDist > 48 * 3600) return { known: kt, found: false };
    return {
      known: kt, found: true, variant: best.variant, date: best.date,
      entry: best.entry, sl: best.sl, tp: best.tp, fillTime: best.fillTime,
      priceDelta: +Math.abs(best.entry - kt.entry).toFixed(2),
      hoursFromKnownWindow: +(bestDist / 3600).toFixed(1),
    };
  });

  return {
    pair, archiveEnd, gapFilledEnd: newEnd, freshEnough,
    recentByVariant, matches,
  };
}
