import test from 'node:test';
import assert from 'node:assert/strict';
import { stripStamps, isStampLine, cleanBlocks } from './paperStamps.js';
import { speechSentences, briefingScript, estimateSecs, chunkForTts, normalizeForSpeech, splitSentences, MAX_SENTENCE } from './paperAudio.js';

// Synthetic fixtures only: nothing here is paper text.
const P = (text, page = 1) => ({ i: 0, type: 'p', text, page, bbox: null });
const norm = normalizeForSpeech;
const txt = (r) => r.map((x) => x.text);

test('Greek letters and math symbols are spelled out', () => {
  assert.match(norm('Volatility σ ≈ 1.5% per day'), /sigma about 1 point 5 percent/);
  assert.match(norm('β ≥ 0 and γ ≤ 2'), /beta greater than or equal to 0 and gamma less than or equal to 2/);
  assert.match(norm('a × b ± c'), /a times b plus or minus c/);
  assert.doesNotMatch(norm('σ ≈ 1 % ρ'), /[σ≈%ρ]/);
});

test('abbreviations, figure and equation references, p-values and R squared', () => {
  assert.match(norm('Stocks, e.g. tech, and bonds, i.e. rates.'), /for example, tech.*that is, rates/);
  assert.match(norm('Smith et al. found it, vs. Jones.'), /and others found it, versus Jones/);
  assert.match(norm('See Fig. 3 and Eq. (3).'), /Figure 3 and Equation 3/);
  assert.match(norm('We reject at p < 0.05.'), /p less than 0 point 0 5/);
  assert.match(norm('The R² is 0.31 and σ² is small'), /R squared is 0 point 3 1 and sigma squared is small/);
});

test('numbers: thousands separators, decimals, years, ranges, money, basis points', () => {
  assert.match(norm('We use 1,234,567 observations'), /1234567 observations/);
  assert.match(norm('in 2019 and 2008–2012'), /twenty nineteen and two thousand eight to twenty twelve/);
  assert.match(norm('the 1990s'), /nineteen nineties/);
  assert.match(norm('a shock of −0.5'), /minus 0 point 5/);
  assert.match(norm('costs of 5 bps and $3.5 million'), /5 basis points and 3 point 5 million dollars/);
  assert.match(norm('in 1999'), /nineteen ninety nine/);
  assert.match(norm('in 1905'), /nineteen oh five/);
});

test('acronyms: letters where they are said that way, words where they are not', () => {
  const t = norm('The VIX, the FOMC and GARCH models; the GDP print.');
  assert.match(t, /vicks/);
  assert.match(t, /F O M C/);
  assert.match(t, /garch/);
  assert.match(t, /G D P/);
});

test('URLs, DOIs, numeric and author-year citations are dropped or shortened', () => {
  const t = norm('Shown by Smith (2019) and others (Jones and Lee, 2020; Kim et al., 2018) [12, 14] at https://ssrn.com/abstract=123 doi:10.1016/j.jfe.2019.01.001.');
  assert.doesNotMatch(t, /https|ssrn|doi|10\.1016|\[|\]|2020|2018/);
  assert.match(t, /Smith and others/);
});

test('footnote markers vanish, squared stays', () => {
  const t = norm('Returns¹ rose⁴ and x² is large†');
  assert.doesNotMatch(t, /[¹⁴†]/);
  assert.match(t, /x squared/);
});

test('sentence splitting is safe around abbreviations and initials', () => {
  assert.deepEqual(splitSentences('Dr. J. Smith of the U.S. Fed spoke. Markets moved.'), ['Dr. J. Smith of the U.S. Fed spoke.', 'Markets moved.']);
  const s = txt(speechSentences([P('We study 3.5 percent moves, e.g. in 2019. Results hold.')]));
  assert.equal(s.length, 2);
  assert.match(s[0], /3 point 5/);
});

