// js/terminal/pageWidthLayout.test.mjs: static guards that stop a Desk Terminal PAGE (not just one board) scrolling sideways.
// Found 2026-11-16: the Overview was 1477px wide on a 1440px screen and 502px on a 390px phone. Causes, all in desk-terminal.html:
//  1. .grid had no column template, so its implicit `auto` column grew to the min-content of its widest child (the 8-box strength strip, 712px in a 697px column).
//  2. .strength used repeat(8,1fr): 1fr has a min-content floor, so 8 boxes could not shrink. minmax(0,1fr) can.
//  3. A long status chip (white-space:nowrap) and a bare <table> inside the Emerging-markets card were wider than a phone.
// These read source text (no browser). scripts/insight-overflow.mjs --pagewidth is the real measurement (headless Chromium, live data).
// node --test js/terminal/pageWidthLayout.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rd = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const html = rd('../../desk-terminal.html');
const rule = (src, sel) => { const m = new RegExp('(?:^|[}\\n])\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'm').exec(src); return m ? m[1] : ''; };

test('.grid has a shrinkable column and its children may shrink (an implicit auto column grows to min-content)', () => {
  assert.match(rule(html, '.grid'), /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(html, /\.grid>\*\s*\{[^}]*min-width:\s*0/);
  // the multi-column variants still win (they come later in the file and carry their own template)
  assert.ok(html.indexOf('.g2{') > html.indexOf('.grid{') && html.indexOf('.g4{') > html.indexOf('.grid{'), '.g2/.g3/.g4 must come after .grid');
});

test('the strength strip and its boxes can shrink at both column counts', () => {
  assert.match(rule(html, '.strength'), /repeat\(8,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(html, /@media \(max-width:760px\)\{\.strength\{grid-template-columns:repeat\(4,\s*minmax\(0,\s*1fr\)\)\}\}/);
  assert.match(rule(html, '.sbox'), /min-width:\s*0/);
});

test('no plain repeat(N,1fr) with four or more columns in the terminal stylesheets (1fr floors at min-content; use minmax(0,1fr))', () => {
  const files = ['../../desk-terminal.html', './terminal-tabs.css', './insight.css', './book-panels.css', './corr-tab.css', './replay.css', './replay-viz.css', './command-line.css'];
  const bad = [];
  for (const f of files) { let src; try { src = rd(f); } catch { continue; } for (const m of src.matchAll(/repeat\((\d+),\s*1fr\)/g)) if (+m[1] >= 4) bad.push(`${f}: ${m[0]}`); }
  assert.deepEqual(bad.filter(b => !/terminal-tabs\.css: repeat\(24,\s*1fr\)/.test(b)), [], 'use repeat(N,minmax(0,1fr))');
});

test('the tab row wraps on a wide screen and scrolls inside itself on a phone, never widening the page', () => {
  const tabs = rule(html, '.tabs');
  assert.match(tabs, /max-width:\s*100%/); assert.match(tabs, /flex-wrap:\s*wrap/);
  const phone = /@media \(max-width:820px\)\{([^@]*?\.tabs\{[^}]*\})/.exec(html)?.[1] ?? '';
  assert.match(phone, /overflow-x:\s*auto/); assert.match(phone, /width:\s*100%/); assert.match(phone, /flex-wrap:\s*nowrap/);
});

test('card header status chips wrap on a phone and the header row may shrink', () => {
  assert.match(html, /@media \(max-width:820px\)\{\.card \.chip\{[^}]*white-space:\s*normal/);
  assert.match(rule(html, '.ch .r'), /flex-wrap:\s*wrap/); assert.match(rule(html, '.ch .r'), /min-width:\s*0/);
  assert.match(rule(html, '.card'), /min-width:\s*0/);
});

test('the Overview Emerging-markets table sits in a scroll box', () => {
  const i = html.indexOf('data-surface="panel.ov.em"'); assert.ok(i > 0, 'the EM card is on the Overview');
  const card = html.slice(i, html.indexOf('USD/EM up (red)', i));
  assert.match(card, /<div class="scroll"><table>/);
  assert.match(card, /<\/table><\/div><p class="muted"[^>]*>$/);
  assert.match(html, /\.scroll\{overflow-x:\s*auto\}/);
});
