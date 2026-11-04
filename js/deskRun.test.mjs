import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRole, selectEvidence, sliceText, buildAnalystPrompt, buildHeadPrompt, feedBlock, shareBudget } from './deskRoles.js';
import { runDesk, runSummary, CAPS } from './deskRun.js';
import { DESK_SKILLS, expandFeeds, buildDeskPack, allInstruments, DESK_CCYS, DESK_UNIVERSE } from './deskPack.js';
import { DESK_EVIDENCE } from './deskEvidence.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROLE_DIR = path.join(root, 'desk', 'roles');
let n = 0; const t = async (name, fn) => { try { await fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const roles = fs.readdirSync(ROLE_DIR).filter(f => f.endsWith('.md')).map(f => parseRole(fs.readFileSync(path.join(ROLE_DIR, f), 'utf8'), f));
const NOW = Date.parse('2026-11-03T06:50:00Z');
const pack = buildDeskPack(expandFeeds().map((f, i) => ({ feed: f, result: i % 7 === 0 ? { error: 'down' } : { json: { asOf: '2026-11-03T06:00:00Z', v: i, series: Array.from({ length: 300 }, (_, k) => k) }, httpStatus: 200 } })), { now: NOW });

await t('every role file parses, ids match file names, one Head of Desk', () => {
  for (const f of fs.readdirSync(ROLE_DIR).filter(x => x.endsWith('.md'))) assert.equal(roles.find(r => `${r.id}.md` === f)?.id + '.md', f);
  assert.equal(roles.filter(r => r.id === 'head_of_desk').length, 1);
  assert.equal(roles.find(r => r.id === 'head_of_desk').tier, 'deep');
});

await t('every Desk Pack skill is read by exactly one analyst, and analysts read only real skills', () => {
  const analysts = roles.filter(r => r.output === 'analyst_report');
  const skills = new Set(DESK_SKILLS.map(s => s.id));
  for (const r of analysts) for (const s of r.reads) assert.ok(skills.has(s), `${r.id} reads unknown slice ${s}`);
  for (const s of skills) assert.equal(analysts.filter(r => r.reads.includes(s)).length, 1, `${s} must have exactly one analyst`);
  const layers = Object.fromEntries(DESK_SKILLS.map(s => [s.id, s.layer]));
  for (const r of analysts) assert.equal(r.layer, layers[r.reads[0]], `${r.id} layer`);
});

await t('evidence domains in role files exist in the Evidence Book', () => {
  const domains = new Set(DESK_EVIDENCE.map(e => e.domain)); domains.add('validated');
  for (const r of roles) for (const d of r.evidence) assert.ok(domains.has(d), `${r.id}: unknown evidence domain ${d}`);
});

await t('parseRole rejects broken files loudly', () => {
  assert.throws(() => parseRole('no front matter'), /front-matter/);
  assert.throws(() => parseRole('---\nid: x\nlayer: a\ntier: fast\noutput: analyst_report\n---\n' + 'x'.repeat(100)), /tier/);
  assert.throws(() => parseRole('---\nid: x\nlayer: a\ntier: quick\noutput: nope\n---\n' + 'x'.repeat(100)), /schema/);
  assert.throws(() => parseRole('---\nid: x\nlayer: a\ntier: quick\noutput: analyst_report\n---\nshort'), /too short/);
});

await t('selectEvidence: domain filter, validated first then nulls, capped; "validated" spans domains', () => {
  const macro = selectEvidence(DESK_EVIDENCE, ['macro'], { max: 30 });
  assert.ok(macro.length <= 30 && macro.every(e => e.domain === 'macro'));
  const ranks = macro.map(e => ({ validated: 0, null: 1, context: 2, underpowered: 3 }[e.verdict]));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  const v = selectEvidence(DESK_EVIDENCE, ['validated'], { max: 500 });
  assert.ok(v.every(e => e.verdict === 'validated') && new Set(v.map(e => e.domain)).size > 1);
  assert.deepEqual(selectEvidence(DESK_EVIDENCE, []), []);
});

await t('slice text: gaps named, stale flagged, data cut to budget', () => {
  assert.match(feedBlock({ id: 'fed-path', status: 'empty', error: 'no capture yet' }, 100), /GAP: no capture yet/);
  assert.match(feedBlock({ id: 'x', status: 'stale', asOf: '2026-10-01T00:00:00Z', ageH: 800, data: { a: 1 } }, 100), /STALE/);
  assert.match(feedBlock({ id: 'x', status: 'ok', data: { rows: Array.from({ length: 8 }, () => ({ s: 'y'.repeat(590) })) } }, 1200), /…\[cut\]$/);
  assert.deepEqual(shareBudget([100, 50_000, 300, 20_000], 30_000), [100, 14_800, 300, 14_800], 'small feeds take what they need, big ones share the rest');
  assert.deepEqual(shareBudget([10, 20], 1000), [10, 20]);
  const s = sliceText(pack, ['rates_cb'], { maxChars: 20000 });
  assert.ok(s.feeds > 10 && s.usable < s.feeds && s.text.includes('GAP: down'));
});

await t('analyst prompt carries the role, the schema, its evidence and its data; nothing else', () => {
  const role = roles.find(r => r.id === 'vol_iv');
  const p = buildAnalystPrompt({ role, pack, ledger: DESK_EVIDENCE });
  assert.ok(p.system.includes('volatility analyst') && p.system.includes('"headline"'));
  assert.ok(p.prompt.includes('### vol-forecast') && !p.prompt.includes('### fed-path'));
  assert.ok(p.meta.evidence.length > 0 && p.meta.evidence.every(id => DESK_EVIDENCE.find(e => e.id === id).domain === 'volatility'));
});

// Valid replies for the Phase 2 roles, keyed by output schema.
const PHASE2 = {
  debate_case: (id, prompt) => ({ headline: `${id} case`, rebuttal: prompt.includes('other side') ? 'their case is thin' : '',
    cases: Object.fromEntries((id.startsWith('risk_') ? ['GLOBAL'] : DESK_CCYS).map(c => [c, { argument: `${id} on ${c}`, evidence: ['global_market'], strength: 'medium' }])) }),
  global_view: () => ({ tone: 'risk-off', conviction: 'medium', summary: 'Risk-off won.', drivers: ['credit wider'], flip: ['strong NFP'] }),
  currency_views: () => ({ currencies: Object.fromEntries(DESK_CCYS.map((c, i) => [c, { bias: (i % 5) - 2, conviction: 'medium', why: 'w', flip: 'f' }])), ranking: [] }),
  asset_views: (id, prompt) => { const names = prompt.match(/Rate every instrument in your group: ([^.]+)\./)[1].split(', ');
    return { summary: 's', instruments: Object.fromEntries(names.map(n => [n, { rating: 'SHORT', conviction: 'low', why: `${n} legs`, plan: { zone: 'z', invalidation: 'i', timing: 'London' } }])) }; },
  newsletter_issue: () => ({ subject: 'Dollar and yen bid as credit cracks', standfirst: 'Credit widened. The desk reads risk-off. Midterms at 15:16 UK time.',
    sections: [{ title: 'The global backdrop', label: 'Model output', body: 'b' }, { title: 'The currencies', label: 'Untested interpretation', body: 'c' }, { title: 'What could break the day', label: 'Observed data', body: 'e' }],
    ideas: [{ instrument: 'AUDJPY', view: 'SHORT', size: 0.7, level: 'l', invalidation: 'i', why: 'w' }] }),
  economist_briefs: () => ({ headline: 'CPI matters most', briefs: [{ event: 'US CPI', priced: '0.3% vs 0.3%', sizeAndSpeed: 'Nasdaq 0.3% at 30 min after 5 releases', ifHot: 'n/a', ifCold: 'n/a', bookAtRisk: 'NQ short', watch: 'core' }, { event: 'extra' , sizeAndSpeed: 'x' }] }),
  red_team: () => ({ headline: 'One USD bet in many names', challenges: [{ target: 'USD', kind: 'crowding', severity: 'high', challenge: 'USD long across 9 cards, net +7', ask: 'cut the weakest' }, { target: 'NOPE', challenge: 'x' }] }),
  risk_case: id => ({ headline: `${id} view`, adjustments: [{ target: 'ALL', size: id === 'risk_conservative' ? 0.5 : 1, veto: false, reason: 'r' }, { target: 'XYZ', size: 1 }], warnings: ['NFP'] }),
};

// A fake model: answers every analyst with a valid report and the head with a book. `badFirst` makes chosen
// skills reply with junk on their first try, `alwaysBad` on every try.
function fakeModel({ badFirst = [], alwaysBad = [], headBad = false } = {}) {
  const seen = {}, calls = [];
  const fn = async ({ task, system, prompt }) => {
    calls.push(task);
    if (system.includes('You are the Head of Desk') || system.includes('single macro analyst writing the whole desk')) {
      if (headBad) return { text: '{"headline": "x", "instruments": {}}', usage: { in: 10, out: 5 } };
      const book = { headline: 'Risk-off', global: { tone: 'risk_off', summary: 's' },
        currencies: Object.fromEntries(DESK_CCYS.map(c => [c, { bias: 0, why: 'w' }])),
        instruments: Object.fromEntries(allInstruments().map(i => [i, { rating: 'LONG', conviction: 'medium', why: 'w', invalidation: 'i' }])), risks: [], gaps: [] };
      return { text: JSON.stringify(book), usage: { in: 100, out: 50 } };
    }
    const role = roles.find(r => system.startsWith(r.body)), id = role.id;
    seen[id] = (seen[id] ?? 0) + 1;
    if (alwaysBad.includes(id) || (badFirst.includes(id) && seen[id] === 1)) return { text: 'sorry, here is my analysis', usage: { in: 10, out: 5 } };
    return { text: JSON.stringify(PHASE2[role.output]?.(id, prompt) ?? { headline: `${id} says`, points: [{ claim: 'c', evidence: 'e', impact: { USD: 1 } }], gaps: [], confidence: 'medium' }), usage: { in: 10, out: 5 } };
  };
  return { fn, calls, seen };
}
const parseJson = txt => { try { return JSON.parse(txt); } catch { return null; } };
const clock = () => NOW;

await t('runDesk: full morning, every analyst then the Head, usage summed, labelled untested', async () => {
  const m = fakeModel();
  const run = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: m.fn, parseJson, now: clock, mode: 'quick' });
  const analysts = roles.filter(r => r.output === 'analyst_report').length;
  assert.equal(Object.values(run.analysts).filter(a => a.ok).length, analysts);
  assert.ok(run.head.ok); assert.equal(run.head.book.instruments.GOLD.rating, 'LONG');
  assert.equal(m.calls.filter(c => c === 'desk-analyst').length, analysts);
  assert.equal(m.calls.at(-1), 'desk-head');
  assert.equal(run.usage.in, analysts * 10 + 100);
  assert.equal(run.label, 'context, untested');
  assert.equal(runSummary(run).head.ratings.NQ, 'LONG');
});

