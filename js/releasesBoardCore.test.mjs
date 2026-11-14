// Releases board: the shaping (releasesBoardCore.js) and the HTML (terminal/releasesBoardView.js).
//   node js/releasesBoardCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReleasesBoard, describeReleases, positions, upcoming, ord } from './releasesBoardCore.js';
import { boardHtml } from './terminal/releasesBoardView.js';
import { moreFixtures } from './terminal/moreBoards.fixtures.mjs';

const NOW = Date.parse('2026-11-13T12:00:00Z');
const RB = () => buildReleasesBoard({ ...moreFixtures.releases(NOW), now: NOW });

test('ordinals read right', () => { assert.deepEqual([1, 2, 3, 4, 11, 12, 21, 82, 0].map(ord), ['1st', '2nd', '3rd', '4th', '11th', '12th', '21st', '82nd', '0th']); });

test('positions are long-the-currency and crowded needs the percentile AND the sign to agree', () => {
  const p = Object.fromEntries(positions(moreFixtures.releases(NOW).cot).map(x => [x.ccy, x]));
  assert.equal(p.EUR.side, 'short'); assert.equal(p.EUR.pct, 0);
  assert.equal(p.AUD.side, 'long');
  assert.equal(p.GBP.side, null);
  // the yen, Canadian dollar and Swiss franc futures are quoted the other way round: row percentile 21 = 79th for the currency, and the net sign flips
  assert.equal(p.JPY.pct, 79); assert.equal(p.JPY.side, null);
  assert.equal(p.CAD.pct, 25); assert.equal(p.CAD.side, null);
  assert.equal(p.CHF.pct, 19); assert.equal(p.CHF.side, 'short');
  assert.equal(p.NZD.side, 'short');
  assert.ok(!('MXN' in p) && !('USD' in p));
});

test('only high-impact releases in the window are kept and same-minute prints are one release', () => {
  const u = upcoming(moreFixtures.releases(NOW).events, NOW);
  assert.equal(u.length, 5, 'the week window drops the 300-hour one');
  const cpi = u.find(r => r.country === 'US');
  assert.equal(cpi.prints.length, 2); assert.equal(cpi.ms, NOW - 2 * 3600e3);
  assert.equal(upcoming([{ country: 'US', event: 'x', impact: 'low', ms: NOW + 1 }], NOW).length, 0);
});

test('the payload joins release, position and size; recent reactions are one row per release moment; no direction field anywhere', () => {
  const rb = RB();
  assert.equal(rb.ok, true);
  const gb = rb.releases.find(r => r.country === 'GB');
  assert.ok(gb.pos && gb.ccy === 'GBP' && gb.done === false);
  assert.ok(rb.releases.find(r => r.country === 'US').done === true);
  assert.equal(rb.recent.length, 2, 'the two US prints at one minute are one row');
  assert.match(rb.recent.find(r => r.country === 'US').event, /Core CPI m\/m · CPI m\/m/);
  assert.equal(rb.regimes.length, 3);
  assert.doesNotMatch(JSON.stringify(rb), /"(bias|lean|expected|bullish|bearish|signal)"/);
});

test('the sentence names who is crowded and what that does and does not mean', () => {
  const s = describeReleases(RB());
  assert.match(s, /high-impact releases? on the calendar/);
  assert.match(s, /crowded short EUR \(0th percentile\)/);
  assert.match(s, /long AUD \(82nd percentile\)/);
  assert.doesNotMatch(s, /will rise|will fall|forecast|buy|sell/i);
  const empty = describeReleases(buildReleasesBoard({ events: [], cot: moreFixtures.releases(NOW).cot, now: NOW }));
  assert.match(empty, /No high-impact release is on the calendar yet/);
});

test('the board: size validated and direction hedged on the page, own surface, tokens only; missing feeds degrade', () => {
  const html = boardHtml(RB());
  assert.match(html, /data-surface="panel\.macro\.releases"/);
  assert.match(html, /hypothesis awaiting held-out years, and the day was not wider/);
  assert.match(html, /positioning-into-release-direction/); assert.match(html, /event-impact-map/);
  assert.doesNotMatch(html, /#[0-9a-f]{3,6}\b|rgb\(/i);
  assert.doesNotMatch(html, /go long|go short|will (rise|fall)/i);
  assert.equal(buildReleasesBoard({}).ok, false);
  assert.match(boardHtml({ ok: false, error: 'no calendar, positioning or reaction feed has landed yet' }), /has landed yet/);
  assert.doesNotThrow(() => boardHtml(buildReleasesBoard({ cot: moreFixtures.releases(NOW).cot, now: NOW })));
});