test('a paper with equations, tables, figures and references: skipped, announced once each, no symbols', () => {
  const blocks = [
    { i: 0, type: 'h1', text: '1. Introduction', page: 1 },
    P('Volatility clusters in time.'),
    { i: 2, type: 'eq', text: 'σ_t² = ω + α ε_{t-1}² + β σ_{t-1}²  (3)', page: 2 },
    P('The model above is a GARCH model.', 2),
    { i: 4, type: 'table', text: 'Table 1 0.12 0.34 0.56', page: 3 },
    { i: 5, type: 'fig', text: 'Figure 2: the thing', page: 3 },
    { i: 6, type: 'eq', text: 'x = y', page: 3 },
    { i: 7, type: 'h1', text: 'References', page: 9 },
    P('Smith, J. (2019). A synthetic title. Journal of Tests, 3, 1-20.', 9),
    { i: 9, type: 'refs', text: 'Jones (2020)', page: 9 },
  ];
  const s = txt(speechSentences(blocks));
  assert.equal(s.filter((x) => x === 'An equation appears here.').length, 2);
  assert.equal(s.filter((x) => x === 'A table appears here.').length, 1);
  assert.equal(s[0], 'Introduction.');
  const joined = s.join(' ');
  assert.doesNotMatch(joined, /ω|ε|0\.12|Journal of Tests|Jones|Figure 2|A synthetic title/);
});

test('running headers, page numbers and boilerplate are dropped', () => {
  const blocks = [];
  for (let pg = 1; pg <= 4; pg++) {
    blocks.push(P('Synthetic Journal of Tests  ' + pg, pg), P(String(pg), pg), P('Body text for page ' + pg + ' is here.', pg));
  }
  blocks.push(P('Electronic copy available at: synthetic', 4));
  const s = txt(speechSentences(blocks));
  assert.equal(s.length, 4);
  assert.ok(s.every((x) => /^Body text for page/.test(x)));
});

test('sentence length limit is respected, never mid-number', () => {
  const long = 'The estimate of 12,345.67 basis moves ' + 'with a long chain of clauses, '.repeat(30) + 'ends here.';
  const s = txt(speechSentences([P(long), P('x'.repeat(900)), P('word '.repeat(300))]));
  assert.equal(MAX_SENTENCE, 110);
  assert.ok(s.length > 10);
  assert.ok(s.every((x) => x.length <= 110), 'all sentences fit the 110 cap');
  assert.ok(s.join(' ').includes('12345 point 6 7'), 'number intact');
});

test('each sentence carries the index of its source block; maxChars option overrides the cap', () => {
  const blocks = [{ i: 5, type: 'h1', text: 'Intro' }, { i: 6, type: 'p', text: 'One. Two.' }, { i: 7, type: 'eq', text: 'x' }, { type: 'p', text: 'Three.' }];
  assert.deepEqual(speechSentences(blocks), [
    { text: 'Intro.', block: 5 }, { text: 'One.', block: 6 }, { text: 'Two.', block: 6 },
    { text: 'An equation appears here.', block: 7 }, { text: 'Three.', block: 3 }]);
  const wide = speechSentences([P('word '.repeat(80) + 'end.')], { maxChars: 220 });
  assert.ok(wide.every((x) => x.text.length <= 220) && wide.length < 4);
});

test('numbers and abbreviations are never split by the 110 cap', () => {
  const body = 'The effect was measured over a long window of daily data and came to 1,234.56 basis points, i.e. about Dr. J. Smith estimated it, in 2019. ';
  const s = txt(speechSentences([P(body.repeat(3))]));
  assert.ok(s.every((x) => x.length <= 110));
  assert.ok(s.some((x) => x.includes('1234 point 5 6')), 'number intact in one utterance');
  assert.ok(s.some((x) => x.includes('Dr. J. Smith')), 'abbreviation intact');
});

test('empty and odd input return less, never throw', () => {
  for (const bad of [undefined, null, 0, 'x', [], [null, 5, {}], [{ type: 'p' }], [{ type: 'p', text: 42 }], { a: 1 }]) {
    assert.ok(Array.isArray(speechSentences(bad)));
  }
  assert.equal(norm(null), '');
  assert.equal(norm(12), '12');
  assert.deepEqual(speechSentences([]), []);
  const b = briefingScript(null, null);
  assert.deepEqual(b.sentences.length > 0, true);
  assert.equal(b.source.abstract || b.source.notes || b.source.conclusion, false);
  assert.equal(estimateSecs(null), 0);
  assert.deepEqual(chunkForTts(undefined), []);
});

test('very long input is handled in linear time and stays within limits', () => {
  const blocks = Array.from({ length: 4000 }, (_, k) => P('Sentence number ' + k + ' says that returns rose by 1.5% in 2019 (Smith, 2019). It continued.', 1 + (k % 30)));
  const t0 = Date.now();
  const s = txt(speechSentences(blocks));
  assert.ok(Date.now() - t0 < 10_000);
  assert.equal(s.length, 8000);
  assert.ok(s.every((x) => x.length <= MAX_SENTENCE));
});

