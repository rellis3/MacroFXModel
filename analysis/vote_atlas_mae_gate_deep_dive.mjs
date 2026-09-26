/**
 * Vote Atlas MAE stop gate — deep-dive robustness pass, 2026-09-26.
 *
 * The "standard test" (analysis/vote_atlas_dynamic_stop_test.mjs) grid-
 * searched triggerR x newStopR for max IS Sharpe and found NO interior
 * optimum -- every pair picked the most extreme setting tested, the
 * signature of a gamed metric. This script runs the agreed follow-up
 * checks USING A PRINCIPLED TRIGGER instead of a Sharpe-maximizing one --
 * see analysis/vote_atlas_mae_calibration_curve.mjs (run FIRST, writes
 * analysis/output/vote_atlas_mae_calibration_curve.json, which this script
 * reads) for how that trigger is derived, and why the original plan for
 * item 1 (a raw "does final MAE >= R predict loss" scan) turned out to be
 * tautological for barrier trades and was replaced by that script instead.
 *
 *  2. FADE vs FOLLOW, separately, using EACH subset's OWN calibration-
 *     derived trigger (not the pooled one) -- this codebase already found
 *     (a different lever) that follow's own stop is "close to right";
 *     mixing the two could mask that.
 *  3. DECOMPOSITION -- at the principled setting, how much of the total R
 *     improvement comes from the top 5/10 gated trades vs the rest? A
 *     result dominated by a handful of trades is fragile, not a real edge.
 *  4. WALK-FORWARD STABILITY -- the SAME fixed (not re-optimized)
 *     principled setting applied across 3 rolling folds, to see if the
 *     improvement is consistent across different periods or just lucky on
 *     one split.
 *  5. FULL PAIR UNIVERSE -- all 17 pairs the site actually offers, not the
 *     4 spot-checked before.
 *
 * No M1 walk needed in THIS script -- applyMaeStopGate (js/
 * levelAtlasVoteReview.js) derives everything from each trade's already-
 * stored maePips (proven equivalent to the M1-walking version once the
 * checkpoint time-gate is dropped, which analysis/vote_atlas_dynamic_stop_test.mjs
 * already showed barely matters). READ-ONLY, isolated, no KV write, no
 * route, cannot affect the live page or bots.
 *
 * Usage: node vote_atlas_mae_calibration_curve.mjs [pairs...]   (run FIRST)
 *        node vote_atlas_mae_gate_deep_dive.mjs [pairs...]
 */
import { pickFresher, loadLocalVoteTrades, PREFIX } from '../js/levelAtlasRoutes.js';
import { getJSON } from '../js/r2Store.js';
import { applyMaeStopGate } from '../js/levelAtlasVoteReview.js';
import { summarizeTrades } from '../js/metricsCore.js';
import fs from 'node:fs';

