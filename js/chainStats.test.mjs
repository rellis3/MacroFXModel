// Tests for js/chainStats.js: lead/lag, rolling correlation and divergence on synthetic series with known structure.
// Run: node js/chainStats.test.mjs
import assert from 'node:assert/strict';
import { alignLevels, changesOf, alignedChanges, corr, rollingCorr, crossCorr, leadLag, ols, divergence, trendWord, divergenceLine, linkStats, buildChainStats } from './chainStats.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

// seeded normal draws (mulberry32 + Box-Muller), so every run sees the same series
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
function normals(seed, len) { const u = rng(seed), out = []; while (out.length < len) { const a = Math.max(u(), 1e-12), b = u(); out.push(Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b)); } return out; }
const dates = len => Array.from({ length: len }, (_, i) => new Date(Date.UTC(2022, 0, 3) + i * 864e5).toISOString().slice(0, 10));
// changes -> a level series (pt unit: cumulative sum)
const levels = (ch, d, start = 100) => { let v = start; return [{ date: d[0], value: v }, ...ch.map((c, i) => ({ date: d[i + 1], value: (v += c) }))]; };

t('alignLevels keeps common dates in order; changesOf applies the unit', () => {
  const A = alignLevels([{ date: '2026-01-02', value: 1 }, { date: '2026-01-01', value: 2 }, { date: '2026-01-03', value: 3 }], [{ date: '2026-01-03', value: 30 }, { date: '2026-01-01', value: 10 }]);
  assert.deepEqual(A, { dates: ['2026-01-01', '2026-01-03'], x: [2, 3], y: [10, 30] });
  assert.deepEqual(changesOf([4.0, 4.25], 'bp'), [25]);
  assert.ok(Math.abs(changesOf([100, 110], 'pct')[0] - Math.log(1.1) * 100) < 1e-9);
  assert.deepEqual(changesOf([10, 7], 'pt'), [-3]);
  // a missing day on one side is spanned by the level difference, not dropped into a one-day change
  const AC = alignedChanges([{ date: 'a', value: 1 }, { date: 'b', value: 2 }, { date: 'c', value: 4 }], [{ date: 'a', value: 10 }, { date: 'c', value: 13 }], 'pt', 'pt');
  assert.deepEqual(AC.x, [3]); assert.deepEqual(AC.y, [3]); assert.deepEqual(AC.dates, ['c']);
});

