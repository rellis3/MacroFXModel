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
// nothing about the rule itself changed), deflatedSharpe/backtestStats
// (backtestStats.js). This is a new SPLIT, not a new STRATEGY.
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { asiaFibAtlasWalk } from '../js/asiaFibAtlasEngine.js';
import { splitAt, tableFor, summarizeAll, annotateHolds } from '../js/levelAtlasReport.js';
import { voteDecision, priceBarrierTrade } from '../js/asiaFibAtlasVoteReview.js';
import { backtestStats } from '../js/backtestStats.js';

const PAIR = process.env.PAIR || 'eurusd';
const REARM_FRAC = 0.3;
const MIN_MARGIN = Number(process.env.MIN_MARGIN || 2);
const VOTE_DIMS = ['prevOutcomeSameDay', 'sessionHandoff'];

function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
function stdev(a) { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) : 0; }

async function main() {
  console.log(`Fib Atlas held-out (train/validate/test) validation — pair=${PAIR}  minMargin=${MIN_MARGIN}\n`);
  const packed = await loadM1ForPair(PAIR);
  if (!packed) { console.error(`No M1 data for ${PAIR}.`); process.exit(1); }
  const { touches } = asiaFibAtlasWalk(packed, { instrument: PAIR.toUpperCase(), rearmFracs: [REARM_FRAC] });
  const pool = touches.filter(t => t.rearmFrac === REARM_FRAC);
  console.log(`${pool.length} total touches (all history, rearmFrac=${REARM_FRAC})`);

  // Three-way split by reusing splitAt (0.6-default helper) TWICE, exactly
  // as documented above -- train 50%, validate the next 25%, test the final
  // 25%, split purely by calendar date order (no shuffling).
  const half = splitAt(pool, 0.5);
  const train = half.is, rest = half.oos;
  const quarter = splitAt(rest, 0.5);
  const validate = quarter.is, test = quarter.oos;
  console.log(`TRAIN:    ${train.length} touches, up to ${half.split}`);
  console.log(`VALIDATE: ${validate.length} touches, ${half.split} to ${quarter.split}`);
  console.log(`TEST:     ${test.length} touches, ${quarter.split} onward — NEVER touched by any prior check this session\n`);

  // Build a book from TRAIN+VALIDATE ONLY, using the exact same shape
  // buildAsiaFibAtlasBook produces so voteDecision (unchanged) can consume
  // it directly. holdsOOS is computed train-vs-validate -- the TEST slice
  // plays no role in deciding which buckets to trust.
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
  const book = { instrument: PAIR.toUpperCase(), splitDate: half.split, cells };
  console.log(`Book built from TRAIN+VALIDATE only: ${Object.keys(cells).length} cells\n`);

  // Now run the UNCHANGED live vote rule on TEST, frozen — this is the
  // whole point: the decision logic never sees this data until this exact
  // moment, and the dimension-trust gate (holdsOOS) was decided without it.
  const decided = test.filter(t => t.outcome !== 'neither');
  const trades = [];
  for (const t of decided) {
    const vd = voteDecision(book, t);
    if (!vd || vd.margin < MIN_MARGIN) continue;
    const priced = priceBarrierTrade(t, vd.decision, 0);
    if (!priced) continue;
    trades.push({ date: t.date, win: priced.win, pnlPct: priced.pnlPct });
  }
  console.log(`TEST trades (margin>=${MIN_MARGIN}, decided by the TRAIN+VALIDATE-only book): ${trades.length}\n`);

  if (trades.length < 10) {
    console.log('Too few trades on the held-out test slice to report anything meaningful.');
    return;
  }
  const pnls = trades.map(t => t.pnlPct), dates = trades.map(t => t.date);
  const bs = backtestStats(pnls, dates);
  const winRate = +(trades.filter(t => t.win).length / trades.length * 100).toFixed(1);
  console.log('──── Held-out TEST-slice result (frozen rule, never-touched data) ────');
  console.log(`  trades=${trades.length}  winRate=${winRate}%  Sharpe(annualized, per-trade)=${bs.sharpe}  CAGR=${bs.cagr}%  maxDD=${bs.maxDD}%`);
  console.log(`  bootstrap 90% CI on Sharpe: [${bs.bootstrap?.sharpe?.p5 ?? '—'}, ${bs.bootstrap?.sharpe?.p95 ?? '—'}]   P(profitable)=${bs.bootstrap?.pPositive ?? '—'}`);

  // Also compute the SAME rule's Sharpe on TRAIN+VALIDATE combined (the data
  // the selection process actually saw) for a direct, honest side-by-side —
  // the gap between these two numbers IS the overfitting/selection-bias
  // measured directly, not inferred.
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
  console.log(`\n──── Direct comparison: same rule, seen data vs never-seen data ────`);
  console.log(`  TRAIN+VALIDATE (n=${seenTrades.length}, data the rule's selection process could see): per-obs Sharpe ${seenSR.toFixed(4)}`);
  console.log(`  TEST (n=${trades.length}, genuinely never seen): per-obs Sharpe ${testSR.toFixed(4)}`);
  console.log(`  degradation: ${seenSR > 0 ? ((1 - testSR / seenSR) * 100).toFixed(1) + '%' : 'n/a (seen Sharpe <= 0)'}`);
}

main();
