// Tests for js/terminal/broadcastHeadline.js: the broadcast's HEADLINE is the newsletter's (todayOpening), built from the same feeds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { headlineAssets, headlineCard, buildHeadline, headLabel, sayHead } from './broadcastHeadline.js';
import { planBroadcast } from './broadcastCore.js';

// Tuesday 24 Nov 2026, 07:05 London (UTC in November)
const NOW = Date.parse('2026-11-24T07:05:00Z');
const dates = ['2026-11-19', '2026-11-20', '2026-11-23', '2026-11-24'];
// the bundle already carries a row for today with no market closes yet (the case that once made every market read as stale)
const drill = { dates, to: '2026-11-24', series: { de30: [24000, 24200, 25000, null], spx: [7000, 6900, 7204, null], nq: [26000, 26100, 26150, null] } };
const brief = { instruments: {
  DE30: { current_price: 24650, stale: false, levels: { hl_med: { pct: 1.32 } }, prev_day: { date: '2026-11-23', high: 25100, low: 24300 } },
  SPX500: { current_price: 7190, stale: false, levels: { hl_med: { pct: 2.0 } } },
  NQ: { current_price: 26160, stale: false, levels: { hl_med: { pct: 2.0 } } },
} };
const feeds = { drill, brief, sess: { instruments: {} }, fc: { instruments: {} }, mc: { rows: [] }, asia: { instruments: {} }, events: [] };

test('labels match the newsletter: pairs as EUR/USD, indices by name', () => {
  assert.equal(headLabel('EURUSD'), 'EUR/USD'); assert.equal(headLabel('SPX500'), 'S&P 500'); assert.equal(headLabel('DE30'), 'DAX'); assert.equal(headLabel('GOLD'), 'Gold');
  assert.equal(sayHead('Yields fell 12bp'), 'Yields fell 12 basis points');
});

test('asset rows: yesterday is the last full day even when the bundle has an empty row for today', () => {
  const a = headlineAssets({ ...feeds, nowMs: NOW }), dax = a.find(r => r.key === 'DE30');
  assert.equal(dax.d1Basis, 'live'); assert.equal(dax.d1AsOf, '2026-11-23'); assert.ok(Math.abs(dax.d1 - (24650 / 25000 - 1) * 100) < 1e-9, 'overnight: live price against Monday close');
  assert.equal(dax.prevClose, 24200); assert.equal(dax.lastClose, 25000); assert.equal(dax.hlMed, 1.32);
});

test("a big day yesterday leads, as in the newsletter, with the market to chart and its size in normal days", () => {
  const h = buildHeadline(feeds, { nowMs: NOW });
  assert.match(h.headline, /^Monday's 3\.3% DAX jump and 4\.4% S&P 500 jump/, h.headline);
  assert.equal(h.key, 'DE30'); assert.deepEqual(h.keys, ['DE30', 'SPX500']); assert.equal(h.tone, 'up');
  assert.equal(h.figure.value, '3.3%'); assert.match(h.figure.label, /^DAX, 2\.5× a normal day$/);
  assert.equal(h.means, "For the DAX that is 2.5 times a normal day's move.");
  assert.match(h.say, /^The headline: Monday's 3\.3% DAX jump/); assert.match(h.kicker, /TUESDAY 24 NOVEMBER/);
});

test('in the evening the day just traded is the story, and stale macro rows do not lead', () => {
  const eve = Date.parse('2026-11-24T21:00:00Z');
  const mc = { rows: [{ key: 'us10y', label: 'US 10Y', unit: 'bps', last: 4.9, lastDate: '2026-11-20', deltas: { 1: -12, 5: -20, 20: 0 } }, { key: 'hy', label: 'HY', unit: 'bps', last: 3.7, lastDate: '2026-11-20', deltas: { 1: 24 } }] };
  const h = buildHeadline({ ...feeds, mc }, { nowMs: eve, evening: true });
  assert.doesNotMatch(h?.headline ?? '', /Yields fell/, 'a yield move from four days ago is not tonight\'s headline');
  assert.match(h.headline, /DAX/, h.headline);
});

test("a second line that only repeats the headline's numbers is dropped, and pairs are said by name", () => {
  const assets = [{ key: 'USDCAD', label: 'USD/CAD', d1: -0.6 }, { key: 'USDCHF', label: 'USD/CHF', d1: -0.7 }];
  const c = headlineCard({ headline: 'USD/CAD slides 0.6% and USD/CHF slips 0.7%', kicker: 'Quiet day', lede: "Since yesterday's close: USD/CAD fell 0.6%; USD/CHF fell 0.7%; GBP/USD rose 0.6%." }, assets);
  assert.equal(c.means, '', c.means);
  assert.equal(c.say, 'The headline: Dollar Loonie slides 0.6% and Dollar Franc slips 0.7%.');
  assert.equal(c.headline, 'USD/CAD slides 0.6% and USD/CHF slips 0.7%', 'the card still prints the pair');
  const d = headlineCard({ headline: 'USD/CAD slides 0.6%', lede: 'Oil fell 3% as stocks built up. Next.' }, assets);
  assert.equal(d.means, 'Oil fell 3% as stocks built up.');
});

test('no story, no card; a card with no number has no figure', () => {
  assert.equal(headlineCard(null), null); assert.equal(headlineCard({ headline: '' }), null);
  const c = headlineCard({ headline: 'A quiet calendar: today is about the tape, not the releases', kicker: 'Quiet day · Tuesday 24 November', lede: '' }, []);
  assert.equal(c.figure, null); assert.equal(c.key, null); assert.equal(c.means, '');
});

test('the programme: THE HEADLINE follows the title, on the named market\'s daily chart; the lead does not repeat its markets', () => {
  const head = buildHeadline(feeds, { nowMs: NOW });
  const movers = [{ key: 'DE30', ratio: -1.9, oc: -1.4, tone: 'dn' }, { key: 'GOLD', ratio: 2.4, oc: 2.1, tone: 'up' }];
  const P = planBroadcast({ now: new Date(NOW), movers, headline: head }, { hooks: [] });
  assert.deepEqual(P.items.slice(0, 2).map(x => x.kind), ['open', 'headline']);
  const it = P.items[1]; assert.equal(it.view, 'session'); assert.deepEqual(it.cam, { chart: 'DE30', tf: '1h', back: 1 }, "yesterday's big day: the chart flies back one day");
  assert.match(it.text, /^The headline: Monday's 3\.3 percent DAX jump|^The headline: Monday's 3\.3% DAX jump/);
  assert.ok(!P.lead.some(x => x.key === 'DE30'), 'the DAX is in the headline, so not in the lead');
  assert.ok(P.lead.some(x => x.key === 'GOLD'));
  const none = planBroadcast({ now: new Date(NOW), movers }, { hooks: [] });
  assert.ok(!none.items.some(x => x.kind === 'headline'), 'no headline input, no headline item');
});
