// Tests for js/paperCatalog.js.   node js/paperCatalog.test.mjs
// Every fixture here is synthetic text written for the test: no paper text is stored in the repo.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TOPICS, TOPIC_KEYS, stem, autoTags, scoreTopics, applyOverrides, topicCounts, joinCatalog, buildIndex, addDoc, removeDoc, setDocTags, indexSize, parseQuery, search,
  deskLinks, THEORY_BY_TOPIC, theoryLinks, parseTodoList, heldSsrnIds, readNext, paperCaseId, caseForPaper, caseFromPaper, sourceOf, sourceCounts, SOURCES, freeLookup, normTitle, sourceOfManifest, yearOf, arxivYear, yearKey, yearCounts } from './paperCatalog.js';
import { DESK_EVIDENCE } from './deskEvidence.js';
import { putCase, summary, roundSections, headSections, emptyStore } from './researchCase.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..');
const keys = tags => tags.map(x => x.key);

// ── topics and auto tags ──
t('15 topics with unique keys, and stemming joins the word forms', () => {
  assert.equal(TOPICS.length, 15); assert.equal(new Set(TOPIC_KEYS).size, 15);
  assert.equal(stem('hedging'), stem('hedged')); assert.equal(stem('hedges'), stem('hedge')); assert.equal(stem('jumps'), stem('jump')); assert.equal(stem('regimes'), stem('regime'));
  assert.equal(stem('currencies'), stem('currency')); assert.equal(stem('volatility'), 'volatility'); assert.equal(stem('gamma'), 'gamma');
});

// [title, abstract, tags that must be there, tags that must NOT be there]
const CASES = [
  ['Jump-Diffusion Option Pricing with Stochastic Volatility', 'We extend the Merton model with random jumps in returns and stochastic volatility. Jumps arrive as a Poisson process and the model is calibrated to option prices.', ['jump', 'volatility', 'options'], ['cot', 'ml', 'regimes']],
  ['Forecasting Realized Volatility with a Heterogeneous Autoregressive (HAR) Model', 'We forecast daily realized variance with HAR regressions on high-frequency data and compare them with GARCH.', ['volatility'], ['jump', 'fx', 'trend', 'ml']],
  ['Carry Trades and Currency Crash Risk', 'Investors borrow in low interest rate currencies and invest in high yielding ones. Crash risk in exchange rates explains the forward premium.', ['fx'], ['trend', 'options', 'ml']],
  ['Do Speculators Predict Currency Returns? Evidence from Commitments of Traders', 'Net speculative positions of large traders and hedgers in currency futures, from the CFTC COT report.', ['cot', 'fx'], ['options', 'ml']],
  ['Dealer Gamma Exposure and Intraday Index Returns', 'Market makers hedging short gamma amplify moves; option open interest by strike is used to build gamma exposure.', ['options'], ['cot', 'fx', 'ml']],
  ['The Probability of Backtest Overfitting', 'We show that backtest overfitting is common and propose walk-forward tests, a deflated Sharpe ratio and a correction for multiple testing.', ['backtest'], ['microstructure', 'rates']],
  ['Brownian Motion and Ito Calculus for Asset Prices', 'Wiener processes, stochastic differential equations and Girsanov change of measure.', ['brownian'], ['jump', 'options', 'ml']],
  ['Time Series Momentum', 'Trend following across futures; moving average crossovers and managed futures funds.', ['trend'], ['meanrev', 'fx']],
  ['Pre-FOMC Announcement Drift', 'Equity returns rise ahead of FOMC announcements; the Federal Reserve and monetary policy.', ['rates'], ['fx', 'ml']],
  ['Risk Parity Portfolios and Diversification', 'Equal risk contribution across assets; covariance estimation, portfolio construction and drawdown control.', ['risk'], ['cot', 'ml']],
  ['Order Flow Imbalance and Price Impact in Limit Order Books', 'Order book depth, high frequency price impact and liquidity.', ['microstructure'], ['rates', 'fx']],
  ['Hidden Markov Models for Market Regimes', 'Regime switching with Viterbi decoding; bull and bear regimes.', ['regimes'], ['jump', 'options']],
  ['Gold as a Safe Haven', 'Gold and crude oil commodity futures; contango and the roll yield.', ['commodities'], ['fx', 'cot']],
  ['Predicting Returns with Gradient Boosting and Neural Networks', 'Machine learning, random forest and LSTM models of the cross-section.', ['ml'], ['regimes', 'brownian']],
  ['Statistical Arbitrage and Pairs Trading by Cointegration', 'Mean reversion of spreads and their half-life.', ['meanrev'], ['trend', 'ml']],
  // several tags
  ['Volatility-Managed Carry: Jump Risk and Regime Switching in Currency Returns', 'Carry returns in currency markets crash when volatility jumps. A regime switching model with a hidden Markov state times the exposure to the carry trade.', ['fx', 'volatility', 'jump', 'regimes'], ['cot', 'ml']],
  ['Trend Following and Dealer Gamma in Gold Futures', 'Trend following and momentum signals in gold futures are conditioned on dealer gamma exposure from gold options.', ['trend', 'options', 'commodities'], ['fx', 'ml']],
  // mentions in passing: no tag
  ['A Study of Equity Returns', 'We study the cross-section of stock returns. Momentum is mentioned once. Volatility is discussed in a footnote.', [], ['trend', 'volatility']],
  ['Carry Strategies in Currency Markets', 'The carry trade earns high returns. We compare it with momentum strategies and mention that options could hedge the crash risk.', ['fx'], ['trend', 'options', 'volatility', 'ml']],
  ['Stock Return Predictability', 'We test predictors of stock returns. Robustness checks include a machine learning benchmark and a regime dummy, reported in the appendix.', [], ['ml', 'regimes']],
];
t('auto tags on realistic synthetic titles and abstracts: the right tags, and none for passing mentions', () => {
  for (const [title, abstract, want, not] of CASES) {
    const got = keys(autoTags({ title, abstract }));
    for (const k of want) assert.ok(got.includes(k), `${title}: expected ${k}, got ${got}`);
    for (const k of not) assert.ok(!got.includes(k), `${title}: must not carry ${k}, got ${got}`);
    assert.ok(got.length <= 6);
  }
});
t('tags are deterministic, labelled, auto-sourced and capped at six', () => {
  const p = { title: 'Jump-Diffusion Option Pricing with Stochastic Volatility', abstract: CASES[0][1] };
  assert.deepEqual(autoTags(p), autoTags({ ...p })); for (const x of autoTags(p)) { assert.equal(x.source, 'auto'); assert.equal(x.label, TOPICS.find(q => q.key === x.key).label); }
  const everything = TOPICS.map(q => q.terms[0][0]).join(' ');
  assert.equal(autoTags({ title: everything, abstract: everything, text: everything }).length, 6);
  assert.deepEqual(autoTags({}), []); assert.deepEqual(autoTags(), []);
});
t('weights: the title is heavy, the abstract and notes medium, the full text light and capped', () => {
  const one = 'momentum';
  assert.ok(keys(autoTags({ title: 'Momentum' })).includes('trend'));
  assert.ok(!keys(autoTags({ abstract: one })).includes('trend'));                       // one mention in an abstract is not enough
  assert.ok(keys(autoTags({ abstract: `${one} ${one} ${one}` })).includes('trend'));     // three are
  assert.ok(keys(autoTags({ notes: { claim: `${one} ${one} ${one}` } })).includes('trend'));
  assert.ok(!keys(autoTags({ text: `${one} `.repeat(500) })).includes('trend'));         // full text alone can never tag (capped)
  assert.ok(!keys(autoTags({ abstract: `${one} ${one}` })).includes('trend')); assert.ok(keys(autoTags({ abstract: `${one} ${one}`, text: `${one} `.repeat(60) })).includes('trend')); // but it can tip two real mentions over; two alone stay out
  const sc = scoreTopics({ text: `${one} `.repeat(5000) }); assert.ok(sc.every(x => x.score <= 3));
  assert.ok(!keys(autoTags({ notes: { caveats: `${one} ${one} ${one} ${one}` } })).includes('trend')); // caveats are not read for tagging
});
t('manual overrides add and remove tags', () => {
  const tags = autoTags({ title: CASES[2][0], abstract: CASES[2][1] }), out = applyOverrides(tags, { add: ['ml', 'fx', 'nonsense'], remove: ['trend', 'rates'] });
  assert.deepEqual(out.find(x => x.key === 'ml'), { key: 'ml', label: 'Machine learning', source: 'manual' }); assert.equal(out.find(x => x.key === 'fx').source, 'manual');
  assert.ok(!out.some(x => x.key === 'nonsense'));
  const gone = applyOverrides(tags, { remove: ['fx'] }); assert.ok(!gone.some(x => x.key === 'fx'));
  assert.equal(tags[0].source, 'auto'); // the input is not changed
  assert.deepEqual(applyOverrides(tags, {}), tags); assert.deepEqual(applyOverrides(null, { add: ['ml'] }).map(x => x.key), ['ml']);
});

