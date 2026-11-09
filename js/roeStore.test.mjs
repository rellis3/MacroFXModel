import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as R from './roeStore.js';

const rd = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const RID = '2026-11-06-964f96056e';
function payload(over = {}) {
  return {
    runId: RID,
    snapshot: { runId: RID, asof: '2026-11-06', identity: { asof: '2026-11-06', codeCommit: 'abc', manifestSha256: 'm1' }, config: { watchVersion: 'roe-watch-1.0.1' }, codeCommit: 'abc' },
    status: { runId: RID, state: 'ok', discoveryCompleted: true, freshnessFlagCounts: {}, itemsListed: 10, itemsMeasured: 9 },
    episodes: { runId: RID, episodes: [{ episodeId: 'e1' }] },
    observations: [{ obsId: 'o1' }, { obsId: 'o2' }],
    ...over,
  };
}
function harness({ r2On = true, now = '2026-11-06T09:00:00Z' } = {}) {
  const kvm = new Map(), r2m = new Map(); let puts = 0;
  return {
    kvm, r2m, get puts() { return puts; },
    deps: {
      kv: { getStrict: async k => kvm.get(k) ?? null, put: async (k, v) => { kvm.set(k, v); } },
      r2: { configured: () => r2On, putJSON: async (k, o) => { puts++; r2m.set(k, JSON.parse(JSON.stringify(o))); }, getJSON: async k => r2m.get(k) ?? null },
      now: () => new Date(now),
    },
  };
}

test('a new run is recorded: R2 files, COMMIT last, KV summary', async () => {
  const h = harness();
  const r = await R.recordRun(payload(), h.deps);
  assert.equal(r.status, 'recorded');
  const keys = [...h.r2m.keys()];
  assert.equal(keys.at(-1), `forward/roe/snapshots/2026-11-06/${RID}/COMMIT.json`);
  assert.equal(keys.length, 5);
  const reg = JSON.parse(h.kvm.get(R.ROE_KV_KEY));
  assert.equal(reg.runs[RID].observations, 2);
  assert.equal(reg.latestCompleted, RID);
});

test('idempotent: the same run pushed again writes nothing and says already recorded', async () => {
  const h = harness();
  await R.recordRun(payload(), h.deps);
  const before = h.puts;
  const r = await R.recordRun(payload(), h.deps);
  assert.equal(r.status, 'already_recorded');
  assert.equal(h.puts, before);
});

test('same run id with different inputs is refused, not overwritten', async () => {
  const h = harness();
  await R.recordRun(payload(), h.deps);
  const p = payload(); p.snapshot.identity.manifestSha256 = 'm2';
  const r = await R.recordRun(p, h.deps);
  assert.equal(r.status, 'conflict');
  assert.equal(h.r2m.get(`forward/roe/snapshots/2026-11-06/${RID}/snapshot.json`).identity.manifestSha256, 'm1');
});

test('a lost KV write is repaired from the R2 commit without rewriting the files', async () => {
  const h = harness();
  await R.recordRun(payload(), h.deps);
  h.kvm.clear();
  const before = h.puts;
  const r = await R.recordRun(payload(), h.deps);
  assert.equal(r.status, 'recorded');
  assert.equal(h.puts, before);
  assert.ok(JSON.parse(h.kvm.get(R.ROE_KV_KEY)).runs[RID]);
});

test('invalid bodies are refused with a reason', async () => {
  const h = harness();
  for (const [p, re] of [
    [null, /JSON object/], [payload({ runId: 'nope' }), /runId/],
    [payload({ observations: [{ obsId: 'a' }, { obsId: 'a' }] }), /duplicate/], [payload({ observations: [{}] }), /obsId/],
    [payload({ snapshot: { runId: RID, asof: '2026-11-07', identity: { asof: '2026-11-07' } } }), /asof/],
  ]) { const r = await R.recordRun(p, h.deps); assert.equal(r.status, 'invalid'); assert.match(r.error, re); }
  assert.equal(h.puts, 0);
});

test('without R2 nothing is recorded', async () => {
  const h = harness({ r2On: false });
  assert.equal((await R.recordRun(payload(), h.deps)).status, 'unavailable');
  assert.equal(h.kvm.size, 0);
});

test('board status: completed, then "discovery not completed" on a later day, never yesterday as today', async () => {
  const h = harness();
  await R.recordRun(payload(), h.deps);
  const reg = JSON.parse(h.kvm.get(R.ROE_KV_KEY));
  assert.equal(R.boardStatus(reg, new Date('2026-11-06T12:00:00Z')).state, 'completed');
  const s = R.boardStatus(reg, new Date('2026-11-09T07:00:00Z'));
  assert.equal(s.state, 'stale');
  assert.match(s.message, /discovery not completed for 2026-11-09; last completed run 2026-11-06/);
  assert.equal(R.boardStatus(reg, new Date('2026-11-08T12:00:00Z')).expectedDate, '2026-11-06', 'weekend expects Friday');
  assert.equal(R.boardStatus({ runs: {} }, new Date('2026-11-09T07:00:00Z')).state, 'none');
});

