/**
 * Unit tests for js/sessionPathEngine.js. Pure/synthetic: no network.
 *   node js/sessionPathEngine.test.mjs
 *
 * The load-bearing tests here are about the "reversal trap" the module
 * header describes (a naive version would silently misreport a faded
 * extension as if it were still in progress) and the no-lookahead contract
 * (progress/peak reads only bars up to the checkpoint; outcome only scans
 * bars strictly after it; an already-reached band is excluded, not counted).
 */
import assert from 'node:assert/strict';
import { sessionPathWalk, RUNGS, SIDES, CHECKPOINT_HOURS } from './sessionPathEngine.js';
import { bucketM1IntoSessions } from './forecastAnalyser.js';

let passed = 0;
const t = (n, f) => { try { f(); passed++; console.log(`  ✓ ${n}`); }
  catch (e) { console.error(`  ✗ ${n}\n    ${e.message}`); process.exitCode = 1; } };

console.log('sessionPathEngine');

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
const P = packedM1(60 * 24 * 400);

t('sessionPathWalk runs end-to-end on synthetic data and returns rows', () => {
  const { rows, coverage } = sessionPathWalk(P, { instrument: 'EURUSD', assetClass: 'fx' });
  assert.ok(coverage, 'coverage present');
  assert.ok(rows.length > 100, `expected rows, got ${rows.length}`);
  for (const r of rows) {
    assert.ok(RUNGS.includes(r.rung));
    assert.ok(SIDES.includes(r.side));
    assert.ok(CHECKPOINT_HOURS.includes(r.checkpointHour));
    assert.equal(typeof r.reachedLater, 'boolean');
    assert.ok(r.peakFrac < 1, 'a row with peakFrac >= 1 (already reached) must have been excluded');
    assert.ok(r.peakElapsedHrs >= 0 && r.peakElapsedHrs <= r.checkpointHour,
      `peakElapsedHrs (${r.peakElapsedHrs}) must sit between session start and this row's own checkpoint (${r.checkpointHour}) — it can't be in the future relative to the checkpoint that reports it`);
    // Real price fields (added so the UI can show actual levels, not just
    // percentages) — sanity-check internal consistency, not exact values.
    assert.ok(r.open > 0 && r.level > 0 && r.currentPrice > 0, 'open/level/currentPrice must all be real positive prices');
    const dist = r.side === 'up' ? (r.level - r.open) : (r.open - r.level);
    assert.ok(dist > 0, 'level must sit on the correct side of open for its own side');
  }
});

t('progress/peak reads are causal — perturbing bars AFTER a checkpoint must not change that checkpoint\'s row', () => {
  const base = packedM1(60 * 24 * 260, { wiggle: 0.02 });
  const wild = { ...base, highs: base.highs.slice(), lows: base.lows.slice(), closes: base.closes.slice() };
  // Perturb only the LAST 300 bars (guaranteed to sit inside the final
  // session, after every checkpoint on any earlier day) — see the identical
  // technique + rationale in levelAtlasEngine.test.mjs.
  const start = base.n - 300;
  for (let i = start; i < base.n; i++) { wild.highs[i] += 5; wild.lows[i] -= 5; }

  const a = sessionPathWalk(base, { instrument: 'EURUSD', assetClass: 'fx' });
  const b = sessionPathWalk(wild, { instrument: 'EURUSD', assetClass: 'fx' });
  const lastDate = a.coverage.to;
  const keyOf = r => `${r.date}|${r.side}|${r.rung}|${r.checkpointHour}`;
  const byKeyA = new Map(a.rows.map(r => [keyOf(r), r]));
  let checked = 0;
  for (const rb of b.rows) {
    if (rb.date >= lastDate) continue;   // only rows safely before the perturbed day
    const ra = byKeyA.get(keyOf(rb));
    if (!ra) continue;
    checked++;
    assert.equal(ra.progressFrac, rb.progressFrac, `progressFrac leaked a future perturbation on ${ra.date}`);
    assert.equal(ra.peakFrac, rb.peakFrac, `peakFrac leaked a future perturbation on ${ra.date}`);
    assert.equal(ra.peakElapsedHrs, rb.peakElapsedHrs, `peakElapsedHrs leaked a future perturbation on ${ra.date}`);
    assert.equal(ra.reachedLater, rb.reachedLater, `reachedLater outcome changed on ${ra.date} from a perturbation strictly in the future relative to THAT day`);
  }
  assert.ok(checked > 50, `too few comparable rows to trust the result (${checked})`);
});

