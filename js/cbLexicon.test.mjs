// Tests for js/cbLexicon.js — determinism, direction, edge cases.
// Run: node js/cbLexicon.test.mjs
import assert from 'node:assert/strict';
import { score, LEXICON_VERSION, HAWKISH_TERMS, DOVISH_TERMS } from './cbLexicon.js';

// --- edge cases ---
assert.deepEqual(score('').score, 0, 'empty text scores 0');
assert.deepEqual(score(null).score, 0, 'null scores 0');
assert.equal(score('The weather in Kansas City was pleasant.').score, 0, 'neutral text scores 0');

// --- direction on statement-register synthetic text ---
const hawkText = `The Committee decided to raise the target range for the federal
funds rate. Inflation remains elevated and the Committee is attentive to
inflation risks. Job gains have been robust and economic activity has been
expanding at a strong pace. Further increases in the target range may be
appropriate, and the Committee will continue reducing its securities holdings.`;
const hawk = score(hawkText);
assert.ok(hawk.score > 0.5, `hawk text scores strongly positive (got ${hawk.score})`);
assert.ok(hawk.hawk >= 4, `multiple hawkish hits (got ${hawk.hawk})`);

const doveText = `The Committee decided to lower the target range for the federal
funds rate. Economic activity has weakened and downside risks have increased.
Inflation has declined and remains below the Committee's 2 percent objective.
The Committee will maintain an accommodative stance and continue its asset
purchases to support the economic recovery.`;
const dove = score(doveText);
assert.ok(dove.score < -0.5, `dove text scores strongly negative (got ${dove.score})`);
assert.ok(dove.dove >= 4, `multiple dovish hits (got ${dove.dove})`);

// --- mixed text lands between the two poles ---
const mixed = score(hawkText + ' ' + doveText);
assert.ok(mixed.score > dove.score && mixed.score < hawk.score, 'mixed between poles');

// --- determinism (same input, same output — the whole point of Scorer A) ---
assert.deepEqual(score(hawkText), score(hawkText), 'deterministic');

// --- false-positive guards: bare adjectives in ordinary prose don't fire ---
assert.equal(score('A strong dollar and a weak euro were discussed by analysts.').hawk, 0,
  '"strong dollar" is not a hawkish hit');

// --- audit trail present ---
assert.ok(hawk.hits.hawk.length > 0 && Array.isArray(hawk.hits.dove), 'hits audit trail');

// --- frozen-list sanity: version tag + non-trivial list sizes ---
assert.equal(LEXICON_VERSION, 'cb-lexicon-v1');
assert.ok(HAWKISH_TERMS.length >= 20 && DOVISH_TERMS.length >= 20, 'lists non-trivial');

console.log('cbLexicon.test.mjs: all assertions passed');
