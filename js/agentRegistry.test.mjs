// The agent registry (js/agentRegistry.js): every reference resolves, so the Agents tab can never show a dangling arrow or a cap that is not kept.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AGENTS, POINTS, EDGES, FLOWS, GROUPS, UNMAPPED_ROLES, edgeKey, nodeIds, resolveFlow } from './agentRegistry.js';
import { TOGGLES } from './agentSettings.js';
import { TASK_CLASS } from './modelRouter.js';
import { flowSvg, layoutFlow } from './agentFlowSvg.js';

const rd = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const ids = AGENTS.map(a => a.id);

test('agent ids are unique, kebab-case, and every agent has the full shape', () => {
  assert.equal(new Set(ids).size, ids.length);
  for (const a of AGENTS) {
    assert.match(a.id, /^[a-z]+(-[a-z]+)*$/);
    assert.ok(GROUPS.includes(a.group), `${a.id} group ${a.group}`);
    assert.ok(a.name && a.purpose.length > 30 && a.trigger, `${a.id} has a name, purpose and trigger`);
    for (const k of ['reads', 'writes', 'toggles', 'links', 'roles']) assert.ok(Array.isArray(a[k]), `${a.id}.${k}`);
    assert.equal(typeof a.spends, 'boolean'); assert.equal(typeof a.planned, 'boolean');
    assert.ok(a.purpose.split(/(?<=[.!?])\s+/).length <= 4, `${a.id}: purpose is a few plain sentences`);
  }
  for (const g of GROUPS) assert.ok(AGENTS.some(a => a.group === g), `group ${g} has agents`);
  assert.ok(!Object.keys(POINTS).some(k => ids.includes(k)), 'a point and an agent never share an id');
});

test('every modelTask exists in AI_TASKS (js/modelRouter.js TASK_CLASS)', () => {
  for (const a of AGENTS) if (a.modelTask) assert.ok(TASK_CLASS[a.modelTask], `${a.id}: unknown model task ${a.modelTask}`);
  for (const a of AGENTS) if (a.modelTask === null && !a.planned) assert.equal(a.spends, false, `${a.id} makes no model call so it cannot spend`);
  for (const a of AGENTS) if (a.modelTask && !a.planned) assert.equal(a.spends, true, `${a.id} calls a model so it spends`);
});

test('every edge endpoint exists and every flow resolves (nodes, edges, no edge leaving the flow, a layout cell per node)', () => {
  const all = nodeIds();
  for (const e of EDGES) { assert.ok(all.has(e.from), `edge from ${e.from}`); assert.ok(all.has(e.to), `edge to ${e.to}`); assert.ok(['data', 'control'].includes(e.kind)); assert.ok(e.label); }
  assert.equal(new Set(EDGES.map(edgeKey)).size, EDGES.length, 'one edge per (from, to) pair');
  for (const f of ['research-case', 'research-discovery', 'paper-pipeline', 'library-enrichment', 'daily-desk', 'librarian-alone']) assert.ok(FLOWS.some(x => x.id === f), `flow ${f}`);
  for (const f of FLOWS) {
    const r = resolveFlow(f);
    const cells = r.nodes.map(n => `${n.col},${n.row}`); assert.equal(new Set(cells).size, cells.length, `${f.id}: two boxes share a cell`);
    for (const n of r.nodes) assert.ok(Number.isInteger(n.col) && Number.isInteger(n.row));
    const svg = flowSvg(r, { models: {}, agents: {} }); assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>') && svg.includes('data-node='));
    const L = layoutFlow(r); for (const e of L.edges) assert.ok(/^M[\d.,-]+ /.test(e.d));
  }
});

test('the research case flow runs owner -> librarian (optional) -> three lenses -> Head of Research -> plan -> quick test / architect', () => {
  const r = resolveFlow('research-case'), has = (a, b) => r.edges.some(e => e.from === a && e.to === b);
  assert.ok(r.edges.find(e => e.from === 'library-librarian' && e.to === 'researcher-quant').optional, 'the librarian step is optional (flagged)');
  for (const l of ['researcher-quant', 'researcher-macro', 'researcher-flow']) { assert.ok(has(l, 'head-of-research')); assert.ok(has('case-store', l)); assert.ok(has('library-librarian', l)); }
  assert.ok(has('head-of-research', 'plan') && has('plan', 'quick-test') && has('plan', 'system-architect'));
  assert.ok(FLOWS.find(f => f.id === 'librarian-alone').nodes.some(n => n.id === 'library-librarian'));
});

