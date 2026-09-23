import assert from 'node:assert/strict';
import { scorePair, endOfDay, pairReview, plannedInWindow, PLAN_WINDOW_UTC } from './endOfDay.js';

const AM = '2026-09-23T07:30:00.000Z';   // inside the capture window
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

const morning = (over = {}) => ({ price: 4362.35, lean: 'flat', expRange: 97, o5: 'BEARISH', o5c: 59, o20: 'BEARISH', o20c: 51, ...over });
const live = (over = {}) => ({ session_open: 4362.35, current_price: 4285.39, ...over });

t('a pair is scored on the range it published, in its own unit', () => {
  const r = scorePair('GOLD', morning(), live(), { high: 4370, low: 4280 });
  assert.equal(r.unit, '$');
  assert.equal(r.expected, 97);
  assert.equal(r.realised, 90);
  assert.equal(r.used, 93);
  assert.equal(r.rangeVerdict, 'about right');
  assert.equal(r.rangeFrom, 'high-low');
});

t('without a high and low it falls back to open-to-now AND says so', () => {
  const r = scorePair('GOLD', morning(), live());
  assert.equal(r.rangeFrom, 'open-to-now');
  assert.equal(r.realised, 77, 'gold is carried to whole dollars, so 76.96 rounds to 77');
  assert.ok(r.used < 93, 'and open-to-now understates a day that travelled and came back');
});

t('pips are pips: FX scores in its own unit, not in price', () => {
  const r = scorePair('EURUSD', morning({ price: 1.1465, expRange: 47 }),
    { session_open: 1.1465, current_price: 1.1447, sym: 'EUR_USD', ac: 'fx' }, { high: 1.1478, low: 1.1440 });
  assert.equal(r.unit, 'pips');
  assert.equal(r.realised, 38);
  assert.equal(r.move, -18);
  assert.equal(r.expected, 47);
});

// The pip size comes from the live row, not a name table, so a pair the page adds
// later scores the day it appears instead of reporting a 38-pip day as 0.0038.
t('the pip size follows the page rule, including pairs no table lists', () => {
  const fx = (o, c, over = {}) => ({ session_open: o, current_price: c, ac: 'fx', ...over });
  assert.equal(scorePair('EURJPY', morning({ price: 171.2, expRange: 90 }),
    fx(171.20, 171.85, { sym: 'EUR_JPY' })).move, 65, 'a JPY cross is 0.01 a pip');
  assert.equal(scorePair('EURGBP', morning({ price: 0.86, expRange: 40 }),
    fx(0.8600, 0.8618, { sym: 'EUR_GBP' })).move, 18, 'a non-USD cross is still 0.0001');
  const idx = scorePair('JP225', morning({ price: 41000, expRange: 500 }),
    { session_open: 41000, current_price: 41230, sym: 'JP225_USD', ac: 'index' });
  assert.equal(idx.move, 230, 'an index with JPY nowhere near its name stays in points');
  assert.equal(idx.unit, 'pts');
  // and with no metadata at all it falls back on the name, never on price units
  assert.equal(scorePair('GBPUSD', morning({ price: 1.3, expRange: 60 }),
    { session_open: 1.3000, current_price: 1.3025 }).move, 25);
});

// The page carries the session H-L as a percent of price, not as a high and a low.
t('a realised range given as a percent is used before falling back to open-to-now', () => {
  const r = scorePair('GOLD', morning({ expRange: 97 }), live(), { rangePct: 2.0 });
  assert.equal(r.rangeFrom, 'range-pct');
  assert.equal(r.realised, 87, '2.0% of a 4362.35 open is 87 dollars');
  const both = scorePair('GOLD', morning(), live(), { high: 4370, low: 4280, rangePct: 2.0 });
  assert.equal(both.rangeFrom, 'high-low', 'an actual high and low beats the percent');
  for (const bad of [0, -1, null, NaN]) {
    assert.equal(scorePair('GOLD', morning(), live(), { rangePct: bad }).rangeFrom, 'open-to-now',
      'a zero or missing percent is not a range');
  }
});

