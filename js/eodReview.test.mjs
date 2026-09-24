import assert from 'node:assert/strict';
import { eodSnapshot, buildEodReviewPrompt, sessionWindow } from './eodReview.js';
import { endOfDay } from './endOfDay.js';
import { endOfDayBrief } from './endOfDayBrief.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const NOW = Date.UTC(2026, 8, 23, 20, 30);
const AM = '2026-09-23T07:30:00.000Z';

const morning = {
  brief: { generatedAt: '2026-09-23T07:07:28.375Z', regime: 'MIXED', headline: 'Yesterday went 0-for-2 on direction',
           watch: ['Flash PMIs 07:15-08:30 UTC', 'Whether stock/bond correlation stays positive'],
           boardTrade: { pair: 'AUDUSD', direction: 'SHORT' } },
  chainRead: { hook: 'The front end is doing all the work.', stories: [{ name: 'the rate shock', status: 'dominant' }] },
  plan: { at: AM, pairs: {
    GOLD:   { price: 4362.35, expRange: 83, lean: 'down', wrongAt: 4400, aim: { target: 4290, side: 'below' }, o5: 'BEARISH', o5c: 59, regime: 'RANGE', volPct: 31 },
    AUDUSD: { price: 0.7114, expRange: 36, lean: 'down', o5: 'BEARISH', o5c: 55, regime: 'TREND' },
    EURCHF: { price: 0.93, expRange: 30, lean: null, o5: 'NEUTRAL' },
  } },
};
const live = {
  GOLD:   { session_open: 4362.35, current_price: 4284.50, ac: 'commodity', regime: { label: 'RANGE' }, vol_pct: 33 },
  AUDUSD: { session_open: 0.7114, current_price: 0.7041, ac: 'fx', sym: 'AUD_USD', regime: { label: 'RANGE' }, vol_pct: 3 },
  EURCHF: { session_open: 0.9300, current_price: 0.9301, ac: 'fx', sym: 'EUR_CHF', regime: { label: 'RANGE' }, vol_pct: 8 },
};
const hl = { GOLD: { rangePct: 2.17 }, AUDUSD: { rangePct: 1.28 }, EURCHF: { rangePct: 0.1 } };
const build = () => {
  const eod = endOfDay({ morning, live, hl });
  const brief = endOfDayBrief({ morning, eod, moved: [{ lastDate: '2026-09-22' }], nowMs: NOW,
    ahead: [{ date: '2026-09-24', n: 2, events: [{ ccy: 'AUD', event: 'Employment Change', ms: Date.UTC(2026, 8, 24, 1, 30) }] }] });
  return { eod, brief };
};

t('the snapshot carries the morning record, not just the prices', () => {
  const { eod, brief } = build();
  const s = eodSnapshot({ eod, brief, morning, nowISO: new Date(NOW).toISOString() });
  assert.equal(s.morningAt, '2026-09-23T07:07:28.375Z');
  assert.equal(s.morning.regime, 'MIXED');
  assert.deepEqual(s.morning.tradeOfTheDay, { pair: 'AUDUSD', direction: 'SHORT' });
  assert.equal(s.morning.watch.length, 2);
  assert.match(s.morning.chainHook, /front end/);
  assert.equal(s.morning.chainStories[0], 'the rate shock (dominant)');
});

t('every pair carries open, now, the forecast it was judged against, and its verdict', () => {
  const { eod, brief } = build();
  const s = eodSnapshot({ eod, brief, morning, activity: { GOLD: { ratio: 0.78 } }, nowISO: new Date(NOW).toISOString() });
  const g = s.spine.find(p => p.name === 'GOLD');
  assert.equal(g.open, 4362.35);
  assert.equal(g.now, 4284.5);
  assert.match(g.move, /^-78 \$$/);
  assert.equal(g.expected, 83);
  assert.equal(g.activity, 0.78);
  assert.equal(g.falsifier.traded, false);
  assert.equal(g.aim.reached, true, 'gold finished 4284.50, below the 4290 aim');
  assert.equal(g.aim.certain, false, 'a percent range cannot confirm a level traded, only where price finished');
  assert.ok(g.verdict.length > 5);
});

