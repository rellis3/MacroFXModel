/**
 * VWAP Fixed-Sigma Atlas — per-instrument analysis. Runs the owner's own
 * indicator, ported 1:1 (js/vwapFixedSigmaAtlasEngine.js), over the real M1
 * archive and reports MFE/MAE-in-σ by cell (side, level) crossed against
 * every context dimension, including the new multi-timeframe divergence
 * agreement count — the confluence question the owner actually asked for.
 * No after-cost gate: MFE/MAE-in-σ are reported honestly as distributions,
 * not converted into a P&L without an explicit entry/exit/cost model.
 *
 * Usage: node run_one.mjs <pairKey> <outDir> [assetClass] [m1Dir]
 */
import { loadM1ForPair } from '../../../js/volBacktestM1Engine.js';
import { vwapFixedSigmaAtlasWalk } from '../../../js/vwapFixedSigmaAtlasEngine.js';
import { assetClass as assetClassOf } from '../../../js/instrumentRegistry.js';
import fs from 'fs';

const pair = process.argv[2];
const outDir = process.argv[3];
const forcedAssetClass = process.argv[4] || undefined;
const m1Dir = process.argv[5] || undefined;
if (!pair || !outDir) { console.error('usage: run_one.mjs <pairKey> <outDir> [assetClass] [m1Dir]'); process.exit(1); }

const t0 = Date.now();
const packed = m1Dir ? await loadM1ForPair(pair, m1Dir) : await loadM1ForPair(pair);
if (!packed) { console.error(`${pair}: no data — cannot run`); process.exit(2); }
console.error(`${pair}: loaded ${packed.n} M1 bars in ${Date.now() - t0}ms`);

let assetClass = forcedAssetClass;
if (!assetClass) { try { assetClass = assetClassOf(pair) || 'fx'; } catch { assetClass = 'fx'; } }

const t1 = Date.now();
const { rows, coverage } = vwapFixedSigmaAtlasWalk(packed, { instrument: pair, assetClass });
console.error(`${pair}: walked ${rows.length} events in ${Date.now() - t1}ms — coverage`, coverage);

function splitAt(rowsSorted, frac = 0.6) {
  const dates = [...new Set(rowsSorted.map(r => r.date))].sort();
  const splitDate = dates[Math.floor(dates.length * frac)] ?? dates.at(-1);
  return { is: rowsSorted.filter(r => r.date < splitDate), oos: rowsSorted.filter(r => r.date >= splitDate), splitDate };
}
function stats(subset) {
  if (!subset.length) return null;
  const mean = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
  return {
    n: subset.length,
    avgMfeSigma: +mean(subset.map(r => r.mfeSigma)).toFixed(3),
    avgMaeSigma: +mean(subset.map(r => r.maeSigma)).toFixed(3),
    netSigma: +mean(subset.map(r => r.mfeSigma - r.maeSigma)).toFixed(3),
    reachedFullRR: +(100 * subset.filter(r => r.mfeSigma >= r.maeSigma).length / subset.length).toFixed(1),
  };
}
function annotateHolds(dims, baseIS, baseOOS, { minN = 30, minDelta = 0.1 } = {}) {
  for (const dim of Object.values(dims)) {
    for (const bucket of Object.keys(dim.is)) {
      const bi = dim.is[bucket], bo = dim.oos[bucket];
      const dIS = bi.netSigma - baseIS.netSigma, dOOS = bo ? bo.netSigma - baseOOS.netSigma : null;
      bi.deltaVsBase = +dIS.toFixed(3);
      if (bo) bo.deltaVsBase = +dOOS.toFixed(3);
      const holds = bo != null && bi.n >= minN && bo.n >= minN
        && Math.sign(dIS) === Math.sign(dOOS) && dIS !== 0 && Math.abs(dIS) >= minDelta && Math.abs(dOOS) >= minDelta;
      bi.holds = !!holds;
      if (bo) bo.holds = !!holds;
    }
  }
}

const DIMENSIONS = ['session', 'dow', 'htfTrend', 'momAdx', 'dayType', 'sigmaPctile', 'divAgree'];
function dimValue(r, dim) { return dim === 'dow' ? String(r.dow) : dim === 'divAgree' ? String(r.divAgree) : r[dim]; }

const cells = {};
for (const side of ['short', 'long']) {
  for (const level of [2, 2.5, 3]) {
    const cellRows = rows.filter(r => r.side === side && r.level === level).sort((a, b) => a.date.localeCompare(b.date));
    const { is, oos, splitDate } = splitAt(cellRows);
    const baseIS = stats(is), baseOOS = stats(oos);
    const dims = {};
    for (const dim of DIMENSIONS) {
      const bucketsIS = {}, bucketsOOS = {};
      const values = new Set([...is, ...oos].map(r => dimValue(r, dim)).filter(v => v != null));
      for (const v of values) {
        const si = stats(is.filter(r => dimValue(r, dim) === v));
        const so = stats(oos.filter(r => dimValue(r, dim) === v));
        if (si) bucketsIS[v] = si;
        if (so) bucketsOOS[v] = so;
      }
      dims[dim] = { is: bucketsIS, oos: bucketsOOS };
    }
    if (baseIS && baseOOS) annotateHolds(dims, baseIS, baseOOS);
    cells[`${side}|${level}`] = { n: cellRows.length, splitDate, base: { is: baseIS, oos: baseOOS }, full: stats(cellRows), dims };
  }
}

const heldCount = Object.values(cells).reduce((s, c) => s + Object.values(c.dims).reduce((s2, d) => s2 + Object.values(d.is).filter(b => b.holds).length, 0), 0);
const totalBucketCount = Object.values(cells).reduce((s, c) => s + Object.values(c.dims).reduce((s2, d) => s2 + Object.keys(d.is).length, 0), 0);
console.error(`${pair}: ${heldCount}/${totalBucketCount} dimension buckets hold OOS (n>=30 both halves, same sign, |Δnet-σ|>=0.1 both halves)`);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/${pair}.rows.json`, JSON.stringify(rows));
fs.writeFileSync(`${outDir}/${pair}.book.json`, JSON.stringify({ instrument: pair, assetClass, coverage, cells }, null, 2));
console.error(`${pair}: wrote ${outDir}/${pair}.rows.json (${rows.length} rows) and ${outDir}/${pair}.book.json`);
