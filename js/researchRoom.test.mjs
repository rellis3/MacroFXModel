import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from './researchRoom.js';
import { appendRound, appendReview, roundSections, headSections } from './researchCase.js';

const brief = { title: 'Vol as a shared state', hypothesis: 'A shared vol state improves position sizing over the forecaster alone.', mechanism: 'Risk scales with vol.',
  target: { series: 'oanda:EURUSD', label: 'EURUSD' }, variables: [{ name: 'Vol state', construction: 'HAR forecast and its error', components: [], role: 'leader', transform: 'daily' }],
  method: { steps: ['scale size by forecast vol'], lags: '1 to 5 days', regimes: ['VIX terciles'] }, assumptions: ['daily data'], searchTerms: ['volatility', 'jump'] };
const room = () => R.newRoom({ id: 'room-1', date: '2026-11-12', at: '2026-11-12T01:00:00Z', brief, ownerText: 'I want a 6-layer process around the vol forecaster', shape: 'regime',
  onFile: [{ id: 'jump-diffusion', verdict: 'context', claim: 'jumps', use: '' }], library: { ids: ['p1'], papers: [{ id: 'p1', title: 'Volatility-managed portfolios', year: 2017 }] } });

test('a room is a case with the brief as its question, and nothing has run', () => {
  const c = room();
  assert.equal(c.title, 'Vol as a shared state'); assert.match(c.question, /In one line: A shared vol state/); assert.match(c.question, /When does it work/);
  assert.equal(c.rounds.length, 0); assert.deepEqual(c.room.guests, []); assert.ok(c.room.suggested.includes('volopt'), 'vol topics suggest the vol & options guest');
  assert.equal(R.waitingOn(c).on, 'you'); assert.match(R.waitingOn(c).why, /start the discussion/);
  assert.throws(() => R.newRoom({ id: 'x', date: 'd' }), /needs an idea/);
});

test('guests: suggested by topic, at most two, the skeptic when nothing matches', () => {
  assert.deepEqual(R.suggestGuests('the 2s10s yield curve and the Fed'), ['rates']);
  assert.ok(R.suggestGuests('implied vol skew and dealer gamma near expiry').includes('volopt'));
  assert.deepEqual(R.suggestGuests('cats and dogs'), ['skeptic']);
  assert.ok(R.suggestGuests('vol yields theory paper skew curve gamma').length <= R.MAX_GUESTS);
});

test('seats: accept up to two guests, bench but never all three researchers', () => {
  let c = room();
  c = R.setSeat(c, 'accept', 'volopt').case; c = R.setSeat(c, 'accept', 'rates').case;
  assert.deepEqual(c.room.guests, ['volopt', 'rates']); assert.ok(!c.room.suggested.includes('volopt'));
  assert.match(R.setSeat(c, 'accept', 'skeptic').error, /at most 2/);
  assert.equal(R.setSeat(c, 'accept', 'nobody').ok, false);
  c = R.setSeat(c, 'bench', 'flow').case; c = R.setSeat(c, 'bench', 'macro').case;
  assert.deepEqual(R.activeLenses(c), ['quant']); assert.match(R.setSeat(c, 'bench', 'quant').error, /at least one/);
  assert.equal(R.setSeat(c, 'bench', 'volopt').ok, false);
  c = R.setSeat(c, 'unbench', 'macro').case; assert.deepEqual(R.activeLenses(c), ['quant', 'macro']);
  assert.deepEqual(R.talkTargets(c, 'discuss'), ['quant', 'macro', 'volopt', 'rates']);
  assert.deepEqual(R.talkTargets(c, 'skeptic'), [], 'a guest not at the table cannot speak');
  assert.deepEqual(R.talkTargets(c, 'flow'), [], 'a benched researcher cannot speak');
});

test('a remark is short, may pass, never carries markup, and names who it answers', () => {
  assert.deepEqual(R.validateTalk({ pass: true }, { who: 'quant' }).value, { pass: true, replyTo: '', text: '' });
  const v = R.validateTalk({ pass: false, replyTo: 'Macro', text: 'Agree, but central-bank weeks will swamp it.' }, { who: 'quant' });
  assert.equal(v.ok, true); assert.equal(v.value.replyTo, 'macro');
  assert.equal(R.validateTalk({ text: 'see <b>this</b>' }).ok, false); assert.equal(R.validateTalk({ text: 'see https://x.y' }).ok, false);
  assert.equal(R.validateTalk({ pass: false }).ok, false); assert.equal(R.validateTalk([]).ok, false);
  assert.equal(R.validateTalk({ replyTo: 'quant', text: 'me' }, { who: 'quant' }).value.replyTo, '', 'not to itself');
  assert.equal(R.validateTalk({ text: 'This is profitable and proven.' }, { who: 'flow' }).notes.length, 1);
  assert.ok(R.validateTalk({ text: 'x'.repeat(2000) }).value.text.length <= 700);
});