test('board status: flagged inputs and failed scans', async () => {
  const h = harness();
  const p = payload(); p.status.freshnessFlagCounts = { stale: 3 };
  await R.recordRun(p, h.deps);
  const reg = JSON.parse(h.kvm.get(R.ROE_KV_KEY));
  assert.equal(R.boardStatus(reg, new Date('2026-11-06T12:00:00Z')).state, 'completed with flags');
  const h2 = harness(); const f = payload(); f.status.discoveryCompleted = false; f.status.state = 'failed'; f.status.message = 'no state document';
  await R.recordRun(f, h2.deps);
  assert.equal(R.boardStatus(JSON.parse(h2.kvm.get(R.ROE_KV_KEY)), new Date('2026-11-06T12:00:00Z')).state, 'partial');
});

test('token check fails closed', () => {
  const tok = 'x'.repeat(30);
  assert.equal(R.tokenOk(`Bearer ${tok}`, tok), true);
  assert.equal(R.tokenOk(`Bearer ${tok}x`, tok), false);
  assert.equal(R.tokenOk(undefined, tok), false);
  assert.equal(R.tokenOk('Bearer abc', 'abc'), false, 'short server token accepts nothing');
  assert.equal(R.tokenOk('Bearer ', undefined), false);
  assert.equal(R.tokenOk(`Bearer ${tok}`, ''), false);
});

test('the KV key is registered where the repo requires, and the routes are gated as designed', () => {
  for (const f of ['../kv.js', '../js/storeRegistry.js']) assert.ok(rd(f).includes(R.ROE_KV_KEY), f);
  assert.equal((rd('../_worker.js').match(/'roe_registry_v1'/g) ?? []).length, 2);
  const s = rd('../server.js');
  assert.match(s, /app\.post\('\/api\/roe\/push'[\s\S]{0,400}tokenOk\(req\.get\('authorization'\), process\.env\.ROE_PUSH_TOKEN\)/);
  assert.match(s, /app\.get\('\/api\/roe\/status', _agentsGate/);
  assert.match(s, /app\.get\('\/api\/roe\/runs', _agentsGate/);
});

const Q = (specHash, episodeId, date, over = {}) => ({ specHash, episodeId, familyId: 'f1', familyKey: 'k', mechanism: 'positioning crowding', date, title: `t ${specHash}`, why: 'w', observation: 'o', hypothesis: 'h', status: 'queued', ...over });

test('questions: stored with the run, indexed by specHash; the same spec raised by another episode is counted, not duplicated', async () => {
  const h = harness();
  await R.recordRun(payload({ questions: { runId: RID, questions: [Q('s1', 'e1', '2026-11-06'), Q('s2', 'e2', '2026-11-06')] } }), h.deps);
  assert.ok(h.r2m.has(`forward/roe/snapshots/2026-11-06/${RID}/questions.json`));
  const RID2 = '2026-11-09-aaaaaaaaaa';
  const p2 = payload({ runId: RID2, snapshot: { runId: RID2, asof: '2026-11-09', identity: { asof: '2026-11-09' } }, status: { runId: RID2, state: 'ok', discoveryCompleted: true }, episodes: { runId: RID2, episodes: [] },
    questions: { runId: RID2, questions: [Q('s1', 'e9', '2026-11-09')] } });
  await R.recordRun(p2, h.deps);
  const idx = h.r2m.get(R.QUESTIONS_INDEX_KEY);
  assert.equal(Object.keys(idx.specs).length, 2);
  assert.equal(idx.specs.s1.timesRaised, 2);
  assert.equal(idx.specs.s1.lastDate, '2026-11-09');
  assert.equal(idx.specs.s1.firstDate, '2026-11-06');
  const before = JSON.stringify(idx);
  await R.recordRun(p2, h.deps);   // already recorded: nothing changes
  assert.equal(JSON.stringify(h.r2m.get(R.QUESTIONS_INDEX_KEY)), before);
});

test('questions: a lost index write is repaired by pushing the same run again', async () => {
  const h = harness();
  const p = payload({ questions: { runId: RID, questions: [Q('s1', 'e1', '2026-11-06')] } });
  await R.recordRun(p, h.deps);
  h.r2m.delete(R.QUESTIONS_INDEX_KEY);
  assert.equal((await R.recordRun(p, h.deps)).status, 'already_recorded');
  assert.equal(h.r2m.get(R.QUESTIONS_INDEX_KEY).specs.s1.timesRaised, 1);
});

test('board groups: by family, newest first, and no result or rank field exists on a row', async () => {
  const h = harness();
  await R.recordRun(payload({ questions: { runId: RID, questions: [Q('a', 'e1', '2026-11-01'), Q('b', 'e2', '2026-11-05'), Q('c', 'e3', '2026-11-03', { familyId: 'f2', mechanism: 'dealer gamma state' })] } }), h.deps);
  const g = R.boardGroups(h.r2m.get(R.QUESTIONS_INDEX_KEY));
  assert.deepEqual(g.map(x => x.mechanism), ['dealer gamma state', 'positioning crowding']);
  assert.deepEqual(g[1].rows.map(r => r.specHash), ['b', 'a']);
  for (const r of g.flatMap(x => x.rows)) for (const k of Object.keys(r)) assert.ok(!/result|score|rank|verdict|pass|fail|rejected|dead/i.test(k), k);
});

test('invalid questions are refused', async () => {
  const h = harness();
  assert.equal((await R.recordRun(payload({ questions: { runId: 'x', questions: [] } }), h.deps)).status, 'invalid');
  assert.equal((await R.recordRun(payload({ questions: { runId: RID, questions: [{ specHash: 'a' }] } }), h.deps)).status, 'invalid');
});
