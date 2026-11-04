// Tests for js/researchPod.js.   node js/researchPod.test.mjs
import assert from 'node:assert/strict';
import { WEB_SOURCES, WEB_HOSTS, parseFeed, webDigest, validateProposals, applyFeedback, feedbackBrief, buildList, mergeLibrary, validateCard, cardPrereg, lifecycle, setLink, outcomesBrief, scorecard, validateReply, applyRevision, threadText, registerIdOf } from './researchPod.js';
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

const rss = `<?xml version="1.0"?><rss><channel><title>X</title><item><title><![CDATA[Carry &amp; momentum in G10]]></title><link>https://ex.com/a</link><pubDate>Mon, 02 Nov 2026 14:37:21 +0000</pubDate><description>&lt;p&gt;Long high &#8220;yielders&#8221;&lt;/p&gt;</description></item><item><title>Second</title><link>https://ex.com/b</link></item></channel></rss>`;
const atom = `<feed><entry><id>http://arxiv.org/abs/2611.01799v1</id><title>Learning AI Agents</title><updated>2026-11-01T11:08:08Z</updated><link href="https://arxiv.org/abs/2611.01799v1" rel="alternate" type="text/html"/><summary>Automated   markets.</summary></entry></feed>`;
t('feeds: RSS and Atom, entities and CDATA cleaned', () => {
  const r = parseFeed(rss); assert.equal(r.length, 2); assert.equal(r[0].title, 'Carry & momentum in G10'); assert.equal(r[0].link, 'https://ex.com/a'); assert.match(r[0].summary, /Long high “yielders”/);
  const a = parseFeed(atom); assert.equal(a[0].link, 'https://arxiv.org/abs/2611.01799v1'); assert.equal(a[0].summary, 'Automated markets.'); assert.match(a[0].date, /^2026-11-01/);
  assert.deepEqual(parseFeed('<html>blocked</html>'), []);
  assert.ok(WEB_HOSTS.includes('export.arxiv.org') && WEB_SOURCES.every(s => s.url.startsWith('https://')));
  const d = webDigest({ arxiv: { items: a }, quantocracy: { error: 'HTTP 403' } }, 'quant'); assert.match(d, /Quantocracy[^\n]*\n\(HTTP 403\)/); assert.match(d, /Learning AI Agents/);
});
const good = { headline: 'h', questionsForOwner: ['Which brokers?'], proposals: [
  { title: 'G10 fair-value reversion', family: 'FX Fair Value Forecasting System', thesis: 'PPP gaps close slowly', mechanism: 'real-money hedgers rebalance', sources: [{ title: 'Rogoff 1996', url: 'https://x' }],
    inputs: [{ what: 'CPI levels for G10', status: 'missing', how: 'FRED' }, { what: 'Daily closes', status: 'have' }], rules: { universe: 'G10', signal: 'z of PPP gap' },
    test: { variable: 'gap', benchmark: 'carry', placebo: 'shuffled gaps' }, priority: 'high' },
  { title: 'no mechanism', sources: ['x'], inputs: [{ what: 'y' }], test: { benchmark: 'b' } },
] };
t('proposals: kept with mechanism, source, inputs and benchmark; ids from lens and title', () => {
  const v = validateProposals(good, 'macro'); assert.ok(v.ok); assert.equal(v.value.proposals.length, 1);
  const p = v.value.proposals[0]; assert.equal(p.id, 'macro-g10-fair-value-reversion'); assert.equal(p.sources[0].ref, 'https://x'); assert.equal(p.effort, 'M');
  assert.equal(validateProposals({ proposals: [] }, 'x').ok, false);
  assert.equal(validateProposals({ proposals: [{ ...good.proposals[0], thesis: 'This is profitable' }] }, 'q').notes.length, 1);
});
t('feedback, build list and library', () => {
  const p = validateProposals(good, 'macro').value.proposals;
  const q = [{ ...p[0], id: 'quant-x', priority: 'low', inputs: [{ what: 'CPI levels for G10', status: 'partial' }, { what: 'Options flow', status: 'missing' }] }];
  let fb = applyFeedback({}, p[0].id, 'build', 'go'); assert.throws(() => applyFeedback(fb, 'x', 'maybe'));
  const bl = buildList([...p, ...q], fb); assert.equal(bl[0].what, 'CPI levels for G10'); assert.equal(bl[0].needs.length, 2); assert.equal(bl[0].score, 3 * 2 + 1); assert.equal(bl[0].how, 'FRED');
  fb = applyFeedback(fb, 'quant-x', 'reject'); assert.ok(!buildList([...p, ...q], fb).some(x => x.what === 'Options flow'));
  assert.match(feedbackBrief(fb, p), /G10 fair-value reversion \[build\]: go/);
  const lib = mergeLibrary(mergeLibrary([], p, '2026-11-01'), p, '2026-11-08'); assert.equal(lib.length, 1); assert.equal(lib[0].firstSeen, '2026-11-01'); assert.equal(lib[0].lastSeen, '2026-11-08');
});
const card = { name: 'PPP gap', hypothesis: 'gaps close', mechanism: 'hedgers', universe: ['EURUSD', 'GBPUSD'], horizon: '20d', signal: 'z', entry: 'close', exit: '20d', sizing: '10% vol',
  data: [{ feed: 'CPI', status: 'missing', how: 'FRED' }], test: { primary: 'IC', benchmark: 'carry', placebo: 'shuffle', sample: '2000-2026', holdout: '2024-2026', cells: ['base'] },
  kill: ['IC < 0 OOS'], build: [{ step: 'pull CPI', files: ['scripts/x.py'], effort: 'S' }] };
