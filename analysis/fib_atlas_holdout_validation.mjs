// Fib Atlas held-out (train/validate/test) validation — the definitive
// check the rest of this session's findings have been pointing at: does the
// vote rule (prevOutcomeSameDay + sessionHandoff, margin>=2) show a REAL
// edge on data that played NO role whatsoever in selecting it, or does the
// edge disappear once the selection step itself can't peek at the judging
// data?
//
// Why this is different from the book's own existing IS/OOS split: that
// split's own OOS half is exactly what LEGO_MODULES.md's 2026-08-29 entry
// found `holdsOOS` (annotateHolds) uses to decide which dimension buckets to
// trust in the FIRST place -- so "OOS" performance on that split is not a
// clean forward test, it's partly graded on data the selection step already
// looked at. This script fixes that by inserting a genuine THIRD slice:
//
//   TRAIN (first 50% by date)    -> compute each cell's own IS stats
//   VALIDATE (next 25%)          -> annotateHolds(train vs validate) decides
//                                    which dimension buckets to trust --
//                                    mirrors the real selection process, but
//                                    confined to data the final test never sees
//   TEST (final 25%, never touched by ANY prior check this session)
//                                 -> the ALREADY-BUILT, UNCHANGED voteDecision/
//                                    priceBarrierTrade run once, frozen,
//                                    reporting whatever Sharpe/CI comes out
//
// Zero new decision logic: reuses asiaFibAtlasWalk (the walk), splitAt/
// tableFor/summarizeAll/annotateHolds (levelAtlasReport.js -- the exact
// shared gate), voteDecision/priceBarrierTrade (asiaFibAtlasVoteReview.js --
// the exact live vote rule, called on a differently-built `book` object,
// nothing about the rule itself changed), backtestStats (backtestStats.js).
// This is a new SPLIT, not a new STRATEGY.
//
// Multi-pair (2026-08-29): PAIRS=eurusd,gbpusd,... runs the same procedure
// per pair (each with its own M1 load + walk + independent 3-way split) and
// prints a per-pair table plus a pooled cross-pair summary at the end --
// the EURUSD-only run already found a real, non-collapsing result; this
// checks whether that generalizes across the other 25 pairs or was
// EURUSD-specific, per LEGO_MODULES.md's own stated caveat on the first run.
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { asiaFibAtlasWalk } from '../js/asiaFibAtlasEngine.js';
import { splitAt, tableFor, summarizeAll, annotateHolds } from '../js/levelAtlasReport.js';
import { voteDecision, priceBarrierTrade } from '../js/asiaFibAtlasVoteReview.js';
import { backtestStats } from '../js/backtestStats.js';
import { RANGE_FIB_INSTRUMENTS } from '../js/rangeFibEngine.js';

const PAIRS = process.env.PAIRS ? process.env.PAIRS.split(',').map(p => p.trim().toLowerCase()) : RANGE_FIB_INSTRUMENTS;
const REARM_FRAC = 0.3;
const MIN_MARGIN = Number(process.env.MIN_MARGIN || 2);
const VOTE_DIMS = ['prevOutcomeSameDay', 'sessionHandoff'];

function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
function stdev(a) { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) : 0; }

