// js/terminal/ciStatus.test.mjs: the CI line on the Info map tab. node js/terminal/ciStatus.test.mjs
import assert from 'node:assert/strict';
import { ciHtml, mountCiStatus } from './ciStatus.js';

const red = { ok: true, state: 'red', run: { at: '2026-11-16T15:05:00Z', sha: 'abcdef12', url: 'https://github.com/x/y/actions/runs/1' }, last10: [false, false, true], failing: [{ job: 'javascript', tests: [{ test: 'js/a.test.mjs', reason: 'x', ownerGate: false }] }] };
let h = ciHtml(red);
assert.match(h, /main CI: red/); assert.match(h, /javascript: js\/a\.test\.mjs/); assert.match(h, /class="dn"/); assert.match(h, /○○●/); assert.ok(!/<a /.test(h), 'no raw link out of the desk zone (js/terminal/links.test.mjs)');
h = ciHtml({ ok: true, state: 'red-owner-gate', failing: [{ job: 'python', tests: [{ test: 'forge.verdict_gate_test', reason: '', ownerGate: true }] }] });
assert.match(h, /class="gold"/); assert.match(h, /your decision/);
assert.match(ciHtml({ ok: true, state: 'green', run: { at: '2026-11-16T15:05:00Z', sha: 'abcdef12' } }), /class="up"/);

// nothing usable -> nothing drawn (a desk login gets a 403 body, an offline page throws)
assert.equal(ciHtml(null), ''); assert.equal(ciHtml({ ok: false, error: 'Owner only' }), '');
const host = { innerHTML: 'old' };
assert.equal(await mountCiStatus(host, { fetchJson: async () => ({ ok: false }) }), false); assert.equal(host.innerHTML, '');
assert.equal(await mountCiStatus(host, { fetchJson: async () => { throw new Error('offline'); } }), false);
assert.equal(await mountCiStatus(host, { fetchJson: async () => red }), true); assert.match(host.innerHTML, /main CI: red/);
assert.equal(await mountCiStatus(null), false);
console.log('OK');
