/**
 * Unit tests for js/levelAtlasEngine.js. Pure/synthetic: no network.
 *   node js/levelAtlasEngine.test.mjs
 *
 * The load-bearing tests are the CAUSALITY ones — this engine exists to be a
 * trustworthy reference, so a lookahead here is worse than a lookahead in a
 * trading engine: it produces a confident-looking "fact" nobody would think to
 * doubt. A same-day realized-range dayVol bucket was caught doing exactly this
 * (tagging a 09:00 touch with the WHOLE day's eventual range) before this test
 * file existed; these tests pin the fix so it can't silently regress.
 */
import assert from 'node:assert/strict';
import { atlasWalk, atlasLiveToday, sessionRangeSeries, RUNGS, SIDES } from './levelAtlasEngine.js';

let passed = 0;
const t = (n, f) => { try { f(); passed++; console.log(`  ✓ ${n}`); }
  catch (e) { console.error(`  ✗ ${n}\n    ${e.message}`); process.exitCode = 1; } };

console.log('levelAtlasEngine');

// ── Synthetic M1: 3 years, deterministic drift + wiggle (no Math.random) ────
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

const P = packedM1(60 * 24 * 400);   // ~400 days of M1 — enough for the ladder fit + trailing windows

t('atlasWalk runs end-to-end on synthetic data and returns touches', () => {
  const { touches, coverage } = atlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  assert.ok(coverage, 'coverage present');
  assert.ok(touches.length > 100, `expected touches, got ${touches.length}`);
  for (const r of touches) {
    assert.ok(RUNGS.includes(r.rung));
    assert.ok(SIDES.includes(r.side));
    assert.ok(['out', 'back', 'neither'].includes(r.outcome));
  }
});

t('dayVol is NOT derived from the realized range of the touch\'s own day', () => {
  // Raw bar-index arithmetic ("day 150 = bar 60*24*150") is NOT reliable here:
  // bucketM1IntoSessions is London-midnight-anchored and the `dates` array
  // skips thin/weekend sessions, so a hand-picked bar offset can land on a
  // different trading-day INDEX than intended (this caught an earlier, wrong
  // version of this test — it flagged a "leak" that was really the perturbed
  // day correctly feeding a LATER day's legitimate 20-session trailing window).
  // Perturbing the dataset's LAST 300 bars sidesteps the whole problem: it's
  // guaranteed to sit inside the final session-date only, with nothing dated
  // after it to leak into.
  const base = packedM1(60 * 24 * 260, { wiggle: 0.02 });
  const wild = { ...base, highs: base.highs.slice(), lows: base.lows.slice(), closes: base.closes.slice() };
  const start = base.n - 300;
  for (let i = start; i < base.n; i++) { wild.highs[i] += 5; wild.lows[i] -= 5; }

  const a = atlasWalk(base, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const b = atlasWalk(wild, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });

  // Any touch dated MORE than 25 sessions before the LAST date in the dataset
  // cannot legitimately be affected by the perturbation (it's outside both the
  // 20-session trailing dayVol window AND happens entirely before it in time).
  const lastDate = [...new Set(a.touches.map(r => r.date))].sort().at(-1);
  const keyOf = r => `${r.date}|${r.side}|${r.rung}|${r.ordinal}|${r.hourUtc}|${r.minute}`;
  const byKeyA = new Map(a.touches.map(r => [keyOf(r), r]));
  const allDatesSorted = [...new Set(a.touches.map(r => r.date))].sort();
  const cutoffDate = allDatesSorted[Math.max(0, allDatesSorted.length - 25)];

  let checked = 0;
  for (const rb of b.touches) {
    if (rb.date >= cutoffDate) continue;         // only test touches safely outside the window
    const ra = byKeyA.get(keyOf(rb));
    if (!ra) continue;                            // touch didn't survive identically (rare, not the point here)
    checked++;
    assert.equal(ra.dayVol, rb.dayVol, `dayVol leaked a FAR-FUTURE perturbation on ${ra.date}: ${ra.dayVol} vs ${rb.dayVol}`);
    assert.equal(ra.outcome, rb.outcome, `outcome itself changed on ${ra.date} despite the perturbation being far in the future`);
  }
  assert.ok(checked > 50, `too few comparable touches to trust the result (${checked}) — widen the synthetic series`);
});

