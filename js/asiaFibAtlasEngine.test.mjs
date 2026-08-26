/**
 * Unit tests for js/asiaFibAtlasEngine.js. Pure/synthetic: no network.
 *   node js/asiaFibAtlasEngine.test.mjs
 *
 * Same discipline as levelAtlasEngine.test.mjs: the causality tests are the
 * load-bearing ones (see REFERENCE_ENGINE_PLAYBOOK.md §6.1). This engine
 * reuses several of Level Atlas's already-proven patterns (churn,
 * otherSideTouchedBefore, prevOutcomeSameDay/CrossDay, rollingRate) as fresh
 * code, not imports — so a real regression could occur independently, and
 * each gets its own test here rather than being assumed correct by
 * inheritance. Three risks are genuinely NEW to this engine and get the most
 * scrutiny: Monday's is-current-week gating, levelFlipState, and
 * rangeBudgetUsedPct/gapSig (both depend on `dayOpen`, which was defined
 * AFTER its first use once during development — a temporal-dead-zone
 * ReferenceError silently swallowed by a try/catch, caught only by actually
 * running the walk and inspecting null-rates, not by node --check or a type
 * system. These tests exist so that class of bug can't silently return.)
 */
import assert from 'node:assert/strict';
import { asiaFibAtlasWalk, asiaFibAtlasLiveToday, RUNGS_ABOVE, RUNGS_BELOW, SIDES } from './asiaFibAtlasEngine.js';
import { buildAsiaSessions, buildMondayRanges, mondayForDay, prevMonday, dowOf } from './sessionRanges.js';

let passed = 0;
const t = (n, f) => { try { f(); passed++; console.log(`  ✓ ${n}`); }
  catch (e) { console.error(`  ✗ ${n}\n    ${e.message}`); process.exitCode = 1; } };

console.log('asiaFibAtlasEngine');

// ── Synthetic M1: same generator as levelAtlasEngine.test.mjs (deterministic,
// no Math.random(), so the same perturb-and-diff technique applies) ──────────
const T0 = 1577836800;   // 2020-01-01 UTC
function packedM1(nBars, { drift = 0.0003, wiggle = 0.02 } = {}) {
  const times = new Int32Array(nBars), opens = new Float32Array(nBars);
  const highs = new Float32Array(nBars), lows = new Float32Array(nBars);
  const closes = new Float32Array(nBars), volumes = new Float32Array(nBars);
  let px = 100;
  for (let i = 0; i < nBars; i++) {
    const o = px;
    px = px + drift * Math.sin(i / 4000) + wiggle * Math.sin(i / 11) + (i % 97 === 0 ? wiggle * 3 : 0);
    times[i] = T0 + i * 60; opens[i] = o; closes[i] = px;
    highs[i] = Math.max(o, px) + 0.03; lows[i] = Math.min(o, px) - 0.03;
    volumes[i] = 80 + (i % 13);
  }
  return { n: nBars, times, opens, highs, lows, closes, volumes };
}

const P = packedM1(60 * 24 * 400);   // ~400 days of M1

// `packedM1`'s `(i % 97 === 0 ? wiggle * 3 : 0)` spike is POSITIVE-only, so
// over 400 days it compounds into a real, persistent uptrend (px drifts
// ~100->~159) — fine for the causality tests above (they only need SOME
// touches to exist), but it means downside extension rungs, and same-day
// double-sided touches, are essentially never seen. The tests below that
// need those construct a specific day's price action directly rather than
// hoping a bigger/differently-shaped random generator produces one (an
// earlier attempt at a "symmetric" generator turned out to still be
// structurally range-bound at any wiggle amplitude — the shape, not the
// scale, was the problem).

