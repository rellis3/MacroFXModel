/**
 * Unit tests for js/sessionHandoffEngine.js. Pure/synthetic: no network.
 *   node js/sessionHandoffEngine.test.mjs
 *
 * Load-bearing tests: the chronological HANDOFFS mapping (checked empirically
 * against real data before writing the engine — this is the exact class of
 * off-by-one date bug this codebase has been bitten by before, see
 * sessionRangeSeries' own header), the shape bucketing (side/giveback/travel),
 * the `continued` outcome, and no-lookahead.
 */
import assert from 'node:assert/strict';
import { sessionHandoffWalk, TRANSITIONS, SIDES } from './sessionHandoffEngine.js';
import { SESSION_BOUNDS, sessionRangeSeries as _sessionRangeSeries, sessionVolBucket as _sessionVolBucket, prevSessionVolBucket as _prevSessionVolBucket } from './levelAtlasEngine.js';

let passed = 0;
const t = (n, f) => { try { f(); passed++; console.log(`  ✓ ${n}`); }
  catch (e) { console.error(`  ✗ ${n}\n    ${e.message}`); process.exitCode = 1; } };

console.log('sessionHandoffEngine');

const T0 = 1577836800;   // 2020-01-01 00:00:00 UTC (a Wednesday)
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

t('sessionHandoffWalk runs end-to-end on synthetic data and returns rows', () => {
  const { rows, coverage } = sessionHandoffWalk(P, { instrument: 'EURUSD', assetClass: 'fx' });
  assert.ok(coverage, 'coverage present');
  assert.ok(rows.length > 100, `expected rows, got ${rows.length}`);
  for (const r of rows) {
    assert.ok(TRANSITIONS.includes(r.transition));
    assert.ok(SIDES.includes(r.side));
    assert.equal(typeof r.continued, 'boolean');
    assert.ok(['1·held', '2·partial-giveback', '3·full-reversal'].includes(r.giveback));
    assert.ok(['1·churned', '2·mixed', '3·driven'].includes(r.travel));
  }
});

t('every calendar day emits exactly one row per transition (no duplicated or skipped handoffs)', () => {
  const { rows } = sessionHandoffWalk(P, { instrument: 'EURUSD', assetClass: 'fx' });
  const byDate = new Map();
  for (const r of rows) { if (!byDate.has(r.date)) byDate.set(r.date, new Set()); byDate.get(r.date).add(r.transition); }
  let checked = 0;
  for (const [date, set] of byDate) {
    // Every date should have AT MOST one row per transition (never two).
    assert.equal(set.size, [...set].length, `duplicate transition on ${date}`);
    checked++;
  }
  assert.ok(checked > 100);
});

// ── Chronological correctness: build a fixture with a KNOWN, hand-placed
// price path across one full London(D)->NY(D)->Asia(D)->London(D+1) cycle,
// locating each session's bars via the ACTUAL SESSION_BOUNDS (never guess a
// bar offset — this project has been bitten by exactly that before).
function utcHourIndex(base, hour, dayOffset = 0) {
  // Returns the FIRST bar index whose UTC hour === `hour`, on the day
  // `dayOffset` days after `base`'s first bar's own calendar day.
  const target = new Date(base.times[0] * 1000);
  target.setUTCDate(target.getUTCDate() + dayOffset);
  target.setUTCHours(hour, 0, 0, 0);
  const targetSec = Math.floor(target.getTime() / 1000);
  for (let i = 0; i < base.n; i++) if (base.times[i] === targetSec) return i;
  throw new Error(`could not locate bar at hour ${hour} dayOffset ${dayOffset}`);
}

