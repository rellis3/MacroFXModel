// Tests for js/literature.js.   node js/literature.test.mjs
// The fixtures in tests/fixtures/literature/ are real responses fetched once with curl on 2026-11-04, except:
//   openalex_search.json   OpenAlex's search endpoint was rate limited from the build machine (openalex_429.json is
//                          that reply), so this is three real single-work replies (/works/doi:...) wrapped in the
//                          search envelope { meta, results }, with the long lists (concepts, references) trimmed.
//   semanticscholar_search.json   hand-written in the documented /graph/v1/paper/search shape: every keyless call
//                          from the build machine returned 429 (semanticscholar_429.json is that reply).
//   ssrn_blocked.html      SSRN's real block page for automated fetches, its embedded fonts cut.
// No test touches the network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as L from './literature.js';
import { validateProposals } from './researchPod.js';

const FX = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'literature');
const read = f => fs.readFileSync(path.join(FX, f), f.endsWith('.gz') ? undefined : 'utf8');
const gunz = f => zlib.gunzipSync(read(f)).toString('utf8');
const json = f => JSON.parse(read(f));
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

t('ids: arXiv ids from ids, URLs and 10.48550 DOIs; DOIs from doi.org; stable ids', () => {
  assert.equal(L.arxivIdOf('https://arxiv.org/abs/1406.4322v1'), '1406.4322');
  assert.equal(L.arxivIdOf('https://arxiv.org/pdf/2310.06816.pdf'), '2310.06816');
  assert.equal(L.arxivIdOf('arXiv:1303.4314v3'), '1303.4314');
  assert.equal(L.arxivIdOf('10.48550/arXiv.1903.06346'), '1903.06346');
  assert.equal(L.arxivIdOf('q-fin/0601001v2'), 'q-fin/0601001');
  assert.equal(L.arxivIdOf('carry trade'), null);
  assert.equal(L.doiOf('https://doi.org/10.1111/J.1540-6261.2012.01728.X'), '10.1111/j.1540-6261.2012.01728.x');
  assert.equal(L.doiOf('doi: 10.2139/ssrn.6391601.'), '10.2139/ssrn.6391601');
  assert.equal(L.hash('a'), L.hash('a')); assert.notEqual(L.hash('a'), L.hash('b'));
});

t('arXiv: the Atom search reply parses to records with PDF and HTML links', () => {
  const r = L.parseArxiv(read('arxiv_search.xml'));
  assert.equal(r.length, 3);
  const a = r.find(x => x.arxiv === '1406.4322');
  assert.ok(a, 'the tail-dependence paper is in the reply');
  assert.equal(a.id, 'arxiv:1406.4322'); assert.equal(a.source, 'arxiv'); assert.equal(a.year, 2014);
  assert.match(a.title, /Upside and Downside Risk Exposures of Currency Carry Trades/);
  assert.ok(a.authors.includes('Matthew Ames')); assert.match(a.abstract, /carry trade/i);
  assert.equal(a.pdfUrl, 'https://arxiv.org/pdf/1406.4322'); assert.equal(a.htmlUrl, 'https://arxiv.org/html/1406.4322'); assert.ok(a.oa);
  assert.deepEqual(L.parseArxiv('<feed><title>arXiv Query</title></feed>'), []);
});