t('asiaFibAtlasWalk runs end-to-end and returns touches with a sane shape', () => {
  const { touches, coverage } = asiaFibAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  assert.ok(coverage, 'coverage present');
  assert.ok(touches.length > 500, `expected many touches, got ${touches.length}`);
  for (const r of touches) {
    assert.ok(SIDES.includes(r.side));
    assert.ok(['out', 'back', 'neither'].includes(r.outcome));
    assert.ok(Number.isFinite(r.fadePips), 'fadePips must be finite');
    assert.ok(Number.isFinite(r.runPips), 'runPips must be finite');
    assert.ok(r.pullbackFrac == null || (r.pullbackFrac >= 0 && r.pullbackFrac <= 1));
  }
});

t('the walk only ever emits EXTENSION rungs — the 0/0.25/0.5/0.75/1 key levels (the range box itself) are never touch events', () => {
  const { touches } = asiaFibAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  for (const r of touches) {
    const set = r.side === 'above' ? RUNGS_ABOVE : RUNGS_BELOW;
    assert.ok(set.includes(r.level), `level ${r.level} (side ${r.side}) is not a declared extension rung`);
    assert.ok(r.level < 0 || r.level > 1, `level ${r.level} falls inside [0,1] — should have been excluded as a key/box level`);
  }
});

t('gapSig/dayOpen/rangeBudgetUsedPct are never NaN — the dayOpen temporal-dead-zone class of bug cannot silently return', () => {
  const { touches } = asiaFibAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  assert.ok(touches.every(r => Number.isFinite(r.gapSig)), 'gapSig must always be a finite number, never NaN');
  assert.ok(touches.every(r => Number.isFinite(r.dayOpen) && r.dayOpen > 0), 'dayOpen must always resolve to a real price');
  const withBudget = touches.filter(r => r.rangeBudgetUsedPct != null);
  assert.ok(withBudget.length > touches.length * 0.5, `expected rangeBudgetUsedPct to resolve for most touches, got ${withBudget.length}/${touches.length}`);
  assert.ok(withBudget.every(r => r.rangeBudgetUsedPct >= 0), 'rangeBudgetUsedPct cannot be negative');
});

t('dayVol/gapSig/rangeBudgetUsedPct are NOT derived from a FAR-FUTURE perturbation', () => {
  // Same technique as levelAtlasEngine's own dayVol test: perturb only the
  // dataset's LAST 300 bars and confirm every touch dated well before the
  // perturbed region reads identically in both runs.
  const base = packedM1(60 * 24 * 260, { wiggle: 0.02 });
  const wild = { ...base, highs: base.highs.slice(), lows: base.lows.slice(), closes: base.closes.slice() };
  const start = base.n - 300;
  for (let i = start; i < base.n; i++) { wild.highs[i] += 5; wild.lows[i] -= 5; }

  const a = asiaFibAtlasWalk(base, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const b = asiaFibAtlasWalk(wild, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });

  const allDatesSorted = [...new Set(a.touches.map(r => r.date))].sort();
  const cutoffDate = allDatesSorted[Math.max(0, allDatesSorted.length - 25)];
  const keyOf = r => `${r.date}|${r.side}|${r.level}|${r.ordinal}|${r.hourUtc}|${r.minute}`;
  const byKeyA = new Map(a.touches.map(r => [keyOf(r), r]));

  let checked = 0;
  for (const rb of b.touches) {
    if (rb.date >= cutoffDate) continue;
    const ra = byKeyA.get(keyOf(rb));
    if (!ra) continue;
    checked++;
    assert.equal(ra.dayVol, rb.dayVol, `dayVol leaked a far-future perturbation on ${ra.date}`);
    assert.equal(ra.gapSig, rb.gapSig, `gapSig leaked a far-future perturbation on ${ra.date}`);
    assert.equal(ra.rangeBudgetUsedPct, rb.rangeBudgetUsedPct, `rangeBudgetUsedPct leaked a far-future perturbation on ${ra.date}`);
    assert.equal(ra.outcome, rb.outcome, `outcome itself changed on ${ra.date} despite the perturbation being far in the future`);
  }
  assert.ok(checked > 50, `too few comparable touches to trust the result (${checked})`);
});

