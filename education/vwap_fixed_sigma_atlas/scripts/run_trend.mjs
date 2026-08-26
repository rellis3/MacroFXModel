/**
 * VWAP Fixed-Sigma Atlas — the TREND question, not the trade question:
 * when a fixed-sigma band is touched, does price actually get back to
 * VWAP, when, and does it extend further first? Uses
 * resolutionMode:'returnToVwap' (session-capped, censored not discarded —
 * see the engine's own header) instead of the fixed-window MFE/MAE mode
 * `run_one.mjs` reports. Same reference-book discipline: no after-cost
 * gate, every dimension reported honestly, holds gated on OOS.
 *
 * Usage: node run_trend.mjs <pairKey> <outDir> [assetClass] [m1Dir]
 */
import { loadM1ForPair } from '../../../js/volBacktestM1Engine.js';
import { vwapFixedSigmaAtlasWalk } from '../../../js/vwapFixedSigmaAtlasEngine.js';
import { assetClass as assetClassOf } from '../../../js/instrumentRegistry.js';
import fs from 'fs';

const pair = process.argv[2];
const outDir = process.argv[3];
const forcedAssetClass = process.argv[4] || undefined;
const m1Dir = process.argv[5] || undefined;
if (!pair || !outDir) { console.error('usage: run_trend.mjs <pairKey> <outDir> [assetClass] [m1Dir]'); process.exit(1); }

const t0 = Date.now();
const packed = m1Dir ? await loadM1ForPair(pair, m1Dir) : await loadM1ForPair(pair);
if (!packed) { console.error(`${pair}: no data — cannot run`); process.exit(2); }
console.error(`${pair}: loaded ${packed.n} M1 bars in ${Date.now() - t0}ms`);

let assetClass = forcedAssetClass;
if (!assetClass) { try { assetClass = assetClassOf(pair) || 'fx'; } catch { assetClass = 'fx'; } }

const t1 = Date.now();
const { rows, coverage } = vwapFixedSigmaAtlasWalk(packed, { instrument: pair, assetClass, resolutionMode: 'returnToVwap' });
console.error(`${pair}: walked ${rows.length} events in ${Date.now() - t1}ms — coverage`, coverage);

function splitAt(rowsSorted, frac = 0.6) {
  const dates = [...new Set(rowsSorted.map(r => r.date))].sort();
  const splitDate = dates[Math.floor(dates.length * frac)] ?? dates.at(-1);
  return { is: rowsSorted.filter(r => r.date < splitDate), oos: rowsSorted.filter(r => r.date >= splitDate), splitDate };
}
function rate(rows, pred) {
  if (!rows.length) return null;
  return { n: rows.length, pct: +(100 * rows.filter(pred).length / rows.length).toFixed(1) };
}
function annotateHolds(dims, baseIS, baseOOS, { minN = 30, minDelta = 3 } = {}) {
  for (const dim of Object.values(dims)) {
    for (const bucket of Object.keys(dim.is)) {
      const bi = dim.is[bucket], bo = dim.oos[bucket];
      const dIS = bi.pct != null && baseIS.pct != null ? +(bi.pct - baseIS.pct).toFixed(1) : null;
      const dOOS = bo && bo.pct != null && baseOOS.pct != null ? +(bo.pct - baseOOS.pct).toFixed(1) : null;
      bi.deltaVsBase = dIS;
      if (bo) bo.deltaVsBase = dOOS;
      const holds = bo != null && dIS != null && dOOS != null && bi.n >= minN && bo.n >= minN
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
    const { is, oos } = splitAt(cellRows);
    const baseIS = rate(is, r => r.touchedVwapAfter), baseOOS = rate(oos, r => r.touchedVwapAfter);
    const dims = {};
    for (const dim of DIMENSIONS) {
      const bucketsIS = {}, bucketsOOS = {};
      const values = new Set([...is, ...oos].map(r => dimValue(r, dim)).filter(v => v != null));
      for (const v of values) {
        const bi = rate(is.filter(r => dimValue(r, dim) === v), r => r.touchedVwapAfter);
        const bo = rate(oos.filter(r => dimValue(r, dim) === v), r => r.touchedVwapAfter);
        if (bi) bucketsIS[v] = bi;
        if (bo) bucketsOOS[v] = bo;
      }
      dims[dim] = { is: bucketsIS, oos: bucketsOOS };
    }
    if (baseIS && baseOOS) annotateHolds(dims, baseIS, baseOOS);
    const mean = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
    cells[`${side}|${level}`] = {
      n: cellRows.length,
      touchedVwapPct: rate(cellRows, r => r.touchedVwapAfter)?.pct ?? null,
      didExtendFurtherPct: rate(cellRows, r => r.didExtendFurtherFirst)?.pct ?? null,
      wentToOppositePct: rate(cellRows.filter(r => r.touchedVwapAfter), r => r.wentToOppositeSide)?.pct ?? null,
      unresolvedPct: rate(cellRows, r => r.unresolvedAtDayEnd)?.pct ?? null,
      avgPeakExtSigma: mean(cellRows.map(r => r.peakExtSigma))?.toFixed(3) ?? null,
      avgBarsToVwapTouch: (() => { const t = cellRows.filter(r => r.touchedVwapAfter); return t.length ? Math.round(mean(t.map(r => r.barsToVwapTouch))) : null; })(),
      dims,
    };
  }
}

const heldCount = Object.values(cells).reduce((s, c) => s + Object.values(c.dims).reduce((s2, d) => s2 + Object.values(d.is).filter(b => b.holds).length, 0), 0);
const totalBucketCount = Object.values(cells).reduce((s, c) => s + Object.values(c.dims).reduce((s2, d) => s2 + Object.keys(d.is).length, 0), 0);
console.error(`${pair}: ${heldCount}/${totalBucketCount} dimension buckets hold OOS (n>=30 both halves, same sign, |Δ|>=3pp both halves)`);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/${pair}.trend.rows.json`, JSON.stringify(rows));
fs.writeFileSync(`${outDir}/${pair}.trend.book.json`, JSON.stringify({ instrument: pair, assetClass, coverage, cells }, null, 2));
console.error(`${pair}: wrote ${outDir}/${pair}.trend.rows.json (${rows.length} rows) and ${outDir}/${pair}.trend.book.json`);
