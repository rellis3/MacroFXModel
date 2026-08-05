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
 *
 * Every timeframe's bars are resampled up front so each one can look up the
 * NEXT-HIGHER requested timeframe's trend regime at the moment a pattern
 * confirmed (annotateHtfAlignment) — e.g. does a 15m bull-flag candidate
 * agree with what the 1h is doing. The highest requested timeframe has no
 * higher context available and gets htf: null.
 */

delete process.env.R2_ACCESS_KEY;
delete process.env.R2_SECRET_KEY;

import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { resampleBars, runPatternScan, annotateHtfAlignment, confidenceBucketStats } from '../js/patternEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'analysis', 'output', 'pattern-lab');

const TF_LABELS = { 1: '1m', 5: '5m', 15: '15m', 30: '30m', 60: '1h', 240: '4h', 1440: '1d' };

async function main() {
  const pair = (process.argv[2] || 'eurusd').toLowerCase();
  const timeframes = (process.argv[3] || '5,15,30,60,240,1440').split(',').map(Number).sort((a, b) => a - b);

  console.log(`[pattern-lab] loading M1 for ${pair}…`);
  const t0 = Date.now();
  const packed = await loadM1ForPair(pair);
  if (!packed) {
    console.error(`[pattern-lab] no M1 data found for ${pair}`);
    process.exit(1);
  }
  console.log(`[pattern-lab] loaded ${packed.n.toLocaleString()} M1 bars in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Resample every requested timeframe once, up front, so HTF lookups below
  // don't re-decode the parquet per pair of timeframes.
  const byMinutes = new Map();
  for (const minutes of timeframes) byMinutes.set(minutes, resampleBars(packed, minutes));

  const result = { pair, generatedAt: new Date().toISOString(), m1Bars: packed.n, timeframes: {} };
  const scans = new Map(); // minutes -> { bars, instances, stats, structure }

  for (const minutes of timeframes) {
    const label = TF_LABELS[minutes] || `${minutes}m`;
    const tBar = Date.now();
    const bars = byMinutes.get(minutes);
    const scan = runPatternScan(bars, {});
    scans.set(minutes, { bars, ...scan });
    const elapsed = ((Date.now() - tBar) / 1000).toFixed(1);
    console.log(`[pattern-lab] ${label}: ${bars.length.toLocaleString()} bars → ${scan.instances.length} pattern instances (${elapsed}s)`);
  }

  for (const minutes of timeframes) {
    const label = TF_LABELS[minutes] || `${minutes}m`;
    const scan = scans.get(minutes);
    const higher = timeframes.find(m => m > minutes);
    let htfLabel = null;
    if (higher) {
      htfLabel = TF_LABELS[higher] || `${higher}m`;
      annotateHtfAlignment(scan.instances, scans.get(higher).bars, scans.get(higher).structure, htfLabel);
    }

    result.timeframes[label] = {
      minutes,
      barCount: scan.bars.length,
      firstBarTime: scan.bars[0]?.time ?? null,
      lastBarTime: scan.bars[scan.bars.length - 1]?.time ?? null,
      htfTimeframe: htfLabel,
      stats: scan.stats,
      confidenceBuckets: confidenceBucketStats(scan.instances),
      // Cap the instance payload — full stats above are computed over every
      // instance found; only the most recent N are shipped to keep the JSON
      // (and dashboard) light. shownCount/totalCount make the cap visible.
      totalCount: scan.instances.length,
      shownCount: Math.min(scan.instances.length, 500),
      instances: scan.instances.slice(-500),
    };
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `${pair}.json`);
  writeFileSync(outFile, JSON.stringify(result));
  console.log(`[pattern-lab] wrote ${outFile}`);

  console.log('\n=== Summary ===');
  for (const [label, tf] of Object.entries(result.timeframes)) {
    console.log(`\n${label} (${tf.barCount.toLocaleString()} bars, htf=${tf.htfTimeframe || 'none'}):`);
    for (const s of tf.stats) {
      const playedOut = s.playedOutRatePct == null ? 'n/a' : `${s.playedOutRatePct}%`;
      console.log(`  ${s.type.padEnd(24)} n=${String(s.count).padEnd(5)} playedOut=${String(playedOut).padEnd(7)} hit=${s.hitRatePct}%  avgRet=${s.avgForwardReturnPct}%  avgDur=${s.avgDurationBars}bars  avgConf=${s.avgConfidence}`);
    }
    console.log('  confidence buckets:', tf.confidenceBuckets.map(b => `${b.range}=n${b.count}/hit${b.hitRatePct}%`).join('  '));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