// ── joinCatalog ──
const note = { claim: 'Carry earns a premium that crashes in funding stress.', mechanism: 'levered investors unwind', data: 'G10, 1990-2012', method: 'portfolio sorts', effect: '5% a year', outOfSample: 'holds', costs: 'survives', relevance: 'high', stance: 'supports', caveats: 'short sample', testHere: 'sort G10 on forward points', crossRefs: [] };
const stored = [
  { id: 'doi:10.2139/ssrn.111111', title: 'Carry Trades and Currency Crash Risk', authors: ['A. Writer'], year: 2012, venue: 'SSRN', url: 'https://x', ssrn: '111111', doi: '10.2139/ssrn.111111', kind: 'paper', readFrom: 'upload (pdf)', abstract: 'Currency carry and crash risk in exchange rates.', notes: note, uploaded: { name: 'ssrn-111111.pdf', bytes: 1000, chars: 90000, at: '2026-11-08T00:10:00Z', stored: 'r2', sha: 'sha-aaa' } },
  { id: 'arxiv:2001.00001', title: 'Dealer Gamma Exposure and Intraday Index Returns', authors: [], year: 2020, kind: 'paper', readFrom: 'abstract', abstract: 'Market makers hedging short gamma amplify moves in option markets.', notes: { claim: 'Short gamma widens ranges.' } },
  { id: 'doi:10.0/pdf', title: 'Pairs trading by cointegration', year: 2015, readFrom: 'pdf', abstract: '', notes: { claim: 'x' } },
];
const queue = [
  { id: 'doi:10.2139/ssrn.111111', title: 'x', status: 'done', upload: { name: 'ssrn-111111.pdf', bytes: 1000, chars: 90000, at: '2026-11-08T00:10:00Z', stored: 'r2', sha: 'sha-aaa' } },
  { id: 'upload:ab12', title: 'ssrn-id999999.pdf', status: 'pending', upload: { name: 'SSRN-id999999.pdf', bytes: 5000, chars: 120000, at: '2026-11-08T01:00:00Z', stored: 'r2', sha: 'sha-bbb' } },
  { id: 'upload:cd34', title: 'copy.pdf', status: 'pending', upload: { name: 'copy.pdf', bytes: 1000, chars: 90000, at: '2026-11-08T02:00:00Z', stored: 'r2', sha: 'sha-aaa' } },   // same file as the matched upload
  { id: 'upload:ef56', title: 'dup.pdf', status: 'pending', upload: { name: 'dup.pdf', bytes: 5000, chars: 120000, at: '2026-11-08T03:00:00Z', stored: 'r2', sha: 'sha-bbb' } },    // same file as upload:ab12
  { id: 'upload:gh78', title: 'noname.pdf', status: 'pending', upload: { name: 'noname.pdf', bytes: 5000, chars: 0, at: '2026-11-07T03:00:00Z', stored: null, sha: 'sha-ccc' } },
  { id: 'qc:strategy-1', title: 'A QuantConnect strategy', status: 'pending' },   // no upload: not a held paper
];
const uploads = { 'upload:ab12': { chars: 120000, pages: 31, hasPdf: true, text: 'SSRN Electronic Journal\nHidden Markov Regimes in Currency Volatility\nAbstract. We fit a hidden Markov regime switching model to realized volatility.' }, 'doi:10.2139/ssrn.111111': { pages: 24, hasPdf: true } };
t('joinCatalog: read papers, abstract-only papers and unread uploads, de-duplicated, with the contract fields', () => {
  const cat = joinCatalog({ papers: stored, queueItems: queue, uploads, progress: { 'arxiv:2001.00001': { pct: 40, pos: 1200, at: 'T', done: false } },
    tagOverrides: { 'arxiv:2001.00001': { add: ['ml'], remove: [] } }, audio: { 'doi:10.2139/ssrn.111111': { briefing: { status: 'ready', secs: 300, error: null } } } });
  assert.deepEqual(cat.map(p => p.id).sort(), ['arxiv:2001.00001', 'doi:10.0/pdf', 'doi:10.2139/ssrn.111111', 'upload:ab12', 'upload:gh78']);
  const need = ['id', 'title', 'authors', 'year', 'venue', 'url', 'ssrn', 'arxiv', 'doi', 'kind', 'readFrom', 'hasText', 'hasPdf', 'chars', 'pages', 'uploadedAt', 'tags', 'notes', 'desk', 'progress', 'audio'];
  for (const p of cat) for (const k of need) assert.ok(k in p, `${p.id} lacks ${k}`);
  const by = Object.fromEntries(cat.map(p => [p.id, p]));
  const read = by['doi:10.2139/ssrn.111111']; assert.equal(read.hasText, true); assert.equal(read.hasPdf, true); assert.equal(read.chars, 90000); assert.equal(read.pages, 24); assert.equal(read.audio.briefing.status, 'ready'); assert.equal(read.audio.briefing.secs, 300);
  assert.equal(read.notes.claim, note.claim); assert.ok(!('crossRefs' in read.notes)); assert.ok(keys(read.tags).includes('fx')); assert.ok(read.desk.length > 0);
  const abs = by['arxiv:2001.00001']; assert.equal(abs.hasText, false); assert.equal(abs.hasPdf, false); assert.equal(abs.chars, null); assert.deepEqual(abs.progress, { pct: 40, pos: 1200, at: 'T', done: false });
  assert.ok(keys(abs.tags).includes('options')); assert.equal(abs.tags.find(x => x.key === 'ml').source, 'manual'); assert.deepEqual(abs.audio, { briefing: { status: 'none', secs: null, error: null } });
  assert.equal(by['doi:10.0/pdf'].hasText, true); assert.equal(by['doi:10.0/pdf'].hasPdf, false); assert.equal(by['doi:10.0/pdf'].progress, null);
  const un = by['upload:ab12']; assert.equal(un.title, 'Hidden Markov Regimes in Currency Volatility'); assert.equal(un.notes, null); assert.equal(un.hasText, true); assert.equal(un.hasPdf, true);
  assert.equal(un.chars, 120000); assert.equal(un.pages, 31); assert.equal(un.ssrn, '999999'); assert.equal(un.uploadedAt, '2026-11-08T01:00:00Z'); assert.ok(keys(un.tags).includes('regimes'));
  const nameless = by['upload:gh78']; assert.equal(nameless.title, 'noname'); assert.equal(nameless.hasText, false); assert.equal(nameless.hasPdf, false);
});
t('joinCatalog: tolerates empty input, array-shaped uploads, and does not mutate its input', () => {
  assert.deepEqual(joinCatalog(), []); assert.deepEqual(joinCatalog({ papers: null, queueItems: null }), []);
  const frozen = JSON.stringify({ stored, queue }), ups = [{ id: 'upload:ab12', chars: 5, pages: 2, text: 'A Title About Order Flow Imbalance In Futures' }];
  const cat = joinCatalog({ papers: stored, queueItems: queue, uploads: ups });
  assert.equal(JSON.stringify({ stored, queue }), frozen);
  assert.equal(cat.find(p => p.id === 'upload:ab12').title, 'A Title About Order Flow Imbalance In Futures');
});
t('topicCounts counts every topic, zeros included', () => {
  const cat = joinCatalog({ papers: stored, queueItems: queue, uploads }), tc = topicCounts(cat);
  assert.equal(tc.length, 15); assert.deepEqual(tc.map(x => x.key), TOPIC_KEYS);
  assert.equal(tc.find(x => x.key === 'fx').count >= 1, true); assert.equal(tc.find(x => x.key === 'options').count, 1); assert.equal(tc.find(x => x.key === 'ml').count, 0);
  assert.deepEqual(topicCounts([]).map(x => x.count), Array(15).fill(0));
});

