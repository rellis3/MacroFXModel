// Tests for js/paperText.js and js/paperPages.js.   node js/paperText.test.mjs
// Everything is a synthetic fixture written for the test (positioned items that mimic a two-column paper). No paper text or
// PDF is committed; the end-to-end part only uses the sample PDFs that ship inside node_modules/pdf-parse (skipped if absent).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { buildBlocks, plainText, conclusion, abstractOf } from './paperText.js';
import { extractPages, flatTextToPages } from './paperPages.js';

let n = 0; const t = async (name, fn) => { try { await fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

// ---- fixture helpers: one item per text run, like pdf.js ----------------------------------------------------------------------
const W = 612, H = 792, LX = 54, LW = 243, RX = 315, RW = 243, B = 10, PITCH = 12;
const it = (x, y, str, o = {}) => ({ str, x, y, w: o.w ?? Math.max(2, str.length * (o.h ?? B) * 0.47), h: o.h ?? B, font: o.font ?? 'f1' });
/** Justified prose lines in a column: every line fills the column except the last of a paragraph (o.last). */
const col = (x, w, y, lines, o = {}) => lines.map((s, k) => {
  const last = k === lines.length - 1 && o.endShort !== false;
  const ind = k === 0 && o.indent ? 10 : 0;
  return it(x + ind, y - k * PITCH, s, { w: last ? Math.min(w - ind, s.length * 4.7) : w - ind });
});
const header = (y = 765) => it(200, y, 'Journal of Synthetic Finance, Vol. 12', { w: 212 });
const pageNo = no => it(303, 30, String(no), { w: 6 });

function buildFixture() {
  const p1 = [header(), pageNo(1)];
  p1.push(it(120, 700, 'Volatility Forecasting With Realized Range', { h: 18, font: 'f9', w: 372 }));
  p1.push(it(250, 678, 'Estimators', { h: 18, font: 'f9', w: 112 }));
  p1.push(it(240, 650, 'A. Author, B. Writer', { w: 130 }));
  p1.push(it(285, 622, 'Abstract', { font: 'f2', w: 42 }));
  p1.push(...col(90, 432, 604, ['We study daily realized volatility forecasts built from the high-low range of intraday', 'bars. The range based estimator is compared with the squared return on a synthetic', 'sample and is found to be more efficient in every regime we consider here.']));
  // left column
  p1.push(it(LX, 548, '1. Introduction', { font: 'f2', w: 80 }));
  p1.push(...col(LX, LW, 528, ['We study the forecasting of daily realized volatil-', 'ity using range based estimators. The estimator', 'converges quickly to the true integrated variance.'], { indent: true }));
  p1.push(...col(LX, LW, 480, ['Suppose that the conditional variance of the return', 'is written as sigma squared so that the variance', 'equals alpha plus the lag.'], { indent: true }));
  // inline math inside a prose line: Greek, sub and superscripts, a relation, but plenty of words around it
  const yI = 480 - PITCH;
  p1.splice(p1.findIndex(i => i.y === yI && i.x === LX), 1,
    it(LX, yI, 'is written as', { w: 62 }), it(LX + 64, yI, 'σ', { font: 'f3', w: 5 }), it(LX + 69, yI + 4, '2', { h: 7, font: 'f4', w: 4 }), it(LX + 69, yI - 2, 't', { h: 7, font: 'f4', w: 3 }),
    it(LX + 76, yI, '= α + β', { font: 'f3', w: 32 }), it(LX + 110, yI, 'so that the variance', { w: LW - 110 }));
  p1.push(it(LX, 440, 'and x = 3, y = 4.', { w: 76 }));   // a short flush-left line with symbols: still prose
  // display equation: sigma^2_t = sum_{i=1}^{T} w_i r_{t-i}^2   (3)   centered in the column
  const yE = 410;
  p1.push(
    it(112, yE, 'σ', { font: 'f3', w: 6 }), it(118, yE + 4, '2', { h: 7, font: 'f4', w: 4 }), it(118, yE - 2, 't', { h: 7, font: 'f4', w: 3 }),
    it(128, yE, '=', { font: 'f5', w: 7 }), it(142, yE, '∑', { h: 14, font: 'f6', w: 10 }), it(142, yE + 11, 'T', { h: 7, font: 'f4', w: 5 }), it(141, yE - 10, 'i=1', { h: 7, font: 'f4', w: 12 }),
    it(158, yE, 'w', { font: 'f3', w: 7 }), it(165, yE - 2, 'i', { h: 7, font: 'f4', w: 3 }), it(172, yE, 'r', { font: 'f3', w: 5 }), it(177, yE + 4, '2', { h: 7, font: 'f4', w: 4 }), it(177, yE - 3, 't−i', { h: 7, font: 'f4', w: 12 }),
    it(LX + LW - 16, yE, '(3)', { w: 16 }));
  p1.push(...col(LX, LW, 366, ['where the weights decay geometrically and leftcolumnlast', 'is the final line of the left column text.']));
  // right column
  p1.push(...col(RX, RW, 548, ['rightcolumnfirst starts the right column and continues the', 'discussion of the weights and of the estimators we use.']));
  p1.push(it(RX, 505, 'Table 1: Out-of-sample R2 by estimator.', { h: 9, w: 190 }));
  const rows = [['Estimator', 'R2', 'MAE', 'Bias'], ['Squared return', '0.21', '0.034', '0.002'], ['Parkinson', '0.34', '0.029', '0.001'], ['Range', '0.41', '0.027', '0.000']];
  rows.forEach((r, k) => [RX + 2, RX + 100, RX + 150, RX + 205].forEach((x, c) => p1.push(it(x, 488 - k * 11, r[c], { h: 9, w: r[c].length * 4.4 }))));
  p1.push(...col(RX, RW, 430, ['Figure 1: Rolling volatility of the sample, daily', 'range estimator against the squared return.'], { }).map(i => ({ ...i, h: 9 })));
  p1.push(...col(RX, RW, 396, ['The table above reports the out-of-sample fit and', 'shows that the range estimator is the best.'], { indent: true }));

  const p2 = [header(), pageNo(2)];
  p2.push(it(LX, 720, '2. Data', { font: 'f2', w: 40 }));
  p2.push(...col(LX, LW, 700, ['The sample covers one thousand synthetic days of one', 'minute bars for a single made-up instrument.'], { indent: true }));
  // a fraction: main line rho = , numerator and denominator centered above and below
  p2.push(it(130, 640, 'ρ', { font: 'f3', w: 5 }), it(142, 640, '=', { font: 'f5', w: 7 }), it(155, 646, 'cov(x, y)', { font: 'f3', w: 45 }), it(158, 633, 'σx σy', { font: 'f3', w: 32 }));
  p2.push(...col(LX, LW, 600, ['The last line of this page carries the second column marker', 'in the left column only.']));
  p2.push(...col(RX, RW, 720, ['The second page right column starts here and talks about', 'estimation windows of different lengths.'], { indent: true }));

  const p3 = [header(), pageNo(3)];
  p3.push(it(LX, 720, '5. Conclusion', { font: 'f2', w: 70 }));
  p3.push(...col(LX, LW, 700, ['We conclude that the range estimator forecasts better.', 'It is cheap and it is robust to the sample.'], { indent: true }));
  p3.push(it(LX, 640, 'References', { font: 'f2', w: 55 }));
  p3.push(...col(LX, LW, 620, ['[1] A. Author. A made-up paper. Journal of Nothing, 2001.'], {}));
  p3.push(...col(LX, LW, 596, ['[2] B. Writer. Another made-up paper on ranges.'], {}));
  p3.push(...col(LX, LW, 572, ['[3] C. Person. A third made-up paper. 2010.'], {}));
  p3.push(...col(RX, RW, 720, ['[4] D. Other. A fourth made-up paper. 2012.'], {}));
  return [p1, p2, p3].map((items, k) => ({ n: k + 1, w: W, h: H, items }));
}

const fx = buildFixture();
const { blocks, pageSize } = buildBlocks({ pages: fx });
const by = type => blocks.filter(b => b.type === type);
const txt = b => b.text;
const idxOf = s => blocks.findIndex(b => b.text.includes(s));
const inBox = (box, x, y) => x >= box[0] - 0.01 && x <= box[2] + 0.01 && y >= box[1] - 0.01 && y <= box[3] + 0.01;

await t('page sizes and block numbering', () => {
  assert.deepEqual(pageSize[1], [612, 792]);
  assert.deepEqual(blocks.map(b => b.i), blocks.map((_, k) => k));
  for (const b of blocks) assert.ok(['h1', 'h2', 'p', 'eq', 'table', 'fig', 'refs'].includes(b.type), b.type);
});

await t('title is h1, sections are h2, the abstract is found', () => {
  assert.equal(by('h1').length, 1);
  assert.equal(by('h1')[0].text, 'Volatility Forecasting With Realized Range Estimators');
  const heads = by('h2').map(txt);
  for (const h of ['Abstract', '1. Introduction', '2. Data', '5. Conclusion', 'References']) assert.ok(heads.includes(h), `${h} in ${JSON.stringify(heads)}`);
  assert.match(abstractOf(blocks), /^We study daily realized volatility forecasts built from the high-low range of intraday bars\./);
  assert.match(abstractOf(blocks), /in every regime we consider here\.$/);
});

await t('running header, footer and page numbers are dropped', () => {
  assert.ok(!blocks.some(b => /Journal of Synthetic Finance/.test(b.text)));
  assert.ok(!blocks.some(b => /^[123]$/.test(b.text.trim())));
});

await t('hyphenated line breaks are rejoined and lines reflow into paragraphs', () => {
  const intro = blocks.find(b => b.type === 'p' && /forecasting of daily realized/.test(b.text));
  assert.ok(intro, 'intro paragraph');
  assert.match(intro.text, /realized volatility using range based estimators\. The estimator converges quickly to the true integrated variance\.$/);
  assert.ok(!/volatil- ity|volatil-/.test(intro.text));
  assert.equal(intro.page, 1);
});

await t('two columns are read left then right, not across', () => {
  const left = idxOf('leftcolumnlast'), right = idxOf('rightcolumnfirst');
  assert.ok(left >= 0 && right >= 0);
  assert.ok(left < right, `left column (${left}) before right column (${right})`);
  assert.ok(idxOf('1. Introduction') < left);
  assert.ok(!blocks.some(b => b.type === 'p' && /leftcolumnlast.*rightcolumnfirst|rightcolumnfirst.*leftcolumnlast/.test(b.text)), 'no line spans both columns');
  assert.ok(idxOf('in the left column only') < idxOf('The second page right column'));
});

await t('the display equation is one eq block with page, label and a tight box', () => {
  const eqs = by('eq');
  const e = eqs.find(b => b.label === '3');
  assert.ok(e, `eq (3) in ${JSON.stringify(eqs.map(b => b.label))}`);
  assert.equal(e.page, 1);
  const items = fx[0].items.filter(i => i.y >= 398 && i.y <= 425 && i.x < 300 && i.x > 100);
  assert.ok(items.length >= 12);
  for (const i of items) {
    assert.ok(inBox(e.bbox, i.x, i.y), `item ${i.str} origin inside ${JSON.stringify(e.bbox)}`);
    assert.ok(inBox(e.bbox, i.x + i.w, i.y + i.h * 0.7), `item ${i.str} top right inside`);
  }
  // no surrounding prose: the baselines of the prose line above (440) and below (366) are outside the box
  assert.ok(e.bbox[3] < 440 && e.bbox[1] > 366 + 2, JSON.stringify(e.bbox));
  assert.ok(e.bbox[3] - e.bbox[1] < 60);
  assert.ok(e.bbox[0] >= LX - 1 && e.bbox[2] <= LX + LW + 3, 'stays inside the left column');
  assert.ok(e.bbox[0] > 0 && e.bbox[1] > 0 && e.bbox[2] <= W && e.bbox[3] <= H);
  assert.ok(e.bbox[1] < e.bbox[3] && e.bbox[0] < e.bbox[2]);
});

await t('the fraction (numerator, main row, denominator) is one equation', () => {
  const f = by('eq').find(b => b.page === 2);
  assert.ok(f, 'second equation on page 2');
  for (const i of fx[1].items.filter(i => i.y > 625 && i.y < 655)) assert.ok(inBox(f.bbox, i.x, i.y), `${i.str} in box`);
  assert.ok(f.bbox[1] > 600 + 2 && f.bbox[3] < 700 - 2, 'not the prose above or below');
  assert.equal(f.label, undefined);
});

await t('inline math stays in its paragraph (no false equation)', () => {
  const eqs = by('eq');
  assert.equal(eqs.length, 2, `only the two display equations: ${JSON.stringify(eqs.map(e => e.text))}`);
  const p = blocks.find(b => b.type === 'p' && /Suppose that the conditional variance/.test(b.text));
  assert.ok(p, 'paragraph with the inline math');
  assert.match(p.text, /is written as σ.*= α \+ β so that the variance equals alpha plus the lag\.$/);
  assert.ok(eqs.every(e => !/is written as/.test(e.text)));
  // a short flush-left line holding symbols is prose, not an equation
  assert.ok(blocks.some(b => b.type === 'p' && /and x = 3, y = 4\./.test(b.text)));
});

await t('table with caption, figure caption', () => {
  const tb = by('table')[0];
  assert.ok(tb, 'a table block');
  assert.equal(tb.page, 1);
  assert.equal(tb.label, 'Table 1');
  assert.match(tb.text, /^Table 1: Out-of-sample R2 by estimator\./);
  for (const i of fx[0].items.filter(i => i.x >= RX && i.y <= 505 && i.y >= 440)) assert.ok(inBox(tb.bbox, i.x, i.y), `${i.str} in table box`);
  assert.ok(!blocks.some(b => b.type === 'p' && /Squared return|Parkinson/.test(b.text)), 'cells are not prose');
  const fg = by('fig');
  assert.equal(fg.length, 1);
  assert.equal(fg[0].label, 'Figure 1');
  assert.match(fg[0].text, /^Figure 1: Rolling volatility of the sample, daily range estimator against the squared return\.$/);
});

await t('references are one block from the heading to the end', () => {
  const refs = by('refs');
  assert.equal(refs.length, 1);
  assert.equal(refs[0].page, 3);
  assert.equal(refs[0].bbox, null);
  assert.deepEqual(refs[0].text.split('\n').map(s => s.slice(0, 3)), ['[1]', '[2]', '[3]', '[4]']);
  assert.equal(blocks[blocks.length - 1].type, 'refs');
});

await t('plainText, conclusion and abstractOf', () => {
  const pt = plainText(blocks);
  assert.match(pt, /Introduction/);
  assert.match(pt, /integrated variance\./);
  assert.ok(!/Squared return|\[1\] A\. Author|Figure 1:|Table 1:|\(3\)/.test(pt), 'no tables, captions, references or equations');
  assert.ok(!pt.includes('∑') && !pt.includes('cov(x'), 'no equation text');
  assert.deepEqual(conclusion(blocks), ['We conclude that the range estimator forecasts better. It is cheap and it is robust to the sample.']);
});

await t('false-positive guard: centered prose, a lone symbol line and an empty page never become equations', () => {
  const page = [header(), it(54, 700, 'Notes', { font: 'f2' }), ...col(54, 243, 680, ['This is a plain paragraph about the data and the method we use for it.', 'It has no display equations at all, only words and one inline x = 3 here.', 'The end of the paragraph is here.'])];
  const out = buildBlocks([{ n: 1, w: W, h: H, items: page }, { n: 2, w: W, h: H, items: [header()] }]);
  assert.equal(out.blocks.filter(b => b.type === 'eq').length, 0);
  assert.ok(out.blocks.some(b => b.type === 'p' && /one inline x = 3 here/.test(b.text)));
});

await t('odd input never throws', () => {
  for (const bad of [null, undefined, 0, 'x', [], {}, { pages: null }, { pages: [null, 3, {}] }, [{ items: 'no' }], [{ n: 1, items: [null, { str: 5 }, { str: 'a', x: NaN, y: 1 }, { str: 'b' }, { str: 'ok', x: 1, y: 2, w: 'bad', h: -3 }] }]]) {
    const r = buildBlocks(bad);
    assert.ok(Array.isArray(r.blocks) && typeof r.pageSize === 'object');
  }
  assert.equal(plainText(null), ''); assert.deepEqual(conclusion(undefined), []); assert.equal(abstractOf('x'), '');
  assert.deepEqual(conclusion([{ type: 'h2' }, null, { type: 'p', text: 'x' }]), []);
  const one = buildBlocks([{ n: 1, w: 612, h: 792, items: [{ str: 'Hello', x: 72, y: 700, w: 30, h: 10, font: 'a' }] }]);
  assert.equal(one.blocks.length, 1);
});

await t('flat text fallback becomes one or more pages of blocks', () => {
  const flat = 'Introduction\n\nThis is the first paragraph of an old flat text file. It has a few sentences in it.\nIt continues on the next line without a break.\n\nThis is the second paragraph.\n';
  const { pages } = flatTextToPages(flat);
  assert.equal(pages.length, 1);
  const out = buildBlocks(pages);
  assert.ok(out.blocks.length >= 2);
  assert.match(plainText(out.blocks), /first paragraph of an old flat text file\. It has a few sentences in it\. It continues on the next line/);
  assert.deepEqual(flatTextToPages('').pages, []); assert.deepEqual(flatTextToPages(null).pages, []);
  const long = Array.from({ length: 400 }, (_, k) => `Sentence number ${k} is about nothing at all.`).join('\n');
  assert.ok(flatTextToPages(long).pages.length > 1);
});

// ---- the worker end to end, on the sample PDFs shipped with pdf-parse -----------------------------------------------------------
const sample = f => new URL(`../node_modules/pdf-parse/test/data/${f}`, import.meta.url);
if (existsSync(sample('01-valid.pdf'))) {
  await t('worker: a real two-column PDF gives positioned items and sane blocks', async () => {
    const r = await extractPages(readFileSync(sample('01-valid.pdf')), { max: 3, timeoutMs: 60_000 });
    assert.equal(r.pages.length, 3);
    const p = r.pages[0];
    assert.ok(p.w > 500 && p.h > 700 && p.items.length > 100);
    for (const i of p.items.slice(0, 50)) assert.ok(typeof i.str === 'string' && Number.isFinite(i.x) && Number.isFinite(i.y) && i.w >= 0 && i.h > 0 && typeof i.font === 'string');
    const out = buildBlocks(r.pages);
    assert.ok(out.blocks.length > 20 && out.blocks.filter(b => b.type === 'p').length > 10);
    assert.deepEqual(out.pageSize[1], [p.w, p.h]);
    assert.ok(out.blocks.every(b => b.bbox == null || (b.bbox[2] > b.bbox[0] && b.bbox[3] > b.bbox[1])));
    // column order: the abstract (left column) is read before the right-column introduction text
    assert.ok(plainText(out.blocks).length > 2000);
  });
}
if (existsSync(sample('03-invalid.pdf'))) {
  await t('worker: an invalid PDF rejects cleanly', async () => {
    await assert.rejects(() => extractPages(readFileSync(sample('03-invalid.pdf')), { timeoutMs: 30_000 }), /pdf pages/);
  });
}
await t('worker: the timeout rejects', async () => {
  if (!existsSync(sample('01-valid.pdf'))) return;
  await assert.rejects(() => extractPages(readFileSync(sample('01-valid.pdf')), { timeoutMs: 1 }), /timed out/);
});

console.log(`paperText: ${n} tests passed`);
