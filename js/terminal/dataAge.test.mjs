// node js/terminal/dataAge.test.mjs: the shared data-age chip.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ageHours, ageLevel, ageWords, ageChip, tileChip, LAPTOP_TILES } from './dataAge.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };
const NOW = Date.parse('2026-11-15T12:00:00Z');

t('ageHours reads ISO, epoch ms and a bare date (end of that UTC day)', () => {
  assert.equal(Math.round(ageHours('2026-11-15T09:00:00Z', NOW)), 3);
  assert.equal(Math.round(ageHours(NOW - 5 * 3600e3, NOW)), 5);
  assert.equal(Math.round(ageHours('2026-11-14', NOW)), 12);
  assert.equal(ageHours(null, NOW), null); assert.equal(ageHours('', NOW), null); assert.equal(ageHours('not a date', NOW), null);
  assert.equal(ageHours('2026-11-16T00:00:00Z', NOW), 0);   // a clock a little ahead is never a negative age
});
t('levels: ok below warn, warn, then bad; unknown when there is no age', () => {
  assert.equal(ageLevel(1), 'ok'); assert.equal(ageLevel(36), 'warn'); assert.equal(ageLevel(95), 'warn'); assert.equal(ageLevel(96), 'bad');
  assert.equal(ageLevel(null), 'unknown'); assert.equal(ageLevel(NaN), 'unknown');
  assert.equal(ageLevel(60, { warnH: 48, badH: 120 }), 'warn');
});
t('words', () => {
  assert.equal(ageWords(0.2), 'just now'); assert.equal(ageWords(5), '5h ago'); assert.equal(ageWords(261), '11 days ago'); assert.equal(ageWords(null), 'age unknown');
});
t('a fresh tile is plain, a stale one is amber and says so, a very stale one is red and says so', () => {
  const ok = ageChip({ ageH: 3, what: 'skew pulled' }), warn = ageChip({ ageH: 50, what: 'skew pulled' }), bad = ageChip({ ageH: 261, what: 'skew pulled' });
  assert.ok(!/gold|dn/.test(ok) && !/stale/.test(ok));
  assert.ok(/chip dage gold/.test(warn) && /· stale/.test(warn) && !/very stale/.test(warn));
  assert.ok(/chip dage dn/.test(bad) && /very stale/.test(bad) && /11 days ago/.test(bad));   // wording, not colour alone
});
t('a feed with no timestamp says so instead of looking fresh', () => {
  const c = ageChip({ asOf: null, what: 'basis pulled' });
  assert.ok(/age unknown/.test(c) && /chip dage gold/.test(c) && /no timestamp/.test(c));
});
t('the route-computed ageH wins over asOf; asOf works alone', () => {
  assert.ok(/9h ago/.test(ageChip({ ageH: 9, asOf: '2020-01-01' })));
  assert.ok(/3h ago/.test(ageChip({ asOf: '2026-11-15T09:00:00Z', now: NOW })));
});
t('the title explains what a stale laptop-fed tile means; labels are escaped', () => {
  assert.ok(/laptop is off/.test(ageChip({ ageH: 200 })));
  assert.ok(!/<script/.test(ageChip({ ageH: 1, what: '<script>x</script>' })));
});
t('every laptop-fed tile has a threshold, and tileChip uses it', () => {
  for (const id of ['fed-path-zq', 'cb-expectations', 'options-skew', 'oi-store', 'xccy-basis']) assert.ok(LAPTOP_TILES[id], id);
  assert.ok(/stale/.test(tileChip('options-skew', { ageH: 60 })) && !/stale/.test(tileChip('options-skew', { ageH: 20 })));
});
t('the laptop-fed tiles in the terminal actually use the chip (guard: no bare "h old" text again)', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const html = readFileSync(join(root, 'desk-terminal.html'), 'utf8');
  for (const id of ['cb-expectations', 'options-skew', 'xccy-basis']) assert.ok(html.includes(`tileChip('${id}'`) || html.includes(`dataAge?.tileChip('${id}'`), `${id} tile has no data-age chip in desk-terminal.html`);
  assert.ok(!/\$\{xb\.ageH\} ?h old/.test(html) && !/\$\{sk\.ageH\}h old/.test(html));
});
console.log(`\n${n} passed`);
