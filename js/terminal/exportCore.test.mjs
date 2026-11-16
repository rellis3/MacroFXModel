// node --test js/terminal/exportCore.test.mjs: CSV text, formula guard, table to rows, file names, colour variables in a standalone SVG.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePage } from './feelFakeDom.fixtures.mjs';
import { csvCell, toCsv, tableRows, exportName, slug, resolveCssVars, isChart, biggestTable } from './exportCore.js';

test('cells: quotes doubled, commas wrapped, line breaks flattened, minus signs normalised, numbers left as numbers', () => {
  assert.equal(csvCell('a,b'), '"a,b"'); assert.equal(csvCell('say "hi"'), '"say ""hi"""'); assert.equal(csvCell('x\ny'), 'x y');
  assert.equal(csvCell('−0.45%'), '-0.45%'); assert.equal(csvCell('-1,234.5'), '"-1,234.5"'); assert.equal(csvCell('+0.3%'), '+0.3%'); assert.equal(csvCell(null), '');
});
test('a cell a spreadsheet could run as a formula gets a leading apostrophe; a negative number does not', () => {
  assert.equal(csvCell('=SUM(A1:A9)'), "'=SUM(A1:A9)"); assert.equal(csvCell('@cmd'), "'@cmd"); assert.equal(csvCell('-cmd|x'), "'-cmd|x"); assert.equal(csvCell('+1+1'), "'+1+1");
  assert.equal(csvCell('-0.5'), '-0.5'); assert.equal(csvCell('-12%'), '-12%');
});
test('toCsv: a byte-order mark, a header and CRLF line ends', () => {
  const t = toCsv(['A', 'B'], [['1', 'x,y'], ['2', '']]);
  assert.equal(t, '﻿A,B\r\n1,"x,y"\r\n2,\r\n');
});
function table(html) { const doc = makePage(); const h = doc.createElement('div'); doc.body.appendChild(h); h.innerHTML = html; return h.querySelector('table'); }
test('a table on screen becomes rows: header and cells as drawn, sort arrows and control columns left out, hidden rows skipped', () => {
  const t = table('<table><thead><tr><th><button>Market ▲</button></th><th><button>Last</button></th><th class="mon-ctl"><span>Move</span></th></tr></thead><tbody>'
    + '<tr><th scope="row"><b>EURUSD</b> <span>EUR/USD</span></th><td>1.10216</td><td class="mon-ctl"><button>↑</button></td></tr>'
    + '<tr hidden><td>X</td><td>9</td><td></td></tr><tr><td>NQ</td><td data-noexport>secret</td><td class="mon-ctl"></td></tr></tbody></table>');
  const r = tableRows(t);
  assert.deepEqual(r.head, ['Market', 'Last']); assert.deepEqual(r.body, [['EURUSD EUR/USD', '1.10216'], ['NQ']]);
  assert.deepEqual(tableRows(null), { head: [], body: [] });
});
test('a "nothing here" row is not data; the biggest table wins', () => {
  assert.equal(tableRows(table('<table><tbody><tr><td>Nothing here yet</td></tr></tbody></table>')).body.length, 0);
  const a = table('<table><tbody><tr><td>1</td></tr></tbody></table>'), b = table('<table><tbody><tr><td>1</td></tr><tr><td>2</td></tr></tbody></table>');
  assert.equal(biggestTable([a, b]), b); assert.equal(biggestTable([]), null);
});
test('file names carry the board and the UTC minute; the slug is plain', () => {
  assert.equal(exportName('Monitor', 'csv', Date.parse('2026-11-16T10:30:45Z')), 'desk-monitor-2026-11-16-1030.csv');
  assert.equal(slug('  What is unusual right now? '), 'what-is-unusual-right-now'); assert.equal(slug(''), 'board');
});
test('theme variables are filled in for a standalone SVG image, with the fallback when a variable is missing', () => {
  const vars = { '--tx': '#e8ecf5', '--up': '' };
  assert.equal(resolveCssVars('<path stroke="var(--tx)" fill="var(--up, #0f0)"/><g fill="var(--nope)"/>', n => vars[n]), '<path stroke="#e8ecf5" fill="#0f0"/><g fill="gray"/>');
});
test('chart size: icons are not charts', () => { assert.ok(isChart(300, 160)); assert.ok(!isChart(16, 16)); assert.ok(!isChart(400, 20)); });
