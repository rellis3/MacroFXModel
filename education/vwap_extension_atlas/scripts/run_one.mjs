/**
 * VWAP Extension Atlas — per-instrument analysis. Runs the pure walk
 * (js/vwapExtensionAtlasEngine.js) over the real M1 archive and builds a
 * REFERENCE BOOK (per MD files/REFERENCE_ENGINE_PLAYBOOK.md §4.2): cell =
 * (side, extAtrThreshold), crossed with every context dimension, each
 * bucket carrying n / IS rate / OOS rate / delta-vs-base / a `holds`
 * boolean (§3.2: n>=30 both halves, same sign both halves, |delta|>=3pp
 * both halves — no p-values, just "did it happen again on unseen data").
 *
 * This is a REFERENCE BOOK, not a signal search (§3.3): every dimension
 * bucket is reported, not just the exciting ones, and there is no
 * after-cost/tradeability filter anywhere in this file.
 *
 * Primary outcome reported per dimension: touchedVwapAfter (did price fade
 * back to VWAP before day end) — the direct answer to "does it fade back to
 * vwap". didExtendFurtherFirst / avg peakExtAtr / avg pctRetraced /
 * wentToOppositeSide are reported per CELL (not gated per-dimension) as
 * supporting magnitude context.
 *
 * Usage: node run_one.mjs <pairKey> <outDir> [assetClass] [m1Dir]
 */
import { loadM1ForPair } from '../../../js/volBacktestM1Engine.js';
import { vwapExtensionAtlasWalk } from '../../../js/vwapExtensionAtlasEngine.js';
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
const { rows, coverage } = vwapExtensionAtlasWalk(packed, { instrument: pair, assetClass });
console.error(`${pair}: walked ${rows.length} rows in ${Date.now() - t1}ms — coverage`, coverage);

// ── IS/OOS split — 60/40 by date, this repo's standard convention ──────────
function splitAt(rowsSorted, frac = 0.6) {
  if (!rowsSorted.length) return { is: [], oos: [], splitDate: null };
  const dates = [...new Set(rowsSorted.map(r => r.date))].sort();
  const splitIdx = Math.floor(dates.length * frac);
  const splitDate = dates[splitIdx] ?? dates.at(-1);
  return {
    is: rowsSorted.filter(r => r.date < splitDate),
    oos: rowsSorted.filter(r => r.date >= splitDate),
    splitDate,
  };
}

function rate(rowsSubset, pred) {
  if (!rowsSubset.length) return null;
  const hits = rowsSubset.filter(pred).length;
  return { n: rowsSubset.length, pct: +(100 * hits / rowsSubset.length).toFixed(1) };
}

const DIMENSIONS = [
  'session', 'sessionPos', 'dow', 'dayVolRegime', 'rangeConsumedBucket',
  'dayType', 'htfTrend', 'momAdx', 'wtMtf', 'wtSlow', 'approachSpeed',
];

function approachSpeedBucket(v) {
  if (v == null) return null;
  return v < 0.3 ? '1·grind' : v > 0.7 ? '3·climax' : '2·normal';
}
function dimValue(r, dim) {
  if (dim === 'approachSpeed') return approachSpeedBucket(r.approachSpeedAtr);
  if (dim === 'dow') return String(r.dow);
  return r[dim];
}

function annotateHolds(dims, baseIS, baseOOS, { minN = 30, minDelta = 3 } = {}) {
  for (const dim of Object.values(dims)) {
    for (const bucket of Object.keys(dim.is)) {
      const bi = dim.is[bucket], bo = dim.oos[bucket];
      const dIS = bi.pct != null && baseIS.pct != null ? +(bi.pct - baseIS.pct).toFixed(1) : null;
      const dOOS = bo && bo.pct != null && baseOOS.pct != null ? +(bo.pct - baseOOS.pct).toFixed(1) : null;
      bi.deltaVsBase = dIS;
      if (bo) bo.deltaVsBase = dOOS;
      const holds = bo != null && dIS != null && dOOS != null
        && bi.n >= minN && bo.n >= minN
        && Math.sign(dIS) === Math.sign(dOOS) && dIS !== 0
        && Math.abs(dIS) >= minDelta && Math.abs(dOOS) >= minDelta;
      bi.holds = !!holds;
      if (bo) bo.holds = !!holds;
    }
  }
}