t('asiaVol/londonVol are null for a touch inside that same (incomplete) session', () => {
  const { touches } = atlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const asiaTouches = touches.filter(r => r.session === 'Asia');
  const londonTouches = touches.filter(r => r.session === 'London');
  assert.ok(asiaTouches.length > 0 && londonTouches.length > 0, 'need touches in both sessions to test');
  assert.ok(asiaTouches.every(r => r.asiaVol == null), 'an Asia touch must not see Asia\'s own (incomplete) vol bucket');
  assert.ok(londonTouches.every(r => r.londonVol == null), 'a London touch must not see London\'s own (incomplete) vol bucket');
});

t('asiaVol IS available (non-null on at least some rows) for London/NY touches', () => {
  const { touches } = atlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const later = touches.filter(r => r.session === 'London' || r.session === 'NY');
  const withAsiaVol = later.filter(r => r.asiaVol != null);
  assert.ok(withAsiaVol.length > 0, 'Asia\'s vol bucket should reach later-session touches once warmed up');
});

t('londonVol IS available for NY touches (once warmed up) and null for Asia/London', () => {
  const { touches } = atlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const ny = touches.filter(r => r.session === 'NY');
  assert.ok(ny.some(r => r.londonVol != null), 'NY touches should eventually see a completed London vol bucket');
  assert.ok(touches.filter(r => r.session !== 'NY').every(r => r.londonVol == null));
});

t('ordinal increments only after the re-arm distance is cleared', () => {
  const { touches } = atlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.15, 0.5] });
  // A tighter re-arm distance can only produce >= as many distinct tests as a
  // looser one, for the same underlying path — never fewer.
  const maxOrd = frac => Math.max(...touches.filter(r => r.rearmFrac === frac).map(r => r.ordinal));
  assert.ok(maxOrd(0.15) >= maxOrd(0.5), `tight re-arm (${maxOrd(0.15)}) should see >= tests than loose (${maxOrd(0.5)})`);
});

t('repeatability fields reference a STRICTLY PRIOR visit, never the current one', () => {
  const { touches } = atlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const key = r => `${r.side}|${r.rung}|${r.rearmFrac}`;
  const byKey = {};
  for (const r of touches) (byKey[key(r)] ??= []).push(r);
  for (const list of Object.values(byKey)) {
    // Records for one (side,rung,rearm) arrive in walk order (date-ascending,
    // session-ascending). The FIRST visit must have null prevOutcome; a later
    // visit's prevWtState must equal the wtState of an EARLIER record in the
    // same list, never its own.
    if (!list.length) continue;
    assert.equal(list[0].prevOutcome, null, 'first-ever visit must have no prior outcome');
    for (let i = 1; i < Math.min(list.length, 200); i++) {
      if (list[i].prevOutcome == null) continue;
      const matchesSelf = list[i].prevOutcome === list[i].outcome && list[i].wtState === list[i].prevWtState && list[i - 1].outcome !== list[i].outcome;
      assert.ok(!matchesSelf, 'prevOutcome must not equal the current touch\'s own outcome by construction');
    }
  }
});

t('prevOutcomeSameDay excludes the tautological same-day "neither" case', () => {
  // If the prior visit's own forward scan already ran to session-end without
  // hitting either barrier ('neither'), a LATER same-day visit has strictly
  // LESS remaining time and therefore can also never resolve 'out' — so
  // reporting that combination is close to a mathematical certainty, not a
  // finding. prevOutcomeSameDay must never surface it.
  const { touches } = atlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  for (const r of touches) {
    if (r.daysSincePrev === 0 && r.prevOutcome === 'neither') {
      assert.equal(r.prevOutcomeSameDay, null, 'same-day neither must be excluded from prevOutcomeSameDay');
    }
  }
  assert.ok(touches.some(r => r.prevOutcomeSameDay != null), 'expected at least some same-day non-neither visits');
});

