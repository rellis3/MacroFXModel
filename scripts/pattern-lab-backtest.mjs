#!/usr/bin/env node
/**
 * Runs the pattern-detection engine (js/patternEngine.js) over full M1
 * history for one instrument, across a set of timeframes, and writes the
 * results to analysis/output/pattern-lab/{pair}.json for the pattern-lab
 * dashboard (and server API) to read without recomputing.
 *
 * Usage: node scripts/pattern-lab-backtest.mjs [pair] [tf1,tf2,...]
 *   e.g. node scripts/pattern-lab-backtest.mjs eurusd 5,15,30,60,240,1440
 *
 * Forces local-disk parquet loading (skips R2) so this runs standalone
 * without network credentials — VolRangeForecaster/data/m1/ already has
 * every instrument's M1 parquet on disk.
 */

delete process.env.R2_ACCESS_KEY;
delete process.env.R2_SECRET_KEY;

import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { resampleBars, runPatternScan } from '../js/patternEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'analysis', 'output', 'pattern-lab');

const TF_LABELS = { 1: '1m', 5: '5m', 15: '15m', 30: '30m', 60: '1h', 240: '4h', 1440: '1d' };

async function main() {
  const pair = (process.argv[2] || 'eurusd').toLowerCase();
  const timeframes = (process.argv[3] || '5,15,30,60,240,1440').split(',').map(Number);

  console.log(`[pattern-lab] loading M1 for ${pair}…`);
  const t0 = Date.now();
  const packed = await loadM1ForPair(pair);
  if (!packed) {
    console.error(`[pattern-lab] no M1 data found for ${pair}`);
    process.exit(1);
  }
  console.log(`[pattern-lab] loaded ${packed.n.toLocaleString()} M1 bars in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const result = { pair, generatedAt: new Date().toISOString(), m1Bars: packed.n, timeframes: {} };

  for (const minutes of timeframes) {
    const label = TF_LABELS[minutes] || `${minutes}m`;
    const tBar = Date.now();
    const bars = resampleBars(packed, minutes);
    const { instances, stats } = runPatternScan(bars, {});
    const elapsed = ((Date.now() - tBar) / 1000).toFixed(1);
    console.log(`[pattern-lab] ${label}: ${bars.length.toLocaleString()} bars → ${instances.length} pattern instances (${elapsed}s)`);

    result.timeframes[label] = {
      minutes,
      barCount: bars.length,
      firstBarTime: bars[0]?.time ?? null,
      lastBarTime: bars[bars.length - 1]?.time ?? null,
      stats,
      // Cap the instance payload — full stats above are computed over every
      // instance found; only the most recent N are shipped to keep the JSON
      // (and dashboard) light. shownCount/totalCount make the cap visible.
      totalCount: instances.length,
      shownCount: Math.min(instances.length, 500),
      instances: instances.slice(-500),
    };
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `${pair}.json`);
  writeFileSync(outFile, JSON.stringify(result));
  console.log(`[pattern-lab] wrote ${outFile}`);

  console.log('\n=== Summary ===');
  for (const [label, tf] of Object.entries(result.timeframes)) {
    console.log(`\n${label} (${tf.barCount.toLocaleString()} bars):`);
    for (const s of tf.stats) {
      console.log(`  ${s.type.padEnd(24)} n=${String(s.count).padEnd(5)} hit=${s.hitRatePct}%  avgRet=${s.avgForwardReturnPct}%  avgDur=${s.avgDurationBars}bars  avgBarsToOutcome=${s.avgBarsToOutcome}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
