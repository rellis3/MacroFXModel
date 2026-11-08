// js/library/math.js pure helpers (the KaTeX loader itself needs a browser: see scripts/libraryDev + the Playwright run in the PR notes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { eqMode, setEqMode, hasMath, anyMath, sourceLabel, sourceTitle, includeUnchecked, setIncludeUnchecked, defaultView, toggleLabel, EQ_MODE_KEY, KATEX_VER, KATEX_BASE } from './math.js';

const store = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), _m: m }; };

test('the equations switch defaults to rendered, remembers original, and survives a broken storage', () => {
  const s = store(); assert.equal(eqMode(s), 'rendered');
  setEqMode(s, 'original'); assert.equal(s._m.get(EQ_MODE_KEY), 'original'); assert.equal(eqMode(s), 'original');
  setEqMode(s, 'anything-else'); assert.equal(eqMode(s), 'rendered');
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(eqMode(broken), 'rendered'); assert.doesNotThrow(() => setEqMode(broken, 'original'));
});

test('only an eq block with non-empty latex is drawn as maths', () => {
  assert.equal(hasMath({ type: 'eq', latex: 'x=1' }), true);
  for (const b of [{ type: 'eq' }, { type: 'eq', latex: '  ' }, { type: 'p', latex: 'x' }, null, undefined, { type: 'eq', latex: 5 }]) assert.equal(hasMath(b), false);
  assert.equal(anyMath([{ type: 'p' }, { type: 'eq', latex: 'x' }]), true); assert.equal(anyMath([{ type: 'eq' }]), false); assert.equal(anyMath(null), false);
});

test('source captions: arXiv source, read from the PDF, tidied by AI; unknown sources show nothing', () => {
  assert.equal(sourceLabel('arxiv'), 'arXiv source'); assert.equal(sourceLabel('rule'), 'read from the PDF'); assert.equal(sourceLabel('model'), 'tidied by AI');
  assert.equal(sourceLabel('x'), ''); assert.equal(sourceLabel(undefined), '');
  for (const k of ['arxiv', 'rule', 'model']) assert.ok(sourceTitle(k).length > 20);
});

test('KaTeX is pinned to an exact version on cdnjs', () => {
  assert.match(KATEX_VER, /^\d+\.\d+\.\d+$/); assert.equal(KATEX_BASE, `https://cdnjs.cloudflare.com/ajax/libs/KaTeX/${KATEX_VER}/`);
});

test('rule-based LaTeX is an opt-in: it defaults to the crop; arXiv and model LaTeX follow the header switch', () => {
  const rule = { type: 'eq', latex: 'x', latexSource: 'rule' }, ax = { type: 'eq', latex: 'x', latexSource: 'arxiv' }, ml = { type: 'eq', latex: 'x', latexSource: 'model' };
  assert.deepEqual([rule, ax, ml].map(b => defaultView(b, 'rendered', false)), ['crop', 'math', 'math']);
  assert.deepEqual([rule, ax, ml].map(b => defaultView(b, 'rendered', true)), ['math', 'math', 'math']);
  assert.deepEqual([rule, ax, ml].map(b => defaultView(b, 'original', true)), ['crop', 'crop', 'crop']);
  assert.equal(toggleLabel(rule, 'crop'), 'Rendered (auto, unchecked)'); assert.equal(toggleLabel(ax, 'crop'), 'Rendered'); assert.equal(toggleLabel(rule, 'math'), 'Original');
  const s = store(); assert.equal(includeUnchecked(s), false); setIncludeUnchecked(s, true); assert.equal(includeUnchecked(s), true);
  assert.equal(includeUnchecked({ getItem() { throw new Error('x'); } }), false);
});
