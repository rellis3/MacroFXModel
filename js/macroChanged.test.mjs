import assert from 'node:assert/strict';
import { verdictOf, verdicts, whatChangedToday, changedLine, THREAD_FLOORS } from './macroChanged.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

const rows = (over = {}) => Object.entries({ us10y: 17, tips: 18, hy: -8, vix: -1.0, us2s10s: -20, oil: 4, ...over })
  .map(([key, d20]) => ({ key, deltas: { 20: d20 }, lastDate: '2026-09-23' }));

t('the verdict is the panel\'s own rule: sign of the 20-day change, above a floor', () => {
  assert.equal(verdictOf(17, 8), 'rising');
  assert.equal(verdictOf(-17, 8), 'falling');
  assert.equal(verdictOf(7, 8), 'steady', 'below the floor is steady, not a small rise');
  assert.equal(verdictOf(-7, 8), 'steady');
  assert.equal(verdictOf(null, 8), null);
  assert.equal(verdictOf(undefined, 8), null);
});

t('the floors match the panel so the two cannot drift apart', () => {
  // these are the numbers in today.html's own trend() calls
  assert.equal(THREAD_FLOORS.us10y.floor, 8);
  assert.equal(THREAD_FLOORS.tips.floor, 8);
  assert.equal(THREAD_FLOORS.hy.floor, 15);
  assert.equal(THREAD_FLOORS.vix.floor, 3);
  assert.equal(THREAD_FLOORS.us2s10s.floor, 8);
  assert.equal(Object.keys(THREAD_FLOORS).length, 6, 'six threads, six floors');
});

t('a flat delta reads steady, and the credit floor is wide enough to prove it', () => {
  const v = verdicts(rows());
  assert.equal(v.us10y.verdict, 'rising');
  assert.equal(v.tips.verdict, 'rising');
  assert.equal(v.hy.verdict, 'steady', '-8bp is inside the 15bp credit floor');
  assert.equal(v.vix.verdict, 'steady', '-1.0 is inside the 3pt VIX floor');
  assert.equal(v.us2s10s.verdict, 'falling');
});

t('it names the ONE thread that moved, which is the whole point', () => {
  const before = rows();
  const after = rows({ vix: -4.2 }).map(r => ({ ...r, lastDate: '2026-09-24' }));   // a new print
  const r = whatChangedToday(after, before, '2026-09-23');
  assert.equal(r.ok, true);
  assert.equal(r.changed.length, 1);
  assert.equal(r.changed[0].key, 'vix');
  assert.equal(r.changed[0].from, 'steady');
  assert.equal(r.changed[0].to, 'falling');
  assert.equal(r.held.length, 5, 'and says the other five held');
});

// The measured reality: five of six say the same thing most days. Going silent on that
// would be worse than saying it — "nothing changed" is the useful sentence on a slow day.
t('a day where nothing changed says so rather than rendering nothing', () => {
  const r = whatChangedToday(rows().map(x => ({ ...x, lastDate: '2026-09-24' })), rows(), '2026-09-23');
  assert.equal(r.changed.length, 0);
  assert.match(changedLine(r), /No thread changed its reading since 2026-09-23/);
});

// FRED settles behind, so an identical number often means nothing was PUBLISHED.
t('"no new print" is reported separately from "unchanged"', () => {
  const before = rows();
  const after = rows().map(r => r.key === 'hy' ? { ...r, lastDate: '2026-09-23' } : { ...r, lastDate: '2026-09-24' });
  const r = whatChangedToday(after, before, '2026-09-23');
  assert.equal(r.noNewPrint.length, 1);
  assert.equal(r.noNewPrint[0].key, 'hy');
  assert.equal(r.held.find(h => h.key === 'hy').newPrint, false, 'it held, but not on new data');
  assert.match(changedLine(r), /not published since/);
  assert.match(changedLine(r), /not that nothing happened/);
});

// The 20-session window SLIDES, so a verdict can change with no new print at all: the
// value dropping off the back moves even when the front does not. Hiding that would
// hide a real change in what the panel says, so it is reported with its cause named.
t('a verdict that changed on the window sliding is reported, and labelled as such', () => {
  const before = rows({ us10y: 7 });        // steady
  const after = rows({ us10y: 40 });        // rising, same lastDate on every row
  const r = whatChangedToday(after, before, '2026-09-23');
  assert.equal(r.changed.length, 1);
  assert.equal(r.changed[0].key, 'us10y');
  assert.equal(r.changed[0].newPrint, false);
  assert.equal(r.noNewPrint.length, 6, 'and every series is still flagged as not having printed');
  assert.match(changedLine(r), /on the window sliding, not a new print/);
});

t('with no earlier day it refuses to compare rather than inventing a baseline', () => {
  const r = whatChangedToday(rows(), null);
  assert.equal(r.ok, false);
  assert.match(r.reason, /no earlier day stored/);
  assert.deepEqual(r.changed, []);
  assert.equal(changedLine(r), 'no earlier day stored to compare with');
  assert.equal(changedLine(null), '');
});

t('it reads both the live shape and the stored one', () => {
  const live = [{ key: 'us10y', deltas: { 20: 17 } }];
  const stored = [{ key: 'us10y', d20: 17 }];          // the snapshot row flattens it
  assert.equal(verdicts(live).us10y.verdict, 'rising');
  assert.equal(verdicts(stored).us10y.verdict, 'rising');
  assert.equal(verdicts([]).us10y.verdict, null);
  assert.equal(verdicts(null).vix.verdict, null);
});

console.log(`macroChanged: ${n} groups, all passed`);
