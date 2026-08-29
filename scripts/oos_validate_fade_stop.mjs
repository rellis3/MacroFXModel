// OOS validation for the fade-stop-tightening finding (stop_study_full_universe.mjs):
// that study picked each pair's "best" tighter stop from ITS OWN FULL sample
// (no train/test split at all) -- exactly the same in-sample-selection risk
// that burned the drawdown throttle earlier today (Calmar looked great on
// IS, got worse OOS). Applying the same discipline here before trusting it
// enough to change core trade pricing: split each pair's fade trades 70/30
// chronologically, pick the stop percentile from IS ONLY, apply that SAME
// stop unchanged to the untouched OOS slice, and report honestly.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runStopStudy, priceAtTighterStop } from '../js/levelAtlasVoteReview.js';
import { summarizeTrades } from '../js/metricsCore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'analysis', 'output', 'level-atlas-vote-trades');
const MIN_MARGIN = 3;

const ALL_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurjpy', 'eurgbp', 'euraud', 'eurcad', 'eurchf', 'eurnzd', 'gbpjpy', 'gbpaud', 'gbpcad',
  'gbpchf', 'gbpnzd', 'audjpy', 'audnzd', 'audcad', 'audchf', 'cadjpy', 'chfjpy', 'nzdjpy', 'gold',
  'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

function avgWinLoss(trades) {
  const wins = trades.filter(t => t.win).map(t => t.pnlPct);
  const losses = trades.filter(t => !t.win).map(t => t.pnlPct);
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  return { avgWin: avg(wins), avgLoss: avg(losses) };
}

const results = [];
for (const pair of ALL_PAIRS) {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, `${pair}-votetrades.json`), 'utf8'));
  const fade = raw.trades.filter(t => t.margin >= MIN_MARGIN && t.decision === 'fade').sort((a, b) => a.time - b.time);
  if (fade.length < 60) continue; // need enough on BOTH sides of a 70/30 split
  const splitIdx = Math.floor(fade.length * 0.7);
  const isTrades = fade.slice(0, splitIdx);
  const oosTrades = fade.slice(splitIdx);

  const study = runStopStudy(isTrades, { cost: 0, sliceBy: null, minN: 20 });
  const best = study?.overall?.best;
  const isBase = summarizeTrades(isTrades.map(t => t.pnlPct), isTrades.map(t => t.date));
  const oosBase = summarizeTrades(oosTrades.map(t => t.pnlPct), oosTrades.map(t => t.date));
  const oosBaseRatio = (() => { const w = avgWinLoss(oosTrades); return w.avgWin / -w.avgLoss; })();

  if (!best) { results.push({ pair: raw.instrument, nIS: isTrades.length, nOOS: oosTrades.length, note: 'no IS candidate (too few winners)' }); continue; }

  // Keep pnl/date paired through the filter (a trade with no real MAE drops
  // both together) -- indices would silently misalign otherwise.
  const oosPriced = oosTrades.map(t => ({ p: priceAtTighterStop(t, best.stopPips, 0), date: t.date })).filter(x => x.p);
  const oosAfter = summarizeTrades(oosPriced.map(x => x.p.pnlPct), oosPriced.map(x => x.date));
  const oosAfterRatio = (() => { const w = avgWinLoss(oosPriced.map(x => x.p)); return w.avgWin / -w.avgLoss; })();

  results.push({
    pair: raw.instrument, nIS: isTrades.length, nOOS: oosTrades.length,
    isStopPips: best.stopPips, isPercentile: best.p,
    isSharpeBefore: isBase.sharpe, isSharpeAfter: best.sharpe,
    oosSharpeBefore: oosBase.sharpe, oosSharpeAfter: oosAfter.sharpe,
    oosRatioBefore: oosBaseRatio, oosRatioAfter: oosAfterRatio,
  });
}

console.log(`Fade-stop OOS validation, ${results.length} pairs with enough fade trades for a 70/30 split.\n`);
let improved = 0, tested = 0;
for (const r of results) {
  if (r.note) { console.log(`  ${r.pair.padEnd(8)} SKIPPED (${r.note}, nIS=${r.nIS} nOOS=${r.nOOS})`); continue; }
  tested++;
  const lift = r.oosSharpeAfter - r.oosSharpeBefore;
  if (lift > 0) improved++;
  console.log(`  ${r.pair.padEnd(8)} IS stop=${r.isStopPips}(p${r.isPercentile}) n=${r.nIS}/${r.nOOS}  OOS Sharpe ${r.oosSharpeBefore.toFixed(2)}->${r.oosSharpeAfter.toFixed(2)} (${lift >= 0 ? '+' : ''}${lift.toFixed(2)})  OOS ratio ${r.oosRatioBefore.toFixed(2)}->${r.oosRatioAfter.toFixed(2)}`);
}
console.log(`\n${improved} of ${tested} pairs (${(improved / tested * 100).toFixed(0)}%) improved OOS Sharpe using an IS-only-chosen stop.`);
const avgOosLift = results.filter(r => !r.note).reduce((s, r) => s + (r.oosSharpeAfter - r.oosSharpeBefore), 0) / tested;
console.log(`Average OOS Sharpe lift: ${avgOosLift.toFixed(3)}`);