t('OpenAlex: abstracts rebuilt from the inverted index; DOI, citations, venue and open-access links kept', () => {
  assert.equal(L.rebuildAbstract({ carry: [1], The: [0], pays: [2] }), 'The carry pays');
  assert.equal(L.rebuildAbstract(null), null);
  const r = L.parseOpenAlex(json('openalex_search.json'));
  assert.equal(r.length, 3);
  const m = r.find(x => /Global Foreign Exchange Volatility/.test(x.title));
  assert.equal(m.id, 'doi:10.1111/j.1540-6261.2012.01728.x'); assert.equal(m.venue, 'The Journal of Finance'); assert.ok(m.citations > 500);
  assert.match(m.abstract, /^We investigate the relation between global foreign exchange/); assert.equal(m.oa, false);
  const s = r.find(x => /Currency Crash Risk/.test(x.title));
  assert.equal(s.ssrn, '6391601'); assert.equal(s.oa, true); assert.equal(s.oaUrl, 'https://doi.org/10.2139/ssrn.6391601'); assert.ok(s.keys.includes('ssrn:6391601'));
  const nb = r.find(x => /First Era of Globalization/.test(x.title)); assert.equal(nb.pdfUrl, 'https://doi.org/10.3386/w13577');
  // a single work (the /works/doi: lookup) parses the same way
  assert.equal(L.parseOpenAlex(json('openalex_search.json').results[0]).length, 1);
  assert.deepEqual(L.parseOpenAlex(json('openalex_429.json')), []);
});

t('Semantic Scholar and Crossref parse; rate limits and blocks are named', () => {
  const s = L.parseS2(json('semanticscholar_search.json'));
  assert.equal(s.length, 2); assert.equal(s[1].id, 'arxiv:1406.4322'); assert.equal(s[1].pdfUrl, 'https://arxiv.org/pdf/1406.4322'); assert.equal(s[0].citations, 1010);
  assert.deepEqual(L.parseS2(json('semanticscholar_429.json')), []);
  const c = L.parseCrossref(json('crossref_search.json'));
  assert.equal(c.length, 5);
  const ssrn = c.find(x => x.doi === '10.2139/ssrn.6391601');
  assert.equal(ssrn.title, 'Carry Trade and Currency Crash Risk'); assert.equal(ssrn.venue, 'SSRN'); assert.match(ssrn.abstract, /^This paper examines the role of currency crash risk/);
  assert.ok(!/<jats/.test(ssrn.abstract)); assert.ok(ssrn.authors.includes('Sweder van Wijnbergen'));
  const one = L.parseCrossref(json('crossref_work.json')); assert.equal(one.length, 1); assert.equal(one[0].id, 'doi:10.2139/ssrn.6391601'); assert.ok(one[0].keys.includes('ssrn:6391601'));
  assert.match(L.apiError('openalex', 429, read('openalex_429.json')), /rate limited.*OPENALEX_API_KEY/);
  assert.match(L.apiError('s2', 429, read('semanticscholar_429.json')), /rate limited.*S2_API_KEY/);
  assert.match(L.apiError('ssrn', 403, read('ssrn_blocked.html')), /blocked/);
  assert.ok(L.isBlockedPage(read('ssrn_blocked.html'))); assert.ok(!L.isBlockedPage('<title>Carry trades</title>'));
});

t('search URLs: every source, the query encoded, keys only when set', () => {
  const u = L.searchUrls('currency carry trade crash risk', { max: 8, mailto: 'a@b.c' });
  assert.match(u.arxiv, /^https:\/\/export\.arxiv\.org\/api\/query\?search_query=.*all%3Acarry.*max_results=8/);
  assert.match(u.openalex, /^https:\/\/api\.openalex\.org\/works\?search=currency%20carry/); assert.match(u.openalex, /mailto=a%40b\.c/); assert.ok(!/api_key/.test(u.openalex));
  assert.match(L.searchUrls('x y', { openalexKey: 'K' }).openalex, /api_key=K/);
  assert.match(u.s2, /graph\/v1\/paper\/search\?query=currency/); assert.match(u.crossref, /query\.bibliographic=currency/);
  assert.equal(L.searchUrls('the of').arxiv, null);
  assert.equal(L.arxivQuery('foreign exchange order flow returns'), '(all:foreign AND all:exchange AND all:order) AND (cat:q-fin.* OR cat:econ.* OR cat:stat.AP)');
  assert.equal(L.lookupUrls.arxiv('1406.4322'), 'https://export.arxiv.org/api/query?id_list=1406.4322');
});

