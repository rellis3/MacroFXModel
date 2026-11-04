// Tests for js/systemCatalogue.js.   node js/systemCatalogue.test.mjs
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { CATALOGUE, SECTIONS, coverage, catalogueText } from './systemCatalogue.js';
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
t('ids unique, statuses valid, every section used', () => {
  assert.equal(new Set(CATALOGUE.map(r => r.id)).size, CATALOGUE.length);
  for (const r of CATALOGUE) assert.ok(['have', 'partial', 'missing', 'out'].includes(r.status), r.id);
  for (const s of SECTIONS) assert.ok(CATALOGUE.some(r => r.section === s), s);
  assert.ok(CATALOGUE.length >= 110);
});
t('every js/ file a "have" or "partial" row names exists', () => {
  for (const r of CATALOGUE) for (const m of r.where.matchAll(/js\/[\w/.-]+\.m?js/g)) assert.ok(existsSync(new URL(`../${m[0]}`, import.meta.url)), `${r.id}: ${m[0]}`);
});
t('coverage counts and the prompt text', () => {
  const c = coverage(); assert.equal(Object.values(c).reduce((a, s) => a + s.have + s.partial + s.missing + s.out, 0), CATALOGUE.length);
  assert.match(catalogueText(), /\[missing\] FX Fair Value Forecasting System/);
});
console.log(`systemCatalogue: ${n} tests passed`);