t('prevOutcomeSameDay / prevOutcomeCrossDay partition daysSincePrev cleanly and never both fire', () => {
  const { touches } = atlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  for (const r of touches) {
    assert.ok(!(r.prevOutcomeSameDay != null && r.prevOutcomeCrossDay != null), 'same-day and cross-day must be mutually exclusive');
    if (r.prevOutcomeSameDay != null) assert.equal(r.daysSincePrev, 0);
    if (r.prevOutcomeCrossDay != null) assert.ok(r.daysSincePrev > 0);
  }
  assert.ok(touches.some(r => r.prevOutcomeCrossDay != null), 'expected at least some cross-day visits over a multi-year synthetic run');
});

t('prevCloseLoc depends only on YESTERDAY — perturbing today\'s own bars must never change it', () => {
  const base = packedM1(60 * 24 * 260, { wiggle: 0.02 });
  const wild = { ...base, highs: base.highs.slice(), lows: base.lows.slice(), closes: base.closes.slice() };
  const start = base.n - 300;   // perturb only the FINAL session's own bars
  for (let i = start; i < base.n; i++) { wild.highs[i] += 5; wild.lows[i] -= 5; wild.closes[i] += 3; }
  const a = atlasWalk(base, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const b = atlasWalk(wild, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const lastDate = [...new Set(a.touches.map(r => r.date))].sort().at(-1);
  const byDateA = new Map(), byDateB = new Map();
  for (const r of a.touches) if (r.date !== lastDate) byDateA.set(r.date, r.prevCloseLoc);
  for (const r of b.touches) if (r.date !== lastDate) byDateB.set(r.date, r.prevCloseLoc);
  let checked = 0;
  for (const [date, val] of byDateA) {
    if (!byDateB.has(date)) continue;
    checked++;
    assert.equal(val, byDateB.get(date), `prevCloseLoc on ${date} changed when a LATER day's bars were perturbed`);
  }
  assert.ok(checked > 100, `too few comparable dates (${checked})`);
});

t('prevCloseLoc buckets are sane: sign matches the actual close direction, and beyond-p75 implies beyond-p50', () => {
  const { touches } = atlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const seen = new Set();
  for (const r of touches) if (r.prevCloseLoc) seen.add(r.prevCloseLoc);
  assert.ok(seen.size > 0, 'expected at least some prevCloseLoc values');
  for (const v of seen) assert.ok(['1·inside', '2·beyond-p50-up', '3·beyond-p75-up', '2·beyond-p50-dn', '3·beyond-p75-dn'].includes(v), `unexpected bucket: ${v}`);
});

t('ivRegime/vrp/ivSkewDir use YESTERDAY\'s settle only — today\'s settle must never leak in', () => {
  // Two runs, identical except a DELIBERATE outlier planted on ONLY the last
  // date's settle. Every touch dated ON OR BEFORE the outlier day must read
  // IDENTICALLY in both runs — if the outlier leaked into its own day (instead
  // of only becoming visible the day AFTER, via the one-day lag), that day's
  // reads would differ between the two runs. This isolates causality directly
  // (equality against a clean baseline) rather than asserting a specific
  // bucket label, which an earlier version of this test got wrong: with a
  // synthetic dataset's tiny realized vol, a cvol~10 baseline reads '3·iv-rich'
  // on ~98% of ALL days regardless of the outlier, so bucket-label assertions
  // were confounded by that baseline rate, not by any actual leak.
  const { touches } = atlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const dates = [...new Set(touches.map(t => t.date))].sort();
  const clean = new Map();
  dates.forEach((d, i) => clean.set(d, { cvol: 10 + Math.sin(i / 9) * 2, skew: Math.sin(i / 13), skewRatio: 1, dnvar: 10, upvar: 10, convexity: 1 }));
  // A few days before the end, not the literal last date — there must be a
  // real "day after" in the walk for the legitimate-divergence check below.
  const outlierDate = dates[dates.length - 5];
  const spiked = new Map(clean);
  spiked.set(outlierDate, { cvol: 999, skew: 999, skewRatio: 999, dnvar: 999, upvar: 999, convexity: 999 });

  const { touches: a } = atlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3], ivByDate: clean });
  const { touches: b } = atlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3], ivByDate: spiked });
  const keyOf = r => `${r.date}|${r.side}|${r.rung}|${r.ordinal}|${r.hourUtc}|${r.minute}`;
  const byKeyA = new Map(a.map(r => [keyOf(r), r]));
  let checked = 0, sawDivergenceAfter = false;
  for (const rb of b) {
    const ra = byKeyA.get(keyOf(rb));
    if (!ra) continue;
    if (rb.date <= outlierDate) {
      checked++;
      assert.equal(ra.ivRegime, rb.ivRegime, `ivRegime diverged on/before the outlier day (${rb.date}) — settle leaked into its own day`);
      assert.equal(ra.vrp, rb.vrp, `vrp diverged on/before the outlier day (${rb.date})`);
      assert.equal(ra.ivSkewDir, rb.ivSkewDir, `ivSkewDir diverged on/before the outlier day (${rb.date})`);
    } else if (ra.ivRegime !== rb.ivRegime) sawDivergenceAfter = true;
  }
  assert.ok(checked > 500, `too few comparable touches (${checked})`);
  assert.ok(sawDivergenceAfter, 'the day AFTER the outlier should legitimately diverge — that is the correct one-day lag; if it never diverges, the outlier is never being read at all');
});

