// js/arxivMath.js: synthetic LaTeXML-style HTML fixtures only (no paper text), a fake fetch, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import katex from 'katex';
import { arxivIdOf, parseArxivMath, matchToBlocks, symbolBag, bagSim, cleanLatex, fetchArxivMath, arxivPolite, _resetPolite, ARXIV_GAP_MS } from './arxivMath.js';

const eqTable = (id, latex, tag) => `<table id="${id}" class="ltx_equation ltx_eqn_table"><tbody><tr class="ltx_equation ltx_eqn_row ltx_align_baseline"><td class="ltx_eqn_cell ltx_eqn_center_padleft"></td><td class="ltx_eqn_cell ltx_align_center"><math alttext="${latex}" class="ltx_Math" display="block"><semantics><mrow/></semantics></math></td>${tag ? `<td class="ltx_eqn_cell ltx_eqn_eqno ltx_align_middle ltx_align_right" rowspan="1"><span class="ltx_tag ltx_tag_equation ltx_align_right">(${tag})</span></td>` : ''}</tr></tbody></table>`;
const group = rows => `<table id="S2.E9" class="ltx_equationgroup ltx_eqn_align ltx_eqn_table"><tbody>${rows.map(([l, r, tag]) => `<tr class="ltx_equation ltx_eqn_row ltx_align_baseline"><td class="ltx_td ltx_align_right ltx_eqn_cell"><math alttext="${l}" class="ltx_Math"><mrow/></math></td><td class="ltx_td ltx_align_left ltx_eqn_cell"><math alttext="${r}" class="ltx_Math"><mrow/></math></td>${tag ? `<td class="ltx_eqn_cell ltx_eqn_eqno"><span class="ltx_tag ltx_tag_equation">(${tag})</span></td>` : ''}</tr>`).join('')}</tbody></table>`;
const PAGE = `<html><body><p>text <math alttext="x" display="inline"><mrow/></math> inline is ignored</p>
${eqTable('S2.E1', '{\\displaystyle dX_t=\\sqrt{v_t}\\,dW_t-\\frac{v_t}{2}\\,dt}', '2.1')}
<p>between</p>
${eqTable('S2.E2', 'X_0=x_0\\quad v_0=\\nu_0 &lt; &gt;', '2.2')}
${group([['a', '=b+c', '2.3'], ['d', '=e', null], ['f', '=g\\label{x}\\nonumber', '2.4']])}
${eqTable('A1.E1', '\\hat{y}=\\beta^{\\top}x', 'A.1')}
${eqTable('S3.Ex1', 'E[Z]=\\mu', null)}
</body></html>`;

test('parseArxivMath: equations in document order, tags, decoded and cleaned, groups with rows', () => {
  const eqs = parseArxivMath(PAGE);
  assert.equal(eqs.length, 5);
  assert.equal(eqs[0].tag, '2.1'); assert.doesNotMatch(eqs[0].latex, /displaystyle/); assert.match(eqs[0].latex, /\\tag\{2\.1\}$/);
  assert.match(eqs[1].latex, /<\s*>/); assert.equal(eqs[1].tag, '2.2');
  assert.equal(eqs[2].group, true); assert.deepEqual(eqs[2].tags, ['2.3', '2.4']); assert.match(eqs[2].latex, /^\\begin\{aligned\}a & =b\+c \\\\ d & =e \\\\ f & =g\\end\{aligned\}$/);
  assert.doesNotMatch(eqs[2].latex, /label|nonumber/);
  assert.equal(eqs[3].tag, 'A.1'); assert.equal(eqs[4].tag, null); assert.doesNotMatch(eqs[4].latex, /tag/);
  for (const e of eqs) katex.renderToString(e.latex, { throwOnError: true, displayMode: true });
});

test('parseArxivMath: junk, empty and truncated input never throw', () => {
  for (const x of [null, undefined, '', 'no math here', '<table class="ltx_equation"><tr><td><math alttext="x', 5, {}]) assert.deepEqual(parseArxivMath(x).filter(e => !e.latex), []);
  assert.equal(cleanLatex('\\displaystyle   x &amp;&amp; y\\nonumber \\label{a}'), 'x && y');
});

test('arxivIdOf: record field, doi, url forms, upload file names, old-style ids', () => {
  assert.equal(arxivIdOf({ arxiv: '2007.14874v2' }), '2007.14874');
  assert.equal(arxivIdOf({ arxiv: 'arXiv:1706.03762' }), '1706.03762');
  assert.equal(arxivIdOf({ doi: 'arXiv:2007.14874v1' }), '2007.14874');
  assert.equal(arxivIdOf({ doi: '10.48550/arXiv.2007.14874' }), '2007.14874');
  assert.equal(arxivIdOf({ url: 'https://arxiv.org/pdf/2007.14874' }), '2007.14874');
  assert.equal(arxivIdOf({ url: 'https://arxiv.org/abs/2007.14874v3' }), '2007.14874');
  assert.equal(arxivIdOf({ url: 'https://arxiv.org/pdf/hep-th/9901001v2.pdf' }), 'hep-th/9901001');
  assert.equal(arxivIdOf({ uploadName: '2001.00001v2.pdf' }), '2001.00001');
  assert.equal(arxivIdOf({ uploadName: 'hep-th_9901001.pdf' }), 'hep-th/9901001');
  assert.equal(arxivIdOf({ upload: { name: 'A Study (2020) 2005.12345.pdf' } }), '2005.12345');
  for (const x of [null, {}, { url: 'https://ssrn.com/abstract=123' }, { arxiv: 'nonsense' }, { uploadName: 'paper-1234.pdf' }]) assert.equal(arxivIdOf(x), null);
});