// A board measured open-to-now understates every pair that travelled and came back,
// which is the day worth knowing about — so the count is reported, not hidden.
t('the board counts how many rows are on the weak measure', () => {
  const r = endOfDay({
    morning: { plan: { at: AM, pairs: { GOLD: morning(), NQ: morning({ price: 30785, expRange: 432 }) } } },
    live: { GOLD: live(), NQ: { session_open: 30785, current_price: 30751 } },
    hl: { GOLD: { high: 4370, low: 4280 } },
  });
  assert.equal(r.range.weak, 1, 'NQ had no range supplied; gold did');
});

t('"flat" is the absence of a call, not a wrong one', () => {
  const flat = scorePair('GOLD', morning({ lean: 'flat' }), live());
  assert.equal(flat.leanRight, null);
  assert.equal(flat.lean, 'flat');
  const right = scorePair('GOLD', morning({ lean: 'down' }), live());
  assert.equal(right.leanRight, true, 'price fell and the page said down');
  const wrong = scorePair('GOLD', morning({ lean: 'up' }), live());
  assert.equal(wrong.leanRight, false);
});

t('the tally counts only pairs the page committed on, and shows the denominator', () => {
  const r = endOfDay({
    morning: { plan: { at: AM, pairs: {
      GOLD: morning({ lean: 'down' }),
      NQ: morning({ price: 30785, expRange: 432, lean: 'up' }),
      SPX500: morning({ price: 7778, expRange: 75, lean: 'flat' }),
    } } },
    live: { GOLD: live(), NQ: { session_open: 30785, current_price: 30751 }, SPX500: { session_open: 7778, current_price: 7790 } },
  });
  assert.equal(r.ok, true);
  assert.equal(r.leans.n, 2, 'the flat pair is not counted either way');
  assert.equal(r.leans.right, 1, 'gold down was right, NQ up was not');
  assert.equal(r.rows.length, 3);
});

t('range verdicts band honestly: quiet, about right, missed', () => {
  const mk = (exp, hi, lo) => scorePair('GOLD', morning({ expRange: exp }), live(), { high: hi, low: lo });
  assert.equal(mk(100, 4400, 4250).rangeVerdict, 'over');        // 150%
  assert.equal(mk(100, 4360, 4280).rangeVerdict, 'about right'); //  80%
  assert.equal(mk(100, 4340, 4300).rangeVerdict, 'under');       //  40%
});

t('chain links that CHANGED state between morning and now are reported', () => {
  const r = endOfDay({
    morning: { plan: { at: AM, pairs: { GOLD: morning() } }, },
    live: { GOLD: live() },
    chainAM: [{ id: 'oil-bei', broken: false }, { id: 'tips-gold', broken: true }, { id: 'hy-spx', broken: true }],
    chainPM: [{ id: 'oil-bei', broken: true }, { id: 'tips-gold', broken: false }, { id: 'hy-spx', broken: true }],
  });
  assert.deepEqual(r.chain.broke, ['oil-bei']);
  assert.deepEqual(r.chain.healed, ['tips-gold']);
  assert.deepEqual(r.chain.stillBroken, ['hy-spx']);
});

t('the caveat is always present and never claims a day proves anything', () => {
  const r = endOfDay({ morning: { plan: { at: AM, pairs: { GOLD: morning({ lean: 'down' }) } } }, live: { GOLD: live() } });
  assert.match(r.caveat, /One day settles nothing/);
  assert.match(r.caveat, /has not yet beaten a coin flip/);
  assert.doesNotMatch(JSON.stringify(r), /\b(will|expect .* to|tomorrow)\b/i);
});

t('no morning snapshot says so rather than inventing a comparison', () => {
  for (const bad of [null, {}, { plan: null }, { plan: { at: AM, pairs: {} } }]) {
    const r = endOfDay({ morning: bad, live: {} });
    assert.equal(r.ok, false);
    assert.ok(r.reason.length > 10);
  }
  assert.equal(scorePair('GOLD', null, live()), null);
  assert.equal(scorePair('GOLD', morning(), null), null);
  assert.equal(scorePair('GOLD', morning(), { session_open: null, current_price: null }), null);
});

