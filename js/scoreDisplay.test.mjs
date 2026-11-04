// Tests for js/scoreDisplay.js, and that desk-terminal.html's inline copy says exactly the same.   node --test js/scoreDisplay.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as SD from './scoreDisplay.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RATINGS = ['STRONG_LONG', 'LONG', 'FLAT', 'NEUTRAL', 'SHORT', 'STRONG_SHORT', 'BOGUS', undefined];
const CONVS = ['low', 'medium', 'high', undefined, 'huge'];
const BIASES = [-2, -1, 0, 1, 2, -3, 3, 0.5, '1', null, undefined, '', 'x', NaN, true];

test('a strong short at high conviction is −5 with a down arrow and "strong short", graded "A+ conviction"', () => {
  const c = { rating: 'STRONG_SHORT', conviction: 'high', size: 0.5 };
  assert.equal(SD.assetScore(c), -5);
  assert.equal(SD.assetText(c), '▼ −5.0 · strong short');
  assert.equal(SD.gradeLabel(c), 'A+ conviction');
  assert.equal(SD.assetText({ rating: 'LONG', conviction: 'medium' }), '▲ +2.0 · long');
  assert.equal(SD.assetText({ rating: 'FLAT', conviction: 'low' }), '● 0.0 · no view');
});

test('missing inputs are "no data", never a neutral number', () => {
  assert.equal(SD.ccyScore(undefined), null); assert.equal(SD.ccyScore(null), null); assert.equal(SD.ccyScore(''), null); assert.equal(SD.ccyScore('x'), null);
  assert.equal(SD.ccyText(undefined), 'no data'); assert.equal(SD.fmtScore(null), '–'); assert.equal(SD.signed(undefined), '–');
  assert.equal(SD.assetScore({ rating: 'LONG' }), null, 'a directional card with no conviction cannot be scored');
  assert.equal(SD.assetScore({}), null); assert.equal(SD.assetScore(null), null);
  assert.equal(SD.ccyScore(0), 0); assert.equal(SD.ccyText(0), '● 0.0 · neutral', 'a real neutral bias stays a real 0');
  assert.equal(SD.ccyScore(3), 5, 'clamped to the scale'); assert.equal(SD.fill(-5), 1); assert.equal(SD.fill(null), 0);
});

test('grades: only directional sized cards have one', () => {
  assert.equal(SD.grade({ rating: 'LONG', conviction: 'high', size: 1 }), 'A');
  assert.equal(SD.grade({ rating: 'STRONG_LONG', conviction: 'medium', size: 1 }), 'A-');
  assert.equal(SD.grade({ rating: 'LONG', conviction: 'medium', size: 1 }), 'B+');
  assert.equal(SD.grade({ rating: 'SHORT', conviction: 'low', size: 1 }), 'B');
  assert.equal(SD.grade({ rating: 'SHORT', conviction: 'high', size: 0 }), null);
  assert.equal(SD.gradeLabel({ rating: 'FLAT', size: 1 }), null);
});

test('desk-terminal.html mirrors js/scoreDisplay.js between its SCORE-DISPLAY markers', () => {
  const html = fs.readFileSync(path.join(ROOT, 'desk-terminal.html'), 'utf8');
  const m = html.match(/\/\/ SCORE-DISPLAY BEGIN[^\n]*\n([\s\S]*?)\/\/ SCORE-DISPLAY END/);
  assert.ok(m, 'the SCORE-DISPLAY block is missing from desk-terminal.html');
  const P = new Function(`${m[1]}\nreturn { DIR, CONV, SCALE_NOTE, assetScore, ccyScore, assetWord, ccyWord, fmtScore, signedScore, scoreText, assetText, ccyText, grade, gradeLabel };`)();
  assert.deepEqual(P.DIR, SD.DIR); assert.deepEqual(P.CONV, SD.CONV); assert.equal(P.SCALE_NOTE, SD.SCALE_NOTE);
  for (const r of RATINGS) for (const k of CONVS) for (const size of [0, 0.5]) {
    const c = { rating: r, conviction: k, size };
    assert.equal(P.assetScore(c), SD.assetScore(c), `assetScore ${r} ${k}`);
    assert.equal(P.assetWord(c), SD.assetWord(c)); assert.equal(P.assetText(c), SD.assetText(c));
    assert.equal(P.grade(c), SD.grade(c)); assert.equal(P.gradeLabel(c), SD.gradeLabel(c));
  }
  for (const b of BIASES) {
    assert.equal(P.ccyScore(b), SD.ccyScore(b), `ccyScore ${String(b)}`);
    assert.equal(P.ccyWord(b), SD.ccyWord(b)); assert.equal(P.ccyText(b), SD.ccyText(b));
  }
  for (const s of [-5, -2.5, -0.1, 0, 0.1, 3, null, NaN]) { assert.equal(P.fmtScore(s), SD.fmtScore(s)); assert.equal(P.signedScore(s), SD.signed(s)); }
});

test('no score on the terminal or the newsletters is drawn on the old /10 scale', () => {
  for (const f of ['desk-terminal.html', 'js/terminal/terminalTabs.js', 'js/newsletterTerminal.js', 'js/newsletterPicto.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!/\/10<|\}\/10|on \/10|5 \+ 2\.5 \*/.test(src), `${f} still shows a 0-10 score`);
  }
});
