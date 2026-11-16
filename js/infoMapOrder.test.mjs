// js/infoMapOrder.test.mjs: the Info map's derived data must be the same whatever order the file system lists directories in.
// Windows lists names case-insensitively, Linux by bytes. js/infoMapDerived.js is written on Windows and checked on Linux, and on
// 2026-11-16 that difference (newsletterTerminal.js vs newsletterTermV2.js) kept main's Tests red for hours.
// Run: node js/infoMapOrder.test.mjs
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = mode => {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/info_map_order_probe.mjs'), mode], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
  assert.equal(r.status, 0, `probe ${mode} failed: ${r.stderr}`);
  return r.stdout;
};
const asc = run('asc'), desc = run('desc');
if (asc !== desc) {
  const a = JSON.parse(asc), b = JSON.parse(desc);
  const id = Object.keys(a.families).find(k => JSON.stringify(a.families[k]) !== JSON.stringify(b.families[k]));
  console.error('derived data depends on directory order; first family that differs: ' + id);
  console.error(' asc :', JSON.stringify(a.families[id]?.names));
  console.error(' desc:', JSON.stringify(b.families[id]?.names));
  process.exit(1);
}
console.log('OK: the derived Info map data is the same in either directory order');