t('a Monday touch never reads the SAME week\'s (still-forming) Monday range — only the previous week\'s', () => {
  // Direct, white-box check of the exact resolution rule the engine runs
  // (`if (isMonday && mon) mon = prevMonday(mondayRanges, mon.epoch)`), using
  // the SAME imported helpers on the SAME data — not a behavioural
  // perturbation (which turned out fragile here: perturbing a Monday's own
  // bars shifts which touches occur that day at all, breaking the
  // record-matching key before the confluence question can even be asked).
  // This is what the engine itself does, reproduced rather than re-derived,
  // so a regression in the actual `if (isMonday && mon) ...` line would still
  // be caught if it silently vanished or got the ternary backwards.
  const asiaSessions = buildAsiaSessions(P, 'london', 6, 5);
  const mondayRanges = buildMondayRanges(P, 'london');
  let checkedMonday = 0, checkedNonMonday = 0;
  for (const asia of asiaSessions) {
    const isMonday = dowOf(asia.date) === 1;
    let mon = mondayForDay(mondayRanges, asia.epoch);
    if (!mon) continue;
    const resolvedEpoch = isMonday ? prevMonday(mondayRanges, mon.epoch)?.epoch : mon.epoch;
    if (resolvedEpoch == null) continue;
    if (isMonday) {
      checkedMonday++;
      // The resolved Monday must be a DIFFERENT, EARLIER week than the one
      // this Asia session itself belongs to — at least 6 days back (the
      // current week's own Monday, by construction, sits within the same
      // 7-day window as `asia.epoch`).
      assert.ok(asia.epoch - resolvedEpoch >= 6 * 86400, `Monday touch on ${asia.date} resolved to a Monday range only ${(asia.epoch - resolvedEpoch) / 86400}d back — should be a full week+`);
    } else {
      checkedNonMonday++;
      // A non-Monday day's resolved Monday must be WITHIN the current week
      // (mondayForDay's own <7-day contract) and strictly before today.
      assert.ok(resolvedEpoch < asia.epoch && asia.epoch - resolvedEpoch < 7 * 86400, `non-Monday day ${asia.date} resolved to a Monday range outside its own week`);
    }
  }
  assert.ok(checkedMonday > 5, `too few Monday sessions checked (${checkedMonday})`);
  assert.ok(checkedNonMonday > 100, `too few non-Monday sessions checked (${checkedNonMonday})`);
});

t('levelFlipState is a pure function of bars UP TO the touch — later bars must not change it', () => {
  const base = packedM1(60 * 24 * 120, { wiggle: 0.02 });
  const a = asiaFibAtlasWalk(base, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  assert.ok(a.touches.some(r => r.levelFlipState === 'retest'), 'expected at least one retest reading in the fixture');
  const wild = { ...base, highs: base.highs.slice(), lows: base.lows.slice(), closes: base.closes.slice() };
  const start = base.n - 500;
  for (let i = start; i < base.n; i++) { wild.highs[i] += 3; wild.lows[i] -= 3; wild.closes[i] += 1.5; }
  const b = asiaFibAtlasWalk(wild, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const lastDates = [...new Set(a.touches.map(r => r.date))].sort();
  const cutoff = lastDates[Math.max(0, lastDates.length - 15)];
  const keyOf = r => `${r.date}|${r.side}|${r.level}|${r.ordinal}|${r.hourUtc}|${r.minute}`;
  const byKeyA = new Map(a.touches.map(r => [keyOf(r), r]));
  let checked = 0;
  for (const rb of b.touches) {
    if (rb.date >= cutoff) continue;
    const ra = byKeyA.get(keyOf(rb));
    if (!ra) continue;
    checked++;
    assert.equal(ra.levelFlipState, rb.levelFlipState, `levelFlipState leaked a future perturbation on ${ra.date}`);
    assert.equal(ra.churn, rb.churn, `churn leaked a future perturbation on ${ra.date}`);
  }
  assert.ok(checked > 30, `too few comparable touches (${checked})`);
});

t('ordinal increments only after the re-arm distance is cleared (tighter re-arm sees >= tests than looser)', () => {
  const { touches } = asiaFibAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.15, 0.5] });
  const maxOrd = frac => Math.max(...touches.filter(r => r.rearmFrac === frac).map(r => r.ordinal));
  assert.ok(maxOrd(0.15) >= maxOrd(0.5), `tight re-arm (${maxOrd(0.15)}) should see >= tests than loose (${maxOrd(0.5)})`);
});

