// FIB_ATLAS_BACKTEST_VS_LIVE.md item #3 ("not confirmed... the next thing
// to read"): does the engine resolve a same-bar race between the outer
// target and inner stop stop-first (conservative) or not?
//
// Found by reading js/asiaFibAtlasEngine.js directly (2026-09-12): the
// resolution loop checks 'out' BEFORE 'back' and breaks immediately, with
// no check for whether 'back' would ALSO have fired on that same bar. So a
// fast M1 bar spanning both the outer target and inner stop is silently
// scored as 'out' -- optimistic for a FOLLOW decision (its win condition)
// and irrelevant for FADE (already its loss either way). A new, purely
// additive `sameBarAmbiguous` field (zero change to outcome/win/pnl) now
// records when this happens.
//
// This script quantifies: (1) what fraction of 'out'-resolved touches are
// same-bar-ambiguous, and (2) what a real, honest win rate would look like
// if those ambiguous FOLLOW wins were instead scored as losses (the
// conservative, stop-first assumption item #3 asks about) -- restricted to
// the trades that actually clear the production vote+filter pipeline, same
// as every other check this session.
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { asiaFibAtlasWalk } from '../js/asiaFibAtlasEngine.js';
import { mondayFibAtlasWalk } from '../js/mondayFibAtlasEngine.js';
import { buildAsiaFibAtlasBook } from '../js/asiaFibAtlasReport.js';
import { splitAt } from '../js/levelAtlasReport.js';
import { voteDecision, priceBarrierTrade } from '../js/asiaFibAtlasVoteReview.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { costForPair } from '../js/perLineStrategy.js';

const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'eurcad', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];
const REARM = 0.3;
const MIN_MARGIN = 2;

function meanT(xs) {
  const n = xs.length; if (!n) return { n, mean: null, t: null, winRate: null };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  const se = Math.sqrt(variance / n);
  const wins = xs.filter(x => x > 0).length;
  return { n, mean, t: se > 0 ? mean / se : null, winRate: +(100 * wins / n).toFixed(1) };
}

async function checkPair(pair, label, walkFn) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.log(`${pair} ${label}: no local M1`); return null; }
  const assetClass = assetClassFor(pair);
  const cost = costForPair(pair, assetClass);
  const { touches } = walkFn(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [REARM] });
  const pool = touches.filter(t => t.rearmFrac === REARM);
  const { is, oos } = splitAt(pool);
  const book = buildAsiaFibAtlasBook(is, { rearmFrac: REARM });   // honest book, train-only
  const realOOS = oos.filter(t => t.outcome !== 'neither');

  const rawPnl = [], correctedPnl = [];
  let outCount = 0, ambigCount = 0, followAmbigCount = 0;
  for (const t of realOOS) {
    const vd = voteDecision(book, t);
    if (!vd || vd.margin < MIN_MARGIN) continue;
    const priced = priceBarrierTrade(t, vd.decision, cost);
    if (!priced) continue;
    rawPnl.push(priced.pnlPct);
    if (t.outcome === 'out') {
      outCount++;
      if (t.sameBarAmbiguous) {
        ambigCount++;
        if (vd.decision === 'follow') followAmbigCount++;
      }
    }
    // Conservative correction: a same-bar-ambiguous 'out' resolved under a
    // FOLLOW decision gets flipped to the stop-first outcome (loss at
    // -stopPips) instead of the modeled win.
    if (t.outcome === 'out' && t.sameBarAmbiguous && vd.decision === 'follow') {
      const correctedPips = -priced.stopPips;
      const denom = t.price > 0 ? t.price : null;
      const correctedPct = denom ? +((correctedPips * t.pip / denom * 100) - cost).toFixed(4) : priced.pnlPct;
      correctedPnl.push(correctedPct);
    } else {
      correctedPnl.push(priced.pnlPct);
    }
  }
  const raw = meanT(rawPnl), corrected = meanT(correctedPnl);
  return { pair, label, outCount, ambigCount, followAmbigCount, raw, corrected };
}

async function main() {
  console.log('pair\tladder\toutN\tambigN\tambigPctOfOut\tfollowAmbigN\trawN\trawMean%\trawT\trawWinRate\tcorrN\tcorrMean%\tcorrT\tcorrWinRate');
  let totalOut = 0, totalAmbig = 0, totalFollowAmbig = 0;
  const allRaw = [], allCorrected = [];
  for (const pair of PAIRS) {
    for (const [label, walkFn] of [['asia', asiaFibAtlasWalk], ['monday', mondayFibAtlasWalk]]) {
      try {
        const r = await checkPair(pair, label, walkFn);
        if (!r) continue;
        totalOut += r.outCount; totalAmbig += r.ambigCount; totalFollowAmbig += r.followAmbigCount;
        const ambigPct = r.outCount ? (100 * r.ambigCount / r.outCount).toFixed(1) : '—';
        console.log([pair.toUpperCase(), label, r.outCount, r.ambigCount, ambigPct, r.followAmbigCount,
          r.raw.n, r.raw.mean?.toFixed(4) ?? '—', r.raw.t?.toFixed(2) ?? '—', r.raw.winRate ?? '—',
          r.corrected.n, r.corrected.mean?.toFixed(4) ?? '—', r.corrected.t?.toFixed(2) ?? '—', r.corrected.winRate ?? '—'].join('\t'));
      } catch (e) { console.log(`${pair} ${label}: FAILED (${e.message})`); }
    }
  }
  console.log(`\nTOTAL 'out' resolutions: ${totalOut}, same-bar ambiguous: ${totalAmbig} (${(100*totalAmbig/totalOut).toFixed(1)}%), of which FOLLOW decisions: ${totalFollowAmbig}`);
}

main();