t('every emitted row has peakFrac strictly under 1 (rounding happens BEFORE the exclusion gate, not after)', () => {
  const { rows } = sessionPathWalk(P, { instrument: 'EURUSD', assetClass: 'fx' });
  for (const r of rows) assert.ok(r.peakFrac < 1, `row ${r.date}|${r.side}|${r.rung}|${r.checkpointHour} has peakFrac=${r.peakFrac}, should have been excluded`);
});

t('shape bucket correctly distinguishes a still-extending day from a faded-from-peak day', () => {
  // Two synthetic days, same instrument: one drifts steadily toward a band
  // (shape should read "extending"), the other spikes toward the band early
  // then reverses hard (shape should read "faded-from-peak").
  //
  // Overlay bars using the session's OWN time range (via bucketM1IntoSessions
  // + the same >=200-bar validity filter sessionPathWalk applies internally)
  // rather than a hand-picked bar offset — raw index arithmetic doesn't
  // reliably land on a specific session date/length (this caught a real bug
  // in an earlier draft of this test: an offset that landed on a filtered-
  // out, too-short trailing session, silently measuring the wrong day).
  const base = packedM1(60 * 24 * 260, { wiggle: 0.01, drift: 0 });
  const sessions = bucketM1IntoSessions(base, 'Europe/London');
  const validDates = [...sessions.keys()].sort().filter(d => (sessions.get(d)?.length ?? 0) >= 200);
  const lastDate = validDates.at(-1);
  const lastBars = sessions.get(lastDate);
  const startTime = lastBars[0].time, endTime = lastBars.at(-1).time;
  let startIdx = -1, endIdx = -1;
  for (let i = 0; i < base.n; i++) {
    if (base.times[i] === startTime) startIdx = i;
    if (base.times[i] === endTime) { endIdx = i; break; }
  }
  assert.ok(startIdx >= 0 && endIdx > startIdx, 'fixture setup: failed to locate the target session in the global arrays');
  const openPx = base.opens[startIdx];
  const nDay = endIdx - startIdx + 1;

  function overlay(fn) {
    const f = { ...base, opens: base.opens.slice(), highs: base.highs.slice(), lows: base.lows.slice(), closes: base.closes.slice() };
    for (let i = startIdx; i <= endIdx; i++) {
      const px = fn((i - startIdx) / nDay);
      f.opens[i] = px; f.closes[i] = px; f.highs[i] = px + 0.01; f.lows[i] = px - 0.01;
    }
    return f;
  }
  // Three fixtures, calibrated against this fixture's own fitted bands
  // (checked empirically, not guessed — see calibrate_shape_test2.mjs in
  // this session's scratchpad for the derivation): a steady ramp that never
  // gives anything back ("extending"), a spike that gives back roughly a
  // third of its own peak progress by the checkpoint ("pulled-back" — a
  // normal retracement within an ongoing move), and a spike that fully
  // reverses back to the open WELL BEFORE the checkpoint ("deep-reversal" —
  // the failed-extension pattern the shape bucket exists to isolate).
  //
  // The three-tier split itself is the fix for a real bug an earlier draft
  // shipped: a single "faded" bucket keyed on ABSOLUTE giveback conflated
  // "gave back a little of a big move" with "gave back nearly all of it",
  // and checked against real EURUSD history the absolute version showed
  // ABOVE-baseline odds for "faded" — the opposite of the failed-extension
  // pattern it was meant to isolate. Relative giveback (reversalFrac /
  // peakFrac) is what actually separates the two.
  const extending = overlay(frac => openPx + 0.09 * frac);
  const pulledBack = overlay(frac => frac < 0.15 ? openPx + 0.12 * (frac / 0.15) : openPx + 0.12 - 0.11 * ((frac - 0.15) / 0.85));
  const deepReversal = overlay(frac => {
    if (frac < 0.08) return openPx + 0.15 * (frac / 0.08);
    if (frac < 0.30) return openPx + 0.15 - 0.15 * ((frac - 0.08) / 0.22);
    return openPx;
  });

  const rExt = sessionPathWalk(extending, { instrument: 'EURUSD', assetClass: 'fx' });
  const rPb = sessionPathWalk(pulledBack, { instrument: 'EURUSD', assetClass: 'fx' });
  const rDr = sessionPathWalk(deepReversal, { instrument: 'EURUSD', assetClass: 'fx' });
  for (const r of [rExt, rPb, rDr]) assert.equal(r.coverage.to, lastDate);
  const pick = (res) => res.rows.find(r => r.date === lastDate && r.side === 'up' && r.rung === 'p50' && r.checkpointHour === 10);
  const extRow = pick(rExt), pbRow = pick(rPb), drRow = pick(rDr);
  assert.ok(extRow && pbRow && drRow, 'expected a row at checkpoint 10 for all three fixtures');
  assert.equal(extRow.shape, '2·extending', `got ${extRow.shape} (progress=${extRow.progressFrac}, peak=${extRow.peakFrac})`);
  assert.equal(pbRow.shape, '3·pulled-back', `got ${pbRow.shape} (progress=${pbRow.progressFrac}, peak=${pbRow.peakFrac})`);
  assert.equal(drRow.shape, '4·deep-reversal', `got ${drRow.shape} (progress=${drRow.progressFrac}, peak=${drRow.peakFrac})`);
  // The peak in this fixture is placed at frac=0.08 of the session — real
  // elapsed hours is (0.08 * nDay minutes) / 60, NOT the checkpoint hour (10)
  // that happens to be reporting it. This is the exact bug a real user
  // caught on live data: the checkpoint is a sampling grid, not the event
  // time, and reporting the checkpoint's own hour as "when it peaked" is
  // wrong whenever the peak sits well before the checkpoint that observes it
  // (as it does here, and as it did in the real GOLD example that surfaced this).
  const expectedPeakHrs = (0.08 * nDay) / 60;
  assert.ok(Math.abs(drRow.peakElapsedHrs - expectedPeakHrs) < 0.5,
    `peakElapsedHrs should reflect the ACTUAL peak time (~${expectedPeakHrs.toFixed(2)}h), not the checkpoint hour (10) — got ${drRow.peakElapsedHrs}`);
  assert.ok(drRow.peakElapsedHrs < drRow.checkpointHour - 2, 'sanity: this fixture\'s peak is deliberately well before the checkpoint that reports it');
  assert.equal(drRow.progressFrac, 0, 'the deep-reversal fixture returns fully to the open before the checkpoint — current progress should read as zero');
  // None of the three fixtures' ramps actually cross the band by day's end
  // (peak tops out well under 1 for all three) — reachedLater must
  // therefore be false at this checkpoint for all of them, not a fluke of
  // the shape-bucket labelling.
  assert.equal(extRow.reachedLater, false);
  assert.equal(pbRow.reachedLater, false);
  assert.equal(drRow.reachedLater, false);
});