test('planned agents are drawn dashed and never spend; the edges to them are planned', () => {
  const planned = AGENTS.filter(a => a.planned); assert.ok(planned.length >= 2);
  for (const a of planned) { assert.equal(a.modelTask, null); assert.ok(a.links.some(l => /PAPER_LIBRARY|RESEARCH_OPPORTUNITY_ENGINE/.test(l.href)), `${a.id} links to its plan`); }
  const svg = flowSvg(resolveFlow('library-enrichment'), { models: {}, agents: Object.fromEntries(AGENTS.map(a => [a.id, a])) });
  assert.ok(/class="ag-node ag-g-Library ag-planned"/.test(svg) && svg.includes('ag-e-planned'));
});

const BUILT_ROE = ['opportunity-scanner', 'question-writer'];   // P1-P3 built; the rest are drawn as planned
test('the Research Opportunity Engine is drawn as built or planned: processing services make no model call, and nothing is built', () => {
  const roe = ['opportunity-scanner', 'question-writer', 'historical-evaluator', 'forward-tracker', 'research-qa', 'acceptance-check'];
  for (const id of roe) { const a = AGENTS.find(x => x.id === id); assert.ok(a, id); assert.equal(!!a.planned, !BUILT_ROE.includes(id), `${id} planned flag matches what is built`); assert.equal(a.kind, 'service', `${id} is a processing service`); assert.equal(a.modelTask, null, `${id}: no model call`); assert.equal(a.spends, false); assert.equal(a.job, null, `${id}: no scheduled job yet`); assert.equal(a.cap, null); assert.deepEqual(a.roles, []); assert.ok(a.links.some(l => l.href === 'plans/RESEARCH_OPPORTUNITY_ENGINE.md')); }
  for (const id of ['opportunity-scanner', 'question-writer', 'historical-evaluator', 'forward-tracker']) assert.equal(AGENTS.find(a => a.id === id).group, 'Data');
  assert.ok(fs.existsSync(new URL('../plans/RESEARCH_OPPORTUNITY_ENGINE.md', import.meta.url)), 'the plan doc exists');
  for (const id of ['question-queue', 'opportunity-registry', 'ranked-board', 'research-approved', 'design-approved', 'validation-approved', 'input-snapshot', 'evaluation-store', 'forward-ledger', 'stage-discovery', 'stage-confirmation', 'stage-forward', 'owner-research-decision', 'owner-design-decision']) assert.equal(POINTS[id].planned, true, `${id} planned`);
  assert.ok(/laptop/i.test(AGENTS.find(a => a.id === 'opportunity-scanner').purpose) && /Python/.test(AGENTS.find(a => a.id === 'opportunity-scanner').purpose));
  const r = resolveFlow('research-discovery');
  assert.ok(r.edges.filter(e => e.planned).length >= 10 && r.nodes.some(n => n.id === 'opportunity-registry' && n.planned));
  assert.ok(!POINTS['lockbox-boundary'].planned, 'the lockbox rule exists today; only its use by the ROE is planned');
  assert.ok(flowSvg(r, { models: {}, agents: Object.fromEntries(AGENTS.map(a => [a.id, a])) }).includes('ag-planned'));
});

