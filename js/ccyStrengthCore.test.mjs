// Currency strength (σ): the maths (ccyStrengthCore.js), the feed's two-layer cache (deskBoardRoutes.js makeStrengthFeed) and the board (terminal/ccyStrengthView.js).
//   node js/ccyStrengthCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CCYS, PAIRS, HORIZONS, priceAt, normalMoves, fitStrength, buildStrength, describeStrength } from './ccyStrengthCore.js';
import { makeStrengthFeed } from './deskBoardRoutes.js';
import { boardHtml, geometry, stampHtml } from './terminal/ccyStrengthView.js';

const H = 3600e3;
const NOW = Date.parse('2026-11-12T14:37:00Z');

// bars for every pair from a "true" strength vector: log price of base_quote = strength(base) - strength(quote), scaled by a pair's own size
function barsFrom(truth, { now = NOW, vol = 0.0004 } = {}) {
  const out = {};
  for (const pair of PAIRS) {
    const [b, q] = pair.split('_'), size = pair.includes('JPY') ? 3 : 1, mk = (step, n, mult) => Array.from({ length: n }, (_, i) => {
      const t = now - (n - i) * step; const ago = (now - t) / H;                   // hours before now
      // a slow random-looking walk (deterministic) plus the trend that makes today's move: strength builds linearly over the last 24h
      const trend = ((truth[b] ?? 0) - (truth[q] ?? 0)) * vol * 12 * Math.max(0, 1 - ago / 24) * mult;
      const wob = vol * 0.5 * Math.sin(i * 1.7 + pair.length) * mult;
      return { t, c: 1.1 * size * Math.exp(trend + wob) };
    });
    out[pair] = { m5: mk(300e3, 100, 1), h1: mk(H, 600, 1.5), d: mk(24 * H, 260, 4) };
  }
  return out;
}

test('priceAt takes the close of the last finished bar and refuses a stale one', () => {
  const bars = [{ t: 0, c: 1 }, { t: H, c: 2 }, { t: 2 * H, c: 3 }];
  assert.equal(priceAt(bars, H, 2 * H), 2, 'at 02:00 the bar that opened 01:00 has just closed');
  assert.equal(priceAt(bars, H, 2.5 * H), 2);
  assert.equal(priceAt(bars, H, 3 * H), 3);
  assert.equal(priceAt(bars, H, -1), null);
  assert.equal(priceAt(bars, H, 40 * H), null, 'nothing within a few bars: say nothing');
});

test('the fit recovers a known strength vector, sums to zero and keeps the order', () => {
  const truth = { USD: 1.2, EUR: -0.4, GBP: 0.1, JPY: -1.6, CHF: 0.3, CAD: 0.5, AUD: -0.2, NZD: 0.1 };
  const mean = Object.values(truth).reduce((a, b) => a + b, 0) / 8;
  const obs = PAIRS.map(p => { const [b, q] = p.split('_'); return { base: b, quote: q, raw: ((truth[b] - mean) - (truth[q] - mean)) * 0.001, sigma: 0.001 * (p.includes('JPY') ? 1.4 : 1) }; });
  const f = fitStrength(obs), by = Object.fromEntries(f.scores.map(s => [s.ccy, s.score]));
  assert.ok(Math.abs(f.scores.reduce((a, s) => a + s.score, 0)) < 0.05, 'sums to zero');
  const order = k => Object.entries(k).sort((a, b) => b[1] - a[1]).map(x => x[0]).join();
  assert.equal(order(by), order(truth));
  assert.ok(by.USD > 0 && by.JPY < 0);
  assert.equal(fitStrength(obs.slice(0, 5)), null, 'too few pairs: no fit rather than a fake one');
});

test('every currency is one number: triangle consistency holds (EURUSD move = EUR score - USD score on consistent prices)', () => {
  const truth = { USD: 0.8, EUR: -0.3, GBP: 0.2, JPY: -1, CHF: 0.1, CAD: 0.4, AUD: -0.1, NZD: -0.1 };
  const obs = PAIRS.map(p => { const [b, q] = p.split('_'); return { base: b, quote: q, raw: (truth[b] - truth[q]) * 0.001, sigma: 0.001 }; });
  const f = fitStrength(obs), by = Object.fromEntries(f.scores.map(s => [s.ccy, s.score]));
  assert.ok(Math.abs((by.EUR - by.USD) - (by.EUR - by.GBP) - (by.GBP - by.USD)) < 1e-9);
});

