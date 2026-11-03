/**
 * One morning's desk run, Phase 1: every analyst reads its slice of the Desk Pack and reports, then the Head of
 * Desk reads the reports and writes one card per instrument on the five-step scale.
 *
 * The model call and the JSON parse are passed in, so this file has no network and no clock of its own and the
 * whole run can be tested with a fake model (js/deskRun.test.mjs). The server supplies callModel through the
 * router (tasks desk-analyst and desk-head, js/modelRouter.js).
 *
 * Failure rules: a reply that fails its schema is retried once with the errors quoted back. A skill that still
 * fails is recorded as failed with its errors, and the Head is told which areas went unseen. If fewer than half
 * the analysts succeed, the Head does not run: a book written from a third of the desk would read as complete.
 *
 * Design: plans/DESK_ANALYST_PIPELINE.md (Layers 1 and 3, Phase 1).
 */
import { buildAnalystPrompt, buildHeadPrompt, buildStagePrompt, reportsText, groupData, universeText } from './deskRoles.js';
import { validateAnalystReport, validateHeadBook, validateDebateCase, validateGlobalView, validateCurrencyViews, validateAssetViews, validateRiskCase } from './deskSchemas.js';
import { allInstruments, DESK_UNIVERSE, DESK_CCYS, instrumentLegs } from './deskPack.js';
import { capExposure } from './deskExposure.js';
import { newsletterSections } from './deskNewsletter.js';
import { validateNewsletterIssue } from './deskSchemas.js';

export const DESK_RUN_VERSION = 1;
const TASK = { quick: 'desk-analyst', deep: 'desk-head' };
// Output caps. They must leave room for the model's thinking, which is billed as output and counts against the cap.
export const CAPS = { analyst: 16_000, debate: 12_000, manager: 12_000, asset: 16_000, risk: 10_000, head: 32_000, writer: 16_000 };
const MAX_CAP = 32_000;

// A provider error worth one more try: a dropped connection, a timeout, rate limiting or a server error. A 4xx
// (bad key, bad request) is not. On 2026-11-03 the evidence clerk was lost to one "fetch failed".
const transient = e => /fetch failed|ECONNRESET|socket|timed? ?out|did not answer/i.test(e?.message ?? '') || e?.status === 504 || e?.status === 429 || / (429|5\d\d)\b/.test(e?.message ?? '');

async function askValidated({ callModel, parseJson, task, system, prompt, maxTokens, validate, label, retryDelayMs = 4000 }) {
  const attempts = [];
  let userPrompt = prompt, cap = maxTokens;
  for (let i = 0; i < 2; i++) {
    let reply;
    try { reply = await callModel({ task, system, prompt: userPrompt, maxTokens: cap }); }
    catch (e) {
      attempts.push({ error: e.message });
      if (i === 0 && transient(e)) { await new Promise(r => setTimeout(r, retryDelayMs)); continue; }   // one more try after a short wait
      break;
    }
    const parsed = parseJson(reply.text, label);
    // A reply cut off at the token cap (thinking counts against it) is retried with twice the room, not the same
    // cap: on 2026-11-03 every analyst hit a 3,000 cap twice and the run produced nothing.
    const v = parsed ? validate(parsed) : { ok: false, errors: [reply.truncated ? `reply was cut off at the ${cap}-token cap before the JSON was complete` : 'reply was not parseable JSON'] };
    attempts.push({ ok: v.ok, errors: v.ok ? undefined : v.errors, usage: reply.usage ?? null, model: reply.model ?? null, truncated: !!reply.truncated });
    if (v.ok) return { ok: true, value: v.value, notes: v.notes, attempts };
    if (reply.truncated) { cap = Math.min(cap * 2, MAX_CAP); continue; }       // same prompt, more room
    userPrompt = `${prompt}\n\nYour previous reply could not be used: ${v.errors.join('; ')}. Reply again with JSON only, in the exact shape given.`;
  }
  return { ok: false, attempts, errors: attempts.at(-1)?.errors ?? [attempts.at(-1)?.error ?? 'failed'] };
}

