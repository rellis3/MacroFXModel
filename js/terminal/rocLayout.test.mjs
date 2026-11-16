// js/terminal/rocLayout.test.mjs: static layout guards for the Momentum board (roc.css, rocView.js), the same rules the Insight boards were fixed for (insightLayout.test.mjs).
// node --test js/terminal/rocLayout.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const rd = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const css = rd('./roc.css'), view = rd('./rocView.js');

test('nothing is nowrap, no fixed width wider than a phone, theme tokens only (no hex colours)', () => {
  assert.doesNotMatch(css, /white-space:\s*nowrap/);
  for (const m of css.matchAll(/(?<![\w-])(?:width|min-width):\s*(\d+)px/g)) assert.ok(+m[1] <= 360, `a fixed width of ${m[1]}px`);
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /#[0-9a-fA-F]{3,8}\b/, 'a hex colour: use a theme token');
});
test('every grid child may shrink and the row collapses on a phone', () => {
  assert.match(css, /\.rc-row > \* \{ min-width: 0; \}/); assert.match(css, /\.rc-hero > \* \{ min-width: 0; \}/); assert.match(css, /\.rc-head > \* \{ min-width: 0; \}/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.in-row\.rc-row \{ grid-template-columns: minmax\(0, 1fr\) 58px/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
test('the stylesheet is linked by a literal href (the links guard), and the row class never reuses .in-bar', () => {
  assert.match(view, /l\.href = 'js\/terminal\/roc\.css'/); assert.doesNotMatch(view, /class="in-bar/);
});