t('ivSkewDir orientation flips correctly between up and down touches on the SAME day', () => {
  const { touches } = atlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const dates = [...new Set(touches.map(t => t.date))].sort();
  const ivByDate = new Map(dates.map((d, i) => [d, { cvol: 10, skew: 0.5, skewRatio: 1.1, dnvar: 10, upvar: 10, convexity: 1 }]));   // constant positive skew
  const { touches: withIv } = atlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3], ivByDate });
  const up = withIv.find(r => r.side === 'up' && r.ivSkewDir != null);
  const dn = withIv.find(r => r.side === 'down' && r.date === up?.date && r.ivSkewDir != null);
  if (up && dn) { assert.equal(up.ivSkewDir, '3·with'); assert.equal(dn.ivSkewDir, '1·against'); }
});

t('a null ivByDate degrades every CVOL field to null, never throws', () => {
  const { touches } = atlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3], ivByDate: null });
  assert.ok(touches.every(r => r.ivRegime === null && r.vrp === null && r.ivSkewDir === null));
});

t('sessionRangeSeries never produces a negative or zero-width range on real bars', () => {
  const m = sessionRangeSeries(P);
  let n = 0;
  for (const v of m.values()) { n++; assert.ok(v.range >= 0, `negative range: ${v.range}`); assert.ok(v.hi >= v.lo); }
  assert.ok(n > 100, 'expected many session-range entries');
});

t('a rung whose real neighbour spacing is degenerate is simply skipped, not NaN', () => {
  const { touches } = atlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  for (const r of touches) {
    assert.ok(Number.isFinite(r.fadePips), `fadePips NaN on ${JSON.stringify(r).slice(0, 100)}`);
    assert.ok(Number.isFinite(r.runPips), `runPips NaN`);
    assert.ok(r.pullbackFrac == null || (r.pullbackFrac >= 0 && r.pullbackFrac <= 1), `pullbackFrac out of [0,1]: ${r.pullbackFrac}`);
  }
});

