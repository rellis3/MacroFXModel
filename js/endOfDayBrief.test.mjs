import assert from 'node:assert/strict';
import fs from 'node:fs';
import { macroFreshness, sessionsBetween, recordLine, weekFrame, weekFrameLine, positionRead, positionLine, dollarRead, riskRead, standouts, boardTradeVerdict, tomorrow, endOfDayBrief,
         SPINE, activityWord, pathWord, PATH_BANDS, describe, spineRead, regimeTurns, printedRead } from './endOfDayBrief.js';
import { endOfDay } from './endOfDay.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const NOW = Date.UTC(2026, 8, 23, 20, 30);

const row = (name, over = {}) => ({
  name, ac: 'fx', unit: 'pips', dp: 0, move: 0, movedPct: 0, used: 100, expected: 50,
  rangeVerdict: 'about right', lean: 'flat', leanRight: null, o5: 'NEUTRAL', ...over,
});

// ── the macro is not today's news ────────────────────────────────────────────
t('a lagged macro set is measured and named, never presented as today', () => {
  const f = macroFreshness([{ lastDate: '2026-09-21' }, { lastDate: '2026-09-18' }], NOW);
  assert.equal(f.lastDate, '2026-09-21', 'the NEWEST print across the set, not the oldest');
  assert.equal(f.staleDays, 2);
  assert.equal(f.sameDay, false);
  assert.match(f.note, /last printed on 2026-09-21, 2 sessions back/);
  assert.match(f.note, /nothing below claims a rates, credit or volatility move happened today/);
});

// THE BUG THIS CAUGHT, reported from the live page: every Monday the debrief opened
// "the macro series last printed on 2026-09-25, 3 sessions back". Friday to Monday is
// three CALENDAR days and ONE session. The lag was measured in days and reported in
// sessions, so the data looked three times staler than it was, in the first sentence,
// once a week.
t('a weekend is not three sessions', () => {
  assert.equal(sessionsBetween('2026-09-25', '2026-09-28'), 1, 'Friday to Monday is one session');
  assert.equal(sessionsBetween('2026-09-21', '2026-09-23'), 2, 'Monday to Wednesday is two');
  assert.equal(sessionsBetween('2026-09-25', '2026-09-26'), 0, 'Friday to Saturday is none');
  assert.equal(sessionsBetween('2026-09-18', '2026-09-28'), 6, 'across two weekends');
  const f = macroFreshness([{ lastDate: '2026-09-25' }], Date.UTC(2026, 8, 28, 20, 0));
  assert.equal(f.staleSessions, 1);
  assert.equal(f.staleDays, 3, 'the calendar figure is still available, just not what is said');
  assert.match(f.note, /1 session back/);
});

t('a one-session lag does not lead the debrief; two does', () => {
  // These series publish with a day's lag by design. Announcing the normal state of the
  // world before describing the day is what made the debrief read as an excuse.
  assert.equal(macroFreshness([{ lastDate: '2026-09-25' }], Date.UTC(2026, 8, 28, 20, 0)).material, false);
  assert.equal(macroFreshness([{ lastDate: '2026-09-24' }], Date.UTC(2026, 8, 28, 20, 0)).material, true);
  assert.equal(macroFreshness([], Date.UTC(2026, 8, 28, 20, 0)).material, true, 'a missing set always speaks up');
});

t('degenerate dates do not produce a negative or NaN session count', () => {
  assert.equal(sessionsBetween('2026-09-28', '2026-09-25'), 0, 'backwards is zero, never negative');
  assert.equal(sessionsBetween('nonsense', '2026-09-28'), 0);
  assert.equal(sessionsBetween(null, undefined), 0);
});

t('a same-day macro set says so, and an absent one refuses to describe rates at all', () => {
  const same = macroFreshness([{ lastDate: '2026-09-23' }], NOW);
  assert.equal(same.sameDay, true);
  assert.match(same.note, /current to today/);
  const none = macroFreshness([], NOW);
  assert.equal(none.lastDate, null);
  assert.match(none.note, /did not load/);
  assert.equal(macroFreshness(null, NOW).lastDate, null);
});

