// js/terminal/pairHistory.test.mjs: the Pair page's Back-button rules (pure decisions), plus the wiring in terminalTabs.js / linkedSelection.js.
// node --test js/terminal/pairHistory.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { historyAction, backTarget, pairHash, pairOf } from './pairHistory.js';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('a market the user picks adds a history entry; the same market again, or history navigation, does not', () => {
  assert.equal(historyAction({ want: '#pair=GOLD', current: '#pair=EURUSD' }), 'push');
  assert.equal(historyAction({ want: '#pair=GOLD', current: '' }), 'push');
  assert.equal(historyAction({ want: '#pair=GOLD', current: '#pair=GOLD' }), 'none');
  assert.equal(historyAction({ want: '#pair=GOLD', current: '#pair=EURUSD', fromHistory: true }), 'none');
});
test('a market the page follows (linked selection) replaces the entry, never adds one', () => {
  assert.equal(historyAction({ want: '#pair=GOLD', current: '#pair=EURUSD', replace: true }), 'replace');
  assert.equal(historyAction({ want: '#pair=GOLD', current: '#pair=GOLD', replace: true }), 'none');
});
test('hash helpers: case, junk, other hashes', () => {
  assert.equal(pairHash('gold'), '#pair=GOLD');
  assert.equal(pairOf('#pair=gbpusd'), 'GBPUSD');
  assert.equal(pairOf('#macro/rates'), null);
  assert.equal(pairOf(''), null);
  assert.equal(pairOf(undefined), null);
});
test('Back: a pair hash shows that market; an empty hash on the Pair tab returns to where it was opened; other hashes are left to their handlers', () => {
  assert.deepEqual(backTarget({ hash: '#pair=EURUSD', tab: 'pair' }), { pair: 'EURUSD' });
  assert.deepEqual(backTarget({ hash: '#pair=EURUSD', tab: 'assets' }), { pair: 'EURUSD' });   // Forward into a Pair entry from another tab
  assert.deepEqual(backTarget({ hash: '', tab: 'pair', from: 'macro' }), { tab: 'macro' });
  assert.deepEqual(backTarget({ hash: '', tab: 'pair' }), { tab: 'assets' }, 'no memory of where it was opened: Assets');
  assert.equal(backTarget({ hash: '', tab: 'macro' }), null, 'not on the Pair tab: nothing to undo');
  assert.equal(backTarget({ hash: '#macro/rates', tab: 'pair' }), null, 'a Macro link belongs to the Macro handler');
  assert.equal(backTarget({ hash: '#replay/NQ/2026-11-12T14:30', tab: 'pair' }), null);
});
test('wiring: openPair uses historyAction, fromHash uses backTarget, linked selection follows with replace', () => {
  const t = read('./terminalTabs.js'), l = read('./linkedSelection.js');
  assert.match(t, /import \{[^}]*historyAction[^}]*\} from '\.\/pairHistory\.js'/);
  assert.match(t, /function openPair\(inst, \{ replace = false, fromHistory = false \} = \{\}\)/);
  assert.ok(!/if \(location\.hash !== want\) history\.replaceState/.test(t), 'the unconditional replaceState is gone');
  assert.match(t, /backTarget\(\{ hash: location\.hash, tab: T\.tab, from: T\.pairFrom \}\)/);
  assert.match(l, /win\.openPairPage\(want, \{ replace: true \}\)/);
  assert.match(l, /win\.openPairPage = \(inst, o\) => \{ writeSel\(\{ inst \}, 'ui'\); return origPair\(inst, o\); \}/);
});
