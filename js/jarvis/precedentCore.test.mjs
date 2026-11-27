import test from 'node:test';
import assert from 'node:assert/strict';
import { histogram, sizeStats, caveatsFor, resolveKeys, reactionRows, buildPrecedent, downsamplePath, dirWord, STANDING_CAVEAT, askText } from './precedentCore.js';
import { histSvg, sparkSvg, statLine, headerText, askQuestion, bodyHtml } from '../terminal/jarvisModPrecedent.js';

const mk = (i, m30) => ({ id: `e${i}`, family: 'CPI', name: 'CPI', status: 'history', t: new Date(Date.UTC(2024, 0, 1 + i * 10)).toISOString(), M: { nq: m30 == null ? null : { m30 } } });

test('histogram bins, clips ends, conserves count', () => {
  const h = histogram([-5, -0.2, 0, 0.3, 0.3, 9]);
  assert.equal(h.length, 12); assert.equal(h.reduce((a, b) => a + b.count, 0), 6);
  assert.equal(h[0].count, 1); assert.ok(h[0].clipped); assert.equal(h[11].count, 1);
  assert.equal(h.find(b => b.lo === 0).count, 3);
});
test('sizeStats: shareUp only at n>=30', () => {
  const a = Array.from({ length: 29 }, (_, i) => (i % 2 ? 1 : -1));
  assert.equal(sizeStats(a, 0.4).shareUp, null);
  assert.equal(sizeStats([...a, 1], 0.4).shareUp, 0.5);
  assert.equal(sizeStats([1, 2, 3, 4], 0.4).medianAbs, 2.5);
});
test('caveats: standing always, thin and empty flagged', () => {
  assert.equal(caveatsFor({ n: 50, family: 'CPI', market: 'nq' })[0], STANDING_CAVEAT);
  assert.ok(caveatsFor({ n: 3, family: 'CPI', market: 'nq' }).some(c => /Thin/.test(c)));
  assert.ok(caveatsFor({ n: 0, family: 'CPI', market: 'nq' }).some(c => /No stored/.test(c)));
  assert.ok(!caveatsFor({ n: 20, family: 'CPI', market: 'nq' }).some(c => /Thin/.test(c)));
});
test('resolveKeys and dirWord', () => {
  assert.deepEqual(resolveKeys('nfp', 'nasdaq'), { family: 'NFP', market: 'nq' });
  assert.deepEqual(resolveKeys('xx', 'yy'), { family: null, market: null });
  assert.equal(dirWord(0.05), 'flat'); assert.equal(dirWord(-1), 'down'); assert.equal(dirWord(1), 'up');
});
test('buildPrecedent: last five, units, missing path counted', async () => {
  const rows = Array.from({ length: 10 }, (_, i) => mk(i, (i % 2 ? 1 : -1) * (0.2 + i * 0.05)));
  assert.equal(reactionRows(rows, 'CPI', 'nq').length, 10);
  const v = await buildPrecedent(rows, 'CPI', 'nq', async id => (id === 'e9' ? null : { nq: { step: 1, v: Array.from({ length: 271 }, (_, i) => i * 0.001) } }));
  assert.equal(v.n, 10); assert.equal(v.last.length, 5); assert.equal(v.last[0].id, undefined); assert.equal(v.last[0].path, null);
  assert.equal(v.last[1].path.length, 28); assert.ok(v.caveats.some(c => /no stored minute path/.test(c)));
  assert.equal(v.stats.shareUp, null); assert.ok(v.stats.p90 >= v.stats.medianAbs);
  assert.ok(askText(v).includes('no forecast'));
});
test('thin pair returns what exists', async () => {
  const v = await buildPrecedent([mk(0, 0.3), mk(1, -0.2)], 'CPI', 'nq', async () => null);
  assert.equal(v.n, 2); assert.equal(v.unit, '% of price'); assert.ok(v.caveats.some(c => /Thin/.test(c)));
});
test('downsamplePath needs a unit', () => { assert.equal(downsamplePath({ step: 1, v: [1] }, 0), null); });
test('SVG builders escape and render', () => {
  const s = histSvg([{ lo: -0.5, hi: 0, count: 2 }, { lo: 0, hi: 0.5, count: 4 }]);
  assert.ok(s.startsWith('<svg') && s.includes('<rect') && !/#[0-9a-f]{3,6}/i.test(s));
  assert.ok(sparkSvg([0, 1, -1, null, 2]).includes('<path'));
  assert.ok(sparkSvg([]).startsWith('<svg'));
  assert.ok(bodyHtml({ error: '<b>x' }).includes('&lt;b&gt;'));
  assert.ok(headerText({ n: 12 }).includes('last 12') && headerText({ n: 12 }).includes('not a forecast'));
  assert.ok(statLine({ n: 3, unit: 'u', stats: { medianAbs: 1, p25: 0.5, p75: 1.5, p90: 2, shareUp: null } }).includes('N 3'));
  assert.equal(askQuestion({ n: 0 }), '');
});

test('point in time: a replay as of a past date sizes its unit from releases printed by then only (Helix review 0.8)', async () => {
  const { unitFor } = await import('../eventReplayCore.js');
  const rows = Array.from({ length: 12 }, (_, i) => mk(i, i < 6 ? 0.2 : 2));          // the six later releases moved ten times as much
  const asOf = Date.parse(rows[5].t) + 60e3;
  assert.equal(unitFor(rows, 'CPI', 'nq', asOf), 0.2, 'only the first six are known then');
  assert.ok(unitFor(rows, 'CPI', 'nq') > 1, 'with no date, every printed release counts (the live terminal)');
  const v = await buildPrecedent(rows, 'CPI', 'nq', async () => null, asOf);
  assert.equal(v.n, 6); assert.equal(v.stats.typical30mMove, 0.2);
});
