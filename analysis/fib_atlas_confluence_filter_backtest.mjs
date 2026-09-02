// Does requiring REAL per-rung confluence (the original Pine indicator's
// fixed-pip-threshold match against the previous session's/week's grid) as a
// hard FILTER on which rungs are even tradeable change the vote-margin
// backtest's OOS performance, for both Asia and Monday?
//
// Direct owner correction (2026-09-01): the live bot fired a Monday trade at
// a rung with zero confluence to the previous week's ladder. Investigation
// found two real gaps: (1) Monday never had a per-rung confluence check at
// all (only a week-wide MINIMUM distance, `mondayWeekTightestPips` —  fixed
// in js/mondayFibAtlasEngine.js, see `mondayConfluenceGrade`); (2) even where
// confluence IS computed correctly (Asia), it was never used to GATE which
// rungs count as valid levels for the day — the vote fires regardless. The
// owner's own Pine script only shows/trades confluent lines in "Strong
// Levels"/"Strongest Levels" display mode; a line with no confluence isn't a
// level for the day at all.
//
// This script tests THAT hypothesis directly: filter touches to
// confluence-required BEFORE building the book (which reshapes the book's own
// per-cell stats, same "book-rebuild subtlety" as every other lever this
// project has tested), rerun the SAME validated vote-margin backtest
// (voteDecision margin>=2, real cost, true OOS split), and compare against
// the current no-confluence-required baseline. Three variants, matching the
// Pine script's own three display modes exactly:
//   - "All Levels"      (current baseline — no confluence filter)
//   - "Strong Levels"   (confluenceGrade != '0·none' -- match OR tight)
//   - "Strongest Levels" (confluenceGrade == '2·tight' only)
//
//   node analysis/fib_atlas_confluence_filter_backtest.mjs
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { asiaFibAtlasWalk } from '../js/asiaFibAtlasEngine.js';
import { mondayFibAtlasWalk } from '../js/mondayFibAtlasEngine.js';
import { buildAsiaFibAtlasBook } from '../js/asiaFibAtlasReport.js';
import { runBarrierWalkForward } from '../js/asiaFibAtlasVoteReview.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { costForPair } from '../js/perLineStrategy.js';

const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'gold'];
const DEFAULT_REARM = 0.3;
const MIN_MARGIN = 2;

function fmt(s) {
  if (!s) return 'n/a';
  return `trades=${s.trades} winRate=${s.winRate?.toFixed(1)}% PF=${s.profitFactor?.toFixed(3)} sharpe(ann)=${s.sharpe?.toFixed(2)} maxDD=${s.maxDD?.toFixed(2)}%`;
}

function runVariant(touches, gradeField, filterFn, cost) {
  const filtered = filterFn ? touches.filter(t => filterFn(t[gradeField])) : touches;
  if (!filtered.length) return { n: 0, summary: null };
  const book = buildAsiaFibAtlasBook(filtered, { rearmFrac: DEFAULT_REARM });
  if (!book) return { n: filtered.length, summary: null };
  const wf = runBarrierWalkForward(filtered, book, { rearmFrac: DEFAULT_REARM, cost, minMargin: MIN_MARGIN });
  return { n: filtered.length, summary: wf?.overall ?? null };
}

async function runLadder(pair, ladder, packed, assetClass, cost) {
  const walk = ladder === 'asia' ? asiaFibAtlasWalk : mondayFibAtlasWalk;
  const gradeField = ladder === 'asia' ? 'confluenceGrade' : 'mondayConfluenceGrade';
  const { touches } = walk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM] });
  if (!touches?.length) return null;

  const all = runVariant(touches, gradeField, null, cost);
  const strong = runVariant(touches, gradeField, g => g !== '0·none', cost);
  const strongest = runVariant(touches, gradeField, g => g === '2·tight', cost);

  return { totalTouches: touches.length, all, strong, strongest };
}

async function main() {
  const rows = [];
  for (const pair of PAIRS) {
    console.log(`\n=== ${pair.toUpperCase()} ===`);
    const packed = await loadM1ForPair(pair);
    if (!packed?.n) { console.log('  no M1 data'); continue; }
    const assetClass = assetClassFor(pair);
    const cost = costForPair(pair, assetClass);

    for (const ladder of ['asia', 'monday']) {
      const r = await runLadder(pair, ladder, packed, assetClass, cost);
      if (!r) { console.log(`  ${ladder}: no touches`); continue; }
      console.log(`  ${ladder.toUpperCase()} (${r.totalTouches} total touches):`);
      console.log(`    All Levels       (baseline, current): ${fmt(r.all.summary)}`);
      console.log(`    Strong Levels    (match+tight only, n=${r.strong.n}): ${fmt(r.strong.summary)}`);
      console.log(`    Strongest Levels (tight only, n=${r.strongest.n}): ${fmt(r.strongest.summary)}`);
      rows.push({ pair, ladder, ...r });
    }
  }

  console.log('\n\n════ Summary table ════');
  console.log('pair      | ladder | variant          | trades | winRate | PF     | sharpe | maxDD');
  for (const r of rows) {
    for (const [label, v] of [['All Levels', r.all], ['Strong', r.strong], ['Strongest', r.strongest]]) {
      const s = v.summary;
      if (!s) { console.log(`${r.pair.padEnd(9)} | ${r.ladder.padEnd(6)} | ${label.padEnd(16)} | -- no summary (n=${v.n})`); continue; }
      console.log(`${r.pair.padEnd(9)} | ${r.ladder.padEnd(6)} | ${label.padEnd(16)} | ${String(s.trades).padStart(6)} | ${(s.winRate?.toFixed(1) + '%').padStart(7)} | ${s.profitFactor?.toFixed(3).padStart(6)} | ${s.sharpe?.toFixed(2).padStart(6)} | ${s.maxDD?.toFixed(2)}%`);
    }
  }

  await import('node:fs').then(fs => fs.writeFileSync('/tmp/claude-0/-home-user-MacroFXModel/8ee8f986-9618-51a1-bd99-3f8fe2163f0e/scratchpad/fib_atlas_confluence_filter_results.json', JSON.stringify(rows, null, 2)));
  console.log('\nFull results written to scratchpad/fib_atlas_confluence_filter_results.json');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
