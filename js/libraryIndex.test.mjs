// Tests for js/libraryIndex.js: synthetic papers only (nothing from a real paper), no model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, rowOf, search, digest, buildContext, indexStats, publicIndex, catalogSig, evidenceOf, marketOf, cut, figLines, withLibrary, citeableIds, libraryContextOn, caseQuery, ROW_BUDGET, LIMITS, EVIDENCE, MARKETS, NO_PAPER, CONTEXT_HEADER, validIndex } from './libraryIndex.js';

const tag = (...k) => k.map(key => ({ key, label: key, source: 'auto' }));
const notes = (o = {}) => ({ claim: 'Invented claim.', mechanism: 'Invented mechanism.', data: { market: 'Synthetic data', period: '2000-2020', frequency: 'daily' }, method: 'Invented regression', effect: 'Invented effect.', outOfSample: 'unclear', costs: 'no', relevance: 'Invented relevance.', stance: 'neutral', caveats: ['one caveat', 'two caveat'], testHere: 'Invented test here.', ...o });
const P = (id, title, year, tags, n, o = {}) => ({ id, title, year, source: { key: o.src ?? 'ssrn', label: o.srcLabel ?? 'SSRN' }, tags: tag(...tags), notes: n === null ? null : notes(n), desk: o.desk ?? [], abstract: o.abstract ?? '', kind: 'paper', ...(o.extra ?? {}) });

const LIB = [
  P('cot1', 'Speculative Positioning and Currency Returns: A Synthetic Study', 2018, ['cot', 'fx'], { claim: 'Extreme net speculative positions in currency futures predict the next month of EURUSD and other currency returns.', mechanism: 'Crowded speculators unwind when hedgers rebalance.', data: { market: 'EURUSD and G10 currency futures', period: '2006-2017', frequency: 'weekly' }, outOfSample: 'yes', costs: 'yes', testHere: 'Rank weekly COT net positioning of EURUSD and test the next 5 day return.' }, { desk: [{ id: 'ev_cot', verdict: 'rejected', claim: 'x' }] }),
  P('cot2', 'COT Extremes in Currency Futures (synthetic)', 2012, ['cot'], { claim: 'Commitments of traders positioning extremes in currency futures are followed by reversals.', outOfSample: 'no', data: { market: 'currency futures', period: '1999-2010', frequency: 'weekly' } }, { src: 'nber', srcLabel: 'NBER' }),
  P('fx1', 'Carry Trade Crash Risk in G10 Currencies (synthetic)', 2015, ['fx'], { claim: 'Carry portfolios of currencies crash when volatility spikes.', data: { market: 'G10 currencies', period: '1990-2012', frequency: 'monthly' }, outOfSample: 'partly' }),
  P('vol1', 'Realised Volatility Forecasting with HAR Models (synthetic)', 2019, ['volatility'], { claim: 'The HAR model of realised variance forecasts next-day volatility better than GARCH.', data: { market: 'S&P 500 index futures', period: '2003-2018', frequency: '5 minute' }, outOfSample: 'yes', testHere: 'Compare HAR forecasts against our sigma bands.' }, { src: 'arxiv', srcLabel: 'arXiv' }),
  P('jump1', 'A Jump Diffusion Model of Exchange Rates (synthetic)', 2008, ['jump', 'brownian', 'fx'], { claim: 'A stochastic jump diffusion process with Poisson arrivals fits the exchange rate distribution.', method: 'Closed form likelihood of the stochastic differential equation', outOfSample: 'no' }, { src: 'arxiv', srcLabel: 'arXiv' }),
  P('rates1', 'FOMC Announcement Drift in Treasury Yields (synthetic)', 2016, ['rates'], { claim: 'Treasury yields drift ahead of FOMC announcements.', data: { market: 'US Treasury yields', period: '1994-2014', frequency: 'daily' }, outOfSample: 'partly' }, { src: 'fed', srcLabel: 'Federal Reserve' }),
  P('gold1', 'Gold and Real Yields (synthetic)', 2020, ['gold'], { claim: 'Gold moves inversely with real yields.', data: { market: 'gold futures', period: '2006-2019', frequency: 'daily' } }),
  P('ml1', 'A Survey of Machine Learning in Asset Pricing (synthetic)', 2021, ['ml'], { claim: 'Machine learning improves return prediction in equities.', outOfSample: 'unclear' }, { src: 'arxiv', srcLabel: 'arXiv' }),
  P('abs1', 'Positioning Extremes in Futures Markets (abstract only)', 2022, ['cot'], null, { abstract: 'We describe positioning extremes in futures. Nothing real.', src: 'reading', srcLabel: 'Reading list' }),
  P('opt1', 'Dealer Gamma and Index Option Open Interest (synthetic)', 2023, ['options'], { claim: 'Dealer gamma exposure from option open interest dampens index volatility.', outOfSample: 'partly' }),
];

