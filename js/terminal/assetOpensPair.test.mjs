// js/terminal/assetOpensPair.test.mjs: an Assets-tab card opens that market's Pair page (flow review item 2, 2026-11-16), not a second copy of the deep view.
// Reads the page source; the real click is an owner click-through. node --test js/terminal/assetOpensPair.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../../desk-terminal.html', import.meta.url), 'utf8');
const tabs = fs.readFileSync(new URL('./terminalTabs.js', import.meta.url), 'utf8');
test('every [data-inst] card, the Analyse button and the strength bars go through openAsset', () => {
  assert.match(html, /querySelectorAll\('\[data-inst\]'\)\.forEach\(el => \{ const go = \(\) => openAsset\(el\.dataset\.inst\)/);
  assert.match(html, /globalThis\.aaAutoRun = n; openAsset\(n\);/);
  assert.match(html, /if \(D\.cards\[nm\]\) openAsset\(nm\);/);
});
test('openAsset opens the Pair page, and falls back to the pop-up only when the Pair module is missing', () => {
  const f = html.slice(html.indexOf('function openAsset(n)'), html.indexOf('function wire(root)'));
  assert.match(f, /typeof globalThis\.openPairPage === 'function'\) \{ globalThis\.openPairPage\(n\); return; \}/);
  assert.match(f, /openModal\(assetCard\(n, c, true\)\)/, 'the fallback is kept');
});
test('what only the pop-up had (the group desk line) now sits on the Pair page', () => {
  assert.match(html, /globalThis\.deskViewHtml = deskView;/);
  assert.match(tabs, /\$\{AAV\.boxHtml\(n\)\}\$\{globalThis\.deskViewHtml\?\.\(n\) \?\? ''\}/);
});
