#!/usr/bin/env node
/**
 * parity_test.mjs — replays a real, recent touch through the local decision
 * engine and asserts its output matches the stored "honest" backtest
 * computation for that exact touch. This is the permanent, automated
 * version of the manual comparison done by hand during the 2026-09-17/18
 * live-vs-backtest divergence investigation — run this before ever trusting
 * a new build of zonePricer.mjs, not just once.
 *
 * Requires network access to DASHBOARD_URL only (the m1-tail route and the
 * book/votetrades routes) — no OANDA credential needed, since it exercises
 * GET /api/level-atlas/m1-tail (the archive-sourced route, not a live OANDA
 * fetch). 2026-09-18 finding: a fresh, independent OANDA re-fetch of the
 * SAME historical window does NOT reproduce the official archive's
 * vote/margin for the identical touch (confirmed independent of window
 * length: 100d and 400d gave IDENTICAL wrong results) — this test
 * deliberately exercises the CORRECTED sync path (the same one sync.mjs
 * uses) so it validates what the engine actually runs on in production,
 * not a method already known to diverge.
 *
 * Picks YESTERDAY's first fully-resolved touch (any pair/side/rung
 * configured pair, whichever fires first) rather than a hardcoded date —
 * the m1-tail route always serves data ending at NOW, so a fixed historical
 * date isn't reachable through the same route the engine actually uses,
 * and pinning to "yesterday" keeps this test runnable indefinitely instead
 * of expiring the day the archive moves on.
 */
import { computeLiveContext } from './lib/zonePricer.mjs';
import { voteDecision } from '../js/levelAtlasVoteReview.js';

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';
const PAIRS = ['audusd', 'eurusd', 'gbpusd', 'euraud', 'gold'];   // try a few — whichever has a resolved touch yesterday wins

let failures = 0;
const ok = (name, cond, extra) => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); if (!cond) failures++; };

async function fetchBook(pair) {
  const r = await fetch(`${DASHBOARD_URL}/api/level-atlas/book/${pair}?rearm=0.3`);
  const j = await r.json();
  if (!j.ok || !j.book) throw new Error(`book fetch failed: ${j.error || 'unknown'}`);
  return j.book;
}

async function fetchM1Tail(pair, days) {
  const r = await fetch(`${DASHBOARD_URL}/api/level-atlas/m1-tail/${pair}?days=${days}`);
  const j = await r.json();
  if (!j.ok || !j.n) throw new Error(`m1-tail fetch failed: ${j.error || 'unknown'}`);
  return { n: j.n, times: j.times, opens: j.opens, highs: j.highs, lows: j.lows, closes: j.closes, volumes: j.volumes };
}

async function fetchVoteTrades(pair) {
  const r = await fetch(`${DASHBOARD_URL}/api/level-atlas/vote-trades/${pair}`);
  const j = await r.json();
  if (!j.ok) throw new Error(`votetrades fetch failed: ${j.error || 'unknown'}`);
  return j.trades || [];
}

function yesterdayIso() {
  const d = new Date(Date.now() - 24 * 3600_000);
  return d.toISOString().slice(0, 10);
}

async function tryPair(pair, yDate) {
  const packed = await fetchM1Tail(pair, 90);
  const live = computeLiveContext(pair, packed);
  // atlasWalk's own `touches` includes every prior resolved day, not just
  // "today" — find yesterday's touches directly rather than relying on the
  // live-day filter computeLiveContext already applied for "today".
  const { touches } = (await import('../js/levelAtlasEngine.js')).atlasWalk(packed, {
    instrument: pair.toUpperCase(),
    assetClass: (() => { try { return live.assetClass; } catch { return 'fx'; } })(),
    rearmFracs: [0.3], pendingRearmFrac: 0.3,
  });
  const yTouch = touches.find(t => t.date === yDate && t.rearmFrac === 0.3);
  if (!yTouch) return null;

  const book = await fetchBook(pair);
  const vd = voteDecision(book, yTouch);
  if (!vd) return null;

  const stored = (await fetchVoteTrades(pair)).find(t => t.date === yDate && t.side === yTouch.side && t.rung === yTouch.rung && t.time === yTouch.time);
  return { pair, touch: yTouch, local: vd, stored };
}

async function main() {
  const yDate = yesterdayIso();
  console.log(`[parity_test] looking for a resolved touch on ${yDate} across ${PAIRS.join(', ')}…`);

  let found = null;
  for (const pair of PAIRS) {
    try {
      const r = await tryPair(pair, yDate);
      if (r?.stored) { found = r; break; }
    } catch (e) { console.log(`  [${pair}] skipped: ${e.message}`); }
  }

  ok('found a touch with both a local and a stored (backtest) computation', !!found, found && { pair: found.pair, side: found.touch.side, rung: found.touch.rung, time: new Date(found.touch.time * 1000).toISOString() });
  if (!found) { console.log(`\n${failures} CHECK(S) FAILED ✗ (no usable fixture today — try again tomorrow, or widen PAIRS)`); process.exit(1); }

  console.log(`  local:  ${found.local.decision} margin=${found.local.margin}`);
  console.log(`  stored: ${found.stored.decision} margin=${found.stored.margin}`);
  ok('decision matches the honest backtest', found.local.decision === found.stored.decision);
  ok('margin matches the honest backtest', found.local.margin === found.stored.margin);

  console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error('[parity_test] fatal:', e); process.exit(1); });
