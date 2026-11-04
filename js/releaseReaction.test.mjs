// Tests for js/releaseReaction.js (expectations against reality). Run: node js/releaseReaction.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { marketsFor, moveFromBars, dxMove, expectationFor, labelReaction, regimeOf, vixBefore, overallLabel, scoreRelease, historyFor, backfillFromStudy,
  liveHistory, newLiveRecord, reactionMessage, upsert, dueMeasurements, summarise, summaryText, clearSurprise } from './releaseReaction.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const T0 = Date.parse('2026-11-06T13:30:00Z');

t('marketsFor: the country set first (2y, pairs, gold, index), then the playbook movers OANDA can price', () => {
  assert.deepEqual(marketsFor('US').slice(0, 3), ['zt', 'eurusd', 'usdjpy']);
  assert.deepEqual(marketsFor('GB'), ['gbpusd', 'gilt', 'ftse', 'gold']);
  assert.deepEqual(marketsFor('JP', { markets: { sofr: {}, zn: {}, nq: {} } }), ['usdjpy', 'nikkei', 'gold', 'zn', 'nq']);
  assert.deepEqual(marketsFor('XX'), ['gold', 'es']);
});

t('moveFromBars: release-minute base to the bar closing at +30, null when the market is shut', () => {
  const s = T0 / 1000, bars = [{ t: s - 120, c: 1.1000 }, { t: s - 60, c: 1.1010 }, { t: s, c: 1.1050 }, { t: s + 29 * 60, c: 1.1065 }, { t: s + 31 * 60, c: 1.2 }];
  assert.equal(moveFromBars(bars, T0, 30), +((1.1065 / 1.1010 - 1) * 100).toFixed(3));
  assert.equal(moveFromBars(bars.slice(0, 2), T0, 30), null);
  assert.equal(moveFromBars([{ t: s - 3600, c: 1 }, { t: s + 29 * 60, c: 2 }], T0, 30), null, 'a base an hour old is not the release minute');
  assert.equal(dxMove({ eurusd: -0.2, usdjpy: 0.3, gbpusd: -0.1, usdcad: 0.1 }), +((57.6 * 0.2 + 13.6 * 0.3 + 11.9 * 0.1 + 9.1 * 0.1) / 92.2).toFixed(3));
  assert.equal(dxMove({ eurusd: -0.2 }), null);
});

// a family where the 2y note falls 0.1% per unit of z, with |move| ~ 0.1 typical
const hist = [-2, -1, -0.6, 0.7, 1, 1.5, 2].map((z, i) => ({ z, diff: z, moves: { zt: { m30: -0.1 * z + (i % 2 ? 0.01 : -0.01), m240: -0.05 * z } } }));

t('expectationFor: per unit of surprise first, then the same-side median, then size only', () => {
  const e = expectationFor(hist, 'zt', 'm30', { z: 2 });
  assert.equal(e.src, 'per unit of surprise'); assert.ok(Math.abs(e.expected + 0.2) < 0.02, String(e.expected)); assert.equal(e.n, 7);
  const s = expectationFor(hist.map(h => ({ ...h, z: null })), 'zt', 'm30', { z: null, diff: 1 });
  assert.match(s.src, /median after above-consensus prints/); assert.ok(s.expected < 0);
  const none = expectationFor(hist.slice(0, 2), 'zt', 'm30', { z: 1 });
  assert.equal(none.expected, null); assert.equal(none.src, 'no history');
});