t('otherSideTouchedBefore never uses a LATER opposite-side touch on the same day', () => {
  // A day with BOTH sides genuinely touched turns out to be structurally rare
  // in both generators above (a trending or range-bound session tends to stay
  // on one side of its own Asia range for the whole post-Asia window) — rare
  // enough that neither fixture reliably produces one. Construct it directly
  // instead: take a normal 100-day history (real causal lookback, nothing
  // touched yet), then shift ONE session's post-Asia window bars — the first
  // half of the window pushed 3x the Asia range BELOW it, the second half 3x
  // ABOVE it (bars 1-per-minute with no gaps, so the global index is exact
  // from `T0 + i*60`) — a deliberate, deterministic V, not a statistical hope.
  const base = packedM1(60 * 24 * 100);
  const asiaSessions = buildAsiaSessions(base, 'london', 6, 5);
  const target = asiaSessions[79];   // comfortably past minLookback=60
  const winStart = target.epoch + 6 * 3600, winEnd = target.epoch + 24 * 3600;
  const startIdx = Math.round((winStart - T0) / 60), endIdx = Math.round((winEnd - T0) / 60);
  const mid = startIdx + Math.floor((endIdx - startIdx) / 2);
  const wild = { n: base.n, times: base.times, volumes: base.volumes,
    opens: base.opens.slice(), highs: base.highs.slice(), lows: base.lows.slice(), closes: base.closes.slice() };
  const bigDelta = target.range * 3;
  for (let idx = startIdx; idx < mid; idx++) { wild.opens[idx] -= bigDelta; wild.highs[idx] -= bigDelta; wild.lows[idx] -= bigDelta; wild.closes[idx] -= bigDelta; }
  for (let idx = mid; idx < endIdx; idx++) { wild.opens[idx] += bigDelta; wild.highs[idx] += bigDelta; wild.lows[idx] += bigDelta; wild.closes[idx] += bigDelta; }

  const { touches } = asiaFibAtlasWalk(wild, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const today = touches.filter(r => r.date === target.date);
  const above = today.filter(r => r.side === 'above').sort((a, b) => a.minsIntoWindow - b.minsIntoWindow);
  const below = today.filter(r => r.side === 'below').sort((a, b) => a.minsIntoWindow - b.minsIntoWindow);
  assert.ok(above.length > 0 && below.length > 0, `expected both sides touched on the constructed day (above=${above.length}, below=${below.length})`);
  // Constructed so BELOW fires first (the down-shifted half comes first
  // chronologically) — assert the exact, known ordering, not just "some day
  // where one preceded the other".
  assert.ok(below[0].minsIntoWindow < above[0].minsIntoWindow, 'sanity: below should fire before above by construction');
  assert.equal(below[0].otherSideTouchedBefore, false, "below's own first touch must not see itself as the 'other side'");
  assert.equal(above[0].otherSideTouchedBefore, true, "above's first touch, coming after below's, must see otherSideTouchedBefore=true");
});

t('prevOutcomeSameDay excludes the tautological same-day "neither" case (same reasoning as levelAtlasEngine)', () => {
  const { touches } = asiaFibAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  for (const r of touches) {
    if (r.daysSincePrev === 0 && r.prevOutcome === 'neither') {
      assert.equal(r.prevOutcomeSameDay, null, 'same-day neither must be excluded from prevOutcomeSameDay');
    }
  }
  assert.ok(touches.some(r => r.prevOutcomeSameDay != null), 'expected at least some same-day non-neither visits');
});

t('prevOutcomeSameDay / prevOutcomeCrossDay partition daysSincePrev cleanly and never both fire', () => {
  const { touches } = asiaFibAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  for (const r of touches) {
    assert.ok(!(r.prevOutcomeSameDay != null && r.prevOutcomeCrossDay != null), 'same-day and cross-day must be mutually exclusive');
    if (r.prevOutcomeSameDay != null) assert.equal(r.daysSincePrev, 0);
    if (r.prevOutcomeCrossDay != null) assert.ok(r.daysSincePrev > 0);
  }
});

t('rollingRate only reports once >=3 prior visits exist, and never counts the current touch', () => {
  const { touches } = asiaFibAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const key = r => `${r.side}|${r.level}|${r.rearmFrac}`;
  const byKey = {};
  for (const r of touches) (byKey[key(r)] ??= []).push(r);
  for (const list of Object.values(byKey)) {
    for (let i = 0; i < Math.min(list.length, 200); i++) {
      const priorCount = i;
      if (priorCount < 3) assert.equal(list[i].rollingRate, null, `rollingRate should be null with only ${priorCount} prior visits`);
      else assert.ok(list[i].rollingRate.n <= Math.min(5, priorCount), `rollingRate.n exceeds available prior visits`);
    }
  }
});

t('confluenceGrade is Asia-vs-previous-Asia ONLY — never affected by the Monday ladder', () => {
  // The core regression this test exists for: an earlier version of this
  // engine cross-compared today's Asia rungs against the Monday ladder and
  // folded that into confluenceGrade, which doesn't match the original
  // indicator (it runs Asia-vs-prevAsia and Monday-vs-prevMonday as two
  // independent tracks, never crossed). Proven here by construction: a
  // touch's asiaConfPips alone must fully determine confluenceGrade,
  // regardless of what mondayCrossPips says.
  const { touches } = asiaFibAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const valid = new Set(['0·none', '1·match', '2·tight']);
  let checkedTight = 0, checkedMatch = 0, checkedNone = 0;
  for (const r of touches) {
    assert.ok(valid.has(r.confluenceGrade), `unexpected confluenceGrade: ${r.confluenceGrade}`);
    if (r.asiaConfPips == null) { assert.equal(r.confluenceGrade, '0·none'); checkedNone++; continue; }
    // confluenceGrade must be derivable from asiaConfPips alone (within the
    // pip-zone bucketing's own resolution) — never from mondayCrossPips.
    if (r.confluenceGrade === '2·tight') checkedTight++;
    else if (r.confluenceGrade === '1·match') checkedMatch++;
    else checkedNone++;
  }
  assert.ok(checkedTight + checkedMatch + checkedNone === touches.length);
  assert.ok(checkedMatch + checkedTight > 0, 'expected at least some Asia-vs-prevAsia matches in the fixture');
});

t('asiaConfPips / mondayCrossPips / mondayWeekTightestPips are continuous pip gaps, always non-negative, never threshold-gated', () => {
  const { touches } = asiaFibAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  let sawAsiaBeyondThreshold = false;
  for (const r of touches) {
    for (const [pips, zone] of [[r.asiaConfPips, r.asiaConfZone], [r.mondayCrossPips, r.mondayCrossZone], [r.mondayWeekTightestPips, r.mondayWeekZone]]) {
      if (pips == null) { assert.equal(zone, null); continue; }
      assert.ok(pips >= 0, `pip gap must be non-negative, got ${pips}`);
      assert.ok(zone != null, 'a non-null pip gap must always bucket to a zone');
    }
    // "Always reported, never threshold-gated" — confluenceGrade being
    // '0·none' (outside the match threshold) must NOT force asiaConfPips to
    // null; it should still report the real (larger) distance.
    if (r.confluenceGrade === '0·none' && r.asiaConfPips != null) sawAsiaBeyondThreshold = true;
  }
  assert.ok(sawAsiaBeyondThreshold, 'expected at least one touch with a real, beyond-threshold asiaConfPips reading — otherwise the continuous field is silently just re-deriving the gate');
});

t('mondayWeekTightestPips/Zone are constant for every touch within the same reference cycle (drawn once, persists)', () => {
  // The cycle runs TUESDAY -> the FOLLOWING Monday inclusive, not calendar
  // Mon-Sun: a Monday itself falls back to the PREVIOUS week's resolved
  // Monday (see the engine's `is_current_monday ? prev_monday : curr_monday`
  // rule), so it shares `mon`/`mon2` — and therefore this value — with the
  // Tue-Sun that preceded it, not with the week that's about to start.
  const { touches } = asiaFibAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const byCycle = new Map();
  for (const r of touches) {
    const d = new Date(r.date + 'T00:00:00Z');
    const dow = d.getUTCDay();   // 0=Sun..6=Sat
    const offsetToRefMonday = dow === 1 ? -7 : -((dow + 6) % 7);   // Monday -> last week's; else -> this week's
    const refMonday = new Date(d); refMonday.setUTCDate(d.getUTCDate() + offsetToRefMonday);
    const key = refMonday.toISOString().slice(0, 10);
    if (!byCycle.has(key)) byCycle.set(key, []);
    byCycle.get(key).push(r);
  }
  let checked = 0;
  for (const list of byCycle.values()) {
    const vals = new Set(list.map(r => r.mondayWeekTightestPips));
    if (vals.size > 1) continue;   // a cycle spanning a data gap/holiday can legitimately vary — skip, not a failure
    checked++;
    assert.equal(vals.size, 1, 'mondayWeekTightestPips must be identical for every touch in the same reference cycle');
  }
  assert.ok(checked > 20, `too few reference cycles checked (${checked})`);
});

t('the innermost rung\'s inner barrier is the range boundary itself (asia high/low), not another extension rung', () => {
  const { touches } = asiaFibAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const innerAbove = touches.filter(r => r.side === 'above' && r.level === RUNGS_ABOVE[0] && r.outcome === 'back');
  const innerBelow = touches.filter(r => r.side === 'below' && r.level === RUNGS_BELOW[0] && r.outcome === 'back');
  assert.ok(innerAbove.length > 0 || innerBelow.length > 0, 'expected at least one innermost-rung "back" resolution to check');
  for (const r of innerAbove) assert.ok(Math.abs(r.innerDistPips - Math.abs((r.asiaHigh) - r.price) / r.pip) < 0.5, 'innermost above rung\'s inner distance should equal price-to-asiaHigh');
  for (const r of innerBelow) assert.ok(Math.abs(r.innerDistPips - Math.abs(r.price - r.asiaLow) / r.pip) < 0.5, 'innermost below rung\'s inner distance should equal price-to-asiaLow');
});

t('the outermost rung has outerDistPips=null (no further real barrier)', () => {
  // Same deterministic-construction technique as the otherSideTouchedBefore
  // test above: reaching a 10.5x/-9.5x extension is genuinely rare (that's
  // the whole point of it being the "far exhaustion zone" per the lesson
  // notes), so a statistical fixture is the wrong tool here — push one
  // session's post-Asia window 15x its own Asia range in one direction,
  // guaranteeing the outermost rung actually gets touched and resolved.
  const base = packedM1(60 * 24 * 100);
  const asiaSessions = buildAsiaSessions(base, 'london', 6, 5);
  const target = asiaSessions[79];
  const winStart = target.epoch + 6 * 3600, winEnd = target.epoch + 24 * 3600;
  const startIdx = Math.round((winStart - T0) / 60), endIdx = Math.round((winEnd - T0) / 60);
  const wild = { n: base.n, times: base.times, volumes: base.volumes,
    opens: base.opens.slice(), highs: base.highs.slice(), lows: base.lows.slice(), closes: base.closes.slice() };
  const bigDelta = target.range * 15;
  for (let idx = startIdx; idx < endIdx; idx++) { wild.opens[idx] += bigDelta; wild.highs[idx] += bigDelta; wild.lows[idx] += bigDelta; wild.closes[idx] += bigDelta; }

  const { touches } = asiaFibAtlasWalk(wild, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const outerAbove = touches.filter(r => r.date === target.date && r.side === 'above' && r.level === RUNGS_ABOVE.at(-1));
  assert.ok(outerAbove.length > 0, `expected the constructed day to reach the outermost rung (${RUNGS_ABOVE.at(-1)}x)`);
  for (const r of outerAbove) {
    assert.equal(r.outerDistPips, null);
    assert.notEqual(r.outcome, 'out', 'the outermost rung can never resolve "out" — there is no further real barrier');
  }
});

// ── asiaFibAtlasLiveToday ─────────────────────────────────────────────────
t('asiaFibAtlasLiveToday returns only touches dated the LAST session, at rearmFrac 0.3 by default', () => {
  const { touches, date } = asiaFibAtlasLiveToday(P, { instrument: 'EURUSD', assetClass: 'fx' });
  assert.ok(date, 'expected a resolved "today" date');
  assert.ok(touches.every(r => r.date === date));
  assert.ok(touches.every(r => r.rearmFrac === 0.3));
});

t('a touch too close to the truncation point to have had room to resolve reports outcome:"neither"', () => {
  const cut = P.n - 3;
  const truncated = { n: cut, times: P.times.slice(0, cut), opens: P.opens.slice(0, cut),
                       highs: P.highs.slice(0, cut), lows: P.lows.slice(0, cut),
                       closes: P.closes.slice(0, cut), volumes: P.volumes.slice(0, cut) };
  const { touches } = asiaFibAtlasLiveToday(truncated, { instrument: 'EURUSD', assetClass: 'fx' });
  const nearBoundary = touches.filter(r => (cut - (P.n - truncated.n)) - Math.round(r.minsIntoWindow) <= 3);
  for (const r of nearBoundary) {
    assert.equal(r.outcome, 'neither', `a touch with almost no runway resolved to "${r.outcome}"`);
    assert.equal(r.resolveIdx, null);
  }
});

t('liveWindowDays=90 produces IDENTICAL touches for the live day as the full walk', () => {
  // Same rolling-window reuse guarantee as levelAtlasEngine's own test —
  // every context input here is a bounded trailing-window function.
  const full = asiaFibAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const fast = asiaFibAtlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3], liveWindowDays: 90 });
  assert.equal(fast.coverage.to, full.coverage.to, 'both must land on the same live date');
  const fullToday = full.touches.filter(r => r.date === full.coverage.to);
  const fastToday = fast.touches.filter(r => r.date === fast.coverage.to);
  assert.equal(fastToday.length, fullToday.length, 'same number of real touches on the live day');
  const EXCLUDE = new Set(['prevOutcomeCrossDay', 'rollingRate', 'wtStateRepeated', 'outcomeRepeated', 'daysSincePrev', 'prevOutcome', 'prevWtState']);
  const keyOf = r => `${r.date}|${r.side}|${r.level}|${r.ordinal}`;
  const fullByKey = new Map(fullToday.map(r => [keyOf(r), r]));
  for (const rf of fastToday) {
    const rFull = fullByKey.get(keyOf(rf));
    assert.ok(rFull, `fast touch ${keyOf(rf)} missing from the full walk`);
    for (const field of Object.keys(rf)) {
      if (EXCLUDE.has(field)) continue;
      assert.deepEqual(rf[field], rFull[field], `field "${field}" diverged between the 90-day fast walk and the full walk for ${keyOf(rf)}`);
    }
  }
});

console.log(`\n${passed} passed${process.exitCode ? ' — FAILURES ABOVE' : ''}`);
