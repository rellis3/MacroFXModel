// Regime board: the shaping (regimeBoardCore.js) and the HTML (terminal/regimeBoardView.js).
//   node js/regimeBoardCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRegimeBoard, correlationRegime, describeRegime, quadrantCell } from './regimeBoardCore.js';
import { boardHtml, quadrantSvg } from './terminal/regimeBoardView.js';
import { moreFixtures } from './terminal/moreBoards.fixtures.mjs';

const NOW = Date.parse('2026-11-13T12:00:00Z');
const RB = () => buildRegimeBoard({ ...moreFixtures.regime(NOW), now: NOW });

test('the quadrant names light the right cell', () => {
  assert.deepEqual(quadrantCell('Goldilocks'), { growth: 'up', inflation: 'down', cell: 'goldilocks' });
  assert.equal(quadrantCell('Stagflation').cell, 'stagflation');
  assert.equal(quadrantCell('Reflation').growth, 'up');
  assert.equal(quadrantCell('Slowdown').cell, 'deflation');
  assert.equal(quadrantCell('something new').cell, null);
});

test('the correlation regime follows the board rule: z against each pair\'s own normal, HIGH at 1, LOW at -1', () => {
  const mk = (v, mu = 0.4, sd = 0.15) => { const lc = {}, av = {}, s = {}; for (let i = 0; i < 8; i++) { lc[`p${i}`] = v; av[`p${i}`] = mu; s[`p${i}`] = sd; } return { last_corr: lc, avg_corr: av, corr_std: s }; };
  assert.equal(correlationRegime(mk(0.7)).state, 'HIGH');
  assert.equal(correlationRegime(mk(0.4)).state, 'NORMAL');
  assert.equal(correlationRegime(mk(0.1)).state, 'LOW');
  assert.equal(correlationRegime(mk(-0.7)).state, 'HIGH', 'a strongly negative pair is as correlated as a strongly positive one');
  assert.equal(correlationRegime({ last_corr: { a: 0.9 } }), null, 'fewer than six pairs says nothing');
  assert.equal(correlationRegime(null), null);
});

test('the payload keeps the lenses, risk flags, vol counts, the HMM tally and the edges; the theory\'s expected moves are dropped', () => {
  const rb = RB();
  assert.equal(rb.ok, true);
  assert.equal(rb.frames.length, 7);
  assert.equal(rb.quadrant.cell, 'goldilocks');
  assert.equal(rb.risk.level, 'CALM'); assert.equal(rb.risk.flags.length, 5);
  assert.ok(rb.vol.hot >= 2 && rb.vol.cold >= 2);
  assert.equal(rb.hmm.quiet + rb.hmm.active, rb.hmm.n);
  assert.ok(rb.hist.rows[0].active >= rb.hist.rows.at(-1).active, 'most active first');
  assert.equal(rb.edges.length, 3);
  assert.doesNotMatch(JSON.stringify(rb), /"expected"|expectations/, 'no asset is told to go up or down');
});

test('the sentence reports readings, says what quiet means, and never forecasts', () => {
  const s = describeRegime(RB());
  assert.match(s, /Growth × inflation reads Goldilocks/);
  assert.match(s, /risk state is calm \(0 of 5 flags on\)/);
  assert.match(s, /correlations are (about normal|unusually)/);
  assert.match(s, /not which way price goes next/);
  assert.doesNotMatch(s, /forecast|will|buy|sell|long|short|signal/i);
});

test('no feeds at all says so; with only some feeds the board still draws what it has', () => {
  assert.equal(buildRegimeBoard({}).ok, false);
  const f = moreFixtures.regime(NOW), only = buildRegimeBoard({ hedge: f.hedge, now: NOW });
  assert.equal(only.ok, true); assert.equal(only.frames.length, 0);
  assert.doesNotThrow(() => boardHtml(only));
  assert.match(boardHtml({ ok: false, error: 'the market state document is not built yet' }), /not built yet/);
});

test('the board: own surface, quiet-not-directionless wording, lit flags, null evidence, tokens only', () => {
  const html = boardHtml(RB());
  assert.match(html, /data-surface="panel\.macro\.regime"/);
  assert.match(html, /Quiet means moves have been small and mean-reverting, not that price has no direction/);
  assert.match(html, /gr-hmm-trend-direction/);
  assert.match(html, /aria-label="Growth and inflation quadrant: Goldilocks"/);
  assert.equal(quadrantSvg({ cell: null }), '');
  assert.doesNotMatch(html, /#[0-9a-f]{3,6}\b|rgb\(/i);
  assert.doesNotMatch(html, /go long|go short|buy |sell /i);
});