t('labelReaction: priced in, opposite, under, in line, over, and size-only for an in-line print', () => {
  const E = { expected: -0.2, usual: 0.12 }, S = { z: 2 };
  assert.equal(labelReaction(-0.02, E, S).label, 'priced in');
  assert.equal(labelReaction(0.1, E, S).label, 'opposite');
  assert.equal(labelReaction(-0.06, E, S).label, 'underreaction');
  assert.equal(labelReaction(-0.25, E, S).label, 'in line');
  assert.equal(labelReaction(-0.5, E, S).label, 'overreaction');
  assert.equal(labelReaction(-0.25, E, S).gap, -0.05);
  const inline = { z: 0.1 };   // an in-line print: no direction to expect, judged by size
  assert.equal(labelReaction(0.05, { expected: -0.01, usual: 0.12 }, inline).label, 'in line');
  assert.equal(labelReaction(0.3, { expected: -0.01, usual: 0.12 }, inline).label, 'overreaction');
  assert.equal(labelReaction(0.3, { expected: null, usual: null }, S).label, null);
  assert.equal(clearSurprise({ z: null, diff: 0.1 }), true); assert.equal(clearSurprise({ z: 0.4 }), false);
});

t('regime from the VIX close BEFORE the release day', () => {
  const vix = [{ date: '2026-11-04', value: 15 }, { date: '2026-11-05', value: 25 }, { date: '2026-11-06', value: 30 }];
  assert.equal(vixBefore(vix, T0), 25); assert.equal(regimeOf(25), 'stressed'); assert.equal(regimeOf(15.9), 'calm'); assert.equal(regimeOf(null), null);
});

t('scoreRelease fills each market and the overall label; overallLabel says mixed with no majority', () => {
  const rec = { ms: T0, family: 'CPI', surprise: { z: 2, diff: 0.2 }, markets: [{ id: 'zt', m30: -0.25 }, { id: 'eurusd', m30: null }] };
  const s = scoreRelease(rec, hist, 30);
  assert.equal(s.markets[0].label30, 'in line'); assert.equal(s.markets[1].label30, null); assert.equal(s.label30, 'in line');
  assert.equal(overallLabel([{ label30: 'opposite' }, { label30: 'in line' }, { label30: 'overreaction' }], 30), 'mixed');
  assert.equal(overallLabel([{ label30: 'opposite' }, { label30: 'in line' }], 30), 'opposite', 'a tie goes to the headline market');
});

t('historyFor is point-in-time: only earlier releases of the same family (or the same event with no family)', () => {
  const a = { family: 'CPI', ms: 1, surprise: { z: 1 }, markets: [{ id: 'zt', m30: 1 }] }, b = { family: 'CPI', ms: 3, markets: [] }, c = { family: 'NFP', ms: 0, markets: [] };
  assert.equal(historyFor([a, b, c], { family: 'CPI', ms: 2 }).length, 1);
  const x = { family: null, country: 'AU', event: 'Employment Change', ms: 1, markets: [] };
  assert.equal(historyFor([x], { family: null, country: 'AU', event: 'employment change ', ms: 5 }).length, 1);
  assert.equal(historyFor([x], { family: null, country: 'NZ', event: 'Employment Change', ms: 5 }).length, 0);
});

t('the backfill from the release study walks forward: no record is judged by a later one', () => {
  const rows = JSON.parse(fs.readFileSync(new URL('../analysis/output/release_layer1/summary.json', import.meta.url), 'utf8')).rows;
  const b = backfillFromStudy(rows);
  assert.ok(b.length >= 100, String(b.length));
  const nfp = b.filter(r => r.family === 'NFP');
  assert.equal(nfp[0].markets[0].n30 ?? 0, 0, 'the first NFP has no history');
  assert.equal(nfp[0].surprise.z, null, 'no z before six earlier surprises');
  const late = nfp.at(-1); assert.ok(late.markets[0].n30 >= nfp.length - 3 && late.markets[0].n30 < nfp.length);
  assert.equal(late.markets[0].id, 'zt', 'US data leads with the 2y');
  // truncating the future does not change a past record (the point-in-time property)
  const cut = backfillFromStudy(rows.filter(r => r.t <= nfp[10].at.replace('.000Z', 'Z')));
  const same = cut.find(r => r.key === nfp[10].key);
  assert.deepEqual(same.markets, nfp[10].markets); assert.equal(same.label30, nfp[10].label30);
});