const PAPER = {
  title: 'Volatility Clustering in Synthetic Markets',
  year: 2019,
  notes: {
    claim: 'Volatility clusters after shocks.',
    mechanism: 'Dealers hedge gamma, which amplifies moves.',
    data: 'Daily returns on 12 synthetic indices, 1990–2018.',
    method: 'A GARCH(1,1) fit with σ forecasts.',
    effect: 'About 1.5% extra range after a 2σ day.',
    outOfSample: 'The effect halves after 2010.',
    costs: 'Spread of 2 bps eats a third.',
    relevance: 'Matters for the desk sizing rules.',
    stance: 'supports',
    caveats: 'Small sample; p < 0.05 only in one era.',
    testHere: 'Run it on EURUSD daily ranges.',
    crossRefs: 'ignored',
  },
};
const ABSTRACT_BLOCKS = [
  { i: 0, type: 'h1', text: 'Abstract', page: 1 },
  P('We show that volatility clusters. The effect is large. It is robust to many things.'),
  { i: 2, type: 'h1', text: 'Introduction', page: 1 },
  P('Intro body that must not be in the abstract.'),
];

test('briefing: spoken order, glue sentences, abstract, conclusion, stance, source flags', () => {
  const concl = ['First conclusion paragraph. It matters.', 'Middle paragraph is not read.', 'Last conclusion paragraph.'];
  const b = briefingScript(PAPER, ABSTRACT_BLOCKS, concl);
  assert.equal(b.title, 'Volatility Clustering in Synthetic Markets');
  assert.deepEqual(b.source, { abstract: true, notes: true, conclusion: true });
  const text = b.sentences.join(' ');
  const order = ["The paper's claim is volatility clusters", 'The mechanism it proposes is dealers hedge gamma', 'It uses daily returns',
    'The method is a garch', 'The size of the effect is about 1 point 5 percent', 'Out of sample, the effect halves', 'Costs: Spread of 2 basis points',
    'Be careful about: Small sample', 'For our desk: Matters', 'To test it here: Run it on EURUSD', 'From the conclusion:', 'And the paper ends with:'];
  let at = -1;
  for (const frag of order) {
    const k = text.indexOf(frag);
    assert.ok(k > at, 'in order: ' + frag);
    at = k;
  }
  assert.match(text, /twenty nineteen/);
  assert.match(text, /We show that volatility clusters/);
  assert.doesNotMatch(text, /Intro body|Middle paragraph|ignored/);
  assert.match(text, /stance on file for this paper is: supports/);
  assert.ok(b.sentences.every((x) => x.length <= MAX_SENTENCE));
  assert.ok(b.secs > 20 && b.secs <= 300, 'secs ' + b.secs);
  assert.equal(b.secs, estimateSecs(b.sentences));
});

test('briefing without a conclusion, and abstract-only paper (no blocks)', () => {
  const a = briefingScript(PAPER, ABSTRACT_BLOCKS, []);
  assert.equal(a.source.conclusion, false);
  assert.doesNotMatch(a.sentences.join(' '), /From the conclusion/);
  const b = briefingScript({ ...PAPER, abstract: 'Only an abstract is held. It has two sentences.' }, null);
  assert.deepEqual(b.source, { abstract: true, notes: true, conclusion: false });
  assert.match(b.sentences.join(' '), /Only an abstract is held/);
  const c = briefingScript({ title: 'T', notes: { claim: '', mechanism: '   ', data: null } }, []);
  assert.equal(c.source.notes, false);
  assert.doesNotMatch(c.sentences.join(' '), /claim is|mechanism|It uses/);
});

test('briefing with huge notes is trimmed to the 5 minute target', () => {
  const big = 'This is a sentence about something quite long indeed for the desk. '.repeat(120);
  const notes = Object.fromEntries(['claim', 'mechanism', 'data', 'method', 'effect', 'outOfSample', 'costs', 'caveats', 'relevance', 'testHere'].map((k) => [k, big]));
  const b = briefingScript({ title: 'Big', year: 2020, abstract: big, notes }, null, [big, big]);
  assert.ok(b.secs <= 330, 'secs ' + b.secs);
  assert.ok(b.sentences.length > 20);
});