// ── the dollar, from the tape rather than a stale index ──────────────────────
t('the dollar is built by inverting every XXX/USD leg and taking every USD/XXX as it is', () => {
  const d = dollarRead([
    row('EURUSD', { movedPct: -0.50 }),   // euro down => dollar up
    row('GBPUSD', { movedPct: -0.30 }),
    row('USDJPY', { movedPct: +0.40 }),   // dollar up outright
    row('SPX500', { ac: 'index', movedPct: -1.2 }),  // not an FX leg
    row('EURGBP', { movedPct: +0.90 }),   // no dollar in it
  ]);
  assert.equal(d.n, 3, 'the index and the cross are both excluded');
  assert.equal(d.pct, 0.4, '(0.50 + 0.30 + 0.40) / 3');
  assert.equal(d.dir, 'stronger');
  assert.match(d.word, /clearly stronger/);
});

t('a dollar that barely moved is not dressed up as a move', () => {
  const d = dollarRead([row('EURUSD', { movedPct: -0.04 }), row('USDJPY', { movedPct: 0.02 })]);
  assert.equal(d.dir, 'flat');
  assert.equal(d.word, 'barely moved');
  const none = dollarRead([row('SPX500', { ac: 'index', movedPct: -1 })]);
  assert.equal(none.pct, null);
  assert.equal(none.n, 0);
  assert.equal(dollarRead(null).n, 0);
});

// ── risk is a shape, not a score ─────────────────────────────────────────────
t('equities and havens are kept apart, so a dollar day is not read as a fear day', () => {
  const off = riskRead([row('SPX500', { ac: 'index', movedPct: -1.1 }), row('USDJPY', { movedPct: -0.6 })]);
  assert.equal(off.shape, 'risk-off', 'stocks down, yen bid');
  assert.equal(off.agree, true);
  // the case that matters: stocks down AND the yen down. Not fear — the dollar.
  const dollarDay = riskRead([row('SPX500', { ac: 'index', movedPct: -1.1 }), row('USDJPY', { movedPct: +0.6 })]);
  assert.match(dollarDay.shape, /a dollar day rather than a fear day/);
  assert.equal(dollarDay.agree, false);
  const on = riskRead([row('NQ', { ac: 'index', movedPct: 1.4 }), row('USDJPY', { movedPct: 0.5 })]);
  assert.equal(on.shape, 'risk-on');
});

t('a board too small to read one says so instead of inventing a shape', () => {
  const r = riskRead([row('SPX500', { ac: 'index', movedPct: 0.02 }), row('USDJPY', { movedPct: -0.01 })]);
  assert.match(r.shape, /no clear risk shape/);
  assert.equal(r.agree, false);
  assert.equal(riskRead([]).equity, null);
  assert.equal(riskRead(null).gold, null);
});

t('there is no composite risk score anywhere in the output', () => {
  const r = riskRead([row('SPX500', { ac: 'index', movedPct: -1.1 }), row('USDJPY', { movedPct: -0.6 })]);
  assert.equal('score' in r, false, 'the weights in a blended risk number would be invented');
});

// ── standouts are ranked by the denominator the page published ───────────────
t('standouts rank by range USED, not by size of move', () => {
  const s = standouts([
    row('BTCUSD', { ac: 'crypto', movedPct: -5.2, used: 120 }),   // biggest move, ordinary day for it
    row('EURGBP', { movedPct: -0.2, used: 210 }),                 // tiny move, huge for this pair
    row('GBPUSD', { used: 45 }), row('EURJPY', { used: 30 }),
  ]);
  assert.deepEqual(s.over.map(r => r.name), ['EURGBP'], 'the 5% move is an ordinary day for bitcoin');
  assert.deepEqual(s.under.map(r => r.name), ['EURJPY', 'GBPUSD'], 'quietest first');
  assert.equal(standouts([row('X', { used: null })]).over.length, 0);
});

