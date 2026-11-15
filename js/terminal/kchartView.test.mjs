// node js/terminal/kchartView.test.mjs: how the Chart tab loads its library (pinned, integrity-checked, fails in words) and that nothing loads for a session that has no Chart tab.
// The chart itself (KLineChart drawing on a canvas) is NOT run here: there is no browser in the repo's tests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadKline, mountKChart } from './kchartView.js';
import { KLINE } from './kchartCore.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const stubDoc = () => { const added = []; return { added, createElement: () => ({}), head: { appendChild: s => { added.push(s); } } }; };
{
  const doc = stubDoc(), win = {};
  const p = loadKline(doc, win);
  const s = doc.added[0];
  ok(s.src === KLINE.url && s.integrity === KLINE.integrity && s.crossOrigin === 'anonymous', 'the script tag is the pinned URL with its integrity hash and anonymous CORS');
  win.klinecharts = { init() {} }; s.onload();
  ok((await p) === win.klinecharts, 'resolves to the library');
  ok((await loadKline(doc, win)) === win.klinecharts && doc.added.length === 1, 'a second call does not add a second script');
}
{
  const doc = stubDoc(), win = {}; const p = loadKline(doc, win); doc.added[0].onerror();
  await assert.rejects(p, /could not be loaded/); n++;
  const d2 = stubDoc(), w2 = {}; const p2 = loadKline(d2, w2); d2.added[0].onload();
  await assert.rejects(p2, /empty/); n++;
}
{ // a page without the Chart section mounts nothing
  const doc = { getElementById: () => null };
  ok(mountKChart({ doc, win: {} }) === null, 'no #kchart section: nothing mounted');
}
// the page and loader wiring: the section and button exist, the loader imports the view dynamically only
const html = fs.readFileSync(path.join(ROOT, 'desk-terminal.html'), 'utf8'), feel = fs.readFileSync(path.join(ROOT, 'js/terminal/terminalFeel.js'), 'utf8');
ok(/<button role="tab"[^>]*data-t="kchart"[^>]*data-surface="tab\.kchart"/.test(html) && /<section id="kchart" hidden data-surface="tab\.kchart">/.test(html), 'tab button and section are registered surfaces');
ok(/import\('\.\/kchartView\.js'\)/.test(feel) && !/^import .*kchartView/m.test(feel), 'the loader imports the view dynamically, never statically (a desk login with the switch off gets no code)');
ok(!/<script[^>]*klinecharts/.test(html), 'the library is not in the page: it loads on first visit to the tab');
console.log(`kchartView: ${n} checks OK`);