test('ROE anti-bias rules: the registry never reaches the question writer, nothing opens a case by itself, no model authorises its own work', () => {
  const into = id => EDGES.filter(e => e.to === id), out = id => EDGES.filter(e => e.from === id);
  assert.deepEqual(into('question-writer').map(e => e.from), ['opportunity-scanner'], 'the writer is fed by the scanner only, never by earlier results');
  assert.deepEqual(out('opportunity-registry').map(e => e.to), ['historical-evaluator'], 'the registry answers the evaluator (trial and family count, same spec) and nobody else');
  assert.deepEqual(into('opportunity-registry').map(e => e.from).sort(), ['historical-evaluator', 'question-queue'], 'observations in, no result ever flows back out to anything but the evaluator');
  assert.ok(!EDGES.some(e => e.from === 'opportunity-registry' && ['question-writer', 'ranked-board', 'question-queue', 'opportunity-scanner'].includes(e.to)), 'no demoting or hiding from the registry');
  assert.deepEqual(into('case-store').filter(e => e.from === 'ranked-board').map(e => e.kind), ['control'], 'a case opens by a button press');
  assert.ok(!EDGES.some(e => e.from === 'historical-evaluator' && e.to === 'case-store') && !EDGES.some(e => e.from === 'question-queue' && e.to === 'case-store'), 'no automatic case');
  assert.deepEqual(into('research-approved').map(e => e.from), ['owner-research-decision'], 'the owner authorises Research approved');
  assert.deepEqual(into('design-approved').map(e => e.from), ['owner-design-decision'], 'the owner authorises Design approved');
  assert.deepEqual(into('owner-research-decision').map(e => e.from), ['head-of-research'], 'the Head only recommends');
  assert.deepEqual(into('owner-design-decision').map(e => e.from), ['system-architect'], 'the architect only recommends');
  for (const id of ['research-approved', 'design-approved', 'validation-approved']) assert.ok(into(id).every(e => e.kind === 'control'), `${id} is set by a control edge`);
  assert.deepEqual(into('validation-approved').map(e => e.from), ['acceptance-check'], 'only the deterministic check sets Validation approved');
  assert.ok(!EDGES.some(e => e.to.endsWith('-approved') && AGENTS.some(a => a.id === e.from && a.modelTask)), 'no model-calling agent writes an approval status directly');
  assert.deepEqual(out('research-approved'), [], 'Research approved is not a build instruction');
  assert.deepEqual(into('research-qa').map(e => e.from).sort(), ['evaluation-store', 'quick-test', 'researcher-flow', 'researcher-macro', 'researcher-quant']);
  assert.deepEqual(out('research-qa').map(e => e.to).sort(), ['head-of-research', 'ranked-board']);
  assert.deepEqual(into('forward-ledger').map(e => e.from), ['stage-forward'], 'only Stage 3 writes forward outcomes');
  assert.deepEqual(into('evaluation-store').map(e => e.from).sort(), ['stage-confirmation', 'stage-discovery'], 'historical results come only from Stages 1 and 2');
  assert.ok(!EDGES.some(e => e.from === 'evaluation-store' && e.to === 'question-writer'), 'results never reach the writer');
  assert.ok(/never labels a question rejected or dead/.test(POINTS['opportunity-registry'].note));
});

test('the research case flow shows Research QA before the Head and the three approvals after it', () => {
  const r = resolveFlow('research-case'), has = (a, b) => r.edges.some(e => e.from === a && e.to === b);
  for (const l of ['researcher-quant', 'researcher-macro', 'researcher-flow', 'quick-test']) assert.ok(has(l, 'research-qa'), l);
  assert.ok(has('research-qa', 'head-of-research') && has('head-of-research', 'owner-research-decision') && has('owner-research-decision', 'research-approved') && has('system-architect', 'owner-design-decision') && has('owner-design-decision', 'design-approved') && has('acceptance-check', 'validation-approved'));
  for (const route of [['owner', 'case-store'], ['ranked-board', 'case-store'], ['dossier', 'case-store'], ['hypothesis', 'literature-librarian'], ['literature-librarian', 'search-engines'], ['research-synthesist', 'dossier']]) assert.ok(has(...route), `three routes into the Case registry: ${route.join('>')}`);
  const d = resolveFlow('research-discovery'), dh = (a, b) => d.edges.some(e => e.from === a && e.to === b);
  assert.ok(dh('daily-data', 'input-snapshot') && dh('input-snapshot', 'opportunity-scanner') && dh('opportunity-scanner', 'question-writer') && dh('question-writer', 'question-queue') && dh('question-queue', 'opportunity-registry') && dh('question-queue', 'historical-evaluator') && dh('historical-evaluator', 'stage-discovery') && dh('stage-discovery', 'stage-confirmation') && dh('stage-discovery', 'evaluation-store') && dh('stage-confirmation', 'evaluation-store') && dh('evaluation-store', 'research-qa') && dh('research-qa', 'ranked-board') && dh('ranked-board', 'case-store') && dh('case-store', 'head-of-research') && dh('head-of-research', 'owner-research-decision') && dh('owner-research-decision', 'research-approved'));
  assert.ok(dh('forward-tracker', 'stage-forward') && dh('stage-forward', 'forward-ledger') && dh('forward-ledger', 'ranked-board'), 'Stage 3 writes the Forward Ledger');
  for (const st of ['stage-discovery', 'stage-confirmation', 'stage-forward']) assert.ok(dh('lockbox-boundary', st), `the lockbox boundary is drawn against ${st}`);
  assert.ok(!dh('lockbox-boundary', 'opportunity-scanner'), 'the scanner observes current state; the boundary governs hypothesis selection and evaluation');
  for (const id of ['opportunity-registry', 'evaluation-store', 'forward-ledger', 'case-store']) assert.ok(d.nodes.some(n => n.id === id), `the registry split shows ${id}`);
});

