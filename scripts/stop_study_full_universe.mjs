// Re-runs the ALREADY-VALIDATED runStopStudy (js/levelAtlasVoteReview.js) --
// grids a tighter stop off a slice's OWN winners' real MAE percentiles, never
// invented -- across the FULL 32-pair universe (26 FX+gold + 6 indices)
// instead of the original 5. CRITICAL CORRECTNESS RULE (caught before
// reporting, not after): candidate stops are picked in raw PIPS from a
// slice's own winners, and pip size varies 100x+ across instruments
// (EURUSD pip=0.0001 vs GOLD/index pip=1) -- pooling trades from DIFFERENT
// instruments into one slice before gridding pips is comparing apples to
// oranges (an 11-pip threshold is a sensible ~0.1% cut for EURUSD but
// meaningless for GOLD/NQ). Every slice key below therefore ALWAYS includes
// `instrument` first, and cross-pair patterns (e.g. "does fade beat follow")
// are read off by AGGREGATING each pair's own separately-gridded result, not
// by pooling raw pips across pairs.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runStopStudy, priceAtTighterStop } from '../js/levelAtlasVoteReview.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'analysis', 'output', 'level-atlas-vote-trades');
const MIN_MARGIN = 3;

const ALL_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurjpy', 'eurgbp', 'euraud', 'eurcad', 'eurchf', 'eurnzd', 'gbpjpy', 'gbpaud', 'gbpcad',
  'gbpchf', 'gbpnzd', 'audjpy', 'audnzd', 'audcad', 'audchf', 'cadjpy', 'chfjpy', 'nzdjpy', 'gold',
  'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

let allTrades = [];
for (const p of ALL_PAIRS) {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, `${p}-votetrades.json`), 'utf8'));
  allTrades.push(...raw.trades.filter(t => t.margin >= MIN_MARGIN));
}
console.log(`Loaded ${allTrades.length} trades across ${ALL_PAIRS.length} pairs at margin>=${MIN_MARGIN}.\n`);

function avgWinLoss(trades) {
  const wins = trades.filter(t => t.win).map(t => t.pnlPct);
  const losses = trades.filter(t => !t.win).map(t => t.pnlPct);
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  return { avgWin: avg(wins), avgLoss: avg(losses) };
}

// Per instrument x decision (fade/follow) -- the ONLY correct way to check
// whether fade specifically benefits more than follow, since it never
// mixes pip scales: every row is one instrument, one decision.
const result = runStopStudy(allTrades, { cost: 0, sliceBy: t => `${t.instrument}|${t.decision}`, minN: 30 });
const rows = [];
for (const [key, r] of Object.entries(result)) {
  if (!r.best) continue;
  const [instrument, decision] = key.split('|');
  const group = allTrades.filter(t => t.instrument === instrument && t.decision === decision && t.margin >= MIN_MARGIN);
  const baseline = avgWinLoss(group);
  const priced = group.map(t => priceAtTighterStop(t, r.best.stopPips, 0)).filter(Boolean);
  const after = avgWinLoss(priced);
  rows.push({
    instrument, decision, n: r.n,
    baseSharpe: r.band.sharpe, bestSharpe: r.best.sharpe,
    baseRatio: baseline.avgWin / -baseline.avgLoss, afterRatio: after.avgWin / -after.avgLoss,
    sharpeLift: r.best.sharpe - r.band.sharpe,
  });
}

console.log('=== Per INSTRUMENT x DECISION (pip-homogeneous slices only) ===');
rows.sort((a, b) => b.sharpeLift - a.sharpeLift);
for (const row of rows) {
  console.log(`  ${row.instrument.padEnd(8)} ${row.decision.padEnd(7)} n=${String(row.n).padEnd(5)} Sharpe ${row.baseSharpe.toFixed(2)}->${row.bestSharpe.toFixed(2)} (${row.sharpeLift >= 0 ? '+' : ''}${row.sharpeLift.toFixed(2)})  ratio ${row.baseRatio.toFixed(2)}->${row.afterRatio.toFixed(2)}`);
}

const fadeRows = rows.filter(r => r.decision === 'fade');
const followRows = rows.filter(r => r.decision === 'follow');
const avgLift = rs => rs.length ? rs.reduce((s, r) => s + r.sharpeLift, 0) / rs.length : null;
const avgRatioBefore = rs => rs.length ? rs.reduce((s, r) => s + r.baseRatio, 0) / rs.length : null;
const avgRatioAfter = rs => rs.length ? rs.reduce((s, r) => s + r.afterRatio, 0) / rs.length : null;
const pctImproved = rs => rs.length ? (rs.filter(r => r.sharpeLift > 0).length / rs.length * 100).toFixed(0) : null;

console.log(`\nFADE:   ${fadeRows.length} pairs with a candidate. Avg Sharpe lift: ${avgLift(fadeRows)?.toFixed(2)}. Avg win/loss ratio ${avgRatioBefore(fadeRows)?.toFixed(2)}->${avgRatioAfter(fadeRows)?.toFixed(2)}. ${pctImproved(fadeRows)}% of pairs improved.`);
console.log(`FOLLOW: ${followRows.length} pairs with a candidate. Avg Sharpe lift: ${avgLift(followRows)?.toFixed(2)}. Avg win/loss ratio ${avgRatioBefore(followRows)?.toFixed(2)}->${avgRatioAfter(followRows)?.toFixed(2)}. ${pctImproved(followRows)}% of pairs improved.`);