t('dedupe across sources by arXiv id, DOI or title; rank by relevance, citations and recency', () => {
  const all = [...L.parseArxiv(read('arxiv_search.xml')), ...L.parseOpenAlex(json('openalex_search.json')), ...L.parseS2(json('semanticscholar_search.json')), ...L.parseCrossref(json('crossref_search.json'))];
  const d = L.dedupe(all);
  assert.ok(d.length < all.length);
  const tail = d.filter(x => x.keys.includes('arxiv:1406.4322')); assert.equal(tail.length, 1); assert.deepEqual(tail[0].sources.sort(), ['arxiv', 's2']); assert.equal(tail[0].citations, 9);
  const vol = d.filter(x => x.keys.includes('doi:10.1111/j.1540-6261.2012.01728.x')); assert.equal(vol.length, 1); assert.ok(vol[0].sources.includes('openalex') && vol[0].sources.includes('s2'));
  assert.equal(vol[0].citations, 1010);
  const crash = d.filter(x => x.keys.includes('ssrn:6391601')); assert.equal(crash.length, 1); assert.match(crash[0].abstract, /crash risk/); // Crossref's abstract filled OpenAlex's gap
  const ranked = L.rankPapers(d, ['currency carry trade crash risk', 'carry trade tail dependence'], { year: 2026 });
  assert.ok(ranked[0].score >= ranked.at(-1).score);
  assert.ok(ranked.slice(0, 3).some(x => /Crash Risk|Tail Dependence/.test(x.title)), ranked.slice(0, 3).map(x => x.title).join(' | '));
  assert.ok(L.relevance({ title: 'Carry trades and crash risk', abstract: '' }, 'carry crash') > L.relevance({ title: 'Equity momentum', abstract: '' }, 'carry crash'));
  assert.ok(L.titleMatch('Carry Trades and Global Foreign Exchange Volatility', 'carry trades global FX volatility') >= 0.5);
});

t('full text: arXiv HTML stripped to the article, bibliography cut, math kept as text', () => {
  const h = L.arxivHtml(gunz('arxiv_html_1406.4322.html.gz'));
  assert.match(h.title, /Upside and Downside Risk Exposures of Currency Carry Trades/);
  assert.match(h.abstract, /carry trade/i);
  assert.ok(h.text.length > 20_000, `${h.text.length}`);
  assert.match(h.text, /Uncovered Interest Rate Parity/); assert.match(h.text, /\bConclusion\b/);
  assert.ok(!/Instructions for reporting errors/.test(h.text)); assert.ok(!/<[a-z]+[\s>]/i.test(h.text.slice(0, 5000)));
  const e = L.excerpt(h.text, { head: 8000, tail: 3000 });
  assert.ok(e.cut && e.conclusion); assert.ok(e.text.length < 8000 + 3000 + 40); assert.match(e.text, /\[… cut …\]\n\n7 ?\n?Conclusion/);
});

t('full text: pdf-parse output cleaned; conclusion found; references never sent', () => {
  const raw = gunz('arxiv_pdf_1406.4322.txt.gz'), s = L.cleanPdfText(raw);
  assert.match(s, /profiting from the interest rate differentials/);   // "prof-\niting" joined
  const c = L.findConclusion(s); assert.ok(c > 0); assert.match(s.slice(c, c + 20), /7 Conclusion/);
  assert.ok(L.findReferences(s, c) > c);
  const e = L.excerpt(s, { head: 10_000, tail: 2000 });
  assert.match(e.text, /7 Conclusion/); assert.ok(!e.text.includes('\nReferences\n'));
  assert.equal(L.excerpt('short text').cut, false);
  const dz = '1 Introduction\ntext\n8 Discussion\nmore\nReferences\n'; assert.equal(L.findConclusion(dz), dz.indexOf('8 Discussion'));
  assert.match(L.htmlToText('<p>a<b>b</b></p><script>x()</script><math alttext="x^2"><mi>x</mi></math>'), /^ab\nx\^2$/);
});

