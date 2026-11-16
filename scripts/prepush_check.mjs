#!/usr/bin/env node
// scripts/prepush_check.mjs: run this before EVERY push to main (agents and the owner). About 2-3 minutes on a laptop.
//
//   node scripts/prepush_check.mjs             regenerate the Info map, then run the guards that have actually turned main red
//   node scripts/prepush_check.mjs --py        also run the Python test suite (slower)
//   node scripts/prepush_check.mjs --all       every *.test.mjs / *.test.js (the full CI run; many minutes)
//   PowerShell / bash one-liner:  node scripts/prepush_check.mjs
//
// What it does, in order:
//   1. Regenerates js/infoMapDerived.js and plans/INFO_MAP.md (scripts/build_info_map.mjs). If they changed it tells you to `git add` them, so the
//      pushed copy is fresh (the Tests workflow no longer fails on a stale copy, but a fresh one keeps the Info map tab right).
//   2. Runs the guard tests below with INFOMAP_STRICT=1, plus every test file you changed or added since origin/main.
//   3. Prints the one Python gate that is an owner decision (forge.verdict_gate_test, vol-layer proofs) as INFO, not as a failure of yours.
// Exit 0 = safe to push. Exit 1 = fix the named test first. Why these guards: each one failed a real run on main between 2026-11-14 and 2026-11-16
// (Info map stale or machine-dependent, feed registry hosts, hand-kept preview list, registry/viewer rules, links, newsletter rules).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const run = (cmd, a, opts = {}) => spawnSync(cmd, a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, ...(opts.env ?? {}) } });
const line = (ok, name, extra = '') => console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${extra ? '  ' + extra : ''}`);

// guards that have turned main red (keep this list short and fast; add a file here when it fails a real run)
const GUARDS = [
  'js/infoMapOrder.test.mjs', 'js/infoMap.test.mjs', 'js/dataFeeds.test.mjs', 'js/feedCoverage.test.mjs',
  'js/terminal/tabRegistry.test.mjs', 'js/terminal/terminalFeel.test.mjs', 'js/terminal/themeTokens.test.mjs', 'js/terminal/viewerMode.test.mjs',
  'js/terminal/links.test.mjs', 'js/terminal/commandCore.test.mjs', 'js/terminal/linkedSelection.test.mjs', 'js/terminal/infoMapView.test.mjs',
  'js/deskAccess.test.mjs', 'js/storeRegistry.test.mjs', 'js/deskSnapshot.test.mjs',
  'js/newsletterTermV2.test.mjs', 'js/newsletterTerminal.test.mjs', 'js/newsletterPicto.test.mjs',
];

let failed = 0;
console.log('prepush check (about 2-3 minutes)\n');

// 1. changed test files vs origin/main (best effort: needs a fetched origin/main)
let changed = [];
{
  const g = run('git', ['diff', '--name-only', '--diff-filter=ACMR', 'origin/main...HEAD']);
  const w = run('git', ['status', '--porcelain']);
  const names = [...String(g.stdout || '').split('\n'), ...String(w.stdout || '').split('\n').map(l => l.slice(3))].map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
  changed = [...new Set(names.filter(n => /\.test\.(mjs|js)$/.test(n) && existsSync(path.join(ROOT, n))))];
}

// 2. regenerate the Info map
{
  const before = run('git', ['status', '--porcelain', '--', 'js/infoMapDerived.js', 'plans/INFO_MAP.md']).stdout;
  const r = run(process.execPath, ['scripts/build_info_map.mjs']);
  const after = run('git', ['diff', '--stat', '--ignore-cr-at-eol', '--', 'js/infoMapDerived.js', 'plans/INFO_MAP.md']).stdout;
  line(r.status === 0, 'Info map regenerated', r.status === 0 ? (after.trim() ? '(changed: git add js/infoMapDerived.js plans/INFO_MAP.md)' : '(unchanged)') : String(r.stderr).split('\n').slice(-3).join(' '));
  if (r.status !== 0) failed++;
  void before;
}

// 3. the guards
const files = args.has('--all') ? null : [...new Set([...GUARDS, ...changed])].filter(f => existsSync(path.join(ROOT, f)));
if (files) {
  for (const f of files) {
    const t0 = Date.now();
    const r = run(process.execPath, [f], { env: { INFOMAP_STRICT: '1', NODE_ENV: 'test' } });
    const ok = r.status === 0;
    const out = `${r.stdout}\n${r.stderr}`.replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean);
    const why = ok ? '' : (out.find(l => /^(not ok|- |✖)|AssertionError|Error:|FAILED/.test(l)) ?? out.at(-1) ?? '');
    line(ok, f, ok ? `${((Date.now() - t0) / 1000).toFixed(1)}s` : why.slice(0, 200));
    if (!ok) failed++;
  }
} else {
  const r = spawnSync(process.execPath, ['scripts/run_tests.mjs'], { cwd: ROOT, stdio: 'inherit' });
  line(r.status === 0, 'every JS test file (scripts/run_tests.mjs)'); if (r.status !== 0) failed++;
}

// 4. python: the owner-decision gate is reported, everything else must pass when --py is given
{
  const py = ['python', 'python3', 'py'].find(c => run(c, ['--version']).status === 0);
  if (!py) console.log('  SKIP  python not found (CI runs it)');
  else if (args.has('--py')) {
    const r = run(py, ['scripts/run_py_tests.py']);
    const txt = `${r.stdout}\n${r.stderr}`;
    const bad = [...txt.matchAll(/^\s*(?:FAIL|✗)\s+(\S+)/gm)].map(m => m[1]).filter(k => !/verdict_gate_test::test_banked_vol_layer_studies_have_passing_proofs/.test(k));
    line(r.status === 0 || bad.length === 0, 'python tests', bad.length ? 'failing: ' + bad.join(', ') : (r.status === 0 ? '' : '(only the owner-decision vol-layer proof gate)'));
    if (bad.length) failed++;
  } else {
    const r = run(py, ['-c', "import sys; sys.path.insert(0,'.'); import forge.verdict_gate_test as t; t.test_banked_vol_layer_studies_have_passing_proofs()"]);
    console.log(`  INFO  python gate forge.verdict_gate_test (vol-layer proofs, an owner decision): ${r.status === 0 ? 'passing' : 'red: ' + String(r.stderr).trim().split('\n').pop()}`);
  }
}

console.log(failed ? `\nNOT SAFE TO PUSH: ${failed} problem(s) above.` : '\nSAFE TO PUSH.');
process.exit(failed ? 1 : 0);
