import assert from 'node:assert/strict';
import { dualLine, levelLine, histogram, spark } from './mvChart.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const seq = (len, f) => Array.from({ length: len }, (_, i) => f(i));

t('two series are rebased so different units can share one axis', () => {
  const svg = dualLine(seq(60, i => 100 + i), seq(60, i => 5000 - i * 5), { labelA: 'Crude', labelB: 'S&P' });
  assert.match(svg, /<svg/);
  assert.match(svg, /Crude \+59\.0%/, 'the left leg must be shown as a percentage from the start');
  assert.match(svg, /S&amp;P -5\.9%/, 'and so must the right, escaped');
  assert.match(svg, /points apart/, 'the gap is the point of this chart');
  assert.match(svg, /aria-label="[^"]*rebased to zero/, 'and it must be described for a screen reader');
});

t('a chart with almost no data says so instead of drawing a lie', () => {
  for (const bad of [[], [1, 2], null, [null, null, null, null, null, null]]) {
    assert.match(dualLine(bad, seq(60, i => i + 1)), /Not enough/);
    assert.match(levelLine(bad), /Not enough/);
  }
  assert.equal(spark([1, 2]), '');
});

t('gaps are carried rather than drawn as a hole', () => {
  const holed = seq(60, i => (i % 7 === 3 ? null : 100 + i));
  const svg = levelLine(holed, { label: 'Gilt', unit: 'bp' });
  assert.match(svg, /<path/);
  assert.doesNotMatch(svg, /NaN/, 'a null must never reach the path data');
});

t('a level chart calls out where it started and where it ended', () => {
  const svg = levelLine(seq(40, i => 0.54 - i * 0.0085), { label: '2s10s', unit: 'bp', mult: 100, decimals: 0 });
  assert.match(svg, /54bp/, 'the starting level must be on the chart');
  assert.match(svg, /21bp|20bp/, 'and so must where it got to');
  assert.match(svg, /2s10s · 54bp → /, 'the caption carries the change, not just the endpoints');
});

t('the histogram puts today against its own past and says the percentile', () => {
  const hist = seq(400, i => Math.sin(i / 11) * 3);
  const svg = histogram(hist, 9.5, { unit: '%' });
  assert.match(svg, /today \+9\.50%/, 'readings under 10 keep two decimals');
  assert.match(svg, /bigger than 100% of the last 400 readings/);
  assert.match(svg, /class="mvc-bar now"/, 'the bin holding today must be marked');
  const mid = histogram(hist, 0, { unit: '%' });
  assert.match(mid, /bigger than [45]\d% of/, 'a middling reading must not look extreme');
});

t('every colour comes from a class, so both themes work without redrawing', () => {
  const all = dualLine(seq(60, i => 100 + i), seq(60, i => 200 - i))
    + levelLine(seq(60, i => i)) + histogram(seq(300, i => Math.cos(i / 9)), 0.4) + spark(seq(30, i => i));
  assert.doesNotMatch(all, /#[0-9a-fA-F]{3,6}\b/, 'no hard-coded hex may appear in chart output');
  assert.doesNotMatch(all, /style="[^"]*(fill|stroke|color):/, 'and no inline paint either');
});

t('numbers are escaped and no user text can inject markup', () => {
  const svg = dualLine(seq(60, i => i + 1), seq(60, i => i + 2), { labelA: '<script>x</script>', labelB: 'B&B' });
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;/);
  assert.match(svg, /B&amp;B/);
});

t('a flat series does not divide by zero', () => {
  assert.doesNotThrow(() => levelLine(seq(40, () => 5)));
  assert.doesNotThrow(() => dualLine(seq(40, () => 5), seq(40, () => 9)));
  assert.match(histogram(seq(50, () => 2), 2), /No variation/);
  assert.doesNotMatch(levelLine(seq(40, () => 5)), /NaN|Infinity/);
});

console.log(`mvChart: ${n} groups, all passed`);
