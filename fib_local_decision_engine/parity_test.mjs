#!/usr/bin/env node
/**
 * parity_test.mjs — Fib Atlas's own copy of
 * `local_decision_engine/parity_test.mjs` (see that file's header for the
 * full rationale: replay a real, recent touch through the local engine's
 * inputs and assert the output matches the stored backtest for that exact
 * touch — the automated version of the manual comparisons done by hand
 * during the 2026-09-16/17/18 live-vs-backtest investigation).
 *
 * Checks BOTH ladders. Uses `voteDecision` directly (not the full
 * `computeZones` zone-pricing pipeline) — same scope as Vote Atlas's own
 * copy: this validates that a LOCALLY re-derived touch + the SAME book
 * produces the SAME decision/margin the stored backtest already computed,
 * which is the one thing that could silently drift (a bad M1 sync, a stale
 * book, a real code divergence). The zone-pricing math itself
 * (`zonesFromLiveAndBook`) is imported verbatim from the same file
 * production runs, not reimplemented, so it cannot independently diverge.
 */
import { asiaFibAtlasWalk } from '../js/asiaFibAtlasEngine.js';
import { mondayFibAtlasWalk } from '../js/mondayFibAtlasEngine.js';
import { voteDecision } from '../js/asiaFibAtlasVoteReview.js';
import { assetClass as assetClassOf } from '../js/instrumentRegistry.js';

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';
const PAIRS = ['eurusd', 'audusd', 'gbpusd', 'euraud', 'gold'];
const LADDERS = ['asia', 'monday'];
const BOOK_ROUTE = { asia: 'asia-fib-atlas', monday: 'monday-fib-atlas' };
const WALK_FN = { asia: asiaFibAtlasWalk, monday: mondayFibAtlasWalk };

let failures = 0;
const ok = (name, cond, extra) => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); if (!cond) failures++; };

async function fetchBook(pair, ladder) {
  const r = await fetch(`${DASHBOARD_URL}/api/${BOOK_ROUTE[ladder]}/book/${pair}`);
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

async function fetchVoteTrades(pair, ladder) {
  const r = await fetch(`${DASHBOARD_URL}/api/${BOOK_ROUTE[ladder]}/vote-trades/${pair}?minMargin=1`);
  const j = await r.json();
  if (!j.ok) throw new Error(`votetrades fetch failed: ${j.error || 'unknown'}`);
  return j.trades || [];
}

function yesterdayIso() {
  const d = new Date(Date.now() - 24 * 3600_000);
  return d.toISOString().slice(0, 10);
}

async function tryPairLadder(pair, ladder, yDate) {
  const packed = await fetchM1Tail(pair, 180);
  const assetCls = (() => { try { return assetClassOf(pair); } catch { return 'fx'; } })();
  const { touches } = WALK_FN[ladder](packed, {
    instrument: pair.toUpperCase(), assetClass: assetCls, rearmFracs: [0.3], pendingRearmFrac: 0.3,
  });
  const yTouches = touches.filter(t => t.date === yDate && t.rearmFrac === 0.3);
  if (!yTouches.length) return null;

  const book = await fetchBook(pair, ladder);
  const storedTrades = await fetchVoteTrades(pair, ladder);
  // Try every one of yesterday's touches, not just the first — a real
  // fraction of touches structurally have no vd (e.g. a 'follow' at the
  // outermost rung), and this test only needs ONE usable fixture, not
  // agreement across all of them.
  for (const yTouch of yTouches) {
    const vd = voteDecision(book, yTouch);
    if (!vd) continue;
    // NOTE: the raw walk touch's own rung field is called `level`; the
    // stored /vote-trades API response calls the same thing `rung` —
    // different names for the same value, found 2026-09-18 debugging this
    // test's own false negative (comparing `t.rung === yTouch.rung` always
    // failed since `yTouch.rung` is undefined on a raw touch object).
    const stored = storedTrades.find(t => t.date === yDate && t.side === yTouch.side && t.rung === yTouch.level && t.time === yTouch.time);
    if (stored) return { pair, ladder, touch: yTouch, local: vd, stored };
  }
  return null;
}

async function checkLadder(ladder, yDate) {
  console.log(`\n[${ladder}] looking for a resolved touch on ${yDate} across ${PAIRS.join(', ')}…`);
  let found = null;
  for (const pair of PAIRS) {
    try {
      const r = await tryPairLadder(pair, ladder, yDate);
      if (r?.stored) { found = r; break; }
    } catch (e) { console.log(`  [${pair}] skipped: ${e.message}`); }
  }

  ok(`[${ladder}] found a touch with both a local and a stored (backtest) computation`, !!found,
    found && { pair: found.pair, side: found.touch.side, rung: found.touch.rung, time: new Date(found.touch.time * 1000).toISOString() });
  if (!found) { console.log(`  (no usable ${ladder} fixture yesterday — try again tomorrow, or widen PAIRS)`); return; }

  console.log(`  local:  ${found.local.decision} margin=${found.local.margin}`);
  console.log(`  stored: ${found.stored.decision} margin=${found.stored.margin}`);
  ok(`[${ladder}] decision matches the honest backtest`, found.local.decision === found.stored.decision);
  ok(`[${ladder}] margin matches the honest backtest`, found.local.margin === found.stored.margin);
}

async function main() {
  const yDate = yesterdayIso();
  for (const ladder of LADDERS) await checkLadder(ladder, yDate);
  console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error('[parity_test] fatal:', e); process.exit(1); });
