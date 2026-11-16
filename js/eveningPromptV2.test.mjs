// Tests for js/eveningPromptV2.js: the evening writer's second brief is off unless asked for, and carries the no-invented-cause rule.   node js/eveningPromptV2.test.mjs
import assert from 'node:assert/strict';
import { eveningV2On, EVENING_V2_ADDENDUM, extraInputTokens } from './eveningPromptV2.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

t('off by default and for anything but "1"', () => {
  assert.equal(eveningV2On({}), false); assert.equal(eveningV2On({ EVENING_V2_PROMPT: '' }), false); assert.equal(eveningV2On({ EVENING_V2_PROMPT: 'true' }), false); assert.equal(eveningV2On({ EVENING_V2_PROMPT: '0' }), false);
  assert.equal(eveningV2On({ EVENING_V2_PROMPT: '1' }), true);
});

t('the addendum says: story in time order, a cause only from the timeline, "not captured" for a missing event, no direction, tomorrow in one line', () => {
  for (const re of [/in that order/, /State a cause ONLY if a headline or print in THE DAY IN ORDER supports it/, /no headline in the wire explains it/, /marked "no headline captured" was not seen/, /Do not add direction claims, forecasts or trade views/, /ONE short line/]) assert.match(EVENING_V2_ADDENDUM, re);
});

t('the cost note is the addendum plus the timeline at about four characters a token', () => {
  assert.equal(extraInputTokens(''), Math.round(EVENING_V2_ADDENDUM.length / 4)); assert.equal(extraInputTokens('x'.repeat(400)), Math.round((EVENING_V2_ADDENDUM.length + 400) / 4));
});

console.log(`eveningPromptV2: ${n} tests passed`);
