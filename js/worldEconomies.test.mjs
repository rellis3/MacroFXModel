import test from 'node:test';
import assert from 'node:assert/strict';
import { worldEconomies, worldEconomiesHtml, monthOf } from './worldEconomies.js';

const esc = s => String(s);
const gdp = { byCcy: { USD: { latestGrowth: 0.8, latestDate: '2026-07-01', z: 0.5, recessionFlag: false }, GBP: { latestGrowth: -0.2, latestDate: '2026-04-01', z: -1, recessionFlag: true }, EUR: { latestGrowth: 0.3, latestDate: '2026-07-01', z: 0, recessionFlag: false } } };
const cpi = { byCcy: { USD: { dims: { headlineLevel: { latestYoy: 4.0, latestDate: '2026-09-01', target: 2 }, coreLevel: { latestYoy: 2.8, latestDate: '2026-09-01', target: 2 } } }, EUR: { dims: { headlineLevel: { latestYoy: 2.1, latestDate: '2026-09-01', target: 2 } } }, GBP: { dims: {}, discontinued: {} }, CHF: { dims: { headlineLevel: { latestYoy: 0.2, latestDate: '2026-09-01', target: 2 } } } } };
const labor = { byCcy: { USD: { dims: { unemploymentTrend: { latestLevel: 4.2, latestDate: '2026-09-01' }, wageGrowth: { latestYoyPct: 3.0, latestDate: '2026-09-01' } } }, EUR: { dims: { unemploymentTrend: { latestLevel: 6.3, latestDate: '2026-08-01' } } } } };
const curve = { byCcy: { USD: { latestSlope: 0.34, latestDate: '2026-09-01' }, JPY: { latestSlope: -0.1, latestDate: '2026-09-01' } } };

test('rows carry the raw prints and leave missing feeds null', () => {
  const w = worldEconomies({ gdp, cpi, labor, curve });
  const gb = w.rows.find(r => r.ccy === 'GBP'), us = w.rows.find(r => r.ccy === 'USD');
  assert.equal(w.rows.length, 8);
  assert.equal(gb.inflation, null);
  assert.equal(us.inflation.head, 4.0);
  assert.equal(us.inflation.core, 2.8);
  assert.equal(us.jobs.unemp, 4.2);
  assert.equal(w.rows.find(r => r.ccy === 'NZD').growth, null);
});

test('cross lines compare economies and name the squeezed, flagged and inverted', () => {
  const t = worldEconomies({ gdp, cpi, labor, curve }).lines.join(' ');
  assert.match(t, /Headline inflation is highest in USD \(4\.0%\) and lowest in CHF \(0\.2%\)/);
  assert.match(t, /strongest in USD .* weakest in GBP/);
  assert.match(t, /Wages are growing slower than prices in USD/);
  assert.match(t, /recession flag is on for GBP/);
  assert.match(t, /inverted .* in JPY/);
});

test('no line implies a direction', () => {
  const t = worldEconomies({ gdp, cpi, labor, curve }).lines.join(' ');
  assert.doesNotMatch(t, /will |likely|expect|forecast|should/i);
});

test('table shows no feed rather than a guess, and the month each print describes', () => {
  const h = worldEconomiesHtml(worldEconomies({ gdp, cpi, labor, curve }), esc, '2026-11-01');
  assert.match(h, /no feed/);
  assert.match(h, /Sep/);
  assert.match(h, /recession flag/);
  assert.match(h, /−10bp/);
  assert.equal(worldEconomiesHtml(null, esc), '');
});

test('monthOf adds the year only when it differs', () => {
  assert.equal(monthOf('2026-09-01', '2026-11-01'), 'Sep');
  assert.equal(monthOf('2025-12-01', '2026-11-01'), 'Dec 25');
  assert.equal(monthOf(null), '');
});