t('a live record: country markets, a study-based z when the reader had none, scored against the study and earlier live', () => {
  const study = [1, 2, 3, 4, 5, 6, 7].map(i => ({ family: 'CPI', ms: T0 - i * 864e5 * 30, surprise: { diff: i % 2 ? 0.1 : -0.1, z: i % 2 ? 1 : -1 }, markets: [{ id: 'zt', m30: i % 2 ? -0.1 : 0.1 }] }));
  const rr = { key: 'US|cpi m/m|1', country: 'US', ccy: 'USD', event: 'CPI m/m', family: 'CPI', ms: T0, at: new Date(T0).toISOString(), actual: '0.4%', estimate: '0.3%', surprise: { ok: true, diff: 0.1, diffText: '+0.1pp', z: null, direction: 'above' } };
  const rec = newLiveRecord(rr, { study, vix: 18, stress: 'watch' });
  assert.equal(rec.surprise.z, 0.94); assert.match(rec.surprise.zSrc, /7 CPI surprises/);
  assert.deepEqual(rec.regime, { vix: 18, tone: 'normal', stress: 'watch' });
  assert.equal(rec.markets[0].inst, 'USB02Y_USD');
  rec.markets[0].m30 = -0.12;
  const s = scoreRelease(rec, liveHistory(study, [], rec), 30);
  assert.equal(s.markets[0].label30, 'in line');
  const msg = reactionMessage(s);
  assert.match(msg, /US 2y note: moved <b>-0\.12%<\/b> vs the usual -0\.09%/); assert.match(msg, /in line/); assert.match(msg, /not a forecast/);
  // a live record at the same minute as a study row is not counted twice
  assert.equal(liveHistory([{ ...study[0] }], [{ ...study[0], source: 'live' }], rec).length, 1);
});

t('dueMeasurements and upsert', () => {
  const log = [{ key: 'a', ms: T0 }, { key: 'b', ms: T0, done30: true }, { key: 'c', ms: T0 - 100 * 3600e3 }];
  const d = dueMeasurements(log, T0 + 4.1 * 3600e3);
  assert.deepEqual(d.m30.map(r => r.key), ['a']); assert.deepEqual(d.m240.map(r => r.key), ['a', 'b']);
  assert.deepEqual(dueMeasurements(log, T0 + 20 * 60_000).m30, []);
  assert.deepEqual(upsert([{ key: 'a', ms: 1 }, { key: 'b', ms: 2 }], { key: 'a', ms: 3 }).map(x => x.key), ['a', 'b']);
});

t('summarise: by family and regime, moved-as-expected share, priced-in share and per-unit medians', () => {
  const mk = (fam, tone, z, m, exp, label) => ({ family: fam, source: 'study', regime: { tone }, surprise: { z, diff: z }, markets: [{ id: 'zt', m30: m, exp30: exp, usual30: 0.1, label30: label }] });
  const recs = [mk('CPI', 'calm', 2, -0.2, -0.2, 'in line'), mk('CPI', 'calm', 1.5, 0.01, -0.15, 'priced in'), mk('CPI', 'stressed', -2, -0.1, 0.2, 'opposite'), mk('NFP', 'calm', 1, -0.1, -0.1, 'in line')];
  const s = summarise(recs), cpi = s.find(r => r.family === 'CPI' && r.regime === 'all'), calm = s.find(r => r.family === 'CPI' && r.regime === 'calm');
  assert.equal(s[0].family, 'ALL'); assert.equal(cpi.n, 3);
  assert.equal(cpi.m30.expected, 0.33); assert.equal(cpi.m30.pricedIn, 0.33); assert.deepEqual(cpi.m30.labels, { 'in line': 1, 'priced in': 1, opposite: 1 });
  assert.equal(cpi.m30.perUnit.zt.n, 3); assert.equal(cpi.m30.perUnit.zt.median, 0.007);
  assert.equal(calm.n, 2); assert.equal(calm.m30.expected, 0.5);
  assert.match(summaryText(s), /^ALL: 4 releases/);
});

console.log(`releaseReaction: ${n} tests passed`);
