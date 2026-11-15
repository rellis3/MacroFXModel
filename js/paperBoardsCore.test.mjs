// node js/paperBoardsCore.test.mjs
import assert from 'node:assert/strict';
import * as C from './paperBoardsCore.js';
import { zonedEpoch } from './yieldLegs.js';

let n = 0; const ok = (name, fn) => { try { fn(); n++; console.log('✓', name); } catch (e) { console.error('✗', name, '\n ', e.message); process.exitCode = 1; } };
const lcg = seed => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const gauss = r => { const u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const day = i => new Date(Date.UTC(2024, 0, 1) + i * 864e5).toISOString().slice(0, 10);

ok('parseMofCurve reads 2/10/20/30/40y, skips notes, sorts and dedupes', () => {
  const t = 'Interest Rate (November 2026),,,,\nDate,1Y,2Y,10Y,20Y,30Y,40Y\n2026/11/4,1.6,1.89,2.85,3.69,3.97,3.99\n2026/11/2,1.6,1.88,2.81,3.66,3.94,3.96\n2026/11/4,1.6,1.89,2.85,3.69,3.97,3.99\n(Note) something';
  const r = C.parseMofCurve(t);
  assert.equal(r.length, 2); assert.equal(r[0].date, '2026-11-02'); assert.equal(r[1]['40Y'], 3.99); assert.deepEqual(C.mofTenors(t), ['1Y', '2Y', '10Y', '20Y', '30Y', '40Y']);
  assert.equal(C.parseMofCurve(t, ['2Y', '25Y'])[0]['25Y'], undefined);          // a tenor the file lacks is simply absent
});

const jgbRows = (n, f) => Array.from({ length: n }, (_, i) => ({ date: day(i), ...f(i) }));
ok('jgbShock: a quiet curve lights nothing', () => {
  const r = lcg(1), rows = jgbRows(400, i => ({ '2Y': 1 + 0.002 * Math.sin(i / 9) + 0.001 * gauss(r), '10Y': 2 + 0.002 * Math.sin(i / 7), '30Y': 3 }));
  const s = C.jgbShock(rows); assert.equal(s.lights.short.on, false); assert.equal(s.lights.type.value, 'quiet');
});
ok('jgbShock: a front-end jump trips the short-end light and is typed front end', () => {
  const r = lcg(2), rows = jgbRows(400, i => ({ '2Y': 1 + 0.01 * gauss(r) + (i >= 396 ? 0.25 * (i - 395) / 4 : 0), '10Y': 2 + 0.01 * gauss(r), '30Y': 3 + 0.01 * gauss(r) }));
  const s = C.jgbShock(rows); assert.equal(s.lights.short.on, true); assert.equal(s.lights.type.value, 'front end'); assert.ok(s.lights.short.bp > 15);
});
ok('jgbShock: too little history is null, not a guess', () => assert.equal(C.jgbShock(jgbRows(50, () => ({ '2Y': 1, '10Y': 2 }))), null));

ok('fomcEventTimes: 14:00 and 14:30 ET in UTC across the DST switch, next meeting found', () => {
  const m = [{ date: '2026-10-28', sep: false }, { date: '2026-12-09', sep: true }];
  const r = C.fomcEventTimes(m, Date.UTC(2026, 10, 14), zonedEpoch);
  assert.equal(r.next.date, '2026-12-09');
  assert.equal(new Date(r.rows[0].statementMs).toISOString(), '2026-10-28T18:00:00.000Z');       // EDT, UTC-4
  assert.equal(new Date(r.next.statementMs).toISOString(), '2026-12-09T19:00:00.000Z');          // EST, UTC-5
  assert.equal(r.next.pressLondon, '19:30'); assert.equal(r.rows[0].pressLondon, '18:30');
});

ok('policyUncertainty: percentile, z and changes; short series flagged not ok', () => {
  const pts = Array.from({ length: 100 }, (_, i) => ({ date: day(i * 30), value: 100 + i }));
  const [a, b] = C.policyUncertainty([{ id: 'X', label: 'x', freq: 'monthly', pts }, { id: 'Y', label: 'y', freq: 'monthly', pts: pts.slice(0, 5) }]);
  assert.equal(a.ok, true); assert.equal(a.pct5y, 100); assert.equal(a.chg3, 3); assert.equal(b.ok, false);
});

ok('auctionResults: yield change and bid-to-cover change against the previous auction of the same term, bills dropped', () => {
  const row = (d, term, hy, btc, type = 'Note') => ({ auctionDate: d + 'T00:00:00', securityType: type, securityTerm: term, highYield: String(hy), bidToCoverRatio: String(btc), offeringAmount: '42000000000', subtotalCompetitiveParAwardedInsideOfOfferingAmount: '40000000000', indirectBiddersCompetitiveParAwarded: '24000000000', directBiddersCompetitiveParAwarded: '8000000000' });
  const r = C.auctionResults([row('2026-10-08', '10-Year', 4.95, 2.5), row('2026-11-10', '10-Year', 5.02, 2.46), row('2026-11-09', '13-Week', 4.1, 3, 'Bill')]);
  assert.equal(r.length, 2); assert.equal(r[0].date, '2026-11-10'); assert.equal(r[0].dYieldBp, 7); assert.equal(r[0].dBidToCover, -0.04);
  assert.equal(r[0].indirectPct, 60); assert.equal(r[0].directPct, 20); assert.equal(r[0].dealerPct, 20); assert.equal(r[1].dYieldBp, null);
});

ok('spilloverOnce: independent series have low total connectedness', () => {
  const r = lcg(3), R = Array.from({ length: 400 }, () => Array.from({ length: 6 }, () => gauss(r)));
  const s = C.spilloverOnce(R, 10); assert.ok(s.total < 22, `total ${s.total}`);
  s.theta.forEach(row => assert.ok(Math.abs(row.reduce((a, b) => a + b, 0) - 1) < 1e-9));       // rows are normalised
});
ok('spilloverOnce: a leader that drives the others transmits more than it receives', () => {
  const r = lcg(4), N = 5, R = []; let prev = new Array(N).fill(0);
  for (let t = 0; t < 600; t++) { const x = new Array(N).fill(0); x[0] = gauss(r); for (let j = 1; j < N; j++) x[j] = 0.8 * prev[0] + 0.3 * gauss(r); R.push(x); prev = x; }
  const s = C.spilloverOnce(R, 10); assert.ok(s.total > 25, `total ${s.total}`); assert.ok(s.net[0] > 10, `net0 ${s.net[0]}`); assert.ok(s.net.slice(1).every(v => v < s.net[0]));
  assert.ok(Math.abs(s.net.reduce((a, b) => a + b, 0)) < 1e-6);                                  // net transmission sums to zero
});
ok('connectedness: aligns on shared dates, returns nodes, links, history and a method label', () => {
  const r = lcg(5), mk = (kind, lvl) => { let v = lvl; return { kind, pts: Array.from({ length: 420 }, (_, i) => { v = kind === 'diff' ? v + gauss(r) * 0.05 : v * Math.exp(gauss(r) * 0.01); return { date: day(i), value: v }; }) }; };
  const out = C.connectedness({ A: mk('ret', 100), B: mk('ret', 50), C: mk('diff', 4), D: mk('ret', 1.1), E: mk('diff', 15), F: mk('ret', 10) }, { win: 150, hist: 120, step: 20 });
  assert.equal(out.nodes.length, 6); assert.ok(out.history.length >= 5); assert.ok(out.total >= 0 && out.total <= 100); assert.match(out.method, /Diebold-Yilmaz/); assert.equal(out.links.length, 30);
  assert.equal(C.connectedness({ A: mk('ret', 1) }), null);
});

ok('couplingRing: a currency that follows its commodity reads coupled; the sign flip handles USDCAD-style quotes', () => {
  const r = lcg(6); let c = 100, f = 1; const com = [], fx = [], inv = [];
  for (let i = 0; i < 400; i++) { const m = gauss(r) * 0.01; c *= Math.exp(m); f *= Math.exp(0.7 * m + 0.3 * gauss(r) * 0.01); com.push({ date: day(i), value: c }); fx.push({ date: day(i), value: f }); inv.push({ date: day(i), value: 1 / f }); }
  const [a, b] = C.couplingRing([{ ccy: 'AUD', fx, com, comLabel: 'copper', sign: 1 }, { ccy: 'CAD', fx: inv, com, comLabel: 'oil', sign: -1 }]);
  assert.ok(a.corr > 0.5, `corr ${a.corr}`); assert.ok(Math.abs(a.corr - b.corr) < 0.01); assert.ok(a.pct >= 0 && a.pct <= 100 && a.lo <= a.median && a.median <= a.hi);
});

ok('coverageByState: splits by the stress set, binomial z carried, n always shown', () => {
  const mk = hit => Array.from({ length: 300 }, (_, i) => ({ date: day(i), hl50: hit(i), hl75: hit(i) }));
  const stress = new Set(Array.from({ length: 300 }, (_, i) => i).filter(i => i % 5 === 0).map(day));
  const out = C.coverageByState({ X: mk(i => i % 4 !== 0) }, stress);
  const x = out.per[0]; assert.equal(x.last.hl75.n, 60); assert.ok(x.stressed.hl75.n > 0 && x.calm.hl75.n > x.stressed.hl75.n); assert.equal(out.pooled.last.hl75.n, 60);
  assert.ok(Number.isFinite(x.last.hl75.z));
});
ok('dailyHits uses the forecaster\'s own bands and no look-ahead is added here', () => {
  const bars = Array.from({ length: 120 }, (_, i) => ({ date: day(i), open: 100, high: 101 + (i % 3), low: 99, close: 100 }));
  const deps = { volSigmaSeries: b => b.map(() => 0.01), computeBands: (o, s) => ({ hl50: o * s * 1.5, hl75: o * s * 2.5 }) };
  const h = C.dailyHits(bars, 'fx', deps, { warmup: 60 });
  assert.equal(h.length, 60); assert.equal(typeof h[0].hl75, 'boolean');
});
ok('stressDates: the day AFTER a high-VIX close is the stress-follow day; threshold returned', () => {
  const vix = Array.from({ length: 400 }, (_, i) => ({ date: day(i), value: i === 300 ? 60 : 15 + (i % 10) * 0.5 }));
  const s = C.stressDates(vix, 0.9); assert.ok(s.set.has(day(301))); assert.ok(s.threshold > 15); assert.equal(C.stressDates([], 0.8).set.size, 0);
});

ok('oiWallDistance: walls in expected daily moves from the futures price; skips markets without an expected move', () => {
  const data = { 'EUR/USD': { futures: 1.1037, spot: 1.10216, expectedMove: { daily: 0.0028 }, callWalls: [{ strike: 1.11096 }], putWalls: [{ strike: 1.0959 }], callWall: 1.11096, putWall: 1.0959, gammaFlip: 1.1158, maxPain: 1.12 }, X: { spot: 1 } };
  const r = C.oiWallDistance(data); assert.equal(r.length, 1); assert.equal(r[0].refSource, 'futures'); assert.equal(r[0].callWallD, 2.6); assert.ok(r[0].putWallD < 0); assert.equal(r[0].nearestUpD, 2.6);
});
ok('pathDifferential: base minus quote at 3/6/12 months and the week\'s change; missing banks drop the pair', () => {
  const cb = { asOf: 'x', banks: { USD: { m3: { bp: 14, weekBp: 0 }, m6: { bp: 30, weekBp: 1 }, m12: { bp: 43, weekBp: -2 } }, EUR: { m3: { bp: 16, weekBp: 0 }, m6: { bp: 30, weekBp: -3 }, m12: { bp: 50, weekBp: -11 } } } };
  const r = C.pathDifferential(cb); const e = r.rows.find(x => x.pair === 'EURUSD'); assert.equal(e.m3, 2); assert.equal(e.m6, 0); assert.equal(e.m12, 7); assert.equal(e.w12, -9);
  assert.equal(r.rows.find(x => x.pair === 'GBPUSD'), undefined);
});
ok('inflationBoard: 5y5y level and percentile; core PCE year-on-year and 3-month annualised from an index', () => {
  const f = Array.from({ length: 400 }, (_, i) => ({ date: day(i), value: 2 + 0.001 * i })), pce = Array.from({ length: 30 }, (_, i) => ({ date: day(i * 30), value: 100 * Math.pow(1.03, i / 12) }));
  const o = C.inflationBoard({ bei5y5y: f, corePce: pce }); assert.equal(o.fwd5y5y.pct5y, 100); assert.ok(Math.abs(o.corePce.yoy - 3) < 0.01); assert.ok(Math.abs(o.corePce.ann3m - 3) < 0.05);
  assert.equal(C.inflationBoard({}).corePce, null);
});
ok('skewHistory: marks the May 2022 break and splits the means; short series null', () => {
  const s = Array.from({ length: 2000 }, (_, i) => ({ date: new Date(Date.UTC(2019, 0, 1) + i * 864e5).toISOString().slice(0, 10), value: i < 1200 ? 130 : 145 }));
  const o = C.skewHistory(s); assert.equal(o.brk.date, '2022-05-11'); assert.ok(o.preMean < o.postMean); assert.ok(o.series.length <= 410); assert.equal(C.skewHistory(s.slice(0, 50)), null);
});
ok('trendBasket thins the equity curve and carries the out-of-sample record', () => {
  const tb = { params: {}, last: 'x', splitDate: 's', oos: { sharpe: 0.08 }, benchmark: { sharpe: -0.11 }, current: [{ ccy: 'AUD', trend: 1 }], ccys: ['AUD'], equity: Array.from({ length: 3000 }, (_, i) => ({ t: day(i), v: 1 + i / 1000 })) };
  const o = C.trendBasket(tb); assert.ok(o.equity.length <= 310); assert.equal(o.oos.sharpe, 0.08); assert.equal(C.trendBasket({}), null);
});

console.log(`\n${n} passed`);
