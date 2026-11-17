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

// Found 2026-11-17 (sweep): the Options positioning cards' calls-against-puts gauge was a fixed-width SVG wider than its card (3 cards spilled at 1440).
test('the Options gauge SVG shrinks with its card (max-width:100%)', () => {
  const src = rd('./optionsView.js'), i = src.indexOf('aria-label="calls against puts gauge"');
  assert.ok(i > 0, 'the gauge exists');
  const tag = src.slice(src.lastIndexOf('<svg', i), i);
  assert.match(tag, /max-width:100%/);
});

// Found 2026-11-17 (sweep): at 390px the Macro Credit & liquidity board scrolled sideways: a nowrap Evidence Book chip (420px) and a bare table (393px) in a 342px card.
test('the Evidence Book stamp chip wraps and a bare table in a board card scrolls inside itself', () => {
  const css = rd('./terminal-tabs.css');
  assert.match(css, /\.bv-stamp \.chip\{white-space:normal;max-width:100%/);
  assert.match(css, /\.sfc \.card>table\{display:block;max-width:100%;overflow-x:auto\}/);
});

// Found 2026-11-17 (sweep): the Options path-walk SVG was fixed-width inside a plot box that shrinks (spilled at 390 and 768), and the 'What drives this' direction column was a fixed 92px
// while "●●○ HEADWIND" needs about 100px (spilled at 768 and 1440).
test('the Options walk SVG shrinks with its box, and the headwind column is as wide as its word', () => {
  const src = rd('./optionsView.js'), i = src.indexOf('aria-label="price and the option walk by expiry"');
  assert.ok(i > 0); assert.match(src.slice(src.lastIndexOf('<svg', i), i), /max-width:100%/);
  assert.match(rd('./humanDrivers.css'), /\.hd-pt \{ display: grid; grid-template-columns: minmax\(92px, max-content\) 1fr;/);
});

// Found 2026-11-17 (sweep): "Cannot set properties of null (setting 'onclick')" once on the Analytics tab: the book-risk render looked its Run and Reset buttons up on the document, not in its own element.
test('the book-risk scenario buttons are looked up inside their own render and guarded', () => {
  const html = fs.readFileSync(new URL('../../desk-terminal.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(html, /const bkrReset = el\.querySelector\('#bkrreset'\), bkrGo = el\.querySelector\('#bkrgo'\); if \(!bkrReset \|\| !bkrGo\) return;/);
  assert.ok(!/\$\('bkrreset'\)\.onclick/.test(html) && !/\$\('bkrgo'\)\.onclick/.test(html));
});
