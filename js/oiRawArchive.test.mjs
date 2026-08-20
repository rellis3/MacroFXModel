// Tests for the OI raw-archive merge rules.
//
// The failure mode here is silent and unrecoverable — CME serves no OI history, so a
// day archived without its IV boxes is missing them forever. These tests are the
// sequence that actually happened in production (ladder first, IV later, IV dropped)
// plus the two properties the fix must NOT break: no write-amplification on an
// unchanged capture, and no wiping IV that is already stored.
//
//   node js/oiRawArchive.test.mjs

import { ivBits, ladderKey, rawDayDecision, mergeRawDay } from './oiRawArchive.js';

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

console.log('');
console.log(failures ? `${failures} FAILED` : 'All oi-raw-archive tests passed');
process.exit(failures ? 1 : 0);
