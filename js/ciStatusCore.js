/**
 * js/ciStatusCore.js: "is main's CI green, and if not why", from GitHub's public Actions API. Owner-only route /api/ci-status (server.js) and the line on
 * the Desk Terminal's Info map tab (js/terminal/ciStatus.js) use it, so the owner can see the state without opening GitHub.
 *
 * Cheap on purpose: at most 2 + (failing jobs, capped at 2) calls per refresh, cached 10 minutes by the route, so about 24 calls an hour against GitHub's
 * 60 an hour without a token (a GITHUB_TOKEN env var, if set, is used and lifts that limit). Pure functions here; the fetching is injected so it is testable.
 *
 * The one failure that is the owner's own decision (forge.verdict_gate_test, the vol-layer proof gate) is reported as such, so it is not mistaken for a break.
 */
export const REPO = 'rellis3/MacroFXModel';
export const WORKFLOW = 'tests.yml';
const OWNER_GATES = [/forge\.verdict_gate_test/];

const short = s => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 220);

/** A GitHub annotation list -> [{ test, reason, ownerGate }] for the "Test failed: <file>" annotations our two runners print. */
export function failuresFromAnnotations(anns) {
  return (Array.isArray(anns) ? anns : [])
    .filter(a => a?.annotation_level === 'failure' && /^Test failed:/.test(a?.title ?? ''))
    .map(a => ({ test: String(a.title).replace(/^Test failed:\s*/, '').trim(), reason: short(a.message), ownerGate: OWNER_GATES.some(r => r.test(a.title) || r.test(a.message ?? '')) }));
}

/**
 * runs = the workflow_runs array of GET /actions/workflows/tests.yml/runs?branch=main; jobsOf(run) = that run's jobs array; annsOf(job) = its annotations.
 * Returns { ok, state, ... } where state is green | red | red-owner-gate | running | unknown.
 */
export async function summariseCi({ runs, jobsOf, annsOf }) {
  const list = Array.isArray(runs) ? runs : [];
  if (!list.length) return { ok: true, state: 'unknown', note: 'no runs found' };
  const finished = list.find(r => r.status === 'completed' && r.conclusion !== 'cancelled');
  const newest = list[0];
  const out = { ok: true, newest: { sha: String(newest.head_sha ?? '').slice(0, 8), status: newest.status, at: newest.created_at, url: newest.html_url } };
  if (!finished) return { ...out, state: 'running', note: 'no finished run yet' };
  out.run = { sha: String(finished.head_sha ?? '').slice(0, 8), at: finished.updated_at ?? finished.created_at, title: short(finished.display_title).slice(0, 90), conclusion: finished.conclusion, url: finished.html_url };
  out.last10 = list.filter(r => r.status === 'completed' && r.conclusion !== 'cancelled').slice(0, 10).map(r => r.conclusion === 'success');
  if (finished.conclusion === 'success') return { ...out, state: 'green', failing: [] };
  const jobs = (await jobsOf(finished)) ?? [];
  const failing = [];
  for (const j of jobs.filter(x => x.conclusion === 'failure').slice(0, 2)) {
    let fails = []; try { fails = failuresFromAnnotations(await annsOf(j)); } catch { /* reason unknown */ }
    failing.push({ job: j.name, tests: fails });
  }
  const tests = failing.flatMap(f => f.tests);
  const onlyGate = tests.length > 0 && tests.every(t => t.ownerGate);
  return { ...out, state: onlyGate ? 'red-owner-gate' : 'red', failing };
}

/** One line of words for the owner. */
export function ciLine(s) {
  if (!s || s.ok !== true) return '';
  if (s.state === 'unknown') return 'main CI: no answer from GitHub';
  const when = s.run?.at ? ` · last finished run ${String(s.run.at).slice(0, 16).replace('T', ' ')} UTC (${s.run.sha})` : '';
  if (s.state === 'green') return 'main CI: green' + when;
  if (s.state === 'running') return 'main CI: running' + when;
  const names = (s.failing ?? []).flatMap(f => (f.tests.length ? f.tests.map(t => `${f.job}: ${t.test}${t.ownerGate ? ' (your decision: needs the proof run)' : ''}`) : [`${f.job}: reason not read`]));
  return `main CI: red${s.state === 'red-owner-gate' ? ' (only the vol-layer proof gate, which is your decision)' : ''}${when}${names.length ? ' · ' + names.join(' · ') : ''}`;
}

/** GitHub fetch wrapper: get(url) -> parsed JSON; optional token. Used by the server route. */
export function githubGetter(fetchImpl = globalThis.fetch, token = null) {
  return async url => {
    const r = await fetchImpl(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'desk-terminal-ci-status', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    return r.json();
  };
}

/** The whole thing against the real API (or an injected getter in tests). */
export async function fetchCiStatus(get) {
  const base = `https://api.github.com/repos/${REPO}`;
  const runs = (await get(`${base}/actions/workflows/${WORKFLOW}/runs?branch=main&per_page=6`)).workflow_runs;
  return summariseCi({
    runs,
    jobsOf: async run => (await get(`${base}/actions/runs/${run.id}/jobs?per_page=20`)).jobs,
    annsOf: async job => get(`${base}/check-runs/${job.id}/annotations`),
  });
}