// ── search ──
const DOCS = [
  { id: 'a', title: 'Jump Detection in High Frequency Data', text: 'We test for jumps in intraday returns. The bipower variation test separates jumps from continuous volatility. Many sentences follow about nothing in particular. Jumps cluster around announcements.' },
  { id: 'b', title: 'Carry Trades', text: 'The carry trade borrows low yielding currencies. Funding liquidity matters. A momentum overlay is discussed. Volatility rises when carry unwinds, and jumps in the exchange rate follow.' },
  { id: 'c', title: 'Dealer Hedging', text: 'Dealers hedge short gamma by selling into falls. Market makers hedging flows amplify moves. The hedging of option inventory is studied. Delta hedging is rebalanced hourly.' },
  { id: 'd', title: 'Mean Reversion Study', text: 'Mean reversion of spreads is slow. The half life is long. Pairs are formed by distance.', tags: ['meanrev'] },
];
t('search: ranks by BM25 with title boost, light stemming, stop words, and returns snippets with marks', () => {
  const ix = buildIndex(DOCS), r = search(ix, 'jumps');
  assert.equal(r.mode, 'and'); assert.deepEqual(r.hits.map(h => h.id), ['a', 'b']); assert.equal(r.total, 2);
  const h = r.hits[0]; assert.equal(h.title, 'Jump Detection in High Frequency Data'); assert.ok(h.score > r.hits[1].score);
  assert.ok(h.snippets.length >= 1 && h.snippets.length <= 3);
  for (const s of h.snippets) { assert.ok(s.text.length <= 260, s.text.length); assert.ok(s.marks.length >= 1); for (const [a, b] of s.marks) assert.match(s.text.slice(a, b).toLowerCase(), /jump/); }
  assert.deepEqual(search(ix, 'hedging').hits.map(x => x.id), ['c']); assert.deepEqual(search(ix, 'hedge').hits.map(x => x.id), ['c']);   // stemmed
  assert.deepEqual(search(ix, 'the of and').hits, []); assert.deepEqual(search(ix, '').hits, []);                                          // stop words only
  assert.deepEqual(search(buildIndex([]), 'jump').hits, []);
});
t('search: AND semantics with a fallback to OR; quoted phrases earn a bonus; tags filter', () => {
  const ix = buildIndex(DOCS);
  assert.deepEqual(search(ix, 'carry momentum').hits.map(x => x.id), ['b']);
  const or = search(ix, 'jumps gamma'); assert.equal(or.mode, 'or'); assert.deepEqual(or.hits.map(x => x.id).sort(), ['a', 'b', 'c']);
  const ph = buildIndex([{ id: 'p', title: 'x', text: 'half life of the spread is long. mean reversion is fast.' }, { id: 'q', title: 'y', text: 'The reversion of the mean is studied; a half and a life apart. ' }]);
  assert.equal(search(ph, 'mean reversion').hits.length, 2);
  assert.equal(search(ph, '"mean reversion"').hits[0].id, 'p'); assert.ok(search(ph, '"mean reversion"').hits[0].score > search(ph, 'mean reversion').hits[0].score);
  assert.deepEqual(search(ix, 'mean', { tags: ['meanrev'] }).hits.map(x => x.id), ['d']); assert.deepEqual(search(ix, 'mean', { tags: ['ml'] }).hits, []);
  assert.equal(search(ix, 'hedging', { limit: 1 }).hits.length, 1); assert.deepEqual(search(ix, 'jumps', { snippets: false }).hits[0].snippets, []);
  assert.deepEqual(parseQuery('"half life" of Mean-Reversion').phrases, [['half', 'life']]);
});
t('search: addDoc, removeDoc and replacement keep the index consistent', () => {
  const ix = buildIndex(DOCS); assert.equal(indexSize(ix), 4);
  addDoc(ix, { id: 'e', title: 'Order Flow Toxicity', text: 'VPIN measures order flow toxicity.' }); assert.deepEqual(search(ix, 'toxicity').hits.map(x => x.id), ['e']);
  addDoc(ix, { id: 'e', title: 'Order Flow', text: 'Imbalance of the order flow.' }); assert.deepEqual(search(ix, 'toxicity').hits, []); assert.deepEqual(search(ix, 'imbalance').hits.map(x => x.id), ['e']); assert.equal(indexSize(ix), 5);
  assert.equal(removeDoc(ix, 'e'), true); assert.equal(removeDoc(ix, 'e'), false); assert.deepEqual(search(ix, 'imbalance').hits, []); assert.equal(indexSize(ix), 4);
  removeDoc(ix, 'a'); assert.deepEqual(search(ix, 'jumps').hits.map(x => x.id), ['b']);
  setDocTags(ix, 'b', [{ key: 'fx' }]); assert.deepEqual(search(ix, 'carry', { tags: ['fx'] }).hits.map(x => x.id), ['b']);
  for (const d of DOCS) removeDoc(ix, d.id); assert.equal(indexSize(ix), 0); assert.equal(ix.post.size, 0); assert.equal(ix.totalLen, 0);
});
// a deterministic synthetic corpus: Zipf-ish vocabulary of made-up words, 250 papers x 300k characters
const corpus = (docs, chars, seed = 7) => {
  let s = seed; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const vocab = Array.from({ length: 20000 }, (_, i) => `w${((i + 1) * 2654435761 >>> 0).toString(36)}`), fin = ['volatility', 'carry', 'jump', 'gamma', 'momentum', 'regime', 'dealer', 'futures', 'spread', 'hedge'];
  const out = [];
  for (let d = 0; d < docs; d++) {
    const parts = []; let len = 0;
    while (len < chars) { const w = rnd() < 0.02 ? fin[Math.floor(rnd() * fin.length)] : vocab[Math.floor(vocab.length * rnd() ** 3)]; parts.push(w); len += w.length + 1; if (parts.length % 12 === 0) { parts.push(`${w}.`); len += w.length + 2; } }
    out.push({ id: `p${d}`, title: `Synthetic paper ${d} on ${fin[d % fin.length]} and ${fin[(d * 3 + 1) % fin.length]}`, text: parts.join(' ') });
  }
  return out;
};
t('search: 250 papers x 300k characters indexes and answers quickly', () => {
  const docs = corpus(250, 300_000); let t0 = performance.now(); const ix = buildIndex(docs); const indexMs = performance.now() - t0;
  const qs = ['volatility', 'carry jump', '"dealer gamma"', 'momentum regime hedge', 'zzzzqqqq'], times = [];
  for (const q of qs) { t0 = performance.now(); const r = search(ix, q, { limit: 40 }); times.push(performance.now() - t0); if (q !== 'zzzzqqqq') assert.ok(r.hits.length > 0, q); }
  t0 = performance.now(); addDoc(ix, { id: 'new', title: 'Fresh upload on gamma', text: docs[0].text }); const addMs = performance.now() - t0; removeDoc(ix, 'new');
  console.log(`  search corpus 250 x 300k chars: index ${Math.round(indexMs)} ms, add one paper ${Math.round(addMs)} ms, queries ${times.map(x => `${Math.round(x)}`).join('/')} ms`);
  assert.ok(indexMs < 60_000, `index ${indexMs}`); for (const x of times) assert.ok(x < 1500, `query ${x} ms`);
});