test('normal moves: the median absolute move at the horizon, from hourly bars (1H, 4H) and daily bars (1D, 1W)', () => {
  const h1 = Array.from({ length: 200 }, (_, i) => ({ t: i * H, c: 100 * Math.exp(0.001 * i) }));       // +0.1% every hour exactly
  const d = Array.from({ length: 120 }, (_, i) => ({ t: i * 24 * H, c: 100 * Math.exp(0.01 * i) }));    // +1% every day exactly
  const n = normalMoves(h1, d);
  assert.ok(Math.abs(n['1H'] - 0.001) < 1e-9 && Math.abs(n['4H'] - 0.004) < 1e-9);
  assert.ok(Math.abs(n['1D'] - 0.01) < 1e-9 && Math.abs(n['1W'] - 0.05) < 1e-9);
  assert.equal(normalMoves([], [])['1H'], null);
});

test('the payload: four horizons, eight scores each, leader and laggard, unit in percent, and the as-of is the last bar', () => {
  const truth = { USD: 1, EUR: -1, GBP: 0.5, JPY: -0.5, CHF: 0, CAD: 0.2, AUD: -0.2, NZD: 0 };
  const p = buildStrength({ bars: barsFrom(truth), now: NOW });
  assert.equal(p.ok, true);
  assert.deepEqual(Object.keys(p.horizons), HORIZONS.map(h => h.key));
  for (const k of ['1H', '4H', '1D', '1W']) {
    const h = p.horizons[k]; assert.equal(h.available, true, k); assert.equal(h.scores.length, 8); assert.equal(h.pairs, 28);
    assert.equal(h.scores[0].ccy, h.leader); assert.equal(h.scores.at(-1).ccy, h.laggard); assert.ok(h.unitPct > 0);
    assert.ok(h.scores.every((s, i) => s.rank === i + 1));
  }
  assert.equal(p.horizons['1D'].leader, 'USD'); assert.equal(p.horizons['1D'].laggard, 'EUR');
  assert.equal(p.asOf, new Date(NOW).toISOString(), 'the newest five-minute bar ends at now');
  assert.equal(p.closed, false);
});

test('a shut market is flagged and a flat window says so; too few pairs is reported, never faked', () => {
  const flat = Object.fromEntries(PAIRS.map(pr => [pr, { m5: Array.from({ length: 100 }, (_, i) => ({ t: NOW - 3 * 24 * H - (100 - i) * 300e3, c: 1.1 })), h1: Array.from({ length: 600 }, (_, i) => ({ t: NOW - 4 * 24 * H - (600 - i) * H, c: 1.1 + 0.001 * Math.sin(i) })), d: Array.from({ length: 260 }, (_, i) => ({ t: NOW - (260 - i) * 24 * H, c: 1.1 + 0.01 * Math.sin(i) })) }]));
  const p = buildStrength({ bars: flat, now: NOW });
  assert.equal(p.closed, true);
  const few = buildStrength({ bars: Object.fromEntries(PAIRS.slice(0, 6).map(k => [k, flat[k]])), now: NOW });
  assert.equal(few.horizons['1H'].available, false); assert.match(few.horizons['1H'].reason, /only \d+ of 28 pairs/);
  assert.equal(buildStrength({ bars: {} }).ok, false);
  assert.equal(p.horizons['1H'].available, true, 'a shut market is a flat window, not a missing one');
  assert.equal(p.horizons['1H'].flat, true);
  assert.match(describeStrength(p, '1H'), /has not moved over 1H/);
});

