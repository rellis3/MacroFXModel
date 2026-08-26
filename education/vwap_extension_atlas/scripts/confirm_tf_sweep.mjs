/**
 * VWAP Extension Atlas — confirmation-timeframe sweep. Same threshold=1.0
 * unit as RESULTS.md's headline table, swept across confirmTfMinutes =
 * 1/5/15/30/60/240 (M1 wick / 5m / 15m / 30m / 1h / 4h close) to check
 * whether the base touch-back rate and the session findings are stable to
 * how the crossing/touch is confirmed, or an artifact of counting raw M1
 * wicks. Reuses the cached M1 packed archive already loaded for the main
 * run — no re-fetch.
 *
 * Usage: node confirm_tf_sweep.mjs <pairKey> <assetClass> [m1Dir]
 */
import { loadM1ForPair } from '../../../js/volBacktestM1Engine.js';
import { vwapExtensionAtlasWalk } from '../../../js/vwapExtensionAtlasEngine.js';
import fs from 'fs';

const pair = process.argv[2];
const assetClass = process.argv[3] || 'fx';
const m1Dir = process.argv[4] || undefined;
if (!pair) { console.error('usage: confirm_tf_sweep.mjs <pairKey> [assetClass] [m1Dir]'); process.exit(1); }

const packed = m1Dir ? await loadM1ForPair(pair, m1Dir) : await loadM1ForPair(pair);
if (!packed) { console.error(`${pair}: no data`); process.exit(2); }

function rate(rows, pred) {
  if (!rows.length) return null;
  return +(100 * rows.filter(pred).length / rows.length).toFixed(1);
}
function splitAt(rowsSorted, frac = 0.6) {
  const dates = [...new Set(rowsSorted.map(r => r.date))].sort();
  const splitDate = dates[Math.floor(dates.length * frac)] ?? dates.at(-1);
  return { is: rowsSorted.filter(r => r.date < splitDate), oos: rowsSorted.filter(r => r.date >= splitDate) };
}

const TFS = [1, 5, 15, 30, 60, 240];
const out = { instrument: pair, byTf: {} };
for (const tf of TFS) {
  const { rows } = vwapExtensionAtlasWalk(packed, { instrument: pair, assetClass, thresholds: [1.0], confirmTfMinutes: tf });
  const byCell = {};
  for (const side of ['up', 'down']) {
    const sideRows = rows.filter(r => r.side === side).sort((a, b) => a.date.localeCompare(b.date));
    const base = rate(sideRows, r => r.touchedVwapAfter);
    const sessions = {};
    for (const sess of ['Asia', 'London', 'NY']) {
      const sessRows = sideRows.filter(r => r.session === sess);
      const { is, oos } = splitAt(sessRows);
      sessions[sess] = { n: sessRows.length, touchPct: rate(sessRows, r => r.touchedVwapAfter), isN: is.length, isPct: rate(is, r => r.touchedVwapAfter), oosN: oos.length, oosPct: rate(oos, r => r.touchedVwapAfter) };
    }
    byCell[side] = { n: sideRows.length, basePct: base, sessions };
  }
  out.byTf[tf] = byCell;
  console.error(`${pair} tf=${tf}m: up n=${byCell.up.n} base=${byCell.up.basePct}% | down n=${byCell.down.n} base=${byCell.down.basePct}%`);
}

const outPath = `education/vwap_extension_atlas/data/${pair}.confirm_tf_sweep.json`;
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.error(`wrote ${outPath}`);
