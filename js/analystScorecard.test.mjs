// Tests for js/analystScorecard.js (synthetic runs and bars only).   node js/analystScorecard.test.mjs
import assert from 'node:assert/strict';
import { analystCalls, realisedFromMoves, scoreAnalystDay, scoreRunDay, countsForScorecard, compactDay, upsertDay, scorecard, trackRecordText, trackRecordSections, STATED } from './analystScorecard.js';
import { londonMs, rng } from './deskScore.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const D = '2026-11-04';
const L = { open: 100, up: { p50: 101 }, down: { p50: 99 } };
const path = (a, b) => { const s = londonMs(D, 8) / 1000; return Array.from({ length: 780 }, (_, i) => { const p = a + (b - a) * i / 779; return { time: s + i * 60, open: p, high: p, low: p, close: p }; }); };
const rep = (points, confidence = 'medium') => ({ headline: 'h', points: points.map(impact => ({ claim: 'c', impact })), confidence });

t('calls: net impact per key, its sign, and conviction from |net| moved by the report confidence', () => {
  const c = analystCalls(rep([{ USD: 2, EUR: -1 }, { USD: 1, RISK: 1 }, { EUR: 1 }], 'medium'));
  assert.deepEqual(c.map(x => [x.key, x.net, x.dir, x.conviction]), [['USD', 3, 1, 'high'], ['RISK', 1, 1, 'low']]);   // EUR nets to 0: no call
  assert.equal(analystCalls(rep([{ USD: 1 }], 'high'))[0].conviction, 'medium');
  assert.equal(analystCalls(rep([{ USD: -3 }], 'low'))[0].conviction, 'medium');
  assert.equal(analystCalls(rep([{ USD: 2 }], 'high'))[0].conviction, 'high');
  assert.equal(analystCalls(rep([{ USD: 1 }], 'low'))[0].conviction, 'low');
});

t('realised: instruments as they moved, currencies from their pairs (signed), RISK from the risk basket', () => {
  const r = realisedFromMoves({ EURUSD: 1, USDJPY: -0.5, GBPUSD: 0.5, NQ: 2, SPX500: 1 });
  assert.equal(r.EURUSD, 1);
  assert.equal(r.EUR, 1);                       // only EURUSD, base
  assert.equal(r.USD, -0.6667);                 // -1, -0.5 (USDJPY base... -0.5), -0.5 → mean of (-1, -0.5, -0.5)
  assert.equal(r.JPY, 0.5);                     // quote of USDJPY
  assert.equal(r.RISK, 1.5);                    // NQ 2, SPX500 1
  assert.equal(r.CHF, undefined);
});

t('one analyst day: hits, pushes, buckets, Brier, edge and skill against the shuffle', () => {
  const realised = { USD: -1, EUR: 1, RISK: 0.02, GOLD: 2 };
  const d = scoreAnalystDay(rep([{ USD: -2, EUR: 1, RISK: 1, GOLD: -1, NQ: 1 }], 'medium'), realised);
  assert.equal(d.calls, 5); assert.equal(d.scored, 4); assert.equal(d.pushes, 1); assert.equal(d.decided, 3); assert.equal(d.hits, 2);
  assert.deepEqual(d.buckets, { low: { n: 2, hits: 1 }, medium: { n: 1, hits: 1 }, high: { n: 0, hits: 0 } });
  // Brier: medium hit (0.6-1)^2, low hit (0.55-1)^2, low miss 0.55^2
  assert.equal(d.brierSum, +((0.4 ** 2) + (0.45 ** 2) + (0.55 ** 2)).toFixed(4));
  // edge: USD -1*-1=1, EUR 1, RISK 0.02, GOLD -2 → mean 0.005; tilt: mean dir (−1+1+1−1)/4=0 → skill = edge
  assert.equal(d.edge, 0.005); assert.equal(d.skill, 0.005);
  assert.equal(d.detail.find(x => x.key === 'NQ').r, null);
});

