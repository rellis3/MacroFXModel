// Tests for js/researchLibrary.js.   node js/researchLibrary.test.mjs
// Fixtures in tests/fixtures/research_library/ (no test touches the network):
//   qc_tree.json      the GitHub git/trees reply shape ({ sha, truncated, tree: [{ path, mode, type }] }) built from
//                     `git ls-tree -r --name-only HEAD` of a blobless clone of QuantConnect/Tutorials (2026-11-04),
//                     "04 Strategy Library" only: api.github.com was rate limited from the build machine.
//   qc_jsdelivr_flat.json   real reply of data.jsdelivr.com/v1/package/gh/QuantConnect/Tutorials@master/flat (the
//                     keyless fallback), "04 Strategy Library" only.
//   qc_fx_*.html      real sections of "02 Combining Mean Reversion and Momentum in Forex Market" from
//                     raw.githubusercontent.com.
//   feed_*.xml        real replies of the Fed FEDS, ECB working-paper and BoE publications feeds (2026-11-04).
// The reading list, the SSRN manifest and the 151 book are the repo's own files.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from './researchLibrary.js';
import { mergePapers } from './literature.js';
import { WEB_SOURCES, feedItems } from './researchPod.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), FX = path.join(ROOT, 'tests', 'fixtures', 'research_library');
const repo = f => fs.readFileSync(path.join(ROOT, f), 'utf8'), fx = f => fs.readFileSync(path.join(FX, f), 'utf8');
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

t('CSV: quotes, doubled quotes, commas and newlines inside fields', () => {
  const r = R.parseCsv('a,b,c\n1,"x, y","he said ""hi"""\n2,"line\nbreak",\n');
  assert.deepEqual(r, [{ a: '1', b: 'x, y', c: 'he said "hi"' }, { a: '2', b: 'line\nbreak', c: '' }]);
});

t('the reading list and the SSRN manifest become backlog items', () => {
  const rl = R.readingListItems(repo('education/papers/open/reading_list.csv'));
  assert.ok(rl.length >= 85, `${rl.length}`); assert.ok(rl.every(x => /^arxiv:(\d{4}\.\d{4,5}|[a-z-]+\/\d{7})$/.test(x.id) && x.via === 'arxiv' && x.title));
  assert.equal(new Set(rl.map(x => x.id)).size, rl.length);
  const mf = R.manifestItems(repo('education/papers/manifest.csv'));
  assert.ok(mf.length >= 120, `${mf.length}`);
  const a = mf.find(x => x.ssrn === '2293684');
  assert.equal(a.id, 'doi:10.2139/ssrn.2293684'); assert.equal(a.title, 'Out-of-Sample Evidence on the Returns to Currency Trading'); assert.match(a.openUrl, /^https:\/\/research\.mbs\.ac\.uk/);
  assert.ok(mf.some(x => x.held));
});

t('151: every numbered strategy, Generalities skipped, chapter 20 as one, references never inside', () => {
  const s = R.parse151(repo('education/151 Trading Strategies.md'));
  assert.ok(s.length >= 150, `${s.length}`);
  assert.ok(!s.some(x => /^generalities$/i.test(x.name)));
  const carry = s.find(x => x.num === '8.2'); assert.equal(carry.name, 'Carry trade'); assert.equal(carry.chapterName, 'Foreign Exchange (FX)'); assert.match(carry.text, /interest rate/i);
  assert.ok(s.find(x => x.num === '8.2.1')); assert.ok(s.find(x => x.num === '20'));
  assert.equal(new Set(s.map(x => x.num)).size, s.length);
});