test('the footer is by rule: strongest vs weakest, the spread, whether one currency is doing the moving; ordering only', () => {
  const p = buildStrength({ bars: barsFrom({ USD: 1.5, EUR: -1.5, GBP: 0, JPY: 0, CHF: 0, CAD: 0, AUD: 0, NZD: 0 }), now: NOW });
  const s = describeStrength(p, '1D');
  assert.match(s, /^Strongest vs weakest on 1D: USD vs EUR \(\+\d+\.\dσ and −\d+\.\dσ, a \d+\.\dσ spread\)\./);
  assert.doesNotMatch(s, /buy|sell|long|short|will|forecast/i);
  assert.equal(describeStrength(p, '2H'), null);
});

test('the feed keeps two layers: hourly and daily history every 15 minutes, five-minute bars every 50 seconds, one build serves every viewer', async () => {
  let calls = 0, t = NOW; const seen = { H1: 0, D: 0, M5: 0 };
  const truth = barsFrom({ USD: 1, EUR: -1, GBP: 0, JPY: 0, CHF: 0, CAD: 0, AUD: 0, NZD: 0 });
  const fetchCandles = async (pair, gran) => { calls++; seen[gran]++; const k = { H1: 'h1', D: 'd', M5: 'm5' }[gran]; return truth[pair][k].map(b => ({ time: new Date(b.t).toISOString(), complete: true, close: b.c })); };
  const feed = makeStrengthFeed(fetchCandles, { now: () => t });
  const [a, b] = await Promise.all([feed.get(), feed.get()]);
  assert.equal(calls, 28 * 3, 'two concurrent viewers, one refresh'); assert.equal(a.ok, true); assert.equal(b.ok, true);
  await feed.get(); assert.equal(calls, 84, 'inside 50 seconds nothing is fetched');
  t += 60e3; await feed.get(); assert.equal(seen.M5, 56); assert.equal(seen.H1, 28, 'a minute on: only the five-minute layer');
  t += 16 * 60e3; await feed.get(); assert.equal(seen.H1, 56); assert.equal(seen.D, 56);
});

test('the board: four pills with 1H pressed, eight rows sorted by the window, labelled price-based/live against the analyst read, ghost from the last refresh, tokens only', () => {
  const truth = { USD: 1, EUR: -1, GBP: 0.5, JPY: -0.5, CHF: 0, CAD: 0.2, AUD: -0.2, NZD: 0 };
  const p = buildStrength({ bars: barsFrom(truth), now: NOW }), prev = buildStrength({ bars: barsFrom({ ...truth, USD: 0.2, EUR: 0 }), now: NOW });
  const html = boardHtml(p, '1D', prev);
  assert.equal((html.match(/data-cshz="/g) ?? []).length, 4);
  assert.match(html, /data-cshz="1D" aria-pressed="true"/); assert.match(html, /data-cshz="1H" aria-pressed="false"/);
  assert.equal((html.match(/data-ccy="/g) ?? []).length, 8);
  assert.match(html, /price-based, live/); assert.match(html, /analyst read, daily/);
  assert.match(html, /Strongest vs weakest on 1D: USD vs EUR/);
  assert.ok(html.indexOf('data-ccy="USD"') < html.indexOf('data-ccy="EUR"'));
  assert.match(html, /class="cs-row cs-lead" data-ccy="USD" style="top:0px"/);
  const g = geometry(p.horizons['1D'], prev.horizons['1D']);
  assert.ok(g.rows.every(r => r.ghost != null), 'every row carries a ghost from the previous refresh');
  assert.equal(geometry(p.horizons['1D'], null).rows[0].ghost, null);
  assert.doesNotMatch(html, /#[0-9a-f]{3,6}\b|rgb\(/i);
  assert.match(html, /1\.0σ is a typical currency/);
  assert.match(stampHtml({ asOf: p.asOf, closed: true }), /market closed/);
});

test('loading, error and unavailable-window states', () => {
  assert.match(boardHtml(null), /Loading the price bars/);
  assert.match(boardHtml({ ok: false, error: 'no price bars yet' }), /no price bars yet.*stands on its own/);
  assert.match(boardHtml({ ok: true, asOf: null, horizons: { '1H': { available: false, reason: 'only 4 of 28 pairs had prices' } } }, '1H'), /only 4 of 28 pairs/);
});