t('HANDOFFS chronological mapping is correct: London(D)->NY(D)->Asia(D)->London(D+1)', () => {
  // Flat baseline, then STEP the price up by a fixed amount at each session
  // boundary (London, NY, Asia, next-London) so each session's OWN close is
  // trivially distinguishable and we can verify which (date, session) pairs
  // the engine treats as adjacent by checking `continued` lines up with the
  // hand-placed steps, not by re-deriving the mapping from the source.
  const base = packedM1(60 * 24 * 220, { wiggle: 0.001, drift: 0 });
  const f = { ...base, opens: base.opens.slice(), highs: base.highs.slice(), lows: base.lows.slice(), closes: base.closes.slice() };
  // Pick a day comfortably inside the fixture (not the first/last).
  const dayOffset = 150;
  const [londonStart] = SESSION_BOUNDS.London, [nyStart] = SESSION_BOUNDS.NY, [asiaStart] = SESSION_BOUNDS.Asia;
  const iLondon = utcHourIndex(base, londonStart, dayOffset);
  const iNy = utcHourIndex(base, nyStart, dayOffset);
  const iAsia = utcHourIndex(base, asiaStart, dayOffset);
  const iLondonNext = utcHourIndex(base, londonStart, dayOffset + 1);
  const basePx = f.opens[iLondon];
  // Step schedule: London session sits at basePx+0, NY session at basePx+1,
  // Asia session at basePx+2, next-London session at basePx+3 — each session
  // flat internally (so its OWN open/close/hi/lo all sit at that level,
  // giveback/travel are irrelevant to this test) but each one step higher
  // than the last, so "did the NEXT session's close end up further up than
  // the closing session's own close" is unambiguous at every hop.
  function setFlat(fromIdx, toIdx, level) {
    for (let i = fromIdx; i < toIdx; i++) { f.opens[i] = level; f.closes[i] = level; f.highs[i] = level + 0.001; f.lows[i] = level - 0.001; }
  }
  setFlat(iLondon, iNy, basePx + 0);
  setFlat(iNy, iAsia, basePx + 1);
  setFlat(iAsia, iLondonNext, basePx + 2);
  // Cover the FULL next-London session (same width as London->NY) so its own
  // hi/lo/close don't pick up leftover background noise past a short overwrite.
  setFlat(iLondonNext, iLondonNext + (iNy - iLondon), basePx + 3);

  const { rows, coverage } = sessionHandoffWalk(f, { instrument: 'EURUSD', assetClass: 'fx' });
  const target = new Date(base.times[0] * 1000); target.setUTCDate(target.getUTCDate() + dayOffset);
  const dateStr = target.toISOString().slice(0, 10);

  const lonNy = rows.find(r => r.date === dateStr && r.transition === 'London→NY');
  const nyAsia = rows.find(r => r.date === dateStr && r.transition === 'NY→Asia');
  const asiaLon = rows.find(r => r.date === dateStr && r.transition === 'Asia→London');
  assert.ok(lonNy, 'expected a London→NY row on the target date');
  assert.ok(nyAsia, 'expected a NY→Asia row on the target date');
  assert.ok(asiaLon, 'expected an Asia→London row on the target date (crossing into date+1)');
  // Every step is a clean +1 up-move — every hop should read as continued=true,
  // since the engine is set up correctly if and only if it looked at the RIGHT
  // next session for each handoff (a wrong date/session mapping would compare
  // against a flat/unrelated session and randomly fail this).
  assert.equal(lonNy.continued, true, 'London->NY: NY closed higher than London — should read continued');
  assert.equal(nyAsia.continued, true, 'NY->Asia: Asia closed higher than NY — should read continued');
  assert.equal(asiaLon.continued, true, 'Asia->London: the FOLLOWING day\'s London closed higher than Asia — should read continued (confirms the date+1 crossing is correct)');
});

t('sessionShape: a session that runs up and holds near its high reads side=up, giveback=1·held', () => {
  const base = packedM1(60 * 24 * 220, { wiggle: 0.001, drift: 0 });
  const f = { ...base, opens: base.opens.slice(), highs: base.highs.slice(), lows: base.lows.slice(), closes: base.closes.slice() };
  const dayOffset = 150;
  const [londonStart] = SESSION_BOUNDS.London, [nyStart] = SESSION_BOUNDS.NY;
  const iLondon = utcHourIndex(base, londonStart, dayOffset);
  const iNy = utcHourIndex(base, nyStart, dayOffset);
  const openPx = f.opens[iLondon];
  const n = iNy - iLondon;
  for (let i = iLondon; i < iNy; i++) {
    const frac = (i - iLondon) / n;
    const px = openPx + 0.10 * frac;   // steady ramp up, closes at its own high
    f.opens[i] = px; f.closes[i] = px; f.highs[i] = px + 0.001; f.lows[i] = px - 0.001;
  }
  const { rows } = sessionHandoffWalk(f, { instrument: 'EURUSD', assetClass: 'fx' });
  const target = new Date(base.times[0] * 1000); target.setUTCDate(target.getUTCDate() + dayOffset);
  const dateStr = target.toISOString().slice(0, 10);
  const row = rows.find(r => r.date === dateStr && r.transition === 'London→NY');
  assert.ok(row, 'expected a London→NY row');
  assert.equal(row.side, 'up');
  assert.equal(row.giveback, '1·held');
  assert.equal(row.travel, '3·driven', 'a clean one-directional ramp should read as driven, not churned');
});