const PAIRS = process.argv.slice(2).length ? process.argv.slice(2) : ['eurusd', 'gbpusd', 'usdjpy', 'audusd',
  'usdchf', 'euraud', 'eurchf', 'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const MIN_MARGIN = 3;
const MIN_N = 30;
const CALIBRATION_PATH = 'analysis/output/vote_atlas_mae_calibration_curve.json';
const CHECKPOINT_PREFERENCE = [30, 60]; // prefer the earlier checkpoint's trigger where both exist

let calibration = {};
try { calibration = JSON.parse(fs.readFileSync(CALIBRATION_PATH, 'utf8')); }
catch { console.error(`Could not read ${CALIBRATION_PATH} -- run vote_atlas_mae_calibration_curve.mjs first. Aborting.`); process.exit(1); }

// Prefers the noise-floor trigger (COG's actual concept: the deepest level
// with a genuinely real signal); falls back to the stricter majority
// trigger if a pair happens to clear that bar too (it would be >= the
// noise floor by construction, so this only ever picks the SAME or a
// stricter value, never overrides the floor with something looser).
function pickTrigger(pair, subset) {
  for (const cp of CHECKPOINT_PREFERENCE) {
    const c = calibration[pair]?.[cp]?.[subset];
    if (c?.noiseFloorTrigger != null) return { triggerR: c.majorityTrigger ?? c.noiseFloorTrigger, checkpoint: cp };
  }
  return null;
}

function gridCell(trades, triggerR, newStopR, cost) {
  const gated = applyMaeStopGate(trades, triggerR, newStopR, cost);
  const summary = summarizeTrades(gated.map(t => t.pnlPct), gated.map(t => t.date));
  const winnersCutShort = gated.filter((t, i) => trades[i].win && !t.win).length;
  const nGated = gated.filter((t, i) => t.pnlPct !== trades[i].pnlPct).length;
  return { n: gated.length, nGated, winRate: summary.winRate, sharpe: summary.sharpe, profitFactor: summary.profitFactor, winnersCutShort, gated };
}

// 3. Decomposition: of the trades actually changed, how concentrated is the
// total pnlPct delta (the "help") among the biggest few?
function decompose(before, after) {
  const deltas = after.map((t, i) => ({ delta: t.pnlPct - before[i].pnlPct, date: t.date })).filter(x => x.delta !== 0);
  const helped = deltas.filter(d => d.delta > 0).sort((a, b) => b.delta - a.delta);
  if (!helped.length) return null;
  const totalHelp = helped.reduce((s, d) => s + d.delta, 0);
  const top5 = helped.slice(0, 5).reduce((s, d) => s + d.delta, 0);
  const top10 = helped.slice(0, 10).reduce((s, d) => s + d.delta, 0);
  return {
    nHelped: helped.length, totalHelp: +totalHelp.toFixed(3),
    top5Pct: totalHelp > 0 ? +(top5 / totalHelp * 100).toFixed(1) : null,
    top10Pct: totalHelp > 0 ? +(top10 / totalHelp * 100).toFixed(1) : null,
  };
}

async function loadTrades(pair) {
  const stored = pickFresher(await getJSON(`${PREFIX}/${pair}-votetrades.json`), loadLocalVoteTrades(pair));
  if (!stored) return null;
  const trades = (stored.trades || [])
    .filter(t => t.margin >= MIN_MARGIN && t.stopPips > 0 && t.targetPips > 0 && !t.timedOut && t.maePips != null)
    .sort((a, b) => a.time - b.time);
  return { trades, cost: stored.cost || 0 };
}

function runOne(trades, cost, triggerR, label) {
  const newStopR = +(triggerR * 0.5).toFixed(2);
  const splitIdx = Math.floor(trades.length * 0.7);
  const oosT = trades.slice(splitIdx);
  if (oosT.length < MIN_N) { console.error(`  [${label}] OOS slice too small (${oosT.length}) -- skipped`); return null; }

  const standardOOS = gridCell(oosT, 0.7, 0.3, cost);
  const principledOOS = gridCell(oosT, triggerR, newStopR, cost);
  console.error(`  [${label}] trigger=${triggerR}/${newStopR} (principled) vs 0.7/0.3 (standard test), OOS n=${oosT.length}:`);
  console.error(`    standard:   nGated=${standardOOS.nGated}  sharpe=${standardOOS.sharpe}  winRate=${standardOOS.winRate}%  cutShort=${standardOOS.winnersCutShort}`);
  console.error(`    principled: nGated=${principledOOS.nGated}  sharpe=${principledOOS.sharpe}  winRate=${principledOOS.winRate}%  cutShort=${principledOOS.winnersCutShort}`);

  const gatedTrades = applyMaeStopGate(oosT, triggerR, newStopR, cost);
  const decomp = decompose(oosT, gatedTrades);
  if (decomp) console.error(`    decomposition: ${decomp.nHelped} trades helped, top-5=${decomp.top5Pct}% of total help, top-10=${decomp.top10Pct}%`);

  const folds = [[0.4, 0.6], [0.6, 0.8], [0.8, 1.0]];
  const wf = [];
  for (const [testStart, testEnd] of folds) {
    const testSlice = trades.slice(Math.floor(trades.length * testStart), Math.floor(trades.length * testEnd));
    if (testSlice.length < MIN_N) continue;
    const withGate = gridCell(testSlice, triggerR, newStopR, cost);
    const noGate = summarizeTrades(testSlice.map(t => t.pnlPct), testSlice.map(t => t.date));
    wf.push({ window: `${(testStart * 100).toFixed(0)}-${(testEnd * 100).toFixed(0)}%`, n: testSlice.length, sharpeWith: withGate.sharpe, sharpeWithout: +noGate.sharpe.toFixed(2) });
  }
  console.error(`    walk-forward: ${wf.map(w => `${w.window}(n=${w.n}) with=${w.sharpeWith}/without=${w.sharpeWithout}${w.sharpeWith > w.sharpeWithout ? ' [improved]' : ' [DID NOT improve]'}`).join('  ')}`);
  const consistent = wf.length > 0 && wf.every(w => w.sharpeWith > w.sharpeWithout);

  return { triggerR, newStopR, standardOOS: { sharpe: standardOOS.sharpe, winRate: standardOOS.winRate, nGated: standardOOS.nGated, cutShort: standardOOS.winnersCutShort },
    principledOOS: { sharpe: principledOOS.sharpe, winRate: principledOOS.winRate, nGated: principledOOS.nGated, cutShort: principledOOS.winnersCutShort },
    decomposition: decomp, walkForward: wf, walkForwardConsistent: consistent };
}

const allResults = {};
for (const pair of PAIRS) {
  console.error(`\n=== ${pair} ===`);
  const loaded = await loadTrades(pair);
  if (!loaded || loaded.trades.length < MIN_N * 2) { console.error(`  skipped -- too few trades (${loaded?.trades.length ?? 0})`); continue; }
  const { trades, cost } = loaded;
  const pairOut = { n: trades.length };

  const allTrig = pickTrigger(pair, 'all');
  if (allTrig) {
    console.error(`  pooled trigger (from calibration, checkpoint=${allTrig.checkpoint}min): ${allTrig.triggerR}`);
    pairOut.all = runOne(trades, cost, allTrig.triggerR, 'all');
  } else {
    console.error(`  no calibration-derived trigger found for [all] -- skipping`);
  }

  const fadeTrig = pickTrigger(pair, 'fade');
  const fadeTrades = trades.filter(t => t.decision === 'fade');
  if (fadeTrig && fadeTrades.length >= MIN_N * 2) {
    console.error(`  fade-only trigger (checkpoint=${fadeTrig.checkpoint}min): ${fadeTrig.triggerR}`);
    pairOut.fade = runOne(fadeTrades, cost, fadeTrig.triggerR, 'fade-only');
  } else {
    console.error(`  [fade-only] no usable calibration trigger or too few trades -- skipping`);
  }

  const followTrig = pickTrigger(pair, 'follow');
  const followTrades = trades.filter(t => t.decision === 'follow');
  if (followTrig && followTrades.length >= MIN_N * 2) {
    console.error(`  follow-only trigger (checkpoint=${followTrig.checkpoint}min): ${followTrig.triggerR}`);
    pairOut.follow = runOne(followTrades, cost, followTrig.triggerR, 'follow-only');
  } else {
    console.error(`  [follow-only] no usable calibration trigger or too few trades -- skipping`);
  }

  allResults[pair] = pairOut;
}

fs.mkdirSync('analysis/output', { recursive: true });
fs.writeFileSync('analysis/output/vote_atlas_mae_gate_deep_dive.json', JSON.stringify(allResults, null, 2));

console.error(`\n\n=== POOLED SUMMARY (${Object.keys(allResults).length} pairs tested) ===`);
for (const subset of ['all', 'fade', 'follow']) {
  const withResult = Object.entries(allResults).filter(([, v]) => v[subset] != null);
  const consistent = withResult.filter(([, v]) => v[subset].walkForwardConsistent).length;
  const principledBeatsStandard = withResult.filter(([, v]) => v[subset].principledOOS.sharpe < v[subset].standardOOS.sharpe).length;
  console.error(`[${subset}] ${withResult.length}/${Object.keys(allResults).length} pairs tested`);
  console.error(`[${subset}] walk-forward consistent (all 3 windows improved): ${consistent}/${withResult.length}`);
  console.error(`[${subset}] principled trigger is LOWER Sharpe than the standard-test edge cell (expected, since it's not metric-optimized): ${principledBeatsStandard}/${withResult.length}`);
}
console.error(`\nwrote analysis/output/vote_atlas_mae_gate_deep_dive.json`);
