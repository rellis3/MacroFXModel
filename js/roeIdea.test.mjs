import test from 'node:test';
import assert from 'node:assert/strict';
import { briefHtml, EXAMPLE_TEXT } from './roeIdea.js';

const res = {
  ok: true, id: 'b-1-abc', callsUsed: 3, callsCap: 100,
  brief: { title: 'Does the euro-minus-US slope lead <EURUSD>?', hypothesis: 'Changes in the slope gap lead EURUSD.', mechanism: 'Policy divergence.', target: { series: 'oanda:EURUSD', label: 'EURUSD', note: '' },
    variables: [{ name: 'Slope gap', construction: '(DE10Y-DE2Y)-(DGS10-DGS2)', components: ['yield:DE10Y'], unknownComponents: ['fred:MADEUP'], transform: '1-day changes', role: 'leader' }],
    method: { steps: ['use changes', 'cross-correlate'], lags: '1 to 20', regimes: ['VIX terciles'] }, missing: [{ what: 'Euro swap curve', suggestedSource: 'ECB data portal' }], assumptions: ['daily'], question: 'Which euro curve?', searchTerms: [] },
  dataCheck: { allHave: false, quickTestReady: false, target: { id: 'oanda:EURUSD', have: true }, variables: [{ name: 'Slope gap', role: 'leader', components: [{ id: 'yield:DE10Y', have: true }], unknown: ['fred:MADEUP'], derived: true }], notes: ['must be built from its parts first'] },
};

test('the brief shows the hypothesis, escapes text, and marks what we hold and what is missing', () => {
  const h = briefHtml(res);
  assert.ok(!h.includes('<EURUSD>'), 'escaped'); assert.match(h, /Hypothesis\./); assert.match(h, /we hold it/);
  assert.match(h, /fred:MADEUP \(not held\)/); assert.match(h, /some data is missing/); assert.match(h, /not quick-test ready/);
  assert.match(h, /try: ECB data portal/); assert.match(h, /One question for you/); assert.match(h, /3 of 100 translator calls used/);
  assert.match(h, /Not a result/);
});
test('an error is shown plainly and Go opens a research room', () => {
  assert.match(briefHtml({ ok: false, error: 'the 100-call cap is used up' }), /cap is used up/);
  assert.match(briefHtml(res), /data-act="room">Go: open a research room/);
});
test('the example carries the owner\'s yield-curve question and the method suggestions', () => {
  assert.match(EXAMPLE_TEXT, /euro 2-year versus 10-year/); assert.match(EXAMPLE_TEXT, /changes rather than absolute levels/);
  assert.match(EXAMPLE_TEXT, /cross-correlations across different time lags/); assert.match(EXAMPLE_TEXT, /under what regime/);
});