// ── the one part of the morning brief that can be marked ─────────────────────
t('the named trade of the day is scored, and only when it is a real call', () => {
  const rows = [row('AUDUSD', { move: -73, movedPct: -1.03, used: 251 })];
  const v = boardTradeVerdict({ pair: 'AUDUSD', direction: 'SHORT' }, rows);
  assert.equal(v.right, true, 'short, and it fell');
  assert.equal(boardTradeVerdict({ pair: 'AUDUSD', direction: 'LONG' }, rows).right, false);
  for (const bad of [null, {}, { pair: 'AUDUSD' }, { pair: 'AUDUSD', direction: 'FLAT' }, { pair: 'NOPE', direction: 'LONG' }])
    assert.equal(boardTradeVerdict(bad, rows), null, 'nothing is scored that was not a call');
});

// ── forward: an inventory, never a view ──────────────────────────────────────
t('the forward section counts standing calls and refuses to add one', () => {
  const ahead = [
    { date: '2026-09-23', n: 2, events: [] },  // today, already gone
    { date: '2026-09-24', n: 5, events: [{ event: 'Employment Change' }] },
    { date: '2026-09-25', n: 1, events: [{ event: 'BOE Gov Bailey Speaks' }] },
  ];
  const f = tomorrow({ ahead, rows: [row('A', { o5: 'BULLISH' }), row('B', { o5: 'BEARISH' }), row('C', { o5: 'NEUTRAL' })], nowMs: NOW });
  assert.equal(f.day.date, '2026-09-24', "today's group is dropped");
  assert.equal(f.nScheduled, 6);
  assert.deepEqual(f.standing, { up: 1, down: 1, none: 1 });
  assert.equal(tomorrow({}).day, null);
});

// ── the whole brief ──────────────────────────────────────────────────────────
const buildEod = (over = {}) => endOfDay({
  morning: { brief: { generatedAt: '2026-09-23T07:07:28.375Z', regime: 'MIXED', headline: 'x', watch: ['w1'], boardTrade: { pair: 'AUDUSD', direction: 'SHORT' } },
             plan: { at: '2026-09-23T07:00:00.000Z', pairs: {
    AUDUSD: { price: 0.711, expRange: 36, lean: 'down', o5: 'BEARISH' },
    EURUSD: { price: 1.145, expRange: 44, lean: null, o5: 'NEUTRAL' },
    SPX500: { price: 7778, expRange: 72, lean: null, o5: 'NEUTRAL' },
  } }, ...over },
  live: {
    AUDUSD: { session_open: 0.7114, current_price: 0.7041, ac: 'fx', sym: 'AUD_USD' },
    EURUSD: { session_open: 1.1447, current_price: 1.1385, ac: 'fx', sym: 'EUR_USD' },
    SPX500: { session_open: 7778, current_price: 7718, ac: 'index', sym: 'SPX500_USD' },
  },
  hl: { AUDUSD: { rangePct: 1.28 }, EURUSD: { rangePct: 0.69 }, SPX500: { rangePct: 1.07 } },
});

t('the brief leads with range, because range is what this desk has validated', () => {
  const b = endOfDayBrief({ morning: { brief: { boardTrade: { pair: 'AUDUSD', direction: 'SHORT' } } }, eod: buildEod(),
    moved: [{ lastDate: '2026-09-21' }], nowMs: NOW });
  assert.equal(b.ok, true);
  assert.match(b.headline, /wider day than the page forecast/);
  assert.match(b.headline, /median instrument used \d+%/);
  assert.equal(b.boardTrade.right, true);
  assert.match(b.paragraphs.join(' '), /SHORT AUDUSD/);
});

// This test used to require the caveat FIRST, which is what made the debrief open by
// explaining what it could not tell you. The caveat is not dropped -- it is demoted.
// THE BUG THIS CLOSES. This sentence read "the running record is 19 of 33" as literal
// text -- no interpolation, never updated. By the time it was questioned the real figure
// was 32 of 53. A self-score that never moves is worse than none, because it reads live.
// THE WEEK FRAME. `moved` has carried 1/5/20-day deltas the whole time and the brief
// spent only the freshness field off it. A day figure alone is a fact; the same figure
// against its own week is a read.
const MV = (key, unit, d1, d5, d20 = 0) => ({ key, label: key.toUpperCase(), unit, deltas: { 1: d1, 5: d5, 20: d20 }, lastDate: '2026-09-25' });

