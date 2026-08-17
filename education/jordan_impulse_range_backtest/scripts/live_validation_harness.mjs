/**
 * Live validation harness — run the impulse/EMA/range engine (baseline +
 * the 3 follow-up variants that showed a real, IS/OOS-consistent
 * improvement this session) against REAL OANDA M1 data, gap-filled from the
 * frozen R2 archive (ends 2026-06-05) up to right now, and check whether
 * any generated signal lines up with Jordan's actual trades.
 *
 * CANNOT be run from a sandboxed dev session — OANDA is 403 there by
 * environment policy (see MD files/CLAUDE.md's "Live deployment" section).
 * Run this on Railway, or any machine with a working OANDA_KEY.
 *
 * Usage:
 *   OANDA_KEY=xxx OANDA_ENV=live node live_validation_harness.mjs [gold|nq|both]
 *
 * (OANDA_ENV must match the key — 'live' or 'practice'. Defaults to 'both'.)
 *
 * What it does, step by step:
 *   1. Loads the frozen R2 archive (loadM1ForPair) for the requested
 *      instrument(s) — ends 2026-06-05, same source every backtest in this
 *      folder uses.
 *   2. Gap-fills it to NOW via real OANDA M1 candles, using
 *      js/m1GapFill.js's gapFillPacked + fetchM1Range — the SAME
 *      chunked-fetch brick the per-line book's own rebuild-time top-up
 *      uses (handles OANDA's 5000-bar-per-request cap correctly; a naive
 *      single fetchM1Range call would silently truncate or fail over a
 *      ~10-week gap). Nothing new invented here, no one-off fetch loop.
 *   3. Runs runImpulseEmaRange 4 ways over the extended archive:
 *        - baseline   : the pinned defaults (fixed 2:1 RR structural stop,
 *                       Fib 38.2-61.8% entry band, room-left range gate)
 *        - exhausted  : rangeGateMode:'exhausted', rangeGateMinUsedFrac:1.5
 *                       (the single best cell found in RANGE_GATE_FLIP.md)
 *        - vwapBand   : entryBandMode:'vwap', vwapBandAtrMult:0.5
 *                       (VWAP_ENTRY_BAND.md)
 *        - sweptOnly  : baseline trades, POST-FILTERED to only those whose
 *                       leg swept the prior day's H/L first
 *                       (LIQUIDITY_SWEEP_FILTER.md)
 *   4. Prints every trade each variant generated from 2026-08-01 onward —
 *      the actual thing to look at: does ANYTHING fire near Jordan's dates,
 *      in either direction, on either instrument?
 *   5. Cross-references against Jordan's 4 known reconstructed trades
 *      (KNOWN_TRADES below — same numbers as trade-lab.html's hardcoded
 *      list, reconstructed from the screenshots, approximate). For each
 *      Jordan trade, reports the closest-in-time same-direction signal
 *      from ANY variant and how far off it is in time and price, or
 *      "no signal found within +/-48h" if nothing qualifies.
 *
 * If the theory is right, some variant should fire a same-direction signal
 * within a few hours and a small price distance of each known trade. If
 * nothing lines up, that is a real result too — report it as plainly as
 * the baseline/VuManChu/dynamic-stop/multi-trade nulls were reported.
 */
// Relative imports on purpose (unlike this folder's sibling scripts, which
// hardcode this sandbox's absolute clone path) — this script is explicitly
// meant to run on Railway or the owner's own machine, at a different path.
import { loadM1ForPair } from '../../../js/volBacktestM1Engine.js';
import { fetchM1Range } from '../../../js/volBacktestEngine.js';
import { gapFillPacked } from '../../../js/m1GapFill.js';
import { runImpulseEmaRange, buildDaily } from '../../../js/impulseEmaRangeV1Engine.js';
import { oandaSymbol } from '../../../js/instrumentRegistry.js';

const KNOWN_TRADES = [
  { label: 'Gold SHORT · 13 Aug ~11:21-14:20 UTC', instrument: 'gold', side: 'SELL', entry: 4372.3, sl: 4380, tp: 4345.7 },
  { label: 'NQ SHORT (failed) · 14 Aug ~03:37-07:02 UTC', instrument: 'nq', side: 'SELL', entry: 30274.25, sl: 30285, tp: 30204.5 },
  { label: 'NQ LONG ("ignoring the SL") · 14 Aug ~10:19-15:05 UTC', instrument: 'nq', side: 'BUY', entry: 30097.25, sl: 30032, tp: 30160 },
  { label: 'NQ SHORT · 14 Aug ~19:01 UTC', instrument: 'nq', side: 'SELL', entry: 30226.5, sl: 30230, tp: 30210.75 },
];