test('every cap key is a registered KV key (kv.js, both _worker.js lists, storeRegistry) and its number is the module constant', async () => {
  const kvSrc = rd('../kv.js'), wk = rd('../_worker.js'), reg = rd('./storeRegistry.js');
  const caps = AGENTS.filter(a => a.cap);
  assert.ok(caps.length >= 3);
  for (const a of caps) {
    const k = a.cap.key;
    assert.ok(kvSrc.includes(`'${k}'`), `${k} in kv.js`);
    assert.ok(wk.split(`'${k}'`).length - 1 >= 2, `${k} in both _worker.js lists`);
    assert.ok(new RegExp(`\\b${k}:`).test(reg), `${k} in storeRegistry`);
  }
  const { MATH_CAP } = await import('./libraryMath.js'), { FIGS_CAP } = await import('./libraryFigs.js'), { LIBRARIAN_CAP } = await import('./libraryLibrarian.js');
  const by = Object.fromEntries(caps.map(a => [a.cap.key, a.cap.cap]));
  assert.deepEqual(by, { library_librarian_v1: LIBRARIAN_CAP, library_figs_v1: FIGS_CAP, library_math_v1: MATH_CAP });
});

test('the settings key agent_settings_v1 is registered in kv.js, both _worker.js lists and the store registry', () => {
  assert.ok(rd('../kv.js').includes("'agent_settings_v1'"));
  assert.equal(rd('../_worker.js').split("'agent_settings_v1'").length - 1, 2);
  assert.ok(/agent_settings_v1:/.test(rd('./storeRegistry.js')));
});

test('toggles: every registered switch has an agent that shows it, and every agent switch is registered', () => {
  for (const [id, t] of Object.entries(TOGGLES)) { const a = AGENTS.find(x => x.id === t.agent); assert.ok(a, `${id}: agent ${t.agent}`); assert.ok(a.toggles.includes(id), `${a.id} lists ${id}`); }
  for (const a of AGENTS) for (const t of a.toggles) assert.ok(TOGGLES[t], `${a.id}: unknown switch ${t}`);
});

test('every desk role file is shown by an agent, or listed as unmapped on purpose; no agent names a role that does not exist', () => {
  const files = fs.readdirSync(new URL('../desk/roles/', import.meta.url)).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''));
  assert.ok(files.length >= 40);
  for (const f of files) assert.match(rd(`../desk/roles/${f}.md`), new RegExp(`^---\\r?\\n[\\s\\S]*?\\bid:\\s*${f}\\b`), `${f}.md id matches its file name`);
  const mapped = new Set(AGENTS.flatMap(a => a.roles));
  const missing = files.filter(f => !mapped.has(f) && !UNMAPPED_ROLES.includes(f));
  assert.deepEqual(missing, [], `desk roles with no agent: ${missing.join(', ')}`);
  for (const r of mapped) assert.ok(files.includes(r), `agent names a role file that is not there: ${r}`);
  const seen = AGENTS.flatMap(a => a.roles); assert.equal(new Set(seen).size, seen.length, 'a role belongs to one agent');
});

test('scheduled jobs named by agents exist in server.js _AI_JOBS', () => {
  const src = rd('../server.js'), blk = src.slice(src.indexOf('var _AI_JOBS = {'), src.indexOf('var _aiJobsOff'));
  for (const a of AGENTS.filter(x => x.job)) assert.ok(new RegExp(`\\b${a.job}:\\s*\\{`).test(blk), `${a.id}: job ${a.job}`);
});

test('no agent text carries a secret-looking value or a placeholder', () => {
  const all = JSON.stringify({ AGENTS, POINTS, EDGES, FLOWS });
  assert.ok(!/sk-[a-z0-9]{10}|api[_-]?key\s*[:=]\s*\S{8}|password/i.test(all));
  assert.ok(!/TODO|TBD|lorem/i.test(all));
});