t('reachedLater correctly detects a touch AFTER the checkpoint, and does not look before it', () => {
  // Same session located the same way as the shape-bucket test (never guess
  // a bar offset — always locate the actual session via bucketM1IntoSessions
  // + its own >=200-bar validity filter). Flat until 60% of the way through
  // the day, then a clean ramp across the p50 band. An EARLY checkpoint (4)
  // sits before the ramp starts — reachedLater must be TRUE (the touch is
  // still ahead of it). A LATE checkpoint (20) sits AFTER the band was
  // already crossed — that row must not exist at all (peakFrac >= 1 by then).
  const base = packedM1(60 * 24 * 260, { wiggle: 0.01, drift: 0 });
  const sessions = bucketM1IntoSessions(base, 'Europe/London');
  const validDates = [...sessions.keys()].sort().filter(d => (sessions.get(d)?.length ?? 0) >= 200);
  const lastDate = validDates.at(-1);
  const lastBars = sessions.get(lastDate);
  const startTime = lastBars[0].time, endTime = lastBars.at(-1).time;
  let startIdx = -1, endIdx = -1;
  for (let i = 0; i < base.n; i++) {
    if (base.times[i] === startTime) startIdx = i;
    if (base.times[i] === endTime) { endIdx = i; break; }
  }
  const openPx = base.opens[startIdx];
  const nDay = endIdx - startIdx + 1;
  const touched = { ...base, opens: base.opens.slice(), highs: base.highs.slice(), lows: base.lows.slice(), closes: base.closes.slice() };
  for (let i = startIdx; i <= endIdx; i++) {
    const frac = (i - startIdx) / nDay;
    const px = frac < 0.6 ? openPx : openPx + 0.5 * ((frac - 0.6) / 0.4);   // well beyond p50 (~0.10-0.11 dist) by day's end
    touched.opens[i] = px; touched.closes[i] = px; touched.highs[i] = px + 0.01; touched.lows[i] = px - 0.01;
  }
  const { rows, coverage } = sessionPathWalk(touched, { instrument: 'EURUSD', assetClass: 'fx' });
  assert.equal(coverage.to, lastDate);
  const early = rows.find(r => r.date === lastDate && r.side === 'up' && r.rung === 'p50' && r.checkpointHour === 4);
  const late = rows.find(r => r.date === lastDate && r.side === 'up' && r.rung === 'p50' && r.checkpointHour === 20);
  assert.ok(early, 'expected a row at the early checkpoint (band not yet touched)');
  assert.equal(early.reachedLater, true, 'the early checkpoint sits before the ramp — it must see the LATER touch');
  assert.equal(late, undefined, 'the late checkpoint sits after the band was already crossed — that row must be excluded (peakFrac >= 1), not report reachedLater on a touch that already happened');
});