await t('runDesk: a bad first reply is retried once with the errors; a skill that keeps failing is recorded and the Head is told', async () => {
  const m = fakeModel({ badFirst: ['rates_cb'], alwaysBad: ['options_oi'] });
  const run = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: m.fn, parseJson, now: clock, mode: 'quick' });
  assert.ok(run.analysts.rates_cb.ok); assert.equal(run.analysts.rates_cb.attempts.length, 2);
  assert.equal(run.analysts.options_oi.ok, false); assert.equal(m.seen.options_oi, 2);
  assert.deepEqual(run.failed, ['options_oi']);
  assert.ok(run.head.ok);
});

await t('runDesk: the Head does not run when fewer than half the analysts succeed; a bad Head book is a failed head', async () => {
  const ids = roles.filter(r => r.output === 'analyst_report').map(r => r.id);
  const run = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: fakeModel({ alwaysBad: ids.slice(0, 7) }).fn, parseJson, now: clock, mode: 'quick' });
  assert.equal(run.head.ok, false); assert.ok(run.head.skipped);
  const run2 = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: fakeModel({ headBad: true }).fn, parseJson, now: clock, mode: 'quick' });
  assert.equal(run2.head.ok, false); assert.equal(run2.head.attempts.length, 2);
});

await t('runDesk: a provider error fails that skill without retrying it', async () => {
  let calls = 0;
  const run = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, now: clock, parseJson, mode: 'quick',
    callModel: async () => { calls++; throw new Error('ANT_KEY not configured'); } });
  assert.equal(calls, roles.filter(r => r.output === 'analyst_report').length);
  assert.ok(Object.values(run.analysts).every(a => !a.ok && a.attempts[0].error));
});

