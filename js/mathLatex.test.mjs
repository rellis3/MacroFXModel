// Tests for js/mathLatex.js: synthetic position fixtures only (no paper text). Every LaTeX result must also parse in KaTeX.
import test from 'node:test';
import assert from 'node:assert/strict';
import katex from 'katex';
import { toLatex, linearize, CONF_OK } from './mathLatex.js';

const S = 10;   // body font size
/** [str, x, y, size?, font?] -> items; the width of a string is 0.5 x size per character. */
const items = rows => ({ items: rows.map(([str, x, y, s = S, font = 'F1']) => ({ str, x, y, w: str.length * s * 0.5, h: s, font })) });
const withRules = (src, rules) => ({ ...src, rules });
const parses = latex => { katex.renderToString(latex, { throwOnError: true, displayMode: true }); return true; };
const norm = s => s.replace(/\s+/g, '');

test('plain line: letters, relation, operators', () => {
  const r = toLatex(items([['x', 100, 500], ['=', 110, 500], ['a', 120, 500], ['+', 128, 500], ['b', 138, 500]]));
  assert.equal(norm(r.latex), 'x=a+b');
  assert.ok(r.conf >= CONF_OK); assert.ok(parses(r.latex));
});

test('sub and superscripts from smaller size and vertical shift', () => {
  const r = toLatex(items([['x', 100, 500], ['i', 105, 498.2, 7], ['2', 105, 504, 7], ['+', 115, 500], ['y', 124, 500], ['0', 129, 498.2, 7]]));
  assert.match(norm(r.latex), /^x_\{i\}\^\{2\}\+y_\{0\}$/);
  assert.ok(parses(r.latex)); assert.ok(r.conf >= CONF_OK);
});

test('script-heavy equation still reads the body size (scripts do not become the body)', () => {
  const r = toLatex(items([['Δ', 100, 500], ['total', 108, 498, 6], ['=', 130, 500], ['N', 140, 500], ['Δ', 148, 500], ['c', 156, 498, 6]]));
  assert.match(norm(r.latex), /^\\Delta_\{total\}=N\\Delta_\{c\}$/);
});

test('Greek, operators and Symbol-font private-use glyphs', () => {
  const r = toLatex(items([['α', 100, 500], ['≤', 110, 500], ['β', 120, 500], ['×', 130, 500], ['\uF067', 140, 500], ['∈', 150, 500], ['\uF0A5', 160, 500]]));   // F067 = gamma, F0A5 = infinity (Symbol)
  assert.equal(norm(r.latex), '\\alpha\\le\\beta\\times\\gamma\\in\\infty');
  assert.ok(parses(r.latex));
});

test('a fraction is a stacked numerator and denominator around a drawn rule', () => {
  const src = withRules(items([['a', 102, 506], ['+', 108, 506], ['1', 116, 506], ['b', 106, 492], ['=', 85, 499], ['c', 130, 499]]), [[98, 124, 499 + 2.6, 0.5]]);
  const r = toLatex(src);
  assert.match(norm(r.latex), /=\\frac\{a\+1\}\{b\}c$/);
  assert.ok(parses(r.latex));
});

test('a radical sign touching the left end of a bar is \\sqrt over the atoms under the bar', () => {
  const src = withRules(items([['p', 100, 503], ['v', 110, 500], ['(', 116, 500], ['t', 120, 500], [')', 124, 500], ['d', 132, 500], ['W', 138, 500]]), [[110, 128, 509.6, 0.5]]);
  const r = toLatex(src);
  assert.match(norm(r.latex), /^\\sqrt\{v\(t\)\}dW$/);
  assert.ok(parses(r.latex));
});

test('nested: a fraction inside a square root', () => {
  const src = withRules(items([['p', 100, 505], ['a', 114, 510], ['b', 114, 492]]), [[112, 124, 509.5, 0.5], [112, 124, 500, 0.5]]);   // outer bar above, inner bar at the axis
  const r = toLatex(src);
  assert.ok(parses(r.latex));
});

test('sum with limits above and below', () => {
  const r = toLatex(items([['∑', 100, 500, 14], ['i', 100, 489, 7], ['=', 104, 489, 7], ['1', 110, 489, 7], ['n', 104, 511, 7], ['a', 118, 500], ['i', 124, 498.2, 7]]));
  assert.match(norm(r.latex), /^\\sum_\{i=1\}\^\{n\}a_\{i\}$/);
  assert.ok(parses(r.latex));
});

test('integral drawn as a letter in a single-glyph font, with limits', () => {
  const r = toLatex(items([['Z', 100, 500, 10, 'EX'], ['t', 110, 509, 7, 'S'], ['0', 107, 489, 7, 'S'], ['f', 118, 500, 10, 'F1'], ['d', 126, 500, 10, 'F1'], ['s', 131, 500, 10, 'F1']]));
  assert.match(norm(r.latex), /^\\int_\{0\}\^\{t\}fds$/);
  assert.ok(parses(r.latex));
});

test('equation number becomes \\tag and does not enter the formula', () => {
  const r = toLatex(items([['x', 100, 500], ['=', 110, 500], ['1', 120, 500], ['(2.1)', 520, 500]]));
  assert.equal(r.tag, '2.1');
  assert.match(r.latex, /\\tag\{2\.1\}$/); assert.doesNotMatch(r.latex.replace(/\\tag\{[^}]*\}/, ''), /2\.1/);
  assert.ok(parses(r.latex));
});