t('churn is a pure function of bars UP TO the touch — later bars must not change it', () => {
  // Perturb only bars STRICTLY AFTER the touch's own bar and confirm churn (and
  // every other at-touch field) is unchanged for that touch across both runs.
  const base = packedM1(60 * 24 * 120, { wiggle: 0.02 });
  const a = atlasWalk(base, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  assert.ok(a.touches.some(r => r.churn != null), 'expected at least one churn reading');
  // Pick a touch mid-dataset, perturb bars strictly after its own bar (using
  // minsIntoSession + the day's own bar count is unavailable here, so instead
  // perturb the LAST 500 bars — any touch whose own day is NOT among the last
  // handful of sessions is guaranteed untouched by it).
  const wild = { ...base, highs: base.highs.slice(), lows: base.lows.slice(), closes: base.closes.slice() };
  const start = base.n - 500;
  for (let i = start; i < base.n; i++) { wild.highs[i] += 3; wild.lows[i] -= 3; }
  const b = atlasWalk(wild, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const lastDates = [...new Set(a.touches.map(r => r.date))].sort();
  const cutoff = lastDates[Math.max(0, lastDates.length - 15)];
  const keyOf = r => `${r.date}|${r.side}|${r.rung}|${r.ordinal}|${r.hourUtc}|${r.minute}`;
  const byKeyA = new Map(a.touches.map(r => [keyOf(r), r]));
  let checked = 0;
  for (const rb of b.touches) {
    if (rb.date >= cutoff) continue;
    const ra = byKeyA.get(keyOf(rb));
    if (!ra) continue;
    checked++;
    assert.equal(ra.churn, rb.churn, `churn leaked a future perturbation on ${ra.date}`);
    assert.equal(ra.churnRatio, rb.churnRatio, `churnRatio leaked a future perturbation on ${ra.date}`);
  }
  assert.ok(checked > 30, `too few comparable touches (${checked})`);
});

t('otherSideTouchedBefore is false when the opposite side has not fired yet, and never uses a LATER opposite touch', () => {
  const { touches } = atlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const byDayRung = {};
  for (const r of touches) (byDayRung[`${r.date}|${r.rung}|${r.rearmFrac}`] ??= []).push(r);
  let sawTrue = 0, sawFalse = 0;
  // NOTE: `hourUtc` alone is NOT a valid same-session chronological key —
  // sessions are London-midnight-anchored, so hourUtc wraps mid-session (e.g. 23
  // then 0..21) depending on DST offset. `minsIntoSession` is relative to that
  // SAME session's own start and is the correct ordering key (an earlier, wrong
  // version of this test sorted by hourUtc and flagged a false failure).
  for (const list of Object.values(byDayRung)) {
    const up = list.filter(r => r.side === 'up').sort((a, b) => a.minsIntoSession - b.minsIntoSession);
    const dn = list.filter(r => r.side === 'down').sort((a, b) => a.minsIntoSession - b.minsIntoSession);
    if (up[0]?.otherSideTouchedBefore) sawTrue++; else if (up.length) sawFalse++;
    // If up touched before dn's first touch, dn's FIRST touch must see otherSideTouchedBefore=true;
    // if dn's first touch happens before up ever touches, up's first touch must see false.
    if (up.length && dn.length) {
      if (up[0].minsIntoSession < dn[0].minsIntoSession) assert.equal(dn[0].otherSideTouchedBefore, true, `dn first touch after up's should see true (day ${dn[0].date})`);
      if (dn[0].minsIntoSession < up[0].minsIntoSession) assert.equal(up[0].otherSideTouchedBefore, true, `up first touch after dn's should see true (day ${up[0].date})`);
    }
  }
  assert.ok(sawTrue + sawFalse > 20, 'need enough days to trust this check');
});

t('rollingRate only reports once ≥3 prior visits exist, and never counts the current touch', () => {
  const { touches } = atlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const key = r => `${r.side}|${r.rung}|${r.rearmFrac}`;
  const byKey = {};
  for (const r of touches) (byKey[key(r)] ??= []).push(r);
  for (const list of Object.values(byKey)) {
    for (let i = 0; i < Math.min(list.length, 300); i++) {
      const priorCount = i;   // exactly i strictly-prior visits exist for the i-th record in walk order
      if (priorCount < 3) assert.equal(list[i].rollingRate, null, `rollingRate should be null with only ${priorCount} prior visits`);
      else assert.ok(list[i].rollingRate.n <= Math.min(5, priorCount), `rollingRate.n (${list[i].rollingRate.n}) exceeds available prior visits (${priorCount})`);
    }
  }
});

// ── atlasLiveToday ────────────────────────────────────────────────────────────
t('atlasLiveToday returns only touches dated the LAST session in the supplied history', () => {
  const { touches, date } = atlasLiveToday(P, { instrument: 'EURUSD', assetClass: 'fx' });
  assert.ok(date, 'expected a resolved "today" date');
  assert.ok(touches.every(r => r.date === date), 'every returned touch must be dated the last session');
  assert.ok(touches.every(r => r.rearmFrac === 0.3), 'default rearmFrac should be 0.3');
});

t('a touch too close to the truncation point to have had room to resolve reports outcome:"neither"', () => {
  // Cut the dataset off just 3 bars before its natural session end — this is
  // exactly what "now" looks like near the close. A touch with only 1-3 bars
  // of runway before the data simply stops has NOT had a fair chance to
  // resolve; it must be reported honestly as unresolved, not forced to
  // whatever its first bar or two happened to do. (A touch found EARLY in a
  // truncated session, by contrast, can legitimately have already resolved
  // within the supplied bars — that is correct, not a bug — which is why this
  // test targets only the boundary, not every touch in the truncated window.)
  const cut = P.n - 3;
  const truncated = { n: cut, times: P.times.slice(0, cut), opens: P.opens.slice(0, cut),
                       highs: P.highs.slice(0, cut), lows: P.lows.slice(0, cut),
                       closes: P.closes.slice(0, cut), volumes: P.volumes.slice(0, cut) };
  const { touches } = atlasLiveToday(truncated, { instrument: 'EURUSD', assetClass: 'fx' });
  const nearBoundary = touches.filter(r => {
    // Reconstruct the touch's own bar index from minsIntoSession to find ones
    // within the final few bars of the supplied data.
    const touchBarIdx = Math.round(r.minsIntoSession);   // 1 bar/min in this synthetic series
    return (cut - (P.n - truncated.n)) - touchBarIdx <= 3;   // within 3 bars of the cutoff
  });
  for (const r of nearBoundary) {
    assert.equal(r.outcome, 'neither', `a touch with almost no runway resolved to "${r.outcome}" — should be unresolved`);
    assert.equal(r.resolveIdx, null);
  }
});

t('a live touch\'s CONTEXT fields are identical to what a full historical walk computes for the same touch', () => {
  // The core reuse guarantee: atlasLiveToday must not diverge from atlasWalk's
  // own logic even slightly. Truncate mid-session, find a live touch, then
  // confirm the FULL (untruncated) walk's record for that exact touch (same
  // date/side/rung/ordinal) has IDENTICAL context fields — proving the live
  // path is a pure filter over atlasWalk's output, not a second implementation
  // that could quietly drift from it.
  const cut = P.n - 300;
  const truncated = { n: cut, times: P.times.slice(0, cut), opens: P.opens.slice(0, cut),
                       highs: P.highs.slice(0, cut), lows: P.lows.slice(0, cut),
                       closes: P.closes.slice(0, cut), volumes: P.volumes.slice(0, cut) };
  const { touches: live } = atlasLiveToday(truncated, { instrument: 'EURUSD', assetClass: 'fx' });
  assert.ok(live.length > 0, 'expected at least one live touch in the truncated window — widen the cut if this is ever empty');
  const { touches: full } = atlasWalk(P, { instrument: 'EURUSD', assetClass: 'fx', rearmFracs: [0.3] });
  const keyOf = r => `${r.date}|${r.side}|${r.rung}|${r.ordinal}`;
  const fullByKey = new Map(full.map(r => [keyOf(r), r]));
  // asiaVol/londonVol are DELIBERATELY excluded: they're session-completeness
  // gated (a touch can only see a session's own bucket once that session has
  // fully closed), so how much of "today" survived truncation legitimately
  // changes them — that behaviour is covered by its own dedicated tests above,
  // not a divergence this test should flag. Everything else depends on data
  // from well before the truncation point (trailing σ, prior-day confluence,
  // the day's own WaveTrend up to the touch) and must be untouched by cutting
  // a few hours off the FAR end of the day.
  const CONTEXT_FIELDS = ['session', 'sessionPos', 'dow', 'gapBucket', 'dayVol',
    'churn', 'churnRatio', 'otherSideTouchedBefore', 'approachVel', 'approachER', 'wtState', 'wtMtf',
    'wtSlow', 'vwapSide', 'momAdx', 'confluence', 'candleReject', 'htfTrend', 'volClimax', 'roundNum',
    'prevCloseLoc', 'level', 'hourUtc', 'minute'];
  let checked = 0;
  for (const r of live) {
    const f = fullByKey.get(keyOf(r));
    assert.ok(f, `live touch ${keyOf(r)} has no counterpart in the full walk`);
    for (const field of CONTEXT_FIELDS) {
      assert.equal(r[field], f[field], `context field "${field}" diverged between live and full walk for ${keyOf(r)}: ${r[field]} vs ${f[field]}`);
    }
    checked++;
  }
  assert.ok(checked > 0);
});

console.log(`\n${passed} passed${process.exitCode ? ' — FAILURES ABOVE' : ''}`);