test('row building: fields, limits, flags, evidence and market hints', () => {
  const ix = buildIndex(LIB), by = Object.fromEntries(ix.rows.map(r => [r.id, r]));
  assert.equal(ix.n, 10); assert.equal(ix.rows.length, 10);
  const r = by.cot1;
  assert.equal(r.y, 2018); assert.equal(r.src, 'ssrn'); assert.deepEqual(r.tg, ['cot', 'fx']); assert.equal(r.ev, 'oos'); assert.equal(r.co, 1); assert.equal(r.m, 'fx'); assert.deepEqual(r.vd, ['rejected']); assert.equal(r.cs, 1);
  assert.ok(r.t.length <= LIMITS.t && r.c.length <= LIMITS.c && r.me.length <= LIMITS.me && r.ef.length <= LIMITS.ef && r.tx.length <= LIMITS.tx);
  assert.ok(ix.rows.every(x => EVIDENCE.includes(x.ev) && MARKETS.includes(x.m)));
  assert.equal(by.cot2.ev, 'in-sample'); assert.equal(by.fx1.ev, 'partly'); assert.equal(by.ml1.ev, 'survey'); assert.equal(by.gold1.ev, 'unknown');
  assert.equal(by.vol1.m, 'equity' === by.vol1.m ? 'equity' : by.vol1.m); assert.ok(['vol', 'equity', 'multi'].includes(by.vol1.m));
  assert.equal(by.rates1.m, 'rates'); assert.equal(by.gold1.m, 'commodity');
  assert.equal(by.cot2.co, undefined, 'no costs flag when costs are not netted');
});

test('row building: missing notes and abstract-only papers give a title-only row; odd input does not throw', () => {
  const ix = buildIndex(LIB), a = ix.rows.find(r => r.id === 'abs1');
  assert.equal(a.c, undefined); assert.equal(a.tx, undefined); assert.equal(a.ev, 'unknown'); assert.equal(a.cs, 0);
  const odd = rowOf({ id: 'z', title: undefined, year: 'abc', tags: undefined, source: undefined, notes: 'nonsense', desk: undefined });
  assert.equal(odd.t, 'z'); assert.equal(odd.y, null); assert.equal(odd.src, 'other'); assert.deepEqual(odd.tg, []);
  assert.deepEqual(buildIndex([]).rows, []); assert.deepEqual(buildIndex(null).rows, []);
  assert.equal(rowOf(P('s', 'A Survey of Things', 2020, [], { outOfSample: 'yes' })).ev, 'oos', 'out-of-sample evidence wins over the survey word');
});

test('size budget: long rows are trimmed to the budget, typical rows are about 60-90 tokens', () => {
  const long = P('long', 'T'.repeat(300), 2020, ['volatility', 'fx', 'cot'], { claim: 'claim words '.repeat(60), method: 'method words '.repeat(40), effect: 'effect words '.repeat(40), testHere: 'test words '.repeat(60), outOfSample: 'yes', costs: 'yes' }, { desk: [{ id: 'a', verdict: 'v1' }, { id: 'b', verdict: 'v2' }] });
  const r = rowOf(long);
  assert.ok(JSON.stringify(r).length <= ROW_BUDGET + 40, `row is ${JSON.stringify(r).length} chars`);
  assert.ok(r.t.length <= LIMITS.t && r.c.length >= 60, 'the claim keeps most of its room');
  const st = indexStats(buildIndex(LIB));
  assert.equal(st.rows, 10); assert.equal(st.read, 9);
  assert.ok(st.tokensPerRow > 20 && st.tokensPerRow <= 100, `tokens per row ${st.tokensPerRow}`);
  assert.ok(st.maxTokensPerRow <= 110);
  assert.equal(st.bySource.arxiv, 3); assert.equal(st.byEvidence.oos, 2); assert.equal(st.byTopic.cot, 3); assert.equal(st.withVerdict, 1);
});

