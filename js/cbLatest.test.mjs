// node js/cbLatest.test.mjs
import assert from 'node:assert/strict';
import { publishedAtMs, shouldReplaceLatest, pickLatest } from './cbLatest.js';
import { allReleases as rbaAll } from './rbaCalendar.js';
import { allReleases as bocAll } from './bocCalendar.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

const rba = rbaAll(), boc = bocAll();

t('no pointer -> replace', () => {
  assert.equal(shouldReplaceLatest(null, { kind: 'statement', meetingDate: '2026-08-11' }, rba), true);
});

t('never moves backwards: older statement does not replace newer one (the live RBA bug)', () => {
  const cur = { kind: 'statement', meetingDate: '2026-09-29' };
  assert.equal(shouldReplaceLatest(cur, { kind: 'statement', meetingDate: '2026-08-11' }, rba), false);
  assert.equal(shouldReplaceLatest({ kind: 'statement', meetingDate: '2026-08-11' }, cur, rba), true);
});

t('older minutes published BEFORE the current statement do not replace it', () => {
  // 08-11 minutes publish ~08-25, before the 09-29 statement.
  assert.equal(shouldReplaceLatest({ kind: 'statement', meetingDate: '2026-09-29' }, { kind: 'minutes', meetingDate: '2026-08-11' }, rba), false);
});

t('minutes published AFTER the latest statement do replace it (BoJ semantics)', () => {
  // 09-29 minutes publish ~10-13; that is the newest document until 11-03.
  assert.equal(shouldReplaceLatest({ kind: 'statement', meetingDate: '2026-09-29' }, { kind: 'minutes', meetingDate: '2026-09-29' }, rba), true);
  // BoC: 07-15 deliberations (~07-27) is newer than the 07-15 statement, older than 09-02.
  assert.equal(shouldReplaceLatest({ kind: 'statement', meetingDate: '2026-07-15' }, { kind: 'deliberations', meetingDate: '2026-07-15' }, boc), true);
  assert.equal(shouldReplaceLatest({ kind: 'statement', meetingDate: '2026-09-02' }, { kind: 'deliberations', meetingDate: '2026-07-15' }, boc), false);
});

t('same-day tie: statement beats the SMP/MPR overview', () => {
  assert.equal(shouldReplaceLatest({ kind: 'statement', meetingDate: '2026-07-15' }, { kind: 'mpr', meetingDate: '2026-07-15' }, boc), false);
  assert.equal(shouldReplaceLatest({ kind: 'mpr', meetingDate: '2026-07-15' }, { kind: 'statement', meetingDate: '2026-07-15' }, boc), true);
});

t('re-analysing the current document keeps it', () => {
  assert.equal(shouldReplaceLatest({ kind: 'statement', meetingDate: '2026-09-02' }, { kind: 'statement', meetingDate: '2026-09-02' }, boc), true);
});

t('own publish date overrides the calendar estimate', () => {
  const a = publishedAtMs({ kind: 'minutes', meetingDate: '2026-08-11' }, rba);
  const b = publishedAtMs({ kind: 'minutes', meetingDate: '2026-08-11', publishedOn: '2026-10-01' }, rba);
  assert.ok(b > a);
  // Unknown kind / no calendar entry falls back to the meeting date.
  assert.equal(publishedAtMs({ kind: 'x', meetingDate: '2026-01-01' }, []), Date.parse('2026-01-01T12:00:00Z'));
});

t('pickLatest repairs a wrong pointer from what is analysed', () => {
  const docs = [
    { kind: 'statement', meetingDate: '2026-08-11' }, { kind: 'smp', meetingDate: '2026-08-11' },
    { kind: 'statement', meetingDate: '2026-09-29' }, { kind: 'minutes', meetingDate: '2026-08-11' },
  ];
  assert.deepEqual(pickLatest(docs, rba), { kind: 'statement', meetingDate: '2026-09-29' });
  assert.equal(pickLatest([], rba), null);
});

console.log(`\n${n} passed`);
