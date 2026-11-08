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
  for (const f of ['research-case', 'paper-pipeline', 'library-enrichment', 'daily-desk', 'librarian-alone']) assert.ok(FLOWS.some(x => x.id === f), `flow ${f}`);
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
  for (const a of planned) { assert.equal(a.modelTask, null); assert.ok(a.links.some(l => l.href.includes('PAPER_LIBRARY'))); }
  const svg = flowSvg(resolveFlow('library-enrichment'), { models: {}, agents: Object.fromEntries(AGENTS.map(a => [a.id, a])) });
  assert.ok(/class="ag-node ag-g-Library ag-planned"/.test(svg) && svg.includes('ag-e-planned'));
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
