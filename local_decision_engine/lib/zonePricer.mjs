/**
 * zonePricer.mjs — the local, verbatim equivalent of server.js's
 * _volatilityV2PriceZone (server.js:16551) and _volatilityV2InstrumentPreview
 * (server.js:16633). Same imports, same logic, fed a LOCAL book + LOCAL M1
 * packed array instead of R2 + getFastLive's remote warm cache — so a
 * decision is computed fresh at call time, not served from a stale
 * 45-second snapshot. See MD files/LOCAL_DECISION_ENGINE_ARCHITECTURE.md
 * for the full rationale.
 *
 * Deliberately imports the SAME pure modules server.js does for this exact
 * computation, not reimplementations of them — voteDecision, matchLiveContext,
 * priceBarrierTrade and atlasWalk have no R2/KV/Railway-specific state
 * (confirmed by direct trace before this file was written), so they run
 * identically here. Do not port their logic into this file; import them.
 */
import { atlasWalk, rungLevelsForLadder, RUNGS } from '../../js/levelAtlasEngine.js';
import { voteDecision, priceBarrierTrade } from '../../js/levelAtlasVoteReview.js';
import { matchLiveContext } from '../../js/levelAtlasReport.js';
import { bucketM1IntoSessions } from '../../js/forecastAnalyser.js';
import { forecastSigma } from '../../js/forecastSigma.js';
import { buildLadder } from '../../js/forecastLadder.js';
import { LADDER_PARAMS } from '../../js/forecastLadderParams.js';
import { assetClass as assetClassOf } from '../../js/instrumentRegistry.js';
import { costForPair } from '../../js/perLineStrategy.js';

export const DEFAULT_REARM = 0.3;
// Same OOS-validated floor as server.js's VOLATILITY_V2_MIN_MARGIN
// (server.js:16435) — keep these in sync by hand; there are only two
// copies (there, and here) until Fib Atlas adopts this file too.
export const MIN_MARGIN = 3;

// Mirrors js/levelAtlasRoutes.js's computeLiveContext (js/levelAtlasRoutes.js:314-321)
// exactly, just given a LOCAL packed array instead of the server's warm cache.
export function computeLiveContext(pair, packed) {
  const sym = pair.toUpperCase();
  const assetClass = (() => { try { return assetClassOf(pair); } catch { return 'fx'; } })();
  const { touches, pending, coverage } = atlasWalk(packed, {
    instrument: sym, assetClass, rearmFracs: [DEFAULT_REARM], pendingRearmFrac: DEFAULT_REARM,
  });
  const liveDate = coverage?.to ?? null;
  const liveTouches = liveDate ? touches.filter(t => t.rearmFrac === DEFAULT_REARM && t.date === liveDate) : [];
  return { date: liveDate, touches: liveTouches, pending: pending ?? [], assetClass };
}

// Mirrors server.js's _volatilityV2PriceZone (server.js:16551-16601) exactly.
// `rec` is a pending-shaped live record (from computeLiveContext's `pending`).
function priceZone(rec, book, ladderBySide, cost, { earlyExit = false, earlyExitThreshold = 0.4 } = {}) {
  let withDist = rec;
  if (rec.innerDistPips == null) {
    const lv = ladderBySide[rec.side];
    if (!lv) return null;
    const ri = RUNGS.indexOf(rec.rung);
    if (ri < 0) return null;
    const here = lv[ri + 1], inner = lv[ri], outer = lv[ri + 2] ?? null;
    const rungSpan = Math.abs(here - inner);
    withDist = {
      ...rec,
      innerDistPips: +(rungSpan / rec.pip).toFixed(1),
      outerDistPips: outer != null ? +(Math.abs(outer - here) / rec.pip).toFixed(1) : null,
    };
  }
  const vd = voteDecision(book, withDist);
  if (!vd || vd.margin < MIN_MARGIN) return null;
  const priced = priceBarrierTrade(withDist, vd.decision, cost);
  if (!priced) return null;   // structurally unpriceable (e.g. a 'follow' with no outer rung)

  const sgn = withDist.side === 'up' ? 1 : -1;
  const inner = withDist.level - sgn * withDist.innerDistPips * withDist.pip;
  const outerDistPips = withDist.outerDistPips;
  const outer = outerDistPips != null ? withDist.level + sgn * outerDistPips * withDist.pip : null;
  if (outer == null) return null;   // a follow at the outermost rung — no real stop, don't publish it
  const tp = vd.decision === 'fade' ? inner : outer;
  const sizingSl = vd.decision === 'fade' ? outer : inner;
  let sl = sizingSl;
  if (earlyExit && vd.decision === 'fade' && outerDistPips != null) {
    const cutDistPips = outerDistPips * earlyExitThreshold;
    sl = withDist.level + sgn * cutDistPips * withDist.pip;
  }

  // The per-dimension detail (2026-09-18 audit): recompute matchLiveContext
  // once more alongside voteDecision (redundant but pure/safe, mirrors the
  // same choice made in server.js's own copy of this function) so the caller
  // gets the compact dimKey/bucket/favors list a diff against the backtest
  // actually needs, not just the summary margin.
  const voteMatch = matchLiveContext(book, withDist);
  const voteDims = voteMatch
    ? [...voteMatch.supports, ...voteMatch.challenges, ...voteMatch.context].map(x => ({ k: x.dimKey, b: x.bucket, f: x.favors }))
    : null;

  return {
    side: withDist.side, rung: withDist.rung, decision: vd.decision, margin: vd.margin,
    entry: +withDist.level.toFixed(6), sl: +sl.toFixed(6), sizingSl: +sizingSl.toFixed(6), tp: +tp.toFixed(6),
    rationale: `${vd.decision} · margin ${vd.margin} (${vd.outVotes} out / ${vd.backVotes} back)`,
    voteDims,
  };
}

