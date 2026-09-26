import assert from 'node:assert/strict';
import { MECHANISMS, mechanismFor, missingMechanisms } from './mechanisms.js';
import { CONCEPTS } from './learnState.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

// A topic that can be ASKED but not EXPLAINED is the exact gap this file exists to
// close: the drill tested recognition of mechanisms it never taught.
t('every concept the drill can ask about has a derivation', () => {
  const missing = missingMechanisms(Object.keys(CONCEPTS));
  assert.deepEqual(missing, [], `no mechanism for: ${missing.join(', ')}`);
  assert.equal(Object.keys(MECHANISMS).length, Object.keys(CONCEPTS).length);
});

t('a derivation is a chain, not a definition', () => {
  for (const [k, m] of Object.entries(MECHANISMS)) {
    assert.ok(m.steps.length >= 5, `${k}: ${m.steps.length} steps — a chain needs room to be followed`);
    assert.ok(m.steps.length <= 8, `${k}: ${m.steps.length} steps — past this it is a lecture`);
    for (const s of m.steps) assert.ok(s.length > 60, `${k}: a step too short to carry reasoning: "${s}"`);
  }
});

t('each one opens with a question, not a title', () => {
  for (const [k, m] of Object.entries(MECHANISMS)) {
    assert.ok(m.question.endsWith('?'), `${k} should ask something`);
    assert.ok(m.label.length > 3, k);
  }
});

// A mechanism you cannot observe is a story.
t('every mechanism says what to put on a screen', () => {
  for (const [k, m] of Object.entries(MECHANISMS)) {
    assert.ok(m.see && m.see.length > 40, `${k} has no observable check`);
  }
});

// The teaching layer must not quietly re-teach what the evidence book closed.
t('every mechanism states what this desk has measured about it', () => {
  for (const [k, m] of Object.entries(MECHANISMS)) {
    assert.ok(m.tested && m.tested.length > 60, `${k} has no tested note`);
  }
});

t('the two mechanisms that contradict the textbook say so explicitly', () => {
  // oil -> breakevens has NO lag here, which is the opposite of the usual telling
  assert.match(MECHANISMS['oil-breakevens'].tested, /NO lag/);
  assert.match(MECHANISMS['oil-breakevens'].tested, /disagreement, not delay/);
  // "fear gold" is a banked null on this desk
  assert.match(MECHANISMS['which-gold'].tested, /NULL/);
});

t('nothing in the teaching layer promises a forward edge', () => {
  const all = JSON.stringify(MECHANISMS);
  assert.doesNotMatch(all, /\b(will rise|will fall|buy when|sell when|profit|entry|stop loss)\b/i);
  // and where a forward claim could be inferred, it is explicitly disowned
  assert.match(MECHANISMS['curve-led'].tested, /NOT tested here/);
  assert.match(MECHANISMS['credit-confirms'].tested, /NOT a validated forward signal/);
  assert.match(MECHANISMS['regime-quad'].tested, /classification, not a signal/);
});

t('the gold derivation actually derives the real-yield link', () => {
  const s = MECHANISMS['which-gold'].steps.join(' ');
  assert.match(s, /pays you nothing/);          // the premise
  assert.match(s, /gave up/);                   // opportunity cost
  assert.match(s, /after inflation|AFTER inflation/);  // why REAL and not nominal
  assert.match(s, /quoted in dollars/);         // the second, separate driver
  assert.match(s, /elimination/);               // how the other two are identified
});

t('lookups behave', () => {
  assert.equal(mechanismFor('which-gold').label, 'Which gold is trading');
  assert.equal(mechanismFor('nope'), null);
  assert.equal(mechanismFor(undefined), null);
  assert.deepEqual(missingMechanisms(['which-gold', 'nope']), ['nope']);
  assert.deepEqual(missingMechanisms([]), []);
  assert.deepEqual(missingMechanisms(null), []);
});

console.log(`mechanisms: ${n} groups, all passed`);
