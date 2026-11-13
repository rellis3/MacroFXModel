// GUARD: the Desk Terminal's colours come from the theme tokens, so every theme recolours the whole page.
//   node --test js/terminal/themeTokens.test.mjs
// If this fails, you hard-coded a palette colour. Use var(--up), var(--tx2) ... or rgba(var(--uprgb),.4) (the token list is TOKENS in js/terminal/themes.js
// and the :root block of desk-terminal.html). Colours drawn in code that cannot take var() (a chart library, a computed fill) read the token at draw
// time with themeColor('up') / themeRgba('up', .4) and redraw on the 'themechange' event (see the candle chart in desk-terminal.html).
// A colour that is NOT part of the palette (a categorical series colour, a canvas with its own dark palette) goes in ALLOW below with the reason.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEMES, TOKENS } from './themes.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// kept on purpose, with the reason: [file, colour]
const ALLOW = [
  ['js/terminal/terrainPanel.js', '#6fb6ff'],   // the OI terrain canvas (js/terrainChart.js, shared with oi-dashboard-v2) keeps its own dark palette; these label its calls / puts
  ['js/terminal/terrainPanel.js', '#f0b04a'],
  ['js/terminal/terrainPanel.js', '#090e13'],   // the canvas background
  ['js/terminal/corrView.js', '#e0a458'],       // the OIL series in the correlation lines: a categorical series colour, not a palette colour
];
const NEUTRAL_RGB = new Set(['0,0,0']);        // black shadows

const palette = new Set(THEMES.flatMap(t => Object.entries(t.tokens).filter(([k]) => k.endsWith('rgb')).map(([, v]) => v.replace(/\s/g, ''))));
const defaultHex = new Set(Object.values(THEMES[0].tokens).filter(v => /^#[0-9a-f]{3,6}$/i.test(v)).map(v => v.toLowerCase()));

const files = ['desk-terminal.html',
  ...fs.readdirSync(path.join(ROOT, 'js', 'terminal')).filter(f => /\.(js|css)$/.test(f) && !/\.test\./.test(f) && !/^(themes|themePicker|theme-picker)\./.test(f)).map(f => `js/terminal/${f}`)];

function clean(text, file) {
  let t = text.replace(/\r\n/g, '\n');
  if (file === 'desk-terminal.html') { const i = t.indexOf(':root{'); t = t.slice(t.indexOf('\n}', i) + 2); }   // the :root block IS the default theme
  t = t.replace(/\/\*[\s\S]*?\*\//g, '');                          // css / block comments
  t = t.split('\n').map(l => l.replace(/(^|\s)\/\/\s.*$/, '$1')).join('\n');   // line comments
  // a var(--x, fallback) fallback is never reached (every token is defined); do not scan it
  let out = '', i = 0;
  for (;;) {
    const j = t.indexOf('var(--', i);
    if (j < 0) { out += t.slice(i); break; }
    out += t.slice(i, j);
    const m = /^var\(--[a-zA-Z0-9-]+/.exec(t.slice(j));
    let k = j + m[0].length;
    if (t[k] === ',') { let d = 1; k++; while (k < t.length && d) { if (t[k] === '(') d++; else if (t[k] === ')') d--; k++; } } else k = j + m[0].length;
    out += m[0] + ')'; i = k;
  }
  return out;
}

test('GUARD: no palette colour is hard-coded in desk-terminal.html or js/terminal/*.js|css', () => {
  const bad = [];
  for (const f of files) {
    const t = clean(read(f), f);
    t.split('\n').forEach((line, n) => {
      for (const m of line.matchAll(/(?<![&\w])#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
        if (ALLOW.some(([af, ac]) => af === f && ac === m[0].toLowerCase())) continue;
        bad.push(`${f}:${n + 1}  ${m[0]}  | ${line.trim().slice(0, 110)}`);
      }
      for (const m of line.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
        const tri = `${m[1]},${m[2]},${m[3]}`;
        if (NEUTRAL_RGB.has(tri)) continue;
        bad.push(`${f}:${n + 1}  rgba(${tri},...)  | ${line.trim().slice(0, 110)}`);
      }
      for (const m of line.matchAll(/(?<![\d.])(\d{1,3}, ?\d{1,3}, ?\d{1,3})(?![\d.])/g)) {   // a palette colour as bare numbers: '232,184,90', [139, 124, 246]
        const tri = m[1].replace(/\s/g, '');
        if (palette.has(tri) && !/rgba?\(/.test(line.slice(Math.max(0, m.index - 6), m.index))) bad.push(`${f}:${n + 1}  ${tri} (a palette colour as numbers)  | ${line.trim().slice(0, 110)}`);
      }
    });
  }
  assert.deepEqual(bad, [], 'Hard-coded colours do not follow the theme. Use var(--token) / rgba(var(--xrgb),a), or themeColor() in code (see the header of this test):\n  ' + bad.join('\n  '));
});

test('every var(--token) the terminal uses is a defined token (or declared locally), so no theme leaves a hole', () => {
  const defined = new Set(Object.keys(TOKENS));
  ['purbg', 'goldbg', 'upbg', 'dnbg', 'r'].forEach(k => defined.add(k));          // derived in :root
  const used = new Map();
  for (const f of files) {
    const t = read(f);
    for (const m of t.matchAll(/(?:^|[;{\s"'`])--([a-zA-Z0-9-]+)\s*:/g)) defined.add(m[1]);   // a custom property declared in the file itself
  }
  for (const f of files) {
    const t = clean(read(f), f);
    for (const m of t.matchAll(/var\(--([a-zA-Z0-9-]+)/g)) if (!used.has(m[1])) used.set(m[1], f);
  }
  const missing = [...used].filter(([k]) => !defined.has(k)).map(([k, f]) => `--${k} (first used in ${f})`);
  assert.deepEqual(missing, [], 'A token is used but not defined in the default :root, in js/terminal/themes.js, or locally:\n  ' + missing.join('\n  '));
});

test('every theme defines every colour token itself (a theme never falls back to the default navy by accident), except the colour-blind theme which is the default plus a swapped up/down', () => {
  const colourKeys = Object.keys(TOKENS).filter(k => !['mono', 'sans'].includes(k));
  for (const t of THEMES.filter(x => !['default', 'colourblind'].includes(x.id))) {
    const miss = colourKeys.filter(k => !(k in t.tokens));
    assert.deepEqual(miss, [], `${t.id} does not define: ${miss.join(', ')}`);
  }
});

test('the default hex values are only written in :root and themes.js (a copy anywhere else is caught above); the allow list is not stale', () => {
  for (const [f, c] of ALLOW) assert.ok(read(f).toLowerCase().includes(c), `ALLOW entry ${f} ${c} no longer appears: remove it`);
  assert.ok(defaultHex.size > 10);
});