t('liveWindowDays reproduces IDENTICAL rows for the live day as the full walk (same rolling-window guarantee as levelAtlasEngine)', () => {
  const full = sessionPathWalk(P, { instrument: 'EURUSD', assetClass: 'fx' });
  const fast = sessionPathWalk(P, { instrument: 'EURUSD', assetClass: 'fx', liveWindowDays: 90 });
  assert.equal(fast.coverage.to, full.coverage.to);
  const fullToday = full.rows.filter(r => r.date === full.coverage.to);
  const fastToday = fast.rows.filter(r => r.date === fast.coverage.to);
  assert.equal(fastToday.length, fullToday.length);
  const keyOf = r => `${r.side}|${r.rung}|${r.checkpointHour}`;
  const fullByKey = new Map(fullToday.map(r => [keyOf(r), r]));
  for (const r of fastToday) {
    const f = fullByKey.get(keyOf(r));
    assert.ok(f);
    assert.deepEqual(r, f, `row diverged between the 90-day walk and the full walk for ${keyOf(r)}`);
  }
});

// ── New context dimensions (day-level + two-way-day) ─────────────────────────
t('asiaVol/londonVol are only exposed to checkpoints AFTER that session has actually closed', () => {
  const { rows } = sessionPathWalk(P, { instrument: 'EURUSD', assetClass: 'fx' });
  for (const r of rows) {
    if (r.checkpointHour < 7) assert.equal(r.asiaVol, null, `asiaVol leaked to checkpoint ${r.checkpointHour} (Asia hasn't closed yet)`);
    if (r.checkpointHour < 13) assert.equal(r.londonVol, null, `londonVol leaked to checkpoint ${r.checkpointHour} (London hasn't closed yet)`);
  }
  assert.ok(rows.some(r => r.checkpointHour >= 7 && r.asiaVol != null), 'expected SOME asiaVol readings once warmed up — otherwise this test is vacuous');
  assert.ok(rows.some(r => r.checkpointHour >= 13 && r.londonVol != null), 'expected SOME londonVol readings once warmed up — otherwise this test is vacuous');
});

