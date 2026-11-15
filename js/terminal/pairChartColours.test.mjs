// js/terminal/pairChartColours.test.mjs: the Pair chart must hand Lightweight-Charts real colours, never a CSS var(): the library parses colours
// itself and throws on "var(--up)", which left the Pair chart blank with "The chart could not draw these bars." (found 2026-11-15, from 2509dd7c).
// node --test js/terminal/pairChartColours.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src = fs.readFileSync(new URL('./terminalTabs.js', import.meta.url), 'utf8');
test('createLevelChart options in terminalTabs.js carry no CSS var()', () => {
  const i = src.indexOf('createLevelChart(box'); assert.ok(i > 0, 'pair chart is built here');
  const call = src.slice(i, src.indexOf('});', i) + 3);
  assert.ok(!/var\(--/.test(call), 'no var() inside the chart options');
  assert.ok(/themeColor|getPropertyValue/.test(src.slice(Math.max(0, i - 600), i)), 'colours are resolved just before the call');
});
