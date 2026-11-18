// node --test js/terminal/reviewState.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewState, stateChip, unreviewedNote } from './reviewState.js';

const WHY = 'Dollar bid and risk appetite mixed: no clean lean on this market today.';
test('a missing card, a card with no rating and a flat card with nothing behind it are all UNREVIEWED, not neutral', () => {
  assert.equal(reviewState(null).state, 'unreviewed');
  assert.equal(reviewState({}).state, 'unreviewed');
  assert.equal(reviewState({ rating: 'FLAT' }).state, 'unreviewed');
  assert.equal(reviewState({ rating: 'FLAT', why: '', conviction: 'low' }).state, 'unreviewed');   // a conviction with no thesis proves nothing
  assert.match(reviewState({ rating: 'FLAT' }).reason, /not reviewed/);
});
test('a flat card WITH a thesis is a reviewed neutral; a long or short is a call', () => {
  assert.equal(reviewState({ rating: 'FLAT', why: WHY, conviction: 'medium' }).state, 'neutral');
  assert.equal(reviewState({ rating: 'NEUTRAL', why: WHY }).state, 'neutral');
  assert.equal(reviewState({ rating: 'LONG', why: '' }).state, 'call');
  assert.equal(reviewState({ rating: 'STRONG_SHORT' }).state, 'call');
});
test('the chip says which, and a call draws nothing (the page keeps its arrow chip)', () => {
  assert.match(stateChip({ rating: 'FLAT' }), /Not reviewed/);
  assert.match(stateChip({ rating: 'FLAT', why: WHY, conviction: 'low' }), /Neutral · reviewed/);
  assert.equal(stateChip({ rating: 'LONG' }), null);
  assert.match(unreviewedNote({ rating: 'FLAT' }), /Nothing here is a view on the market/);
  assert.equal(unreviewedNote({ rating: 'FLAT', why: WHY }), '');
});