t('dow/gapBucket/dayVol/prevCloseLoc are identical for every row on the same day (day-level, not checkpoint-level, facts)', () => {
  const { rows } = sessionPathWalk(P, { instrument: 'EURUSD', assetClass: 'fx' });
  const byDate = new Map();
  for (const r of rows) { if (!byDate.has(r.date)) byDate.set(r.date, []); byDate.get(r.date).push(r); }
  let checked = 0;
  for (const [date, group] of byDate) {
    const ref = group[0];
    for (const r of group) {
      assert.equal(r.dow, ref.dow, `dow varied within ${date}`);
      assert.equal(r.gapBucket, ref.gapBucket, `gapBucket varied within ${date}`);
      assert.equal(r.dayVol, ref.dayVol, `dayVol varied within ${date}`);
      assert.equal(r.prevCloseLoc, ref.prevCloseLoc, `prevCloseLoc varied within ${date}`);
    }
    checked++;
  }
  assert.ok(checked > 100);
});

t('otherSideProgress is causal — perturbing bars AFTER a checkpoint must not change an EARLIER checkpoint\'s cross-side read', () => {
  const base = packedM1(60 * 24 * 260, { wiggle: 0.02 });
  const wild = { ...base, highs: base.highs.slice(), lows: base.lows.slice(), closes: base.closes.slice() };
  const start = base.n - 300;
  for (let i = start; i < base.n; i++) { wild.highs[i] += 5; wild.lows[i] -= 5; }
  const a = sessionPathWalk(base, { instrument: 'EURUSD', assetClass: 'fx' });
  const b = sessionPathWalk(wild, { instrument: 'EURUSD', assetClass: 'fx' });
  const lastDate = a.coverage.to;
  const keyOf = r => `${r.date}|${r.side}|${r.rung}|${r.checkpointHour}`;
  const byKeyA = new Map(a.rows.map(r => [keyOf(r), r]));
  let checked = 0;
  for (const rb of b.rows) {
    if (rb.date >= lastDate) continue;
    const ra = byKeyA.get(keyOf(rb));
    if (!ra) continue;
    checked++;
    assert.equal(ra.otherSideProgress, rb.otherSideProgress, `otherSideProgress leaked a future perturbation on ${ra.date}`);
  }
  assert.ok(checked > 50, `too few comparable rows (${checked})`);
});