// ── desk links ──
const ev = new Map(DESK_EVIDENCE.map(e => [e.id, e]));
const link = (title, abstract) => deskLinks({ title, abstract, tags: autoTags({ title, abstract }) });
t('deskLinks: related Evidence Book entries, strongest first, at most five, the entries\' own verdicts', () => {
  const verdicts = new Set(DESK_EVIDENCE.map(e => e.verdict));
  const probes = [
    link('Carry Trades and Currency Crash Risk', CASES[2][1]),
    link('Jump-Diffusion Models and Detecting Jumps in High-Frequency Returns', 'Jumps in intraday returns; bipower variation tests detect jumps.'),
    link('Dealer Gamma Exposure and Intraday Index Returns', CASES[4][1]),
    link('Do Speculators Predict Currency Returns? Commitments of Traders', CASES[3][1]),
    link('The Probability of Backtest Overfitting', CASES[5][1]),
    link('Hidden Markov Models for Market Regimes', CASES[11][1]),
    link('Pre-FOMC Announcement Drift', CASES[8][1]),
  ];
  for (const l of probes) { assert.ok(l.length >= 1 && l.length <= 5); for (const x of l) { const e = ev.get(x.id); assert.ok(e, `unknown entry ${x.id}`); assert.equal(x.verdict, e.verdict); assert.equal(x.claim, e.claim); assert.ok(verdicts.has(x.verdict)); assert.deepEqual(Object.keys(x), ['id', 'verdict', 'claim']); } assert.equal(new Set(l.map(x => x.id)).size, l.length); }
  assert.equal(probes[0][0].id, 'fx-factor-carry'); assert.ok(probes[0].some(x => /carry/.test(x.id)));
  assert.ok(probes[1].some(x => x.id === 'jump-diffusion') && probes[1].every(x => /jump/i.test(`${x.id} ${x.claim}`)));
  assert.ok(probes[2].slice(0, 3).every(x => /^gex|gamma/.test(x.id)), probes[2].map(x => x.id).join());
  assert.ok(probes[3].slice(0, 2).every(x => /cot/.test(x.id)), probes[3].map(x => x.id).join());
  assert.ok(probes[4].some(x => /backtest|lookahead/.test(x.id)));
  assert.equal(probes[5][0].id, 'gr-hmm-trend-direction');
  assert.ok(probes[6].some(x => /fomc/.test(x.id)));
});
t('deskLinks: nothing related gives nothing; it never links without a shared term, never invents a verdict', () => {
  assert.deepEqual(deskLinks(null), []); assert.deepEqual(deskLinks({ title: 'Quantum Chromodynamics of Cheese', abstract: 'lattice gauge theory' }), []);
  assert.deepEqual(deskLinks({ title: 'Carry', abstract: '' }, []), []);
  const filler = Array.from({ length: 12 }, (_, i) => ({ id: `filler-${i}-cheese`, domain: 'misc', verdict: 'null', claim: `cheese number ${i} melts` })), fake = [...filler, { id: 'x-carry', domain: 'macro', verdict: 'validated', claim: 'carry pays' }, { id: 'no-verdict-carry', claim: 'carry pays too' }];
  assert.deepEqual(deskLinks({ title: 'Carry trades', abstract: 'carry' }, fake).map(x => x.id), ['x-carry']);   // an entry with no verdict is never shown
  for (const k of ['volatility', 'momentum', 'cointegration', 'order flow', 'risk parity', 'gold', 'neural network']) assert.ok(deskLinks({ title: `Notes on ${k}`, abstract: `${k} ${k}` }).length <= 5);
});