/** Run up to `limit` async jobs at a time, preserving order. */
async function pool(items, limit, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

/**
 * roles: parsed role files (js/deskRoles.js parseRole), analysts plus one with id head_of_desk.
 * Returns the run record that the server saves and the pages read.
 */
export async function runDesk({ pack, roles, ledger, callModel, parseJson, now, concurrency = 4, onProgress = () => {}, mode = 'full', rounds = 2, retryDelayMs = 4000, exposureCap = 4, styleExamples = [] }) {
  if (!pack?.skills) throw new Error('no desk pack to run on');
  const head = roles.find(r => r.id === 'head_of_desk');
  if (!head) throw new Error('role head_of_desk is missing');
  const analysts = roles.filter(r => r.output === 'analyst_report');
  const startedAt = now();
  const results = await pool(analysts, concurrency, async role => {
    const { system, prompt, meta } = buildAnalystPrompt({ role, pack, ledger });
    const r = await askValidated({ callModel, parseJson, retryDelayMs, task: TASK[role.tier], system, prompt, maxTokens: CAPS.analyst, label: `desk:${role.id}`,
      validate: o => validateAnalystReport(o, role.id) });
    onProgress({ stage: 'analyst', id: role.id, ok: r.ok, label: 'analysts' });
    return { id: role.id, layer: role.layer, ok: r.ok, report: r.value ?? null, notes: r.notes ?? [], errors: r.errors ?? [], attempts: r.attempts, input: meta };
  });
  const analystsOut = Object.fromEntries(results.map(r => [r.id, r]));
  const good = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok).map(r => r.id);
  let headOut, debate = null;
  if (good.length < Math.ceil(analysts.length / 2)) {
    headOut = { ok: false, skipped: true, errors: [`only ${good.length} of ${analysts.length} analysts succeeded; the Head of Desk did not run`] };
  } else if (mode === 'full') {
    debate = await runDebate({ pack, roles, ledger, callModel, parseJson, results, rounds, onProgress, retryDelayMs });
    const sections = [
      ['Global ruling', debate.global.view ?? '(the global ruling failed today: read the global analysts below)'],
      ['Currency ruling', debate.currency.view ?? '(the currency ruling failed today: read the currency analysts below)'],
      ['Asset desks, by group', Object.fromEntries(Object.entries(debate.assets).map(([g, a]) => [g, a.view ?? { failed: a.errors }]))],
      ['Risk desk', Object.fromEntries(Object.entries(debate.risk).map(([k, v]) => [k, v.view ?? { failed: v.errors }]))],
      ...(debate.global.view ? [] : [['Global analysts', reportsText(results, 'global')]]),
      ...(debate.currency.view ? [] : [['Currency analysts', reportsText(results, 'currency')]]),
      ['Analysts\' headlines', Object.fromEntries(good.map(r => [r.id, r.report.headline]))],
      ['Instruments (with the currency legs each is read from)', universeText()],
    ];
    const missing = [...failed, ...debate.failed];
    const { system, prompt } = buildStagePrompt({ role: head, pack, ledger: [], sections,
      tail: `${missing.length ? `Stages that failed today (treat their areas as unseen): ${missing.join(', ')}.\n` : ''}Write a card for every one of the ${allInstruments().length} instruments, with size and plan where the asset desks and the risk desk support them.` });
    const r = await askValidated({ callModel, parseJson, retryDelayMs, task: TASK[head.tier], system, prompt, maxTokens: CAPS.head, label: 'desk:head',
      validate: o => validateHeadBook(o, allInstruments()) });
    headOut = { ok: r.ok, book: r.value ?? null, notes: r.notes ?? [], errors: r.errors ?? [], attempts: r.attempts };
  } else {
    const reports = Object.fromEntries(good.map(r => [r.id, { skill: r.id, layer: r.layer, report: r.report }]));
    const { system, prompt } = buildHeadPrompt({ role: head, pack, reports, failed });
    const r = await askValidated({ callModel, parseJson, retryDelayMs, task: TASK[head.tier], system, prompt, maxTokens: CAPS.head, label: 'desk:head',
      validate: o => validateHeadBook(o, allInstruments()) });
    headOut = { ok: r.ok, book: r.value ?? null, notes: r.notes ?? [], errors: r.errors ?? [], attempts: r.attempts };
  }
  // The per-currency exposure cap (js/deskExposure.js): arithmetic on the Head's sizes, after the model.
  // Today's forecast lines in price on every card (arithmetic, js/deskRoles.js priceLadder), for the newsletter's
  // ladder charts and the page.
  if (headOut.ok) {
    const gd = groupData(pack, allInstruments());
    for (const [n, c] of Object.entries(headOut.book.instruments)) if (gd[n]?.levels) c.levels = gd[n].levels;
  }
  if (headOut.ok && exposureCap > 0) {
    const capped = capExposure(headOut.book.instruments, { cap: exposureCap });
    headOut.book.instruments = capped.cards;
    headOut.book.exposure = capped.report;
  }
  // Layer 4, the desk edition of the newsletter (full runs only; beside the regular issue, never instead of it).
  let newsletter = null;
  const writer = roles.find(r => r.id === 'newsletter_writer');
  if (mode === 'full' && headOut.ok && writer) {
    onProgress({ stage: 'newsletter', label: 'writing the desk edition of the newsletter' });
    const sections = newsletterSections({ head: headOut, debate, analysts: analystsOut }, styleExamples);
    const { system, prompt } = buildStagePrompt({ role: writer, pack, ledger: [], sections });
    const r = await askValidated({ callModel, parseJson, retryDelayMs, task: TASK[writer.tier], system, prompt, maxTokens: CAPS.writer, label: 'desk:newsletter',
      validate: o => validateNewsletterIssue(o, allInstruments()) });
    newsletter = { ok: r.ok, issue: r.value ?? null, notes: r.notes ?? [], errors: r.errors ?? [], attempts: r.attempts };
  }
  onProgress({ stage: 'head', ok: headOut.ok, label: 'head of desk done' });
  const usage = { in: 0, out: 0 };
  const allAttempts = [...results.flatMap(r => r.attempts), ...(debate?.attempts ?? []), ...(headOut.attempts ?? []), ...(newsletter?.attempts ?? [])];
  for (const a of allAttempts) { usage.in += a.usage?.in ?? 0; usage.out += a.usage?.out ?? 0; }
  return {
    version: DESK_RUN_VERSION,
    date: pack.date,
    packBuiltAt: pack.builtAt,
    packHealth: { ok: pack.health?.ok ?? null, stale: pack.health?.stale ?? null, total: pack.health?.total ?? null },
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(now()).toISOString(),
    label: 'context, untested',
    mode,
    analysts: analystsOut,
    failed,
    debate: debate ? { global: debate.global, currency: debate.currency, assets: debate.assets, risk: debate.risk, failed: debate.failed } : null,
    head: headOut,
    newsletter,
    calls: allAttempts.length,
    usage,
  };
}