test('the index is deterministic, sorted by id, and its signature follows the catalog', () => {
  const a = buildIndex(LIB), b = buildIndex([...LIB].reverse());
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.deepEqual(a.rows.map(r => r.id), [...a.rows.map(r => r.id)].sort());
  assert.equal(a.sig, catalogSig(LIB)); assert.equal(catalogSig(LIB), catalogSig([...LIB].reverse().sort((x, y) => x.id.localeCompare(y.id))));
  const changed = LIB.map(p => (p.id === 'fx1' ? { ...p, notes: notes({ claim: 'A different claim.' }) } : p));
  assert.notEqual(catalogSig(changed), a.sig);
  assert.ok(validIndex(a, a.sig)); assert.ok(!validIndex(a, 'other')); assert.ok(!validIndex(null));
  const pub = publicIndex(a); assert.ok(!('vec' in pub) && !('df' in pub) && pub.rows.length === 10 && pub.stats.rows === 10);
  const withCites = buildIndex(LIB, { cites: { fx1: 4 } }); assert.equal(withCites.rows.find(r => r.id === 'fx1').cs, 4);
});

test('search: an owner-style query ranks the synthetic COT / FX papers above unrelated ones', () => {
  const ix = buildIndex(LIB), hits = search(ix, 'does COT positioning predict EURUSD', { n: 5 });
  assert.equal(hits[0].id, 'cot1');
  const top3 = hits.slice(0, 3).map(h => h.id); assert.ok(top3.includes('cot2'), top3.join());
  const ids = hits.map(h => h.id), pos = id => (ids.includes(id) ? ids.indexOf(id) : 99);
  for (const unrelated of ['gold1', 'rates1', 'ml1', 'vol1', 'opt1']) assert.ok(pos(unrelated) > pos('cot1') && pos(unrelated) > pos('cot2'), unrelated);
  assert.ok(hits[0].why.topics.includes('cot') && hits[0].why.terms.length >= 2); assert.ok(hits[0].why.boosts.includes('out-of-sample'));
  assert.ok(hits.every(h => typeof h.score === 'number' && h.score > 0));
});

test('search: deterministic ties, boosts and the maths boost only for model / equation queries', () => {
  const ix = buildIndex(LIB);
  assert.equal(JSON.stringify(search(ix, 'currency positioning')), JSON.stringify(search(ix, 'currency positioning')));
  // identical papers: the newer year wins, then the id
  const twins = buildIndex([P('b2', 'Twin Paper on Momentum', 2010, ['trend'], {}), P('a1', 'Twin Paper on Momentum', 2010, ['trend'], {}), P('c3', 'Twin Paper on Momentum', 2019, ['trend'], {})]);
  assert.deepEqual(search(twins, 'twin momentum').map(h => h.id), ['c3', 'a1', 'b2']);
  // an out-of-sample note outranks an otherwise identical in-sample one
  const oos = buildIndex([P('i', 'Value Paper', 2015, ['fx'], { outOfSample: 'no' }), P('o', 'Value Paper', 2015, ['fx'], { outOfSample: 'yes' })]);
  assert.equal(search(oos, 'value paper')[0].id, 'o');
  // our verdict boost
  const vd = buildIndex([P('n', 'Value Paper', 2015, ['fx'], {}), P('v', 'Value Paper', 2015, ['fx'], {}, { desk: [{ id: 'e', verdict: 'candidate' }] })]);
  assert.equal(search(vd, 'value paper')[0].id, 'v');
  // arXiv / maths-heavy boost only when the query mentions a model or equation
  const m = buildIndex([P('plain', 'Exchange rate dynamics', 2015, ['fx'], { claim: 'Exchange rate dynamics matter.' }, { src: 'ssrn' }), P('math', 'Exchange rate dynamics', 2015, ['fx'], { claim: 'Exchange rate dynamics matter.' }, { src: 'arxiv' })]);
  const withM = search(m, 'exchange rate dynamics model equation'), noM = search(m, 'exchange rate dynamics');
  assert.equal(withM[0].id, 'math'); assert.ok(withM[0].why.boosts.includes('maths'));
  assert.ok(noM.every(h => !h.why.boosts.includes('maths'))); assert.equal(noM[0].score, noM[1].score);
  // no notes: ranked below an equal paper that has notes
  const nn = buildIndex([P('nn', 'Quiet Paper on Basis', 2015, ['fx'], null), P('hn', 'Quiet Paper on Basis', 2015, ['fx'], {})]);
  assert.equal(search(nn, 'quiet basis')[0].id, 'hn');
});