test('the prompts: each voice has its lens and the rules; the researchers and the Head read the remarks', () => {
  let c = R.setSeat(room(), 'accept', 'skeptic').case;
  c = R.appendTalk(c, [{ who: 'skeptic', text: 'Six layers is six chances to overfit.', at: '2026-11-12T02:00:00Z' }, { who: 'quant', pass: true, at: '2026-11-12T02:00:01Z' }]);
  assert.match(R.talkSystem('skeptic'), /skeptic/i); assert.match(R.talkSystem('quant'), /quant/i); assert.match(R.talkSystem('macro'), /Reply with ONE JSON/);
  const p = R.talkPrompt(c, 'macro', { earlier: [{ who: 'flow', text: 'COT may matter.' }] });
  assert.match(p, /In one line/); assert.match(p, /six chances to overfit/); assert.match(p, /Flow researcher: COT may matter/); assert.match(p, /jump-diffusion \[context\]/); assert.match(p, /You are Macro researcher/);
  const text = R.roomText(c); assert.match(text, /Guests at the table: Skeptic/); assert.match(text, /\(passed\)/);
  const rs = roundSections(c, 'quant', { ownerMessage: 'go', roomSection: text });
  assert.ok(rs.some(([k, v]) => /research room/.test(k) && /overfit/.test(v)));
  assert.ok(headSections(c, { roomSection: text }).some(([k]) => /research room/.test(k)));
  assert.ok(!roundSections(c, 'quant', { ownerMessage: 'go' }).some(([k]) => /research room/.test(k)), 'no room section unless given');
});

test('taking turns: a researcher reads the ones who already spoke in this round', () => {
  const rs = roundSections(room(), 'macro', { ownerMessage: 'go', thisRound: { quant: { headline: 'Size by vol', reply: 'Scale risk by forecast vol.', proposals: [{ title: 'Vol-scaled sizing' }] } } });
  const others = rs.find(([k]) => /other researchers/.test(k))[1];
  assert.match(others, /this round, just now, before you\): Size by vol/); assert.match(others, /Vol-scaled sizing/); assert.match(others, /Flow researcher: \(has not answered yet\)/);
});

test('the counter is reserved before a call and fails closed at the cap', async () => {
  const store = {}, kv = { getStrict: async k => store[k] ?? null, put: async (k, v) => { store[k] = v; } };
  const t = R.createTalkCounter(kv, { cap: 2 });
  assert.equal(await t.reserve(), true); assert.equal(await t.reserve(), true); assert.equal(await t.reserve(), false);
  assert.deepEqual(await t.status(), { callsUsed: 2, callsCap: 2, callsLeft: 0 });
  const broken = R.createTalkCounter({ getStrict: async () => { throw new Error('kv down'); }, put: async () => {} });
  await assert.rejects(broken.reserve()); assert.equal((await broken.status()).callsUsed, null);
});

test('the timeline: owner, translator, on file, librarian, the round in turn order, remarks, the Head; stages and seats follow', () => {
  let c = room();
  c = appendRound(c, { owner: 'Please discuss the brief', at: '2026-11-12T03:00:00Z', answers: { flow: { headline: 'F', reply: 'flow says' }, quant: { headline: 'Q', reply: 'quant says', proposals: ['p-q1'] } }, errors: { macro: 'timeout' } });
  c = R.appendTalk(c, [{ who: 'quant', text: 'one more thing', at: '2026-11-12T03:30:00Z' }]);
  c = appendReview(c, { headline: 'Test sizing first', nextStep: 'quick-test', plan: { variable: 'vol' } }, { at: '2026-11-12T04:00:00Z' });
  const tl = R.timeline(c, [{ id: 'p-q1', title: 'Vol-scaled sizing' }]);
  assert.deepEqual(tl.slice(0, 4).map(m => m.kind), ['owner', 'brief', 'onfile', 'library']);
  const answers = tl.filter(m => m.kind === 'answer').map(m => m.who); assert.deepEqual(answers, ['quant', 'flow'], 'core turn order');
  assert.equal(tl.find(m => m.who === 'quant' && m.kind === 'answer').proposals[0].title, 'Vol-scaled sizing');
  assert.ok(tl.some(m => m.kind === 'error' && m.who === 'macro'));
  assert.ok(tl.findIndex(m => m.kind === 'talk') < tl.findIndex(m => m.kind === 'head'), 'in time order');
  assert.equal(R.waitingOn(c).on, 'you'); assert.match(R.waitingOn(c).why, /quick-test/);
  const st = R.stages(c); assert.deepEqual(st.map(s => s.state), ['done', 'done', 'done', 'done', 'done', 'now']);
  assert.equal(R.waitingOn(c, { status: 'running', stage: 'x' }).on, 'team');
  assert.equal(R.waitingOn({ ...c, status: 'parked' }).on, 'closed');
  const seats = R.seats(c); assert.equal(seats.find(s => s.who === 'quant').state, 'spoke'); assert.equal(seats.find(s => s.who === 'macro').state, 'waiting');
  assert.ok(seats.some(s => s.state === 'suggested'), 'suggested guests sit in the empty chairs');
  const row = R.roomSummary(c); assert.equal(row.last.label, 'Head of Research'); assert.equal(row.isRoom, true);
});

test('an older case without a room block still shows as a room', () => {
  const c = { id: 'case-x', title: 'Old', question: 'Does carry work?', date: 'd', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', status: 'open', rounds: [], reviews: [] };
  assert.equal(R.timeline(c)[0].text, 'Does carry work?'); assert.deepEqual(R.activeLenses(c), ['quant', 'macro', 'flow']);
  assert.equal(R.roomSummary(c).isRoom, false);
  assert.equal(R.setSeat(c, 'accept', 'theory').case.room.guests[0], 'theory');
});

test('on file: the most related Evidence Book entries, and none for empty text', () => {
  const ledger = [{ id: 'a', claim: 'carry in G10', verdict: 'null' }, { id: 'b', claim: 'vol state at the lines', verdict: 'null', use: 'sizing untested' }, { id: 'c', claim: 'jump diffusion predicts', verdict: 'context' }];
  assert.deepEqual(R.onFileEntries(ledger, 'vol state jump', 2).map(e => e.id).sort(), ['b', 'c']);
  assert.deepEqual(R.onFileEntries(ledger, '   '), []);
});
