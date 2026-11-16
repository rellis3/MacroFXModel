// js/ciStatusCore.test.mjs: the owner's "is main green" line. node js/ciStatusCore.test.mjs
import assert from 'node:assert/strict';
import { summariseCi, ciLine, failuresFromAnnotations, fetchCiStatus } from './ciStatusCore.js';

const run = (o = {}) => ({ id: 1, head_sha: 'abcdef1234567890', status: 'completed', conclusion: 'failure', created_at: '2026-11-16T15:00:00Z', updated_at: '2026-11-16T15:05:00Z', display_title: 'a change', html_url: 'u', ...o });
const ann = (title, message, level = 'failure') => ({ annotation_level: level, title, message });

assert.deepEqual(failuresFromAnnotations([ann('Test failed: js/a.test.mjs', 'not ok 1 - x'), ann('', 'Process completed with exit code 1.'), ann('Test failed: x', 'warn', 'warning')]).map(f => f.test), ['js/a.test.mjs']);

// green
let s = await summariseCi({ runs: [run({ conclusion: 'success' })], jobsOf: async () => [], annsOf: async () => [] });
assert.equal(s.state, 'green'); assert.match(ciLine(s), /^main CI: green/);

// red with a real failure, and the owner gate recognised
const jobs = [{ id: 11, name: 'javascript', conclusion: 'failure' }, { id: 12, name: 'python', conclusion: 'failure' }];
const annsBy = { 11: [ann('Test failed: js/infoMap.test.mjs', 'FAILED, 1 problem: - page x')], 12: [ann('Test failed: forge.verdict_gate_test', 'test_banked::AssertionError: vol-layer-rule-a-confirm-s1: no checks.json')] };
s = await summariseCi({ runs: [run()], jobsOf: async () => jobs, annsOf: async j => annsBy[j.id] });
assert.equal(s.state, 'red'); assert.match(ciLine(s), /javascript: js\/infoMap\.test\.mjs/); assert.match(ciLine(s), /your decision/);

s = await summariseCi({ runs: [run()], jobsOf: async () => [jobs[1]], annsOf: async j => annsBy[j.id] });
assert.equal(s.state, 'red-owner-gate'); assert.match(ciLine(s), /only the vol-layer proof gate/);

// a cancelled run is skipped for the verdict; an in-progress one is reported as running only when nothing has finished
s = await summariseCi({ runs: [run({ status: 'in_progress', conclusion: null }), run({ conclusion: 'cancelled' }), run({ conclusion: 'success', head_sha: '1111111122' })], jobsOf: async () => [], annsOf: async () => [] });
assert.equal(s.state, 'green'); assert.equal(s.run.sha, '11111111');
s = await summariseCi({ runs: [run({ status: 'in_progress', conclusion: null })], jobsOf: async () => [], annsOf: async () => [] });
assert.equal(s.state, 'running');
assert.equal((await summariseCi({ runs: [], jobsOf: async () => [], annsOf: async () => [] })).state, 'unknown');
assert.equal(ciLine(null), '');

// an annotation fetch that fails does not hide the red state
s = await summariseCi({ runs: [run()], jobsOf: async () => [jobs[0]], annsOf: async () => { throw new Error('rate limited'); } });
assert.equal(s.state, 'red'); assert.match(ciLine(s), /reason not read/);

// call budget: 1 runs call + 1 jobs call + at most 2 annotation calls
const calls = [];
const get = async url => { calls.push(url); if (/\/runs\?/.test(url)) return { workflow_runs: [run()] }; if (/\/jobs/.test(url)) return { jobs: [...jobs, { id: 13, name: 'third', conclusion: 'failure' }] }; return []; };
await fetchCiStatus(get);
assert.ok(calls.length <= 4, `used ${calls.length} calls`);
console.log('OK');