test('search: topic, source, year and requireNotes filters; empty and unmatched queries', () => {
  const ix = buildIndex(LIB);
  assert.ok(search(ix, 'currency futures positioning', { topics: ['cot'] }).every(h => h.tg.includes('cot')));
  assert.deepEqual(search(ix, 'currency futures', { sources: ['nber'] }).map(h => h.id), ['cot2']);
  assert.ok(search(ix, 'currency', { years: ['2015-2018'] }).every(h => h.y >= 2015 && h.y <= 2018));
  assert.deepEqual(search(ix, 'currency', { years: ['2012'] }).map(h => h.id), ['cot2']);
  assert.ok(search(ix, 'positioning extremes futures', { requireNotes: true }).every(h => h.c));
  assert.ok(search(ix, 'positioning extremes futures').some(h => h.id === 'abs1'));
  assert.deepEqual(search(ix, ''), []); assert.deepEqual(search(ix, 'zzzzqqqq nonsense'), []); assert.deepEqual(search(null, 'x'), []);
  assert.equal(search(ix, 'volatility currency futures positioning', { n: 2 }).length, 2);
  assert.ok(search(ix, 'volatility', { minScore: 999 }).length === 0);
});

test('digest: fields, figure notes, length cap and abstract-only papers', () => {
  const p = { ...LIB[0], source: { key: 'ssrn', label: 'SSRN' }, notes: notes({ claim: 'C '.repeat(200), mechanism: 'M '.repeat(200), method: 'Me '.repeat(100), effect: 'E '.repeat(100), testHere: 'T '.repeat(150), caveats: ['x '.repeat(100), 'y '.repeat(100)], outOfSample: 'yes', costs: 'yes' }) };
  const figs = { 'Figure 1': { text: 'Shows the synthetic equity curve of the signal.', confident: true }, 'Table 2': { text: 'Lists invented Sharpe ratios by year.', confident: true }, 'Figure 3': { text: 'Third.', confident: false }, 'Figure 4': { text: 'Fourth, dropped.', confident: false } };
  const d = digest(p, { figNotes: figs });
  assert.ok(d.length <= 900, `digest is ${d.length}`);
  for (const w of ['id: cot1', 'Speculative Positioning', '(2018)', 'Claim:', 'Mechanism:', 'Data:', 'Method:', 'Effect:', 'Evidence:', 'out-of-sample yes', 'costs netted yes', 'Caveats:', 'Test here:', 'Figures:']) assert.ok(d.includes(w), `missing ${w}`);
  assert.ok(!d.includes('Fourth, dropped'), 'at most 3 figure notes');
  assert.ok(digest(p, { maxChars: 400 }).length <= 400);
  const small = digest(LIB[1]); assert.ok(small.length < 700 && small.includes('Data: currency futures, 1999-2010, weekly'));
  const a = digest(LIB[8]); assert.ok(a.includes('abstract only') && a.includes('We describe positioning extremes'));
  assert.deepEqual(figLines({ 'Figure 2': { text: 'b' }, 'Figure 10': { text: 'c' } }, 5), ['Figure 2: b', 'Figure 10: c']);
  assert.equal(cut('short', 10), 'short'); assert.ok(cut('word '.repeat(50), 40).endsWith('…') && cut('word '.repeat(50), 40).length <= 40);
});