t('a day that continues its week is told apart from one that reverses it', () => {
  const ext = weekFrame([MV('us2y', 'bps', 2, 11), MV('us10y', 'bps', 7, 17), MV('dxy', '%', 0.2, 1.1)]);
  assert.equal(ext.shape, 'extended');
  assert.equal(ext.withWeek, 3);
  assert.match(weekFrameLine(ext), /went with the week/);
  assert.match(weekFrameLine(ext), /already partly priced/);

  const agn = weekFrame([MV('us2y', 'bps', -4, 11), MV('us10y', 'bps', -6, 17), MV('dxy', '%', -0.3, 1.1)]);
  assert.equal(agn.shape, 'against');
  assert.match(weekFrameLine(agn), /argued with the week/);
  assert.match(weekFrameLine(agn), /one session cannot tell you which/);
});

t('the week frame compares SIGNS, never averages across units', () => {
  // basis points and percent are not commensurable; averaging them would invent a number
  const w = weekFrame([MV('us2y', 'bps', 50, 90), MV('dxy', '%', 0.2, 0.4), MV('hy', 'bps', 3, 5)]);
  assert.equal(w.withWeek, 3);
  assert.ok(!('mean' in w) && !('avg' in w), 'no cross-unit average may exist');
});

t('a thin or flat set produces nothing rather than a confident line', () => {
  assert.equal(weekFrame([MV('us2y', 'bps', 1, 2)]), null, 'one series is not a week read');
  assert.equal(weekFrame([]), null);
  assert.equal(weekFrame(null), null);
  assert.equal(weekFrame([MV('a', 'bps', 0, 0), MV('b', 'bps', 0, 0), MV('c', 'bps', 0, 0)]), null, 'all quiet is no read');
  assert.equal(weekFrameLine(null), null);
});

t('only series where today is a real fraction of the week get named', () => {
  const w = weekFrame([MV('big', 'bps', 9, 10), MV('small', 'bps', 1, 40), MV('mid', 'bps', 3, 12)]);
  const named = w.notable.map(x => x.key);
  assert.ok(named.includes('big'), 'today was most of the week for this one');
  assert.ok(!named.includes('small'), 'a 1-in-40 day is not what moved the week');
});

// POSITIONING — the state the next session inherits, which the evening never mentioned.
t('only the ends of the positioning distribution are reported', () => {
  const p = positionRead({ USDJPY: { pct: 88, ageDays: 6 }, EURUSD: { pct: 17, ageDays: 6 }, GBPUSD: { pct: 52, ageDays: 6 } });
  assert.deepEqual(p.ends.map(e => e.pair), ['USDJPY', 'EURUSD'], 'mid-range is not news');
  assert.equal(p.ends[0].side, 'long');
  assert.equal(p.ends[1].side, 'short');
  assert.equal(p.ageDays, 6);
});

t('positioning is never allowed to become a direction', () => {
  const line = positionLine(positionRead({ USDJPY: { pct: 88, ageDays: 6 } }, [{ key: 'NQ', gex: -1e11, dte: 11 }]));
  assert.match(line, /FUEL and not a direction/);
  assert.match(line, /never which way price goes/);
  // and the walls carry their own verdict rather than the folk version
  assert.match(line, /walls are not magnets/);
  assert.match(line, /max pain is null/);
  assert.doesNotMatch(line, /\b(buy|sell|target|expect|will)\b/i);
});

t('the gamma SIGN is what is reported, never its size', () => {
  const p = positionRead(null, [{ key: 'NQ', gex: -1.2e11 }, { key: 'GOLD', gex: 2.9e6 }]);
  assert.deepEqual(p.gamma.map(g => g.sign), ['negative', 'positive']);
  const line = positionLine(p);
  // a raw GEX number means nothing to a reader and differs by five orders of magnitude
  // between instruments, so it must never reach the prose
  assert.doesNotMatch(line, /1\.2e|120000000000|2900000/);
});

t('nothing to say produces nothing', () => {
  assert.equal(positionRead(null, []), null);
  assert.equal(positionLine(null), null);
});