// ── Phase 2: the top-down debate (global, then currency, then asset desks, then the risk desk) ──────────────────

/**
 * Layers 2 and 3. Every stage reads the stage above it; a stage that fails is recorded and the next stage falls
 * back to the analysts' reports for that area, so one bad reply costs that stage, not the morning.
 */
export async function runDebate({ pack, roles, ledger, callModel, parseJson, results, rounds = 2, onProgress = () => {}, retryDelayMs = 4000 }) {
  const role = id => { const r = roles.find(x => x.id === id); if (!r) throw new Error(`role ${id} is missing`); return r; };
  const attempts = [];
  const ask = async (r, sections, validate, cap, tail = '') => {
    const { system, prompt } = buildStagePrompt({ role: r, pack, ledger, sections, tail });
    const out = await askValidated({ callModel, parseJson, retryDelayMs, task: TASK[r.tier], system, prompt, maxTokens: cap, label: `desk:${r.id}`, validate });
    attempts.push(...out.attempts);
    return { ok: out.ok, view: out.value ?? null, notes: out.notes ?? [], errors: out.errors ?? [] };
  };
  // Two advocates: openings side by side, then (rounds >= 2) each rebuts the other's opening.
  const argue = async (aId, bId, subjects, sections, stage) => {
    const A = role(aId), B = role(bId), v = o => validateDebateCase(o, subjects);
    const [oa, ob] = await Promise.all([ask(A, sections, v, CAPS.debate), ask(B, sections, v, CAPS.debate)]);
    onProgress({ stage, label: `${stage}: openings` });
    if (rounds < 2 || !oa.ok || !ob.ok) return { [aId]: oa, [bId]: ob };
    const [ra, rb] = await Promise.all([
      ask(A, [...sections, ['The other side\'s opening', ob.view]], v, CAPS.debate, 'Answer their case in "rebuttal", and restate your own case with anything it changed.'),
      ask(B, [...sections, ['The other side\'s opening', oa.view]], v, CAPS.debate, 'Answer their case in "rebuttal", and restate your own case with anything it changed.'),
    ]);
    onProgress({ stage, label: `${stage}: rebuttals` });
    return { [aId]: ra.ok ? ra : oa, [bId]: rb.ok ? rb : ob, openings: { [aId]: oa.view, [bId]: ob.view } };
  };

  // 2a Global
  const gSections = [['Global-layer analyst reports', reportsText(results, 'global')], ['Evidence clerk', reportsText(results, 'evidence')]];
  const gDebate = await argue('risk_on', 'risk_off', ['GLOBAL'], gSections, 'global debate');
  const gView = await ask(role('global_manager'), [...gSections, ['Risk-On case', gDebate.risk_on.view], ['Risk-Off case', gDebate.risk_off.view]], validateGlobalView, CAPS.manager);
  onProgress({ stage: 'global ruling', label: 'global ruling' });
  const globalText = gView.view ?? `(the global ruling failed today)\n${reportsText(results, 'global')}`;

  // 2b Currency
  const cSections = [['Global ruling', globalText], ['Currency-layer analyst reports', reportsText(results, 'currency')]];
  const cDebate = await argue('ccy_strengthen', 'ccy_weaken', DESK_CCYS, cSections, 'currency debate');
  const cView = await ask(role('currency_manager'), [...cSections, ['Strengthen case', cDebate.ccy_strengthen.view], ['Weaken case', cDebate.ccy_weaken.view]], validateCurrencyViews, CAPS.manager);
  onProgress({ stage: 'currency ruling', label: 'currency ruling' });
  const currencyText = cView.view ?? `(the currency ruling failed today)\n${reportsText(results, 'currency')}`;

  // 2c Asset desks, one per group, side by side
  const desk = role('asset_desk');
  const assetReports = reportsText(results, 'asset');
  const groups = Object.entries(DESK_UNIVERSE);
  const assetOut = await pool(groups, 4, async ([g, names]) => {
    const out = await ask(desk, [
      ['Your group', `${g}: ${names.map(n => `${n} (${instrumentLegs(n).join('/')})`).join(', ')}`],
      ['Global ruling', globalText], ['Currency ruling', currencyText],
      ['Asset-layer analyst reports', assetReports],
      ['Per-instrument data for your group (vol lines, today\'s session, implied vol, swing map and trade-decision state where they exist)', groupData(pack, names)],
    ], o => validateAssetViews(o, names), CAPS.asset, `Rate every instrument in your group: ${names.join(', ')}.`);
    onProgress({ stage: 'asset desks', label: `asset desks (${g})` });
    return [g, out];
  });
  const assets = Object.fromEntries(assetOut);

  // Layer 3 risk desk: three voices on the whole book, side by side
  const book = Object.fromEntries(Object.values(assets).flatMap(a => Object.entries(a.view?.instruments ?? {})).map(([n, c]) => [n, { rating: c.rating, conviction: c.conviction, why: c.why }]));
  const rSections = [['Global ruling', globalText], ['Currency ruling', currencyText], ['The asset desks\' book', book],
    ['Events, credit and volatility analysts', reportsText(results.filter(r => ['events_news', 'credit_funding', 'vol_iv'].includes(r.id)))]];
  const voices = ['risk_aggressive', 'risk_conservative', 'risk_neutral'];
  const riskOut = await Promise.all(voices.map(id => ask(role(id), rSections, o => validateRiskCase(o, allInstruments()), CAPS.risk)));
  onProgress({ stage: 'risk desk', label: 'risk desk' });

  const risk = Object.fromEntries(voices.map((v, i) => [v, riskOut[i]]));
  // What failed, judged on each stage's final result (a failed rebuttal falls back to its opening, which is not a failure).
  const failed = [
    ...Object.entries({ risk_on: gDebate.risk_on, risk_off: gDebate.risk_off, global_manager: gView, ccy_strengthen: cDebate.ccy_strengthen, ccy_weaken: cDebate.ccy_weaken, currency_manager: cView })
      .filter(([, v]) => !v.ok).map(([k]) => k),
    ...Object.entries(assets).filter(([, v]) => !v.ok).map(([g]) => `asset_desk:${g}`),
    ...Object.entries(risk).filter(([, v]) => !v.ok).map(([k]) => k),
  ];
  return { global: { debate: gDebate, ...gView }, currency: { debate: cDebate, ...cView }, assets, risk, failed, attempts };
}

/** A run without prompts' bulk, for lists: per analyst ok/headline, and the Head's ratings. */
export function runSummary(run) {
  if (!run) return null;
  return {
    date: run.date, finishedAt: run.finishedAt, failed: run.failed, usage: run.usage,
    analysts: Object.fromEntries(Object.entries(run.analysts).map(([k, a]) => [k, { ok: a.ok, headline: a.report?.headline ?? null }])),
    head: run.head?.ok ? { headline: run.head.book.headline, tone: run.head.book.global.tone,
      ratings: Object.fromEntries(Object.entries(run.head.book.instruments).map(([k, c]) => [k, c.rating])) } : { ok: false, errors: run.head?.errors ?? [] },
  };
}
