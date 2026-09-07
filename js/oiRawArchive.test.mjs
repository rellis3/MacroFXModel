// Tests for the OI raw-archive merge rules.
//
// The failure mode here is silent and unrecoverable — CME serves no OI history, so a
// day archived without its IV boxes is missing them forever. These tests are the
// sequence that actually happened in production (ladder first, IV later, IV dropped)
// plus the two properties the fix must NOT break: no write-amplification on an
// unchanged capture, and no wiping IV that is already stored.
//
//   node js/oiRawArchive.test.mjs

import { ivBits, ladderKey, rawDayDecision, mergeRawDay,
         oiContentFingerprint, oiFreshnessStreak, settledFreshnessInputs } from './oiRawArchive.js';

let failures = 0;
const ok = (name, cond, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) failures++;
};

const LADDER = { rawOI: 'strikes...', rawChg: 'chg...', rawVol: 'vol...' };
const withIv = (e, iv = 'IVBOX', term = 'IVTERM') => ({ ...e, rawIV: iv, rawIVTerm: term });

console.log('[ivBits]');
ok('none', ivBits(LADDER) === 0);
ok('rawIV only', ivBits({ ...LADDER, rawIV: 'x' }) === 1);
ok('rawIVTerm only', ivBits({ ...LADDER, rawIVTerm: 'x' }) === 2);
ok('both', ivBits(withIv(LADDER)) === 3);
ok('null entry', ivBits(null) === 0);
ok('empty strings do not count as present', ivBits({ rawIV: '', rawIVTerm: '' }) === 0);

console.log('\n[the production sequence]');
// 1. ladder lands first, no IV yet → fresh day, must write
const d1 = rawDayDecision(undefined, LADDER);
ok('fresh day writes', d1.write && d1.ladderNew);
let stored = mergeRawDay(undefined, LADDER, d1.ladderNew);
ok('stored has ladder, no IV', !!stored.rawOI && ivBits(stored) === 0);

// 2. IV arrives, ladder unchanged → THE BUG: old rule said "no change"
const next = withIv(LADDER);
const d2 = rawDayDecision(stored, next);
ok('ladder alone looks unchanged', !d2.ladderNew);
ok('but the IV upgrade forces a write', d2.write && d2.ivUpgrade);
stored = mergeRawDay(stored, next, d2.ladderNew);
ok('IV is now archived', ivBits(stored) === 3, `bits=${ivBits(stored)}`);

// 3. the 30-min timer runs again with an identical capture → must NOT write
const d3 = rawDayDecision(stored, withIv(LADDER));
ok('an unchanged capture does not write', !d3.write);

console.log('\n[properties the fix must not break]');
// IV changing VALUE is not an upgrade — otherwise the timer burns the write quota
const d4 = rawDayDecision(stored, withIv(LADDER, 'DIFFERENT-IV', 'DIFFERENT-TERM'));
ok('IV value change alone does not rewrite', !d4.write);

// a capture that arrives without IV must not wipe stored IV
const d5 = rawDayDecision(stored, LADDER);
ok('IV-less capture does not trigger a write', !d5.write);
ok('and merging one would not erase the IV',
   ivBits(mergeRawDay(stored, LADDER, false)) === 3);

// partial upgrade: term arrives after the smile
let partial = { ...LADDER, rawIV: 'IVBOX' };
const d6 = rawDayDecision(partial, withIv(LADDER));
ok('partial → full is an upgrade', d6.write && d6.ivUpgrade);
ok('merge fills only the missing box',
   ivBits(mergeRawDay(partial, withIv(LADDER), false)) === 3);

// a genuinely new ladder replaces wholesale, keeping ITS capture context
const newLadder = { rawOI: 'NEW', rawChg: 'NEW', rawVol: 'NEW', spot: 1.23 };
const d7 = rawDayDecision(stored, newLadder);
ok('new ladder writes', d7.write && d7.ladderNew);
ok('new ladder replaces rather than merges',
   mergeRawDay(stored, newLadder, true).rawOI === 'NEW');

// the ladder key must not be forgeable by content containing the delimiter
ok('ladderKey separates fields unambiguously',
   ladderKey({ rawOI: 'a', rawChg: 'b', rawVol: '' }) !== ladderKey({ rawOI: 'a b', rawChg: '', rawVol: '' }));

