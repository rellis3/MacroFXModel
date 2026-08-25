/**
 * VWAP-gated fade-the-extension trade (2026-08-23 follow-up to
 * fade_extension_trade.mjs). RESULTS.md §5's single strongest, most
 * consistent finding was that distance-from-VWAP at the extension point
 * correlates with the size of the eventual reversal — the plain fade trade
 * never used that; this gates entries by it instead of taking every fib>=2
 * touch blind.
 *
 * Records vwapDistAtrAtEntry (signed, ATR units) at the actual fill bar for
 * every triggered fade setup, splits 60/40 IS/OOS by date, then on the IS
 * half only picks a "far from VWAP" gate (median-abs-distance or top-third
 * abs-distance, vs the ungated baseline) by IS Sharpe, and reports that
 * SAME pinned gate's OOS result — same honest select-on-IS-check-on-OOS
 * discipline as fade_extension_trade.mjs's stop-rungs grid.
 *
 * Usage: node fade_extension_trade_vwap_gated.mjs <pairKey> <dataDir> [m1Dir]
 */
import { loadM1ForPair } from '../../../js/volBacktestM1Engine.js';
import {
  simulateFadeTrade, buildDailyVwapSeries, metaFor, splitByDateFrac,
} from '../../../js/impulse4hRangeLevelsEngine.js';
import { summarizeTrades } from '../../../js/metricsCore.js';
import fs from 'fs';

const pair = process.argv[2];
const dataDir = process.argv[3];
const m1Dir = process.argv[4] || undefined;
if (!pair || !dataDir) { console.error('usage: fade_extension_trade_vwap_gated.mjs <pairKey> <dataDir> [m1Dir]'); process.exit(1); }

const impulsesPath = `${dataDir}/${pair}.impulses.json`;
if (!fs.existsSync(impulsesPath)) { console.error(`${pair}: ${impulsesPath} not found — run run_analysis.mjs first`); process.exit(2); }
const impulses = JSON.parse(fs.readFileSync(impulsesPath, 'utf8'));

const t0 = Date.now();
const packed = m1Dir ? await loadM1ForPair(pair, m1Dir) : await loadM1ForPair(pair);
if (!packed) { console.error(`${pair}: no M1 data — cannot run`); process.exit(2); }
const vwapSeries = buildDailyVwapSeries(packed);
console.error(`${pair}: loaded ${packed.n} M1 bars, ${impulses.length} saved impulses, VWAP series built, in ${Date.now() - t0}ms`);

const cfg = { entryFib: 2.0, stopRungsOut: 1 };
const costPct = metaFor(pair).costPct;

const rows = [];
for (const imp of impulses) {
  const r = simulateFadeTrade(packed, imp, imp.m1StartIdx, imp.m1EndIdx, cfg, costPct, vwapSeries);
  if (r.triggered && r.filled) rows.push({ date: imp.date, bullish: imp.bullish, rangeAtrMult: imp.rangeAtrMult, ...r });
}

function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function quantile(xs, q) {
  const s = xs.slice().sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)));
  return s[idx];
}
function sumRows(rs) { return summarizeTrades(rs.map(r => r.netPct), rs.map(r => r.date)); }

const { is, oos } = splitByDateFrac(rows, 0.4, 'date');

// Gate candidates, all pinned/derived from IS only: ungated baseline, "far"
// = above IS-median |vwapDistAtrAtEntry|, "far" = above IS top-tercile
// (67th pct) |vwapDistAtrAtEntry| — a stricter gate.
const isAbsDist = is.map(r => Math.abs(r.vwapDistAtrAtEntry)).filter(Number.isFinite);
const medianCut = isAbsDist.length ? median(isAbsDist) : null;
const tercileCut = isAbsDist.length ? quantile(isAbsDist, 0.67) : null;

const candidates = [
  { label: 'ungated', filter: () => true },
  { label: `far>|median IS|=${medianCut?.toFixed(2)}`, filter: r => medianCut != null && Math.abs(r.vwapDistAtrAtEntry) >= medianCut },
  { label: `far>|top-third IS|=${tercileCut?.toFixed(2)}`, filter: r => tercileCut != null && Math.abs(r.vwapDistAtrAtEntry) >= tercileCut },
];

const results = candidates.map(c => {
  const isSub = is.filter(c.filter);
  const oosSub = oos.filter(c.filter);
  return { label: c.label, isSum: sumRows(isSub), oosSum: sumRows(oosSub), nIs: isSub.length, nOos: oosSub.length };
});

// Honest selection: pick the candidate with the best IS Sharpe, report ITS
// OOS number — never select by OOS or full-sample.
const best = results.slice().sort((a, b) => (b.isSum.sharpe ?? -99) - (a.isSum.sharpe ?? -99))[0];

const out = {
  pair,
  nImpulses: impulses.length,
  nTriggeredFilled: rows.length,
  isMedianAbsVwapDist: medianCut, isTercileAbsVwapDist: tercileCut,
  candidates: results,
  bestByIsSharpe: best,
  trades: rows,
};
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(`${dataDir}/${pair}.fade_vwap_gated.json`, JSON.stringify(out, null, 2));

console.error(`${pair}: n=${rows.length} (IS=${is.length}/OOS=${oos.length})`);
for (const r of results) {
  console.error(`  ${r.label.padEnd(28)} IS: n=${r.nIs} sharpe=${r.isSum.sharpe} win%=${r.isSum.winRate}   OOS: n=${r.nOos} sharpe=${r.oosSum.sharpe} win%=${r.oosSum.winRate}`);
}
console.error(`  BEST-BY-IS: ${best.label} -> OOS sharpe=${best.oosSum.sharpe} win%=${best.oosSum.winRate} n=${best.nOos}`);
console.error(`  total time ${Date.now() - t0}ms`);