// ── theory links ──
const lessonDir = join(root, 'theory-lab', 'lessons'), lessonFiles = readdirSync(lessonDir);
t('theoryLinks: every linked lesson exists in theory-lab/lessons', () => {
  assert.ok(lessonFiles.length > 100);
  for (const k of TOPIC_KEYS) { assert.ok(THEORY_BY_TOPIC[k]?.length >= 3, `${k} has few lessons`); for (const s of THEORY_BY_TOPIC[k]) { assert.ok(existsSync(join(lessonDir, `${s}.html`)), `${k}: ${s}.html missing`); assert.ok(!/-micro$/.test(s)); } }
  for (const [title, abstract] of CASES) { const l = theoryLinks(autoTags({ title, abstract }), lessonFiles); assert.ok(l.length <= 4); for (const s of l) assert.ok(existsSync(join(lessonDir, `${s}.html`)), s); }
});
t('theoryLinks: best lesson per tag first, up to four, only existing lessons', () => {
  assert.deepEqual(theoryLinks(['brownian']), ['ito-lemma', 'fractional-brownian-motion', 'girsanov-risk-neutral', 'sde-numerical-schemes']);
  assert.deepEqual(theoryLinks([{ key: 'jump' }, { key: 'volatility' }]), ['institutional-jump-detection-tests', 'garch-volatility', 'merton-jump-diffusion', 'institutional-har-rv']);
  assert.deepEqual(theoryLinks(['volatility'], ['garch-volatility.html', 'heston-model.html']), ['garch-volatility', 'heston-model']);
  assert.deepEqual(theoryLinks(['volatility'], ['unrelated.html']), []); assert.deepEqual(theoryLinks([]), []); assert.deepEqual(theoryLinks(['nonsense']), []);
  assert.equal(theoryLinks(TOPIC_KEYS).length, 4);
});

// ── the to-get list ──
const todoMd = readFileSync(join(root, 'education', 'papers', 'SSRN_DOWNLOAD_LIST.md'), 'utf8');
t('parseTodoList: the real SSRN_DOWNLOAD_LIST.md', () => {
  const all = parseTodoList(todoMd), downloads = (todoMd.match(/\]\([^)]*abstractid=/g) ?? []).length;
  assert.equal(all.length, downloads); assert.ok(all.length >= 170);
  assert.equal(new Set(all.map(x => x.id)).size, all.length);
  const parts = {}; for (const x of all) parts[x.part] = (parts[x.part] ?? 0) + 1;
  assert.deepEqual(Object.keys(parts), ['1', '2', '3', '4']); assert.ok(parts[1] >= 47 && parts[2] >= 46 && parts[3] >= 1 && parts[4] >= 76, JSON.stringify(parts));
  assert.deepEqual(all[0], { id: '2227387', title: 'The Returns to Carry and Momentum Strategies', year: 2013, part: 1, section: null, url: 'https://papers.ssrn.com/sol3/Delivery.cfm?abstractid=2227387', held: false });
  const carry = all.find(x => x.id === '2632697'); assert.equal(carry.title, 'Carry'); assert.equal(carry.part, 2); assert.equal(carry.section, 'FX & carry'); assert.equal(carry.year, 2015);   // the star is dropped
  for (const x of all) { assert.match(x.id, /^\d{4,8}$/); assert.ok(x.title.length > 3 && !/^[·★]/.test(x.title), x.title); assert.match(x.url, /^https:\/\/papers\.ssrn\.com\/.*abstractid=\d+/); assert.ok(x.year >= 1990 && x.year <= 2027, `${x.id} ${x.year}`); assert.equal(x.held, false); }
  assert.deepEqual(all.map(x => x.part), [...all.map(x => x.part)].sort((a, b) => a - b));   // file order, parts ascending
  console.log(`  to-get list: ${all.length} items, by part ${JSON.stringify(parts)}`);
});
t('parseTodoList: held ids are marked (numbers, ssrn: and doi: forms), duplicates dropped, order kept', () => {
  const all = parseTodoList(todoMd), held = parseTodoList(todoMd, ['2227387', 'ssrn:2632697', 'doi:10.2139/ssrn.2768207', '999']);
  assert.deepEqual(held.filter(x => x.held).map(x => x.id), ['2227387', '2768207', '2632697'].sort((a, b) => all.findIndex(x => x.id === a) - all.findIndex(x => x.id === b)));
  assert.deepEqual(held.map(x => x.id), all.map(x => x.id));
  const md = '## Part 2: x\n### FX\n| Paper | Year | D |\n|---|---|---|\n| ★ A · B C | 2020 | [download](https://papers.ssrn.com/sol3/Delivery.cfm?abstractid=123456) · [page](u) |\n| A again · B C | 2020 | [download](https://papers.ssrn.com/sol3/Delivery.cfm?abstractid=123456) |\n| No link · Z | 2019 | none |\n';
  assert.deepEqual(parseTodoList(md, new Set(['123456'])), [{ id: '123456', title: 'A', year: 2020, part: 2, section: 'FX', url: 'https://papers.ssrn.com/sol3/Delivery.cfm?abstractid=123456', held: true }]);
  assert.deepEqual(parseTodoList(''), []); assert.deepEqual(parseTodoList(null), []);
  assert.deepEqual([...heldSsrnIds([{ id: 'doi:10.2139/ssrn.899976', ssrn: '899976' }, { id: 'upload:x', uploaded: { name: 'SSRN-id2227387.pdf' } }, { id: 'arxiv:1' }], [{ id: 'upload:q', upload: { name: 'ssrn-3057973.pdf' } }])].sort(), ['2227387', '3057973', '899976']);
});

// ── read next ──
const mk = (id, title, extra = {}) => ({ id, title, tags: autoTags({ title }), hasText: true, uploadedAt: '2026-11-01T00:00:00Z', progress: null, ...extra });
const rnPapers = [mk('p-carry', 'Carry Trades and Currency Crash Risk'), mk('p-jump', 'Jump Detection in High Frequency Returns', { uploadedAt: '2026-11-05T00:00:00Z' }), mk('p-gold', 'Gold as a Safe Haven'),
  mk('p-read', 'Carry and Currency Momentum', { progress: { pct: 100, done: true } }), mk('p-new', 'Notes on Cheese', { uploadedAt: '2026-11-07T00:00:00Z' })];
const rnCases = [{ id: 'c1', status: 'open', title: 'Does carry predict FX returns', question: 'Does currency carry predict FX returns after costs?' }, { id: 'c2', status: 'closed', title: 'Gold jump question', question: 'Do jumps in gold matter?' },
  { id: 'c3', status: 'parked', title: 'parked', question: 'jump jump jump' }];