test('estimateSecs and chunkForTts', () => {
  const words = Array(150).fill('word').join(' ') + '.';
  assert.equal(estimateSecs([words]), 60);
  assert.equal(estimateSecs([words], 2), 30);
  assert.equal(estimateSecs([words], -1), 60);
  assert.equal(estimateSecs([], 1), 0);
  const sents = Array.from({ length: 50 }, (_, k) => 'This is spoken sentence number ' + k + ' of the listing.');
  const chunks = chunkForTts(sents, { maxChars: 300 });
  assert.ok(chunks.length > 5);
  assert.ok(chunks.every((c) => c.length <= 300));
  assert.equal(chunks.join(' '), sents.join(' '), 'no sentence lost, split or reordered');
  for (const c of chunks) assert.ok(/\.$/.test(c), 'ends on a sentence boundary');
  assert.deepEqual(chunkForTts(['a.', '', null, 'b.'], { maxChars: 1000 }), ['a. b.']);
  assert.ok(chunkForTts(['x '.repeat(500)], { maxChars: 100 }).every((c) => c.length <= 100));
});

test('arXiv and SSRN margin stamps are never spoken', () => {
  const stamps = ['arXiv:1107.1834v1 [q-fin.CP] 10 Jul 2011', 'arXiv:1107.1834v1 q-fin.C P 10 Jul 2011', 'a r X i v : 1 1 0 7 . 1 8 3 4 v 1 [ q - f i n . C P ] 1 0 J u l 2 0 1 1', 'arXiv:hep-th/9901001v2 5 Feb 1999',
    'Electronic copy available at: https://ssrn.com/abstract=3012345', 'Electronic copy available at ssrn.com', 'Downloaded from https://example.org/x on 3 May 2020', 'NBER Working Paper No. 12345', 'Working Paper', 'https://doi.org/10.1000/xyz123', 'doi:10.1093/abc/hhx001'];
  for (const s of stamps) assert.ok(isStampLine(s), s);
  assert.deepEqual(speechSentences([P(stamps[0]), P(stamps[4]), P(stamps[8])]), []);
  assert.equal(norm(stamps[0]), '');
  assert.ok(!/arxiv|1107|ssrn|electronic/i.test(norm(`Abstract text here. ${stamps[0]} More text. ${stamps[4]}`)));
  const a = briefingScript({ title: 'T', abstract: `${stamps[0]} We test a simple idea on synthetic data. It works.` }, null, []);
  assert.ok(!/arXiv|1107|q-fin/i.test(a.sentences.join(' ')), a.sentences.join(' | '));
  assert.ok(/We test a simple idea/.test(a.sentences.join(' ')));
});

test('prose that merely mentions a working paper or a link is kept', () => {
  assert.ok(!isStampLine('Working paper evidence on this question is mixed and we show why that is so.'));
  assert.equal(stripStamps('A normal sentence about volatility.'), 'A normal sentence about volatility.');
  assert.ok(speechSentences([P('See the website https://example.com/page for the data used in this synthetic example here.')]).length === 1);
});

test('cleanBlocks drops standalone stamp paragraphs, cuts stamps inside text and renumbers i', () => {
  const blocks = [{ i: 0, type: 'p', text: 'arXiv:1107.1834v1 [q-fin.CP] 10 Jul 2011', page: 1 }, { i: 1, type: 'h1', text: 'Title', page: 1 }, { i: 2, type: 'p', text: 'Intro arXiv:1107.1834v1 [q-fin.CP] 10 Jul 2011 text.', page: 1 }];
  const c = cleanBlocks(blocks);
  assert.deepEqual(c.map(b => [b.i, b.text]), [[0, 'Title'], [1, 'Intro text.']]);
  assert.equal(cleanBlocks(c), c, 'nothing to clean returns the same array');
});

test('footnote bodies (foot blocks) are not read aloud; figure captions and table numbers never are', () => {
  const blocks = [P('The main sentence of the paragraph is long enough to be read out loud. It continues here.'), { ...P('12 A footnote that explains the claim made above, set small at the page bottom.'), i: 1, foot: true }, { i: 2, type: 'fig', text: 'Figure 3: A chart.', page: 1, bbox: [1, 1, 2, 2], gfx: true }, { i: 3, type: 'table', text: 'Table 5', page: 1, bbox: [1, 1, 2, 2], label: 'Table 5' }];
  const out = txt(speechSentences(blocks));
  assert.ok(out.some((x) => /main sentence/.test(x)));
  assert.ok(!out.some((x) => /footnote|Figure 3/.test(x)));
  assert.equal(out.filter((x) => x === 'A table appears here.').length, 1);
});

