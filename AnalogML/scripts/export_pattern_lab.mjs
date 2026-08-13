#!/usr/bin/env node
// export_pattern_lab.mjs — dumps js/patternEngine.js's already-built shape
// detections (flags/pennants, head & shoulders, double/triple tops/bottoms,
// triangles/channels) to JSON for AnalogML's Python side to run through the
// SAME honest-harness discipline (real costs, real calendar IS/OOS split)
// every other AnalogML check uses.
//
// Not a new detector -- js/patternEngine.js already runs this exact scan for
// pattern-lab.html/the /api/pattern-lab/scan route (server.js). This script
// calls the SAME functions directly (no server needed) so Python can validate
// what's already detected, instead of re-detecting shapes in Python.
//
// Usage: node AnalogML/scripts/export_pattern_lab.mjs <pair> [pivotN]
//   node AnalogML/scripts/export_pattern_lab.mjs gbpjpy
//
// Writes AnalogML/data/pattern_lab_export/<pair>.json
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { resampleBars, computeATR, runPatternScan } from '../../js/patternEngine.js';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'data', 'pattern_lab_export');

async function main() {
  const pair = process.argv[2];
  if (!pair) throw new Error('usage: node export_pattern_lab.mjs <pair>');
  const minutes = 60; // 1h -- same timeframe AnalogML's motif signal was validated on, for apples-to-apples

  console.log(`[load] ${pair} M1...`);
  const packed = await loadM1ForPair(pair);
  if (!packed) throw new Error(`no M1 data for ${pair}`);
  console.log(`[load] ${packed.n} M1 bars`);

  const bars = resampleBars(packed, minutes);
  console.log(`[resample] ${bars.length} ${minutes}m bars, ${new Date(bars[0].time * 1000).toISOString()} -> ${new Date(bars[bars.length - 1].time * 1000).toISOString()}`);

  const atr = computeATR(bars, 14);
  const { instances, stats } = runPatternScan(bars, {});
  console.log(`[scan] ${instances.length} total instances across all shape families`);

  const byType = {};
  for (const inst of instances) byType[inst.type] = (byType[inst.type] || 0) + 1;
  console.log('[scan] by type:', JSON.stringify(byType));

  const out = instances.map(inst => ({
    type: inst.type,
    startIdx: inst.startIdx, startTime: inst.startTime,
    confirmIdx: inst.confirmIdx, confirmTime: inst.confirmTime,
    direction: inst.direction,
    expectedDirection: inst.expectedDirection ?? null,
    playedOut: inst.playedOut ?? null,
    confidence: inst.confidence?.total ?? null,
    outcome: inst.outcome ? {
      entry: inst.outcome.entry, target: inst.outcome.target, stop: inst.outcome.stop,
      outcome: inst.outcome.outcome, barsToOutcome: inst.outcome.barsToOutcome,
      forwardReturnPct: inst.outcome.forwardReturnPct,
      mfePct: inst.outcome.mfePct, maePct: inst.outcome.maePct,
      endTime: inst.outcome.endTime,
    } : null,
  }));

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${pair}.json`);
  writeFileSync(outPath, JSON.stringify({ pair, timeframeMinutes: minutes, generatedAt: new Date().toISOString(), instances: out }, null, 2));
  console.log(`[write] ${outPath} (${out.length} instances)`);
}

main().catch(e => { console.error(e); process.exit(1); });