t("151: the repo's screen read from the proposals table", () => {
  const p = repo('education/151_STRATEGIES_PROPOSALS.md');
  assert.equal(R.screen151(p, '9.2').verdict, 'PROPOSE'); assert.equal(R.screen151(p, '10.4').verdict, 'PROPOSE');
  assert.equal(R.screen151(p, '8.2.1').verdict, 'NEEDS INSIGHT'); assert.equal(R.screen151(p, '3.9').verdict, 'NEEDS INSIGHT');   // inside a range 3.8–3.10
  assert.equal(R.screen151(p, '8.1').verdict, 'NO'); assert.equal(R.screen151(p, '2.22').verdict, 'NO'); assert.equal(R.screen151(p, '12.1').verdict, 'NO');
  assert.equal(R.screen151(p, '6.5').verdict, 'BUILT');
  const it = R.items151(repo('education/151 Trading Strategies.md'), p);
  assert.ok(it.every(x => x.kind === 'strategy' && x.id.startsWith('151:')));
  const rec = R.record151(repo('education/151 Trading Strategies.md'), p, '9.2');
  assert.equal(rec.rec.id, '151:9.2'); assert.equal(rec.rec.kind, 'strategy'); assert.deepEqual(rec.rec.cites, ['doi:10.2139/ssrn.3247865']);
  assert.match(rec.text, /The repo's screen .*PROPOSE/); assert.equal(R.record151('', p, '9.2'), null);
});

t('QuantConnect: the tree to strategies with ordered sections; raw URLs encoded', () => {
  const s = R.parseQcTree(JSON.parse(fx('qc_tree.json')));
  assert.ok(s.length >= 70, `${s.length}`); assert.ok(!s.some(x => x.num === 0));
  const fx2 = s.find(x => x.title === 'Combining Mean Reversion and Momentum in Forex Market');
  assert.equal(fx2.id, 'qc:combining-mean-reversion-and-momentum-in-forex-market');
  assert.deepEqual(fx2.sections.map(x => x.name), ['Abstract', 'Introduction', 'Method', 'Results', 'Summary', 'Algorithm', 'References']);
  assert.deepEqual(R.qcSectionsToRead(fx2).map(x => x.name), ['Abstract', 'Introduction', 'Method', 'Results', 'Summary', 'References']);
  assert.equal(R.qcRawUrl(fx2.sections[0].path), 'https://raw.githubusercontent.com/QuantConnect/Tutorials/master/04%20Strategy%20Library/02%20Combining%20Mean%20Reversion%20and%20Momentum%20in%20Forex%20Market/01%20Abstract.html');
  assert.equal(R.parseQcTree({}).length, 0);
  // jsDelivr's flat listing (the keyless fallback) gives the same strategies
  const j = R.parseQcTree(JSON.parse(fx('qc_jsdelivr_flat.json')));
  assert.ok(j.length >= 70, `${j.length}`); assert.deepEqual(j.find(x => x.num === 2).sections.map(x => x.name), fx2.sections.map(x => x.name));
  assert.ok(R.qcItems(s).every(x => x.via === 'qc' && x.sections.length));
});

t('QuantConnect: a strategy record from its real sections, references linked to papers', () => {
  const s = R.parseQcTree(JSON.parse(fx('qc_tree.json'))).find(x => x.num === 2);
  const html = { Abstract: fx('qc_fx_01_Abstract.html'), Method: fx('qc_fx_03_Method.html'), Results: fx('qc_fx_04_Results.html'), Summary: fx('qc_fx_05_Summary.html'), References: fx('qc_fx_07_References.html') };
  const { rec, text } = R.qcRecord(s, html);
  assert.equal(rec.kind, 'strategy'); assert.equal(rec.sourceLabel, 'QuantConnect strategy library'); assert.match(rec.abstract, /momentum and mean reversion for the foreign exchange/);
  assert.match(rec.url, /^https:\/\/github\.com\/QuantConnect\/Tutorials\/tree\/master\/04%20Strategy%20Library\//);
  assert.ok(rec.references.length >= 4); assert.ok(rec.references.some(r => /Serban/.test(r.text) && /isiarticles/.test(r.url)));
  assert.ok(rec.references.some(r => /Fama/.test(r.text)));
  assert.match(text, /## Method/); assert.ok(!/<[a-z]+[ >]/i.test(text.slice(0, 3000)));
  const refs = R.qcReferences('<ol><li>Author A, Paper A <a href="https://doi.org/10.1016/j.jfineco.2012.11.003">x</a></li><li>Author B, Paper B <a href="https://arxiv.org/abs/1406.4322">y</a></li><li>Author C, https://ssrn.com/abstract=2293684</li></ol>');
  assert.equal(refs[0].doi, '10.1016/j.jfineco.2012.11.003'); assert.equal(refs[1].arxiv, '1406.4322'); assert.equal(refs[2].ssrn, '2293684');
  assert.deepEqual(R.qcRecord(s, { References: '<ol><li>Author B, Paper B <a href="https://arxiv.org/abs/1406.4322">y</a></li></ol>' }).rec.cites, ['arxiv:1406.4322']);
});

t('uploads: matched to the backlog by the SSRN or arXiv id in the file name', () => {
  assert.deepEqual(R.matchUpload('C:\\papers\\2293684_out-of-sample.pdf'), { id: 'doi:10.2139/ssrn.2293684', ssrn: '2293684', doi: '10.2139/ssrn.2293684', via: 'ssrn' });
  assert.deepEqual(R.matchUpload('1803.07152v1_exploring-the-predictability.pdf'), { id: 'arxiv:1803.07152', arxiv: '1803.07152', via: 'arxiv' });
  const u = R.matchUpload('Menkhoff carry.pdf'); assert.equal(u.via, 'upload'); assert.match(u.id, /^upload:/);
  assert.equal(R.matchUpload('menkhoff carry.PDF').id, u.id);
  assert.equal(R.uploadKey('doi:10.2139/ssrn.2293684'), 'research/papers/doi_10.2139_ssrn.2293684.pdf');
  assert.equal(R.uploadKey('arxiv:1803.07152', 'txt'), 'research/papers/arxiv_1803.07152.txt');
});

t('queue: seeded once, read items skipped, uploads first, failures retried once', () => {
  const rl = R.readingListItems(repo('education/papers/open/reading_list.csv')).slice(0, 5), mf = R.manifestItems(repo('education/papers/manifest.csv')).slice(0, 3);
  const st = R.items151(repo('education/151 Trading Strategies.md'), repo('education/151_STRATEGIES_PROPOSALS.md')).slice(0, 3);
  const lib = mergePapers([], [{ id: rl[0].id, keys: [rl[0].id], title: rl[0].title, notes: { claim: 'c' } }]);
  let { queue, added } = R.seedQueue(null, [...rl, ...mf, ...st], lib);
  assert.equal(added, 11); assert.equal(queue.items.find(x => x.id === rl[0].id).status, 'done');
  assert.equal(R.seedQueue(queue, rl, lib).added, 0);
  queue = R.upsertItem(queue, { id: mf[2].id, upload: { name: 'x.pdf' } });
  const next = R.nextItems(queue, { n: 20 });
  assert.equal(next[0].id, mf[2].id); assert.equal(next.at(-1).via, '151'); assert.ok(!next.some(x => x.id === rl[0].id));
  queue = R.markItems(queue, [rl[1].id], 'failed', { error: 'no abstract' }); assert.equal(queue.items.find(x => x.id === rl[1].id).status, 'pending');
  queue = R.markItems(queue, [rl[1].id], 'failed'); assert.equal(queue.items.find(x => x.id === rl[1].id).status, 'failed');
  queue = R.markItems(queue, [rl[2].id], 'done');
  const s = R.queueSummary(queue); assert.equal(s.total, 11); assert.equal(s.done, 2); assert.equal(s.failed, 1); assert.equal(s.bySource['reading list'].pending, 2);
  const plan = R.batchPlan([...R.nextItems(queue, { n: 50 }), ...Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, kind: 'paper' }))], { calls: 3 });
  assert.equal(plan.length, 3); assert.equal(plan[0].length, 1); assert.ok(plan[0][0].upload); assert.ok(plan[1].every(x => x.kind === 'strategy'));
});

