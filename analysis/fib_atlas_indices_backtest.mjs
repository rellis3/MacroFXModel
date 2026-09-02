// Does the Fib Atlas vote system (Asia + Monday range-extension) hold up on
// INDEX instruments (NQ/SPX/DOW/US2000/DE30/UK100)? The strategy has only
// ever been validated on the 26-pair FX+gold universe (LEGO_MODULES.md §1aq)
// — this is the first real test on a genuinely different asset class, direct
// owner request after confirming indices were an untried gap, not a
// deliberate exclusion (registry pip/cost handling + the M1 data loader
// already support indices unchanged, per Level Atlas/volatility_bot_v2's own
// use of the identical plumbing).
//
// Same discipline as every other Fib Atlas validation script this cycle:
// real OOS split (buildBarrierTrades already gates on book.splitDate, >=
// not >), real per-pair costs (costForPair, already has index entries),
// minMargin=2 (the frozen, validated default for both ladders elsewhere).
// Report the OOS numbers honestly — this is exploratory, not confirming an
// existing intuition, so no pre-registered "it worked" bar beyond the
// house standard (real edge after cost, non-trivial OOS trade count).
//
//   node analysis/fib_atlas_indices_backtest.mjs
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { asiaFibAtlasWalk } from '../js/asiaFibAtlasEngine.js';
import { mondayFibAtlasWalk } from '../js/mondayFibAtlasEngine.js';
import { buildAsiaFibAtlasBook } from '../js/asiaFibAtlasReport.js';
import { runBarrierWalkForward } from '../js/asiaFibAtlasVoteReview.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { costForPair } from '../js/perLineStrategy.js';

const INDEX_PAIRS = ['nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const DEFAULT_REARM = 0.3;
const MIN_MARGIN = 2;

function fmtSummary(s) {
  if (!s) return 'no summary (book/trade build failed)';
  return `trades=${s.n ?? s.trades ?? '?'} winRate=${s.winRate?.toFixed(1)}% PF=${s.profitFactor?.toFixed(3)} `
    + `sharpe(ann)=${s.sharpe?.toFixed(2)} rawSharpe=${(s.sharpe / Math.sqrt(s.tradesPerYr || 1)).toFixed(3)} `
    + `maxDD=${s.maxDD?.toFixed(2)}% tradesPerYr=${s.tradesPerYr?.toFixed(1)}`;
}

async function runLadder(pair, ladder, packed, assetClass, cost) {
  const walk = ladder === 'asia' ? asiaFibAtlasWalk : mondayFibAtlasWalk;
  const opts = { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM] };
  const { touches, coverage } = walk(packed, opts);
  if (!touches?.length) return { ok: false, reason: 'no touches', coverage };
  const book = buildAsiaFibAtlasBook(touches, { rearmFrac: DEFAULT_REARM });
  if (!book) return { ok: false, reason: 'too few touches to build a book', coverage, touchCount: touches.length };
  const wf = runBarrierWalkForward(touches, book, { rearmFrac: DEFAULT_REARM, cost, minMargin: MIN_MARGIN });
  return { ok: true, coverage, touchCount: touches.length, splitDate: book.splitDate, summary: wf?.overall ?? null, oosTrades: wf?.tradesUsed ?? 0, costStress: wf?.costStress ?? null };
}

async function main() {
  const results = {};
  for (const pair of INDEX_PAIRS) {
    console.log(`\n=== ${pair.toUpperCase()} ===`);
    let packed;
    try {
      packed = await loadM1ForPair(pair);
    } catch (e) {
      console.log(`  M1 load failed: ${e.message}`);
      results[pair] = { asia: { ok: false, reason: `M1 load failed: ${e.message}` }, monday: { ok: false, reason: `M1 load failed: ${e.message}` } };
      continue;
    }
    if (!packed?.n) {
      console.log('  no M1 data');
      results[pair] = { asia: { ok: false, reason: 'no M1 data' }, monday: { ok: false, reason: 'no M1 data' } };
      continue;
    }
    const assetClass = assetClassFor(pair);
    const cost = costForPair(pair, assetClass);
    console.log(`  ${packed.n.toLocaleString()} M1 bars, assetClass=${assetClass}, cost=${cost}%`);

    const asia = await runLadder(pair, 'asia', packed, assetClass, cost);
    console.log(`  ASIA:   ${asia.ok ? `${asia.touchCount} touches, split ${asia.splitDate}, OOS: ${fmtSummary(asia.summary)}` : asia.reason}`);
    if (asia.ok && asia.costStress) console.log(`    cost-stress: 1x sharpe=${asia.costStress['1x']?.sharpe} | 2x sharpe=${asia.costStress['2x']?.sharpe} PF=${asia.costStress['2x']?.profitFactor} | 3x sharpe=${asia.costStress['3x']?.sharpe} PF=${asia.costStress['3x']?.profitFactor}`);

    const monday = await runLadder(pair, 'monday', packed, assetClass, cost);
    console.log(`  MONDAY: ${monday.ok ? `${monday.touchCount} touches, split ${monday.splitDate}, OOS: ${fmtSummary(monday.summary)}` : monday.reason}`);
    if (monday.ok && monday.costStress) console.log(`    cost-stress: 1x sharpe=${monday.costStress['1x']?.sharpe} | 2x sharpe=${monday.costStress['2x']?.sharpe} PF=${monday.costStress['2x']?.profitFactor} | 3x sharpe=${monday.costStress['3x']?.sharpe} PF=${monday.costStress['3x']?.profitFactor}`);

    results[pair] = { asia, monday };
  }

  console.log('\n\n════ Summary table ════');
  console.log('pair      | ladder | OOS trades | winRate | PF     | sharpe(ann) | maxDD');
  for (const pair of INDEX_PAIRS) {
    for (const ladder of ['asia', 'monday']) {
      const r = results[pair][ladder];
      if (!r.ok || !r.summary) { console.log(`${pair.padEnd(9)} | ${ladder.padEnd(6)} | -- ${r.reason ?? 'no summary'}`); continue; }
      const s = r.summary;
      console.log(`${pair.padEnd(9)} | ${ladder.padEnd(6)} | ${String(s.n ?? s.trades ?? 0).padStart(10)} | ${(s.winRate?.toFixed(1) + '%').padStart(7)} | ${s.profitFactor?.toFixed(3).padStart(6)} | ${s.sharpe?.toFixed(2).padStart(11)} | ${s.maxDD?.toFixed(2)}%`);
    }
  }

  await import('node:fs').then(fs => fs.writeFileSync('/tmp/claude-0/-home-user-MacroFXModel/8ee8f986-9618-51a1-bd99-3f8fe2163f0e/scratchpad/fib_atlas_indices_results.json', JSON.stringify(results, null, 2)));
  console.log('\nFull results written to scratchpad/fib_atlas_indices_results.json');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
