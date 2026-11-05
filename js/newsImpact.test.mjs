// Tests for js/newsImpact.js.   node js/newsImpact.test.mjs
import assert from 'node:assert/strict';
import { marketKeys, stance, pairImpacts, reactionMarkets, reactionStart, priceAt, typicalMove, scoreMove, scoreMarket, headlineReaction, recordRow, appendRecord, aggregateRecord } from './newsImpact.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

t('market keys: pairs by legs, indices, gold, oil, crypto; others none', () => {
  assert.deepEqual(marketKeys('EURUSD'), ['EUR', 'USD']);
  assert.deepEqual(marketKeys('EURNOK'), ['EUR', 'NOK']);
  assert.deepEqual(marketKeys('DE30'), ['EQUITIES']);
  assert.deepEqual(marketKeys('GOLD'), ['GOLD']);
  assert.deepEqual(marketKeys('BRENT'), ['OIL']);
  assert.deepEqual(marketKeys('BTCUSD'), ['CRYPTO']);
  assert.equal(marketKeys('SILVER'), null); assert.equal(marketKeys('WHEAT'), null); assert.equal(marketKeys('XYZ'), null);
});

t('stance against the card', () => {
  assert.equal(stance('LONG', 1), 'supports'); assert.equal(stance('STRONG_SHORT', 2), 'against');
  assert.equal(stance('SHORT', -1), 'supports'); assert.equal(stance('FLAT', 1), null); assert.equal(stance(null, 1), null); assert.equal(stance('LONG', 0), null);
});

t('pairs: base minus quote, strongest first, cards before others among equals, zero left out', () => {
  const p = pairImpacts({ USD: -2, JPY: 1 }, { book: { USDCHF: 'SHORT', EURUSD: 'SHORT' } });
  const by = Object.fromEntries(p.map(x => [x.inst, x]));
  assert.equal(by.USDJPY.dir, -3); assert.equal(p[0].inst, 'USDJPY');
  assert.equal(by.EURUSD.dir, 2); assert.equal(by.EURUSD.stance, 'against');
  assert.equal(by.USDCHF.dir, -2); assert.equal(by.USDCHF.stance, 'supports');
  assert.equal(by.EURJPY.dir, -1); assert.equal(by.GOLD, undefined);
  // among |dir| = 2, the two with cards come first
  const twos = p.filter(x => Math.abs(x.dir) === 2).map(x => x.inst);
  assert.deepEqual(twos.slice(0, 2).sort(), ['EURUSD', 'USDCHF']);
  // NOK / SEK legs have no read: the USD leg alone carries
  assert.equal(by.USDNOK.dir, -2);
  const a = pairImpacts({ OIL: 1, EQUITIES: -1, GOLD: 2 });
  assert.deepEqual(a.map(x => [x.inst, x.dir]).slice(0, 1), [['GOLD', 2]]);
  assert.ok(a.some(x => x.inst === 'WTI' && x.dir === 1) && a.some(x => x.inst === 'NQ' && x.dir === -1) && a.some(x => x.inst === 'UK100'));
  assert.deepEqual(pairImpacts({}), []); assert.deepEqual(pairImpacts(null), []);
  assert.equal(pairImpacts({ USD: 1 }, { max: 3 }).length, 3);
  assert.deepEqual(reactionMarkets(p, 2), ['USDJPY', p[1].inst]);
});

t('reaction start: published, or first seen when the stamp is far older', () => {
  assert.deepEqual(reactionStart({ ms: 1000, firstSeen: 1000 + 5 * 60e3 }), { t0: 1000, basis: 'published' });
  assert.deepEqual(reactionStart({ ms: 1000, firstSeen: 1000 + 31 * 60e3 }), { t0: 1000 + 31 * 60e3, basis: 'first seen' });
  assert.deepEqual(reactionStart({ ms: 1000 }), { t0: 1000, basis: 'published' });
  assert.equal(reactionStart({}), null);
});

// M1 bars: start ms t, close c
const T0 = Date.UTC(2026, 10, 5, 13, 30);
const bars = (from, to, f) => { const out = []; for (let t = from; t < to; t += 60e3) out.push({ t, c: f(t) }); return out; };

t('price at: the last bar that ended by then, within tolerance', () => {
  const b = bars(T0 - 10 * 60e3, T0 + 10 * 60e3, t => (t - T0) / 60e3);
  assert.equal(priceAt(b, T0), -1);   // the 13:29 bar ends at 13:30
  assert.equal(priceAt(b, T0 + 5 * 60e3 + 30e3), 4);
  assert.equal(priceAt(b, T0 + 40 * 60e3), null, 'last bar too old');
  assert.equal(priceAt(b, T0 - 60 * 60e3), null);
});

