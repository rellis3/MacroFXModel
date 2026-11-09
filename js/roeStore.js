/**
 * Research Opportunity Engine (ROE), phase P2: the server side of the laptop push. plans/RESEARCH_OPPORTUNITY_ENGINE.md sections 5, 10.
 *
 * The laptop scanner (python package roe/) freezes a run and POSTs it here. This module only RECORDS it: no scoring, no model call, nothing is
 * suppressed or labelled, and nothing here reads earlier results back into question writing.
 *
 *   recordRun(payload, deps)   validate, then write once. Idempotent by runId:
 *                                new run                     -> { status: 'recorded' }
 *                                same runId, same identity   -> { status: 'already_recorded' }   (no write at all)
 *                                same runId, other identity  -> { status: 'conflict' }           (refused; a correction is a NEW run id)
 *   boardStatus(registry, now) the header the board shows: completed / completed with flags / partial / "discovery not completed for <date>"
 *   listRuns(registry)         newest first, summaries only
 *
 * Storage (names proposed in ROE section 5; one KV key, registered in kv.js, both lists in _worker.js and js/storeRegistry.js):
 *   KV  roe_registry_v1                                    { v:1, runs:{ <runId>: summary }, latestCompleted, updatedAt }   (small: summaries only)
 *   R2  forward/roe/snapshots/<asof>/<runId>/{snapshot,status,episodes,observations}.json   write-once, then
 *   R2  forward/roe/snapshots/<asof>/<runId>/COMMIT.json   written LAST: a run with no marker is incomplete and may be pushed again
 * deps: { kv:{ getStrict(key), put(key, value) }, r2:{ configured(), putJSON(key, obj), getJSON(key) }, now?:()=>Date }
 */
import { createHash } from 'node:crypto';

export const ROE_KV_KEY = 'roe_registry_v1';
export const ROE_R2_PREFIX = 'forward/roe/snapshots';
export const MAX_OBSERVATIONS = 20000;
export const MAX_QUESTIONS = 5000;
export const QUESTIONS_INDEX_KEY = 'forward/roe/questions_index.json';
export const RUN_ID_RE = /^(\d{4}-\d{2}-\d{2})-[0-9a-f]{6,16}$/;

const stable = o => JSON.stringify(sortKeys(o));
function sortKeys(v) { if (Array.isArray(v)) return v.map(sortKeys); if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])); return v; }
export const identityHash = identity => createHash('sha256').update(stable(identity)).digest('hex');

export function validatePayload(p) {
  const err = m => ({ ok: false, error: m });
  if (!p || typeof p !== 'object' || Array.isArray(p)) return err('body must be a JSON object');
  const { runId, snapshot, status, episodes, observations } = p;
  if (typeof runId !== 'string' || !RUN_ID_RE.test(runId)) return err('runId must look like 2026-11-06-<hex>');
  const asof = runId.slice(0, 10);
  if (!snapshot || typeof snapshot !== 'object' || snapshot.runId !== runId) return err('snapshot.runId must equal runId');
  if (snapshot.asof !== asof) return err('snapshot.asof must match the date in runId');
  if (!snapshot.identity || typeof snapshot.identity !== 'object' || snapshot.identity.asof !== asof) return err('snapshot.identity missing or for another date');
  if (!status || typeof status !== 'object' || status.runId !== runId) return err('status.runId must equal runId');
  if (!episodes || typeof episodes !== 'object' || !Array.isArray(episodes.episodes) || episodes.runId !== runId) return err('episodes must be the episodes.json document for this run');
  if (!Array.isArray(observations)) return err('observations must be an array');
  if (observations.length > MAX_OBSERVATIONS) return err(`too many observations (max ${MAX_OBSERVATIONS})`);
  if (p.questions != null) {
    const q = p.questions;
    if (typeof q !== 'object' || q.runId !== runId || !Array.isArray(q.questions)) return err('questions must be the questions.json document for this run');
    if (q.questions.length > MAX_QUESTIONS) return err(`too many questions (max ${MAX_QUESTIONS})`);
    for (const x of q.questions) if (!x || typeof x.specHash !== 'string' || typeof x.episodeId !== 'string' || typeof x.familyId !== 'string') return err('every question needs specHash, episodeId and familyId');
  }
  const seen = new Set();
  for (const o of observations) {
    if (!o || typeof o.obsId !== 'string' || !o.obsId) return err('every observation needs an obsId');
    if (seen.has(o.obsId)) return err(`duplicate obsId ${o.obsId} in one push`);
    seen.add(o.obsId);
  }
  return { ok: true, runId, asof };
}

