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

// "Put this on a screen" is a TradingView instruction, so it should arrive as something
// pasteable rather than as a shopping list of series to go and find the tickers for.
t('every mechanism carries paste-ready TradingView symbols', () => {
  const PREFIX = /^(TVC|FRED|OANDA|SP|NASDAQ|AMEX|CBOE|COMEX|NYMEX|CME|ECONOMICS):[A-Z0-9_.]+$/;
  const term = x => x.split(/[-+*/]/).map(v => v.trim()).filter(Boolean);
  for (const [k, m] of Object.entries(MECHANISMS)) {
    assert.ok(m.tv, `${k}: no tv block — the see line is an instruction with no symbols behind it`);
    // every symbol, including both legs of a spread or ratio, must be exchange-qualified.
    // A bare "US10Y" resolves to whatever TradingView feels like that day.
    for (const sym of [m.tv.main, ...m.tv.compare, m.tv.expr].filter(Boolean))
      for (const v of term(sym))
        assert.match(v, PREFIX, `${k}: "${v}" is not exchange-qualified`);
    assert.ok(m.tv.note && m.tv.note.length > 40, `${k}: no note saying how to set it up`);
  }
});

t('the chart is a comparison, never a single line', () => {
  // A mechanism is a relationship. One symbol on a screen cannot show one.
  for (const [k, m] of Object.entries(MECHANISMS)) {
    const legs = new Set([m.tv.main, ...m.tv.compare].flatMap(x => x.split(/[-+*/]/).map(v => v.trim())));
    assert.ok(legs.size >= 2, `${k}: ${legs.size} series — that is a chart, not a comparison`);
  }
});

t('a spread or ratio expression is flagged as its own symbol, not a compare', () => {
  // TradingView takes these in the symbol box; putting them through Compare silently
  // does something else. Only the two mechanisms that are ABOUT a spread carry one.
  assert.equal(MECHANISMS['curve-led'].tv.expr, 'TVC:US30Y-TVC:US02Y');
  assert.match(MECHANISMS['regime-quad'].tv.expr, /XCUUSD\/OANDA:XAUUSD/);
  for (const [k, m] of Object.entries(MECHANISMS))
    if (m.tv.expr) assert.ok(/[-+*/]/.test(m.tv.expr), `${k}: expr with no operator is just a symbol`);
});

t('the symbols match what the see line actually asks for', () => {
  // The prose and the tickers drifting apart is the failure mode that makes this useless.
  assert.match(MECHANISMS['which-gold'].tv.main, /XAUUSD/);          // gold
  assert.ok(MECHANISMS['which-gold'].tv.compare.includes('FRED:DFII10'));  // the real yield
  assert.ok(MECHANISMS['which-gold'].tv.compare.includes('TVC:DXY'));      // the dollar
  assert.ok(MECHANISMS['yield-split'].tv.compare.includes('FRED:T10YIE')); // the breakeven
  assert.equal(MECHANISMS['dollar-link'].tv.compare.length, 3);      // three dollar-priced things
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