await t('runDesk: a reply cut off at the token cap is retried with twice the cap, same prompt (the 2026-11-03 failure)', async () => {
  const caps = [];
  const fn = async ({ task, maxTokens, prompt }) => {
    if (task === 'desk-head') return fakeModel().fn({ task, system: 'You are the Head of Desk' });
    caps.push(maxTokens);
    if (maxTokens <= CAPS.analyst) return { text: '{"headline": "cut', truncated: true, usage: { in: 1, out: maxTokens } };
    return { text: JSON.stringify({ headline: 'h', points: [{ claim: 'c', evidence: 'e', impact: {} }], gaps: [], confidence: 'low' }), usage: { in: 1, out: 1 } };
  };
  const run = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: fn, parseJson, now: clock, mode: 'quick' });
  assert.ok(Object.values(run.analysts).every(a => a.ok), 'all recovered on the bigger cap');
  assert.ok(caps.includes(CAPS.analyst) && caps.includes(CAPS.analyst * 2));
  const stuck = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, now: clock, parseJson, mode: 'quick',
    callModel: async ({ task }) => task === 'desk-head' ? fakeModel().fn({ task, system: 'You are the Head of Desk' }) : { text: '{"head', truncated: true, usage: {} } });
  assert.match(Object.values(stuck.analysts)[0].errors[0], /cut off at the 32000-token cap/);
});