t('typical move: median absolute change over the horizon in the hours before', () => {
  // a zigzag: +1 then -1 each 5 minutes → every 5-minute window moves exactly 1
  const b = bars(T0 - 6 * 3600e3, T0, t => (Math.floor((t - T0) / 300e3) % 2 === 0 ? 1 : 0));
  assert.equal(typicalMove(b, T0, 5), 1);
  // a steady drift of 0.1 a minute: 5 min → 0.5, 30 min → 3
  const d = bars(T0 - 6 * 3600e3, T0 + 3600e3, t => 100 + (t - T0) / 60e3 * 0.1);
  assert.ok(Math.abs(typicalMove(d, T0, 5) - 0.5) < 1e-9); assert.ok(Math.abs(typicalMove(d, T0, 30) - 3) < 1e-9);
  assert.equal(typicalMove(bars(T0 - 30 * 60e3, T0, () => 1), T0, 30), null, 'too few windows');
  assert.equal(typicalMove(bars(T0 - 6 * 3600e3, T0, () => 1), T0, 5), null, 'no movement → no unit');
});

t('score: units signed by the implied direction, half a typical move is the line', () => {
  assert.deepEqual(scoreMove({ p0: 1.1, p: 1.1012, typical: 0.0008, dir: 1 }), { move: 0.0012, units: 1.5, label: 'with' });
  assert.equal(scoreMove({ p0: 1.1, p: 1.1012, typical: 0.0008, dir: -2 }).label, 'against');
  assert.equal(scoreMove({ p0: 1.1, p: 1.1003, typical: 0.0008, dir: 1 }).label, 'none');
  assert.equal(scoreMove({ p0: 1.1, p: null, typical: 0.0008, dir: 1 }), null);
  assert.equal(scoreMove({ p0: 1.1, p: 1.2, typical: 0.0008, dir: 0 }), null);
});

t('score a market end to end, and the headline label as the mean', () => {
  // drift 0.1/min before; after t0 a jump of +2 then flat
  const b = bars(T0 - 6 * 3600e3, T0 + 31 * 60e3, t => (t < T0 ? 100 + (t - T0) / 60e3 * 0.1 : 102));
  const m = scoreMarket('EURUSD', 1, b, T0);
  assert.equal(m.p0, 99.9); assert.equal(m.p5, 102); assert.equal(m.p30, 102);
  assert.equal(m.m5.label, 'with'); assert.equal(m.m5.units, 4.2); assert.equal(m.m30.label, 'with'); assert.equal(m.m30.units, 0.7);
  const down = scoreMarket('USDJPY', -1, b, T0);
  assert.equal(down.m5.label, 'against');
  assert.deepEqual(headlineReaction([m, down], 'm5'), { units: 0, label: 'none', n: 2 });
  assert.deepEqual(headlineReaction([m, { m5: null }], 'm5'), { units: 4.2, label: 'with', n: 1 });
  assert.equal(headlineReaction([], 'm30'), null);
  // no bars after t0 (market shut): no label
  assert.equal(scoreMarket('EURUSD', 1, b.filter(x => x.t < T0), T0).m5, null);
});

t('record: rows, append by id, aggregate by source and topic', () => {
  const h = { id: 'x', ms: 5, source: 'ForexLive', sources: ['ForexLive', 'Finnhub/Reuters'], topic: 'data', tier: 2, read: { tier: 1 }, react: { m5: { label: 'with', units: 1 }, m30: { label: 'none', units: 0.2 }, markets: [{}, {}] } };
  assert.deepEqual(recordRow(h), { id: 'x', ms: 5, sources: ['ForexLive', 'Finnhub/Reuters'], topic: 'data', tier: 1, m5: 'with', m30: 'none', u5: 1, u30: 0.2, n: 2 });
  assert.equal(recordRow({ id: 'y' }), null);
  const now = 200 * 864e5;
  const rows = appendRecord([{ id: 'old', ms: 1 }, { id: 'a', ms: now - 1, m5: 'against' }], [{ id: 'a', ms: now - 1, m5: 'with' }, { id: 'b', ms: now - 2, m5: 'none' }], { now });
  assert.deepEqual(rows.map(r => [r.id, r.m5]), [['a', 'with'], ['b', 'none']]);
  const rec = aggregateRecord([
    { sources: ['ForexLive', 'Finnhub/Reuters'], topic: 'data', m5: 'with', m30: 'with' },
    { sources: ['ForexLive'], topic: 'central bank', m5: 'against', m30: null },
    { sources: ['Fed'], topic: 'central bank', m5: 'none', m30: 'with' },
  ]);
  assert.equal(rec.label, 'description, not a signal');
  assert.deepEqual(rec.overall.m5, { n: 3, with: 1, against: 1, none: 1, withRate: 0.333 });
  assert.deepEqual(rec.overall.m30, { n: 2, with: 2, against: 0, none: 0, withRate: 1 });
  const fl = rec.bySource.find(x => x.key === 'ForexLive');
  assert.equal(fl.m5.n, 2); assert.equal(fl.m30.n, 1);
  assert.ok(rec.bySource.some(x => x.key === 'Finnhub'), 'Finnhub/<outlet> counts under Finnhub');
  assert.deepEqual(rec.byTopic.map(x => x.key), ['central bank', 'data']);
  assert.equal(aggregateRecord([]).overall.m5.n, 0);
});

console.log(`newsImpact: ${n} tests passed`);
