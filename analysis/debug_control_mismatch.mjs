// Find and print full detail on the FIRST control-rewalk mismatch for a
// pair, to diagnose why the re-walk disagrees with the stored outcome
// before trusting any dynamic-stop grid result. Ad-hoc, read-only.
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { pickFresher, loadLocalVoteTrades, PREFIX } from '../js/levelAtlasRoutes.js';
import { getJSON } from '../js/r2Store.js';
import { betDirection } from '../js/levelAtlasVoteReview.js';

const pair = process.argv[2] || 'eurusd';
const maxPrint = Number(process.argv[3] || 3);

function bsearch(times, t) {
  let lo = 0, hi = times.length;
  while (lo < hi) { const m = (lo + hi) >>> 1; if (times[m] < t) lo = m + 1; else hi = m; }
  return lo;
}

const packed = await loadM1ForPair(pair);
const stored = pickFresher(await getJSON(`${PREFIX}/${pair}-votetrades.json`), loadLocalVoteTrades(pair));
const trades = (stored?.trades || []).filter(t => t.margin >= 3 && t.stopPips > 0 && t.targetPips > 0 && !t.timedOut);
console.error(`${pair}: ${trades.length} candidate trades`);

const { times, highs, lows, closes } = packed;
let printed = 0;
for (const t of trades) {
  const isBuy = betDirection({ decision: t.decision, side: t.side }) === 'long';
  const stopDist = t.stopPips * t.pip;
  const targetDist = t.targetPips * t.pip;
  const startIdx = bsearch(times, t.time);
  const endIdx = bsearch(times, t.resolveTime);
  if (startIdx >= times.length || endIdx <= startIdx) continue;
  const tp = isBuy ? t.entry + targetDist : t.entry - targetDist;
  const sl = isBuy ? t.entry - stopDist : t.entry + stopDist;

  let exitPrice = null, exitIdx = null, exitReason = null;
  for (let i = startIdx; i < endIdx; i++) {
    if (isBuy) {
      if (lows[i] <= sl) { exitPrice = sl; exitIdx = i; exitReason = 'sl'; break; }
      if (highs[i] >= tp) { exitPrice = tp; exitIdx = i; exitReason = 'tp'; break; }
    } else {
      if (highs[i] >= sl) { exitPrice = sl; exitIdx = i; exitReason = 'sl'; break; }
      if (lows[i] <= tp) { exitPrice = tp; exitIdx = i; exitReason = 'tp'; break; }
    }
  }
  if (exitPrice == null) { exitPrice = closes[endIdx - 1]; exitIdx = endIdx - 1; exitReason = 'eod-fallback'; }
  const grossPct = isBuy ? (exitPrice - t.entry) / t.entry * 100 : (t.entry - exitPrice) / t.entry * 100;
  const netPct = grossPct - (stored.cost || 0);
  const myWin = netPct > 0;

  if (myWin !== t.win) {
    printed++;
    console.error(`\n--- MISMATCH #${printed} ---`);
    console.error('pair:', pair, 'date:', t.date, 'decision:', t.decision, 'side:', t.side, 'isBuy:', isBuy);
    console.error('entry:', t.entry, 'pip:', t.pip, 'stopPips:', t.stopPips, 'targetPips:', t.targetPips);
    console.error('my sl:', sl, 'my tp:', tp);
    console.error('stored: win=', t.win, 'pnlPct=', t.pnlPct, 'margin=', t.margin, 'timedOut=', t.timedOut, typeof t.timedOut);
    console.error('stored: mfePips=', t.mfePips, 'maePips=', t.maePips, 'targetPips=', t.targetPips, 'stopPips=', t.stopPips);
    console.error('mine:   win=', myWin, 'netPct=', netPct.toFixed(4), 'exitReason=', exitReason, 'exitPrice=', exitPrice);
    console.error('time (entry):', new Date(t.time * 1000).toISOString(), 'resolveTime:', new Date(t.resolveTime * 1000).toISOString());
    console.error('exit bar time:', new Date(times[exitIdx] * 1000).toISOString(), 'exit bar idx offset from start:', exitIdx - startIdx, 'of', endIdx - startIdx, 'bars in window');
    console.error('bar at exit: open/high/low/close =', packed.opens?.[exitIdx], highs[exitIdx], lows[exitIdx], closes[exitIdx]);
    // Print a few bars around entry and around exit for manual inspection.
    console.error('first 3 bars from entry:');
    for (let i = startIdx; i < Math.min(startIdx + 3, endIdx); i++) {
      console.error(` t=${new Date(times[i]*1000).toISOString()} h=${highs[i]} l=${lows[i]} c=${closes[i]}`);
    }
    console.error('last 3 bars before/at resolveTime:');
    for (let i = Math.max(startIdx, endIdx - 3); i < endIdx; i++) {
      console.error(` t=${new Date(times[i]*1000).toISOString()} h=${highs[i]} l=${lows[i]} c=${closes[i]}`);
    }
    if (printed >= maxPrint) break;
  }
}
if (!printed) console.error('no mismatches found in this run (unexpected given the earlier grid run) -- may be data-timing-sensitive');