t('identify what the owner pasted', () => {
  assert.deepEqual(L.identifyRef('https://arxiv.org/abs/1406.4322v2'), { kind: 'arxiv', id: '1406.4322' });
  assert.deepEqual(L.identifyRef('2310.06816'), { kind: 'arxiv', id: '2310.06816' });
  assert.deepEqual(L.identifyRef('https://doi.org/10.1111/j.1540-6261.2012.01728.x'), { kind: 'doi', doi: '10.1111/j.1540-6261.2012.01728.x' });
  assert.deepEqual(L.identifyRef('10.3386/w13577'), { kind: 'doi', doi: '10.3386/w13577' });
  const s = L.identifyRef('https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1342185'); assert.equal(s.kind, 'ssrn'); assert.equal(s.doi, '10.2139/ssrn.1342185');
  assert.equal(L.identifyRef('https://ssrn.com/abstract=6391601').id, '6391601');
  assert.equal(L.identifyRef('https://www.nber.org/system/files/working_papers/w13577/w13577.pdf').kind, 'pdf');
  assert.equal(L.identifyRef('https://www.bis.org/publ/work1035.htm').kind, 'url');
  assert.deepEqual(L.identifyRef('Carry trades and global foreign exchange volatility'), { kind: 'title', title: 'Carry trades and global foreign exchange volatility' });
  assert.equal(L.identifyRef('x'.repeat(700)).kind, 'text'); assert.equal(L.identifyRef(''), null);
  const tr = L.textRecord('My working paper on carry\n\nWe find that...'); assert.match(tr.id, /^text:/); assert.equal(tr.title, 'My working paper on carry');
  assert.equal(L.urlRecord('https://n.org/w.pdf', 'NBER WORKING PAPER SERIES\nCARRY TRADES AND CURRENCY CRASHES\nMarkus K. Brunnermeier').title, 'CARRY TRADES AND CURRENCY CRASHES');
  const ur = L.urlRecord('https://x.org/p.pdf', '\nA Long Enough Paper Title Here\nbody'); assert.match(ur.id, /^url:/); assert.equal(ur.pdfUrl, 'https://x.org/p.pdf');
  const m = L.pageMeta('<html><head><title>T</title><meta name="citation_title" content="Carry &amp; Crash"><meta name="citation_author" content="A B"><meta name="citation_author" content="C D"><meta name="citation_publication_date" content="2009/03/01"><meta name="citation_doi" content="10.2139/ssrn.1342185"><meta name="citation_pdf_url" content="https://x/p.pdf"><meta name="description" content="We study."></head></html>');
  assert.deepEqual(m, { title: 'Carry & Crash', authors: ['A B', 'C D'], year: 2009, doi: '10.2139/ssrn.1342185', pdfUrl: 'https://x/p.pdf', abstract: 'We study.', venue: null });
});

t('librarian queries validated', () => {
  const v = L.validateQueries({ restated: 'r', queries: [{ q: 'currency carry crash risk', why: 'core' }, 'carry trade skewness', { q: 'carry' }, 'Currency carry crash risk'], names: ['Brunnermeier Nagel Pedersen 2008'] });
  assert.ok(v.ok); assert.equal(v.value.queries.length, 2); assert.equal(v.value.names[0], 'Brunnermeier Nagel Pedersen 2008');
  assert.equal(L.validateQueries({ queries: ['x'] }).ok, false); assert.equal(L.validateQueries([]).ok, false);
});

