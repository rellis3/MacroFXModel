/**
 * Pullback-continuation trade test (2026-08-23, evidence-driven follow-up).
 *
 * Real Discord screenshots of actual trades, checked against real market
 * data (see FADE_EXTENSION_TRADE.md's "evidence" addendum / conversation
 * log), didn't match the -9.5..10.5 extension ladder at all — instead they
 * matched (a) entries near the impulse candle's own edge rather than a deep
 * extension, and (b) for one confirmed example (NAS100, 2026-08-13), a
 * classic 38.2-61.8% Fibonacci pullback INTO the impulse before continuing
 * in its own direction. Also: the 0.6 min body/range ratio filter was
 * silently excluding real, large impulse candles (found by checking a real
 * trade against the detector) — this run uses minBodyRatio=0.3 instead,
 * detected FRESH (not reusing the 0.6-threshold data/*.impulses.json).
 *
 * See simulateRetracementContinuationTrade in
 * js/impulse4hRangeLevelsEngine.js for every pinned judgment call named.
 *
 * Usage: node retracement_continuation_trade.mjs <pairKey> <dataDir> [m1Dir]
 */
import { loadM1ForPair } from '../../../js/volBacktestM1Engine.js';
import {
  buildH4, detectImpulses, DEFAULT_CFG, metaFor, splitByDateFrac,
  simulateRetracementContinuationTrade,
} from '../../../js/impulse4hRangeLevelsEngine.js';
import { summarizeTrades } from '../../../js/metricsCore.js';
import fs from 'fs';

const pair = process.argv[2];
const dataDir = process.argv[3];
const m1Dir = process.argv[4] || undefined;
if (!pair || !dataDir) { console.error('usage: retracement_continuation_trade.mjs <pairKey> <dataDir> [m1Dir]'); process.exit(1); }

function isoDate(epochSec) { return new Date(epochSec * 1000).toISOString().slice(0, 10); }

const t0 = Date.now();
const packed = m1Dir ? await loadM1ForPair(pair, m1Dir) : await loadM1ForPair(pair);
if (!packed) { console.error(`${pair}: no M1 data — cannot run`); process.exit(2); }
const { h4Bars, atr } = buildH4(packed);
const cfg = { ...DEFAULT_CFG, minBodyRatio: 0.3 };
const impulses = detectImpulses(h4Bars, atr, cfg);
console.error(`${pair}: loaded ${packed.n} M1 bars, ${h4Bars.length} H4 bars, ${impulses.length} impulses at minBodyRatio=0.3 (was ${DEFAULT_CFG.minBodyRatio}), in ${Date.now() - t0}ms`);

// Identical horizon-bounding to runImpulse4hRangeLevels in the engine
// itself (js/impulse4hRangeLevelsEngine.js) — copied exactly, not
// reimplemented from scratch, since this is a fresh (0.3-threshold)
// impulse set and can't reuse the saved 0.6-threshold data/*.impulses.json's
// own m1StartIdx/m1EndIdx.
const H4 = 4 * 3600;
const horizonM1Bars = cfg.horizonH4Bars * 240; // 4h = 240 minutes
function bsearch(times, t) { let lo = 0, hi = times.length; while (lo < hi) { const m = (lo + hi) >>> 1; if (times[m] < t) lo = m + 1; else hi = m; } return lo; }
function m1BoundsFor(idx) {
  const imp = impulses[idx];
  const startTime = imp.time + H4;
  const nextImpTime = idx + 1 < impulses.length ? impulses[idx + 1].time : Infinity;
  const capTime = imp.time + horizonM1Bars * 60;
  const endTime = Math.min(nextImpTime, capTime);
  const m1StartIdx = bsearch(packed.times, startTime);
  const m1EndIdx = Math.min(packed.n, bsearch(packed.times, endTime));
  return { m1StartIdx, m1EndIdx };
}

const costPct = metaFor(pair).costPct;
const rows = [];
for (let idx = 0; idx < impulses.length; idx++) {
  const imp = impulses[idx];
  const { m1StartIdx, m1EndIdx } = m1BoundsFor(idx);
  const r = simulateRetracementContinuationTrade(packed, imp, m1StartIdx, m1EndIdx, cfg, costPct);
  if (r.triggered && r.filled) rows.push({ date: isoDate(imp.time), bullish: imp.bullish, rangeAtrMult: imp.rangeAtrMult, bodyRatio: imp.bodyRatio, ...r });
}

const pnls = rows.map(r => r.netPct);
const dates = rows.map(r => r.date);
const full = summarizeTrades(pnls, dates);
const { is, oos } = splitByDateFrac(rows, 0.4, 'date');
const isSum = summarizeTrades(is.map(r => r.netPct), is.map(r => r.date));
const oosSum = summarizeTrades(oos.map(r => r.netPct), oos.map(r => r.date));

const out = {
  pair, minBodyRatio: cfg.minBodyRatio, nImpulses: impulses.length,
  nTriggeredFilled: rows.length, triggerRate: +(rows.length / impulses.length).toFixed(4),
  full, is: isSum, oos: oosSum, trades: rows,
};
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(`${dataDir}/${pair}.retracement_continuation_trade.json`, JSON.stringify(out, null, 2));
console.error(`${pair}: n=${rows.length}/${impulses.length} (${(out.triggerRate * 100).toFixed(1)}%) full: sharpe=${full.sharpe} win%=${full.winRate} PF=${full.profitFactor}   IS: sharpe=${isSum.sharpe} win%=${isSum.winRate} n=${isSum.trades}   OOS: sharpe=${oosSum.sharpe} win%=${oosSum.winRate} n=${oosSum.trades}   total ${Date.now() - t0}ms`);
