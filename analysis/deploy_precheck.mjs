#!/usr/bin/env node
/**
 * Will the server boot on Railway?
 *
 *   node analysis/deploy_precheck.mjs
 *
 * WHY THIS EXISTS. Three deploys failed in a row on 2026-09-23 with
 * ERR_MODULE_NOT_FOUND, and every one was the same shape: a module that exists on
 * this machine but was never `git add`ed. The server booted fine locally and could
 * not boot anywhere else, and because Railway keeps serving the previous container
 * the site looked healthy the whole time.
 *
 * The cause is this repo running concurrent sessions. One adds `import x from
 * './js/x.js'` to server.js and writes js/x.js; another runs `git add server.js` for
 * an unrelated change and ships the import without the file. A numstat on a
 * 30,000-line file will not show you a one-line insert that is not yours.
 *
 * So: walk the whole import graph from server.js and report anything reachable that
 * git does not know about. Transitive, because the second failure was a module
 * imported BY the module the first failure was about -- checking only server.js's
 * direct imports is what let it fail twice.
 *
 * It checks two things, because the failures came in two flavours:
 *   1. a module reachable from server.js that git does not know about
 *   2. a NAMED IMPORT that the target module does not actually export -- the fourth
 *      failure, where the file was committed but the function it needed lived in an
 *      uncommitted edit to a THIRD file
 *
 * Run before any push that touches server.js or adds a js/ module.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
const tracked = new Set(execSync('git ls-files', { maxBuffer: 64e6 }).toString().split('\n'));
const seen = new Set(), missing = [], untracked = [];
function walk(file) {
  if (seen.has(file)) return; seen.add(file);
  let src; try { src = fs.readFileSync(file, 'utf8'); } catch { return; }
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)) {
    const abs = path.normalize(path.join(path.dirname(file), m[1])).split(path.sep).join('/');
    if (!fs.existsSync(abs)) { missing.push(`${abs}  <- ${file}`); continue; }
    if (!tracked.has(abs)) untracked.push(`${abs}  <- ${file}`);
    walk(abs);
  }
}
// fileURLToPath, not manual unescaping: a repo path with a space becomes %20 in a
// URL and chdir fails on it, which is how the first version of this line broke.
process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
walk('server.js');

// ── named imports that the target does not export ───────────────────────────
// `export { a, b as c }`, `export function a`, `export const a`, `export class a`.
// `export * from` cannot be resolved without following the chain, so a module that
// re-exports is skipped rather than guessed at and reported as unknown.
const badExports = [];
function exportsOf(src) {
  const out = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
  // `export const GLYPH_W = 5, GLYPH_H = 7` declares TWO names. Capturing only the
  // first reported GLYPH_H as missing when it is exported one comma along.
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([^;\n]+)/g))
    for (const decl of m[1].split(',')) {
      const name = decl.trim().match(/^([A-Za-z_$][\w$]*)/);
      if (name) out.add(name[1]);
    }
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g))
    for (const part of m[1].split(',')) {
      const t = part.trim(); if (!t) continue;
      const as = t.split(/\s+as\s+/); out.add((as[1] ?? as[0]).trim());
    }
  if (/export\s+default/.test(src)) out.add('default');
  return { names: out, reexports: /export\s+\*\s+from/.test(src) };
}
for (const file of seen) {
  let src; try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
    const abs = path.normalize(path.join(path.dirname(file), m[2])).split(path.sep).join('/');
    if (!fs.existsSync(abs)) continue;                       // already reported above
    const { names, reexports } = exportsOf(fs.readFileSync(abs, 'utf8'));
    if (reexports) continue;                                  // cannot tell without following
    for (const part of m[1].split(',')) {
      const want = part.trim().split(/\s+as\s+/)[0].trim();
      if (!want || want === 'type') continue;
      if (!names.has(want)) badExports.push(`${want}  <- ${file}  (not exported by ${abs})`);
    }
  }
}
console.log('modules reachable from server.js:', seen.size);
console.log('\nMISSING FROM DISK:');
console.log(missing.length ? missing.map(x => '  ' + x).join('\n') : '  none');
console.log('\nON DISK BUT UNTRACKED — these are what break the deploy:');
console.log(untracked.length ? [...new Set(untracked)].map(x => '  ' + x).join('\n') : '  none');

// Non-zero so this can gate a push. A path that does not exist is reported but NOT
// failed on: a comment showing example usage looks exactly like an import to a regex.
console.log('\nIMPORTED BUT NOT EXPORTED — usually an uncommitted edit to the target:');
console.log(badExports.length ? [...new Set(badExports)].map(x => '  ' + x).join('\n') : '  none');


// The export check above reads the WORKING TREE, which is exactly why it would not
// have caught the fourth failure on its own: constantMaturityIV existed on disk in
// an UNCOMMITTED edit, so it looked present locally and was absent on the deploy.
// Any reachable module with uncommitted changes is therefore flagged in its own
// right -- the deploy gets a different file from the one just tested.
const dirty = new Set(execSync('git status --porcelain', { maxBuffer: 64e6 }).toString()
  .split('\n').map(l => l.slice(3).trim()).filter(Boolean));
const dirtyReachable = [...seen].filter(f => dirty.has(f));
console.log('\nREACHABLE BUT UNCOMMITTED — the deploy gets a DIFFERENT version:');
console.log(dirtyReachable.length ? dirtyReachable.map(x => '  ' + x).join('\n') : '  none');

process.exit(untracked.length || badExports.length || dirtyReachable.length ? 1 : 0);
