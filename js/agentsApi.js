/**
 * GET /api/agents: the payload builder (pure; server.js passes in what it read). Nothing sensitive: no key, no prompt, no paper text,
 * only counts, booleans, provider and model names.
 *
 *   usedOf(raw)                    -> number | null   (calls used, from a KV counter document { used })
 *   buildAgentsPayload(input)      -> { ok, agents, groups, edges, flows, points, toggles, toggleDefs, caps, models, jobs, stats, spendTodayUsd }
 */
import { AGENTS, EDGES, FLOWS, POINTS, GROUPS, resolveFlow } from './agentRegistry.js';
import { TOGGLES } from './agentSettings.js';

/** `used` from a counter document (a string or object); null when there is none yet or it is unreadable. */
export function usedOf(raw) {
  let d = raw;
  if (typeof raw === 'string') { try { d = JSON.parse(raw); } catch { return null; } }
  const n = Number(d?.used);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/**
 * input: { toggles: { id: { value, source } }, capsRaw: { [kvKey]: raw }, models: { [taskId]: { provider, model } },
 *          jobs: { [jobId]: { pageOn, railwayOn, lastRunAt } }, stats?, spendTodayUsd? }
 */
export function buildAgentsPayload({ toggles = {}, capsRaw = {}, models = {}, jobs = {}, stats = null, spendTodayUsd = null } = {}) {
  const caps = {};
  for (const a of AGENTS) {
    if (!a.cap) continue;
    const used = usedOf(capsRaw[a.cap.key]);
    caps[a.id] = { key: a.cap.key, used: used ?? 0, cap: a.cap.cap, label: a.cap.label, known: used !== null };
  }
  const tasks = [...new Set(AGENTS.map(a => a.modelTask).filter(Boolean))];
  const outModels = {};
  for (const t of tasks) if (models[t]) outModels[t] = { provider: models[t].provider ?? null, model: models[t].model ?? null };
  const jobIds = [...new Set(AGENTS.map(a => a.job).filter(Boolean))];
  const outJobs = {};
  for (const j of jobIds) if (jobs[j]) outJobs[j] = { pageOn: !!jobs[j].pageOn, railwayOn: jobs[j].railwayOn !== false, lastRunAt: jobs[j].lastRunAt ?? null };
  const outToggles = {};
  for (const id of Object.keys(TOGGLES)) outToggles[id] = { value: !!toggles[id]?.value, source: toggles[id]?.source ?? 'default' };
  return {
    ok: true,
    groups: GROUPS,
    agents: AGENTS,
    points: POINTS,
    edges: EDGES,
    flows: FLOWS.map(f => resolveFlow(f)),
    toggleDefs: Object.fromEntries(Object.entries(TOGGLES).map(([id, t]) => [id, { label: t.label, text: t.text, default: t.default, spends: t.spends, agent: t.agent, env: t.env }])),
    toggles: outToggles,
    caps,
    models: outModels,
    jobs: outJobs,
    stats: stats ?? null,
    spendTodayUsd: Number.isFinite(spendTodayUsd) ? spendTodayUsd : null,
  };
}