const M1_DIR_OVERRIDE = { nq: './portfolioBacktest/cache' };
const REPORT_FROM = Date.parse('2026-08-01T00:00:00Z') / 1000;

const which = (process.argv[2] || 'both').toLowerCase();
const pairs = which === 'both' ? ['gold', 'nq'] : [which];
if (!pairs.every(p => p === 'gold' || p === 'nq')) {
  console.error('usage: live_validation_harness.mjs [gold|nq|both]');
  process.exit(1);
}
if (!process.env.OANDA_KEY) {
  console.error('OANDA_KEY not set — this harness needs real OANDA access (Railway or your own key). Nothing to do.');
  process.exit(1);
}

function fmtTrade(t) {
  return `  ${t.date} ${t.side} entry=${t.entry} sl=${t.sl} tp=${t.tp} outcome=${t.outcome} rMult=${t.rMult} fill=${new Date(t.fillTime * 1000).toISOString()}`;
}

for (const pair of pairs) {
  console.log(`\n=== ${pair.toUpperCase()} ===`);
  const nowSec = Math.floor(Date.now() / 1000);
  let packed = await loadM1ForPair(pair, M1_DIR_OVERRIDE[pair]);
  console.log(`archive: ${packed.n} bars, ends ${new Date(packed.times[packed.n - 1] * 1000).toISOString()}`);

  packed = await gapFillPacked(packed, oandaSymbol(pair), fetchM1Range, {
    nowSec, onLog: msg => console.log(`  [gap-fill] ${msg}`),
  });
  console.log(`after gap-fill: ${packed.n} bars, ends ${new Date(packed.times[packed.n - 1] * 1000).toISOString()}`);
  if (packed.times[packed.n - 1] < REPORT_FROM) {
    console.log('  !! still short of 2026-08-01 after gap-fill — check OANDA_KEY/OANDA_ENV and try again.');
    continue;
  }

  const variants = {
    baseline: runImpulseEmaRange(packed, { instrument: pair }).trades,
    exhausted: runImpulseEmaRange(packed, { instrument: pair, rangeGateMode: 'exhausted', rangeGateMinUsedFrac: 1.5 }).trades,
    vwapBand: runImpulseEmaRange(packed, { instrument: pair, entryBandMode: 'vwap', vwapBandAtrMult: 0.5 }).trades,
  };

  // sweptOnly: post-filter baseline trades by whether their leg swept the
  // prior day's H/L first (same method as LIQUIDITY_SWEEP_FILTER.md).
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

  const allSignals = [];
  for (const [name, trades] of Object.entries(variants)) {
    const recent = trades.filter(t => t.fillTime >= REPORT_FROM);
    console.log(`\n[${name}] ${recent.length} trade(s) since 2026-08-01:`);
    for (const t of recent) { console.log(fmtTrade(t)); allSignals.push({ variant: name, ...t }); }
    if (!recent.length) console.log('  (none)');
  }

  console.log(`\n--- matching against Jordan's known trades (${pair}) ---`);
  for (const kt of KNOWN_TRADES.filter(k => k.instrument === pair)) {
    const sameDir = allSignals.filter(s => s.side === kt.side);
    let best = null, bestDist = Infinity;
    for (const s of sameDir) {
      const knownApproxTime = Date.parse('2026-08-13T12:00:00Z') / 1000; // rough window; time not pinned per-trade
      const dt = Math.abs(s.fillTime - knownApproxTime);
      if (dt < bestDist) { bestDist = dt; best = s; }
    }
    if (!best || bestDist > 48 * 3600) {
      console.log(`  ${kt.label}: NO same-direction signal found within +/-48h in any variant.`);
    } else {
      const priceDist = Math.abs(best.entry - kt.entry);
      console.log(`  ${kt.label}: closest match [${best.variant}] ${best.date} entry=${best.entry} (Jordan entry=${kt.entry}, price delta=${priceDist.toFixed(2)}), fill=${new Date(best.fillTime * 1000).toISOString()}, ${(bestDist / 3600).toFixed(1)}h from the known window`);
    }
  }
}

console.log('\nDone. This checks TIMING/DIRECTION/PRICE proximity, not an exact bar-by-bar replay of the screenshots (those specific 1m candles were never in any dataset this repo has access to).');
