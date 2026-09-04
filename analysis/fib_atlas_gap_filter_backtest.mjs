// Turns the whiplash "gap since this rung's own last touch" finding
// (fib_atlas_whiplash_analysis.mjs / fib_atlas_whiplash_gap_deepdive.mjs,
// 2026-09-03: 31/31 testable pairs agree short-gap beats long-gap, holds
// under 3x cost on Monday, cost-fragile on Asia, not redundant with churn
// or prevOutcomeSameDay) into an actual FILTER backtest, not just
// descriptive buckets. Owner's own ask: "can we backtest this feature to
// see the impact?"
//
// Same architecture as every other validated filter here (applyCostEfficiency
// Filter, applyFadeStopFraction, the earlier confluence-filter test): filter
// the ALREADY-VOTED margin>=2 trade list, using the SAME book built from ALL
// touches production already uses — do NOT rebuild the book from a filtered
// touch set (that would be testing a different question: "should the book
// itself only ever learn from short-gap touches", not "should the live gate
// additionally require a short gap on top of today's vote"). A touch's own
// gap-since-its-last-touch is attached the same way the deep-dive script
// computed it (group raw touches by (side, level, session), sort by time).
//
// Baseline = current production (margin>=2, no gap filter) exactly.
// Variants = the same baseline population, additionally required to have
// fired within {30, 60, 120} minutes of this exact rung's own prior touch
// this session (a touch with NO prior touch this session, i.e. touchIndex=1,
// can never reach margin>=2 anyway per prevOutcomeSameDay's own definition,
// so it's excluded from ALL variants including baseline — same population,
// not a separate case to control for).
//
//   node analysis/fib_atlas_gap_filter_backtest.mjs
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { asiaFibAtlasWalk } from '../js/asiaFibAtlasEngine.js';
import { mondayFibAtlasWalk } from '../js/mondayFibAtlasEngine.js';
import { buildAsiaFibAtlasBook } from '../js/asiaFibAtlasReport.js';
import { voteDecision, priceBarrierTrade } from '../js/asiaFibAtlasVoteReview.js';
import { summarizeTrades } from '../js/metricsCore.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { costForPair } from '../js/perLineStrategy.js';

const PAIRS = [
  'nzdusd', 'usdjpy', 'gbpjpy', 'euraud', 'eurgbp', 'gbpusd', 'audusd', 'eurjpy',
  'usdchf', 'eurusd', 'usdcad', 'eurnzd', 'audnzd', 'audchf', 'audcad', 'gbpcad',
  'gbpnzd', 'cadjpy', 'gbpaud', 'audjpy', 'gbpchf', 'nzdjpy', 'eurchf', 'eurcad',
  'chfjpy', 'gold',
];
const DEFAULT_REARM = 0.3;
const MIN_MARGIN = 2;
// Widened (2026-09-03 follow-up) after the first pass found Asia's pooled
// Sharpe already peaks at the tightest cutoff tested (30m), but Monday's
// pooled Sharpe was still RISING at 120m (the widest tested) -- more points
// needed to find where Monday's own optimum actually sits, per-pair.
const GAP_CUTOFFS_MIN = [30, 60, 90, 120, 150, 180, 240];

function fmt(s) {
  if (!s || !s.trades) return 'n=0';
  return `trades=${s.trades} winRate=${s.winRate?.toFixed(1)}% PF=${s.profitFactor?.toFixed(3)} sharpe(ann)=${s.sharpe?.toFixed(2)} maxDD=${s.maxDD?.toFixed(2)}%`;
}
function costStress(rows, cost) {
  const out = {};
  for (const mult of [1, 2, 3]) {
    const pnls = rows.map(r => +(r.pnlPct + cost - mult * cost).toFixed(4));
    out[`${mult}x`] = summarizeTrades(pnls, rows.map(r => r.date));
  }
  return out;
}

// Every margin>=2 touch this session's rung history produced, with its own
// gap-since-last-touch attached (null only when there is no prior touch —
// which, per prevOutcomeSameDay's own definition, can never itself reach
// margin>=2, so null never actually survives into the trade list below).
async function ladderRows(pair, ladder, packed, assetClass, cost) {
  const walk = ladder === 'asia' ? asiaFibAtlasWalk : mondayFibAtlasWalk;
  const { touches } = walk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM] });
  if (!touches?.length) return [];
  const book = buildAsiaFibAtlasBook(touches, { rearmFrac: DEFAULT_REARM });
  if (!book) return [];

  const oos = touches.filter(t => t.rearmFrac === DEFAULT_REARM && t.date >= book.splitDate && t.outcome !== 'neither');
  if (!oos.length) return [];
  const sessionField = ladder === 'asia' ? 'date' : 'mondayDate';

  const groups = new Map();
  for (const t of oos) {
    const k = `${t.side}|${t.level}|${t[sessionField]}`;
    (groups.get(k) ?? groups.set(k, []).get(k)).push(t);
  }

  const rows = [];
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.time - b.time);
    arr.forEach((t, idx) => {
      const vd = voteDecision(book, t);
      if (!vd || vd.margin < MIN_MARGIN) return;
      const priced = priceBarrierTrade(t, vd.decision, cost);
      if (!priced) return;
      rows.push({
        win: priced.win, pnlPct: priced.pnlPct, date: t.date,
        gapMin: idx > 0 ? +((t.time - arr[idx - 1].time) / 60).toFixed(1) : null,
      });
    });
  }
  return rows;
}