function buildCellBook(cellRows) {
  const { is, oos, splitDate } = splitAt([...cellRows].sort((a, b) => a.date.localeCompare(b.date)));
  const baseIS = rate(is, r => r.touchedVwapAfter);
  const baseOOS = rate(oos, r => r.touchedVwapAfter);
  const dims = {};
  for (const dim of DIMENSIONS) {
    const bucketsIS = {}, bucketsOOS = {};
    const values = new Set([...is, ...oos].map(r => dimValue(r, dim)).filter(v => v != null));
    for (const v of values) {
      const isSub = is.filter(r => dimValue(r, dim) === v);
      const oosSub = oos.filter(r => dimValue(r, dim) === v);
      const bi = rate(isSub, r => r.touchedVwapAfter);
      const bo = rate(oosSub, r => r.touchedVwapAfter);
      if (bi) bucketsIS[v] = bi;
      if (bo) bucketsOOS[v] = bo;
    }
    dims[dim] = { is: bucketsIS, oos: bucketsOOS };
  }
  if (baseIS && baseOOS) annotateHolds(dims, baseIS, baseOOS);

  const magnitude = subset => ({
    n: subset.length,
    touchedVwapPct: rate(subset, r => r.touchedVwapAfter)?.pct ?? null,
    didExtendFurtherPct: rate(subset, r => r.didExtendFurtherFirst)?.pct ?? null,
    wentToOppositeSidePct: rate(subset.filter(r => r.touchedVwapAfter), r => r.wentToOppositeSide)?.pct ?? null,
    unresolvedPct: rate(subset, r => r.unresolvedAtDayEnd)?.pct ?? null,
    avgPeakExtAtr: subset.length ? +(subset.reduce((s, r) => s + r.peakExtAtr, 0) / subset.length).toFixed(3) : null,
    avgPctRetraced: (() => {
      const withVal = subset.filter(r => r.pctRetraced != null);
      return withVal.length ? +(withVal.reduce((s, r) => s + r.pctRetraced, 0) / withVal.length).toFixed(3) : null;
    })(),
    avgBarsToVwapTouch: (() => {
      const touched = subset.filter(r => r.touchedVwapAfter);
      return touched.length ? Math.round(touched.reduce((s, r) => s + r.barsToVwapTouch, 0) / touched.length) : null;
    })(),
  });

  return {
    n: cellRows.length, splitDate,
    base: { is: baseIS, oos: baseOOS },
    magnitudeFull: magnitude(cellRows), magnitudeIS: magnitude(is), magnitudeOOS: magnitude(oos),
    dims,
  };
}

const cells = {};
for (const side of ['up', 'down']) {
  const sideRows = rows.filter(r => r.side === side);
  const thresholds = [...new Set(sideRows.map(r => r.extAtrThreshold))].sort((a, b) => a - b);
  for (const thr of thresholds) {
    const key = `${side}|${thr}`;
    const cellRows = sideRows.filter(r => r.extAtrThreshold === thr);
    cells[key] = buildCellBook(cellRows);
  }
}

const heldCount = Object.values(cells).reduce((s, c) =>
  s + Object.values(c.dims).reduce((s2, d) => s2 + Object.values(d.is).filter(b => b.holds).length, 0), 0);
const totalBucketCount = Object.values(cells).reduce((s, c) =>
  s + Object.values(c.dims).reduce((s2, d) => s2 + Object.keys(d.is).length, 0), 0);
console.error(`${pair}: ${heldCount}/${totalBucketCount} dimension buckets hold OOS (n>=30 both halves, same sign, |delta|>=3pp both halves)`);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/${pair}.rows.json`, JSON.stringify(rows));
fs.writeFileSync(`${outDir}/${pair}.book.json`, JSON.stringify({ instrument: pair, assetClass, coverage, cells }, null, 2));
console.error(`${pair}: wrote ${outDir}/${pair}.rows.json (${rows.length} rows) and ${outDir}/${pair}.book.json`);