console.log('\n[oiContentFingerprint — content only, never price levels]');
{
  const s1 = { totalCallOI: 100, totalPutOI: 80, pcRatio: 0.8,
    callWalls: [{ strike: 1.2000, oi: 500 }, { strike: 1.2100, oi: 300 }],
    putWalls: [{ strike: 1.1900, oi: 400 }] };
  // Same OI content, every price level shifted by a constant basis delta — this is
  // EXACTLY what oiReprojectBasis does every 15 minutes, and must NOT look "fresh".
  const s2 = { ...s1, callWalls: s1.callWalls.map(w => ({ strike: w.strike + 0.0007, oi: w.oi })),
    putWalls: s1.putWalls.map(w => ({ strike: w.strike + 0.0007, oi: w.oi })) };
  ok('a pure basis re-projection (levels shift, OI does not) fingerprints IDENTICAL',
    oiContentFingerprint(s1) === oiContentFingerprint(s2));
  // Genuinely different OI at the same levels DOES change the fingerprint.
  const s3 = { ...s1, callWalls: [{ strike: 1.2000, oi: 999 }, { strike: 1.2100, oi: 300 }] };
  ok('real OI change at a wall changes the fingerprint', oiContentFingerprint(s1) !== oiContentFingerprint(s3));
  ok('null summary -> null (never a fake fingerprint)', oiContentFingerprint(null) === null);
  ok('missing wall arrays do not throw', oiContentFingerprint({ totalCallOI: 1 }) != null);
}

console.log('\n[oiFreshnessStreak — the weekend must not look like a failure, four days must]');
{
  const fp = 'FINGERPRINT-A';
  // Fri (real, fresh) -> Sat (repeats Friday, weekend, no new settle) -> Sun (same) ->
  // an early Monday run (Monday's own session has not closed yet at ~05:17 UTC).
  // Empirically this is exactly the shape that is NOT a failure.
  let s = null;
  s = oiFreshnessStreak(s, '2026-08-28', fp, 'DIFFERENT-FRI-1', 3);         // Fri: real content, streak resets to 0
  ok('a real day-over-day change resets the streak', s.streak === 0 && !s.alert);
  s = oiFreshnessStreak(s, '2026-08-29', fp, fp, 3);                        // Sat: repeats Friday
  ok('Sat repeating Fri: streak 1, no alert', s.streak === 1 && !s.alert, JSON.stringify(s));
  s = oiFreshnessStreak(s, '2026-08-30', fp, fp, 3);                        // Sun: still Friday's numbers
  ok('Sun still flat: streak 2, no alert', s.streak === 2 && !s.alert);
  s = oiFreshnessStreak(s, '2026-08-31', fp, fp, 3);                        // Mon (early run): still Friday's
  ok('early Monday run still flat: streak 3, no alert yet (weekend budget)', s.streak === 3 && !s.alert, JSON.stringify(s));
  s = oiFreshnessStreak(s, '2026-09-01', fp, fp, 3);                        // Tue: Monday's own close should exist now
  ok('Tuesday STILL flat — no weekend excuse left — alert fires', s.streak === 4 && s.alert, JSON.stringify(s));
  s = oiFreshnessStreak(s, '2026-09-02', fp, fp, 3);
  ok('stays alerting every day it remains stale (matches the sweep-heartbeat pattern)', s.alert);
  s = oiFreshnessStreak(s, '2026-09-03', 'FINGERPRINT-B', fp, 3);
  ok('a genuine change immediately clears it', s.streak === 0 && !s.alert);

  console.log('\n[oiFreshnessStreak — guards]');
  ok('same day re-tick (30-min timer) is a no-op, never double-counts', (() => {
    const once = oiFreshnessStreak(null, '2026-09-01', fp, fp, 3);
    const twice = oiFreshnessStreak(once, '2026-09-01', fp, fp, 3);
    return twice.streak === once.streak && twice.alert === false;
  })());
  ok('no prior fingerprint (pair\'s first day) never counts as "unchanged"',
    oiFreshnessStreak(null, '2026-09-01', fp, null, 3).streak === 0);
  ok('no current fingerprint (no summary today) never counts as "unchanged" either',
    oiFreshnessStreak({ day: '2026-08-31', streak: 5 }, '2026-09-01', null, fp, 3).streak === 0);
  ok('toleranceDays is honoured (0 = alert on the very first repeat)',
    oiFreshnessStreak(null, '2026-08-30', fp, fp, 0).alert === true);
}

