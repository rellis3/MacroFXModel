// Curve board: the shaping (curveBoardCore.js) and the HTML (terminal/curveBoardView.js).
//   node js/curveBoardCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCurveBoard, describeCurve, shapeMove } from './curveBoardCore.js';
import { boardHtml } from './terminal/curveBoardView.js';
import { ridgeCurves, pctRails } from './terminal/boardViz.js';
import { moreFixtures } from './terminal/moreBoards.fixtures.mjs';

const NOW = Date.parse('2026-11-13T12:00:00Z');
const CB = () => buildCurveBoard({ ...moreFixtures.curve(NOW), now: NOW });

test('curve moves are named the way the market names them: bull = yields fell', () => {
  assert.equal(shapeMove(-20, -5).key, 'bullsteep');      // front fell most, long fell less: steeper, yields down
  assert.equal(shapeMove(5, 20).key, 'bearsteep');
  assert.equal(shapeMove(-5, -20).key, 'bullflat');
  assert.equal(shapeMove(20, 5).key, 'bearflat');
  assert.equal(shapeMove(10, 11).key, 'up');
  assert.equal(shapeMove(-10, -11).key, 'down');
  assert.equal(shapeMove(1, 2).key, 'still');
  assert.equal(shapeMove(null, 3), null);
});

test('the payload: 36 month-end curves plus today, six slopes with three percentiles, the weekly memory, both coupling reads', () => {
  const cb = CB();
  assert.equal(cb.ok, true);
  assert.equal(cb.tenors.join(), 'FF,2y,5y,10y,30y');
  assert.ok(cb.curves.length >= 30 && cb.curves.length <= 37, `curves ${cb.curves.length}`);
  assert.equal(cb.curves.at(-1).date, cb.asOf);
  assert.ok(cb.curves.every(c => c.pts.length === 5));
  assert.deepEqual(cb.slopes.map(s => s.k), ['2s10s', '2s30s', '10s30s', '5s30s', '2s5s', 'ff2y']);
  const a = cb.slopes[0]; assert.equal(a.bp, Math.round((5.10 - 4.86) * 100));
  assert.ok(a.pct3y >= 0 && a.pct3y <= 100 && a.pct5y >= 0 && a.pct1y >= 0);
  assert.ok(cb.memory.weeks.length > 100 && cb.memory.weeks.length < 160);
  assert.equal(cb.memory.tally.reduce((s, t) => s + t.n, 0), cb.memory.weeks.length);
  assert.equal(cb.coupling.ten.state, 'decoupled'); assert.equal(cb.coupling.two.state, 'divergent');
  assert.equal(cb.episodes.n, 17); assert.equal(cb.episodes.tally4.follow + cb.episodes.tally4.revert + cb.episodes.tally4.other, 17);
});

test('the sentence names the slopes and the 20-day move and never forecasts', () => {
  const s = describeCurve(CB());
  assert.match(s, /^2s10s is [+−]?\d+bp/);
  assert.match(s, /2s30s/); assert.match(s, /10s30s/);
  assert.match(s, /inverted in \d+ of the last \d+ weeks/);
  assert.doesNotMatch(s, /forecast|will|signal|expect|buy|sell/i);
});

test('missing series say so; a missing coupling feed just drops that card', () => {
  assert.equal(buildCurveBoard({ S: {} }).ok, false);
  const f = moreFixtures.curve(NOW), cb = buildCurveBoard({ S: f.S, coupling: null, episodes: null, now: NOW });
  assert.equal(cb.coupling, null); assert.equal(cb.episodes, null);
  const html = boardHtml(cb);
  assert.match(html, /data-surface="panel\.macro\.curve"/); assert.doesNotMatch(html, /turn log/);
  assert.match(boardHtml({ ok: false, error: 'the Treasury series are not loaded yet' }), /not loaded yet.*stands on its own/);
});

test('the drawings: ridge needs three curves, rails need a percentile; no hard-coded colour; the board carries the null evidence', () => {
  assert.equal(ridgeCurves({ curves: [], tenors: ['2y', '10y'] }), '');
  assert.equal(pctRails([{ label: 'x', pct: null }]), '');
  const cb = CB(), html = boardHtml(cb);
  assert.match(html, /<svg[^>]*aria-label="The yield curve through time/);
  assert.match(html, /curve-inversion/); assert.match(html, /spread-episodes-eurusd/);
  assert.doesNotMatch(html, /#[0-9a-f]{3,6}\b|rgb\(/i);
  assert.match(html, /decoupled/i);
});