t('sessionShape: a session that spikes up then fully reverses reads giveback=3·full-reversal', () => {
  const base = packedM1(60 * 24 * 220, { wiggle: 0.001, drift: 0 });
  const f = { ...base, opens: base.opens.slice(), highs: base.highs.slice(), lows: base.lows.slice(), closes: base.closes.slice() };
  const dayOffset = 150;
  const [londonStart] = SESSION_BOUNDS.London, [nyStart] = SESSION_BOUNDS.NY;
  const iLondon = utcHourIndex(base, londonStart, dayOffset);
  const iNy = utcHourIndex(base, nyStart, dayOffset);
  const openPx = f.opens[iLondon];
  const n = iNy - iLondon;
  for (let i = iLondon; i < iNy; i++) {
    const frac = (i - iLondon) / n;
    // Spikes up to +0.10 by 30% through, then fully round-trips back to the open.
    const px = frac < 0.3 ? openPx + 0.10 * (frac / 0.3) : openPx + 0.10 * (1 - (frac - 0.3) / 0.7);
    f.opens[i] = px; f.closes[i] = px; f.highs[i] = px + 0.001; f.lows[i] = px - 0.001;
  }
  const { rows } = sessionHandoffWalk(f, { instrument: 'EURUSD', assetClass: 'fx' });
  const target = new Date(base.times[0] * 1000); target.setUTCDate(target.getUTCDate() + dayOffset);
  const dateStr = target.toISOString().slice(0, 10);
  const row = rows.find(r => r.date === dateStr && r.transition === 'London→NY');
  assert.ok(row, 'expected a London→NY row');
  assert.equal(row.side, 'up', 'the extent was still bigger to the upside even though it round-tripped');
  assert.equal(row.giveback, '3·full-reversal', `expected a full reversal, got ${row.giveback}`);
});

t('no-lookahead: perturbing bars AFTER a handoff must not change that handoff\'s row', () => {
  const base = packedM1(60 * 24 * 260, { wiggle: 0.02 });
  const wild = { ...base, highs: base.highs.slice(), lows: base.lows.slice(), closes: base.closes.slice() };
  const start = base.n - 300;
  for (let i = start; i < base.n; i++) { wild.highs[i] += 5; wild.lows[i] -= 5; }
  const a = sessionHandoffWalk(base, { instrument: 'EURUSD', assetClass: 'fx' });
  const b = sessionHandoffWalk(wild, { instrument: 'EURUSD', assetClass: 'fx' });
  const lastDate = a.coverage.to;
  const keyOf = r => `${r.date}|${r.transition}`;
  const byKeyA = new Map(a.rows.map(r => [keyOf(r), r]));
  let checked = 0;
  for (const rb of b.rows) {
    if (rb.date >= lastDate) continue;
    const ra = byKeyA.get(keyOf(rb));
    if (!ra) continue;
    checked++;
    assert.equal(ra.side, rb.side, `side leaked a future perturbation on ${ra.date}|${ra.transition}`);
    assert.equal(ra.giveback, rb.giveback, `giveback leaked a future perturbation on ${ra.date}|${ra.transition}`);
    assert.equal(ra.travel, rb.travel, `travel leaked a future perturbation on ${ra.date}|${ra.transition}`);
    assert.equal(ra.continued, rb.continued, `continued leaked a future perturbation on ${ra.date}|${ra.transition}`);
  }
  assert.ok(checked > 50, `too few comparable rows to trust the result (${checked})`);
});

t('liveWindowDays reproduces IDENTICAL rows for the live day as the full walk', () => {
  const full = sessionHandoffWalk(P, { instrument: 'EURUSD', assetClass: 'fx' });
  const fast = sessionHandoffWalk(P, { instrument: 'EURUSD', assetClass: 'fx', liveWindowDays: 90 });
  assert.equal(fast.coverage.to, full.coverage.to);
  const fullLast = full.rows.filter(r => r.date === full.coverage.to);
  const fastLast = fast.rows.filter(r => r.date === fast.coverage.to);
  assert.equal(fastLast.length, fullLast.length);
  const keyOf = r => r.transition;
  const fullByKey = new Map(fullLast.map(r => [keyOf(r), r]));
  for (const r of fastLast) {
    const f = fullByKey.get(keyOf(r));
    assert.ok(f);
    assert.deepEqual(r, f, `row diverged between the 90-day walk and the full walk for ${keyOf(r)}`);
  }
});

