// js/terminal/insightLayout.test.mjs: static layout guards for the Insight boards (found 2026-11-16 from the owner's screenshots).
//  1. The pill row was clipped to an 8px strip because its container reused the class .in-bar, which is the 8px percentile bar.
//  2. The gold ETF card ran past its border because its tables were nowrap and not inside a scroll box.
// These checks read source text (no browser). scripts/insight-overflow.mjs is the real measurement (headless Chromium, live data).
// node --test js/terminal/insightLayout.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rd = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const VIEWS = ['insightView.js', 'unusualView.js', 'matrixView.js', 'fxMatrixView.js', 'goldView.js', 'levelEngineView.js', 'flagsView.js', 'economiesView.js'];
const css = rd('./insight.css');

test('.in-bar is only the percentile bar (an inline span), never a container', () => {
  for (const f of VIEWS) {
    const src = rd('./' + f);
    for (const m of src.matchAll(/<(\w+)[^>]*class="in-bar[\s"][^>]*>/g)) assert.equal(m[1], 'span', `${f}: class in-bar on <${m[1]}>: use in-tools for a toolbar row`);
  }
  assert.match(css, /\.in-tools\s*\{[^}]*display:\s*flex/, 'the toolbar class exists');
  const bar = /\.in-bar\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.match(bar, /height:\s*8px/, 'in-bar is the 8px bar: do not reuse it');
});

test('every Insight table is inside a scroll box (in-tblw or in-scrollx)', () => {
  for (const f of VIEWS) {
    const src = rd('./' + f);
    for (const m of src.matchAll(/<table\b/g)) {
      const before = src.slice(Math.max(0, m.index - 40), m.index);
      assert.ok(/class="in-(tblw|scrollx)">\s*$/.test(before), `${f}: a <table> at ${m.index} is not directly inside in-tblw / in-scrollx`);
    }
  }
  assert.match(css, /\.in-tblw\s*\{[^}]*overflow-x:\s*auto/); assert.match(css, /\.in-scrollx\s*\{[^}]*overflow-x:\s*auto/);
});

test('nowrap and wide minimums are only on table parts and the correlation grid, never on a card or text block', () => {
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}@]+)\{([^}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] }));
  const tableSel = /^(\.in-tbl|\.in-corr|\.in-grp|\.in-mini|\.in-cc|\.in-pmx)/;
  for (const r of rules) {
    if (/white-space:\s*nowrap/.test(r.body)) for (const s of r.sel.split(',').map(x => x.trim())) assert.ok(tableSel.test(s) || /^\.in-(tab|pill|chip|pc|rk|val|gr|mv)\b/.test(s) || /^\.bis-(axis|c)\b/.test(s), `nowrap on ${s}`);   // .bis-axis: the BIS strip's absolutely placed axis tick labels (a few characters each); .bis-c: a cell of its table (inside a scroll box)
    const mw = /min-width:\s*(\d+)px/.exec(r.body);
    if (mw && +mw[1] > 160) for (const s of r.sel.split(',').map(x => x.trim())) assert.ok(/^\.in-corr/.test(s), `min-width ${mw[1]}px on ${s} (only the correlation grid, which scrolls inside in-tblw, may be that wide)`);
  }
});

test('boards cannot widen the page: the panel and its children may shrink, long text wraps', () => {
  assert.match(css, /\.in-panel\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/);
  assert.match(css, /\.in-panel\s*>\s*\*\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /\.in-gcard[^{]*\{[^}]*overflow-wrap:\s*anywhere/);
  assert.match(css, /\.in-gcard\s*\{[^}]*min-width:\s*0/);
});

test('the world stress strip chips may wrap (a 390px phone was 5px too wide on every tab)', () => {
  const tabs = rd('./terminal-tabs.css');
  assert.match(tabs, /#wstrip \.chip\s*\{[^}]*white-space:\s*normal/);
});