async function runForPair(pair) {
  const packed = await loadM1ForPair(pair);
  if (!packed) { console.log(`  ${pair}: no M1 data, skipping`); return null; }
  const { touches } = asiaFibAtlasWalk(packed, { instrument: pair.toUpperCase(), rearmFracs: [REARM_FRAC] });
  const pool = touches.filter(t => t.rearmFrac === REARM_FRAC);

  const half = splitAt(pool, 0.5);
  const train = half.is, rest = half.oos;
  const quarter = splitAt(rest, 0.5);
  const validate = quarter.is, test = quarter.oos;

  const cellKeys = [...new Set(train.map(t => `${t.side}|${t.level}`))];
  const cells = {};
  for (const key of cellKeys) {
    const [side, levelStr] = key.split('|');
    const level = +levelStr;
    const cellTrain = train.filter(t => t.side === side && t.level === level);
    const cellValidate = validate.filter(t => t.side === side && t.level === level);
    if (cellTrain.length < 10) continue;
    const base = { is: summarizeAll(cellTrain), oos: cellValidate.length ? summarizeAll(cellValidate) : null };
    const dims = {};
    for (const dimKey of VOTE_DIMS) {
      const tTrain = tableFor(cellTrain, dimKey), tValidate = tableFor(cellValidate, dimKey);
      if (!Object.keys(tTrain).length) continue;
      dims[dimKey] = { is: tTrain, oos: tValidate };
    }
    if (base.oos) annotateHolds(dims, base.is, base.oos);
    cells[key] = { side, level, base, dims };
  }
  const book = { instrument: pair.toUpperCase(), splitDate: half.split, cells };

  const decided = test.filter(t => t.outcome !== 'neither');
  const trades = [];
  for (const t of decided) {
    const vd = voteDecision(book, t);
    if (!vd || vd.margin < MIN_MARGIN) continue;
    const priced = priceBarrierTrade(t, vd.decision, 0);
    if (!priced) continue;
    trades.push({ date: t.date, win: priced.win, pnlPct: priced.pnlPct });
  }
  if (trades.length < 10) return { pair, trades: trades.length, tooFew: true };

  const pnls = trades.map(t => t.pnlPct), dates = trades.map(t => t.date);
  const bs = backtestStats(pnls, dates);
  const winRate = +(trades.filter(t => t.win).length / trades.length * 100).toFixed(1);

  const seenTouches = [...train, ...validate].filter(t => t.outcome !== 'neither');
  const seenTrades = [];
  for (const t of seenTouches) {
    const vd = voteDecision(book, t);
    if (!vd || vd.margin < MIN_MARGIN) continue;
    const priced = priceBarrierTrade(t, vd.decision, 0);
    if (!priced) continue;
    seenTrades.push(priced.pnlPct);
  }
  const seenSR = stdev(seenTrades) > 1e-9 ? mean(seenTrades) / stdev(seenTrades) : 0;
  const testSR = stdev(pnls) > 1e-9 ? mean(pnls) / stdev(pnls) : 0;
  const degradationPct = seenSR > 0 ? +((1 - testSR / seenSR) * 100).toFixed(1) : null;

  return {
    pair, trades: trades.length, winRate, sharpe: bs.sharpe, maxDD: bs.maxDD,
    ciLo: bs.bootstrap?.sharpe?.p5 ?? null, ciHi: bs.bootstrap?.sharpe?.p95 ?? null,
    pProfitable: bs.bootstrap?.pPositive ?? null,
    seenSR: +seenSR.toFixed(4), testSR: +testSR.toFixed(4), degradationPct,
    pnls, dates,
  };
}

async function main() {
  console.log(`Fib Atlas held-out (train/validate/test) validation — ${PAIRS.length} pair(s)  minMargin=${MIN_MARGIN}\n`);
  const results = [];
  for (const pair of PAIRS) {
    console.log(`Running ${pair}...`);
    const r = await runForPair(pair);
    if (r) results.push(r);
  }

  console.log('\n──── Per-pair held-out TEST results ────');
  console.log('pair      trades  winRate  Sharpe    90% CI              P(profit)  seenSR    testSR   degradation');
  for (const r of results) {
    if (r.tooFew) { console.log(`${r.pair.padEnd(9)} ${String(r.trades).padStart(6)}  (too few trades to report)`); continue; }
    console.log([
      r.pair.padEnd(9), String(r.trades).padStart(6), (r.winRate + '%').padStart(8),
      String(r.sharpe).padStart(7), `[${r.ciLo},${r.ciHi}]`.padStart(18),
      String(r.pProfitable).padStart(9), String(r.seenSR).padStart(8), String(r.testSR).padStart(8),
      r.degradationPct != null ? (r.degradationPct + '%').padStart(11) : 'n/a'.padStart(11),
    ].join('  '));
  }

  // Pooled cross-pair summary — combine every pair's held-out TEST trades
  // into one series (equal-weighted, unrisk-adjusted, just concatenated by
  // date) for a single headline read on whether the pattern generalizes.
  const usable = results.filter(r => !r.tooFew);
  const allPnls = usable.flatMap(r => r.pnls), allDates = usable.flatMap(r => r.dates);
  const survivors = usable.filter(r => r.degradationPct != null && r.degradationPct < 50 && r.sharpe > 0);
  console.log(`\n──── Pooled summary across ${usable.length} pairs with enough held-out trades ────`);
  if (allPnls.length >= 10) {
    const pooled = backtestStats(allPnls, allDates);
    console.log(`  pooled TEST trades=${allPnls.length}  Sharpe=${pooled.sharpe}  CI=[${pooled.bootstrap?.sharpe?.p5}, ${pooled.bootstrap?.sharpe?.p95}]  P(profitable)=${pooled.bootstrap?.pPositive}`);
  }
  console.log(`  pairs with a positive held-out Sharpe AND <50% degradation from seen->unseen: ${survivors.length}/${usable.length} (${survivors.map(r => r.pair).join(', ') || 'none'})`);
  const meanDegradation = mean(usable.filter(r => r.degradationPct != null).map(r => r.degradationPct));
  console.log(`  mean degradation across pairs with a positive seen-Sharpe: ${meanDegradation.toFixed(1)}%`);
}

main();