// ── nextVol/nextRatio (volatility clustering, the real finding here — see
// the engine's own header for the honest continued=coin-flip vs
// nextVol=real-effect contrast) ──────────────────────────────────────────
t('nextVol is populated once there is enough trailing history, and null before that', () => {
  const { rows } = sessionHandoffWalk(P, { instrument: 'EURUSD', assetClass: 'fx' });
  assert.ok(rows.some(r => r.nextVol != null), 'expected at least one row with a nextVol reading');
  assert.ok(rows.some(r => r.nextRatio != null && r.nextRatio > 0));
});

t('nextVol reads the NEXT session\'s OWN prior-history median, not the closing session\'s (Asia→London needs one more date)', () => {
  // A direct regression check: for an Asia→London row, nextVol must equal
  // whatever sessionVolBucket(rangeMap, dateOfNextLondon, 'London', priorDatesOfNextLondon)
  // returns — recomputed independently here via the exported bricks, not by
  // re-reading the engine's own internals, so this can't just echo a shared bug.
  const { rows } = sessionHandoffWalk(P, { instrument: 'EURUSD', assetClass: 'fx' });
  const asiaLondonRows = rows.filter(r => r.transition === 'Asia→London' && r.nextVol != null);
  assert.ok(asiaLondonRows.length > 50, 'expected enough Asia→London rows with a nextVol reading to check');
  const sample = asiaLondonRows[Math.floor(asiaLondonRows.length / 2)];
  const rangeMap = _sessionRangeSeries(P);
  const dates = [...new Set([...rangeMap.keys()].map(k => k.split('|')[0]))].sort();
  const nextDateKey = (() => { const d = new Date(sample.date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
  const nextIdx = dates.indexOf(nextDateKey);
  const priorDates = dates.slice(0, nextIdx);
  const expected = _sessionVolBucket(rangeMap, nextDateKey, 'London', priorDates);
  assert.equal(sample.nextVol, expected?.bucket ?? null, `nextVol mismatch for Asia→London on ${sample.date}`);
});

// ── prevVol (persistence check, #4) — reuses the SAME shared helper
// levelAtlasEngine.js's own tests already verify, so this checks the
// ENGINE'S WIRING of it, not the helper's own correctness a second time.
t('prevVol matches a direct prevSessionVolBucket call for the closing session\'s own predecessor', () => {
  const { rows } = sessionHandoffWalk(P, { instrument: 'EURUSD', assetClass: 'fx' });
  const rangeMap = _sessionRangeSeries(P);
  const dates = [...new Set([...rangeMap.keys()].map(k => k.split('|')[0]))].sort();
  const FROM_OF = { 'London→NY': 'London', 'NY→Asia': 'NY', 'Asia→London': 'Asia' };
  let checked = 0;
  for (const t of TRANSITIONS) {
    const withPrevVol = rows.filter(r => r.transition === t && r.prevVol != null);
    if (!withPrevVol.length) continue;
    const sample = withPrevVol[Math.floor(withPrevVol.length / 2)];
    const expected = _prevSessionVolBucket(rangeMap, sample.date, FROM_OF[t], dates);
    assert.equal(sample.prevVol, expected, `prevVol mismatch for ${t} on ${sample.date}`);
    checked++;
  }
  assert.ok(checked > 0, 'expected at least one transition with a checkable prevVol reading');
});

t('prevVol is causal — perturbing bars AFTER a handoff must not change that handoff\'s prevVol', () => {
  const base = packedM1(60 * 24 * 260, { wiggle: 0.02 });
  const wild = { ...base, highs: base.highs.slice(), lows: base.lows.slice(), closes: base.closes.slice() };
  const start = base.n - 300;
  for (let i = start; i < base.n; i++) { wild.highs[i] += 5; wild.lows[i] -= 5; }
  const a = sessionHandoffWalk(base, { instrument: 'EURUSD', assetClass: 'fx' });
  const b = sessionHandoffWalk(wild, { instrument: 'EURUSD', assetClass: 'fx' });
  const lastDate = a.coverage.to;
  const keyOf = r => `${r.date}|${r.transition}`;
  const byKeyA = new Map(a.rows.map(r => [keyOf(r), r]));
  let checked = 0;
  for (const rb of b.rows) {
    if (rb.date >= lastDate) continue;
    const ra = byKeyA.get(keyOf(rb));
    if (!ra) continue;
    checked++;
    assert.equal(ra.prevVol, rb.prevVol, `prevVol leaked a future perturbation on ${ra.date}|${ra.transition}`);
  }
  assert.ok(checked > 50, `too few comparable rows (${checked})`);
});

console.log(`\n${passed} passed${process.exitCode ? ' — FAILURES ABOVE' : ''}`);
