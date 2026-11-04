// Tests for js/thesisReality.js.   node --test js/thesisReality.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { thesisReality, cardPath, invalidationLevel, rankCorr, rangeCheck, compactDay, upsertDay, tally, briefFeed, toneDir } from './thesisReality.js';
import { windowFor } from './deskScore.js';

const date = '2026-11-04', win = windowFor(date);   // 08:00 London = 08:00Z in November
const bar = (min, o, h, l, c) => ({ time: Math.floor((win.entryMs + min * 60_000) / 1000), open: o, high: h, low: l, close: c });
const L = (open, u50, u75, d50, d75) => ({ open, up: { p50: u50, p75: u75, p90: u75 + 0.001 }, down: { p50: d50, p75: d75, p90: d75 - 0.001 } });

const run = {
  date, finishedAt: `${date}T07:10:00Z`,
  head: { ok: true, book: { headline: 'Dollar up, risk off', global: { tone: 'risk_off' }, risks: ['NFP Friday'],
    instruments: {
      EURUSD: { rating: 'SHORT', conviction: 'high', size: 0.5, levels: L(1.1000, 1.1030, 1.1050, 1.0970, 1.0950), plan: { invalidation: 'Close above 1.1040' } },
      GOLD: { rating: 'STRONG_LONG', conviction: 'high', size: 0.3, levels: L(4000, 4030, 4050, 3970, 3950), plan: { invalidation: 'below 3,960 on a close' } },
      NQ: { rating: 'SHORT', conviction: 'low', size: 0.2, levels: L(20000, 20100, 20200, 19900, 19800), invalidation: 'no level named' },
      USDJPY: { rating: 'LONG', conviction: 'medium', size: 0, levels: L(150, 150.5, 151, 149.5, 149) },
      UK100: { rating: 'FLAT', conviction: 'low', size: 0 },
    } } },
  debate: { global: { view: { tone: 'risk_off', conviction: 'low' } },
    currency: { view: { ranking: ['USD', 'JPY', 'CHF', 'CAD', 'GBP', 'NZD', 'EUR', 'AUD'], currencies: { USD: { bias: 2 }, JPY: { bias: 1 }, CHF: { bias: 1 }, CAD: { bias: 0 }, GBP: { bias: 0 }, NZD: { bias: -1 }, EUR: { bias: -1 }, AUD: { bias: null } } } } },
};

test('toneDir and invalidationLevel', () => {
  assert.equal(toneDir('risk_off'), -1); assert.equal(toneDir('risk_on'), 1); assert.equal(toneDir('mixed'), 0);
  assert.equal(invalidationLevel('Close above 1.1040', 1.1, -1), 1.104);
  assert.equal(invalidationLevel('Reclaim above 1.1250 cluster or close above 1.12632 Asia high', 1.1207, -1), 1.125, 'the nearest adverse level');
  assert.equal(invalidationLevel('below 3,960 on a close', 4000, 1), 3960, 'thousands separators');
  assert.equal(invalidationLevel('a close above 1.0900', 1.1, -1), null, 'a level on the favourable side is not an invalidation');
  assert.equal(invalidationLevel('if the 4h trend turns', 1.1, -1), null); assert.equal(invalidationLevel(null, 1.1, 1), null);
});

test('cardPath: first touches of the invalidation and the p50/p75 lines inside the window', () => {
  const bars = [bar(-5, 1.1, 1.2, 1.0, 1.1), bar(0, 1.1000, 1.1010, 1.0990, 1.1005), bar(30, 1.1005, 1.1045, 1.1000, 1.1040), bar(60, 1.1040, 1.1040, 1.0960, 1.0965), bar(800, 1.0965, 1.0965, 1.0940, 1.0945)];
  const p = cardPath(run.head.book.instruments.EURUSD, bars, win);
  assert.equal(p.entry, 1.1); assert.equal(p.exit, 1.0965, 'the 21:20 bar is outside the window');
  assert.equal(p.levels.invalid, 1.104); assert.equal(p.touched.invalid, win.entryMs + 30 * 60_000);
  assert.equal(p.touched.p50, win.entryMs + 60 * 60_000); assert.equal(p.touched.p75, null, '1.0950 was not traded before 21:00');
  assert.equal(cardPath(run.head.book.instruments.UK100, bars, win), null, 'flat cards have no path');
});

test('rankCorr and rangeCheck', () => {
  assert.equal(rankCorr(['A', 'B', 'C', 'D'], ['A', 'B', 'C', 'D']), 1); assert.equal(rankCorr(['A', 'B', 'C', 'D'], ['D', 'C', 'B', 'A']), -1); assert.equal(rankCorr(['A', 'B'], ['A', 'B']), null);
  const r = rangeCheck({ EURUSD: { p50: 0.5, p75: 0.7, hl: 0.8 }, GOLD: { p50: 1, p75: 1.4, hl: 0.6 }, BAD: { p50: null, p75: 1, hl: 1 } });
  assert.equal(r.n, 2); assert.equal(r.over50, 0.5); assert.equal(r.over75, 0.5); assert.equal(r.rows[0].inst, 'EURUSD');
});