t('readNext: unread papers ranked by overlap with the open cases, falling back to recent uploads', () => {
  const r = readNext({ papers: rnPapers, cases: rnCases }, { n: 3 });
  assert.equal(r.ids[0], 'p-carry'); assert.equal(r.why['p-carry'], 'matches open case "Does carry predict FX returns"');
  assert.ok(!r.ids.includes('p-read'));
  assert.ok(Object.entries(r.why).every(([id, w]) => id === 'p-carry' || w === 'most recent upload'));   // only OPEN cases count: closed and parked ones match nothing
  assert.equal(r.ids.length, 3); assert.deepEqual(r.ids.slice(1), ['p-new', 'p-jump']);
  const none = readNext({ papers: rnPapers, cases: [] }); assert.deepEqual(none.ids, ['p-new', 'p-jump', 'p-carry', 'p-gold']); assert.ok(Object.values(none.why).every(w => w === 'most recent upload'));
  assert.deepEqual(readNext({ papers: rnPapers, cases: { cases: rnCases } }, { n: 1 }).ids, ['p-carry']);                         // a case store works too
  assert.ok(!readNext({ papers: rnPapers, cases: [], progress: { 'p-new': { pct: 3 } } }).ids.includes('p-new'));                  // progress passed separately
  assert.deepEqual(readNext(), { ids: [], why: {} }); assert.deepEqual(readNext({ papers: [rnPapers[3]] }), { ids: [], why: {} });
});