t('corr and rollingCorr: a series correlated in the first half and independent in the second', () => {
  const N = 400, x = normals(1, N), e = normals(2, N), y = x.map((v, i) => (i < 200 ? 0.9 * v + 0.3 * e[i] : e[i]));
  const rc = rollingCorr(x, y, 60);
  assert.equal(rc[58], null); assert.ok(rc[59] > 0.9, String(rc[59]));
  assert.ok(Math.abs(rc[N - 1]) < 0.3, String(rc[N - 1]));
  assert.equal(corr([1, 2], [1, 2]), null);
  assert.ok(Math.abs(corr([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-12);
});

t('crossCorr: lag k > 0 pairs x(t) with y(t+k), and every lag carries its own n', () => {
  const x = normals(3, 300), e = normals(4, 300), y = x.map((_, i) => (i >= 2 ? 0.8 * x[i - 2] : 0) + 0.4 * e[i]);
  const cc = crossCorr(x, y, 5);
  assert.equal(cc.length, 11);
  const best = [...cc].sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0];
  assert.equal(best.lag, 2); assert.equal(cc.find(c => c.lag === 2).n, 298); assert.equal(cc.find(c => c.lag === 0).n, 300);
});

t('leadLag finds the upstream lead, the downstream lead, a same-day link and no link', () => {
  const N = 504, x = normals(5, N), e = normals(6, N);
  const yLag = x.map((_, i) => (i >= 2 ? 0.6 * x[i - 2] : 0) + e[i]);
  const up = leadLag(x, yLag);
  assert.equal(up.verdict, 'upstream leads'); assert.equal(up.best.lag, 2); assert.match(up.text, /leads by 2 days/);
  assert.ok(up.band > 0.1 && up.band < 0.14, String(up.band));   // ~2.81/sqrt(502)
  const xLed = x.map((_, i) => (i >= 3 ? 0.6 * yLag[i - 3] : 0) + e[i]);   // here the "upstream" series follows the other by 3 days
  const dn = leadLag(xLed, yLag);
  assert.equal(dn.verdict, 'downstream leads'); assert.equal(dn.best.lag, -3);
  const same = leadLag(x, x.map((v, i) => 0.7 * v + e[i]));
  assert.equal(same.verdict, 'same day'); assert.ok(same.lag0 > 0.4);
  const none = leadLag(x, e);
  assert.equal(none.verdict, 'no clear link');
  assert.equal(leadLag([1, 2, 3], [3, 2, 1]).verdict, 'too short');
});

t('leadLag does not call a lead on independent noise across many seeds (the corrected band holds)', () => {
  let false_ = 0;
  for (let s = 0; s < 60; s++) if (leadLag(normals(100 + s, 300), normals(500 + s, 300)).verdict.includes('leads')) false_++;
  assert.ok(false_ <= 8, `${false_} of 60 independent pairs called a lead`);   // ~5% expected; an uncorrected 2/sqrt(n) band gives ~40%
});

t('ols recovers a known beta; divergence fits on the days BEFORE the window', () => {
  const N = 300, x = normals(7, N), e = normals(8, N), y = x.map((v, i) => 2 * v + 0.5 * e[i]);
  const f = ols(x, y); assert.ok(Math.abs(f.beta - 2) < 0.1 && Math.abs(f.sd - 0.5) < 0.08, JSON.stringify(f));
  // the last 20 days: x rises steadily, y does not follow -> a large negative z
  const x2 = [...x.slice(0, 280), ...Array(20).fill(0.5)], y2 = [...y.slice(0, 280), ...e.slice(280).map(v => 0.5 * v)];
  const d = divergence(x2, y2, { win: 20, fitDays: 120 });
  assert.ok(d.z < -6, String(d.z));   // implied ~+20 against sd ~0.5 x sqrt(20) assert.equal(d.fitN, 120); assert.ok(Math.abs(d.beta - 2) < 0.2);
  assert.ok(Math.abs(d.implied - 20) < 3, String(d.implied));
  // the link keeping to its beta reads near zero
  const ok = divergence(x, y, { win: 20 }); assert.ok(Math.abs(ok.z) < 2.5, String(ok.z));
  assert.equal(divergence([1, 2, 3], [1, 2, 3], { win: 20 }), null);
});

t('trendWord reads the 60-day correlation in the textbook direction', () => {
  assert.equal(trendWord(-0.05, 0.4, 0.5, +1).word, 'breaking down');
  assert.equal(trendWord(0.05, -0.4, -0.5, -1).word, 'breaking down');   // a negative textbook link going to zero
  assert.equal(trendWord(0.6, 0.3, 0.4, +1).word, 'strengthening');
  assert.equal(trendWord(0.25, 0.5, 0.3, +1).word, 'weakening');
  assert.equal(trendWord(0.31, 0.3, 0.3, +1).word, 'steady');
  assert.equal(trendWord(null, 0.3, 0.3).word, 'unknown');
});

t('divergenceLine says it in plain English, with the usual link\'s implied move', () => {
  const real = { label: 'US real yields', unit: 'bp' }, gold = { label: 'gold', unit: 'pct' };
  const a = divergenceLine({ win: 20, fromMove: 25, toMove: Math.log(1.012) * 100, implied: Math.log(0.97) * 100, z: 2.31 }, real, gold);
  assert.equal(a, 'US real yields up 25bp in 20 days, but gold rose 1.2% where the usual link implies -3.0%: 2.3σ away from the usual link.');
  const b = divergenceLine({ win: 1, fromMove: -10, toMove: 0.05, implied: 1.5, z: -2.6 }, real, gold);
  assert.match(b, /^US real yields down 10bp in 1 day, but gold barely moved/);
  const c = divergenceLine({ win: 5, fromMove: 10, toMove: -6, implied: -2, z: -3 }, real, gold);
  assert.match(c, /and gold fell .*more than the -2\.0% the usual link implies/);
});

t('linkStats and buildChainStats on level series: a coupled link, a breaking one and a missing one', () => {
  const N = 800, d = dates(N + 1), x = normals(11, N), e = normals(12, N);
  const yHold = x.map((v, i) => -0.8 * v + 0.4 * e[i]);                              // a textbook -1 link that holds
  const yBreak = x.map((v, i) => (i < N - 60 ? -0.8 * v + 0.4 * e[i] : 0.5 * e[i]));   // the same link, decoupled for the last 60 days
  const series = { real: levels(x.map(v => v * 0.05), d, 2), gold: levels(yHold, d), nq: levels(yBreak, d) };
  const nodes = { real: { label: 'Real yield', unit: 'bp' }, gold: { label: 'Gold', unit: 'pt' }, nq: { label: 'Nasdaq', unit: 'pt' }, oil: { label: 'Oil', unit: 'pct' } };
  const links = [{ id: 'real-gold', from: 'real', to: 'gold', sign: -1 }, { id: 'real-nq', from: 'real', to: 'nq', sign: -1 }, { id: 'oil-gold', from: 'oil', to: 'gold', sign: -1 }];
  const B = buildChainStats({ series, links, nodes });
  const g = B.links['real-gold'], q = B.links['real-nq'];
  assert.ok(g.ok && g.corr[60].now < -0.8 && g.corr[120].avg2y < -0.8, JSON.stringify(g.corr));
  assert.equal(g.trend, 'steady'); assert.equal(g.leadLag.verdict, 'same day'); assert.equal(g.textbookSign, 'holds on average');
  assert.equal(q.trend, 'breaking down'); assert.ok(Math.abs(q.corr[60].now) < 0.3);
  assert.deepEqual(B.breaking.map(b => b.id), ['real-nq']);
  assert.equal(B.links['oil-gold'].ok, false); assert.deepEqual(B.missing, ['oil-gold']);
  assert.ok(g.n === N && g.asOf === d[N]);
  for (const w of [1, 5, 20]) assert.ok(Number.isFinite(g.divergence[w].z));
  assert.equal(linkStats(series.real.slice(0, 50), series.gold.slice(0, 50), nodes.real, nodes.gold, -1).ok, false);
});

t('a fresh 20-day divergence shows up in the divergence list with its line', () => {
  const N = 600, d = dates(N + 1), x = normals(21, N), e = normals(22, N);
  const xs = [...x.slice(0, N - 20), ...Array(20).fill(1.2)];                      // the upstream end trends up for 20 days
  const y = xs.map((v, i) => (i < N - 20 ? -1 * v + 0.5 * e[i] : 0.5 * e[i]));     // the downstream end ignores it
  const series = { real: levels(xs, d, 50), gold: levels(y, d, 500) };
  const B = buildChainStats({ series, links: [{ id: 'real-gold', short: 'real yields → gold', from: 'real', to: 'gold', sign: -1 }], nodes: { real: { label: 'US real yields', unit: 'pt' }, gold: { label: 'gold', unit: 'pt' } } });
  const s = B.links['real-gold'];
  assert.ok(s.z >= 2.5, String(s.z)); assert.equal(s.zWin, 20);
  assert.match(s.line, /^US real yields up 24\.0 pt in 20 days, but gold/);
  assert.equal(B.divergences[0].id, 'real-gold'); assert.equal(B.divergences[0].alert, true);
});

console.log(`chainStats: ${n} tests passed`);
