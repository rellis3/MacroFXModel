// Level Base Rates, Honest — 2026-09-11
//
// The most basic question, asked cleanly: when price touches a level (p50,
// p75, p90 — up or down side), does it tend to CONTINUE past it (break
// through to the next rung) or FADE (reverse back), with no context
// dimensions layered on at all. This is the bedrock the vote's per-dimension
// tilts sit on top of — worth re-confirming solid on its own, honestly,
// before rebuilding anything on top of it.
//
// Honest = split into a real in-sample block and a real, never-touched
// out-of-sample block (same 10-year-bounded data, same split logic
// buildBarrierTrades/the book use), report BOTH so a rate that only exists
// in-sample is visible as exactly that, not silently trusted.
//
// PURE ANALYSIS. Read-only, no persistence, no book/vote involved at all.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { splitAt } from '../js/levelAtlasReport.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { boundPacked, LOOKBACK_DAYS } from '../js/levelAtlasRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');
const REARM = 0.3;

const ALL_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const PAIRS = process.env.LA_PAIRS ? process.env.LA_PAIRS.split(',') : ALL_PAIRS;

function rate(touches) {
  const n = touches.length;
  if (!n) return null;
  const out = touches.filter(t => t.outcome === 'out').length;
  const back = touches.filter(t => t.outcome === 'back').length;
  const neither = n - out - back;
  const outPct = 100 * out / n, backPct = 100 * back / n;
  // Binomial z-test: is outPct meaningfully different from 50/50 among DECIDED
  // (out+back) touches -- 'neither' is a real third outcome, reported
  // separately, but the continuation-vs-fade QUESTION is about the two that
  // actually resolved.
  const decided = out + back;
  const p = decided > 0 ? out / decided : null;
  const se = p != null ? Math.sqrt(p * (1 - p) / decided) : null;
  const z = se > 0 ? (p - 0.5) / se : 0;
  return { n, outPct: +outPct.toFixed(1), backPct: +backPct.toFixed(1), neitherPct: +(100 * neither / n).toFixed(1), decided, outPctOfDecided: p != null ? +(p * 100).toFixed(1) : null, z: +z.toFixed(2) };
}

const perPairResults = [];

for (const pair of PAIRS) {
  console.log(`${pair.toUpperCase()}: loading M1...`);
  const packed0 = await loadM1ForPair(pair);
  const packed = boundPacked(packed0, LOOKBACK_DAYS);
  const assetClass = assetClassFor(pair);
  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [REARM], pendingRearmFrac: REARM });
  const atRearm = touches.filter(t => t.rearmFrac === REARM);
  const { split } = splitAt(atRearm);
  const isBlock = atRearm.filter(t => t.date < split);
  const oosBlock = atRearm.filter(t => t.date >= split);
  console.log(`  ${atRearm.length} touches, split ${split} (IS ${isBlock.length} / OOS ${oosBlock.length})`);

  const cells = {};
  for (const side of ['up', 'down']) {
    for (const rung of ['p50', 'p75', 'p90']) {
      const isRows = isBlock.filter(t => t.side === side && t.rung === rung);
      const oosRows = oosBlock.filter(t => t.side === side && t.rung === rung);
      cells[`${side}|${rung}`] = { is: rate(isRows), oos: rate(oosRows) };
    }
  }
  perPairResults.push({ pair: pair.toUpperCase(), splitDate: split, cells });
}

console.log('\n' + '='.repeat(100));
console.log('LEVEL BASE RATES — continuation (out) vs fade (back), no context, honest IS/OOS split');
console.log('='.repeat(100));
console.log('pair'.padEnd(8), 'cell'.padEnd(10), 'IS: n'.padEnd(8), 'out%'.padEnd(7), 'z'.padEnd(7), '| OOS: n'.padEnd(9), 'out%'.padEnd(7), 'z'.padEnd(7), 'neither%');
for (const { pair, cells } of perPairResults) {
  for (const [cellKey, { is, oos }] of Object.entries(cells)) {
    if (!is || !oos) continue;
    console.log(
      pair.padEnd(8), cellKey.padEnd(10),
      String(is.n).padEnd(8), String(is.outPctOfDecided).padEnd(7), String(is.z).padEnd(7),
      '|', String(oos.n).padEnd(8), String(oos.outPctOfDecided).padEnd(7), String(oos.z).padEnd(7), String(oos.neitherPct)
    );
  }
}

// Pooled per cell, across all pairs -- the cross-instrument consistency check
console.log('\n--- POOLED across all pairs, per cell (the real test: does the SAME cell agree across independent instruments) ---');
const pooledCells = {};
for (const { pair, cells } of perPairResults) {
  for (const [cellKey, { is, oos }] of Object.entries(cells)) {
    if (!oos) continue;
    const p = (pooledCells[cellKey] ??= { outOOS: 0, backOOS: 0, nPairsLeanOut: 0, nPairsLeanBack: 0, nPairsTotal: 0 });
    p.outOOS += Math.round(oos.n * oos.outPct / 100);
    p.backOOS += Math.round(oos.n * oos.backPct / 100);
    p.nPairsTotal++;
    if (oos.outPctOfDecided > 50) p.nPairsLeanOut++; else if (oos.outPctOfDecided < 50) p.nPairsLeanBack++;
  }
}
for (const [cellKey, p] of Object.entries(pooledCells)) {
  const decided = p.outOOS + p.backOOS;
  const pct = decided > 0 ? 100 * p.outOOS / decided : null;
  const se = pct != null ? Math.sqrt((pct / 100) * (1 - pct / 100) / decided) * 100 : null;
  const z = se > 0 ? (pct - 50) / se : 0;
  console.log(`${cellKey.padEnd(10)} pooled OOS out%=${pct?.toFixed(1)}  z=${z.toFixed(2)}  (n=${decided})  |  ${p.nPairsLeanOut}/${p.nPairsTotal} pairs lean continuation, ${p.nPairsLeanBack}/${p.nPairsTotal} lean fade`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'level_base_rates_honest.json'), JSON.stringify({ perPairResults, pooledCells }, null, 1));
console.log(`\nWrote ${OUT_DIR}/level_base_rates_honest.json`);
