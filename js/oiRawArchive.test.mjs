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
         oiContentFingerprint, oiFreshnessStreak } from './oiRawArchive.js';

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

console.log('');
console.log(failures ? `${failures} FAILED` : 'All oi-raw-archive tests passed');
process.exit(failures ? 1 : 0);