t('skill removes the net tilt: an analyst short everything on a down day has edge but no selection skill', () => {
  const d = scoreAnalystDay(rep([{ NQ: -1, SPX500: -1, GOLD: -1 }]), { NQ: -1, SPX500: -1, GOLD: -1 });
  assert.equal(d.edge, 1); assert.equal(d.skill, 0); assert.equal(d.hits, 3);
});

t('counts only when the run finished before 08:00 London on its own date', () => {
  assert.equal(countsForScorecard({ date: D, finishedAt: new Date(londonMs(D, 7, 10)).toISOString() }).ok, true);
  assert.equal(countsForScorecard({ date: D, finishedAt: new Date(londonMs(D, 9)).toISOString() }).ok, false);
  assert.equal(countsForScorecard({ date: D, finishedAt: new Date(londonMs(D, 0) - 60_000).toISOString() }).ok, false);
});

const mkRun = (date, analysts, finishedAt = new Date(londonMs(date, 7, 20)).toISOString()) => ({
  date, finishedAt, mode: 'full', rolesHash: 'abc',
  head: { ok: true, book: { instruments: { EURUSD: { rating: 'FLAT', levels: L }, USDJPY: { rating: 'FLAT', levels: L }, NQ: { rating: 'LONG', levels: L }, GOLD: { rating: 'FLAT', levels: L } } } },
  analysts,
});

t('a whole run from bars: every analyst scored on the same moves, failed analysts marked', () => {
  const run = mkRun(D, {
    rates_cb: { ok: true, layer: 'currency', report: rep([{ USD: 2, EUR: -2 }]) },            // EURUSD falls → right on both
    global_market: { ok: true, layer: 'global', report: rep([{ RISK: -1 }], 'high') },        // NQ rises → wrong
    vol_iv: { ok: false },
  });
  const day = scoreRunDay(run, { barsByInst: { EURUSD: path(100, 99), USDJPY: path(100, 100.5), NQ: path(100, 102) } });
  assert.equal(day.counts, true); assert.equal(day.markets, 3);
  assert.deepEqual(day.moves, { EURUSD: -1, USDJPY: 0.5, NQ: 2 });
  assert.equal(day.analysts.rates_cb.hits, 2); assert.equal(day.analysts.rates_cb.buckets.medium.n, 2);
  assert.equal(day.analysts.global_market.hits, 0); assert.equal(day.analysts.global_market.buckets.medium.n, 1);
  assert.deepEqual(day.analysts.vol_iv, { failed: true });
  // stored moves give the same day without bars
  assert.deepEqual(scoreRunDay(run, { moves: day.moves }).analysts, day.analysts);
  const c = compactDay(day);
  assert.equal(c.analysts.rates_cb.detail, undefined); assert.equal(c.moves, undefined); assert.equal(c.analysts.rates_cb.hits, 2);
});

t('upsertDay replaces a re-scored day and keeps dates in order', () => {
  const xs = upsertDay(upsertDay(upsertDay([], { date: '2026-11-05', v: 1 }), { date: '2026-11-04', v: 1 }), { date: '2026-11-05', v: 2 });
  assert.deepEqual(xs.map(x => [x.date, x.v]), [['2026-11-04', 1], ['2026-11-05', 2]]);
});

// Synthetic history: a "good" analyst right 70% of the time, a coin-flip one, a "bad" one right 30%.
function history(days, seed = 7) {
  const r = rng(seed), out = [];
  for (let k = 0; k < days; k++) {
    const date = new Date(Date.UTC(2026, 10, 4) + k * 864e5).toISOString().slice(0, 10);
    const moves = { EURUSD: r() - 0.5 > 0 ? 1 : -1, USDJPY: r() - 0.5 > 0 ? 0.8 : -0.8, NQ: r() - 0.5 > 0 ? 1.2 : -1.2, GOLD: r() > 0.5 ? 0.6 : -0.6, AUDUSD: r() > 0.5 ? 0.9 : -0.9 };
    const keys = Object.keys(moves);
    const call = p => Object.fromEntries(keys.map(key => [key, (r() < p ? 1 : -1) * Math.sign(moves[key]) * (r() < 0.5 ? 2 : 1)]));
    const run = mkRun(date, {
      levels_structure: { ok: true, layer: 'asset', report: rep([call(0.7)], 'high') },
      vol_iv: { ok: true, layer: 'asset', report: rep([call(0.5)]) },
      options_oi: { ok: true, layer: 'asset', report: rep([call(0.3)], 'low') },
    });
    out.push(compactDay(scoreRunDay(run, { moves })));
  }
  return out;
}