const emptyRegistry = () => ({ v: 1, runs: {}, latestCompleted: null, updatedAt: null });
async function loadRegistry(kv) {
  const raw = await kv.getStrict(ROE_KV_KEY);
  if (raw == null || raw === '') return emptyRegistry();
  const r = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return r && r.runs ? r : emptyRegistry();
}
export const readRegistry = loadRegistry;

function summarise(p, asof, recordedAt) {
  const st = p.status, flags = st.freshnessFlagCounts ?? {};
  return {
    runId: p.runId, asof, recordedAt,
    state: st.state ?? null, discoveryCompleted: st.discoveryCompleted === true,
    message: st.message ?? null,
    watchVersion: p.snapshot.config?.watchVersion ?? p.snapshot.watchVersion ?? null,
    codeCommit: p.snapshot.codeCommit ?? null,
    itemsListed: st.itemsListed ?? null, itemsMeasured: st.itemsMeasured ?? null,
    observations: p.observations.length, episodes: p.episodes.episodes.length, questions: p.questions?.questions?.length ?? null,
    flaggedInputs: Object.values(flags).reduce((a, b) => a + (Number(b) || 0), 0),
    identitySha256: identityHash(p.snapshot.identity),
  };
}

export async function recordRun(payload, deps) {
  const v = validatePayload(payload);
  if (!v.ok) return { status: 'invalid', error: v.error };
  const { kv, r2 } = deps, now = (deps.now ?? (() => new Date()))();
  if (!r2.configured()) return { status: 'unavailable', error: 'R2 storage is not configured; nothing was recorded' };
  const { runId, asof } = v, idSha = identityHash(payload.snapshot.identity);
  const reg = await loadRegistry(kv);
  const prior = reg.runs[runId];
  if (prior) {
    if (prior.identitySha256 === idSha && payload.questions) await indexQuestions(r2, payload.questions, runId);   // repairs a lost index write; a no-op when the run is already in it
    return prior.identitySha256 === idSha
      ? { status: 'already_recorded', runId, summary: prior }
      : { status: 'conflict', runId, error: 'this runId is already recorded with different inputs, config or commit; a correction is a new run id' };
  }
  const base = `${ROE_R2_PREFIX}/${asof}/${runId}`;
  const commit = await r2.getJSON(`${base}/COMMIT.json`).catch(() => null);
  if (commit) {
    // committed to R2 but the KV summary write was lost: rebuild the summary from the stored files, never write the files again
    const stored = await r2.getJSON(`${base}/snapshot.json`);
    if (identityHash(stored?.identity ?? {}) !== idSha) return { status: 'conflict', runId, error: 'this runId is already committed with different inputs' };
  } else {
    await r2.putJSON(`${base}/snapshot.json`, payload.snapshot);
    await r2.putJSON(`${base}/status.json`, payload.status);
    await r2.putJSON(`${base}/episodes.json`, payload.episodes);
    await r2.putJSON(`${base}/observations.json`, { runId, asof, observations: payload.observations });
    if (payload.questions) await r2.putJSON(`${base}/questions.json`, payload.questions);
    await r2.putJSON(`${base}/COMMIT.json`, { runId, asof, committedAt: now.toISOString(), identitySha256: idSha, observations: payload.observations.length });
  }
  if (payload.questions) await indexQuestions(r2, payload.questions, runId);
  const summary = summarise(payload, asof, now.toISOString());
  reg.runs[runId] = summary;
  const done = Object.values(reg.runs).filter(r => r.discoveryCompleted).sort((a, b) => (a.asof < b.asof ? 1 : a.asof > b.asof ? -1 : a.recordedAt < b.recordedAt ? 1 : -1));
  reg.latestCompleted = done[0]?.runId ?? null;
  reg.updatedAt = now.toISOString();
  await kv.put(ROE_KV_KEY, JSON.stringify(reg));
  return { status: 'recorded', runId, summary };
}

/**
 * The deduplicated question list (R2 forward/roe/questions_index.json). One row per specHash, the same question arising again (a different episode) is
 * COUNTED, not duplicated (owner decision: de-dup of identical specs). Nothing here is scored, labelled or hidden. Idempotent by runId.
 */