await t('runDesk full mode: analysts, global debate + ruling, currency debate + ruling, 7 asset desks, 3 risk voices, then the Head', async () => {
  const m = fakeModel();
  const run = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: m.fn, parseJson, now: clock });
  assert.equal(run.mode, 'full');
  const d = run.debate;
  assert.deepEqual(d.failed, []);
  assert.equal(d.global.view.tone, 'risk_off');
  assert.match(d.global.debate.risk_on.view.rebuttal, /thin/, 'rebuttal round ran');
  assert.ok(d.global.debate.openings);
  assert.equal(d.currency.view.ranking.length, 8, 'ranking rebuilt from biases when the manager leaves it out');
  assert.deepEqual(Object.keys(d.assets).sort(), Object.keys(DESK_UNIVERSE).sort());
  assert.equal(d.assets.fx_crosses.view.instruments.EURJPY.plan.timing, 'London');
  assert.deepEqual(Object.keys(d.risk).sort(), ['risk_aggressive', 'risk_conservative', 'risk_neutral']);
  assert.equal(d.risk.risk_conservative.view.adjustments.length, 1, 'unknown target dropped');
  assert.ok(run.head.ok);
  const analysts = roles.filter(r => r.output === 'analyst_report').length;
  assert.equal(run.calls, analysts + 4 + 1 + 4 + 1 + Object.keys(DESK_UNIVERSE).length + 3 + 1 + 1 + 1 + 1, 'plus the red team, the newsletter writer and the single-prompt control');
  assert.equal(run.debate.redTeam.view.challenges.length, 1, 'unknown target dropped'); assert.equal(run.debate.redTeam.view.challenges[0].kind, 'crowding');
  assert.ok(run.control.ok && run.control.book.instruments.GOLD, 'the control wrote its own book'); assert.match(run.rolesHash, /^[0-9a-f]{12}$/);
  assert.ok(run.newsletter.ok); assert.equal(run.newsletter.issue.ideas[0].instrument, 'AUDJPY');
  assert.ok(run.head.book.exposure, 'exposure report attached');
  assert.equal(m.calls.at(-1), 'desk-head', 'the control runs on the deep tier, last');
});