// ── the per-pair look-back ───────────────────────────────────────────────────
t('a level with a high and low is a fact; without one it is only where price finished', () => {
  const m = morning({ lean: 'down', wrongAt: 4400, aim: { target: 4280, side: 'below', lift: 1.4 } });
  const sure = pairReview('GOLD', m, live(), { high: 4370, low: 4275 });
  assert.equal(sure.aim.hit, true);
  assert.equal(sure.aim.certain, true);
  assert.match(sure.aim.how, /traded there/);
  assert.equal(sure.wrongAt.hit, false, '4400 never traded');
  const guess = pairReview('GOLD', m, live());
  assert.equal(guess.aim.certain, false);
  assert.match(guess.aim.how, /finished the far side/);
});

t('the falsifier is tested on the side the lean makes it wrong', () => {
  const up = pairReview('GOLD', morning({ lean: 'up', wrongAt: 4300 }), live(), { high: 4370, low: 4275 });
  assert.equal(up.wrongAt.side, 'below');
  assert.equal(up.wrongAt.hit, true, 'a long is wrong BELOW its falsifier, and 4275 traded');
  const dn = pairReview('GOLD', morning({ lean: 'down', wrongAt: 4300 }), live(), { high: 4370, low: 4275 });
  assert.equal(dn.wrongAt.side, 'above');
  assert.equal(dn.wrongAt.hit, true, 'a short is wrong ABOVE it, and 4370 traded');
});

t('the three ways a lean can be judged are kept apart, including when they disagree', () => {
  const hl = { high: 4420, low: 4275 };
  // right by the close, but the level that would have stopped it traded first
  const messy = pairReview('GOLD', morning({ lean: 'down', wrongAt: 4400, aim: null }), live(), hl);
  assert.match(messy.verdict, /falsifier traded during the day/);
  // right, and the aim paid
  const paid = pairReview('GOLD', morning({ lean: 'down', wrongAt: 4500, aim: { target: 4280, side: 'below' } }), live(), hl);
  assert.equal(paid.verdict, 'right, and it paid');
  assert.equal(paid.unordered, false);
  // A day that traded BOTH levels cannot be graded from a high and a low, and the
  // verdict refuses rather than ranking the aim first — which would flatter every
  // such day and turn the look-back into a backtest that always wins.
  const messy2 = pairReview('GOLD', morning({ lean: 'down', wrongAt: 4400, aim: { target: 4280, side: 'below' } }), live(), hl);
  assert.equal(messy2.unordered, true);
  assert.match(messy2.verdict, /cannot say which came first/);
  assert.doesNotMatch(messy2.verdict, /paid/);
  // wrong, and nothing warned
  const quiet = pairReview('GOLD', morning({ lean: 'up', wrongAt: 4100 }), live(), hl);
  assert.match(quiet.verdict, /never triggered/);
  assert.equal(pairReview('GOLD', morning(), live(), hl).verdict, 'no call');
});

t('a 5- or 20-session outlook is carried, never graded on day one', () => {
  const r = pairReview('GOLD', morning({ o5: 'BEARISH', o5c: 59, o20: 'NEUTRAL', o20c: 51 }), live());
  assert.equal(r.standing.length, 1, 'NEUTRAL is not a standing call');
  assert.equal(r.standing[0].bias, 'BEARISH');
  assert.equal('right' in r.standing[0], false, 'no verdict on an unfinished horizon');
  assert.doesNotMatch(JSON.stringify(r.standing), /wrong|right|hit/i);
});

t('a pair with no morning row reviews as nothing, not as a blank verdict', () => {
  assert.equal(pairReview('GOLD', null, live()), null);
  const bare = pairReview('GOLD', morning({ wrongAt: null, aim: null }), live());
  assert.equal(bare.wrongAt, null);
  assert.equal(bare.aim, null);
});