t('paper notes: kept per known paper, enums defaulted, cross-references only to papers already held', () => {
  const v = L.validatePaperNotes({ notes: [
    { paperId: 'arxiv:1406.4322', claim: 'Carry baskets carry upper and lower tail dependence', stance: 'supports', outOfSample: 'no', costs: 'maybe', data: { market: 'G10 FX', period: '1989-2014' },
      caveats: ['in-sample'], crossRefs: [{ paperId: 'doi:10.1111/j.1540-6261.2012.01728.x', relation: 'confirms', note: 'vol risk' }, { paperId: 'doi:unknown', relation: 'confirms' }, { paperId: 'arxiv:1406.4322' }] },
    { paperId: 'arxiv:9999.99999', claim: 'not asked for' }, { paperId: 'doi:10.3386/w13577' } ] },
  { ids: ['arxiv:1406.4322', 'doi:10.3386/w13577'], library: ['doi:10.1111/j.1540-6261.2012.01728.x', 'arxiv:1406.4322'] });
  assert.ok(v.ok); assert.equal(v.value.length, 1);
  const x = v.value[0]; assert.equal(x.costs, 'unclear'); assert.equal(x.outOfSample, 'no'); assert.equal(x.data.market, 'G10 FX');
  assert.deepEqual(x.crossRefs.map(c => c.paperId), ['doi:10.1111/j.1540-6261.2012.01728.x']); assert.equal(v.errors.length, 2);
  const single = L.validatePaperNotes({ claim: 'c', stance: 'odd' }, { ids: ['arxiv:1'] }); assert.equal(single.value[0].paperId, 'arxiv:1'); assert.equal(single.value[0].stance, 'neutral');
  assert.equal(L.validatePaperNotes({ notes: [] }).ok, false);
});

const prop = { lens: 'macro', title: 'Crash-risk-filtered carry', thesis: 'carry pays for crash risk', mechanism: 'insurance premium', sources: [{ title: 'Menkhoff et al.', ref: 'https://doi.org/x' }],
  inputs: [{ what: 'risk reversals', status: 'partial' }], test: { benchmark: 'plain carry', variable: 'RR filter' }, citations: ['doi:10.1111/j.1540-6261.2012.01728.x', 'doi:not-read'] };
t('dossier: verdict and cited evidence required; proposals pass through the pod validator with citations', () => {
  const ids = ['doi:10.1111/j.1540-6261.2012.01728.x', 'arxiv:1406.4322'];
  const v = L.validateDossier({ hypothesis: 'Carry pays for crash risk', verdict: 'worth-testing', evidenceFor: [{ point: 'vol risk prices carry', papers: [ids[0]] }, { point: 'no paper', papers: ['doi:x'] }],
    evidenceAgainst: [{ point: 'tail dependence in-sample only', papers: [ids[1]] }], unknowns: ['costs'], testHere: { design: 'sort on RR', data: ['cvol'] }, proposals: [prop, { title: 'bad' }] }, { paperIds: ids });
  assert.ok(v.ok, v.errors?.join());
  assert.equal(v.value.evidenceFor.length, 1); assert.equal(v.value.proposals.length, 1);
  assert.equal(v.value.proposals[0].id, 'macro-crash-risk-filtered-carry'); assert.deepEqual(v.value.proposals[0].citations, [ids[0]]);
  assert.ok(v.notes.some(x => /dropped an evidence point/.test(x)) && v.notes.some(x => /proposal "bad" dropped/.test(x)));
  assert.equal(L.validateDossier({ hypothesis: 'h', verdict: 'maybe', evidenceFor: [{ point: 'p', papers: [ids[0]] }] }, { paperIds: ids }).ok, false);
  assert.equal(L.validateDossier({ hypothesis: 'h', verdict: 'weak' }, { paperIds: ids }).ok, false);
  // validateProposals stays backward compatible: no citations field needed, and without paperIds any id is kept
  const old = validateProposals({ proposals: [{ ...prop, citations: undefined }] }, 'macro'); assert.deepEqual(old.value.proposals[0].citations, []);
  assert.equal(validateProposals({ proposals: [prop] }, 'macro').value.proposals[0].citations.length, 2);
});