t('the snapshot stays small: the spine in full, the rest as extremes and counts', () => {
  const { eod, brief } = build();
  const s = eodSnapshot({ eod, brief, morning, nowISO: new Date(NOW).toISOString() });
  assert.ok(s.biggestOverRange.length <= 4);
  assert.ok(s.quietest.length <= 2);
  assert.ok(s.committed.length <= 8);
  assert.equal(s.board.scored, 3);
  assert.equal(s.board.leansMade, 2, 'EURCHF had no lean');
  assert.ok(JSON.stringify(s).length < 30_000, 'thirty pairs of detail would crowd out the part that matters');
  assert.equal(eodSnapshot({ eod: { ok: false } }), null);
  assert.equal(eodSnapshot({}), null);
});

// ── the prompt: what it must contain, in the owner's words ──────────────────
t('the prompt says plainly that it is an end-of-day review of a finished session', () => {
  const { eod, brief } = build();
  const p = buildEodReviewPrompt(eodSnapshot({ eod, brief, morning, nowISO: new Date(NOW).toISOString() }));
  assert.match(p, /END-OF-DAY REVIEW/);
  assert.match(p, /Every major session has closed/);
  assert.match(p, /retrospective/);
  assert.match(p, /REVIEW, past tense/);
  assert.match(p, /Not a preview, not a call/);
});

t('it asks for the day walked open to close, with the knock-on effects', () => {
  const { eod, brief } = build();
  const p = buildEodReviewPrompt(eodSnapshot({ eod, brief, morning, nowISO: new Date(NOW).toISOString() }));
  assert.match(p, /Walk the day: where each market opened, where it went/);
  assert.match(p, /Second and third order/);
  assert.match(p, /open to close, market by market, with the knock-on effects/);
  // and the data to do it with
  assert.match(p, /GOLD: opened 4362\.35, now 4284\.5/);
  assert.match(p, /Expected range 83, realised \d+ = \d+% of forecast/);
});

t('it demands an honest verdict on the morning, split three ways', () => {
  const { eod, brief } = build();
  const p = buildEodReviewPrompt(eodSnapshot({ eod, brief, morning, nowISO: new Date(NOW).toISOString() }));
  assert.match(p, /BE HONEST ABOUT THE MORNING/);
  assert.match(p, /what the page got right, what it got wrong/);
  assert.match(p, /what was simply unknowable at 07:00/);
  assert.match(p, /a reader learns most from the third/);
  assert.match(p, /"right":/); assert.match(p, /"wrong":/); assert.match(p, /"unknowable":/);
});