export async function indexQuestions(r2, qdoc, runId) {
  const idx = (await r2.getJSON(QUESTIONS_INDEX_KEY).catch(() => null)) ?? { v: 1, runs: [], specs: {} };
  if (idx.runs.includes(runId)) return idx;
  for (const q of qdoc.questions) {
    const e = idx.specs[q.specHash] ??= { specHash: q.specHash, firstDate: q.date, firstRunId: runId, episodeIds: [] };
    if (!e.episodeIds.includes(q.episodeId)) e.episodeIds.push(q.episodeId);
    if (!e.lastDate || q.date >= e.lastDate) { e.lastDate = q.date; e.lastRunId = runId; e.question = q; }
    if (q.date < e.firstDate) { e.firstDate = q.date; e.firstRunId = runId; }
    e.timesRaised = e.episodeIds.length;
  }
  idx.runs.push(runId);
  await r2.putJSON(QUESTIONS_INDEX_KEY, idx);
  return idx;
}

/** Groups by hypothesis family (never one league table). Inside a group: most recently raised first, then title. No result field exists to rank by. */
export function boardGroups(idx) {
  const groups = new Map();
  for (const e of Object.values(idx?.specs ?? {})) {
    const q = e.question; if (!q) continue;
    const g = groups.get(q.familyId) ?? { familyId: q.familyId, familyKey: q.familyKey, mechanism: q.mechanism, rows: [] };
    g.rows.push({ specHash: e.specHash, title: q.title, label: q.label, item: q.item, trigger: q.trigger, side: q.side, why: q.why, observation: q.observation,
      hypothesis: q.hypothesis, dataNeeded: q.dataNeeded, horizons: q.horizons, horizonUnit: q.horizonUnit, baseline: q.baseline, smallestEffect: q.smallestEffect,
      minN: q.minN, mirror: q.mirror, placebo: q.placebo, dataBoundary: q.dataBoundary, inputFlags: q.inputFlags ?? [], watchVersion: q.watchVersion, qtVersion: q.qtVersion,
      firstDate: e.firstDate, lastDate: e.lastDate, timesRaised: e.timesRaised, runId: e.lastRunId });
    groups.set(q.familyId, g);
  }
  const out = [...groups.values()];
  for (const g of out) g.rows.sort((a, b) => (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : a.title < b.title ? -1 : 1));
  out.sort((a, b) => (a.mechanism < b.mechanism ? -1 : 1));
  return out;
}

const isWeekend = d => { const w = d.getUTCDay(); return w === 0 || w === 6; };
/** The latest weekday on or before `now` (UTC), as YYYY-MM-DD: the session the board is expected to be built from. */
export function expectedSessionDate(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  while (isWeekend(d)) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** ROE section 10 item 7. Never shows an older run as today's: if the expected date has no completed run, it says so and names the last one. */
export function boardStatus(reg, now = new Date()) {
  const expected = expectedSessionDate(now);
  const last = reg?.latestCompleted ? reg.runs[reg.latestCompleted] : null;
  const any = Object.values(reg?.runs ?? {}).sort((a, b) => (a.asof < b.asof ? 1 : -1))[0] ?? null;
  const forExpected = Object.values(reg?.runs ?? {}).filter(r => r.asof === expected);
  const doneToday = forExpected.find(r => r.discoveryCompleted);
  if (doneToday) {
    const label = doneToday.state === 'degraded' || doneToday.flaggedInputs > 0 ? 'completed with flags' : 'completed';
    return { state: label, expectedDate: expected, runId: doneToday.runId, asof: doneToday.asof, message: `${label}: run ${doneToday.runId} (${doneToday.asof})`, run: doneToday };
  }
  if (forExpected.length) return { state: 'partial', expectedDate: expected, runId: forExpected[0].runId, asof: expected, message: `partial: ${forExpected[0].message ?? 'the scan did not complete'}; discovery not completed for ${expected}`, run: forExpected[0] };
  return {
    state: last ? 'stale' : 'none', expectedDate: expected, runId: last?.runId ?? null, asof: last?.asof ?? null,
    message: last ? `discovery not completed for ${expected}; last completed run ${last.asof}` : `discovery not completed for ${expected}; no completed run recorded yet`,
    run: last ?? any ?? null,
  };
}

export function listRuns(reg, limit = 30) {
  return Object.values(reg?.runs ?? {}).sort((a, b) => (a.asof === b.asof ? (a.recordedAt < b.recordedAt ? 1 : -1) : a.asof < b.asof ? 1 : -1)).slice(0, limit);
}

/** Constant-time check of the laptop's bearer token. Fails CLOSED: an unset or short server token accepts nothing. */
export function tokenOk(headerValue, serverToken) {
  if (typeof serverToken !== 'string' || serverToken.length < 24) return false;
  const m = /^Bearer\s+(\S+)$/.exec(String(headerValue ?? ''));
  if (!m) return false;
  const a = createHash('sha256').update(m[1]).digest(), b = createHash('sha256').update(serverToken).digest();
  let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