t('otherSideProgress reads "one-way-so-far" when the opposite side has barely moved, and escalates once it does', () => {
  // Reuse the same session-boundary-located overlay technique as the shape-
  // bucket test. Flat all day except a late spike on the DOWN side (checked
  // via the UP side's otherSideProgress reading, which looks at DOWN's peak).
  const base = packedM1(60 * 24 * 260, { wiggle: 0.01, drift: 0 });
  const sessions = bucketM1IntoSessions(base, 'Europe/London');
  const validDates = [...sessions.keys()].sort().filter(d => (sessions.get(d)?.length ?? 0) >= 200);
  const lastDate = validDates.at(-1);
  const lastBars = sessions.get(lastDate);
  const startTime = lastBars[0].time, endTime = lastBars.at(-1).time;
  let startIdx = -1, endIdx = -1;
  for (let i = 0; i < base.n; i++) {
    if (base.times[i] === startTime) startIdx = i;
    if (base.times[i] === endTime) { endIdx = i; break; }
  }
  const openPx = base.opens[startIdx];
  const nDay = endIdx - startIdx + 1;
  // Flat until 50% through the day, then a hard DROP (the down side moves,
  // up side never does) — checked at checkpoint 4 (before the drop, up side
  // should read one-way) vs checkpoint 20 (well after, checked empirically:
  // the drop is 0% done at the 50%-of-day mark itself and only fully
  // escalates the bucket by checkpoint 20 in this fixture).
  const f = { ...base, opens: base.opens.slice(), highs: base.highs.slice(), lows: base.lows.slice(), closes: base.closes.slice() };
  for (let i = startIdx; i <= endIdx; i++) {
    const frac = (i - startIdx) / nDay;
    const px = frac < 0.5 ? openPx : openPx - 0.15 * ((frac - 0.5) / 0.5);
    f.opens[i] = px; f.closes[i] = px; f.highs[i] = px + 0.01; f.lows[i] = px - 0.01;
  }
  const { rows, coverage } = sessionPathWalk(f, { instrument: 'EURUSD', assetClass: 'fx' });
  assert.equal(coverage.to, lastDate);
  const early = rows.find(r => r.date === lastDate && r.side === 'up' && r.rung === 'p50' && r.checkpointHour === 4);
  const late = rows.find(r => r.date === lastDate && r.side === 'up' && r.rung === 'p50' && r.checkpointHour === 20);
  assert.ok(early, 'expected an up/p50 row at checkpoint 4');
  assert.ok(late, 'expected an up/p50 row at checkpoint 20');
  assert.equal(early.otherSideProgress, '1·one-way-so-far', `expected one-way before the down-side drop, got ${early.otherSideProgress}`);
  assert.equal(late.otherSideProgress, '3·both-sides-active', `expected full escalation after the down-side drop, got ${late.otherSideProgress}`);
});

// ── Momentum/VWAP-at-checkpoint context (reuses confluenceFeatures.js's
// createHtfContext/createConfluenceFeatures — the SAME brick Level Atlas
// calls at a touch, called here at a fixed checkpoint bar instead) ──────────
t('momentum/VWAP-at-checkpoint fields are populated on real data (not vacuous)', () => {
  const { rows } = sessionPathWalk(P, { instrument: 'EURUSD', assetClass: 'fx' });
  for (const key of ['wtState', 'wtMtf', 'wtSlow', 'momAdx', 'htfTrend', 'vwapSide']) {
    assert.ok(rows.some(r => r[key] != null), `expected at least one row with a ${key} reading`);
  }
});

t('momentum/VWAP-at-checkpoint fields are causal — perturbing bars AFTER a checkpoint must not change that checkpoint\'s reading', () => {
  const base = packedM1(60 * 24 * 260, { wiggle: 0.02 });
  const wild = { ...base, highs: base.highs.slice(), lows: base.lows.slice(), closes: base.closes.slice() };
  const start = base.n - 300;
  for (let i = start; i < base.n; i++) { wild.highs[i] += 5; wild.lows[i] -= 5; }
  const a = sessionPathWalk(base, { instrument: 'EURUSD', assetClass: 'fx' });
  const b = sessionPathWalk(wild, { instrument: 'EURUSD', assetClass: 'fx' });
  const lastDate = a.coverage.to;
  const keyOf = r => `${r.date}|${r.side}|${r.rung}|${r.checkpointHour}`;
  const byKeyA = new Map(a.rows.map(r => [keyOf(r), r]));
  let checked = 0;
  for (const rb of b.rows) {
    if (rb.date >= lastDate) continue;
    const ra = byKeyA.get(keyOf(rb));
    if (!ra) continue;
    checked++;
    for (const key of ['wtState', 'wtMtf', 'wtSlow', 'momAdx', 'htfTrend', 'vwapSide', 'confluence']) {
      assert.equal(ra[key], rb[key], `${key} leaked a future perturbation on ${ra.date}`);
    }
  }
  assert.ok(checked > 50, `too few comparable rows to trust the result (${checked})`);
});

console.log(`\n${passed} passed${process.exitCode ? ' — FAILURES ABOVE' : ''}`);
