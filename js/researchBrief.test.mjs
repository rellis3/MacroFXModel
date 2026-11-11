import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGUE } from './quickTest.js';
import { BRIEF_CAP, BRIEF_KV_KEY, buildPrompt, parseBrief, dataCheck, createBriefService, catalogueText } from './researchBrief.js';

const GOOD = {
  title: 'Does the euro-minus-US curve slope lead EURUSD?',
  hypothesis: 'Daily changes in (Bund 10y-2y) minus (US 10y-2y) lead EURUSD by 1 to 20 sessions.',
  mechanism: 'Relative curve shape reflects expected policy divergence, which can move the exchange rate before price adjusts.',
  target: { series: 'oanda:EURUSD', label: 'EURUSD daily close', note: '' },
  variables: [
    { name: 'Euro minus US curve slope', construction: '(yield:DE10Y - yield:DE2Y) - (fred:DGS10 - fred:DGS2), daily', components: ['yield:DE10Y', 'yield:DE2Y', 'fred:DGS10', 'fred:DGS2'], transform: '1-day and 5-day changes, not levels', role: 'leader' },
    { name: 'VIX regime', construction: 'terciles of fred:VIXCLS', components: ['fred:VIXCLS'], transform: 'level terciles', role: 'condition' },
  ],
  method: { steps: ['use changes, not levels', 'cross-correlate across lags', 'split by regime'], lags: 'leader leads by 1 to 20 sessions; also test the reverse', regimes: ['VIX terciles (fred:VIXCLS)', 'US curve inverted or not (fred:T10Y2Y)'] },
  missing: [], assumptions: ['daily closes', 'euro curve means the Bund curve'], question: '', searchTerms: ['yield curve', 'interest rate differential', 'lead-lag'],
};
const harness = ({ reply = GOOD, kvFail = false, preUsed = 0, modelErr = null } = {}) => {
  const kvm = new Map(); if (preUsed) kvm.set(BRIEF_KV_KEY, JSON.stringify({ v: 1, used: preUsed })); const r2m = new Map(); const calls = [];
  const svc = createBriefService({
    kv: { getStrict: async k => { if (kvFail) throw new Error('kv down'); return kvm.get(k) ?? null; }, put: async (k, v) => { kvm.set(k, v); } },
    r2: { ok: () => true, putBuffer: async (k, b) => { r2m.set(k, b); } }, catalogue: CATALOGUE, now: () => 1_000_000,
    model: async a => { calls.push(a); if (modelErr) throw new Error(modelErr); return reply; },
  });
  return { svc, kvm, r2m, calls };
};
const IDEA = "I'm considering using yield curves to see whether a euro versus US 2s10s spread leads EURUSD. Start with changes, cross-correlations across lags, and regimes.";

test('the prompt shows only catalogue ids and carries the owner\'s words', () => {
  const p = buildPrompt(IDEA, CATALOGUE);
  assert.match(p, /yield:DE2Y: Bund 2-year/); assert.match(p, /oanda:EURUSD/); assert.match(p, /cross-correlations across lags/);
  assert.equal(catalogueText(CATALOGUE).split('\n').length, Object.keys(CATALOGUE).length);
});

test('a good reply is kept; an invented series id is moved out and shown as missing; markup and links are dropped', () => {
  const r = parseBrief(GOOD, CATALOGUE); assert.equal(r.ok, true);
  assert.deepEqual(r.brief.variables[0].components, ['yield:DE10Y', 'yield:DE2Y', 'fred:DGS10', 'fred:DGS2']);
  const bad = structuredClone(GOOD); bad.variables[0].components.push('fred:MADEUP'); bad.target.series = 'oanda:NOPE'; bad.mechanism = 'see <b>this</b> https://x.com';
  const p = parseBrief(bad, CATALOGUE).brief;
  assert.deepEqual(p.variables[0].unknownComponents, ['fred:MADEUP']); assert.equal(p.target.series, ''); assert.equal(p.target.unknownSeries, 'oanda:NOPE'); assert.equal(p.mechanism, '');
  const d = dataCheck(p, CATALOGUE); assert.equal(d.allHave, false); assert.match(d.notes.join(' '), /fred:MADEUP/); assert.match(d.notes.join(' '), /no target series/);
  assert.equal(parseBrief('not json', CATALOGUE).ok, false); assert.equal(parseBrief({ title: 't' }, CATALOGUE).ok, false); assert.equal(parseBrief({ title: 't', hypothesis: 'h', variables: [] }, CATALOGUE).ok, false);
});

test('data check is code: all four yields and EURUSD are held; the spread must be built first so it is not quick-test ready', () => {
  const d = dataCheck(parseBrief(GOOD, CATALOGUE).brief, CATALOGUE);
  assert.equal(d.allHave, true); assert.equal(d.quickTestReady, false);
  assert.deepEqual(d.derivedLeaders, ['Euro minus US curve slope']);
  assert.match(d.notes.join(' '), /must be built from its parts first/);
  const simple = structuredClone(GOOD); simple.variables = [{ name: 'US 10y', construction: 'fred:DGS10 daily change', components: ['fred:DGS10'], role: 'leader' }];
  assert.equal(dataCheck(parseBrief(simple, CATALOGUE).brief, CATALOGUE).quickTestReady, true);
});

test('translate: one call, counted before it is made, brief kept privately, numbers returned', async () => {
  const h = harness(); const r = await h.svc.translate(IDEA);
  assert.equal(r.ok, true); assert.equal(h.calls.length, 1); assert.equal(JSON.parse(h.kvm.get(BRIEF_KV_KEY)).used, 1);
  assert.equal(r.callsUsed, 1); assert.equal(r.callsCap, BRIEF_CAP); assert.match(r.id, /^b-/);
  const stored = JSON.parse([...h.r2m.values()][0].toString()); assert.equal(stored.ownerText, IDEA.replace(/\s+/g, ' '));
  assert.equal(r.dataCheck.allHave, true);
});

test('guards: too short, no model, counter unreadable (fails closed), cap used up, model error and unusable reply still count', async () => {
  assert.equal((await harness().svc.translate('hi')).status, 400);
  const nm = createBriefService({ kv: { getStrict: async () => null, put: async () => {} }, r2: null, catalogue: CATALOGUE, model: null }); assert.equal((await nm.translate(IDEA)).status, 503);
  const kf = harness({ kvFail: true }); const a = await kf.svc.translate(IDEA); assert.equal(a.status, 503); assert.equal(kf.calls.length, 0);
  const cp = harness({ preUsed: BRIEF_CAP }); const b = await cp.svc.translate(IDEA); assert.equal(b.status, 409); assert.equal(cp.calls.length, 0);
  const me = harness({ modelErr: 'timeout' }); assert.equal((await me.svc.translate(IDEA)).status, 502); assert.equal(JSON.parse(me.kvm.get(BRIEF_KV_KEY)).used, 1);
  const bad = harness({ reply: { nope: 1 } }); assert.equal((await bad.svc.translate(IDEA)).status, 502);
  assert.deepEqual(Object.keys(await harness({ preUsed: 5 }).svc.status()).sort(), ['callsCap', 'callsLeft', 'callsUsed', 'model', 'ok']);
});