test('thesisReality: each claim against the day, a missing bias is no data, the morning is not touched', () => {
  const before = JSON.stringify(run);
  const moves = { EURUSD: -1.2, GBPUSD: -0.5, USDJPY: 0.8, AUDUSD: -0.9, NZDUSD: -0.4, USDCAD: 0.3, USDCHF: 0.6, EURJPY: -1.5, GOLD: -0.5, NQ: -0.8, SPX500: -0.6, US30: -0.3 };
  const score = { eligible: true, S: 0.3, cards: { EURUSD: { dir: -1, R: 1.2, size: 0.5 } } };
  const paths = { EURUSD: cardPath(run.head.book.instruments.EURUSD, [bar(0, 1.1, 1.1045, 1.0999, 1.1), bar(60, 1.1, 1.1, 1.096, 1.0965)], win) };
  const d = thesisReality({ run, moves, score, paths, vol: { EURUSD: { p50: 0.5, p75: 0.7, hl: 0.6 } }, events: [{ event: 'ADP', country: 'US', at: `${date}T13:15:00Z`, estimate: '67K', actual: '80K' }] });
  assert.equal(JSON.stringify(run), before, 'the morning run is read only');
  assert.equal(d.regime.verdict, 'right', 'risk-off and the risk basket fell'); assert.ok(d.regime.realised < 0);
  assert.equal(d.currencies.strongest.ccy, 'USD'); assert.equal(d.currencies.strongest.verdict, 'right'); assert.equal(d.currencies.strongest.realisedRank, 1);
  assert.equal(d.currencies.weakest.ccy, 'AUD');
  assert.equal(d.currencies.biases.AUD, null, 'a missing bias stays null');
  assert.equal(d.currencies.perCcy.find(c => c.ccy === 'AUD').verdict, 'no data');
  assert.equal(d.currencies.perCcy.find(c => c.ccy === 'CAD').verdict, 'no call', 'a 0 bias is no call');
  assert.ok(d.currencies.rankCorr > 0);
  assert.deepEqual(d.cards.map(c => c.inst), ['EURUSD', 'GOLD', 'NQ'], 'sized directional cards only, by size');
  const eu = d.cards[0];
  assert.equal(eu.R, 1.2, 'the score\'s own R'); assert.equal(eu.sizeR, 0.6); assert.equal(eu.verdict, 'right'); assert.equal(eu.grade, 'A');
  assert.equal(eu.invalidation.touched, true); assert.equal(eu.p50.reached, true); assert.equal(eu.first, 'invalidation');
  const gold = d.cards[1]; assert.equal(gold.R, -0.5); assert.equal(gold.verdict, 'wrong'); assert.equal(gold.invalidation.touched, null, 'no path: unknown, not "not touched"');
  assert.equal(d.cardSummary.right, 2); assert.equal(d.cardSummary.wrong, 1); assert.equal(d.cardSummary.hitRate, 0.667);
  assert.equal(d.cardSummary.byGrade['A+'].wrong, 1);
  assert.equal(d.range.n, 1); assert.equal(d.events[0].surprise, 1); assert.equal(d.counts, true);
});

test('thesisReality with nothing realised: no data everywhere, never a made-up verdict', () => {
  const d = thesisReality({ run, moves: {} });
  assert.equal(d.regime.verdict, 'no data'); assert.equal(d.currencies.strongest.verdict, 'no data'); assert.equal(d.currencies.rankCorr, null);
  assert.ok(d.cards.every(c => c.verdict === 'no data')); assert.equal(d.cardSummary.hitRate, null); assert.equal(d.range, null);
});

test('the tally over days, and the Desk Pack brief', () => {
  const mk = (date, strongest, weakest, right, wrong) => ({ date, counts: true, regime: 'right', strongest, weakest, rankCorr: 0.5, ccyRight: 4, ccyWrong: 2,
    cards: { n: right + wrong, right, wrong, byGrade: { A: { n: right + wrong, right, wrong, push: 0 } }, withPath: 2, invalidTouched: 1, p50Reached: 1, p75Reached: 0 }, range: { n: 10, over50: 0.6, over75: 0.2 } });
  let days = upsertDay([], mk('2026-11-04', 'right', 'wrong', 3, 1));
  days = upsertDay(days, mk('2026-11-03', 'wrong', 'wrong', 1, 1));
  days = upsertDay(days, mk('2026-11-04', 'right', 'right', 2, 2));   // a rebuilt day replaces, not duplicates
  assert.deepEqual(days.map(d => d.date), ['2026-11-03', '2026-11-04']);
  const t = tally(days);
  assert.equal(t.days, 2); assert.deepEqual(t.strongest, { n: 2, right: 1, share: 0.5 }); assert.equal(t.weakest.right, 1);
  assert.equal(t.cards.hitRate, 0.5); assert.equal(t.cards.byGrade.A.hitRate, 0.5); assert.equal(t.cards.invalidTouched, 0.5);
  assert.equal(t.range.over50, 0.6); assert.equal(t.biases.share, 0.667);
  const day = thesisReality({ run, moves: { EURUSD: -1, GOLD: 1 } });
  assert.equal(compactDay(day).date, date);
  const b = briefFeed(day, t);
  assert.equal(b.ok, true); assert.equal(b.asOf, date); assert.ok(b.latest.cards && b.tally.days === 2);
  assert.equal(briefFeed(null, t).ok, false, 'no day yet reads as a gap, not as an empty success');
});