t('scorecard: hit rates by bucket, calibration, shrunk weights that order the analysts', () => {
  const sc = scorecard(history(80));
  const g = sc.analysts.levels_structure, c = sc.analysts.vol_iv, b = sc.analysts.options_oi;
  assert.equal(sc.days, 80);
  assert.ok(g.hitRate > 0.62 && g.hitRate < 0.78, `good hit ${g.hitRate}`);
  assert.ok(b.hitRate > 0.22 && b.hitRate < 0.38, `bad hit ${b.hitRate}`);
  assert.ok(g.weight > c.weight && c.weight > b.weight, `weights ${g.weight} ${c.weight} ${b.weight}`);
  assert.ok(g.weight > 1.2 && b.weight < 0.8);
  assert.ok(g.weight <= 1.5 && b.weight >= 0.5);   // bounded, however strong the record
  assert.equal(g.status, 'earned'); assert.equal(b.status, 'lagging');
  assert.ok(g.calibration.brierSkill > 0 && b.calibration.brierSkill < 0);
  // the good analyst's calls are all medium/high (high confidence), the bad one's low/medium
  assert.equal(g.buckets.low.n, 0); assert.equal(b.buckets.high.n, 0);
  assert.equal(g.spark.length, 80); assert.ok(Number.isFinite(g.spark.at(-1).rolling));
  // an analyst with no reports still has a row at weight 1
  assert.equal(sc.analysts.rates_cb.days, 0); assert.equal(sc.analysts.rates_cb.weight, 1);
  assert.equal(Object.keys(sc.analysts).length >= 11, true);
});

t('few days never produce extreme weights', () => {
  for (const days of [1, 2, 3, 5]) {
    const sc = scorecard(history(days, 11));
    for (const p of Object.values(sc.analysts)) {
      assert.ok(p.weight > 0.8 && p.weight < 1.2, `${days} days → weight ${p.weight}`);
      if (p.days) assert.equal(p.status, 'unproven');
    }
  }
  // a perfect analyst on two days is still close to 1
  const perfect = [0, 1].map(k => compactDay(scoreRunDay(mkRun(`2026-11-0${4 + k}`, { rates_cb: { ok: true, layer: 'currency', report: rep([{ EUR: 2 }], 'high') } }), { moves: { EURUSD: 2.5 } })));
  assert.ok(scorecard(perfect).analysts.rates_cb.weight < 1.2);
});

t('days that do not count are stored but left out', () => {
  const days = history(12);
  days[0] = { ...days[0], counts: false, why: 'late' };
  const sc = scorecard(days);
  assert.equal(sc.days, 11); assert.equal(sc.allDays, 12);
});

t('track record sections: per audience, null before any day, instructions included', () => {
  assert.equal(trackRecordText(scorecard([]), 'head'), null);
  assert.equal(trackRecordSections(scorecard([])), null);
  const sc = scorecard(history(30));
  const head = trackRecordText(sc, 'head');
  assert.match(head, /levels_structure \(asset\)/); assert.match(head, /Weight runs from 0\.5 to 1\.5/); assert.match(head, /hit \d+% \[high/);
  assert.equal(trackRecordText(sc, 'global'), null);   // no global or evidence analyst reported in this history
  const s = trackRecordSections(sc);
  assert.equal(s.days, 30); assert.equal(s.global, null); assert.ok(s.head); assert.ok(s.currency === null);
  assert.equal(STATED.high, 0.7);
});

console.log(`analystScorecard: ${n} tests passed`);