// Mirrors server.js's _volatilityV2InstrumentPreview (server.js:16633-16716)
// exactly, given a LOCAL book + LOCAL packed M1 array instead of R2 +
// getFastLive. `book` is the `.book` field from GET /api/level-atlas/book/:pair
// (same {instrument, splitDate, cells} shape server.js reads from
// stored.books[DEFAULT_REARM]). `packed` is a local, ~2-week bounded M1
// series kept fresh by sync.mjs.
//
// p90 is deliberately out of scope here — it never goes through the
// standard vote/margin path (server.js's own _volatilityV2PriceP90Zone
// handles it as an unconditional-fade special case); v3's first cut trades
// p50/p75 only, matching every other Level Atlas consumer's own default.
export function computeZones(pair, { book, packed, earlyExit = false, earlyExitThreshold = 0.4 } = {}) {
  const live = computeLiveContext(pair, packed);
  if (!live.date) return { skipped: 'no live coverage yet', zones: [], zoneCount: 0 };
  if (!book?.cells) return { skipped: 'no local book cached — run sync.mjs first', zones: [], zoneCount: 0 };

  const assetCls = live.assetClass;
  const cost = (() => { try { return costForPair(pair, assetCls); } catch { return 0; } })();

  let ladderBySide = {};
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const daily = [...sessions.keys()].sort().map(d => {
    const b = sessions.get(d);
    let hi = -Infinity, lo = Infinity;
    for (const x of b) { if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low; }
    return { date: d, open: b[0].open, high: hi, low: lo, close: b[b.length - 1].close };
  });
  const todayIdx = daily.findIndex(d => d.date === live.date);
  const priorDaily = todayIdx > 0 ? daily.slice(0, todayIdx) : daily.slice(0, -1);
  const todayOpen = todayIdx >= 0 ? daily[todayIdx].open : daily.at(-1)?.open;
  if (priorDaily.length && todayOpen > 0) {
    try {
      const est = LADDER_PARAMS.pairs?.[pair.toUpperCase()]?.estimator ?? LADDER_PARAMS.classDefaults?.[assetCls]?.estimator ?? 'yz_30';
      const sigma = forecastSigma(priorDaily, est);
      if (sigma > 0) {
        const lad = buildLadder(sigma, { instrument: pair.toUpperCase(), assetClass: assetCls, horizon: 'daily', eventTag: 'none' });
        ladderBySide = rungLevelsForLadder(lad, todayOpen);
      }
    } catch { /* non-fatal, matches server.js's own try/catch here */ }
  }

  const zones = [];
  for (const p of (live.pending ?? [])) {
    if (p.rung === 'p90') continue;
    const zone = priceZone(p, book, ladderBySide, cost, { earlyExit, earlyExitThreshold });
    if (!zone) continue;
    const instanceNum = 1 + (live.touches ?? []).filter(t => t.side === p.side && t.rung === p.rung).length;
    zones.push({ ...zone, zone_id: `${pair}_${live.date}_${p.side}_${p.rung}_${instanceNum}` });
  }
  return { spot: live.pending?.[0]?.currentPrice ?? null, date: live.date, zones, zoneCount: zones.length };
}
