import test from 'node:test';
import assert from 'node:assert/strict';
import { costReportQuery, parseCostReport, dayFlag } from './anthropicCost.js';

test('costReportQuery covers whole UTC days up to and including today', () => {
  const q = costReportQuery(Date.UTC(2026, 10, 7, 14, 5), 14);
  assert.match(q, /starting_at=2026-10-25T00:00:00Z/);
  assert.match(q, /ending_at=2026-11-08T00:00:00Z/);
  assert.match(q, /group_by\[\]=description/);
});

test('parseCostReport turns cents into dollars per day, by model and by kind', () => {
  const page = { data: [
    { starting_at: '2026-11-04T00:00:00Z', ending_at: '2026-11-05T00:00:00Z', results: [
      { amount: '5682', currency: 'USD', model: 'claude-sonnet-5', token_type: 'output_tokens', cost_type: 'tokens' },
      { amount: '209', currency: 'USD', model: 'claude-opus-5', token_type: 'uncached_input_tokens', cost_type: 'tokens' },
    ] },
    { starting_at: '2026-11-05T00:00:00Z', ending_at: '2026-11-06T00:00:00Z', results: [] },
  ] };
  const days = parseCostReport(page);
  assert.equal(days.length, 2);
  assert.equal(days[0].usd, 58.91);
  assert.equal(days[0].byModel['claude-sonnet-5'], 56.82);
  assert.equal(days[0].byKind.output, 56.82);
  assert.equal(days[1].usd, 0);
});

test('dayFlag: 4 November against an ordinary week is very high', () => {
  assert.equal(dayFlag(58.91, [1, 0.5, 14, 9, 6, 0.4]).level, 'very high');
  assert.equal(dayFlag(3, [2, 3, 4]).level, 'normal');
  assert.equal(dayFlag(3, [2]), null);
});