await t('runDesk full mode: the book factor risk (§9ak) reaches the three risk voices and the Head, on the draft at size 1; a failure costs only the section', async () => {
  const prompts = [], m = fakeModel(), seen = [];
  const fn = async a => { prompts.push(a); return m.fn(a); };
  const bookRisk = async cards => { seen.push(cards); return { ok: true, text: 'FACTOR-RISK-MARKER effective bets 1.4', summary: { effectiveBets: 1.4 } }; };
  const run = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: fn, parseJson, now: clock, bookRisk });
  assert.equal(seen.length, 1); assert.ok(Object.values(seen[0]).every(c => c.size === 1));
  const withMarker = prompts.filter(p => p.prompt.includes('FACTOR-RISK-MARKER'));
  const ids = withMarker.map(p => roles.find(r => p.system.startsWith(r.body))?.id ?? (p.system.includes('You are the Head of Desk') ? 'head' : '?'));
  assert.deepEqual(ids.sort(), ['head_of_desk', 'risk_aggressive', 'risk_conservative', 'risk_neutral']);
  assert.equal(run.debate.bookRisk.summary.effectiveBets, 1.4);
  const broken = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: fakeModel().fn, parseJson, now: clock, bookRisk: async () => { throw new Error('OANDA down'); } });
  assert.ok(broken.head.ok); assert.match(broken.debate.bookRisk.text, /failed today: OANDA down/);
});

await t('runDesk full mode: a failed stage is recorded and the next stage falls back; one round skips rebuttals', async () => {
  const m = fakeModel({ alwaysBad: ['global_manager', 'risk_off'] });
  const run = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: m.fn, parseJson, now: clock });
  assert.ok(run.debate.failed.includes('global_manager') && run.debate.failed.includes('risk_off'));
  assert.equal(run.debate.global.view, null);
  assert.ok(run.debate.currency.ok, 'currency stage still ran on the global analysts');
  assert.ok(run.head.ok);
  const one = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: fakeModel().fn, parseJson, now: clock, rounds: 1 });
  assert.equal(one.debate.global.debate.openings, undefined);
  const full = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: fakeModel().fn, parseJson, now: clock });
  assert.equal(full.calls - one.calls, 4, 'one round = no rebuttals in either debate');
});

await t('runDesk: a dropped connection is retried once; a 4xx is not', async () => {
  let n1 = 0, n2 = 0;
  const flaky = async args => { if (args.task !== 'desk-head' && n1++ === 0) { const e = new Error('Anthropic request failed: fetch failed'); e.status = 504; throw e; } return fakeModel().fn(args); };
  const run = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: flaky, parseJson, now: clock, mode: 'quick', retryDelayMs: 0 });
  assert.equal(run.failed.length, 0, 'the analyst that hit the dropped connection recovered');
  const bad = async args => { if (args.task !== 'desk-head') { n2++; const e = new Error('Anthropic 401: invalid x-api-key'); e.status = 502; throw e; } return fakeModel().fn(args); };
  const run2 = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: bad, parseJson, now: clock, mode: 'quick', retryDelayMs: 0 });
  assert.equal(n2, roles.filter(r => r.output === 'analyst_report').length, 'one call each, no retry on a 401');
  assert.ok(run2.head.skipped);
});

await t('head prompt lists every instrument with its legs and the analysts in global-first order', () => {
  const reports = { vol_iv: { skill: 'vol_iv', layer: 'asset', report: { confidence: 'high' } }, global_market: { skill: 'global_market', layer: 'global', report: { confidence: 'low' } } };
  const p = buildHeadPrompt({ role: roles.find(r => r.id === 'head_of_desk'), pack, reports, failed: ['options_oi'] });
  assert.ok(p.prompt.includes('EURJPY (EUR/JPY)') && p.prompt.includes('DE30 (EUR)') && p.prompt.includes('WHEAT (USD)'));
  assert.ok(p.prompt.indexOf('### global_market') < p.prompt.indexOf('### vol_iv'));
  assert.ok(p.prompt.includes('failed today') && p.prompt.includes('options_oi'));
});

