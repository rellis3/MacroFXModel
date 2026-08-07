// Unit test for server.js's `capMap` TTL-cache bound (Phase 1, tech-debt plan).
//
// `capMap` lives inline in server.js — importing it would mean booting the whole
// server, and copying the body into this file would create exactly the kind of
// second copy this repo forbids (Lego Principle 1). So the test EXTRACTS the real
// function source out of server.js and evaluates that. If someone edits the body
// in server.js, this test exercises the edited version.
//
// Run: node js/capMap.test.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

const m = src.match(/function capMap\(map, max\) \{[\s\S]*?\n\}/);
assert.ok(m, 'capMap not found in server.js — did it get renamed or removed?');
const capMap = new Function(`${m[0]}; return capMap;`)();

let pass = 0;
const t = (name, fn) => { fn(); console.log(`  ok  ${name}`); pass++; };

t('no-op when under the cap (the normal case — nothing is ever evicted)', () => {
  const c = new Map([['a', 1], ['b', 2]]);
  capMap(c, 10);
  assert.equal(c.size, 2);
  assert.deepEqual([...c.keys()], ['a', 'b']);
});

t('no-op when exactly at the cap', () => {
  const c = new Map([['a', 1], ['b', 2], ['c', 3]]);
  capMap(c, 3);
  assert.equal(c.size, 3);
  assert.deepEqual([...c.keys()], ['a', 'b', 'c']);
});

t('evicts oldest-first (FIFO via Map insertion order)', () => {
  const c = new Map([['a', 1], ['b', 2], ['c', 3], ['d', 4]]);
  capMap(c, 2);
  assert.equal(c.size, 2);
  assert.deepEqual([...c.keys()], ['c', 'd'], 'must drop the OLDEST entries');
});

t('size never exceeds max under repeated insertion', () => {
  const c = new Map();
  for (let i = 0; i < 1000; i++) {
    c.set(`k${i}`, i);
    capMap(c, 50);
    assert.ok(c.size <= 50, `size ${c.size} exceeded cap at i=${i}`);
  }
  assert.equal(c.size, 50);
  // The most-recent 50 survive; the value for a surviving key is untouched.
  assert.equal(c.get('k999'), 999);
  assert.equal(c.has('k950'), true,  'k950..k999 are the newest 50 and must survive');
  assert.equal(c.has('k949'), false, 'k949 is the 51st-newest and must be evicted');
});

t('re-setting an existing key does not grow the Map (refresh keeps working)', () => {
  const c = new Map([['a', 1], ['b', 2]]);
  c.set('a', 99);
  capMap(c, 2);
  assert.equal(c.size, 2);
  assert.equal(c.get('a'), 99, 'a refreshed cache entry must keep its NEW value');
});

t('terminates on an empty Map and on max=0', () => {
  const e = new Map();
  capMap(e, 5);
  assert.equal(e.size, 0);
  const c = new Map([['a', 1]]);
  capMap(c, 0);
  assert.equal(c.size, 0);
});

t('values are returned intact — eviction never mutates a surviving entry', () => {
  const payload = { data: { deep: [1, 2, 3] }, ts: 123 };
  const c = new Map([['old', { data: {}, ts: 0 }], ['keep', payload]]);
  capMap(c, 1);
  assert.equal(c.get('keep'), payload, 'surviving value must be the same object');
  assert.deepEqual(c.get('keep').data.deep, [1, 2, 3]);
});

console.log(`\ncapMap: ${pass}/${pass} passed`);