t('system card: required fields and the prereg draft', () => {
  const v = validateCard(card); assert.ok(v.ok, v.errors?.join());
  assert.match(validateCard({ ...card, test: { primary: 'IC' }, kill: [] }).errors[0], /test.benchmark.*kill/);
  const md = cardPrereg(v.value, { id: 'ppp-gap', date: '2026-11-04', proposal: validateProposals(good, 'macro').value.proposals[0] });
  assert.match(md, /^# PPP gap: pre-registration \(DRAFT/); assert.match(md, /Holdout \(untouched until the end\): 2024-2026/); assert.match(md, /Macro researcher/); assert.match(md, /1\. pull CPI \[S\] \(scripts\/x.py\)/);
});
t('lifecycle: each stage read from what exists; outcomes fed back; scorecard', () => {
  const [p] = validateProposals(good, 'macro').value.proposals;
  assert.equal(lifecycle(p).stage, 'proposed'); assert.equal(registerIdOf(p), 'g10-fair-value-reversion');
  let fb = applyFeedback({}, p.id, 'build', 'go');
  const cards = { [p.id]: { card: { name: 'PPP gap' }, review: { verdict: 'fix' } } };
  assert.equal(lifecycle(p, { fb }).stage, 'chosen');
  assert.equal(lifecycle(p, { fb, cards }).stage, 'carded');
  const rows = [{ id: 'ppp-gap', status: 'REGISTERED' }];
  const c1 = lifecycle(p, { fb, cards, rows }); assert.equal(c1.stage, 'preregistered'); assert.equal(c1.registerId, 'ppp-gap');
  const tested = lifecycle(p, { fb, cards, rows, systems: { 'ppp-gap': { trades: 120, sharpe: 0.4 } } }); assert.equal(tested.stage, 'tested'); assert.equal(tested.outcome.headline.trades, 120);
  const failed = lifecycle(p, { fb, cards, rows, checklists: { 'ppp-gap': { verdict: 'fail', failed: ['deflated Sharpe'] } }, evidence: [{ id: 'ppp-gap', verdict: 'null', use: 'Do not trade it.' }] });
  assert.equal(failed.stage, 'failed');
  assert.match(outcomesBrief([p], { [p.id]: failed }, 'macro'), /\[failed\]: failed deflated Sharpe; Evidence Book null \("Do not trade it."\)/);
  assert.equal(outcomesBrief([p], { [p.id]: failed }, 'quant'), '(none of your proposals has moved yet)');
  fb = setLink(fb, p.id, { stage: 'paper', registerId: 'ppp-gap-v2' }); assert.equal(fb[p.id].status, 'build'); assert.equal(lifecycle(p, { fb, cards }).stage, 'paper'); assert.equal(lifecycle(p, { fb, cards }).registerId, 'ppp-gap-v2');
  assert.throws(() => setLink(fb, p.id, { stage: 'moon' })); assert.throws(() => setLink(fb, p.id, { registerId: 'Bad Id' }));
  assert.equal(lifecycle(p, { fb: applyFeedback({}, p.id, 'reject') }).stage, 'rejected');
  const fw = lifecycle(p, { fb: applyFeedback({}, p.id, 'build'), shadows: { [p.id]: { bot: 'Vote Atlas', rule: 'skip instrument EURUSD', verdict: 'helping', placeboPercentile: 0.97, kept: 40, filtered: { meanR: 0.2 }, asTraded: { meanR: 0.05 } } } });
  assert.equal(fw.stage, 'passed'); assert.ok(fw.steps.find(x => x.stage === 'forward-tested').done); assert.match(outcomesBrief([p], { [p.id]: fw }, 'macro'), /forward on Vote Atlas helping/);
  assert.equal(lifecycle(p, { shadows: { [p.id]: { bot: 'X', rule: 'r', verdict: 'collecting', need: '5 more' } } }).stage, 'proposed');
  const sc = scorecard([p], { [p.id]: failed }); assert.deepEqual([sc.macro.proposed, sc.macro.carded, sc.macro.tested, sc.macro.failed, sc.macro.passRate], [1, 1, 1, 1, 0]); assert.equal(sc.quant.proposed, 0);
});
t('thread: reply, revision with history', () => {
  const [p] = validateProposals(good, 'macro').value.proposals;
  assert.equal(validateReply({}).ok, false);
  const v = validateReply({ reply: 'Monthly works; I would add carry as a control.', revise: { test: { benchmark: 'carry and momentum' }, rules: { horizon: '3m' }, junk: 1 }, questions: ['Which pairs?'] });
  assert.ok(v.ok); assert.deepEqual(Object.keys(v.value.revise).sort(), ['rules', 'test']);
  const q = applyRevision(p, v.value.revise, '2026-11-05'); assert.equal(q.version, 2); assert.equal(q.test.benchmark, 'carry and momentum'); assert.equal(q.test.placebo, 'shuffled gaps'); assert.equal(q.rules.horizon, '3m'); assert.equal(q.history[0].test.benchmark, 'carry');
  assert.equal(applyRevision(p, null), p);
  assert.match(threadText([{ who: 'owner', text: 'why monthly?', at: '2026-11-05T10:00' }, { who: 'macro', text: 'costs', at: '2026-11-05T10:01' }]), /Owner .*why monthly\?\nMacro researcher/);
});
console.log(`researchPod: ${n} tests passed`);