test('an equation number glued to the last item of the line is split off', () => {
  const r = toLatex({ items: [{ str: 'x = y.  (18)', x: 100, y: 500, w: 60, h: 10, font: 'F1' }] });
  assert.equal(r.tag, '18'); assert.doesNotMatch(r.latex.replace(/\\tag\{[^}]*\}/, ''), /18/);
});

test('several rows are aligned at the first relation sign', () => {
  const r = toLatex(items([['x', 100, 500], ['=', 120, 500], ['1', 130, 500], ['yy', 96, 484], ['=', 120, 484], ['2', 130, 484], ['(3)', 520, 500]]));
  assert.match(r.latex, /^\\begin\{aligned\}.*&=.*\\\\.*&=.*\\end\{aligned\}\\tag\{3\}$/);
  assert.ok(parses(r.latex));
});

test('brackets that enclose a fraction become \\left \\right', () => {
  const src = withRules(items([['(', 100, 499], ['a', 108, 506], ['b', 108, 492], [')', 118, 499]]), [[106, 116, 501.6, 0.5]]);
  const r = toLatex(src);
  assert.match(r.latex, /^\\left\(\\frac\{a\}\{b\}\\right\)$/);
  assert.ok(parses(r.latex));
});

test('function names and text words', () => {
  const r = toLatex(items([['exp', 100, 500], ['(', 116, 500], ['x', 120, 500], [')', 126, 500], ['for', 140, 500], ['x', 160, 500], ['>', 168, 500], ['0', 178, 500]]));
  assert.match(norm(r.latex), /^\\exp\(x\)\\text\{for\}x>0$/);
  assert.ok(parses(r.latex));
});

test('a tall left brace with two rows to its right is a cases environment', () => {
  const r = toLatex(items([['Θ', 90, 495], ['(', 98, 495], ['x', 103, 495], [')', 108, 495], ['=', 115, 495], ['{', 126, 495, 20, 'F1'],
    ['1', 140, 502], ['if', 170, 502], ['x', 182, 502], ['>', 190, 502], ['0', 200, 502], ['0', 140, 488], ['if', 170, 488], ['x', 182, 488], ['≤', 190, 488], ['0', 200, 488]]));
  assert.match(r.latex, /\\begin\{cases\}.*&.*\\\\.*&.*\\end\{cases\}/);
  assert.ok(parses(r.latex));
});

test('accents on a letter', () => {
  const r = toLatex(items([['x', 100, 500], ['ˆ', 101, 507, 10], ['+', 110, 500], ['y', 120, 500], ['\u0303', 120, 500]]));
  assert.match(norm(r.latex), /^\\hat\{x\}\+\\tilde\{y\}$/);
  assert.ok(parses(r.latex));
});

test('confidence: unknown glyphs, unbalanced brackets and unmatched rules are not rendered', () => {
  const unknown = toLatex(items([['x', 100, 500], ['=', 110, 500], ['\uF8FF', 120, 500], ['y', 130, 500]]));
  assert.ok(unknown.conf < CONF_OK, `unknown glyph conf ${unknown.conf}`);
  const open = toLatex(items([['f', 100, 500], ['(', 106, 500], ['x', 110, 500], ['=', 118, 500], ['1', 126, 500]]));
  assert.ok(open.conf < CONF_OK, `unbalanced conf ${open.conf}`);
  const bar = toLatex(withRules(items([['x', 100, 500], ['=', 110, 500], ['y', 120, 500]]), [[98, 140, 520, 0.5]]));
  assert.ok(bar.conf < 1);
  for (const r of [unknown, open, bar]) assert.ok(r.notes.length > 0);
});

test('stacks without a bar are not guessed as fractions', () => {
  const r = toLatex(items([['x', 100, 500], ['=', 110, 500], ['a', 124, 506], ['b', 124, 490]]));
  assert.ok(!/\\frac/.test(r.latex));
});

test('every input form is accepted and nothing throws on junk', () => {
  const rows = [['a', 100, 500], ['=', 108, 500], ['b', 116, 500]];
  const compact = { it: rows.map(([str, x, y]) => [str, x, y, 5, 10, 0]), fonts: ['F1'] };
  assert.equal(norm(toLatex(compact).latex), 'a=b');
  assert.equal(norm(toLatex([items(rows)]).latex), 'a=b');
  for (const junk of [null, undefined, {}, [], 'x', { it: 5 }, { items: [{ str: 5 }] }, { it: [['x', NaN, 1, 1, 1, 0]] }]) {
    const r = toLatex(junk); assert.equal(typeof r.latex, 'string'); assert.equal(r.conf, 0);
  }
});

test('the label of the block is used when the line has no number', () => {
  const r = toLatex(items([['x', 100, 500], ['=', 110, 500], ['1', 120, 500]]), { label: '7' });
  assert.equal(r.tag, '7');
});

test('linearize: scripts, radicals and fractions as compact text for a model', () => {
  const src = withRules(items([['d', 100, 500], ['X', 106, 500], ['=', 118, 500], ['p', 130, 503], ['v', 140, 500], ['1', 146, 498, 7], ['a', 160, 506], ['b', 160, 492]]), [[140, 152, 509.6, 0.5], [156, 168, 501.6, 0.5]]);
  const t = linearize(src);
  assert.match(t, /sqrt\[v_\{1\}\]/); assert.match(t, /\{a\}\/\{b\}/);
});
