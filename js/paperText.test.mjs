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
  assert.ok(e.bbox[0] >= LX - 4 && e.bbox[2] <= LX + LW + 5, 'stays inside the left column');
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

// ---- multi-line equation systems (synthetic positions; geometry modelled on a numbered three-line SDE system) -------------------
const sysPage = (numRow, extra = []) => {
  const x0 = 72, w = 468;
  const prose = (y, a) => col(x0, w, y, a.map(s => s), { endShort: false });
  const above = prose(690, ['The model is defined as the following system of stochastic differential equations driven by two', 'correlated Brownian motions with a mean reverting variance process and a constant volatility.']);
  const eqRow = (y, parts, no) => [...parts.map(([dx, s]) => it(190 + dx, y, s, { w: Math.max(4, s.length * 4.6) })), ...(no ? [it(512, y, no, { w: 22 })] : [])];
  const rows = [
    eqRow(640, [[0, 'dX(t)  ='], [60, 'ν(t)dW(t) −'], [140, 'dt']], numRow === 0 ? '(2.1)' : null),
    eqRow(618, [[0, 'dν(t)  ='], [60, 'κ(t)(θ(t) − ν(t))dt + ξ(t)ν(t)dW(t)']], numRow === 1 ? '(2.1)' : null),
    eqRow(601, [[-20, 'd⟨W1,W2⟩  ='], [60, 'ρ(t)dt']], numRow === 2 ? '(2.1)' : null),
  ].flat();
  const below = prose(560, ['where the parameters are positive and the correlation lies between minus one and one in value so that', 'the covariance matrix stays positive definite for every time in the horizon of the model here.']);
  return [header(), ...above, ...rows, ...extra, ...below];
};
const eqOf = items => buildBlocks([{ n: 1, w: W, h: H, items }]).blocks.filter(b => b.type === 'eq');
for (const numRow of [0, 2]) {
  await t(`a three-line system numbered on line ${numRow + 1} is ONE equation block, padded, not touching prose`, () => {
    const eqs = eqOf(sysPage(numRow));
    assert.equal(eqs.length, 1, JSON.stringify(eqs.map(e => [e.bbox, e.text])));
    const [x0, y0, x1, y1] = eqs[0].bbox;
    assert.equal(eqs[0].label, '2.1');
    assert.ok(y1 >= 640 + 0.8 * B + 2.9 && y0 <= 601 - 0.25 * B - 2.9, `covers all three lines with ~3.5pt padding: ${eqs[0].bbox}`);
    assert.ok(x0 <= 170 - 3 && x1 >= 534 + 3, `padded on the sides: ${eqs[0].bbox}`);
    assert.ok(y1 < 690 - 0.25 * B && y0 > 560 + 0.8 * B, 'stays between the surrounding paragraphs');
  });
}
await t('two separately numbered one-line equations stay two blocks and never overlap', () => {
  const x0 = 72, w = 468;
  const row = (y, s, no) => [it(230, y, s, { w: 140 }), it(512, y, no, { w: 22 })];
  const items = [header(), ...col(x0, w, 690, ['The first relation is given below and the second relation follows right after it for the same', 'set of parameters in the model of the paper.'], { endShort: false }),
    ...row(640, 'σ = α + βσ', '(1)'), ...row(622, 'μ = γ + δμ', '(2)'),
    ...col(x0, w, 580, ['Both hold for every period in the sample and the estimates use the whole sample of the study here.', 'End.'])];
  const eqs = eqOf(items);
  assert.deepEqual(eqs.map(e => e.label), ['1', '2']);
  assert.ok(eqs[0].bbox[1] >= eqs[1].bbox[3], `boxes do not overlap: ${JSON.stringify(eqs.map(e => e.bbox))}`);
});
await t('tall neighbouring equations: overlapping boxes share one edge instead of cropping the same lines twice', () => {
  const items = [header(), ...col(72, 468, 690, ['Intro prose line that fills the whole width of the column here for the body statistics ok.', 'Second line of it.'], { endShort: false }),
    it(230, 640, 'σ = α + β', { w: 140 }), it(512, 640, '(1)', { w: 22 }), it(240, 654, 'αβ', { h: 9, w: 10 }),
    it(230, 626, 'μ = γ + δ', { w: 140 }), it(512, 626, '(2)', { w: 22 }), it(240, 634, 'γδ', { h: 9, w: 10 })];
  const eqs = eqOf(items);
  for (let a = 0; a < eqs.length; a++) for (let b = a + 1; b < eqs.length; b++) {
    const [p, q] = eqs[a].bbox[3] >= eqs[b].bbox[3] ? [eqs[a], eqs[b]] : [eqs[b], eqs[a]];
    assert.ok(p.bbox[1] >= q.bbox[3] - 0.01, 'no vertical overlap');
  }
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

await t('an arXiv margin stamp line on page 1 is not a block', () => {
  const page = [it(54, 770, 'arXiv:1107.1834v1 [q-fin.CP] 10 Jul 2011', { w: 190 }), it(54, 700, 'Introduction', { font: 'f2' }), ...col(54, 243, 680, ['This is a plain paragraph about the data and the method we use for it.', 'It has no stamps at all and it is long enough to be a body paragraph here.', 'The end.'])];
  const out = buildBlocks([{ n: 1, w: W, h: H, items: page }]);
  assert.ok(!out.blocks.some(b => /arXiv|1107/.test(b.text)), JSON.stringify(out.blocks.map(b => b.text)));
  assert.ok(out.blocks.some(b => /plain paragraph/.test(b.text)));
});

await t('eq blocks keep their positioned items and the drawn rules next to them (for js/mathLatex.js); prose blocks do not', () => {
  const items = sysPage(2), pages = [{ n: 1, w: W, h: H, items, rules: [[300, 340, 620, 0.5], [10, 20, 100, 0.5], [300, 340, 400, 0.5]] }];
  const { blocks } = buildBlocks(pages), eq = blocks.find(b => b.type === 'eq');
  assert.ok(eq.src && Array.isArray(eq.src.it) && eq.src.it.length >= 6 && Array.isArray(eq.src.fonts));
  assert.ok(eq.src.it.every(r => typeof r[0] === 'string' && r.slice(1, 5).every(Number.isFinite) && Number.isInteger(r[5]) && r[5] < eq.src.fonts.length));
  assert.deepEqual(eq.src.rules, [[300, 340, 620, 0.5]], 'only the rule that touches this equation');
  assert.ok(blocks.filter(b => b.type !== 'eq').every(b => !('src' in b)));
  assert.ok(!('src' in buildBlocks([{ n: 1, w: W, h: H, items: [header()] }]).blocks[0] ?? {}));
});


// ---- figures with their graphic, tables of numbers, footnote markers ------------------------------------------------------------
const SX = 72, SW = 468;   // a single-column page
const para1 = (y, k, last = true) => col(SX, SW, y, Array.from({ length: k }, (_, j) => `Synthetic prose line ${j} about forecasting with plain words so the line is long enough to count`), { endShort: last });
const page = (n, items, gfx) => ({ n, w: W, h: H, items: [header(), pageNo(n), ...items], ...(gfx ? { gfx } : {}) });
const figs = r => r.blocks.filter(b => b.type === 'fig');
const hasText = (r, s) => r.blocks.some(b => (b.type === 'p' || b.type === 'h2') && b.text.includes(s));

await t('figure: the graphic above its caption is part of the block, the paragraph above is not', () => {
  const items = [...para1(720, 5), it(SX, 405, 'Figure 3: Synthetic cumulative results by horizon.', { w: 300 }), ...para1(380, 4)];
  const r = buildBlocks([page(1, items, [[100, 440, 500, 650, 'i', 1]])]);
  const [f] = figs(r); assert.ok(f && f.gfx === true, 'a graphic was found');
  assert.equal(f.label, 'Figure 3'); assert.match(f.text, /^Figure 3: Synthetic cumulative/);
  assert.ok(f.bbox[3] >= 650 && f.bbox[3] <= 656 && f.bbox[1] <= 405 && f.bbox[1] >= 395, JSON.stringify(f.bbox));
  assert.ok(f.bbox[0] <= 100 && f.bbox[2] >= 500);
  const above = r.blocks.find(b => b.type === 'p' && b.text.includes('line 0'));
  assert.ok(above.bbox[1] > f.bbox[3] - 8, 'the box stops below the prose above');
});

await t('figure: caption above the graphic (the document sets captions on top)', () => {
  const items = [...para1(720, 3), it(SX, 640, 'Figure 1: Synthetic caption set above its chart.', { w: 300 }), ...para1(380, 4), it(SX, 250, 'Figure 2: A second one, also on top.', { w: 220 })];
  const r = buildBlocks([page(1, items, [[100, 430, 500, 625, 'v', 80], [100, 80, 500, 235, 'i', 1]])]);
  const f = figs(r); assert.equal(f.length, 2);
  assert.ok(f[0].gfx && f[0].bbox[1] <= 430 && f[0].bbox[3] >= 640, JSON.stringify(f[0].bbox));
  assert.ok(f[1].gfx && f[1].bbox[1] <= 80 && f[1].bbox[3] >= 250, JSON.stringify(f[1].bbox));
});

await t('figure: panels stacked above one caption are all included; body text between stops the search', () => {
  const items = [...para1(720, 3), it(SX, 300, 'Figure 4: Two panels.', { w: 120 }), it(SX, 200, 'Figure 5: Not attached, text in between.', { w: 220 }), ...col(SX, SW, 560, ['This paragraph sits between the panels and the next caption so nothing can reach across it.', 'It has a second long line that also belongs to the body text of the paper, nothing else.'])];
  const r = buildBlocks([page(1, items, [[100, 330, 500, 480, 'v', 30], [100, 500, 500, 540, 'v', 12], [100, 20, 500, 150, 'v', 9]])]);
  const [a, b] = figs(r);
  assert.ok(a.gfx && a.bbox[3] >= 540, 'both panels above the caption: ' + JSON.stringify(a.bbox));
  assert.ok(a.bbox[3] < 560, 'not the paragraph');
  assert.ok(b.gfx && b.bbox[1] <= 20, 'the graphic below it belongs to the second caption: ' + JSON.stringify(b.bbox));
});

await t('figure: no graphic found falls back to the caption alone (as before)', () => {
  const items = [...para1(720, 3), it(SX, 405, 'Figure 2: A text-only exhibit.', { w: 200 }), ...para1(380, 3)];
  const r = buildBlocks([page(1, items)]); const [f] = figs(r);
  assert.ok(f && !f.gfx && f.bbox[3] - f.bbox[1] < 25);
});

await t('figure: a graphic far from the caption is not attached; labels inside the graphic do not leak into the text', () => {
  const items = [...para1(720, 3), it(SX, 100, 'Figure 6: Far away.', { w: 120 }), ...[600, 560, 520].map(y => it(60, y, '0.5', { w: 14 })), it(250, 440, 'Time (years)', { w: 60 }), it(SX, 420, 'Legend entry one', { w: 80 })];
  const far = buildBlocks([page(1, items, [[100, 450, 500, 650, 'v', 30]])]);
  assert.ok(!figs(far)[0].gfx, 'about 250 units away: not this figure');
  const near = buildBlocks([page(1, items.map(i => (i.str.startsWith('Figure 6') ? { ...i, y: 410 } : i)), [[100, 450, 500, 650, 'v', 30]])]);
  assert.ok(figs(near)[0].gfx);
  assert.ok(!hasText(near, 'Time (years)') && !hasText(near, 'Legend entry'), 'axis title and legend are part of the picture');
});

await t('figure on a two-column page: only the caption column (or the full width for a full-width caption)', () => {
  const left = (y, k) => col(LX, LW, y, Array.from({ length: k }, (_, j) => `Left column synthetic words number ${j} fill the line`));
  const right = (y, k) => col(RX, RW, y, Array.from({ length: k }, (_, j) => `Right column synthetic words number ${j} fill the line`));
  const items = [...left(720, 12), ...right(720, 12), it(LX, 400, 'Figure 7: Left column figure.', { w: 150 }), ...left(360, 6), ...right(560, 5), ...right(380, 8)];
  const r = buildBlocks([page(1, items, [[LX, 430, LX + LW, 580, 'i', 1]])]);
  const f = figs(r)[0]; assert.ok(f && f.gfx, 'found');
  assert.ok(f.bbox[2] <= RX - 4, 'stays in the left column: ' + JSON.stringify(f.bbox));
  const wide = buildBlocks([page(1, [...left(720, 12), ...right(720, 12), it(LX, 400, 'Figure 8: Spanning both columns with a long caption that runs across the page width, set in one wide line.', { w: 480 }), ...left(360, 6), ...right(360, 6)], [[LX, 430, RX + RW, 640, 'v', 40]])]);
  const g = figs(wide)[0]; assert.ok(g.gfx && g.bbox[0] <= LX && g.bbox[2] >= RX + RW - 1, JSON.stringify(g.bbox));
  const other = buildBlocks([page(1, [...left(720, 12), ...right(720, 12), it(LX, 400, 'Figure 9: Left caption, graphic in the right column.', { w: 150 }), ...left(360, 6), ...right(360, 6)], [[RX, 430, RX + RW, 580, 'i', 1]])]);
  assert.ok(!figs(other)[0].gfx, 'a graphic in the other column is not this figure');
});

await t('tables: merged cells in one item (tab-spaced runs, glued label, back-to-back negatives) become one table block with a crop box; no number soup in the text', () => {
  const rowsX = 140;
  const lines = [['Performance (p. a.)', '4.81%    5.19%    5.51%    8.35%'], ['Volatility (p. a.)', '11.32%   10.93%   11.72%   14.08%'], ['Sharpe Ratio', '0.42   0.48   0.47   0.59'], ['Max DrawDown', '-34.22%-37.57%-45.08%-28.35%']];
  const items = [...para1(720, 3), it(SX, 560, 'Table 5', { w: 36, h: 9 }), ...[0, 1, 2, 3].map(k => it(rowsX + k * 40, 540, ['1M', '3M', '6M', '12M'][k], { w: 14, h: 9 }))];
  lines.forEach(([lab, nums], k) => { const y = 524 - k * 11; items.push(it(SX, y, lab, { w: lab.length * 4.3, h: 9 }), it(rowsX, y, nums, { w: nums.length * 4.2, h: 9 })); });
  items.push(...para1(440, 3));
  const r = buildBlocks([page(1, items)]);
  const tb = r.blocks.filter(b => b.type === 'table'); assert.equal(tb.length, 1, JSON.stringify(r.blocks.map(b => b.type + ':' + b.text.slice(0, 20))));
  assert.equal(tb[0].label, 'Table 5');
  assert.ok(tb[0].bbox[1] <= 488 && tb[0].bbox[3] >= 560, JSON.stringify(tb[0].bbox));
  assert.ok(!r.blocks.some(b => b.type === 'p' && /4\.81|11\.32|-34\.22/.test(b.text)), 'no numbers left in the paragraphs');
  assert.ok(!/4\.81/.test(plainText(r.blocks)));
});

await t('tables: a caption with short rows of numbers but no strict table is found by the aligned-column scan', () => {
  const items = [...para1(720, 3), it(SX, 600, 'Table 2: Selected statistics.', { w: 150, h: 9 }), it(SX, 586, 'Item', { w: 20, h: 9 }), it(300, 586, 'Mean', { w: 20, h: 9 }), it(380, 586, 'Std', { w: 16, h: 9 }),
    it(SX, 574, 'Alpha', { w: 24, h: 9 }), it(300, 574, '0.125', { w: 22, h: 9 }), it(380, 574, '0.031', { w: 22, h: 9 }),
    it(SX, 562, 'Beta', { w: 20, h: 9 }), it(300, 562, '1.040', { w: 22, h: 9 }), it(380, 562, '0.220', { w: 22, h: 9 }), ...para1(520, 3)];
  const r = buildBlocks([page(1, items)]);
  const tb = r.blocks.filter(b => b.type === 'table'); assert.equal(tb.length, 1); assert.equal(tb[0].label, 'Table 2');
  assert.ok(tb[0].bbox[1] <= 562 && tb[0].bbox[3] >= 600, JSON.stringify(tb[0].bbox));
});

await t('footnote markers: a raised small number after a word is cut from the paragraph when a footnote with that number exists; the footnote is a small foot block', () => {
  const items = col(SX, SW, 700, ['The forecast beats the benchmark every week and the gain persists in the sample', 'after costs, which we show for the next week;', 'and nothing else in 2020 or in x2 changes.']);
  const line2 = items.find(i => i.str.startsWith('after costs')), line3 = items.find(i => i.str.startsWith('and nothing'));
  items.push(it(line2.x + line2.w + 0.5, line2.y + 4, '12', { h: 6.5, w: 7 }));                 // the marker, glued to "week;"
  items.push(it(line3.x + 140, line3.y + 4, '2', { h: 6.5, w: 3 }));                              // an exponent: no footnote 2 exists
  items.push(it(SX, 70, '12', { h: 6.5, w: 7 }), it(SX + 9, 70, 'A synthetic footnote that explains the claim made above in plain words.', { h: 7, w: 330 }));
  const r = buildBlocks([page(1, items)]);
  const body = r.blocks.find(b => b.type === 'p' && b.text.includes('every week'));
  assert.ok(body, 'body paragraph');
  assert.ok(/next week;/.test(body.text) && !/week;\s*12/.test(body.text), body.text);
  assert.ok(/in 2020 or in x/.test(body.text), 'years and exponents stay: ' + body.text);
  const foot = r.blocks.find(b => b.foot); assert.ok(foot && /^12 A synthetic footnote/.test(foot.text), JSON.stringify(r.blocks.map(b => [b.type, b.text.slice(0, 30), b.foot])));
});

await t('footnote markers: with no matching footnote body nothing is removed', () => {
  const items = col(SX, SW, 700, ['The forecast beats the benchmark every week and the gain persists in the sample', 'after costs, which we show for the next week;']);
  const line2 = items.find(i => i.str.startsWith('after costs'));
  items.push(it(line2.x + line2.w + 0.5, line2.y + 4, '12', { h: 6.5, w: 7 }));
  const r = buildBlocks([page(1, items)]);
  assert.ok(/week;\s?12/.test(r.blocks.find(b => b.type === 'p' && b.text.includes('every week')).text));
});

await t('a table\'s wide cell gap on a short column is not mistaken for the gutter', () => {
  const left = (y, k) => col(LX, LW, y, Array.from({ length: k }, (_, j) => `Left column synthetic words number ${j} fill the line`));
  const right = (y, k) => col(RX, RW, y, Array.from({ length: k }, (_, j) => `Right column synthetic words number ${j} fill the line`));
  const rows = [['Metric', '12M', 'cash'], ['Return', '8.35%', '11.38%'], ['Vol', '14.08%', '13.98%'], ['Sharpe', '0.59', '0.81']];
  const items = [...left(700, 3), it(LX, 620, 'Table 9', { w: 30, h: 9 })];
  rows.forEach((r, k) => [LX, LX + 120, LX + 200].forEach((x, c) => items.push(it(x, 606 - k * 11, r[c], { h: 9, w: r[c].length * 4.4 }))));
  items.push(...left(540, 14), ...right(720, 30));
  const rr = buildBlocks([page(1, items)]);
  const tb = rr.blocks.filter(b => b.type === 'table'); assert.equal(tb.length, 1);
  assert.ok(tb[0].bbox[2] >= LX + 200 + 20, 'the last column is inside the box: ' + JSON.stringify(tb[0].bbox));
});


await t('figure: a caption of several lines (with a range like 1–52 and a far picture below it) is one caption; the picture is found', () => {
  const items = [...para1(720, 2), it(SX, 660, 'Figure 1: Cumulative returns in the subsequent', { w: 440 }), it(SX + 60, 648, '1–52 Weeks, Sorted by the signal', { w: 200 }), it(SX, 636, 'and then the third caption line ends here.', { w: 200 }), ...para1(300, 3)];
  const r = buildBlocks([page(1, items, [[72, 350, 520, 560, 'i', 1]])]);
  const [f] = figs(r); assert.ok(f && f.gfx, 'found');
  assert.match(f.text, /1–52 Weeks/); assert.match(f.text, /third caption line/);
  assert.ok(f.bbox[3] >= 660 && f.bbox[1] <= 350, JSON.stringify(f.bbox));
});

// ---- cells and in-figure text kept on the blocks for the figure notes (js/libraryFigs.js), out of paragraphs / search / listening ----
await t('table block keeps its cell rows (cells), capped; the caption stays the text and paragraphs do not hold the numbers', () => {
  const tb = by('table')[0];
  assert.ok(Array.isArray(tb.cells) && tb.cells.length >= 4, JSON.stringify(tb.cells));
  assert.ok(tb.cells.includes('Estimator|R2|MAE|Bias'), JSON.stringify(tb.cells));
  assert.ok(tb.cells.includes('Parkinson|0.34|0.029|0.001'), JSON.stringify(tb.cells));
  assert.ok(tb.cells.length <= 40 && tb.cells.every(r => r.split('|').length <= 12));
  assert.match(tb.text, /^Table 1: Out-of-sample R2/, 'the block text is still the caption');
  assert.ok(!plainText(blocks).includes('0.034'), 'cells are not search text');
  assert.ok(!speechSentencesNoNumbers(blocks), 'no number soup in listening');
});
function speechSentencesNoNumbers(bl) { return bl.some(b => b.type === 'p' && /Parkinson|0\.029/.test(b.text)); }

await t('table cells are capped at 40 rows and 12 columns', () => {
  const rows = []; const xs = Array.from({ length: 14 }, (_, c) => SX + 10 + c * 32);
  for (let k = 0; k < 50; k++) xs.forEach((x, c) => rows.push(it(x, 700 - k * 11, c === 0 ? `Row${k}` : String(k + c) + '.5', { h: 9, w: 14 })));
  const r = buildBlocks([page(1, [it(SX, 730, 'Table 2: A very wide synthetic table.', { h: 9, w: 200 }), ...rows, ...para1(100, 3)])]);
  const tb = r.blocks.find(b => b.type === 'table'); assert.ok(tb, 'table found');
  assert.equal(tb.cells?.length, 40, String(tb.cells?.length));
  assert.ok(tb.cells.every(row => row.split('|').length === 12), tb.cells[0]);
});

await t('figure block keeps the text inside its graphic (axis titles, legend, ticks collapsed), capped at 300, and it stays out of paragraphs', () => {
  const lab = (x, y, str, w) => it(x, y, str, { h: 8, w: w ?? str.length * 3.6 });
  const items = [...para1(720, 5), it(SX, 405, 'Figure 3: Synthetic cumulative results by horizon.', { w: 300 }),
    lab(200, 430, 'Cumulative return', 70), lab(120, 445, '0', 4), lab(120, 520, '50', 8), lab(120, 600, '100', 10), lab(260, 640, 'Carry', 22), lab(330, 640, 'Benchmark', 36), lab(300, 410, 'Year', 16), ...para1(380, 4)];
  const r = buildBlocks([page(1, items, [[100, 440, 500, 650, 'i', 1]])]);
  const [f] = figs(r); assert.ok(f && f.gfx, 'graphic found');
  assert.equal(typeof f.inText, 'string'); assert.ok(f.inText.length <= 300);
  for (const w of ['Cumulative return', 'Carry', 'Benchmark']) assert.ok(f.inText.includes(w), `${w} in ${f.inText}`);
  assert.match(f.inText, /ticks 0 to 100/);
  assert.ok(!r.blocks.some(b => b.type === 'p' && /Benchmark|Cumulative return/.test(b.text)), 'axis text is not a paragraph');
  assert.ok(!plainText(r.blocks).includes('Benchmark'));
});

await t('a figure with no graphic region has no inText; a table without cells has none', () => {
  const r = buildBlocks([page(1, [...para1(720, 3), it(SX, 405, 'Figure 4: Caption only.', { w: 200 }), ...para1(380, 4)])]);
  const [f] = figs(r); assert.ok(f && !('inText' in f));
});

console.log(`paperText: ${n} tests passed`);