t('local search: read entries and unread backlog by keyword overlap, filtered by kind', () => {
  const lib = mergePapers([], [
    { id: 'qc:fx', keys: ['qc:fx'], kind: 'strategy', title: 'Combining Mean Reversion and Momentum in Forex Market', abstract: 'momentum and mean reversion in currencies', notes: { claim: 'FX momentum plus reversion' } },
    { id: 'arxiv:1', keys: ['arxiv:1'], title: 'Equity analyst coverage', notes: { claim: 'analysts' } }]);
  const { queue } = R.seedQueue(null, R.items151(repo('education/151 Trading Strategies.md'), repo('education/151_STRATEGIES_PROPOSALS.md')), []);
  const r = R.searchLocal(lib, queue, ['currency carry trade', 'forex momentum mean reversion']);
  assert.equal(r.read[0].id, 'qc:fx'); assert.ok(!r.read.some(p => p.id === 'arxiv:1'));
  assert.ok(r.unread.some(x => x.id === '151:8.2'), r.unread.map(x => x.title).join(' | '));
  assert.equal(R.searchLocal(lib, queue, 'forex momentum', { kinds: ['paper'] }).read.length, 0);
  assert.equal(R.kindOf({}), 'paper'); assert.equal(R.kindOf({ kind: 'strategy' }), 'strategy');
});

t('working-paper feeds: Fed, ECB and BoE parse; BoE kept to working papers; records of kind working paper', () => {
  const src = id => WEB_SOURCES.find(s => s.id === id);
  const fed = feedItems(src('fed_feds'), fx('feed_fed_feds.xml')), ecb = feedItems(src('ecb_wp'), fx('feed_ecb_wp.xml')), boe = feedItems(src('boe_wp'), fx('feed_boe_publications.xml'));
  assert.ok(fed.length >= 10 && /^FEDS Paper/.test(fed[0].title));
  assert.ok(ecb.length >= 10 && ecb[0].link.endsWith('.pdf'));
  assert.ok(boe.length >= 10 && boe.every(i => i.link.includes('/working-paper/')), boe.map(i => i.link).join('\n'));
  const recs = R.paperFeedRecords({ ecb_wp: { items: ecb }, boe_wp: { items: boe }, arxiv: { items: [{ title: 'x', link: 'y' }] } }, WEB_SOURCES);
  assert.equal(recs.length, ecb.length + boe.length); assert.ok(recs.every(r => r.kind === 'working paper'));
  assert.ok(recs.find(r => r.sourceLabel === 'ECB working papers').pdfUrl.endsWith('.pdf'));
});

console.log(`researchLibrary: ${n} tests passed`);
