// The Desk Terminal's colour themes (js/terminal/themes.js): the default is today's palette exactly, every theme defines only known tokens, every
// non-default theme keeps readable text on its own backgrounds (WCAG AA; the high-contrast theme AAA), the colour-blind theme's up and down
// differ in brightness as well as hue, and the generated stylesheet matches the source.
//   node --test js/terminal/themes.test.mjs
// If the stylesheet test fails: run  node scripts/build_theme_css.mjs  and commit js/terminal/themes.css.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEMES, TOKENS, THEME_IDS, THEME_KEY, themesCssText, contrast, luminance, themeById, loginThemeCss, LOGIN_DEFAULT } from './themes.js';
import { deskLoginPage } from '../deskLoginPage.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = read('desk-terminal.html');

const rootBlock = (() => { const i = html.indexOf(':root{'); return html.slice(i + 6, html.indexOf('\n}', i)); })();
const rootDecls = Object.fromEntries([...rootBlock.matchAll(/--([a-z0-9-]+):([^;]+);/g)].map(m => [m[1], m[2].trim()]));

test('the default theme is exactly the :root block of desk-terminal.html', () => {
  const d = themeById('default').tokens;
  for (const [k, v] of Object.entries(d)) assert.equal(rootDecls[k], v, `--${k}: :root has ${rootDecls[k]}, themes.js default has ${v}`);
  for (const k of Object.keys(TOKENS)) assert.ok(k in d, `default theme is missing token ${k}`);
});

test('no theme uses an unknown token, and the ids are unique, lowercase letters only', () => {
  assert.equal(new Set(THEME_IDS).size, THEME_IDS.length);
  assert.equal(THEME_IDS[0], 'default');
  for (const t of THEMES) {
    assert.match(t.id, /^[a-z]{3,12}$/, `${t.id}: ids are 3-12 lowercase letters (the head script checks that shape)`);
    for (const k of Object.keys(t.tokens)) assert.ok(k in TOKENS, `${t.id}: unknown token ${k}`);
    assert.equal(t.swatch.length, 5, `${t.id}: swatch is [page, panel, accent, up, down]`);
  }
});

const text = ['tx', 'tx2', 'tx3'], grounds = ['bg', 'bg1', 'bg2'];
const tok = (t, k) => (t.tokens[k] ?? themeById('default').tokens[k]);

test('every non-default theme: body text and labels are AA (4.5:1) on all three grounds, accents and direction colours too', () => {
  for (const t of THEMES.filter(x => x.id !== 'default')) {
    for (const g of grounds) {
      for (const k of [...text, 'pur2', 'gold', 'up', 'dn']) {
        const c = contrast(tok(t, k), tok(t, g));
        assert.ok(c >= 4.5, `${t.id}: ${k} ${tok(t, k)} on ${g} ${tok(t, g)} is ${c.toFixed(2)}:1, needs 4.5`);
      }
    }
  }
});

test('high contrast is AAA (7:1) for body text', () => {
  const t = themeById('contrast');
  for (const g of grounds) for (const k of text) assert.ok(contrast(tok(t, k), tok(t, g)) >= 7, `contrast: ${k} on ${g}`);
});

test('the default keeps the contrast it has today (recorded: it is the original palette and is not changed)', () => {
  const t = themeById('default');
  for (const g of grounds) { assert.ok(contrast(tok(t, 'tx'), tok(t, g)) >= 7); assert.ok(contrast(tok(t, 'tx2'), tok(t, g)) >= 4.5); assert.ok(contrast(tok(t, 'tx3'), tok(t, g)) >= 3, 'tx3 is the quiet label grey'); }
});

test('colour-blind theme: up and down differ in brightness (not only hue) and from each other by at least 2:1', () => {
  const t = themeById('colourblind');
  assert.ok(contrast(tok(t, 'up'), tok(t, 'dn')) >= 2, `up/dn ${contrast(tok(t, 'up'), tok(t, 'dn')).toFixed(2)}:1`);
  assert.ok(luminance(tok(t, 'up')) > luminance(tok(t, 'dn')));
  assert.notEqual(tok(t, 'up'), '#2fd39a'); assert.notEqual(tok(t, 'dn'), '#ff5d78');
  assert.equal(tok(t, 'uprgb'), '142,224,255'); assert.equal(tok(t, 'dnrgb'), '232,89,12');
});

test('a theme\'s rgb triples match its hex colours', () => {
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',');
  for (const t of THEMES) {
    for (const [hex, tri] of [['bg', 'bgrgb'], ['tx', 'txrgb'], ['pur', 'purrgb'], ['pur2', 'pur2rgb'], ['gold', 'goldrgb'], ['up', 'uprgb'], ['dn', 'dnrgb'], ['teal', 'tealrgb']]) {
      assert.equal(tok(t, tri), rgb(tok(t, hex)), `${t.id}: ${tri} (${tok(t, tri)}) does not match ${hex} (${tok(t, hex)})`);
    }
  }
});

test('themes.css is exactly what themes.js generates', () => {
  assert.equal(read('js/terminal/themes.css').replace(/\r\n/g, '\n'), themesCssText(), 'run: node scripts/build_theme_css.mjs');
});

test('desk-terminal.html wires it: the head script, the stylesheets, the chip and the module, and the console font link matches', () => {
  assert.ok(html.includes("localStorage.getItem('" + THEME_KEY + "')"), 'the head script reads the saved theme');
  for (const f of ['js/terminal/themes.css', 'js/terminal/theme-picker.css']) assert.ok(html.includes(`href="${f}"`), f);
  assert.ok(html.includes('src="js/terminal/themePicker.js"'));
  assert.ok(html.includes('id="themebtn"') && html.includes('id="themepop"'));
  const c = themeById('console');
  assert.ok(html.includes(c.fontHref), 'the head script loads the same console font as themes.js');
  // the head script runs before the first stylesheet, so there is no flash
  assert.ok(html.indexOf("getItem('deskTheme')") < html.indexOf('<style>'));
});

test('the sign-in page follows the saved theme: head script, every theme block, and its button text is readable on every theme button fill', () => {
  const page = deskLoginPage('/desk-terminal.html');
  assert.ok(page.includes("localStorage.getItem('" + THEME_KEY + "')"), 'the login head script reads the saved theme');
  assert.ok(page.includes(loginThemeCss()), 'the login page inlines the same theme blocks');
  for (const t of THEMES.filter(x => x.id !== 'default')) assert.ok(page.includes('html[data-theme="' + t.id + '"]'), t.id);
  assert.ok(!page.includes('${'), 'no template placeholder leaked into the page');
  for (const t of THEMES.filter(x => x.login)) {
    const stops = t.login.btnBg.match(/#[0-9a-f]{6}/gi);
    assert.ok(stops && stops.length >= 2, t.id + ': an opaque two-stop button fill');
    for (const st of stops) assert.ok(contrast(t.login.btnFg, st) >= 4.5, t.id + ': button text ' + t.login.btnFg + ' on ' + st + ' is ' + contrast(t.login.btnFg, st).toFixed(2));
  }
  assert.equal(LOGIN_DEFAULT.btnFg, '#ffffff');
});