// ── a case from a paper ──
t('caseFromPaper: a free research case whose question is the title and claim, carrying the paper block', () => {
  const [p] = joinCatalog({ papers: [stored[0]], queueItems: [], uploads });
  const c = caseFromPaper(p, { now: '2026-11-08T12:00:00Z' });
  assert.equal(c.id, 'case-paper-doi-10-2139-ssrn-111111'); assert.equal(c.id, paperCaseId(p.id)); assert.equal(c.origin, 'paper'); assert.equal(c.status, 'open'); assert.deepEqual(c.rounds, []); assert.deepEqual(c.reviews, []);
  assert.equal(c.question, `Carry Trades and Currency Crash Risk: ${note.claim}`); assert.equal(c.date, '2026-11-08'); assert.equal(c.createdAt, '2026-11-08T12:00:00Z'); assert.equal(c.paperId, p.id);
  assert.deepEqual(c.paper.notes, { claim: note.claim, mechanism: note.mechanism, data: note.data, method: note.method, effect: note.effect, outOfSample: note.outOfSample, costs: note.costs, caveats: note.caveats, testHere: note.testHere, stance: note.stance });
  assert.ok(c.paper.tags.includes('FX & carry')); assert.equal(c.paper.title, p.title);
  assert.deepEqual(caseFromPaper(p, { now: '2026-11-08T12:00:00Z' }), c);                                                          // deterministic (idempotent id and content)
  const store = putCase(putCase(emptyStore(), c), caseFromPaper(p, { now: '2026-11-08T13:00:00Z' })); assert.equal(store.cases.length, 1); assert.equal(caseForPaper(store, p.id).id, c.id); assert.equal(caseForPaper(store, 'zzz'), null);
  assert.equal(summary(c).paperId, p.id); assert.equal(summary(c).origin, 'paper');
  const rs = Object.fromEntries(roundSections(c, 'quant')), hs = Object.fromEntries(headSections(c));
  for (const sec of [rs, hs]) { const k = Object.keys(sec).find(x => /^The paper this case started from/.test(x)); assert.ok(k); assert.match(sec[k], /Claim: Carry earns a premium/); assert.match(sec[k], /How to test it here: sort G10/); }
});
t('caseFromPaper: an unread paper uses its abstract; no id throws; no model is involved', () => {
  const [abs] = joinCatalog({ papers: [stored[1]] }), c = caseFromPaper(abs, { now: '2026-11-08T12:00:00Z' });
  assert.equal(c.question, 'Dealer Gamma Exposure and Intraday Index Returns: Short gamma widens ranges.');
  const u = joinCatalog({ papers: [], queueItems: queue, uploads }).find(x => x.id === 'upload:ab12'), cu = caseFromPaper(u, { now: '2026-11-08T12:00:00Z' });
  assert.equal(cu.question, 'Hidden Markov Regimes in Currency Volatility'); assert.equal(cu.paper.notes, null); assert.match(roundSections(cu, 'flow')[1][1], /not read this paper yet/);
  assert.throws(() => caseFromPaper({ title: 'x' }), /id/);
  assert.equal(JSON.stringify(c).includes('model'), false);
});
t('no network, no model: the module imports nothing but pure data modules', () => {
  const src = readFileSync(join(here, 'paperCatalog.js'), 'utf8');
  assert.deepEqual([...src.matchAll(/^import .* from '(.*)';/gm)].map(m => m[1]).sort(), ['./deskEvidence.js', './literature.js', './researchCase.js']);
  assert.ok(!/\bfetch\(|XMLHttpRequest|process\.env|node:/.test(src));
});

// ── source ──
t('sourceOf: each production queue source value, and the precedence', () => {
  const k = r => sourceOf(r).key;
  assert.equal(k({ queueSource: '151 Trading Strategies (Kakushadze & Serur 2018)' }), 'k151');
  assert.equal(k({ queueSource: 'QuantConnect strategy library', url: 'https://www.quantconnect.com/learning/x' }), 'quantconnect');
  assert.equal(k({ queueSource: '151 Trading Strategies (Kakushadze & Serur 2018)', ssrn: '3167017' }), 'k151'); // curated collection beats the id
  assert.equal(k({ queueSource: 'SSRN manifest' }), 'ssrn');
  assert.equal(k({ queueSource: 'SSRN manifest', url: 'https://www.nber.org/papers/w1' }), 'nber'); // a host is more specific than the manifest
  assert.equal(k({ queueSource: 'reading list' }), 'reading');
  assert.equal(k({ queueSource: 'reading list', arxiv: '2001.00001' }), 'arxiv');
  assert.equal(k({ queueSource: 'upload', readFrom: 'upload (unread)' }), 'upload');
  assert.equal(k({ queueSource: 'upload', uploadName: 'SSRN-id3167017.pdf' }), 'ssrn');
  assert.equal(k({ queueSource: 'upload', uploadName: '2001.00001v2.pdf' }), 'arxiv');
  assert.equal(k({ queueSource: 'upload', uploadName: 'My notes on carry.pdf' }), 'upload');
  assert.equal(k({}), 'other'); assert.equal(k(null), 'other'); assert.equal(k({ queueSource: 'something new' }), 'other');
  assert.deepEqual(sourceOf({ queueSource: 'upload' }), { key: 'upload', label: 'Other upload' });
});
t('sourceOf: ids, DOI prefix, url host and venue', () => {
  const k = r => sourceOf(r).key;
  assert.equal(k({ ssrn: '123456' }), 'ssrn'); assert.equal(k({ arxiv: '1706.03762' }), 'arxiv');
  assert.equal(k({ doi: '10.2139/ssrn.3167017' }), 'ssrn'); assert.equal(k({ doi: '10.48550/arXiv.2001.00001' }), 'arxiv'); assert.equal(k({ doi: '10.3386/w12345' }), 'nber');
  assert.equal(k({ doi: '10.1111/jofi.12345' }), 'other');
  for (const [url, want] of [['https://arxiv.org/abs/1', 'arxiv'], ['https://www.nber.org/papers/w1', 'nber'], ['https://www.federalreserve.gov/econres/feds/x.htm', 'fed'],
    ['https://www.newyorkfed.org/research/staff_reports/sr1', 'fed'], ['https://www.ecb.europa.eu/pub/pdf/scpwps/ecb.wp1.pdf', 'ecb'],
    ['https://www.bankofengland.co.uk/working-paper/2020/x', 'boe'], ['https://www.bis.org/publ/work1.htm', 'bis'], ['https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1', 'ssrn'],
    ['https://notarxiv.org/x', 'other'], ['not a url', 'other']]) assert.equal(k({ url }), want, url);
  assert.equal(k({ venue: 'NBER Working Paper 12345' }), 'nber'); assert.equal(k({ venue: 'Federal Reserve Bank of New York Staff Reports' }), 'fed');
  assert.equal(k({ venue: 'ECB Working Paper Series' }), 'ecb'); assert.equal(k({ venue: 'Bank of England Staff Working Paper' }), 'boe');
  assert.equal(k({ venue: 'Journal of Finance' }), 'other'); assert.equal(k({ venue: 'Synthetic Journal' }), 'other');
  assert.ok(SOURCES.every(s => s.key && s.label) && new Set(SOURCES.map(s => s.key)).size === SOURCES.length);
});
t('joinCatalog puts a source on every paper and sourceCounts counts them', () => {
  const cat = joinCatalog({
    papers: [{ id: 'a', title: 'A', url: 'https://www.ecb.europa.eu/x.pdf' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C', ssrn: '1' }],
    queueItems: [{ id: 'b', source: '151 Trading Strategies (Kakushadze & Serur 2018)' }, { id: 'u1', source: 'upload', upload: { name: 'SSRN-id3167017.pdf', sha: 'x1', chars: 10 } }, { id: 'u2', source: 'upload', upload: { name: 'notes.pdf', sha: 'x2', chars: 10 } }],
  });
  const by = Object.fromEntries(cat.map(p => [p.id, p.source.key]));
  assert.deepEqual(by, { a: 'ecb', b: 'k151', c: 'ssrn', u1: 'ssrn', u2: 'upload' });
  assert.deepEqual(sourceCounts(cat).map(s => [s.key, s.count]), [['ssrn', 2], ['ecb', 1], ['k151', 1], ['upload', 1]]);
  assert.deepEqual(sourceCounts(null), []);
});

t('free-paper manifest: uploads named "<Title> (<year>).pdf" take the source of the matching entry', () => {
  assert.equal(normTitle('Bayesian Online Changepoint Detection (2007).pdf'), normTitle('Bayesian online changepoint detection'));
  const entries = [
    { title: 'Bayesian Online Changepoint Detection', year: 2007, source: 'arXiv', url: 'https://arxiv.org/pdf/0710.3742', doi: 'arXiv:0710.3742v1' },
    { title: 'A Synthetic NBER Working Paper On Carry', year: 2010, source: 'NBER', url: 'https://www.nber.org/papers/w123' },
    { title: 'A Synthetic Fed Note On Liquidity Effects', year: 2012, source: 'NY Fed', url: 'https://www.newyorkfed.org/medialibrary/x.pdf' },
    { title: 'A Synthetic Bank Of England Paper On Gilts', year: 2015, source: 'Bank of England', url: 'https://www.bankofengland.co.uk/x.pdf' },
    { title: 'A Synthetic ECB Paper On Euro Money Markets', year: 2016, source: 'ECB', url: 'https://www.ecb.europa.eu/x.pdf' },
    { title: 'A Synthetic Author Page Paper On Rough Vol', year: 2018, source: 'Author/university repository (math.nyu.edu)', url: 'https://math.nyu.edu/~x/p.pdf' },
    { title: 'A Synthetic SSRN Paper Hosted By Author Site', year: 2019, source: 'Author/university repository (doi.org)', url: 'https://doi.org/10.2139/ssrn.3000000', doi: 'https://doi.org/10.2139/ssrn.3000000' },
    { title: 'A Synthetic Working Paper From RePEc Mirror', year: 2020, source: 'MPRA/RePEc', url: 'https://mpra.ub.uni-muenchen.de/1/' },
    { title: 'A Synthetic Paper With No Source Text At All', year: 2021, url: 'https://example.org/p.pdf' },
  ];
  const up = (id, name, extra = {}) => ({ id, source: 'upload', upload: { name, sha: id, chars: 10 }, ...extra });
  const cat = joinCatalog({ freeSources: entries, queueItems: [
    up('u1', 'Bayesian Online Changepoint Detection (2007).pdf'), up('u2', 'A Synthetic NBER Working Paper On Carry (2010).pdf'), up('u3', 'a-synthetic-fed-note-on-liquidity-effects.pdf'),
    up('u4', 'A Synthetic Bank Of England Paper On Gilts (2015).pdf'), up('u5', 'A Synthetic ECB Paper On Euro Money Markets (2016).pdf'),
    up('u6', 'A Synthetic Author Page Paper On Rough Vol (2018).pdf'), up('u7', 'A Synthetic SSRN Paper Hosted By Author Site (2019).pdf'),
    up('u8', 'A Synthetic Working Paper From RePEc Mirror (2020).pdf'), up('u9', 'A Synthetic Paper With No Source Text At All (2021).pdf'),
    up('u10', 'x.pdf', { title: 'Bayesian online changepoint detection' }), up('u11', 'Unlisted Paper (2022).pdf')] });
  const by = Object.fromEntries(cat.map(p => [p.id, p.source.key]));
  assert.deepEqual(by, { u1: 'arxiv', u2: 'nber', u3: 'fed', u4: 'boe', u5: 'ecb', u6: 'author', u7: 'ssrn', u8: 'mpra-repec', u9: 'other', u10: 'arxiv', u11: 'upload' });
  assert.equal(cat.find(p => p.id === 'u8').source.label, 'MPRA/RePEc');
  assert.ok(sourceCounts(cat).some(s => s.key === 'mpra-repec' && s.count === 1));
  assert.equal(joinCatalog({ queueItems: [up('z', 'Whatever (2020).pdf')], freeSources: null })[0].source.key, 'upload');
  assert.equal(freeLookup(null).size, 0); assert.equal(sourceOfManifest(null), null);
});
t('the real free_sources.json parses and every entry maps to a non-empty source', () => {
  const file = join(root, 'education', 'papers', 'free_sources.json');
  const entries = JSON.parse(readFileSync(file, 'utf8'));
  assert.ok(entries.length > 100);
  for (const e of entries) { assert.ok(e.title, 'title'); const s = sourceOfManifest(e); assert.ok(s && s.key && s.label, e.title); }
  assert.ok(freeLookup(entries).size > entries.length * 0.9);
});

// ── yearOf, year buckets ──
const NOW = Date.UTC(2026, 10, 8), yo = (r) => yearOf(r, { now: NOW });
t('yearOf: an explicit year wins over every other clue', () => {
  assert.deepEqual(yo({ year: 2015, arxiv: '2001.00001', uploadName: 'x (2010).pdf', text: 'Copyright 2019' }), { year: 2015, from: 'given' });
  assert.deepEqual(yo({ year: '2015' }), { year: 2015, from: 'given' });
  assert.deepEqual(yo({ manifestYear: 2011, uploadName: 'x (2010).pdf' }), { year: 2011, from: 'given' });
});
t('yearOf: arXiv ids, new style and old style, from the record or the file name', () => {
  assert.equal(arxivYear('2001.00001'), 2020); assert.equal(arxivYear('arXiv:1805.01234v3'), 2018); assert.equal(arxivYear('0704.0001'), 2007);
  assert.equal(arxivYear('hep-th/9901001'), 1999); assert.equal(arxivYear('math.PR/0601234'), 2006); assert.equal(arxivYear('q-fin/9105001'), 1991);
  assert.equal(arxivYear('2013.00001'), null);   // month 13
  assert.equal(arxivYear('0301.00001'), null);   // the yymm.nnnnn scheme did not exist before 2007
  assert.deepEqual(yo({ arxiv: '2001.00001', uploadName: 'x (2010).pdf' }), { year: 2020, from: 'arxiv' });
  assert.deepEqual(yo({ uploadName: '1805.01234v2.pdf' }), { year: 2018, from: 'arxiv' });
  assert.deepEqual(yo({ uploadName: 'hep-th_9901001.pdf' }), { year: 1999, from: 'arxiv' });
  assert.equal(yo({ uploadName: 'report 1234.56789 tables.pdf' }).from, null);   // month 34
  assert.equal(yo({ arxiv: '3001.00001' }).year, null);   // the future is never a release year
});
t('yearOf: a trailing (YYYY) in the file name, only when trailing', () => {
  assert.deepEqual(yo({ uploadName: 'Some Paper Title (2014).pdf' }), { year: 2014, from: 'filename' });
  assert.deepEqual(yo({ uploadName: 'Some Paper Title ( 1999 )' }), { year: 1999, from: 'filename' });
  assert.equal(yo({ uploadName: 'Study (2014) final version.pdf' }).year, null);
  assert.equal(yo({ uploadName: 'Some Paper (1850).pdf' }).year, null);   // out of range
  assert.deepEqual(yo({ uploadName: 'Some Paper (2014).pdf', text: 'Copyright 2019' }), { year: 2014, from: 'filename' });
});
t('yearOf: text rules by preference (copyright, working paper, month dates, bare year)', () => {
  assert.deepEqual(yo({ text: 'A Title\nSome Author\nCopyright 2019 by the authors\nWorking Paper, May 2021' }), { year: 2019, from: 'text' });
  assert.equal(yo({ text: 'Title\n© 2017 Elsevier' }).year, 2017);
  assert.equal(yo({ text: 'NBER WORKING PAPER SERIES\nTITLE\nWorking Paper 24567\nIssued April 2018' }).year, 2018);
  assert.equal(yo({ text: 'Title\nAuthor\nMarch 12, 2017\nAbstract We study' }).year, 2017);
  assert.equal(yo({ text: 'Draft 14 June 2021 comments welcome' }).year, 2021);
  assert.equal(yo({ text: 'First version: Sept 2009; this version: Jan 2012' }).year, 2009);
  assert.equal(yo({ text: 'Title\nAuthor, University\n2016\nAbstract We study' }).year, 2016);
});
t('yearOf: false-positive guards (periods, ranges, citations, references, out of range)', () => {
  assert.equal(yo({ text: 'Since 1987 the markets have changed.' }).year, null);
  assert.equal(yo({ text: 'We use data from 1990 to 2010 and from 1985-2005 and between 1995 and 2015.' }).year, null);
  assert.equal(yo({ text: 'As Fama (1993) and Smith and Jones, 1995 and Lo et al. 1999 show, in 1998 the market fell. See Fama 1993a.' }).year, null);
  assert.equal(yo({ text: 'Since January 1987 and in March 2020 the pandemic hit, from June 2001 until May 2004.' }).year, null);
  assert.equal(yo({ text: 'A paper with numbers 1850, 2099, 123456, $1,2019 and 19.2019 only.' }).year, null);
  assert.equal(yo({ text: 'Title and abstract with no date.\nReferences\nSmith, J. (2012). Published 2012. Copyright 2013' }).year, null);   // after the References heading
  assert.equal(yo({ text: 'Title\nIntro text since 1987.\n' + 'x'.repeat(3100) + '\nCopyright 2019' }).year, null);   // beyond the first 3000 characters
  assert.equal(yo({ text: 'Copyright 2031' }).year, null);   // future
});
t('yearOf: nothing found -> null, never invented', () => {
  assert.deepEqual(yo({}), { year: null, from: null }); assert.deepEqual(yo(null), { year: null, from: null });
  assert.deepEqual(yo({ uploadName: 'notes.pdf', text: 'No dates here at all.', uploadedAt: '2026-01-01' }), { year: null, from: null });
});
t('year buckets: keys, labels, order and counts', () => {
  assert.deepEqual([2026, 2022, 2021, 2020, 2019, 2010, 1995, 1990, 1989, 1950, null].map(y => yearKey(y, NOW)), ['2026', '2022', 'd2020', 'd2020', 'd2010', 'd2010', 'd1990', 'd1990', 'earlier', 'earlier', 'unknown']);
  const ps = [2026, 2025, 2025, 2021, 2020, 2015, 2012, 1995, 1980, null, null].map(year => ({ year }));
  assert.deepEqual(yearCounts(ps, NOW).map(b => [b.key, b.label, b.count]),
    [['2026', '2026', 1], ['2025', '2025', 2], ['d2020', '2020–21', 2], ['d2010', '2010s', 2], ['d1990', '1990s', 1], ['earlier', 'Earlier', 1], ['unknown', 'Unknown year', 2]]);
  assert.equal(yearCounts(ps, NOW).reduce((a, b) => a + b.count, 0), ps.length);
  assert.deepEqual(yearCounts([], NOW), []);
});
t('joinCatalog: unread uploads and read papers get year, yearFrom and yearKey', () => {
  const cat = joinCatalog({ now: NOW,
    papers: [{ id: 'r1', title: 'Read One', year: 2018, readFrom: 'pdf' }, { id: 'r2', title: 'Read Two No Year', readFrom: 'abstract', arxiv: '2105.01234' }],
    queueItems: [{ id: 'u1', upload: { name: 'A Study (2012).pdf', chars: 10 } }, { id: 'u2', upload: { name: 'b.pdf', chars: 10 } }, { id: 'u3', upload: { name: 'c.pdf', chars: 10 } }],
    uploads: { u2: { firstText: 'Title\nCopyright 2016 Someone' }, u3: { firstText: 'Title with since 1987 only' } } });
  const by = Object.fromEntries(cat.map(p => [p.id, [p.year, p.yearFrom, p.yearKey]]));
  assert.deepEqual(by, { r1: [2018, 'given', 'd2010'], r2: [2021, 'arxiv', 'd2020'], u1: [2012, 'filename', 'd2010'], u2: [2016, 'text', 'd2010'], u3: [null, null, 'unknown'] });
});

console.log(`paperCatalog: ${n} tests passed`);
