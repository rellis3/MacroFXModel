#!/usr/bin/env node
// Run every JavaScript test file in the repo, each in its own process, and report.
//
//   node scripts/run_tests.mjs                 run all, exit 1 if any test fails that is not in the baseline
//   node scripts/run_tests.mjs --json out.json also write per-file results
//   node scripts/run_tests.mjs js/foo.test.mjs only these files
//
// Why: before 2026-10-31 CI ran 3 of ~410 test files (REPO_REVIEW_2026-10-31), so a test could go red on main
// and nobody would see it. Every *.test.mjs / *.test.js outside node_modules, analysis/output and scratchpad runs.
//
// tests/KNOWN_FAILING.json lists files that fail on main for a stated reason (needs live data, needs a key,
// already broken). They still RUN and are printed every time; they do not fail the job. A file in that list
// that starts passing is reported so it can be removed. Anything else that fails fails the job. The list may
// only shrink; adding to it needs a reason and the owner's say-so.
import { spawn } from 'node:child_process';
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'scratchpad', 'output', 'archive']);
const TIMEOUT_MS = 600_000;   // the two atlas walk tests take 3-4 min on a shared runner

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (/\.test\.(mjs|js)$/.test(name)) out.push(path.relative(ROOT, p));
  }
  return out;
}

function runOne(file) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [file], { cwd: ROOT, env: { ...process.env, NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d; if (out.length > 200_000) out = out.slice(-100_000); });
    child.stderr.on('data', d => { out += d; if (out.length > 200_000) out = out.slice(-100_000); });
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, TIMEOUT_MS);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ file, ok: code === 0, code, timedOut: signal === 'SIGKILL', ms: Date.now() - t0, tail: out.split('\n').slice(-25).join('\n') });
    });
  });
}

const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null;
const only = args.filter((a, i) => !a.startsWith('--') && i !== jsonAt + 1);
const files = (only.length ? only : walk(ROOT)).sort();
const known = existsSync(path.join(ROOT, 'tests/KNOWN_FAILING.json')) ? JSON.parse(readFileSync(path.join(ROOT, 'tests/KNOWN_FAILING.json'), 'utf8')) : {};

const results = [];
let next = 0;
const workers = Math.max(1, Math.min(os.cpus().length, 4));
await Promise.all(Array.from({ length: workers }, async () => {
  while (next < files.length) { const f = files[next++]; results.push(await runOne(f)); }
}));
results.sort((a, b) => a.file.localeCompare(b.file));

const failed = results.filter(r => !r.ok);
const unexpected = failed.filter(r => !known[r.file]);
const knownStillFailing = failed.filter(r => known[r.file]);
const nowPassing = results.filter(r => r.ok && known[r.file]);

for (const r of unexpected) console.log(`\n✗ ${r.file} (${r.timedOut ? 'timed out' : `exit ${r.code}`}, ${(r.ms / 1000).toFixed(1)}s)\n${r.tail}`);
console.log(`\n${results.length} test files: ${results.length - failed.length} passed, ${failed.length} failed`);
if (knownStillFailing.length) {
  console.log(`\nKnown failing on main (${knownStillFailing.length}), not counted against this run — fix and remove from tests/KNOWN_FAILING.json:`);
  for (const r of knownStillFailing) console.log(`  - ${r.file}: ${known[r.file]}`);
}
if (nowPassing.length) {
  console.log(`\nNow passing — remove from tests/KNOWN_FAILING.json:`);
  for (const r of nowPassing) console.log(`  + ${r.file}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results.map(({ tail, ...r }) => ({ ...r, tail: r.ok ? undefined : tail })), null, 1));
if (unexpected.length) { console.log(`\nFAILED: ${unexpected.length} file(s) not in the known-failing list.`); process.exit(1); }
console.log('\nOK');