t('the running record is computed, never a number typed into a sentence', () => {
  // strip comments first: this test's own documentation quotes the bug, and a guard that
  // trips on the explanation of itself is a guard nobody keeps
  const src = fs.readFileSync(new URL('./endOfDayBrief.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /record is \d+ of \d+/, 'a hardcoded tally must never come back');
  assert.match(src, /\$\{rec\.hits\} of \$\{rec\.n\}/, 'the tally must be interpolated from the record');
  const line = recordLine({ n: 53, hits: 32, hitRate: 0.604, hitRateLo: 0.472, hitRateHi: 0.735, clearsCoinFlip: 'no' });
  assert.match(line, /32 of 53/);
  assert.match(line, /60%/);
});

t('the record carries its interval and whether it clears a coin flip', () => {
  // 60% on 53 calls SOUNDS like an edge; its interval runs 47-74%, which is to say it is
  // not yet distinguishable from chance, and the sentence has to say so.
  const weak = recordLine({ n: 53, hits: 32, hitRate: 0.604, hitRateLo: 0.472, hitRateHi: 0.735, clearsCoinFlip: 'no' });
  assert.match(weak, /interval 47–74%/);
  assert.match(weak, /does not clear a coin flip/);
  const strong = recordLine({ n: 200, hits: 130, hitRate: 0.65, hitRateLo: 0.58, hitRateHi: 0.71, clearsCoinFlip: 'yes' });
  assert.match(strong, /does clear a coin flip/);
});

t('an unloaded record says so rather than printing a figure', () => {
  for (const bad of [null, undefined, {}, { n: 0 }]) {
    const l = recordLine(bad);
    assert.match(l, /not loaded/);
    assert.doesNotMatch(l, /\d+ of \d+/, 'it must not invent a tally');
  }
});

t('the brief threads the record through to the sentence', () => {
  const b = endOfDayBrief({ eod: buildEod(), moved: [{ lastDate: '2026-09-25' }],
    leanRecord: { n: 53, hits: 32, hitRate: 0.604, hitRateLo: 0.472, hitRateHi: 0.735, clearsCoinFlip: 'no' },
    nowMs: Date.UTC(2026, 8, 28, 20, 30) });
  const joined = b.paragraphs.join(' ');
  assert.match(joined, /32 of 53/, 'the real record must reach the prose');
  assert.doesNotMatch(joined, /19 of 33/);
});

t('a material macro lag is still stated, but the day is described first', () => {
  const b = endOfDayBrief({ eod: buildEod(), moved: [{ lastDate: '2026-09-21' }], nowMs: NOW });
  const p = b.paragraphs[0];
  assert.match(p, /^The tape:/, 'the debrief opens on the session that just finished');
  assert.match(p, /last printed on 2026-09-21/, 'and the lag is never quietly dropped');
  assert.ok(p.indexOf('The tape') < p.indexOf('last printed'), 'the day comes before the caveat');
  assert.equal(b.freshness.sameDay, false);
  assert.equal(b.freshness.material, true, '2 sessions is material');
});

t('a one-session lag is not mentioned in the opening paragraph at all', () => {
  // Friday's print read on Monday: the normal state of the world, not news.
  const b = endOfDayBrief({ eod: buildEod(), moved: [{ lastDate: '2026-09-25' }], nowMs: Date.UTC(2026, 8, 28, 20, 30) });
  assert.match(b.paragraphs[0], /^The tape:/);
  assert.doesNotMatch(b.paragraphs[0], /last printed/, 'a routine lag must not crowd the day out');
  assert.equal(b.freshness.staleSessions, 1);
});

t('nothing in the brief forecasts tomorrow', () => {
  const b = endOfDayBrief({ eod: buildEod(), moved: [], ahead: [{ date: '2026-09-24', n: 2, events: [{ event: 'CPI' }] }], nowMs: NOW });
  const txt = JSON.stringify([b.headline, b.paragraphs, b.cards, b.caveat]);
  assert.doesNotMatch(txt, /\b(will (rise|fall|go)|expect .* to (rise|fall)|should (rise|fall|rally|drop)|tomorrow .* (higher|lower)|target|forecast that)\b/i);
  assert.match(b.caveat, /came back null/);
  assert.match(b.caveat, /range only/);
});

t('a day with no direction called is reported as the absence of a call, not a miss', () => {
  const b = endOfDayBrief({ eod: endOfDay({
    morning: { plan: { at: '2026-09-23T07:30:00.000Z', pairs: { EURUSD: { price: 1.145, expRange: 44, lean: null } } } },
    live: { EURUSD: { session_open: 1.1447, current_price: 1.1385, ac: 'fx', sym: 'EUR_USD' } },
  }), moved: [], nowMs: NOW });
  const txt = b.paragraphs.join(' ');
  assert.match(txt, /absence of a call rather than a miss/);
  assert.doesNotMatch(txt, /0 of 0/);
});

t('the four cards mirror the morning brief and none of them carries a score', () => {
  const b = endOfDayBrief({ eod: buildEod(), moved: [{ lastDate: '2026-09-21' }], nowMs: NOW });
  assert.deepEqual(b.cards.map(c => c.k), ['the dollar', 'risk mood', 'expectation vs reality', 'what changed underneath']);
  for (const c of b.cards) assert.ok(c.body.length > 30, `${c.k} says something`);
  assert.match(b.cards[0].body, /settles days late/, 'the dollar card says why it is not using DXY');
});

t('no morning plan means no brief, with a reason rather than an empty page', () => {
  const b = endOfDayBrief({ eod: { ok: false, reason: 'no morning snapshot for today yet' } });
  assert.equal(b.ok, false);
  assert.match(b.reason, /no morning snapshot/);
  assert.equal(endOfDayBrief({}).ok, false);
});

// The old version of this required NO brief at all off a late plan. That threw the day
// away with the scorecard. The day is now described; what must never happen is the late
// plan being narrated as though it were a morning call.
t('a late plan is described as a day, never narrated as a morning call', () => {
  const late = endOfDay({
    morning: { plan: { at: '2026-09-23T20:43:02.205Z', pairs: { EURUSD: { price: 1.145, expRange: 44, lean: 'down' } } } },
    live: { EURUSD: { session_open: 1.1447, current_price: 1.1385, ac: 'fx', sym: 'EUR_USD' } },
  });
  const b = endOfDayBrief({ eod: late, moved: [], nowMs: NOW });
  assert.notEqual(b.ok, false, 'a brief is produced');
  assert.match(b.headline, /No call was made this morning/);
  const joined = b.paragraphs.join(' ');
  assert.match(joined, /outside the 06:00-11:00 window/, 'and it says why nothing was marked');
  assert.match(joined, /not a scorecard/);
  // the guarantee: the late lean is not scored anywhere in the prose
  assert.doesNotMatch(joined, /On direction the page committed/);
  assert.doesNotMatch(joined, /the right way/);
});

t('a day with no plan at all still produces a brief', () => {
  const r = endOfDay({ morning: null, live: { EURUSD: { session_open: 1.1447, current_price: 1.1385, ac: 'fx', sym: 'EUR_USD' } } });
  const b = endOfDayBrief({ eod: r, moved: [], nowMs: NOW });
  assert.ok(b.headline, 'the evening is not silent just because the morning was');
  assert.match(b.paragraphs.join(' '), /no morning plan was captured/i);
});

// ── the spine: the markets described every day, whatever the board did ───────
t('activity is described as busy, never as traded size', () => {
  assert.equal(activityWord(1.8), 'far busier than usual');
  assert.equal(activityWord(1.25), 'busier than usual');
  assert.equal(activityWord(1.0), 'about as busy as usual');
  assert.equal(activityWord(0.7), 'quieter than usual');
  assert.equal(activityWord(0.3), 'far quieter than usual');
  assert.equal(activityWord(null), null);
  assert.equal(activityWord('x'), null);
});

// The first bands were guessed at 0.6/0.35/0.2 and "very winding" then fired on 20 of
// 30 instruments while "straight line" was unreachable. Intraday paths are inherently
// inefficient: the measured cross-section is p25 0.09, median 0.16, p75 0.23, max 0.51.
t('the path bands are quartiles of the measured distribution, not a guess', () => {
  assert.match(pathWord(0.51), /direct for an intraday path/, 'the straightest on the board');
  assert.match(pathWord(0.20), /the usual back-and-forth/);
  assert.match(pathWord(0.12), /^winding$/);
  assert.match(pathWord(0.02), /very winding/, 'the most wandering on the board');
  assert.equal(pathWord(null), null);
  // each word covers roughly a quarter, so none of them fires on most of the board
  const sample = [0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.14, 0.16, 0.18, 0.20, 0.24, 0.31, 0.38, 0.51];
  const counts = {};
  for (const v of sample) counts[pathWord(v)] = (counts[pathWord(v)] ?? 0) + 1;
  assert.equal(Object.keys(counts).length, 4, 'all four words are reachable');
  for (const [w, c] of Object.entries(counts))
    assert.ok(c <= sample.length * 0.5, `"${w}" fires on ${c} of ${sample.length} — a label on half the board says nothing`);
});

t('the bands carry when and on what they were measured', () => {
  assert.equal(PATH_BANDS.n, 30);
  assert.ok(PATH_BANDS.direct > PATH_BANDS.usual && PATH_BANDS.usual > PATH_BANDS.winding);
  assert.match(PATH_BANDS.measuredOn, /^\d{4}-\d{2}-\d{2}$/);
});

t('a described market carries the numbers and their caveats, and never a reason', () => {
  const d = describe('GOLD', {
    row: { name: 'GOLD', move: -78, dp: 0, unit: '$', movedPct: -1.79, used: 114, regimeNow: 'RANGE', volPctNow: 33 },
    session: { vol_state: { path_efficiency: { efficiency: 0.22 } } },
    activity: { ratio: 0.82 },
    morning: { regime: 'RANGE', volPct: 31 },
  });
  assert.match(d.line, /Gold finished down 78 \$/);
  assert.match(d.line, /114% of the range forecast/);
  assert.match(d.line, /the usual back-and-forth/);
  assert.match(d.line, /0\.82× its 20-session median/);
  assert.match(d.line, /activity proxy, not traded size/);
  assert.match(d.regime, /Still RANGE/);
  assert.ok(d.role.length > 40, 'the role is what makes the number teachable');
  // the thing it must never do on one session
  assert.doesNotMatch(JSON.stringify(d), /(because|driven by|on the back of|due to)/i);
});

t('a regime that turned is said plainly; one that did not is not dressed up', () => {
  const turned = describe('NQ', { row: { name: 'NQ', move: 120, dp: 0, unit: 'pts', movedPct: 0.4, used: 90, regimeNow: 'TREND' }, morning: { regime: 'RANGE' } });
  assert.match(turned.regime, /called it RANGE this morning and now reads TREND/);
  assert.match(turned.regime, /turned under the position/);
  // a plan captured before the field existed must read as silence, not as "unchanged"
  const older = describe('NQ', { row: { name: 'NQ', move: 120, dp: 0, unit: 'pts', movedPct: 0.4, used: 90, regimeNow: 'TREND' }, morning: {} });
  assert.equal(older.regime, null);
  assert.equal(describe('NQ', { row: null }), null);
});

t('the spine is covered every day, and a wild outsider is appended not promoted', () => {
  const rows = [
    { name: 'GOLD', move: -78, dp: 0, unit: '$', movedPct: -1.8, used: 114 },
    { name: 'NQ', move: -300, dp: 0, unit: 'pts', movedPct: -1.0, used: 95 },
    { name: 'AUDCAD', move: -79, dp: 0, unit: 'pips', movedPct: -1.1, used: 245 },
    { name: 'EURCHF', move: 3, dp: 0, unit: 'pips', movedPct: 0.03, used: 20 },
  ];
  const r = spineRead({ rows });
  assert.deepEqual(r.spine.map(x => x.name), ['GOLD', 'NQ'], 'only the spine members present are described');
  assert.deepEqual(r.extra.map(x => x.name), ['AUDCAD'], 'the 245% cross earns a line');
  assert.equal(r.extra.some(x => x.name === 'EURCHF'), false, 'a 20% day is not news');
  assert.ok(SPINE.some(s => s.name === 'USDJPY') && SPINE.some(s => s.name === 'BTCUSD'));
  for (const s of SPINE) assert.ok(s.role.length > 40, `${s.name} says what it IS`);
});

t('regime turns across the board are counted, and silent when the plan has no regime', () => {
  const rows = [{ name: 'A', regimeNow: 'TREND' }, { name: 'B', regimeNow: 'RANGE' }, { name: 'C', regimeNow: 'RANGE' }];
  assert.deepEqual(regimeTurns(rows, { A: { regime: 'RANGE' }, B: { regime: 'RANGE' } }), [{ name: 'A', from: 'RANGE', to: 'TREND' }]);
  assert.deepEqual(regimeTurns(rows, {}), [], 'a plan with no regime field claims nothing');
  assert.deepEqual(regimeTurns(null, {}), []);
});

t('a print is described by its gap, with the units caveat, and never as good or bad', () => {
  const w = printedRead({ rows: [
    { country: 'United Kingdom', event: 'CBI Industrial Trends Orders', surprise: 24, raw: { consensus: '-33' } },
    { country: 'United States', event: 'Richmond Manufacturing Index', surprise: -4, raw: { consensus: '2' } },
    { country: 'X', event: 'Unscored', surprise: null },
  ], n: 3 });
  assert.match(w, /24 above the -33 expected/);
  assert.match(w, /4 below the 2 expected/);
  assert.doesNotMatch(w, /(beat|missed|better|worse|strong|weak)/i);
  assert.equal(printedRead({ rows: [] }), null);
  assert.equal(printedRead(null), null);
});

t('the brief carries the spine, and still never explains a move', () => {
  const b = endOfDayBrief({ eod: buildEod(), moved: [], nowMs: NOW,
    sessions: { SPX500: { vol_state: { path_efficiency: { efficiency: 0.3 } } } },
    activity: { SPX500: { ratio: 1.4 } } });
  assert.ok(b.named.length >= 1, 'the spine is described whatever the board did');
  const spx = b.named.find(x => x.name === 'SPX500');
  assert.match(spx.line, /the S&P finished down/);
  assert.match(spx.line, /1\.4× its 20-session median/);
  assert.doesNotMatch(JSON.stringify([b.named, b.alsoMoved]), /(because|driven by|on the back of)/i);
});

t('percentiles are ordered properly, including the 11-13 trap', () => {
  const at = p => describe('GOLD', { row: { name: 'GOLD', move: 1, dp: 0, unit: '$', movedPct: 0, used: 100, volPctNow: p } }).vol;
  assert.match(at(1),  /the 1st percentile/);
  assert.match(at(2),  /the 2nd percentile/);
  assert.match(at(3),  /the 3rd percentile/);
  assert.match(at(11), /the 11th percentile/);
  assert.match(at(12), /the 12th percentile/);
  assert.match(at(13), /the 13th percentile/);
  assert.match(at(21), /the 21st percentile/);
  assert.match(at(33), /the 33rd percentile/);
  assert.match(at(85), /the 85th percentile/);
  for (const p of [1, 2, 3, 11, 21, 33, 85]) assert.doesNotMatch(at(p), /NaN|undefined/);
});

t('a moved volatility percentile says where it came from', () => {
  const d = describe('GOLD', { row: { name: 'GOLD', move: 1, dp: 0, unit: '$', movedPct: 0, used: 100, volPctNow: 62 }, morning: { volPct: 33 } });
  assert.match(d.vol, /the 62nd percentile of its history, from the 33rd this morning/);
  // a small drift is not a story, so it is not told
  const quiet = describe('GOLD', { row: { name: 'GOLD', move: 1, dp: 0, unit: '$', movedPct: 0, used: 100, volPctNow: 36 }, morning: { volPct: 33 } });
  assert.doesNotMatch(quiet.vol, /this morning/);
});

console.log(`endOfDayBrief: ${n} groups, all passed`);
