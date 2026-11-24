import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tidyText, planLevels, mergedLevels, ladderHtml, nearestLevels, statusStripHtml, thenNowHtml, details } from './cardTidy.js';

test('tidyText: field names and timestamps in words, prose left alone', () => {
  const t = tidyText('price is 208.64 with posInRange 0.966, oh_rem 0 and ol_rem 0.23; bandDaily p50; round_half 207.5; macro overlay is stale (asOf 1795132800000).');
  assert.match(t, /position in today's range 0\.966/);
  assert.match(t, /room left to the high 0/);
  assert.match(t, /the daily band p50/);
  assert.match(t, /round number 207\.5/);
  assert.doesNotMatch(t, /1795132800000/);
  assert.match(t, /as of \d{1,2} [A-Z][a-z]{2} 2026/);
  assert.equal(tidyText('The up p50 at 208.7 holds.'), 'The up p50 at 208.7 holds.');
  assert.equal(tidyText(null), '');
});

const card = { rating: 'SHORT', conviction: 'low', why: 'GBP 0 vs JPY +1 risk-off haven. More text.', plan: { zone: 'close below 206.97', invalidation: 'close above 208.0 daily open / 208.5 round_half' },
  levels: { open: 208.12, up: { p50: 208.7, p75: 209.14, p90: 209.7 }, down: { p50: 207.54, p75: 207.08, p90: 206.49 } } };
const m = { last: 208.64, open: 208.12, hi: 208.66, lo: 208.08, u: 0.58, nowU: 0.9, touched: ['up p50'], dayType: 'trend up', spanUsed: 0.5, ref: { pdh: 208.9, pdl: 207.2, pdc: 207.48, wo: 207.9 } };

test('planLevels: zone, invalidation against the card, first target', () => {
  assert.deepEqual(planLevels(card), { dir: -1, zone: [206.97, 206.97], invalid: 208, target: 207.54 });
  assert.equal(planLevels({ rating: 'FLAT' }).target, null);
});

test('mergedLevels: every level once, highest first, near ones merged, distance in u', () => {
  const rows = mergedLevels(card, m);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].price > rows[i].price);
  const at = p => rows.find(r => r.price === p);
  assert.ok(at(208.7).labels.includes('forecast p50 up'));
  assert.ok(at(208.7).labels.includes("today's high"));      // 208.66 is within 0.08u of 208.7
  assert.ok(rows.some(r => r.labels.includes('plan invalidation')));
  assert.ok(rows.some(r => r.labels.includes("yesterday's high")));
  assert.equal(at(209.7).dU, 1.83);
  const nl = nearestLevels(rows, 208.64);
  assert.equal(nl.above.price, 208.7);
  assert.ok(nl.below.price < 208.64);
});

test('ladderHtml puts the price row between the levels around it', () => {
  const h = ladderHtml(mergedLevels(card, m), m);
  const iNow = h.indexOf('price now'), iAbove = h.indexOf('208.70'), iBelow = h.indexOf('208.12');
  assert.ok(iAbove < iNow && iNow < iBelow);
  assert.equal(ladderHtml([], m), '');
});

test('status strip, then and now, details', () => {
  const s = statusStripHtml({ card, m, against: ['the day is +0.90u from the open'], nextEvent: '⏱ GBP PMI in 42m', tape: { label: 'risk-on' } });
  assert.match(s, /208\.64/); assert.match(s, /▲ \+0\.90u/); assert.match(s, /day against the call/); assert.match(s, /trend up so far/); assert.match(s, /range 50% of the p50 span/); assert.match(s, /risk-on/);
  const t = thenNowHtml({ card, m, against: ['x'], tilt: { turned: 'bullish at 13:00' }, tape: { label: 'risk-on' }, rows: mergedLevels(card, m) });
  assert.match(t, /<b>short<\/b>, low conviction: GBP 0 vs JPY \+1 risk-off haven\./);
  assert.match(t, /\+0\.90u from the open · up p50 hit · trend up so far · tape risk-on · macro tilt turned bullish at 13:00/);
  assert.match(t, /Next levels/);
  assert.match(t, /Plan out/);
  assert.equal(details('x', ''), '');
  assert.match(details('Sum', '<p>b</p>', true), /<details class="ct-acc " open><summary>Sum<\/summary>/);
});
