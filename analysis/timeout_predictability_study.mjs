// Timeout Predictability Study — 2026-09-10
//
// Direct follow-up to the 2026-09-09 look-ahead fix (js/levelAtlasVoteReview.js,
// commit 5d5966f): restoring the previously-dropped outcome:'neither' touches
// showed they win at ~47.6% (near coin-flip) vs the resolved population's
// 57.8% -- worse quality, which is why drawdown got worse once they were
// priced instead of silently excluded.
//
// This asks the natural next question: is "will this touch resolve cleanly
// or time out" PREDICTABLE, at touch time, from context already sitting in
// the book? If so, that's a real pre-trade filter -- skip or de-risk exactly
// the population we now know drags on quality, rather than a generic
// indicator hunt.
//
// PURE ANALYSIS. Does not touch buildBarrierTrades, voteDecision, the live
// bot, or level-atlas-vote-portfolio.html -- reuses buildAtlasBook exactly as
// already built and reads a field it already computes for every dimension/
// bucket (`neitherPct`), which nothing currently reads. No new tabulation
// logic, no new M1 walk logic -- same walk, same book, a different question
// asked of data that already exists.
//
// Method: for every (side,rung) cell x dimension x bucket already in the
// book, compute deltaNeither = bucket's neitherPct - the CELL's own base
// neitherPct, in BOTH the IS and OOS halves (book.splitDate is the same 60%
// split buildAtlasBook always uses). A bucket only counts as a real signal if
// BOTH halves clear a sample floor, BOTH show the SAME SIGN, and the effect
// clears a real magnitude -- the identical discipline annotateHolds already
// applies to the out%/back% axis, just applied to the neither% axis instead
// (annotateHolds itself is untouched, this is a read-only second pass over
// the same book).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook } from '../js/levelAtlasReport.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');

const DEFAULT_REARM = 0.3;
const MIN_N = 30;      // same floor annotateHolds uses
const MIN_DELTA = 5;   // pp -- slightly looser than annotateHolds' 3pp since
                        // neither% denominators/baselines differ from out%/back%

const ALL_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const PAIRS = process.env.LA_PAIRS
  ? process.env.LA_PAIRS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  : ALL_PAIRS;

const allFindings = [];

for (const pair of PAIRS) {
  console.log(`${pair.toUpperCase()}: loading M1...`);
  const packed = await loadM1ForPair(pair);
  const assetClass = assetClassFor(pair);
  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM], pendingRearmFrac: DEFAULT_REARM });
  const book = buildAtlasBook(touches, { rearmFrac: DEFAULT_REARM });
  if (!book) { console.log('  no book -- skipping'); continue; }
  console.log(`  ${touches.length} touches, split ${book.splitDate}`);

  for (const [cellKey, cell] of Object.entries(book.cells)) {
    if (cellKey.endsWith('|p90')) continue; // p90 structurally different (no outer rung) -- exclude like everywhere else
    const baseIsNeither = cell.base.is.neitherPct;
    const baseOosNeither = cell.base.oos?.neitherPct;
    if (baseOosNeither == null) continue;
    for (const [dimKey, dim] of Object.entries(cell.dims)) {
      for (const [bucket, gIs] of Object.entries(dim.is)) {
        const gOos = dim.oos[bucket];
        if (!gOos || gIs.n < MIN_N || gOos.n < MIN_N) continue;
        const deltaIs = +(gIs.neitherPct - baseIsNeither).toFixed(1);
        const deltaOos = +(gOos.neitherPct - baseOosNeither).toFixed(1);
        const sameSign = Math.sign(deltaIs) === Math.sign(deltaOos) && deltaIs !== 0;
        if (sameSign && Math.abs(deltaIs) >= MIN_DELTA && Math.abs(deltaOos) >= MIN_DELTA) {
          allFindings.push({
            pair, cell: cellKey, dim: dimKey, bucket,
            baseIsNeither, baseOosNeither,
            isNeither: gIs.neitherPct, oosNeither: gOos.neitherPct,
            deltaIs, deltaOos, nIs: gIs.n, nOos: gOos.n,
          });
        }
      }
    }
  }
}

allFindings.sort((a, b) => Math.abs(b.deltaOos) - Math.abs(a.deltaOos));
fs.writeFileSync(path.join(OUT_DIR, 'timeout_predictability_study.json'), JSON.stringify(allFindings, null, 1));

console.log(`\n${allFindings.length} held findings (n>=${MIN_N} both halves, |delta|>=${MIN_DELTA}pp both halves, same sign)\n`);
console.log('pair'.padEnd(8), 'cell'.padEnd(10), 'dim'.padEnd(14), 'bucket'.padEnd(10), 'baseIS%'.padEnd(8), 'bktIS%'.padEnd(8), 'dIS'.padEnd(6), 'baseOOS%'.padEnd(9), 'bktOOS%'.padEnd(8), 'dOOS'.padEnd(6), 'nIS/nOOS');
for (const f of allFindings.slice(0, 60)) {
  console.log(
    f.pair.padEnd(8), f.cell.padEnd(10), f.dim.padEnd(14), String(f.bucket).padEnd(10),
    String(f.baseIsNeither).padEnd(8), String(f.isNeither).padEnd(8), String(f.deltaIs).padEnd(6),
    String(f.baseOosNeither).padEnd(9), String(f.oosNeither).padEnd(8), String(f.deltaOos).padEnd(6),
    `${f.nIs}/${f.nOos}`
  );
}

// Aggregate by dimension: how often does EACH dimension produce a held
// finding, across pairs/cells/buckets -- a dimension that shows up
// repeatedly, in the SAME direction, across many independent pairs is a much
// stronger claim than one held finding on one pair.
const byDim = {};
for (const f of allFindings) {
  byDim[f.dim] = byDim[f.dim] || { count: 0, pairs: new Set(), avgAbsDeltaOos: 0 };
  byDim[f.dim].count++;
  byDim[f.dim].pairs.add(f.pair);
  byDim[f.dim].avgAbsDeltaOos += Math.abs(f.deltaOos);
}
console.log('\n--- by dimension (held-finding count, distinct pairs, avg |deltaOOS|) ---');
for (const [dim, v] of Object.entries(byDim).sort((a, b) => b[1].count - a[1].count)) {
  console.log(`  ${dim}: ${v.count} findings across ${v.pairs.size} pairs, avg |deltaOOS|=${(v.avgAbsDeltaOos / v.count).toFixed(1)}pp`);
}