t('paper library: merged by any key, notes kept with history, citations recorded; reading plan reuses notes', () => {
  const [a] = L.parseArxiv(read('arxiv_search.xml')).filter(x => x.arxiv === '1406.4322'), [s] = L.parseS2(json('semanticscholar_search.json')).slice(1);
  let lib = L.mergePapers([], [{ ...a, notes: { claim: 'first claim', stance: 'supports' }, readFrom: 'arxiv-html', forHypothesis: 'h1', lens: 'quant' }], { at: '2026-11-01' });
  lib = L.mergePapers(lib, [{ ...s }], { at: '2026-11-02' });
  assert.equal(lib.length, 1); assert.equal(lib[0].id, 'arxiv:1406.4322'); assert.equal(lib[0].citations, 9); assert.equal(lib[0].notes.claim, 'first claim'); assert.equal(lib[0].firstSeen, '2026-11-01');
  lib = L.mergePapers(lib, [{ ...a, notes: { claim: 'second claim', stance: 'mixed' }, readFrom: 'pdf' }], { at: '2026-11-03' });
  assert.equal(lib[0].notes.claim, 'second claim'); assert.equal(lib[0].history[0].claim, 'first claim'); assert.deepEqual(lib[0].lenses, ['quant']);
  lib = L.addCitations(lib, ['arxiv:1406.4322'], { dossier: 'd1', proposals: ['quant-x'] }); lib = L.addCitations(lib, ['arxiv:1406.4322'], { proposals: ['quant-x', 'macro-y'] });
  assert.deepEqual(lib[0].citedBy, { dossiers: ['d1'], proposals: ['quant-x', 'macro-y'] });
  const ranked = L.rankPapers(L.dedupe([...L.parseArxiv(read('arxiv_search.xml')), ...L.parseOpenAlex(json('openalex_search.json'))]), 'carry trade crash', { year: 2026 });
  const plan = L.readingPlan(ranked, lib, { total: 8, fullText: 3 });
  assert.equal(plan.reuse.length, 1); assert.equal(plan.reuse[0].notes.claim, 'second claim'); assert.equal(plan.full.length, 3);
  assert.ok(plan.full.every(r => r.arxiv || r.pdfUrl || r.oaUrl));
  const txt = L.libraryText(lib, { lens: 'quant' }); assert.match(txt, /\[arxiv:1406\.4322\].*read from pdf/); assert.match(txt, /claim: second claim/);
  assert.match(L.libraryIndex(lib), /^- \[arxiv:1406\.4322\]/); assert.equal(L.libraryText([]), '(the paper library is empty)');
  assert.match(L.paperForReader(a, 'BODY'), /FULL TEXT \(excerpt\):\nBODY/); assert.match(L.paperForReader(a), /ABSTRACT ONLY/);
});

t('weekly scan helpers: rotating topic per lens, arXiv feed items to records', () => {
  for (const lens of ['quant', 'macro', 'flow']) assert.ok(L.LENS_INTERESTS[lens].includes(L.weeklyTopic(lens, new Date('2026-11-08'))));
  assert.notEqual(L.weeklyTopic('quant', new Date('2026-11-08')), L.weeklyTopic('quant', new Date('2026-11-15')));
  const r = L.feedRecords([{ title: 'Learning AI Agents', link: 'https://arxiv.org/abs/2611.01799v1', date: '2026-11-01T11:08:08Z', summary: 's' }, { title: 'blog', link: 'https://x.com/a' }]);
  assert.equal(r.length, 1); assert.equal(r[0].id, 'arxiv:2611.01799'); assert.equal(r[0].year, 2026);
  assert.ok(L.LIT_HOSTS.includes('api.openalex.org') && Object.values(L.LIT_API).every(u => u.startsWith('https://')));
  const s = L.dossierSummary({ id: 'd', kind: 'idea', at: 'x', hypothesis: 'h', papers: [1, 2], dossier: { verdict: 'weak', summary: 's', proposals: [] }, errors: ['e'] });
  assert.deepEqual([s.verdict, s.papers, s.errors, s.ok], ['weak', 2, 1, true]);
});

console.log(`literature: ${n} tests passed`);
