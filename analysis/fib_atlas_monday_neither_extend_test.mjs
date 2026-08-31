// Monday's own sibling of analysis/fib_atlas_neither_extend_test.mjs
// (2026-08-31) — quantifies how many Monday-ladder touches are STILL
// unresolved ('neither') even after the engine's existing ~8-day window
// (Tuesday 00:00 -> the following Tuesday), and checks how many of those
// eventually resolve given `mondayFibAtlasEngine.js`'s new
// `extendResolutionDays` capability.
//
//   node analysis/fib_atlas_monday_neither_extend_test.mjs
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { mondayFibAtlasWalk } from '../js/mondayFibAtlasEngine.js';
import { RANGE_FIB_INSTRUMENTS } from '../js/rangeFibEngine.js';

const EXTEND_RESOLUTION_DAYS = 21; // matches mondayFibAtlasRoutes.js's own runOne
const PAIRS = RANGE_FIB_INSTRUMENTS; // Monday has no exclusion set -- all 26

async function main() {
  let totalTouches = 0, totalNeitherBaseline = 0, totalNeitherExtended = 0;
  for (const pair of PAIRS) {
    console.log(`... ${pair}`);
    const bars = await loadM1ForPair(pair);
    const { touches: baseline } = mondayFibAtlasWalk(bars, { instrument: pair });
    const { touches: extended } = mondayFibAtlasWalk(bars, { instrument: pair, extendResolutionDays: EXTEND_RESOLUTION_DAYS });
    const nBaseline = baseline.filter(t => t.outcome === 'neither').length;
    const nExtended = extended.filter(t => t.outcome === 'neither').length;
    totalTouches += baseline.length;
    totalNeitherBaseline += nBaseline;
    totalNeitherExtended += nExtended;
    console.log(`  ${pair}: ${baseline.length} touches, ${nBaseline} unresolved @ existing ~8-day window (${(nBaseline / baseline.length * 100).toFixed(2)}%), ${nExtended} STILL unresolved @ +${EXTEND_RESOLUTION_DAYS}d extension (${(nExtended / baseline.length * 100).toFixed(3)}%)`);
  }
  console.log('\n════ Summary ════');
  console.log(`${totalTouches} total touches across ${PAIRS.length} pairs`);
  console.log(`Baseline (existing ~8-day window): ${totalNeitherBaseline} unresolved (${(totalNeitherBaseline / totalTouches * 100).toFixed(2)}%)`);
  console.log(`+${EXTEND_RESOLUTION_DAYS}d extension: ${totalNeitherExtended} STILL unresolved (${(totalNeitherExtended / totalTouches * 100).toFixed(3)}%)`);
  const recovered = totalNeitherBaseline - totalNeitherExtended;
  console.log(`Recovered by extension: ${recovered} touches (${(recovered / totalNeitherBaseline * 100).toFixed(1)}% of the baseline-unresolved pool)`);
}

main();