await t('runDesk: a run cut off mid-way (server restart) picks up from its checkpoint without paying again', async () => {
  const store = new Map(), checkpoint = { get: k => store.get(k), put: async (k, v) => { store.set(k, structuredClone(v)); } };
  // First process: dies after 15 model calls; calls after that never answer, as when the server is killed.
  const m1 = fakeModel(); let died; const dead = new Promise(r => { died = r; }); let c1 = 0;
  const dying = async a => { if (++c1 > 15) { died(); return new Promise(() => {}); } return m1.fn(a); };
  await Promise.race([runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: dying, parseJson, now: clock, checkpoint, retryDelayMs: 1 }), dead]);
  assert.equal(store.size, 15, 'each answered stage was saved as it finished');
  // Second process: same day, same store.
  const m2 = fakeModel();
  const run = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: m2.fn, parseJson, now: clock, checkpoint, retryDelayMs: 1 });
  const clean = fakeModel(), ref = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: clean.fn, parseJson, now: clock, retryDelayMs: 1 });
  assert.equal(m2.calls.length, clean.calls.length - 15, 'only the stages not yet saved were asked again');
  assert.equal(run.resumed.stages, 15);
  assert.ok(run.head.ok && run.newsletter?.ok);
  assert.deepEqual(run.head.book, ref.head.book);
  assert.equal(run.calls, ref.calls, 'saved attempts still count (they were paid for)');
  assert.equal(ref.resumed, undefined);
  // A changed prompt (other data, other role text) misses the store and is asked afresh.
  const m3 = fakeModel();
  await runDesk({ pack, roles, ledger: [], callModel: m3.fn, parseJson, now: clock, checkpoint, retryDelayMs: 1, mode: 'quick' });
  assert.equal(m3.calls.length, roles.filter(r => r.output === 'analyst_report').length + 1);
});

await t('the economist briefs each release ahead from its playbook, one call, after the book; none without releases', async () => {
  const pb = { family: 'CPI', n: 5, from: '2025-01-15', to: '2026-10-14', surprises: { known: 0, hot: 0, cold: 0 }, markets: { nq: { label: 'Nasdaq', unit: '%', n: 5, abs30: 0.3, abs240: 0.4, peakMin: 8, kept: 0.7, hot: null, cold: null } } };
  const releases = [{ family: 'CPI', event: 'Core CPI m/m', country: 'US', at: '2026-11-04T13:30:00Z', estimate: '0.3%', prev: '0.3%', playbook: pb }];
  const m = fakeModel(), run = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: m.fn, parseJson, now: clock, releases, retryDelayMs: 1 });
  assert.ok(run.economist.ok); assert.equal(run.economist.view.briefs.length, 1, 'no more briefs than releases'); assert.equal(run.economist.view.briefs[0].family, 'CPI');
  const m2 = fakeModel(), run2 = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: m2.fn, parseJson, now: clock, retryDelayMs: 1 });
  assert.equal(run2.economist, null); assert.equal(m.calls.length, m2.calls.length + 1);
});

await t('analyst scorecard (prereg A10): the two managers and the Head read it only when it is passed; no section and no record otherwise', async () => {
  const seen = fm => { const prompts = []; return { prompts, fn: async a => { prompts.push(a); return fm.fn(a); } }; };
  const title = '## Analyst track record (scorecard)';
  const on = seen(fakeModel()), tr = { asOf: '2026-11-03', days: 1, global: 'G-RECORD', currency: 'C-RECORD', head: 'H-RECORD' };
  const run = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: on.fn, parseJson, now: clock, retryDelayMs: 1, trackRecord: tr });
  const who = txt => on.prompts.filter(p => p.prompt.includes(txt)).map(p => roles.find(r => p.system.startsWith(r.body))?.id ?? 'head_of_desk');
  assert.deepEqual(who('G-RECORD'), ['global_manager']); assert.deepEqual(who('C-RECORD'), ['currency_manager']); assert.deepEqual(who('H-RECORD'), ['head_of_desk']);
  assert.ok(on.prompts.filter(p => p.prompt.includes(title)).length === 3);
  assert.deepEqual(run.trackRecord, { asOf: '2026-11-03', days: 1, read: ['global_manager', 'currency_manager', 'head_of_desk'] });
  const off = seen(fakeModel()), run2 = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: off.fn, parseJson, now: clock, retryDelayMs: 1 });
  assert.equal(off.prompts.filter(p => p.prompt.includes(title)).length, 0); assert.equal('trackRecord' in run2, false);
});

console.log(`deskRun: ${n} tests passed`);