// ── figure and table notes (js/libraryFigs.js) ──
const T1 = { i: 1, type: 'table', label: 'Table 1', text: 'Table 1: Sharpe ratio by horizon', note: 'It lists the Sharpe ratio for four holding periods, from 0.42 at 1M to 0.59 at 12M, and it rises with the horizon.', noteConfident: true, noteRefs: 5, page: 2 };
const F2 = { i: 2, type: 'fig', label: 'Figure 2', text: 'Figure 2: Cumulative returns', note: 'Cumulative returns of the carry rule.', noteConfident: true, noteRefs: 1, page: 2 };
const T3 = { i: 3, type: 'table', label: 'Table 3', text: 'Table 3: Robustness', note: 'Robustness checks by sample.', noteConfident: false, noteRefs: 9, page: 3 };
const T4 = { i: 4, type: 'table', label: 'Table 4', text: 'Table 4: Plain', page: 3 };

test('Full mode: a table or figure with a note says "Table 1. <note>" (once a line about the source), not the raw numbers; no note keeps the old line', () => {
  const out = txt(speechSentences([P('Intro sentence here.'), T1, F2, T4, { i: 5, type: 'fig', label: 'Figure 9', text: 'Figure 9: none' }]));
  const j = out.join(' ');
  assert.ok(out.includes("Notes on figures and tables come from the paper's text, not from the pictures."));
  assert.equal(out.filter((x) => /come from the paper's text/.test(x)).length, 1, 'the source line once');
  assert.ok(out.includes('Table 1.')); assert.match(j, /Table 1\. It lists the Sharpe ratio/); assert.match(j, /Figure 2\. Cumulative returns of the carry rule\./);
  assert.equal(out.filter((x) => x === 'A table appears here.').length, 1, 'only the table without a note');
  assert.ok(!/Figure 9/.test(j), 'a figure without a note is still skipped');
  assert.ok(out.every((x) => x.length <= MAX_SENTENCE), out.filter((x) => x.length > MAX_SENTENCE).join(' / '));
  assert.ok(!/[σ≈×≤≥∑=%]|\d\.\d/.test(j), 'no raw math glyphs or decimals: ' + j);
  const tight = speechSentences([T1], { maxChars: 60 }); assert.ok(tight.every((x) => x.text.length <= 60));
});

test('Full mode: the highlight block of a note is the figure/table block', () => {
  const r = speechSentences([T1]); assert.ok(r.every((x) => x.block === 1));
});

test('Briefing: a "Charts and tables" section of up to 4 confident notes, the most referred-to first; none when nothing is confident', () => {
  const many = Array.from({ length: 6 }, (_, k) => ({ i: 10 + k, type: k % 2 ? 'fig' : 'table', label: `${k % 2 ? 'Figure' : 'Table'} ${k + 10}`, text: 'c', note: `Note number ${k} about the data.`, noteConfident: true, noteRefs: k }));
  const b = briefingScript({ title: 'T', year: 2020, abstract: 'An abstract sentence here.' }, [T1, F2, T3, T4, ...many], []);
  const s = b.sentences, at = s.indexOf('Charts and tables.');
  assert.ok(at > 0, 'the section is there'); assert.equal(s[at + 1], "Notes on figures and tables come from the paper's text, not from the pictures.");
  const section = s.slice(at + 2, s.indexOf('That is the briefing.'));
  const labels = section.filter((x) => /^(?:Table|Figure) \d+\.$/.test(x));
  assert.deepEqual(labels, ['Table 1.', 'Figure 15.', 'Table 14.', 'Figure 13.'], 'four notes, most referred-to first (5 refs, then 5/4/3 of the generated ones)');
  assert.ok(!section.join(' ').includes('Robustness checks'), 'a not-confident note is not read, however often it is referred to');
  assert.ok(s.every((x) => x.length <= MAX_SENTENCE));
  const none = briefingScript({ title: 'T', abstract: 'Abstract here.' }, [T3, T4], []).sentences; assert.ok(!none.includes('Charts and tables.'));
  assert.ok(!briefingScript({ title: 'T', abstract: 'Abstract here.' }, null, []).sentences.includes('Charts and tables.'));
});

test('Briefing: the section shrinks with the length budget instead of pushing the briefing past five minutes', () => {
  const long = 'This is a fairly long abstract sentence about volatility and risk premia in many markets. '.repeat(14);
  const notes = Array.from({ length: 6 }, (_, k) => ({ i: k, type: 'table', label: `Table ${k + 1}`, text: 'c', note: 'A note that says what the table reports about the sample. '.repeat(3).trim(), noteConfident: true, noteRefs: 6 - k }));
  const b = briefingScript({ title: 'T', abstract: long, notes: { claim: long, mechanism: long, method: long, caveats: long } }, notes, [long, long]);
  assert.ok(b.secs <= 5 * 60 + 5, String(b.secs));
});