t('the board counts the commitments separately from the closing tally', () => {
  const r = endOfDay({
    morning: { plan: { at: AM, pairs: {
      GOLD: morning({ lean: 'down', wrongAt: 4400, aim: { target: 4280, side: 'below' } }),
      NQ:   morning({ price: 30785, expRange: 432, lean: 'up', wrongAt: 30600 }),
      SPX500: morning({ price: 7778, expRange: 75 }),
    } } },
    live: { GOLD: live(), NQ: { session_open: 30785, current_price: 30751 }, SPX500: { session_open: 7778, current_price: 7790 } },
    hl: { GOLD: { high: 4420, low: 4275 } },
  });
  assert.equal(r.commitments.nFalsifiers, 2, 'SPX named no falsifier');
  assert.equal(r.commitments.falsified, 1, 'gold traded 4420 above its 4400');
  assert.equal(r.commitments.nAims, 1);
  assert.equal(r.commitments.aimsPaid, 1);
  assert.equal(r.commitments.certain, 1, 'only gold had a high and low to judge on');
  // and the closing tally still disagrees with the falsifier, which is the point
  assert.equal(r.leans.n, 2);
  assert.match(r.rows.find(x => x.name === 'GOLD').verdict, /cannot say which came first/);
});

// A plan captured in the evening is not a morning plan, whatever the row calls it.
// Seen live: a tab opened at 21:43 wrote the day's record, which then scored 20 leans
// right out of 20 — for the obvious reason.
t('a plan captured outside the morning window is refused, not scored', () => {
  assert.equal(plannedInWindow(AM), true);
  assert.equal(plannedInWindow('2026-09-23T05:59:00.000Z'), false, 'before the window');
  assert.equal(plannedInWindow('2026-09-23T11:00:00.000Z'), false, 'the end is exclusive');
  assert.equal(plannedInWindow('2026-09-23T20:43:02.205Z'), false, 'the evening post that started this');
  assert.equal(plannedInWindow('2026-09-23T00:15:57.118Z'), false, 'the midnight post that started this');
  assert.equal(plannedInWindow(null), false);
  assert.equal(plannedInWindow('not a date'), false);
  assert.ok(PLAN_WINDOW_UTC.from < PLAN_WINDOW_UTC.to);

  const late = endOfDay({
    morning: { plan: { at: '2026-09-23T20:43:02.205Z', pairs: { GOLD: morning({ lean: 'down' }) } } },
    live: { GOLD: live() },
  });
  assert.equal(late.ok, false);
  assert.equal(late.outOfWindow, true);
  assert.match(late.reason, /20:43 UTC, outside the 06:00-11:00 window/);
  assert.match(late.reason, /nothing here to mark/);
  assert.equal('leans' in late, false, 'a refused day publishes no tally at all');

  const undated = endOfDay({ morning: { plan: { pairs: { GOLD: morning() } } }, live: { GOLD: live() } });
  assert.equal(undated.ok, false);
  assert.match(undated.reason, /no timestamp/);
});

// The move is counted in pips, so its `dp` is 0 — using that for the PRICE rounded
// every FX pair to two decimals and printed "EURUSD opened 1.14, now 1.14".
t("price precision is the instrument's, not the move's", () => {
  const eur = scorePair('EURUSD', morning({ price: 1.1465, expRange: 47 }),
    { session_open: 1.14653, current_price: 1.13847, ac: 'fx', sym: 'EUR_USD', dp: 5 });
  assert.equal(eur.open, 1.14653);
  assert.equal(eur.now, 1.13847);
  assert.equal(eur.move, -81, 'the move is still whole pips');
  // no dp from the feed: the convention, not two decimals
  const noDp = scorePair('GBPUSD', morning({ price: 1.3, expRange: 60 }),
    { session_open: 1.32416, current_price: 1.32109, ac: 'fx', sym: 'GBP_USD' });
  assert.equal(noDp.open, 1.32416);
  const jpy = scorePair('USDJPY', morning({ price: 157, expRange: 90 }),
    { session_open: 157.392, current_price: 158.211, ac: 'fx', sym: 'USD_JPY' });
  assert.equal(jpy.open, 157.392, 'a JPY pair carries three, not five');
  const gold = scorePair('GOLD', morning(), live());
  assert.equal(gold.open, 4362.35);
});

console.log(`endOfDay: ${n} groups, all passed`);
