import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNewsletter } from './newsletter.js';
import { worldEconomies } from './worldEconomies.js';
import { policyWeek, policyWeekHtml, repairText } from './policyWeek.js';

const esc = s => String(s);
const fed = { ok: true, kind: 'statement', meetingDate: '2026-10-28', analysis: { regime: 'HAWKISH', hawkishScore: 0.72, dimensions: { inflationConcern: 0.85, growthConcern: 0.2 }, voteNote: 'A 10–2 vote where both dissenters wanted a 25bp hike. It may signal more.', whatChanged: 'The phrase about a cut is gone, confirming a hold. Two fresh dissents appear.' } };
const boc = { ok: true, kind: 'statement', meetingDate: '2026-10-28', analysis: { regime: 'HAWKISH', hawkishScore: 0.72, dimensions: { inflationConcern: 0.95, growthConcern: 0.45 }, whatChanged: 'The rate will rise next year and the dollar should weaken.' } };
const fiscal = { events: [
  { id: 'gb-budget-2026-10-28', ccy: 'GBP', kind: 'budget', title: 'Budget 2026', date: '2026-10-28', ms: Date.parse('2026-10-28T12:30:00Z'), rows: [{ label: 'Gilt sales 2026-27', value: 'Â£250.6bn', change: '+Â£4.4bn' }], analysis: { stance: 'LOOSER', supply: 'MORE', credibility: 'WEAKER', whatChanged: 'Headroom fell to Â£15bn from Â£23.6bn.' } },
  { id: 'us-refunding-2026-11', ccy: 'USD', kind: 'refunding', title: 'Quarterly Refunding, Nov 2026', date: '2026-11-04', ms: Date.parse('2026-11-04T13:00:00Z'), rows: [], analysis: null },
  { id: 'old', ccy: 'GBP', kind: 'budget', title: 'Budget 2025', date: '2025-11-26', ms: Date.parse('2025-11-26T12:00:00Z'), rows: [], analysis: null },
] };
const p = policyWeek({ banks: { USD: fed, CAD: boc }, beige: null, fiscal, nowMs: Date.parse('2026-11-01') });

test('repairText undoes pound signs and dashes read as the wrong encoding, leaves clean text', () => {
  assert.equal(repairText('Â£15bn'), '£15bn');
  assert.equal(repairText('a â€” b'), 'a — b');
  assert.equal(repairText('£15bn'), '£15bn');
});

test('banks keep facts, a missing bank shows as missing', () => {
  const us = p.rows.find(r => r.ccy === 'USD'), nz = p.rows.find(r => r.ccy === 'NZD');
  assert.equal(us.regime, 'hawkish');
  assert.equal(us.score, 0.72);
  assert.match(us.vote, /^A 10–2 vote where both dissenters wanted a 25bp hike\.$/);
  assert.equal(nz.missing, true);
});

test('a sentence that reads as a forecast is dropped', () => {
  assert.equal(p.rows.find(r => r.ccy === 'CAD').changed, '');
});

test('fiscal events: recent and upcoming kept, old dropped, text repaired', () => {
  assert.deepEqual(p.fiscal.map(f => f.id), ['us-refunding-2026-11', 'gb-budget-2026-10-28']);
  assert.equal(p.fiscal[0].upcoming, true);
  assert.equal(p.fiscal[1].figures[0].value, '£250.6bn');
  assert.equal(p.fiscal[1].what, 'Headroom fell to £15bn from £23.6bn.');
});

test('html says what it is and carries no forecast wording', () => {
  const h = policyWeekHtml(p, esc);
  assert.match(h, /no read yet/);
  assert.match(h, /upcoming, 4 Nov/);
  assert.match(h, /describes the document, not what the bank does next/);
  assert.doesNotMatch(h, /will rise|should weaken/);
  assert.equal(policyWeekHtml(null, esc), '');
});

test('the weekly edition carries the economies and the policy sections, the daily does not', () => {
  const world = worldEconomies({ gdp: { byCcy: { USD: { latestGrowth: 0.5, latestDate: '2026-04-01', z: 0 } } } });
  const mk = edition => buildNewsletter({ date: 'Monday 2 November 2026', isoDate: '2026-11-02', layout: 'v2', edition, events: [], week: { events: [] }, policy: p, world, strengths: [{ ccy: 'USD', score: 0.5 }] }).html;
  const wk = mk('weekly'), dy = mk('daily');
  assert.match(wk, /The economies behind the scores/);
  assert.match(wk, /Central banks, the Beige Book and the treasuries/);
  assert.doesNotMatch(dy, /The economies behind the scores|Central banks, the Beige Book/);
});
