// Synthetic, no-network unit tests for the profile-shape classifier brick.
//   node js/profileShapeCore.test.mjs

import {
  buildHistogram, valueArea, classifyProfileShape, profileShapeBias, classifyBars,
} from './profileShapeCore.js';

let failures = 0;
const ok = (name, cond, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) failures++;
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// Build a histogram from an array of per-bin volumes starting at `base`.
const hist = (vols, base = 100, step = 1) =>
  vols.map((v, i) => ({ price: base + i * step, volume: v }));

// ── valueArea ─────────────────────────────────────────────────────────────────
console.log('[valueArea]');
{
  // Symmetric triangle: POC dead centre.
  const bins = hist([1, 2, 3, 4, 5, 4, 3, 2, 1]);
  const va = valueArea(bins, 0.70);
  ok('POC at the peak bin', near(va.poc, 104), `poc=${va.poc}`);
  ok('VAL below POC', va.val < va.poc);
  ok('VAH above POC', va.vah > va.poc);
  ok('value area is a subset of range', va.val >= 100 && va.vah <= 108);
  ok('empty histogram → null', valueArea([]) === null);
  ok('all-zero histogram → null', valueArea(hist([0, 0, 0])) === null);
}

// ── P shape: fat base at the LOW, thin tail up (bullish) ───────────────────────
console.log('[P shape — POC low, bullish]');
{
  const bins = hist([6, 8, 7, 4, 3, 2, 2, 1, 1, 1]);
  const c = classifyProfileShape(bins);
  ok('classified P', c.shape === 'P', `got ${c.shape} pocPos=${c.pocPos.toFixed(2)}`);
  ok('POC in lower third', c.pocPos < 0.34, `pocPos=${c.pocPos.toFixed(2)}`);
  ok('bias is follow/long', c.bias.action === 'follow' && c.bias.direction === 'long');
  ok('confidence in [0,1]', c.confidence >= 0 && c.confidence <= 1);
}

// ── b shape: fat top at the HIGH, thin tail down (bearish) ─────────────────────
console.log('[b shape — POC high, bearish]');
{
  const bins = hist([1, 1, 1, 2, 2, 3, 4, 7, 8, 6]);
  const c = classifyProfileShape(bins);
  ok('classified b', c.shape === 'b', `got ${c.shape} pocPos=${c.pocPos.toFixed(2)}`);
  ok('POC in upper third', c.pocPos > 0.66, `pocPos=${c.pocPos.toFixed(2)}`);
  ok('bias is follow/short', c.bias.action === 'follow' && c.bias.direction === 'short');
}

// ── D shape: fat middle, thin ends (balance) ──────────────────────────────────
console.log('[D shape — balance]');
{
  const bins = hist([1, 2, 4, 7, 9, 7, 4, 2, 1]);
  const c = classifyProfileShape(bins);
  ok('classified D', c.shape === 'D', `got ${c.shape} pocPos=${c.pocPos.toFixed(2)}`);
  ok('POC near centre', Math.abs(c.pocPos - 0.5) < 0.15, `pocPos=${c.pocPos.toFixed(2)}`);
  ok('bias is fade/both', c.bias.action === 'fade' && c.bias.direction === 'both');
  ok('fade edges are VAH/VAL', c.bias.upperFade === c.vah && c.bias.lowerFade === c.val);
}

// ── B shape: double distribution, LVN waist ───────────────────────────────────
console.log('[B shape — double distribution]');
{
  const bins = hist([2, 7, 8, 5, 2, 1, 2, 5, 9, 7, 2]);
  const c = classifyProfileShape(bins);
  ok('classified B', c.shape === 'B', `got ${c.shape} lvn=${c.lvn}`);
  ok('LVN found in the waist', c.lvn != null && c.lvn > 103 && c.lvn < 107, `lvn=${c.lvn}`);
  ok('two peaks reported', c.peaks.length >= 2);
  ok('bias is follow with decision level', c.bias.action === 'follow' && c.bias.decisionLevel === c.lvn);
}

// ── B direction resolves by live price vs LVN ─────────────────────────────────
console.log('[B bias — direction by LVN side]');
{
  const va = { poc: 108, vah: 109, val: 101, lvn: 105 };
  ok('price above LVN → long', profileShapeBias('B', va, 106).direction === 'long');
  ok('price below LVN → short', profileShapeBias('B', va, 104).direction === 'short');
  ok('no price → null direction', profileShapeBias('B', va).direction === null);
}

// ── buildHistogram from OHLC bars ─────────────────────────────────────────────
console.log('[buildHistogram + classifyBars]');
{
  // Bars clustered low then a thin drift up → should read as P.
  const bars = [];
  for (let i = 0; i < 40; i++) bars.push(bar(1.2000 + 0.0001 * Math.min(i, 8)));
  for (let i = 0; i < 6; i++) bars.push(bar(1.2020 + 0.0002 * i));
  const bins = buildHistogram(bars);
  ok('histogram is zero-filled & ascending', bins.length > 5 && bins.every((b, i, a) => i === 0 || b.price > a[i - 1].price));
  const c = classifyBars(bars);
  ok('classifyBars returns a shape', ['P', 'b', 'D', 'B'].includes(c.shape), `shape=${c.shape}`);
  ok('empty bars → []', buildHistogram([]).length === 0);
  ok('classifyBars([]) → null', classifyBars([]) === null);
}

function bar(mid) {
  return { open: mid, high: mid + 0.0001, low: mid - 0.0001, close: mid, volume: 1 };
}

console.log(`\n${failures ? '✗ ' + failures + ' failure(s)' : '✓ all profileShapeCore tests passed'}`);
process.exit(failures ? 1 : 0);