async function main() {
  const rowsByLadder = { asia: [], monday: [] };
  const perPairByLadder = { asia: [], monday: [] };

  for (const pair of PAIRS) {
    console.log(`\n=== ${pair.toUpperCase()} ===`);
    const packed = await loadM1ForPair(pair);
    if (!packed?.n) { console.log('  no M1 data'); continue; }
    const assetClass = assetClassFor(pair);
    const cost = costForPair(pair, assetClass);

    for (const ladder of ['asia', 'monday']) {
      const rows = await ladderRows(pair, ladder, packed, assetClass, cost);
      rowsByLadder[ladder].push(...rows.map(r => ({ ...r, cost })));

      const baseline = summarizeTrades(rows.map(r => r.pnlPct), rows.map(r => r.date));
      console.log(`  ${ladder}: baseline (no gap filter, = today's production) ${fmt(baseline)}`);
      const pairVariants = { pair, baseline };
      for (const cutoff of GAP_CUTOFFS_MIN) {
        const kept = rows.filter(r => r.gapMin != null && r.gapMin <= cutoff);
        const s = summarizeTrades(kept.map(r => r.pnlPct), kept.map(r => r.date));
        console.log(`    gap<=${cutoff}m: ${fmt(s)}`);
        pairVariants[`gap${cutoff}`] = s;
      }
      perPairByLadder[ladder].push(pairVariants);
    }
  }

  for (const ladder of ['asia', 'monday']) {
    const rows = rowsByLadder[ladder];
    console.log(`\n\n════ ${ladder.toUpperCase()} — pooled across ${PAIRS.length} pairs ════`);

    const baseline = summarizeTrades(rows.map(r => r.pnlPct), rows.map(r => r.date));
    console.log(`  baseline (today's production): ${fmt(baseline)}`);
    for (const cutoff of GAP_CUTOFFS_MIN) {
      const kept = rows.filter(r => r.gapMin != null && r.gapMin <= cutoff);
      console.log(`  gap<=${cutoff}m: ${fmt(summarizeTrades(kept.map(r => r.pnlPct), kept.map(r => r.date)))}`);
    }

    console.log(`\n  -- cost stress, baseline vs the tightest cutoff (${GAP_CUTOFFS_MIN[0]}m) --`);
    const tightRows = rows.filter(r => r.gapMin != null && r.gapMin <= GAP_CUTOFFS_MIN[0]);
    for (const [label, set] of [['baseline', rows], [`gap<=${GAP_CUTOFFS_MIN[0]}m`, tightRows]]) {
      const cs = {};
      for (const mult of [1, 2, 3]) {
        // cost varies per-row (per pair) -- stress each row with ITS OWN cost, then pool.
        const pnls = set.map(r => +(r.pnlPct + r.cost - mult * r.cost).toFixed(4));
        cs[`${mult}x`] = summarizeTrades(pnls, set.map(r => r.date));
      }
      console.log(`    ${label}: 1x ${fmt(cs['1x'])}`);
      console.log(`    ${' '.repeat(label.length)}  2x ${fmt(cs['2x'])}`);
      console.log(`    ${' '.repeat(label.length)}  3x ${fmt(cs['3x'])}`);
    }

    console.log(`\n  -- per-pair Sharpe-improvement consistency, EVERY cutoff (n>=30 both cells) --`);
    for (const cutoff of GAP_CUTOFFS_MIN) {
      let agree = 0, testable = 0;
      const disagreers = [];
      for (const p of perPairByLadder[ladder]) {
        const b = p.baseline, g = p[`gap${cutoff}`];
        if (!b?.trades || !g?.trades || b.trades < 30 || g.trades < 30) continue;
        testable++;
        const won = (g.sharpe ?? -Infinity) > (b.sharpe ?? -Infinity);
        if (won) agree++; else disagreers.push(p.pair);
      }
      console.log(`    gap<=${cutoff}m: improves Sharpe on ${agree}/${testable} testable pairs${disagreers.length ? ` (worse on: ${disagreers.join(', ')})` : ''}`);
    }
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
