// Vol board: the shaping (volBoardCore.js), the radar drawing and the HTML (terminal/volBoardView.js).
//   node js/volBoardCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVolBoard, describeVol, GAUGES } from './volBoardCore.js';
import { boardHtml } from './terminal/volBoardView.js';
import { radar } from './terminal/boardViz.js';
import { moreFixtures } from './terminal/moreBoards.fixtures.mjs';

const NOW = Date.parse('2026-11-13T12:00:00Z');
const VB = () => buildVolBoard({ ...moreFixtures.vol(NOW), now: NOW });

test('the payload carries the eight readings with percentiles, the VIX curve, realised vol sorted hottest first and the skew with its age', () => {
  const vb = VB();
  assert.equal(vb.ok, true);
  assert.deepEqual(vb.gauges.map(g => g.id), GAUGES.map(g => g[0]));
  assert.equal(vb.gauges[0].pct5y, 58); assert.ok(vb.gauges[0].spark.length > 50 && vb.gauges[0].spark.length < 100);
  assert.equal(vb.term.ratio, 0.93); assert.equal(vb.term.inverted, false);
  assert.equal(vb.realised.rows[0].sym, 'AUDNZD'); assert.equal(vb.realised.n, 6);
  assert.equal(vb.skew.rows.length, 3, 'a row with no risk reversal is dropped'); assert.equal(vb.skew.ageH, 221.7);
  assert.equal(buildVolBoard({}).ok, false);
});

test('an inverted curve is reported as inverted; the sentence is about size and never forecasts', () => {
  const f = moreFixtures.vol(NOW); f.state.history.long.find(x => x.id === 'VIX_TERM').ctx.last = 1.04;
  const vb = buildVolBoard({ ...f, now: NOW });
  assert.equal(vb.term.inverted, true);
  assert.match(describeVol(vb), /inverted, near-term fear above the three-month/);
  const s = describeVol(VB());
  assert.match(s, /VIX 18\.7 \(58th percentile of five years\)/);
  assert.match(s, /Dearest against its own history: VXEEM \(90th\); cheapest: VXTLT \(22nd\)/);
  assert.match(s, /not which way/);
  assert.doesNotMatch(s, /forecast|will |buy|sell|signal/i);
});

test('the radar needs three axes, marks the median ring and puts the 90th-percentile vertex in gold', () => {
  assert.equal(radar({ axes: [{ label: 'a', pct: 10 }, { label: 'b', pct: 20 }] }), '');
  const svg = radar({ axes: [{ label: 'VIX', pct: 58 }, { label: 'MOVE', pct: 49 }, { label: 'VXEEM', pct: 90 }, { label: 'VXTLT', pct: 22 }] });
  assert.match(svg, /stroke-dasharray="3 3"/); assert.match(svg, /fill="var\(--gold\)"/); assert.match(svg, /VXEEM<tspan/);
});

test('the board: own surface, stale skew flagged, nulls and the range-not-direction wording on the page, tokens only', () => {
  const html = boardHtml(VB());
  assert.match(html, /data-surface="panel\.macro\.vol"/);
  assert.match(html, /laptop pull is old/);
  assert.match(html, /Dear is not a sell and cheap is not a buy/);
  assert.match(html, /skew-fade/); assert.match(html, /vix-inversion/);
  assert.doesNotMatch(html, /#[0-9a-f]{3,6}\b|rgb\(/i);
  assert.doesNotMatch(html, /go long|go short|will (rise|fall)/i);
  assert.match(boardHtml({ ok: false, error: 'the market state document is not built yet' }), /not built yet/);
  assert.doesNotThrow(() => boardHtml(buildVolBoard({ skew: moreFixtures.vol(NOW).skew, now: NOW })));
});