const blk = (i, text, label) => ({ i, label, text });
test('symbolBag: Greek names, flattened scripts and stacked fractions compare as the same set of symbols', () => {
  const a = symbolBag('dX(t) = ν(t)dW1(t) − ν(t) 2 dt'), b = symbolBag('dX_t=\\nu_t\\,dW_{1,t}-\\frac{\\nu_t}{2}\\,dt', { latex: true });
  assert.ok(bagSim(a, b) > 0.8, `sim ${bagSim(a, b)}`);
  assert.ok(bagSim(symbolBag('a + b = c'), symbolBag('\\sum_i \\alpha_i', { latex: true })) < 0.4);
});

test('matchToBlocks: equation number plus similar symbols, then document order; weak matches are refused', () => {
  const eqs = parseArxivMath(PAGE);
  const blocks = [
    blk(10, 'dX(t) = √ν(t)dW(t) − ν(t) 2 dt (2.1)', '2.1'),
    blk(14, 'X(0) = x0 ν(0) = ν0 (2.2)', '2.2'),
    blk(20, 'a = b + c d = e f = g (2.3) (2.4)', '2.3'),
    blk(25, 'something unrelated with different symbols zzz qqq', '9.9'),
    blk(30, 'E[Z] = µ'),
  ];
  const m = matchToBlocks(eqs, blocks);
  assert.equal(m.get(10), eqs[0].latex); assert.equal(m.get(14), eqs[1].latex); assert.equal(m.get(20), eqs[2].latex);
  assert.ok(!m.has(25), 'a wrong number with unlike symbols is not accepted');
  assert.equal(m.get(30), eqs[4].latex, 'an unnumbered equation matches by order and near-identical symbols');
  assert.deepEqual([...m.info.values()].map(x => x.source), ['arxiv', 'arxiv', 'arxiv', 'arxiv']);
  assert.ok([...m.info.values()].every(x => x.conf === 0.95));
  assert.equal(m.info.get(10).via, 'label');
});

test('matchToBlocks: a numbered row of an align group that the PDF set as its own block; wrong order is not forced', () => {
  const eqs = parseArxivMath(PAGE);
  const m = matchToBlocks(eqs, [blk(1, 'f = g (2.4)', '2.4')]);
  assert.match(m.get(1), /^f & =g\\tag\{2\.4\}$/);
  const swapped = matchToBlocks(eqs, [blk(1, 'ŷ = βTx (A.1)', 'A.1'), blk(2, 'dX(t) = √ν(t)dW(t) − ν(t) 2 dt (2.1)', '2.1')]);
  assert.equal(swapped.size, 2, 'labels allow both, each to its own equation');
  assert.equal(matchToBlocks([], [blk(1, 'x')]).size, 0); assert.equal(matchToBlocks(eqs, []).size, 0); assert.equal(matchToBlocks(null, null).size, 0);
});

const resp = (status, body = '') => ({ ok: status >= 200 && status < 300, status, text: async () => body });
test('fetchArxivMath: arXiv first, ar5iv only on a 404, a generic user agent, one request when it works', async () => {
  const seen = [];
  const f = async (url, o) => { seen.push([url, o.headers['User-Agent']]); return url.includes('ar5iv') ? resp(200, PAGE) : resp(404); };
  const r = await fetchArxivMath('2007.14874', { fetch: f, polite: async () => {} });
  assert.equal(r.ok, true); assert.equal(r.from, 'ar5iv'); assert.equal(r.eqs.length, 5);
  assert.deepEqual(seen.map(s => s[0]), ['https://arxiv.org/html/2007.14874', 'https://ar5iv.labs.arxiv.org/html/2007.14874']);
  assert.ok(seen.every(s => /^Mozilla\/5\.0 \(compatible; PaperReader\/[\d.]+\)$/.test(s[1])), 'generic client name, nothing personal');
  seen.length = 0;
  const ok = await fetchArxivMath('2007.14874', { fetch: async (u, o) => { seen.push(u); return resp(200, PAGE); }, polite: async () => {} });
  assert.equal(ok.from, 'arxiv'); assert.equal(seen.length, 1, 'one request per paper');
});

test('fetchArxivMath: failures are reported, rate limits stop at once, nothing throws', async () => {
  const none = { polite: async () => {} };
  assert.deepEqual((await fetchArxivMath('x', { ...none, fetch: async () => resp(404) })).status, 'not-found');
  const limited = []; assert.equal((await fetchArxivMath('x', { ...none, fetch: async u => { limited.push(u); return resp(429); } })).status, 'http-429'); assert.equal(limited.length, 1);
  assert.equal((await fetchArxivMath('x', { ...none, fetch: async () => { throw new Error('boom'); } })).ok, false);
  assert.equal((await fetchArxivMath('x', { ...none, fetch: async () => resp(200, '<html>no equations</html>') })).status, 'no-equations');
  assert.equal((await fetchArxivMath('', { ...none, fetch: async () => resp(200) })).ok, false);
});

test('politeness: callers share one clock, at least 3 seconds apart', async () => {
  _resetPolite(); let t = 1_000_000; const waits = [];
  const deps = { now: () => t, sleep: async ms => { waits.push(ms); t += ms; } };
  await arxivPolite(deps); await arxivPolite(deps); await arxivPolite(deps);
  assert.deepEqual(waits, [ARXIV_GAP_MS, ARXIV_GAP_MS]);
  assert.equal(ARXIV_GAP_MS, 3000);
  _resetPolite();
});