t('it asks what to learn, with the screen that would show it again', () => {
  const { eod, brief } = build();
  const p = buildEodReviewPrompt(eodSnapshot({ eod, brief, morning, nowISO: new Date(NOW).toISOString() }));
  assert.match(p, /"lessons":/);
  assert.match(p, /"howToSpot":"one sentence: what to put on a screen/);
  assert.match(p, /Give 3-5 lessons and 5-10 terms/);
  assert.match(p, /Gloss every term in four words/);
});

t('WHY is required to be a candidate with a discriminating test, never a fact', () => {
  const { eod, brief } = build();
  const p = buildEodReviewPrompt(eodSnapshot({ eod, brief, morning, nowISO: new Date(NOW).toISOString() }));
  assert.match(p, /WHY IS A CANDIDATE, NEVER A FACT/);
  assert.match(p, /On one session you cannot know why anything moved/);
  assert.match(p, /the test that would separate it from its rival/);
});

t('tomorrow is scheduled-only and the ban on direction is explicit', () => {
  const { eod, brief } = build();
  const p = buildEodReviewPrompt(eodSnapshot({ eod, brief, morning, nowISO: new Date(NOW).toISOString() }));
  assert.match(p, /NOTHING ABOUT TOMORROW'S DIRECTION/);
  assert.match(p, /priced-in claim tested null here/);
  assert.match(p, /widens the range, never which way it goes/);
  assert.match(p, /"tomorrow":"[^"]*NO direction/);
  assert.match(p, /INTO TOMORROW \(scheduled only\)/);
  assert.match(p, /AUD Employment Change 01:30/);
});

t('the number rules are stated twice, because a drifting figure is the worst failure', () => {
  const { eod, brief } = build();
  const p = buildEodReviewPrompt(eodSnapshot({ eod, brief, morning, nowISO: new Date(NOW).toISOString() }));
  assert.match(p, /Everything below is measured\. You have no other source/);
  assert.match(p, /Never round to a different value\. Never invent one/);
});

t('the stale-macro warning travels into the prompt as an instruction', () => {
  const { eod, brief } = build();
  const p = buildEodReviewPrompt(eodSnapshot({ eod, brief, morning, nowISO: new Date(NOW).toISOString() }));
  assert.match(p, /MACRO DATA FRESHNESS: the macro series last printed on 2026-09-22/);
  assert.match(p, /do NOT describe a rates, credit or volatility move as having happened today/);
});

t('the desk ban list is carried: no officials, no sizes, no calls to action', () => {
  const { eod, brief } = build();
  const p = buildEodReviewPrompt(eodSnapshot({ eod, brief, morning, nowISO: new Date(NOW).toISOString() }));
  assert.match(p, /No entries, stops, sizes, products or calls to action/);
  assert.match(p, /Never name a central-bank official/);
  assert.match(p, /A dull day honestly reported is worth more than a manufactured story/);
});

t('the desk evidence block is passed through so folklore cannot beat a measurement', () => {
  const { eod, brief } = build();
  const s = eodSnapshot({ eod, brief, morning, nowISO: new Date(NOW).toISOString() });
  const p = buildEodReviewPrompt(s, '  [null] crowding predicts a wider week -- tested, null');
  assert.match(p, /TESTED ON THIS DESK/);
  assert.match(p, /crowding predicts a wider week -- tested, null/);
  assert.match(p, /EVIDENCE FIRST/);
  assert.match(p, /Never assert something those lines mark null/);
  // and absent evidence is named rather than silently dropped
  assert.match(buildEodReviewPrompt(s), /not supplied/);
});

t('the prompt survives a thin day without producing "undefined"', () => {
  const bare = endOfDay({ morning: { plan: { at: AM, pairs: { GOLD: { price: 4362.35, expRange: null, lean: null } } } },
                          live: { GOLD: { session_open: 4362.35, current_price: 4362.35, ac: 'commodity' } } });
  const s = eodSnapshot({ eod: bare, brief: endOfDayBrief({ eod: bare, moved: [], nowMs: NOW }), morning: null, nowISO: new Date(NOW).toISOString() });
  const p = buildEodReviewPrompt(s);
  assert.doesNotMatch(p, /undefined|NaN|\[object Object\]/);
  assert.match(p, /nothing high-impact in the window/);
  assert.match(p, /no direction was committed on any instrument/);
});

// The plan is captured ~07:00 and the pane is readable three hours later, so a review
// can be written at lunchtime. That is fine; calling it "end of day" is not.
t('the day is only over once New York has closed, in both halves of the year', () => {
  assert.equal(sessionWindow(Date.parse('2026-09-24T11:00:00Z')).final, false, 'midday UK, both open');
  assert.equal(sessionWindow(Date.parse('2026-09-24T17:39:00Z')).final, false, '18:39 UK — London shut, New York has 2h+ to run');
  assert.equal(sessionWindow(Date.parse('2026-09-24T20:30:00Z')).final, true, '21:30 UK in BST');
  assert.equal(sessionWindow(Date.parse('2026-01-15T21:30:00Z')).final, true, 'and in GMT, where the offset differs');
  assert.equal(sessionWindow(Date.parse('2026-01-15T20:30:00Z')).final, false, 'the same UK clock time is NOT closed in winter');
});

t('the three windows are named differently and say how long is left', () => {
  const mid = sessionWindow(Date.parse('2026-09-24T11:00:00Z'));
  assert.equal(mid.label, 'The day so far');
  assert.match(mid.note, /Both London and New York are still open/);
  assert.match(mid.note, /until the US close/);
  const late = sessionWindow(Date.parse('2026-09-24T17:39:00Z'));
  assert.equal(late.label, 'After the London close');
  assert.match(late.note, /interim read/);
  assert.ok(late.minsToUsClose > 0 && late.minsToUsClose < 180);
  const done = sessionWindow(Date.parse('2026-09-24T20:30:00Z'));
  assert.equal(done.label, 'End of day');
  assert.equal(done.minsToUsClose, 0);
  assert.match(done.note, /final read/);
});

// Writing an interim review as if it were the close is the same overstatement as a
// board header claiming one date for series with six days between their vintages.
t('an unfinished day is written as INTERIM, and the model is told so', () => {
  const { eod, brief } = build();
  const s = eodSnapshot({ eod, brief, morning, nowISO: '2026-09-24T17:39:00Z' });
  assert.equal(s.session.final, false);
  const p = buildEodReviewPrompt(s);
  assert.match(p, /INTERIM REVIEW/);
  assert.doesNotMatch(p, /END-OF-DAY REVIEW/);
  assert.match(p, /the day is NOT over/);
  assert.match(p, /say plainly near the top that the US session has not closed/);
  assert.match(p, /do not describe anything as final or as a close/);
});

console.log(`eodReview: ${n} groups, all passed`);