console.log('\n[settledFreshnessInputs — which two archived days to compare]');
{
  ok('picks the most recent archived day + the one before it',
    JSON.stringify(settledFreshnessInputs(['2026-09-05', '2026-09-06'], null)) ===
    JSON.stringify({ yest: '2026-09-06', dayBefore: '2026-09-05' }));
  ok('already evaluated this "yest" -> null (don\'t redo it every 30-min tick)',
    settledFreshnessInputs(['2026-09-05', '2026-09-06'], '2026-09-06') === null);
  ok('a NEW "yest" (the day advanced) -> evaluates again',
    settledFreshnessInputs(['2026-09-05', '2026-09-06', '2026-09-07'], '2026-09-06')?.yest === '2026-09-07');
  ok('nothing archived yet -> null', settledFreshnessInputs([], null) === null);
  ok('exactly one archived day -> yest set, dayBefore undefined (never "unchanged" with nothing to compare)',
    (() => { const r = settledFreshnessInputs(['2026-09-06'], null); return r?.yest === '2026-09-06' && r.dayBefore === undefined; })());
}

console.log('\n[regression — the race this replaced: never compare today\'s live read]');
{
  // Reproduces the exact live incident (2026-09-08): all 11 pairs read streak=2
  // the same morning the local freshness_check.py stage reported real movement.
  // Four days, GENUINELY DIFFERENT content every day (mirrors what freshness_check.py
  // actually observed) — the correct streak must stay 0 throughout. Two ticks per
  // day: the first happens right after the session boundary rolls, hours BEFORE
  // that day's own nightly ingest — so it still reads the PRIOR day's content
  // (the exact condition that broke the original comparison); the second happens
  // after the ingest has landed.
  const days = ['2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08'];
  const contentByDay = { '2026-09-04': 'D0', '2026-09-05': 'D1', '2026-09-06': 'D2',
                         '2026-09-07': 'D3', '2026-09-08': 'D4' };
  const hist = { '2026-09-04': mkSummary('D0') };   // yesterday-of-day-1, already settled
  const freshState = {};
  const alerts = [];
  function mkSummary(tag) { return { totalCallOI: 1, totalPutOI: 0, pcRatio: 1,
    callWalls: [{ oi: tag }], putWalls: [] }; }
  for (const day of days) {
    const priorContent = contentByDay[days[days.indexOf(day) - 1] ?? '2026-09-04'] ??
      contentByDay['2026-09-04'];
    for (const tick of ['pre-ingest', 'post-ingest']) {
      const liveContent = tick === 'pre-ingest' ? priorContent : contentByDay[day];
      const dates = Object.keys(hist).filter(d => d !== day).sort();
      const inputs = settledFreshnessInputs(dates, freshState.day);
      if (inputs) {
        const fp = oiContentFingerprint(hist[inputs.yest]);
        const prevFp = oiContentFingerprint(hist[inputs.dayBefore]);
        const st = oiFreshnessStreak(freshState, inputs.yest, fp, prevFp);
        freshState.day = st.day; freshState.streak = st.streak;
        if (st.alert) alerts.push({ day, streak: st.streak });
      }
      hist[day] = mkSummary(liveContent);   // mirrors the unconditional in-memory overwrite each tick
    }
  }
  ok('streak never climbs when every day genuinely differs (no false alert)',
    freshState.streak === 0 && alerts.length === 0, `streak=${freshState.streak} alerts=${JSON.stringify(alerts)}`);

  console.log('\n[regression — a REAL stale run is still caught]');
  const hist2 = { '2026-09-04': mkSummary('STUCK') };
  const freshState2 = {};
  const alerts2 = [];
  const stuckDays = ['2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09'];
  for (const day of stuckDays) {
    for (const tick of ['pre-ingest', 'post-ingest']) {
      const dates = Object.keys(hist2).filter(d => d !== day).sort();
      const inputs = settledFreshnessInputs(dates, freshState2.day);
      if (inputs) {
        const fp = oiContentFingerprint(hist2[inputs.yest]);
        const prevFp = oiContentFingerprint(hist2[inputs.dayBefore]);
        const st = oiFreshnessStreak(freshState2, inputs.yest, fp, prevFp);
        freshState2.day = st.day; freshState2.streak = st.streak;
        if (st.alert) alerts2.push({ day, streak: st.streak });
      }
      hist2[day] = mkSummary('STUCK');   // every day, every tick — genuinely frozen content
    }
  }
  ok('a genuinely stuck feed (STUCK every day) still crosses tolerance and alerts',
    alerts2.length > 0 && freshState2.streak > 3, `streak=${freshState2.streak} alerts=${JSON.stringify(alerts2)}`);
}

console.log('');
console.log(failures ? `${failures} FAILED` : 'All oi-raw-archive tests passed');
process.exit(failures ? 1 : 0);
