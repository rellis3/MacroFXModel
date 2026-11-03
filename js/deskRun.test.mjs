import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRole, selectEvidence, sliceText, buildAnalystPrompt, buildHeadPrompt, feedBlock } from './deskRoles.js';
import { runDesk, runSummary } from './deskRun.js';
import { DESK_SKILLS, expandFeeds, buildDeskPack, allInstruments, DESK_CCYS } from './deskPack.js';
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
  assert.match(feedBlock({ id: 'x', status: 'ok', data: { s: 'y'.repeat(5000) } }, 1200), /…\[cut\]$/);
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

// A fake model: answers every analyst with a valid report and the head with a book. `badFirst` makes chosen
// skills reply with junk on their first try, `alwaysBad` on every try.
function fakeModel({ badFirst = [], alwaysBad = [], headBad = false } = {}) {
  const seen = {}, calls = [];
  const fn = async ({ task, system, prompt }) => {
    calls.push(task);
    if (task === 'desk-head') {
      if (headBad) return { text: '{"headline": "x", "instruments": {}}', usage: { in: 10, out: 5 } };
      const book = { headline: 'Risk-off', global: { tone: 'risk_off', summary: 's' },
        currencies: Object.fromEntries(DESK_CCYS.map(c => [c, { bias: 0, why: 'w' }])),
        instruments: Object.fromEntries(allInstruments().map(i => [i, { rating: 'LONG', conviction: 'medium', why: 'w', invalidation: 'i' }])), risks: [], gaps: [] };
      return { text: JSON.stringify(book), usage: { in: 100, out: 50 } };
    }
    const id = roles.find(r => system.startsWith(r.body)).id;
    seen[id] = (seen[id] ?? 0) + 1;
    if (alwaysBad.includes(id) || (badFirst.includes(id) && seen[id] === 1)) return { text: 'sorry, here is my analysis', usage: { in: 10, out: 5 } };
    return { text: JSON.stringify({ headline: `${id} says`, points: [{ claim: 'c', evidence: 'e', impact: { USD: 1 } }], gaps: [], confidence: 'medium' }), usage: { in: 10, out: 5 } };
  };
  return { fn, calls, seen };
}
const parseJson = txt => { try { return JSON.parse(txt); } catch { return null; } };
const clock = () => NOW;

await t('runDesk: full morning, every analyst then the Head, usage summed, labelled untested', async () => {
  const m = fakeModel();
  const run = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: m.fn, parseJson, now: clock });
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
  const run = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: m.fn, parseJson, now: clock });
  assert.ok(run.analysts.rates_cb.ok); assert.equal(run.analysts.rates_cb.attempts.length, 2);
  assert.equal(run.analysts.options_oi.ok, false); assert.equal(m.seen.options_oi, 2);
  assert.deepEqual(run.failed, ['options_oi']);
  assert.ok(run.head.ok);
});

await t('runDesk: the Head does not run when fewer than half the analysts succeed; a bad Head book is a failed head', async () => {
  const ids = roles.filter(r => r.output === 'analyst_report').map(r => r.id);
  const run = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: fakeModel({ alwaysBad: ids.slice(0, 7) }).fn, parseJson, now: clock });
  assert.equal(run.head.ok, false); assert.ok(run.head.skipped);
  const run2 = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, callModel: fakeModel({ headBad: true }).fn, parseJson, now: clock });
  assert.equal(run2.head.ok, false); assert.equal(run2.head.attempts.length, 2);
});

await t('runDesk: a provider error fails that skill without retrying it', async () => {
  let calls = 0;
  const run = await runDesk({ pack, roles, ledger: DESK_EVIDENCE, now: clock, parseJson,
    callModel: async () => { calls++; throw new Error('ANT_KEY not configured'); } });
  assert.equal(calls, roles.filter(r => r.output === 'analyst_report').length);
  assert.ok(Object.values(run.analysts).every(a => !a.ok && a.attempts[0].error));
});

await t('head prompt lists every instrument with its legs and the analysts in global-first order', () => {
  const reports = { vol_iv: { skill: 'vol_iv', layer: 'asset', report: { confidence: 'high' } }, global_market: { skill: 'global_market', layer: 'global', report: { confidence: 'low' } } };
  const p = buildHeadPrompt({ role: roles.find(r => r.id === 'head_of_desk'), pack, reports, failed: ['options_oi'] });
  assert.ok(p.prompt.includes('EURJPY (EUR/JPY)') && p.prompt.includes('DE30 (EUR)') && p.prompt.includes('WHEAT (USD)'));
  assert.ok(p.prompt.indexOf('### global_market') < p.prompt.indexOf('### vol_iv'));
  assert.ok(p.prompt.includes('failed today') && p.prompt.includes('options_oi'));
});

console.log(`deskRun: ${n} tests passed`);
