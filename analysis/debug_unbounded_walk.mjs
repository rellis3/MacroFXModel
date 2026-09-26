// Same 3 EURUSD mismatches as debug_control_mismatch.mjs, but WITHOUT the
// resolveTime cutoff -- walk forward from entry until SL or TP is actually
// touched (or data runs out), to test whether resolveTime under-bounds the
// real exit. Ad-hoc, read-only.
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { pickFresher, loadLocalVoteTrades, PREFIX } from '../js/levelAtlasRoutes.js';
import { getJSON } from '../js/r2Store.js';
import { betDirection } from '../js/levelAtlasVoteReview.js';

const pair = process.argv[2] || 'eurusd';
const maxPrint = Number(process.argv[3] || 3);
const MAX_BARS_FORWARD = Number(process.argv[4] || 60 * 24 * 10); // 10 days of M1 bars, generous

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
  const boundedEndIdx = bsearch(times, t.resolveTime);
  if (startIdx >= times.length) continue;
  const tp = isBuy ? t.entry + targetDist : t.entry - targetDist;
  const sl = isBuy ? t.entry - stopDist : t.entry + stopDist;

  // First, was this one of the "eod-fallback" cases under the OLD bounded logic?
  let boundedHit = false;
  for (let i = startIdx; i < boundedEndIdx; i++) {
    if (isBuy) { if (lows[i] <= sl || highs[i] >= tp) { boundedHit = true; break; } }
    else { if (highs[i] >= sl || lows[i] <= tp) { boundedHit = true; break; } }
  }
  if (boundedHit) continue; // only interested in the eod-fallback cases

  // Now walk UNBOUNDED (past resolveTime) until SL or TP actually touches.
  let exitPrice = null, exitIdx = null, exitReason = null;
  const hardEnd = Math.min(times.length, startIdx + MAX_BARS_FORWARD);
  for (let i = startIdx; i < hardEnd; i++) {
    if (isBuy) {
      if (lows[i] <= sl) { exitPrice = sl; exitIdx = i; exitReason = 'sl'; break; }
      if (highs[i] >= tp) { exitPrice = tp; exitIdx = i; exitReason = 'tp'; break; }
    } else {
      if (highs[i] >= sl) { exitPrice = sl; exitIdx = i; exitReason = 'sl'; break; }
      if (lows[i] <= tp) { exitPrice = tp; exitIdx = i; exitReason = 'tp'; break; }
    }
  }
  if (exitPrice == null) { exitReason = 'still-no-touch-within-max-bars'; }
  const grossPct = exitPrice != null ? (isBuy ? (exitPrice - t.entry) / t.entry * 100 : (t.entry - exitPrice) / t.entry * 100) : null;
  const netPct = grossPct != null ? grossPct - (stored.cost || 0) : null;
  const myWin = netPct != null ? netPct > 0 : null;

  printed++;
  console.error(`\n--- EOD-FALLBACK CASE #${printed} (unbounded re-walk) ---`);
  console.error('pair:', pair, 'date:', t.date, 'decision:', t.decision, 'side:', t.side, 'isBuy:', isBuy);
  console.error('entry:', t.entry, 'sl:', sl, 'tp:', tp, 'stopPips:', t.stopPips, 'targetPips:', t.targetPips);
  console.error('stored: win=', t.win, 'pnlPct=', t.pnlPct, 'mfePips=', t.mfePips, 'maePips=', t.maePips);
  console.error('entry time:', new Date(t.time * 1000).toISOString(), 'resolveTime (bounded, ignored here):', new Date(t.resolveTime * 1000).toISOString());
  console.error('unbounded result: exitReason=', exitReason, 'exitPrice=', exitPrice, 'netPct=', netPct?.toFixed(4), 'win=', myWin,
    'exitTime=', exitIdx != null ? new Date(times[exitIdx] * 1000).toISOString() : 'n/a',
    'bars past resolveTime:', exitIdx != null ? exitIdx - boundedEndIdx : 'n/a');
  console.error('MATCHES stored win?', myWin === t.win);
  if (printed >= maxPrint) break;
}
if (!printed) console.error('no eod-fallback cases found in this run');
