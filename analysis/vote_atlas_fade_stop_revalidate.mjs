// Fade-stop tightening, re-validated on the FIXED trade population — 2026-09-11
//
// scripts/oos_validate_fade_stop.mjs (2026-08-27) found 93% of pairs improved
// OOS Sharpe from an IS-only-chosen tighter fade stop -- but that ran against
// analysis/output/level-atlas-vote-trades/*.json, a local cache that predates
// BOTH this session's look-ahead bug fixes (dropped-touches + book-construction
// leak) AND the 10-year lookback bound. That cache has no `schema` field at
// all, i.e. it's from before schema versioning existed -- trusting its verdict
// on today's config would repeat exactly the mistake this session's whole
// bug-hunt was about ("how do you know the fix wasn't checked on stale data").
//
// This rebuilds the SAME honest-book trade population `runOne` (production)
// now builds -- IS-only book, real OOS split via oosStartDate -- for the
// 17-pair "recommended" set, then applies the ORIGINAL script's exact
// validation discipline (70/30 nested split within the real-OOS block, IS-only
// stop percentile, frozen, applied unchanged to the further-OOS slice) fresh.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook, splitAt } from '../js/levelAtlasReport.js';
import { buildBarrierTrades, runStopStudy, priceAtTighterStop } from '../js/levelAtlasVoteReview.js';
import { summarizeTrades } from '../js/metricsCore.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { boundPacked, LOOKBACK_DAYS, DEFAULT_REARM } from '../js/levelAtlasRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');
const MIN_MARGIN = 3;

// The 17-pair "Select recommended" set from the config screenshot.
const PAIRS = process.env.LA_PAIRS ? process.env.LA_PAIRS.split(',') : ['eurusd', 'gbpusd', 'usdjpy', 'audusd',
  'usdchf', 'euraud', 'eurchf', 'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

function avgWinLoss(trades) {
  const wins = trades.filter(t => t.win).map(t => t.pnlPct);
  const losses = trades.filter(t => !t.win).map(t => t.pnlPct);
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  return { avgWin: avg(wins), avgLoss: avg(losses) };
}

const results = [];
for (const pair of PAIRS) {
  console.log(`${pair.toUpperCase()}: loading M1...`);
  const packed0 = await loadM1ForPair(pair);
  const packed = boundPacked(packed0, LOOKBACK_DAYS);
  const assetClass = assetClassFor(pair);
  const cost = costForPair(pair, assetClass);
  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM], pendingRearmFrac: DEFAULT_REARM });
  const atRearm = touches.filter(t => t.rearmFrac === DEFAULT_REARM);
  const { split: realSplit } = splitAt(atRearm);
  const isOnly = atRearm.filter(t => t.date < realSplit);
  const honestBook = buildAtlasBook(isOnly, { rearmFrac: DEFAULT_REARM });
  const trades = buildBarrierTrades(touches, honestBook, { rearmFrac: DEFAULT_REARM, cost, oosStartDate: realSplit });

  const fade = trades.filter(t => t.margin >= MIN_MARGIN && t.decision === 'fade').sort((a, b) => a.time - b.time);
  console.log(`  ${trades.length} real-OOS trades, ${fade.length} fade @ margin>=${MIN_MARGIN}`);
  if (fade.length < 60) { results.push({ pair: pair.toUpperCase(), nIS: 0, nOOS: fade.length, note: 'too few fade trades for a 70/30 split' }); continue; }

  const splitIdx = Math.floor(fade.length * 0.7);
  const isTrades = fade.slice(0, splitIdx);
  const oosTrades = fade.slice(splitIdx);

  const study = runStopStudy(isTrades, { cost: 0, sliceBy: null, minN: 20 });
  const best = study?.overall?.best;
  const oosBase = summarizeTrades(oosTrades.map(t => t.pnlPct), oosTrades.map(t => t.date));
  const oosBaseRatio = (() => { const w = avgWinLoss(oosTrades); return w.avgWin != null && w.avgLoss ? w.avgWin / -w.avgLoss : null; })();

  if (!best) { results.push({ pair: pair.toUpperCase(), nIS: isTrades.length, nOOS: oosTrades.length, note: 'no IS candidate (too few winners)' }); continue; }

  const oosPriced = oosTrades.map(t => ({ p: priceAtTighterStop(t, best.stopPips, 0), date: t.date })).filter(x => x.p);
  const oosAfter = summarizeTrades(oosPriced.map(x => x.p.pnlPct), oosPriced.map(x => x.date));
  const oosAfterRatio = (() => { const w = avgWinLoss(oosPriced.map(x => x.p)); return w.avgWin != null && w.avgLoss ? w.avgWin / -w.avgLoss : null; })();

  results.push({
    pair: pair.toUpperCase(), nIS: isTrades.length, nOOS: oosTrades.length,
    isStopPips: best.stopPips, isPercentile: best.p,
    oosSharpeBefore: oosBase.sharpe, oosSharpeAfter: oosAfter.sharpe,
    oosRatioBefore: oosBaseRatio, oosRatioAfter: oosAfterRatio,
  });
}

console.log(`\nFade-stop OOS re-validation (fixed data), ${results.length} pairs.\n`);
let improved = 0, tested = 0;
for (const r of results) {
  if (r.note) { console.log(`  ${r.pair.padEnd(8)} SKIPPED (${r.note}, nIS=${r.nIS} nOOS=${r.nOOS})`); continue; }
  tested++;
  const lift = r.oosSharpeAfter - r.oosSharpeBefore;
  if (lift > 0) improved++;
  console.log(`  ${r.pair.padEnd(8)} IS stop=${r.isStopPips}(p${r.isPercentile}) n=${r.nIS}/${r.nOOS}  OOS Sharpe ${r.oosSharpeBefore.toFixed(2)}->${r.oosSharpeAfter.toFixed(2)} (${lift >= 0 ? '+' : ''}${lift.toFixed(2)})  OOS ratio ${r.oosRatioBefore?.toFixed(2)}->${r.oosRatioAfter?.toFixed(2)}`);
}
if (tested) {
  console.log(`\n${improved} of ${tested} pairs (${(improved / tested * 100).toFixed(0)}%) improved OOS Sharpe using an IS-only-chosen stop.`);
  const avgOosLift = results.filter(r => !r.note).reduce((s, r) => s + (r.oosSharpeAfter - r.oosSharpeBefore), 0) / tested;
  console.log(`Average OOS Sharpe lift: ${avgOosLift.toFixed(3)}`);
} else {
  console.log('\nNo pairs had enough data to test.');
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'vote_atlas_fade_stop_revalidate.json'), JSON.stringify(results, null, 1));
console.log(`\nWrote ${OUT_DIR}/vote_atlas_fade_stop_revalidate.json`);
