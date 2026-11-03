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
import { buildAnalystPrompt, buildHeadPrompt } from './deskRoles.js';
import { validateAnalystReport, validateHeadBook } from './deskSchemas.js';
import { allInstruments } from './deskPack.js';

export const DESK_RUN_VERSION = 1;
const TASK = { quick: 'desk-analyst', deep: 'desk-head' };

async function askValidated({ callModel, parseJson, task, system, prompt, maxTokens, validate, label }) {
  const attempts = [];
  let userPrompt = prompt;
  for (let i = 0; i < 2; i++) {
    let reply;
    try { reply = await callModel({ task, system, prompt: userPrompt, maxTokens }); }
    catch (e) { attempts.push({ error: e.message }); break; }               // a provider error is not retried here: the router already has its own limits
    const parsed = parseJson(reply.text, label);
    const v = parsed ? validate(parsed) : { ok: false, errors: ['reply was not parseable JSON'] };
    attempts.push({ ok: v.ok, errors: v.ok ? undefined : v.errors, usage: reply.usage ?? null, model: reply.model ?? null, truncated: !!reply.truncated });
    if (v.ok) return { ok: true, value: v.value, notes: v.notes, attempts };
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
export async function runDesk({ pack, roles, ledger, callModel, parseJson, now, concurrency = 4, onProgress = () => {} }) {
  if (!pack?.skills) throw new Error('no desk pack to run on');
  const head = roles.find(r => r.id === 'head_of_desk');
  if (!head) throw new Error('role head_of_desk is missing');
  const analysts = roles.filter(r => r.output === 'analyst_report');
  const startedAt = now();
  const results = await pool(analysts, concurrency, async role => {
    const { system, prompt, meta } = buildAnalystPrompt({ role, pack, ledger });
    const r = await askValidated({ callModel, parseJson, task: TASK[role.tier], system, prompt, maxTokens: 3000, label: `desk:${role.id}`,
      validate: o => validateAnalystReport(o, role.id) });
    onProgress({ stage: 'analyst', id: role.id, ok: r.ok });
    return { id: role.id, layer: role.layer, ok: r.ok, report: r.value ?? null, notes: r.notes ?? [], errors: r.errors ?? [], attempts: r.attempts, input: meta };
  });
  const analystsOut = Object.fromEntries(results.map(r => [r.id, r]));
  const good = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok).map(r => r.id);
  let headOut;
  if (good.length < Math.ceil(analysts.length / 2)) {
    headOut = { ok: false, skipped: true, errors: [`only ${good.length} of ${analysts.length} analysts succeeded; the Head of Desk did not run`] };
  } else {
    const reports = Object.fromEntries(good.map(r => [r.id, { skill: r.id, layer: r.layer, report: r.report }]));
    const { system, prompt } = buildHeadPrompt({ role: head, pack, reports, failed });
    const r = await askValidated({ callModel, parseJson, task: TASK[head.tier], system, prompt, maxTokens: 12000, label: 'desk:head',
      validate: o => validateHeadBook(o, allInstruments()) });
    headOut = { ok: r.ok, book: r.value ?? null, notes: r.notes ?? [], errors: r.errors ?? [], attempts: r.attempts };
  }
  onProgress({ stage: 'head', ok: headOut.ok });
  const usage = { in: 0, out: 0 };
  for (const a of [...results.flatMap(r => r.attempts), ...(headOut.attempts ?? [])]) { usage.in += a.usage?.in ?? 0; usage.out += a.usage?.out ?? 0; }
  return {
    version: DESK_RUN_VERSION,
    date: pack.date,
    packBuiltAt: pack.builtAt,
    packHealth: { ok: pack.health?.ok ?? null, stale: pack.health?.stale ?? null, total: pack.health?.total ?? null },
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(now()).toISOString(),
    label: 'context, untested',
    analysts: analystsOut,
    failed,
    head: headOut,
    usage,
  };
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