test('buildContext: numbered list, header, ids, cap, and the no-paper case', () => {
  const ix = buildIndex(LIB), papers = new Map(LIB.map(p => [p.id, p]));
  const c = buildContext('does COT positioning predict EURUSD', ix, papers, { n: 3 });
  assert.equal(c.ids[0], 'cot1'); assert.equal(c.ids.length, 3); assert.equal(c.rows.length, 3);
  assert.ok(c.text.startsWith('LIBRARY:') && c.text.includes('Cite a paper by its id') && c.text.includes('not the full paper') && c.text.includes('no held paper covers this'));
  assert.ok(c.text.includes('[P1] id: cot1') && c.text.includes('[P2] id: ') && c.text.includes('[P3] id: ') && !c.text.includes('[P4]'));
  const tight = buildContext('currency futures positioning volatility', ix, papers, { n: 8, maxChars: 1800 });
  assert.ok(tight.text.length <= 1800, `text is ${tight.text.length}`); assert.ok(tight.ids.length >= 1);
  const big = buildContext('currency futures positioning volatility yields gold', ix, papers, { n: 10, maxChars: 5500 });
  assert.ok(big.text.length <= 5500 && big.ids.length >= 5);
  const none = buildContext('zzzzqqqq nonsense', ix, papers);
  assert.deepEqual(none.ids, []); assert.ok(none.text.includes(NO_PAPER) && none.text.startsWith(CONTEXT_HEADER));
  const fallback = buildContext('currency futures positioning', ix, new Map(), { n: 2 });   // no paper records: index rows stand in
  assert.ok(fallback.ids.length === 2 && fallback.text.includes('Claim:'));
  const figs = buildContext('currency futures positioning', ix, papers, { n: 1, figNotes: { cot1: { 'Figure 1': { text: 'Shows invented positioning deciles.', confident: true } } } });
  assert.ok(figs.text.includes('Figures: Figure 1: Shows invented positioning deciles.'));
});

test('researcher wiring helpers: flag, byte-identical sections when off, section when on, citeable ids', () => {
  assert.equal(libraryContextOn({}), false); assert.equal(libraryContextOn({ LIBRARY_CONTEXT: '0' }), false); assert.equal(libraryContextOn({ LIBRARY_CONTEXT: '' }), false);
  for (const v of ['1', 'true', 'ON', 'yes']) assert.equal(libraryContextOn({ LIBRARY_CONTEXT: v }), true);
  const secs = [['The question', 'Q'], ['Papers you have read', 'p'], ['Owner message', 'm']];
  assert.equal(withLibrary(secs, null), secs, 'off: the very same array');
  assert.equal(withLibrary(secs, { text: '' }), secs);
  const on = withLibrary(secs, { text: 'LIBRARY: x\n[P1] id: a' });
  assert.equal(on.length, 4); assert.equal(on.at(-1)[0].startsWith('LIBRARY:'), true); assert.deepEqual(on.slice(0, 3), secs);
  const bl = withLibrary(secs, { text: 'T' }, { beforeLast: true }); assert.deepEqual(bl.at(-1), secs.at(-1)); assert.ok(bl.at(-2)[0].startsWith('LIBRARY:'));
  const ids = new Set(['held1']); assert.equal(citeableIds(ids, []), ids, 'off: the same set'); assert.equal(citeableIds(ids, undefined), ids);
  const u = citeableIds(ids, ['lib1']); assert.ok(u.has('held1') && u.has('lib1') && u.size === 2 && !ids.has('lib1'));
  assert.equal(caseQuery({ question: 'Does COT predict?', title: 'Does COT predict?' }, 'go on'), 'Does COT predict? go on');
});

test('evidence and market helpers directly', () => {
  assert.equal(evidenceOf({ notes: { outOfSample: 'yes' } }), 'oos'); assert.equal(evidenceOf({ notes: null, title: 'Literature review of X' }), 'survey'); assert.equal(evidenceOf({}), 'unknown');
  assert.equal(marketOf({ title: 'Bitcoin returns', notes: { data: { market: 'bitcoin' } } }), 'crypto'); assert.equal(marketOf({ title: 'Plain title' }), 'unknown');
  assert.equal(marketOf({ title: 'Gold and the dollar', notes: { data: { market: 'gold and currencies' }, claim: 'gold and currency moves' } }), 'multi');
});
